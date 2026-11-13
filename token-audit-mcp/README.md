# 设计令牌体检仪 · token-audit-mcp

> 用模型上下文协议（MCP）把「设计令牌体检」变成 14 个可编程工具。
> Exposes design-token auditing as 14 programmable tools over MCP.

---

## 你想做什么 / What do you want to do?

| 你的身份 / You are... | 看这里 / Read this |
|---|---|
| 🎨 **设计师 / 不写代码** | [README.designer.md](./README.designer.md) —— 零术语、结果导向、中英双语 |
| 👨‍💻 **开发者** | [README.developer.md](./README.developer.md) —— 安装、配置、工具参考、自动化 |
| 👀 **只想看一眼长什么样** | [examples/preview-comparison.html](../examples/preview-comparison.html) —— 三样例对比可视化 |

> **先看这个**：打开 [examples/preview-comparison.html](../examples/preview-comparison.html)，30 秒就能理解这个项目在做什么——同样的工具，干净系统 1 条结论，线上代码 278 条。
> **Start here**: open [examples/preview-comparison.html](../examples/preview-comparison.html) — 30 seconds to grasp what this does: same tool, 1 finding on a clean system, 278 on live code.

---

## 它是什么 / What it is

**设计令牌（design token）**是设计系统里的常量——颜色、字号、间距、圆角。体检仪做的事：

1. **静态扫描** —— 直接读 CSS/HTML/JS 源文件，找出令牌的声明与引用
2. **运行时实测**（可选）—— 用 Playwright 打开页面，采样真实渲染后的 CSS 变量值
3. **交叉比对** —— 找出冲突、悬空引用、重复值、孤儿令牌
4. **导出** —— 生成 Figma / Tailwind / shadcn / DTCG 等格式

**Design tokens** are the constants in a design system — colors, sizes, spacing. The tool:

1. **Static scan** — reads CSS/HTML/JS source to find declarations and references
2. **Runtime measurement** (optional) — uses Playwright to sample real computed CSS variables
3. **Cross-compares** — finds conflicts, dangling references, duplicates, orphans
4. **Exports** — generates Figma / Tailwind / shadcn / DTCG formats

体检仪**只读不写**，不会修改任何源文件。

The tool is **read-only** — it never modifies your source files.

---

## 快速安装 / Quick install

```bash
npm i -g token-audit-mcp
```

注册为 Qoder MCP server：

```json
{
  "serverId": "token-audit-mcp",
  "name": "token-audit",
  "command": "/usr/local/bin/node",
  "args": ["/usr/local/lib/node_modules/token-audit-mcp/src/mcp-server.js"],
  "timeout": 120000
}
```

更完整的安装与配置见 [README.developer.md](./README.developer.md#2-前置条件--prerequisites)。

Full install/config guide: [README.developer.md](./README.developer.md).

---

## 工具一览 / Tools at a glance

**核心体检 / Core audit (6)**
`audit_run` · `job_status` · `audit_summary` · `audit_findings` · `audit_html_report` · `audit_json`

**导出 / Exports (5)**
`export_tokens_studio` · `export_style_dictionary` · `export_dtcg` · `export_tailwind` · `export_shadcn`

**语义建议 / Recommendations (3)**
`audit_recommendations` · `recommend_orphan_merge` · `recommend_alias_optimization`

**诊断 / Diagnostics (2)**
`list_jobs` · `delete_job`

每个工具的参数、返回值、示例见 [README.developer.md](./README.developer.md#6-工具参考--tool-reference)。

---

## 示例产物 / Sample output

三个真实体检样例，对比着看最能理解这个工具：

| 样例 / Sample | 来源 / Source | 声明 / 结论 |
|---|---|---|
| [examples/noah-sample/](../examples/noah-sample/) | Noah Mind `src/pages`（本地目录） | 1101 · 186 |
| [examples/anthropic-local/](../examples/anthropic-local/) | Anthropic 本地标本文件 | 14 · 1 |
| [examples/anthropic-url/](../examples/anthropic-url/) | Anthropic 线上 URL 实时抓取 | 7008 · 278 |

> **为什么看这三个**：同样的工具，干净系统（anthropic-local，1 条结论）和线上真实代码（anthropic-url，278 条结论）天差地别。对比能直观展示体检仪的价值——它不编造问题，只报告真实漂移。

**先看这个**：打开 [examples/preview.html](../examples/preview.html)（Noah Mind 可视化）或 [examples/preview-comparison.html](../examples/preview-comparison.html)（三样例对比）。

重新生成：

```bash
# Noah Mind
node token-audit-mcp/scripts/build-sample.mjs ./src/pages ./examples/noah-sample

# Anthropic 本地
node token-audit-mcp/scripts/build-sample.mjs ./anthropic-design-system.html ./examples/anthropic-local

# Anthropic 线上
bash examples/fetch-url.sh https://www.anthropic.com /tmp/anthropic-fetched
node token-audit-mcp/scripts/build-sample.mjs /tmp/anthropic-fetched ./examples/anthropic-url
```

---

## 测试 / Testing

```bash
node bin/test.js
```

21 项端到端检查，覆盖 initialize、tools/list、audit_run、job_status、audit_summary、audit_findings、五种导出、recommendations、list_jobs、delete_job。

21 end-to-end checks covering initialization, tool listing, the full audit lifecycle, all five exports, recommendations, and job management.

---

## License

MIT
