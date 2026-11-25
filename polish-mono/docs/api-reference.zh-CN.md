[English](api-reference.md) | [中文](api-reference.zh-CN.md)

# API 参考

`polish-design-tokens` 所有公共 API 函数的完整类型定义和用法示例。

TypeScript 类型定义已随包内置——无需安装 `@types`。

## 模块

| 导入路径 | 导出 |
|-------------|---------|
| `polish-design-tokens` | `extract`、`audit`、`runPipeline`、`scan`、`cross`、`measure`、`plan`、`generateDiffs`、`apply` |
| `polish-design-tokens/scan` | `scan`、`walk` |
| `polish-design-tokens/cross` | `cross`、`familyOf`、`isStateVariant`、`selectorClasses` |
| `polish-design-tokens/measure` | `measure` |
| `polish-design-tokens/plan` | `plan`、`PRIORITY_ORDER`、`MECHANICAL_IDS`、`JUDGMENTAL_IDS` |
| `polish-design-tokens/diff` | `generateDiffs` |
| `polish-design-tokens/apply` | `apply` |
| `polish-design-tokens/rollback` | `rollback` |

## 核心函数

### `extract(target, ignore?)`

扫描目录中的 CSS 自定义属性声明和 `var()` 引用。返回 `DeclarationGraph`。

```typescript
import { extract } from 'polish-design-tokens';

const graph = extract('./src/styles');
// 或使用忽略模式
const graph = extract('./src/styles', ['vendor', 'test']);
```

**参数：**
- `target` (string)：要扫描的文件或目录路径
- `ignore` (string[])：可选的路径片段，跳过匹配的文件

**返回：** `DeclarationGraph` — 包含声明、引用、冲突、悬空引用、孤儿令牌和摘要计数。

---

### `audit(target, ignore?, observation?)`

扫描 + 交叉比对，生成包含发现的完整审计报告。

```typescript
import { audit, measure } from 'polish-design-tokens';

const observation = measure(runtimeData);
const report = audit('./src/styles', [], observation);

console.log(report.summary.bySeverity); // { error: 2, warn: 5, info: 3 }
```

**参数：**
- `target` (string)：要扫描的文件或目录路径
- `ignore` (string[])：可选的路径片段，跳过匹配的文件
- `observation` (RuntimeObservation | null)：可选的运行时数据，来自 `measure()`，用于检测 `runtime-drift` 和 `hardcoded` 发现

**返回：** `AuditReport` — 包含按严重程度排序的发现（error → warn → info）。

---

### `runPipeline(target, ignore?, observation?)`

完整流水线：提取 → 审计 → 计划 → 差异。**不**应用补丁（需通过 `apply()` 显式授权）。

```typescript
import { runPipeline, apply } from 'polish-design-tokens';

const { graph, findings, plan, patches } = runPipeline('./src/styles');
const result = await apply(patches);
console.log(result.applied, result.failed, result.backupCount);
```

**参数：**
- `target` (string)：要扫描的文件或目录路径
- `ignore` (string[])：可选的路径片段，跳过匹配的文件
- `observation` (RuntimeObservation | null)：可选的运行时数据

**返回：** `PipelineResult` — `{ graph, findings, plan, patches }`

---

### `scan(target, opts?)`

底层扫描函数。与 `extract` 相同，但接受选项对象。

```typescript
import { scan } from 'polish-design-tokens/scan';

const graph = scan('./src/styles', { ignore: ['vendor', 'test'] });
```

**参数：**
- `target` (string)：文件或目录路径
- `opts.ignore` (string[] | string)：要跳过的路径片段，可传数组或逗号分隔的字符串

**返回：** `DeclarationGraph`

---

### `cross(graph, observation?)`

对声明图进行判定，生成发现。这是流水线中的"审查"环节。

```typescript
import { scan, cross } from 'polish-design-tokens/scan';
import { cross } from 'polish-design-tokens/cross';

const graph = scan('./src/styles');
const report = cross(graph);
```

**参数：**
- `graph` (DeclarationGraph)：`scan()` 的输出
- `observation` (RuntimeObservation | undefined)：可选的运行时数据

**返回：** `AuditReport`

---

### `measure(docs?)`

将原始运行时观测数据规范化为 `cross()` 所需的格式。不执行浏览器测量——请先从 Chrome DevTools 或类似工具采集值。

```typescript
import { measure } from 'polish-design-tokens/measure';

const observation = measure([
  { label: 'dashboard', theme: 'light', variables: { '--accent': '#e05800' } },
  { label: 'dashboard', theme: 'light', variables: { '--accent': '#ff6600' } }
]);
```

**参数：**
- `docs` (unknown[])：原始文档观测数组。接受替代字段名：`label`/`page`/`url`/`name`、`theme`/`mode`、`variables`/`resolved`/`values`。

**返回：** `RuntimeObservation` — `{ documents: RuntimeDocument[] }`

---

### `plan(findings)`

将发现排序并分类为有序的操作队列。

```typescript
import { plan } from 'polish-design-tokens/plan';

const actions = plan(report.findings);
// actions[0]: { finding, action: 'fix', type: 'mechanical', priority: 2, mechanical: true, judgmental: false }
```

**参数：**
- `findings` (Finding[])：`audit()` 或 `cross()` 的输出

**返回：** `PlanAction[]` — 按优先级排序，每条分类为机械性或判断性。

---

### `generateDiffs(planItems)`

