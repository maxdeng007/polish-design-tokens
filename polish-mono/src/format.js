/**
 * Human-readable formatting for CLI output.
 * Used by the --summary flag to print plain-language summaries
 * instead of raw JSON, making polish usable by non-technical users.
 */

const MECHANICAL_IDS = new Set(['duplicate-value']);

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
  lines.push('Token Audit Summary');
  lines.push('====================');
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
    lines.push('No issues found. Your tokens look clean.');
    return lines.join('\n');
  }

  lines.push(`Found ${findings.length} issue${findings.length === 1 ? '' : 's'}:`);
  lines.push('');

  const byType = countByType(findings);
  for (const [type, info] of Object.entries(byType)) {
    const label = MECHANICAL_IDS.has(type) ? '[Mechanical]' : '[Judgmental]';
    lines.push(`  ${label} ${info.count} ${type}`);
  }

  lines.push('');

  const mechCount = findings.filter(f => MECHANICAL_IDS.has(f.id)).length;
  if (mechCount > 0) {
    lines.push(`${mechCount} can be auto-fixed.`);
    lines.push('');
    lines.push('Next steps:');
    lines.push('  polish plan findings.json > plan.json');
    lines.push('  polish diff plan.json > patches.json');
    lines.push('  polish apply patches.json');
  } else {
    lines.push('No mechanical fixes available — all findings need your decision.');
  }

  return lines.join('\n');
}

/** Format a plan action array (output of plan()) as a plain-language summary. */
export function formatPlan(actions) {
  const lines = [];
  lines.push('Action Plan');
  lines.push('===========');
  lines.push('');

  if (!actions || actions.length === 0) {
    lines.push('No actions needed. No findings to process.');
    return lines.join('\n');
  }

  lines.push(`${actions.length} actions ranked by priority:`);
  lines.push('');

  for (const item of actions) {
    const f = item.finding || {};
    const label = item.mechanical ? 'mechanical' : item.judgmental ? 'judgmental' : 'unknown';
    lines.push(`  ${item.priority}. ${f.id || 'unknown'} (${label}) — ${f.title || 'no title'}`);
  }

  lines.push('');

  const mech = actions.filter(a => a.mechanical).length;
  const judg = actions.filter(a => a.judgmental).length;
  lines.push(`Mechanical: ${mech} (auto-fixable via polish diff + polish apply)`);
  lines.push(`Judgmental: ${judg} (needs your decision)`);

  return lines.join('\n');
}

/** Format a patch array (output of generateDiffs()) as a plain-language summary. */
export function formatDiff(patches) {
  const lines = [];
  lines.push('Patches Generated');
  lines.push('================');
  lines.push('');

  if (!patches || patches.length === 0) {
    lines.push('No mechanical patches to apply. All findings are judgmental.');
    return lines.join('\n');
  }

  lines.push(`${patches.length} mechanical patches ready:`);
  lines.push('');

  for (const p of patches) {
    const file = p.file || '?';
    const line = p.line || '?';
    const change = p.before && p.after ? `${p.before} → ${p.after}` : (p.reason || '');
    lines.push(`  [${p.type}] ${file}:${line} — ${change}`);
  }

  lines.push('');
  lines.push('Run `polish apply patches.json` to apply with backup.');

  return lines.join('\n');
}

/** Format an apply result (output of apply()) as a plain-language summary. */
export function formatApply(result) {
  const lines = [];
  lines.push('Apply Results');
  lines.push('=============');
  lines.push('');

  const applied = (result.applied || []).length;
  const failed = (result.failed || []).length;
  const backups = result.backupCount || 0;

  lines.push(`Applied:  ${applied} patches`);
  lines.push(`Failed:   ${failed} patches`);
  lines.push(`Backups:  ${backups} files`);
  lines.push('');

  if (failed === 0) {
    lines.push('All patches applied successfully.');
  } else {
    lines.push('Some patches failed. Review the errors below:');
    lines.push('');
    for (const f of result.failed) {
      const file = f.file || '?';
      lines.push(`  ${file}: ${f.error}`);
    }
  }

  return lines.join('\n');
}

/** Format a doctor report (output of polish_doctor()) as a plain-language summary. */
export function formatDoctor(report) {
  const lines = [];
  lines.push('Dependency Check');
  lines.push('================');
  lines.push('');

  const deps = report.dependencies || [];
  for (const d of deps) {
    let status;
    if (d.installAttempted) {
      status = d.installResult === 'success' || d.installed ? '[INSTALLED]' : '[FAILED]  ';
    } else if (d.installed) {
      status = '[OK]      ';
    } else {
      status = '[MISSING] ';
    }
    lines.push(`  ${status} ${d.name}`);
  }

  lines.push('');

  const missing = deps.filter(d => !d.installed).length;
  if (missing > 0) {
    lines.push(`${missing} optional skill/tool not installed.`);
    lines.push('Run `polish doctor --install` to install missing skills.');
  } else {
    lines.push('All dependencies are installed.');
  }

  return lines.join('\n');
}

export { MECHANICAL_IDS };
