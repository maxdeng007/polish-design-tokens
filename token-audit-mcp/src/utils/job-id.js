import crypto from 'node:crypto';

/**
 * Generate deterministic job ID from target + ignore patterns.
 * Format: UUID v4-like string (8-4-4-4-12 hex segments).
 * 
 * @param {string} target - Local path or URL to audit
 * @param {string[]} ignore - Glob patterns to exclude (sorted)
 * @returns {string} UUID v4-like identifier
 */
export function generateJobId(target, ignore = []) {
  const sortedIgnore = [...(ignore || [])].sort();
  const input = [target, ...sortedIgnore].join('|');
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  
  // Format as UUID-like: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
}
