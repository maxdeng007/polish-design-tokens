# token-audit MCP Server Design Spec

**Date**: 2026-10-29  
**Version**: 1.0  
**Author**: Qoder Agent  
**Status**: Approved for Implementation

---

## Executive Summary

This document specifies the design of `token-audit-mcp`, an MCP (Model Context Protocol) server that exposes token-audit's design token auditing capabilities as programmatic API calls. The server enables agents and external programs to trigger audits, query findings, export tokens in industry-standard formats (Tokens Studio, Style Dictionary, DTCG), and receive semantic recommendations—all via typed tool calls rather than CLI invocations.

### Why This Exists

- **dembrandt** is a sensor: it extracts runtime observations but lacks structural analysis
- **token-audit** is a completer: static scan + runtime measurement + cross-validation judgments
- Current token-audit is CLI-only; agents must spawn subprocesses manually
- Goal: First-class MCP integration so agents can call `audit_run()` like any other tool

---

## Goals

1. **Direct agent access**: Any agent with MCP access can invoke audits without understanding CLI flags
2. **Stateful job management**: Async jobs persisted across server restarts
3. **Export ecosystem**: All major design token formats available in one place
4. **Semantic intelligence**: Recommendations for token hygiene (orphan merges, alias optimizations)
5. **Zero dependency on user setup**: Works with or without playwright/dembrandt installed

---

## Non-Goals

- No real-time audit streaming (too complex for MVP)
- No authentication/authorization (assume local-only usage)
- No web UI or dashboard (report.html already exists)
- No live collaboration features (tokens-studio cloud is separate)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Client                                │
│                  (Qoder Agent / CLI)                         │
└───────────────────────────┬─────────────────────────────────┘
                            │ stdio
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              token-audit-mcp Server                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    MCP Handlers                       │   │
│  │  audit_run | export_tokens_studio | ... (16 tools)    │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│  ┌────────────────────────┴────────────────────────────┐    │
│  │                   Job Store                          │    │
│  │  FileSystem KV store: .token-audit-cache/<jobId>/    │    │
│  └────────────────────────┬────────────────────────────┘    │
│                           │                                  │
│  ┌────────────────────────┴────────────────────────────┐    │
│  │            Spawn Wrapper                             │    │
│  │  bin/token-audit.js --json -o <tmp-dir> <target>     │    │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                   (Optional Peer Dependencies)
         ┌─────────────────┴─────────────────┐
         │                                   │
    style-dictionary                     dembrandt
    (for exports)                      (for classification)
