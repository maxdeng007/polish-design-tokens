# Literal Cluster & Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the bridge slice — detect repeated literal values (`literal-cluster` finding), generate a token draft (`polish seed`), and rewrite literals to `var()` through `confirm` → `apply` with backups.

**Architecture:** Literal collection hooks into the existing parse state machines (CSS/HTML/JS), scan collects them into the graph, cross clusters them into a registry-driven info finding, a new seed module writes `tokens.css` + `tokens.seed.json`, and confirm resolves `tokenize` decisions into merged same-line replace patches that flow through the existing apply pipeline.

**Tech Stack:** Node.js (ESM, zero runtime dependencies), `node:test`, existing scan/cross/confirm/apply pipeline.

**Spec:** `docs/superpowers/specs/2026-11-26-literal-cluster-seed-design.md` — the plan argues from the spec; read both.

## Global Constraints

- Node >= 18, ESM (`"type": "module"`), zero runtime dependencies — no new dependencies.
- Test runner: `node --test test/*.test.js` run from `polish-mono/` (there is no `npm test` script).
- Typecheck: `command node node_modules/.bin/tsc` from `polish-mono/` (typescript ^7.0.2 is a devDependency).
- `literal-cluster`: severity `info`, classification `judgmental`, priority **13** — no existing priorities change.
- `confirm()` return shape changes to `{ patches, unmatched }` — update every caller (CLI + tests).
- MCP tool count contract becomes `tools.length === 10`.
- Never commit or push `HANDOFF.md` or `polish-design-tokens-evaluation.md` (local-only, untracked).
- Release: new capability → v1.10.0; CHANGELOG release heading must be `## [1.10.0] - date` (tag-driven consistency check requires this format).

## File Structure

- Modify `polish-mono/src/lib/parse.js` — `LITERAL_PROPS`, scalar patterns, `extractLiterals`; all parsers return `literals`.
- Modify `polish-mono/src/scan.js` — collect literals into graph + summary.
- Modify `polish-mono/src/findings.js` — register `literal-cluster` (info / judgmental / 13).
- Modify `polish-mono/src/cross.js` — `clusterLiterals` + finding + 0-token note wording.
- Create `polish-mono/src/seed.js` — `seed()`.
- Modify `polish-mono/src/format.js` — `formatSeed`.
- Modify `polish-mono/src/confirm.js` — `tokenize`, same-line merge, `unmatched`, new return shape.
- Modify `polish-mono/src/mcp-server.js`, create `polish-mono/src/handlers/polish-seed.js` — `polish_seed` tool.
- Modify `polish-mono/bin/polish.mjs` — `seed` command + confirm unmatched handling.
- Modify `polish-mono/src/index.js`, `src/index.d.ts`, `src/types.d.ts`, `src/confirm.d.ts`, `package.json` — exports/types.
- Tests: create `test/literals-parse.test.js`, `test/seed.test.js`; update scan/cross/findings/confirm/mcp/format tests.
- Docs: `README.md`, `README.zh-CN.md`, `polish-mono/README.md`, `polish-mono/README.zh-CN.md`, `polish-mono/docs/mcp-integration.md`, `polish-mono/docs/mcp-integration.zh-CN.md`, `CHANGELOG.md`.

---

### Task 1: Literal extraction in the parsers

**Files:**
- Modify: `polish-mono/src/lib/parse.js`
- Test: `polish-mono/test/literals-parse.test.js` (new)

**Interfaces:**
- Produces: `extractLiterals(prop, value, ctx)` → `LiteralOccurrence[]` where `LiteralOccurrence = { value, normalized, kind, property, file, line }`.
- Produces: `parseCss` / `parseHtml` / `parseJs` / `parseSfc` return `{ declarations, references, literals }` (`parseSource` re-exports these unchanged).

- [ ] **Step 1: Write the failing test**

Create `polish-mono/test/literals-parse.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSource } from '../src/parse.js';

test('parseCss: whitelisted property collects scalar literal', () => {
  const r = parseSource('a{color:#fff}', 'a.css');
  assert.equal(r.literals.length, 1);
  assert.deepEqual(r.literals[0], {
    value: '#fff', normalized: '#fff', kind: 'color',
    property: 'color', file: 'a.css', line: 1
  });
});

test('parseCss: property outside whitelist is not collected', () => {
  const r = parseSource('a{margin:8px}', 'a.css');
  assert.equal(r.literals.length, 0);
});

test('parseCss: non-scalar component skips the whole value', () => {
  const r = parseSource('a{background:#fff url(x.png)}', 'a.css');
  assert.equal(r.literals.length, 0);
});

test('parseCss: scalar components on one line yield two occurrences', () => {
  const r = parseSource('a{padding:8px 16px}', 'a.css');
  assert.equal(r.literals.length, 2);
  assert.deepEqual(r.literals.map(l => l.value), ['8px', '16px']);
  assert.equal(r.literals[0].line, 1);
  assert.equal(r.literals[1].line, 1);
});

test('parseCss: var() values are skipped', () => {
  const r = parseSource('a{color:var(--x)}', 'a.css');
  assert.equal(r.literals.length, 0);
});

test('parseCss: named colors are matched as-is, never normalized', () => {
  const r = parseSource('a{color:white} b{color:#fff}', 'a.css');
  assert.deepEqual(r.literals.map(l => l.normalized), ['white', '#fff']);
});

test('parseCss: quoted values are not literals', () => {
  const r = parseSource('a{color:"#fff"}', 'a.css');
  assert.equal(r.literals.length, 0);
});

test('parseCss: comments never produce literals', () => {
  const r = parseSource('a{/* padding: 8px */}', 'a.css');
  assert.equal(r.literals.length, 0);
});

test('parseCss: line numbers follow the declaration', () => {
  const r = parseSource('a{\nb{color:#fff}\n}', 'a.css');
  assert.equal(r.literals[0].line, 2);
});

test('parseHtml: inline style attribute is collected', () => {
  const r = parseSource('<div style="padding:8px 16px">x</div>', 'a.html');
  assert.equal(r.literals.length, 2);
  assert.equal(r.literals[0].file, 'a.html');
});

test('parseHtml: <style> block is collected', () => {
  const r = parseSource('<style>\na{color:#fff}\n</style>', 'a.html');
  assert.equal(r.literals.length, 1);
  assert.equal(r.literals[0].line, 2);
});

test('parseJs: JSX style object is collected', () => {
  const src = 'const A = () => <div style={{ background: "#fff", padding: "8px" }} />;';
  const r = parseSource(src, 'a.jsx');
  assert.equal(r.literals.length, 2);
  assert.deepEqual(r.literals.map(l => l.value), ['#fff', '8px']);
  assert.equal(r.literals[0].line, 1);
});

test('parseJs: setProperty with whitelisted property is collected', () => {
  const r = parseSource("el.setProperty('color', '#fff');", 'a.js');
  assert.equal(r.literals.length, 1);
  assert.equal(r.literals[0].value, '#fff');
  assert.equal(r.literals[0].property, 'color');
});

test('parseJs: non-CSS-context string is not collected', () => {
  const r = parseSource('const doc = "color: #fff";', 'a.js');
  assert.equal(r.literals.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd polish-mono && node --test test/literals-parse.test.js`
Expected: FAIL — `r.literals` is `undefined` (property does not exist on the result).

- [ ] **Step 3: Write minimal implementation**

In `polish-mono/src/lib/parse.js`, after the `CSS_PROPS` set (around line 90), add:

```js
/** Whitelisted standard properties carrying literal-value candidates, mapped
 *  to their literal kind. Data-driven so extending is a one-line change. */
const LITERAL_PROPS = new Map([
  ['color', 'color'],
  ['background', 'color'],
  ['border-color', 'color'],
  ['padding', 'space'],
  ['gap', 'space'],
  ['font-size', 'font-size'],
  ['border-radius', 'radius']
]);

/** CSS named colors, matched as-is (never normalized — spec §6.2). */
const NAMED_COLORS = new Set(('aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|' +
  'blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|' +
  'cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|' +
  'darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|' +
  'darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|' +
  'deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|' +
  'ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|' +
  'ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|' +
  'lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|' +
  'lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|' +
  'magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|' +
  'mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|' +
  'mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|' +
  'palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|' +
  'powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|' +
  'seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|' +
  'steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen'
).split('|'));

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC_COLOR_RE = /^(?:rgba?|hsla?)\([^)]*\)$/i;
const DIMENSION_RE = /^-?\d*\.?\d+(?:px|rem|em|ex|ch|vw|vh|vmin|vmax|cm|mm|in|pt|pc|fr)$/i;
```

