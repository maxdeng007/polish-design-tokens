/**
 * apply.js — execute mechanical patches with backup protection.
 *
 * Reads patches from diff.js, backs up each file before modifying it,
 * applies before→after replacements on the specified line, and returns
 * a summary of what was applied, what failed, and which backups were made.
 *
 * Safety:
 * - Every patch is pre-validated against the current file contents before
 *   any write happens. Invalid patches (out of range, stale delete, missing
 *   `before`) are rejected up front and excluded from the run.
 * - Each file is backed up once (before the first patch touches it).
 *   Backups are never overwritten by subsequent apply calls.
 * - Patches targeting files outside the target directory are rejected.
 *   The target defaults to `process.cwd()`; pass a different directory to
 *   allow writes elsewhere.
 * - Patches within a file are applied in line-descending order so that
 *   inserts don't shift the line numbers of subsequent patches.
 * - `delete` patches must carry the expected original line text (`before`).
 *   The line is verified against the file before deletion; a mismatch is
 *   refused as stale, so a file changed since the patch was generated can
 *   never lose the wrong line. A delete without `before` is rejected —
 *   blind line-number deletion is never performed.
 * - If any file fails at execution time (I/O error), every file written by
 *   this run is rolled back from its backup and the rollback is reported in
 *   `rolledBack`. The run's backups manifest (`backups`) can be passed to
 *   `rollback()` for a later manual restore.
 * - Files are written atomically (temp file + rename), so a failed write can
 *   never leave a half-written file behind.
 *
 * Failed patches don't abort the batch — they're recorded and the rest
 * proceed.
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

import { rollback } from './rollback.js';

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
 * Validate one patch against the file's current lines (phase 1, read-only).
 * @returns {{error?: string}} empty when the patch may proceed
 */
function validatePatch(patch, lines) {
  if (patch.type === 'add') return {};
  if (patch.type === 'rewrite') {
    if (!patch.before) return { error: 'rewrite patch requires before: the token name to replace' };
    return {};
  }
  const lineIdx = (patch.line || 1) - 1;
  if (lineIdx < 0 || lineIdx >= lines.length) return { error: 'line out of range' };

  if (patch.type === 'delete') {
    if (!patch.before) return { error: 'delete patch requires before: the expected original line text' };
    if (lines[lineIdx].trim() !== String(patch.before).trim()) {
      return { error: 'stale delete: line content does not match expected original text' };
    }
    return {};
  }

  if (patch.type === 'replace') {
    const line = lines[lineIdx];
    if (!patch.before || !line.includes(patch.before)) {
      return { error: `before text "${patch.before}" not found` };
    }
    return {};
  }

  return { error: `unknown patch type: ${patch.type}` };
}

/**
 * Apply a list of patches to files.
 *
 * @param {Array} patches — [{type, file, line, before, after, reason, findingId}]
 * @param {string} [target] — Directory that patches must stay within.
 *   Defaults to `process.cwd()` so the boundary check always applies.
 *   Pass a different directory to allow writes elsewhere.
 * @returns {Promise<{applied: Array, failed: Array, backupCount: number, backups: Array, rolledBack: Array}>}
 */
