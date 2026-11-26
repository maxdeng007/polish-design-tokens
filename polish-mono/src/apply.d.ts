/**
 * polish — apply module type declarations.
 */

import type { Patch, ApplyResult } from './types.js';

/**
 * Apply a list of patches to files with automatic backup protection.
 * If a target directory is provided, patches targeting files outside
 * that directory are rejected.
 *
 * The run is strictly all-or-nothing: if any patch fails pre-validation,
 * the whole run is aborted before any write (`status: 'aborted'`). If a
 * patch fails at execution time, every file written by the run is rolled
 * back (`status: 'rolledBack'`). A clean run returns `status: 'applied'`.
 */
declare function apply(patches: Patch[], target?: string): Promise<ApplyResult>;

export { apply };
