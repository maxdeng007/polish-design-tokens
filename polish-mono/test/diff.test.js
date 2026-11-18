import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDiffs } from '../src/diff.js';
import { plan } from '../src/plan.js';

const SAMPLE_FINDINGS = [
  {
    id: 'dangling',
    severity: 'error',
    title: '--btn-bg is referenced but not declared',
    detail: 'refs dangling',
    evidence: [{ name: '--btn-bg', count: 1, file: 'src/tokens.css', line: 29 }]
  },
  {
    id: 'duplicate-value',
    severity: 'warn',
    title: '2 color values are expressed by multiple token names',
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
    title: '--card has 2 different values in root scope',
    detail: 'conflict',
    evidence: [{ file: 'src/tokens.css', line: 14 }]
  },
  {
    id: 'orphan',
    severity: 'warn',
    title: '4 tokens are declared but never referenced',
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
  assert.ok(findingIds.includes('duplicate-value'), 'should patch duplicate-value');
  assert.ok(!findingIds.includes('dangling'), 'should not patch dangling (judgmental)');
  assert.ok(!findingIds.includes('conflict'), 'should not patch conflict');
  assert.ok(!findingIds.includes('orphan'), 'should not patch orphan');
});

test('dangling produces no patch', () => {
  const patches = generateDiffs(getPlan());
  const dangling = patches.find(p => p.findingId === 'dangling');
  assert.equal(dangling, undefined, 'dangling should not produce a patch');
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

test('duplicate-value generates one patch per secondary evidence entry', () => {
  const findings = [
    {
      id: 'duplicate-value',
      severity: 'warn',
      title: '1 color value expressed by 3 token names',
      detail: '#123456 = --bg = --one = --two',
      evidence: [
        {
          value: '#123456',
          names: ['--bg', '--one', '--two'],
          primary: '--bg',
          secondary: '--one',
          primaryFile: 'src/tokens.css',
          primaryLine: 2,
          secondaryFile: 'src/tokens.css',
          secondaryLine: 3
        },
        {
          value: '#123456',
          names: ['--bg', '--one', '--two'],
          primary: '--bg',
          secondary: '--two',
          primaryFile: 'src/tokens.css',
          primaryLine: 2,
          secondaryFile: 'src/tokens.css',
          secondaryLine: 4
        }
      ]
    }
  ];
  const patches = generateDiffs(plan(findings));
  const dupPatches = patches.filter(p => p.findingId === 'duplicate-value');
  assert.equal(dupPatches.length, 2, 'should produce one patch per secondary');
  assert.equal(dupPatches[0].after, 'var(--bg)');
  assert.equal(dupPatches[0].line, 3, 'first patch targets first secondary line');
  assert.equal(dupPatches[1].line, 4, 'second patch targets second secondary line');
});
