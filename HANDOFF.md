# Polish — 开发交接文档（给 AI）

本文档面向接手开发 polish 的 AI，浓缩项目背景、当前状态、开发流程与关键约定，便于在任何新对话窗口中快速恢复上下文并继续开发。

## 项目是什么

**polish** 是一个设计令牌（CSS 自定义属性）超级工具，闭环三阶段：**Extract → Critique → Apply**（提取 → 审查 → 应用）。从只读审计延伸到可执行修复：扫描样式表中的令牌问题，分类，自动修复机械性问题，将需要人类判断的问题标记出来交由人或 AI 代理决定。

以三种形态分发：CLI、MCP 服务器、Node.js 模块。npm 包名 `polish-design-tokens`，GitHub 仓库 `maxdeng007/polish-design-tokens`。

**核心理念（机械/判断分流）**：有唯一安全答案的问题自动修复；需要决策的问题暴露出来，绝不静默打补丁。11 类发现中仅 `duplicate-value` 是机械性（自动修复），其余 10 类是判断性。

## 当前位置

迁移后仓库根目录：

```
/Users/dengzhou/Desktop/07-Personal/polish-design-tokens
```

（本文档随仓库迁移，始终位于仓库根目录。）

## 当前状态

- **版本**：1.7.2（npm `polish-design-tokens@1.7.2`，已发布）
- **测试**：186 个，全部通过
- **已实现功能**：scan/cross 审计、plan/diff/apply 补丁流水线、measure 运行时观测、`polish confirm` 决策确认、`polish check`/`fix` 一键命令、`polish report` 交互式 HTML 报告（含决策复选框、下载/复制 decisions.json、颜色色块、确认命令提示）、`polish explain`、`polish doctor`、交互式 wizard、MCP 服务器（8 个工具）、TypeScript 类型定义、中英双语文档。
- **已知待办**：`polish report` 的筛选/搜索（按 severity 或 token 名过滤）——目前 defer，仅在报告很大时才有价值，后续按需实现。

## 目录结构

```
polish-design-tokens/
├── polish-mono/          # npm 分发包（核心代码、CLI、MCP、测试）
│   ├── src/              # 源码（ESM）：scan/cross/plan/diff/apply/measure/confirm/report/wizard/format/explain…
│   ├── bin/polish.mjs    # CLI 入口
│   ├── src/handlers/     # MCP 工具 handler
│   ├── src/lib/parse.js  # CSS 解析
│   ├── test/             # node:test 测试套件（*.test.js）
│   └── package.json      # 包配置（exports 子路径、files、bin）
├── examples/             # 示例项目（walkthrough、noah-sample 等）
├── docs/                 # 设计规格
├── .github/workflows/ci.yml
├── README.md / README.zh-CN.md
└── HANDOFF.md            # 本文档
```

## 开发命令

需要 Node.js ≥ 18。在 `polish-mono/` 目录下操作：

```bash
# 运行全部测试（注意：是 glob，不能传目录路径 test/）
node --test test/*.test.js

# 只跑单个测试文件
node --test test/report.test.js

# 本地运行 CLI
node bin/polish.mjs --help
node bin/polish.mjs report ../examples/walkthrough/demo-project
```

**环境注意**：若 `node`/`npm` 被 nvm 的 lazy shell 函数拦截，用 `command` 前缀绕过，例如 `command node --test test/*.test.js`、`command npm publish`。

## Git 与发布工作流

- **远程名为 `github`**（不是 `origin`），SSH：`git@github.com:maxdeng007/polish-design-tokens.git`。
- **PAT 无法写 `.github/workflows/`**（无 workflow scope）→ CI 工作流文件必须通过 SSH push 推送。
- **不发布到 Gitee**（用户明确不需要）。
- **提交**：优先新建 commit，不 amend；推送用 `git push github main`。
- **发布 npm**：在 `polish-mono/` 下执行 `npm publish --access public`，可能需 `--otp`（bypass_2fa token）。
- **验证发布**：npm registry 的 direct API fetch 会命中过期 CDN 缓存，长时间返回旧版本。**以 `npm view polish-design-tokens version` 为准**，不要用 `fetch('.../registry...')` 判断。

