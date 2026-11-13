import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'url';
import { scan } from '../src/scan.js';
import { cross } from '../src/cross.js';
import { measure } from '../src/measure.js';

const DEMO = fileURLToPath(new URL('../../examples/walkthrough/demo-project/', import.meta.url));

function getGraph() {
  return scan(DEMO);
}

test('cross produces findings without observation', () => {
  const report = cross(getGraph());
  assert.ok(Array.isArray(report.findings), 'findings should be an array');
  assert.ok(report.findings.length >= 4, 'should find at least 4 findings');
});

test('cross finds conflict as error severity', () => {
  const report = cross(getGraph());
  const conflict = report.findings.find(f => f.id === 'conflict');
  assert.ok(conflict, 'should find conflict');
  assert.equal(conflict.severity, 'error');
});

test('cross finds dangling as error severity', () => {
  const report = cross(getGraph());
  const dangling = report.findings.find(f => f.id === 'dangling');
  assert.ok(dangling, 'should find dangling');
  assert.equal(dangling.severity, 'error');
});

test('cross finds duplicate-value with evidence', () => {
  const report = cross(getGraph());
  const dup = report.findings.find(f => f.id === 'duplicate-value');
  assert.ok(dup, 'should find duplicate-value');
  assert.ok(dup.evidence.length >= 1, 'should have evidence');
  assert.ok(dup.evidence[0].primary, 'evidence should have primary');
  assert.ok(dup.evidence[0].secondary, 'evidence should have secondary');
});

test('cross finds orphan finding', () => {
  const report = cross(getGraph());
  const orphan = report.findings.find(f => f.id === 'orphan');
  assert.ok(orphan, 'should find orphan');
});

test('cross finds namespace finding', () => {
  const report = cross(getGraph());
  const ns = report.findings.find(f => f.id === 'namespace');
  assert.ok(ns, 'should find namespace');
});

test('cross detects runtime-drift with observation', () => {
  const observation = measure([
    { label: 'page-a', theme: 'light', variables: { '--bg': '#1a1a2e', '--fg': '#e0e0e0' } },
    { label: 'page-b', theme: 'light', variables: { '--bg': '#1a1a2e', '--fg': '#ffffff' } }
  ]);
  const report = cross(getGraph(), observation);
  const drift = report.findings.find(f => f.id === 'runtime-drift');
  assert.ok(drift, 'should detect runtime-drift when --fg differs across pages');
  assert.equal(drift.severity, 'error');
});

test('cross detects hardcoded with observation', () => {
  const observation = measure([
    { label: 'page-a', theme: 'light', variables: { '--bg': '#1a1a2e', '--fg': '#e0e0e0' } },
    { label: 'page-b', theme: 'light', variables: { '--bg': '#1a1a2e', '--fg': '#e0e0e0' } }
  ]);
  const report = cross(getGraph(), observation);
  const hardcoded = report.findings.find(f => f.id === 'hardcoded');
  assert.ok(hardcoded, 'should detect hardcoded colors not matching any token');
});

test('cross summary includes runtime stats when observation is provided', () => {
  const observation = measure([
    { label: 'page-a', theme: 'light', variables: { '--bg': '#1a1a2e' } }
  ]);
  const report = cross(getGraph(), observation);
  assert.equal(report.summary.runtimeDocuments, 1);
  assert.ok(report.summary.runtimeVariables > 0);
});

test('cross summary shows zero runtime stats without observation', () => {
  const report = cross(getGraph());
  assert.equal(report.summary.runtimeDocuments, 0);
  assert.equal(report.summary.runtimeVariables, 0);
});

test('cross findings are sorted by severity', () => {
  const report = cross(getGraph());
  const rank = { error: 0, warn: 1, info: 2 };
  for (let i = 1; i < report.findings.length; i++) {
    const prev = report.findings[i - 1];
    const curr = report.findings[i];
    assert.ok(rank[prev.severity] <= rank[curr.severity], 'findings should be severity-sorted');
  }
});
