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
          patches: [{ file: 'tokens.css', type: 'delete', line: 2, before: '  --unused: #fff;', findingId: 'orphan' }]
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

test('MCP tools return the documented wrapper shapes', () => {
  const dir = makeProject(':root {\n  --bg: #ffffff;\n  --background: #ffffff;\n}\n.card {\n  background: var(--bg);\n}\n');
  const responses = rpc([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'polish_audit', arguments: { target: dir } } },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'polish_plan', arguments: { findings: [] } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'polish_diff', arguments: { plan: [] } } },
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'polish_apply', arguments: { patches: [], target: dir } } }
  ]);
  const unwrap = (id) => JSON.parse(responses.get(id).result.content[0].text);

  const audit = unwrap(2);
  assert.deepEqual(Object.keys(audit).sort(), ['findings', 'graphSummary', 'observation', 'summary'],
    'audit must return { findings, summary, graphSummary, observation }');
  assert.ok(audit.findings.some(f => f.id === 'duplicate-value'), 'audit should find the duplicate value');
  assert.equal(typeof audit.summary.findings, 'number', 'summary should carry findings counts');
  assert.ok(audit.summary.bySeverity, 'summary should break findings down by severity');
  assert.ok(audit.graphSummary, 'graphSummary should describe the scanned graph');

  const plan = unwrap(3);
  assert.deepEqual(Object.keys(plan).sort(), ['plan', 'summary'],
    'plan must return { plan, summary }');
  assert.ok(Array.isArray(plan.plan), 'plan.plan should be the action array');
  assert.ok(plan.summary.mechanical >= 1 || plan.summary.total === 0, 'summary should classify actions');

  const diff = unwrap(4);
  assert.deepEqual(Object.keys(diff).sort(), ['patches', 'preview'],
    'diff must return { patches, preview }');
  assert.ok(Array.isArray(diff.patches), 'diff.patches should be the patch array');
  assert.equal(typeof diff.preview, 'string', 'diff should include a preview');

  const apply = unwrap(5);
  assert.deepEqual(Object.keys(apply).sort(), ['applied', 'backupCount', 'backups', 'failed', 'rolledBack', 'status'],
    'apply must return { status, applied, failed, backupCount, backups, rolledBack }');
  assert.ok(Array.isArray(apply.backups), 'apply should return a backups manifest');
  assert.ok(Array.isArray(apply.rolledBack), 'apply should report auto-rolled-back files');
  assert.ok(['applied', 'aborted', 'rolledBack'].includes(apply.status), 'apply should report a final run status');

  cleanup();
});

test('polish_rollback schema requires backups and target', () => {
  const responses = rpc([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' }
  ]);
  const tools = responses.get(2).result.tools;
  const rbTool = tools.find(t => t.name === 'polish_rollback');
  assert.ok(rbTool, 'polish_rollback tool should exist');
  assert.deepEqual(rbTool.inputSchema.required, ['backups', 'target'],
    'rollback must require backups and target');
});

test('MCP polish_rollback restores files from an apply run manifest', () => {
  const dir = makeProject(':root {\n  --bg: #ffffff;\n  --background: #ffffff;\n}\n');
  const apply = rpc([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: {
        name: 'polish_apply',
        arguments: {
          target: dir,
          patches: [{ file: 'tokens.css', type: 'replace', line: 3, before: '#ffffff', after: 'var(--bg)', findingId: 'duplicate-value' }]
        }
      }
    }
  ]);
  const applyReport = JSON.parse(apply.get(2).result.content[0].text);
  assert.equal(applyReport.backups.length, 1, 'apply should produce a backup manifest');
  assert.ok(fs.readFileSync(path.join(dir, 'tokens.css'), 'utf8').includes('var(--bg)'), 'file should be modified');

  const rb = rpc([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: {
        name: 'polish_rollback',
        arguments: { target: dir, backups: applyReport.backups }
      }
    }
  ]);
  const rbReport = JSON.parse(rb.get(2).result.content[0].text);
  assert.equal(rbReport.restored.length, 1, 'rollback should restore the file');
  assert.equal(rbReport.failed.length, 0, `rollback should not fail: ${JSON.stringify(rbReport.failed)}`);

  const content = fs.readFileSync(path.join(dir, 'tokens.css'), 'utf8');
  assert.ok(content.includes('--background: #ffffff;'), 'restored file should hold original content');
  cleanup();
});

test('MCP polish_rollback without target returns a protocol error', () => {
  const responses = rpc([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'polish_rollback', arguments: { backups: [] } }
    }
  ]);
  const call = responses.get(2);
  assert.ok(call.error, 'missing target should be a JSON-RPC error');
  assert.equal(call.error.code, -32603, 'handler errors surface as internal error');
});

