# Anthropic · 线上 URL 体检样例 / Live URL Audit

> 一份从**线上 URL**（anthropic.com）实时抓取并体检的结果。
> An audit result from a **live URL** — fetched from anthropic.com in real time.

---

## 这是什么 / What this is

用 `token-audit` 对 anthropic.com 实时抓取的 HTML + CSS 做体检的产物。

这个样例演示了"审计一个线上 URL"的完整流程：

1. **抓取** —— 下载 anthropic.com 的 HTML 和它引用的 12 个 CSS chunk
2. **扫描** —— 静态分析所有 CSS 变量声明与引用
3. **比对** —— 找出冲突、悬空引用、重复值等

An audit of anthropic.com's live HTML + CSS. This demonstrates the full "audit a URL" workflow:

1. **Fetch** — download the HTML and its 12 referenced CSS chunks
2. **Scan** — static analysis of all CSS variable declarations and references
3. **Compare** — find conflicts, dangling references, duplicates

## 和其他样例的关系 / Relationship to other samples

这是**两个 Anthropic 样例**之一：

| 样例 / Sample | 来源 / Source | 结论数 / Findings |
|---|---|---|
| `anthropic-local/` | 本地文件（精心整理的样本） | **1** 条 |
| `anthropic-url/` | 线上 URL（anthropic.com 实时抓取） | **278** 条 |

同样的站点，精心整理的样本只有 1 条结论，线上真实代码却有 278 条。这个对比直观展示了：**设计系统在从设计稿变成线上代码的过程中，会积累多少漂移。**

Same site. The curated specimen has 1 finding; the live code has 278. This shows how much drift accumulates between design and production.

---

## 文件清单 / Files

| 文件 / File | 内容 / What's inside |
|---|---|
| `report.html` | 人看的体检报告，浏览器直接打开 |
| `report.json` | 机器可读的完整报告 |
| `meta.json` | 元数据：目标、摘要、分类统计 |
| `declarations.json` | 全部 7008 条令牌声明 |
| `tokens-sample.json` | 令牌精简清单 |
| `exports/` | 五种导出格式 |

---

## 体检结论 / Summary

```
声明 declarations ...... 7008
唯一令牌 unique tokens . 573
引用 references ........ 12546
结论 findings .......... 278
  错误 error ............ 144
  警告 warn ............ 101
  提示 info ............ 33
```

### 按规则 / By rule

| 规则 | 条数 | 含义 |
|---|---|---|
| `conflict` | 136 | 同一令牌两个值 |
| `dangling` | 107 | 引用了没定义的令牌 |
| `theme-variation` | 29 | 主题间值不同 |
| `duplicate-value` | 1 | 不同名字同值 |
| `orphan` | 1 | 定义了没用 |
| `cascade-override` | 1 | 后者覆盖前者 |
| `dynamic-variable` | 2 | 动态计算的变量 |
| `namespace` | 1 | 命名族观察 |

---

## 怎么重新生成 / How to regenerate

```bash
# 1. 抓取线上页面（HTML + CSS chunks）
bash examples/fetch-url.sh https://www.anthropic.com /tmp/anthropic-fetched

# 2. 体检
node token-audit-mcp/scripts/build-sample.mjs \
  /tmp/anthropic-fetched \
  ./examples/anthropic-url
```

> **注意**：线上页面会更新，重新抓取可能得到不同的结果。这恰恰说明体检仪适合放在 CI 里持续监控——令牌漂移是会随时间发生的。
>
> **Note**: The live page changes over time, so re-fetching may yield different results. This is exactly why the tool fits in CI — token drift happens over time.

---

## 给设计师 / For designers

打开 `report.html` 看完整报告。278 条结论看起来吓人，但绝大多数是**结构性观察**（theme-variation、namespace）而非确凿错误。先看红色的 144 条 `conflict` 和 `dangling`。

Open `report.html` for the full report. 278 findings looks daunting, but most are **structural observations** (theme-variation, namespace) rather than hard errors. Start with the 144 red `conflict` and `dangling` ones.
