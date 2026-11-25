# Changelog

All notable changes to **polish** (`polish-design-tokens`) are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html):
new capabilities bump the minor version, fixes and polish bump the patch version.

## [Unreleased]

### Fixed

- **MCP output contract** — `polish_audit`, `polish_plan`, and `polish_diff`
  returned wrapper objects (`{ findings, summary, graphSummary, observation }`,
  `{ plan, summary }`, `{ patches, preview }`) while the README and MCP
  integration guide documented bare `AuditReport` / `PlanAction[]` / `Patch[]`.
  The wrappers are kept (they carry useful summary data), and all documentation
  now describes the actual response shapes. Tool descriptions in the MCP server
  now state the wrapper shapes explicitly. Added wire-level round-trip tests
  driving `audit → plan → diff → apply` over the JSON-RPC protocol, plus a
  contract test asserting each tool's documented wrapper keys.

- **False references from comments and strings** — the parser extracted
  `var()` references from raw source text, so `var(--x)` inside CSS/JS
  comments, JS documentation strings, and template literals was treated as a
  real reference and produced phantom `dangling` findings. References are now
  extracted from a lexically masked copy: comments are always masked, CSS
  string literals are masked, and JS strings/templates survive only when they
  sit in a CSS context (style-object values, custom-property values, or
  `setProperty()` arguments). Line numbers are preserved through masking.
  Added regression tests covering each boundary.

- **Stale deletes could remove the wrong line** — `delete` patches carried no
  original-line text, so apply() deleted purely by line number and could
  remove an unrelated line if the file changed after the audit. `confirm`
  now embeds the declaration's original line text in each delete patch (and
  drops decisions whose target line can no longer be verified), and `apply`
  refuses deletes whose line content no longer matches, reporting them as
  stale. File writes are now atomic (temp file + rename), so a failed write
  can never leave a half-written file.

### Added

- **Release infrastructure** — CI now runs the test suite across a Node 18/20/
  22 matrix with `npm ci`, plus a `typecheck` step validating the published
  `.d.ts` declarations (`tsc --noEmit`, new `tsconfig.json`). A new
  tag-driven **Release** workflow verifies the tag matches `package.json`,
  publishes to npm with the `NPM_TOKEN` secret, and creates a GitHub release
  with auto-generated notes. CONTRIBUTING documents the tag-driven release
  process.

## [1.8.0]

### Added

- **`polish report` filtering & search** — the HTML report toolbar now has a
  search box (matches token names, finding ids, and titles, case-insensitive)
  and severity chips (All / Error / Warn / Info). Non-matching cards are hidden,
  empty sections collapse, a "Showing X of Y findings" counter is shown, and a
  no-match empty state appears when nothing matches.

### Fixed

- **MCP `polish_apply` patch type mismatch** — the `polish_apply` input schema
  advertised `remove` as a patch type, but the apply implementation and the
  decision generator use `delete`. Agents following the schema could never send
  a valid delete patch. The schema enum now lists `delete`; add MCP end-to-end
  tests (initialize → tools/list → tools/call, boundary rejection, missing-target
  error).
- **Walkthrough dangling example** — the walkthrough previously presented
  `dangling` as a mechanical, auto-fixable finding with an `add` patch. `dangling`
  is judgmental: the walkthrough, demo plan, and demo patches now match the
  current implementation, and all demo artifacts were regenerated with the
  current pipeline.
- **`polish apply` quick-start examples** — the four-step pipeline in all four
  READMEs now passes `--target=./my-project` so patches resolve against the
  audited project instead of the shell's current directory.

### Changed

- Archived legacy `token-audit`-era examples (URL-fetched audits and static
  previews) under `examples/legacy-token-audit/` with a README explaining their
  provenance. Updated remaining source/docs references from `token-audit` /
  `token-audit-mcp` naming to current `polish` naming.

## [1.7.2]

### Changed

- `polish report`: added color swatches for hex values in evidence rows, and a
  "Copy decisions.json" button alongside download.

## [1.7.1]

### Changed

- `polish report`: tidied card/section spacing and rounded severity section
  corners.

## [1.7.0]

### Added

- **`polish report`** — generates a self-contained interactive HTML report:
  findings grouped by severity, decision checkboxes for orphan (delete) and
  duplicate-value (alias) findings, and download/copy of `decisions.json` for
  `polish confirm`.

## [1.6.0]

### Added

- **`polish check` and `polish fix`** — one-shot read-only audit and one-shot
  audit + mechanical-fix commands, so common workflows don't require chaining
  JSON files.

## [1.5.0]

### Added

- **`polish confirm`** — applies human-confirmed judgmental decisions (delete /
  alias / rename) with backups, closing the loop between the report and safe
  execution.

## [1.4.29]

### Fixed

- apply boundary check fix: patch paths are resolved against the target before
  the boundary check, and symlinked paths are resolved physically.

## [1.4.x]

### Added

- Interactive wizard mode (`polish` with no arguments).
- `polish explain` command and color-coded CLI output.
- `polish doctor` command (optional dependencies check, `--install` support).
- `--summary` and `--install` flags for user-friendly CLI output.
- Bilingual READMEs (English / 中文) with language switchers; translated docs
  pages.

### Fixed

- duplicate-value patches now target the **secondary** token's line, preventing
  self-referencing aliases (`--x: var(--x)`).
- `polish_diff` and `polish_apply` resolve relative paths via the target
  parameter; `apply()` defaults its target to `process.cwd()` to close the
  Node API boundary gap.
- conflict / cascade-override / namespace reclassified as judgmental — they
  require human canonical-value decisions.
- Findings translated to English; TypeScript type definitions added; automated
  tests and GitHub Actions CI workflow.

[Unreleased]: https://github.com/maxdeng007/polish-design-tokens/compare/v1.8.0...HEAD
[1.8.0]: https://github.com/maxdeng007/polish-design-tokens/compare/v1.7.2...v1.8.0
[1.7.2]: https://github.com/maxdeng007/polish-design-tokens/compare/v1.7.1...v1.7.2
[1.7.1]: https://github.com/maxdeng007/polish-design-tokens/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/maxdeng007/polish-design-tokens/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/maxdeng007/polish-design-tokens/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/maxdeng007/polish-design-tokens/compare/v1.4.29...v1.5.0
