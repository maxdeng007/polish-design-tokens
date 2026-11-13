/**
 * plan.js - Rank and classify findings from cross.js into an ordered action list.
 * 
 * This module is responsible for:
 * 1. Sorting findings by impact using PRIORITY_ORDER
 * 2. Classifying each finding as mechanical or judgmental
 * 3. Generating an executable action queue
 * 
 * @returns {Array} Ordered array of actions [{finding, action, type, priority, mechanical?}]
 */

const PRIORITY_ORDER = [
  ['conflict', 1],
  ['dangling', 2],
  ['runtime-drift', 3],
  ['orphan', 4],
  ['duplicate-value', 5],
  ['namespace', 6],
  ['hardcoded', 7],
  ['cascade-override', 8],
  ['state-variation', 9],
  ['theme-variation', 10],
  ['dynamic-variable', 11]
];

const MECHANICAL_IDS = new Set([
  'hardcoded',
  'duplicate-value',
  'dangling'
]);

const JUDGMENTAL_IDS = new Set([
  'conflict',
  'cascade-override',
  'namespace',
  'runtime-drift',
  'orphan',
  'typography',
  'layout',
  'spacing',
  'colorize',
  'bolder',
  'adapt'
]);

export function plan(findings) {
  const rankMap = new Map(PRIORITY_ORDER);
  
  const sorted = [...findings].sort((a, b) => {
    const ra = rankMap.get(a.id) || 999;
    const rb = rankMap.get(b.id) || 999;
    return ra - rb;
  });

  return sorted.map(f => {
    const mech = MECHANICAL_IDS.has(f.id);
    const judg = JUDGMENTAL_IDS.has(f.id);
    const type = mech ? 'mechanical' : judg ? 'judgmental' : 'unknown';
    
    return {
      finding: f,
      action: f.severity === 'error' ? 'fix' : f.severity === 'warn' ? 'review' : 'note',
      type,
      priority: rankMap.get(f.id) || 999,
      mechanical: mech,
      judgmental: judg
    };
  });
}

export { PRIORITY_ORDER, MECHANICAL_IDS, JUDGMENTAL_IDS };
export default { plan, PRIORITY_ORDER, MECHANICAL_IDS, JUDGMENTAL_IDS };
