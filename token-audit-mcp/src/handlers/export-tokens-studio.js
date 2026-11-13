import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveCacheDir } from '../utils/cache-dir.js';

/**
 * Infer token type from CSS variable name.
 * Color heuristics: bg, color, text, border, fill, shadow
 * Spacing: space, gap, padding, margin, size, width, height
 * Typography: font, text, family, weight, line-height
 * BorderRadius: radius, rounded
 */
function inferType(varName) {
  const lower = varName.toLowerCase();
  
  if (/^(bg|color|text|border|fill|shadow|accent|muted)/.test(lower)) {
    return 'color';
  }
  
  if (/^(space|gap|padding|margin|size|width|height|ruler)/.test(lower)) {
    return 'sizing';
  }
  
  if (/(radius|rounded)/.test(lower)) {
    return 'borderRadius';
  }
  
  if (/(font|family|size|weight|leading|lineHeight)/.test(lower)) {
    return 'typography';
  }
  
  if (/(duration|ease)/.test(lower)) {
    return 'transition';
  }
  
  return 'component'; // Fallback
}

/**
 * Transform declarations to Tokens Studio/Figma format.
 * 
 * @param {object} params - Tool parameters
 * @param {string} params.jobId - Job UUID
 * @param {object} deps - Dependencies
 * @param {object} deps.store - JobStore
 * @returns {Promise<{filePath: string, tokens: object}>}
 */
export async function export_tokens_studio(params, deps) {
  const { jobId } = params;
  const job = await deps.store.get(jobId);
  
  if (!job || !job.declarations) {
    throw new Error(`Job ${jobId} does not contain scan data`);
  }

  const tokens = {};
  const groups = new Map();

  // Group declarations by inferred type
  for (const decl of job.declarations) {
    if (!decl.resolved) continue; // Skip unresolvable aliases
    
    const type = inferType(decl.name);
    const groupName = type === 'color' ? 'color' :
                     type === 'sizing' ? 'spacing' :
                     type === 'typography' ? 'typography' :
                     type === 'borderRadius' ? 'borderRadius' : 'other';
    
    if (!groups.has(groupName)) {
      groups.set(groupName, []);
    }
    
    groups.get(groupName).push({
      name: decl.name.replace(/^--/, '').replace(/-/g, ''),
      value: decl.resolved,
      type,
      description: decl.description || null
    });
  }

  // Build Tokens Studio structure
  for (const [groupName, tokenList] of groups) {
    tokens[groupName] = {};
    
    for (const token of tokenList) {
      const camelCase = token.name.replace(/-(\w)/g, (_, c) => c.toUpperCase());
      tokens[groupName][camelCase] = {
        value: token.value,
        type: token.type,
        ...(token.description && { description: token.description })
      };
    }
  }

  // Write to file
  const outputDir = job._cacheDir || deps.cacheDir || resolveCacheDir();
  const exportsDir = join(outputDir, jobId, 'exports');
  await mkdir(exportsDir, { recursive: true });
  const outputPath = join(exportsDir, 'tokens-studio.json');
  
  await writeFile(outputPath, JSON.stringify(tokens, null, 2));
  
  return {
    filePath: outputPath,
    tokens,
    message: `Exported ${Object.values(tokens).flat().length} tokens to Tokens Studio format`
  };
}
