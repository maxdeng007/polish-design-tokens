import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = path.join(__dirname, '.report-tmp');
const BIN = path.resolve(__dirname, '../bin/polish.mjs');
const NODE = process.execPath;

function makeProject(cssContent) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const file = path.join(TMP_DIR, 'tokens.css');
  fs.writeFileSync(file, cssContent, 'utf8');
  return TMP_DIR;
}

function runCli(args) {
  return spawnSync(NODE, [BIN, ...args], { encoding: 'utf8' });
}

function cleanup() {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
}

test('polish report generates an HTML file', () => {
  const dir = makeProject(':root {\n  --text: #111827;\n  --heading: #111827;\n  --unused: #fff;\n}\n');
  const result = runCli(['report', dir]);
  assert.equal(result.status, 0, `CLI should succeed: ${result.stderr}`);
  const html = fs.readFileSync(path.join(dir, 'polish-report.html'), 'utf8');
  assert.ok(html.length > 0, 'HTML file should not be empty');
  assert.ok(html.includes('<html'), 'should contain HTML document');
  cleanup();
});

test('polish report HTML is self-contained (no external resources)', () => {
  const dir = makeProject(':root {\n  --text: #111827;\n  --heading: #111827;\n}\n');
  const result = runCli(['report', dir]);
  const html = fs.readFileSync(path.join(dir, 'polish-report.html'), 'utf8');
  assert.ok(!html.includes('src="http'), 'should not reference external scripts');
  assert.ok(!html.includes('href="http'), 'should not reference external stylesheets');
  assert.ok(html.includes('<style>'), 'should have inline styles');
  cleanup();
});

test('polish report HTML contains finding types and file/line info', () => {
  const dir = makeProject(':root {\n  --text: #111827;\n  --heading: #111827;\n}\n');
  const result = runCli(['report', dir]);
  const html = fs.readFileSync(path.join(dir, 'polish-report.html'), 'utf8');
  assert.ok(html.includes('duplicate-value'), 'should list duplicate-value findings');
  assert.ok(html.includes('tokens.css'), 'should show file names');
  cleanup();
});

test('polish report HTML has checkboxes for orphan decisions', () => {
  const dir = makeProject(':root {\n  --unused: #fff;\n  --primary: #4f46e5;\n}\n');
  const result = runCli(['report', dir]);
  const html = fs.readFileSync(path.join(dir, 'polish-report.html'), 'utf8');
  assert.ok(html.includes('orphan'), 'should list orphan findings');
  assert.ok(html.includes('data-decision'), 'should have decision data attributes');
  assert.ok(html.includes('delete'), 'should mention delete action for orphans');
  cleanup();
});

test('polish report HTML has checkboxes for duplicate-value alias decisions', () => {
  const dir = makeProject(':root {\n  --text: #111827;\n  --heading: #111827;\n}\n');
  const result = runCli(['report', dir]);
  const html = fs.readFileSync(path.join(dir, 'polish-report.html'), 'utf8');
  assert.ok(html.includes('alias'), 'should mention alias action for duplicate-value');
  assert.ok(html.includes('--text'), 'should show primary token name');
  assert.ok(html.includes('--heading'), 'should show secondary token name');
  cleanup();
});

test('polish report HTML does not have checkboxes for conflict findings', () => {
  const dir = makeProject(':root {\n  --primary: #4f46e5;\n}\n:root {\n  --primary: #ec4899;\n}\n');
  const result = runCli(['report', dir]);
  const html = fs.readFileSync(path.join(dir, 'polish-report.html'), 'utf8');
  assert.ok(html.includes('conflict'), 'should list conflict findings');
  cleanup();
});

test('polish report --output specifies output path', () => {
  const dir = makeProject(':root {\n  --text: #111827;\n  --heading: #111827;\n}\n');
  const outFile = path.join(dir, 'custom-report.html');
  const result = runCli(['report', dir, `--output=${outFile}`]);
  assert.equal(result.status, 0, `CLI should succeed: ${result.stderr}`);
  assert.ok(fs.existsSync(outFile), 'custom output file should exist');
  cleanup();
});

test('polish report --ignore skips files', () => {
  const dir = makeProject(':root {\n  --text: #111827;\n  --heading: #111827;\n}\n');
  const result = runCli(['report', dir, '--ignore=tokens.css']);
  assert.equal(result.status, 0, `CLI should succeed: ${result.stderr}`);
  const html = fs.readFileSync(path.join(dir, 'polish-report.html'), 'utf8');
  assert.ok(!html.includes('duplicate-value'), 'ignored file should not produce findings');
  cleanup();
});

