# polish — Design Spec

**Date:** 2026-11-04
**Status:** Draft — pending user review
**Product:** polish — design token superpower tool: extract · critique · apply

---

## 1. Product Overview

polish closes the loop that token-audit opens. Today token-audit extracts tokens and produces a critique report — but nothing applies the fixes. polish adds the missing third act: it takes the audit findings and actually enhances the page, splitting work between deterministic mechanical rewrites and agent-driven creative fixes.

**Three-phase delivery:**

- **Phase 1** — `plan.js` + `diff.js` + MCP tools. Mechanical layer: extract → audit → plan → generate patches. No file writes, no creative fixes. Testable and deterministic.
- **Phase 2** — `apply.js` + CLI `polish apply`. Execute mechanical patches on real files with backup, diff preview, and rollback.
- **Phase 3** — `page-polish` skill + impeccable/taste integration. Agent-driven creative fixes: typography, layout, visual polish, responsive adaptation.

**Product model:** Single npm package shipping three interfaces — CLI, MCP server, and SKILL.md — all sharing one core engine.

---

## 2. Architecture

### 2.1 Three Interfaces

| Interface | Purpose | Entry Point |
|---|---|---|
| **CLI** | Standalone execution. Extract + audit work without any agent. | `polish <command>` |
| **MCP Server** | Expose engine as callable tools for AI agents (Qoder, Claude Code, Cursor, etc.) | stdio transport |
| **Skill** | SKILL.md orchestration for agent-driven creative fixes | `page-polish` |

### 2.2 Shared Core Engine

```
input (URL or local file)
  │
  ▼
┌─────────┐   ┌─────────┐   ┌────────┐   ┌────────┐   ┌────────┐
│ scan.js │──▶│cross.js │──▶│plan.js │──▶│diff.js │──▶│apply.js│
└─────────┘   └─────────┘   └────────┘   └────────┘   └────────┘
  extract        critique      order        generate      execute
  tokens         findings      fixes        patches       plan
  │                              │             │            │
  │                              ▼             ▼            ▼
  │                          mechanical    mechanical   mechanical
  │                          vs judgmental  rewrites     + delegate
  │                                          (auto)       creative to agent
  ▼
output: enhanced page + report
```

### 2.3 Pipeline Steps

#### scan.js (Step 1) — Extract Tokens

- Parse CSS in the target page (local file or fetched URL)
- Extract all CSS custom properties (`--*` variables)
- Call dembrandt for classification (typography, components, motion, etc.)
- Output: token graph (variables, values, contexts, locations)

**Reuses:** token-audit's `scan.js` — extend with dembrandt classification enrichment.

#### cross.js (Step 2) — Critique

- Find conflicts: same variable, multiple values in same scope
- Find dangling references: used but never defined
- Find runtime drift: declared value ≠ computed value (when runtime measurement available)
- Find hardcoded values: `#fff`, `16px`, etc. that should reference tokens
- Find orphan tokens: defined but never used
- Generate findings with severity (error/warn/info)

**Reuses:** token-audit's `cross.js` — same finding generation, same severity model.

#### plan.js (Step 3) — Order Fixes  — *NEW*

- Rank findings by impact (reuses PRIORITY_ORDER from token-audit report)
- Split each finding into mechanical or judgmental
- Produce an ordered action list: `[{ finding, action, type, priority, diff? }]`

**Mechanical criteria:**
- Hardcoded value has a clear token mapping → mechanical
- Conflict where one value is clearly canonical (majority vote, or explicit root declaration) → mechanical
- Duplicate declaration merge → mechanical
- Missing import → mechanical

**Judgmental criteria:**
- Typography hierarchy issues → needs impeccable `typeset`
- Layout/spacing inconsistencies → needs impeccable `arrange`
- Visual polish, personality → needs impeccable `bolder`/`polish`
- Style upgrade to a target brand → needs taste rules + awesome-design-md
- Responsive fixes → needs impeccable `adapt`

**Output:** `plan.json` — ordered, classified action list.

#### diff.js (Step 4) — Generate Patches  — *NEW*

