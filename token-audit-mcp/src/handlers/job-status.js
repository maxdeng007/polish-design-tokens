/**
 * Handle job_status tool call.
 * Poll the current status of an asynchronous audit job.
 * 
 * @param {object} params - Tool parameters
 * @param {string} params.jobId - Job UUID
 * @param {object} deps - Dependencies
 * @param {object} deps.store - JobStore
 * @returns {Promise<{status: string, progress: number, step?: string, error?: string, started_at?: string, completed_at?: string}>}
 */
export async function job_status(params, deps) {
  const { jobId } = params;
  const job = await deps.store.get(jobId);
  
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  return {
    status: job.status || 'pending',
    progress: job.progress || (job.status === 'complete' ? 100 : 0),
    step: job.step,
    error: job.error,
    started_at: job.started_at,
    completed_at: job.completed_at
  };
}
