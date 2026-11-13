import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PACKAGE_DIR = resolve(__dirname, '../..');
const PROJECT_ROOT = resolve(PACKAGE_DIR, '..');

/**
 * Locate the token-audit CLI.
 * Order: env override → sibling package → project root → PATH.
 */
function resolveCliPath() {
  const candidates = [
    process.env.TOKEN_AUDIT_CLI,
    join(PROJECT_ROOT, 'token-audit/bin/token-audit.js'),
    join(PROJECT_ROOT, 'bin/token-audit.js'),
    join(PACKAGE_DIR, 'node_modules/token-audit/bin/token-audit.js')
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

/**
 * Runtime measurement only makes sense against a built artefact or a URL.
 * A bare source directory has nothing to render, so we skip it by default.
 */
export function shouldMeasureRuntime(target, options) {
  if (options.runtime === false) return false;
  if (options.runtime === true) return true;
  if (options.targetFile) return true;
  if (/^https?:\/\//i.test(target)) return true;
  return /\.html?$/i.test(target);
}

/**
 * Spawn the token-audit CLI and collect the artifacts it writes.
 *
 * @param {string} target - Path or URL to audit
 * @param {object} options - CLI options (ignore, severity, scan, targetFile, runtime, route, timeout)
 * @param {string} outputDir - Directory the CLI writes artifacts into
 * @returns {Promise<{jobId: string, summary: object, duration: number, report: object, graph: object, observation: object|null, jsonPath: string, htmlPath: string|null}>}
 */
export async function runAudit(target, options = {}, outputDir) {
  const cliPath = resolveCliPath();

  if (!cliPath) {
    throw new Error(
      'token-audit CLI not found. Set TOKEN_AUDIT_CLI to its absolute path.'
    );
  }

  const jsonPath = join(resolve(outputDir), 'report.json');
  const htmlPath = join(resolve(outputDir), 'report.html');

  const args = [
    cliPath,
    target,
    '--json',
    jsonPath,
    '--html',
    htmlPath,
    '--out',
    resolve(outputDir)
  ];

  if (options.scan) {
    args.push('--scan', options.scan);
  }

  if (options.targetFile) {
    args.push('--target-file', options.targetFile);
  }

  if (!shouldMeasureRuntime(target, options)) {
    args.push('--no-runtime');
  }

  // dembrandt classification re-launches its own browser and costs ~2.5 minutes.
  // It is off unless explicitly requested, so an agent call returns in seconds.
  if (options.classification === false) {
    args.push('--no-classification');
  }

  if (options.route) {
    args.push('--route', options.route);
  }

  if (options.timeout) {
    args.push('--timeout', String(options.timeout));
  }

  if (options.ignore && options.ignore.length) {
    args.push('--ignore', options.ignore.join(','));
  }

  if (options.severity) {
    args.push('--severity', options.severity);
  }

  return new Promise((resolve, reject) => {
    // No cwd override: relative targets and output paths must resolve against the
    // MCP server's working directory, which is what the caller meant.
    const proc = spawn(process.execPath, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    const startTime = Date.now();

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn token-audit: ${err.message}`));
    });

    proc.on('close', async (code) => {
      const duration = Date.now() - startTime;

      // The CLI exits 1 when error-level findings exist — that is still a completed audit.
      if (code === 2) {
        reject(new Error(`token-audit failed: ${stderr.trim() || stdout.trim() || `exit code ${code}`}`));
        return;
      }

      if (code !== 0 && code !== 1) {
        reject(new Error(`token-audit exited with code ${code}: ${stderr.trim()}`));
        return;
      }

      let artifact = {};
      try {
        artifact = JSON.parse(await readFile(jsonPath, 'utf8'));
      } catch (e) {
        reject(new Error(`token-audit produced no readable JSON artifact: ${e.message}`));
        return;
      }

      const report = artifact.report || {};
      const graph = artifact.graph || {};
      const observation = artifact.observation || null;
      const bySeverity = (report.summary && report.summary.bySeverity) || {};

      resolve({
        jobId: crypto.createHash('sha256').update(outputDir).digest('hex').slice(0, 32),
        summary: {
          error: bySeverity.error || 0,
          warn: bySeverity.warn || 0,
          info: bySeverity.info || 0,
          total: (report.summary && report.summary.findings) || 0
        },
        duration,
        report,
        graph,
        observation,
        declarations: graph.declarations || [],
        degraded: (observation && observation.degraded) || [],
        jsonPath,
        htmlPath
      });
    });
  });
}