- For each mechanical action in the plan, generate a patch (before/after CSS snippet)
- Patch types:
  - `replace`: `color: #fff` → `color: var(--text-primary)`
  - `merge`: combine duplicate declarations
  - `rewrite`: replace conflicting value with canonical
  - `add`: add missing token definition
  - `remove`: flag orphan token for removal (never auto-delete)
- Each patch includes: file path, line number, before, after, reason
- Patches are previewable but not yet applied

**Output:** `diffs.json` — array of patches.

#### apply.js (Step 5) — Execute  — *NEW*

- Load plan + diffs
- Apply mechanical patches to files (with backup)
- For judgmental items, emit a delegation spec: what the agent should do, which impeccable sub-command to use, what context to gather
- Produce a summary: what was auto-fixed, what needs agent attention, what was skipped

**Output:** enhanced files + `apply-report.json`

### 2.4 apply.js Work Split

| Finding Type | Split | Handler |
|---|---|---|
| Hardcoded color → token | Mechanical (~40%) | `diff.js` auto-rewrite |
| Duplicate declaration | Mechanical | `diff.js` merge |
| Conflicting values (clear canonical) | Mechanical | `diff.js` rewrite |
| Orphan token | Mechanical (flag only) | `diff.js` mark for removal |
| Missing token definition | Mechanical | `diff.js` add |
| Typography hierarchy | Judgmental (~60%) | Agent + impeccable `typeset` |
| Layout/spacing | Judgmental | Agent + impeccable `arrange` |
| Visual polish | Judgmental | Agent + impeccable `bolder`/`polish` |
| Style upgrade | Judgmental | Agent + taste + awesome-design-md |
| Responsive fixes | Judgmental | Agent + impeccable `adapt` |

---

## 3. MCP Server Tools

The MCP server exposes the engine as callable tools. All tools are stateless — each call is independent.

| Tool | Phase | Description |
|---|---|---|
| `polish_extract` | 1 | Extract tokens from URL/file. Returns token graph + dembrandt classification. |
| `polish_audit` | 1 | Run full critique. Returns findings report (reuses token-audit output format). |
| `polish_plan` | 1 | Convert findings into ordered, classified action list. Returns `plan.json`. |
| `polish_diff` | 1 | Generate mechanical patches for a plan. Returns `diffs.json`. |
| `polish_apply` | 2 | Execute mechanical patches on files. Requires file path + plan + diffs. Returns apply report. |
| `polish_style_lookup` | 3 | Look up a style target from awesome-design-md. Returns DESIGN.md content. |
| `polish_doctor` | 1 | Check that all dependencies (dembrandt, taste, awesome-design-md, impeccable) are installed. |

**Key design decisions:**

- `polish_plan` and `polish_diff` are the core new value — they don't exist in token-audit today.
- `polish_apply` requires explicit file paths and user consent — never auto-write.
- `polish_doctor` exists because dependencies don't auto-update; users need a way to verify their environment.
- `polish_style_lookup` bridges the skill layer into the MCP layer so agents can fetch style targets programmatically.

---

## 4. CLI Commands

```
polish scan <url|file>        Extract tokens + classification
polish audit <url|file>       Full critique report (HTML + JSON)
polish plan <url|file>        Generate ordered fix plan
polish diff <url|file>        Generate mechanical patches (preview only)
polish apply <file>           Execute mechanical patches (with backup)
polish doctor                 Check dependencies
polish polish <url|file>      Full loop: extract → audit → plan → diff → apply
                              (delegates judgmental fixes to calling agent)
```

**Phase coverage:**
- Phase 1: `scan`, `audit`, `plan`, `diff`, `doctor`
- Phase 2: `apply`
- Phase 3: `polish` (full loop with agent delegation)

---

## 5. Skill: page-polish

The `page-polish` SKILL.md orchestrates the full pipeline for agent-driven use. It tells the agent:

1. **When to call which MCP tool** — extract → audit → plan → diff → apply sequence
2. **How to split mechanical vs judgmental** — read the plan, apply diffs via `polish_apply`, then handle judgmental items
3. **When to invoke impeccable sub-commands** — map finding types to impeccable commands
4. **When to load awesome-design-md** — when user requests a style target
5. **When to apply taste rules** — when design quality needs enforcement
6. **Context collection** — before creative work, collect design context (audience, use cases, brand personality) per impeccable's requirements

