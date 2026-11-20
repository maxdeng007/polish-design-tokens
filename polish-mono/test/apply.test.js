import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { apply } from '../src/apply.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = path.join(__dirname, '.apply-tmp');

function makeTempCss(content) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const file = path.join(TMP_DIR, 'tokens.css');
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

function cleanup() {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
}

test('apply replaces text on the specified line', async () => {
  const file = makeTempCss(':root {\n  --bg: #1a1a2e;\n  --background: #1a1a2e;\n}\n');
  const result = await apply([
    { type: 'replace', file, line: 3, before: '#1a1a2e', after: 'var(--bg)', reason: 'test', findingId: 'duplicate-value' }
  ]);
  assert.equal(result.applied.length, 1);
  assert.equal(result.failed.length, 0);
  const content = fs.readFileSync(file, 'utf8');
  assert.ok(content.includes('--background: var(--bg);'));
  cleanup();
});

test('apply creates a backup before modifying', async () => {
  const file = makeTempCss(':root {\n  --bg: #1a1a2e;\n}\n');
  await apply([
    { type: 'replace', file, line: 2, before: '#1a1a2e', after: 'var(--color)', reason: 'test', findingId: 'hardcoded' }
  ]);
  assert.ok(fs.existsSync(file + '.backup'), 'backup should exist');
  const backup = fs.readFileSync(file + '.backup', 'utf8');
  assert.ok(backup.includes('#1a1a2e'), 'backup should contain original content');
  cleanup();
});

test('apply inserts a new line with add type', async () => {
  const file = makeTempCss(':root {\n  --bg: #1a1a2e;\n}\n');
  const result = await apply([
    { type: 'add', file, line: 4, before: '', after: '  --btn-bg: var(--token-default);', reason: 'test', findingId: 'custom' }
  ]);
  assert.equal(result.applied.length, 1);
  const content = fs.readFileSync(file, 'utf8');
  assert.ok(content.includes('--btn-bg: var(--token-default);'));
  cleanup();
});

test('apply records failed patches when before text is not found', async () => {
  const file = makeTempCss(':root {\n  --bg: #1a1a2e;\n}\n');
  const result = await apply([
    { type: 'replace', file, line: 2, before: 'nonexistent-text', after: 'var(--x)', reason: 'test', findingId: 'hardcoded' }
  ]);
  assert.equal(result.applied.length, 0);
  assert.equal(result.failed.length, 1);
  assert.ok(result.failed[0].error.includes('not found'));
  cleanup();
});

test('apply records failed patches for out-of-range line', async () => {
  const file = makeTempCss(':root {\n  --bg: #1a1a2e;\n}\n');
  const result = await apply([
    { type: 'replace', file, line: 99, before: 'x', after: 'y', reason: 'test', findingId: 'hardcoded' }
  ]);
  assert.equal(result.failed.length, 1);
  assert.ok(result.failed[0].error.includes('out of range'));
  cleanup();
});

test('apply backs up only once per file for multiple patches', async () => {
  const file = makeTempCss(':root {\n  --a: #111;\n  --b: #222;\n}\n');
  const result = await apply([
    { type: 'replace', file, line: 2, before: '#111', after: 'var(--a)', reason: 't1', findingId: 'hardcoded' },
    { type: 'replace', file, line: 3, before: '#222', after: 'var(--b)', reason: 't2', findingId: 'hardcoded' }
  ]);
  assert.equal(result.applied.length, 2);
  assert.equal(result.backupCount, 1, 'should back up once per file');
  cleanup();
});

test('apply handles patch with no file path', async () => {
  const result = await apply([
    { type: 'replace', file: null, line: 1, before: 'x', after: 'y', reason: 'test', findingId: 'hardcoded' }
  ]);
  assert.equal(result.failed.length, 1);
  assert.ok(result.failed[0].error.includes('no file path'));
});

