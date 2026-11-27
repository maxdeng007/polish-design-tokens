/**
 * Handle polish_seed tool call.
 * Generate a draft tokens.css and tokens.seed.json from literal clusters.
 * @param {object} params - { target: string (required), output?: string, force?: boolean }
 * @param {object} deps - Dependencies
 * @returns {Promise<object>} SeedResult
 */
import { seed } from '../seed.js';

export async function polish_seed(params, deps) {
  try {
    const target = params.target;
    if (!target) throw new Error('target is required');

    const result = seed(target, { output: params.output, force: !!params.force });

    return {
      target: result.target,
      output: result.output,
      tokensCss: result.tokensCss,
      seedFile: result.seedFile,
      outputFiles: result.outputFiles,
      tokenCount: result.tokenCount,
      clusterCount: result.clusterCount
    };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: err.message || String(err) }]
    };
  }
}
