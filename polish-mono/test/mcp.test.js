import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = path.join(__dirname, '.mcp-tmp');
const SERVER = path.resolve(__dirname, '../src/mcp-server.js');
const NODE = process.execPath;

function makeProject(cssContent) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const file = path.join(TMP_DIR, 'tokens.css');
  fs.writeFileSync(file, cssContent, 'utf8');
  return TMP_DIR;
}

function cleanup() {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
}

/** Start the MCP server over stdio, send JSON-RPC lines, return responses by id. */
function rpc(messages) {
  const input = messages.map(m => JSON.stringify(m)).join('\n') + '\n';
  const result = spawnSync(NODE, [SERVER], { input, encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 0, `MCP server should exit cleanly: ${result.stderr}`);
  const responses = new Map();
  for (const line of result.stdout.split('\n')) {
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined) responses.set(msg.id, msg);
  }
  return responses;
}

test('polish_apply schema advertises delete, not remove, as a patch type', () => {
  const responses = rpc([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' }
  ]);
  const tools = responses.get(2).result.tools;
  const applyTool = tools.find(t => t.name === 'polish_apply');
  assert.ok(applyTool, 'polish_apply tool should exist');
  const typeEnum = applyTool.inputSchema.properties.patches.items.properties.type.enum;
  assert.ok(typeEnum.includes('delete'), `patch type enum should include delete, got ${JSON.stringify(typeEnum)}`);
  assert.ok(!typeEnum.includes('remove'), `patch type enum should not include remove, got ${JSON.stringify(typeEnum)}`);
});

test('MCP initialize returns server info', () => {
  const responses = rpc([{ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }]);
  const init = responses.get(1).result;
  assert.equal(init.serverInfo.name, 'polish');
  assert.ok(init.serverInfo.version, 'server info should include a version');
  assert.ok(init.capabilities.tools, 'should advertise tools capability');
});

test('MCP polish_apply executes a delete patch end-to-end', () => {
  const dir = makeProject(':root {\n  --unused: #fff;\n  --primary: #4f46e5;\n}\n');
  const responses = rpc([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: {
        name: 'polish_apply',
        arguments: {
          target: dir,
          patches: [{ file: 'tokens.css', type: 'delete', line: 2, findingId: 'orphan' }]
        }
      }
    }
  ]);
  const call = responses.get(2);
  assert.ok(call.result, `apply should succeed: ${JSON.stringify(call)}`);
  const report = JSON.parse(call.result.content[0].text);
  assert.equal(report.applied.length, 1, 'delete patch should be applied');
  assert.equal(report.failed.length, 0, `delete patch should not fail: ${JSON.stringify(report.failed)}`);
  assert.equal(report.backupCount, 1, 'file should be backed up');

  const content = fs.readFileSync(path.join(dir, 'tokens.css'), 'utf8');
  assert.ok(!content.includes('--unused'), 'deleted token should be gone');
  assert.ok(content.includes('--primary'), 'other tokens should remain');
  const backup = fs.readFileSync(path.join(dir, 'tokens.css.backup'), 'utf8');
  assert.ok(backup.includes('--unused'), 'backup should hold the original content');
  cleanup();
});

test('MCP polish_apply rejects patches outside the target directory', () => {
  const dir = makeProject(':root {\n  --primary: #4f46e5;\n}\n');
  const responses = rpc([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: {
        name: 'polish_apply',
        arguments: {
          target: dir,
          patches: [{ file: '/etc/passwd', type: 'replace', line: 1, before: 'x', after: 'y' }]
        }
      }
    }
  ]);
  const call = responses.get(2);
  assert.ok(call.result, `boundary rejection is a tool result, not a protocol error`);
  const report = JSON.parse(call.result.content[0].text);
  assert.equal(report.applied.length, 0, 'out-of-bounds patch must not apply');
  assert.equal(report.failed.length, 1, 'out-of-bounds patch should be recorded as failed');
  assert.ok(report.failed[0].error.includes('outside target directory'), 'failure should explain the boundary violation');
  cleanup();
});

test('MCP polish_apply without target returns a protocol error', () => {
  const responses = rpc([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'polish_apply', arguments: { patches: [] } }
    }
  ]);
  const call = responses.get(2);
  assert.ok(call.error, 'missing target should be a JSON-RPC error');
  assert.equal(call.error.code, -32603, 'handler errors surface as internal error');
  cleanup();
});
