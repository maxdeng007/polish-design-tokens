/**
 * wizard.js — interactive guided pipeline.
 *
 * Walks the user through audit → plan → diff → apply one step at a time,
 * prompting for confirmation before each transition. Built for users who
 * are uncomfortable with raw CLI commands and JSON files.
 *
 * I/O is injected so the wizard is fully testable without a TTY: pass a
 * `prompt` function (question → Promise<string>) and a `write` function
 * (text → void). When no prompt is injected, a readline-based default is
 * created and torn down automatically.
 */

import readline from 'readline';
import path from 'path';
import { scan } from './scan.js';
import { cross } from './cross.js';
import { plan } from './plan.js';
import { generateDiffs } from './diff.js';
import { confirm as resolveDecisions } from './confirm.js';
import { apply } from './apply.js';
import { formatAudit, formatPlan, formatDiff, formatApply, ANSI, useColor } from './format.js';

function c(code, text) {
  return useColor() ? code + text + ANSI.reset : text;
}

/** Tri-state confirm: returns 'yes', 'no', or 'quit'. */
async function askConfirm(prompt, question, defaultYes = true) {
  const suffix = defaultYes ? '[Y/n/q]' : '[y/N/q]';
  const raw = (await prompt(`${question} ${suffix} `)).trim().toLowerCase();
  if (raw === 'q' || raw === 'quit') return 'quit';
  if (raw === '') return defaultYes ? 'yes' : 'no';
  if (raw === 'y' || raw === 'yes') return 'yes';
  return 'no';
}

/**
 * Create a prompt function. For TTY input, uses readline's question().
 * For piped/non-TTY input, reads all of stdin upfront and serves answers
 * from a queue — readline's question() loses buffered lines between calls
 * when stdin is not a terminal.
 */
async function createReadlinePrompt() {
  if (!process.stdin.isTTY) {
    const queue = [];
    const reader = readline.createInterface({ input: process.stdin, terminal: false });
    for await (const line of reader) queue.push(line);
    const readerClose = () => reader.close();
    let index = 0;
    const prompt = async () => queue[index++] ?? '';
    return { prompt, close: readerClose };
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt = (question) => new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer));
  });
  const close = () => rl.close();
  return { prompt, close };
}

/**
 * Run the interactive wizard.
 *
 * @param {object} [opts]
 * @param {string} [opts.target] — initial target directory (skips the prompt)
 * @param {string[]} [opts.ignore] — initial ignore patterns
 * @param {function} [opts.prompt] — (question: string) => Promise<string>
 * @param {function} [opts.write] — (text: string) => void
 * @returns {Promise<object>} result summary
 */
