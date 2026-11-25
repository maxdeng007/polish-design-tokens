import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = path.join(__dirname, '.rollback-cli-tmp');
const BIN = path.resolve(__dirname, '../bin/polish.mjs');
const NODE = process.execPath;

function makeProject(cssContent) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const file = path.join(TMP_DIR, 'tokens.css');
  fs.writeFileSync(file, cssContent, 'utf8');
  return TMP_DIR;
}

function writeBackups(backups) {
  const file = path.join(TMP_DIR, 'backups.json');
  fs.writeFileSync(file, JSON.stringify({ backups }, null, 2), 'utf8');
  return file;
}

function runCli(args) {
  return spawnSync(NODE, [BIN, ...args], { encoding: 'utf8' });
}

function cleanup() {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
}

test('polish rollback restores a file from an apply manifest', () => {
  const dir = makeProject(':root {\n  --bg: #ffffff;\n  --background: #ffffff;\n}\n');
  const original = path.join(dir, 'tokens.css');
  // Simulate a completed apply run: the file holds the modified content and
  // the backup holds the original pre-apply content.
  fs.copyFileSync(original, original + '.backup');
  fs.writeFileSync(original, ':root {\n  --bg: #ffffff;\n  --background: var(--bg);\n}\n', 'utf8');
  const backupsFile = writeBackups([{ file: original, backup: original + '.backup' }]);

  const result = runCli(['rollback', backupsFile, `--target=${dir}`]);
  assert.equal(result.status, 0, `CLI should succeed: ${result.stderr}`);
  const content = fs.readFileSync(path.join(dir, 'tokens.css'), 'utf8');
  assert.ok(content.includes('--background: #ffffff;'), 'file should be restored to backup content');
  cleanup();
});

test('polish rollback --summary prints a human-readable report', () => {
  const dir = makeProject(':root {\n  --bg: #ffffff;\n}\n');
  fs.copyFileSync(path.join(dir, 'tokens.css'), path.join(dir, 'tokens.css.backup'));
  const backupsFile = writeBackups([{ file: path.join(dir, 'tokens.css'), backup: path.join(dir, 'tokens.css.backup') }]);

  const result = runCli(['rollback', backupsFile, `--target=${dir}`, '--summary']);
  assert.equal(result.status, 0, `CLI should succeed: ${result.stderr}`);
  assert.ok(result.stdout.includes('Restored:'), 'summary should report restored files');
  assert.ok(result.stdout.includes('Rollback Results'), 'summary should carry the rollback header');
  cleanup();
});

test('polish rollback exits 1 and reports failures for missing backups', () => {
  const dir = makeProject(':root {\n  --bg: #ffffff;\n}\n');
  const backupsFile = writeBackups([{ file: path.join(dir, 'tokens.css'), backup: path.join(dir, 'missing.backup') }]);

  const result = runCli(['rollback', backupsFile, `--target=${dir}`, '--summary']);
  assert.equal(result.status, 1, 'missing backup should exit non-zero');
  assert.ok(result.stdout.includes('Failed:'), 'summary should report the failure');
  cleanup();
});

test('polish rollback rejects entries outside the target directory', () => {
  const dir = makeProject(':root {\n  --bg: #ffffff;\n}\n');
  const outside = path.join(__dirname, '.rollback-outside.txt');
  fs.writeFileSync(outside, 'original\n', 'utf8');
  fs.copyFileSync(outside, outside + '.backup');
  const backupsFile = writeBackups([{ file: outside, backup: outside + '.backup' }]);

  const result = runCli(['rollback', backupsFile, `--target=${dir}`, '--summary']);
  assert.equal(result.status, 1, 'out-of-target entry should exit non-zero');
  assert.equal(fs.readFileSync(outside, 'utf8'), 'original\n', 'outside file must be untouched');
  cleanup();
  fs.rmSync(outside, { force: true });
  fs.rmSync(outside + '.backup', { force: true });
});
