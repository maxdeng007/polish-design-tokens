/**
 * Handle polish_audit tool call.
 * Full critique: scan + cross. Returns findings.
 * @param {object} params - Tool parameters
 * @param {string} params.target - Directory path to scan
 * @param {string[]} [params.ignore] - Path fragments to skip
 * @param {object} deps - Dependencies
 * @returns {Promise<object>} AuditReport with findings
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export async function polish_audit(params, deps) {
  const target = params.target;
  if (!target) throw new Error('target is required');

  const { scan } = require('../../../token-audit/src/scan.js');
  const { cross } = require('../../../token-audit/src/cross.js');
  const ignore = params.ignore || [];

  const graph = scan(target, ignore);
  const report = cross(graph);

  return {
    findings: report.findings || [],
    summary: report.summary || {
      total: (report.findings || []).length,
      errors: (report.findings || []).filter(f => f.severity === 'error').length,
      warnings: (report.findings || []).filter(f => f.severity === 'warn').length,
      info: (report.findings || []).filter(f => f.severity === 'info').length
    },
    graphSummary: graph.summary
  };
}
