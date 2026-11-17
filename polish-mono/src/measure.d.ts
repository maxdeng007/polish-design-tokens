/**
 * polish — measure module type declarations.
 */

import type { RuntimeObservation } from './types.js';

/**
 * Normalize raw runtime observation data into the shape cross() expects.
 * Accepts common alternative field names to be forgiving of the source.
 * Does not perform browser measurement — that is handled by the
 * companion token-audit-mcp package.
 */
declare function measure(docs?: unknown[]): RuntimeObservation;

export { measure };
