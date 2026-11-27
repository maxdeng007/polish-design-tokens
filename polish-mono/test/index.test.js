import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extract, audit, runPipeline } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = path.join(__dirname, '.index-tmp');

function makeFixture() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.mkdirSync(path.join(TMP_DIR, 'skipme'), { recursive: true });
  fs.writeFileSync(
    path.join(TMP_DIR, 'tokens.css'),
    ':root {\n  --bg: #1a1a2e;\n  --fg: #e0e0e0;\n}\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(TMP_DIR, 'skipme', 'other.css'),
    ':root {\n  --skip: #ff0000;\n}\n',
    'utf8'
  );
}

function cleanup() {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
}

test('extract respects ignore array through Node API', () => {
  makeFixture();
  const graph = extract(TMP_DIR, ['skipme']);
  const files = graph.declarations.map(d => d.file);
  assert.ok(files.some(f => f.includes('tokens.css')), 'should scan tokens.css');
  assert.ok(!files.some(f => f.includes('skipme')), 'should skip skipme/other.css');
  cleanup();
});

test('audit respects ignore array through Node API', () => {
  makeFixture();
  const report = audit(TMP_DIR, ['skipme']);
  const evidenceFiles = [];
  for (const f of report.findings) {
    for (const ev of (f.evidence || [])) {
      if (ev.file) evidenceFiles.push(ev.file);
    }
  }
  assert.ok(!evidenceFiles.some(f => f.includes('skipme')), 'findings should not reference skipme files');
  cleanup();
});

test('runPipeline respects ignore array through Node API', () => {
  makeFixture();
  const result = runPipeline(TMP_DIR, ['skipme']);
  const files = result.graph.declarations.map(d => d.file);
  assert.ok(!files.some(f => f.includes('skipme')), 'pipeline graph should not include skipme files');
  cleanup();
});

test('extract without ignore scans all files', () => {
  makeFixture();
  const graph = extract(TMP_DIR);
  const files = graph.declarations.map(d => d.file);
  assert.ok(files.some(f => f.includes('skipme')), 'without ignore, should scan skipme files');
  cleanup();
});

test('index exports seed', async () => {
  const mod = await import('../src/index.js');
  assert.equal(typeof mod.seed, 'function');
});
