import { mkdirSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

/**
 * Pick a cache directory that is stable across sessions and writable.
 *
 * The MCP server may be launched with an arbitrary working directory (a GUI app
 * commonly starts it from the filesystem root), so the cache cannot live in the
 * current directory. It has to be somewhere that survives between runs, because
 * job IDs are looked up in it by later tool calls.
 *
 * Order: TOKEN_AUDIT_CACHE → ~/.cache/token-audit → <tmp>/token-audit
 *
 * @param {string} [cwd] - Directory relative paths are resolved against
 * @returns {string} An absolute path to a writable cache directory
 */
export function resolveCacheDir(cwd = process.cwd()) {
  const override = process.env.TOKEN_AUDIT_CACHE;
  if (override) {
    return isAbsolute(override) ? override : resolve(cwd, override);
  }

  const candidates = [
    join(homedir(), '.cache', 'token-audit'),
    join(tmpdir(), 'token-audit')
  ];

  for (const candidate of candidates) {
    if (isWritableDir(candidate)) return candidate;
  }

  // Nothing is writable — let the caller fail with a real error rather than
  // silently writing somewhere unpredictable.
  return candidates[candidates.length - 1];
}

function isWritableDir(dir) {
  try {
    mkdirSync(dir, { recursive: true });
    statSync(dir);
    return true;
  } catch {
    return false;
  }
}
