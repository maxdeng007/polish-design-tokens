import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveCacheDir } from '../utils/cache-dir.js';

/**
 * List all cached jobs with optional filtering.
 * 
 * @param {object} params - Tool parameters
 * @param {number} [params.limit] - Max jobs to return (default: 50)
 * @param {number} [params.older_than_days] - Exclude jobs older than N days
 * @param {'complete'|'failed'|'running'} [params.status] - Filter by status
 * @param {object} deps - Dependencies
 * @param {object} deps.store - JobStore
 * @returns {Promise<{jobs: Array<{}>, total: number}>}
 */
export async function list_jobs(params, deps) {
  const { limit = 50, older_than_days = null, status = null } = params;
  
  const result = await deps.store.list({ limit, older_than_days, status });
  
  // Add file sizes
  const enrichedJobs = await Promise.all(result.jobs.map(async (job) => {
    const cacheDir = deps.cacheDir || resolveCacheDir();
    const jobDir = join(cacheDir, job.jobId);
    
    try {
      const stats = await stat(jobDir);
      job.size_bytes = stats.size || 0;
    } catch {
      job.size_bytes = 0;
    }
    
    return job;
  }));
  
  return {
    jobs: enrichedJobs,
    total: result.total
  };
}
