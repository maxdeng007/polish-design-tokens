/**
 * confirm.js — resolve designer decisions into patches.
 *
 * Turns human-confirmed judgmental decisions (delete / alias / rename /
 * tokenize) into the same patch shape diff.js produces, so they flow
 * through apply() with backup protection. The designer decides *what*;
 * this module figures out *where* by looking up token locations in the
 * DeclarationGraph from scan().
 *
 * Decisions with no resolvable target are not silently dropped — they
 * are reported in `unmatched` ({ decision, reason }) so the CLI can
 * surface them and exit non-zero.
 *
 * Delete patches embed the declaration's original line text (`before`) so
 * apply() can refuse stale deletes: if the file changed after the patch
 * was generated, the line no longer matches and the delete is skipped
 * instead of removing the wrong line.
 *
 * Tokenize patches substitute literal occurrences with var(${to}). All
 * substitutions on the same file+line — across every tokenize decision —
 * are merged into ONE replace patch per line, so apply() never sees two
 * patches whose `before` is identical. One `add` patch is appended per
 * undeclared `to` target in tokens.css. Two decisions mapping the same
 * normalized value to different token names, or two decisions with
 * different values mapping to the same token name, are ambiguous and
 * refuse the whole run.
 */

import fsSync from 'fs';
import path from 'path';

import { normalizeValue } from './lib/parse.js';

/** Resolve a graph file path against the scan target, mirroring apply(). */
function resolveFile(file, target) {
  return path.isAbsolute(file) ? file : path.resolve(target, file);
}

/**
 * Read the current text of a declaration line. Returns null when the file
 * can't be read or the line no longer mentions the token — either means the
 * scan data is stale and no delete patch should be generated.
 */
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

/** 1-based line of the closing brace of the :root block in tokens.css, or
 *  null when the file or the block can't be found (caller falls back to EOF). */
function findRootCloseLine(target) {
  try {
    const lines = fsSync.readFileSync(path.join(target, 'tokens.css'), 'utf8').split('\n');
    const open = lines.findIndex(l => /^\s*:root\s*\{/.test(l));
    if (open === -1) return null;
    for (let i = open + 1; i < lines.length; i++) {
      if (/^\s*\}/.test(lines[i])) return i + 1;
    }
  } catch {}
  return null;
}

/** Escape regex metacharacters in a literal string. */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolve decisions into patches and unmatched reports.
 *
 * @param {Array} decisions — [{action, token|from|value, to}]
 * @param {DeclarationGraph} graph — output of scan()
 * @param {string} [target] — directory graph file paths resolve against
 *   (defaults to `process.cwd()`).
 * @returns {{ patches: Array, unmatched: Array }} patches:
 *   [{type, file, line, before, after, reason, findingId}];
 *   unmatched: [{ decision, reason }]
 */
