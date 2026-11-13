'use strict';
/**
 * cross — the judgement layer.
 *
 * Takes the FACTS from scan (and optionally the observations from measure)
 * and decides what is actually wrong. scan never judges; cross never parses.
 */

const { normalizeValue, isAlias, isKeyword } = require('./lib/parse');

const STATE_CLASS_RE = /^(is|has)[-_]|(^|[-_])(active|selected|disabled|hover|focus|open|closed|full|tight|empty|loading|error|warn|ok|done|on|off|muted|dim)([-_]|$)/i;

/** Split a selector into its component classes so we can spot state modifiers. */
function selectorClasses(selector) {
  if (!selector) return [];
  const first = String(selector).split(',')[0].trim();
  return (first.match(/\.[A-Za-z0-9_-]+/g) || []).map(c => c.slice(1));
}

/**
 * Do two selectors differ only by state modifiers?
 * .ev-seat  vs  .ev-seat.is-tight  → yes
 */
function isStateVariant(a, b) {
  const ca = selectorClasses(a);
  const cb = selectorClasses(b);
  if (!ca.length || !cb.length) return false;
  const setA = new Set(ca);
  const setB = new Set(cb);
  const extra = [...setB].filter(c => !setA.has(c)).concat([...setA].filter(c => !setB.has(c)));
  if (!extra.length) return false;
  return extra.every(c => STATE_CLASS_RE.test(c));
}

/**
 * Family of a token name: --nm-color-bg → nm, --wine → wine.
 * A single-segment name is a family of one, so --wine and --orange count as
 * different families while --wine and --wine-soft stay together.
 */
function familyOf(name) {
  const parts = String(name).replace(/^--/, '').split('-').filter(Boolean);
  return parts.length ? parts[0] : '';
}

function sevRank(s) { return { error: 3, warn: 2, info: 1 }[s] || 0; }

/** First reference location for each token name, from graph.references. */
function buildRefMap(graph) {
  const m = new Map();
  for (const r of graph.references || []) {
    if (!m.has(r.name)) m.set(r.name, { file: r.file, line: r.line });
  }
  return m;
}

/** First declaration location for each token name, from graph.declarations. */
function buildDeclMap(graph) {
  const m = new Map();
  for (const d of graph.declarations || []) {
    if (!m.has(d.name)) m.set(d.name, { file: d.file, line: d.line });
  }
  return m;
}

/**
 * @param {object} graph DeclarationGraph from scan
 * @param {object} [observation] RuntimeObservation from measure (optional)
 * @returns {object} AuditReport
 */
