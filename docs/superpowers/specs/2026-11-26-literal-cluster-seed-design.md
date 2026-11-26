# polish — Literal Cluster & Seed Design Spec

**Date:** 2026-11-26
**Status:** Draft — under review (supersedes the in-chat design presented the same day)
**Product:** polish — design token superpower tool: extract · critique · apply

---

## 1. Background & Goals

The WorkBuddy v1.9.2 re-evaluation (7/10) confirmed the three v1.9.2 fixes work,
and restated the core gap: the "bridge" capability — helping a project move
from *no tokens* to *tokens* — is not built. polish audits token relationships;
a project with no tokens has no relationships to audit, so the tool's value
collapses to zero for exactly the audience that needs it most (small projects,
AI-generated demos).

This spec defines the **minimal viable slice** of that bridge, in three parts:

1. **`literal-cluster` finding** — statically detect literal values (colors,
   spacing, radii, font sizes) that repeat across a project and therefore look
   like de-facto tokens.
2. **`polish seed`** (CLI + MCP tool) — generate a draft `tokens.css` and an
   editable naming map, so a human or agent can turn clusters into a token
   system in minutes.
3. **`tokenize` decisions** — confirmed literal→`var()` rewrites flowing
   through the existing `polish confirm` → `apply` path with backup and
   rollback.

**Success criterion:** on a project with repeated literal values and no tokens,
a user can run `polish seed`, edit names, run `polish confirm`, and end up
with a working token system where literals are replaced by `var()` references
— with every write backed up and rollback-able.

## 2. Scope

**In scope:**

- Literal-value collection during `scan()` (CSS rules, HTML inline styles,
  JS/JSX/TS style objects in CSS context).
- Clustering in `cross()` and a new `literal-cluster` finding (registry-driven,
  severity `info`, judgmental).
- `polish seed` CLI command + `polish_seed` MCP tool (10th tool).
- `tokenize` decision action in `confirm()`, with same-line patch merging.
- Type declarations (`literals`, `tokenize`, `seed`) and Node API `seed()`.
- The 0-token warning-note wording fix (actionable pointer).

**Out of scope (explicitly deferred):**

- Full/automatic tokenization — names are always human/agent-confirmed.
- Semantic naming (determining that `#0a0a0a` "is" a background color). The
  suggested name is a provisional ordinal placeholder only.
- Cross-unit normalization (`8px` vs `0.5rem` are different clusters).
- A `polish_confirm` MCP tool (none exists today; decisions continue to flow
  through the CLI and the Node API only).
- Wizard changes — `literal-cluster` findings flow through the wizard,
  report, and plan automatically as ordinary info/judgmental findings.
- Named-color normalization (see §6.2 — declared non-goal).

## 3. Design Decisions (review outcome, 2026-11-26)

The in-chat design was reviewed; the following decisions are binding and
revise it:

1. **Same-line patch merging.** A line like `padding: 8px 16px` contains two
   literal occurrences. Without merging, confirm would emit two `replace`
   patches whose `before` is identical (the whole original line); `apply()`'s
   execution-time check would fail the second and roll back the whole run.
   All substitutions are grouped by `file + line` and merged into **one**
   `replace` patch per line.
2. **Priority 13, not 8.** Inserting at priority 8 would shift the existing
   8–12 types, breaking the public priority contract, demo JSON, and tests.
   `literal-cluster` gets **priority 13** (end of the queue); no existing
   priorities change.
3. **`tokens.seed.json` is the single source of truth.** It carries the naming
   map plus a `decisions` array generated from `chosenName`. `tokens.css` is a
   derived draft. If either file exists, `polish seed` refuses without
   `--force` (covers both files independently).
4. **JS/JSX scan scope.** AI-generated React demos put colors in
   `style={{ ... }}`; `parseJs` already has `jsStringIsCssContext`, so
   including CSS-context strings costs little. Scan scope is CSS rules +
   HTML inline styles + JS/JSX/TS CSS-context style values.
