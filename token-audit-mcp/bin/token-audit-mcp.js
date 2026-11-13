#!/usr/bin/env node
/**
 * token-audit MCP Server CLI Entry Point
 * 
 * Usage:
 *   token-audit-mcp                 # Start server (stdio mode)
 *   npm run test:e2e               # Run E2E tests
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = resolve(__dirname, '../src/mcp-server.js');

// Spawn MCP server with stdio transport
const proc = spawn('node', [SERVER_PATH], {
  stdio: ['pipe', 'pipe', 'inherit']
});

proc.stdout.pipe(process.stdout);
proc.stderr.pipe(process.stderr);

process.on('SIGINT', () => {
  proc.kill('SIGTERM');
  process.exit(0);
});

process.on('SIGTERM', () => {
  proc.kill('SIGTERM');
  process.exit(0);
});
