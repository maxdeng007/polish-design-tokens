/**
 * polish — Design token superpower tool: extract · critique · apply
 *
 * Public API. Import from 'polish' in your project.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export { plan, PRIORITY_ORDER, MECHANICAL_IDS, JUDGMENTAL_IDS } from './plan.js';
export { generateDiffs } from './diff.js';
export { apply } from './apply.js';

/**
 * Extract tokens from a directory using token-audit's scan.
 * @param {string} target - directory path to scan
 * @param {string[]} [ignore=[]] - path fragments to skip
 * @returns {object} DeclarationGraph
 */
export function extract(target, ignore = []) {
  const { scan } = require('../../token-audit/src/scan.js');
  return scan(target, ignore);
}

/**
 * Full critique: scan + cross. Returns findings.
 * @param {string} target - directory path to scan
 * @param {string[]} [ignore=[]] - path fragments to skip
 * @returns {object} AuditReport with findings array
 */
export function audit(target, ignore = []) {
  const { scan } = require('../../token-audit/src/scan.js');
  const { cross } = require('../../token-audit/src/cross.js');
  const graph = scan(target, ignore);
  return cross(graph);
}

/**
 * Full pipeline: extract → audit → plan → diff.
 * Does NOT apply patches — that requires explicit consent.
 * @param {string} target - directory path to scan
 * @param {string[]} [ignore=[]] - path fragments to skip
 * @returns {{graph: object, findings: Array, plan: Array, patches: Array}}
 */
export function runPipeline(target, ignore = []) {
  const graph = extract(target, ignore);
  const report = audit(target, ignore);
  const { plan: planFn } = require('./plan.js');
  const { generateDiffs } = require('./diff.js');
  const actions = planFn(report.findings || []);
  const patches = generateDiffs(actions);
  return { graph, findings: report.findings, plan: actions, patches };
}