5. **Named colors are not normalized.** `normalizeValue` does not map
   `white` → `#fff`. The literal pipeline declares this explicitly:
   `white` and `#fff` land in different clusters. Documented in spec and
   covered by a test. (Adding a name→hex map was considered and rejected:
   partial maps create misleading clustering.)
6. **Scalar full-match.** Each whitespace-separated component of a property
   value must fully match a scalar pattern (`^…$`). A value with any
   non-scalar component — e.g. `background: #fff url(...)` — is skipped
   entirely, not partially collected.
7. **Threshold simplified.** Report a cluster when its total occurrence count
   is **≥ 2**. The previous "≥2 occurrences OR spans ≥2 files" rule is
   redundant and is dropped.
8. **Provisional ordinal names.** Suggested names are `--{kind}-{ordinal}`
   (e.g. `--color-1`, `--space-2`) with a source comment; all names are
   marked **provisional**. Values are never baked into names.
9. **MCP contract updates.** `polish_seed` requires `target`; the CI contract
   test asserting `tools.length === 9` becomes `10`; all READMEs and
   `docs/mcp-integration.*` updated.
10. **Types and Node API.** `literals` added to the graph types, `tokenize`
    added to `Decision`, `seed()` exported from the package root with
    matching `.d.ts` declarations.
11. **Unmatched decisions are reported.** When confirm's re-scan cannot find
    a decision's literal value, the decision is reported as unmatched — never
    silently skipped.

## 4. Architecture

The slice threads through the existing pipeline stages without new write
paths:

```
scan.js ──literals──▶ DeclarationGraph.literals
  │
  ▼
cross.js ──cluster──▶ literal-cluster findings (registry: info / judgmental / 13)
  │
  ├─▶ polish seed ──▶ tokens.css (derived) + tokens.seed.json (authoritative)
  │
  └─▶ polish confirm (tokenize decisions)
            │  re-scan → group by file+line → one merged replace patch per line
            ▼
        apply.js (existing: pre-validation, backups, rollback)
```

### 4.1 Literal collection in the parsers

- **`parseCss`** — the existing state machine already walks declarations for
  custom properties (`--name`) and masks comments/strings with preserved
  offsets and line numbers. Literal collection is added **inside that same
  state machine** (not as a post-pass over raw text), reusing the masking,
  offset, and line-number machinery.
- **`parseHtml`** — `<style>` blocks delegate to the CSS path; inline
  `style="..."` attributes are parsed as declaration lists through the same
  literal extraction. Existing dispatch already handles both; no special
  casing needed.
- **`parseJs`** — CSS-context strings (`jsStringIsCssContext`) are extracted
  and run through the shared literal extractor. This covers `style={{...}}`
  objects in JSX/TSX and style objects in JS/TS.
- **Vue/Svelte** — follow the existing dispatch (`<style>` via CSS, `<script>`
  via JS, template inline styles via HTML); literals flow automatically.

A shared `extractLiterals(text, base)` helper in `src/lib/parse.js` implements
the scalar matching rules of §6.1 and returns occurrences with accurate file
offsets and line numbers.

### 4.2 `DeclarationGraph` extension

`scan()` collects `parsed.literals` from every parsed file into a graph-level
array:

```js
literals: [
  { value: '#0a0a0a', normalized: '#0a0a0a', kind: 'color',
    property: 'background', file: 'a.css', line: 12 },
  { value: '8px', normalized: '8px', kind: 'space',
    property: 'padding', file: 'b.css', line: 3 }
]
```

`ScanSummary` gains `literals: number`.

### 4.3 `literal-cluster` in `cross()`

`cross()` clusters `graph.literals` by `normalized` (plus `kind`, which is
implied by the value) and emits one finding per cluster meeting the threshold
of §6.3. The finding is built through the registry (`severityOf`, etc.), so
`plan()` and `explain` pick it up automatically.

Finding shape:

