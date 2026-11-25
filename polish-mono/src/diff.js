/**
 * diff.js — patch generation for mechanical fixes.
 *
 * Takes plan items (ranked + classified) and produces concrete patches:
 * what to replace, where, and what it becomes. Only mechanical items
 * produce patches; judgmental items are left for the agent to handle.
 *
 * Both hardcoded and dangling are judgmental: their fixes depend on
 * context that the tool cannot determine automatically. Hardcoded needs
 * a runtime observation to locate the value in source and pick a token
 * to map it to. Dangling needs a canonical value — `inherit` is not a
 * safe default because it either produces an invalid top-level custom
 * property declaration or resolves to guaranteed-invalid when the parent
 * element has no such variable.
 */

/** Extract any color value from text: hex, rgba(), hsl(), or named. */
function extractColor(text) {
  if (!text) return null;
  const v = String(text).trim();
  const hex = v.match(/#[0-9a-fA-F]{3,8}\b/);
  if (hex) return hex[0];
  const rgba = v.match(/rgba?\([^)]+\)/i);
  if (rgba) return rgba[0];
  const hsl = v.match(/hsla?\([^)]+\)/i);
  if (hsl) return hsl[0];
  return null;
}

/**
 * Generate patches for mechanical plan items.
 *
 * @param {Array} planItems — output of plan(findings)
 * @returns {Array} patches: [{type, file, line, before, after, reason, findingId}]
 */
export function generateDiffs(planItems) {
  const patches = [];
  const mechItems = planItems.filter(p => p.mechanical);

  for (const item of mechItems) {
    const f = item.finding;
    const evidence = f.evidence || [];
    const firstLoc = evidence[0] || {};

    switch (f.id) {
      case 'conflict': {
        patches.push({
          type: 'rewrite',
          file: firstLoc.file || null,
          line: firstLoc.line || null,
          before: '',
          after: '',
          reason: `${f.title} — replace with canonical value`,
          findingId: f.id
        });
        break;
      }

      case 'duplicate-value': {
        // Each evidence entry is one group of names sharing the same color.
        // Patch: make the secondary name(s) alias the primary.
        for (const ev of f.evidence || []) {
          const color = extractColor(ev.value || f.title + ' ' + (f.detail || ''));
          const primary = ev.primary;
          const secondary = ev.secondary;
          if (!primary || !secondary) continue;
          patches.push({
            type: 'replace',
            file: ev.secondaryFile || null,
            line: ev.secondaryLine || null,
            before: color || '',
            after: `var(${primary})`,
            reason: `${secondary} → alias ${primary}（${ev.value}）`,
            findingId: f.id
          });
        }
        break;
      }

      case 'namespace': {
        patches.push({
          type: 'rewrite',
          file: firstLoc.file || null,
          line: firstLoc.line || null,
          before: '',
          after: '',
          reason: f.title,
          findingId: f.id
        });
        break;
      }

      default: {
        patches.push({
          type: 'replace',
          file: firstLoc.file || null,
          line: firstLoc.line || null,
          before: '',
          after: '',
          reason: f.title,
          findingId: f.id
        });
      }
    }
  }

  return patches;
}
