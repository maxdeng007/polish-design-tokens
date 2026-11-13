/**
 * measure → audit integration example.
 *
 * Demonstrates the full runtime-aware audit flow:
 *   1. Collect runtime observations (simulated browser data)
 *   2. Normalize with measure()
 *   3. Audit with observation (scan + cross)
 *   4. Run the full pipeline (scan → cross → plan → diff)
 *
 * Run:  node examples/measure-audit/measure-audit.js
 *
 * The demo project (examples/walkthrough/demo-project) declares:
 *   --bg: #1a1a2e  --accent: #e05800  --card: #16213e / #1f2937
 */

import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_PROJECT = path.resolve(__dirname, '../walkthrough/demo-project');

import { measure, audit, runPipeline } from '../../polish-mono/src/index.js';

// ── Step 1: Simulated runtime observations ──────────────────────────────
//
// In real usage these come from a browser (DevTools → Computed Style panel,
// or the companion token-audit-mcp package). Here we simulate three pages
// of the same light theme plus one dark theme page, with two planted
// runtime issues:
//
//   runtime-drift: --fg resolves to #e0e0e0 on pages A & C, but #ffffff on B
//   runtime-drift: --accent resolves to #e05800 on A & B, but #ff6600 on C
//   hardcoded:     #e0e0e0 appears on 2+ light-theme pages but matches no
//                  declared token — it's a raw color living in runtime CSS
//
const rawObservations = [
  {
    label: 'page-a: dashboard',
    theme: 'light',
    variables: {
      '--bg': '#1a1a2e',
      '--accent': '#e05800',
      '--fg': '#e0e0e0'
    }
  },
  {
    label: 'page-b: settings',
    theme: 'light',
    variables: {
      '--bg': '#1a1a2e',
      '--accent': '#e05800',
      '--fg': '#ffffff'
    }
  },
  {
    label: 'page-c: billing',
    theme: 'light',
    variables: {
      '--bg': '#1a1a2e',
      '--accent': '#ff6600',
      '--fg': '#e0e0e0'
    }
  },
  {
    label: 'page-d: dashboard-dark',
    theme: 'dark',
    variables: {
      '--bg': '#0d1117',
      '--accent': '#e05800',
      '--fg': '#c9d1d9'
    }
  }
];

console.log('══════════════════════════════════════════════════════════════════\n');
console.log('  measure → audit integration example');
console.log('  Target:', DEMO_PROJECT);
console.log('');

// ── Step 2: Normalize with measure() ────────────────────────────────────

const observation = measure(rawObservations);

console.log('── Step 1: Collect runtime observations ──');
console.log(`  Collected ${observation.documents.length} pages across 2 themes`);
console.log('');
for (const doc of observation.documents) {
  console.log(`  ${doc.label}  [${doc.theme}]`);
  for (const [k, v] of Object.entries(doc.variables)) {
    console.log(`    ${k} = ${v}`);
  }
  console.log('');
}

// ── Step 3: Audit with observation ──────────────────────────────────────

const report = audit(DEMO_PROJECT, [], observation);

console.log('── Step 2: Audit (scan + cross with observation) ──');
const bySeverity = report.summary.bySeverity || {};
console.log(`  Summary: ${report.summary.findings} findings  ` +
  `(${bySeverity.error || 0} errors, ${bySeverity.warn || 0} warnings, ${bySeverity.info || 0} info)`);
console.log(`  Runtime: ${report.summary.runtimeDocuments} documents, ${report.summary.runtimeVariables} variables observed`);
console.log('');

const runtimeFindings = report.findings.filter(f =>
  f.id === 'runtime-drift' || f.id === 'hardcoded'
);

if (runtimeFindings.length === 0) {
  console.log('  (no runtime-specific findings — check that observation data matches declared tokens)\n');
} else {
  console.log('  Runtime-specific findings:');
  console.log('');
  for (const finding of runtimeFindings) {
    console.log(`  ▸ ${finding.severity.toUpperCase()} — ${finding.id}`);
    console.log(`    ${finding.title}`);
    if (finding.detail) console.log(`    ${finding.detail}`);
    console.log('');
  }
}

// ── Step 4: Full pipeline with observation ──────────────────────────────

const { findings, plan, patches } = runPipeline(DEMO_PROJECT, [], observation);

console.log('── Step 3: Full pipeline (scan → cross → plan → diff) ──');
console.log(`  ${findings.length} findings → ${plan.length} plan actions → ${patches.length} patches`);
console.log('');

const mechanical = plan.filter(a => a.type === 'mechanical');
const judgmental = plan.filter(a => a.type === 'judgmental');

console.log(`  Mechanical (auto-fixable): ${mechanical.length}`);
for (const a of mechanical) {
  console.log(`    • [${a.priority}] ${a.finding.id} — ${a.action}`);
}
console.log('');

console.log(`  Judgmental (needs human decision): ${judgmental.length}`);
for (const a of judgmental) {
  console.log(`    • [${a.priority}] ${a.finding.id} — ${a.action}`);
}
console.log('');

// ── Summary ─────────────────────────────────────────────────────────────

console.log('══════════════════════════════════════════════════════════════════');
console.log('');
console.log('  What this example shows:');
console.log('');
console.log('  1. measure() takes raw browser observations and normalizes them');
console.log('     into the RuntimeObservation shape that cross() expects.');
console.log('');
console.log('  2. audit() accepts an optional observation parameter.');
console.log('     Without it, you only get static findings (conflict, dangling,');
console.log('     duplicate-value, orphan, namespace). With it, you also get');
console.log('     runtime-drift and hardcoded — two finding types that are');
console.log('     impossible to detect from source code alone.');
console.log('');
console.log('  3. runPipeline() accepts the observation too, so the full');
console.log('     extract → audit → plan → diff flow runs with runtime data.');
console.log('');
console.log('  In a real agent workflow, the observation comes from');
console.log('  polish_measure (MCP) or the token-audit-mcp browser tool,');
console.log('  then flows into polish_audit as the observation argument.');
console.log('');
