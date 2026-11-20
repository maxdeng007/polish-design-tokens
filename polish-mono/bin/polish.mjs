#!/usr/bin/env node
/**
 * polish — Design token superpower tool
 * Extract · Critique · Apply
 */

import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import { scan } from '../src/scan.js';
import { cross } from '../src/cross.js';
import { plan } from '../src/plan.js';
import { generateDiffs } from '../src/diff.js';
import { apply } from '../src/apply.js';

const USAGE = `polish — Design token superpower tool

Usage:
  polish audit  <target> [--ignore=a,b] [--summary]  Scan a directory and output findings
  polish plan   <findings.json> [--summary]          Convert findings into ordered action list
  polish diff   <plan.json> [--summary]              Generate mechanical patches from a plan
  polish apply  <patches.json> [--target=dir] [--summary]   Execute patches with backup protection
  polish doctor  [--install] [--summary]              Check dependencies, optionally install missing ones
  polish mcp                                      Start MCP server (JSON-RPC over stdin/stdout)

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

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(USAGE);
    process.exit(args.length === 0 ? 2 : 0);
  }

  const cmd = args[0];

  // Parse --ignore=a,b, --target=dir, --summary, and --install flags
  let ignoreFlag = null;
  let targetFlag = null;
  let summaryFlag = false;
  let installFlag = false;
  const positional = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--ignore=')) {
      ignoreFlag = args[i].slice('--ignore='.length);
    } else if (args[i].startsWith('--target=')) {
      targetFlag = args[i].slice('--target='.length);
    } else if (args[i] === '--summary') {
      summaryFlag = true;
    } else if (args[i] === '--install') {
      installFlag = true;
    } else {
      positional.push(args[i]);
    }
  }

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

  if (cmd === 'mcp') {
    await import('../src/mcp-server.js');
    return;
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
