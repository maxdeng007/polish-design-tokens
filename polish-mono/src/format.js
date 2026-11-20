/**
 * Human-readable formatting for CLI output.
 * Used by the --summary flag to print plain-language summaries
 * instead of raw JSON, making polish usable by non-technical users.
 *
 * When stdout is a TTY, findings are color-coded by severity for
 * at-a-glance readability. When output is piped or redirected,
 * colors are automatically disabled.
 */

const MECHANICAL_IDS = new Set(['duplicate-value']);

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

/** Returns true when stdout is a TTY (interactive terminal). */
function useColor() {
  return !!(process.stdout && process.stdout.isTTY);
}

/** Wrap text in a color code if colors are enabled, otherwise return plain text. */
function c(code, text) {
  return useColor() ? code + text + ANSI.reset : text;
}

/** Color a text by severity: error → red, warn → yellow, info → green. */
function cSeverity(severity, text) {
  if (severity === 'error') return c(ANSI.red, text);
  if (severity === 'warn') return c(ANSI.yellow, text);
  return c(ANSI.green, text);
}

function countByType(findings) {
  const byType = {};
  for (const f of findings) {
    if (!byType[f.id]) byType[f.id] = { count: 0, title: f.title, severity: f.severity };
    byType[f.id].count++;
  }
  return byType;
}

/** Format an audit report (output of cross()) as a plain-language summary. */
export function formatAudit(report) {
  const lines = [];
  lines.push(c(ANSI.bold, 'Token Audit Summary'));
  lines.push(ANSI.bold ? '====================' : '====================');
  lines.push('');

  if (report.target && report.target.value) {
    lines.push(`Target: ${report.target.value}`);
  }

  const s = report.summary || {};
  const tokenInfo = [];
  if (s.declarations !== undefined) tokenInfo.push(`${s.declarations} declarations`);
  if (s.uniqueTokens !== undefined) tokenInfo.push(`${s.uniqueTokens} unique tokens`);
  if (tokenInfo.length) lines.push(`Tokens: ${tokenInfo.join(', ')}`);

  lines.push('');

  const findings = report.findings || [];
  if (findings.length === 0) {
    lines.push(c(ANSI.green, 'No issues found. Your tokens look clean.'));
    return lines.join('\n');
  }

  lines.push(`Found ${findings.length} issue${findings.length === 1 ? '' : 's'}:`);
  lines.push('');

  const byType = countByType(findings);
  for (const [type, info] of Object.entries(byType)) {
    const label = MECHANICAL_IDS.has(type) ? c(ANSI.green, '[Mechanical]') : c(ANSI.yellow, '[Judgmental]');
    const typeName = cSeverity(info.severity, type);
    lines.push(`  ${label} ${info.count} ${typeName}`);
  }

  lines.push('');

  const mechCount = findings.filter(f => MECHANICAL_IDS.has(f.id)).length;
  if (mechCount > 0) {
    lines.push(c(ANSI.green, `${mechCount} can be auto-fixed.`));
    lines.push('');
    lines.push('Next steps:');
    lines.push('  polish plan findings.json > plan.json');
    lines.push('  polish diff plan.json > patches.json');
    lines.push('  polish apply patches.json');
  } else {
    lines.push(c(ANSI.yellow, 'No mechanical fixes available — all findings need your decision.'));
  }

  return lines.join('\n');
}

/** Format a plan action array (output of plan()) as a plain-language summary. */
export function formatPlan(actions) {
  const lines = [];
  lines.push(c(ANSI.bold, 'Action Plan'));
  lines.push('===========');
  lines.push('');

  if (!actions || actions.length === 0) {
    lines.push(c(ANSI.green, 'No actions needed. No findings to process.'));
    return lines.join('\n');
  }

  lines.push(`${actions.length} actions ranked by priority:`);
  lines.push('');

  for (const item of actions) {
    const f = item.finding || {};
    const label = item.mechanical
      ? c(ANSI.green, 'mechanical')
      : item.judgmental ? c(ANSI.yellow, 'judgmental') : 'unknown';
    const id = cSeverity(f.severity, f.id || 'unknown');
    lines.push(`  ${item.priority}. ${id} (${label}) — ${f.title || 'no title'}`);
  }

  lines.push('');

  const mech = actions.filter(a => a.mechanical).length;
  const judg = actions.filter(a => a.judgmental).length;
  lines.push(`${c(ANSI.green, 'Mechanical:')} ${mech} (auto-fixable via polish diff + polish apply)`);
  lines.push(`${c(ANSI.yellow, 'Judgmental:')} ${judg} (needs your decision)`);

  return lines.join('\n');
}

