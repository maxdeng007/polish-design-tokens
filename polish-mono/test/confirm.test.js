import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scan } from '../src/scan.js';
import { confirm } from '../src/confirm.js';

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
  const patches = confirm([{ action: 'delete', token: '--primary' }], graph);
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
  ], graph);
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
