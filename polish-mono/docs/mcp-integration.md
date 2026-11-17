# MCP Integration Guide

polish exposes 8 tools via the Model Context Protocol (JSON-RPC 2.0 over stdin/stdout). Any AI coding agent that supports MCP can drive the full audit → fix pipeline.

## Setup

Add to your MCP configuration (`mcp.json`, `.mcp.json`, or your agent's config):

```json
{
  "mcpServers": {
    "polish": {
      "command": "polish",
      "args": ["mcp"]
    }
  }
}
```

If `polish` is not on PATH:

```json
{
  "mcpServers": {
    "polish": {
      "command": "npx",
      "args": ["-y", "polish-design-tokens", "mcp"]
    }
  }
}
```

## Tools

### `polish_extract`

Extract token declarations from a directory.

**Input:**
```json
{ "target": "./src/styles", "ignore": "vendor" }
```

**Output:** `DeclarationGraph` — declarations, references, conflicts, dangling, orphans, summary.

**Use when:** You need the raw token graph without findings. Useful for understanding what tokens exist before running a full audit.

---

### `polish_audit`

Scan + cross-reference to produce findings.

**Input:**
```json
{ "target": "./src/styles", "ignore": "vendor" }
```

With runtime observation:
```json
{
  "target": "./src/styles",
  "observation": {
    "documents": [
      { "label": "dashboard", "theme": "light", "variables": { "--accent": "#e05800" } }
    ]
  }
}
```

**Output:** `AuditReport` — findings sorted by severity, with summary counts.

**Use when:** You need to know what's wrong with a project's tokens. This is the main entry point for the audit phase.

---

### `polish_measure`

Normalize runtime observation data for audit.

**Input:**
```json
{
  "documents": [
    { "label": "dashboard", "theme": "light", "variables": { "--accent": "#e05800" } },
    { "label": "settings", "theme": "light", "variables": { "--accent": "#ff6600" } }
  ]
}
```

**Output:** `RuntimeObservation` — `{ documents: [...] }`

**Use when:** You have runtime data from browser DevTools and want to feed it into `polish_audit`. The data is normalized to handle alternative field names (`page`, `url`, `name` for `label`; `mode` for `theme`; `resolved`, `values` for `variables`).

---

### `polish_plan`

Convert findings to a ranked, classified action queue.

**Input:**
```json
{ "findings": [ { "id": "dangling", "severity": "error", "title": "...", "detail": "...", "evidence": [], "suggestion": "..." } ] }
```

**Output:** `PlanAction[]` — sorted by priority. Each action has `type` (mechanical/judgmental), `priority`, `action` (fix/review/note), and the original finding.

**Use when:** After `polish_audit`, before generating patches. Classifies what can be auto-fixed vs. what needs human judgment.

---

### `polish_diff`

Generate mechanical patches from a plan.

**Input:**
```json
{ "plan": [ { "finding": {...}, "action": "fix", "type": "mechanical", "priority": 2 } ] }
```

**Output:** `Patch[]` — only mechanical items produce patches. Each patch has `type`, `file`, `line`, `before`, `after`, `reason`, `findingId`.

**Use when:** After `polish_plan`, to get concrete patches for mechanical fixes.

---

### `polish_apply`

Execute patches with backup protection.

**Input:**
```json
{ "patches": [ { "type": "replace", "file": "src/tokens.css", "line": 12, "before": "#1a1a2e", "after": "var(--bg)", "reason": "...", "findingId": "duplicate-value" } ] }
```

**Output:** `ApplyResult` — `{ applied: [...], failed: [...], backupCount: N }`

**Safety:** Each file is backed up as `file.backup` before the first patch touches it. Failed patches don't abort the batch.

**Use when:** After `polish_diff`, to apply the generated patches. This is the only phase that modifies files.

---

### `polish_doctor`

Check required and optional dependencies.

**Input:**
```json
{ "target": "./src/styles" }
```

**Output:** Health check report — confirms Node.js version, MCP server status, and whether optional tools (like the design-md skill) are available.

**Use when:** Troubleshooting setup issues, or verifying the environment before running the pipeline.

---

### `polish_style_lookup`

Find design tokens by brand name or pattern.

**Input:**
```json
{ "brand": "vercel" }
```

**Output:** Brand design token reference (colors, typography, spacing, radius) with `source` field indicating whether it came from the external skill or bundled data.

**Bundled brands:** vercel, stripe, linear, notion, anthropic, github, shadcn, figma.

**Use when:** You need design token references for a specific brand to guide your token naming or values. Works without any external skill installed — falls back to bundled data automatically.

## Typical Workflow

```
1. polish_audit(target)           → AuditReport with findings
2. polish_plan(findings)          → PlanAction[] (ranked)
3. polish_diff(plan)              → Patch[] (mechanical only)
4. polish_apply(patches)          → ApplyResult (files modified + backups)
```

For runtime-aware audits, insert `polish_measure` between step 1 and 2 to provide observation data.

## Error Handling

All tools return structured results rather than throwing:

- **`polish_apply`** returns `failed` array for patches that couldn't be applied (e.g. `before` text not found, line out of range).
- **`polish_style_lookup`** returns `{ found: false, available: true, availableBrands: [...] }` when the brand isn't found but bundled data is available.
- **`polish_measure`** filters out invalid documents (non-objects) and defaults missing fields (`theme` → `"default"`, `label` → `"unknown"`).