仅为机械性计划条目生成具体补丁。

```typescript
import { generateDiffs } from 'polish-design-tokens/diff';

const patches = generateDiffs(actions);
// [{ type: 'replace', file: 'src/tokens.css', line: 12, before: '#1a1a2e', after: 'var(--bg)', reason: '...', findingId: 'duplicate-value' }]
```

**参数：**
- `planItems` (PlanAction[])：`plan()` 的输出

**返回：** `Patch[]` — 仅机械性条目生成补丁。

---

### `apply(patches)`

将补丁应用到文件，带自动备份保护。

```typescript
import { apply } from 'polish-design-tokens/apply';

const result = await apply(patches);
// { applied: [{ file, line }], failed: [{ file, error }], backupCount: 3,
//   backups: [{ file, backup }], rolledBack: [{ file }] }
```

**参数：**
- `patches` (Patch[])：`generateDiffs()` 的输出
- `target` (string)：可选，补丁必须位于该目录内。默认为 `process.cwd()`。

**返回：** `Promise<ApplyResult>` — `{ applied, failed, backupCount, backups, rolledBack }`

**安全：** 任何写入前，每个补丁都会针对当前文件内容预先校验。每个文件在首次补丁触及前会备份为 `file.backup`。若某补丁在执行时失败，本次运行写入的所有文件都会自动从备份恢复并记录在 `rolledBack` 中。`backups` 清单可传给 `rollback()` 做后续手动恢复。失败的补丁不会中止批次。

---

### `rollback(backups, target?)`

从 `apply()` 运行产生的备份清单恢复文件。

```typescript
import { rollback } from 'polish-design-tokens/rollback';

const { backups } = await apply(patches, './src');
const result = await rollback(backups, './src');
// { restored: [{ file }], failed: [{ file, error }] }
```

**参数：**
- `backups` (Array<{ file: string; backup: string }>)：`apply()` 结果中的 `backups` 数组
- `target` (string)：文件必须位于该目录内。默认为 `process.cwd()`。

**返回：** `Promise<RollbackResult>` — `{ restored, failed }`

**安全：** 仅恢复目标目录内的文件，其余条目会被拒绝。备份缺失时记为失败且不改动原文件。备份文件本身永不被修改或删除。

## 类型

### `DeclarationGraph`

`scan()` 的完整输出：

```typescript
interface DeclarationGraph {
  version: number;
  root: string;
  target: string;
  files: string[];
  themes: string[];
  declarations: Declaration[];
  references: Reference[];
  conflicts: Conflict[];
  dangling: DanglingRef[];
  orphans: Orphan[];
  summary: ScanSummary;
}
```

### `Finding`

单条审计发现：

```typescript
interface Finding {
  id: FindingId;           // 'conflict' | 'dangling' | 'runtime-drift' | ...
  severity: 'error' | 'warn' | 'info';
  title: string;
  detail: string;
  evidence: FindingEvidence[];
  suggestion: string;
  refCount?: number;
}
```

### `PlanAction`

计划中的单个操作项：

```typescript
interface PlanAction {
  finding: Finding;
  action: 'fix' | 'review' | 'note';
  type: 'mechanical' | 'judgmental' | 'unknown';
  priority: number;
  mechanical: boolean;
  judgmental: boolean;
}
```

### `Patch`

具体补丁：

```typescript
interface Patch {
  type: 'replace' | 'add' | 'delete' | 'rewrite';
  file: string | null;
  line: number | null;
  before: string;
  after: string;
  reason: string;
  findingId: FindingId;
}
```

注意：`delete` 补丁必须携带 `before`（预期的原始行文本）。删除前会先与文件内容核对，缺少 `before` 的删除会被拒绝——绝不会执行仅凭行号的盲目删除。

### `ApplyResult`

应用补丁的结果：

```typescript
interface ApplyResult {
  applied: Array<{ file: string; line: number | string }>;
  failed: Array<{ file: string | null; line?: number; error: string }>;
  backupCount: number;
  backups: Array<{ file: string; backup: string }>;
  rolledBack: Array<{ file: string }>;
}

### `RollbackResult`

Result of restoring files from backups via `rollback()`:

```typescript
interface RollbackResult {
  restored: Array<{ file: string }>;
  failed: Array<{ file: string | null; error: string }>;
}
```

## 发现类型

| ID | 严重程度 | 分类 | 描述 |
|----|----------|----------------|-------------|
| `conflict` | error | 判断性 | 根作用域内同一令牌名有不同值 |
| `dangling` | error | 判断性 | 令牌被引用但从未声明 |
| `runtime-drift` | error | 判断性 | 运行时跨页面令牌值不一致 |
| `orphan` | warn | 判断性 | 已声明但从未被引用 |
| `duplicate-value` | warn | 机械性 | 多个令牌名共享同一值 |
| `namespace` | info | 判断性 | 多种命名族共存 |
| `hardcoded` | warn | 判断性 | 直接使用原始颜色/间距值而非令牌引用 |
| `cascade-override` | info | 判断性 | CSS 层叠产生非预期的变异 |
| `state-variation` | info | 判断性 | 令牌值在不同组件状态间变化 |
| `theme-variation` | info | 判断性 | 令牌值在不同主题间变化 |
| `dynamic-variable` | info | 判断性 | 具有动态（非静态）值的令牌 |
| `tailwind-utility-var` | info | 判断性 | Tailwind v4 每工具变量 |
