import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import {
  FINDING_META,
  listFindingIds,
  severityOf,
  priorityOf,
  classificationOf,
  isMechanical,
  isJudgmental,
} from '../src/findings.js';
import { PRIORITY_ORDER, MECHANICAL_IDS, JUDGMENTAL_IDS } from '../src/plan.js';
import { EXPLANATIONS } from '../src/explain.js';
import { scan } from '../src/scan.js';
import { cross } from '../src/cross.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VALID_SEVERITIES = new Set(['error', 'warn', 'info']);
const VALID_CLASSIFICATIONS = new Set(['mechanical', 'judgmental']);

test('registry covers all 13 finding ids with complete metadata', () => {
  const ids = listFindingIds();
  assert.equal(ids.length, 13);
  for (const id of ids) {
    const meta = FINDING_META[id];
    assert.ok(meta, `${id} should have registry entry`);
    assert.ok(VALID_SEVERITIES.has(meta.severity), `${id} severity should be valid: ${meta.severity}`);
    assert.ok(VALID_CLASSIFICATIONS.has(meta.classification), `${id} classification should be valid: ${meta.classification}`);
    assert.ok(typeof meta.priority === 'number' && meta.priority > 0, `${id} priority should be a positive number`);
    assert.ok(meta.title, `${id} should have a title`);
    assert.ok(meta.summary, `${id} should have a summary`);
    assert.ok(meta.why, `${id} should have a why-it-matters explanation`);
    assert.ok(meta.fix, `${id} should have a fix suggestion`);
  }
});

test('priorities are unique and form a contiguous 1..N sequence', () => {
  const priorities = listFindingIds().map(id => priorityOf(id));
  const sorted = [...priorities].sort((a, b) => a - b);
  assert.deepEqual(sorted, priorities.map((_, i) => i + 1), `priorities should be 1..N: ${JSON.stringify(priorities)}`);
});

test('classification sets are derived from the registry and cover all ids', () => {
  for (const id of listFindingIds()) {
    if (isMechanical(id)) {
      assert.ok(MECHANICAL_IDS.has(id), `${id} is mechanical, must be in MECHANICAL_IDS`);
      assert.ok(!JUDGMENTAL_IDS.has(id), `${id} mechanical ids must not also be judgmental`);
      assert.equal(classificationOf(id), 'mechanical');
    } else {
      assert.ok(JUDGMENTAL_IDS.has(id), `${id} should be judgmental`);
      assert.equal(classificationOf(id), 'judgmental');
    }
  }
  const mech = [...MECHANICAL_IDS].sort();
  assert.deepEqual(mech, ['duplicate-value'], 'only duplicate-value is mechanical');
});

test('plan PRIORITY_ORDER matches the registry priorities', () => {
  const fromRegistry = Object.entries(FINDING_META).map(([id, m]) => [id, m.priority]);
  assert.deepEqual(
    [...PRIORITY_ORDER].sort((a, b) => a[1] - b[1]),
    [...fromRegistry].sort((a, b) => a[1] - b[1]),
    'plan PRIORITY_ORDER must derive from the registry'
  );
});

test('explain severity matches the registry severity for every type', () => {
  for (const id of listFindingIds()) {
    assert.ok(EXPLANATIONS[id], `${id} should have an explanation`);
    assert.equal(EXPLANATIONS[id].severity, severityOf(id), `${id} explanation severity must match registry`);
  }
});

test('registry severities match what cross() actually produces', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'polish-findings-'));
  try {
    fs.writeFileSync(path.join(dir, 'tokens.css'), [
      ':root {',
      '  --primary: #111;',      // conflict (root) + orphan candidate
      '  --primary: #222;',      // conflict root
      '  --bg: #111;',           // duplicate-value with --primary? no — value #111 duplicates
      '  --unused: #333;',       // orphan
      '}',
      '.card {',
      '  color: #111;',          // hardcoded
      '  background: var(--nope);', // dangling
      '}',
      '.other { color: var(--bg); }'
    ].join('\n'), 'utf8');
    const graph = scan(dir);
    const report = cross(graph);
    const produced = new Set(report.findings.map(f => f.id));
    assert.ok(produced.size >= 4, `fixture should trigger multiple findings, got: ${JSON.stringify([...produced])}`);
    for (const f of report.findings) {
      assert.equal(
        f.severity, severityOf(f.id),
        `cross() severity for ${f.id} must match registry severity`
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('literal-cluster is info/judgmental at priority 13', () => {
  assert.equal(severityOf('literal-cluster'), 'info');
  assert.equal(priorityOf('literal-cluster'), 13);
  assert.equal(classificationOf('literal-cluster'), 'judgmental');
  assert.equal(isJudgmental('literal-cluster'), true);
  assert.equal(isMechanical('literal-cluster'), false);
});

test('literal-cluster sorts last and does not shift existing priorities', () => {
  const last = PRIORITY_ORDER[PRIORITY_ORDER.length - 1];
  assert.deepEqual(last, ['literal-cluster', 13]);
  const byId = new Map(PRIORITY_ORDER);
  assert.equal(byId.get('conflict'), 1);
  assert.equal(byId.get('tailwind-utility-var'), 12);
});
