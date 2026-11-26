import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = path.join(__dirname, '.check-tmp');
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

test('polish check exits 0 when tokens are clean', () => {
  const dir = makeProject(':root {\n  --primary: #4f46e5;\n  --bg: var(--primary);\n}\n');
  const result = runCli(['check', dir]);
  assert.equal(result.status, 0, `should exit 0 for clean tokens: ${result.stderr}`);
  assert.ok(result.stdout.length > 0, 'should print output');
  cleanup();
});

test('polish check exits 1 when errors are found', () => {
  const dir = makeProject(':root {\n  --primary: #4f46e5;\n}\n.bad {\n  color: var(--nonexistent);\n}\n');
  const result = runCli(['check', dir]);
  assert.equal(result.status, 1, 'should exit 1 when errors found');
  cleanup();
});

test('polish check exits 0 when only warnings exist', () => {
  const dir = makeProject(':root {\n  --text: #111827;\n  --heading: #111827;\n}\n');
  const result = runCli(['check', dir]);
  assert.equal(result.status, 0, 'should exit 0 when only warnings (no errors)');
  cleanup();
});

test('polish check prints health summary with verdict', () => {
  const dir = makeProject(':root {\n  --text: #111827;\n  --heading: #111827;\n}\n');
  const result = runCli(['check', dir]);
  assert.ok(result.stdout.includes('Health'), 'should mention health');
  assert.ok(result.stdout.includes('duplicate-value'), 'should list finding types');
  cleanup();
});

test('polish check respects --ignore flag', () => {
  const dir = makeProject(':root {\n  --text: #111827;\n  --heading: #111827;\n}\n');
  const result = runCli(['check', dir, '--ignore=tokens.css']);
  assert.equal(result.status, 0, 'ignored file should not produce findings');
  cleanup();
});

test('polish check does not modify any files', () => {
  const dir = makeProject(':root {\n  --text: #111827;\n  --heading: #111827;\n}\n');
  const before = fs.readFileSync(path.join(dir, 'tokens.css'), 'utf8');
  runCli(['check', dir]);
  const after = fs.readFileSync(path.join(dir, 'tokens.css'), 'utf8');
  assert.equal(before, after, 'check should not modify files');
  cleanup();
});

test('polish check warns about missing tokens instead of a false green', () => {
  const dir = makeProject('body {\n  color: #3B82F6;\n}\n');
  const result = runCli(['check', dir, '--summary']);
  assert.equal(result.status, 0, 'missing tokens is not an error — exit code stays 0');
  assert.ok(result.stdout.includes('No design tokens found'), 'should warn that no tokens were found');
  assert.ok(!result.stdout.includes('healthy'), 'must not claim healthy when there are no tokens');
  cleanup();
});

test('polish check on a token-less project shows 0 declarations with the warning', () => {
  const dir = makeProject('body {\n  color: #3B82F6;\n}\n');
  const result = runCli(['check', dir]);
  assert.equal(result.status, 0, `should exit 0: ${result.stderr}`);
  assert.ok(result.stdout.includes('0 declarations'), 'should report the declaration count');
  assert.ok(result.stdout.includes('No design tokens found'), 'should carry the no-tokens warning');
  cleanup();
});
