'use strict';
/**
 * scan — static half of the pipeline.
 *
 * Walks a source tree, parses every custom-property declaration and var()
 * reference, resolves alias chains, and emits a DeclarationGraph.
 *
 * Emits FACTS only. Whether a same-name conflict is a bug is cross.js's call.
 */

const fs = require('fs');
const path = require('path');
const { parseSource, resolveValue, resolveVar, classify, normalizeValue, isAlias, isKeyword } = require('./lib/parse');

const SCAN_EXT = new Set(['.css', '.scss', '.less', '.html', '.htm', '.jsx', '.tsx', '.js', '.ts', '.mjs', '.cjs', '.vue', '.svelte']);
const SKIP_DIR = new Set(['node_modules', '.git', '.svn', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt', '.cache', '__pycache__', '.venv', 'venv', '.idea', '.vscode', 'target']);

function walk(root, out) {
  out = out || [];
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch (e) { return out; }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.') {
      if (SKIP_DIR.has(entry.name)) continue;
    }
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR.has(entry.name)) continue;
      walk(full, out);
    } else if (entry.isFile()) {
      if (SCAN_EXT.has(path.extname(entry.name).toLowerCase())) out.push(full);
    }
  }
  return out;
}

/**
 * @param {string} target file or directory to scan
 * @param {object} [opts]
 * @param {string} [opts.ignore] comma-separated glob-ish substrings to skip
 * @returns {object} DeclarationGraph
 */
function scan(target, opts) {
  opts = opts || {};
  const root = fs.statSync(target).isDirectory() ? target : path.dirname(target);
  const files = fs.statSync(target).isDirectory()
    ? walk(target)
    : [target];

  const ignore = (opts.ignore || '').split(',').map(s => s.trim()).filter(Boolean);

  const declarations = [];
  const references = [];
  const fileList = [];

  for (const file of files) {
    const rel = path.relative(root, file);
    if (ignore.some(ig => rel.includes(ig))) continue;
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch (e) { continue; }
    if (text.includes('\u0000')) continue; // binary
    fileList.push(rel);
    const parsed = parseSource(text, rel);
    declarations.push(...parsed.declarations);
    references.push(...parsed.references);
  }

  // Index by name for alias resolution.
  const byName = new Map();
  for (const d of declarations) {
    if (!byName.has(d.name)) byName.set(d.name, []);
    byName.get(d.name).push(d);
  }

  // Resolve each declaration's own value through the alias chain.
  for (const d of declarations) {
    const r = resolveValue(d.raw, byName, new Set([d.name]));
    d.resolved = r.value;
    d.resolvedKind = classify(r.value);
    d.unresolvedRefs = r.unresolved;
    const eff = resolveVar(d.name, byName);
    d.effective = eff.value;
  }

  // Reference counts (how many places mention each token).
  const refCounts = new Map();
  for (const r of references) {
    refCounts.set(r.name, (refCounts.get(r.name) || 0) + 1);
  }

  const themes = new Set();
  for (const d of declarations) (d.themes || []).forEach(t => themes.add(t));

  // Facts: same name, different resolved value.
  // Values are normalised so #FFFFFF / #fff / rgb(255,255,255) do not read
  // as three different colours. Aliases and CSS keywords are bucketed
  // separately — they are not literal values at all.
  const conflicts = [];
  for (const [name, decls] of byName) {
    if (decls.length < 2) continue;
    const buckets = new Map();
    const aliases = new Map();
    const keywords = new Map();
    for (const d of decls) {
      const raw = d.resolved || d.raw || '';
      let key;
      let bucket;
      if (isAlias(raw)) { key = raw.toLowerCase(); bucket = aliases; }
      else if (isKeyword(raw)) { key = raw.toLowerCase(); bucket = keywords; }
      else { key = normalizeValue(raw); bucket = buckets; }
      if (!key) continue;
      if (!bucket.has(key)) bucket.set(key, []);
      bucket.get(key).push(d);
    }
    const variantList = [...buckets.entries()].map(([value, ds]) => ({
      value,
      raw: ds[0].raw,
      count: ds.length,
      scopes: [...new Set(ds.map(x => x.scope))],
      themes: [...new Set(ds.flatMap(x => x.themes || []))],
      selectors: [...new Set(ds.map(x => x.selector).filter(Boolean))].slice(0, 8),
      origins: [...new Set(ds.map(x => x.origin).filter(Boolean))],
      locations: ds.slice(0, 8).map(x => ({ file: x.file, line: x.line, scope: x.scope, selector: x.selector, themes: x.themes }))
    }));
    if (variantList.length > 1) {
      conflicts.push({
        name,
        variants: variantList,
        aliases: [...aliases.keys()],
        keywords: [...keywords.keys()],
        kinds: [...new Set(decls.map(d => d.kind))]
      });
    }
  }

  // Facts: referenced but never declared.
  const dangling = [];
  for (const [name, count] of refCounts) {
    if (!byName.has(name)) dangling.push({ name, count });
  }

  // Facts: declared but never referenced.
  const orphans = [];
  for (const [name, decls] of byName) {
    const used = refCounts.get(name) || 0;
    if (used === 0) orphans.push({ name, declarations: decls.length, scopes: [...new Set(decls.map(d => d.scope))] });
  }

  return {
    version: 1,
    root: path.resolve(root),
    target: path.resolve(target),
    files: fileList,
    themes: [...themes],
    declarations,
    references,
    conflicts,
    dangling,
    orphans,
    summary: {
      files: fileList.length,
      declarations: declarations.length,
      uniqueTokens: byName.size,
      references: references.length,
      conflicts: conflicts.length,
      dangling: dangling.length,
      orphans: orphans.length
    }
  };
}

module.exports = { scan, walk };