test('polish report shows clean message when no findings', () => {
  const dir = makeProject(':root {\n  --primary: #4f46e5;\n}\n.hero {\n  color: var(--primary);\n}\n');
  const result = runCli(['report', dir]);
  assert.equal(result.status, 0, `CLI should succeed: ${result.stderr}`);
  const html = fs.readFileSync(path.join(dir, 'polish-report.html'), 'utf8');
  assert.ok(html.toLowerCase().includes('clean') || html.includes('No issues'), 'should show clean state');
  cleanup();
});

test('polish report HTML includes download decisions button', () => {
  const dir = makeProject(':root {\n  --unused: #fff;\n  --primary: #4f46e5;\n}\n');
  const result = runCli(['report', dir]);
  const html = fs.readFileSync(path.join(dir, 'polish-report.html'), 'utf8');
  assert.ok(html.includes('decisions.json'), 'should mention decisions.json download');
  cleanup();
});

test('polish report CSS insets section titles and cards from edges', () => {
  const dir = makeProject(':root {\n  --text: #111827;\n  --heading: #111827;\n}\n');
  const result = runCli(['report', dir]);
  const html = fs.readFileSync(path.join(dir, 'polish-report.html'), 'utf8');

  const h2Rule = html.match(/\.severity-section h2\s*\{[^}]*\}/);
  assert.ok(h2Rule, 'should have a .severity-section h2 rule');
  assert.ok(h2Rule[0].includes('padding-left'), 'section title should have left padding, not flush at 0');
  assert.ok(h2Rule[0].includes('padding-top'), 'section title should have top padding, not flush at 0');

  const cardRule = html.match(/\.card\s*\{[^}]*\}/);
  assert.ok(cardRule, 'should have a .card rule');
  assert.ok(cardRule[0].includes('margin-left'), 'cards should have left margin, not flush at 0');
  assert.ok(cardRule[0].includes('margin-right'), 'cards should have right margin, not flush at 0');
  cleanup();
});

test('polish report card margins are uniform on all four sides', () => {
  const dir = makeProject(':root {\n  --text: #111827;\n  --heading: #111827;\n}\n');
  const result = runCli(['report', dir]);
  const html = fs.readFileSync(path.join(dir, 'polish-report.html'), 'utf8');

  const cardRule = html.match(/\.card\s*\{[^}]*\}/);
  assert.ok(cardRule, 'should have a .card rule');

  const margins = ['top', 'right', 'bottom', 'left'].map(dir => {
    const m = cardRule[0].match(new RegExp(`margin-${dir}:\\s*([^;]+);`));
    return m ? m[1].trim() : null;
  });
  assert.ok(margins.every(v => v !== null), 'card should define margin-top/right/bottom/left');
  const [first, ...rest] = margins;
  assert.ok(rest.every(v => v === first), `all card margins should share one value, got ${JSON.stringify(margins)}`);
  cleanup();
});

test('polish report severity sections have rounded corners', () => {
  const dir = makeProject(':root {\n  --text: #111827;\n  --heading: #111827;\n}\n');
  const result = runCli(['report', dir]);
  assert.equal(result.status, 0, `CLI should succeed: ${result.stderr}`);
  const html = fs.readFileSync(path.join(dir, 'polish-report.html'), 'utf8');
  const rule = html.match(/\.severity-section\s*\{[^}]*\}/);
  assert.ok(rule, 'should have a .severity-section rule');
  assert.ok(rule[0].includes('border-radius'), 'severity section should have rounded corners');
  cleanup();
});

test('polish report renders color swatches for hex values', () => {
  const dir = makeProject(':root {\n  --text: #111827;\n  --heading: #111827;\n}\n');
  const result = runCli(['report', dir]);
  assert.equal(result.status, 0, `CLI should succeed: ${result.stderr}`);
  const html = fs.readFileSync(path.join(dir, 'polish-report.html'), 'utf8');
  const swatch = html.match(/<span class="swatch"[^>]*style="([^"]+)"/);
  assert.ok(swatch, 'should render a color swatch span');
  assert.ok(swatch[1].includes('#111827'), 'swatch background should use the hex value');
  cleanup();
});

