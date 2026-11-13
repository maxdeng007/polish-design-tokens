# 设计令牌体检仪 · Design Token Health Check

> 一份写给**没有代码经验**的人看的指南。
> A guide for people who **don't write code**.

---

## 它能帮你做什么 / What it does for you

**设计令牌（design token）**就是设计系统里那些"常量"——颜色、字号、间距、圆角。它们本来是为了让设计和开发说同一套语言。

问题是：当系统变大，没人记得住这些数字到底定义在哪、有没有互相打架。**设计令牌体检仪**就是帮你把这件事看清楚。

Design tokens are the constants in your design system — colors, sizes, spacing. They exist so design and development speak one language. The problem: as a system grows, nobody remembers where each number is defined, or whether they contradict each other. **This tool makes that visible.**

它不会：

- ❌ 修改你的文件（只读）
- ❌ 告诉你"应该怎么设计"
- ❌ 需要你写一行代码

它只会告诉你：**这里有几个数字在打架、这几个没人用、这几个值重复了。**

---

## 四类体检结论 / The four kinds of findings

体检报告里每一条结论，都是这四种之一。看懂这四种，报告就看懂了一半。

Every finding is one of these four. Learn these, and half the report makes sense.

| 类型 / Type | 中文含义 | 一个例子 / Example |
|---|---|---|
| **冲突 conflict** | 同一个令牌被定义了**两个不同的值** | `--bg` 被设成 `#f3f5f8` 又在别处设成 `#f8f7f4` |
| **悬空 dangling** | 代码里引用了一个叫 `--xxx` 的令牌，但**没人定义它** | 用了 `--nm-canvas`，但没找到它的定义 |
| **孤儿 orphan** | 定义了，但**从来没被用过** | 有个 `--brand-glow`，一处都没引用 |
| **重复 duplicate** | 不同名字，值却一模一样（可能是命名没统一） | `--green` 和 `--success` 都是 `#22c55e` |

还有两种特殊情况：

- **级联覆盖 cascade-override**：后面的定义悄悄盖住了前面的
- **主题差异 theme-variation**：亮色/暗色下值不同（这通常是**正常的**，但需要确认是有意为之）

---

## 怎么读报告 / How to read the report

报告（`report.html`）打开就能看，每个问题有三样东西：

Each finding gives you three things:

1. **标题**——发生了什么
2. **证据**——在哪个文件、第几行、什么值
3. **影响范围**——被引用了几次、波及哪些文件

**优先级建议：**

| 先处理 | 原因 |
|---|---|
| 🔴 冲突 conflict | 同一个令牌两个值，渲染结果不确定 |
| 🔴 悬空 dangling | 引用了不存在的令牌，样式可能丢失 |
| 🟡 重复 duplicate | 说明命名体系还没统一 |
| 🟢 孤儿 orphan | 可以清理，但不紧急 |

---

## 导出给开发 / Exporting for your developers

体检完，可以把结果导出成开发能直接用的文件。点一下就行，不用懂格式区别。

After the check, you can export results into files developers can use directly.

| 文件 / File | 用途 / Use case |
|---|---|
| `tokens-studio.json` | 导入 Figma 插件 Tokens Studio，让设计稿和代码同步 |
| `dtcg.json` | 标准格式，任何工具都能读（W3C 规范） |
| `tailwind.config.js` | 给 Tailwind 项目直接用 |
| `shadcn-theme.css` | 给 shadcn/ui 项目直接用 |
| `style-dictionary/` | 多平台（Web / iOS / Android）一套令牌 |

---

## 常见问题 / FAQ

**我需要会写代码吗？/ Do I need to write code?**
不需要。体检仪是个"开关"，按一下就出结果。你只需要能打开一个网页或点一个按钮。

**它会改动我的设计文件吗？/ Will it change my design files?**
不会。它只**读**，不写。原始文件一个字节都不会变。

**看不懂结论怎么办？/ What if I don't understand a finding?**
先按上面的优先级看🔴红色和🟡黄色。每条结论都写了"在哪个文件、第几行、什么值"，照着找就行。

**为什么我看到的和报告不一样？/ Why doesn't what I see match the report?**
报告反映的是**代码里**的令牌定义，不是渲染出来的效果。两者不一致，恰恰可能是问题本身（比如一个令牌被覆盖了）。

---

## 给设计师的下一步 / Next step for designers

1. 打开 [examples/preview-comparison.html](../examples/preview-comparison.html)，看三个真实样例的对比——干净的系统只有 1 条结论，线上真实代码有 278 条
2. 或者打开 [examples/preview.html](../examples/preview.html)，看 Noah Mind 的完整可视化
3. 让开发同学帮你跑一次体检（他们只需要 10 分钟）
4. 从🔴红色的"冲突"开始，一个一个对齐

> **三个样例的关系**：
> - `examples/anthropic-local/` —— 干净的系统（1 条结论）
> - `examples/anthropic-url/` —— 线上真实代码（278 条结论）
> - `examples/noah-sample/` —— 中等规模项目（186 条结论）
>
> 对比着看，就能理解这个工具在做什么。

> 记住：体检仪只负责**指出问题**，不负责**替你解决**。
> 最后怎么改，还是你说了算。

**This tool only points out problems. It doesn't decide how to fix them. That's still your call.**
