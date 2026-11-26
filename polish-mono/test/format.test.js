import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatAudit,
  formatPlan,
  formatDiff,
  formatApply,
  formatCheck,
  formatFix,
  formatDoctor
} from '../src/format.js';

// --- formatAudit ---

test('formatAudit shows header and clean state for no findings', () => {
  const report = {
    target: { value: '/some/path' },
    summary: { declarations: 10, uniqueTokens: 5 },
    findings: []
  };
  const out = formatAudit(report);
  assert.ok(out.includes('Token Audit Summary'));
  assert.ok(out.includes('No issues found'));
  assert.ok(out.includes('10 declarations'));
  assert.ok(out.includes('5 unique tokens'));
  assert.ok(out.includes('/some/path'));
});

test('formatAudit groups findings by type with mechanical/judgmental labels', () => {
  const report = {
    target: { value: '/test' },
    summary: { declarations: 20, uniqueTokens: 10 },
    findings: [
      { id: 'duplicate-value', severity: 'warn', title: 'Duplicate' },
      { id: 'duplicate-value', severity: 'warn', title: 'Duplicate' },
      { id: 'conflict', severity: 'error', title: 'Conflict' },
      { id: 'hardcoded', severity: 'warn', title: 'Hardcoded' }
    ]
  };
  const out = formatAudit(report);
  assert.ok(out.includes('Found 4 issues'));
  assert.ok(out.includes('[Mechanical] 2 duplicate-value'));
  assert.ok(out.includes('[Judgmental] 1 conflict'));
  assert.ok(out.includes('[Judgmental] 1 hardcoded'));
});

test('formatAudit shows auto-fixable count and next steps when mechanical fixes exist', () => {
  const report = {
    target: { value: '/test' },
    summary: { declarations: 5, uniqueTokens: 3 },
    findings: [
      { id: 'duplicate-value', severity: 'warn', title: 'Dup' }
    ]
  };
  const out = formatAudit(report);
  assert.ok(out.includes('1 can be auto-fixed'));
  assert.ok(out.includes('Next steps'));
  assert.ok(out.includes('polish plan findings.json'));
  assert.ok(out.includes('polish diff plan.json'));
  assert.ok(out.includes('polish apply patches.json'));
});

test('formatAudit shows no mechanical fix message when all are judgmental', () => {
  const report = {
    target: { value: '/test' },
    summary: { declarations: 5, uniqueTokens: 3 },
    findings: [
      { id: 'conflict', severity: 'error', title: 'Conflict' }
    ]
  };
  const out = formatAudit(report);
  assert.ok(out.includes('No mechanical fixes available'));
  assert.ok(!out.includes('polish plan findings.json'));
});

test('formatAudit handles missing summary gracefully', () => {
  const report = {
    target: { value: '/test' },
    findings: []
  };
  const out = formatAudit(report);
  assert.ok(out.includes('Token Audit Summary'));
  assert.ok(out.includes('No issues found'));
});

test('formatAudit uses singular/plural correctly', () => {
  const one = formatAudit({
    target: { value: '/test' },
    summary: { declarations: 1, uniqueTokens: 1 },
    findings: [{ id: 'conflict', severity: 'error', title: 'C' }]
  });
  assert.ok(one.includes('Found 1 issue:'));

  const two = formatAudit({
    target: { value: '/test' },
    summary: { declarations: 1, uniqueTokens: 1 },
    findings: [
      { id: 'conflict', severity: 'error', title: 'C' },
      { id: 'orphan', severity: 'info', title: 'O' }
    ]
  });
  assert.ok(two.includes('Found 2 issues:'));
});

test('formatAudit warns about missing tokens instead of claiming clean', () => {
  const report = {
    target: { value: '/test' },
    summary: {
      declarations: 0,
      uniqueTokens: 0,
      notes: ['No design tokens found — polish audits token relationships and cannot detect hardcoded values without tokens.']
    },
    findings: []
  };
  const out = formatAudit(report);
  assert.ok(out.includes('No design tokens found'));
  assert.ok(!out.includes('look clean'), 'must not claim clean when there are no tokens');
});

// --- formatCheck ---

test('formatCheck warns about missing tokens instead of claiming healthy', () => {
  const report = {
    target: { value: '/test' },
    summary: {
      declarations: 0,
      uniqueTokens: 0,
      notes: ['No design tokens found — polish audits token relationships and cannot detect hardcoded values without tokens.']
    },
    findings: []
  };
  const out = formatCheck(report);
  assert.ok(out.includes('No design tokens found'));
  assert.ok(!out.includes('healthy'), 'must not claim healthy when there are no tokens');
});

