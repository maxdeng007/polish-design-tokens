/**
 * polish — rollback module type declarations.
 */

import type { RollbackResult } from './types.js';

/**
 * Restore files from the backup manifest produced by an apply() run.
 * Only files within the target directory are restored; other entries are
 * refused. A missing backup is reported as failed and the file is left
 * untouched.
 */
declare function rollback(entries: Array<{ file: string; backup: string }>, target?: string): Promise<RollbackResult>;

export { rollback };
