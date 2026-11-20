/**
 * report.js — HTML report generation.
 */

import type { AuditReport } from './types.d.ts';

/** Generate a self-contained HTML report string from an audit report. */
export function generateReport(report: AuditReport): string;
