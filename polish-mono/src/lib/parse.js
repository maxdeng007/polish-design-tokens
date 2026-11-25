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

/**
 * Common CSS property names used to tell style objects from documentation
 * objects when deciding whether a JS string literal is a CSS context.
 * Keys starting with `--` or containing `-` are always treated as CSS-like
 * and do not need to be listed here.
 */
const CSS_PROPS = new Set([
  'alignment', 'animation', 'backdrop-filter', 'background', 'background-clip',
  'background-color', 'background-image', 'background-position', 'background-size',
  'border', 'border-bottom', 'border-bottom-color', 'border-bottom-left-radius',
  'border-bottom-right-radius', 'border-bottom-width', 'border-collapse',
  'border-color', 'border-image', 'border-left', 'border-left-color',
  'border-left-width', 'border-radius', 'border-right', 'border-right-color',
  'border-right-width', 'border-spacing', 'border-style', 'border-top',
  'border-top-color', 'border-top-left-radius', 'border-top-right-radius',
  'border-top-width', 'border-width', 'bottom', 'box-shadow', 'box-sizing',
  'break-after', 'break-before', 'break-inside', 'caption-side', 'caret-color',
  'clear', 'clip', 'clip-path', 'color', 'column-count', 'column-gap',
  'column-rule', 'column-rule-color', 'column-rule-style', 'column-rule-width',
  'column-span', 'column-width', 'columns', 'content', 'counter-increment',
  'counter-reset', 'cursor', 'direction', 'display', 'filter', 'flex',
  'flex-basis', 'flex-direction', 'flex-flow', 'flex-grow', 'flex-shrink',
  'flex-wrap', 'font', 'font-family', 'font-feature-settings', 'font-kerning',
  'font-size', 'font-size-adjust', 'font-stretch', 'font-style', 'font-variant',
  'font-weight', 'gap', 'grid', 'grid-area', 'grid-auto-columns',
  'grid-auto-flow', 'grid-auto-rows', 'grid-column', 'grid-column-end',
  'grid-column-gap', 'grid-column-start', 'grid-gap', 'grid-row',
  'grid-row-end', 'grid-row-gap', 'grid-row-start', 'grid-template',
  'grid-template-areas', 'grid-template-columns', 'grid-template-rows',
  'height', 'hyphens', 'image-rendering', 'inset', 'isolation',
  'justify-content', 'justify-items', 'justify-self', 'left', 'letter-spacing',
  'line-break', 'line-height', 'list-style', 'list-style-image',
  'list-style-position', 'list-style-type', 'margin', 'margin-bottom',
  'margin-left', 'margin-right', 'margin-top', 'max-height', 'max-width',
  'min-height', 'min-width', 'mix-blend-mode', 'object-fit', 'object-position',
  'opacity', 'order', 'orphans', 'outline', 'outline-color', 'outline-offset',
  'outline-style', 'outline-width', 'overflow', 'overflow-wrap', 'overflow-x',
  'overflow-y', 'overscroll-behavior', 'padding', 'padding-bottom',
  'padding-left', 'padding-right', 'padding-top', 'position', 'quotes',
  'resize', 'right', 'row-gap', 'scroll-behavior', 'scroll-margin',
  'scroll-padding', 'scroll-snap-align', 'scroll-snap-type', 'scrollbar-color',
  'scrollbar-width', 'shape-margin', 'shape-outside', 'shape-rendering',
  'src', 'tab-size', 'table-layout', 'text-align', 'text-align-last',
  'text-combine-upright', 'text-decoration', 'text-decoration-color',
  'text-decoration-line', 'text-decoration-style', 'text-emphasis',
  'text-indent', 'text-justify', 'text-orientation', 'text-overflow',
  'text-shadow', 'text-transform', 'text-underline-offset',
  'text-underline-position', 'top', 'touch-action', 'transform',
  'transform-origin', 'transform-style', 'transition', 'transition-delay',
  'transition-duration', 'transition-property', 'transition-timing-function',
  'unicode-bidi', 'user-select', 'vertical-align', 'visibility',
  'white-space', 'width', 'will-change', 'word-break', 'word-spacing',
  'word-wrap', 'writing-mode', 'z-index', 'zoom'
]);

function isCssLikeKey(key) {
  if (!key) return false;
  const k = key.toLowerCase();
  return k.startsWith('--') || k.includes('-') || CSS_PROPS.has(k);
}

/** Walk backward from a closing quote to its opening quote, honouring escapes. */
function skipStringBackward(out, close) {
  let k = close - 1;
  while (k >= 0) {
    if (out[k] === '\\') { k -= 2; continue; }
    if (out[k] === out[close]) return k;
    k--;
  }
  return -1;
}

/**
 * Decide whether a JS string literal at offset `i` (the opening quote) sits
 * in a CSS context, by looking at the masked output built so far.
 * Style-object values (`background: 'var(--x)'`) and setProperty arguments
 * are real references; documentation strings (`const doc = "var(--x)"`) are not.
 */
