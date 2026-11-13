# Noah Mind 2.0 · 体检样例 / Sample Audit

> 这是一份**真实**的体检结果，不是演示数据。
> This is a **real** audit result, not demo data.

---

## 这是什么 / What this is

用 `token-audit` 对 Noah Mind 项目的 `src/pages`（9 个文件）做过一次完整体检，导出的产物。可以直接打开看，不用跑任何东西。

A complete audit of Noah Mind's `src/pages` (9 files), exported as artifacts. Open these directly — no need to run anything.

## 先看这个 / Start here

打开 `../preview.html` —— 一份把这份体检结果做成的**交互式可视化页面**，最适合不了解项目的人快速理解。

Open `../preview.html` — an interactive visualization of this exact result. Best starting point for anyone unfamiliar with the project.

---

## 文件清单 / Files

| 文件 / File | 内容 / What's inside |
|---|---|
| `report.html` | **人看的体检报告**，浏览器直接打开。每条结论带证据。 |
| `report.json` | 机器可读的完整报告（嵌套结构：`report` / `graph` / `observation`） |
| `meta.json` | 元数据：目标、摘要、按严重程度/规则分类的统计 |
| `declarations.json` | 全部 1101 条令牌声明（扁平数组） |
| `tokens-sample.json` | 前 240 个令牌的精简清单，给预览页用 |
| `exports/` | 五种导出格式，见下 |

### 导出格式 / Export formats

| 文件 | 用途 |
|---|---|
| `exports/tokens-studio.json` | Figma 插件 Tokens Studio |
| `exports/dtcg.json` | W3C DTCG 标准 |
| `exports/tailwind.config.js` | Tailwind 项目 |
| `exports/shadcn-theme.css` | shadcn/ui 项目 |
| `exports/style-dictionary/web.css` | 多平台样式字典 |

---

## 体检结论 / Summary

```
声明 declarations ...... 1101
唯一令牌 unique tokens . 290
引用 references ........ 13327
结论 findings .......... 186
  错误 error ............ 65
  警告 warn ............ 32
  提示 info ............ 89
耗时 duration ............ 0.5s
```

### 按规则 / By rule

| 规则 | 条数 | 含义 |
|---|---|---|
| `theme-variation` | 85 | 主题/作用域间值不同（多数正常） |
| `dangling` | 56 | 引用了没定义的令牌 |
| `conflict` | 39 | 同一令牌两个值 |
| `duplicate-value` | 1 | 不同名字同值 |
| `orphan` | 1 | 定义了没用 |
| `cascade-override` | 1 | 后者覆盖前者 |
| `state-variation` | 2 | 状态色差异（正常） |
| `namespace` | 1 | 命名族过多 |

---

## 怎么重新生成 / How to regenerate

```bash
# 在仓库根目录
node token-audit-mcp/scripts/build-sample.mjs \
  ./src/pages \
  ./examples/noah-sample
```

这会重新跑一次体检并把产物写回这个目录。

## 给设计师 / For designers

不用懂这些文件格式。打开 `../preview.html` 看可视化页面，或者打开 `report.html` 看完整报告。从红色的「冲突」开始，一个一个对齐。

Open `../preview.html` for the visualization, or `report.html` for the full report. Start with the red conflicts, one by one.