/** Format a patch array (output of generateDiffs()) as a plain-language summary. */
export function formatDiff(patches) {
  const lines = [];
  lines.push(c(ANSI.bold, 'Patches Generated'));
  lines.push('================');
  lines.push('');

  if (!patches || patches.length === 0) {
    lines.push(c(ANSI.yellow, 'No mechanical patches to apply. All findings are judgmental.'));
    return lines.join('\n');
  }

  lines.push(`${c(ANSI.green, patches.length)} mechanical patches ready:`);
  lines.push('');

  for (const p of patches) {
    const file = p.file || '?';
    const line = p.line || '?';
    const change = p.before && p.after ? `${p.before} → ${p.after}` : (p.reason || '');
    lines.push(`  ${c(ANSI.cyan, `[${p.type}]`)} ${file}:${line} — ${change}`);
  }

  lines.push('');
  lines.push(c(ANSI.cyan, 'Run `polish apply patches.json` to apply with backup.'));

  return lines.join('\n');
}

/** Format an apply result (output of apply()) as a plain-language summary. */
export function formatApply(result) {
  const lines = [];
  lines.push(c(ANSI.bold, 'Apply Results'));
  lines.push('=============');
  lines.push('');

  const applied = (result.applied || []).length;
  const failed = (result.failed || []).length;
  const backups = result.backupCount || 0;

  lines.push(`${c(ANSI.green, 'Applied:')}  ${applied} patches`);
  lines.push(`${failed > 0 ? c(ANSI.red, 'Failed:') : 'Failed:'}   ${failed} patches`);
  lines.push(`${c(ANSI.blue, 'Backups:')}  ${backups} files`);
  lines.push('');

  if (failed === 0) {
    lines.push(c(ANSI.green, 'All patches applied successfully.'));
  } else {
    lines.push(c(ANSI.red, 'Some patches failed. Review the errors below:'));
    lines.push('');
    for (const f of result.failed) {
      const file = f.file || '?';
      lines.push(`  ${c(ANSI.red, file)}: ${f.error}`);
    }
  }

  return lines.join('\n');
}

/** Format a doctor report (output of polish_doctor()) as a plain-language summary. */
export function formatDoctor(report) {
  const lines = [];
  lines.push(c(ANSI.bold, 'Dependency Check'));
  lines.push('================');
  lines.push('');

  const deps = report.dependencies || [];
  for (const d of deps) {
    let status;
    if (d.installAttempted) {
      status = d.installResult === 'success' || d.installed
        ? c(ANSI.green, '[INSTALLED]')
        : c(ANSI.red, '[FAILED]  ');
    } else if (d.installed) {
      status = c(ANSI.green, '[OK]      ');
    } else {
      status = c(ANSI.yellow, '[MISSING] ');
    }
    lines.push(`  ${status} ${d.name}`);
  }

  lines.push('');

  const missing = deps.filter(d => !d.installed).length;
  if (missing > 0) {
    lines.push(`${c(ANSI.yellow, missing)} optional skill/tool not installed.`);
    lines.push(c(ANSI.cyan, 'Run `polish doctor --install` to install missing skills.'));
  } else {
    lines.push(c(ANSI.green, 'All dependencies are installed.'));
  }

  return lines.join('\n');
}

/** Count findings by severity. */
function countSeverity(findings) {
  const counts = { error: 0, warn: 0, info: 0 };
  for (const f of findings) {
    if (counts[f.severity] !== undefined) counts[f.severity]++;
  }
  return counts;
}