function jsStringIsCssContext(out, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(out[j])) j--;
  if (j < 0) return false;
  if (out[j] === ':') {
    j--;
    while (j >= 0 && /\s/.test(out[j])) j--;
    let k = j;
    while (k >= 0 && /[A-Za-z0-9_-]/.test(out[k])) k--;
    return isCssLikeKey(out.slice(k + 1, j + 1));
  }
  if (out[j] === ',' || out[j] === '(') {
    let k = j - 1;
    while (k >= 0 && /\s/.test(out[k])) k--;
    if (k >= 0 && (out[k] === '"' || out[k] === "'" || out[k] === '`')) {
      k = skipStringBackward(out, k);
      while (k >= 0 && /\s/.test(out[k])) k--;
    }
    let m = k;
    while (m >= 0 && /[A-Za-z0-9_$]/.test(out[m])) m--;
    return out.slice(m + 1, k + 1) === 'setProperty';
  }
  return false;
}

/**
 * Replace comments and quoted strings with spaces, preserving length and
 * newlines so offsets and line numbers stay aligned with the original text.
 */
function maskLexicalCss(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '/' && text[i + 1] === '*') {
      let j = i + 2;
      while (j < n && !(text[j] === '*' && text[j + 1] === '/')) j++;
      const stop = Math.min(j + 2, n);
      for (let k = i; k < stop; k++) out += text[k] === '\n' ? '\n' : ' ';
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      out += ' ';
      let j = i + 1;
      while (j < n) {
        if (text[j] === '\\') {
          out += ' ';
          if (j + 1 < n) out += text[j + 1] === '\n' ? '\n' : ' ';
          j += 2;
          continue;
        }
        if (text[j] === quote) { out += ' '; j++; break; }
        out += text[j] === '\n' ? '\n' : ' ';
        j++;
      }
      i = j;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * JS lexical masking. Comments are always masked. String and template
 * literals are kept (so real CSS-in-JS references survive) unless
 * `maskStrings` is true, in which case only strings in a CSS context are kept.
 *
 * When `jsx` is true (.jsx/.tsx files), JSX text content between tags is
 * masked so prose like `<p>Use var(--bg)</p>` does not read as a reference.
 * Strings inside JSX text still follow the same keep/mask rule, so a genuine
 * quoted reference is never lost even if tag tracking is imperfect.
 */
function maskLexicalJs(text, maskStrings, jsx) {
  const out = [];
  let i = 0;
  const n = text.length;
  const stack = [{ mode: 'code', braceDepth: 0, interp: false }];
  const emit = (ch) => out.push(ch);
  const maskChar = (ch) => out.push(ch === '\n' ? '\n' : ' ');
  const isTagStart = (j) => {
    const c = text[j + 1];
    return c === '/' || c === '>' || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
  };
  const readString = (quote, keep) => {
    emit(quote);
    i++;
    while (i < n) {
      if (text[i] === '\\') {
        emit(text[i]);
        if (i + 1 < n) emit(text[i + 1]);
        i += 2;
        continue;
      }
      if (keep) emit(text[i]); else maskChar(text[i]);
      if (text[i] === quote) { i++; break; }
      i++;
    }
  };

  while (i < n) {
    const ctx = stack[stack.length - 1];
    const ch = text[i];

    if (ctx.mode === 'code') {
      if (ch === '/' && text[i + 1] === '/') {
        let j = i;
        while (j < n && text[j] !== '\n') j++;
        for (let k = i; k < j; k++) emit(' ');
        i = j;
        continue;
      }
      if (ch === '/' && text[i + 1] === '*') {
        let j = i + 2;
        while (j < n && !(text[j] === '*' && text[j + 1] === '/')) j++;
        const stop = Math.min(j + 2, n);
        for (let k = i; k < stop; k++) maskChar(text[k]);
        i = stop;
        continue;
      }
      if (ch === "'" || ch === '"') {
        const keep = !maskStrings || jsStringIsCssContext(out.join(''), i);
        readString(ch, keep);
        continue;
      }
      if (ch === '`') {
        const keep = !maskStrings || jsStringIsCssContext(out.join(''), i);
        if (keep) {
          emit(ch);
          i++;
          stack.push({ mode: 'tpl', braceDepth: 0, interp: false });
          continue;
        }
        emit(' ');
        i++;
        while (i < n) {
          if (text[i] === '\\') {
            maskChar(text[i]);
            if (i + 1 < n) maskChar(text[i + 1]);
            i += 2;
            continue;
          }
          if (text[i] === '`') { emit(' '); i++; break; }
          maskChar(text[i]);
          i++;
        }
        continue;
      }
      if (jsx && ch === '<' && isTagStart(i)) {
        emit(ch);
        i++;
        stack.push({ mode: 'jsxTag', closing: text[i] === '/' });
        continue;
      }
      if (ch === '}' && ctx.interp) {
        if (ctx.braceDepth === 0) { emit(ch); stack.pop(); i++; continue; }
        ctx.braceDepth--;
      } else if (ch === '{' && ctx.interp) {
        ctx.braceDepth++;
      }
      emit(ch);
      i++;
      continue;
    }

    if (ctx.mode === 'jsxTag') {
      if (ch === "'" || ch === '"') {
        const keep = !maskStrings || jsStringIsCssContext(out.join(''), i);
        readString(ch, keep);
        continue;
      }
      if (ch === '>') {
        emit(ch);
        i++;
        stack.pop();
        if (!ctx.closing) stack.push({ mode: 'jsxText' });
        continue;
      }
      emit(ch);
      i++;
      continue;
    }

    if (ctx.mode === 'jsxText') {
      if (ch === '{') {
        emit(ch);
        i++;
        stack.push({ mode: 'code', braceDepth: 0, interp: true });
        continue;
      }
      if (ch === "'" || ch === '"') {
        const keep = !maskStrings || jsStringIsCssContext(out.join(''), i);
        readString(ch, keep);
        continue;
      }
      if (jsx && ch === '<' && isTagStart(i)) {
        emit(ch);
        i++;
        stack.pop();
        stack.push({ mode: 'jsxTag', closing: text[i] === '/' });
        continue;
      }
      maskChar(ch);
      i++;
      continue;
    }

    if (ctx.mode === 'tpl') {
      if (text[i] === '\\') { emit(text[i]); if (i + 1 < n) emit(text[i + 1]); i += 2; continue; }
      if (text[i] === '`') { emit('`'); stack.pop(); i++; continue; }
      if (text[i] === '$' && text[i + 1] === '{') {
        emit('$');
        emit('{');
        stack.push({ mode: 'code', braceDepth: 0, interp: true });
        i += 2;
        continue;
      }
      emit(text[i]);
      i++;
    }
  }
  return out.join('');
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
      aliases: refsIn(maskLexicalCss(value))
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

  // References live anywhere in the file, not just inside declarations —
  // but not inside comments or string literals, so scan a lexically masked
  // copy. Masking preserves length and newlines, so offsets still map to the
  // original text for line numbers.
  const refText = maskLexicalCss(text);
  const whole = VAR_REF_RE.source;
  const re = new RegExp(whole, 'g');
  const lineAt = lineCounter(text);
  let m;
  while ((m = re.exec(refText))) {
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
    const body = maskLexicalJs(m[1], false);
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
function parseJs(text, file, opts) {
  const jsx = !!(opts && opts.jsx);
  const declarations = [];
  const references = [];
  // Declaration regexes need string literals intact (the values ARE strings),
  // so only comments are masked for them.
  const codeText = maskLexicalJs(text, false, jsx);
  const objLineAt = lineCounter(text);
  const objRe = /(["'])--([A-Za-z0-9_-]+)\1\s*:\s*(["'])([^"']*)\3/g;
  let m;
  while ((m = objRe.exec(codeText))) {
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
  while ((m = spRe.exec(codeText))) {
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
  // Whole-file reference scan on a lexically masked copy: comments are gone,
  // and strings/templates survive only when they sit in a CSS context.
  const refText = maskLexicalJs(text, true, jsx);
  const refLineAt = lineCounter(text);
  const re = new RegExp(VAR_REF_RE.source, 'g');
  while ((m = re.exec(refText))) {
    references.push({ name: m[1], file, line: refLineAt(m.index) + 1 });
  }
  return { declarations, references };
}

/** Parse a Vue/Svelte single-file component: dispatch template, script, style. */
function parseSfc(text, file) {
  const declarations = [];
  const references = [];
  const lineAt = lineCounter(text);
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  const blockShift = (match) =>
    lineAt(match.index) + countNewlines(match[0].slice(0, match[0].indexOf('>') + 1));
  const pushShifted = (parsed, shift) => {
    parsed.declarations.forEach(d => { d.line += shift; declarations.push(d); });
    parsed.references.forEach(r => { r.line += shift; references.push(r); });
  };

  const tplMatch = /<template\b[^>]*>([\s\S]*?)<\/template>/i.exec(text);
  let templateText;
  let templateShift;
  if (tplMatch) {
    templateText = tplMatch[1];
    templateShift = blockShift(tplMatch);
  } else {
    templateText = text
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, blank)
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, blank);
    templateShift = 0;
  }
  pushShifted(parseHtml(templateText, file), templateShift);

  let m;
  const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = scriptRe.exec(text))) {
    pushShifted(parseJs(m[1], file), blockShift(m));
  }
  const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  while ((m = styleRe.exec(text))) {
    pushShifted(parseCss(m[1], file), blockShift(m));
  }

  return { declarations, references };
}

function parseSource(text, file) {
  if (/\.html?$/i.test(file)) return parseHtml(text, file);
  if (/\.(vue|svelte)$/i.test(file)) return parseSfc(text, file);
  if (/\.(jsx|tsx)$/i.test(file)) return parseJs(text, file, { jsx: true });
  if (/\.(js|ts|mjs|cjs)$/i.test(file)) return parseJs(text, file);
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
  parseCss, parseHtml, parseJs, parseSfc, parseSource,
  maskLexicalJs,
  resolveVar, resolveValue, classify, refsIn, themesIn, findVarRefs,
  normalizeValue, isAlias, isKeyword, isNumericIndex
};

function isKeyword(v) { return KEYWORDS.test(String(v || '').trim()); }
