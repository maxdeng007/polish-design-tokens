import { plan } from '../plan.js';

/**
 * Handle polish_plan tool call.
 * Convert findings into ordered, classified action list.
 * @param {object} params - Tool parameters
 * @param {Array} params.findings - Findings array from cross.js
 * @param {object} deps - Dependencies
 * @returns {Promise<{plan: Array, summary: object}>}
 */
export async function polish_plan(params, deps) {
  const findings = params.findings || [];
  const actions = plan(findings);
  const summary = {
    total: actions.length,
    mechanical: actions.filter(a => a.mechanical).length,
    judgmental: actions.filter(a => a.judgmental).length,
    topPriority: actions.slice(0, 5).map(a => ({
      id: a.finding.id,
      title: a.finding.title,
      priority: a.priority,
      type: a.type
    }))
  };
  return { plan: actions, summary };
}
