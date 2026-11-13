import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'url';
import { scan } from '../src/scan.js';

const DEMO = fileURLToPath(new URL('../../examples/walkthrough/demo-project/', import.meta.url));

test('scan finds declarations and references', () => {
  const graph = scan(DEMO);
  assert.ok(graph.declarations.length > 0, 'should have declarations');
  assert.ok(graph.references.length > 0, 'should have references');
});

test('scan detects conflicts', () => {
  const graph = scan(DEMO);
  assert.ok(graph.conflicts.length >= 1, 'should detect --card conflict');
  const cardConflict = graph.conflicts.find(c => c.name === '--card');
  assert.ok(cardConflict, '--card should have a conflict');
  assert.ok(cardConflict.variants.length === 2, '--card should have 2 variants');
});

test('scan detects dangling references', () => {
  const graph = scan(DEMO);
  assert.ok(graph.dangling.length >= 1, 'should detect --btn-bg as dangling');
  const btnBg = graph.dangling.find(d => d.name === '--btn-bg');
  assert.ok(btnBg, '--btn-bg should be dangling');
});

test('scan detects orphans', () => {
  const graph = scan(DEMO);
  assert.ok(graph.orphans.length >= 1, 'should detect orphan tokens');
});

test('scan summary counts are consistent', () => {
  const graph = scan(DEMO);
  assert.equal(graph.summary.declarations, graph.declarations.length);
  assert.equal(graph.summary.conflicts, graph.conflicts.length);
  assert.equal(graph.summary.dangling, graph.dangling.length);
  assert.equal(graph.summary.orphans, graph.orphans.length);
});

test('scan resolves alias chains', () => {
  const graph = scan(DEMO);
  const bg = graph.declarations.find(d => d.name === '--bg');
  assert.ok(bg, '--bg should be declared');
  assert.ok(bg.resolved, '--bg should have a resolved value');
  assert.equal(bg.resolved, '#1a1a2e');
});

test('scan skips node_modules and binary files', () => {
  const graph = scan(DEMO);
  assert.ok(!graph.files.some(f => f.includes('node_modules')), 'should not scan node_modules');
});
