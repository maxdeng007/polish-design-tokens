/**
 * diff.js — patch generation for mechanical fixes.
 *
 * Takes plan items (ranked + classified) and produces concrete patches:
 * what to replace, where, and what it becomes. Only mechanical items
 * produce patches; judgmental items are left for the agent to handle.
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

/** Extract a CSS value (px, rem, em) from a finding title or detail string. */
function extractLength(text) {
  if (!text) return null;
  const m = String(text).match(/\b\d+(?:\.\d+)?(?:px|rem|em)\b/);
  return m ? m[0] : null;
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
      case 'hardcoded': {
        const color = extractColor(f.title + ' ' + (f.detail || ''));
        const len = extractLength(f.title + ' ' + (f.detail || ''));
        const rawValue = color || len || '';
        let tokenName;
        if (color) tokenName = `var(--color-${color.replace(/^#/, '').replace(/[^a-zA-Z0-9]/g, '')})`;
        else if (len) tokenName = `var(--space-${len})`;
        else tokenName = 'var(--token-value)';

        patches.push({
          type: 'replace',
          file: firstLoc.file || null,
          line: firstLoc.line || null,
          before: rawValue,
          after: tokenName,
          reason: f.title,
          findingId: f.id
        });
        break;
      }

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

      case 'dangling': {
        const name = firstLoc.name || '--token';
        patches.push({
          type: 'add',
          file: firstLoc.file || null,
          line: firstLoc.line || null,
          before: '',
          after: `${name}: var(--token-default);`,
          reason: f.title,
          findingId: f.id
        });
        break;
      }

      case 'namespace': {
        patches.push({
          type: 'rename',
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
