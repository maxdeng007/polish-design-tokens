/**
 * Plain-language explanations for each finding type.
 * Used by `polish explain <finding-type>` to help users understand
 * what a finding means and why it matters — without reading the README.
 *
 * The explanation text and severity are the registry's (findings.js),
 * so `polish explain` can never disagree with the audit output.
 */

import { FINDING_META } from './findings.js';

const EXPLANATIONS = Object.fromEntries(
  Object.values(FINDING_META).map(meta => [meta.id, {
    severity: meta.severity,
    title: meta.title,
    summary: meta.summary,
    why: meta.why,
    fix: meta.fix
  }])
);

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