```js
{
  id: 'literal-cluster',
  severity: 'info',
  title: 'Literal Cluster',
  detail: 'The same literal value appears N times — a token candidate.',
  evidence: [
    { value, normalized, count,
      files: [{ file, lines: [..] }],        // grouped locations
      suggestedName: '--color-1' }            // provisional
  ],
  suggestion: 'Run `polish seed` to generate a token draft, edit names in tokens.seed.json, then run `polish confirm`.'
}
```

### 4.4 `polish seed`

New module `src/seed.js` exporting `seed(target, opts) → SeedResult`.

- Runs `scan()` and the same clustering as `cross()`.
- Writes **`tokens.css`** — a `:root` block grouped by kind, each declaration
  commented with its source literal, occurrence count, and the
  **provisional** marker. Derived from the map; never hand-edited
  meaningfully.
- Writes **`tokens.seed.json`** — the authoritative artifact:

```json
{
  "target": "./my-project",
  "values": [
    {
      "value": "#0a0a0a",
      "normalized": "#0a0a0a",
      "kind": "color",
      "count": 12,
      "files": [{ "file": "a.css", "lines": [12, 30] }]
    }
  ],
  "map": [
    { "value": "#0a0a0a", "chosenName": "--color-1", "provisional": true }
  ],
  "decisions": [
    { "action": "tokenize", "value": "#0a0a0a", "to": "--color-1" }
  ]
}
```

The `decisions` array is generated from `chosenName` (defaulting to
`suggestedName` when the map entry is unedited), so the file can be edited and
fed straight to `polish confirm`.

- **Overwrite policy:** if `tokens.css` or `tokens.seed.json` already exists,
  seed refuses with an error listing the conflicting paths; `--force`
  overwrites. (No `--force`, no overwrite — the refusal is the safety rail.)
- **CLI:** `polish seed <target> [--output=dir] [--force] [--summary]`.
  Default output dir is the target root.
- **MCP:** `polish_seed { target: string (required), output?: string, force?: boolean }` →
  `SeedResult` with `outputFiles`, `tokenCount`, `clusterCount`. Standard
  `outputSchema` + `structuredContent` contract like the other tools.

### 4.5 `tokenize` decisions in `confirm()`

New decision action:

```json
{ "action": "tokenize", "value": "#0a0a0a", "to": "--color-1" }
```

Confirm semantics:

1. Re-scan the target (fresh `literals`).
2. For each decision, locate occurrences by normalized value.
3. **Ambiguity check:** if two decisions map the same value to different
   `to` names, refuse the entire run with an error (no patches).
4. **Unmatched reporting:** a decision whose value is found in zero
   occurrences is reported in the result's `unmatched` array with a reason —
   never silently dropped.
5. **Same-line merging:** all substitutions are grouped by `file + line`.
   For each line, segments (start, end, replacement) are collected, sorted
   left-to-right, and composed into a single `replace` patch whose `before`
   is the original line and whose `after` has every literal replaced by
   `var(--to)` in place. Example: `padding: 8px 16px` with both values
   tokenized becomes one patch, `padding: var(--space-1) var(--space-2)`.
6. **Declaration patch:** if `to` is not declared anywhere in the scanned
   target, an `add` patch appends the declaration to `tokens.css` at the
   target root (created if absent). If `to` is already declared, no add patch.
7. Patches carry `findingId: 'literal-cluster'` and flow into `apply()`
   unchanged — pre-validation, backups, abort/rollback semantics all apply.

**Contract change:** `confirm()` now returns `{ patches, unmatched }` instead
of a bare `Patch[]`. `unmatched: Array<{ decision, reason }>`.

## 5. Contract Changes Summary

| Surface | Change |
|---|---|
| `DeclarationGraph` | + `literals: LiteralOccurrence[]`; `summary.literals` |
| `FindingId` | + `'literal-cluster'` |
| findings registry | `literal-cluster`: info / judgmental / priority **13** |
| `Decision.action` | + `'tokenize'` (fields `value`, `to`) |
| `confirm()` return | `Patch[]` → `{ patches, unmatched }` |
| `scan()` / `parseSource()` | parsed result gains `literals` |
| Node API | + `seed(target, opts)` exported from package root |
| MCP | + `polish_seed` (10th tool, `target` required) |
| CLI | + `polish seed <target> [--output=dir] [--force] [--summary]` |
| 0-token note | wording change in `cross.js` (§8) |