```

### Key Principles

1. **Stateless handlers, stateful storage**: Each tool handler is pure → takes args, returns result; all side-effects go through Job Store
2. **Async-first**: Long-running audits return `jobId` immediately; clients poll status
3. **Filesystem as database**: Jobs stored as directories with metadata files; no SQLite/RocksDB needed
4. **Backward compatible**: If `bin/token-audit.js` changes, MCP still works (wrap, don't rewrite)

---

## Tool Specifications

### Core Audit Tools (5)

#### `audit_run(target, options)`
**Description**: Trigger a full design token audit on a local path or URL. Returns immediately with a `jobId`; audit runs asynchronously.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `target` | string | Yes | Local filesystem path or HTTP(S) URL to audit |
| `ignore` | string[] | No | Glob patterns to exclude (e.g., `"node_modules"`) |
| `severity` | "error" ∣ "warn" ∣ "info" | No | Filter findings by minimum severity (default: "error") |

**Returns**: 
```typescript
{
  jobId: string,  // UUID v4
  status: "running",
  estimated_seconds?: number  // Optional hint based on target size
}
```

**Behavior**:
- Generates deterministic `jobId` from SHA256(`target + ignore.sort()`) so retries reuse same job
- Spawns `bin/token-audit.js` with `--json -o <tmp-dir>` flags
- Stores metadata: `{ created_at, target, ignore, severity, status: "running" }`
- Background worker updates status → "complete" or "failed"

**Edge cases**:
- Target unreachable → status="failed", reason="network_error"
- No source files found → status="complete", empty results
- Dembrandt missing → report notes "classification unavailable"

---

#### `audit_findings(jobId, filters?)`
**Description**: Query findings from a completed audit with optional filtering by severity and type.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `jobId` | string | Yes | UUID returned by `audit_run` |
| `severity` | "error" ∣ "warn" ∣ "info" | No | Filter to only this severity level |
| `types` | string[] | No | Finding IDs to include (e.g., `["conflict", "orphan"]`) |

**Returns**:
```typescript
{
  findings: Array<{
    id: string,             // Finding ID (e.g., "conflict")
    title: string,
    detail: string,
    severity: "error"∣"warn"∣"info",
    evidence: any[],        // Structured data from cross.js
    suggestion: string,
    targets: string[]       // Documents where found
  }>,
  total: number           // Before filtering
}
```

**Behavior**:
- Reads `report.json` from job cache directory
- Filters in-memory (no re-run)
- Sorted by severity (error first), then alphabetically by `id`

**Example**:
```json
{
  "findings": [
    {
      "id": "runtime-drift",
      "title": "3 个令牌在同一主题下于不同文档解析出不同值",
      "detail": "--brand-primary [dark]: #f25e00 / #ff6a35（2 个文档）",
      "severity": "error",
      "evidence": [
        {"name": "--brand-primary", "theme": "dark", "values": ["#f25e00", "#ff6a35"], "documents": ["top", "iframe:1"]}
      ],
      "suggestion": "运行时漂移是用户能看见的 bug...",
      "targets": ["top", "iframe:1"]
    }
  ],
  "total": 3
}
```

---

#### `audit_summary(jobId)`
**Description**: Get quick summary statistics without loading all findings into memory.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `jobId` | string | Yes | UUID returned by `audit_run` |

**Returns**:
```typescript
{
  targets: Array<{ path: string, type: "file"∣"url", documents: number }>,
  summary: {
    error: number,
    warn: number,
    info: number,
    total: number
  },
  created_at: ISO8601,
  duration_seconds?: number,
  degraded?: string[]    // List of skipped features (e.g., "no playwright")
}
```

---

#### `audit_html_report(jobId)`
**Description**: Return the path and metadata for the HTML report file.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `jobId` | string | Yes | UUID returned by `audit_run` |

**Returns**:
```typescript
{
  filePath: string,       // Absolute path to report.html
  size_bytes: number,
  url?: string           // If served locally, http://127.0.0.1:<port>/...
}
```

**Behavior**:
- Report already exists on disk from `audit_run` completion
- Optionally starts ephemeral HTTP server if requested

---

#### `audit_json(jobId)`
**Description**: Return the path and metadata for the JSON artifact.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `jobId` | string | Yes | UUID returned by `audit_run` |

**Returns**:
```typescript
{
  filePath: string,       // Absolute path to report.json
  size_bytes: number,
  checksum_sha256: string // For integrity verification
}
```

---

### Export Tools (5)

#### `export_tokens_studio(jobId)`
**Description**: Export tokens in Tokens Studio/Figma format (JSON schema compatible with https://figma-plugin.tokens.studio/).

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `jobId` | string | Yes | UUID from `audit_run` |
| `format` | "json" ∣ "figma" | No | "json" writes to file, "figma" attempts direct Figma plugin sync (requires additional auth setup) |

**Returns**:
```typescript
{
  filePath: string,
  tokens: {
    [groupName: string]: {
      [tokenName: string]: {
        value: string,
        type: "color"∣"typography"∣"spacing"∣...
      }
    }
  }
}
```

**Schema**: Follows Tokens Studio spec: https://github.com/tokens-studio/tokens-studio-for-figma

---

#### `export_style_dictionary(jobId)`
**Description**: Export tokens as Style Dictionary-compatible output (Web, iOS, Android platforms supported).

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `jobId` | string | Yes | UUID from `audit_run` |
| `platform` | "web" ∣ "ios" ∣ "android" | No | Target platform for output format (default: "web") |

**Returns**:
```typescript
{
  filePath: string,
  formats: Array<{ name: string, path: string }>  // e.g., ["css", "json", "ts"]
}
```

**Formats generated**:
- Web: CSS variables + SCSS mixins + TypeScript types
- iOS: `.xcassets` + Swift extension
- Android: `colors.xml`, `dimens.xml`, `strings.xml`

**Dependency**: Uses `style-dictionary` npm package as peer dependency.

---

#### `export_dtcg(jobId)`
**Description**: Export tokens in W3C Design Token Community Group (DTCG) format.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `jobId` | string | Yes | UUID from `audit_run` |

**Returns**:
```typescript
{
  filePath: string,
  variables: {
    $extensions: {
      "design-tokens/v1": {...}
    },
    [tokenPath]: {
      $value: string,
      $type: string,
      $description: string?
    }
  }
}
```

**Reference**: https://github.com/w3c/design-tokens

---

#### `export_tailwind(jobId)`
**Description**: Generate Tailwind CSS configuration file with design tokens mapped to theme keys.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `jobId` | string | Yes | UUID from `audit_run` |
| `themePrefix` | string | No | Prefix for custom theme keys (e.g., "nm-" for Noah Mind) |

**Returns**:
```typescript
{
  filePath: string,
  config: {
    theme: {
      colors: {...},
      spacing: {...},
      borderRadius: {...}
    }
  }
}
```

**Adaptation logic**:
- Maps `--brand-primary` → `colors.nm.brandPrimary`
- Maps `--space-md` → `spacing.nm.md`
- Warns if naming conventions don't align with Tailwind expectations

---

#### `export_shadcn(jobId)`
**Description**: Generate shadcn/ui-compatible CSS variable definitions + theme JSON.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `jobId` | string | Yes | UUID from `audit_run` |

**Returns**:
```typescript
{
  filePath: string,
  themeCSS: string,     // Content of globals.css
  themes: Array<{ name: string, cssVars: {} }>  // light/dark variants
}
```

**Output structure**:
```css
/* @theme */
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  /* ... */
}
.dark {
  --background: 222.2 84% 4.9%;
  /* ... */
}
```

---

### Semantic Recommendation Tools (3)

#### `audit_recommendations(jobId, filters?)`
**Description**: Provide agent-assisted recommendations for improving token hygiene. Returns prioritized suggestions with confidence scores.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `jobId` | string | Yes | UUID from `audit_run` |
| `autoFixOnly` | boolean | No | Only return recommendations the agent can safely apply (default: false) |
| `categories` | string[] | No | Limit to specific categories (e.g., `["naming", "conflicts", "orphans"]`) |

**Returns**:
```typescript
{
  recommendations: Array<{
    id: string,                // Unique recommendation ID
    type: "merge"∣"rename"∣"remove"∣"alias",
    current: string,           // Current token name/value
    suggested: string,         // Proposed change
    confidence: 0.0∣0.5∣1.0,  // Low/Medium/High
    reasoning: string,         // Human-readable justification
    affected_findings: string[] // Related finding IDs
  }>
}
```

**Categories**:
- `merge`: Two tokens have identical values, suggest merging
- `rename`: Naming inconsistent with project convention
- `remove`: Orphan token never referenced (safe to delete)
- `alias`: Deeply nested alias chain that could be flattened

---

#### `recommend_orphan_merge(jobId)`
**Description**: Specific recommendation engine for orphaned tokens that share values with non-orphaned tokens.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `jobId` | string | Yes | UUID from `audit_run` |

**Returns**:
```typescript
{
  suggestions: Array<{
    nameA: string,      // Orphan token name
    nameB: string,      // Active token with same value
    value: string,      // Shared value
    reason: string,     // e.g., "Same color used in 3 docs"
    impact: "low"∣"medium"∣"high"
  }>
}
```

**Algorithm**:
1. Find all orphans (`findings.id === "orphan"`)
2. Cross-reference with active tokens having identical normalized values
3. Suggest merge if same scope (both root/theme) AND same usage pattern

---

#### `recommend_alias_chain_optimization(jobId)`
**Description**: Identify deeply nested alias chains and propose flattening.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `jobId` | string | Yes | UUID from `audit_run` |

**Returns**:
```typescript
{
  suggestions: Array<{
    chain: string[],    // e.g., ["--bg-2", "--bg-main", ":root"]
    optimization: string, // Suggested simplified alias
    depth: number,      // Current chain length
    risk: "low"∣"medium"∣"high"  // Breaking change risk
  }>
}
```

**Rules**:
- Chain depth > 3 → suggest flattening
- Chain includes fallback (`var(--x,var(--y))`) → mark as "medium" risk
- Only suggests if intermediate tokens are never directly referenced

---

### Diagnostic/Debug Tools (3)

#### `job_status(jobId)`
**Description**: Poll the current status of an asynchronous audit job.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `jobId` | string | Yes | UUID from `audit_run` |

**Returns**:
```typescript
{
  status: "pending"∣"running"∣"complete"∣"failed",
  progress: number,   // 0-100 percentage
  step?: string,      // e.g., "scanning sources", "measuring runtime"
  error?: string,     // If status="failed"
  started_at?: ISO8601,
  completed_at?: ISO8601
}
```

**Implementation note**: Background worker updates status every 2s; client should poll with exponential backoff.

---

#### `list_jobs(filters?)`
**Description**: List all cached jobs with optional filtering.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `limit` | number | No | Max jobs to return (default: 50) |
| `older_than_days` | number | No | Exclude jobs older than N days |
| `status` | "complete"∣"failed"∣"running" | No | Filter by status |

**Returns**:
```typescript
{
  jobs: Array<{
    jobId: string,
    target: string,
    created_at: ISO8601,
    status: string,
    findings_count: number,
    size_bytes: number
  }>,
  total: number
}
```

**Auto-cleanup**: Jobs older than 30 days automatically removed by periodic maintenance task.

---

#### `delete_job(jobId)`
**Description**: Permanently remove a job and all its artifacts.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `jobId` | string | Yes | UUID from `audit_run` |

**Returns**:
```typescript
{
  deleted: true,
  freed_bytes: number,
  artifacts_removed: string[]  // List of deleted file paths
}
```

**Warning**: Irreversible operation. Agents should confirm before calling.

---

## Data Model

### Job Store Schema

Jobs stored in `.token-audit-cache/<jobId>/`:

```
.jobId/
├── meta.json                 # Metadata object
├── report.json               # Full audit report (JSON)
├── report.html               # HTML report
├── exports/
│   ├── tokens-studio.json
│   ├── style-dictionary/
│   │   ├── web.css
│   │   ├── web.ts
│   │   └── ios.swift
│   ├── dtcg.json
│   ├── tailwind.config.js
│   └── shadcn-theme.css
└── logs/
    └── audit.log             # Stdout/stderr from token-audit process