// --- formatFix ---

test('formatFix warns about missing tokens instead of claiming healthy', () => {
  const report = {
    target: { value: '/test' },
    summary: {
      declarations: 0,
      uniqueTokens: 0,
      notes: ['No design tokens found — polish audits token relationships and cannot detect hardcoded values without tokens.']
    },
    findings: []
  };
  const out = formatFix(report, { applied: [], failed: [], backupCount: 0 });
  assert.ok(out.includes('No design tokens found'));
  assert.ok(!out.includes('healthy'), 'must not claim healthy when there are no tokens');
});

test('formatFix uses preview wording for dry-run results', () => {
  const report = {
    target: { value: '/test' },
    summary: { declarations: 2, uniqueTokens: 2 },
    findings: [{ id: 'duplicate-value', severity: 'warn', title: 'Dup' }]
  };
  const result = { applied: [], failed: [], backupCount: 0, dryRun: true, patches: [{}] };
  const out = formatFix(report, result);
  assert.ok(out.includes('Preview:'), 'dry-run should say preview');
  assert.ok(out.includes('would be applied'), 'dry-run should say what would happen');
  assert.ok(out.includes('no files modified'), 'dry-run should say nothing was touched');
  assert.ok(!out.includes('All patches applied successfully'), 'dry-run must not claim patches were applied');
});

test('formatFix keeps apply wording when not a dry-run', () => {
  const report = {
    target: { value: '/test' },
    summary: { declarations: 2, uniqueTokens: 2 },
    findings: [{ id: 'duplicate-value', severity: 'warn', title: 'Dup' }]
  };
  const result = { applied: [{ file: 'a.css' }], failed: [], backupCount: 1 };
  const out = formatFix(report, result);
  assert.ok(out.includes('Applying 1 mechanical patch'), 'normal run should say applying');
  assert.ok(out.includes('Applied: 1'), 'normal run should report applied count');
  assert.ok(out.includes('All patches applied successfully'));
});

// --- formatPlan ---

test('formatPlan shows empty state for no actions', () => {
  const out = formatPlan([]);
  assert.ok(out.includes('Action Plan'));
  assert.ok(out.includes('No actions needed'));
});

test('formatPlan shows actions ranked by priority with type labels', () => {
  const actions = [
    { priority: 1, mechanical: false, judgmental: true, finding: { id: 'conflict', title: 'Conflict found' } },
    { priority: 5, mechanical: true, judgmental: false, finding: { id: 'duplicate-value', title: 'Duplicate value' } }
  ];
  const out = formatPlan(actions);
  assert.ok(out.includes('2 actions ranked by priority'));
  assert.ok(out.includes('1. conflict (judgmental)'));
  assert.ok(out.includes('5. duplicate-value (mechanical)'));
  assert.ok(out.includes('Conflict found'));
  assert.ok(out.includes('Duplicate value'));
});

test('formatPlan shows mechanical and judgmental counts', () => {
  const actions = [
    { priority: 1, mechanical: false, judgmental: true, finding: { id: 'conflict', title: 'C' } },
    { priority: 5, mechanical: true, judgmental: false, finding: { id: 'duplicate-value', title: 'D' } },
    { priority: 7, mechanical: false, judgmental: true, finding: { id: 'hardcoded', title: 'H' } }
  ];
  const out = formatPlan(actions);
  assert.ok(out.includes('Mechanical: 1'));
  assert.ok(out.includes('Judgmental: 2'));
});

test('formatPlan handles unknown type', () => {
  const actions = [
    { priority: 99, mechanical: false, judgmental: false, finding: { id: 'custom', title: 'Custom' } }
  ];
  const out = formatPlan(actions);
  assert.ok(out.includes('unknown'));
});

// --- formatDiff ---

test('formatDiff shows empty state when no patches', () => {
  const out = formatDiff([]);
  assert.ok(out.includes('Patches Generated'));
  assert.ok(out.includes('No mechanical patches to apply'));
});

test('formatDiff lists patches with type, file, line, and change', () => {
  const patches = [
    { type: 'replace', file: 'a.css', line: 5, before: '#fff', after: 'var(--bg)', reason: 'test' },
    { type: 'add', file: 'b.css', line: 10, before: '', after: 'new line', reason: 'test' }
  ];
  const out = formatDiff(patches);
  assert.ok(out.includes('2 mechanical patches ready'));
  assert.ok(out.includes('[replace] a.css:5'));
  assert.ok(out.includes('#fff → var(--bg)'));
  assert.ok(out.includes('[add] b.css:10'));
  assert.ok(out.includes('polish apply patches.json'));
});