## 6. Detailed Rules

### 6.1 Whitelist and scalar matching

Whitelisted properties, mapped to a literal kind (data-driven constant, easy
to extend later):

| Property | Kind |
|---|---|
| `color`, `background`, `border-color` | `color` |
| `padding`, `gap` | `space` |
| `font-size` | `font-size` |
| `border-radius` | `radius` |

Matching is case-insensitive; HTML custom-property declarations (`--x`) are
never literals — only standard properties in the whitelist.

A property value is split on whitespace. **Every** component must fully match
(`^…$`) one scalar pattern:

- hex color: `#rgb`, `#rrggbb` (and `#rrggbbaa`)
- `rgb(…)` / `hsl(…)` (full-match on the function form)
- named color, matched as-is (no normalization — §6.2)
- dimension: `<number>` followed by a length unit (`px`, `rem`, `em`, …)

If **any** component fails the scalar match — `url(…)`, `calc(…)`,
unitless numbers, keywords like `currentColor` or `inherit` — the **entire
value is skipped**, no partial collection. (`transparent` is a named color
and matches as-is, clustering only with other literal `transparent`.) This
handles `background: #fff url(...)` (skipped entirely) and
`padding: 8px 16px` (both components scalar → two occurrences on the same
line).

Values containing `var()` are skipped (they are references, not literals).

### 6.2 Normalization limits (declared non-goals)

- **Named colors are not normalized.** `white` and `#fff` are different
  clusters. No name→hex map is added to the literal pipeline.
- **Units are not converted.** `8px` and `0.5rem` are different clusters;
  `normalizeValue`'s existing semantics apply.
- Clustering key: `normalizeValue(value)` — the same function `scan()` uses
  for conflict bucketing, so literal-cluster and conflict agree on what
  "same value" means for everything `normalizeValue` does cover.

### 6.3 Clustering and threshold

- Cluster key: normalized value.
- **Report when total occurrence count ≥ 2.** A value appearing once in one
  file is not reported (noise).
- Locations are grouped by file, with a list of line numbers per file;
  evidence caps the file/line listing at the same caps used elsewhere
  (8 locations) to keep findings bounded.
- Suggested name: `--{kind}-{ordinal}`, where clusters of the same kind
  are sorted by normalized value and numbered from 1 in that order
  (e.g. `--color-1`, `--color-2`, `--space-1`). Sorting by value makes the
  ordinals deterministic across runs. Provisional.

### 6.4 Seed output

- `tokens.css` is generated from the naming map in sorted, kind-grouped
  order; every declaration carries a comment:
  `/* provisional — from literal #0a0a0a (12× in 3 files) */`.
- `tokens.seed.json` carries `values`, `map`, `decisions` as shown in §4.4.
- Both files default to the target root; `--output` redirects.
- Existing-file policy: refuse without `--force`; with `--force`, overwrite.

### 6.5 Confirm integration

- `tokenize` is judgmental: it never appears in the mechanical plan queue and
  never generates patches via `polish diff`.
- Exit code: `polish confirm` exits 1 when any decision is unmatched or any
  patch fails — an unmatched decision is unfulfilled user intent.
- `--summary` output lists unmatched decisions explicitly before the
  apply report.

## 7. Error Handling

| Condition | Behavior |
|---|---|
| `to` name invalid (not starting with `--`) | Refuse the decision; reported as unmatched with reason |
| Same value mapped to two different `to` names | Ambiguity error; entire confirm run refused, no patches |
| Decision value not found in re-scan | Reported in `unmatched`; run continues with remaining decisions; exit 1 |
| `tokens.css` / `tokens.seed.json` exists at seed time | Refuse listing paths; `--force` overwrites |
| Patch `before` mismatch at apply time | Existing behavior: pre-validation abort / execution rollback — no new paths |
| Target unreadable / not a directory | Existing scan errors; no new paths |

