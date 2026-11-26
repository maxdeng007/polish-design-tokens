[English](mcp-integration.md) | [中文](mcp-integration.zh-CN.md)

# MCP 集成指南

polish 通过 Model Context Protocol 暴露 9 个工具（stdin/stdout 上的 JSON-RPC 2.0）。任何支持 MCP 的 AI 编程代理都能驱动完整的审计 → 修复流水线。

## 设置

添加到你的 MCP 配置（`mcp.json`、`.mcp.json` 或你的代理配置）：

```json
{
  "mcpServers": {
    "polish": {
      "command": "polish",
      "args": ["mcp"]
    }
  }
}
```

如果 `polish` 不在 PATH 中：

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

## 工具

### `polish_extract`

从目录中提取令牌声明。

**输入：**
```json
{ "target": "./src/styles", "ignore": ["vendor"] }
```

**输出：** `DeclarationGraph` — 声明、引用、冲突、悬空引用、孤儿令牌、摘要。

**使用时机：** 需要不含发现的原始令牌图时。适合在运行完整审计前了解存在哪些令牌。

---

### `polish_audit`

扫描 + 交叉比对，生成发现。

**输入：**
```json
{ "target": "./src/styles", "ignore": ["vendor"] }
```

带运行时观测：
```json
{
  "target": "./src/styles",
  "observation": {
    "documents": [
      { "label": "dashboard", "theme": "light", "variables": { "--accent": "#e05800" } }
    ]
  }
}
```

**输出：** `{ findings, summary, graphSummary, observation }` — `findings` 按严重程度排序，`summary` 含 `declarations`、`uniqueTokens`、`runtimeVariables`、`runtimeDocuments`、`findings` 及 `bySeverity` 计数，`graphSummary` 描述扫描到的令牌图，`observation` 回显传入的运行时数据（未传则为 `null`）。

**使用时机：** 需要了解项目令牌存在的问题时。这是审计阶段的主要入口。

---

### `polish_measure`

为审计规范化运行时观测数据。

**输入：**
```json
{
  "documents": [
    { "label": "dashboard", "theme": "light", "variables": { "--accent": "#e05800" } },
    { "label": "settings", "theme": "light", "variables": { "--accent": "#ff6600" } }
  ]
}
```

**输出：** `RuntimeObservation` — `{ documents: [...] }`

**使用时机：** 你有来自浏览器 DevTools 的运行时数据，想将其传入 `polish_audit`。数据会被规范化以处理替代字段名（`page`、`url`、`name` 对应 `label`；`mode` 对应 `theme`；`resolved`、`values` 对应 `variables`）。

---

### `polish_plan`

将发现转换为排序后的分类操作队列。

**输入：**
```json
{ "findings": [ { "id": "dangling", "severity": "error", "title": "...", "detail": "...", "evidence": [], "suggestion": "..." } ] }
```

**输出：** `{ plan, summary }` — `plan` 为按优先级排序的 `PlanAction[]`，每条操作含 `type`（mechanical/judgmental）、`priority`、`action`（fix/review/note）及原始发现。`summary` 含 `total`、`mechanical`、`judgmental`、`topPriority` 计数。

**使用时机：** `polish_audit` 之后、生成补丁之前。分类哪些可以自动修复、哪些需要人工判断。

---

### `polish_diff`

从计划生成机械性补丁。

**输入：**
```json
{ "plan": [ { "finding": {...}, "action": "fix", "type": "mechanical", "priority": 2 } ] }
```

**输出：** `{ patches, preview }` — `patches` 为 `Patch[]`，仅机械性条目生成补丁。每个补丁含 `type`、`file`、`line`、`before`、`after`、`reason`、`findingId`。`preview` 为前十个补丁的简短可读摘要。

**使用时机：** `polish_plan` 之后，获取机械性修复的具体补丁。

---

### `polish_apply`

带备份保护执行补丁。**必须提供 target**——target 之外的补丁会被拒绝。

**输入：**
```json
{
  "patches": [ { "type": "replace", "file": "src/tokens.css", "line": 12, "before": "#1a1a2e", "after": "var(--bg)", "reason": "...", "findingId": "duplicate-value" } ],
  "target": "./src/styles"
}
```

`delete` 和 `rewrite` 补丁必须携带 `before`（预期的原始行文本，或要替换的令牌名）。

