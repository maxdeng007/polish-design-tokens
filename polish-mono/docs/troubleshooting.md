[English](troubleshooting.md) | [中文](troubleshooting.zh-CN.md)

# Troubleshooting

Common issues, error messages, and their solutions.

## CI / Build Failures

### `require is not defined in ES module scope`

**Cause:** The package is `"type": "module"` but a source file uses CommonJS `require()`.

**Fix:** Ensure all source files use ESM syntax (`import`/`export`). Check that the files pushed to GitHub are the ESM versions, not stale CommonJS copies. Run `node --test test/*.test.js` locally to verify.

### `missing export named 'scan'` or `missing export named 'cross'`

**Cause:** The GitHub repository has stale CommonJS versions of `scan.js` and `cross.js` that don't export the expected names.

**Fix:** Push the ESM versions. The CI workflow checks for these exports. Use SSH to push (PAT may lack workflow scope permissions):

```bash
git checkout -b fix/esm-sources
git add src/scan.js src/cross.js
git commit -m "fix: push ESM source files"
git push -u origin fix/esm-sources
```

## MCP Tool Issues

### `polish_style_lookup` returns `found: false`

**Cause:** No external design-md skill files found, and no `brand` parameter was provided.

**Fix:** Pass a `brand` parameter to use bundled data:

```json
{ "brand": "vercel" }
```

Available bundled brands: `vercel`, `stripe`, `linear`, `notion`, `anthropic`, `github`, `shadcn`, `figma`.

Alternatively, install the awesome-design-md skill for full brand coverage beyond the bundled set.

### MCP server fails to start

**Cause:** `polish` command not on PATH, or Node.js version < 18.

**Fix:** Use `npx` in your MCP config:

```json
{
  "mcpServers": {
    "polish": {
      "command": "npx",
      "args": ["-y", "polish-design-tokens", "mcp"]
    }
  }
}
```

Verify Node.js version: `node --version` (must be ≥ 18).

### `polish_apply` reports `before text "..." not found`

**Cause:** The patch's `before` string doesn't match the file content exactly. This can happen if:
- The file was modified after the audit ran
- Whitespace/quote differences between the audit output and the actual file
- Multiple patches target the same line and the first one changed the content

**Fix:** Regenerate patches from a fresh audit. Check the `.backup` file created before the apply to see the original content. The backup file is named `<original-file>.backup`.

### `polish_apply` reports `line out of range`

**Cause:** The patch references a line number that doesn't exist in the file. This can happen if:
- The file was truncated or modified after the audit
- The patch was generated against a different version of the file

**Fix:** Regenerate patches from a fresh audit. Ensure the target directory hasn't changed between audit and apply.

## Audit Issues

### No `runtime-drift` or `hardcoded` findings appear

**Cause:** These finding types require a `RuntimeObservation` from `measure()`. Static-only audits (without observation data) won't produce them.

**Fix:** Provide runtime observation data. Collect browser-measured values from Chrome DevTools (or a similar measurement tool), normalize them with `polish_measure`, or manually construct observation data:

```json
{
  "observation": {
    "documents": [
      { "label": "page1", "theme": "light", "variables": { "--accent": "#e05800" } },
      { "label": "page2", "theme": "light", "variables": { "--accent": "#ff6600" } }
    ]
  }
}
```

### `conflict` finding severity is `error` for root, `warn` for selector

**Cause:** This is by design. Root-scope conflicts mean the same token has different values at `:root` level, which is always a bug. Selector-scope conflicts are warnings because the cascade may resolve them correctly depending on matching order.

**Fix:** For root conflicts, merge to a single canonical value. For selector conflicts, either merge or split into separate tokens if the variation is intentional.

### `dangling` findings appear for tokens that seem declared

**Cause:** The declaration might be in a file that wasn't scanned (e.g. inside `node_modules` or a directory excluded by `ignore`). Or the declaration uses a different name than the reference.

**Fix:** Check the `ignore` option — ensure the file containing the declaration isn't excluded. Verify the token name matches exactly (case-sensitive). Check the evidence in the finding for the reference location.

### `state-variation` or `theme-variation` instead of `conflict`

**Cause:** The cross-reference layer detected that differences are explained by scope context (state classes or theme attributes), not genuine conflicts. These are informational, not errors.

**Fix:** No action needed — these are expected patterns. If you want to formalize them, create dedicated tokens per state/theme as suggested in the finding.

## Performance Issues

### Large project scans slowly

**Cause:** The scanner is zero-dependency and single-threaded, processing files sequentially.

**Fix:** Use the `ignore` option to exclude directories that don't contain tokens:

```json
{ "target": ".", "ignore": "node_modules,dist,build,.next,test" }
```

The scanner already skips binary files (detected by null bytes) and common build/dependency directories (`node_modules`, `dist`, `build`, `.git`, `.next`, `.cache`, etc.).

### Many `namespace` findings for large projects

**Cause:** Large projects often accumulate multiple naming conventions over time.

**Fix:** This is a judgmental finding — no auto-fix. Review the families listed and choose one or two as the primary system. Demote the rest to aliases or phase them out gradually. The `duplicate-value` finding can help identify where different families express the same values.