test('formatDiff handles patches without before/after by using reason', () => {
  const patches = [
    { type: 'rewrite', file: 'a.css', line: 1, before: '', after: '', reason: 'Rewrite canonical' }
  ];
  const out = formatDiff(patches);
  assert.ok(out.includes('Rewrite canonical'));
});

test('formatDiff handles missing file and line', () => {
  const patches = [
    { type: 'replace', file: null, line: null, before: '#fff', after: 'var(--bg)' }
  ];
  const out = formatDiff(patches);
  assert.ok(out.includes('?:?'));
});

// --- formatApply ---

test('formatApply shows all applied successfully when no failures', () => {
  const result = { applied: [{ file: 'a.css', line: 1 }], failed: [], backupCount: 1 };
  const out = formatApply(result);
  assert.ok(out.includes('Apply Results'));
  assert.ok(out.includes('Applied:  1 patches'));
  assert.ok(out.includes('Failed:   0 patches'));
  assert.ok(out.includes('Backups:  1 files'));
  assert.ok(out.includes('All patches applied successfully'));
});

test('formatApply shows error details for failed patches', () => {
  const result = {
    applied: [],
    failed: [{ file: 'a.css', error: 'before text not found' }],
    backupCount: 0
  };
  const out = formatApply(result);
  assert.ok(out.includes('aborted'));
  assert.ok(out.includes('a.css: before text not found'));
});

test('formatApply handles empty result', () => {
  const result = { applied: [], failed: [], backupCount: 0 };
  const out = formatApply(result);
  assert.ok(out.includes('Applied:  0 patches'));
  assert.ok(out.includes('All patches applied successfully'));
});

test('formatApply handles missing properties gracefully', () => {
  const out = formatApply({});
  assert.ok(out.includes('Applied:  0 patches'));
  assert.ok(out.includes('Failed:   0 patches'));
  assert.ok(out.includes('Backups:  0 files'));
});

// --- formatDoctor ---

test('formatDoctor shows [OK] for installed dependencies', () => {
  const report = {
    dependencies: [
      { name: 'dembrandt', installed: true },
      { name: 'taste', installed: true }
    ]
  };
  const out = formatDoctor(report);
  assert.ok(out.includes('Dependency Check'));
  assert.ok(out.includes('[OK]       dembrandt'));
  assert.ok(out.includes('[OK]       taste'));
  assert.ok(out.includes('All dependencies are installed'));
});

test('formatDoctor shows [MISSING] for not-installed dependencies and install hint', () => {
  const report = {
    dependencies: [
      { name: 'dembrandt', installed: true },
      { name: 'taste', installed: false },
      { name: 'impeccable', installed: false }
    ]
  };
  const out = formatDoctor(report);
  assert.ok(out.includes('[MISSING]  taste'));
  assert.ok(out.includes('[MISSING]  impeccable'));
  assert.ok(out.includes('2 optional skill/tool not installed'));
  assert.ok(out.includes('polish doctor --install'));
});

test('formatDoctor shows [INSTALLED] for successful install attempts', () => {
  const report = {
    dependencies: [
      { name: 'taste', installed: true, installAttempted: true, installResult: 'success' }
    ]
  };
  const out = formatDoctor(report);
  assert.ok(out.includes('[INSTALLED] taste'));
  assert.ok(out.includes('All dependencies are installed'));
});

test('formatDoctor shows [FAILED] for failed install attempts', () => {
  const report = {
    dependencies: [
      { name: 'taste', installed: false, installAttempted: true, installResult: 'failed', installError: 'git error' }
    ]
  };
  const out = formatDoctor(report);
  assert.ok(out.includes('[FAILED]   taste'));
  assert.ok(out.includes('1 optional skill/tool not installed'));
});

test('formatDoctor handles empty dependencies', () => {
  const out = formatDoctor({ dependencies: [] });
  assert.ok(out.includes('Dependency Check'));
  assert.ok(out.includes('All dependencies are installed'));
});

// --- Color output (TTY) ---