## 架构与关键决策

- **三阶段**：Phase 1 = plan.js + diff.js（找问题 → 生成补丁）；Phase 2 = apply.js + CLI（执行补丁）；Phase 3 = Skill/MCP 集成。
- **MECHANICAL_IDS**（自动修复）：仅 `duplicate-value`。`dangling` 已降级为 judgmental（`inherit` 不是安全默认值）；`hardcoded` 也是 judgmental（需运行时观测定位源码值）。
- **JUDGMENTAL_IDS**（委托给 agent/人工）：`conflict`、`dangling`、`hardcoded`、`cascade-override`、`namespace`、`runtime-drift`、`orphan`、`typography`、`layout`、`spacing`、`colorize`、`bolder`、`adapt`。
- **补丁类型**：`replace`（文本替换）、`add`（插入新行）、`rewrite`、`rename`、`delete`。
- **证据结构**：每个 finding 的 evidence 数组含 file/line。duplicate-value 的 evidence 含 primaryFile/primaryLine 与 secondaryFile/secondaryLine——补丁必须靶向 secondary token 的行，否则会创建自引用别名（`--x: var(--x)`）。
- **`polish report`**：`src/report.js` 的 `generateReport(report)` 生成自包含 HTML（内联 CSS/JS，无外部资源）。决策复选框用 `data-decision` 属性，勾选后下载/复制 `decisions.json`，交给 `polish confirm` 带备份执行。`esc()` 防 HTML 注入。

## 关键约定与坑（务必遵守）

1. **ESM**：包是 `"type": "module"`，源码用 `import`/`export`。
2. **`.d.ts` 类型**：函数声明用 `declare function`，类型用 `export interface`/`export type`——不要在 .d.ts 里写 `export function`。
3. **apply 边界校验**：必须用 `fs.realpathSync()` 解析符号链接，不能用 `path.resolve()`（`path.resolve` 只做词法规范化，macOS 上 `/tmp`→`/private/tmp` 会误判越界）。
4. **测试路径**：测试里 demo 项目路径用 `fileURLToPath(new URL('../../examples/...', import.meta.url))` 转为字符串，直接传 URL 对象给 `scan()` 会报 `ERR_INVALID_ARG_TYPE`。
5. **测试 glob**：`node --test test/*.test.js`，不能传目录。
6. **测试断言 CSS**：用正则提取具体规则块（如 `/\.severity-section h2\s*\{[^}]*\}/`），否则其他规则（如 `.decisions` 的 `padding-top`）会造成假通过。
7. **handler 路径**：用 `path.join` 时须从 `path` 导入 namespace 或具名 `join`，否则 `ReferenceError: path is not defined`。
8. **包发布**：`files` 字段含 `bin`、`src`、`docs`、`banner.jpg`、`README.md`、`LICENSE`；npm 从 `polish-mono/` 发布，`files` 路径相对于包根。

## 给 AI 的工作提示

- **遵循 TDD**：新功能/修复先写失败测试，验证 RED，再写最小实现，验证 GREEN。
- **改代码后必跑测试**：`node --test test/*.test.js`，全部通过才算完成。
- **改报告 HTML 时**：视觉调整也用 TDD（断言具体 CSS 规则块），并在浏览器/demo 文件中实际查看。
- **新增 CLI 命令或导出**：同步更新 4 份 README（根 + polish-mono × 中英）、`src/index.js` 导出、`package.json` 的 `exports` 子路径、`src/*.d.ts` 类型。
- **版本号**：功能新增 bump minor，修复/打磨 bump patch；发布前确认 registry。