```

**meta.json**:
```json
{
  "jobId": "uuid-v4",
  "target": "/path/to/project",
  "ignorePatterns": ["node_modules"],
  "severity": "error",
  "status": "complete",
  "created_at": "2026-10-29T10:00:00Z",
  "completed_at": "2026-10-29T10:00:15Z",
  "duration_seconds": 15,
  "degraded": ["no-dembrandt"],
  "artifacts": {
    "report_json": "report.json",
    "report_html": "report.html",
    "exports": ["tokens-studio.json"]
  }
}
```

### Deterministic Job ID

```javascript
function generateJobId(target, ignore = []) {
  const input = [target, ...(ignore || []).sort()].join("|");
  const hash = crypto.createHash("sha256").update(input).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
}
```

Rationale: Same target+ignore always produces same jobId → prevents duplicate audits.

---

## Error Handling

### Graceful Degradation Path

| Missing Dependency | Behavior | Report Annotation |
|--------------------|----------|-------------------|
| No Playwright | Skip runtime measurement | `degraded: ["playwright not installed"]` |
| No dembrandt | Skip classification | `degraded: ["dembrandt not found"]` |
| Target unreachable | Exit immediately | `status: "failed", error: "network_timeout"` |
| No source files | Complete with empty results | `summary.total: 0` |

### Error Propagation

All tool responses include structured errors:

```typescript
{
  success: false,
  error: {
    code: "NETWORK_ERROR",
    message: "Target URL unreachable after 30s",
    details: { target: "https://broken.example" }
  }
}
```

MCP protocol layer handles formatting for client display.

---

## Testing Strategy

### Unit Tests (Phase 1)

Test each handler in isolation with mocked `spawn-audit` outputs:

```javascript
// test/unit/handlers/audit-findings.test.js
describe("audit_findings", () => {
  it("returns findings filtered by severity", async () => {
    mockJobStore.get.returnValues({
      report: { summary: { error: 2, warn: 1 }, findings: [...] }
    });
    
    const result = await audit_findings("uuid-123", { severity: "error" });
    
    expect(result.findings.length).toBe(2);
    expect(result.total).toBe(3);
  });
});
```

Coverage goals: 80% line coverage, all edge cases exercised.

---

### E2E Tests (Phase 1)

Real audit against fixture projects:

```bash
# test/e2e/full-pipeline.test.js
const jobId = await audit_run("./test/fixtures/noah-mind-src");
await waitForStatus(jobId, "complete");

