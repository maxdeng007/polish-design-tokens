[English](mcp-integration.md) | [中文](mcp-integration.zh-CN.md)

# MCP Integration Guide

polish exposes 9 tools via the Model Context Protocol (JSON-RPC 2.0 over stdin/stdout). Any AI coding agent that supports MCP can drive the full audit → fix pipeline.

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
{ "target": "./src/styles", "ignore": ["vendor"] }
```

**Output:** `DeclarationGraph` — declarations, references, conflicts, dangling, orphans, summary.

**Use when:** You need the raw token graph without findings. Useful for understanding what tokens exist before running a full audit.

---

### `polish_audit`

Scan + cross-reference to produce findings.

**Input:**
```json
{ "target": "./src/styles", "ignore": ["vendor"] }
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

**Output:** `{ findings, summary, graphSummary, observation }` — `findings` sorted by severity, `summary` with `declarations`, `uniqueTokens`, `runtimeVariables`, `runtimeDocuments`, `findings` and `bySeverity` counts, `graphSummary` describing the scanned token graph, and `observation` echoing the input (or `null` when no runtime data was passed).

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

**Output:** `{ plan, summary }` — `plan` is a sorted `PlanAction[]`; each action has `type` (mechanical/judgmental), `priority`, `action` (fix/review/note), and the original finding. `summary` has `total`, `mechanical`, `judgmental`, and `topPriority` counts.

**Use when:** After `polish_audit`, before generating patches. Classifies what can be auto-fixed vs. what needs human judgment.

---

### `polish_diff`

Generate mechanical patches from a plan.

**Input:**
```json
{ "plan": [ { "finding": {...}, "action": "fix", "type": "mechanical", "priority": 2 } ] }
```

**Output:** `{ patches, preview }` — `patches` is a `Patch[]`; only mechanical items produce patches. Each patch has `type`, `file`, `line`, `before`, `after`, `reason`, `findingId`. `preview` is a short human-readable summary of the first ten patches.

**Use when:** After `polish_plan`, to get concrete patches for mechanical fixes.

---

### `polish_apply`

Execute patches with backup protection. **Target is required** — patches outside it are rejected.

**Input:**
```json
{
  "patches": [ { "type": "replace", "file": "src/tokens.css", "line": 12, "before": "#1a1a2e", "after": "var(--bg)", "reason": "...", "findingId": "duplicate-value" } ],
  "target": "./src/styles"
}
```

`delete` and `rewrite` patches must carry `before` (the expected original line text, or the token name to replace).

**Output:** `ApplyResult` — `{ status, applied: [...], failed: [...], backupCount: N, backups: [{ file, backup, runId }], rolledBack: [...] }`

**Safety:** The run is strictly all-or-nothing. If any patch fails pre-validation, nothing is written and `status` is `"aborted"`. If a patch fails at execution time, every file written by the run is restored from its backup and `status` is `"rolledBack"`. Each file is backed up before the first patch touches it: the first run creates `file.backup`, later runs snapshot to `file.backup.<runId>` (the original backup is never overwritten).

**Use when:** After `polish_diff`, to apply the generated patches. This is the only phase that modifies files.

---

### `polish_rollback`

Restore files from an `polish_apply` backup manifest.

**Input:**
```json
{
  "backups": [ { "file": "src/tokens.css", "backup": "/abs/path/src/tokens.css.backup", "runId": "run-xxxx" } ],
  "target": "./src/styles"
}
```

**Output:** `{ restored: [...], failed: [...] }`

**Safety:** **Target is required.** Only server-generated canonical backups are accepted — `<file>.backup` or `<file>.backup.<runId>` matching the entry's `runId`. Arbitrary paths are refused, so an untrusted manifest cannot inject foreign file content into your project.

**Use when:** An apply run went wrong (`status: "rolledBack"`, or you changed your mind after a clean apply) and you want to restore the pre-apply state.

---

### `polish_doctor`

Check optional dependencies are installed.

**Input:**
```json
{}
```

**Output:** Health check report — confirms whether optional skills and tools (dembrandt, taste, awesome-design-md, impeccable) are available, and returns ready-to-run install commands for any missing ones.

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

## Contract

Every tool in `tools/list` carries a formal JSON Schema `outputSchema`, and every `tools/call` result includes both a text payload (`content[0].text`) and a machine-readable `structuredContent` object with the same data. Validate against `outputSchema` or consume `structuredContent` directly — both are guaranteed present.

## Typical Workflow

```
1. polish_audit(target)      → { findings, summary, graphSummary, observation }
2. polish_plan(findings.findings) → { plan, summary } (ranked)
3. polish_diff(plan.plan, target) → { patches, preview } (mechanical only)
4. polish_apply(patches.patches, target) → ApplyResult (files modified + backups)
```

Note how each stage unwraps the previous stage's response: `polish_plan` takes `findings` from the audit result, `polish_diff` takes `plan` from the plan result, and `polish_apply` takes `patches` from the diff result.

For runtime-aware audits, insert `polish_measure` between step 1 and 2 to provide observation data.

If an apply run misbehaves, feed its `backups` manifest to `polish_rollback` to restore the pre-apply state.

## Error Handling

All tools return structured results rather than throwing:

- **`polish_apply`** returns `status: "aborted"` when a patch fails pre-validation (nothing is written) and `status: "rolledBack"` when an execution-time failure rolls the whole run back; patch-level details are in `failed`.
- **`polish_rollback`** restores files from an apply run's `backups` manifest; entries whose backup path is not a canonical server-generated sibling are refused and reported in `failed`.
- **`polish_style_lookup`** returns `{ found: false, available: true, availableBrands: [...] }` when the brand isn't found but bundled data is available.
- **`polish_measure`** filters out invalid documents (non-objects) and defaults missing fields (`theme` → `"default"`, `label` → `"unknown"`).
