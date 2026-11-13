/**
 * Zero-dependency CSS/HTML scanner.
 *
 * Produces declarations (--name: value with scope + location) and references
 * (var(--name) usages). Deliberately does NOT judge anything — a same-name
 * conflict is a fact here; deciding whether it is a bug happens in cross.js.
 */

import fs from 'fs';
import path from 'path';

const DECL_RE = /^\s*(--[A-Za-z0-9_-]+)\s*:\s*([\s\S]*)$/;
const VAR_REF_RE = /var\(\s*(--[A-Za-z0-9_-]+)/g;
const THEME_RE = /\[data-theme\s*=\s*(?:["']|&quot;)?([^\]"'\s;&]+)(?:["']|&quot;)?\]/gi;

function countNewlines(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s[i] === '\n') n++;
  return n;
}

/**
 * Line number for an offset in `text`.
 * Counting the whole prefix on every lookup is O(n²) on multi-megabyte files,
 * so a counter is used per regex loop, where offsets arrive in increasing order.
 */
function lineCounter(text) {
  let lastIndex = 0;
  let lastLine = 0;
  return (offset) => {
    lastLine += countNewlines(text.slice(lastIndex, offset));
    lastIndex = offset;
    return lastLine;
  };
}

/** Every [data-theme=x] value appearing in a selector or at-rule condition. */
function themesIn(text) {
  const out = [];
  if (!text) return out;
  const re = new RegExp(THEME_RE.source, 'gi');
  let m;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

/** Classify a resolved value into a token kind. */
function classify(value) {
  const v = String(value || '').trim();
  if (!v) return 'other';
  if (/^(#|rgb|rgba|hsl|hsla|hwb|oklch|oklab|lch|lab|color\()/i.test(v)) return 'color';
  if (/^-?[\d.]+(px|rem|em|%|vh|vw|vmin|vmax|ch|pt|cm|mm|in|ex|pc|q|fr)$/i.test(v)) return 'dimension';
  if (/^-?[\d.]+(ms|s)$/i.test(v)) return 'duration';
  if (/^-?[\d.]+(deg|rad|grad|turn)$/i.test(v)) return 'angle';
  if (/^(cubic-bezier|steps|linear|ease)/i.test(v)) return 'easing';
  if (/^[-\d.]+\s+\/[\s\S]+$/.test(v)) return 'shadow';
  if (/^["']/.test(v)) return 'font-family';
  return 'other';
}

/** Extract var() references from a value string. */
function refsIn(value) {
  return findVarRefs(value).map(r => r.name);
}

/**
 * Parse a CSS source string.
 * @returns {{declarations: Array, references: Array}}
 */
function parseCss(text, file) {
  const declarations = [];
  const references = [];
  const stack = [];
  let buf = '';
  let bufLine = 1;
  let line = 1;
  let i = 0;
  const n = text.length;

  const current = () => {
    let selector = null;
    let media = null;
    const themes = [];
    for (const ctx of stack) {
      if (ctx.at) {
        if (/^@(media|supports|container|layer)/i.test(ctx.at)) {
          media = media ? media + ' && ' + ctx.condition : ctx.condition;
        }
        themesIn(ctx.condition).forEach(t => { if (!themes.includes(t)) themes.push(t); });
      } else if (ctx.selector) {
        selector = selector ? selector + ', ' + ctx.selector : ctx.selector;
        themesIn(ctx.selector).forEach(t => { if (!themes.includes(t)) themes.push(t); });
      }
    }
    return { selector, media, themes };
  };

  const flush = () => {
    const raw = buf.trim();
    buf = '';
    if (!raw) return;
    const m = DECL_RE.exec(raw);
    if (!m) return;
    const name = m[1];
    const value = m[2].replace(/\s*!important\s*$/i, '').trim();
    const ctx = current();
    const isRoot = ctx.selector && /^(:root|html)$/i.test(ctx.selector.trim());
    const scope = ctx.themes.length ? 'theme' : (isRoot ? 'root' : 'selector');
    declarations.push({
      name,
      raw: value,
      kind: classify(value),
      scope,
      selector: ctx.selector,
      media: ctx.media,
      themes: ctx.themes,
      file,
      line: bufLine,
      aliases: refsIn(value)
    });
  };

  while (i < n) {
    const ch = text[i];

    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      line += countNewlines(text.slice(i, stop));
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < n && text[j] !== quote) {
        if (text[j] === '\\') j++;
        if (text[j] === '\n') line++;
        j++;
      }
      buf += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === '{') {
      const prelude = buf.trim();
      buf = '';
      bufLine = line;
      if (prelude.startsWith('@')) {
        const sp = prelude.indexOf(' ');
        stack.push({
          at: sp === -1 ? prelude : prelude.slice(0, sp),
          condition: sp === -1 ? '' : prelude.slice(sp + 1).trim(),
          selector: null
        });
      } else {
        stack.push({ at: null, condition: null, selector: prelude });
      }
      i++;
      continue;
    }
    if (ch === '}') {
      flush();
      stack.pop();
      buf = '';
      bufLine = line;
      i++;
      continue;
    }
    if (ch === ';') {
      flush();
      bufLine = line + 1;
      i++;
      continue;
    }
    if (ch === '\n') {
      line++;
      if (!buf.trim()) bufLine = line;
    }
    buf += ch;
    i++;
  }
  flush();

  // References live anywhere in the file, not just inside declarations.
  const whole = VAR_REF_RE.source;
  const re = new RegExp(whole, 'g');
  const lineAt = lineCounter(text);
  let m;
  while ((m = re.exec(text))) {
    references.push({
      name: m[1],
      file,
      line: lineAt(m.index) + 1
    });
  }

  return { declarations, references };
}

/** Pull out <style> blocks, inline style attributes and JS style objects. */
function parseHtml(text, file) {
  const declarations = [];
  const references = [];

  const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  const styleLineAt = lineCounter(text);
  let m;
  while ((m = styleRe.exec(text))) {
    const inner = parseCss(m[1], file);
    const shift = styleLineAt(m.index);
    inner.declarations.forEach(d => { d.line += shift; d.origin = 'style-block'; declarations.push(d); });
    inner.references.forEach(r => { r.line += shift; references.push(r); });
  }

  const attrRe = /\bstyle\s*=\s*"([^"]*)"/gi;
  const attrLineAt = lineCounter(text);
  while ((m = attrRe.exec(text))) {
    const shift = attrLineAt(m.index);
    const inner = parseCss('x{' + m[1] + '}', file);
    inner.declarations.forEach(d => {
      d.line += shift;
      d.selector = 'inline-style';
      d.scope = 'selector';
      d.origin = 'inline-attribute';
      declarations.push(d);
    });
    inner.references.forEach(r => { r.line += shift; references.push(r); });
  }

  // JS/TS inline style objects:  { '--token': 'value' }  and setProperty('--t','v')
  const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  const scriptLineAt = lineCounter(text);
  while ((m = scriptRe.exec(text))) {
    const body = m[1];
    const shift = scriptLineAt(m.index);
    const objLineAt = lineCounter(body);
    const objRe = /(["'])--([A-Za-z0-9_-]+)\1\s*:\s*(["'])([^"']*)\3/g;
    let o;
    while ((o = objRe.exec(body))) {
      const value = o[4];
      declarations.push({
        name: '--' + o[2],
        raw: value,
        kind: classify(value),
        scope: 'selector',
        selector: null,
        media: null,
        themes: [],
        file,
        line: shift + objLineAt(o.index),
        aliases: refsIn(value),
        origin: 'js-object'
      });
    }
    const spLineAt = lineCounter(body);
    const spRe = /setProperty\(\s*(["'])--([A-Za-z0-9_-]+)\1\s*,\s*(["'])([^"']*)\3/g;
    while ((o = spRe.exec(body))) {
      const value = o[4];
      declarations.push({
        name: '--' + o[2],
        raw: value,
        kind: classify(value),
        scope: 'selector',
        selector: null,
        media: null,
        themes: [],
        file,
        line: shift + spLineAt(o.index),
        aliases: refsIn(value),
        origin: 'js-setproperty'
      });
    }
  }

  return { declarations, references };
}

/** Parse a JS/TS file for inline style objects. */
function parseJs(text, file) {
  const declarations = [];
  const references = [];
  const objLineAt = lineCounter(text);
  const objRe = /(["'])--([A-Za-z0-9_-]+)\1\s*:\s*(["'])([^"']*)\3/g;
  let m;
  while ((m = objRe.exec(text))) {
    const value = m[4];
    declarations.push({
      name: '--' + m[2],
      raw: value,
      kind: classify(value),
      scope: 'selector',
      selector: null,
      media: null,
      themes: [],
      file,
      line: objLineAt(m.index) + 1,
      aliases: refsIn(value),
      origin: 'js-object'
    });
  }
  const spLineAt = lineCounter(text);
  const spRe = /setProperty\(\s*(["'])--([A-Za-z0-9_-]+)\1\s*,\s*(["'])([^"']*)\3/g;
  while ((m = spRe.exec(text))) {
    const value = m[4];
    declarations.push({
      name: '--' + m[2],
      raw: value,
      kind: classify(value),
      scope: 'selector',
      selector: null,
      media: null,
      themes: [],
      file,
      line: spLineAt(m.index) + 1,
      aliases: refsIn(value),
      origin: 'js-setproperty'
    });
  }
  const refLineAt = lineCounter(text);
  const re = new RegExp(VAR_REF_RE.source, 'g');
  while ((m = re.exec(text))) {
    references.push({ name: m[1], file, line: refLineAt(m.index) + 1 });
  }
  return { declarations, references };
}

function parseSource(text, file) {
  if (/\.html?$/i.test(file)) return parseHtml(text, file);
  if (/\.(jsx?|tsx?|mjs|cjs)$/i.test(file)) return parseJs(text, file);
  return parseCss(text, file);
}

/**
 * Find every var() reference in a value, honouring nested parentheses.
 * `var(--bg-2,var(--bg))` is ONE reference to --bg-2 whose fallback is
 * `var(--bg)` — a naive regex would split it at the inner paren.
 */
function findVarRefs(value) {
  const text = String(value || '');
  const refs = [];
  const re = /var\(/g;
  let m;
  while ((m = re.exec(text))) {
    const start = m.index;
    let depth = 0;
    let end = -1;
    for (let i = start + 3; i < text.length; i++) {
      const c = text[i];
      if (c === '(') depth++;
      else if (c === ')') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) break;
    const inner = text.slice(start + 4, end);
    let d = 0;
    let comma = -1;
    for (let j = 0; j < inner.length; j++) {
      const c = inner[j];
      if (c === '(') d++;
      else if (c === ')') d--;
      else if (c === ',' && d === 0) { comma = j; break; }
    }
    const name = (comma === -1 ? inner : inner.slice(0, comma)).trim();
    const fallback = comma === -1 ? undefined : inner.slice(comma + 1).trim();
    refs.push({ start, end, name, fallback, text: text.slice(start, end + 1) });
    re.lastIndex = end + 1;
  }
  return refs;
}

/**
 * Resolve a raw value through its var() alias chain.
 * @param {string} raw
 * @param {Map<string, object[]>} byName
 * @returns {{value: string|null, chain: string[], unresolved: string[]}}
 */
function resolveValue(raw, byName, seen) {
  seen = seen || new Set();
  const chain = [];
  const unresolved = [];
  let value = String(raw || '').trim();
  let guard = 0;

  while (guard++ < 20) {
    const refs = findVarRefs(value);
    if (!refs.length) break;
    let next = value;
    let replaced = false;
    for (const ref of refs) {
      const sub = resolveVar(ref.name, byName, seen);
      if (sub.value !== null) {
        next = next.replace(ref.text, sub.value);
        chain.push(...sub.chain);
        replaced = true;
      } else if (ref.fallback !== undefined) {
        const fb = resolveValue(ref.fallback, byName, seen);
        next = next.replace(ref.text, fb.value !== null ? fb.value : ref.fallback);
        chain.push(...fb.chain);
        replaced = true;
      } else {
        unresolved.push(ref.name);
      }
    }
    value = next;
    if (!replaced) break;
  }

  return { value: value.trim() || null, chain, unresolved };
}

/**
 * Resolve a custom property's *effective* value, picking the winning
 * declaration by scope precedence (root > theme > selector).
 */
function resolveVar(name, byName, seen) {
  seen = seen || new Set();
  const chain = [];
  const unresolved = [];
  if (seen.has(name)) return { value: null, chain, unresolved: ['cycle:' + name] };
  seen.add(name);

  const decls = byName.get(name);
  if (!decls || !decls.length) { seen.delete(name); return { value: null, chain, unresolved: [name] }; }

  const rank = d => (d.scope === 'root' ? 0 : d.scope === 'theme' ? 1 : 2);
  const sorted = decls.slice().sort((a, b) =>
    rank(a) - rank(b) ||
    (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) ||
    (a.line - b.line)
  );
  const decl = sorted[0];

  const sub = resolveValue(decl.raw, byName, seen);
  seen.delete(name);
  return {
    value: sub.value,
    chain: [name + ':' + decl.raw].concat(sub.chain),
    unresolved: sub.unresolved
  };
}

/** CSS keywords that are not literal values. */
const KEYWORDS = /^(inherit|initial|unset|revert|revert-layer|currentcolor|transparent|currentColor)$/i;

/** Is this value a reference to another token (an alias)? */
function isAlias(value) {
  return /^--[A-Za-z0-9_-]+$/.test(String(value || '').trim());
}

/**
 * Canonicalise a value so notation differences do not read as conflicts.
 * #FFFFFF / #fff / rgb(255,255,255) collapse together, as do
 * `rgba(242,94,0,.55)` and `rgba(242, 94, 0, 0.55)`.
 * Alpha is preserved — a 14%-alpha tint is NOT the opaque colour.
 */
function normalizeValue(value) {
  let s = String(value || '').trim();
  if (!s) return '';
  if (isAlias(s)) return s.toLowerCase();
  if (KEYWORDS.test(s)) return s.toLowerCase();

  let lower = s.toLowerCase()
    .replace(/\s*,\s*/g, ',')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s+/g, ' ');

  if (/^#[0-9a-f]{3}$/.test(lower)) {
    lower = '#' + lower.slice(1).split('').map(c => c + c).join('');
  }
  if (/^#[0-9a-f]{6}$/.test(lower)) return lower;

  const fn = lower.match(/^(rgba?)\(([^)]*)\)$/);
  if (fn) {
    const parts = fn[2].split(',').map(x => x.trim());
    if (parts.length >= 3 && parts.slice(0, 3).every(p => /^\d{1,3}$/.test(p))) {
      const hex = '#' + parts.slice(0, 3)
        .map(n => Math.max(0, Math.min(255, +n)).toString(16).padStart(2, '0')).join('');
      const alpha = parts[3];
      if (alpha === undefined) return hex;
      let a = alpha;
      if (a.startsWith('0.')) a = a.slice(1);
      if (a === '1' || a === '100%') return hex;
      return hex + '/' + a;
    }
  }

  // 0.55 and .55 are the same number.
  lower = lower.replace(/,0\./g, ',.');
  return lower;
}

/** Is this an integer used as a per-element index? */
function isNumericIndex(value) {
  return /^-?\d+$/.test(String(value || '').trim());
}

export {
  parseCss, parseHtml, parseJs, parseSource,
  resolveVar, resolveValue, classify, refsIn, themesIn, findVarRefs,
  normalizeValue, isAlias, isKeyword, isNumericIndex
};

function isKeyword(v) { return KEYWORDS.test(String(v || '').trim()); }
