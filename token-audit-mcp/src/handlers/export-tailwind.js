import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveCacheDir } from '../utils/cache-dir.js';

/**
 * Generate Tailwind CSS configuration file with design tokens.
 * 
 * @param {object} params - Tool parameters
 * @param {string} params.jobId - Job UUID
 * @param {string} [params.themePrefix] - Prefix for custom theme keys (default: "")
 * @param {object} deps - Dependencies
 * @param {object} deps.store - JobStore
 * @returns {Promise<{filePath: string, config: object, prefix: string}>}
 */
export async function export_tailwind(params, deps) {
  const { jobId, themePrefix = '' } = params;
  const job = await deps.store.get(jobId);
  
  if (!job || !job.declarations) {
    throw new Error(`Job ${jobId} does not contain scan data`);
  }

  const colors = {};
  const spacing = {};
  const borderRadius = {};
  
  for (const decl of job.declarations) {
    if (!decl.resolved) continue;
    
    const name = decl.name.replace(/^--/, '').replace(/-/g, '');
    const key = themePrefix ? `${themePrefix}${name.charAt(0).toUpperCase() + name.slice(1)}` : name;
    
    if (/color|bg|text|border|fill/.test(decl.name)) {
      colors[key] = decl.resolved;
    } else if (/space|padding|margin|gap/.test(decl.name)) {
      spacing[key] = decl.resolved;
    } else if (/radius|rounded/.test(decl.name)) {
      borderRadius[key] = decl.resolved;
    }
  }

  const config = {
    theme: {
      extend: {}
    }
  };

  if (Object.keys(colors).length > 0) {
    config.theme.extend.colors = colors;
  }
  if (Object.keys(spacing).length > 0) {
    config.theme.extend.spacing = spacing;
  }
  if (Object.keys(borderRadius).length > 0) {
    config.theme.extend.borderRadius = borderRadius;
  }

  // Write to file
  const outputDir = job._cacheDir || deps.cacheDir || resolveCacheDir();
  const exportsDir = join(outputDir, jobId, 'exports');
  await mkdir(exportsDir, { recursive: true });
  const outputPath = join(exportsDir, 'tailwind.config.js');
  
  await writeFile(outputPath, `module.exports = ${JSON.stringify(config, null, 2)};\n`);
  
  return {
    filePath: outputPath,
    config,
    prefix: themePrefix
  };
}
