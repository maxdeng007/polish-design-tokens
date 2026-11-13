# token-audit MCP Server - Quick Reference

## Overview

Complete design token auditing MCP server with **14 tools** across 3 phases:

### Phase 1: Core Audit Tools (6)
| Tool | Purpose | Example |
|------|---------|---------|
| `audit_run` | Trigger async audit | `{ target: "./src", ignore: ["node_modules"] }` |
| `audit_findings` | Query findings | `{ jobId: "uuid", severity: "error" }` |
| `audit_summary` | Get stats | `{ jobId: "uuid" }` |
| `audit_html_report` | Report path | `{ jobId: "uuid" }` |
| `audit_json` | JSON artifact | `{ jobId: "uuid" }` |
| `job_status` | Poll progress | `{ jobId: "uuid" }` |

### Phase 2: Export Tools (5)
| Tool | Output Format | Use Case |
|------|---------------|----------|
| `export_tokens_studio` | Tokens Studio/Figma | Design collaboration |
| `export_style_dictionary` | Web/iOS/Android | Multi-platform apps |
| `export_dtcg` | W3C DTCG spec | Standardized exchange |
| `export_tailwind` | Tailwind config | CSS utility framework |
| `export_shadcn` | shadcn/ui variables | Component theming |

### Phase 3: Semantic Recommendations (2)
| Tool | Recommendation Type | Benefit |
|------|---------------------|---------|
| `audit_recommendations` | Merge/alias/naming | Improve token hygiene |
| `list_jobs` | Cached job browsing | Manage audit history |
| `delete_job` | Cleanup artifacts | Free disk space |

---

## Complete Workflow Example

```javascript
// Step 1: Run audit on project
const runResult = await mcp.call('audit_run', {
  target: './src',
  ignore: ['pristine', 'before-demo'],
  severity: 'error'
});
// Returns: { jobId: "abc-123", status: "running", estimated_seconds: 15 }

// Step 2: Poll until complete
await sleep(2000);
const status = await mcp.call('job_status', { jobId: runResult.jobId });
while (status.status !== 'complete') {
  await sleep(2000);
  status = await mcp.call('job_status', { jobId: runResult.jobId });
}
// Returns: { status: "complete", progress: 100 }

// Step 3: Query critical issues
const errors = await mcp.call('audit_findings', {
  jobId: runResult.jobId,
  severity: 'error'
});
console.log(errors.findings.length, 'errors found');
// Returns: { findings: [...], total: 5 }

// Step 4: Get summary statistics
const summary = await mcp.call('audit_summary', {
  jobId: runResult.jobId
});
console.log(summary.summary);
// Returns: { error: 3, warn: 5, info: 12 }

// Step 5: Export for designers
await mcp.call('export_tokens_studio', {
  jobId: runResult.jobId
});
// Creates: .token-audit-cache/<jobId>/exports/tokens-studio.json

// Step 6: Export for frontend devs
await mcp.call('export_tailwind', {
  jobId: runResult.jobId,
  themePrefix: 'nm-'
});
// Creates: tailwind.config.js with theme.extend colors/spacing

// Step 7: Generate recommendations
const recs = await mcp.call('audit_recommendations', {
  jobId: runResult.jobId,
  autoFixOnly: false
});
console.log(recs.summary);
// Returns: { merge: 2, alias: 3, rename: 1 }

// Step 8: Download HTML report
const htmlPath = await mcp.call('audit_html_report', {
  jobId: runResult.jobId
});
console.log('Report:', htmlPath.filePath);
// Opens in browser for stakeholder review

// Step 9: List cached jobs
const jobs = await mcp.call('list_jobs', { limit: 10 });
console.log(jobs.jobs.map(j => ({ id: j.jobId, findings: j.findings_count })));

// Step 10: Clean up old jobs
await mcp.call('delete_job', { jobId: 'old-job-id' });
console.log('Freed:', (await result).freed_bytes, 'bytes');
```

---

## Key Features

### Deterministic Job IDs
Same target + ignore → same job ID (prevents duplicate scans):
```javascript
// These produce identical jobs:
generateJobId('./src', ['node_modules']) // → abc-123
generateJobId('./src', ['node_modules']) // → abc-123 (reused)
generateJobId('./src', [])               // → def-456 (different)
```

