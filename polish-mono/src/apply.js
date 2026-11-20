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
 * - Patches targeting files outside the target directory are rejected.
 *   The target defaults to `process.cwd()`; pass a different directory to
 *   allow writes elsewhere.
 * - Patches within a file are applied in line-descending order so that
 *   inserts don't shift the line numbers of subsequent patches.
 *
 * Failed patches don't abort the batch — they're recorded and the rest
 * proceed.
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

/**
 * Resolve a path to its physical (symlink-resolved) form. If the path
 * doesn't exist, resolve its nearest existing parent directory and
 * re-append the remaining path components.
 */
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

/** Escape regex metacharacters in a literal string. */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Apply a list of patches to files.
 *
 * @param {Array} patches — [{type, file, line, before, after, reason, findingId}]
 * @param {string} [target] — Directory that patches must stay within.
 *   Defaults to `process.cwd()` so the boundary check always applies.
 *   Pass a different directory to allow writes elsewhere.
 * @returns {Promise<{applied: Array, failed: Array, backupCount: number}>}
 */
export async function apply(patches, target = process.cwd()) {
  const applied = [];
  const failed = [];
  const backedUp = new Set();
  let backupCount = 0;

  const resolvedTarget = realpathSafe(target);

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
    // Patches from diff.js carry file paths relative to the scan target.
    // Resolve them against the target so reads, writes, backups, and the
    // boundary check all operate on the correct location.
    const absFile = path.isAbsolute(file) ? file : path.resolve(resolvedTarget, file);

    // Boundary check: reject paths outside the target directory
    if (resolvedTarget) {
      const resolvedFile = realpathSafe(absFile);
      const withinTarget = resolvedFile === resolvedTarget ||
        resolvedFile.startsWith(resolvedTarget + path.sep);
      if (!withinTarget) {
        failed.push({ file: absFile, error: `file path is outside target directory: ${resolvedTarget}` });
        continue;
      }
    }

    // Sort by line descending so that `add` patches at higher lines don't
    // shift the line numbers of subsequent patches. End-of-file adds
    // (line === null/0) sort last.
    filePatches.sort((a, b) => (b.line || 0) - (a.line || 0));

    try {
      const content = await fs.readFile(absFile, 'utf8');
      let lines = content.split('\n');

      // Back up once per file. If a backup already exists (from a previous
      // apply call), keep it — it holds the original pre-modification content.
      if (!backedUp.has(absFile)) {
        const backupPath = absFile + '.backup';
        try {
          await fs.access(backupPath);
        } catch {
          await fs.copyFile(absFile, backupPath);
          backupCount++;
        }
        backedUp.add(absFile);
      }

      for (const patch of filePatches) {
        if (patch.type === 'add') {
          // Insert a new line before the specified line, or append if no line
          const insertIdx = patch.line ? patch.line - 1 : lines.length;
          lines.splice(insertIdx, 0, patch.after);
          applied.push({ file: absFile, line: patch.line || 'end' });
          continue;
        }

        if (patch.type === 'delete') {
          const lineIdx = patch.line - 1;
          if (lineIdx < 0 || lineIdx >= lines.length) {
            failed.push({ file: absFile, line: patch.line, error: 'line out of range' });
            continue;
          }
          lines.splice(lineIdx, 1);
          applied.push({ file: absFile, line: patch.line });
          continue;
        }

        if (patch.type === 'rewrite') {
          // File-level token rename: replace every whole-token occurrence of
          // `before` with `after`. The negative lookahead prevents matching
          // `--bg` inside `--bg-hover` or `--background`.
          const re = new RegExp(escapeRegex(patch.before) + '(?![\\w-])', 'g');
          lines = lines.join('\n').replace(re, patch.after).split('\n');
          applied.push({ file: absFile, line: 'rewrite' });
          continue;
        }

        const lineIdx = patch.line - 1;
        if (lineIdx < 0 || lineIdx >= lines.length) {
          failed.push({ file: absFile, line: patch.line, error: 'line out of range' });
          continue;
        }

        const before = lines[lineIdx];
        if (!before.includes(patch.before)) {
          failed.push({ file: absFile, line: patch.line, error: `before text "${patch.before}" not found` });
          continue;
        }

        const after = before.replace(patch.before, patch.after);
        lines[lineIdx] = after;
        applied.push({ file: absFile, line: patch.line });
      }

      await fs.writeFile(absFile, lines.join('\n'), 'utf8');
    } catch (e) {
      failed.push({ file: absFile, error: e.message });
    }
  }

  return { applied, failed, backupCount };
}
