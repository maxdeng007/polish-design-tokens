import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

import { scan } from '../src/scan.js';
import { cross } from '../src/cross.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = path.join(__dirname, '.smoke-e2e-tmp');
const BIN = path.resolve(__dirname, '../bin/polish.mjs');
const NODE = process.execPath;

function runCli(args) {
  return spawnSync(NODE, [BIN, ...args], { encoding: 'utf8' });
}

test('smoke: single-line CSS seed → chosenName edit → confirm → re-audit is clean', () => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  // Compressed single-line CSS: the shape that triggered every 1.10.0 bug —
  // line drift, dead chosenName, add outside :root, half-applied success.
  fs.writeFileSync(
    path.join(TMP_DIR, 'a.css'),
    'a{color:#fff;background:#fff;border-radius:8px}',
    'utf8'
  );
  const dir = TMP_DIR;

  const seedResult = runCli(['seed', dir]);
  assert.equal(seedResult.status, 0, `seed should succeed: ${seedResult.stderr}`);

  const seedFile = path.join(dir, 'tokens.seed.json');
  const seedData = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
  assert.ok(seedData.map.length > 0, 'the repeated #fff must form one cluster');
  seedData.map[0].chosenName = '--color-canvas';
  fs.writeFileSync(seedFile, JSON.stringify(seedData, null, 2), 'utf8');

  const confirmResult = runCli(['confirm', seedFile, `--target=${dir}`]);
  assert.equal(confirmResult.status, 0, `confirm should succeed: ${confirmResult.stderr}${confirmResult.stdout}`);

  const css = fs.readFileSync(path.join(dir, 'a.css'), 'utf8');
  assert.equal(css.match(/var\(--color-canvas\)/g).length, 2, 'both #fff occurrences tokenized');
  assert.ok(!css.includes('#fff'), 'no literal remains in the source');
  const tokens = fs.readFileSync(path.join(dir, 'tokens.css'), 'utf8');
  assert.ok(tokens.includes('--color-canvas: #fff;'), 'declaration renamed to chosen name');
  assert.ok(!tokens.includes('--color-1'), 'no stale provisional name left behind');

  // Re-audit the modified project: zero findings, no duplicate value, no
  // lingering literal cluster.
  const report = cross(scan(dir));
  const bad = (report.findings || []).filter(
    f => f.id === 'literal-cluster' || f.id === 'duplicate-value'
  );
  assert.deepEqual(bad, [], 're-audit must report no literal-cluster / duplicate-value findings');

  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});
