/**
 * findings.js — single source of truth for finding metadata.
 *
 * Every finding id Polish can produce is registered here with its
 * canonical severity, priority, classification (mechanical vs
 * judgmental), and its plain-language explanation (title, summary,
 * why, fix). cross() uses severityOf() when constructing findings,
 * plan() derives PRIORITY_ORDER / MECHANICAL_IDS / JUDGMENTAL_IDS from
 * it, and explain.js exposes the explanation fields from it — so the
 * three consumers can never drift apart.
 */

/** @typedef {{ id: string, severity: 'error'|'warn'|'info', priority: number, classification: 'mechanical'|'judgmental', title: string, summary: string, why: string, fix: string }} FindingMeta */

const FINDING_META = {
  conflict: {
    id: 'conflict',
    severity: 'error',
    priority: 1,
    classification: 'judgmental',
    title: 'Conflict',
    summary: 'The same token name is declared with different values.',
    why: 'When a token has multiple values across your project, consumers cannot predict which one they will get. This causes inconsistent rendering and makes the token unreliable.',
    fix: 'Choose one canonical value, keep it in one place, and make all other declarations reference or remove them.'
  },
  dangling: {
    id: 'dangling',
    severity: 'error',
    priority: 2,
    classification: 'judgmental',
    title: 'Dangling Reference',
    summary: 'A token is referenced (via var()) but never declared.',
    why: 'The browser resolves unknown custom properties to guaranteed-invalid, which means the property silently does nothing. This typically causes missing styles that are hard to debug.',
    fix: 'Declare the token with a canonical value, or remove the reference if it is no longer needed.'
  },
  'runtime-drift': {
    id: 'runtime-drift',
    severity: 'error',
    priority: 3,
    classification: 'judgmental',
    title: 'Runtime Drift',
    summary: 'Token values differ across pages when measured at runtime.',
    why: 'If the same token resolves to different values on different pages, the design is not consistent for end users. This often comes from theme overrides, cascade differences, or conditional styles.',
    fix: 'Investigate why the token resolves differently and unify the source — check for theme overrides, conditional blocks, or cascade ordering.'
  },
  orphan: {
    id: 'orphan',
    severity: 'warn',
    priority: 4,
    classification: 'judgmental',
    title: 'Orphan Token',
    summary: 'A token is declared but never referenced anywhere.',
    why: 'Unused tokens add noise to your stylesheet and make the token system harder to maintain. They can also confuse teammates who wonder if the token is intentional.',
    fix: 'Remove the declaration if it is no longer needed, or add a reference if it should be used.'
  },
  'duplicate-value': {
    id: 'duplicate-value',
    severity: 'warn',
    priority: 5,
    classification: 'mechanical',
    title: 'Duplicate Value',
    summary: 'Multiple token names share the same value.',
    why: 'When several tokens hold the same value, updates require changing every one. This is wasteful and increases the chance of missed updates and inconsistency.',
    fix: 'Make the secondary tokens alias the primary token with var(--primary), so a single change propagates everywhere.'
  },
  namespace: {
    id: 'namespace',
    severity: 'info',
    priority: 6,
    classification: 'judgmental',
    title: 'Namespace Inconsistency',
    summary: 'Multiple naming families coexist (e.g. --color-* and --bg-*).',
    why: 'Inconsistent naming conventions make tokens harder to find and reason about. They also suggest an unclear token taxonomy, which slows down maintenance.',
    fix: 'Unify naming under a single convention so token names follow a predictable pattern.'
  },
  hardcoded: {
    id: 'hardcoded',
    severity: 'warn',
    priority: 7,
    classification: 'judgmental',
    title: 'Hardcoded Value',
    summary: 'A raw color or space value is used instead of a token reference.',
    why: 'Hardcoded values bypass the token system, so they cannot be updated by changing a token. This leads to drift and makes theme changes or rebranding tedious.',
    fix: 'Map the hardcoded value to an appropriate token reference so it is controlled by the token system.'
  },
  'cascade-override': {
    id: 'cascade-override',
    severity: 'info',
    priority: 8,
    classification: 'judgmental',
    title: 'Cascade Override',
    summary: 'CSS cascading produces unintended value variation.',
    why: 'When a token is redefined in a nested scope, the cascade can produce unexpected values for consumers. This is a common source of subtle visual bugs.',
    fix: 'Decide whether the override is intentional. If not, refactor to avoid the cascade shadowing the intended value.'
  },
  'state-variation': {
    id: 'state-variation',
    severity: 'info',
    priority: 9,
    classification: 'judgmental',
    title: 'State Variation',
    summary: 'Token values differ across component states (e.g. :hover, :focus).',
    why: 'State-specific values can be intentional, but if they are not formalized as tokens they become hard to maintain and document.',
    fix: 'Decide whether to formalize state values as dedicated tokens or accept the variation. Formalize if states are reused across components.'
  },
  'theme-variation': {
    id: 'theme-variation',
    severity: 'info',
    priority: 10,
    classification: 'judgmental',
    title: 'Theme Variation',
    summary: 'Token values differ across themes (e.g. dark/light).',
    why: 'Theme-specific values should be deliberately structured. Unstructured theme variation can make dark mode or multi-brand setups fragile.',
    fix: 'Decide whether to formalize the theme structure with dedicated theme tokens, or accept the variation.'
  },
  'dynamic-variable': {
    id: 'dynamic-variable',
    severity: 'info',
    priority: 11,
    classification: 'judgmental',
    title: 'Dynamic Variable',
    summary: 'A token has a dynamic (non-static) value, such as one computed at runtime.',
    why: 'Dynamic values can be powerful but they break the assumption that tokens are static and declarative. They can also make static analysis and export more complex.',
    fix: 'Decide how to handle the dynamic behavior — some tools may need special treatment for dynamic tokens.'
  },
  'tailwind-utility-var': {
    id: 'tailwind-utility-var',
    severity: 'info',
    priority: 12,
    classification: 'judgmental',
    title: 'Tailwind Utility Variable',
    summary: 'A token is a Tailwind v4 per-utility variable (--text-*, --spacing-*, …).',
    why: 'Tailwind v4 emits per-utility custom properties (e.g. --text-sm, --spacing-4) that shadow the token system at runtime. They look like design tokens to static analysis but are framework-generated, so treating them as design tokens leads to false positives.',
    fix: 'Exclude these from the design token system (they belong to Tailwind). If you reference them directly, alias to your own tokens so theme changes still propagate.'
  }
};

