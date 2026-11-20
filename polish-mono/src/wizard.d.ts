/**
 * polish — interactive wizard type declarations.
 */

import type { WizardOptions, WizardResult } from './types.js';

/**
 * Run the interactive wizard. Walks the user through
 * audit → plan → diff → apply with confirmation prompts.
 *
 * @param opts - Initial target, ignore patterns, and injectable I/O.
 * @returns A summary of what the wizard did.
 */
declare function runWizard(opts?: WizardOptions): Promise<WizardResult>;

export { runWizard };
export type { WizardOptions, WizardResult } from './types.js';
