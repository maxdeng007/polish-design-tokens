/**
 * Plain-language explanations for each finding type.
 * Used by `polish explain <finding-type>` to help users understand
 * what a finding means and why it matters — without reading the README.
 */

const EXPLANATIONS = {
  conflict: {
    severity: 'error',
    title: 'Conflict',
    summary: 'The same token name is declared with different values.',
    why: 'When a token has multiple values across your project, consumers cannot predict which one they will get. This causes inconsistent rendering and makes the token unreliable.',
    fix: 'Choose one canonical value, keep it in one place, and make all other declarations reference or remove them.'
  },
  dangling: {
    severity: 'error',
    title: 'Dangling Reference',
    summary: 'A token is referenced (via var()) but never declared.',
    why: 'The browser resolves unknown custom properties to guaranteed-invalid, which means the property silently does nothing. This typically causes missing styles that are hard to debug.',
    fix: 'Declare the token with a canonical value, or remove the reference if it is no longer needed.'
  },
  'runtime-drift': {
    severity: 'warn',
    title: 'Runtime Drift',
    summary: 'Token values differ across pages when measured at runtime.',
    why: 'If the same token resolves to different values on different pages, the design is not consistent for end users. This often comes from theme overrides, cascade differences, or conditional styles.',
    fix: 'Investigate why the token resolves differently and unify the source — check for theme overrides, conditional blocks, or cascade ordering.'
  },
  orphan: {
    severity: 'info',
    title: 'Orphan Token',
    summary: 'A token is declared but never referenced anywhere.',
    why: 'Unused tokens add noise to your stylesheet and make the token system harder to maintain. They can also confuse teammates who wonder if the token is intentional.',
    fix: 'Remove the declaration if it is no longer needed, or add a reference if it should be used.'
  },
  'duplicate-value': {
    severity: 'warn',
    title: 'Duplicate Value',
    summary: 'Multiple token names share the same value.',
    why: 'When several tokens hold the same value, updates require changing every one. This is wasteful and increases the chance of missed updates and inconsistency.',
    fix: 'Make the secondary tokens alias the primary token with var(--primary), so a single change propagates everywhere.'
  },
  namespace: {
    severity: 'warn',
    title: 'Namespace Inconsistency',
    summary: 'Multiple naming families coexist (e.g. --color-* and --bg-*).',
    why: 'Inconsistent naming conventions make tokens harder to find and reason about. They also suggest an unclear token taxonomy, which slows down maintenance.',
    fix: 'Unify naming under a single convention so token names follow a predictable pattern.'
  },
  hardcoded: {
    severity: 'warn',
    title: 'Hardcoded Value',
    summary: 'A raw color or space value is used instead of a token reference.',
    why: 'Hardcoded values bypass the token system, so they cannot be updated by changing a token. This leads to drift and makes theme changes or rebranding tedious.',
    fix: 'Map the hardcoded value to an appropriate token reference so it is controlled by the token system.'
  },
  'cascade-override': {
    severity: 'warn',
    title: 'Cascade Override',
    summary: 'CSS cascading produces unintended value variation.',
    why: 'When a token is redefined in a nested scope, the cascade can produce unexpected values for consumers. This is a common source of subtle visual bugs.',
    fix: 'Decide whether the override is intentional. If not, refactor to avoid the cascade shadowing the intended value.'
  },
  'state-variation': {
    severity: 'warn',
    title: 'State Variation',
    summary: 'Token values differ across component states (e.g. :hover, :focus).',
    why: 'State-specific values can be intentional, but if they are not formalized as tokens they become hard to maintain and document.',
    fix: 'Decide whether to formalize state values as dedicated tokens or accept the variation. Formalize if states are reused across components.'
  },
  'theme-variation': {
    severity: 'warn',
    title: 'Theme Variation',
    summary: 'Token values differ across themes (e.g. dark/light).',
    why: 'Theme-specific values should be deliberately structured. Unstructured theme variation can make dark mode or multi-brand setups fragile.',
    fix: 'Decide whether to formalize the theme structure with dedicated theme tokens, or accept the variation.'
  },
  'dynamic-variable': {
    severity: 'info',
    title: 'Dynamic Variable',
    summary: 'A token has a dynamic (non-static) value, such as one computed at runtime.',
    why: 'Dynamic values can be powerful but they break the assumption that tokens are static and declarative. They can also make static analysis and export more complex.',
    fix: 'Decide how to handle the dynamic behavior — some tools may need special treatment for dynamic tokens.'
  }
};

/**
 * Get the explanation for a finding type.
 * @param {string} type — Finding type ID (e.g. "conflict", "hardcoded")
 * @returns {object} { severity, title, summary, why, fix } or null if unknown
 */
export function explainFinding(type) {
  if (!type) return null;
  const key = String(type).toLowerCase().trim();
  return EXPLANATIONS[key] || null;
}

/** List all available finding types, sorted alphabetically. */
export function listFindingTypes() {
  return Object.keys(EXPLANATIONS).sort();
}

/** Format an explanation as human-readable text. */
export function formatExplanation(type) {
  const exp = explainFinding(type);
  if (!exp) {
    const available = listFindingTypes().join(', ');
    return `Unknown finding type: "${type}"\n\nAvailable types:\n  ${available}`;
  }
  const lines = [];
  lines.push(`${exp.title} (${exp.severity})`);
  lines.push('='.repeat(exp.title.length + exp.severity.length + 3));
  lines.push('');
  lines.push(exp.summary);
  lines.push('');
  lines.push('Why it matters:');
  lines.push(exp.why);
  lines.push('');
  lines.push('How to fix:');
  lines.push(exp.fix);
  return lines.join('\n');
}

export { EXPLANATIONS };
export default { explainFinding, listFindingTypes, formatExplanation, EXPLANATIONS };
