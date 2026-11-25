import path from 'path';
import { rollback } from '../rollback.js';

/**
 * Handle polish_rollback tool call.
 * Restore files from the backups manifest produced by polish_apply.
 * @param {object} params - Tool parameters
 * @param {Array} params.backups - [{file, backup}] entries from an apply result
 * @param {string} [params.target] - Target directory to bound restores
 * @param {object} deps - Dependencies
 * @returns {Promise<object>} Rollback report { restored, failed }
 */
export async function polish_rollback(params, deps) {
  const backups = params.backups || [];
  if (!params.target) {
    const err = new Error('polish_rollback requires a target directory to enforce file-path boundaries');
    err.code = 'MISSING_TARGET';
    throw err;
  }
  const target = path.resolve(params.target);

  // Resolve relative file paths to absolute
  for (const b of backups) {
    if (b.file && target && !path.isAbsolute(b.file)) {
      b.file = path.join(target, b.file);
    }
  }

  return await rollback(backups, target);
}