test('apply on demo project produces expected results', async () => {
  // Copy demo project to temp so we don't modify the original
  const src = path.resolve(__dirname, '../../examples/walkthrough/demo-project/src/tokens.css');
  const destDir = path.join(TMP_DIR, 'demo');
  fs.mkdirSync(destDir, { recursive: true });
  const destFile = path.join(destDir, 'tokens.css');
  fs.copyFileSync(src, destFile);

  const { scan } = await import('../src/scan.js');
  const { cross } = await import('../src/cross.js');
  const { plan } = await import('../src/plan.js');
  const { generateDiffs } = await import('../src/diff.js');

  const graph = scan(destDir);
  const report = cross(graph);
  const actions = plan(report.findings);
  const patches = generateDiffs(actions);

  // Adjust patch paths to the temp file
  for (const p of patches) {
    if (p.file) p.file = destFile;
  }

  const result = await apply(patches);
  assert.ok(result.applied.length >= 2, 'should apply at least 2 patches');
  assert.equal(result.failed.length, 0, 'no patches should fail on valid demo');

  const content = fs.readFileSync(destFile, 'utf8');
  assert.ok(content.includes('var(--bg)'), 'should have aliased --background to --bg');
  assert.ok(content.includes('var(--accent)'), 'should have aliased --gold to --accent');
  assert.ok(fs.existsSync(destFile + '.backup'), 'should have backup');
  cleanup();
});

test('apply rejects patches outside target directory', async () => {
  const file = makeTempCss(':root {\n  --bg: #1a1a2e;\n}\n');
  const outsideFile = path.join(__dirname, '.apply-outside-test.txt');
  fs.writeFileSync(outsideFile, 'original\n', 'utf8');
  const result = await apply([
    { type: 'replace', file: outsideFile, line: 1, before: 'original', after: 'modified', reason: 'test', findingId: 'custom' }
  ], TMP_DIR);
  assert.equal(result.applied.length, 0);
  assert.equal(result.failed.length, 1);
  assert.ok(result.failed[0].error.includes('outside target directory'));
  // Verify the outside file was NOT modified
  assert.equal(fs.readFileSync(outsideFile, 'utf8'), 'original\n');
  cleanup();
  fs.rmSync(outsideFile, { force: true });
});

test('apply accepts patches within target directory', async () => {
  const file = makeTempCss(':root {\n  --bg: #1a1a2e;\n}\n');
  const result = await apply([
    { type: 'replace', file, line: 2, before: '#1a1a2e', after: 'var(--x)', reason: 'test', findingId: 'custom' }
  ], TMP_DIR);
  assert.equal(result.applied.length, 1);
  assert.equal(result.failed.length, 0);
  cleanup();
});

test('apply sorts patches by line descending so adds do not shift replaces', async () => {
  // Line 1: :root {
  // Line 2:   --a: #111;
  // Line 3:   --b: #222;
  // Line 4:   --c: #333;
  // Line 5:   --d: #444;
  // Line 6: }
  const file = makeTempCss(':root {\n  --a: #111;\n  --b: #222;\n  --c: #333;\n  --d: #444;\n}\n');
  const result = await apply([
    { type: 'add', file, line: 2, before: '', after: '  --new: #000;', reason: 'test', findingId: 'custom' },
    { type: 'replace', file, line: 5, before: '#444', after: 'var(--d)', reason: 'test', findingId: 'custom' }
  ], TMP_DIR);
  assert.equal(result.applied.length, 2, 'both patches should apply');
  assert.equal(result.failed.length, 0, 'no patches should fail');
  const content = fs.readFileSync(file, 'utf8');
  assert.ok(content.includes('var(--d)'), 'replace at line 5 should succeed despite add at line 2');
  assert.ok(content.includes('--new: #000;'), 'add at line 2 should succeed');
  cleanup();
});

