/**
 * polish — confirm module type declarations.
 */

import type { DeclarationGraph, Decision, Patch, ConfirmResult } from './types.js';

/**
 * Resolve designer-confirmed judgmental decisions into patches.
 * Delete patches embed the declaration's original line text so apply()
 * can refuse stale deletes. tokenize decisions replace literals with
 * var() references, merged per file+line. Decisions that cannot be
 * fulfilled are reported in `unmatched`, never silently skipped.
 */
declare function confirm(decisions: Decision[], graph: DeclarationGraph, target?: string): ConfirmResult;

export { confirm };
