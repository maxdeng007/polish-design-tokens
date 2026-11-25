#!/usr/bin/env node
/**
 * polish — Design token superpower tool
 * Extract · Critique · Apply
 */

import { resolve, join } from 'path';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { scan } from '../src/scan.js';
import { cross } from '../src/cross.js';
import { plan } from '../src/plan.js';
import { generateDiffs } from '../src/diff.js';
import { confirm as resolveDecisions } from '../src/confirm.js';
import { apply } from '../src/apply.js';

const USAGE = `polish — Design token superpower tool

Usage:
  polish                                  Launch the interactive wizard
  polish wizard [--target=dir] [--ignore=a,b]   Interactive guided pipeline
  polish audit  <target> [--ignore=a,b] [--summary]  Scan a directory and output findings
  polish check  <target> [--ignore=a,b]              Health check: read-only summary with exit code
  polish fix    <target> [--ignore=a,b] [--dry-run]  One-shot fix: apply mechanical patches with backup
  polish report <target> [--ignore=a,b] [--output=f] Generate interactive HTML report
  polish plan   <findings.json> [--summary]          Convert findings into ordered action list
  polish diff   <plan.json> [--summary]              Generate mechanical patches from a plan
  polish apply  <patches.json> [--target=dir] [--summary]   Execute patches with backup protection
  polish confirm <decisions.json> [--target=dir] [--summary]  Apply designer-confirmed judgmental decisions
  polish doctor  [--install] [--summary]              Check dependencies, optionally install missing ones
  polish explain <finding-type>                      Explain what a finding type means
  polish mcp                                          Start MCP server (JSON-RPC over stdin/stdout)

Flags:
  --summary     Print human-readable summary instead of JSON
  --install     Install missing optional dependencies (doctor only)

Exit codes:
  0  success
  1  execution failed
  2  usage error`;

