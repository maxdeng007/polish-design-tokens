/**
 * apply.js — execute mechanical patches with backup protection.
 *
 * Reads patches from diff.js, backs up each file before modifying it,
 * applies before→after replacements on the specified line, and returns
 * a summary of what was applied, what failed, and which backups were made.
 *
 * Safety: each file is backed up once (before the first patch touches it).
 * Failed patches don't abort the batch — they're recorded and the rest
 * proceed.
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Apply a list of patches to files.
 *
 * @param {Array} patches — [{type, file, line, before, after, reason, findingId}]
 * @returns {Promise<{applied: Array, failed: Array, backupCount: number}>}
 */
export async function apply(patches) {
  const applied = [];
  const failed = [];
  const backedUp = new Set();
  let backupCount = 0;

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
    try {
      const content = await fs.readFile(file, 'utf8');
      const lines = content.split('\n');

      // Back up once per file
      if (!backedUp.has(file)) {
        const backupPath = file + '.backup';
        await fs.copyFile(file, backupPath);
        backedUp.add(file);
        backupCount++;
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
