import { generateJobId } from '../utils/job-id.js';
import { runAudit, shouldMeasureRuntime } from '../utils/spawn-audit.js';
import { resolveCacheDir } from '../utils/cache-dir.js';

/**
 * Handle audit_run tool call.
 * Triggers async audit, returns jobId immediately.
 *
 * @param {object} params - Tool parameters
 * @param {string} params.target - Path or URL to audit
 * @param {string} [params.scan] - Source directory for the static scan (defaults to target)
 * @param {string} [params.targetFile] - Built artefact to measure at runtime
 * @param {boolean} [params.runtime] - Force runtime measurement on/off (auto when omitted)
 * @param {string} [params.route] - Hash route to load during runtime measurement
 * @param {number} [params.timeout] - Per-load timeout in ms
 * @param {string[]} [params.ignore] - Patterns to exclude
 * @param {'error'|'warn'|'info'} [params.severity] - Minimum severity filter
 * @param {boolean} [params.classification] - Ask dembrandt for classification (default true; costs ~2.5 min)
 * @param {object} deps - Dependencies (injected for testing)
 * @param {any} deps.store - JobStore instance
 * @param {any} deps.spawn - runAudit function
 * @returns {Promise<{jobId: string, status: 'running'}>}
 */
export async function audit_run(params, deps) {
  const { target, scan, targetFile, runtime, route, timeout, ignore, severity } = params;
  const classification = params.classification !== false;

  const jobId = generateJobId(target, ignore || []);
  const cacheDir = deps.cacheDir || resolveCacheDir();
  const jobDir = `${cacheDir}/${jobId}`;
  // The CLI writes here; the store owns jobDir/meta.json, report.json and declarations.json.
  const artifactsDir = `${jobDir}/artifacts`;

  await deps.store.set(jobId, {
    target,
    scanTarget: scan || target,
    runtimeTarget: targetFile || target,
    ignorePatterns: ignore || [],
    severity: severity || 'error',
    status: 'running',
    created_at: new Date().toISOString(),
    started_at: new Date().toISOString()
  });

  // Trigger audit in background (fire and forget)
  runAudit(target, { scan, targetFile, runtime, route, timeout, ignore, severity, classification }, artifactsDir)
    .then(async (result) => {
      const existing = (await deps.store.get(jobId)) || {};
      await deps.store.set(jobId, {
        ...existing,
        status: 'complete',
        summary: result.summary,
        completed_at: new Date().toISOString(),
        duration_seconds: Math.round(result.duration / 1000),
        report: result.report,
        declarations: result.declarations,
        degraded: result.degraded,
        report_json_path: result.jsonPath,
        report_html_path: result.htmlPath,
        _cacheDir: cacheDir
      });
    })
    .catch(async (err) => {
      const existing = (await deps.store.get(jobId)) || {};
      await deps.store.set(jobId, {
        ...existing,
        status: 'failed',
        error: err.message,
        completed_at: new Date().toISOString()
      });
    });

  // Runtime measurement needs a browser launch (~5-13s); dembrandt classification
  // launches its own browser again and costs ~2.5 minutes. It is on by default;
  // pass classification: false to skip.
  const willMeasure = shouldMeasureRuntime(target, { runtime, targetFile });

  return {
    jobId,
    status: 'running',
    estimated_seconds: classification ? 180 : willMeasure ? 15 : 2
  };
}
