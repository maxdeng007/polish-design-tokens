/**
 * polish — cross module type declarations.
 */

import type { DeclarationGraph, AuditReport, RuntimeObservation } from './types.js';

/**
 * Cross-reference declarations and references to judge what is wrong.
 * Takes the FACTS from scan (and optionally observations from measure)
 * and produces an AuditReport with classified findings.
 */
declare function cross(graph: DeclarationGraph, observation?: RuntimeObservation): AuditReport;

/** Get the naming family of a token name. `--nm-color-bg` → `nm`. */
declare function familyOf(name: string): string;

/** Check if two selectors differ only by state modifier classes. */
declare function isStateVariant(a: string, b: string): boolean;

/** Split a selector string into its component CSS class names. */
declare function selectorClasses(selector: string): string[];

export { cross, familyOf, isStateVariant, selectorClasses };
