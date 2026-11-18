/**
 * parse — public entry for the parser module.
 *
 * The implementation lives in ./lib/parse.js (ESM). This file exists so the
 * "./parse" package export resolves; it re-exports the same API.
 */

export {
  parseCss, parseHtml, parseJs, parseSource,
  resolveVar, resolveValue, classify, refsIn, themesIn, findVarRefs,
  normalizeValue, isAlias, isKeyword, isNumericIndex
} from './lib/parse.js';
