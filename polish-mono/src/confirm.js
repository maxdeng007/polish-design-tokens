/**
 * confirm.js — resolve designer decisions into patches.
 *
 * Turns human-confirmed judgmental decisions (delete / alias / rename)
 * into the same patch shape diff.js produces, so they flow through
 * apply() with backup protection. The designer decides *what*; this
 * module figures out *where* by looking up token locations in the
 * DeclarationGraph from scan().
 *
 * Delete patches embed the declaration's original line text (`before`) so
 * apply() can refuse stale deletes: if the file changed after the patch
 * was generated, the line no longer matches and the delete is skipped
 * instead of removing the wrong line. Decisions whose target line can no
 * longer be read or verified are dropped here, before any patch exists.
 */

import fsSync from 'fs';
import path from 'path';

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

/**
 * Resolve decisions into patches.
 *
 * @param {Array} decisions — [{action, token|from, to}]
 * @param {DeclarationGraph} graph — output of scan()
 * @param {string} [target] — directory graph file paths resolve against
 *   (defaults to `process.cwd()`).
 * @returns {Array} patches: [{type, file, line, before, after, reason, findingId}]
 */
export function confirm(decisions, graph, target = process.cwd()) {
  const patches = [];
  const decls = graph.declarations || [];
  const refs = graph.references || [];

  for (const d of decisions) {
    switch (d.action) {
      case 'delete': {
        const decl = decls.find(x => x.name === d.token);
        if (!decl) continue;
        const before = readDeclarationLine(decl.file, decl.line, d.token, target);
        if (before === null) continue;
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
        if (!decl) continue;
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
    }
  }

  return patches;
}
