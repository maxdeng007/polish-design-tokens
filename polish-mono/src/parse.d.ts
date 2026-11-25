/**
 * polish — parse module type declarations.
 *
 * Mirrors the "./parse" package export, which re-exports the parser API
 * from ./lib/parse.js.
 */

import type { Declaration, Reference, TokenKind } from './types.js';

/** Result of parsing a single source file. */
export interface ParseResult {
  declarations: Declaration[];
  references: Reference[];
}

/** A var(--name[, fallback]) reference occurrence within a value. */
export interface VarRef {
  start: number;
  end: number;
  name: string;
  fallback: string | null;
  text: string;
}

/** Parse a CSS (or CSS-like) source string. */
declare function parseCss(text: string, file?: string): ParseResult;

/** Parse an HTML source string (style blocks and inline attributes). */
declare function parseHtml(text: string, file?: string): ParseResult;

/** Options for parseJs(). */
export interface ParseJsOptions {
  /** Treat .jsx/.tsx files as JSX (tag attributes in scope). */
  jsx?: boolean;
}

/** Parse a JavaScript/TypeScript source string. */
declare function parseJs(text: string, file?: string, opts?: ParseJsOptions): ParseResult;

/** Parse a source string, dispatching on the file extension. */
declare function parseSource(text: string, file?: string): ParseResult;

/** Classify a value into a TokenKind. */
declare function classify(value: string): TokenKind;

/** Return all var(--name) reference names inside a value. */
declare function refsIn(value: string): string[];

/** Return all var(--name) references (with positions) inside a value. */
declare function findVarRefs(value: string): VarRef[];

/** Return theme names referenced via data-theme / theme attributes. */
declare function themesIn(text: string): string[];

/** Resolve a var() reference chain to its final literal value. */
declare function resolveValue(raw: string, byName: Record<string, string>, seen?: Set<string>): string | null;

/** Resolve a single custom property name to its final literal value. */
declare function resolveVar(name: string, byName: Record<string, string>, seen?: Set<string>): string | null;

/** True when the value is a var(--name) alias reference. */
declare function isAlias(value: string): boolean;

/** True when the value is one of the reserved keywords (inherit, initial, ...). */
declare function isKeyword(value: string): boolean;

/** True when the value is a plain numeric index. */
declare function isNumericIndex(value: string): boolean;

/** Normalize a value for comparison (lowercase, trim, collapse). */
declare function normalizeValue(value: string): string;

export {
  parseCss, parseHtml, parseJs, parseSource,
  resolveVar, resolveValue, classify, refsIn, themesIn, findVarRefs,
  normalizeValue, isAlias, isKeyword, isNumericIndex
};
