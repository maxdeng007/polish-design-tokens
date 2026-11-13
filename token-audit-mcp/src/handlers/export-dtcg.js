import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveCacheDir } from '../utils/cache-dir.js';

/**
 * Infer DTCG type from CSS variable name.
 */
function inferDTCGType(varName) {
  const lower = varName.toLowerCase();
  if (/color|bg|text|border|fill/.test(lower)) return 'color';
  if (/space|size|width|height|padding|margin/.test(lower)) return 'dimension';
  if (/font|size|family|weight/.test(lower)) return 'typography';
  if (/radius|rounded/.test(lower)) return 'borderRadius';
  return 'unknown';
}

/**
 * Export tokens in W3C Design Token Community Group (DTCG) format.
 * 
 * @param {object} params - Tool parameters
 * @param {string} params.jobId - Job UUID
 * @param {object} deps - Dependencies
 * @param {object} deps.store - JobStore
 * @returns {Promise<{filePath: string, variables: number, version: string}>}
 */
export async function export_dtcg(params, deps) {
  const { jobId } = params;
  const job = await deps.store.get(jobId);
  
  if (!job || !job.declarations) {
    throw new Error(`Job ${jobId} does not contain scan data`);
  }

  const variables = {
    $extensions: {
      'design-tokens/v1': {
        id: jobId,
        generated: new Date().toISOString()
      }
    }
  };

  for (const decl of job.declarations) {
    if (!decl.resolved) continue;
    
    const dtcgName = '$' + decl.name.replace(/^--/, '');
    const dtcgType = inferDTCGType(decl.name);
    
    variables[dtcgName] = {
      $value: decl.resolved,
      $type: dtcgType,
      ...(decl.description && { $description: decl.description })
    };
  }

  // Write to file
  const outputDir = job._cacheDir || deps.cacheDir || resolveCacheDir();
  const exportsDir = join(outputDir, jobId, 'exports');
  await mkdir(exportsDir, { recursive: true });
  const outputPath = join(exportsDir, 'dtcg.json');
  
  await writeFile(outputPath, JSON.stringify(variables, null, 2));
  
  return {
    filePath: outputPath,
    variables: Object.keys(variables).length - 1, // Exclude $extensions
    version: 'W3C Design Token Community Group v1'
  };
}
