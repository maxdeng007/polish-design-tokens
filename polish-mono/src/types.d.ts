/**
 * polish — shared TypeScript type definitions.
 *
 * These types describe the data structures exchanged between the pipeline
 * stages: scan → cross → plan → diff → apply.
 */

/** Classification of a token value's semantic kind. */
export type TokenKind =
  | 'color'
  | 'dimension'
  | 'duration'
  | 'angle'
  | 'easing'
  | 'shadow'
  | 'font-family'
  | 'other';

/** Where a declaration originates from. */
export type DeclarationOrigin =
  | 'css'
  | 'style-block'
  | 'inline-attribute'
  | 'js-object'
  | 'js-setproperty';

/** Scope context of a declaration. */
export type DeclarationScope = 'root' | 'theme' | 'selector';

/** A single CSS custom property declaration with location info. */
export interface Declaration {
  name: string;
  raw: string;
  kind: TokenKind;
  scope: DeclarationScope;
  selector: string | null;
  media: string | null;
  themes: string[];
  file: string;
  line: number;
  aliases: string[];
  origin?: DeclarationOrigin;
  resolved?: string | null;
  resolvedKind?: TokenKind;
  unresolvedRefs?: string[];
  effective?: string | null;
}

/** A var(--name) reference found in source. */
export interface Reference {
  name: string;
  file: string;
  line: number;
}

/** A single value variant within a conflict group. */
export interface ConflictVariant {
  value: string;
  raw: string;
  count: number;
  scopes: string[];
  themes: string[];
  selectors: string[];
  origins: string[];
  locations: Array<{
    file: string;
    line: number;
    scope: string;
    selector: string | null;
    themes: string[];
  }>;
}

/** A same-name, different-value conflict fact. */
export interface Conflict {
  name: string;
  variants: ConflictVariant[];
  aliases: string[];
  keywords: string[];
  kinds: string[];
}

/** A token referenced but never declared. */
export interface DanglingRef {
  name: string;
  count: number;
}

/** A token declared but never referenced. */
export interface Orphan {
  name: string;
  declarations: number;
  scopes: string[];
}

/** Counts from the scan phase. */
export interface ScanSummary {
  files: number;
  declarations: number;
  uniqueTokens: number;
  references: number;
  conflicts: number;
  dangling: number;
  orphans: number;
}

/** The complete output of scan(). */
export interface DeclarationGraph {
  version: number;
  root: string;
  target: string;
  files: string[];
  themes: string[];
  declarations: Declaration[];
  references: Reference[];
  conflicts: Conflict[];
  dangling: DanglingRef[];
  orphans: Orphan[];
  summary: ScanSummary;
}

/** All finding identifiers the tool can produce. */
export type FindingId =
  | 'conflict'
  | 'dangling'
  | 'runtime-drift'
  | 'orphan'
  | 'duplicate-value'
  | 'namespace'
  | 'hardcoded'
  | 'cascade-override'
  | 'state-variation'
  | 'theme-variation'
  | 'dynamic-variable'
  | 'tailwind-utility-var';

/** Severity level of a finding. */
export type Severity = 'error' | 'warn' | 'info';

/** Structured evidence attached to a finding. */
export interface FindingEvidence {
  name?: string;
  count?: number;
  value?: string;
  file?: string;
  line?: number;
  primary?: string;
  secondary?: string;
  primaryFile?: string;
  primaryLine?: number;
  secondaryFile?: string;
  secondaryLine?: number;
  declarations?: number;
  scopes?: string[];
  theme?: string;
  documents?: string[];
  values?: string[];
  family?: string;
  tokens?: string[];
}

/** A single audit finding. */
export interface Finding {
  id: FindingId;
  severity: Severity;
  title: string;
  detail: string;
  evidence: FindingEvidence[];
  suggestion: string;
  refCount?: number;
}

/** The complete output of cross() (audit report). */
export interface AuditReport {
  version: number;
  target: { kind: 'path' | 'unknown'; value: string | null };
  summary: {
    declarations: number;
    uniqueTokens: number;
    runtimeVariables: number;
    runtimeDocuments: number;
    findings: number;
    bySeverity: { error?: number; warn?: number; info?: number };
  };
  findings: Finding[];
}

/** A single runtime document observation. */
export interface RuntimeDocument {
  label: string;
  theme: string;
  variables: Record<string, string>;
}

/** Normalized runtime observation from measure(). */
export interface RuntimeObservation {
  documents: RuntimeDocument[];
}

/** A single action item in the plan. */
export interface PlanAction {
  finding: Finding;
  action: 'fix' | 'review' | 'note';
  type: 'mechanical' | 'judgmental' | 'unknown';
  priority: number;
  mechanical: boolean;
  judgmental: boolean;
}

/** A concrete patch generated for a mechanical finding or confirmed decision. */
export interface Patch {
  type: 'replace' | 'add' | 'delete' | 'rewrite';
  file: string | null;
  line: number | null;
  before: string;
  after: string;
  reason: string;
  findingId: FindingId;
}

/** A designer-confirmed judgmental decision for polish confirm(). */
export interface Decision {
  action: 'delete' | 'alias' | 'rename';
  token?: string;
  from?: string;
  to?: string;
}

/** Result of applying patches. */
export interface ApplyResult {
  applied: Array<{ file: string; line: number | string }>;
  failed: Array<{ file: string | null; line?: number; error: string }>;
  backupCount: number;
  /** Run-level backup manifest: [{file, backup}] for restore via rollback(). */
  backups: Array<{ file: string; backup: string }>;
  /** Files auto-restored when a later patch failed at execution time. */
  rolledBack: Array<{ file: string }>;
}

/** Result of restoring files from backups via rollback(). */
export interface RollbackResult {
  restored: Array<{ file: string }>;
  failed: Array<{ file: string | null; error: string }>;
}

/** Output of runPipeline(). */
export interface PipelineResult {
  graph: DeclarationGraph;
  findings: Finding[];
  plan: PlanAction[];
  patches: Patch[];
}

/** Result summary returned by runWizard(). */
export interface WizardResult {
  target: string | null;
  status:
    | 'completed'
    | 'clean'
    | 'quit'
    | 'stopped'
    | 'aborted'
    | 'no-patches'
    | 'partial'
    | 'error';
  findings: number;
  planActions: number;
  patches: number;
  applied: number;
  failed: number;
  backups: number;
}

/** Options for runWizard(). */
export interface WizardOptions {
  target?: string;
  ignore?: string[];
  prompt?: (question: string) => Promise<string>;
  write?: (text: string) => void;
}
