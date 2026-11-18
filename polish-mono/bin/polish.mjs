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
  polish audit  <target> [--ignore=a,b]  Scan a directory and output findings JSON
  polish plan   <findings.json>          Convert findings into ordered action list
  polish diff   <plan.json>              Generate mechanical patches from a plan
  polish apply  <patches.json> [--target=dir]   Execute patches with backup protection (target defaults to cwd)
  polish mcp                             Start MCP server (JSON-RPC over stdin/stdout)

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

  // Parse --ignore=a,b and --target=dir style flags from remaining args
  let ignoreFlag = null;
  let targetFlag = null;
  const positional = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--ignore=')) {
      ignoreFlag = args[i].slice('--ignore='.length);
    } else if (args[i].startsWith('--target=')) {
      targetFlag = args[i].slice('--target='.length);
    } else {
      positional.push(args[i]);
    }
  }

  if (cmd === 'audit') {
    const target = resolve(positional[0] || '.');
    const ignore = ignoreFlag ? ignoreFlag.split(',').map(s => s.trim()).filter(Boolean) : [];
    const graph = scan(target, { ignore });
    const report = cross(graph);
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  const file = resolve(positional[0] || '');

  if (cmd === 'plan') {
    const data = loadJson(file);
    const findings = data.findings || data;
    console.log(JSON.stringify(plan(findings), null, 2));
    process.exit(0);
  }

  if (cmd === 'diff') {
    const data = loadJson(file);
    const planItems = data.plan || data;
    console.log(JSON.stringify(generateDiffs(planItems), null, 2));
    process.exit(0);
  }

  if (cmd === 'apply') {
    const data = loadJson(file);
    const patches = data.patches || data;
    const target = resolve(targetFlag || process.cwd());
    const result = await apply(patches, target);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.failed.length > 0 ? 1 : 0);
  }

  if (cmd === 'mcp') {
    await import('../src/mcp-server.js');
    return;
  }

  console.error(`Error: unknown command "${cmd}"\n`);
  console.log(USAGE);
  process.exit(2);
}

main();
