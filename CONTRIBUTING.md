# Contributing to polish

Thanks for contributing to **polish** — a design token (CSS custom property)
auditor and safe fixer: extract → critique → apply.

## Repository layout

The npm package lives in **`polish-mono/`** — that is where all source code,
the CLI, the MCP server, and the test suite live. Root-level directories
(`examples/`, `docs/`) hold documentation and runnable examples that are not
published to npm.

```
polish-mono/
├── src/          # ESM source: scan, cross, plan, diff, apply, measure,
│                 # confirm, report, wizard, explain, MCP server, handlers
├── bin/polish.mjs  # CLI entry
├── test/         # node:test suite (*.test.js)
└── package.json  # npm package (exports, bin, files)
```

## Setup

Requires Node.js ≥ 18. No build step — the package is plain ESM JavaScript
with TypeScript declarations (`.d.ts`) maintained by hand.

```bash
cd polish-mono
npm install
```

## Testing

Tests use the built-in Node.js test runner. **The glob must be passed
explicitly — passing a directory (`test/`) does not work:**

```bash
# full suite
node --test test/*.test.js

# single file
node --test test/report.test.js
```

All tests must pass before a change is considered complete.

## Development workflow

1. **Write failing tests first (TDD).** New features and bug fixes start with
   a test that reproduces the expected behavior (RED), then a minimal
   implementation to make it pass (GREEN).
2. **Run the full suite** (`node --test test/*.test.js`) after any change.
3. **Keep the public contract in sync.** Adding a CLI command or export means
   updating all four READMEs (root + `polish-mono/`, English + 中文),
   `src/index.js` exports, `package.json` `exports` subpaths, and the
   matching `.d.ts` declarations.
4. **Verify report HTML in a browser.** Report markup is asserted in tests, but
   visual/behavioral changes should also be checked by generating a report for
   `examples/walkthrough/demo-project` and opening it.

## Key conventions

- **Mechanical vs judgmental.** Only `duplicate-value` is mechanical
  (auto-fixable). Everything else is surfaced for human or agent judgement —
  do not add silent auto-fixes for judgmental finding types.
- **ESM.** The package is `"type": "module"`; use `import`/`export`.
- **`.d.ts` files.** Function declarations use `declare function`, types use
  `export interface` / `export type` — never `export function` in `.d.ts`.
- **apply safety.** Boundary checks must use `fs.realpathSync()` (symlink-
  resolving), never `path.resolve()` alone. Backups (`<file>.backup`) are
  created before modification and never overwritten.
- **Version bumps.** New feature → minor bump; fix/polish → patch bump.
  Update `CHANGELOG.md` with the change.

## Submitting changes

- Open a pull request from a feature branch against `main`.
- Describe what changed and how it was tested.
- Keep changes focused; unrelated refactors make review harder.

## Reporting bugs

See [`SECURITY.md`](SECURITY.md) for security concerns, and open a GitHub
issue for everything else. Include the target project's token files (or a
minimal reproduction) and the exact `polish` command you ran.
