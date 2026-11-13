/**
 * polish — Design token superpower tool: extract · critique · apply
 *
 * Public API. Import from '@design-tokens/polish' in your project.
 */

import { scan } from './scan.js';
import { cross } from './cross.js';
import { measure } from './measure.js';
import { plan, PRIORITY_ORDER, MECHANICAL_IDS, JUDGMENTAL_IDS } from './plan.js';
import { generateDiffs } from './diff.js';
import { apply } from './apply.js';

export { plan, PRIORITY_ORDER, MECHANICAL_IDS, JUDGMENTAL_IDS, generateDiffs, apply, measure };

/**
 * Extract tokens from a directory.
 * @param {string} target - directory path to scan
 * @param {string[]} [ignore=[]] - path fragments to skip
 * @returns {object} DeclarationGraph
 */
export function extract(target, ignore = []) {
  return scan(target, ignore);
}

/**
 * Full critique: scan + cross. Returns findings.
 * @param {string} target - directory path to scan
 * @param {string[]} [ignore=[]] - path fragments to skip
 * @param {object} [observation] - optional RuntimeObservation from measure()
 * @returns {object} AuditReport with findings array
 */
export function audit(target, ignore = [], observation = null) {
  const graph = scan(target, ignore);
  return cross(graph, observation);
}

/**
 * Full pipeline: extract → audit → plan → diff.
 * Does NOT apply patches — that requires explicit consent.
 * @param {string} target - directory path to scan
 * @param {string[]} [ignore=[]] - path fragments to skip
 * @param {object} [observation] - optional RuntimeObservation from measure()
 * @returns {{graph: object, findings: Array, plan: Array, patches: Array}}
 */
export function runPipeline(target, ignore = [], observation = null) {
  const graph = scan(target, ignore);
  const report = cross(graph, observation);
  const actions = plan(report.findings || []);
  const patches = generateDiffs(actions);
  return { graph, findings: report.findings, plan: actions, patches };
}
