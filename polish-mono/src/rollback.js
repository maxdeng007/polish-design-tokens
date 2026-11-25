/**
 * rollback.js — restore files from the backups created by an apply run.
 *
 * `apply()` returns a backups manifest (`{ file, backup }` entries). Pass it
 * here — directly or via the `polish rollback` command / `polish_rollback`
 * MCP tool — to restore every file it lists.
 *
 * Safety:
 * - Only files inside the target directory are restored; other entries are
 *   refused.
 * - Restore is atomic (temp file + rename), so a failed restore never leaves
 *   a half-written file.
 * - A missing backup is reported as failed and the file is left untouched.
 * - Backups themselves are never modified or deleted.
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

function realpathSafe(p) {
  try {
    return fsSync.realpathSync(p);
  } catch {
    const dir = path.dirname(p);
    if (dir === p) return p;
    const parent = realpathSafe(dir);
    return path.join(parent, path.basename(p));
  }
}

/**
 * Restore files from backup entries.
 * @param {Array} entries — [{file, backup}] from an apply() manifest
 * @param {string} [target] — Directory that files must stay within.
 *   Defaults to `process.cwd()`.
 * @returns {Promise<{restored: Array, failed: Array}>}
 */
export async function rollback(entries, target = process.cwd()) {
  const restored = [];
  const failed = [];
  const resolvedTarget = realpathSafe(target);

  for (const entry of entries || []) {
    if (!entry || !entry.file) {
      failed.push({ file: null, error: 'rollback entry has no file path' });
      continue;
    }
    const absFile = path.isAbsolute(entry.file) ? entry.file : path.resolve(resolvedTarget, entry.file);

    if (resolvedTarget) {
      const resolvedFile = realpathSafe(absFile);
      const withinTarget = resolvedFile === resolvedTarget ||
        resolvedFile.startsWith(resolvedTarget + path.sep);
      if (!withinTarget) {
        failed.push({ file: absFile, error: `file path is outside target directory: ${resolvedTarget}` });
        continue;
      }
    }

    const backupPath = entry.backup || absFile + '.backup';
    try {
      await fs.access(backupPath);
    } catch {
      failed.push({ file: absFile, error: `backup not found: ${backupPath}` });
      continue;
    }

    try {
      const content = await fs.readFile(backupPath, 'utf8');
      const tmpFile = `${absFile}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      try {
        await fs.writeFile(tmpFile, content, 'utf8');
        await fs.rename(tmpFile, absFile);
      } catch (e) {
        await fs.rm(tmpFile, { force: true }).catch(() => {});
        throw e;
      }
      restored.push({ file: absFile });
    } catch (e) {
      failed.push({ file: absFile, error: e.message });
    }
  }

  return { restored, failed };
}
