/**
 * cross — the judgement layer.
 *
 * Takes the FACTS from scan (and optionally the observations from measure)
 * and decides what is actually wrong. scan never judges; cross never parses.
 */

import { normalizeValue, isAlias, isKeyword } from './lib/parse.js';

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
        title: `${c.name} has ${variants.length} values — a per-element dynamic variable, not a token`,
        detail: `All come from inline styles or JS objects, with values ${variants.map(v => v.value).slice(0, 6).join(', ')}${variants.length > 6 ? ' …' : ''}. This is a common technique for writing data into CSS variables — not a design token conflict.`,
        evidence: variants[0].locations.slice(0, 3),
        suggestion: 'Keep as-is. If you want to clean up, switch to data-* attributes or CSS counters to avoid confusing data with the token system.'
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
          title: `${c.name} has ${variants.length} values across different scopes/themes`,
          detail: variants.map(v => `${v.value} @ ${v.scopes.join('/')}${v.themes.length ? '[' + v.themes.join(',') + ']' : ''}`).join('；'),
          evidence: variants.flatMap(v => v.locations.slice(0, 1)).slice(0, 4),
          suggestion: 'Theme differences are intentional. Consider structuring light/dark pairs into a dedicated theme token group so themes become part of the system rather than scattered exceptions.'
        });
      } else {
        push({
          id: 'cascade-override',
          severity: 'info',
          title: `${c.name} is defined separately in ${kinds.join(' and ')} scopes`,
          detail: variants.map(v => `${v.value} @ ${v.scopes.join('/')}`).join('；'),
          evidence: variants.flatMap(v => v.locations.slice(0, 1)).slice(0, 4),
          suggestion: 'Normal CSS cascading override. If overrides are frequent, promote them to dedicated tokens to reduce hidden dependencies.'
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
            title: `${c.name} switches between ${group.length} values by state class`,
            detail: `Selector differences come only from state modifier classes (${[...new Set(group.flatMap(v => v.selectors))].slice(0, 4).join(' / ')}), which is state-color semantics, not a token conflict.`,
            evidence: group.flatMap(v => v.locations.slice(0, 1)).slice(0, 4),
            suggestion: 'Create a dedicated token per state (--seat-color-ok / --seat-color-warn / --seat-color-busy) instead of making one variable carry multiple states.'
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
          title: `${c.name} is a Tailwind v4 per-utility variable`,
          detail: `Each Tailwind v4 utility class (.leading-tight, .shadow-md, etc.) sets its own ${c.name} under its own selector. Multiple values are the framework's intended mechanism, not a token conflict.`,
          evidence: group.flatMap(v => v.locations.slice(0, 2)).slice(0, 6),
          suggestion: 'No action needed. If the token surface becomes overwhelming, consider managing them via Tailwind v4\'s @theme directive.'
        });
        continue;
      }

      const severity = ctxKind === 'root' ? 'error' : 'warn';
      push({
        id: 'conflict',
        severity,
        title: `${c.name} has ${group.length} different values within the ${ctxKind} scope`,
        detail: group.map(v => `${v.value} (${v.count} occurrences, e.g. ${v.locations[0] ? v.locations[0].file + ':' + v.locations[0].line : '?'})`).join('; '),
        evidence: group.flatMap(v => v.locations.slice(0, 3)).slice(0, 8),
        suggestion: ctxKind === 'root'
          ? 'The root scope should have a single canonical value — merge and reference it everywhere else.'
          : 'Multiple values in the same scope make it hard to tell which one wins — it depends on selector matching order. Merge them or split into separate tokens.'
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
      if (!fam) { byFamily.set('(no-family)', byFamily.get('(no-family)') || []); byFamily.get('(no-family)').push(d); continue; }
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
        title: `${fam}-* family has ${ds.length} dangling references (${Math.round(ds.length / danglingList.length * 100)}% of all ${danglingList.length})`,
        detail: `The entire naming family is referenced but never declared — this is a systematic gap in the generator, not ${ds.length} independent bugs. The most likely cause is that the component library's page-level styles are generated on demand but output incompletely.`,
        evidence: ds.slice(0, 15).map(d => {
          const loc = refMap.get(d.name) || {};
          return { name: d.name, count: d.count, file: loc.file, line: loc.line };
        }),
        suggestion: `Investigate the ${fam}-* generator configuration and re-export page styles. The remaining ${danglingList.length - ds.length} non-${fam}-* dangling references are listed below.`,
        refCount: totalRefs
      });
      for (const d of danglingList) {
        if (familyOf(d.name) === fam) continue;
        const loc = refMap.get(d.name) || {};
        push({
          id: 'dangling',
          severity: 'error',
          title: `${d.name} is referenced ${d.count} times but never declared`,
          detail: 'References will receive an invalid value (most browsers fall back to the initial/inherited value).',
          evidence: [{ name: d.name, count: d.count, file: loc.file, line: loc.line }],
          suggestion: 'Add a declaration, or change the reference to an existing token.',
          refCount: d.count
        });
      }
    } else {
      for (const d of danglingList) {
        const loc = refMap.get(d.name) || {};
        push({
          id: 'dangling',
          severity: 'error',
          title: `${d.name} is referenced ${d.count} times but never declared`,
          detail: 'References will receive an invalid value (most browsers fall back to the initial/inherited value).',
          evidence: [{ name: d.name, count: d.count, file: loc.file, line: loc.line }],
          suggestion: 'Add a declaration, or change the reference to an existing token.',
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
      title: `${orphanList.length} tokens are declared but never referenced`,
      detail: 'Distribution by scope: ' + Object.entries(byScope).map(([k, v]) => `${k}: ${v}`).join(', ') + '. A common cause is a shared stylesheet being replaced by another page\'s variable system.',
      evidence: orphanList.slice(0, 10).map(o => {
        const loc = declMap.get(o.name) || {};
        return { name: o.name, declarations: o.declarations, scopes: o.scopes, file: loc.file, line: loc.line };
      }),
      suggestion: 'Review each one: delete it, or have the real consumer reference it.'
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
      title: `${families.size} naming families coexist`,
      detail: [...families.entries()].sort((a, b) => b[1].size - a[1].size)
        .map(([f, names]) => `--${f}-*（${names.size}）`).join('，'),
      evidence: [...families.entries()].map(([f, names]) => {
        const sample = [...names][0];
        const loc = declMap.get(sample) || {};
        return { family: f, tokens: [...names].slice(0, 6), count: names.size, file: loc.file, line: loc.line };
      }),
      suggestion: 'Choose one or two naming families as the primary system, and demote the rest to aliases or phase them out.'
    });
  }

  /* ------------------------------------- same value, different names */
  // Use the raw value, not the resolved one: once a secondary token has been
  // aliased to var(--primary) its resolved value still equals the primary's
  // colour, so the pair would keep showing up as a duplicate. Aliased tokens
  // have a raw value starting with var(--, which isAlias catches.
  const byValue = new Map();
  for (const d of graph.declarations) {
    const v = d.raw;
    if (!v || isAlias(v) || isKeyword(v)) continue;
    const key = normalizeValue(v);
    if (!key || !/^#/.test(key)) continue; // colours only for this check
    if (!byValue.has(key)) byValue.set(key, new Map());
    const m = byValue.get(key);
    if (!m.has(d.name)) m.set(d.name, new Set());
    m.get(d.name).add(familyOf(d.name) || '(no-family)');
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
      title: `${dupes.length} color values are expressed by multiple token names`,
      detail: dupes.slice(0, 8).map(d => `${d.value} = ${d.names.join(' = ')}`).join('；'),
      evidence: dupes.slice(0, 8).flatMap(d => {
        const locByName = new Map();
        for (const n of d.names) {
          const loc = declMap.get(n);
          if (loc) locByName.set(n, loc);
        }
        const primaryLoc = locByName.get(d.names[0]) || {};
        // One evidence entry per secondary name so diff.js generates a patch
        // for each alias — not just the first one after the primary.
        return d.names.slice(1).map(secondary => {
          const secLoc = locByName.get(secondary) || primaryLoc;
          return {
            value: d.value,
            names: d.names,
            primary: d.names[0],
            secondary,
            primaryFile: primaryLoc.file,
            primaryLine: primaryLoc.line,
            secondaryFile: secLoc.file,
            secondaryLine: secLoc.line
          };
        });
      }),
      suggestion: 'Keep one canonical name per color and alias the rest to it, reducing guesswork about which one to use.'
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
        title: `${hardcoded.length} colors are hardcoded across documents in the same theme with no matching token`,
        detail: hardcoded.slice(0, 10).map(d => `${d.value} (${d.theme}) appears in ${d.documents.slice(0, 3).join(', ')}`).join('; '),
        evidence: hardcoded.slice(0, 10).map(d => ({ value: d.value, theme: d.theme, documents: d.documents.slice(0, 5) })),
        suggestion: 'These are candidates for the token system: name the brand and semantic colors first, then replace them one by one.'
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
        title: `${drifting.length} tokens resolve to different values across documents in the same theme`,
        detail: drifting.slice(0, 10).map(d => `${d.name} [${d.theme}]: ${d.values.join(' / ')} (${d.where.length} documents)`).join('; '),
        evidence: drifting.slice(0, 12).map(d => ({ name: d.name, theme: d.theme, values: d.values, documents: d.where.slice(0, 6) })),
        suggestion: 'Runtime drift is a user-visible bug: the same token renders as different colors on different pages. Locate the source per document — usually each embedded app defines its own :root.'
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

export { cross, familyOf, isStateVariant, selectorClasses };
