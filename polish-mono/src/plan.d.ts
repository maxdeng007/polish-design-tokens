/**
 * polish — plan module type declarations.
 */

import type { Finding, PlanAction } from './types.js';

/** Priority order mapping finding IDs to integer ranks. */
declare const PRIORITY_ORDER: Array<[string, number]>;

/** Set of finding IDs classified as mechanical (auto-fixable). */
declare const MECHANICAL_IDS: Set<string>;

/** Set of finding IDs classified as judgmental (human review). */
declare const JUDGMENTAL_IDS: Set<string>;

/**
 * Rank and classify findings into an ordered action queue.
 * Findings are sorted by priority and classified as mechanical or judgmental.
 */
declare function plan(findings: Finding[]): PlanAction[];

export { plan, PRIORITY_ORDER, MECHANICAL_IDS, JUDGMENTAL_IDS };
