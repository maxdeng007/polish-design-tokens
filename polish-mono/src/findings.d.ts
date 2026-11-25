/**
 * polish — finding metadata registry type declarations.
 */

import type { FindingId, FindingMeta, Severity, FindingClassification } from './types.js';

/** The single source of truth for finding id → severity, priority, classification, and explanation. */
export declare const FINDING_META: Record<FindingId, FindingMeta>;

/** Get the metadata entry for a finding id, or null if unknown. */
export declare function getFindingMeta(id: string): FindingMeta | null;

/** List every registered finding id, in priority order. */
export declare function listFindingIds(): FindingId[];

/** Canonical severity for a finding id. */
export declare function severityOf(id: string): Severity | null;

/** Priority rank for a finding id (lower sorts earlier), or null if unknown. */
export declare function priorityOf(id: string): number | null;

/** Classification for a finding id: 'mechanical' or 'judgmental', or null if unknown. */
export declare function classificationOf(id: string): FindingClassification | null;

/** Whether a finding id is mechanical (auto-fixable). */
export declare function isMechanical(id: string): boolean;

/** Whether a finding id is judgmental (needs human review). */
export declare function isJudgmental(id: string): boolean;

/** [id, priority] pairs sorted by priority — the plan module's PRIORITY_ORDER. */
export declare const PRIORITY_ORDER: Array<[FindingId, number]>;

/** Mechanical finding ids — the only ones auto-fixable by diff + apply. */
export declare const MECHANICAL_IDS: Set<FindingId>;

/** Judgmental finding ids — surfaced for human or agent review. */
export declare const JUDGMENTAL_IDS: Set<FindingId>;