**输出：** `ApplyResult` — `{ status, applied: [...], failed: [...], backupCount: N, backups: [{ file, backup, runId }], rolledBack: [...] }`

**安全：** 运行严格遵循全有或全无。任何补丁在预检阶段失败时，不会写入任何内容，`status` 为 `"aborted"`。若补丁在执行阶段失败，本次运行写入的每个文件都会从其备份恢复，`status` 为 `"rolledBack"`。每个文件在首次补丁触及前会备份：首次运行创建 `file.backup`，后续运行快照到 `file.backup.<runId>`（原始备份永不覆盖）。

**使用时机：** `polish_diff` 之后，应用生成的补丁。这是唯一修改文件的阶段。

---

### `polish_rollback`

从 `polish_apply` 的备份清单恢复文件。

**输入：**
```json
{
  "backups": [ { "file": "src/tokens.css", "backup": "/abs/path/src/tokens.css.backup", "runId": "run-xxxx" } ],
  "target": "./src/styles"
}
```

**输出：** `{ restored: [...], failed: [...] }`

**安全：** **必须提供 target。** 仅接受服务端生成的规范备份路径——`<file>.backup` 或与条目 `runId` 匹配的 `<file>.backup.<runId>`。任意路径会被拒绝，因此不可信的清单无法将外部文件内容注入你的项目。

**使用时机：** 某次 apply 出了问题（`status: "rolledBack"`，或干净应用后你想撤销），需要恢复应用前的状态。

---

### `polish_doctor`

检查可选依赖是否已安装。

**输入：**
```json
{}
```

**输出：** 健康检查报告 — 确认可选技能与工具（dembrandt、taste、awesome-design-md、impeccable）是否可用，并为缺失项返回可直接执行的安装命令。

**使用时机：** 排查设置问题，或在运行流水线前验证环境。

---

### `polish_style_lookup`

按品牌名或模式查找设计令牌。

**输入：**
```json
{ "brand": "vercel" }
```

**输出：** 品牌设计令牌参考（颜色、排版、间距、圆角），含 `source` 字段指示来自外部 skill 还是内置数据。

**内置品牌：** vercel、stripe、linear、notion、anthropic、github、shadcn、figma。

**使用时机：** 需要特定品牌的设计令牌参考以指导令牌命名或值时。无需安装任何外部 skill——自动回退到内置数据。

## 契约

`tools/list` 中的每个工具都带有正式的 JSON Schema `outputSchema`，每个 `tools/call` 结果同时包含文本载荷（`content[0].text`）和机器可读的 `structuredContent` 对象，两者数据一致。可以直接按 `outputSchema` 校验，或直接消费 `structuredContent`——两者保证存在。

## 典型工作流

```
1. polish_audit(target)           → { findings, summary, graphSummary, observation }
2. polish_plan(findings.findings) → { plan, summary }（已排序）
3. polish_diff(plan.plan, target) → { patches, preview }（仅机械性）
4. polish_apply(patches.patches, target) → ApplyResult（已修改文件 + 备份）
```

注意每一层如何解包上一层的返回：`polish_plan` 取审计结果里的 `findings`，`polish_diff` 取计划结果里的 `plan`，`polish_apply` 取差异结果里的 `patches`。

对于运行时感知审计，在步骤 1 和 2 之间插入 `polish_measure` 以提供观测数据。

若某次 apply 运行出现异常，将其 `backups` 清单传给 `polish_rollback` 即可恢复应用前的状态。

## 错误处理

所有工具返回结构化结果而非抛出异常：

- **`polish_apply`** 在补丁预检失败时返回 `status: "aborted"`（不写入任何内容），在执行阶段失败时返回 `status: "rolledBack"`（整次运行回滚），补丁级明细在 `failed` 中。
- **`polish_rollback`** 从 apply 运行的 `backups` 清单恢复文件；备份路径不是规范的服务端生成兄弟文件的条目会被拒绝并记入 `failed`。
- **`polish_style_lookup`** 在品牌未找到但内置数据可用时返回 `{ found: false, available: true, availableBrands: [...] }`。
- **`polish_measure`** 过滤无效文档（非对象），并为缺失字段设置默认值（`theme` → `"default"`，`label` → `"unknown"`）。
