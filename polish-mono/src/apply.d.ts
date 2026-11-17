/**
 * polish — apply module type declarations.
 */

import type { Patch, ApplyResult } from './types.js';

/**
 * Apply a list of patches to files with automatic backup protection.
 * Each file is backed up once before the first patch touches it.
 * Failed patches don't abort the batch — they're recorded and the rest proceed.
 */
declare function apply(patches: Patch[]): Promise<ApplyResult>;

export { apply };