export async function apply(patches, target = process.cwd()) {
  const applied = [];
  const failed = [];
  const backedUp = new Set();
  let backupCount = 0;
  const backups = [];
  const rolledBack = [];

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

  // Phase 1 — pre-validate every patch against the current file contents.
  // Nothing is written until all patches have been checked.
  const fileStates = [];
  for (const [relFile, filePatches] of byFile) {
    const absFile = path.isAbsolute(relFile) ? relFile : path.resolve(resolvedTarget, relFile);

    if (resolvedTarget) {
      const resolvedFile = realpathSafe(absFile);
      const withinTarget = resolvedFile === resolvedTarget ||
        resolvedFile.startsWith(resolvedTarget + path.sep);
      if (!withinTarget) {
        for (const patch of filePatches) {
          failed.push({ file: absFile, line: patch.line, error: `file path is outside target directory: ${resolvedTarget}` });
        }
        continue;
      }
    }

    let content;
    try {
      content = await fs.readFile(absFile, 'utf8');
    } catch (e) {
      for (const patch of filePatches) {
        failed.push({ file: absFile, line: patch.line, error: `cannot read file: ${e.message}` });
      }
      continue;
    }

    const lines = content.split('\n');
    const valid = [];
    for (const patch of filePatches) {
      const v = validatePatch(patch, lines);
      if (v.error) {
        failed.push({ file: absFile, line: patch.line, error: v.error });
      } else {
        valid.push(patch);
      }
    }
    if (valid.length) {
      fileStates.push({ relFile, absFile, lines, valid });
    }
  }

  // Phase 2 — execute the valid patches. If any file fails at execution
  // time, roll back every file written by this run from its backup.
  const writtenThisRun = [];
  for (const state of fileStates) {
    const { relFile, absFile, valid } = state;
    let { lines } = state;
    try {
      // Back up once per file. If a backup already exists (from a previous
      // apply call), keep it — it holds the original pre-modification content.
      let backupPath = absFile + '.backup';
      if (!backedUp.has(absFile)) {
        try {
          await fs.access(backupPath);
        } catch {
          await fs.copyFile(absFile, backupPath);
          backupCount++;
          backups.push({ file: relFile, backup: backupPath });
        }
        backedUp.add(absFile);
      }

      // Sort by line descending so that `add` patches at higher lines don't
      // shift the line numbers of subsequent patches. End-of-file adds
      // (line === null/0) sort last.
      valid.sort((a, b) => (b.line || 0) - (a.line || 0));

      for (const patch of valid) {
        if (patch.type === 'add') {
          // Insert a new line before the specified line, or append if no line
          const insertIdx = patch.line ? patch.line - 1 : lines.length;
          lines.splice(insertIdx, 0, patch.after);
          applied.push({ file: absFile, line: patch.line || 'end' });
          continue;
        }

        if (patch.type === 'delete') {
          // Execution-time re-verification: validation ran against the
          // original lines, but earlier patches in this run may have shifted
          // content. Refuse if the line no longer holds the expected text.
          const lineIdx = patch.line - 1;
          if (lineIdx < 0 || lineIdx >= lines.length ||
              lines[lineIdx].trim() !== String(patch.before).trim()) {
            throw new Error('line changed at execution time');
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
          const joined = lines.join('\n').replace(re, patch.after);
          lines = joined.split('\n');
          applied.push({ file: absFile, line: 'rewrite' });
          continue;
        }

        const lineIdx = patch.line - 1;
        if (lineIdx < 0 || lineIdx >= lines.length || !lines[lineIdx].includes(patch.before)) {
          throw new Error('line changed at execution time');
        }
        const before = lines[lineIdx];
        const after = before.replace(patch.before, patch.after);
        lines[lineIdx] = after;
        applied.push({ file: absFile, line: patch.line });
      }

      // Write atomically: stage the new content in a temp file next to the
      // target and rename it into place, so a crash mid-write can never leave
      // a half-written file behind.
      const nextContent = lines.join('\n');
      const tmpFile = `${absFile}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      try {
        await fs.writeFile(tmpFile, nextContent, 'utf8');
        await fs.rename(tmpFile, absFile);
      } catch (e) {
        await fs.rm(tmpFile, { force: true }).catch(() => {});
        throw e;
      }
      writtenThisRun.push({ file: absFile, backup: backupPath });
    } catch (e) {
      // Execution-time failure: undo every file this run already wrote.
      if (writtenThisRun.length) {
        const rb = await rollback(writtenThisRun, resolvedTarget);
        rb.restored.forEach(r => rolledBack.push(r));
        rb.failed.forEach(f => failed.push(f));
      }
      failed.push({ file: absFile, error: e.message });
    }
  }

  return { applied, failed, backupCount, backups, rolledBack };
}
