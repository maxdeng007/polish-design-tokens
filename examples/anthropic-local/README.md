# Anthropic · 本地文件体检样例 / Local File Audit

> 一份从**本地文件**跑出来的体检结果。
> An audit result from a **local file**.

---

## 这是什么 / What this is

用 `token-audit` 对本地文件 `anthropic-design-system.html`（一份从 anthropic.com 提取的设计令牌样本）做体检的产物。

An audit of the local file `anthropic-design-system.html` — a design token specimen extracted from anthropic.com.

## 和其他样例的关系 / Relationship to other samples

这是**两个 Anthropic 样例**之一：

| 样例 / Sample | 来源 / Source | 结论数 / Findings |
|---|---|---|
| `anthropic-local/` | 本地文件（精心整理的样本） | **1** 条 |
| `anthropic-url/` | 线上 URL（anthropic.com 实时抓取） | **278** 条 |

同样的工具，同样的站点，结果天差地别——这正是体检仪的价值所在：**它能告诉你一个系统干净还是脏**。

Same tool, same site, wildly different results — which is exactly the point: **it tells you whether a system is clean or messy.**

---

## 文件清单 / Files

| 文件 / File | 内容 / What's inside |
|---|---|
| `report.html` | 人看的体检报告，浏览器直接打开 |
| `report.json` | 机器可读的完整报告 |
| `meta.json` | 元数据：目标、摘要、分类统计 |
| `declarations.json` | 全部 14 条令牌声明 |
| `tokens-sample.json` | 令牌精简清单 |
| `exports/` | 五种导出格式 |

---

## 体检结论 / Summary

```
声明 declarations ...... 14
唯一令牌 unique tokens . 14
引用 references ........ 94
结论 findings .......... 1
  提示 info ............ 1
```

### 按规则 / By rule

| 规则 | 条数 | 含义 |
|---|---|---|
| `namespace` | 1 | 命名族观察（14 个令牌来自 9 个命名族前缀） |

---

## 为什么只有 1 条结论 / Why only 1 finding

因为这份样本是**精心整理**的：每个令牌只定义一次，命名统一，没有重复值。它代表了一个**健康的**设计系统。

This specimen is **curated**: each token defined once, naming unified, no duplicates. It represents a **healthy** design system.

体检仪不会编造问题。干净的系统它就报干净——这也是它可靠的地方。

The tool doesn't invent problems. A clean system reports clean — that's what makes it trustworthy.

---

## 怎么重新生成 / How to regenerate

```bash
node token-audit-mcp/scripts/build-sample.mjs \
  ./anthropic-design-system.html \
  ./examples/anthropic-local
```

---

## 给设计师 / For designers

打开 `report.html` 看完整报告。这份报告很短——只有一条提示，说明这个系统很干净。

Open `report.html` for the full report. It's short — one note, meaning the system is clean.
