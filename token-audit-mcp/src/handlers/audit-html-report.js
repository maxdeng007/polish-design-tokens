import { stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Handle audit_html_report tool call.
 * Return path and metadata for HTML report file.
 * 
 * @param {object} params - Tool parameters
 * @param {string} params.jobId - Job UUID
 * @param {object} deps - Dependencies
 * @param {object} deps.store - JobStore
 * @returns {Promise<{filePath: string, size_bytes: number}>}
 */
export async function audit_html_report(params, deps) {
  const { jobId } = params;
  const job = await deps.store.get(jobId);
  
  if (!job || !job.report_html_path) {
    throw new Error(`HTML report not available for job ${jobId}`);
  }

  const stats = await stat(job.report_html_path);
  
  return {
    filePath: job.report_html_path,
    size_bytes: stats.size
  };
}
