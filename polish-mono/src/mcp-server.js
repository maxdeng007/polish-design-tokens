#!/usr/bin/env node
/**
 * polish MCP Server
 * Exposes design token polish capabilities as MCP tools.
 * Full pipeline: extract → audit → plan → diff → apply.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

import { polish_extract } from './handlers/polish-extract.js';
import { polish_audit } from './handlers/polish-audit.js';
import { polish_plan } from './handlers/polish-plan.js';
import { polish_diff } from './handlers/polish-diff.js';
import { polish_apply } from './handlers/polish-apply.js';
import { polish_doctor } from './handlers/polish-doctor.js';
import { polish_style_lookup } from './handlers/polish-style-lookup.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
const VERSION = pkg.version || '0.0.0';

const tools = {};

tools['polish_extract'] = async (args) => { return await polish_extract(args, {}); };
tools['polish_audit'] = async (args) => { return await polish_audit(args, {}); };
tools['polish_plan'] = async (args) => { return await polish_plan(args, {}); };
tools['polish_diff'] = async (args) => { return await polish_diff(args, {}); };
tools['polish_apply'] = async (args) => { return await polish_apply(args, {}); };
tools['polish_doctor'] = async (args) => { return await polish_doctor(args, {}); };
tools['polish_style_lookup'] = async (args) => { return await polish_style_lookup(args, {}); };

const toolDefinitions = [
  {
    name: 'polish_extract',
    description: 'Extract design tokens from a directory. Returns token graph with declarations, conflicts, dangling refs, and orphans.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Directory path to scan for CSS/JS token declarations' },
        ignore: {
          type: 'array',
          items: { type: 'string' },
          description: 'Path fragments to skip during scan (e.g. ["node_modules", "dist"])'
        }
      },
      required: ['target']
    }
  },
  {
    name: 'polish_audit',
    description: 'Full critique: scan a directory and cross-reference tokens. Returns findings with severity levels.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Directory path to audit' },
        ignore: {
          type: 'array',
          items: { type: 'string' },
          description: 'Path fragments to skip during scan'
        }
      },
      required: ['target']
    }
  },
  {
    name: 'polish_plan',
    description: 'Convert audit findings into an ordered, classified action list. Mechanical items can be auto-fixed; judgmental items need agent judgement.',
    inputSchema: {
      type: 'object',
      properties: {
        findings: {
          type: 'array',
          description: 'Findings array from token-audit cross.js output',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Finding type (conflict, hardcoded, dangling, etc.)' },
              severity: { type: 'string', enum: ['error', 'warn', 'info'] },
              title: { type: 'string' },
              detail: { type: 'string' },
              evidence: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    file: { type: 'string' },
                    line: { type: 'number' },
                    scope: { type: 'string' },
                    selector: { type: 'string' }
                  }
                }
              },
              suggestion: { type: 'string' }
            },
            required: ['id']
          }
        }
      },
      required: ['findings']
    }
  },
  {
    name: 'polish_diff',
    description: 'Generate mechanical patches (before/after) for a plan. Only processes mechanical items; judgmental items are skipped.',
    inputSchema: {
      type: 'object',
      properties: {
        plan: {
          type: 'array',
          description: 'Plan array from polish_plan',
          items: {
            type: 'object',
            properties: {
              finding: { type: 'object' },
              action: { type: 'string' },
              type: { type: 'string' },
              priority: { type: 'number' },
              mechanical: { type: 'boolean' },
              judgmental: { type: 'boolean' }
            },
            required: ['finding', 'mechanical']
          }
        },
        target: { type: 'string', description: 'Target directory to resolve relative file paths in patches' }
      },
      required: ['plan']
    }
  },
  {
    name: 'polish_apply',
    description: 'Execute mechanical patches on files with backup protection. Each file is backed up with .backup extension before modification.',
    inputSchema: {
      type: 'object',
      properties: {
        patches: {
          type: 'array',
          description: 'Patches from polish_diff',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['replace', 'rewrite', 'rename', 'add', 'remove'] },
              file: { type: 'string' },
              line: { type: 'number' },
              before: { type: 'string' },
              after: { type: 'string' },
              reason: { type: 'string' },
              findingId: { type: 'string' }
            },
            required: ['file', 'type']
          }
        },
        target: { type: 'string', description: 'Target directory to resolve relative file paths in patches' }
      },
      required: ['patches']
    }
  },
  {
    name: 'polish_doctor',
    description: 'Check that all dependencies (dembrandt, taste, awesome-design-md, impeccable) are installed. Returns install commands for missing ones.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'polish_style_lookup',
    description: 'Look up a style target DESIGN.md from the awesome-design-md skill collection. Returns the brand design system content.',
    inputSchema: {
      type: 'object',
      properties: {
        brand: { type: 'string', description: 'Brand name to look up (e.g. "vercel", "stripe", "linear")' }
      }
    }
  }
];

function sendResult(id, result) {
  const msg = { jsonrpc: '2.0', id, result };
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function sendError(id, code, message) {
  const msg = { jsonrpc: '2.0', id, error: { code, message } };
  process.stdout.write(JSON.stringify(msg) + '\n');
}

async function handleMessage(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    sendResult(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'polish', version: VERSION }
    });
    return;
  }

  if (method === 'tools/list') {
    sendResult(id, { tools: toolDefinitions });
    return;
  }

  if (method === 'tools/call') {
    const name = params && params.name;
    const args = params && params.arguments || {};
    const handler = tools[name];
    if (!handler) {
      sendError(id, -32601, `Unknown tool: ${name}`);
      return;
    }
    try {
      const result = await handler(args);
      sendResult(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
    } catch (err) {
      sendError(id, -32603, err.message || String(err));
    }
    return;
  }

  if (id !== undefined) {
    sendError(id, -32601, `Method not found: ${method}`);
  }
}

import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin });
const pending = new Set();

rl.on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const p = handleMessage(msg);
  if (p) pending.add(p);
  if (p) p.finally(() => pending.delete(p));
});

rl.on('close', () => {
  setTimeout(() => {
    if (pending.size === 0) process.exit(0);
  }, 100);
});
