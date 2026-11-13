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
    { type: 'add', file, line: 4, before: '', after: '  --btn-bg: var(--token-default);', reason: 'test', findingId: 'dangling' }
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
