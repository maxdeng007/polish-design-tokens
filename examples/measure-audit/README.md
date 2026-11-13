# measure → audit integration example

A runnable example of the **runtime-aware** polish pipeline. It shows how to
combine browser-collected runtime observations with static source scanning to
detect issues that source-only analysis cannot.

## Why this matters

The static pipeline (`scan → cross`) finds token problems in source code:
conflicts, dangling references, duplicate values, orphans, namespace clutter.

But two classes of problems only exist at runtime:

| Finding | What it detects | Why source-only can't find it |
|---------|----------------|------------------------------|
| **runtime-drift** | A token resolving to different values across pages of the same theme | The source declares one value; the browser may resolve differently (overrides, cascade, theme switching) |
| **hardcoded** | A color appearing in multiple pages of the same theme that matches no declared token | The value exists in computed styles but was never extracted into a token |

Both require runtime data. This example shows the full flow.

## Run it

```bash
node examples/measure-audit/measure-audit.js
```

## What the script does

```
measure-audit/
├── README.md             ← this file
└── measure-audit.js      ← the runnable example script
```

The script runs three steps against the shared
[`examples/walkthrough/demo-project`](../walkthrough/demo-project):

### Step 1 — Collect runtime observations

Simulates data collected from a browser (DevTools → Computed Style, or the
companion token-audit-mcp package). Four pages across two themes:

| Page | Theme | `--bg` | `--accent` | `--fg` |
|------|-------|--------|------------|--------|
| dashboard | light | `#1a1a2e` | `#e05800` | `#e0e0e0` |
| settings | light | `#1a1a2e` | `#e05800` | `#ffffff` |
| billing | light | `#1a1a2e` | `#ff6600` | `#e0e0e0` |
| dashboard-dark | dark | `#0d1117` | `#e05800` | `#c9d1d9` |

Two planted runtime issues:
- **`--fg` drift**: `#e0e0e0` on dashboard/billing vs `#ffffff` on settings (all light theme)
- **`--accent` drift**: `#e05800` on dashboard/settings vs `#ff6600` on billing (all light theme)

### Step 2 — Normalize with `measure()`

```javascript
import { measure } from 'polish-design-tokens';

const observation = measure(rawObservations);
// → { documents: [ { label, theme, variables }, ... ] }
```

`measure()` accepts raw browser data and normalizes it into the
`RuntimeObservation` shape that `cross()` expects. It's forgiving of
alternative field names (`page`/`url`/`name` → `label`, `mode` → `theme`,
`resolved`/`values` → `variables`).

### Step 3 — Audit with observation

```javascript
import { audit } from 'polish-design-tokens';

const report = audit('./demo-project', [], observation);
// → { summary, findings } — includes runtime-drift and hardcoded
```

The `observation` parameter is the third argument. Without it, you only get
static findings. With it, `cross()` also detects:

- **runtime-drift** (error): tokens resolving to different values within the same theme
- **hardcoded** (warn): colors in computed styles that match no declared token

### Step 4 — Full pipeline with observation

```javascript
import { runPipeline } from 'polish-design-tokens';

const { findings, plan, patches } = runPipeline('./demo-project', [], observation);
```

The entire pipeline (extract → audit → plan → diff) accepts the observation,
so runtime findings flow through classification and patch generation too.

## Expected output

```
── Step 2: Audit (scan + cross with observation) ──
  Summary: 7 findings  (3 errors, 3 warnings, 1 info)
  Runtime: 4 documents, 12 variables observed

  Runtime-specific findings:

  ▸ ERROR — runtime-drift
    --accent [light]: #e05800 / #ff6600（3 个文档）
    --fg [light]: #e0e0e0 / #ffffff（3 个文档）

  ▸ WARN — hardcoded
    #e0e0e0（light）出现在 page-a: dashboard、page-c: billing
```

## In a real agent workflow

The observation comes from `polish_measure` (MCP tool) or the
token-audit-mcp browser tool, then flows into `polish_audit` as the
`observation` argument:

```json
// MCP: polish_measure
{ "name": "polish_measure", "arguments": { "documents": [ /* browser data */ ] } }
// → returns { documents: [...] }

// MCP: polish_audit — pass the observation
{
  "name": "polish_audit",
  "arguments": {
    "target": "./src",
    "observation": { "documents": [ /* from polish_measure */ ] }
  }
}
```

This is the only way an AI agent can detect runtime-drift and hardcoded
colors — it needs the runtime data to compare against the static source.
