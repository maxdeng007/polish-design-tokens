import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveCacheDir } from '../utils/cache-dir.js';

/**
 * Export tokens as Style Dictionary compatible output.
 * 
 * @param {object} params - Tool parameters
 * @param {string} params.jobId - Job UUID
 * @param {'web'|'ios'|'android'} [params.platform] - Target platform (default: "web")
 * @param {object} deps - Dependencies
 * @param {object} deps.store - JobStore
 * @returns {Promise<{filePath: string, formats: Array<{name: string, path: string}>}>}
 */
export async function export_style_dictionary(params, deps) {
  const { jobId, platform = 'web' } = params;
  const job = await deps.store.get(jobId);
  
  if (!job || !job.declarations) {
    throw new Error(`Job ${jobId} does not contain scan data`);
  }

  // Generate CSS variables manually (since we don't require style-dictionary as dependency)
  const cssContent = `/**
 * Generated Style Dictionary - ${platform}
 * Source: token-audit audit #${jobId}
 */
:root {
${job.declarations
  .filter(d => d.resolved)
  .map(d => `  ${d.name}: ${d.resolved};`)
  .join('\n')}
}

/** TypeScript module */
export const designTokens = {
${job.declarations
  .filter(d => d.resolved)
  .map(d => `  '${d.name.replace(/^--/, '')}': '${d.resolved}'`)
  .join(',\n')}
};
`;

  // Generate platform-specific variants
  let variants = [];
  
  if (platform === 'ios') {
    const swiftContent = `/**
 * Generated Swift Extension - iOS
 * Source: token-audit audit #${jobId}
 */
import SwiftUI

extension UIColor {
${job.declarations
  .filter(d => /color|bg|text|border/.test(d.name))
  .map(d => `  static let ${d.name.replace(/^--/, '').replace(/-[a-z]/g, c => c[1].toUpperCase())} = UIColor(${hexToUIColor(d.resolved || '#ffffff')})`)
  .join('\n')}
}`;
    
    variants.push({ name: 'swift', content: swiftContent });
  } else if (platform === 'android') {
    const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<!--
 * Generated Resources - Android
 * Source: token-audit audit #${jobId}
-->
<resources>
${job.declarations
  .filter(d => /color|bg|text/.test(d.name))
  .map(d => `  <color name="${d.name.replace(/^--/, '').replace(/-/g, '_')}">${rgbToAndroidColor(d.resolved || '#ffffff')}</color>`)
  .join('\n')}
</resources>`;
    
    variants.push({ name: 'colors_xml', content: xmlContent });
  }

  // Write main file
  const outputDir = job._cacheDir || deps.cacheDir || resolveCacheDir();
  const exportsDir = join(outputDir, jobId, 'exports', 'style-dictionary');
  await mkdir(exportsDir, { recursive: true });
  const filePath = join(exportsDir, `${platform}.css`);
  
  await writeFile(filePath, cssContent);

  // Write variants if any
  for (const variant of variants) {
    const variantPath = join(exportsDir, `${platform}.${variant.name}`);
    await writeFile(variantPath, variant.content);
  }

  return {
    filePath,
    formats: [...variants.map(v => ({ name: v.name, path: join(exportsDir, `${platform}.${v.name}`) })), { name: 'css', path: filePath }],
    tokens: job.declarations.filter(d => d.resolved).length
  };
}

// Helper functions
function hexToUIColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return `red: ${r.toFixed(2)}, green: ${g.toFixed(2)}, blue: ${b.toFixed(2)}, alpha: 1.0`;
}

function rgbToAndroidColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `#FF${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
