[English](api-reference.md) | [中文](api-reference.zh-CN.md)

# API Reference

Complete type definitions and usage examples for all public API functions in `polish-design-tokens`.

TypeScript definitions are bundled with the package — no `@types` install needed.

## Modules

| Import Path | Exports |
|-------------|---------|
| `polish-design-tokens` | `extract`, `audit`, `runPipeline`, `scan`, `cross`, `measure`, `plan`, `generateDiffs`, `apply` |
| `polish-design-tokens/scan` | `scan`, `walk` |
| `polish-design-tokens/cross` | `cross`, `familyOf`, `isStateVariant`, `selectorClasses` |
| `polish-design-tokens/measure` | `measure` |
| `polish-design-tokens/plan` | `plan`, `PRIORITY_ORDER`, `MECHANICAL_IDS`, `JUDGMENTAL_IDS` |
| `polish-design-tokens/diff` | `generateDiffs` |
| `polish-design-tokens/apply` | `apply` |
| `polish-design-tokens/rollback` | `rollback` |

## Core Functions

### `extract(target, ignore?)`

Scan a directory for CSS custom property declarations and `var()` references. Returns a `DeclarationGraph`.

```typescript
import { extract } from 'polish-design-tokens';

const graph = extract('./src/styles');
// or with ignore patterns
const graph = extract('./src/styles', ['vendor', 'test']);
```

**Parameters:**
- `target` (string): File or directory path to scan
- `ignore` (string[]): Optional path fragments to skip

**Returns:** `DeclarationGraph` — contains declarations, references, conflicts, dangling refs, orphans, and summary counts.

---

### `audit(target, ignore?, observation?)`

Scan + cross-reference to produce a complete audit report with findings.

```typescript
import { audit, measure } from 'polish-design-tokens';

const observation = measure(runtimeData);
const report = audit('./src/styles', [], observation);

console.log(report.summary.bySeverity); // { error: 2, warn: 5, info: 3 }
```

**Parameters:**
- `target` (string): File or directory path to scan
- `ignore` (string[]): Optional path fragments to skip
- `observation` (RuntimeObservation | null): Optional runtime data from `measure()` for detecting `runtime-drift` and `hardcoded` findings

**Returns:** `AuditReport` — contains findings sorted by severity (error → warn → info).

---

### `runPipeline(target, ignore?, observation?)`

Full pipeline: extract → audit → plan → diff. Does **not** apply patches (requires explicit consent via `apply()`).

```typescript
import { runPipeline, apply } from 'polish-design-tokens';

const { graph, findings, plan, patches } = runPipeline('./src/styles');
const result = await apply(patches, './src/styles');
console.log(result.status, result.applied, result.failed, result.backupCount);
```

**Parameters:**
- `target` (string): File or directory path to scan
- `ignore` (string[]): Optional path fragments to skip
- `observation` (RuntimeObservation | null): Optional runtime data

**Returns:** `PipelineResult` — `{ graph, findings, plan, patches }`

---

### `scan(target, opts?)`

Low-level scan function. Same as `extract` but takes an options object.

```typescript
import { scan } from 'polish-design-tokens/scan';

const graph = scan('./src/styles', { ignore: ['vendor', 'test'] });
```

**Parameters:**
- `target` (string): File or directory path
- `opts.ignore` (string[] | string): Path fragments to skip, either as an array or a comma-separated string

**Returns:** `DeclarationGraph`

---

### `cross(graph, observation?)`

Judge a declaration graph to produce findings. This is the "critique" half of the pipeline.

```typescript
import { scan, cross } from 'polish-design-tokens/scan';
import { cross } from 'polish-design-tokens/cross';

const graph = scan('./src/styles');
const report = cross(graph);
```

**Parameters:**
- `graph` (DeclarationGraph): Output of `scan()`
- `observation` (RuntimeObservation | undefined): Optional runtime data

**Returns:** `AuditReport`

---

### `measure(docs?)`

Normalize raw runtime observation data into the format `cross()` expects. Does not perform browser measurement — collect values from Chrome DevTools or a similar tool first.

```typescript
import { measure } from 'polish-design-tokens/measure';

const observation = measure([
  { label: 'dashboard', theme: 'light', variables: { '--accent': '#e05800' } },
  { label: 'dashboard', theme: 'light', variables: { '--accent': '#ff6600' } }
]);
```

**Parameters:**
- `docs` (unknown[]): Array of raw document observations. Accepts alternative field names: `label`/`page`/`url`/`name`, `theme`/`mode`, `variables`/`resolved`/`values`.

**Returns:** `RuntimeObservation` — `{ documents: RuntimeDocument[] }`

---

### `plan(findings)`

Rank and classify findings into an ordered action queue.

```typescript
import { plan } from 'polish-design-tokens/plan';

const actions = plan(report.findings);
// actions[0]: { finding, action: 'fix', type: 'mechanical', priority: 2, mechanical: true, judgmental: false }
```

**Parameters:**
- `findings` (Finding[]): Output of `audit()` or `cross()`

**Returns:** `PlanAction[]` — sorted by priority, each classified as mechanical or judgmental.

---

### `generateDiffs(planItems)`

Generate concrete patches for mechanical plan items only.

