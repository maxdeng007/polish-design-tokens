/**
 * polish — diff module type declarations.
 */

import type { PlanAction, Patch } from './types.js';

/**
 * Generate concrete patches for mechanical plan items only.
 * Each patch specifies the exact text change, location, and reason.
 */
declare function generateDiffs(planItems: PlanAction[]): Patch[];

export { generateDiffs };
