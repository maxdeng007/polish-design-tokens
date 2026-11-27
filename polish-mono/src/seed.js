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
