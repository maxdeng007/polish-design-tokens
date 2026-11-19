[English](mcp-integration.md) | [中文](mcp-integration.zh-CN.md)

# MCP 集成指南

polish 通过 Model Context Protocol 暴露 8 个工具（stdin/stdout 上的 JSON-RPC 2.0）。任何支持 MCP 的 AI 编程代理都能驱动完整的审计 → 修复流水线。

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
{ "target": "./src/styles", "ignore": "vendor" }
```

**输出：** `DeclarationGraph` — 声明、引用、冲突、悬空引用、孤儿令牌、摘要。

**使用时机：** 需要不含发现的原始令牌图时。适合在运行完整审计前了解存在哪些令牌。

---

### `polish_audit`

扫描 + 交叉比对，生成发现。

**输入：**
```json
{ "target": "./src/styles", "ignore": "vendor" }
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

**输出：** `AuditReport` — 按严重程度排序的发现，含摘要计数。

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

**输出：** `PlanAction[]` — 按优先级排序。每条操作含 `type`（mechanical/judgmental）、`priority`、`action`（fix/review/note）及原始发现。

**使用时机：** `polish_audit` 之后、生成补丁之前。分类哪些可以自动修复、哪些需要人工判断。

---

### `polish_diff`

从计划生成机械性补丁。

**输入：**
```json
{ "plan": [ { "finding": {...}, "action": "fix", "type": "mechanical", "priority": 2 } ] }
```

**输出：** `Patch[]` — 仅机械性条目生成补丁。每个补丁含 `type`、`file`、`line`、`before`、`after`、`reason`、`findingId`。

**使用时机：** `polish_plan` 之后，获取机械性修复的具体补丁。

---

### `polish_apply`

带备份保护执行补丁。

**输入：**
```json
{ "patches": [ { "type": "replace", "file": "src/tokens.css", "line": 12, "before": "#1a1a2e", "after": "var(--bg)", "reason": "...", "findingId": "duplicate-value" } ] }
```

**输出：** `ApplyResult` — `{ applied: [...], failed: [...], backupCount: N }`

**安全：** 每个文件在首次补丁触及前会备份为 `file.backup`。失败的补丁不会中止批次。

**使用时机：** `polish_diff` 之后，应用生成的补丁。这是唯一修改文件的阶段。

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

## 典型工作流

```
1. polish_audit(target)           → AuditReport（含发现）
2. polish_plan(findings)          → PlanAction[]（已排序）
3. polish_diff(plan)              → Patch[]（仅机械性）
4. polish_apply(patches)          → ApplyResult（已修改文件 + 备份）
```

对于运行时感知审计，在步骤 1 和 2 之间插入 `polish_measure` 以提供观测数据。

## 错误处理

所有工具返回结构化结果而非抛出异常：

- **`polish_apply`** 对无法应用的补丁返回 `failed` 数组（如 `before` 文本未找到、行号超出范围）。
- **`polish_style_lookup`** 在品牌未找到但内置数据可用时返回 `{ found: false, available: true, availableBrands: [...] }`。
- **`polish_measure`** 过滤无效文档（非对象），并为缺失字段设置默认值（`theme` → `"default"`，`label` → `"unknown"`）。