export async function runWizard(opts = {}) {
  const {
    target: initialTarget,
    ignore: initialIgnore = [],
    prompt: injectedPrompt,
    write = (text) => process.stdout.write(text + '\n')
  } = opts;

  const out = (text) => write(text);

  const ownPrompt = !injectedPrompt;
  const { prompt, close } = ownPrompt ? await createReadlinePrompt() : { prompt: injectedPrompt, close: () => {} };

  const result = {
    target: null,
    status: 'completed',
    findings: 0,
    planActions: 0,
    patches: 0,
    applied: 0,
    failed: 0,
    backups: 0
  };

  try {
    out(c(ANSI.bold, 'polish wizard'));
    out('=================');
    out('');
    out('This will walk you through auditing your project for');
    out('design token issues, then fix the mechanical ones.');
    out('No files are modified until you confirm at the end.');
    out('');

    // --- target ---
    let target = initialTarget;
    if (!target) {
      const answer = (await prompt('Project directory to scan [.]: ')).trim();
      if (answer.toLowerCase() === 'q' || answer.toLowerCase() === 'quit') { out(''); out('Quit. No changes were made.'); result.status = 'quit'; return result; }
      target = answer || '.';
    }
    result.target = target;
    out('');
    out(c(ANSI.cyan, `Target: ${target}`));

    // --- ignore ---
    let ignore = [...initialIgnore];
    const ignoreAnswer = (await prompt('Extra paths to skip (comma-separated) []: ')).trim();
    if (ignoreAnswer) {
      ignore = [...ignore, ...ignoreAnswer.split(',').map(s => s.trim()).filter(Boolean)];
    }

    // --- step 1: audit ---
    out('');
    out(c(ANSI.bold, 'Step 1 of 5 — Audit'));
    out('----------------------');
    out('Scanning your project for token issues...');

    let graph, report;
    try {
      graph = scan(target, { ignore });
      report = cross(graph);
    } catch (e) {
      out(c(ANSI.red, `Scan failed: ${e.message}`));
      result.status = 'error';
      return result;
    }

    out(formatAudit(report));
    result.findings = (report.findings || []).length;

    if (result.findings === 0) {
      out('');
      out(c(ANSI.green, 'Your tokens are clean — nothing to fix.'));
      result.status = 'clean';
      return result;
    }

    const decision = await askConfirm(prompt, 'Proceed to build an action plan?');
    if (decision === 'quit') { out(''); out('Quit. No changes were made.'); result.status = 'quit'; return result; }
    if (decision === 'no') { out(''); out('Stopped after audit. Re-run `polish wizard` to continue.'); result.status = 'stopped'; return result; }

    // --- step 2: plan ---
    out('');
    out(c(ANSI.bold, 'Step 2 of 5 — Plan'));
    out('-------------------');
    const actions = plan(report.findings || []);
    out(formatPlan(actions));
    result.planActions = actions.length;

    const mechCount = actions.filter(a => a.mechanical).length;

    const decision2 = await askConfirm(prompt, 'Proceed to review decisions and generate patches?');
    if (decision2 === 'quit') { out(''); out('Quit. No changes were made.'); result.status = 'quit'; return result; }
    if (decision2 === 'no') { out(''); out('Stopped after plan. No patches generated.'); result.status = 'stopped'; return result; }

    // --- step 3: confirm (judgmental decisions) ---
    out('');
    out(c(ANSI.bold, 'Step 3 of 5 — Confirm'));
    out('--------------------');
    const judgmentalActions = actions.filter(a => a.judgmental);
    const confirmedPatches = [];

    if (judgmentalActions.length === 0) {
      out('No judgmental decisions needed.');
    } else {
      out(c(ANSI.yellow, `${judgmentalActions.length} judgmental finding(s) need your decision:`));
      const decisions = [];
      for (const action of judgmentalActions) {
        const f = action.finding;
        if (f.id === 'orphan') {
          for (const ev of f.evidence || []) {
            const d = await askConfirm(prompt, `Delete ${ev.name}?`, false);
            if (d === 'quit') { out(''); out('Quit. No changes were made.'); result.status = 'quit'; return result; }
            if (d === 'yes') {
              decisions.push({ action: 'delete', token: ev.name });
              out(c(ANSI.green, `  ✓ will delete ${ev.name}`));
            }
          }
        } else {
          out(`  ${f.id}: see \`polish explain ${f.id}\` for guidance, or use \`polish confirm\` with a decisions file`);
        }
      }
      if (decisions.length > 0) {
        out('');
        out(`Resolving ${decisions.length} decision(s) into patches...`);
        const resolved = resolveDecisions(decisions, graph, target);
        confirmedPatches.push(...resolved);
        out(c(ANSI.green, `  ${resolved.length} patch(es) from confirmed decisions`));
      }
    }

    // --- step 4: patch ---
    out('');
    out(c(ANSI.bold, 'Step 4 of 5 — Patch'));
    out('--------------------');
    const mechPatches = generateDiffs(actions);
    const allPatches = [...mechPatches, ...confirmedPatches];
    out(formatDiff(allPatches));
    result.patches = allPatches.length;

    if (allPatches.length === 0) {
      out('');
      out(c(ANSI.yellow, 'No patches generated. Nothing to apply.'));
      result.status = 'no-patches';
      return result;
    }

    // --- step 5: apply ---
    out('');
    out(c(ANSI.bold, 'Step 5 of 5 — Apply'));
    out('---------------------');
    out(c(ANSI.yellow, `About to modify ${allPatches.length} location(s). Backups (.backup) will be created.`));
    const decision4 = await askConfirm(prompt, 'Apply patches now?', true);
    if (decision4 === 'quit') { out(''); out('Quit. No changes were made.'); result.status = 'quit'; return result; }
    if (decision4 === 'no') { out(''); out('Aborted. No files were modified.'); result.status = 'aborted'; return result; }

    // Resolve patch file paths to absolute so apply()'s boundary check passes.
    const absPatches = allPatches.map(p => ({
      ...p,
      file: p.file ? path.resolve(target, p.file) : p.file
    }));
    const applyResult = await apply(absPatches, target);
    out(formatApply(applyResult));
    result.applied = applyResult.applied.length;
    result.failed = applyResult.failed.length;
    result.backups = applyResult.backupCount;

    if (applyResult.status === 'aborted') {
      out('');
      out(c(ANSI.yellow, 'Run aborted during pre-validation — no files were modified.'));
      result.status = 'aborted';
    } else if (applyResult.status === 'rolledBack') {
      out('');
      out(c(ANSI.yellow, 'Execution failed and the run was rolled back — check the errors above.'));
      result.status = 'rolledBack';
    } else {
      out('');
      out(c(ANSI.green, 'All patches applied. Backups are in place if you need to revert.'));
      result.status = 'completed';
    }
    return result;
  } finally {
    if (ownPrompt) close();
  }
}
