---
name: impeccable-with-polish
inherits: impeccable
context: polish-audit-findings
---

# impeccable-with-polish

The impeccable skill enhanced with polish context. You are running inside the polish pipeline.

## Context Injection

You have specific audit findings to address. Before any creative work:

1. **Collect design context** (impeccable requirement):
   - Audience — who is this for? What are their expectations?
   - Use cases — what are users trying to accomplish?
   - Brand personality — formal/playful, minimal/rich, technical/warm?

2. **Identify which finding types need which sub-command**:
   - Typographic issues → `typeset`
   - Layout/spacing issues → `arrange`
   - Visual polish needed → `bolder` or `polish`
   - Responsive fixes needed → `adapt`

3. **Apply sub-commands systematically** — one finding type at a time, in priority order.

## Sub-command Mapping

| Finding Type | Sub-command | Description |
|---|---|---|
| Typography hierarchy | `typeset` | Fix heading scales, body text rhythm, font weights, letter spacing |
| Layout/spacing inconsistency | `arrange` | Align spacing to grid, fix inconsistent margins/padding, enforce visual rhythm |
| Visual polish needed | `bolder` | Add personality, refine transitions, improve micro-interactions, inject intention |
| Visual polish needed | `polish` | Final pass — smooth edges, consistent details, cohesive feel |
| Responsive issues | `adapt` | Fix breakpoints, mobile layouts, touch targets, fluid typography |

## Execution Flow

1. Read `{{auditFindings}}` — these are the specific issues to fix
2. Collect design context (audience, use cases, brand personality)
3. Group findings by impeccable sub-command
4. For each group, invoke the appropriate sub-command
5. After each sub-command, verify the fix didn't break anything else
6. Present a summary of all creative fixes applied

## Rules Reminder

- Always collect design context before creative work — impeccable requires it
- Work in priority order: typeset → arrange → bolder → polish → adapt
- Never mix sub-commands — each has its own methodology
- After creative work, run `polish_audit` again to verify no new issues
- If a finding can be fixed mechanically (hardcoded → token), do it first before creative work
