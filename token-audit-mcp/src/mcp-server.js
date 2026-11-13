#!/usr/bin/env node
/**
 * token-audit MCP Server
 * Exposes design token auditing capabilities as MCP tools
 */

import readline from 'node:readline';
import { resolve } from 'node:path';
import { JobStore } from './cache/index.js';
import { audit_run } from './handlers/audit-run.js';
import { audit_findings } from './handlers/audit-findings.js';
import { audit_summary } from './handlers/audit-summary.js';
import { audit_html_report } from './handlers/audit-html-report.js';
import { audit_json } from './handlers/audit-json.js';
import { job_status } from './handlers/job-status.js';
import { export_tokens_studio } from './handlers/export-tokens-studio.js';
import { export_style_dictionary } from './handlers/export-style-dictionary.js';
import { export_dtcg } from './handlers/export-dtcg.js';
import { export_tailwind } from './handlers/export-tailwind.js';
import { export_shadcn } from './handlers/export-shadcn.js';
import { audit_recommendations } from './handlers/audit-recommendations.js';
import { list_jobs } from './handlers/list-jobs.js';
import { delete_job } from './handlers/delete-job.js';
import { resolveCacheDir } from './utils/cache-dir.js';

const CACHE_DIR = resolveCacheDir();

// Initialize job store
const store = new JobStore(CACHE_DIR);

// Tool registry
const tools = {};

// Register tool functions
tools['audit_run'] = async (args) => {
  return await audit_run(args, { store, cacheDir: CACHE_DIR });
};

tools['audit_findings'] = async (args) => {
  return await audit_findings(args, { store, cacheDir: CACHE_DIR });
};

tools['audit_summary'] = async (args) => {
  return await audit_summary(args, { store, cacheDir: CACHE_DIR });
};

tools['audit_html_report'] = async (args) => {
  return await audit_html_report(args, { store, cacheDir: CACHE_DIR });
};

tools['audit_json'] = async (args) => {
  return await audit_json(args, { store, cacheDir: CACHE_DIR });
};

tools['job_status'] = async (args) => {
  return await job_status(args, { store, cacheDir: CACHE_DIR });
};

tools['export_tokens_studio'] = async (args) => {
  return await export_tokens_studio(args, { store, cacheDir: CACHE_DIR });
};

tools['export_style_dictionary'] = async (args) => {
  return await export_style_dictionary(args, { store, cacheDir: CACHE_DIR });
};

tools['export_dtcg'] = async (args) => {
  return await export_dtcg(args, { store, cacheDir: CACHE_DIR });
};

tools['export_tailwind'] = async (args) => {
  return await export_tailwind(args, { store, cacheDir: CACHE_DIR });
};

tools['export_shadcn'] = async (args) => {
  return await export_shadcn(args, { store, cacheDir: CACHE_DIR });
};

tools['audit_recommendations'] = async (args) => {
  return await audit_recommendations(args, { store, cacheDir: CACHE_DIR });
};

tools['list_jobs'] = async (args) => {
  return await list_jobs(args, { store, cacheDir: CACHE_DIR });
};

tools['delete_job'] = async (args) => {
  return await delete_job(args, { store, cacheDir: CACHE_DIR });
};

