import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { apply } from '../src/apply.js';
import { rollback } from '../src/rollback.js';

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'polish-rollback-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

test('apply returns a backups manifest describing the run', async () => {
  const dir = makeTmp();
  try {
    fs.writeFileSync(path.join(dir, 'a.css'), ':root {\n  --a: #111;\n}\n');
    const result = await apply([
      { type: 'replace', file: 'a.css', line: 2, before: '#111', after: '#222', reason: 'test', findingId: 'conflict' }
    ], dir);
    assert.equal(result.applied.length, 1);
    assert.equal(result.failed.length, 0);
    assert.ok(Array.isArray(result.backups), 'apply should return a backups manifest');
    assert.equal(result.backups.length, 1, 'one file backed up');
    const entry = result.backups[0];
    assert.equal(entry.file, 'a.css', 'manifest should reference the file relative to target');
    assert.ok(fs.existsSync(entry.backup), 'manifest should reference the backup path');
    assert.deepEqual(result.rolledBack || [], [], 'no rollback on a clean run');
  } finally {
    cleanup(dir);
  }
});

test('apply rolls back already-written files when a later file fails', async () => {
  const dir = makeTmp();
  try {
    fs.writeFileSync(path.join(dir, 'a.css'), ':root {\n  --a: #111;\n}\n');
    fs.writeFileSync(path.join(dir, 'b.css'), ':root {\n  --b: #333;\n}\n');
    // Two deletes on the same line: both validate against the original file,
    // but the second one finds the line already gone at execution time —
    // an execution error that must roll back the file written earlier in the run.
    const result = await apply([
      { type: 'replace', file: 'a.css', line: 2, before: '#111', after: '#222', reason: 't1', findingId: 'conflict' },
      { type: 'delete', file: 'b.css', line: 2, before: '  --b: #333;', reason: 't2', findingId: 'orphan' },
      { type: 'delete', file: 'b.css', line: 2, before: '  --b: #333;', reason: 't3', findingId: 'orphan' }
    ], dir);

    assert.equal(result.failed.length, 1, 'the failing file should be recorded');
    assert.ok(result.failed[0].file.endsWith('b.css'), 'failure should point at b.css');
    assert.ok(Array.isArray(result.rolledBack), 'apply should report rollbacks');
    assert.ok(result.rolledBack.some(r => r.file.endsWith('a.css')), 'a.css should have been rolled back');

    const a = fs.readFileSync(path.join(dir, 'a.css'), 'utf8');
    assert.ok(a.includes('#111'), 'a.css must be restored to its original content');
    assert.ok(!a.includes('#222'), 'a.css must not keep the applied change');
  } finally {
    cleanup(dir);
  }
});

test('apply pre-validates stale deletes without writing anything', async () => {
  const dir = makeTmp();
  try {
    fs.writeFileSync(path.join(dir, 'a.css'), ':root {\n  --a: #111;\n}\n');
    const result = await apply([
      { type: 'delete', file: 'a.css', line: 2, before: '  --a: #999;', reason: 'stale', findingId: 'orphan' }
    ], dir);
    assert.equal(result.applied.length, 0);
    assert.equal(result.failed.length, 1);
    assert.ok(result.failed[0].error.includes('stale'));
    const content = fs.readFileSync(path.join(dir, 'a.css'), 'utf8');
    assert.ok(content.includes('--a: #111;'), 'file untouched');
    assert.ok(!fs.existsSync(path.join(dir, 'a.css.backup')), 'no backup created for a fully invalid run');
  } finally {
    cleanup(dir);
  }
});

test('rollback restores files from their backups', async () => {
  const dir = makeTmp();
  try {
    fs.writeFileSync(path.join(dir, 'a.css'), ':root {\n  --a: #111;\n}\n');
    fs.copyFileSync(path.join(dir, 'a.css'), path.join(dir, 'a.css.backup'));
    fs.writeFileSync(path.join(dir, 'a.css'), ':root {\n  --a: #222;\n}\n');

    const result = await rollback([{ file: 'a.css', backup: path.join(dir, 'a.css.backup') }], dir);
    assert.equal(result.restored.length, 1);
    assert.equal(result.failed.length, 0);
    const content = fs.readFileSync(path.join(dir, 'a.css'), 'utf8');
    assert.ok(content.includes('#111'), 'file restored from backup');
  } finally {
    cleanup(dir);
  }
});

