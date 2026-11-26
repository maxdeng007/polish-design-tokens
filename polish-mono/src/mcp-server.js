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
import { polish_rollback } from './handlers/polish-rollback.js';
import { polish_doctor } from './handlers/polish-doctor.js';
import { polish_style_lookup } from './handlers/polish-style-lookup.js';
import { measure } from './measure.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
const VERSION = pkg.version || '0.0.0';

const tools = {};

tools['polish_extract'] = async (args) => { return await polish_extract(args, {}); };
tools['polish_audit'] = async (args) => { return await polish_audit(args, {}); };
tools['polish_plan'] = async (args) => { return await polish_plan(args, {}); };
tools['polish_diff'] = async (args) => { return await polish_diff(args, {}); };
tools['polish_apply'] = async (args) => { return await polish_apply(args, {}); };
tools['polish_rollback'] = async (args) => { return await polish_rollback(args, {}); };
tools['polish_doctor'] = async (args) => { return await polish_doctor(args, {}); };
tools['polish_style_lookup'] = async (args) => { return await polish_style_lookup(args, {}); };
tools['polish_measure'] = async (args) => {
  const docs = args.documents || [];
  return measure(docs);
};

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
    },
    outputSchema: {
      type: 'object',
      properties: {
        version: { type: 'string' },
        root: { type: 'string' },
        target: { type: 'string' },
        files: { type: 'array', items: { type: 'string' } },
        themes: { type: 'array', items: { type: 'string' } },
        declarations: { type: 'array' },
        references: { type: 'array' },
        conflicts: { type: 'array' },
        dangling: { type: 'array' },
        orphans: { type: 'array' },
        summary: { type: 'object' }
      },
      required: ['declarations', 'references', 'summary']
    }
  },
  {
    name: 'polish_audit',
    description: 'Full critique: scan a directory and cross-reference tokens. Returns { findings, summary, graphSummary, observation }. Pass observation data to enable runtime-drift and hardcoded detection.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Directory path to audit' },
        ignore: {
          type: 'array',
          items: { type: 'string' },
          description: 'Path fragments to skip during scan'
        },
        observation: {
          type: 'object',
          description: 'Optional runtime observation for detecting runtime-drift and hardcoded values. Use polish_measure to build this.',
          properties: {
            documents: {
              type: 'array',
              description: 'Runtime-observed documents, each with label, theme, and variables',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string', description: 'Document identifier (page name or URL)' },
                  theme: { type: 'string', description: 'Theme name (e.g. "light", "dark")' },
                  variables: {
                    type: 'object',
                    description: 'Map of token name to resolved runtime value',
                    additionalProperties: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      },
      required: ['target']
    },
    outputSchema: {
      type: 'object',
      properties: {
        findings: { type: 'array' },
        summary: { type: 'object' },
        graphSummary: { type: 'object' },
        observation: { type: ['object', 'null'] }
      },
      required: ['findings', 'summary', 'graphSummary', 'observation']
    }
  },
  {
    name: 'polish_measure',
    description: 'Normalize runtime observation data (from browser DevTools or similar) into the format polish_audit expects. Call this before polish_audit with observation data to enable runtime-drift and hardcoded detection.',
    inputSchema: {
      type: 'object',
      properties: {
        documents: {
          type: 'array',
          description: 'Raw runtime document observations. Each document should have a label, theme, and variables map.',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'Document identifier (page name or URL)' },
              theme: { type: 'string', description: 'Theme name (e.g. "light", "dark")' },
              variables: {
                type: 'object',
                description: 'Map of token name to resolved runtime value',
                additionalProperties: { type: 'string' }
              }
            }
          }
        }
      },
      required: ['documents']
    },
    outputSchema: {
      type: 'object',
      properties: {
        documents: { type: 'array' }
      },
      required: ['documents']
    }
  },
  {
    name: 'polish_plan',
    description: 'Convert audit findings into an ordered, classified action list. Returns { plan, summary }. Mechanical items can be auto-fixed; judgmental items need agent judgement.',
    inputSchema: {
      type: 'object',
      properties: {
        findings: {
          type: 'array',
          description: 'Findings array from polish_audit output',
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
    },
    outputSchema: {
      type: 'object',
      properties: {
        plan: { type: 'array' },
        summary: { type: 'object' }
      },
      required: ['plan', 'summary']
    }
  },
  {
    name: 'polish_diff',
    description: 'Generate mechanical patches (before/after) for a plan. Returns { patches, preview }. Only processes mechanical items; judgmental items are skipped.',
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
    },
    outputSchema: {
      type: 'object',
      properties: {
        patches: { type: 'array' },
        preview: { type: 'string' }
      },
      required: ['patches', 'preview']
    }
  },
  {
    name: 'polish_apply',
    description: 'Execute mechanical patches on files with backup protection. Each file is backed up before modification. Target is required to enforce file-path boundaries. The run is strictly all-or-nothing: if any patch fails pre-validation, nothing is written and status is "aborted"; an execution-time failure rolls back every file written this run ("rolledBack").',
    inputSchema: {
      type: 'object',
      properties: {
        patches: {
          type: 'array',
          description: 'Patches from polish_diff',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['replace', 'add', 'delete', 'rewrite'] },
              file: { type: 'string' },
              line: { type: 'number' },
              before: { type: 'string', description: 'Expected original text. Required for delete (the expected original line text) and rewrite (the token name to replace).' },
              after: { type: 'string' },
              reason: { type: 'string' },
              findingId: { type: 'string' }
            },
            required: ['file', 'type'],
            allOf: [
              {
                if: { properties: { type: { const: 'delete' } }, required: ['type'] },
                then: { required: ['before'] }
              },
              {
                if: { properties: { type: { const: 'rewrite' } }, required: ['type'] },
                then: { required: ['before'] }
              }
            ]
          }
        },
        target: { type: 'string', description: 'Target directory to resolve and bound relative file paths. Required — patches outside this directory are rejected.' }
      },
      required: ['patches', 'target']
    },
    outputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['applied', 'aborted', 'rolledBack'] },
        applied: { type: 'array' },
        failed: { type: 'array' },
        backupCount: { type: 'number' },
        backups: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              file: { type: 'string' },
              backup: { type: 'string' },
              runId: { type: 'string' }
            },
            required: ['file', 'backup']
          }
        },
        rolledBack: { type: 'array' }
      },
      required: ['status', 'applied', 'failed', 'backupCount', 'backups', 'rolledBack']
    }
  },
  {
    name: 'polish_rollback',
    description: 'Restore files from the backup manifest produced by polish_apply. Pass the backups array from an apply result. Only files within the target directory are restored.',
    inputSchema: {
      type: 'object',
      properties: {
        backups: {
          type: 'array',
          description: 'Backup manifest entries from polish_apply output',
          items: {
            type: 'object',
            properties: {
              file: { type: 'string', description: 'File that was backed up' },
              backup: { type: 'string', description: 'Path to the backup file' }
            },
            required: ['file']
          }
        },
        target: { type: 'string', description: 'Target directory to bound the restore. Required — files outside this directory are refused.' }
      },
      required: ['backups', 'target']
    },
    outputSchema: {
      type: 'object',
      properties: {
        restored: { type: 'array' },
        failed: { type: 'array' }
      },
      required: ['restored', 'failed']
    }
  },
  {
    name: 'polish_doctor',
    description: 'Check that optional dependencies are installed. dembrandt and skills (taste, awesome-design-md, impeccable) are all optional — they enhance the experience but are not required for token auditing. Pass { install: true } to install missing ones automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        install: {
          type: 'boolean',
          description: 'If true, install missing optional dependencies automatically'
        }
      }
    },
    outputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        dependencies: { type: 'array' },
        message: { type: 'string' }
      },
      required: ['status', 'dependencies', 'message']
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
    },
    outputSchema: {
      type: 'object',
      properties: {
        found: { type: 'boolean' },
        available: { type: 'boolean' },
        source: { type: 'string' },
        brand: { type: 'string' },
        path: { type: 'string' },
        content: { type: 'string' },
        error: { type: 'string' },
        note: { type: 'string' },
        skillDir: { type: 'string' },
        availableBrands: { type: 'array', items: { type: 'string' } }
      },
      required: ['found', 'available', 'source']
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
    const requested = params && params.protocolVersion;
    sendResult(id, {
      protocolVersion: requested || '2024-11-05',
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
      sendResult(id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result
      });
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
