import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scan } from '../src/scan.js';
import { cross } from '../src/cross.js';
import { measure } from '../src/measure.js';

const DEMO = fileURLToPath(new URL('../../examples/walkthrough/demo-project/', import.meta.url));
const TMP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '.cross-tmp');

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

test('cross duplicate-value evidence covers all secondary names, not just the first', () => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(TMP_DIR, 'tokens.css'),
    ':root {\n  --bg: #123456;\n  --one: #123456;\n  --two: #123456;\n}\n',
    'utf8'
  );
  const report = cross(scan(TMP_DIR));
  const dup = report.findings.find(f => f.id === 'duplicate-value');
  assert.ok(dup, 'should find duplicate-value');
  // Three names sharing one value → two secondary names → two evidence entries
  assert.equal(dup.evidence.length, 2, 'should produce one evidence entry per secondary name');
  const secondaries = dup.evidence.map(e => e.secondary);
  assert.ok(secondaries.includes('--one'), 'evidence should cover --one');
  assert.ok(secondaries.includes('--two'), 'evidence should cover --two');
  for (const ev of dup.evidence) {
    assert.equal(ev.primary, '--bg', 'primary should be the first name');
    assert.ok(ev.secondaryFile, 'each evidence entry should have a secondaryFile');
    assert.ok(ev.secondaryLine, 'each evidence entry should have a secondaryLine');
  }
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

test('cross adds a no-tokens note to the summary when the project has no tokens', () => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(TMP_DIR, 'page.css'),
    'body {\n  color: #3B82F6;\n  padding: 8px;\n}\n',
    'utf8'
  );
  const report = cross(scan(TMP_DIR));
  assert.equal(report.findings.length, 0, 'a token-less project should produce no findings');
  assert.equal(report.summary.declarations, 0);
  assert.ok(
    report.summary.notes.some(n => n.includes('No design tokens found')),
    'summary.notes should carry the no-tokens warning'
  );
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

test('cross reports literal-cluster for values used 2+ times', () => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(TMP_DIR, 'a.css'),
    'a { color: #fff; }\nb { color: #fff; }\n',
    'utf8'
  );
  const report = cross(scan(TMP_DIR));
  const lit = report.findings.filter(f => f.id === 'literal-cluster');
  assert.equal(lit.length, 1, 'should report one cluster');
  const f = lit[0];
  assert.equal(f.severity, 'info');
  assert.equal(f.evidence.length, 1);
  assert.equal(f.evidence[0].value, '#fff');
  assert.equal(f.evidence[0].count, 2);
  assert.equal(f.evidence[0].files.length, 1);
  assert.deepEqual(f.evidence[0].files[0], { file: 'a.css', lines: [1, 2] });
  assert.match(f.evidence[0].suggestedName, /^--color-\d+$/);
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

test('cross does not report literals used only once', () => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(TMP_DIR, 'a.css'),
    'a { color: #fff; }\n',
    'utf8'
  );
  const report = cross(scan(TMP_DIR));
  assert.equal(report.findings.filter(f => f.id === 'literal-cluster').length, 0);
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

test('cross does not normalize named colors into one cluster', () => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(TMP_DIR, 'a.css'),
    'a { color: white; }\nb { color: white; }\nc { color: #fff; }\nd { color: #fff; }\n',
    'utf8'
  );
  const report = cross(scan(TMP_DIR));
  const lit = report.findings.filter(f => f.id === 'literal-cluster');
  assert.equal(lit.length, 2, 'white and #fff stay separate clusters');
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

test('cross suggested names are deterministic ordinals per kind', () => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(TMP_DIR, 'a.css'),
    'a { color: #111; color: #222; color: #333; padding: 8px; padding: 16px; }\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(TMP_DIR, 'b.css'),
    'b { color: #111; color: #222; color: #333; padding: 8px; padding: 16px; }\n',
    'utf8'
  );
  const report = cross(scan(TMP_DIR));
  const names = report.findings
    .filter(f => f.id === 'literal-cluster')
    .map(f => f.evidence[0].suggestedName)
    .sort();
  assert.deepEqual(names, ['--color-1', '--color-2', '--color-3', '--space-1', '--space-2']);
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

test('cross 0-token note points at polish seed', () => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(path.join(TMP_DIR, 'page.css'), 'body { color: #3B82F6; }\n', 'utf8');
  const report = cross(scan(TMP_DIR));
  const note = report.summary.notes.find(n => n.includes('No design tokens found'));
  assert.ok(note, 'note should still exist');
  assert.match(note, /polish seed/);
  assert.match(note, /:root/);
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});
