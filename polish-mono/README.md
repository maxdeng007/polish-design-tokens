# @design-tokens/polish

Design token superpower tool: extract · critique · apply

A zero-dependency toolkit for auditing CSS custom properties (design tokens) and applying mechanical fixes. Works with any AI coding agent via MCP protocol.

## Features

- **Audit**: Scan CSS/HTML files for token conflicts, orphaned declarations, dangling references, duplicate values
- **Plan**: Rank findings by priority, classify as mechanical (auto-fixable) vs judgmental (needs human decision)
- **Diff**: Generate concrete patches for mechanical fixes only
- **Apply**: Execute patches with automatic backups

## Installation

```bash
npm install -g @design-tokens/polish
```

Or add to your project:

```bash
npm install @design-tokens/polish --save-dev
```

## Usage

### CLI Commands

```bash
# Audit a directory
polish audit /path/to/project

# Convert findings to plan
polish plan findings.json > plan.json

# Generate mechanical patches
polish diff plan.json > patches.json

# Apply patches (creates backups automatically)
polish apply patches.json
```

### MCP Server (for AI agents)

Add to your Qoder/Claude settings:

```json
{
  "mcpServers": {
    "polish": {
      "command": "npx",
      "args": ["-y", "@design-tokens/polish", "mcp"]
    }
  }
}
```

Then use these tools:
- `polish_audit` - scan directory for token issues
- `polish_plan` - convert findings to action queue
- `polish_diff` - generate mechanical patches
- `polish_apply` - execute patches with backup protection
- `polish_doctor` - verify results
- `polish_extract` - extract token declarations
- `polish_style_lookup` - find tokens by name/pattern

### Node.js API

```javascript
import { scan } from '@design-tokens/polish/scan';
import { cross } from '@design-tokens/polish/cross';
import { plan } from '@design-types/polish/plan';
import { generateDiffs } from '@design-tokens/polish/diff';
import { apply } from '@design-tokens/polish/apply';

const graph = scan('./my-project');
const report = cross(graph);
const actions = plan(report.findings);
const patches = generateDiffs(actions);
const result = await apply(patches);
```

## What It Finds

**Mechanical (auto-fixable):**
- `hardcoded` - raw color/space values used instead of token refs
- `duplicate-value` - multiple token names sharing the same value
- `dangling` - tokens referenced but never declared

**Judgmental (needs human decision):**
- `conflict` - same token name has different values in root scope
- `cascade-override` - normal CSS cascading produces variation
- `namespace` - multiple naming families coexist
- `orphan` - declared but never referenced
- `runtime-drift` - runtime inconsistency across pages

## Why Use It?

1. **Closes the loop**: Extract → Critique → Apply — no more manual patching
2. **Zero-dependency**: Pure JavaScript, works anywhere Node.js runs
3. **Agent-ready**: MCP protocol lets any AI coding agent use it
4. **Safe**: Automatic backups before applying changes
5. **Precise**: Only mechanical fixes are auto-applied; judgmental ones flag humans

## Examples

See [examples/noah-sample](../../examples/noah-sample/) for a rich test case that covers all finding types.

## License

MIT

## Contributing

PRs welcome! For bugs or questions, open an issue.
