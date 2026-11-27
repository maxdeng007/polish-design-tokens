/**
 * polish — Design token superpower tool: extract · critique · apply
 *
 * Public API type declarations. Import from 'polish-design-tokens' in your project.
 */

import type {
  DeclarationGraph,
  AuditReport,
  RuntimeObservation,
  Finding,
  PlanAction,
  Patch,
  ApplyResult,
  RollbackResult,
  PipelineResult,
  WizardResult,
  WizardOptions,
} from './types.js';

// Re-export shared types for consumers.
export type {
  TokenKind,
  DeclarationOrigin,
  DeclarationScope,
  Declaration,
  Reference,
  ConflictVariant,
  Conflict,
  DanglingRef,
  Orphan,
  ScanSummary,
  DeclarationGraph,
  FindingId,
  Severity,
  FindingEvidence,
  Finding,
  AuditReport,
  RuntimeDocument,
  RuntimeObservation,
  PlanAction,
  Patch,
  ApplyResult,
  RollbackResult,
  PipelineResult,
  WizardResult,
  WizardOptions,
} from './types.js';

// Re-export from sub-modules.
export { scan } from './scan.js';
export type { ScanOptions } from './scan.js';
export { cross, familyOf, isStateVariant, selectorClasses } from './cross.js';
export { measure } from './measure.js';
export { plan, PRIORITY_ORDER, MECHANICAL_IDS, JUDGMENTAL_IDS } from './plan.js';
export { generateDiffs } from './diff.js';
export { confirm } from './confirm.js';
export { apply } from './apply.js';
export { rollback } from './rollback.js';
export { runWizard } from './wizard.js';

/**
 * A literal cluster detected by scan() + cross().
 */
export interface LiteralCluster {
  value: string;
  normalized: string;
  kind: string;
  count: number;
  files: Array<{ file: string; lines: number[] }>;
  suggestedName: string;
}

/**
 * Result of seed(): a draft token system generated from literal clusters.
 */
export interface SeedResult {
  /** Directory that was scanned (the raw target argument, as a string). */
  target: string;
  /** Resolved output directory the generated files were written to. */
  output: string;
  /** Absolute path of the derived tokens.css draft. */
  tokensCss: string;
  /** Absolute path of the authoritative tokens.seed.json. */
  seedFile: string;
  /** Both generated file paths. */
  outputFiles: string[];
  /** Number of tokens (one per literal cluster). */
  tokenCount: number;
  /** Number of detected literal clusters. */
  clusterCount: number;
  /** Decisions derived from chosenName, ready for polish confirm. */
  decisions: Array<{ action: 'tokenize'; value: string; to: string }>;
}

/**
 * Generate a draft token system (tokens.css + tokens.seed.json) from
 * detected literal clusters.
 * @param target - directory path to scan for literal clusters
 * @param opts - { output?: string (redirect output directory), force?: boolean (overwrite existing files) }
 * @throws Error with code 'SEED_EXISTS' and `conflicting` (paths) when
 *   tokens.css/tokens.seed.json already exist and force is false.
 */
declare function seed(
  target: string,
  opts?: { output?: string; force?: boolean },
): SeedResult;

/**
 * Extract tokens from a directory (alias for scan).
 */
declare function extract(target: string, ignore?: string[]): DeclarationGraph;

/**
 * Full critique: scan + cross. Returns findings.
 */
declare function audit(
  target: string,
  ignore?: string[],
  observation?: RuntimeObservation | null,
): AuditReport;

/**
 * Full pipeline: extract → audit → plan → diff.
 * Does NOT apply patches — that requires explicit consent.
 */
declare function runPipeline(
  target: string,
  ignore?: string[],
  observation?: RuntimeObservation | null,
): PipelineResult;

export { extract, audit, runPipeline, seed };
