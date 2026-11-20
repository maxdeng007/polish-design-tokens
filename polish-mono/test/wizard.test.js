import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runWizard } from '../src/wizard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = path.join(__dirname, '.wizard-tmp');

/** Create a temp project with a duplicate-value token issue. */
function makeProject(content) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const file = path.join(TMP_DIR, 'tokens.css');
  fs.writeFileSync(file, content, 'utf8');
  return TMP_DIR;
}

/** Create a temp project with only judgmental issues (no duplicates). */
function makeJudgmentalProject() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const file = path.join(TMP_DIR, 'tokens.css');
  fs.writeFileSync(file, ':root {\n  --bg: #1a1a2e;\n}\n.btn {\n  color: #1a1a2e;\n}\n', 'utf8');
  return TMP_DIR;
}

/** Create a clean project with no issues. */
function makeCleanProject() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const file = path.join(TMP_DIR, 'tokens.css');
  fs.writeFileSync(file, ':root {\n  --color-bg: #1a1a2e;\n  --color-text: #e0e0e0;\n}\n.btn {\n  background: var(--color-bg);\n  color: var(--color-text);\n}\n', 'utf8');
  return TMP_DIR;
}

function cleanup() {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
}

/** Build a scripted prompt that returns answers from a queue. */
function scriptedPrompt(answers) {
  let i = 0;
  return async (question) => {
    if (i >= answers.length) return '';
    return answers[i++];
  };
}

/** Collect all written output into a single string. */
function collector() {
  const lines = [];
  return { write: (text) => lines.push(text), get: () => lines.join('\n') };
}

// --- Full pipeline to apply ---

test('wizard runs full pipeline and applies patches', async () => {
  const dir = makeProject(':root {\n  --color-bg: #1a1a2e;\n  --color-bg-alt: #1a1a2e;\n}\n.hero {\n  background: var(--color-bg);\n  color: var(--color-bg-alt);\n}\n');
  const out = collector();
  const prompt = scriptedPrompt(['', 'y', 'y', 'y']);
  const result = await runWizard({ target: dir, prompt, write: out.write });

  assert.equal(result.status, 'completed');
  assert.equal(result.findings > 0, true);
  assert.equal(result.patches > 0, true);
  assert.equal(result.applied > 0, true);
  assert.equal(result.failed, 0);
  assert.equal(result.backups > 0, true);
  assert.ok(out.get().includes('Step 1 of 5'));
  assert.ok(out.get().includes('Step 5 of 5'));
  assert.ok(out.get().includes('All patches applied'));

  const content = fs.readFileSync(path.join(dir, 'tokens.css'), 'utf8');
  assert.ok(content.includes('var(--color-bg)'), 'duplicate should be aliased');
  cleanup();
});

// --- Quit at audit step ---

test('wizard quits at plan prompt', async () => {
  const dir = makeProject(':root {\n  --color-bg: #1a1a2e;\n  --color-bg-alt: #1a1a2e;\n}\n.hero {\n  background: var(--color-bg);\n  color: var(--color-bg-alt);\n}\n');
  const out = collector();
  const prompt = scriptedPrompt(['', 'q']);
  const result = await runWizard({ target: dir, prompt, write: out.write });

  assert.equal(result.status, 'quit');
  assert.equal(result.applied, 0);
  assert.ok(out.get().includes('Quit. No changes were made.'));
  cleanup();
});

// --- Stop after audit ---

test('wizard stops after audit when user says no to plan', async () => {
  const dir = makeProject(':root {\n  --color-bg: #1a1a2e;\n  --color-bg-alt: #1a1a2e;\n}\n.hero {\n  background: var(--color-bg);\n  color: var(--color-bg-alt);\n}\n');
  const out = collector();
  const prompt = scriptedPrompt(['', 'n']);
  const result = await runWizard({ target: dir, prompt, write: out.write });

  assert.equal(result.status, 'stopped');
  assert.equal(result.applied, 0);
  assert.ok(out.get().includes('Stopped after audit'));
  cleanup();
});

// --- Stop before apply ---

test('wizard stops after plan when user says no to patch generation', async () => {
  const dir = makeProject(':root {\n  --color-bg: #1a1a2e;\n  --color-bg-alt: #1a1a2e;\n}\n.hero {\n  background: var(--color-bg);\n  color: var(--color-bg-alt);\n}\n');
  const out = collector();
  const prompt = scriptedPrompt(['', 'y', 'n']);
  const result = await runWizard({ target: dir, prompt, write: out.write });

  assert.equal(result.status, 'stopped');
  assert.equal(result.patches, 0);
  assert.equal(result.applied, 0);
  assert.ok(out.get().includes('Stopped after plan'));
  cleanup();
});

// --- Abort at apply ---

test('wizard aborts at final apply confirmation', async () => {
  const dir = makeProject(':root {\n  --color-bg: #1a1a2e;\n  --color-bg-alt: #1a1a2e;\n}\n.hero {\n  background: var(--color-bg);\n  color: var(--color-bg-alt);\n}\n');
  const out = collector();
  const prompt = scriptedPrompt(['', 'y', 'y', 'n']);
  const result = await runWizard({ target: dir, prompt, write: out.write });

  assert.equal(result.status, 'aborted');
  assert.equal(result.applied, 0);
  assert.ok(out.get().includes('Aborted. No files were modified.'));
  cleanup();
});

// --- No findings (clean project) ---

test('wizard reports clean when no findings', async () => {
  const dir = makeCleanProject();
  const out = collector();
  const prompt = scriptedPrompt(['']);
  const result = await runWizard({ target: dir, prompt, write: out.write });

  assert.equal(result.status, 'clean');
  assert.equal(result.findings, 0);
  assert.ok(out.get().includes('clean'));
  cleanup();
});

