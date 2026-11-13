import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan, PRIORITY_ORDER, MECHANICAL_IDS, JUDGMENTAL_IDS } from '../src/plan.js';

const SAMPLE_FINDINGS = [
  { id: 'orphan', severity: 'warn', title: 'orphan tokens' },
  { id: 'dangling', severity: 'error', title: 'dangling refs' },
  { id: 'duplicate-value', severity: 'warn', title: 'duplicate values' },
  { id: 'conflict', severity: 'error', title: 'conflict' },
  { id: 'namespace', severity: 'info', title: 'namespace' }
];

test('plan sorts findings by priority', () => {
  const result = plan(SAMPLE_FINDINGS);
  const order = result.map(r => r.finding.id);
  assert.deepEqual(order, ['conflict', 'dangling', 'orphan', 'duplicate-value', 'namespace']);
});

test('plan classifies mechanical findings correctly', () => {
  const result = plan(SAMPLE_FINDINGS);
  const dangling = result.find(r => r.finding.id === 'dangling');
  assert.equal(dangling.mechanical, true);
  assert.equal(dangling.judgmental, false);

  const dup = result.find(r => r.finding.id === 'duplicate-value');
  assert.equal(dup.mechanical, true);
});

test('plan classifies judgmental findings correctly', () => {
  const result = plan(SAMPLE_FINDINGS);
  const conflict = result.find(r => r.finding.id === 'conflict');
  assert.equal(conflict.mechanical, false);
  assert.equal(conflict.judgmental, true);

  const orphan = result.find(r => r.finding.id === 'orphan');
  assert.equal(orphan.judgmental, true);

  const ns = result.find(r => r.finding.id === 'namespace');
  assert.equal(ns.judgmental, true);
});

test('plan assigns priority numbers from PRIORITY_ORDER', () => {
  const result = plan(SAMPLE_FINDINGS);
  const rankMap = new Map(PRIORITY_ORDER);
  for (const item of result) {
    assert.equal(item.priority, rankMap.get(item.finding.id));
  }
});

test('plan assigns action based on severity', () => {
  const result = plan(SAMPLE_FINDINGS);
  const conflict = result.find(r => r.finding.id === 'conflict');
  assert.equal(conflict.action, 'fix'); // error

  const orphan = result.find(r => r.finding.id === 'orphan');
  assert.equal(orphan.action, 'review'); // warn

  const ns = result.find(r => r.finding.id === 'namespace');
  assert.equal(ns.action, 'note'); // info
});

test('MECHANICAL_IDS contains the right set', () => {
  assert.ok(MECHANICAL_IDS.has('hardcoded'));
  assert.ok(MECHANICAL_IDS.has('duplicate-value'));
  assert.ok(MECHANICAL_IDS.has('dangling'));
});

test('plan handles empty findings array', () => {
  const result = plan([]);
  assert.deepEqual(result, []);
});

test('plan handles unknown finding type', () => {
  const result = plan([{ id: 'custom-type', severity: 'warn', title: 'custom' }]);
  assert.equal(result[0].type, 'unknown');
  assert.equal(result[0].mechanical, false);
  assert.equal(result[0].judgmental, false);
});