## 8. Wording Fix (bundled, bounded)

The 0-token warning note in `cross.js` changes from the dead-end
"Define tokens first, then re-run" to an actionable pointer:

> No design tokens found — polish audits token relationships and cannot
> detect hardcoded values without tokens. Declare a few in a `:root` block,
> or run `polish seed` to generate a starter `tokens.css`, then re-run.

Flows through `format.js`, `report.js` banner, wizard, and MCP JSON
(summary.notes) exactly as in v1.9.2. Synchronized with the same release as
this slice, so the `polish seed` reference is valid.

## 9. Testing Plan

- **parser/scan:** whitelist collection per property; scalar full-match
  (`background: #fff url(...)` skipped whole; `padding: 8px 16px` yields two
  occurrences, same line); `var()` values skipped; HTML inline `style`
  collected; JSX `style={{...}}` collected via css-context strings;
  comment/string masking still holds for literals.
- **cross:** threshold (1 occurrence → not reported; 2 occurrences →
  reported); named-color non-normalization (`white` and `#fff` separate
  clusters); evidence shape and location caps; finding carries
  `literal-cluster` registry metadata.
- **seed:** output files exist with correct content; `decisions` derived
  from `chosenName`; edit-map-then-confirm round trip; existing-file refusal;
  `--force` overwrite.
- **confirm tokenize:** merged same-line patch (`padding: 8px 16px` →
  one `replace` patch, both substitutions); add patch when `to` undeclared;
  no add patch when declared; ambiguity refusal; unmatched reporting (value
  absent after edits).
- **apply integration:** tokenize patches flow through pre-validation,
  backups, and rollback (drive a failure mid-run and assert rollback).
- **MCP:** `tools/list` count is **10**; `polish_seed` advertises
  `outputSchema` and returns `structuredContent`; missing `target` rejected.
- **contract:** `confirm()` returns `{ patches, unmatched }`; graph
  `literals` shape; types compile under `tsc --noEmit`.
- **regression:** existing priority contract unchanged (PRIORITY_ORDER has
  literal-cluster at 13; prior priorities 1–12 untouched).

## 10. Deliverables & Documentation Sync

- `src/lib/parse.js` — `extractLiterals` + `parseCss`/`parseHtml`/`parseJs` wiring.
- `src/scan.js` — collect `literals` into the graph + summary.
- `src/findings.js` — register `literal-cluster` (info / judgmental / 13).
- `src/cross.js` — clustering + finding; note wording fix.
- `src/seed.js` (new) — `seed()`; `src/format.js` — `formatSeed`.
- `src/confirm.js` — `tokenize`, same-line merge, `unmatched`.
- `src/mcp-server.js` — `polish_seed` tool.
- `bin/polish.mjs` — `polish seed` command.
- `src/index.js` — export `seed`.
- `src/types.d.ts` — `LiteralOccurrence`, graph `literals`, `Decision.tokenize`,
  `SeedResult`, `confirm()` return type.
- `test/` — all cases in §9; CI contract assertion updated to 10 tools.
- Docs: `README.md`, `README.zh-CN.md`, `polish-mono/README.md`,
  `polish-mono/README.zh-CN.md`, `polish-mono/docs/mcp-integration.md`,
  `polish-mono/docs/mcp-integration.zh-CN.md` — MCP tool count 10,
  `polish seed` usage, `literal-cluster` in the findings list and priority
  table (row 13), Node API `seed()` row, and the 0-token note wording.
- `CHANGELOG.md` — new-capability entry under the next release.

## 11. Release & Versioning

New capability → minor version bump per the project's SemVer policy
(**v1.10.0**). Tag-driven release workflow unchanged. The `literal-cluster`
priority-13 decision and the `confirm()` return-shape change are contract
changes documented in the CHANGELOG Fixed/Changed section.

## 12. Open Questions

- None blocking. If the whitelist needs extension later, it is a data-driven
  constant — adding a property is a one-line change plus tests, no spec
  revision required.
