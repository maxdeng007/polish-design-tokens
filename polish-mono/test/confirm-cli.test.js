import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = path.join(__dirname, '.confirm-cli-tmp');
const BIN = path.resolve(__dirname, '../bin/polish.mjs');
const NODE = process.execPath;

function makeProject(cssContent) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const file = path.join(TMP_DIR, 'tokens.css');
  fs.writeFileSync(file, cssContent, 'utf8');
  return TMP_DIR;
}

function writeDecisions(decisions) {
  const file = path.join(TMP_DIR, 'decisions.json');
  fs.writeFileSync(file, JSON.stringify({ decisions }, null, 2), 'utf8');
  return file;
}

function runCli(args) {
  return spawnSync(NODE, [BIN, ...args], { encoding: 'utf8' });
}

function cleanup() {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
}

test('polish confirm applies a delete decision end-to-end', () => {
  const dir = makeProject(':root {\n  --primary: #4f46e5;\n  --bg: #ffffff;\n}\n');
  const decisionsFile = writeDecisions([{ action: 'delete', token: '--primary' }]);
  const result = runCli(['confirm', decisionsFile, `--target=${dir}`]);
  assert.equal(result.status, 0, `CLI should succeed: ${result.stderr}`);
  const content = fs.readFileSync(path.join(dir, 'tokens.css'), 'utf8');
  assert.ok(!content.includes('--primary'), '--primary should be deleted');
  assert.ok(content.includes('--bg'), '--bg should remain');
  cleanup();
});

test('polish confirm applies an alias decision end-to-end', () => {
  const dir = makeProject(':root {\n  --text: #111827;\n  --heading: #111827;\n}\n');
  const decisionsFile = writeDecisions([{ action: 'alias', from: '--heading', to: '--text' }]);
  const result = runCli(['confirm', decisionsFile, `--target=${dir}`]);
  assert.equal(result.status, 0, `CLI should succeed: ${result.stderr}`);
  const content = fs.readFileSync(path.join(dir, 'tokens.css'), 'utf8');
  assert.ok(content.includes('--heading: var(--text)'), '--heading should alias --text');
  cleanup();
});

test('polish confirm applies a rename decision end-to-end across files', () => {
  const dir = makeProject(
    ':root {\n  --bg: #ffffff;\n}\n.hero {\n  background: var(--bg);\n}\n',
  );
  fs.writeFileSync(path.join(dir, 'page.html'), '<div style="color: var(--bg);"></div>\n', 'utf8');
  const decisionsFile = writeDecisions([{ action: 'rename', from: '--bg', to: '--background' }]);
  const result = runCli(['confirm', decisionsFile, `--target=${dir}`]);
  assert.equal(result.status, 0, `CLI should succeed: ${result.stderr}`);
  const css = fs.readFileSync(path.join(dir, 'tokens.css'), 'utf8');
  assert.ok(css.includes('--background: #ffffff;'), 'declaration renamed');
  assert.ok(css.includes('var(--background)'), 'reference in CSS renamed');
  assert.ok(!css.includes('--bg'), 'no --bg remains in CSS');
  const html = fs.readFileSync(path.join(dir, 'page.html'), 'utf8');
  assert.ok(html.includes('var(--background)'), 'reference in HTML renamed');
  cleanup();
});

test('polish confirm creates a backup before modifying', () => {
  const dir = makeProject(':root {\n  --primary: #4f46e5;\n}\n');
  const decisionsFile = writeDecisions([{ action: 'delete', token: '--primary' }]);
  const result = runCli(['confirm', decisionsFile, `--target=${dir}`]);
  assert.equal(result.status, 0, `CLI should succeed: ${result.stderr}`);
  const backup = fs.readFileSync(path.join(dir, 'tokens.css.backup'), 'utf8');
  assert.ok(backup.includes('--primary'), 'backup should contain original --primary');
  cleanup();
});

test('polish confirm --summary prints human-readable output', () => {
  const dir = makeProject(':root {\n  --primary: #4f46e5;\n  --bg: #ffffff;\n}\n');
  const decisionsFile = writeDecisions([{ action: 'delete', token: '--primary' }]);
  const result = runCli(['confirm', decisionsFile, `--target=${dir}`, '--summary']);
  assert.equal(result.status, 0, `CLI should succeed: ${result.stderr}`);
  assert.ok(result.stdout.length > 0, 'should print output');
  cleanup();
});

test('polish confirm errors on missing decisions file', () => {
  const dir = makeProject(':root {\n  --bg: #ffffff;\n}\n');
  const result = runCli(['confirm', path.join(TMP_DIR, 'nonexistent.json'), `--target=${dir}`]);
  assert.equal(result.status, 1, 'should fail with exit code 1');
  assert.ok(result.stderr.includes('not found'), 'should report file not found');
  cleanup();
});
