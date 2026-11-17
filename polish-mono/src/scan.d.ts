/**
 * polish — scan module type declarations.
 */

import type { DeclarationGraph } from './types.js';

/** Options for scan(). */
export interface ScanOptions {
  /** Comma-separated glob-ish substrings to skip. */
  ignore?: string;
}

/**
 * Walk a source tree, parse custom-property declarations and var()
 * references, resolve alias chains, and emit a DeclarationGraph.
 */
declare function scan(target: string, opts?: ScanOptions): DeclarationGraph;

/** Walk a directory tree and return matching file paths. */
declare function walk(root: string, out?: string[]): string[];

export { scan, walk };
