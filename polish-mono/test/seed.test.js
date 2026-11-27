import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { seed } from '../src/seed.js';

const TMP = path.join(path.dirname(fileURLToPath(import.meta.url)), '.seed-tmp');

function writeFixture() {
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(
    path.join(TMP, 'a.css'),
    'a { color: #fff; }\nb { color: #fff; }\nc { padding: 8px; }\nd { padding: 8px; }\n',
    'utf8'
  );
}

test('seed writes tokens.css and tokens.seed.json with derived decisions', () => {
  writeFixture();
  const result = seed(TMP);
  const seedJson = JSON.parse(fs.readFileSync(result.seedFile, 'utf8'));
  assert.equal(seedJson.values.length, 2);
  assert.deepEqual(seedJson.map.map(m => m.chosenName), ['--color-1', '--space-1']);
  assert.equal(seedJson.decisions.length, 2);
  assert.deepEqual(seedJson.decisions, [
    { action: 'tokenize', value: '#fff', to: '--color-1' },
    { action: 'tokenize', value: '8px', to: '--space-1' }
  ]);
  assert.equal(result.tokenCount, 2);
  assert.equal(result.clusterCount, 2);
  fs.rmSync(TMP, { recursive: true, force: true });
});

test('seed tokens.css is a :root draft with provisional comments', () => {
  writeFixture();
  const result = seed(TMP);
  const css = fs.readFileSync(result.tokensCss, 'utf8');
  assert.match(css, /:root \{/);
  assert.match(css, /--color-1: #fff; \/\* provisional — from literal #fff \(2× in 1 file\) \*\//);
  assert.match(css, /--space-1: 8px; \/\* provisional — from literal 8px \(2× in 1 file\) \*\//);
  fs.rmSync(TMP, { recursive: true, force: true });
});

test('seed refuses to overwrite existing files without --force', () => {
  writeFixture();
  seed(TMP);
  assert.throws(
    () => seed(TMP),
    (err) => {
      assert.equal(err.code, 'SEED_EXISTS');
      assert.equal(err.conflicting.length, 2);
      assert.match(err.message, /--force/);
      return true;
    }
  );
  fs.rmSync(TMP, { recursive: true, force: true });
});

test('seed --force overwrites existing files', () => {
  writeFixture();
  seed(TMP);
  const result = seed(TMP, { force: true });
  assert.equal(result.tokenCount, 2);
  fs.rmSync(TMP, { recursive: true, force: true });
});

test('seed --output redirects the generated files', () => {
  writeFixture();
  const out = path.join(TMP, 'nested-out');
  const result = seed(TMP, { output: out });
  assert.equal(result.tokensCss, path.join(out, 'tokens.css'));
  assert.equal(result.seedFile, path.join(out, 'tokens.seed.json'));
  assert.ok(fs.existsSync(result.seedFile));
  fs.rmSync(TMP, { recursive: true, force: true });
});

test('seed on a token-less project writes no decisions', () => {
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(path.join(TMP, 'a.css'), 'a { color: #fff; }\n', 'utf8');
  const result = seed(TMP);
  assert.equal(result.clusterCount, 0);
  assert.equal(result.tokenCount, 0);
  const seedJson = JSON.parse(fs.readFileSync(result.seedFile, 'utf8'));
  assert.deepEqual(seedJson.decisions, []);
  fs.rmSync(TMP, { recursive: true, force: true });
});
