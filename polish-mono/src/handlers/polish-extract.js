/**
 * Handle polish_extract tool call.
 * Extract tokens from a directory using token-audit's scan.
 * @param {object} params - Tool parameters
 * @param {string} params.target - Directory path to scan
 * @param {string[]} [params.ignore] - Path fragments to skip
 * @param {object} deps - Dependencies
 * @returns {Promise<object>} DeclarationGraph
 */
import { scan } from '../scan.js';

export async function polish_extract(params, deps) {
  const target = params.target;
  if (!target) throw new Error('target is required');

  const ignore = params.ignore || [];
  const graph = scan(target, ignore);

  return {
    version: graph.version,
    root: graph.root,
    target: graph.target,
    files: graph.files,
    themes: graph.themes,
    declarations: graph.declarations,
    references: graph.references,
    conflicts: graph.conflicts,
    dangling: graph.dangling,
    orphans: graph.orphans,
    summary: graph.summary
  };
}