function loadJson(filePath) {
  if (!existsSync(filePath)) {
    console.error(`Error: file not found: ${filePath}`);
    process.exit(1);
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`Error: invalid JSON in ${filePath}: ${e.message}`);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--help' || args[0] === '-h') {
    console.log(USAGE);
    process.exit(0);
  }

  // Parse --ignore=a,b, --target=dir, --summary, and --install flags
  let ignoreFlag = null;
  let targetFlag = null;
  let summaryFlag = false;
  let installFlag = false;
  let dryRunFlag = false;
  let outputFlag = null;
  const positional = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--ignore=')) {
      ignoreFlag = args[i].slice('--ignore='.length);
    } else if (args[i].startsWith('--target=')) {
      targetFlag = args[i].slice('--target='.length);
    } else if (args[i].startsWith('--output=')) {
      outputFlag = args[i].slice('--output='.length);
    } else if (args[i] === '--summary') {
      summaryFlag = true;
    } else if (args[i] === '--install') {
      installFlag = true;
    } else if (args[i] === '--dry-run') {
      dryRunFlag = true;
    } else {
      positional.push(args[i]);
    }
  }

  // Bare `polish` launches the interactive wizard.
  if (args.length === 0 || args[0] === 'wizard') {
    const { runWizard } = await import('../src/wizard.js');
    const ignore = ignoreFlag ? ignoreFlag.split(',').map(s => s.trim()).filter(Boolean) : [];
    const result = await runWizard({ target: targetFlag, ignore });
    process.exit(result.status === 'error' ? 1 : 0);
  }

  const cmd = args[0];

  if (cmd === 'audit') {
    const target = resolve(positional[0] || '.');
    const ignore = ignoreFlag ? ignoreFlag.split(',').map(s => s.trim()).filter(Boolean) : [];
    const graph = scan(target, { ignore });
    const report = cross(graph);
    if (summaryFlag) {
      const { formatAudit } = await import('../src/format.js');
      console.log(formatAudit(report));
    } else {
      console.log(JSON.stringify(report, null, 2));
    }
    process.exit(0);
  }

  if (cmd === 'check') {
    const target = resolve(positional[0] || '.');
    const ignore = ignoreFlag ? ignoreFlag.split(',').map(s => s.trim()).filter(Boolean) : [];
    const graph = scan(target, { ignore });
    const report = cross(graph);
    const { formatCheck } = await import('../src/format.js');
    console.log(formatCheck(report));
    const hasErrors = (report.findings || []).some(f => f.severity === 'error');
    process.exit(hasErrors ? 1 : 0);
  }

  if (cmd === 'fix') {
    const target = resolve(positional[0] || '.');
    const ignore = ignoreFlag ? ignoreFlag.split(',').map(s => s.trim()).filter(Boolean) : [];
    const graph = scan(target, { ignore });
    const report = cross(graph);
    const findings = report.findings || [];
    const actions = plan(findings);
    const patches = generateDiffs(actions);

    let result;
    if (dryRunFlag) {
      result = { applied: [], failed: [], backupCount: 0, dryRun: true, patches };
    } else {
      result = await apply(patches, target);
    }

    const { formatFix } = await import('../src/format.js');
    console.log(formatFix(report, result));
    process.exit(result.failed.length > 0 ? 1 : 0);
  }

  if (cmd === 'report') {
    const target = resolve(positional[0] || '.');
    const ignore = ignoreFlag ? ignoreFlag.split(',').map(s => s.trim()).filter(Boolean) : [];
    const graph = scan(target, { ignore });
    const report = cross(graph);
    const { generateReport } = await import('../src/report.js');
    const html = generateReport(report);
    const outFile = resolve(outputFlag || join(target, 'polish-report.html'));
    writeFileSync(outFile, html, 'utf8');
    console.log(`Report written to ${outFile}`);
    process.exit(0);
  }

  const file = resolve(positional[0] || '');

  if (cmd === 'plan') {
    const data = loadJson(file);
    const findings = data.findings || data;
    const result = plan(findings);
    if (summaryFlag) {
      const { formatPlan } = await import('../src/format.js');
      console.log(formatPlan(result));
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
    process.exit(0);
  }

  if (cmd === 'diff') {
    const data = loadJson(file);
    const planItems = data.plan || data;
    const result = generateDiffs(planItems);
    if (summaryFlag) {
      const { formatDiff } = await import('../src/format.js');
      console.log(formatDiff(result));
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
    process.exit(0);
  }

  if (cmd === 'apply') {
    const data = loadJson(file);
    const patches = data.patches || data;
    const target = resolve(targetFlag || process.cwd());
    const result = await apply(patches, target);
    if (summaryFlag) {
      const { formatApply } = await import('../src/format.js');
      console.log(formatApply(result));
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
    process.exit(result.failed.length > 0 ? 1 : 0);
  }

  if (cmd === 'confirm') {
    const data = loadJson(file);
    const decisions = data.decisions || data;
    const target = resolve(targetFlag || process.cwd());
    const graph = scan(target);
    const patches = resolveDecisions(decisions, graph, target);
    const result = await apply(patches, target);
    if (summaryFlag) {
      const { formatApply } = await import('../src/format.js');
      console.log(formatApply(result));
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
    process.exit(result.failed.length > 0 ? 1 : 0);
  }

  if (cmd === 'mcp') {
    await import('../src/mcp-server.js');
    return;
  }

  if (cmd === 'explain') {
    const type = positional[0];
    if (!type) {
      console.error('Error: missing finding type\n');
      console.log('Usage: polish explain <finding-type>');
      console.log('');
      const { listFindingTypes } = await import('../src/explain.js');
      console.log('Available types:');
      for (const t of listFindingTypes()) console.log(`  ${t}`);
      process.exit(2);
    }
    const { formatExplanation } = await import('../src/explain.js');
    console.log(formatExplanation(type));
    process.exit(0);
  }

  if (cmd === 'doctor') {
    const { polish_doctor } = await import('../src/handlers/polish-doctor.js');
    const report = await polish_doctor({ install: installFlag }, {});
    if (summaryFlag) {
      const { formatDoctor } = await import('../src/format.js');
      console.log(formatDoctor(report));
    } else {
      console.log(JSON.stringify(report, null, 2));
    }
    process.exit(0);
  }

  console.error(`Error: unknown command "${cmd}"\n`);
  console.log(USAGE);
  process.exit(2);
}

main();
