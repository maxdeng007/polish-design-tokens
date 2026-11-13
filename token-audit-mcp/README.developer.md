# token-audit-mcp · 开发者文档 / Developer Documentation

> 面向会写代码的人。安装、配置、工具参考、自动化示例。
> For people who can code. Install, configure, tool reference, automation.

---

## 1. 它是什么 / What it is

`token-audit-mcp` 是一个 **MCP server**（Model Context Protocol），把「设计令牌体检」能力暴露成 14 个可编程工具。它背后调用的是 `token-audit` CLI，因此 MCP 与 CLI 的行为完全一致。

An MCP server that exposes design-token auditing as 14 programmable tools. It shells out to the `token-audit` CLI, so MCP and CLI behave identically.

体检流程分两步：

1. **静态扫描** —— 直接读 CSS/HTML/JS 源文件，找出令牌的声明与引用
2. **运行时实测**（可选）—— 用 Playwright 打开页面，采样真实渲染后的 CSS 变量值

Two stages:
1. **Static scan** — reads CSS/HTML/JS source to find token declarations and references
2. **Runtime measurement** (optional) — uses Playwright to load the page and sample real computed CSS variables

---

## 2. 前置条件 / Prerequisites

- Node.js ≥ 18
- `token-audit` CLI 可访问（见下）

`token-audit` 可以从仓库根目录直接用：

```bash
node token-audit/bin/token-audit.js --help
```

MCP server 会在以下位置**按顺序查找** CLI，找到即用：

1. 环境变量 `TOKEN_AUDIT_CLI`
2. `<repo-root>/token-audit/bin/token-audit.js`
3. `<repo-root>/bin/token-audit.js`
4. `node_modules/token-audit/bin/token-audit.js`

> 如果 MCP 报 "CLI not found"，把 `TOKEN_AUDIT_CLI` 指向实际路径即可。

**可选依赖**（缺了会自动降级，不影响静态扫描）：

- `playwright-core` —— 运行时实测
- `dembrandt` —— 令牌分类

---

## 3. 安装 / Install

```bash
# 全局安装
npm i -g token-audit-mcp

# 或本地链接（开发用）
npm i -g ./token-audit-mcp
```

`postinstall` 会运行 `scripts/setup.js`，它会**检查 CLI 是否可用**并在不可用时打印指引，不会创建多余目录。

---

## 4. 作为 MCP server 使用 / Using as an MCP server

### 4.1 注册 / Register

在 Qoder 设置里加一段：

```json
{
  "serverId": "token-audit-mcp",
  "name": "token-audit",
  "command": "/usr/local/bin/node",
  "args": ["/usr/local/lib/node_modules/token-audit-mcp/src/mcp-server.js"],
  "timeout": 120000
}
```

> `command` 要用**绝对路径的 node**。如果 shell 里有 nvm 之类的包装，`node` 可能指向错误的版本——直接写 `/usr/local/bin/node` 最稳。

### 4.2 握手 / Handshake

MCP 走 stdio，一行一个 JSON-RPC。`initialize` 之后才能 `tools/list`。

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"dev","version":"1.0"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | node src/mcp-server.js
```

### 4.3 调用工具 / Calling a tool

工具通过 `tools/call` 调用，不是直接的方法名。`params.name` 指定工具，`params.arguments` 传参：

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"audit_run","arguments":{"target":"./src/pages","severity":"info"}}}' \
  | node src/mcp-server.js
```

返回 `{ jobId, status: "running" }`。用 `job_status` 轮询完成：

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"job_status","arguments":{"jobId":"<返回的 jobId>"}}}' \
  | node src/mcp-server.js
```

---

## 5. 直接用 CLI / Using the CLI directly

MCP 只是壳，日常调试用 CLI 更快。

```bash
token-audit <target> [options]
```

`target` 可以是目录、单文件、或 `http(s)://` URL。

