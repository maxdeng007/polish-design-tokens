import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveCacheDir } from '../utils/cache-dir.js';

/**
 * Generate shadcn/ui-compatible CSS variable definitions.
 * 
 * @param {object} params - Tool parameters
 * @param {string} params.jobId - Job UUID
 * @param {object} deps - Dependencies
 * @param {object} deps.store - JobStore
 * @returns {Promise<{filePath: string, themeCSS: string, themes: Array<{name: string, cssVars: Map}>>}>}
 */
export async function export_shadcn(params, deps) {
  const { jobId } = params;
  const job = await deps.store.get(jobId);
  
  if (!job || !job.declarations) {
    throw new Error(`Job ${jobId} does not contain scan data`);
  }

  const declarationsMap = new Map();
  for (const decl of job.declarations) {
    if (decl.resolved) {
      declarationsMap.set(decl.name, decl.resolved);
    }
  }

  // Helper to safely get value with fallback
  const getValue = (name, fallback) => {
    return declarationsMap.get(name) || fallback;
  };

  // Generate shadcn-style CSS variables
  const themeCSS = `/**
 * shadcn/ui-compatible theme
 * Source: token-audit audit #${jobId}
 */
:root {
  --background: ${getValue('--bg', '#ffffff')};
  --foreground: ${getValue('--ink', '#2b2620')};
  --card: ${getValue('--card') || getValue('--bg', '#ffffff')};
  --card-foreground: ${getValue('--ink') || '#2b2620'};
  --popover: ${getValue('--card') || '#ffffff'};
  --popover-foreground: ${getValue('--ink') || '#2b2620'};
  --primary: ${getValue('--brand-primary') || getValue('--brand') || '#090504'};
  --primary-foreground: ${getValue('--ink-inverted') || '#faf9f6'};
  --secondary: ${getValue('--muted') || '#f8f7f4'};
  --secondary-foreground: ${getValue('--ink') || '#2b2620'};
  --muted: ${getValue('--muted') || '#f8f7f4'};
  --muted-foreground: ${getValue('--text-2') || '#8b877e'};
  --accent: ${getValue('--accent') || getValue('--brand-primary') || '#f25e00'};
  --accent-foreground: ${getValue('--accent-foreground') || '#faf9f6'};
  --destructive: ${getValue('--error') || getValue('--danger') || '#ef4444'};
  --destructive-foreground: ${getValue('--white') || '#ffffff'};
  --border: ${getValue('--line') || getValue('--border') || '#eae6df'};
  --input: ${getValue('--border') || '#eae6df'};
  --ring: ${getValue('--brand-primary') || getValue('--brand') || '#090504'};
  --radius: ${getValue('--radius-md') || getValue('--border-radius-md') || '0.5rem'};
  --chart-1: ${getValue('--brand-primary') || '#f25e00'};
  --chart-2: ${getValue('--accent') || '#ff6a35'};
  --chart-3: ${getValue('--success') || '#22c55e'};
  --chart-4: ${getValue('--info') || '#3b82f6'};
  --chart-5: ${getValue('--warning') || '#f59e0b'};
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
`;

  const themes = [
    { name: 'light', cssVars: declarationsMap }
  ];

  // Write to file
  const outputDir = job._cacheDir || deps.cacheDir || resolveCacheDir();
  const exportsDir = join(outputDir, jobId, 'exports');
  await mkdir(exportsDir, { recursive: true });
  const outputPath = join(exportsDir, 'shadcn-theme.css');
  
  await writeFile(outputPath, themeCSS);
  
  return {
    filePath: outputPath,
    themeCSS,
    themes,
    note: 'Ensure your project has shadcn/ui components using these CSS variables'
  };
}
