/**
 * apply.js — execute mechanical patches with backup protection.
 *
 * Reads patches from diff.js, backs up each file before modifying it,
 * applies before→after replacements on the specified line, and returns
 * a summary of what was applied, what failed, and which backups were made.
 *
 * Safety:
 * - Each file is backed up once (before the first patch touches it).
 *   Backups are never overwritten by subsequent apply calls.
 * - If a target directory is provided, patches targeting files outside
 *   that directory are rejected.
 * - Patches within a file are applied in line-descending order so that
 *   inserts don't shift the line numbers of subsequent patches.
 *
 * Failed patches don't abort the batch — they're recorded and the rest
 * proceed.
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Apply a list of patches to files.
 *
 * @param {Array} patches — [{type, file, line, before, after, reason, findingId}]
 * @param {string} [target] — If provided, reject patches whose file path
 *   falls outside this directory.
 * @returns {Promise<{applied: Array, failed: Array, backupCount: number}>}
 */
export async function apply(patches, target = null) {
  const applied = [];
  const failed = [];
  const backedUp = new Set();
  let backupCount = 0;

  const resolvedTarget = target ? path.resolve(target) : null;

  // Group patches by file so we can back up once and apply multiple changes
  const byFile = new Map();
  for (const patch of patches) {
    const key = patch.file;
    if (!key) {
      failed.push({ file: null, error: 'patch has no file path' });
      continue;
    }
    if (!byFile.has(key)) byFile.set(key, []);
    byFile.get(key).push(patch);
  }

  for (const [file, filePatches] of byFile) {
    // Boundary check: reject paths outside the target directory
    if (resolvedTarget) {
      const resolvedFile = path.resolve(file);
      const withinTarget = resolvedFile === resolvedTarget ||
        resolvedFile.startsWith(resolvedTarget + path.sep);
      if (!withinTarget) {
        failed.push({ file, error: `file path is outside target directory: ${resolvedTarget}` });
        continue;
      }
    }

    // Sort by line descending so that `add` patches at higher lines don't
    // shift the line numbers of subsequent patches. End-of-file adds
    // (line === null/0) sort last.
    filePatches.sort((a, b) => (b.line || 0) - (a.line || 0));

    try {
      const content = await fs.readFile(file, 'utf8');
      const lines = content.split('\n');

      // Back up once per file. If a backup already exists (from a previous
      // apply call), keep it — it holds the original pre-modification content.
      if (!backedUp.has(file)) {
        const backupPath = file + '.backup';
        try {
          await fs.access(backupPath);
        } catch {
          await fs.copyFile(file, backupPath);
          backupCount++;
        }
        backedUp.add(file);
      }

      for (const patch of filePatches) {
        if (patch.type === 'add') {
          // Insert a new line before the specified line, or append if no line
          const insertIdx = patch.line ? patch.line - 1 : lines.length;
          lines.splice(insertIdx, 0, patch.after);
          applied.push({ file, line: patch.line || 'end' });
          continue;
        }

        const lineIdx = patch.line - 1;
        if (lineIdx < 0 || lineIdx >= lines.length) {
          failed.push({ file, line: patch.line, error: 'line out of range' });
          continue;
        }

        const before = lines[lineIdx];
        if (!before.includes(patch.before)) {
          failed.push({ file, line: patch.line, error: `before text "${patch.before}" not found` });
          continue;
        }

        const after = before.replace(patch.before, patch.after);
        lines[lineIdx] = after;
        applied.push({ file, line: patch.line });
      }

      await fs.writeFile(file, lines.join('\n'), 'utf8');
    } catch (e) {
      failed.push({ file, error: e.message });
    }
  }

  return { applied, failed, backupCount };
}
