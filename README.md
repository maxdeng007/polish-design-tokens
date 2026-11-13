# polish-design-tokens

Design token superpower tool: **extract · critique · apply**.

A CLI + MCP toolkit that closes the loop on CSS custom properties:
extract tokens → critique pages for token issues → apply mechanical fixes.

## Quick Start

```bash
npm install -g @design-tokens/polish
polish plan  findings.json
polish diff  plan.json
polish apply patches.json
```

## Repo Contents

| Directory | Description |
|-----------|-------------|
| `polish/` | Core tool: plan, diff, apply + CLI |
| `polish-mcp/` | MCP server (7 tools) |
| `polish-mono/` | Unified npm package |
| `token-audit-mcp/` | Token audit MCP server |
| `examples/` | Sample projects |
| `docs/` | Design specs and plans |

## License

MIT
