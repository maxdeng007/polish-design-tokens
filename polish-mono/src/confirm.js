/**
 * confirm.js — resolve designer decisions into patches.
 *
 * Turns human-confirmed judgmental decisions (delete / alias / rename)
 * into the same patch shape diff.js produces, so they flow through
 * apply() with backup protection. The designer decides *what*; this
 * module figures out *where* by looking up token locations in the
 * DeclarationGraph from scan().
 */

/**
 * Resolve decisions into patches.
 *
 * @param {Array} decisions — [{action, token|from, to}]
 * @param {DeclarationGraph} graph — output of scan()
 * @returns {Array} patches: [{type, file, line, before, after, reason, findingId}]
 */
export function confirm(decisions, graph) {
  const patches = [];
  const decls = graph.declarations || [];
  const refs = graph.references || [];

  for (const d of decisions) {
    switch (d.action) {
      case 'delete': {
        const decl = decls.find(x => x.name === d.token);
        if (!decl) continue;
        patches.push({
          type: 'delete',
          file: decl.file,
          line: decl.line,
          before: '',
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
