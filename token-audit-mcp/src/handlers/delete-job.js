import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveCacheDir } from '../utils/cache-dir.js';

/**
 * Permanently remove a job and all its artifacts.
 * 
 * @param {object} params - Tool parameters
 * @param {string} params.jobId - Job UUID
 * @param {object} deps - Dependencies
 * @param {object} deps.store - JobStore
 * @returns {Promise<{deleted: boolean, freed_bytes: number, artifacts_removed: string[]}>}
 */
export async function delete_job(params, deps) {
  const { jobId } = params;
  
  const cacheDir = deps.cacheDir || resolveCacheDir();
  const result = await deps.store.delete(jobId);
  
  if (!result.deleted) {
    throw new Error(`Job ${jobId} not found`);
  }
  
  return {
    deleted: true,
    freed_bytes: result.freed_bytes,
    artifacts_removed: [
      join(cacheDir, jobId, 'meta.json'),
      join(cacheDir, jobId, 'report.json'),
      join(cacheDir, jobId, 'declarations.json'),
      join(cacheDir, jobId, 'exports')
    ]
  };
}