test('apply without target rejects files outside cwd by default', async () => {
  // Write a file in /tmp (definitely outside the project cwd) and verify
  // apply rejects it when no explicit target is passed.
  const outsideFile = path.join('/tmp', `polish-apply-outside-${Date.now()}.txt`);
  fs.writeFileSync(outsideFile, 'original\n', 'utf8');
  const result = await apply([
    { type: 'replace', file: outsideFile, line: 1, before: 'original', after: 'modified', reason: 'test', findingId: 'custom' }
  ]);
  assert.equal(result.applied.length, 0);
  assert.equal(result.failed.length, 1);
  assert.ok(result.failed[0].error.includes('outside target directory'));
  assert.equal(fs.readFileSync(outsideFile, 'utf8'), 'original\n');
  fs.rmSync(outsideFile, { force: true });
});

test('apply resolves symlinks in boundary check so symlinked dirs are accepted', async () => {
  // Create a real directory and a symlink to it. Use the symlink path as
  // the target — without realpath resolution the boundary check would
  // reject the file because the symlink and real paths differ.
  const realDir = path.join(TMP_DIR, 'real-dir');
  const linkDir = path.join(TMP_DIR, 'link-dir');
  fs.mkdirSync(realDir, { recursive: true });
  fs.rmSync(linkDir, { force: true });
  fs.symlinkSync(realDir, linkDir, 'dir');

  // Write the file through the symlink path so its path contains the symlink
  const file = path.join(linkDir, 'tokens.css');
  fs.writeFileSync(file, ':root {\n  --bg: #1a1a2e;\n}\n', 'utf8');

  const result = await apply([
    { type: 'replace', file, line: 2, before: '#1a1a2e', after: 'var(--x)', reason: 'test', findingId: 'custom' }
  ], linkDir);

  assert.equal(result.applied.length, 1, 'symlinked file should be accepted');
  assert.equal(result.failed.length, 0, 'no patches should fail');
  const content = fs.readFileSync(file, 'utf8');
  assert.ok(content.includes('var(--x)'), 'replace should succeed');

  cleanup();
});

test('apply removes the target line for a delete patch', async () => {
  const file = makeTempCss(':root {\n  --a: #111;\n  --b: #222;\n  --c: #333;\n}\n');
  const result = await apply([
    { type: 'delete', file, line: 3, before: '', after: '', reason: 'test', findingId: 'orphan' }
  ], TMP_DIR);
  assert.equal(result.applied.length, 1);
  assert.equal(result.failed.length, 0);
  const content = fs.readFileSync(file, 'utf8');
  assert.ok(content.includes('--a: #111;'), 'line 2 should remain');
  assert.ok(!content.includes('--b: #222;'), 'line 3 should be deleted');
  assert.ok(content.includes('--c: #333;'), 'line 4 should remain');
  cleanup();
});

test('apply creates a backup when deleting a line', async () => {
  const file = makeTempCss(':root {\n  --a: #111;\n  --b: #222;\n}\n');
  await apply([
    { type: 'delete', file, line: 3, before: '', after: '', reason: 'test', findingId: 'orphan' }
  ], TMP_DIR);
  assert.ok(fs.existsSync(file + '.backup'), 'backup should exist');
  const backup = fs.readFileSync(file + '.backup', 'utf8');
  assert.ok(backup.includes('--b: #222;'), 'backup should contain the deleted line');
  cleanup();
});

test('apply records failed delete for out-of-range line', async () => {
  const file = makeTempCss(':root {\n  --a: #111;\n}\n');
  const result = await apply([
    { type: 'delete', file, line: 99, before: '', after: '', reason: 'test', findingId: 'orphan' }
  ], TMP_DIR);
  assert.equal(result.applied.length, 0);
  assert.equal(result.failed.length, 1);
  assert.ok(result.failed[0].error.includes('out of range'));
  cleanup();
});

test('apply deletes lines in descending order so line numbers stay valid', async () => {
  const file = makeTempCss(':root {\n  --a: #111;\n  --b: #222;\n  --c: #333;\n  --d: #444;\n}\n');
  const result = await apply([
    { type: 'delete', file, line: 2, before: '', after: '', reason: 't1', findingId: 'orphan' },
    { type: 'delete', file, line: 4, before: '', after: '', reason: 't2', findingId: 'orphan' }
  ], TMP_DIR);
  assert.equal(result.applied.length, 2);
  assert.equal(result.failed.length, 0);
  const content = fs.readFileSync(file, 'utf8');
  assert.ok(!content.includes('--a: #111;'), 'line 2 should be deleted');
  assert.ok(content.includes('--b: #222;'), 'line 3 should remain');
  assert.ok(!content.includes('--c: #333;'), 'line 4 should be deleted');
  assert.ok(content.includes('--d: #444;'), 'line 5 should remain');
  cleanup();
});