test('polish report has a copy decisions button', () => {
  const dir = makeProject(':root {\n  --unused: #fff;\n  --primary: #4f46e5;\n}\n');
  const result = runCli(['report', dir]);
  assert.equal(result.status, 0, `CLI should succeed: ${result.stderr}`);
  const html = fs.readFileSync(path.join(dir, 'polish-report.html'), 'utf8');
  assert.ok(html.includes('Copy decisions.json'), 'should have a copy button');
  assert.ok(html.includes('id="copy-btn"'), 'copy button should have an id');
  cleanup();
});

test('polish report shows the polish confirm command hint', () => {
  const dir = makeProject(':root {\n  --unused: #fff;\n  --primary: #4f46e5;\n}\n');
  const result = runCli(['report', dir]);
  assert.equal(result.status, 0, `CLI should succeed: ${result.stderr}`);
  const html = fs.readFileSync(path.join(dir, 'polish-report.html'), 'utf8');
  assert.ok(html.includes('polish confirm decisions.json'), 'should show the confirm command');
  assert.ok(html.includes('--target='), 'confirm command should include a target flag');
  assert.ok(html.includes('id="confirm-hint"'), 'should have a confirm hint element');
  cleanup();
});

test('polish report has a filter input and severity chips', () => {
  const dir = makeProject(':root {\n  --text: #111827;\n  --heading: #111827;\n}\n');
  const result = runCli(['report', dir]);
  assert.equal(result.status, 0, `CLI should succeed: ${result.stderr}`);
  const html = fs.readFileSync(path.join(dir, 'polish-report.html'), 'utf8');
  assert.ok(html.includes('id="filter-input"'), 'should have a filter search input');
  assert.ok(html.includes('data-severity-filter="all"'), 'should have an All severity chip');
  for (const sev of ['error', 'warn', 'info']) {
    assert.ok(html.includes(`data-severity-filter="${sev}"`), `should have a ${sev} severity chip`);
  }
  cleanup();
});

test('polish report cards carry a data-severity attribute', () => {
  const dir = makeProject(':root {\n  --text: #111827;\n  --heading: #111827;\n}\n');
  const result = runCli(['report', dir]);
  assert.equal(result.status, 0, `CLI should succeed: ${result.stderr}`);
  const html = fs.readFileSync(path.join(dir, 'polish-report.html'), 'utf8');
  const card = html.match(/<div class="card" data-severity="warn">/);
  assert.ok(card, 'duplicate-value cards should carry data-severity="warn"');
  cleanup();
});

test('polish report has a finding count and a filter empty state', () => {
  const dir = makeProject(':root {\n  --text: #111827;\n  --heading: #111827;\n}\n');
  const result = runCli(['report', dir]);
  assert.equal(result.status, 0, `CLI should succeed: ${result.stderr}`);
  const html = fs.readFileSync(path.join(dir, 'polish-report.html'), 'utf8');
  assert.ok(html.includes('id="finding-count"'), 'should have a visible finding count element');
  assert.ok(html.includes('id="filter-empty"'), 'should have a filter empty state element');
  cleanup();
});

test('polish report filter script scopes decisions to visible cards', () => {
  const dir = makeProject(':root {\n  --unused: #fff;\n  --primary: #4f46e5;\n}\n');
  const result = runCli(['report', dir]);
  assert.equal(result.status, 0, `CLI should succeed: ${result.stderr}`);
  const html = fs.readFileSync(path.join(dir, 'polish-report.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(script, 'should have an inline script');
  const code = script[1];
  assert.ok(code.includes('applyFilter'), 'script should implement the filter logic');
  assert.ok(code.includes('visibleCards'), 'script should compute visible cards');
  assert.ok(
    code.includes("card.querySelectorAll('input[type=\"checkbox\"][data-decision]:checked')"),
    'decision collection should be scoped to visible cards only'
  );
  cleanup();
});

test('polish report shows a no-tokens warning banner instead of a clean banner', () => {
  const dir = makeProject('body {\n  color: #3B82F6;\n}\n');
  const result = runCli(['report', dir]);
  assert.equal(result.status, 0, `CLI should succeed: ${result.stderr}`);
  const html = fs.readFileSync(path.join(dir, 'polish-report.html'), 'utf8');
  assert.ok(html.includes('No design tokens found'), 'should show the no-tokens warning');
  assert.ok(!html.includes('Your tokens are healthy'), 'must not show the clean banner when there are no tokens');
  cleanup();
});