// Tool definitions with schemas
const toolDefinitions = [
  {
    name: 'audit_run',
    description: 'Run full design token audit on local path or URL. Returns jobId immediately and runs asynchronously.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { 
          type: 'string', 
          description: 'Local filesystem path or HTTP(S) URL to audit'
        },
        scan: {
          type: 'string',
          description: 'Source directory for the static scan, when it differs from the runtime target (defaults to target)'
        },
        targetFile: {
          type: 'string',
          description: 'Built artefact to measure at runtime (e.g. the bundled HTML). Enables runtime measurement.'
        },
        runtime: {
          type: 'boolean',
          description: 'Force runtime measurement on or off. Auto-enabled for URLs, .html targets or when targetFile is set.'
        },
        route: {
          type: 'string',
          description: 'Hash route to load during runtime measurement (e.g. "#/today")'
        },
        timeout: {
          type: 'number',
          description: 'Per-load timeout in milliseconds (default 120000)'
        },
        classification: {
          type: 'boolean',
          description: 'Ask dembrandt for extra classification (typography, components, motion). On by default; costs ~2.5 minutes. Pass false to skip.'
        },
        ignore: { 
          type: 'array', 
          items: { type: 'string' },
          description: 'Glob patterns to exclude from scan (e.g., ["node_modules"])'
        },
        severity: {
          type: 'string',
          enum: ['error', 'warn', 'info'],
          description: 'Minimum severity level for findings (default: "error")'
        }
      },
      required: ['target']
    }
  },
  {
    name: 'audit_findings',
    description: 'Query audit findings with optional filtering by severity and type.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { 
          type: 'string', 
          description: 'Job UUID returned by audit_run' 
        },
        severity: {
          type: 'string',
          enum: ['error', 'warn', 'info'],
          description: 'Filter to only this severity level'
        },
        types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by finding IDs (e.g., ["conflict", "orphan"])'
        }
      },
      required: ['jobId']
    }
  },
  {
    name: 'audit_summary',
    description: 'Get quick summary statistics without loading all findings into memory.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { 
          type: 'string', 
          description: 'Job UUID from audit_run' 
        }
      },
      required: ['jobId']
    }
  },
  {
    name: 'audit_html_report',
    description: 'Return the path and metadata for the HTML report file.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { 
          type: 'string', 
          description: 'Job UUID from audit_run' 
        }
      },
      required: ['jobId']
    }
  },
  {
    name: 'audit_json',
    description: 'Return the path and metadata for the JSON artifact.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { 
          type: 'string', 
          description: 'Job UUID from audit_run' 
        }
      },
      required: ['jobId']
    }
  },
  {
    name: 'job_status',
    description: 'Poll the current status of an asynchronous audit job.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { 
          type: 'string', 
          description: 'Job UUID from audit_run' 
        }
      },
      required: ['jobId']
    }
  },
  {
    name: 'export_tokens_studio',
    description: 'Export tokens in Tokens Studio/Figma format compatible with figma-plugin.tokens.studio plugin.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { 
          type: 'string', 
          description: 'Job UUID from audit_run' 
        },
        format: {
          type: 'string',
          enum: ['json', 'figma'],
          description: 'Output format (default: "json" writes to file)'
        }
      },
      required: ['jobId']
    }
  },
  {
    name: 'export_style_dictionary',
    description: 'Export tokens as Style Dictionary compatible output for Web/iOS/Android platforms.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { 
          type: 'string', 
          description: 'Job UUID from audit_run' 
        },
        platform: {
          type: 'string',
          enum: ['web', 'ios', 'android'],
          description: 'Target platform (default: "web")'
        }
      },
      required: ['jobId']
    }
  },
  {
    name: 'export_dtcg',
    description: 'Export tokens in W3C Design Token Community Group (DTCG) spec format.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { 
          type: 'string', 
          description: 'Job UUID from audit_run' 
        }
      },
      required: ['jobId']
    }
  },
  {
    name: 'export_tailwind',
    description: 'Generate Tailwind CSS configuration file with design tokens mapped to theme keys.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { 
          type: 'string', 
          description: 'Job UUID from audit_run' 
        },
        themePrefix: {
          type: 'string',
          description: 'Prefix for custom theme keys (e.g., "nm-" for Noah Mind)'
        }
      },
      required: ['jobId']
    }
  },
  {
    name: 'export_shadcn',
    description: 'Generate shadcn/ui-compatible CSS variable definitions + theme structure.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { 
          type: 'string', 
          description: 'Job UUID from audit_run' 
        }
      },
      required: ['jobId']
    }
  },
  {
    name: 'audit_recommendations',
    description: 'Get agent-assisted recommendations for improving token hygiene (merge suggestions, alias optimization).',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { 
          type: 'string', 
          description: 'Job UUID from audit_run' 
        },
        autoFixOnly: {
          type: 'boolean',
          description: 'Only return low-risk, high-confidence suggestions (default: false)'
        },
        categories: {
          type: 'array',
          items: { 
            type: 'string',
            enum: ['merge', 'alias', 'naming']
          },
          description: 'Filter recommendation categories'
        }
      },
      required: ['jobId']
    }
  },
  {
    name: 'list_jobs',
    description: 'List all cached jobs with optional filtering by status and age.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max jobs to return (default: 50)',
          default: 50
        },
        older_than_days: {
          type: 'number',
          description: 'Exclude jobs older than N days'
        },
        status: {
          type: 'string',
          enum: ['complete', 'failed', 'running'],
          description: 'Filter by status'
        }
      },
      required: []
    }
  },
  {
    name: 'delete_job',
    description: 'Permanently remove a job and all its artifacts (irreversible operation).',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { 
          type: 'string', 
          description: 'Job UUID from audit_run' 
        }
      },
      required: ['jobId']
    }
  }
];

// Handle incoming messages via stdio
async function handleRequest(method, params, id) {
  if (method === 'initialize') {
    return {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: { listChanged: true }
      },
      serverInfo: { 
        name: 'token-audit-mcp', 
        version: '0.1.0' 
      }
    };
  }

  if (method === 'notifications/initialized') {
    // No-op, server is ready
    return null;
  }

  if (method === 'tools/list') {
    return { tools: toolDefinitions };
  }

  if (method === 'tools/call') {
    const toolName = params.name;
    const handler = tools[toolName];
    
    if (!handler) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    try {
      const result = await handler(params.arguments || {});
      return {
        content: [{ 
          type: 'text', 
          text: typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)
        }]
      };
    } catch (err) {
      throw new Error(err.message);
    }
  }

  throw new Error(`Unknown method: ${method}`);
}

// Set up stdio communication
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  crlfDelay: Infinity
});

for await (const line of rl) {
  let requestId = null;
  try {
    const req = JSON.parse(line.trim());

    // A JSON-RPC notification carries no id and expects no response.
    const isNotification = req.id === undefined;
    requestId = isNotification ? null : req.id;

    const result = await handleRequest(req.method, req.params, req.id);

    if (isNotification) continue;

    console.log(JSON.stringify({ jsonrpc: '2.0', id: requestId, result }));
  } catch (err) {
    if (requestId === null && err.name === 'SyntaxError') {
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' }
      }));
      continue;
    }

    console.log(JSON.stringify({
      jsonrpc: '2.0',
      id: requestId,
      error: {
        code: -32603,
        message: err.message || 'Internal error',
        data: { stack: err.stack }
      }
    }));
  }
}