test('apply replaces all token references for a rewrite patch', async () => {
  const file = makeTempCss(':root {\n  --bg: #ffffff;\n}\n.hero {\n  background: var(--bg);\n  color: var(--bg);\n}\n');
  const result = await apply([
    { type: 'rewrite', file, line: null, before: '--bg', after: '--background', reason: 'test', findingId: 'namespace' }
  ], TMP_DIR);
  assert.equal(result.applied.length, 1);
  assert.equal(result.failed.length, 0);
  const content = fs.readFileSync(file, 'utf8');
  assert.ok(content.includes('--background: #ffffff;'), 'declaration should be renamed');
  assert.ok(content.includes('var(--background)'), 'all references should be renamed');
  assert.ok(!content.includes('--bg'), 'no --bg should remain');
  cleanup();
});

test('apply rewrite is word-boundary safe and does not touch longer token names', async () => {
  const file = makeTempCss(':root {\n  --bg: #ffffff;\n  --bg-hover: #eeeeee;\n}\n.btn {\n  background: var(--bg);\n}\n');
  const result = await apply([
    { type: 'rewrite', file, line: null, before: '--bg', after: '--background', reason: 'test', findingId: 'namespace' }
  ], TMP_DIR);
  assert.equal(result.applied.length, 1);
  const content = fs.readFileSync(file, 'utf8');
  assert.ok(content.includes('--background: #ffffff;'), '--bg declaration renamed');
  assert.ok(content.includes('--bg-hover: #eeeeee;'), '--bg-hover must NOT be touched');
  assert.ok(content.includes('var(--background)'), 'reference renamed');
  assert.ok(!content.match(/--bg(?![\w-])/), 'no standalone --bg remains');
  cleanup();
});

test('apply rewrite does not corrupt a token that is a substring of the target', async () => {
  const file = makeTempCss(':root {\n  --bg: #ffffff;\n  --background: #000000;\n}\n');
  const result = await apply([
    { type: 'rewrite', file, line: null, before: '--bg', after: '--background', reason: 'test', findingId: 'namespace' }
  ], TMP_DIR);
  assert.equal(result.applied.length, 1);
  const content = fs.readFileSync(file, 'utf8');
  // --bg renamed to --background, and the pre-existing --background left alone
  const backgroundCount = (content.match(/--background/g) || []).length;
  assert.equal(backgroundCount, 2, 'should have two --background (renamed + pre-existing)');
  assert.ok(!content.match(/--bg(?![\w-])/), 'no standalone --bg remains');
  cleanup();
});

test('apply rewrite creates a backup of the original file', async () => {
  const file = makeTempCss(':root {\n  --bg: #ffffff;\n}\n');
  await apply([
    { type: 'rewrite', file, line: null, before: '--bg', after: '--background', reason: 'test', findingId: 'namespace' }
  ], TMP_DIR);
  assert.ok(fs.existsSync(file + '.backup'), 'backup should exist');
  const backup = fs.readFileSync(file + '.backup', 'utf8');
  assert.ok(backup.includes('--bg'), 'backup should contain original --bg');
  cleanup();
});

test('apply records failed rewrite when file does not exist', async () => {
  const missingFile = path.join(TMP_DIR, 'nonexistent.css');
  const result = await apply([
    { type: 'rewrite', file: missingFile, line: null, before: '--bg', after: '--background', reason: 'test', findingId: 'namespace' }
  ], TMP_DIR);
  assert.equal(result.applied.length, 0);
  assert.equal(result.failed.length, 1);
  cleanup();
});