test('rollback rejects entries outside the target directory', async () => {
  const dir = makeTmp();
  const outside = makeTmp();
  try {
    fs.writeFileSync(path.join(outside, 'x.css'), ':root {}\n');
    fs.copyFileSync(path.join(outside, 'x.css'), path.join(outside, 'x.css.backup'));
    const result = await rollback([{ file: path.join(outside, 'x.css'), backup: path.join(outside, 'x.css.backup') }], dir);
    assert.equal(result.restored.length, 0);
    assert.equal(result.failed.length, 1);
    assert.ok(result.failed[0].error.includes('outside target'));
  } finally {
    cleanup(dir);
    cleanup(outside);
  }
});

test('rollback reports missing backups without touching the file', async () => {
  const dir = makeTmp();
  try {
    fs.writeFileSync(path.join(dir, 'a.css'), ':root {\n  --a: #111;\n}\n');
    const result = await rollback([{ file: 'a.css', backup: path.join(dir, 'missing.backup') }], dir);
    assert.equal(result.restored.length, 0);
    assert.equal(result.failed.length, 1);
    assert.ok(result.failed[0].error.includes('backup'), 'failure should mention the backup');
    const content = fs.readFileSync(path.join(dir, 'a.css'), 'utf8');
    assert.ok(content.includes('--a: #111;'), 'file untouched');
  } finally {
    cleanup(dir);
  }
});

test('rollback rejects backup paths that are not server-generated siblings', async () => {
  // A manifest entry pointing `backup` at an arbitrary file would let an
  // external file's content be written into the target. Only the canonical
  // sibling paths produced by apply() are accepted.
  const dir = makeTmp();
  const other = makeTmp();
  try {
    fs.writeFileSync(path.join(dir, 'a.css'), ':root {\n  --a: #111;\n}\n');
    fs.writeFileSync(path.join(other, 'evil.txt'), 'PWNED\n');
    const result = await rollback([{ file: 'a.css', backup: path.join(other, 'evil.txt') }], dir);
    assert.equal(result.restored.length, 0);
    assert.equal(result.failed.length, 1);
    assert.ok(result.failed[0].error.includes('backup'), 'failure should mention the backup');
    const content = fs.readFileSync(path.join(dir, 'a.css'), 'utf8');
    assert.ok(content.includes('--a: #111;'), 'file must not be overwritten by an arbitrary backup');
  } finally {
    cleanup(dir);
    cleanup(other);
  }
});

test('rollback rejects a run-scoped backup whose runId does not match', async () => {
  const dir = makeTmp();
  try {
    fs.writeFileSync(path.join(dir, 'a.css'), ':root {\n  --a: #111;\n}\n');
    fs.writeFileSync(path.join(dir, 'a.css.backup.run-wrong'), ':root {\n  --a: #999;\n}\n');
    const result = await rollback([{ file: 'a.css', runId: 'run-right', backup: path.join(dir, 'a.css.backup.run-wrong') }], dir);
    assert.equal(result.restored.length, 0);
    assert.equal(result.failed.length, 1);
    assert.ok(result.failed[0].error.includes('backup'), 'failure should mention the backup');
    const content = fs.readFileSync(path.join(dir, 'a.css'), 'utf8');
    assert.ok(content.includes('#111'), 'file must be untouched on a runId mismatch');
  } finally {
    cleanup(dir);
  }
});

test('rollback restores run-scoped backups produced by apply', async () => {
  const dir = makeTmp();
  try {
    fs.writeFileSync(path.join(dir, 'a.css'), ':root {\n  --a: #111;\n}\n');
    const first = await apply([
      { type: 'replace', file: 'a.css', line: 2, before: '#111', after: '#222', reason: 't1', findingId: 'conflict' }
    ], dir);
    const second = await apply([
      { type: 'replace', file: 'a.css', line: 2, before: '#222', after: '#333', reason: 't2', findingId: 'conflict' }
    ], dir);
    assert.equal(second.status, 'applied');

    const result = await rollback(second.backups, dir);
    assert.equal(result.restored.length, 1);
    assert.equal(result.failed.length, 0);
    const content = fs.readFileSync(path.join(dir, 'a.css'), 'utf8');
    assert.ok(content.includes('#222'), 'second run should restore to its pre-run content');
    assert.ok(!content.includes('#333'), 'second run change must be gone');

    // The original .backup is still intact for a full restore.
    const firstBackup = fs.readFileSync(path.join(dir, 'a.css.backup'), 'utf8');
    assert.ok(firstBackup.includes('#111'), 'original backup must survive');
  } finally {
    cleanup(dir);
  }
});