const summary = await audit_summary(jobId);
expect(summary.summary.error).toBeGreaterThan(0);

const html = await audit_html_report(jobId);
expect(fs.existsSync(html.filePath)).toBe(true);
```

Uses Playwright harness from dembrandt tests (reuse patterns).

---

### Integration Tests (Phase 2+)

Verify exports round-trip correctly:

```javascript
// test/e2e/export-integration.test.js
const ts = await export_tokens_studio(jobId);
const parsed = JSON.parse(ts.tokens);

expect(parsed.color.primary.value).toBe("#f25e00");
```

---

## Deployment & Installation

### Package Structure

```
token-audit-mcp/
├── src/
│   ├── mcp-server.js          # Entry point (stdio)
│   ├── handlers/              # 16 tool implementations
│   ├── cache/                 # Job store + cleanup
│   └── utils/
│       └── spawn-audit.js     # CLI wrapper
├── bin/
│   └── token-audit.js         # Symlink to parent project CLI
├── package.json
├── README.md
└── test/
    ├── unit/
    └── e2e/
```

### Installation Flow

**Option A: Standalone installation**
```bash
npm i -g token-audit-mcp
```
- Creates `/usr/local/bin/token-audit-mcp` binary
- Registers as Qoder MCP server named `token-audit`
- Installs optional peer deps if present (`style-dictionary`)

**Option B: Bundled with token-audit**
```bash
npm i -g token-audit
# Postinstall script auto-links mcp-server
```

Recommendation: Start with Option B (single package), allow Option A later for decoupled upgrades.

### Qoder Registration

Server registration in Qoder settings:
```json
{
  "serverId": "token-audit-mcp",
  "name": "token-audit",
  "command": "/usr/local/bin/node",
  "args": ["/usr/local/lib/node_modules/token-audit-mcp/src/mcp-server.js"],
  "timeout": 120000,  // 2 min max for long audits
  "tools": ["audit_run", "audit_findings", ...]  // All 16 tools
}
```

---

## Security Considerations

### Local-Only Assumption

MCP server assumes local-only usage; no authentication layer.

**Risk**: If exposed publicly, anyone could trigger expensive audits (DoS vector).

**Mitigation**: Add rate limiting if public deployment becomes requirement.

### File System Access

Server reads arbitrary local paths specified by agents.

**Risk**: Agents could specify sensitive paths (`/etc/passwd`, `~/.ssh`).

**Mitigation**: 
- Whitelist allowed directories (configurable via env var)
- Log all file access for audit trail
- Future: add `allowedDirectories` parameter to `audit_run`

### Dependency Safety

- `style-dictionary` is well-maintained (MIT license)
- No dynamic imports of untrusted code
- Spawn wrapper uses safe argument escaping

---

## Performance Optimizations

### Lazy Loading

Handlers load dependencies lazily:

```javascript
let sd = null; // style-dictionary
async function exportStyleDictionary(jobId) {
  if (!sd) sd = require("style-dictionary");
  // ...
}
```

Keeps cold start time low (~50ms).

### Parallel Exports

Multiple exports for same job run concurrently:

```javascript
await Promise.all([
  export_tokens_studio(jobId),
  export_style_dictionary(jobId),
  export_dtcg(jobId)
]);
```

Cache hit ensures artifacts computed once.

### Background Cleanup

Weekly cron job removes old jobs:

```bash
0 3 * * 0 /usr/local/bin/node token-audit-mcp/cleanup.js --older-than-days 30
```

Or self-triggering via `list_jobs` when returning results.

---

## Migration Path

### From dembrandt MCP

Users currently using dembrandt for token extraction can migrate gradually:

1. **Phase 1**: Run both MCP servers simultaneously (different names: `dembrandt`, `token-audit`)
2. **Phase 2**: Use dembrandt for classification, token-audit for structural validation
3. **Phase 3**: Replace dembrandt entirely once users trust token-audit's completeness

### From CLI-only

Existing token-audit CLI users get automatic upgrade:

```bash
# Before (CLI workflow)
token-audit ./src --json -o out && cat out/report.json

