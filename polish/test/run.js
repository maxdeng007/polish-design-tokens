import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { plan } from '../src/plan.js';
import { generateDiffs } from '../src/diff.js';
import { apply } from '../src/apply.js';
import * as polish from '../src/index.js';

console.log('\n🧪 Running polish tests...\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${e.message}\n`);
    failed++;
  }
}

/* --------------------------------------------------------------- plan tests */

test('plan: exports successfully', () => {
  assert.strictEqual(typeof plan, 'function', 'plan should be a function');
});

test('plan: returns empty array for empty input', () => {
  const result = plan([]);
  assert.deepStrictEqual(result, [], 'should return empty array for no findings');
});

test('plan: ranks findings by PRIORITY_ORDER', () => {
  const findings = [
    { id: 'hardcoded', severity: 'error' },
    { id: 'conflict', severity: 'error' },
    { id: 'dangling', severity: 'error' }
  ];

  const result = plan(findings);

  assert.strictEqual(result[0].finding.id, 'conflict', 'conflict should be first');
  assert.strictEqual(result[1].finding.id, 'dangling', 'dangling should be second');
  assert.strictEqual(result[2].finding.id, 'hardcoded', 'hardcoded should be last');

  assert.strictEqual(result[0].priority, 1, 'conflict priority should be 1');
  assert.strictEqual(result[1].priority, 2, 'dangling priority should be 2');
  assert.strictEqual(result[2].priority, 7, 'hardcoded priority should be 7');
});

test('plan: classifies mechanical vs judgmental items', () => {
  const findings = [
    { id: 'hardcoded', severity: 'error' },
    { id: 'conflict', severity: 'error' },
    { id: 'dangling', severity: 'error' }
  ];

  const result = plan(findings);
  const byId = new Map(result.map(r => [r.finding.id, r]));

  assert.strictEqual(byId.get('hardcoded').mechanical, true, 'hardcoded is mechanical');
  assert.strictEqual(byId.get('hardcoded').judgmental, false, 'hardcoded is not judgmental');
  assert.strictEqual(byId.get('conflict').mechanical, true, 'conflict is mechanical');
  assert.strictEqual(byId.get('conflict').judgmental, false, 'conflict is not judgmental');
  assert.strictEqual(byId.get('dangling').mechanical, false, 'dangling is not mechanical');
  assert.strictEqual(byId.get('dangling').judgmental, true, 'dangling is judgmental');
});

test('plan: sets action based on severity', () => {
  const findings = [
    { id: 'hardcoded', severity: 'error' },
    { id: 'namespace', severity: 'warn' },
    { id: 'state-variation', severity: 'info' }
  ];

  const result = plan(findings);
  const byId = new Map(result.map(r => [r.finding.id, r]));

  assert.strictEqual(byId.get('hardcoded').action, 'fix', 'error → fix');
  assert.strictEqual(byId.get('namespace').action, 'review', 'warn → review');
  assert.strictEqual(byId.get('state-variation').action, 'note', 'info → note');
});

/* --------------------------------------------------------------- diff tests */

test('diff: generates replace patch for hardcoded color', () => {
  const planItems = [{
    finding: {
      id: 'hardcoded',
      severity: 'error',
      title: '#fff should use token',
      evidence: [{ file: 'test.css', line: 10, scope: 'selector' }]
    },
    mechanical: true
  }];

  const diffs = generateDiffs(planItems);
  assert.ok(diffs.length > 0, 'should generate at least one diff');
  assert.strictEqual(diffs[0].type, 'replace', 'hardcoded → replace');
  assert.ok(diffs[0].before.includes('#fff'), 'before should contain #fff');
  assert.ok(diffs[0].after.includes('var(--'), 'after should contain var(--');
  assert.strictEqual(diffs[0].findingId, 'hardcoded', 'should carry finding id');
});

test('diff: generates rewrite patch for conflict', () => {
  const planItems = [{
    finding: {
      id: 'conflict',
      severity: 'error',
      title: '--color-bg has multiple values',
      evidence: [{ file: 'test.css', line: 5, scope: 'root' }]
    },
    mechanical: true
  }];

  const diffs = generateDiffs(planItems);
  assert.ok(diffs.length > 0, 'should generate at least one diff');
  assert.strictEqual(diffs[0].type, 'rewrite', 'conflict → rewrite');
  assert.strictEqual(diffs[0].findingId, 'conflict', 'should carry finding id');
});

test('diff: skips judgmental items', () => {
  const planItems = [{
    finding: { id: 'dangling', severity: 'error', title: 'Dangling token', evidence: [] },
    mechanical: false,
    judgmental: true
  }];

  const diffs = generateDiffs(planItems);
  assert.deepStrictEqual(diffs, [], 'should not generate diffs for judgmental items');
});

test('diff: returns empty array for empty plan', () => {
  const diffs = generateDiffs([]);
  assert.deepStrictEqual(diffs, [], 'should return empty array for empty plan');
});