/** Format a health check report as a concise verdict for `polish check`. */
export function formatCheck(report) {
  const lines = [];
  lines.push(c(ANSI.bold, 'Token Health Check'));
  lines.push('==================');
  lines.push('');

  const s = report.summary || {};
  const tokenInfo = [];
  if (s.declarations !== undefined) tokenInfo.push(`${s.declarations} declarations`);
  if (s.uniqueTokens !== undefined) tokenInfo.push(`${s.uniqueTokens} unique tokens`);
  if (tokenInfo.length) lines.push(`Tokens: ${tokenInfo.join(', ')}`);

  const findings = report.findings || [];
  if (findings.length === 0) {
    lines.push('');
    lines.push(c(ANSI.green, 'No issues found. Your tokens are healthy.'));
    return lines.join('\n');
  }

  lines.push('');
  lines.push(`Found ${findings.length} issue${findings.length === 1 ? '' : 's'}:`);
  lines.push('');

  const byType = countByType(findings);
  for (const [type, info] of Object.entries(byType)) {
    const typeName = cSeverity(info.severity, type);
    lines.push(`  ${info.count} ${typeName}`);
  }

  lines.push('');

  const sev = countSeverity(findings);
  if (sev.error > 0) {
    lines.push(c(ANSI.red, `Health: ${sev.error} error${sev.error === 1 ? '' : 's'} need attention.`));
    lines.push('');
    lines.push(c(ANSI.cyan, 'Run `polish fix <target>` to auto-resolve mechanical issues.'));
  } else if (sev.warn > 0) {
    lines.push(c(ANSI.yellow, `Health: ${sev.warn} warning${sev.warn === 1 ? '' : 's'} — no errors, but review recommended.`));
    lines.push('');
    lines.push(c(ANSI.cyan, 'Run `polish fix <target>` to auto-resolve mechanical issues.'));
  } else {
    lines.push(c(ANSI.green, 'Health: clean — informational findings only.'));
  }

  return lines.join('\n');
}

/** Format a fix result (audit + apply summary + remaining judgmental) for `polish fix`. */
export function formatFix(report, result) {
  const lines = [];
  lines.push(c(ANSI.bold, 'Token Fix'));
  lines.push('==========');
  lines.push('');

  const s = report.summary || {};
  const tokenInfo = [];
  if (s.declarations !== undefined) tokenInfo.push(`${s.declarations} declarations`);
  if (s.uniqueTokens !== undefined) tokenInfo.push(`${s.uniqueTokens} unique tokens`);
  if (tokenInfo.length) lines.push(`Tokens: ${tokenInfo.join(', ')}`);

  const findings = report.findings || [];
  if (findings.length === 0) {
    lines.push('');
    lines.push(c(ANSI.green, 'No issues found. Your tokens are healthy.'));
    return lines.join('\n');
  }

  const byType = countByType(findings);
  const typeSummary = Object.entries(byType)
    .map(([type, info]) => `${info.count} ${type}`)
    .join(', ');
  lines.push(`Found ${findings.length} issue${findings.length === 1 ? '' : 's'}: ${typeSummary}`);
  lines.push('');

  const mechanicalCount = findings.filter(f => MECHANICAL_IDS.has(f.id)).length;
  if (mechanicalCount > 0) {
    lines.push(`Applying ${mechanicalCount} mechanical patch${mechanicalCount === 1 ? '' : 'es'}...`);
    lines.push('');

    const applied = (result.applied || []).length;
    const failed = (result.failed || []).length;
    const backups = result.backupCount || 0;
    lines.push(`  ${c(ANSI.green, `Applied: ${applied}`)}  ${failed > 0 ? c(ANSI.red, `Failed: ${failed}`) : `Failed: ${failed}`}  ${c(ANSI.blue, `Backups: ${backups}`)}`);
    if (failed === 0) {
      lines.push(c(ANSI.green, '  All patches applied successfully.'));
    } else {
      for (const f of result.failed) {
        const file = f.file || '?';
        lines.push(`  ${c(ANSI.red, file)}: ${f.error}`);
      }
    }
    lines.push('');
  }

  const judgmental = findings.filter(f => !MECHANICAL_IDS.has(f.id));
  if (judgmental.length > 0) {
    lines.push(c(ANSI.yellow, 'Remaining judgmental issues (need manual review):'));
    lines.push('');

    const jByType = countByType(judgmental);
    for (const [type, info] of Object.entries(jByType)) {
      lines.push(`  ${info.count} ${type} — run \`polish explain ${type}\``);
    }
    lines.push('');
    lines.push(c(ANSI.cyan, 'Use `polish confirm <decisions.json>` or the wizard to resolve them.'));
  }

  lines.push('');
  lines.push(c(ANSI.cyan, 'Run `polish check <target>` to verify.'));

  return lines.join('\n');
}

export { MECHANICAL_IDS, useColor, ANSI };