### Graceful Degradation
Works even if optional dependencies missing:
- No Playwright? → Skip runtime measurement (report notes it)
- No dembrandt? → Skip classification (static analysis still works)
- Target unreachable? → Exit immediately with error

### Filesystem Caching
Jobs persist in `.token-audit-cache/<jobId>/`:
```
.token-audit-cache/
└── abc-123/
    ├── meta.json           # Metadata object
    ├── report.json         # Full audit JSON
    ├── declarations.json   # All tokens scanned
    └── exports/
        ├── tokens-studio.json
        ├── style-dictionary/web.css
        ├── dtcg.json
        ├── tailwind.config.js
        └── shadcn-theme.css
```

Auto-cleanup after 30 days or manual deletion.

---

## Error Handling

All tools return structured errors:

```typescript
// Missing job
{ success: false, error: { code: "NOT_FOUND", message: "Job not found" } }

// Invalid parameters
{ success: false, error: { code: "INVALID_ARGS", message: "target required" } }

// Audit failure
{ success: false, error: { code: "AUDIT_FAILED", message: "target unreachable" } }
```

Agents can check `success` field and respond accordingly.

---

## Performance

Typical audit times:
- Small SPA (1-2 pages): ~5-10 seconds
- Medium app (3-5 docs): ~15-20 seconds  
- Large site (10+ docs): ~30-45 seconds

Long-running audits use async pattern (no blocking).

---

## Installation

```bash
# Global install
npm i -g token-audit-mcp

# Or as dependency
npm i token-audit-mcp --save-dev
```

Optional peer dependencies:
- `playwright-core` - Browser-based runtime measurement
- `style-dictionary` - Advanced export formats

Both are optional; server degrades gracefully if missing.

---

## Qoder MCP Registration

Register in Qoder settings:
```json
{
  "serverId": "token-audit-mcp",
  "name": "token-audit",
  "command": "/usr/local/bin/node",
  "args": ["/usr/local/lib/node_modules/token-audit-mcp/src/mcp-server.js"],
  "timeout": 120000
}
```

Then use any tool directly from agent context!

---

## Next Steps After Audit

### For Designers
```bash
# Import Tokens Studio export into Figma plugin
cat token-audit-cache/<jobId>/exports/tokens-studio.json | jq '.color'
```

### For Frontend Devs
```bash
# Copy Tailwind config to project
cp token-audit-cache/<jobId>/exports/tailwind.config.js ./tailwind.config.js

# Extend with custom prefix
module.exports = {
  ...require('./token-audit-cache/<jobId>/exports/tailwind.config.js'),
  theme: {
    extend: {
      colors: {
        'nm-brand': '#f25e00'
      }
    }
  }
}
```

### For QA Engineers
```bash
# Filter only error-level findings for CI checks
mcp call audit_findings "{jobId}" --severity error | jq '.findings[].title'
# Exit non-zero if any errors found
```

---

## Limitations

1. **No automatic fixes**: Recommendations are advisory only (agents lack human judgment context)
2. **Async-only**: Long audits return jobId; polling required
3. **Local filesystem**: Jobs stored locally; no cloud sync
4. **Static analysis only**: Cross-tool correlations limited to what's in scan results

These are intentional MVP boundaries; future versions may add automation.

---

## Troubleshooting

**Q: Why is my audit taking so long?**  
A: Check `job_status` for progress. Typical bottleneck is Playwright browser launch (~3-5s) + document rendering.

**Q: Can I cancel a running job?**  
A: Not yet. Jobs run to completion; implement cancellation via delete_job() after completion.

**Q: How do I see all exported files?**  
A: List directory: `ls -la .token-audit-cache/<jobId>/exports/`

**Q: Can I reuse jobs from previous runs?**  
A: Yes! Same target+ignore produces same jobId → skips re-scan. Perfect for CI caching.

**Q: What happens if token-audit CLI changes?**  
A: MCP wraps CLI via spawn(); backward compatible unless CLI API breaks. Test with real audit before upgrading.

---

**End of User Guide**

For full implementation details, see: `docs/superpowers/specs/2026-10-29-token-audit-mcp-design.md`