Add `extractLiterals` (place it near `normalizeValue`, around line 851):

```js
/**
 * Extract literal occurrences from one declaration value. The value is split
 * on whitespace; EVERY component must fully match a scalar pattern. If any
 * component fails (url(), calc(), unitless numbers, keywords), the whole
 * value is skipped — no partial collection. Values containing var() are
 * skipped: they are references, not literals.
 */
function extractLiterals(prop, value, ctx) {
  const kind = LITERAL_PROPS.get(String(prop || '').toLowerCase());
  if (!kind) return [];
  const raw = String(value || '').replace(/\s*!important\s*$/i, '').trim();
  if (!raw || /\bvar\s*\(/i.test(raw)) return [];
  const out = [];
  for (const component of raw.split(/\s+/)) {
    if (HEX_RE.test(component) || FUNC_COLOR_RE.test(component) ||
        NAMED_COLORS.has(component.toLowerCase()) || DIMENSION_RE.test(component)) {
      out.push({
        value: component,
        normalized: normalizeValue(component),
        kind,
        property: prop,
        file: ctx.file,
        line: ctx.line
      });
    } else {
      return [];
    }
  }
  return out;
}
```

In `parseCss` (line 377): add `const literals = [];` next to `declarations`/`references`. In `flush()` (line 405), after the `if (!m) return;` of the `DECL_RE` check, add the standard-property branch:

```js
    const std = /^([a-zA-Z][a-zA-Z0-9-]*)\s*:\s*([\s\S]*)$/.exec(raw);
    if (std) {
      literals.push(...extractLiterals(std[1], std[2], { file, line: bufLine }));
    }
```

`flush()` currently ends with `if (!m) return;` — keep the `return` for the custom-property path; the std branch is only reached when `DECL_RE` does not match. Change `parseCss`'s return to `return { declarations, references, literals };`.

In `parseHtml` (line 513): add `const literals = [];`, shift and push in the three paths:

```js
    inner.declarations.forEach(d => { d.line += shift; d.origin = 'style-block'; declarations.push(d); });
    inner.literals.forEach(l => { l.line += shift; l.origin = 'style-block'; literals.push(l); });
    inner.references.forEach(r => { r.line += shift; references.push(r); });
```

For the inline `style=""` path add `inner.literals.forEach(l => { l.line += shift; l.origin = 'inline-attribute'; literals.push(l); });` next to the declarations shift. For the `<script>` path (the objRe/spRe loops) add `inner.literals.forEach(l => { l.line += shift; literals.push(l); });` after the existing declaration pushes (parseJs handles extraction; only shifting is needed here). Return `{ declarations, references, literals }`.

In `parseJs` (line 591): add `const literals = [];` and after the spRe loop (around line 634) add the CSS-context literal extraction over `codeText` (comments masked, strings intact):

```js
  const litLineAt = lineCounter(text);
  const litRe = /(?:^|[,{;\s])(color|background|border-color|padding|gap|font-size|border-radius)\s*:\s*(["'])([^"']*)\2/gi;
  while ((m = litRe.exec(codeText))) {
    literals.push(...extractLiterals(m[1], m[3], { file, line: litLineAt(m.index) + 1 }));
  }
  const litSpLineAt = lineCounter(text);
  const litSpRe = /setProperty\(\s*(["'])(color|background|border-color|padding|gap|font-size|border-radius)\1\s*,\s*(["'])([^"']*)\3/gi;
  while ((m = litSpRe.exec(codeText))) {
    literals.push(...extractLiterals(m[2], m[4], { file, line: litSpLineAt(m.index) + 1 }));
  }
```

Return `{ declarations, references, literals }`.

In `parseSfc` (line 647): add `const literals = [];` and extend `pushShifted`:

```js
    parsed.literals.forEach(l => { l.line += shift; literals.push(l); });
```

Return `{ declarations, references, literals }`.

`parseSource` needs no change — it returns the dispatched parser's result.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd polish-mono && node --test test/literals-parse.test.js`
Expected: all 14 tests PASS.

- [ ] **Step 5: Run the full regression suite**

Run: `cd polish-mono && node --test test/*.test.js`
Expected: all existing tests PASS (parsers gained a return field, no existing assertion breaks).

- [ ] **Step 6: Commit**

```bash
git add polish-mono/src/lib/parse.js polish-mono/test/literals-parse.test.js
git commit -m "feat: collect literal values during parse (CSS/HTML/JS)"
```

### Task 2: Collect literals into the graph

**Files:**
- Modify: `polish-mono/src/scan.js`
- Test: `polish-mono/test/scan.test.js` (append tests)

**Interfaces:**
- Consumes: `parseSource(...).literals` from Task 1.
- Produces: `DeclarationGraph.literals: LiteralOccurrence[]`; `ScanSummary.literals: number`.

- [ ] **Step 1: Write the failing test**

Append to `polish-mono/test/scan.test.js`:

```js
test('scan collects literals into the graph with a summary count', async (t) => {
  const dir = await makeDir(t, {
    'a.css': 'a{color:#fff}\nb{padding:8px 16px}',
    'b.css': 'c{color:#fff}'
  });
  const graph = scan(dir);
  assert.equal(graph.literals.length, 4);
  assert.equal(graph.summary.literals, 4);
  const fff = graph.literals.filter(l => l.normalized === '#fff');
  assert.equal(fff.length, 2);
  assert.deepEqual(fff.map(l => l.file).sort(), ['a.css', 'b.css']);
  assert.equal(graph.literals.find(l => l.value === '8px').kind, 'space');
});
```

