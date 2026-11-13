#!/usr/bin/env node
/**
 * Generate the examples/noah-sample/ deliverable using the real MCP pipeline.
 * Runs audit_run, waits for completion, then invokes every export handler.
 */
import { JobStore } from '../src/cache/index.js';
import { audit_run } from '../src/handlers/audit-run.js';
import { export_tokens_studio } from '../src/handlers/export-tokens-studio.js';
import { export_style_dictionary } from '../src/handlers/export-style-dictionary.js';
import { export_dtcg } from '../src/handlers/export-dtcg.js';
import { export_tailwind } from '../src/handlers/export-tailwind.js';
import { export_shadcn } from '../src/handlers/export-shadcn.js';
import { audit_recommendations } from '../src/handlers/audit-recommendations.js';

const ROOT = process.cwd();
const TARGET = process.argv[2] || `${ROOT}/src/pages`;
const OUT = process.argv[3] || `${ROOT}/examples/noah-sample`;
const CACHE = `${OUT}/.job-cache`;

const store = new JobStore(CACHE);
const deps = { store, cacheDir: CACHE };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForJob(jobId) {
  for (let i = 0; i < 60; i++) {
    const job = await store.get(jobId);
    if (job?.status === 'complete') return job;
    if (job?.status === 'failed') throw new Error(job.error || 'audit failed');
    await sleep(500);
  }
  throw new Error('timeout waiting for audit');
}

const result = await audit_run({ target: TARGET, ignore: ['node_modules'], runtime: false }, deps);
console.log('audit started:', result.jobId);
const job = await waitForJob(result.jobId);
console.log('audit complete:', job.summary);

const exports = await Promise.allSettled([
  export_tokens_studio({ jobId: result.jobId }, deps),
  export_style_dictionary({ jobId: result.jobId }, deps),
  export_dtcg({ jobId: result.jobId }, deps),
  export_tailwind({ jobId: result.jobId }, deps),
  export_shadcn({ jobId: result.jobId }, deps)
]);

for (const [i, label] of [
  ['tokens-studio', 'export_tokens_studio'],
  ['style-dictionary', 'export_style_dictionary'],
  ['dtcg', 'export_dtcg'],
  ['tailwind', 'export_tailwind'],
  ['shadcn', 'export_shadcn']
].entries()) {
  const r = exports[i];
  if (r.status === 'fulfilled') console.log('OK  ', label, '->', r.value.filePath || JSON.stringify(r.value).slice(0, 80));
  else console.log('FAIL', label, '->', r.reason?.message);
}

const rec = await audit_recommendations({ jobId: result.jobId }, deps);
console.log('recommendations:', rec.total ?? rec.recommendations?.length ?? 0);
