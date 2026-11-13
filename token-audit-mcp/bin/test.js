#!/usr/bin/env node
/**
 * End-to-end test for the token-audit MCP server.
 *
 * Keeps one server process alive for the whole session — the audit runs as a
 * background job inside the server, so each request must hit the same process.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const SERVER_PATH = resolve(__dirname, '../src/mcp-server.js');
const AUDIT_TARGET = resolve(PROJECT_ROOT, '../src');

const NODE_CMD = process.execPath;

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// --- Minimal MCP client over stdio ---------------------------------------

class McpClient {
  constructor(serverPath) {
    this.proc = spawn(NODE_CMD, [serverPath], { stdio: ['pipe', 'pipe', 'inherit'] });
    this.pending = new Map();
    this.buffer = '';
    this.nextId = 0;

    this.proc.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString();
      let index;
      while ((index = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, index).trim();
        this.buffer = this.buffer.slice(index + 1);
        if (!line) continue;
        const message = JSON.parse(line);
        const resolver = this.pending.get(message.id);
        if (resolver) {
          this.pending.delete(message.id);
          resolver(message);
        }
      }
    });
  }

  request(method, params) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, resolve);
      this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Timed out waiting for ${method}`));
        }
      }, 120000);
    });
  }

  async callTool(name, args) {
    const response = await this.request('tools/call', { name, arguments: args });
    if (response.error) {
      throw new Error(`${name} failed: ${response.error.message}`);
    }
    return JSON.parse(response.result.content[0].text);
  }

  close() {
    this.proc.kill('SIGTERM');
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Tests ---------------------------------------------------------------

console.log('🚀 token-audit MCP server — end-to-end test\n');
console.log(`   node:    ${NODE_CMD}`);
console.log(`   server:  ${SERVER_PATH}`);
console.log(`   target:  ${AUDIT_TARGET}\n`);

const client = new McpClient(SERVER_PATH);

try {
  console.log('[1] initialize');
  const init = await client.request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'token-audit-e2e', version: '1.0' }
  });
  check('server responds to initialize', Boolean(init.result && init.result.serverInfo),
    init.result ? `${init.result.serverInfo.name} v${init.result.serverInfo.version}` : '');

  console.log('\n[2] tools/list');
  const list = await client.request('tools/list', {});
  const tools = list.result.tools;
  const expected = [
    'audit_run', 'audit_findings', 'audit_summary', 'audit_html_report', 'audit_json',
    'job_status', 'export_tokens_studio', 'export_style_dictionary', 'export_dtcg',
    'export_tailwind', 'export_shadcn', 'audit_recommendations', 'list_jobs', 'delete_job'
  ];
  const missing = expected.filter((name) => !tools.some((t) => t.name === name));
  check(`all ${expected.length} tools registered`, missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : `${tools.length} tools`);
  check('every tool has an input schema', tools.every((t) => t.inputSchema && t.inputSchema.type === 'object'));

  console.log('\n[3] audit_run');
  const run = await client.callTool('audit_run', { target: AUDIT_TARGET, severity: 'warn' });
  check('returns a jobId', typeof run.jobId === 'string' && run.jobId.length > 0, run.jobId);
  check('reports running status', run.status === 'running');

  console.log('\n[4] job_status polling');
  let status = 'running';
  let waited = 0;
  while (status === 'running' && waited < 60000) {
    await sleep(500);
    waited += 500;
    status = (await client.callTool('job_status', { jobId: run.jobId })).status;
  }
  check('audit reaches a terminal state', status === 'complete' || status === 'failed',
    `${status} after ${(waited / 1000).toFixed(1)}s`);
  if (status === 'failed') {
    const failed = await client.callTool('job_status', { jobId: run.jobId });
    console.log(`     error: ${failed.error}`);
    throw new Error('audit failed');
  }

  console.log('\n[5] audit_summary');
  const summary = await client.callTool('audit_summary', { jobId: run.jobId });
  check('summary carries severity counts',
    typeof summary.summary.error === 'number' && typeof summary.summary.total === 'number',
    `${summary.summary.error} errors · ${summary.summary.warn} warnings · ${summary.summary.info} info`);

  console.log('\n[6] audit_findings');
  const findings = await client.callTool('audit_findings', { jobId: run.jobId });
  check('returns findings', Array.isArray(findings.findings), `${findings.total} findings`);
  const errorsOnly = await client.callTool('audit_findings', { jobId: run.jobId, severity: 'error' });
  check('severity filter works',
    errorsOnly.findings.every((f) => f.severity === 'error'),
    `${errorsOnly.findings.length} error-level`);

  console.log('\n[7] artifacts');
  const json = await client.callTool('audit_json', { jobId: run.jobId });
  check('JSON artifact exists', json.size_bytes > 0, `${json.size_bytes} bytes`);
  const html = await client.callTool('audit_html_report', { jobId: run.jobId });
  check('HTML report exists', html.size_bytes > 0, `${html.size_bytes} bytes`);

  console.log('\n[8] exports');
  for (const tool of ['export_tokens_studio', 'export_style_dictionary', 'export_dtcg', 'export_tailwind', 'export_shadcn']) {
    try {
      const result = await client.callTool(tool, { jobId: run.jobId });
      check(`${tool} writes an artifact`, Boolean(result.filePath), result.filePath);
    } catch (err) {
      check(`${tool} writes an artifact`, false, err.message);
    }
  }

  console.log('\n[9] audit_recommendations');
  const recs = await client.callTool('audit_recommendations', { jobId: run.jobId });
  check('returns recommendations', Array.isArray(recs.recommendations), `${recs.recommendations.length} suggestions`);

  console.log('\n[10] list_jobs');
  const jobs = await client.callTool('list_jobs', {});
  check('lists cached jobs', jobs.total >= 1, `${jobs.total} job(s)`);

  console.log('\n[11] error handling');
  const badResponse = await client.request('tools/call', {
    name: 'audit_summary',
    arguments: { jobId: 'not-a-real-job' }
  });
  check('unknown jobId returns a JSON-RPC error',
    Boolean(badResponse.error),
    badResponse.error ? badResponse.error.message : 'no error returned');
  check('error response carries a request id', badResponse.id !== null && badResponse.id !== undefined,
    `id=${badResponse.id}`);

  console.log('\n[12] delete_job');
  const deleted = await client.callTool('delete_job', { jobId: run.jobId });
  check('removes the job', deleted.deleted === true, `${deleted.freed_bytes || 0} bytes freed`);
} catch (err) {
  failed++;
  console.error(`\n❌ Fatal: ${err.message}`);
} finally {
  client.close();
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
