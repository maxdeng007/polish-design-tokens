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
export { apply } from './apply.js';
export { runWizard } from './wizard.js';

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

export { extract, audit, runPipeline };