/** Get the metadata entry for a finding id. */
export function getFindingMeta(id) {
  return FINDING_META[id] || null;
}

/** List every registered finding id, in priority order. */
export function listFindingIds() {
  return Object.keys(FINDING_META).sort((a, b) => FINDING_META[a].priority - FINDING_META[b].priority);
}

/** Canonical severity for a finding id. */
export function severityOf(id) {
  const meta = FINDING_META[id];
  return meta ? meta.severity : null;
}

/** Priority rank for a finding id (lower sorts earlier). */
export function priorityOf(id) {
  const meta = FINDING_META[id];
  return meta ? meta.priority : null;
}

/** Classification for a finding id: 'mechanical' or 'judgmental'. */
export function classificationOf(id) {
  const meta = FINDING_META[id];
  return meta ? meta.classification : null;
}

/** Whether a finding id is mechanical (auto-fixable). */
export function isMechanical(id) {
  return FINDING_META[id]?.classification === 'mechanical';
}

/** Whether a finding id is judgmental (needs human review). */
export function isJudgmental(id) {
  return FINDING_META[id]?.classification === 'judgmental';
}

/** [id, priority] pairs sorted by priority — the plan module's PRIORITY_ORDER. */
export const PRIORITY_ORDER = listFindingIds().map(id => [id, FINDING_META[id].priority]);

/** Mechanical finding ids — the only ones auto-fixable by diff + apply. */
export const MECHANICAL_IDS = new Set(
  Object.keys(FINDING_META).filter(id => FINDING_META[id].classification === 'mechanical')
);

/** Judgmental finding ids — surfaced for human or agent review. */
export const JUDGMENTAL_IDS = new Set(
  Object.keys(FINDING_META).filter(id => FINDING_META[id].classification === 'judgmental')
);

export { FINDING_META };
export default { FINDING_META, getFindingMeta, listFindingIds, severityOf, priorityOf, classificationOf, isMechanical, isJudgmental, PRIORITY_ORDER, MECHANICAL_IDS, JUDGMENTAL_IDS };
