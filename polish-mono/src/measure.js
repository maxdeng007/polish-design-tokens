/**
 * measure — normalize runtime observation data for cross().
 *
 * Accepts runtime data collected from a browser (via DevTools or similar)
 * and normalizes it into the format cross() expects. Does not perform
 * browser measurement itself — that requires Chrome DevTools and is
 * handled by the companion token-audit-mcp package.
 */

/**
 * Normalize a raw document observation into the shape cross() expects.
 * Accepts common alternative field names to be forgiving of the source.
 * @param {object} doc - Raw document observation
 * @returns {object} Normalized document
 */
function normalizeDoc(doc) {
  if (!doc || typeof doc !== 'object') return null;
  return {
    label: doc.label || doc.page || doc.url || doc.name || 'unknown',
    theme: doc.theme || doc.mode || 'default',
    variables: doc.variables || doc.resolved || doc.values || {}
  };
}

/**
 * Build a RuntimeObservation from raw runtime data.
 * @param {Array} [docs=[]] - Array of document observations.
 *   Each document should have: label, theme, variables (map of token name → resolved value)
 * @returns {object} RuntimeObservation with `documents` array
 */
export function measure(docs = []) {
  if (!Array.isArray(docs)) docs = [];
  return {
    documents: docs.map(normalizeDoc).filter(Boolean)
  };
}