function cross(graph, observation) {
  const findings = [];
  const push = f => findings.push(f);
  const refMap = buildRefMap(graph);
  const declMap = buildDeclMap(graph);

  /* ---------------------------------------------------------- conflicts */
  for (const c of graph.conflicts || []) {
    const variants = c.variants;

    // 1. Every variant is an integer and every declaration is inline/JS →
    //    a per-element data variable (--product-index: 3), not a token.
    const allInt = variants.every(v => /^-?\d+$/.test(v.value));
    const allInline = variants.every(v => v.origins.every(o => o === 'inline-attribute' || o === 'js-object' || o === 'js-setproperty'));
    if (allInt && allInline && variants.length > 3) {
      push({
        id: 'dynamic-variable',
        severity: 'info',
        title: `${c.name} 有 ${variants.length} 个取值，是逐元素动态变量而非令牌`,
        detail: `全部来自内联样式或 JS 对象，值域为 ${variants.map(v => v.value).slice(0, 6).join(', ')}${variants.length > 6 ? ' …' : ''}。这是把数据写进 CSS 变量的常见手法，不是设计令牌冲突。`,
        evidence: variants[0].locations.slice(0, 3),
        suggestion: '保留即可；如需治理，可改用 data-* 属性或 CSS 计数器，避免与令牌体系混淆。'
      });
      continue;
    }

    // 2. Partition by context. A theme-scoped value and a light value are
    //    expected to differ; so is a root value and a selector override.
    //    Only two different values INSIDE the same context are a real conflict.
    const ctxOf = v => (v.themes.length ? 'theme:' + v.themes.join('/') : (v.scopes.includes('root') ? 'root' : 'selector'));
    const groups = new Map();
    for (const v of variants) {
      const k = ctxOf(v);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(v);
    }

    const realConflicts = [...groups.entries()].filter(([, vs]) => vs.length > 1);

    if (realConflicts.length === 0) {
      // Every difference is explained by scope context.
      const kinds = [...groups.keys()];
      const hasTheme = kinds.some(k => k.startsWith('theme:'));
      if (hasTheme) {
        push({
          id: 'theme-variation',
          severity: 'info',
          title: `${c.name} 在不同作用域/主题下有 ${variants.length} 个值`,
          detail: variants.map(v => `${v.value} @ ${v.scopes.join('/')}${v.themes.length ? '[' + v.themes.join(',') + ']' : ''}`).join('；'),
          evidence: variants.flatMap(v => v.locations.slice(0, 1)).slice(0, 4),
          suggestion: '主题差异是有意为之。可考虑把明暗两套收进结构化的主题令牌组，让"主题"成为体系的一部分而不是散落的例外。'
        });
      } else {
        push({
          id: 'cascade-override',
          severity: 'info',
          title: `${c.name} 被 ${kinds.join(' 与 ')} 作用域分别定义`,
          detail: variants.map(v => `${v.value} @ ${v.scopes.join('/')}`).join('；'),
          evidence: variants.flatMap(v => v.locations.slice(0, 1)).slice(0, 4),
          suggestion: 'CSS 级联下的正常覆盖。若覆盖频繁，可提升为独立令牌减少隐性依赖。'
        });
      }
      continue;
    }

    for (const [ctxKind, group] of realConflicts) {
      // Within one context, are the differences just state modifiers?
      if (group.length > 1) {
        let allState = true;
        for (let i = 0; i < group.length && allState; i++) {
          for (let j = i + 1; j < group.length && allState; j++) {
            if (!isStateVariant(group[i].selectors[0], group[j].selectors[0])) allState = false;
          }
        }
        if (allState) {
          push({
            id: 'state-variation',
            severity: 'info',
            title: `${c.name} 按状态类切换 ${group.length} 个值`,
            detail: `选择器差异只来自状态修饰类（${[...new Set(group.flatMap(v => v.selectors))].slice(0, 4).join(' / ')}），是状态色语义，不是令牌冲突。`,
            evidence: group.flatMap(v => v.locations.slice(0, 1)).slice(0, 4),
            suggestion: '建议为每种状态建独立令牌（--seat-color-ok / --seat-color-warn / --seat-color-busy），而不是让同一个变量承担多态。'
          });
          continue;
        }
      }

      // Tailwind v4 sets per-utility variables (--tw-leading, --tw-shadow) in
      // each utility's own selector scope. Same name, different values — but
      // it's the framework's intended pattern, not a conflict.
      const isTailwindInternal = c.name.startsWith('--tw-');
      if (isTailwindInternal && ctxKind === 'selector') {
        push({
          id: 'tailwind-utility-var',
          severity: 'info',
          title: `${c.name} 是 Tailwind v4 的逐工具变量（per-utility）`,
          detail: `Tailwind v4 的每个工具类（.leading-tight、.shadow-md 等）在自己的选择器下设自己的 ${c.name}。多个值是框架的正常机制，不是令牌冲突。`,
          evidence: group.flatMap(v => v.locations.slice(0, 2)).slice(0, 6),
          suggestion: '无需处理。若令牌面膨胀造成困扰，可考虑用 Tailwind v4 的 @theme 指令统一管理。'
        });
        continue;
      }

      const severity = ctxKind === 'root' ? 'error' : 'warn';
      push({
        id: 'conflict',
        severity,
        title: `${c.name} 在 ${ctxKind} 作用域内有 ${group.length} 个不同的值`,
        detail: group.map(v => `${v.value}（${v.count} 处，如 ${v.locations[0] ? v.locations[0].file + ':' + v.locations[0].line : '?'}）`).join('；'),
        evidence: group.flatMap(v => v.locations.slice(0, 3)).slice(0, 8),
        suggestion: ctxKind === 'root'
          ? '根作用域应只有一个真值——合并后其余位置改为引用。'
          : '同一作用域内出现多个值，选中哪条取决于选择器匹配顺序，很难排查。建议合并或拆成不同令牌。'
      });
    }
  }

  /* ----------------------------------------------------------- dangling */
  const danglingList = graph.dangling || [];
  if (danglingList.length) {
    // Group by naming family so a single plugin's incomplete output
    // (e.g. Elementor's --e-*) collapses into one finding instead of
    // drowning the report in N identical-looking entries.
    const byFamily = new Map();
    for (const d of danglingList) {
      const fam = familyOf(d.name);
      if (!fam) { byFamily.set('(无族)', byFamily.get('(无族)') || []); byFamily.get('(无族)').push(d); continue; }
      if (!byFamily.has(fam)) byFamily.set(fam, []);
      byFamily.get(fam).push(d);
    }

    // A family that accounts for >30% of all dangling refs is a cluster:
    // likely one generator's systematic gap, not N independent bugs.
    const threshold = danglingList.length * 0.3;
    const clusteredFam = [...byFamily.entries()].find(([, ds]) => ds.length > threshold);

    if (clusteredFam) {
      const [fam, ds] = clusteredFam;
      const totalRefs = ds.reduce((sum, d) => sum + d.count, 0);
      const firstRef = refMap.get(ds[0].name) || {};
      push({
        id: 'dangling',
        severity: 'error',
        title: `${fam}-* 家族有 ${ds.length} 个悬空引用（占全部 ${danglingList.length} 个的 ${Math.round(ds.length / danglingList.length * 100)}%）`,
        detail: `整个命名族被引用却从未声明——这是生成端的系统性缺口，不是 ${ds.length} 个独立 bug。最可能的原因是该组件库的页面级样式按需生成但输出不完整。`,
        evidence: ds.slice(0, 15).map(d => {
          const loc = refMap.get(d.name) || {};
          return { name: d.name, count: d.count, file: loc.file, line: loc.line };
        }),
        suggestion: `排查 ${fam}-* 的生成器配置，重新导出页面样式。其余 ${danglingList.length - ds.length} 个非 ${fam}-* 的悬空引用见下方。`,
        refCount: totalRefs
      });
      for (const d of danglingList) {
        if (familyOf(d.name) === fam) continue;
        const loc = refMap.get(d.name) || {};
        push({
          id: 'dangling',
          severity: 'error',
          title: `${d.name} 被引用了 ${d.count} 次，但没有任何声明`,
          detail: '引用它的地方会拿到无效值（多数浏览器回退为初始值/继承值）。',
          evidence: [{ name: d.name, count: d.count, file: loc.file, line: loc.line }],
          suggestion: '补上声明，或把引用改成已存在的令牌。',
          refCount: d.count
        });
      }
    } else {
      for (const d of danglingList) {
        const loc = refMap.get(d.name) || {};
        push({
          id: 'dangling',
          severity: 'error',
          title: `${d.name} 被引用了 ${d.count} 次，但没有任何声明`,
          detail: '引用它的地方会拿到无效值（多数浏览器回退为初始值/继承值）。',
          evidence: [{ name: d.name, count: d.count, file: loc.file, line: loc.line }],
          suggestion: '补上声明，或把引用改成已存在的令牌。',
          refCount: d.count
        });
      }
    }
  }

  /* ------------------------------------------------------------ orphans */
  const orphanList = graph.orphans || [];
  if (orphanList.length) {
    const byScope = orphanList.reduce((acc, o) => {
      const k = o.scopes.join('/');
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    push({
      id: 'orphan',
      severity: 'warn',
      title: `${orphanList.length} 个令牌声明了却从未被引用`,
      detail: '按作用域分布：' + Object.entries(byScope).map(([k, v]) => `${k} ${v} 个`).join('，') + '。典型来源是共享样式表被另一个页面的变量体系取代了。',
      evidence: orphanList.slice(0, 10).map(o => {
        const loc = declMap.get(o.name) || {};
        return { name: o.name, declarations: o.declarations, scopes: o.scopes, file: loc.file, line: loc.line };
      }),
      suggestion: '逐个确认：删掉，或让真正的消费方引用它。'
    });
  }

  /* --------------------------------------------------------- namespace */
  const families = new Map();
  for (const d of graph.declarations) {
    const fam = familyOf(d.name);
    if (!fam) continue;
    if (!families.has(fam)) families.set(fam, new Set());
    families.get(fam).add(d.name);
  }
  if (families.size > 1) {
    push({
      id: 'namespace',
      severity: 'info',
      title: `并存 ${families.size} 个命名族`,
      detail: [...families.entries()].sort((a, b) => b[1].size - a[1].size)
        .map(([f, names]) => `--${f}-*（${names.size}）`).join('，'),
      evidence: [...families.entries()].map(([f, names]) => {
        const sample = [...names][0];
        const loc = declMap.get(sample) || {};
        return { family: f, tokens: [...names].slice(0, 6), count: names.size, file: loc.file, line: loc.line };
      }),
      suggestion: '选定一到两个命名族作为主体系，其余降级为别名或逐步废弃。'
    });
  }

  /* ------------------------------------- same value, different names */
  const byValue = new Map();
  for (const d of graph.declarations) {
    const v = d.resolved;
    if (!v || isAlias(v) || isKeyword(v)) continue;
    const key = normalizeValue(v);
    if (!key || !/^#/.test(key)) continue; // colours only for this check
    if (!byValue.has(key)) byValue.set(key, new Map());
    const m = byValue.get(key);
    if (!m.has(d.name)) m.set(d.name, new Set());
    m.get(d.name).add(familyOf(d.name) || '(无族)');
  }
  const dupes = [];
  for (const [value, names] of byValue) {
    if (names.size < 2) continue;
    const fams = new Set();
    names.forEach(f => fams.add(f));
    if (fams.size < 2) continue; // same family -> scale, not duplication
    dupes.push({ value, names: [...names.keys()], families: [...fams] });
  }
  if (dupes.length) {
    push({
      id: 'duplicate-value',
      severity: 'warn',
      title: `${dupes.length} 组颜色被多个令牌名重复表达`,
      detail: dupes.slice(0, 8).map(d => `${d.value} = ${d.names.join(' = ')}`).join('；'),
      evidence: dupes.slice(0, 8).map(d => {
        const locs = d.names.map(n => declMap.get(n)).filter(Boolean);
        const first = locs[0] || {};
        return {
          value: d.value,
          names: d.names,
          primary: d.names[0],
          secondary: d.names[1],
          primaryFile: first.file,
          primaryLine: first.line,
          secondaryFile: locs[1] ? locs[1].file : first.file,
          secondaryLine: locs[1] ? locs[1].line : first.line
        };
      }),
      suggestion: '同一颜色保留一个主名，其余改成别名引用，减少"该用哪个"的猜测。'
    });
  }

  /* -------------------------------------------------------- hardcoded */
  if (observation && observation.documents) {
    // Compare within one theme: a value that differs between light and dark is
    // expected, a value that differs between two documents of the SAME theme is not.
    const declared = new Set((graph.declarations || []).map(d => d.name));
    const byTheme = new Map();
    for (const doc of observation.documents) {
      const theme = doc.theme || 'default';
      if (!byTheme.has(theme)) byTheme.set(theme, new Map());
      const m = byTheme.get(theme);
      for (const [name, value] of Object.entries(doc.variables || {})) {
        if (declared.has(name)) continue;
        const key = normalizeValue(value);
        if (!key || !/^#/.test(key)) continue;
        if (!m.has(key)) m.set(key, new Set());
        m.get(key).add(doc.label);
      }
    }
    const hardcoded = [];
    for (const [theme, m] of byTheme) {
      for (const [value, docs] of m) {
        if (docs.size >= 2) hardcoded.push({ value, theme, documents: [...docs] });
      }
    }
    if (hardcoded.length) {
      push({
        id: 'hardcoded',
        severity: 'warn',
        title: `${hardcoded.length} 个颜色在同一主题下被跨文档直接写死，没有对应令牌`,
        detail: hardcoded.slice(0, 10).map(d => `${d.value}（${d.theme}）出现在 ${d.documents.slice(0, 3).join('、')}`).join('；'),
        evidence: hardcoded.slice(0, 10).map(d => ({ value: d.value, theme: d.theme, documents: d.documents.slice(0, 5) })),
        suggestion: '这些是"该收进令牌体系"的候选：先给品牌色与语义色建名，再逐个替换。'
      });
    }
  }

  /* ---------------------------------------------------- runtime drift */
  if (observation && observation.documents) {
    // Per theme: a token must resolve to the same value in every document.
    const themes = new Map();
    for (const doc of observation.documents) {
      const theme = doc.theme || 'default';
      if (!themes.has(theme)) themes.set(theme, new Map());
      const m = themes.get(theme);
      for (const [name, value] of Object.entries(doc.variables || {})) {
        if (!m.has(name)) m.set(name, new Map());
        const perName = m.get(name);
        const key = normalizeValue(value);
        if (!perName.has(key)) perName.set(key, new Set());
        perName.get(key).add(doc.label);
      }
    }
    const drifting = [];
    for (const [theme, m] of themes) {
      for (const [name, values] of m) {
        if (values.size <= 1) continue;
        const where = new Set();
        values.forEach(docs => docs.forEach(d => where.add(d)));
        drifting.push({ name, theme, values: [...values.keys()], where: [...where] });
      }
    }
    if (drifting.length) {
      push({
        id: 'runtime-drift',
        severity: 'error',
        title: `${drifting.length} 个令牌在同一主题下于不同文档解析出不同值`,
        detail: drifting.slice(0, 10).map(d => `${d.name} [${d.theme}]: ${d.values.join(' / ')}（${d.where.length} 个文档）`).join('；'),
        evidence: drifting.slice(0, 12).map(d => ({ name: d.name, theme: d.theme, values: d.values, documents: d.where.slice(0, 6) })),
        suggestion: '运行时漂移是用户能看见的 bug：同一个令牌在不同页面渲染成不同颜色。按文档逐个定位来源——通常是每个内嵌应用各自定义了一套 :root。'
      });
    }
  }

  const order = { error: 0, warn: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.id.localeCompare(b.id));

  const bySeverity = findings.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; }, {});

  return {
    version: 1,
    target: { kind: graph.target ? 'path' : 'unknown', value: graph.target },
    summary: {
      declarations: (graph.declarations || []).length,
      uniqueTokens: graph.summary ? graph.summary.uniqueTokens : 0,
      runtimeVariables: observation ? observation.documents.reduce((a, d) => a + Object.keys(d.variables || {}).length, 0) : 0,
      runtimeDocuments: observation ? observation.documents.length : 0,
      findings: findings.length,
      bySeverity
    },
    findings
  };
}

module.exports = { cross, familyOf, isStateVariant, selectorClasses };