# After (MCP workflow)
jobId = await audit_run("./src");
result = await audit_findings(jobId);
console.log(JSON.stringify(result));
```

---

## Success Metrics

### Immediate (v0.1.0)
- ✅ 16 tools implemented and passing unit tests
- ✅ Async job execution working reliably
- ✅ All core exports generating valid files
- ✅ Qoder MCP registration successful

### Short-term (v0.2.0)
- ⏳ 80% test coverage achieved
- ⏳ Average audit job completes in <30s
- ⏳ Zero manual configuration required

### Long-term (v1.0.0)
- 🎯 Used by 3+ distinct agent workflows daily
- 🎯 Export quality validated against official specs (DTCG, Tokens Studio)
- 🎯 Automated PRs merged upstream when token-audit improvements land

---

## Open Questions

### Q1: Should `export_style_dictionary()` support custom transformers?

**Current proposal**: Predefined platforms only (web/ios/android).

**Alternative**: Accept `transformers: string[]` param for advanced customization.

**Decision**: MVP → predefined only. Advanced case can be follow-up issue.

---

### Q2: Do we need WebSocket support for real-time progress updates?

**Current proposal**: Polling-based `job_status()` every 2-5 seconds.

**Alternative**: WebSocket push notifications when status changes.

**Decision**: Keep polling for simplicity. WebSocket adds complexity (firewall, reconnect logic) with marginal benefit for 15s jobs.

---

### Q3: Should recommendations include automatic fix application?

**Current proposal**: `recommendations()` returns suggestions only; agent must decide.

**Alternative**: `apply_recommendation(jobId, recId)` executes fixes atomically.

**Decision**: Never implement auto-fix. Too risky—agents lack human judgment context. Always surface as read-only suggestions.

---

## Appendix A: Finding ID Reference

All finding IDs from `cross.js` (used in `audit_findings` filtering):

| ID | Severity | Description |
|----|----------|-------------|
| `conflict` | error | Same name, different resolved value |
| `runtime-drift` | error | Values differ across documents in same theme |
| `dangling` | error | Reference to non-existent token |
| `hardcoded` | warn | Hardcoded color instead of token |
| `duplicate-value` | warn | Different names map to same color |
| `orphan` | warn | Declared but never used |
| `namespace` | info | Multiple naming families detected |
| `theme-variation` | info | Light/dark differences explained |
| `state-variation` | info | State modifier variations |
| `cascade-override` | info | Selector overrides root |
| `dynamic-variable` | info | Per-element inline vars (e.g., `--product-index`) |

---

## Appendix B: Comparison Matrix

| Feature | dembrandt | token-audit | token-audit-mcp |
|---------|-----------|-------------|-----------------|
| Runtime extraction | ✅ | ✅ | ✅ |
| Static analysis | ❌ | ✅ | ✅ (via spawn) |
| Structural conflicts | ❌ | ✅ | ✅ |
| Export formats | limited | none (raw) | all (16 tools) |
| Agent access | MCP native | CLI only | MCP native |
| Async jobs | ✅ | ❌ | ✅ |
| Semantic recommendations | ❌ | partial | ✅ dedicated tools |

Conclusion: token-audit-mcp fills the gap between dembrandt's runtime focus and token-audit's structural completeness.

---

**End of Design Spec**

Next step: Write implementation plan via writing-plans skill.

"}