| 选项 | 说明 |
|---|---|
| `--scan <path>` | 静态扫描的源目录（与运行时目标可不同） |
| `--target-file <path>` | 运行时实测的文件（会自动起静态服务） |
| `--no-runtime` | 跳过运行时实测，只做静态分析 |
| `--ignore <list>` | 逗号分隔，扫描时跳过的路径片段 |
| `--themes <list>` | 采样主题，默认 `light,dark` |
| `--route <hash>` | 运行时加载的 hash 路由 |
| `--out <dir>` | 输出目录，默认 `./token-audit-out` |
| `--json [file]` | 输出 JSON |
| `--html [file]` | 输出 HTML 报告 |
| `--severity <level>` | 低于该级别不算失败：`error`/`warn`/`info`（默认 `error`） |
| `--timeout <ms>` | 单次加载超时（默认 120000） |
| `--quiet` | 只输出结论 |

**退出码 / Exit codes：**

- `0` —— 无 error 级问题（仍是成功）
- `1` —— 有 error 级问题（也是成功，只是体检发现了问题）
- `2` —— 执行失败（参数错误、目标不存在等）

---

## 6. 工具参考 / Tool reference

### 6.1 核心体检 / Core audit (6)

| 工具 | 参数 | 返回 |
|---|---|---|
| `audit_run` | `target`, `scan?`, `targetFile?`, `runtime?`, `route?`, `timeout?`, `ignore?`, `severity?`, `classification?` | `{ jobId, status, estimated_seconds }` |
| `job_status` | `jobId` | `{ status, progress?, summary? }` |
| `audit_summary` | `jobId` | `{ error, warn, info, total }` |
| `audit_findings` | `jobId`, `severity?`, `rule?`, `file?` | `{ findings, total }` |
| `audit_html_report` | `jobId` | `{ filePath }` |
| `audit_json` | `jobId` | `{ filePath }` |

### 6.2 导出 / Exports (5)

| 工具 | 参数 | 返回 |
|---|---|---|
| `export_tokens_studio` | `jobId` | `{ filePath }` |
| `export_style_dictionary` | `jobId` | `{ filePath }` |
| `export_dtcg` | `jobId` | `{ filePath, variables }` |
| `export_tailwind` | `jobId`, `themePrefix?` | `{ filePath }` |
| `export_shadcn` | `jobId` | `{ filePath, themeCSS }` |

### 6.3 语义建议 / Semantic recommendations (3)

| 工具 | 用途 |
|---|---|
| `audit_recommendations` | 多规则合并建议（合并孤儿、简化别名链等） |
| `recommend_orphan_merge` | 未使用令牌的合并方案 |
| `recommend_alias_optimization` | 别名链简化方案 |

### 6.4 诊断 / Diagnostics (2)

| 工具 | 用途 |
|---|---|
| `list_jobs` | 列出已缓存的体检任务 |
| `delete_job` | 删除旧任务 |

---

## 7. Job 生命周期 / Job lifecycle

```
audit_run()
   │
   ├─ 1. 生成确定性 jobId（target + ignore 的 SHA256）
   ├─ 2. 后台 spawn token-audit CLI
   ├─ 3. CLI 写出 report.json / report.html
   ├─ 4. MCP 把结果读回并写入 JobStore
   └─ 5. 所有工具从缓存读（无需重复扫描）
```

缓存目录：`~/.cache/token-audit/<jobId>/`

```
.jobId/
├── meta.json           # 元数据 + 摘要
├── report.json         # 完整报告
├── declarations.json   # 所有令牌声明
└── exports/            # 所有导出格式
```

**同样的 `target + ignore` 会得到同样的 jobId**，防止重复扫描。缓存默认保留 30 天，或用 `delete_job` 手动删。

> **缓存目录不跟随工作目录。** GUI 应用（Qoder 等）启动 MCP server 时 cwd 常常是 `/`，把缓存放在 cwd 下会直接 EACCES 失败。解析顺序：`TOKEN_AUDIT_CACHE` 环境变量 → `~/.cache/token-audit` → `<tmp>/token-audit`。用 `TOKEN_AUDIT_CACHE` 可覆盖成任意绝对路径。

### `classification` 参数

`audit_run` 默认**关闭** dembrandt 分类。原因是它会再起一个浏览器、耗时约 2.5 分钟，而体检的核心结论（冲突、悬空、重复、孤儿）来自静态扫描 × 运行时实测的交叉比对，不依赖它。

需要字样/组件/动效分类时显式开启：

