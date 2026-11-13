/**
 * Handle polish_audit tool call.
 * Full critique: scan + cross. Returns findings.
 * @param {object} params - Tool parameters
 * @param {string} params.target - Directory path to scan
 * @param {string[]} [params.ignore] - Path fragments to skip
 * @param {object} [params.observation] - Optional runtime observation (from measure)
 * @param {object} deps - Dependencies
 * @returns {Promise<object>} AuditReport with findings
 */
import { scan } from '../scan.js';
import { cross } from '../cross.js';

export async function polish_audit(params, deps) {
  const target = params.target;
  if (!target) throw new Error('target is required');

  const ignore = params.ignore || [];
  const observation = params.observation || null;

  const graph = scan(target, ignore);
  const report = cross(graph, observation);

  return {
    findings: report.findings || [],
    summary: report.summary || {
      total: (report.findings || []).length,
      errors: (report.findings || []).filter(f => f.severity === 'error').length,
      warnings: (report.findings || []).filter(f => f.severity === 'warn').length,
      info: (report.findings || []).filter(f => f.severity === 'info').length
    },
    graphSummary: graph.summary,
    observation: observation
      ? { documents: observation.documents.length }
      : null
  };
}