**Key workflow:**

```
1. Call polish_extract → get token graph
2. Call polish_audit → get findings
3. Present findings to user, ask which to fix
4. Call polish_plan → get ordered action list
5. Call polish_diff → get mechanical patches
6. Call polish_apply → execute mechanical fixes
7. For judgmental items:
   a. Gather design context (impeccable requirement)
   b. If style target requested: call polish_style_lookup
   c. Invoke appropriate impeccable sub-command (typeset, arrange, bolder, etc.)
   d. Apply creative fix
8. Run polish_audit again → verify fixes didn't introduce new issues
9. Present before/after summary
```

---

## 6. Dependencies

| Dependency | Type | Install | Update | polish's role |
|---|---|---|---|---|
| dembrandt | npm (CLI + MCP) | `npm install -g dembrandt` | `npm update -g dembrandt` | Token extraction + classification in scan.js |
| taste | SKILL.md | `npx skills add Leonxlnx/taste-skill` | Re-install / sync from repo | Design rules engine for creative fixes |
| awesome-design-md | SKILL.md | Manual copy or re-install from repo | Re-sync from repo | 54 brand style targets |
| impeccable | SKILL.md | Manual copy or re-install from repo | Re-sync from repo | Execution engine (bolder, typeset, arrange, etc.) |

**Dependency management:**

- No auto-install via postinstall scripts — too fragile given mixed install methods
- `polish doctor` checks all four are present and reports what's missing with exact install commands
- README documents all dependencies with install commands
- polish does NOT bundle or vendor these dependencies — it references them externally

---

## 7. Distribution

**Package name:** `polish` (npm)

**Install:** `npm install -g polish`

**What ships in the package:**
- CLI binary (`polish`)
- MCP server entry point
- Core engine modules (`scan.js`, `cross.js`, `plan.js`, `diff.js`, `apply.js`)
- `page-polish` SKILL.md file
- `polish doctor` dependency manifest

**What does NOT ship:**
- dembrandt, taste, awesome-design-md, impeccable — these are external dependencies the user must install separately

**Works with:**
- CLI: any terminal
- MCP: any agent that supports MCP (Qoder, Claude Code, Cursor, Codex, etc.)
- Skill: any agent that reads SKILL.md files

---

## 8. Testing Strategy

### Phase 1 (plan.js + diff.js + MCP)

- **Unit tests:** plan.js ranking, mechanical/judgmental classification, diff generation for each patch type
- **Integration tests:** scan → cross → plan → diff on real HTML files from `examples/noah-sample/` and the Noah Mind 2.0 page
- **MCP tests:** each tool call returns correct JSON structure
- **Verification:** `polish_plan` output reviewed against actual findings for correctness

### Phase 2 (apply.js + CLI apply)

- **File I/O tests:** backup creation, patch application, rollback
- **Safety tests:** never overwrite without backup, never apply patch without explicit consent
- **End-to-end:** run `polish apply` on a test file, verify before/after diffs are correct

### Phase 3 (skill + creative fixes)

- **Workflow tests:** agent follows page-polish SKILL.md correctly
- **Impeccable integration:** correct sub-command invoked for each finding type
- **Before/after:** visual comparison of polished vs original page

---

## 9. Resolved Questions

1. **Naming:** "polish" confirmed.
2. **`polish_apply` scope:** Judgmental items are separate agent steps. `polish_apply` handles only mechanical patches. This keeps each step reviewable and avoids asking the tool to do creative work it can't do deterministically.
3. **Runtime measurement:** Include `measure.js` from token-audit. Runtime drift detection is necessary for a complete audit — static-only misses computed-vs-declared discrepancies that users can actually see. Cost: ~5-13s per page (browser launch).
4. **Skill packaging:** Ship four skills — `page-polish` (orchestration) plus three wrapper skills that add polish-specific context to `taste`, `awesome-design-md`, and `impeccable`. Each wrapper injects polish's workflow context (e.g., "you are running inside polish, here's what the audit found, here's what to fix") into the upstream skill's instructions.
