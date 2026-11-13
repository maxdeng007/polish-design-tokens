import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDiffs } from '../src/diff.js';
import { plan } from '../src/plan.js';

const SAMPLE_FINDINGS = [
  {
    id: 'dangling',
    severity: 'error',
    title: '--btn-bg 被引用但未声明',
    detail: 'refs dangling',
    evidence: [{ name: '--btn-bg', count: 1, file: 'src/tokens.css', line: 29 }]
  },
  {
    id: 'duplicate-value',
    severity: 'warn',
    title: '2 组颜色被多个令牌名重复表达',
    detail: '#1a1a2e = --bg = --background',
    evidence: [
      {
        value: '#1a1a2e',
        names: ['--bg', '--background', '--nm-bg'],
        primary: '--bg',
        secondary: '--background',
        primaryFile: 'src/tokens.css',
        primaryLine: 6,
        secondaryFile: 'src/tokens.css',
        secondaryLine: 7
      }
    ]
  },
  {
    id: 'conflict',
    severity: 'error',
    title: '--card 在 root 作用域内有 2 个不同的值',
    detail: 'conflict',
    evidence: [{ file: 'src/tokens.css', line: 14 }]
  },
  {
    id: 'orphan',
    severity: 'warn',
    title: '4 个令牌声明了却从未被引用',
    detail: 'orphans',
    evidence: [{ name: '--nm-bg', file: 'src/tokens.css', line: 8 }]
  }
];

function getPlan() {
  return plan(SAMPLE_FINDINGS);
}

test('generateDiffs only produces patches for mechanical items', () => {
  const patches = generateDiffs(getPlan());
  const findingIds = patches.map(p => p.findingId);
  assert.ok(findingIds.includes('dangling'), 'should patch dangling');
  assert.ok(findingIds.includes('duplicate-value'), 'should patch duplicate-value');
  assert.ok(!findingIds.includes('conflict'), 'should not patch conflict');
  assert.ok(!findingIds.includes('orphan'), 'should not patch orphan');
});

test('dangling produces an add patch', () => {
  const patches = generateDiffs(getPlan());
  const dangling = patches.find(p => p.findingId === 'dangling');
  assert.equal(dangling.type, 'add');
  assert.equal(dangling.file, 'src/tokens.css');
  assert.equal(dangling.line, 29);
  assert.ok(dangling.after.includes('--btn-bg'), 'after should include token name');
});

test('duplicate-value produces a replace patch targeting secondary', () => {
  const patches = generateDiffs(getPlan());
  const dup = patches.find(p => p.findingId === 'duplicate-value');
  assert.equal(dup.type, 'replace');
  assert.equal(dup.before, '#1a1a2e');
  assert.equal(dup.after, 'var(--bg)');
  assert.equal(dup.file, 'src/tokens.css');
  assert.equal(dup.line, 7, 'should target secondary token line');
});

test('patches have reason field', () => {
  const patches = generateDiffs(getPlan());
  for (const p of patches) {
    assert.ok(p.reason, 'each patch should have a reason');
  }
});

test('generateDiffs returns empty array for all-judgmental plan', () => {
  const judgmentalOnly = plan([
    { id: 'conflict', severity: 'error', title: 'c', evidence: [] },
    { id: 'orphan', severity: 'warn', title: 'o', evidence: [] }
  ]);
  const patches = generateDiffs(judgmentalOnly);
  assert.deepEqual(patches, []);
});