```typescript
import { generateDiffs } from 'polish-design-tokens/diff';

const patches = generateDiffs(actions);
// [{ type: 'replace', file: 'src/tokens.css', line: 12, before: '#1a1a2e', after: 'var(--bg)', reason: '...', findingId: 'duplicate-value' }]
```

**Parameters:**
- `planItems` (PlanAction[]): Output of `plan()`

**Returns:** `Patch[]` — only mechanical items produce patches.

---

### `apply(patches, target?)`

Apply patches to files with automatic backup protection.

```typescript
import { apply } from 'polish-design-tokens/apply';

const result = await apply(patches, './src');
// { status: 'applied',
//   applied: [{ file, line }], failed: [{ file, error }], backupCount: 3,
//   backups: [{ file, backup, runId }], rolledBack: [{ file }] }
```

**Parameters:**
- `patches` (Patch[]): Output of `generateDiffs()`
- `target` (string): Directory that patches must stay within. Defaults to `process.cwd()`.

**Returns:** `Promise<ApplyResult>` — `{ status, applied, failed, backupCount, backups, rolledBack }`

**Safety:** The run is strictly all-or-nothing. Every patch is pre-validated against the current file contents before any write; if any patch fails pre-validation, nothing is written and `status` is `"aborted"`. Each file is backed up before the first patch touches it: the first run creates `file.backup`, later runs snapshot to `file.backup.<runId>` (the original backup is never overwritten). If a patch fails at execution time, every file written by the run is automatically restored from its backup, reported in `rolledBack`, and `status` is `"rolledBack"`. The `backups` manifest can be passed to `rollback()` for a later manual restore.

---

### `rollback(backups, target?)`

Restore files from the backup manifest produced by an `apply()` run.

```typescript
import { rollback } from 'polish-design-tokens/rollback';

const { backups } = await apply(patches, './src');
const result = await rollback(backups, './src');
// { restored: [{ file }], failed: [{ file, error }] }
```

**Parameters:**
- `backups` (Array<{ file: string; backup: string; runId?: string }>): The `backups` array from an `apply()` result
- `target` (string): Directory that files must stay within. Defaults to `process.cwd()`.

**Returns:** `Promise<RollbackResult>` — `{ restored, failed }`

**Safety:** Only files inside the target directory are restored; other entries are refused. Backups must be server-generated canonical siblings — `<file>.backup` or `<file>.backup.<runId>` matching the entry's `runId`; anything else is refused so an untrusted manifest cannot inject foreign file content into the project. A missing backup is reported as failed and the file is left untouched. Backups themselves are never modified or deleted.

## Types

### `DeclarationGraph`

The complete output of `scan()`:

```typescript
interface DeclarationGraph {
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
```

### `Finding`

A single audit finding:

```typescript
interface Finding {
  id: FindingId;           // 'conflict' | 'dangling' | 'runtime-drift' | ...
  severity: 'error' | 'warn' | 'info';
  title: string;
  detail: string;
  evidence: FindingEvidence[];
  suggestion: string;
  refCount?: number;
}
```

### `PlanAction`

A single action item in the plan:

```typescript
interface PlanAction {
  finding: Finding;
  action: 'fix' | 'review' | 'note';
  type: 'mechanical' | 'judgmental' | 'unknown';
  priority: number;
  mechanical: boolean;
  judgmental: boolean;
}
```

### `Patch`

A concrete patch:

```typescript
interface Patch {
  type: 'replace' | 'add' | 'delete' | 'rewrite';
  file: string | null;
  line: number | null;
  before: string;
  after: string;
  reason: string;
  findingId: FindingId;
}
```

Note: `delete` patches must carry `before` (the expected original line text). The line is verified against the file before deletion, and a delete without `before` is rejected — blind line-number deletion is never performed.

### `ApplyResult`

Result of applying patches:

```typescript
interface ApplyResult {
  status: 'applied' | 'aborted' | 'rolledBack';
  applied: Array<{ file: string; line: number | string }>;
  failed: Array<{ file: string | null; line?: number; error: string }>;
  backupCount: number;
  backups: Array<{ file: string; backup: string; runId: string }>;
  rolledBack: Array<{ file: string }>;
}

### `RollbackResult`

Result of restoring files from backups via `rollback()`:

```typescript
interface RollbackResult {
  restored: Array<{ file: string }>;
  failed: Array<{ file: string | null; error: string }>;
}
```

## Finding Types

| ID | Severity | Classification | Description |
|----|----------|----------------|-------------|
| `conflict` | error | Judgmental | Same token name with different values in root scope |
| `dangling` | error | Judgmental | Token referenced but never declared |
| `runtime-drift` | error | Judgmental | Inconsistent token values across pages at runtime |
| `orphan` | warn | Judgmental | Declared but never referenced |
| `duplicate-value` | warn | Mechanical | Multiple token names sharing the same value |
| `namespace` | info | Judgmental | Multiple naming families coexist |
| `hardcoded` | warn | Judgmental | Raw color/space values used instead of token references |
| `cascade-override` | info | Judgmental | CSS cascading produces unintended variation |
| `state-variation` | info | Judgmental | Token values differ across component states |
| `theme-variation` | info | Judgmental | Token values differ across themes |
| `dynamic-variable` | info | Judgmental | Tokens with dynamic (non-static) values |
| `tailwind-utility-var` | info | Judgmental | Tailwind v4 per-utility variables |
