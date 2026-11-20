/**
 * report.js — generate a self-contained HTML report from an AuditReport.
 *
 * Produces a single HTML file with inline CSS and JS — no external
 * dependencies. Findings are rendered as color-coded cards by severity.
 * Judgmental findings that map to simple decisions (orphan → delete,
 * duplicate-value → alias) get checkboxes; checking them and clicking
 * "Download decisions.json" generates a file ready for `polish confirm`.
 */

const MECHANICAL_IDS = new Set(['duplicate-value']);

/** Escape HTML special characters to prevent injection. */
function esc(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** True when the value is a CSS hex color (#rgb, #rrggbb, #rrggbbaa). */
function isHexColor(value) {
  return typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value.trim());
}

/** Build the decisions.json entry for a single evidence item, or null if none. */
function decisionFor(finding, ev) {
  if (finding.id === 'orphan' && ev.name) {
    return JSON.stringify({ action: 'delete', token: ev.name });
  }
  if (finding.id === 'duplicate-value' && ev.primary && ev.secondary) {
    return JSON.stringify({ action: 'alias', from: ev.secondary, to: ev.primary });
  }
  return null;
}

/** Build the label for a decision checkbox. */
function decisionLabel(finding, ev) {
  if (finding.id === 'orphan') {
    return `Delete ${ev.name}`;
  }
  if (finding.id === 'duplicate-value') {
    return `Alias ${ev.secondary} → ${ev.primary}`;
  }
  return '';
}

/** Render a single evidence item as a list row. */
function renderEvidence(ev) {
  const parts = [];
  if (ev.file) {
    const loc = ev.line ? `${ev.file}:${ev.line}` : ev.file;
    parts.push(`<code>${esc(loc)}</code>`);
  }
  if (ev.value != null) {
    const swatch = isHexColor(ev.value)
      ? `<span class="swatch" style="background:${esc(ev.value)}"></span>`
      : '';
    parts.push(`${swatch} value <code>${esc(ev.value)}</code>`);
  }
  if (ev.names) {
    parts.push(`tokens ${esc(ev.names.join(' = '))}`);
  }
  if (ev.primary && ev.secondary) {
    parts.push(`${esc(ev.primary)} ← ${esc(ev.secondary)}`);
  }
  if (ev.count != null) {
    parts.push(`count ${esc(ev.count)}`);
  }
  if (ev.declarations != null) {
    parts.push(`declarations ${esc(ev.declarations)}`);
  }
  if (ev.scopes && ev.scopes.length) {
    parts.push(`scopes ${esc(ev.scopes.join(', '))}`);
  }
  if (!parts.length) return '';
  return `<div class="evidence-row">${parts.join(' · ')}</div>`;
}

/** Render a single finding card. */
function renderFinding(finding) {
  const isMechanical = MECHANICAL_IDS.has(finding.id);
  const sevClass = finding.severity || 'info';

  const header = `
    <div class="card-header">
      <span class="badge severity-${esc(sevClass)}">${esc(sevClass)}</span>
      <span class="finding-id">${esc(finding.id)}</span>
      ${isMechanical ? '<span class="badge mechanical">auto-fixable</span>' : ''}
    </div>`;

  const title = `<h3 class="card-title">${esc(finding.title || finding.id)}</h3>`;

  const detail = finding.detail
    ? `<p class="card-detail">${esc(finding.detail)}</p>`
    : '';

  const evidenceHtml = (finding.evidence || [])
    .map(ev => renderEvidence(ev))
    .filter(Boolean)
    .join('\n');
  const evidence = evidenceHtml
    ? `<div class="evidence">${evidenceHtml}</div>`
    : '';

  const suggestion = finding.suggestion
    ? `<p class="card-suggestion"><strong>Suggestion:</strong> ${esc(finding.suggestion)}</p>`
    : '';

  // Build decision checkboxes for findings that map to simple decisions.
  const decisions = [];
  for (const ev of finding.evidence || []) {
    const dec = decisionFor(finding, ev);
    if (dec) {
      const label = decisionLabel(finding, ev);
      const file = ev.secondaryFile || ev.file || '';
      const line = ev.secondaryLine || ev.line || '';
      const loc = file && line ? `${file}:${line}` : file || '';
      decisions.push(`
        <label class="decision-row">
          <input type="checkbox" data-decision="${esc(dec)}"${loc ? ` data-loc="${esc(loc)}"` : ''}>
          ${esc(label)}${loc ? ` <span class="decision-loc">${esc(loc)}</span>` : ''}
        </label>`);
    }
  }
  const decisionsHtml = decisions.length
    ? `<div class="decisions">${decisions.join('\n')}</div>`
    : (finding.id !== 'duplicate-value' && finding.id !== 'orphan' && !isMechanical
      ? '<p class="card-note">No checkbox — this finding needs a custom decision. See <code>polish explain</code> for guidance.</p>'
      : '');

  return `
    <div class="card">
      ${header}
      ${title}
      ${detail}
      ${evidence}
      ${suggestion}
      ${decisionsHtml}
    </div>`;
}

/** Render the full HTML document. */
export function generateReport(report) {
  const findings = report.findings || [];
  const s = report.summary || {};
  const target = report.target && report.target.value ? report.target.value : '(unknown)';

  const stats = [];
  if (s.declarations !== undefined) stats.push(`${s.declarations} declarations`);
  if (s.uniqueTokens !== undefined) stats.push(`${s.uniqueTokens} unique tokens`);
  if (s.runtimeVariables !== undefined) stats.push(`${s.runtimeVariables} runtime vars`);
  if (s.runtimeDocuments !== undefined) stats.push(`${s.runtimeDocuments} runtime docs`);
  if (s.findings !== undefined) stats.push(`${s.findings} findings`);

  const bySev = { error: [], warn: [], info: [] };
  for (const f of findings) {
    const sev = f.severity || 'info';
    if (bySev[sev]) bySev[sev].push(f);
  }

  const sections = ['error', 'warn', 'info']
    .filter(sev => bySev[sev].length > 0)
    .map(sev => `
      <section class="severity-section severity-${sev}">
        <h2>${sev} (${bySev[sev].length})</h2>
        ${bySev[sev].map(renderFinding).join('\n')}
      </section>`)
    .join('\n');

  const cleanMessage = findings.length === 0
    ? `<div class="clean-banner">✓ No issues found. Your tokens are healthy.</div>`
    : '';

  const hasDecisions = findings.some(f => (f.evidence || []).some(ev => decisionFor(f, ev)));
  const confirmHint = hasDecisions
    ? `<p class="toolbar-hint" id="confirm-hint">Next: run <code>polish confirm decisions.json --target=${esc(target)}</code> — or hand <code>decisions.json</code> to your AI agent to apply.</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Polish Token Report — ${esc(target)}</title>
<style>
  :root {
    --bg: #f7f8fa;
    --card-bg: #ffffff;
    --text: #1f2937;
    --muted: #6b7280;
    --border: #e5e7eb;
    --error-bg: #fef2f2;
    --error-border: #fca5a5;
    --warn-bg: #fffbeb;
    --warn-border: #fcd34d;
    --info-bg: #f0fdf4;
    --info-border: #86efac;
    --mech-bg: #eff6ff;
    --mech-border: #93c5fd;
    --accent: #4f46e5;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    padding: 2rem;
  }
  .container { max-width: 900px; margin: 0 auto; }
  header { margin-bottom: 2rem; }
  header h1 { font-size: 1.75rem; margin-bottom: 0.5rem; }
  .stats { display: flex; gap: 1rem; flex-wrap: wrap; color: var(--muted); font-size: 0.875rem; margin-bottom: 0.5rem; }
  .stats span { background: var(--card-bg); padding: 0.25rem 0.75rem; border-radius: 999px; border: 1px solid var(--border); }
  .clean-banner {
    background: var(--info-bg);
    border: 1px solid var(--info-border);
    border-radius: 8px;
    padding: 1.5rem;
    text-align: center;
    font-size: 1.1rem;
    color: #166534;
    margin-bottom: 2rem;
  }
  .severity-section {
    margin-bottom: 2rem;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 12px;
  }
  .severity-section h2 {
    font-size: 1.1rem;
    margin-bottom: 1rem;
    padding-top: 0.5rem;
    padding-left: 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid var(--border);
  }
  .card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.25rem;
    margin-top: 1rem;
    margin-right: 1rem;
    margin-bottom: 1rem;
    margin-left: 1rem;
  }
  .card-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
  .badge {
    display: inline-block;
    padding: 0.1rem 0.5rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .severity-error { background: var(--error-bg); color: #b91c1c; border: 1px solid var(--error-border); }
  .severity-warn { background: var(--warn-bg); color: #92400e; border: 1px solid var(--warn-border); }
  .severity-info { background: var(--info-bg); color: #166534; border: 1px solid var(--info-border); }
  .badge.mechanical { background: var(--mech-bg); color: #1e40af; border: 1px solid var(--mech-border); }
  .finding-id { font-family: 'SF Mono', 'Menlo', monospace; font-size: 0.85rem; font-weight: 600; }
  .card-title { font-size: 1rem; margin-bottom: 0.5rem; }
  .card-detail { font-size: 0.875rem; color: var(--muted); margin-bottom: 0.75rem; }
  .evidence { margin-bottom: 0.75rem; }
  .evidence-row { font-size: 0.8rem; color: var(--muted); padding: 0.15rem 0; }
  .evidence-row code {
    background: var(--bg);
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    font-family: 'SF Mono', 'Menlo', monospace;
    font-size: 0.78rem;
  }
  .swatch {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 3px;
    border: 1px solid var(--border);
    vertical-align: middle;
    margin-right: 0.3rem;
  }
  .card-suggestion { font-size: 0.85rem; color: var(--muted); margin-bottom: 0.75rem; }
  .decisions { border-top: 1px solid var(--border); padding-top: 0.75rem; }
  .decision-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0;
    cursor: pointer;
    font-size: 0.9rem;
  }
  .decision-row input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--accent); }
  .decision-loc { color: var(--muted); font-size: 0.8rem; font-family: 'SF Mono', 'Menlo', monospace; }
  .card-note { font-size: 0.8rem; color: var(--muted); font-style: italic; }
  .card-note code { background: var(--bg); padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.78rem; }
  .toolbar {
    position: sticky;
    top: 0;
    background: var(--bg);
    padding: 1rem 0;
    border-bottom: 1px solid var(--border);
    margin-bottom: 1.5rem;
    z-index: 10;
  }
  .toolbar-inner { display: flex; align-items: center; gap: 1rem; }
  .toolbar-count { font-size: 0.9rem; color: var(--muted); }
  .download-btn {
    background: var(--accent);
    color: #fff;
    border: none;
    padding: 0.5rem 1.25rem;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .download-btn:hover { opacity: 0.85; }
  .download-btn:disabled { background: var(--muted); cursor: not-allowed; opacity: 0.5; }
  .copy-btn {
    background: var(--card-bg);
    color: var(--accent);
    border: 1px solid var(--accent);
  }
  .copy-btn:hover { opacity: 0.85; }
  .copy-btn:disabled { background: var(--card-bg); color: var(--muted); border-color: var(--border); cursor: not-allowed; opacity: 0.5; }
  .toolbar-hint { font-size: 0.8rem; color: var(--muted); margin-bottom: 1.5rem; }
  .toolbar-hint code {
    background: var(--bg);
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    font-family: 'SF Mono', 'Menlo', monospace;
    font-size: 0.78rem;
  }
  footer { margin-top: 2rem; text-align: center; color: var(--muted); font-size: 0.8rem; }
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>Token Health Report</h1>
    <div class="stats">${stats.map(s => `<span>${esc(s)}</span>`).join('')}</div>
    <p style="color: var(--muted); font-size: 0.8rem;">Target: <code>${esc(target)}</code></p>
  </header>

  ${cleanMessage}

  <div class="toolbar">
    <div class="toolbar-inner">
      <span class="toolbar-count" id="decision-count">0 decisions selected</span>
      <button class="download-btn" id="download-btn" disabled>Download decisions.json</button>
      <button class="download-btn copy-btn" id="copy-btn" disabled>Copy decisions.json</button>
    </div>
  </div>
  ${confirmHint}

  ${sections}

  <footer>
    Generated by <strong>polish</strong> — design token superpower tool
  </footer>
</div>

<script>
(function() {
  var checkboxes = document.querySelectorAll('input[type="checkbox"][data-decision]');
  var countEl = document.getElementById('decision-count');
  var btn = document.getElementById('download-btn');
  var copyBtn = document.getElementById('copy-btn');

  function buildDecisions() {
    var checked = document.querySelectorAll('input[type="checkbox"][data-decision]:checked');
    var decisions = [];
    checked.forEach(function(cb) {
      try {
        decisions.push(JSON.parse(cb.getAttribute('data-decision')));
      } catch (e) { /* skip malformed */ }
    });
    return decisions;
  }

  function updateCount() {
    var checked = document.querySelectorAll('input[type="checkbox"][data-decision]:checked');
    countEl.textContent = checked.length + ' decision' + (checked.length === 1 ? '' : 's') + ' selected';
    btn.disabled = checked.length === 0;
    copyBtn.disabled = checked.length === 0;
  }

  checkboxes.forEach(function(cb) {
    cb.addEventListener('change', updateCount);
  });

  btn.addEventListener('click', function() {
    var decisions = buildDecisions();
    if (decisions.length === 0) return;
    var blob = new Blob([JSON.stringify({ decisions: decisions }, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'decisions.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  copyBtn.addEventListener('click', function() {
    var decisions = buildDecisions();
    if (decisions.length === 0) return;
    copyText(JSON.stringify({ decisions: decisions }, null, 2), copyBtn);
  });

  function copyText(text, btn) {
    var flash = function() {
      btn.textContent = 'Copied!';
      setTimeout(function() { btn.textContent = 'Copy decisions.json'; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(flash, function() { legacyCopy(text, flash); });
    } else {
      legacyCopy(text, flash);
    }
  }

  function legacyCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    document.body.removeChild(ta);
  }

  updateCount();
})();
</script>
</body>
</html>`;
}
