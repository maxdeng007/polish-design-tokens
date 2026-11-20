import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = path.join(__dirname, '.fix-tmp');
const BIN = path.resolve(__dirname, '../bin/polish.mjs');
const NODE = process.execPath;

function makeProject(cssContent) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const file = path.join(TMP_DIR, 'tokens.css');
  fs.writeFileSync(file, cssContent, 'utf8');
  return TMP_DIR;
}

function runCli(args) {
  return spawnSync(NODE, [BIN, ...args], { encoding: 'utf8' });
}

function cleanup() {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
}

test('polish fix applies mechanical patches end-to-end', () => {
  const dir = makeProject(':root {\n  --text: #111827;\n  --heading: #111827;\n}\n');
  const result = runCli(['fix', dir]);
  assert.equal(result.status, 0, `CLI should succeed: ${result.stderr}`);
  const content = fs.readFileSync(path.join(dir, 'tokens.css'), 'utf8');
  assert.ok(content.includes('--heading: var(--text)'), '--heading should alias --text');
  cleanup();
});

test('polish fix creates backups before modifying', () => {
  const dir = makeProject(':root {\n  --text: #111827;\n  --heading: #111827;\n}\n');
  const result = runCli(['fix', dir]);
  assert.equal(result.status, 0, `CLI should succeed: ${result.stderr}`);
  const backup = fs.readFileSync(path.join(dir, 'tokens.css.backup'), 'utf8');
  assert.ok(backup.includes('--heading: #111827'), 'backup should contain original value');
  cleanup();
});

test('polish fix --dry-run does not modify files', () => {
  const dir = makeProject(':root {\n  --text: #111827;\n  --heading: #111827;\n}\n');
  const before = fs.readFileSync(path.join(dir, 'tokens.css'), 'utf8');
  const result = runCli(['fix', dir, '--dry-run']);
  assert.equal(result.status, 0, `CLI should succeed: ${result.stderr}`);
  const after = fs.readFileSync(path.join(dir, 'tokens.css'), 'utf8');
  assert.equal(before, after, 'dry-run should not modify files');
  assert.ok(!fs.existsSync(path.join(dir, 'tokens.css.backup')), 'dry-run should not create backups');
  cleanup();
});

test('polish fix reports judgmental findings but does not patch them', () => {
  const dir = makeProject(
    ':root {\n  --primary: #4f46e5;\n}\n.bad {\n  color: var(--nonexistent);\n}\n.orphan {\n  --unused: #fff;\n}\n'
  );
  const result = runCli(['fix', dir]);
  assert.equal(result.status, 0, `CLI should succeed: ${result.stderr}`);
  const content = fs.readFileSync(path.join(dir, 'tokens.css'), 'utf8');
  assert.ok(content.includes('var(--nonexistent)'), 'dangling ref should remain untouched');
  assert.ok(content.includes('--unused'), 'orphan should remain untouched');
  cleanup();
});

test('polish fix prints human-readable summary', () => {
  const dir = makeProject(':root {\n  --text: #111827;\n  --heading: #111827;\n}\n');
  const result = runCli(['fix', dir]);
  assert.equal(result.status, 0, `CLI should succeed: ${result.stderr}`);
  assert.ok(result.stdout.length > 0, 'should print output');
  cleanup();
});

test('polish fix exits 0 when no mechanical patches exist', () => {
  const dir = makeProject(':root {\n  --primary: #4f46e5;\n  --unused: #fff;\n}\n');
  const result = runCli(['fix', dir]);
  assert.equal(result.status, 0, 'should exit 0 even when no mechanical patches');
  cleanup();
});
