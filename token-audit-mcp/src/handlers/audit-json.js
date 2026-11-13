import { stat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

/**
 * Handle audit_json tool call.
 * Return path and metadata for JSON artifact.
 * 
 * @param {object} params - Tool parameters
 * @param {string} params.jobId - Job UUID
 * @param {object} deps - Dependencies
 * @param {object} deps.store - JobStore
 * @returns {Promise<{filePath: string, size_bytes: number, checksum_sha256: string}>}
 */
export async function audit_json(params, deps) {
  const { jobId } = params;
  const job = await deps.store.get(jobId);
  
  if (!job || !job.report_json_path) {
    throw new Error(`JSON report not available for job ${jobId}`);
  }

  const stats = await stat(job.report_json_path);
  const content = await readFile(job.report_json_path);
  const checksum = createHash('sha256').update(content).digest('hex');
  
  return {
    filePath: job.report_json_path,
    size_bytes: stats.size,
    checksum_sha256: checksum
  };
}
