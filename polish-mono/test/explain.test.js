import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainFinding, listFindingTypes, formatExplanation, EXPLANATIONS } from '../src/explain.js';

// --- explainFinding ---

test('explainFinding returns explanation for known type', () => {
  const exp = explainFinding('conflict');
  assert.ok(exp);
  assert.equal(exp.severity, 'error');
  assert.equal(exp.title, 'Conflict');
  assert.ok(exp.summary.length > 0);
  assert.ok(exp.why.length > 0);
  assert.ok(exp.fix.length > 0);
});

test('explainFinding is case-insensitive', () => {
  const lower = explainFinding('conflict');
  const upper = explainFinding('CONFLICT');
  assert.deepEqual(lower, upper);
});

test('explainFinding trims whitespace', () => {
  const trimmed = explainFinding('  conflict  ');
  assert.deepEqual(explainFinding('conflict'), trimmed);
});

test('explainFinding returns null for unknown type', () => {
  assert.equal(explainFinding('nonexistent'), null);
});

test('explainFinding returns null for empty input', () => {
  assert.equal(explainFinding(''), null);
  assert.equal(explainFinding(null), null);
  assert.equal(explainFinding(undefined), null);
});

// --- listFindingTypes ---

test('listFindingTypes returns all 12 finding types', () => {
  const types = listFindingTypes();
  assert.equal(types.length, 12);
  assert.ok(types.includes('conflict'));
  assert.ok(types.includes('dangling'));
  assert.ok(types.includes('hardcoded'));
  assert.ok(types.includes('tailwind-utility-var'), 'tailwind-utility-var should be documented');
  assert.ok(types.includes('duplicate-value'));
  assert.ok(types.includes('dynamic-variable'));
});

test('listFindingTypes returns sorted unique keys', () => {
  const types = listFindingTypes();
  const sorted = [...types].sort();
  assert.deepEqual(types, sorted);
});

// --- formatExplanation ---

test('formatExplanation returns formatted text for known type', () => {
  const out = formatExplanation('conflict');
  assert.ok(out.includes('Conflict'));
  assert.ok(out.includes('error'));
  assert.ok(out.includes('Why it matters'));
  assert.ok(out.includes('How to fix'));
  assert.ok(out.includes('The same token name is declared with different values.'));
});

test('formatExplanation includes all sections', () => {
  const out = formatExplanation('hardcoded');
  assert.ok(out.includes('Hardcoded Value'));
  assert.ok(out.includes('warn'));
  assert.ok(out.includes('Why it matters:'));
  assert.ok(out.includes('How to fix:'));
});

test('formatExplanation returns helpful error for unknown type', () => {
  const out = formatExplanation('nonexistent');
  assert.ok(out.includes('Unknown finding type'));
  assert.ok(out.includes('Available types'));
  assert.ok(out.includes('conflict'));
});

// --- EXPLANATIONS completeness ---

test('all finding types from plan.js have explanations', async () => {
  const { PRIORITY_ORDER } = await import('../src/plan.js');
  const types = PRIORITY_ORDER.map(([id]) => id);
  for (const type of types) {
    assert.ok(EXPLANATIONS[type], `missing explanation for ${type}`);
  }
});

test('all explanations have required fields', () => {
  for (const [type, exp] of Object.entries(EXPLANATIONS)) {
    assert.ok(exp.severity, `${type} missing severity`);
    assert.ok(exp.title, `${type} missing title`);
    assert.ok(exp.summary, `${type} missing summary`);
    assert.ok(exp.why, `${type} missing why`);
    assert.ok(exp.fix, `${type} missing fix`);
    assert.ok(['error', 'warn', 'info'].includes(exp.severity), `${type} invalid severity: ${exp.severity}`);
  }
});
