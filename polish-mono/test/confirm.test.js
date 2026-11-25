import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scan } from '../src/scan.js';
import { confirm } from '../src/confirm.js';
import { apply } from '../src/apply.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = path.join(__dirname, '.confirm-tmp');

function makeProject(cssContent, extraFiles = {}) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const file = path.join(TMP_DIR, 'tokens.css');
  fs.writeFileSync(file, cssContent, 'utf8');
  for (const [name, content] of Object.entries(extraFiles)) {
    fs.writeFileSync(path.join(TMP_DIR, name), content, 'utf8');
  }
  return TMP_DIR;
}

function cleanup() {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
}

test('confirm resolves a delete decision to a delete patch', () => {
  const dir = makeProject(':root {\n  --primary: #4f46e5;\n  --bg: #ffffff;\n}\n');
  const graph = scan(dir);
  const patches = confirm([{ action: 'delete', token: '--primary' }], graph, dir);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].type, 'delete');
  assert.equal(patches[0].findingId, 'orphan');
  const decl = graph.declarations.find(d => d.name === '--primary');
  assert.equal(patches[0].file, decl.file);
  assert.equal(patches[0].line, decl.line);
  cleanup();
});

test('confirm resolves an alias decision to a replace patch', () => {
  const dir = makeProject(':root {\n  --text: #111827;\n  --heading: #111827;\n}\n');
  const graph = scan(dir);
  const patches = confirm([{ action: 'alias', from: '--heading', to: '--text' }], graph);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].type, 'replace');
  assert.equal(patches[0].after, 'var(--text)');
  assert.equal(patches[0].before, '#111827');
  const decl = graph.declarations.find(d => d.name === '--heading');
  assert.equal(patches[0].file, decl.file);
  assert.equal(patches[0].line, decl.line);
  cleanup();
});

test('confirm resolves a rename decision to one rewrite patch per file', () => {
  const dir = makeProject(
    ':root {\n  --bg: #ffffff;\n}\n.hero {\n  background: var(--bg);\n}\n',
    { 'page.html': '<div style="color: var(--bg);"></div>\n' }
  );
  const graph = scan(dir);
  const patches = confirm([{ action: 'rename', from: '--bg', to: '--background' }], graph);
  const files = new Set(patches.map(p => p.file));
  assert.equal(patches.length, files.size, 'one patch per file, no duplicates');
  assert.ok(patches.length >= 2, 'should cover both the CSS and HTML files');
  for (const p of patches) {
    assert.equal(p.type, 'rewrite');
    assert.equal(p.before, '--bg');
    assert.equal(p.after, '--background');
    assert.equal(p.findingId, 'namespace');
  }
  cleanup();
});

test('confirm skips decisions for tokens not found in the graph', () => {
  const dir = makeProject(':root {\n  --bg: #ffffff;\n}\n');
  const graph = scan(dir);
  const patches = confirm([{ action: 'delete', token: '--nonexistent' }], graph);
  assert.equal(patches.length, 0);
  cleanup();
});

test('confirm handles a mix of decision types', () => {
  const dir = makeProject(':root {\n  --primary: #4f46e5;\n  --text: #111827;\n  --heading: #111827;\n  --bg: #ffffff;\n}\n');
  const graph = scan(dir);
  const patches = confirm([
    { action: 'delete', token: '--primary' },
    { action: 'alias', from: '--heading', to: '--text' }
  ], graph, dir);
  assert.equal(patches.length, 2);
  const types = patches.map(p => p.type).sort();
  assert.deepEqual(types, ['delete', 'replace']);
  cleanup();
});

test('confirm returns an empty array for empty decisions', () => {
  const dir = makeProject(':root {\n  --bg: #ffffff;\n}\n');
  const graph = scan(dir);
  const patches = confirm([], graph);
  assert.deepEqual(patches, []);
  cleanup();
});

test('confirm delete patches carry the original line for stale-safe verification', () => {
  const dir = makeProject(':root {\n  --primary: #4f46e5;\n  --bg: #ffffff;\n}\n');
  const graph = scan(dir);
  const patches = confirm([{ action: 'delete', token: '--primary' }], graph, dir);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].type, 'delete');
  assert.equal(patches[0].before, '  --primary: #4f46e5;');
  cleanup();
});

test('confirm skips a delete when the declaration line no longer contains the token', () => {
  const dir = makeProject(':root {\n  --primary: #4f46e5;\n  --bg: #ffffff;\n}\n');
  const graph = scan(dir);
  // The file changes between scan and confirm — the target line is now
  // a different token, so the delete must not be generated at all.
  fs.writeFileSync(path.join(dir, 'tokens.css'), ':root {\n  --accent: #4f46e5;\n  --bg: #ffffff;\n}\n', 'utf8');
  const patches = confirm([{ action: 'delete', token: '--primary' }], graph, dir);
  assert.equal(patches.length, 0, 'stale delete should be skipped at confirm time');
  cleanup();
});

test('apply rejects a delete patch whose target line changed since generation', async () => {
  const dir = makeProject(':root {\n  --primary: #4f46e5;\n  --bg: #ffffff;\n}\n');
  const graph = scan(dir);
  const patches = confirm([{ action: 'delete', token: '--primary' }], graph, dir);
  assert.equal(patches.length, 1);

  // File edited after the patch was generated — a stale delete must be
  // refused rather than removing the wrong line.
  fs.writeFileSync(path.join(dir, 'tokens.css'), ':root {\n  --primary: #111827;\n  --bg: #ffffff;\n}\n', 'utf8');
  const result = await apply(patches, dir);
  assert.equal(result.applied.length, 0);
  assert.equal(result.failed.length, 1);
  assert.ok(result.failed[0].error.includes('stale delete'));
  const content = fs.readFileSync(path.join(dir, 'tokens.css'), 'utf8');
  assert.ok(content.includes('--primary: #111827;'), 'the changed line must survive');
  cleanup();
});

test('apply accepts a delete patch when the line still matches', async () => {
  const dir = makeProject(':root {\n  --primary: #4f46e5;\n  --bg: #ffffff;\n}\n');
  const graph = scan(dir);
  const patches = confirm([{ action: 'delete', token: '--primary' }], graph, dir);
  const result = await apply(patches, dir);
  assert.equal(result.applied.length, 1);
  assert.equal(result.failed.length, 0);
  cleanup();
});
