/**
 * Handle audit_findings tool call.
 * Query findings with optional filtering.
 * 
 * @param {object} params - Tool parameters
 * @param {string} params.jobId - Job UUID
 * @param {'error'|'warn'|'info'} [params.severity] - Filter by severity
 * @param {string[]} [params.types] - Filter by finding ID
 * @param {object} deps - Dependencies
 * @param {object} deps.store - JobStore
 * @returns {Promise<{findings: Array<{}, total: number}>}
 */
export async function audit_findings(params, deps) {
  const { jobId, severity, types } = params;
  
  const jobMeta = await deps.store.get(jobId);
  
  if (!jobMeta || !jobMeta.report) {
    throw new Error(`Job ${jobId} not found or incomplete`);
  }

  let allFindings = jobMeta.report.findings || [];

  let filtered = [...allFindings];

  if (severity) {
    filtered = filtered.filter(f => f.severity === severity);
  }

  if (types && types.length) {
    filtered = filtered.filter(f => types.includes(f.id));
  }

  // Sort by severity (error > warn > info), then alphabetically
  const severityRank = { error: 0, warn: 1, info: 2 };
  filtered.sort((a, b) => {
    if (severityRank[a.severity] !== severityRank[b.severity]) {
      return severityRank[a.severity] - severityRank[b.severity];
    }
    return a.id.localeCompare(b.id);
  });

  return {
    findings: filtered.map(f => ({
      id: f.id,
      title: f.title,
      detail: f.detail,
      severity: f.severity,
      evidence: f.evidence || [],
      suggestion: f.suggestion,
      targets: f.targets || []
    })),
    total: allFindings.length
  };
}
