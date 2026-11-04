# polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build polish — a design token superpower tool that closes the loop by taking audit findings and applying mechanical rewrites and agent-driven creative fixes.

**Architecture:** Single npm package sharing one core engine across three interfaces — CLI, MCP server, and SKILL.md. Core engine has 5 modules: scan.js (reuse token-audit), cross.js (reuse), plan.js (new), diff.js (new), apply.js (new). Dependencies are external (dembrandt, taste, awesome-design-md, impeccable) referenced but not bundled.

**Tech Stack:** Node.js >=18, MCP stdio transport, plain JavaScript (ESM + CommonJS), Playwright for runtime measurement.

**Spec:** [docs/superpowers/specs/2026-11-04-polish-design.md](file:///Users/dengzhou/Desktop/08-Noah-Project/03-AI%20AI/page-enhanced/Noah%20mind%202.0/docs/superpowers/specs/2026-11-04-polish-design.md)

## Global Constraints

- Node.js >=18
- dembrandt must be installed externally via `npm install -g dembrandt`
- taste skill must be installed externally via `npx skills add Leonxlnx/taste-skill`
- awesome-design-md and impeccable must be installed as skill folders in `~/.qoder/skills/`
- MCP tools are stateless and must complete in <15 seconds unless they launch a browser (measure.js, ~5-13s per page)
- CLI exit codes: 0=no errors, 1=has errors, 2=execution failed
- All new code is ES modules; existing token-audit remains CommonJS

---

## Phase 1 — plan.js + diff.js + MCP plan/diff tools

### Task 1: Setup project structure

**Files:**
- Create: `polish/package.json`
- Create: `polish/src/plan.js`
- Create: `polish/src/diff.js`
- Create: `polish/src/index.js`
- Test: `polish/test/run.js`

**Interfaces:**
- Consumes: nothing yet (setup only)
- Produces: `plan.js` exports `plan(findings)` → ordered action list; `diff.js` exports `generateDiffs(plan)` → patches array

- [ ] **Step 1: Write package.json**

```json
{
  "name": "polish",
  "version": "0.1.0",
  "description": "Design token superpower tool: extract · critique · apply",
  "type": "module",
  "bin": {
    "polish": "./bin/polish.mjs"
  },
  "main": "src/index.js",
  "files": ["bin", "src", "README.md"],
  "engines": { "node": ">=18" }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cat polish/package.json`
Expected: file exists with above structure

- [ ] **Step 3: Write minimal plan.js skeleton**

```javascript
// src/plan.js
export function plan(findings) {
  // Placeholder - will implement full logic later
  return [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cat polish/src/plan.js`
Expected: function exports successfully

- [ ] **Step 5: Commit**

```bash
git add polish/package.json polish/src/plan.js
git commit -m "chore: scaffold polish project structure"
```

---

### Task 2: Implement plan.js ranking logic

**Files:**
- Modify: `polish/src/plan.js`

**Interfaces:**
- Consumes: `findings` array with `{id, severity}` fields (from cross.js)
- Produces: ordered action list `[{finding, action, type, priority}]`

- [ ] **Step 1: Write the failing test**

```javascript
// test/run.js
test('plan: ranks findings by PRIORITY_ORDER', () => {
  const findings = [
    { id: 'conflict', severity: 'error' },
    { id: 'hardcoded', severity: 'info' },
    { id: 'dangling', severity: 'error' }
  ];
  const result = plan(findings);
  // Conflict should be rank 1, dangling rank 2, hardcoded rank 7
  assert.strictEqual(result[0].finding.id, 'conflict');
  assert.strictEqual(result[1].finding.id, 'dangling');
  assert.strictEqual(result[2].finding.id, 'hardcoded');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd polish && node test/run.js 2>&1 | head -20`
Expected: FAIL with "plan not implemented" or similar

- [ ] **Step 3: Write minimal implementation**

```javascript
// plan.js
const PRIORITY_ORDER = [
  ['conflict', 1], ['dangling', 2], ['runtime-drift', 3], ['orphan', 4],
  ['duplicate-value', 5], ['namespace', 6], ['hardcoded', 7],
  ['cascade-override', 8], ['state-variation', 9], ['theme-variation', 10],
  ['dynamic-variable', 11]
];

export function plan(findings) {
  const rankMap = new Map(PRIORITY_ORDER);
  const sorted = [...findings].sort((a, b) => {
    const ra = rankMap.get(a.id) || 999;
    const rb = rankMap.get(b.id) || 999;
    return ra - rb;
  });
  return sorted.map(f => ({
    finding: f,
    action: f.severity === 'error' ? 'fix' : f.severity === 'warn' ? 'review' : 'note',
    type: f.severity === 'error' ? 'critical' : 'warning',
    priority: rankMap.get(f.id) || 999
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd polish && node test/run.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add polish/src/plan.js
git commit -m "feat: implement plan ranking with PRIORITY_ORDER"
```

---

### Task 3: Implement plan.js mechanical/judgmental split

**Files:**
- Modify: `polish/src/plan.js`

**Interfaces:**
- Consumes: findings with `id` field matching cross.js types
- Produces: adds `mechanical` boolean to each action item

- [ ] **Step 1: Write the failing test**

```javascript
test('plan: marks mechanical vs judgmental items', () => {
  const findings = [
    { id: 'hardcoded', severity: 'error' },
    { id: 'conflict', severity: 'error' },
    { id: 'dangling', severity: 'error' }
  ];
  const result = plan(findings);
  // hardcoded is mechanical, conflict is mechanical, dangling needs clarification
  assert.strictEqual(result.find(r => r.finding.id === 'hardcoded').mechanical, true);
  assert.strictEqual(result.find(r => r.finding.id === 'conflict').mechanical, true);
  assert.strictEqual(result.find(r => r.finding.id === 'dangling').mechanical, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd polish && node test/run.js 2>&1 | grep -A2 "mechanical"`
Expected: assertion error on line checking .mechanical

- [ ] **Step 3: Write minimal implementation**

```javascript
// plan.js (append to existing plan function)
const MECHANICAL_IDS = new Set(['hardcoded', 'conflict', 'duplicate-value', 'cascade-override', 'namespace']);
const JUDGMENTAL_IDS = new Set(['dangling', 'runtime-drift', 'orphan', 'typography', 'layout', 'spacing', 'colorize', 'bolder', 'adapt']);

export function plan(findings) {
  // ... (existing ranking code above) ...
  return sorted.map(f => {
    const mech = MECHANICAL_IDS.has(f.id);
    const judg = JUDGMENTAL_IDS.has(f.id);
    const type = mech ? 'mechanical' : judg ? 'judgmental' : 'unknown';
    return {
      finding: f,
      action: f.severity === 'error' ? 'fix' : f.severity === 'warn' ? 'review' : 'note',
      type,
      priority: rankMap.get(f.id) || 999,
      mechanical: mech,
      judgmental: judg
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd polish && node test/run.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add polish/src/plan.js
git commit -m "feat: add mechanical/judgmental classification to plan"
```

---

### Task 4: Implement diff.js patch generation

**Files:**
- Create: `polish/src/diff.js`

**Interfaces:**
- Consumes: `plan` array with `mechanical` items
- Produces: `[{type, file, line, before, after, reason, findingId}]`

- [ ] **Step 1: Write the failing test**

```javascript
test('diff: generates replace patch for hardcoded color', () => {
  const plan = [{
    finding: { id: 'hardcoded', severity: 'error', title: '#fff should use token' },
    mechanical: true
  }];
  const diffs = generateDiffs(plan);
  assert.ok(diffs.length > 0);
  assert.strictEqual(diffs[0].type, 'replace');
  assert.ok(diffs[0].before.includes('#fff'));
  assert.ok(diffs[0].after.includes('var(--'))
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd polish && node test/run.js 2>&1 | grep -A2 "not defined"`
Expected: TypeError: generateDiffs is not defined

- [ ] **Step 3: Write minimal implementation**

```javascript
// diff.js
export function generateDiffs(plan) {
  const patches = [];
  const mechItems = plan.filter(p => p.mechanical);
  
  for (const item of mechItems) {
    switch (item.finding.id) {
      case 'hardcoded':
        patches.push({
          type: 'replace',
          reason: item.finding.title,
          findingId: item.finding.id
        });
        break;
      case 'conflict':
        patches.push({
          type: 'rewrite',
          reason: `Replace conflicting value with canonical`,
          findingId: item.finding.id
        });
        break;
      default:
        patches.push({
          type: 'replace',
          reason: item.finding.title,
          findingId: item.finding.id
        });
    }
  }
  return patches;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd polish && node test/run.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add polish/src/diff.js
git commit -m "feat: implement diff.js basic patch generation"
```

---

### Task 5: Add MCP plan/diff tools

**Files:**
- Create: `polish-mcp/src/handlers/audit-plan.js`
- Create: `polish-mcp/src/handlers/audit-diff.js`
- Modify: `polish-mcp/src/mcp-server.js`

**Interfaces:**
- Consumes: same input format as token-audit MCP handlers
- Produces: JSON responses compatible with MCP tool schema

- [ ] **Step 1: Write audit-plan handler**

```javascript
// mcp/server/handlers/audit-plan.js
/**
 * Handle audit_plan tool call.
 * Convert findings into ordered, classified action list.
 * @param {object} params - Tool parameters
 * @param {Array} params.findings - Findings array from cross.js
 * @param {object} deps - Dependencies
 * @returns {Promise<{plan: Array, summary: object}>}
 */
export async function audit_plan(params, deps) {
  const { plan } = await import('polish/src/plan.js');
  const actions = plan(params.findings);
  const summary = {
    total: actions.length,
    mechanical: actions.filter(a => a.mechanical).length,
    judgmental: actions.filter(a => a.judgmental).length,
    topPriority: actions.slice(0, 5)
  };
  return { plan: actions, summary };
}
```

- [ ] **Step 2: Write audit-diff handler**

```javascript
// mcp/server/handlers/audit-diff.js
/**
 * Handle audit_diff tool call.
 * Generate mechanical patches for a plan.
 * @param {object} params - Tool parameters
 * @param {Array} params.plan - Plan array from audit_plan
 * @param {object} deps - Dependencies
 * @returns {Promise<{patches: Array, preview: string}>}
 */
export async function audit_diff(params, deps) {
  const { generateDiffs } = await import('polish/src/diff.js');
  const patches = generateDiffs(params.plan);
  const preview = patches.slice(0, 10).map(p => `${p.type}: ${p.reason}`).join('\n');
  return { patches, preview };
}
```

- [ ] **Step 3: Register tools in mcp-server.js**

Append to tools registry (follow token-audit MCP pattern):

```javascript
tools['audit_plan'] = async (args) => {
  return await audit_plan(args, { store, cacheDir: CACHE_DIR });
};

tools['audit_diff'] = async (args) => {
  return await audit_diff(args, { store, cacheDir: CACHE_DIR });
};
```

- [ ] **Step 4: Test MCP registration**

Run: `grep -A2 "audit_plan\|audit_diff" polish-mcp/src/mcp-server.js`
Expected: both functions registered in tools object

- [ ] **Step 5: Commit**

```bash
git add polish-mcp/src/handlers/audit-plan.js polish-mcp/src/handlers/audit-diff.js polish-mcp/src/mcp-server.js
git commit -m "feat: add MCP audit_plan and audit_diff tools"
```

---

## Phase 2 — apply.js + CLI apply command

### Task 6: Implement apply.js with backup protection

**Files:**
- Create: `polish/src/apply.js`

**Interfaces:**
- Consumes: `[{type, file, line, before, after, reason}]` patches
- Produces: `appliedCount, failedCount, backupPaths[]`

- [ ] **Step 1: Write the failing test**

```javascript
test('apply: backs up file before modifying', async () => {
  const tmpFile = '/tmp/test.css';
  fs.writeFileSync(tmpFile, '--a:#fff;');
  const patches = [{
    type: 'replace',
    file: tmpFile,
    line: 1,
    before: '#fff',
    after: 'var(--token)',
    reason: 'hardcoded'
  }];
  const result = await apply(patches);
  assert.ok(fs.existsSync(tmpFile + '.backup.css'));
  fs.unlinkSync(tmpFile);
  fs.unlinkSync(tmpFile + '.backup.css');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd polish && node test/run.js 2>&1 | head -5`
Expected: apply not defined

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/apply.js
import fs from 'fs/promises';

export async function apply(patches) {
  const applied = [];
  const failed = [];
  
  for (const patch of patches) {
    try {
      const content = await fs.readFile(patch.file, 'utf8');
      const lines = content.split('\n');
      const original = lines[patch.line - 1];
      
      // Backup
      const backupPath = patch.file + '.backup.css';
      await fs.copyFile(patch.file, backupPath);
      
      // Apply
      lines[patch.line - 1] = original.replace(patch.before, patch.after);
      await fs.writeFile(patch.file, lines.join('\n'));
      
      applied.push({ file: patch.file, line: patch.line });
    } catch (e) {
      failed.push({ file: patch.file, error: e.message });
    }
  }
  
  return { applied, failed, backupCount: applied.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd polish && node test/run.js 2>&1 | tail -5`
Expected: PASS for backup test

- [ ] **Step 5: Commit**

```bash
git add polish/src/apply.js
git commit -m "feat: implement apply.js with backup protection"
```

---

### Task 7: Add CLI apply command

**Files:**
- Create: `polish/bin/polish.mjs`

**Interfaces:**
- Consumes: CLI args `polish apply <file>`
- Produces: stdout apply report

- [ ] **Step 1: Write CLI skeleton**

```javascript
#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));

console.log(`${pkg.name} v${pkg.version}`);
console.log('Usage: polish apply <file>');
process.exit(2);
```

- [ ] **Step 2: Implement apply subcommand**

```javascript
#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync, writeFileSync } from 'fs';

const USAGE = `polish — Design token superpower tool

Usage:
  polish apply <file>   Execute mechanical patches with backup

Exit codes:
  0 - success
  1 - execution failed`;

const args = process.argv.slice(2);
if (args[0] !== 'apply') {
  console.log(USAGE);
  process.exit(2);
}

const filePath = resolve(args[1]);
console.log(`Applying to: ${filePath}`);
// Load patches from plan.json if exists
// Call apply.js
// Print summary
```

- [ ] **Step 3: Test CLI help**

Run: `node polish/bin/polish.mjs`
Expected: Usage message displayed

- [ ] **Step 4: Commit**

```bash
git add polish/bin/polish.mjs
git commit -m "feat: add CLI apply subcommand"
```

---

## Phase 3 — Skill integration (page-polish + wrappers)

### Task 8: Create page-polish SKILL.md

**Files:**
- Create: `polish/page-polish.SKILL.md`

**Content:** Full orchestration workflow following spec Section 7. Tells agent when to call MCP tools, when to delegate to skill sub-commands, how to gather context per impeccable requirements.

- [ ] **Step 1: Write SKILL.md header**

```markdown
---
name: page-polish
description: Orchestrates the full polish pipeline: extract → critique → plan → diff → apply. Splits work between mechanical fixes (MCP tools) and creative fixes (impeccable sub-commands).
---

# page-polish — Full pipeline orchestration

## When to Activate

- User says "polish this page", "enhance the design tokens", "make it look like X"
- After running token-audit or polished output, user wants fixes applied
- Agent needs to choose style target (awesome-design-md) or enforce design rules (taste)

## Core Workflow

1. Call polish_extract → get token graph
2. Call polish_audit → get findings
3. Present findings to user, ask which to fix
4. Call polish_plan → get ordered action list
5. Call polish_diff → get mechanical patches
6. Call polish_apply → execute mechanical fixes
7. For judgmental items:
   a. Gather design context (audience, use cases, brand personality)
   b. If style target requested: call polish_style_lookup
   c. Invoke appropriate impeccable sub-command
   d. Apply creative fix
8. Run polish_audit again → verify fixes
9. Present before/after summary
```

- [ ] **Step 2: Add dependency documentation**

Add section documenting how to access dependencies:
- dembrandt location check
- taste skill path (`~/.qoder/skills/taste/`)
- awesome-design-md references
- impeccable sub-command mapping

- [ ] **Step 3: Commit**

```bash
git add polish/page-polish.SKILL.md
git commit -m "docs: create page-polish orchestration skill"
```

---

### Task 9: Create wrapper skills for taste, awesome-design-md, impeccable

**Files:**
- Create: `polish/wrappers/taste-with-polish.SKILL.md`
- Create: `polish/wrappers/awesome-design-md-with-polish.SKILL.md`
- Create: `polish/wrappers/impeccable-with-polish.SKILL.md`

**Content:** Each wraps the upstream skill with polish-specific context injection — tells the agent "you're running inside polish, here's what the audit found, here's what to fix."

- [ ] **Step 1: Write taste-with-polish wrapper**

```markdown
---
name: taste-with-polish
inherits: taste
context: polish-audit-findings
---

# taste-with-polish

This is the taste skill enhanced with polish context. You are running inside the polish pipeline.

## Context Injection

The user has run token-audit / polish audit and found issues. Your job is to:
- Enforce design rules against those issues
- Prevent AI slop in typography, spacing, color, layout, motion
- Choose extreme design direction rather than safe defaults

## Available Audit Findings

When you receive {{auditFindings}}, focus on:
- Typography hierarchy issues → use taste typography rules
- Spacing inconsistencies → use taste spatial design rules
- Color palette problems → use taste color system rules
```

- [ ] **Step 2: Write impeccible-with-polish wrapper**

```markdown
---
name: impeccable-with-polish
inherits: impeccable
context: polish-audit-findings
---

# impeccable-with-polish

This is the impeccable skill enhanced with polish context. You are running inside the polish pipeline.

## Context Injection

You have specific audit findings to address. Before any creative work:
1. Collect design context (impeccable requirement): audience, use cases, brand personality
2. Identify which finding types need which sub-command
3. Apply sub-commands systematically

## Sub-command Mapping

- Typographic issues → typeset
- Layout/spacing issues → arrange
- Visual polish needed → bolder or polish
- Responsive fixes needed → adapt
```

- [ ] **Step 3: Commit**

```bash
git add polish/wrappers/*.SKILL.md
git commit -m "docs: create wrapped skills with polish context injection"
```

---

## Verification Checklist

Before considering polish MVP complete:

- [ ] `polish plan` generates ordered action list from findings
- [ ] `polish diff` generates mechanical patches (preview only)
- [ ] `polish apply <file>` executes patches with backup
- [ ] `polish doctor` reports which dependencies are installed
- [ ] MCP tools `audit_plan` and `audit_diff` work correctly
- [ ] `page-polish` SKILL.md guides agent through full workflow
- [ ] Wrapper skills properly inject polish context

## Optional Enhancements (post-MVP)

- Add `polish polish` full-loop CLI command
- Integrate runtime measurement (`measure.js`) for drift detection
- Add web-based before/after UI
- Support export formats (DTCG, Style Dictionary, Tailwind)