test('diff: patch includes file and line from evidence', () => {
  const planItems = [{
    finding: {
      id: 'hardcoded',
      severity: 'error',
      title: '#333 should use token',
      evidence: [{ file: 'styles.css', line: 42, scope: 'selector' }]
    },
    mechanical: true
  }];

  const diffs = generateDiffs(planItems);
  assert.strictEqual(diffs[0].file, 'styles.css', 'should carry file path');
  assert.strictEqual(diffs[0].line, 42, 'should carry line number');
});

/* --------------------------------------------------------------- apply tests */

test('apply: backs up file before modifying', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polish-'));
  const tmpFile = path.join(tmpDir, 'test.css');
  fs.writeFileSync(tmpFile, 'body { color: #fff; }');

  const patches = [{
    type: 'replace',
    file: tmpFile,
    line: 1,
    before: '#fff',
    after: 'var(--token)',
    reason: 'hardcoded'
  }];

  const result = await apply(patches);
  assert.ok(result.applied.length === 1, 'should apply 1 patch');
  assert.ok(fs.existsSync(tmpFile + '.backup'), 'backup file should exist');

  // Verify the file was modified
  const content = fs.readFileSync(tmpFile, 'utf8');
  assert.ok(content.includes('var(--token)'), 'file should contain replacement');
  assert.ok(!content.includes('#fff'), 'file should no longer contain #fff');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true });
});

test('apply: returns empty result for empty patches', async () => {
  const result = await apply([]);
  assert.deepStrictEqual(result.applied, [], 'no applied');
  assert.deepStrictEqual(result.failed, [], 'no failed');
  assert.strictEqual(result.backupCount, 0, 'no backups');
});

test('apply: reports failures for missing files', async () => {
  const patches = [{
    type: 'replace',
    file: '/nonexistent/path/file.css',
    line: 1,
    before: '#fff',
    after: 'var(--token)',
    reason: 'hardcoded'
  }];

  const result = await apply(patches);
  assert.strictEqual(result.applied.length, 0, 'no applied');
  assert.strictEqual(result.failed.length, 1, '1 failed');
  assert.ok(result.failed[0].error, 'should have error message');
});

test('apply: only backs up once per file', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polish-'));
  const tmpFile = path.join(tmpDir, 'test.css');
  fs.writeFileSync(tmpFile, 'color: #fff;\nmargin: #000;');

  const patches = [
    { type: 'replace', file: tmpFile, line: 1, before: '#fff', after: 'var(--a)', reason: 'h1' },
    { type: 'replace', file: tmpFile, line: 2, before: '#000', after: 'var(--b)', reason: 'h2' }
  ];

  const result = await apply(patches);
  assert.strictEqual(result.applied.length, 2, 'both patches applied');
  assert.strictEqual(result.backupCount, 1, 'only 1 backup for same file');

  fs.rmSync(tmpDir, { recursive: true });
});

/* --------------------------------------------------------------- index tests */

test('index: exports public API', () => {
  assert.strictEqual(typeof polish.plan, 'function', 'plan');
  assert.strictEqual(typeof polish.generateDiffs, 'function', 'generateDiffs');
  assert.strictEqual(typeof polish.apply, 'function', 'apply');
  assert.strictEqual(typeof polish.extract, 'function', 'extract');
  assert.strictEqual(typeof polish.audit, 'function', 'audit');
  assert.strictEqual(typeof polish.runPipeline, 'function', 'runPipeline');
});

test('index: extract scans a CSS directory', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polish-'));
  fs.writeFileSync(path.join(tmpDir, 'test.css'), ':root{--color-bg:#fff;--color-text:#000;}');
  const graph = polish.extract(tmpDir);
  assert.strictEqual(graph.declarations.length, 2, 'should find 2 declarations');
  assert.strictEqual(graph.summary.declarations, 2, 'summary should match');
  fs.rmSync(tmpDir, { recursive: true });
});

test('index: audit returns findings for a CSS directory', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polish-'));
  fs.writeFileSync(path.join(tmpDir, 'test.css'), ':root{--color-bg:#fff;--color-text:#000;--orphan:red;}');
  const report = polish.audit(tmpDir);
  assert.ok(report.findings.length > 0, 'should have findings');
  assert.ok(Array.isArray(report.findings), 'findings should be array');
  fs.rmSync(tmpDir, { recursive: true });
});

test('index: runPipeline returns graph, findings, plan, patches', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polish-'));
  fs.writeFileSync(path.join(tmpDir, 'test.css'), ':root{--color-bg:#fff;--color-text:#000;--orphan:red;}');
  const result = polish.runPipeline(tmpDir);
  assert.ok(result.graph, 'should have graph');
  assert.ok(result.findings, 'should have findings');
  assert.ok(Array.isArray(result.plan), 'plan should be array');
  assert.ok(Array.isArray(result.patches), 'patches should be array');
  fs.rmSync(tmpDir, { recursive: true });
});

/* --------------------------------------------------------------- Summary */

console.log('\n' + '='.repeat(40));
console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
console.log('='.repeat(40) + '\n');

process.exit(failed > 0 ? 1 : 0);