```json
{ "target": "./src", "runtime": true, "classification": true }
```

此时 `estimated_seconds` 会返回 180。

---

## 8. 自动化示例 / Automation examples

### 8.1 Node 脚本：跑一次体检 + 导出

```js
import { JobStore } from 'token-audit-mcp/cache';
import { audit_run } from 'token-audit-mcp/handlers/audit-run.js';
import { export_dtcg } from 'token-audit-mcp/handlers/export-dtcg.js';
import { resolveCacheDir } from 'token-audit-mcp/utils/cache-dir.js';

const cacheDir = resolveCacheDir();
const store = new JobStore(cacheDir);
const { jobId } = await audit_run(
  { target: './src/pages', severity: 'info' },
  { store, cacheDir }
);

// 等后台跑完
for (let i = 0; i < 60; i++) {
  const job = await store.get(jobId);
  if (job?.status === 'complete') break;
  await new Promise(r => setTimeout(r, 500));
}

const out = await export_dtcg({ jobId }, { store, cacheDir });
console.log('导出到:', out.filePath);
```

### 8.2 CI：把体检当关卡

```yaml
- name: Design token audit
  run: |
    node token-audit/bin/token-audit.js src/pages --no-runtime --severity error --quiet
    # 退出码 1 = 有 error 级问题，CI 会失败
```

### 8.3 运行时实测（本地 HTML）

```bash
token-audit ./src/pages/dashboard.html \
  --target-file ./src/pages/dashboard.html \
  --route '#/dashboard' \
  --out ./token-audit-out
```

CLI 会自动起一个本地静态服务，用 Playwright 打开页面，采样真实渲染后的 CSS 变量。

---

## 9. 优雅降级 / Graceful degradation

| 缺了什么 | 行为 |
|---|---|
| 没有 Playwright | 跳过运行时实测，报告里标注 `degraded` |
| 没有 dembrandt | 跳过分类，静态分析照常 |
| 目标不可达 | 立即退出，报错 |
| 没有源文件 | 正常完成，结果为空 |

所有工具的错误返回结构一致：

```json
{
  "success": false,
  "error": {
    "code": "NETWORK_ERROR",
    "message": "Target URL unreachable after 30s",
    "details": { "target": "https://broken.example" }
  }
}
```

---

## 10. 性能 / Performance

实测（Noah Mind 项目，`src/pages`，9 个文件）：

- 静态扫描 **0.5s**（含 1101 条声明、13327 次引用、186 条结论）
- 之前实现的 O(n²) 行号计算在同样输入下需要 74-81s

关键点：扫描时用了**单调递增的行号计数器**，而不是对每个匹配点 `slice(0, index)` 重新数换行符。输出与朴素实现逐字节一致。

---

## 11. 目录结构 / Layout

```
token-audit-mcp/
├── bin/
│   ├── token-audit-mcp.js   # CLI 入口
│   └── test.js              # E2E 测试（21 项检查）
├── src/
│   ├── mcp-server.js        # MCP server 主体
│   ├── handlers/            # 14 个工具的实现
│   ├── cache/               # JobStore（文件系统）
│   └── utils/
│       └── spawn-audit.js   # MCP ↔ CLI 桥接
├── scripts/
│   ├── setup.js             # postinstall 检查
│   └── build-sample.mjs     # 生成 examples/noah-sample
├── README.md                # 设计令牌体检仪简介（中英）
├── README.designer.md       # 设计师指南（中英）
├── README.developer.md      # 本文档
└── examples/
    ├── preview.html         # Noah Mind 可视化页
    ├── preview-comparison.html  # 三样例对比页
    ├── noah-sample/         # 真实体检产物（Noah Mind）
    ├── anthropic-local/     # Anthropic 本地标本（1 条结论）
    ├── anthropic-url/       # Anthropic 线上 URL（278 条结论）
    └── fetch-url.sh         # URL 抓取脚本（HTML + CSS chunks）
```

---

## 12. 测试 / Testing

```bash
node bin/test.js
```

21 项检查，覆盖：initialize、tools/list、audit_run、job_status、audit_summary、audit_findings、五种导出、recommendations、list_jobs、delete_job。

---

## License

MIT
