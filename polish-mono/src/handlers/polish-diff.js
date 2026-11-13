import path from 'path';
import { generateDiffs } from '../diff.js';

/**
 * Handle polish_diff tool call.
 * Generate mechanical patches for a plan.
 * @param {object} params - Tool parameters
 * @param {Array} params.plan - Plan array from polish_plan
 * @param {string} [params.target] - Target directory to resolve relative file paths
 * @param {object} deps - Dependencies
 * @returns {Promise<{patches: Array, preview: string}>}
 */
export async function polish_diff(params, deps) {
  const planItems = params.plan || [];
  const patches = generateDiffs(planItems);
  const target = params.target ? path.resolve(params.target) : null;

  // Resolve relative file paths to absolute so apply() can find them
  for (const p of patches) {
    if (p.file && target && !path.isAbsolute(p.file)) {
      p.file = path.join(target, p.file);
    }
  }

  const preview = patches.slice(0, 10).map(p =>
    `${p.type}: ${p.reason}`
  ).join('\n');
  return { patches, preview };
}