const ANSI_RE = /\[[0-9;]*m/g;

function stripAnsi(text) {
  return text.replace(ANSI_RE, '');
}

test('color output is disabled when stdout is not a TTY', () => {
  // In test runner, process.stdout.isTTY is undefined/false
  const out = formatAudit({
    target: { value: '/test' },
    summary: { declarations: 1, uniqueTokens: 1 },
    findings: [{ id: 'conflict', severity: 'error', title: 'C' }]
  });
  assert.ok(!out.includes('\x1b['), 'should not contain ANSI codes when not a TTY');
});

test('color output is enabled when stdout is a TTY', () => {
  const originalIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = true;
  try {
    const out = formatAudit({
      target: { value: '/test' },
      summary: { declarations: 1, uniqueTokens: 1 },
      findings: [{ id: 'conflict', severity: 'error', title: 'C' }]
    });
    assert.ok(out.includes('\x1b['), 'should contain ANSI codes when TTY');
    // Strip colors and verify the plain text is still correct
    const plain = stripAnsi(out);
    assert.ok(plain.includes('Token Audit Summary'));
    assert.ok(plain.includes('Found 1 issue'));
  } finally {
    process.stdout.isTTY = originalIsTTY;
  }
});

test('formatAudit colors error severity red and warn severity yellow when TTY', () => {
  const originalIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = true;
  try {
    const out = formatAudit({
      target: { value: '/test' },
      summary: { declarations: 1, uniqueTokens: 1 },
      findings: [
        { id: 'conflict', severity: 'error', title: 'Conflict' },
        { id: 'hardcoded', severity: 'warn', title: 'Hardcoded' }
      ]
    });
    // The type names should be wrapped in their severity colors
    assert.ok(out.includes('\x1b[31mconflict\x1b[0m'), 'error should be red');
    assert.ok(out.includes('\x1b[33mhardcoded\x1b[0m'), 'warn should be yellow');
  } finally {
    process.stdout.isTTY = originalIsTTY;
  }
});

test('formatAudit colors mechanical label green when TTY', () => {
  const originalIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = true;
  try {
    const out = formatAudit({
      target: { value: '/test' },
      summary: { declarations: 1, uniqueTokens: 1 },
      findings: [{ id: 'duplicate-value', severity: 'warn', title: 'Dup' }]
    });
    assert.ok(out.includes('\x1b[32m[Mechanical]\x1b[0m'), 'mechanical label should be green');
  } finally {
    process.stdout.isTTY = originalIsTTY;
  }
});

test('formatApply colors failed count red when there are failures and TTY', () => {
  const originalIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = true;
  try {
    const out = formatApply({
      applied: [],
      failed: [{ file: 'a.css', error: 'not found' }],
      backupCount: 0
    });
    assert.ok(out.includes('\x1b[31mFailed:\x1b[0m'), 'failed label should be red');
    assert.ok(out.includes('\x1b[31ma.css\x1b[0m'), 'failed file should be red');
  } finally {
    process.stdout.isTTY = originalIsTTY;
  }
});

test('formatApply does not color failed label when no failures', () => {
  const originalIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = true;
  try {
    const out = formatApply({ applied: [{}], failed: [], backupCount: 1 });
    // "Failed:" should NOT be wrapped in red when count is 0
    assert.ok(!out.includes('\x1b[31mFailed:\x1b[0m'), 'no red on Failed when no failures');
  } finally {
    process.stdout.isTTY = originalIsTTY;
  }
});

test('formatDoctor colors [MISSING] yellow and [OK] green when TTY', () => {
  const originalIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = true;
  try {
    const out = formatDoctor({
      dependencies: [
        { name: 'dembrandt', installed: true },
        { name: 'taste', installed: false }
      ]
    });
    assert.ok(out.includes('\x1b[32m[OK]      \x1b[0m'), '[OK] should be green');
    assert.ok(out.includes('\x1b[33m[MISSING] \x1b[0m'), '[MISSING] should be yellow');
  } finally {
    process.stdout.isTTY = originalIsTTY;
  }
});

test('formatPlan colors mechanical green and judgmental yellow when TTY', () => {
  const originalIsTTY = process.stdout.isTTY;
  process.stdout.isTTY = true;
  try {
    const out = formatPlan([
      { priority: 1, mechanical: false, judgmental: true, finding: { id: 'conflict', severity: 'error', title: 'C' } },
      { priority: 5, mechanical: true, judgmental: false, finding: { id: 'duplicate-value', severity: 'warn', title: 'D' } }
    ]);
    assert.ok(out.includes('\x1b[33mjudgmental\x1b[0m'), 'judgmental label should be yellow');
    assert.ok(out.includes('\x1b[32mmechanical\x1b[0m'), 'mechanical label should be green');
    assert.ok(out.includes('\x1b[31mconflict\x1b[0m'), 'error id should be red');
  } finally {
    process.stdout.isTTY = originalIsTTY;
  }
});