export function confirm(decisions, graph, target = process.cwd()) {
  const patches = [];
  const unmatched = [];
  const decls = graph.declarations || [];
  const refs = graph.references || [];
  const literals = graph.literals || [];
  const declared = new Set(decls.map(d => d.name));

  // Ambiguity pre-check (spec §4.5.3): two decisions mapping the same
  // normalized value to different names refuse the entire run. The reverse
  // — two decisions with different values mapping to the same name — is
  // equally ambiguous: the declaration can only hold one value, so the
  // other literal's var() references would silently resolve to the wrong
  // value. Refuse the whole run in that case too.
  const tokenTargetByValue = new Map();
  const valueByTokenTarget = new Map();
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
    if (valueByTokenTarget.has(d.to) && valueByTokenTarget.get(d.to) !== key) {
      throw new Error(
        `Ambiguous tokenize decisions: token ${d.to} maps to both ` +
        `${valueByTokenTarget.get(d.to)} and ${key} — refusing the run`
      );
    }
    valueByTokenTarget.set(d.to, key);
  }
  const needsAdd = new Set(
    [...tokenTargetByValue.values()].filter(to => !declared.has(to))
  );
  const tokensCssMissing = !fsSync.existsSync(path.join(target, 'tokens.css'));
  // Substitutions from every tokenize decision, grouped by file+line so each
  // line composes exactly ONE replace patch (merged across decisions).
  const tokenizeGroups = new Map();
  // Undeclared `to`s that actually tokenized: to -> first literal value seen.
  const pendingAdds = new Map();

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
        // Invalid token names were already reported during the pre-check;
        // skip them here so no patches are generated for a rejected decision.
        if (typeof d.to !== 'string' || !d.to.startsWith('--')) break;
        const occurrences = literals.filter(l => l.normalized === normalizeValue(d.value));
        if (occurrences.length === 0) {
          unmatched.push({ decision: d, reason: `value ${d.value} not found in re-scan` });
          break;
        }
        if (needsAdd.has(d.to) && tokensCssMissing) {
          unmatched.push({ decision: d, reason: 'tokens.css not found — run polish seed first' });
          break;
        }
        // Same-line merging: accumulate this decision's substitutions into the
        // per-line groups shared by every tokenize decision, so each line
        // composes ONE replace patch (spec §3.1) — apply() never sees two
        // patches whose `before` is identical. Patches are built after the
        // decision loop.
        for (const o of occurrences) {
          const key = o.file + '\u0000' + o.line;
          let group = tokenizeGroups.get(key);
          if (!group) {
            group = { file: o.file, line: o.line, decision: d, subs: [] };
            tokenizeGroups.set(key, group);
          }
          if (!group.subs.some(s => s.value === o.value)) {
            group.subs.push({ value: o.value, to: d.to });
          }
        }
        if (needsAdd.has(d.to)) {
          needsAdd.delete(d.to);
          pendingAdds.set(d.to, occurrences[0].value);
        }
        break;
      }
    }
  }

  // Compose the merged tokenize patches: one replace patch per file+line
  // applying every substitution collected above, then one add patch per
  // undeclared `to` that tokenized.
  for (const group of tokenizeGroups.values()) {
    const before = readLineText(group.file, group.line, target);
    if (before == null) {
      unmatched.push({ decision: group.decision, reason: `could not read ${group.file}:${group.line}` });
      continue;
    }
    let after = before;
    for (const s of group.subs) {
      const re = new RegExp('(?<![\\w-])' + escapeRegex(s.value) + '(?![\\w-])', 'g');
      after = after.replace(re, `var(${s.to})`);
    }
    if (after === before) {
      unmatched.push({ decision: group.decision, reason: `value ${group.subs[0].value} no longer present at ${group.file}:${group.line}` });
      continue;
    }
    patches.push({
      type: 'replace',
      file: group.file,
      line: group.line,
      before,
      after,
      reason: `tokenize ${group.subs.map(s => `${s.value} → ${s.to}`).join(', ')}`,
      findingId: 'literal-cluster'
    });
  }
  for (const [to, value] of pendingAdds) {
    // Seed flow: tokens.css already carries a provisional declaration
    // (--{kind}-{n}) for this value. Rename it to the chosen name instead of
    // appending a duplicate — the old name would linger in the :root block
    // and an EOF append would put the new one outside any block (invalid CSS).
    const provisional = decls.find(
      d => d.file === 'tokens.css' &&
        /^--(color|space|radius|font-size)-\d+$/.test(d.name) &&
        normalizeValue(d.raw) === normalizeValue(value)
    );
    if (provisional) {
      patches.push({
        type: 'rewrite',
        file: 'tokens.css',
        line: null,
        before: provisional.name,
        after: to,
        reason: `rename provisional ${provisional.name} → ${to}`,
        findingId: 'literal-cluster'
      });
      continue;
    }
    patches.push({
      type: 'add',
      file: 'tokens.css',
      line: findRootCloseLine(target),
      after: `  ${to}: ${value};`,
      reason: `declare ${to}`,
      findingId: 'literal-cluster'
    });
  }

  return { patches, unmatched };
}
