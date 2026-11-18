import path from 'path';
import { apply } from '../apply.js';

/**
 * Handle polish_apply tool call.
 * Execute mechanical patches on files with backup protection.
 * @param {object} params - Tool parameters
 * @param {Array} params.patches - Patches from polish_diff
 * @param {string} [params.target] - Target directory to resolve relative file paths
 * @param {object} deps - Dependencies
 * @returns {Promise<object>} Apply report
 */
export async function polish_apply(params, deps) {
  const patches = params.patches || [];
  if (!params.target) {
    const err = new Error('polish_apply requires a target directory to enforce file-path boundaries');
    err.code = 'MISSING_TARGET';
    throw err;
  }
  const target = path.resolve(params.target);

  // Resolve relative file paths to absolute
  for (const p of patches) {
    if (p.file && target && !path.isAbsolute(p.file)) {
      p.file = path.join(target, p.file);
    }
  }

  return await apply(patches, target);
}
