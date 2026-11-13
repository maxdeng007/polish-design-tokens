#!/usr/bin/env node
/**
 * polish — Design token superpower tool
 * Extract · Critique · Apply
 */

import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import { plan } from '../src/plan.js';
import { generateDiffs } from '../src/diff.js';
import { apply } from '../src/apply.js';

const USAGE = `polish — Design token superpower tool

Usage:
  polish plan  <findings.json>     Convert findings into ordered action list
  polish diff  <plan.json>         Generate mechanical patches from a plan
  polish apply <patches.json>      Execute patches with backup protection
  polish mcp                       Start MCP server (JSON-RPC over stdin/stdout)

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
  const file = resolve(args[1] || '');

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
    const result = await apply(patches);
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
