#!/usr/bin/env node
/**
 * Post-installation check.
 *
 * The audit itself is done by the token-audit CLI, so the only thing worth
 * verifying at install time is that the CLI can be located.
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PACKAGE_DIR = resolve(__dirname, '..');
const PROJECT_ROOT = resolve(PACKAGE_DIR, '..');

const candidates = [
  ['TOKEN_AUDIT_CLI env var', process.env.TOKEN_AUDIT_CLI],
  ['sibling package', join(PROJECT_ROOT, 'token-audit/bin/token-audit.js')],
  ['project root', join(PROJECT_ROOT, 'bin/token-audit.js')],
  ['installed dependency', join(PACKAGE_DIR, 'node_modules/token-audit/bin/token-audit.js')]
].filter(([, path]) => path);

const found = candidates.find(([, path]) => existsSync(path));

if (found) {
  console.log(`✅ token-audit CLI found (${found[0]}): ${found[1]}`);
} else {
  console.log('⚠️  token-audit CLI not found — audit_run will fail until it is available.');
  console.log('   Install it with: npm i -g token-audit');
  console.log('   Or point TOKEN_AUDIT_CLI at its absolute path.');
}
