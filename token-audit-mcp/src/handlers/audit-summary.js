/**
 * Handle audit_summary tool call.
 * Get quick summary statistics without loading all findings.
 * 
 * @param {object} params - Tool parameters
 * @param {string} params.jobId - Job UUID
 * @param {object} deps - Dependencies
 * @param {object} deps.store - JobStore
 * @returns {Promise<{targets: Array<{}>, summary: {}, created_at: string, duration_seconds?: number, degraded?: string[]}>}
 */
export async function audit_summary(params, deps) {
  const { jobId } = params;
  const job = await deps.store.get(jobId);
  
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  const targetType = job.target.startsWith('http') ? 'url' : 'file';

  return {
    targets: [{ path: job.target, type: targetType, documents: 0 }],
    summary: job.summary || { error: 0, warn: 0, info: 0, total: 0 },
    created_at: job.created_at,
    duration_seconds: job.duration_seconds,
    degraded: job.degraded || []
  };
}
