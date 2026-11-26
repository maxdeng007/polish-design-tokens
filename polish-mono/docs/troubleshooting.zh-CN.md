[English](troubleshooting.md) | [中文](troubleshooting.zh-CN.md)

# 故障排查

常见问题、错误信息及其解决方案。

## CI / 构建失败

### `require is not defined in ES module scope`

**原因：** 包为 `"type": "module"`，但某个源文件使用了 CommonJS 的 `require()`。

**修复：** 确保所有源文件使用 ESM 语法（`import`/`export`）。确认推送到 GitHub 的文件是 ESM 版本，而非过期的 CommonJS 副本。本地运行 `node --test test/*.test.js` 验证。

### `missing export named 'scan'` 或 `missing export named 'cross'`

**原因：** GitHub 仓库中存在过期的 `scan.js` 和 `cross.js` CommonJS 版本，未导出预期的名称。

**修复：** 推送 ESM 版本。CI 工作流会检查这些导出。使用 SSH 推送（PAT 可能缺少 workflow scope 权限）：

```bash
git checkout -b fix/esm-sources
git add src/scan.js src/cross.js
git commit -m "fix: push ESM source files"
git push -u origin fix/esm-sources
```

## MCP 工具问题

### `polish_style_lookup` 返回 `found: false`

**原因：** 未找到外部 design-md skill 文件，且未提供 `brand` 参数。

**修复：** 传入 `brand` 参数以使用内置数据：

```json
{ "brand": "vercel" }
```

可用的内置品牌：`vercel`、`stripe`、`linear`、`notion`、`anthropic`、`github`、`shadcn`、`figma`。

或者，安装 awesome-design-md skill 以获得超出内置集的完整品牌覆盖。

### MCP 服务器无法启动

**原因：** `polish` 命令不在 PATH 中，或 Node.js 版本 < 18。

**修复：** 在 MCP 配置中使用 `npx`：

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

验证 Node.js 版本：`node --version`（必须 ≥ 18）。

### `polish_apply` 报告 `before text "..." not found`

**原因：** 补丁的 `before` 字符串与文件内容不完全匹配。可能的原因：
- 审计运行后文件被修改
- 审计输出与实际文件之间存在空白/引号差异
- 多个补丁针对同一行，且第一个补丁改变了内容

**修复：** 从新的审计重新生成补丁。检查应用前创建的 `.backup` 文件以查看原始内容。备份文件名为 `<原始文件>.backup`。

### `polish_apply` 报告 `line out of range`

**原因：** 补丁引用的行号在文件中不存在。可能的原因：
- 审计后文件被截断或修改
- 补丁是基于文件的不同版本生成的

**修复：** 从新的审计重新生成补丁。确保审计和应用于目标目录之间未发生变化。

## 审计问题

### 没有出现 `runtime-drift` 或 `hardcoded` 发现

**原因：** 这些发现类型需要来自 `measure()` 的 `RuntimeObservation`。仅静态审计（不含观测数据）不会产生它们。

**修复：** 提供运行时观测数据。从 Chrome DevTools（或其他测量工具）收集浏览器测量值，用 `polish_measure` 规范化，或手动构造观测数据：

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

### `conflict` 发现的严重程度：根作用域为 `error`，选择器作用域为 `warn`

**原因：** 这是设计如此。根作用域冲突意味着同一令牌在 `:root` 级别有不同的值，这始终是 bug。选择器作用域冲突为警告，因为层叠可能会根据匹配顺序正确解析它们。

**修复：** 对于根作用域冲突，合并为单一规范值。对于选择器作用域冲突，如果变异是有意的，则合并或拆分为独立令牌。

### 对似乎已声明的令牌出现 `dangling` 发现

**原因：** 声明可能在未被扫描的文件中（如 `node_modules` 内部或被 `ignore` 排除的目录）。或者声明使用了与引用不同的名称。

**修复：** 检查 `ignore` 选项——确保包含声明的文件未被排除。验证令牌名完全匹配（区分大小写）。在发现的 evidence 中查看引用位置。

### 出现 `state-variation` 或 `theme-variation` 而非 `conflict`

**原因：** 交叉比对层检测到差异可由作用域上下文（状态类或主题属性）解释，而非真正的冲突。这些是信息性提示，不是错误。

**修复：** 无需操作——这些是预期模式。如果你想规范化它们，按照发现中建议为每个状态/主题创建专用令牌。

## 性能问题

### 大型项目扫描缓慢

**原因：** 扫描器零依赖且单线程，按顺序处理文件。

**修复：** 使用 `ignore` 选项排除不包含令牌的目录：

```json
{ "target": ".", "ignore": ["node_modules", "dist", "build", ".next", "test"] }
```

扫描器已自动跳过二进制文件（通过空字节检测）和常见构建/依赖目录（`node_modules`、`dist`、`build`、`.git`、`.next`、`.cache` 等）。

### 大型项目出现大量 `namespace` 发现

**原因：** 大型项目往往会随时间积累多种命名约定。

**修复：** 这是判断性发现——不自动修复。审查列出的命名族，选择一个或两个作为主系统。将其余降级为别名或逐步淘汰。`duplicate-value` 发现可以帮助识别不同命名族表达相同值的位置。
