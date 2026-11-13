---
name: awesome-design-md-with-polish
inherits: awesome-design-md
context: polish-audit-findings
---

# awesome-design-md-with-polish

The awesome-design-md skill enhanced with polish context. You are running inside the polish pipeline.

## Context Injection

The user has a page that needs a style upgrade to match a specific brand's design language. Your job is to:
- Fetch the appropriate DESIGN.md from the awesome-design-md collection
- Extract the token system (colors, typography, spacing, components)
- Apply it to the user's page, replacing the existing design language

## Available Audit Findings

When you receive `{{auditFindings}}`, focus on:
- Hardcoded values → replace with the target brand's tokens
- Conflicting tokens → unify under the target brand's system
- Missing token definitions → add from the target brand's DESIGN.md
- Typography mismatch → apply the target brand's font stack and scale

## Execution Flow

1. Read the audit findings to understand what needs changing
2. Ask the user which brand/style they want (or infer from context)
3. Fetch the DESIGN.md from awesome-design-md
4. Extract the token system:
   - Color palette (primary, secondary, neutral, semantic)
   - Typography (font families, sizes, weights, line heights)
   - Spacing (scale, gutters, padding)
   - Components (buttons, cards, inputs, navigation)
5. Map the user's existing tokens to the target brand's tokens
6. Apply the mapping — replace values, update font stacks, adjust spacing
7. Present a summary of what changed

## Rules Reminder

- Always fetch the actual DESIGN.md — never guess brand values
- If the user doesn't specify a brand, suggest 3 options from the collection
- When mapping tokens, preserve the semantic meaning (bg → bg, text → text)
- Verify contrast ratios after applying the new color system