(`makeDir` is the existing fixture helper in `scan.test.js`; reuse it as-is.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd polish-mono && node --test test/scan.test.js`
Expected: FAIL — `graph.literals` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `polish-mono/src/scan.js`, inside `scan()` add `const literals = [];` next to `declarations`/`references` (line 61), and in the per-file loop push from the parse result (line 72-75):

```js
    const parsed = parseSource(text, rel);
    declarations.push(...parsed.declarations);
    references.push(...parsed.references);
    literals.push(...parsed.literals);
```

In the returned graph object (line 158), add `literals,` next to `references`, and in `summary` (line 169) add `literals: literals.length,`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd polish-mono && node --test test/scan.test.js test/literals-parse.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add polish-mono/src/scan.js polish-mono/test/scan.test.js
git commit -m "feat: collect literals into the declaration graph"
```

### Task 3: Register `literal-cluster` in the findings registry

**Files:**
- Modify: `polish-mono/src/findings.js`
- Test: `polish-mono/test/findings.test.js` (append test)

**Interfaces:**
- Produces: `FINDING_META['literal-cluster']` — `{ id: 'literal-cluster', severity: 'info', priority: 13, classification: 'judgmental', title, summary, why, fix }`. `PRIORITY_ORDER` / `JUDGMENTAL_IDS` derive from the registry automatically; priorities 1–12 unchanged.

- [ ] **Step 1: Write the failing test**

Append to `polish-mono/test/findings.test.js`:

```js
test('literal-cluster is info/judgmental at priority 13', () => {
  assert.equal(severityOf('literal-cluster'), 'info');
  assert.equal(priorityOf('literal-cluster'), 13);
  assert.equal(classificationOf('literal-cluster'), 'judgmental');
  assert.equal(isJudgmental('literal-cluster'), true);
  assert.equal(isMechanical('literal-cluster'), false);
});

test('literal-cluster sorts last and does not shift existing priorities', () => {
  const last = PRIORITY_ORDER[PRIORITY_ORDER.length - 1];
  assert.deepEqual(last, ['literal-cluster', 13]);
  const byId = new Map(PRIORITY_ORDER);
  assert.equal(byId.get('conflict'), 1);
  assert.equal(byId.get('tailwind-utility-var'), 12);
});
```

(Adjust imports: `findings.test.js` already imports the helpers it needs; add `PRIORITY_ORDER` if not already imported.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd polish-mono && node --test test/findings.test.js`
Expected: FAIL — `severityOf('literal-cluster')` returns `null`.

- [ ] **Step 3: Write minimal implementation**

In `polish-mono/src/findings.js`, add after the `tailwind-utility-var` entry (line 135), before the closing `};`:

```js
  'literal-cluster': {
    id: 'literal-cluster',
    severity: 'info',
    priority: 13,
    classification: 'judgmental',
    title: 'Literal Cluster',
    summary: 'The same literal value is used repeatedly across the project — a token candidate.',
    why: 'Repeated literal values act as de-facto tokens: they will drift independently and cannot be updated by changing one definition. Collecting them into the token system makes the pattern explicit and maintainable.',
    fix: 'Run `polish seed` to generate a draft tokens.css, edit the names in tokens.seed.json, then run `polish confirm` to replace the literals with var() references.'
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd polish-mono && node --test test/findings.test.js test/plan.test.js`
Expected: PASS — `plan.test.js`'s existing priority contract still holds.

- [ ] **Step 5: Commit**

```bash
git add polish-mono/src/findings.js polish-mono/test/findings.test.js
git commit -m "feat: register literal-cluster finding (info/judgmental, priority 13)"
```

### Task 4: Literal clustering in `cross()` + 0-token note wording

**Files:**
- Modify: `polish-mono/src/cross.js`
- Test: `polish-mono/test/cross.test.js` (append tests)

**Interfaces:**
- Consumes: `graph.literals` from Task 2.
- Produces: `clusterLiterals(literals)` exported from `cross.js` → array of clusters `{ value, normalized, kind, count, files: [{ file, lines }], suggestedName }`. Seeds (Task 5) reuse this exact function.
- Produces: `cross()` emits `literal-cluster` findings (registry metadata from Task 3); `summary.notes` 0-token wording updated.

- [ ] **Step 1: Write the failing tests**

Append to `polish-mono/test/cross.test.js` (using the existing `TMP_DIR` pattern):

```js
test('cross reports literal-cluster for values used 2+ times', () => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(TMP_DIR, 'a.css'),
    'a { color: #fff; }\nb { color: #fff; }\n',
    'utf8'
  );
  const report = cross(scan(TMP_DIR));
  const lit = report.findings.filter(f => f.id === 'literal-cluster');
  assert.equal(lit.length, 1, 'should report one cluster');
  const f = lit[0];
  assert.equal(f.severity, 'info');
  assert.equal(f.evidence.length, 1);
  assert.equal(f.evidence[0].value, '#fff');
  assert.equal(f.evidence[0].count, 2);
  assert.equal(f.evidence[0].files.length, 1);
  assert.deepEqual(f.evidence[0].files[0], { file: 'a.css', lines: [1, 2] });
  assert.match(f.evidence[0].suggestedName, /^--color-\d+$/);
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

test('cross does not report literals used only once', () => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(TMP_DIR, 'a.css'),
    'a { color: #fff; }\n',
    'utf8'
  );
  const report = cross(scan(TMP_DIR));
  assert.equal(report.findings.filter(f => f.id === 'literal-cluster').length, 0);
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

test('cross does not normalize named colors into one cluster', () => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(TMP_DIR, 'a.css'),
    'a { color: white; }\nb { color: white; }\nc { color: #fff; }\nd { color: #fff; }\n',
    'utf8'
  );
  const report = cross(scan(TMP_DIR));
  const lit = report.findings.filter(f => f.id === 'literal-cluster');
  assert.equal(lit.length, 2, 'white and #fff stay separate clusters');
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

test('cross suggested names are deterministic ordinals per kind', () => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(TMP_DIR, 'a.css'),
    'a { color: #111; color: #222; color: #333; padding: 8px; padding: 16px; }\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(TMP_DIR, 'b.css'),
    'b { color: #111; color: #222; color: #333; padding: 8px; padding: 16px; }\n',
    'utf8'
  );
  const report = cross(scan(TMP_DIR));
  const names = report.findings
    .filter(f => f.id === 'literal-cluster')
    .map(f => f.evidence[0].suggestedName)
    .sort();
  assert.deepEqual(names, ['--color-1', '--color-2', '--color-3', '--space-1', '--space-2']);
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

test('cross 0-token note points at polish seed', () => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(path.join(TMP_DIR, 'page.css'), 'body { color: #3B82F6; }\n', 'utf8');
  const report = cross(scan(TMP_DIR));
  const note = report.summary.notes.find(n => n.includes('No design tokens found'));
  assert.ok(note, 'note should still exist');
  assert.match(note, /polish seed/);
  assert.match(note, /:root/);
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd polish-mono && node --test test/cross.test.js`
Expected: FAIL — no `literal-cluster` findings; the note test fails on the `polish seed` match.

- [ ] **Step 3: Write minimal implementation**

In `polish-mono/src/cross.js`, add `clusterLiterals` (place it after `familyOf`, around line 43):

```js
/**
 * Cluster literal occurrences by normalized value (spec §6.3).
 * Reports clusters with a total count >= 2. Suggested names are
 * `--{kind}-{ordinal}`: clusters of the same kind are sorted by normalized
 * value and numbered from 1, so ordinals are deterministic across runs.
 * Names are provisional — values are never baked into them.
 */
function clusterLiterals(literals) {
  const byKey = new Map();
  for (const l of literals || []) {
    if (!l || !l.normalized) continue;
    if (!byKey.has(l.normalized)) {
      byKey.set(l.normalized, { value: l.value, normalized: l.normalized, kind: l.kind, occurrences: [] });
    }
    byKey.get(l.normalized).occurrences.push(l);
  }
  const clusters = [...byKey.values()].filter(c => c.occurrences.length >= 2);
  clusters.sort((a, b) => a.kind.localeCompare(b.kind) || a.normalized.localeCompare(b.normalized));
  const byKind = new Map();
  for (const c of clusters) {
    const n = (byKind.get(c.kind) || 0) + 1;
    byKind.set(c.kind, n);
    const files = new Map();
    for (const o of c.occurrences.slice(0, 8)) {   // cap the location listing at 8
      if (!files.has(o.file)) files.set(o.file, []);
      files.get(o.file).push(o.line);
    }
    c.count = c.occurrences.length;
    c.files = [...files.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([file, lines]) => ({ file, lines: [...new Set(lines)].sort((x, y) => x - y) }));
    c.suggestedName = `--${c.kind}-${n}`;
  }
  return clusters;
}
```

In `cross()`, after the duplicate-value section (after line 351), add the literal-cluster section:

```js
  /* -------------------------------------------------- literal clusters */
  for (const c of clusterLiterals(graph.literals || [])) {
    push({
      id: 'literal-cluster',
      severity: severityOf('literal-cluster'),
      title: `${c.count} uses of literal ${c.value}`,
      detail: `${c.count} occurrences across ${c.files.length} file(s) — a token candidate. Suggested provisional name: ${c.suggestedName}.`,
      evidence: [{
        value: c.value,
        normalized: c.normalized,
        count: c.count,
        files: c.files,
        suggestedName: c.suggestedName
      }],
      suggestion: 'Run `polish seed` to generate a draft tokens.css, edit the names in tokens.seed.json, then run `polish confirm` to replace the literals with var() references.'
    });
  }
```

Update the 0-token note (line 442) from:

```js
        ? ['No design tokens found — polish audits token relationships and cannot detect hardcoded values without tokens. Define tokens first, then re-run.']
```

to:

```js
        ? ['No design tokens found — polish audits token relationships and cannot detect hardcoded values without tokens. Declare a few in a `:root` block, or run `polish seed` to generate a starter `tokens.css`, then re-run.']
```

Update the export line (line 449):

```js
export { cross, familyOf, isStateVariant, selectorClasses, clusterLiterals };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd polish-mono && node --test test/cross.test.js`
Expected: PASS (all appended tests + existing cross tests).

- [ ] **Step 5: Run format/report regressions**

Run: `cd polish-mono && node --test test/format.test.js test/report.test.js test/wizard.test.js test/check.test.js`
Expected: PASS — these assert only the `'No design tokens found'` prefix, which is unchanged.

- [ ] **Step 6: Commit**

```bash
git add polish-mono/src/cross.js polish-mono/test/cross.test.js
git commit -m "feat: cluster literals into literal-cluster findings; point 0-token note at polish seed"
```

### Task 5: `polish seed` — seed module, formatSeed, CLI, Node API export

**Files:**
- Create: `polish-mono/src/seed.js`
- Modify: `polish-mono/src/format.js`, `polish-mono/bin/polish.mjs`, `polish-mono/src/index.js`, `polish-mono/src/index.d.ts`, `polish-mono/package.json`
- Test: `polish-mono/test/seed.test.js` (new), `polish-mono/test/index.test.js` (append)

**Interfaces:**
- Consumes: `scan(target)`, `clusterLiterals()` from Task 4.
- Produces: `seed(target, opts)` → `SeedResult { target, output, tokensCss, seedFile, outputFiles, tokenCount, clusterCount, decisions }`. `opts = { output?: string, force?: boolean }`. Throws an Error with `err.code === 'SEED_EXISTS'` and `err.conflicting` (paths) when `tokens.css`/`tokens.seed.json` exist and `force` is false.

- [ ] **Step 1: Write the failing tests**

Create `polish-mono/test/seed.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { seed } from '../src/seed.js';

const TMP = path.join(path.dirname(fileURLToPath(import.meta.url)), '.seed-tmp');

function writeFixture() {
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(
    path.join(TMP, 'a.css'),
    'a { color: #fff; }\nb { color: #fff; }\nc { padding: 8px; }\nd { padding: 8px; }\n',
    'utf8'
  );
}

test('seed writes tokens.css and tokens.seed.json with derived decisions', () => {
  writeFixture();
  const result = seed(TMP);
  const seedJson = JSON.parse(fs.readFileSync(result.seedFile, 'utf8'));
  assert.equal(seedJson.values.length, 2);
  assert.deepEqual(seedJson.map.map(m => m.chosenName), ['--color-1', '--space-1']);
  assert.equal(seedJson.decisions.length, 2);
  assert.deepEqual(seedJson.decisions, [
    { action: 'tokenize', value: '#fff', to: '--color-1' },
    { action: 'tokenize', value: '8px', to: '--space-1' }
  ]);
  assert.equal(result.tokenCount, 2);
  assert.equal(result.clusterCount, 2);
  fs.rmSync(TMP, { recursive: true, force: true });
});

test('seed tokens.css is a :root draft with provisional comments', () => {
  writeFixture();
  const result = seed(TMP);
  const css = fs.readFileSync(result.tokensCss, 'utf8');
  assert.match(css, /:root \{/);
  assert.match(css, /--color-1: #fff; \/\* provisional — from literal #fff \(2× in 1 file\) \*\//);
  assert.match(css, /--space-1: 8px; \/\* provisional — from literal 8px \(2× in 1 file\) \*\//);
  fs.rmSync(TMP, { recursive: true, force: true });
});

test('seed refuses to overwrite existing files without --force', () => {
  writeFixture();
  seed(TMP);
  assert.throws(
    () => seed(TMP),
    (err) => {
      assert.equal(err.code, 'SEED_EXISTS');
      assert.equal(err.conflicting.length, 2);
      assert.match(err.message, /--force/);
      return true;
    }
  );
  fs.rmSync(TMP, { recursive: true, force: true });
});

test('seed --force overwrites existing files', () => {
  writeFixture();
  seed(TMP);
  const result = seed(TMP, { force: true });
  assert.equal(result.tokenCount, 2);
  fs.rmSync(TMP, { recursive: true, force: true });
});

test('seed --output redirects the generated files', () => {
  writeFixture();
  const out = path.join(TMP, 'nested-out');
  const result = seed(TMP, { output: out });
  assert.equal(result.tokensCss, path.join(out, 'tokens.css'));
  assert.equal(result.seedFile, path.join(out, 'tokens.seed.json'));
  assert.ok(fs.existsSync(result.seedFile));
  fs.rmSync(TMP, { recursive: true, force: true });
});

test('seed on a token-less project writes no decisions', () => {
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(path.join(TMP, 'a.css'), 'a { color: #fff; }\n', 'utf8');
  const result = seed(TMP);
  assert.equal(result.clusterCount, 0);
  assert.equal(result.tokenCount, 0);
  const seedJson = JSON.parse(fs.readFileSync(result.seedFile, 'utf8'));
  assert.deepEqual(seedJson.decisions, []);
  fs.rmSync(TMP, { recursive: true, force: true });
});
```

Append to `polish-mono/test/index.test.js`:

```js
test('index exports seed', async () => {
  const mod = await import('../src/index.js');
  assert.equal(typeof mod.seed, 'function');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd polish-mono && node --test test/seed.test.js test/index.test.js`
Expected: FAIL — module `../src/seed.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `polish-mono/src/seed.js`:

```js
/**
 * seed.js — generate a draft token system from detected literal clusters.
 *
 * tokens.seed.json is the single source of truth: it carries the naming map
 * plus a `decisions` array generated from chosenName, so the file can be
 * edited and fed straight to `polish confirm`. tokens.css is a derived
 * draft. Refuses to overwrite existing files without --force.
 */

import fs from 'fs';
import path from 'path';

import { scan } from './scan.js';
import { clusterLiterals } from './cross.js';

const TOKENS_CSS = 'tokens.css';
const SEED_JSON = 'tokens.seed.json';

/** Render the derived tokens.css draft from the naming map (spec §6.4). */
function renderTokensCss(values, map) {
  const byValue = new Map(map.map(m => [m.value, m]));
  const lines = [':root {'];
  for (const v of values) {
    const entry = byValue.get(v.value);
    const name = entry.chosenName;
    const files = v.files.length;
    const where = `${v.count}× in ${files} file${files === 1 ? '' : 's'}`;
    lines.push(`  ${name}: ${v.value}; /* provisional — from literal ${v.value} (${where}) */`);
  }
  lines.push('}');
  return lines.join('\n') + '\n';
}

/**
 * Generate a draft token system for a target directory.
 * @param {string} target directory to scan for literal clusters
 * @param {object} [opts] { output?: string, force?: boolean }
 * @returns {object} SeedResult
 */
export function seed(target, opts = {}) {
  const outDir = path.resolve(opts.output || target);
  const graph = scan(target);
  const clusters = clusterLiterals(graph.literals || []);

  const values = clusters.map(c => ({
    value: c.value,
    normalized: c.normalized,
    kind: c.kind,
    count: c.count,
    files: c.files
  }));
  const map = clusters.map(c => ({
    value: c.value,
    chosenName: c.suggestedName,
    provisional: true
  }));
  const decisions = map.map(m => ({ action: 'tokenize', value: m.value, to: m.chosenName }));

  const tokensCssPath = path.join(outDir, TOKENS_CSS);
  const seedPath = path.join(outDir, SEED_JSON);
  const existing = [tokensCssPath, seedPath].filter(p => fs.existsSync(p));
  if (existing.length && !opts.force) {
    const err = new Error(
      `Refusing to overwrite existing file(s):\n  ${existing.join('\n  ')}\n` +
      'Re-run with --force to overwrite.'
    );
    err.code = 'SEED_EXISTS';
    err.conflicting = existing;
    throw err;
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(tokensCssPath, renderTokensCss(values, map), 'utf8');
  fs.writeFileSync(
    seedPath,
    JSON.stringify({ target: String(target), values, map, decisions }, null, 2) + '\n',
    'utf8'
  );

  return {
    target: String(target),
    output: outDir,
    tokensCss: tokensCssPath,
    seedFile: seedPath,
    outputFiles: [tokensCssPath, seedPath],
    tokenCount: map.length,
    clusterCount: clusters.length,
    decisions
  };
}
```

In `polish-mono/src/format.js`, add `formatSeed` (after `formatRollback`, around line 243):

```js
export function formatSeed(result) {
  const lines = [
    `Seed complete — ${result.clusterCount} cluster(s), ${result.tokenCount} token(s).`,
    `  ${result.tokensCss}`,
    `  ${result.seedFile}`,
    '',
    `Edit names in ${path.basename(result.seedFile)}, then run:`,
    `  polish confirm ${path.basename(result.seedFile)} --target=${result.target}`
  ];
  return lines.join('\n');
}
```

Add `formatSeed` to the export list at the bottom of `format.js` (line 408): `export { MECHANICAL_IDS, useColor, ANSI, formatSeed };` — note `formatSeed` is declared with `export function`, so it is already exported; drop the duplication and leave the bottom export line unchanged.

In `polish-mono/bin/polish.mjs`:

1. Add `let forceFlag = false;` next to the other flag declarations (line ~60) and parse `--force`:

```js
    } else if (args[i] === '--force') {
      forceFlag = true;
```

2. Add `--force` to the USAGE `Flags:` section: `  --force       Overwrite existing files (seed only)`.

3. Add the USAGE command line after the `confirm` line: `  polish seed  <target> [--output=dir] [--force] [--summary]   Generate a draft tokens.css + tokens.seed.json from literal clusters`.

4. Import seed at the top: `import { seed as runSeed } from '../src/seed.js';`.

5. Add the command branch before the `mcp` branch (around line 232):

```js
  if (cmd === 'seed') {
    const target = resolve(positional[0] || '.');
    let result;
    try {
      result = runSeed(target, {
        output: outputFlag ? resolve(outputFlag) : undefined,
        force: forceFlag
      });
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    if (summaryFlag) {
      const { formatSeed } = await import('../src/format.js');
      console.log(formatSeed(result));
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
    process.exit(0);
  }
```

In `polish-mono/src/index.js`: add `import { seed } from './seed.js';` and add `seed` to the export list (line 18).

In `polish-mono/src/index.d.ts`: add a `seed` declaration next to the others (match the existing declaration style):

```ts
export declare function seed(target: string, opts?: { output?: string; force?: boolean }): SeedResult;
```

(plus `export interface SeedResult { ... }` — full shape is specified in Task 8's type declarations; declare the interface here and reuse it in Task 8, or declare the interface in Task 8 and import. Simplest: declare the full `SeedResult` interface here in `index.d.ts`.)

In `polish-mono/package.json`: add `"./seed": "./src/seed.js"` to the `exports` map (after `"./report"`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd polish-mono && node --test test/seed.test.js test/index.test.js`
Expected: PASS.

- [ ] **Step 5: Manual CLI smoke test**

Run: `cd /tmp && rm -rf seed-smoke && mkdir seed-smoke && cd seed-smoke && printf 'a{color:#fff} b{color:#fff} c{padding:8px} d{padding:8px}' > demo.css && command node /Users/dengzhou/Desktop/07-Personal/polish-design-tokens/polish-mono/bin/polish.mjs seed demo.css --summary && ls && cat tokens.seed.json`
Expected: summary lists 2 clusters / 2 tokens; both files exist; decisions array has two tokenize entries.

- [ ] **Step 6: Commit**

```bash
git add polish-mono/src/seed.js polish-mono/src/format.js polish-mono/bin/polish.mjs polish-mono/src/index.js polish-mono/src/index.d.ts polish-mono/package.json polish-mono/test/seed.test.js polish-mono/test/index.test.js
git commit -m "feat: add polish seed command and seed() API"
```

### Task 6: `tokenize` decisions in `confirm()` — merge, unmatched, new return shape

**Files:**
- Modify: `polish-mono/src/confirm.js`, `polish-mono/bin/polish.mjs`
- Test: `polish-mono/test/confirm.test.js` (update all call sites + new tests), `polish-mono/test/confirm-cli.test.js` (if it asserts exit codes/output shape — verify at Step 4)

**Interfaces:**
- Consumes: `graph.literals` (Task 2), `normalizeValue` from `lib/parse.js`.
- Produces: `confirm(decisions, graph, target)` → `{ patches: Patch[], unmatched: Array<{ decision, reason }> }`. `tokenize` decisions: `{ action: 'tokenize', value, to }` → merged same-line `replace` patches (`findingId: 'literal-cluster'`) + one appended `add` patch per undeclared `to` in `tokens.css`. Ambiguity (same value → two different `to`) throws and refuses the whole run.

- [ ] **Step 1: Write the failing tests**

Update every `const patches = confirm(...)` call site in `polish-mono/test/confirm.test.js` to `const { patches } = confirm(...)`. The test `confirm skips decisions for tokens not found in the graph` changes to assert the unmatched report instead of silent skipping:

```js
test('confirm reports decisions for tokens not found in the graph as unmatched', () => {
  const dir = makeProject(':root {\n  --bg: #ffffff;\n}\n');
  const graph = scan(dir);
  const { patches, unmatched } = confirm([{ action: 'delete', token: '--nonexistent' }], graph, dir);
  assert.equal(patches.length, 0);
  assert.equal(unmatched.length, 1);
  assert.equal(unmatched[0].decision.token, '--nonexistent');
  cleanup();
});
```

Append new tests:

```js
test('confirm merges two tokenize substitutions on the same line into one patch', () => {
  const dir = makeProject(':root {\n  --space-1: 8px;\n  --space-2: 16px;\n}\n', {
    'a.css': 'a { padding: 8px 16px; }\n'
  });
  const graph = scan(dir);
  const { patches, unmatched } = confirm(
    [
      { action: 'tokenize', value: '8px', to: '--space-1' },
      { action: 'tokenize', value: '16px', to: '--space-2' }
    ],
    graph,
    dir
  );
  assert.equal(unmatched.length, 0);
  assert.equal(patches.length, 1, 'one merged replace patch');
  const p = patches[0];
  assert.equal(p.type, 'replace');
  assert.equal(p.file, 'a.css');
  assert.equal(p.line, 1);
  assert.equal(p.before, 'a { padding: 8px 16px; }');
  assert.equal(p.after, 'a { padding: var(--space-1) var(--space-2); }');
  assert.equal(p.findingId, 'literal-cluster');
  cleanup();
});

test('confirm adds a declaration patch when the token is undeclared', () => {
  const dir = makeProject(':root {\n}\n', {
    'a.css': 'a { color: #fff; }\nb { color: #fff; }\n'
  });
  const graph = scan(dir);
  const { patches } = confirm([{ action: 'tokenize', value: '#fff', to: '--color-1' }], graph, dir);
  const add = patches.find(p => p.type === 'add');
  assert.ok(add, 'should add the declaration to tokens.css');
  assert.equal(add.file, 'tokens.css');
  assert.equal(add.after, '--color-1: #fff;');
  cleanup();
});

test('confirm does not add a declaration patch when the token is declared', () => {
  const dir = makeProject(':root {\n  --color-1: #fff;\n}\n', {
    'a.css': 'a { color: #fff; }\nb { color: #fff; }\n'
  });
  const graph = scan(dir);
  const { patches } = confirm([{ action: 'tokenize', value: '#fff', to: '--color-1' }], graph, dir);
  assert.equal(patches.some(p => p.type === 'add'), false);
  assert.equal(patches.filter(p => p.type === 'replace').length, 2);
  cleanup();
});

test('confirm refuses the whole run on ambiguous tokenize decisions', () => {
  const dir = makeProject(':root {\n  --a: #fff;\n  --b: #fff;\n}\n', {
    'a.css': 'a { color: #fff; }\nb { color: #fff; }\n'
  });
  const graph = scan(dir);
  assert.throws(
    () => confirm([
      { action: 'tokenize', value: '#fff', to: '--a' },
      { action: 'tokenize', value: '#fff', to: '--b' }
    ], graph, dir),
    /Ambiguous/
  );
  cleanup();
});

test('confirm reports a tokenize decision whose value is gone as unmatched', () => {
  const dir = makeProject(':root {\n  --color-1: #fff;\n}\n', {
    'a.css': 'a { color: #000; }\n'
  });
  const graph = scan(dir);
  const { patches, unmatched } = confirm([{ action: 'tokenize', value: '#fff', to: '--color-1' }], graph, dir);
  assert.equal(patches.length, 0);
  assert.equal(unmatched.length, 1);
  assert.match(unmatched[0].reason, /not found in re-scan/);
  cleanup();
});

test('confirm reports an invalid token name as unmatched', () => {
  const dir = makeProject(':root {\n  --color-1: #fff;\n}\n', {
    'a.css': 'a { color: #fff; }\nb { color: #fff; }\n'
  });
  const graph = scan(dir);
  const { patches, unmatched } = confirm([{ action: 'tokenize', value: '#fff', to: 'color-1' }], graph, dir);
  assert.equal(patches.length, 0);
  assert.equal(unmatched.length, 1);
  assert.match(unmatched[0].reason, /must start with/);
  cleanup();
});

test('confirm reports a tokenize decision as unmatched when tokens.css is missing', () => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(path.join(TMP_DIR, 'a.css'), 'a { color: #fff; }\nb { color: #fff; }\n', 'utf8');
  const graph = scan(TMP_DIR);
  const { patches, unmatched } = confirm([{ action: 'tokenize', value: '#fff', to: '--color-1' }], graph, TMP_DIR);
  assert.equal(patches.length, 0);
  assert.equal(unmatched.length, 1);
  assert.match(unmatched[0].reason, /tokens\.css not found/);
  cleanup();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd polish-mono && node --test test/confirm.test.js`
Expected: FAIL — `confirm()` returns a bare array (no `.patches` destructuring, no `tokenize` support).

- [ ] **Step 3: Write minimal implementation**

Rewrite `polish-mono/src/confirm.js` (keeping `resolveFile`, `readDeclarationLine` unchanged, adding the helpers and the new return contract):

```js
import fsSync from 'fs';
import path from 'path';

import { normalizeValue } from './lib/parse.js';

function resolveFile(file, target) {
  return path.isAbsolute(file) ? file : path.resolve(target, file);
}

function readDeclarationLine(file, line, token, target) {
  try {
    const lines = fsSync.readFileSync(resolveFile(file, target), 'utf8').split('\n');
    const current = lines[line - 1];
    if (current === undefined || !current.includes(token)) return null;
    return current;
  } catch {
    return null;
  }
}

/** Read the exact current text of a file line, or null when unavailable. */
function readLineText(file, line, target) {
  try {
    return fsSync.readFileSync(resolveFile(file, target), 'utf8').split('\n')[line - 1];
  } catch {
    return null;
  }
}

/** Escape regex metacharacters in a literal string. */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function confirm(decisions, graph, target = process.cwd()) {
  const patches = [];
  const unmatched = [];
  const decls = graph.declarations || [];
  const refs = graph.references || [];
  const literals = graph.literals || [];
  const declared = new Set(decls.map(d => d.name));

  // Ambiguity pre-check (spec §4.5.3): two decisions mapping the same
  // normalized value to different names refuse the entire run.
  const tokenTargetByValue = new Map();
  for (const d of decisions) {
    if (d.action !== 'tokenize') continue;
    if (typeof d.to !== 'string' || !d.to.startsWith('--')) {
      unmatched.push({ decision: d, reason: `invalid token name "${d.to}" — must start with "--"` });
      continue;
    }
    const key = normalizeValue(d.value);
    if (tokenTargetByValue.has(key) && tokenTargetByValue.get(key) !== d.to) {
      throw new Error(
        `Ambiguous tokenize decisions: value ${d.value} maps to both ` +
        `${tokenTargetByValue.get(key)} and ${d.to} — refusing the run`
      );
    }
    tokenTargetByValue.set(key, d.to);
  }
  const needsAdd = new Set(
    [...tokenTargetByValue.values()].filter(to => !declared.has(to))
  );
  const tokensCssMissing = !fsSync.existsSync(path.join(target, 'tokens.css'));

  for (const d of decisions) {
    switch (d.action) {
      case 'delete': {
        const decl = decls.find(x => x.name === d.token);
        if (!decl) {
          unmatched.push({ decision: d, reason: `no declaration found for ${d.token}` });
          break;
        }
        const before = readDeclarationLine(decl.file, decl.line, d.token, target);
        if (before === null) {
          unmatched.push({ decision: d, reason: `declaration line no longer contains ${d.token}` });
          break;
        }
        patches.push({
          type: 'delete',
          file: decl.file,
          line: decl.line,
          before,
          after: '',
          reason: `delete orphan ${d.token}`,
          findingId: 'orphan'
        });
        break;
      }

      case 'alias': {
        const decl = decls.find(x => x.name === d.from);
        if (!decl) {
          unmatched.push({ decision: d, reason: `no declaration found for ${d.from}` });
          break;
        }
        patches.push({
          type: 'replace',
          file: decl.file,
          line: decl.line,
          before: decl.raw,
          after: `var(${d.to})`,
          reason: `${d.from} → alias ${d.to}（${decl.raw}）`,
          findingId: 'duplicate-value'
        });
        break;
      }

      case 'rename': {
        const files = new Set();
        for (const x of decls) if (x.name === d.from) files.add(x.file);
        for (const r of refs) if (r.name === d.from) files.add(r.file);
        if (files.size === 0) {
          unmatched.push({ decision: d, reason: `no files reference ${d.from}` });
          break;
        }
        for (const file of files) {
          patches.push({
            type: 'rewrite',
            file,
            line: null,
            before: d.from,
            after: d.to,
            reason: `rename ${d.from} → ${d.to}`,
            findingId: 'namespace'
          });
        }
        break;
      }

      case 'tokenize': {
        const occurrences = literals.filter(l => l.normalized === normalizeValue(d.value));
        if (occurrences.length === 0) {
          unmatched.push({ decision: d, reason: `value ${d.value} not found in re-scan` });
          break;
        }
        if (needsAdd.has(d.to) && tokensCssMissing) {
          unmatched.push({ decision: d, reason: 'tokens.css not found — run polish seed first' });
          break;
        }
        // Same-line merging: group substitutions by file+line and compose one
        // replace patch per line so apply() never sees two patches whose
        // `before` is identical (spec §3.1).
        const byLine = new Map();
        for (const o of occurrences) {
          const key = o.file + '\u0000' + o.line;
          if (!byLine.has(key)) byLine.set(key, { file: o.file, line: o.line, values: [] });
          byLine.get(key).values.push(o.value);
        }
        for (const group of byLine.values()) {
          const before = readLineText(group.file, group.line, target);
          if (before === null) {
            unmatched.push({ decision: d, reason: `could not read ${group.file}:${group.line}` });
            continue;
          }
          let after = before;
          for (const v of group.values) {
            const re = new RegExp('(?<![\\w-])' + escapeRegex(v) + '(?![\\w-])', 'g');
            after = after.replace(re, `var(${d.to})`);
          }
          if (after === before) {
            unmatched.push({ decision: d, reason: `value ${d.value} no longer present at ${group.file}:${group.line}` });
            continue;
          }
          patches.push({
            type: 'replace',
            file: group.file,
            line: group.line,
            before,
            after,
            reason: `tokenize ${d.value} → ${d.to}`,
            findingId: 'literal-cluster'
          });
        }
        if (needsAdd.has(d.to)) {
          needsAdd.delete(d.to);
          patches.push({
            type: 'add',
            file: 'tokens.css',
            line: null,
            after: `${d.to}: ${occurrences[0].value};`,
            reason: `declare ${d.to}`,
            findingId: 'literal-cluster'
          });
        }
        break;
      }
    }
  }

  return { patches, unmatched };
}
```

Update the CLI confirm branch in `polish-mono/bin/polish.mjs` (line 216):

```js
  if (cmd === 'confirm') {
    const data = loadJson(file);
    const decisions = data.decisions || data;
    const target = resolve(targetFlag || process.cwd());
    const graph = scan(target);
    let patches;
    let unmatched = [];
    try {
      const resolved = resolveDecisions(decisions, graph, target);
      patches = resolved.patches;
      unmatched = resolved.unmatched;
    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
    if (unmatched.length) {
      console.log(`Unmatched decisions (${unmatched.length}):`);
      for (const u of unmatched) console.log(`  - ${u.reason}`);
    }
    const result = await apply(patches, target);
    if (summaryFlag) {
      const { formatApply } = await import('../src/format.js');
      console.log(formatApply(result));
    } else {
      console.log(JSON.stringify({ ...result, unmatched }, null, 2));
    }
    process.exit(result.failed.length > 0 || unmatched.length > 0 ? 1 : 0);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd polish-mono && node --test test/confirm.test.js test/confirm-cli.test.js`
Expected: PASS. If `confirm-cli.test.js` asserts on the old bare-array JSON shape, update it to the new `{ ...result, unmatched }` shape.

- [ ] **Step 5: Run the full regression suite**

Run: `cd polish-mono && node --test test/*.test.js`
Expected: PASS — no other module calls `confirm()` (grep confirmed call sites are only the CLI and tests).

- [ ] **Step 6: Commit**

```bash
git add polish-mono/src/confirm.js polish-mono/bin/polish.mjs polish-mono/test/confirm.test.js polish-mono/test/confirm-cli.test.js
git commit -m "feat: tokenize decisions in confirm with same-line merge and unmatched reporting"
```

### Task 7: `polish_seed` MCP tool + contract count 10

**Files:**
- Create: `polish-mono/src/handlers/polish-seed.js`
- Modify: `polish-mono/src/mcp-server.js`, `polish-mono/test/mcp.test.js`

**Interfaces:**
- Consumes: `seed(target, opts)` from Task 5.
- Produces: `polish_seed` MCP tool (10th tool). `tools/call` with `{ target, output?, force? }` returns `SeedResult` shape (plain object) — the server wraps it in `content[0].text` + `structuredContent` via the existing contract.

- [ ] **Step 1: Write the failing tests**

In `polish-mono/test/mcp.test.js`:

1. Update the tools-count assertion (line ~333):

```js
  assert.equal(tools.length, 10, `expected 10 tools, got ${tools.length}`);
```

2. Append new tests:

```js
test('MCP polish_seed generates tokens.css and tokens.seed.json', () => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(TMP_DIR, 'a.css'),
    'a { color: #fff; }\nb { color: #fff; }\nc { padding: 8px; }\nd { padding: 8px; }\n',
    'utf8'
  );
  const responses = rpc([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'polish_seed', arguments: { target: TMP_DIR } } }
  ]);
  const call = responses.get(2);
  assert.equal(call.result.isError, undefined);
  const result = JSON.parse(call.result.content[0].text);
  assert.equal(result.tokenCount, 2);
  assert.equal(result.clusterCount, 2);
  assert.equal(result.outputFiles.length, 2);
  assert.ok(fs.existsSync(result.seedFile));
  const seedJson = JSON.parse(fs.readFileSync(result.seedFile, 'utf8'));
  assert.equal(seedJson.decisions.length, 2);
  assert.ok(call.result.structuredContent, 'should carry structuredContent');
  cleanup();
});

test('MCP polish_seed rejects a missing target', () => {
  const responses = rpc([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'polish_seed', arguments: {} } }
  ]);
  const call = responses.get(2);
  assert.equal(call.result.isError, true, 'missing target should be an error');
  assert.match(call.result.content[0].text, /target is required/);
});

test('MCP polish_seed refuses existing files without force', () => {
  const dir = makeProject(':root {\n  --x: #fff;\n}\n');
  fs.writeFileSync(path.join(dir, 'a.css'), 'a { color: #fff; }\nb { color: #fff; }\n', 'utf8');
  const responses = rpc([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'polish_seed', arguments: { target: dir } } }
  ]);
  const call = responses.get(2);
  assert.equal(call.result.isError, true);
  assert.match(call.result.content[0].text, /Refusing to overwrite/);
  cleanup();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd polish-mono && node --test test/mcp.test.js`
Expected: FAIL — the tools-count assertion expects 10 but gets 9; `polish_seed` is not a known tool.

- [ ] **Step 3: Write minimal implementation**

Create `polish-mono/src/handlers/polish-seed.js`:

```js
/**
 * Handle polish_seed tool call.
 * Generate a draft tokens.css and tokens.seed.json from literal clusters.
 * @param {object} params - { target: string (required), output?: string, force?: boolean }
 * @param {object} deps - Dependencies
 * @returns {Promise<object>} SeedResult
 */
import { seed } from '../seed.js';

export async function polish_seed(params, deps) {
  const target = params.target;
  if (!target) throw new Error('target is required');

  const result = seed(target, { output: params.output, force: !!params.force });

  return {
    target: result.target,
    output: result.output,
    tokensCss: result.tokensCss,
    seedFile: result.seedFile,
    outputFiles: result.outputFiles,
    tokenCount: result.tokenCount,
    clusterCount: result.clusterCount
  };
}
```

In `polish-mono/src/mcp-server.js`:

1. Add the import (line 12 area): `import { polish_seed } from './handlers/polish-seed.js';`
2. Register the tool (line 36 area): `tools['polish_seed'] = async (args) => { return await polish_seed(args, {}); };`
3. Add the tool definition at the end of the `toolDefinitions` array:

```js
  {
    name: 'polish_seed',
    description: 'Generate a draft tokens.css and tokens.seed.json from repeated literal values (literal clusters) in a directory. Edit names in tokens.seed.json, then run polish confirm to replace literals with var() references. Refuses to overwrite existing tokens.css or tokens.seed.json unless force is true.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Directory path to scan for literal clusters' },
        output: { type: 'string', description: 'Directory to write tokens.css and tokens.seed.json (defaults to the target directory)' },
        force: { type: 'boolean', description: 'Overwrite existing tokens.css / tokens.seed.json' }
      },
      required: ['target']
    },
    outputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string' },
        output: { type: 'string' },
        tokensCss: { type: 'string' },
        seedFile: { type: 'string' },
        outputFiles: { type: 'array', items: { type: 'string' } },
        tokenCount: { type: 'number' },
        clusterCount: { type: 'number' }
      },
      required: ['tokensCss', 'seedFile', 'outputFiles', 'tokenCount', 'clusterCount']
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd polish-mono && node --test test/mcp.test.js`
Expected: PASS — all 10 tools advertised; the three new `polish_seed` tests pass.

- [ ] **Step 5: Run the full regression suite**

Run: `cd polish-mono && node --test test/*.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add polish-mono/src/handlers/polish-seed.js polish-mono/src/mcp-server.js polish-mono/test/mcp.test.js
git commit -m "feat: add polish_seed MCP tool (10th tool)"
```

### Task 8: Apply integration — tokenize patches through pre-validation, backups, rollback

**Files:**
- Test: `polish-mono/test/confirm.test.js` (append end-to-end tests)

**Interfaces:**
- Consumes: `confirm()` (Task 6), `apply()` (existing — no changes).

- [ ] **Step 1: Write the failing tests**

Append to `polish-mono/test/confirm.test.js`:

```js
test('tokenize patches apply end-to-end with backups', async () => {
  const dir = makeProject(':root {\n  --color-1: #fff;\n}\n', {
    'a.css': 'a { color: #fff; }\nb { color: #fff; }\n'
  });
  const graph = scan(dir);
  const { patches } = confirm([{ action: 'tokenize', value: '#fff', to: '--color-1' }], graph, dir);
  const result = await apply(patches, dir);
  assert.equal(result.status, 'applied');
  assert.equal(result.backupCount, 1);
  const css = fs.readFileSync(path.join(dir, 'a.css'), 'utf8');
  assert.match(css, /var\(--color-1\)/);
  assert.ok(fs.existsSync(path.join(dir, 'tokens.css.backup')), 'tokens.css should be backed up');
  cleanup();
});

test('tokenize patches roll back when a later file fails', async () => {
  const dir = makeProject(':root {\n  --color-1: #fff;\n}\n', {
    'a.css': 'a { color: #fff; }\n',
    'b.css': 'b { color: #fff; }\n'
  });
  const graph = scan(dir);
  const { patches } = confirm([{ action: 'tokenize', value: '#fff', to: '--color-1' }], graph, dir);
  // Corrupt the second file after patch generation so the merged replace on
  // it fails pre-validation — the whole run must abort before any write.
  fs.writeFileSync(path.join(dir, 'b.css'), 'b { color: #000; }\n', 'utf8');
  const result = await apply(patches, dir);
  assert.equal(result.status, 'aborted');
  const css = fs.readFileSync(path.join(dir, 'a.css'), 'utf8');
  assert.match(css, /color: #fff;/, 'aborted run must not touch a.css');
  cleanup();
});
```

- [ ] **Step 2: Run tests to verify they pass (verify, not fail — apply is unchanged)**

Run: `cd polish-mono && node --test test/confirm.test.js`
Expected: PASS. These tests guard the existing all-or-nothing semantics for the new patch producer; if either fails, the failure is in confirm's patch shape (fix in Task 6's code) before continuing.

- [ ] **Step 3: Commit**

```bash
git add polish-mono/test/confirm.test.js
git commit -m "test: cover tokenize patches through apply pre-validation and rollback"
```

### Task 9: Type declarations

**Files:**
- Modify: `polish-mono/src/types.d.ts`, `polish-mono/src/confirm.d.ts`
- Test: none (verified by `tsc` in Step 4)

**Interfaces:**
- Produces: `LiteralOccurrence`, `DeclarationGraph.literals`, `ScanSummary.literals`, `FindingId += 'literal-cluster'`, `Decision.action += 'tokenize'` + `value` field, `ConfirmResult`. (`SeedResult` is declared in `index.d.ts` in Task 5.)

- [ ] **Step 1: Edit `polish-mono/src/types.d.ts`**

Add `LiteralOccurrence` before `ScanSummary` (line 97):

```ts
/** A single literal value occurrence found during scan (spec §4.2). */
export interface LiteralOccurrence {
  value: string;
  normalized: string;
  kind: 'color' | 'space' | 'font-size' | 'radius';
  property: string;
  file: string;
  line: number;
}
```

Add `literals: number;` to `ScanSummary` (after `orphans: number;`).
Add `literals: LiteralOccurrence[];` to `DeclarationGraph` (after `references: Reference[];`).

Add `| 'literal-cluster'` to the `FindingId` union (after `'tailwind-utility-var'`).

Add to `FindingEvidence` (for the literal-cluster finding shape):

```ts
  normalized?: string;
  files?: Array<{ file: string; lines: number[] }>;
  suggestedName?: string;
```

Change `Decision` to:

```ts
/** A designer-confirmed judgmental decision for polish confirm(). */
export interface Decision {
  action: 'delete' | 'alias' | 'rename' | 'tokenize';
  token?: string;
  from?: string;
  to?: string;
  value?: string;
}
```

Add `ConfirmResult` after `Decision`:

```ts
/** Result of resolving decisions: patches plus decisions that could not be
 *  fulfilled (never silently skipped). */
export interface ConfirmResult {
  patches: Patch[];
  unmatched: Array<{ decision: Decision; reason: string }>;
}
```

- [ ] **Step 2: Edit `polish-mono/src/confirm.d.ts`**

```ts
/**
 * Resolve designer-confirmed judgmental decisions into patches.
 * Delete patches embed the declaration's original line text so apply()
 * can refuse stale deletes. tokenize decisions replace literals with
 * var() references, merged per file+line. Decisions that cannot be
 * fulfilled are reported in `unmatched`, never silently skipped.
 */
declare function confirm(decisions: Decision[], graph: DeclarationGraph, target?: string): ConfirmResult;

export { confirm };
```

(Update the import to `import type { DeclarationGraph, Decision, Patch, ConfirmResult } from './types.js';` — `Patch` is still used inside `ConfirmResult`.)

- [ ] **Step 3: Run typecheck**

Run: `cd polish-mono && command node node_modules/.bin/tsc`
Expected: exit 0, no errors. (The `command node` invocation bypasses the nvm shell-function interception.)

- [ ] **Step 4: Run the full suite once more**

Run: `cd polish-mono && node --test test/*.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add polish-mono/src/types.d.ts polish-mono/src/confirm.d.ts
git commit -m "feat: type declarations for literals, tokenize, and confirm result"
```

### Task 10: Docs sync, CHANGELOG, final verification

**Files:**
- Modify: `README.md`, `README.zh-CN.md`, `polish-mono/README.md`, `polish-mono/README.zh-CN.md`, `polish-mono/docs/mcp-integration.md`, `polish-mono/docs/mcp-integration.zh-CN.md`, `polish-mono/CHANGELOG.md`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Update MCP tool count and tool list in all six doc files**

In `polish-mono/docs/mcp-integration.md` and `mcp-integration.zh-CN.md`: update the tool count from 9 to **10**, add a `polish_seed` row to the tool table with its parameters (`target` required, `output`, `force`) and return fields (`tokensCss`, `seedFile`, `outputFiles`, `tokenCount`, `clusterCount`), mirroring the inputSchema/outputSchema from Task 7.

In the four READMEs: update any "9 tools" counts to 10, add `polish_seed` to the MCP tool list, add the `polish seed <target> [--output=dir] [--force] [--summary]` CLI command to the command reference (English READMEs in English, `.zh-CN` in Chinese), and add the Node API `seed(target, opts)` row to the API section.

- [ ] **Step 2: Document `literal-cluster` in the findings reference**

In the four READMEs' findings list: add a `literal-cluster` row — severity `info`, classification `judgmental`, priority **13**, summary "The same literal value is used repeatedly across the project — a token candidate." (Chinese READMEs in Chinese). Add a short "Bridge from no tokens" section describing the flow: `polish seed` → edit `tokens.seed.json` → `polish confirm` → literals become `var()` references (backups + rollback apply as usual).

- [ ] **Step 3: Update CHANGELOG.md**

Under `[Unreleased]` (or the pending release section), add an entry for v1.10.0:

```md
## [1.10.0] - 2026-11-27

### Added
- `literal-cluster` finding (info / judgmental / priority 13): repeated literal values (colors, spacing, radii, font sizes) are detected across CSS, HTML inline styles, and JS/JSX CSS-context style values.
- `polish seed` command and `polish_seed` MCP tool (10th tool): generate a draft `tokens.css` and an authoritative `tokens.seed.json` (naming map + `tokenize` decisions) from literal clusters; refuses to overwrite existing files without `--force`.
- `tokenize` decisions in `polish confirm`: literals are replaced with `var()` references, merged into one patch per file+line, flowing through the existing backup/rollback apply path.
- Node API `seed(target, opts)` exported from the package root.

### Changed
- `confirm()` now returns `{ patches, unmatched }` instead of a bare patch array; decisions that cannot be fulfilled are reported, never silently skipped. `polish confirm` exits 1 when any decision is unmatched.
- 0-token warning note now points at `:root` declarations and `polish seed`.
```

Note: when the release tag is cut, the `## [1.10.0] - 2026-11-27` heading must stay in this exact form (the tag-driven consistency check requires `## [X.Y.Z] - date`).

- [ ] **Step 4: Final full verification**

Run, from `polish-mono/`:

```bash
node --test test/*.test.js
command node node_modules/.bin/tsc
```

Expected: all tests PASS; tsc exits 0.

- [ ] **Step 5: End-to-end smoke of the whole bridge**

```bash
cd /tmp && rm -rf bridge-smoke && mkdir bridge-smoke && cd bridge-smoke
printf 'a{color:#fff} b{color:#fff} c{padding:8px} d{padding:8px}' > demo.css
command node /Users/dengzhou/Desktop/07-Personal/polish-design-tokens/polish-mono/bin/polish.mjs seed demo.css --summary
command node /Users/dengzhou/Desktop/07-Personal/polish-design-tokens/polish-mono/bin/polish.mjs confirm tokens.seed.json --target=demo.css --summary
grep -c 'var(--' demo.css
```

Expected: seed summary shows 2 clusters / 2 tokens; confirm applies 4 substitutions (2 colors + 2 paddings) and adds 2 declarations to tokens.css; `grep -c 'var(--' demo.css` returns 2 (one per line); `demo.css.backup` exists.

- [ ] **Step 6: Commit**

```bash
git add README.md README.zh-CN.md polish-mono/README.md polish-mono/README.zh-CN.md polish-mono/docs/mcp-integration.md polish-mono/docs/mcp-integration.zh-CN.md polish-mono/CHANGELOG.md
git commit -m "docs: document literal-cluster, polish seed, and polish_seed MCP tool"
```

---

## Self-Review Checklist (executor: verify these hold before starting Task 1)

- **Spec coverage:** §3.1 same-line merge → Task 6; §3.2 priority 13 → Task 3; §3.3 seed files as single source of truth + `--force` → Task 5; §3.4 JS/JSX scope → Task 1 (parseJs litRe/litSpRe); §3.5 named colors not normalized → Task 1 extractLiterals + Task 4 test; §3.6 scalar full-match → Task 1; §3.7 threshold ≥2 → Task 4 clusterLiterals; §3.8 provisional ordinal names → Task 4; §3.9 MCP contract 10 tools → Task 7; §3.10 types + Node API → Tasks 5/9; §3.11 unmatched reported → Task 6. §4.1–4.5 → Tasks 1/2/4/5/6. §8 wording → Task 4. §9 testing → distributed across Tasks 1–8. §10 deliverables → all tasks.
- **Placeholder scan:** every step carries concrete file paths, test code, and implementation code.
- **Type consistency:** `LiteralOccurrence` shape matches Task 1's extractor output and Task 9's declaration; `clusterLiterals` return shape matches Task 4 (finding evidence) and Task 5 (values/map); `confirm()` return shape matches Tasks 6, 8, 9; `seed()` return matches Tasks 5, 7.

