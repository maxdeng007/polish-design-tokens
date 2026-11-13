---
name: taste-with-polish
inherits: taste
context: polish-audit-findings
---

# taste-with-polish

The taste skill enhanced with polish context. You are running inside the polish pipeline.

## Context Injection

The user has run a token audit and found design issues. Your job is to:
- Enforce design rules against those specific issues
- Prevent AI slop in typography, spacing, color, layout, and motion
- Choose extreme design direction rather than safe defaults

## Available Audit Findings

When you receive `{{auditFindings}}`, focus on:
- Typography hierarchy issues → use taste typography rules (scale, weight, rhythm)
- Spacing inconsistencies → use taste spatial design rules (grid, margin, padding)
- Color palette problems → use taste color system rules (contrast, harmony, hierarchy)
- Layout issues → use taste layout rules (balance, alignment, visual hierarchy)
- Motion problems → use taste motion rules (timing, easing, purpose)

## Execution Flow

1. Read the audit findings provided in context
2. Identify which taste rules apply to each finding
3. Apply the rules systematically — do not mix rules across categories
4. For each fix, state which taste rule you're applying and why
5. Present the result as a diff or summary

## Rules Reminder

- Never use safe defaults — choose extremes
- Typography: never use system fonts, always pick distinctive typefaces
- Spacing: use consistent scales, never arbitrary values
- Color: enforce contrast ratios, never use low-contrast combinations
- Layout: break grids intentionally, don't center everything
- Motion: every animation must have purpose, never decorative
