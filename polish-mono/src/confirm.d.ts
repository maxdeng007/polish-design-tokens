/**
 * polish — confirm module type declarations.
 */

import type { DeclarationGraph } from './types.js';
import type { Decision, Patch } from './types.js';

/**
 * Resolve designer-confirmed judgmental decisions into patches.
 * Delete patches embed the declaration's original line text so apply()
 * can refuse stale deletes.
 */
declare function confirm(decisions: Decision[], graph: DeclarationGraph, target?: string): Patch[];

export { confirm };
