# polish

Design token superpower tool: **extract · critique · apply**

polish closes the loop: it takes design token audit findings and applies mechanical rewrites automatically, then delegates creative fixes to AI coding agents via skills.

## Install

```bash
npm install -g polish
```

## Quick Start

```bash
# Full pipeline on a directory
polish plan findings.json    # findings → ordered action list
polish diff plan.json        # plan → mechanical patches (preview only)
polish apply patches.json    # patches → execute with backup
```

## CLI

```
polish plan  <findings.json>     Convert findings → action list
polish diff  <plan.json>         Plan → mechanical patches
polish apply <patches.json>      Execute patches (with .backup files)
```

## MCP Server

polish exposes 7 tools via MCP:

| Tool | Description |
|---|---|
| `polish_extract` | Extract design tokens from a directory. Returns token graph. |
| `polish_audit` | Full critique: scan + cross-reference. Returns findings. |
| `polish_plan` | Convert findings into ordered, classified action list. |
| `polish_diff` | Generate mechanical patches for a plan. |
| `polish_apply` | Execute patches with backup protection. |
| `polish_doctor` | Check that all dependencies are installed. |
| `polish_style_lookup` | Look up a brand DESIGN.md from awesome-design-md. |

## Architecture

```
findings → plan.js → diff.js → apply.js
  │           │         │         │
  │           │         │         └── mechanical patches applied to files
  │           │         └── before/after patches for mechanical items only
  │           └── ranked action list, split mechanical vs judgmental
  └── from token-audit cross.js (reused)
```

**Mechanical vs judgmental split:**
- ~40% mechanical (hardcoded → token, conflicts, duplicates) → auto-fixed by diff/apply
- ~60% judgmental (typography, layout, polish, responsive) → delegated to impeccable skills

## Skills

### page-polish

Orchestrates the full pipeline. Tells the agent when to call MCP tools, when to delegate to skill sub-commands, and how to collect design context before creative work.

### Wrapper skills

Three wrapper skills inject polish context into upstream skills:

- **taste-with-polish** — taste design rules + audit findings
- **awesome-design-md-with-polish** — brand style lookup + audit findings
- **impeccable-with-polish** — creative sub-commands + audit findings

## Dependencies

polish references these skills externally — it does not bundle them:

| Dependency | Type | Install |
|---|---|---|
| dembrandt | npm CLI | `npm install -g dembrandt` |
| taste | SKILL.md | `npx skills add Leonxlnx/taste-skill` |
| awesome-design-md | SKILL.md | Install from repo |
| impeccable | SKILL.md | Install from repo |

Run `polish doctor` (or call `polish_doctor` MCP tool) to check all dependencies.

## Programmatic API

```javascript
import { plan, generateDiffs, apply, extract, audit, runPipeline } from 'polish';

// Full pipeline (no apply — requires consent)
const { graph, findings, plan: actions, patches } = runPipeline('./my-css-dir');

// Or step by step
const graph = extract('./my-css-dir');
const report = audit('./my-css-dir');
const actions = plan(report.findings);
const patches = generateDiffs(actions);
const result = await apply(patches); // backs up files before modifying
```

## Testing

```bash
node test/run.js
```

## License

MIT
