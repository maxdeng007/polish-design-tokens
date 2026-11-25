/**
 * plan.js - Rank and classify findings from cross.js into an ordered action list.
 *
 * Priority and classification metadata live in the findings.js registry
 * (single source of truth); this module only ranks findings using it.
 *
 * 1. Sorting findings by impact using the registry priority
 * 2. Classifying each finding as mechanical or judgmental (registry)
 * 3. Generating an executable action queue
 *
 * @returns {Array} Ordered array of actions [{finding, action, type, priority, mechanical?}]
 */

import { PRIORITY_ORDER, MECHANICAL_IDS, JUDGMENTAL_IDS, priorityOf, isMechanical, isJudgmental } from './findings.js';

export function plan(findings) {
  const rankMap = new Map(PRIORITY_ORDER);

  const sorted = [...findings].sort((a, b) => {
    const ra = rankMap.get(a.id) || 999;
    const rb = rankMap.get(b.id) || 999;
    return ra - rb;
  });

  return sorted.map(f => {
    const mech = isMechanical(f.id);
    const judg = isJudgmental(f.id);
    const type = mech ? 'mechanical' : judg ? 'judgmental' : 'unknown';

    return {
      finding: f,
      action: f.severity === 'error' ? 'fix' : f.severity === 'warn' ? 'review' : 'note',
      type,
      priority: priorityOf(f.id) || 999,
      mechanical: mech,
      judgmental: judg
    };
  });
}

export { PRIORITY_ORDER, MECHANICAL_IDS, JUDGMENTAL_IDS };
export default { plan, PRIORITY_ORDER, MECHANICAL_IDS, JUDGMENTAL_IDS };