// --- Confirm step for judgmental findings ---

test('wizard proceeds to confirm step when only judgmental findings', async () => {
  const dir = makeJudgmentalProject();
  const out = collector();
  const prompt = scriptedPrompt(['', '', 'y', 'n']);
  const result = await runWizard({ target: dir, prompt, write: out.write });

  assert.equal(result.status, 'no-patches');
  assert.ok(out.get().includes('Confirm'));
  cleanup();
});

test('wizard confirm step deletes orphan token when confirmed', async () => {
  const dir = makeJudgmentalProject();
  const out = collector();
  const prompt = scriptedPrompt(['', '', 'y', 'y']);
  const result = await runWizard({ target: dir, prompt, write: out.write });

  assert.equal(result.status, 'completed');
  assert.ok(result.applied > 0);
  const content = fs.readFileSync(path.join(dir, 'tokens.css'), 'utf8');
  assert.ok(!content.includes('--bg'), '--bg should be deleted');
  cleanup();
});

test('wizard confirm step skips confirm when no judgmental findings', async () => {
  const dir = makeProject(':root {\n  --color-bg: #1a1a2e;\n  --color-bg-alt: #1a1a2e;\n}\n.hero {\n  background: var(--color-bg);\n  color: var(--color-bg-alt);\n}\n');
  const out = collector();
  const prompt = scriptedPrompt(['', 'y', 'y', 'y']);
  const result = await runWizard({ target: dir, prompt, write: out.write });

  assert.equal(result.status, 'completed');
  assert.ok(out.get().includes('No judgmental decisions needed'));
  cleanup();
});

// --- Quit at plan step ---

test('wizard quits at patch generation prompt', async () => {
  const dir = makeProject(':root {\n  --color-bg: #1a1a2e;\n  --color-bg-alt: #1a1a2e;\n}\n.hero {\n  background: var(--color-bg);\n  color: var(--color-bg-alt);\n}\n');
  const out = collector();
  const prompt = scriptedPrompt(['', 'y', 'q']);
  const result = await runWizard({ target: dir, prompt, write: out.write });

  assert.equal(result.status, 'quit');
  assert.equal(result.applied, 0);
  assert.ok(out.get().includes('Quit. No changes were made.'));
  cleanup();
});

// --- Quit at apply prompt ---

test('wizard quits at final apply prompt', async () => {
  const dir = makeProject(':root {\n  --color-bg: #1a1a2e;\n  --color-bg-alt: #1a1a2e;\n}\n.hero {\n  background: var(--color-bg);\n  color: var(--color-bg-alt);\n}\n');
  const out = collector();
  const prompt = scriptedPrompt(['', 'y', 'y', 'q']);
  const result = await runWizard({ target: dir, prompt, write: out.write });

  assert.equal(result.status, 'quit');
  assert.equal(result.applied, 0);
  cleanup();
});

// --- Target prompted when not provided ---

test('wizard prompts for target when not provided', async () => {
  const dir = makeProject(':root {\n  --color-bg: #1a1a2e;\n  --color-bg-alt: #1a1a2e;\n}\n.hero {\n  background: var(--color-bg);\n  color: var(--color-bg-alt);\n}\n');
  const out = collector();
  const prompt = scriptedPrompt([dir, '', 'q']);
  const result = await runWizard({ prompt, write: out.write });

  assert.equal(result.target, dir);
  assert.equal(result.status, 'quit');
  cleanup();
});

// --- Quit at target prompt ---

test('wizard quits when user types q at target prompt', async () => {
  const out = collector();
  const prompt = scriptedPrompt(['q']);
  const result = await runWizard({ prompt, write: out.write });

  assert.equal(result.status, 'quit');
  assert.equal(result.target, null);
  assert.ok(out.get().includes('Quit. No changes were made.'));
});

// --- Ignore patterns ---

test('wizard accepts ignore patterns', async () => {
  fs.mkdirSync(path.join(TMP_DIR, 'skipme'), { recursive: true });
  fs.writeFileSync(path.join(TMP_DIR, 'skipme', 'extra.css'), ':root {\n  --skip: #fff;\n}\n', 'utf8');
  const dir = makeProject(':root {\n  --color-bg: #1a1a2e;\n  --color-bg-alt: #1a1a2e;\n}\n.hero {\n  background: var(--color-bg);\n  color: var(--color-bg-alt);\n}\n');
  const out = collector();
  const prompt = scriptedPrompt(['', 'y', 'y', 'y']);
  const result = await runWizard({ target: dir, ignore: ['skipme'], prompt, write: out.write });

  assert.equal(result.status, 'completed');
  assert.ok(result.applied > 0);
  cleanup();
});

// --- Error on invalid target ---

test('wizard returns error status on invalid target', async () => {
  const out = collector();
  const prompt = scriptedPrompt(['']);
  const result = await runWizard({ target: '/nonexistent/path/xyz', prompt, write: out.write });

  assert.equal(result.status, 'error');
  assert.ok(out.get().includes('Scan failed'));
});

// --- Default confirm is yes ---

test('wizard treats empty input as yes for default-yes prompts', async () => {
  const dir = makeProject(':root {\n  --color-bg: #1a1a2e;\n  --color-bg-alt: #1a1a2e;\n}\n.hero {\n  background: var(--color-bg);\n  color: var(--color-bg-alt);\n}\n');
  const out = collector();
  const prompt = scriptedPrompt(['', '', '', '']);
  const result = await runWizard({ target: dir, prompt, write: out.write });

  assert.equal(result.status, 'completed');
  assert.ok(result.applied > 0);
  cleanup();
});
