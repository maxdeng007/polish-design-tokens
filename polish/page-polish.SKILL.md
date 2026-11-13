---
name: page-polish
description: Orchestrates the full polish pipeline: extract → critique → plan → diff → apply. Splits work between mechanical fixes (MCP tools) and creative fixes (impeccable sub-commands).
---

# page-polish — Full pipeline orchestration

## When to Activate

- User says "polish this page", "enhance the design tokens", "make it look like X"
- After running token-audit, user wants fixes applied
- Agent needs to choose a style target (awesome-design-md) or enforce design rules (taste)

## Core Workflow

### 1. Extract tokens

Call `polish_extract` (or token-audit `audit_run`) on the target URL or file. Get the token graph + dembrandt classification.

### 2. Critique

Call `polish_audit` (or token-audit `audit_findings`) to get findings. Present a summary to the user:

```
Found N issues:
  3 conflicts (error)
  2 hardcoded values (error)
  1 dangling token (warn)
  1 typography hierarchy (info)
```

Ask which findings to fix. If the user says "all", proceed with everything.

### 3. Plan

Call `polish_plan` with the findings array. This returns an ordered, classified action list:

- `mechanical: true` → can be auto-fixed by diff/apply
- `mechanical: false` → needs agent judgement + creative skills

### 4. Diff

Call `polish_diff` with the plan array. Returns patches with `before`/`after` for each mechanical item.

### 5. Apply

Call `polish_apply` (or CLI `polish apply <patches.json>`) to execute mechanical patches. Files are backed up with `.backup` extension before modification.

### 6. Judgmental fixes (the 60%)

For each `mechanical: false` item, the agent must do creative work. Map finding types to impeccable sub-commands:

| Finding type | Impecable sub-command | What it does |
|---|---|---|
| Typography hierarchy | `typeset` | Fix heading scales, body text rhythm, font weights |
| Layout/spacing inconsistency | `arrange` | Align spacing to grid, fix inconsistent margins/padding |
| Visual polish needed | `bolder` or `polish` | Add personality, refine transitions, improve micro-interactions |
| Responsive issues | `adapt` | Fix breakpoints, mobile layouts, touch targets |
| Style upgrade requested | taste + awesome-design-md | Apply brand rules from taste skill, fetch style target from awesome-design-md |

**Before any creative work**, collect design context (impeccable requirement):
- Audience — who is this for?
- Use cases — what are users trying to accomplish?
- Brand personality — formal/playful, minimal/rich, etc.

If the user requests a specific style target ("make it look like Stripe"), call `polish_style_lookup` to fetch the DESIGN.md, then apply its tokens and rules.

If the user wants design quality enforcement, load the taste skill and apply its rules to prevent AI slop in typography, spacing, color, and layout.

### 7. Verify

After all fixes, run `polish_audit` again. Check that:
- No new conflicts were introduced
- Mechanical fixes took effect
- No new hardcoded values appeared

### 8. Summary

Present a before/after summary:

```
Applied:
  ✅ 5 mechanical fixes (backed up to .bak files)
  ✅ 2 typography fixes (typeset)
  ✅ 1 layout fix (arrange)

Remaining:
  ⚠️ 1 dangling token (needs manual cleanup)

Backups: .backup files in same directories
```

## MCP Tools Reference

| Tool | Input | Output |
|---|---|---|
| `polish_plan` | findings array | plan array + summary |
| `polish_diff` | plan array | patches array + preview |
| `polish_apply` | patches array | apply report |

## CLI Reference

```
polish plan  <findings.json>     Convert findings → action list
polish diff  <plan.json>         Plan → mechanical patches
polish apply <patches.json>      Execute patches (with backup)
```

## Dependencies

polish references these skills externally — it does not bundle them:

- **dembrandt** — token extraction + classification (npm: `npm install -g dembrandt`)
- **taste** — design rules engine (skill: install from Leonxlnx/taste-skill)
- **awesome-design-md** — 54 brand style targets (skill: install from repo)
- **impeccable** — creative execution engine (skill: install from repo)

Run `polish doctor` to check all dependencies are installed.

## Key Principles

1. **Mechanical first** — always apply auto-fixes before creative work. Clean tokens give the creative agent a better starting point.
2. **Backup always** — apply.js creates `.backup` files before any modification. Never skip this.
3. **Context before creativity** — impeccable requires design context. Collect it before invoking any creative sub-command.
4. **Verify after** — re-run audit to ensure fixes didn't introduce new issues.
5. **User consent** — present findings before applying. The user decides scope.