test('MCP wire-level round trip applies mechanical patches chained from audit', () => {
  const dir = makeProject(':root {\n  --bg: #ffffff;\n  --background: #ffffff;\n}\n.card {\n  background: var(--bg);\n}\n');
  // Chain in two batches: the audit result feeds the plan, the plan feeds the diff.
  const first = rpc([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'polish_audit', arguments: { target: dir } } }
  ]);
  const audit = JSON.parse(first.get(2).result.content[0].text);

  const second = rpc([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'polish_plan', arguments: { findings: audit.findings } } }
  ]);
  const plan = JSON.parse(second.get(2).result.content[0].text);

  const third = rpc([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'polish_diff', arguments: { plan: plan.plan, target: dir } } }
  ]);
  const diff = JSON.parse(third.get(2).result.content[0].text);
  assert.ok(diff.patches.length >= 1, 'diff should generate at least one mechanical patch');
  assert.ok(diff.preview.length > 0, 'preview should summarize the generated patches');

  const fourth = rpc([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'polish_apply', arguments: { patches: diff.patches, target: dir } } }
  ]);
  const apply = JSON.parse(fourth.get(2).result.content[0].text);
  assert.equal(apply.applied.length, diff.patches.length, 'all patches should apply');
  assert.equal(apply.failed.length, 0, `no patch should fail: ${JSON.stringify(apply.failed)}`);
  assert.equal(apply.backupCount, 1, 'file should be backed up once');

  const content = fs.readFileSync(path.join(dir, 'tokens.css'), 'utf8');
  assert.ok(content.includes('var(--bg)'), 'secondary token should be aliased to the primary');
  cleanup();
});

test('polish_apply schema uses the documented patch vocabulary (no rename)', () => {
  const responses = rpc([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' }
  ]);
  const tools = responses.get(2).result.tools;
  const applyTool = tools.find(t => t.name === 'polish_apply');
  const typeEnum = applyTool.inputSchema.properties.patches.items.properties.type.enum;
  assert.deepEqual(typeEnum.sort(), ['add', 'delete', 'replace', 'rewrite'],
    `patch vocabulary must be replace/add/delete/rewrite, got ${JSON.stringify(typeEnum)}`);
});

test('MCP polish_apply rejects a delete patch without before', () => {
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
  const report = JSON.parse(call.result.content[0].text);
  assert.equal(report.applied.length, 0, 'delete without before must not apply');
  assert.equal(report.failed.length, 1, 'delete without before should be recorded as failed');
  assert.ok(report.failed[0].error.includes('before'), 'failure should explain the missing before text');
  const content = fs.readFileSync(path.join(dir, 'tokens.css'), 'utf8');
  assert.ok(content.includes('--unused'), 'file must be unchanged');
  cleanup();
});

test('MCP polish_audit echoes the observation it received', () => {
  const dir = makeProject(':root {\n  --primary: #4f46e5;\n}\n.card {\n  color: var(--primary);\n}\n');
  const observation = {
    documents: [
      { label: 'page-a', theme: 'light', variables: { '--primary': '#4f46e5' } },
      { label: 'page-b', theme: 'light', variables: { '--primary': '#ff0000' } }
    ]
  };
  const responses = rpc([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'polish_audit', arguments: { target: dir, observation } }
    }
  ]);
  const call = responses.get(2);
  const audit = JSON.parse(call.result.content[0].text);
  assert.deepEqual(audit.observation, observation, 'audit should echo the observation data');
  assert.ok(audit.findings.some(f => f.id === 'runtime-drift'), 'runtime-drift should be detected');
  cleanup();
});

test('MCP tools/list advertises an outputSchema for every tool', () => {
  const responses = rpc([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' }
  ]);
  const tools = responses.get(2).result.tools;
  assert.equal(tools.length, 9, `expected 9 tools, got ${tools.length}`);
  for (const t of tools) {
    assert.ok(t.outputSchema, `${t.name} should carry an outputSchema`);
    assert.equal(t.outputSchema.type, 'object', `${t.name} outputSchema should be an object`);
  }
});

test('MCP tools/call returns structuredContent that matches the text payload', () => {
  const dir = makeProject(':root {\n  --bg: #ffffff;\n  --background: #ffffff;\n}\n');
  const responses = rpc([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'polish_audit', arguments: { target: dir } } },
    {
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'polish_extract', arguments: { target: dir } }
    }
  ]);
  for (const id of [2, 3]) {
    const call = responses.get(id);
    assert.ok(call.result.structuredContent, `call ${id} should include structuredContent`);
    const fromText = JSON.parse(call.result.content[0].text);
    assert.deepEqual(call.result.structuredContent, fromText,
      `structuredContent should equal the parsed text content for call ${id}`);
  }
  cleanup();
});

test('MCP polish_apply schema requires before for delete and rewrite patch types', () => {
  const responses = rpc([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' }
  ]);
  const tools = responses.get(2).result.tools;
  const applyTool = tools.find(t => t.name === 'polish_apply');
  const conditionals = applyTool.inputSchema.properties.patches.items.allOf;
  assert.ok(conditionals, 'patches items should carry conditional allOf rules');
  for (const rule of conditionals) {
    const typeConst = rule.if.properties.type.const;
    assert.ok(['delete', 'rewrite'].includes(typeConst), `unexpected conditional type ${typeConst}`);
    assert.ok(rule.then.required.includes('before'), `${typeConst} must require before`);
  }
});

test('MCP polish_apply outputSchema documents the transactional status field', () => {
  const responses = rpc([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' }
  ]);
  const tools = responses.get(2).result.tools;
  const applyTool = tools.find(t => t.name === 'polish_apply');
  assert.deepEqual(applyTool.outputSchema.properties.status.enum.sort(),
    ['aborted', 'applied', 'rolledBack']);
  assert.ok(applyTool.outputSchema.required.includes('status'), 'status is required in the apply output');
  assert.ok(applyTool.outputSchema.required.includes('backups'), 'backups is required in the apply output');
});

