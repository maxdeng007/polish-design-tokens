/**
 * Bundled design token reference data.
 *
 * Fallback used by polish_style_lookup when the awesome-design-md skill
 * is not installed on the machine. Each entry is a condensed reference —
 * enough to guide token decisions without the full multi-page DESIGN.md.
 *
 * Keep entries concise and token-focused. When the skill IS installed,
 * the full DESIGN.md from the skill takes precedence.
 */

export const BUNDLED_BRANDS = [
  {
    name: 'vercel',
    overview: 'Black-and-white aesthetic with sharp contrast. Minimal, technical, no decoration. Uses Geist font family.',
    colors: {
      'bg-primary': '#000000',
      'bg-secondary': '#0a0a0a',
      'bg-tertiary': '#171717',
      'text-primary': '#ffffff',
      'text-secondary': '#a1a1a1',
      'text-tertiary': '#666666',
      'border': '#333333',
      'accent': '#ffffff',
      'accent-hover': '#e5e5e5'
    },
    typography: {
      fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      baseSize: '15px',
      scale: '1.25 (major third)',
      headingWeight: 600
    },
    spacing: { baseUnit: '4px', scale: '4px grid: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64' },
    radius: '4px (cards), 0px (buttons)',
    notes: 'Borders are thin (1px). No shadows — depth comes from background contrast. Mono font for code and terminal elements.'
  },
  {
    name: 'stripe',
    overview: 'Gradient-rich, financial-grade clarity. Inter font. Deep saturated colors with smooth color transitions.',
    colors: {
      'bg-primary': '#0a2540',
      'bg-secondary': '#f6f9fc',
      'text-primary': '#0a2540',
      'text-secondary': '#425466',
      'text-inverse': '#ffffff',
      'primary': '#635bff',
      'primary-hover': '#4f46e0',
      'success': '#0a8f4e',
      'warning': '#ffae00',
      'border': '#e3e8ee'
    },
    typography: {
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      baseSize: '16px',
      scale: '1.200 (major third)',
      headingWeight: 600
    },
    spacing: { baseUnit: '4px', scale: '4px grid: 4, 8, 12, 16, 20, 24, 32, 48, 64' },
    radius: '8px (cards), 4px (buttons), 9999px (pills)',
    notes: 'Gradients are signature — use linear-gradient(135deg, #635bff, #00d4ff) for hero sections. Cards use subtle 1px borders with #e3e8ee, minimal shadows.'
  },
  {
    name: 'linear',
    overview: 'Dark-first, dense, high-contrast. Inter font. Deep backgrounds with vibrant accent colors. Feels like a pro tool.',
    colors: {
      'bg-primary': '#08090a',
      'bg-secondary': '#0f1011',
      'bg-tertiary': '#1a1b1e',
      'bg-elevated': '#232427',
      'text-primary': '#f7f8f8',
      'text-secondary': '#9a9a9a',
      'text-tertiary': '#62666d',
      'border': '#2a2b2f',
      'border-subtle': '#1e1f22',
      'accent': '#5e6ad2',
      'accent-hover': '#6e79d6'
    },
    typography: {
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      baseSize: '14px',
      scale: '1.166 (minor third) — dense by design',
      headingWeight: 600
    },
    spacing: { baseUnit: '4px', scale: '4px grid: 4, 8, 12, 16, 20, 24, 32, 40' },
    radius: '6px (default), 8px (cards), 4px (inputs)',
    notes: 'Background layers are critical — use bg-primary for app shell, bg-secondary for sidebars, bg-elevated for hover states. No shadows; depth is layered backgrounds.'
  },
  {
    name: 'notion',
    overview: 'Clean, document-first. Mixes serif headings with sans body. Neutral grays with minimal color. Calm and readable.',
    colors: {
      'bg-primary': '#ffffff',
      'bg-secondary': '#f7f7f5',
      'bg-tertiary': '#eeeeec',
      'text-primary': '#37352f',
      'text-secondary': '#787774',
      'text-tertiary': '#9b9a97',
      'border': '#e9e9e7',
      'accent': '#2383e2',
      'accent-hover': '#0b6bcb'
    },
    typography: {
      fontFamily: "'Inter', 'Lyon', -apple-system, sans-serif (serif for headings in some contexts)",
      baseSize: '16px',
      scale: '1.200 (major third)',
      headingWeight: 700
    },
    spacing: { baseUnit: '4px', scale: '4px grid: 4, 8, 12, 16, 24, 32, 48' },
    radius: '4px (default), 6px (cards), 9999px (pills)',
    notes: 'Text color #37352f is warm-dark, not pure black — reduces eye strain. Borders are warm gray (#e9e9e7), not cool gray. Minimal use of accent color.'
  },
  {
    name: 'anthropic',
    overview: 'Warm, human, Claude-inspired. Mixes serif and sans. Earthy tones with a warm cream background. Friendly but precise.',
    colors: {
      'bg-primary': '#f5f0e8',
      'bg-secondary': '#faf7f2',
      'bg-tertiary': '#efe9df',
      'text-primary': '#1a1a1a',
      'text-secondary': '#5c544a',
      'text-tertiary': '#8a8276',
      'border': '#d9d0c2',
      'accent': '#d97757',
      'accent-hover': '#c4654a'
    },
    typography: {
      fontFamily: "'Söhne', 'Inter', -apple-system, sans-serif (serif for display)",
      baseSize: '16px',
      scale: '1.250 (major third)',
      headingWeight: 600
    },
    spacing: { baseUnit: '4px', scale: '4px grid: 4, 8, 12, 16, 24, 32, 48, 64' },
    radius: '8px (cards), 6px (buttons), 12px (large surfaces)',
    notes: 'Background is warm cream (#f5f0e8), never pure white — this is the signature warmth. Accent color #d97757 (terracotta) is used sparingly for key actions.'
  },
  {
    name: 'github',
    overview: 'Utilitarian, information-dense. GitHub Sans / Octicons. Neutral grays with a blue accent. Reads like a well-organized codebase.',
    colors: {
      'bg-primary': '#0d1117',
      'bg-secondary': '#161b22',
      'bg-tertiary': '#21262d',
      'text-primary': '#e6edf3',
      'text-secondary': '#7d8590',
      'text-tertiary': '#484f58',
      'border': '#30363d',
      'border-subtle': '#21262d',
      'accent': '#2f81f7',
      'accent-hover': '#4493f8',
      'success': '#3fb950',
      'warning': '#d29922',
      'danger': '#f85149'
    },
    typography: {
      fontFamily: "'GitHub Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      baseSize: '14px',
      scale: '1.166 (minor third) — dense, information-heavy',
      headingWeight: 600
    },
    spacing: { baseUnit: '4px', scale: '4px grid: 4, 8, 12, 16, 24, 32, 40, 48' },
    radius: '6px (default), 8px (cards), 9999px (pills, badges)',
    notes: 'Semantic colors (success/warning/danger) are saturated and distinct — use them consistently for status. Border hierarchy: border-subtle for nested, border for primary dividers.'
  },
  {
    name: 'shadcn',
    overview: 'Tailwind-based, copy-paste component library. Uses CSS variables for theming. Neutral, flexible, no runtime JS for styling.',
    colors: {
      'bg-primary': 'var(--background)',
      'bg-secondary': 'var(--secondary)',
      'text-primary': 'var(--foreground)',
      'text-secondary': 'var(--muted-foreground)',
      'border': 'var(--border)',
      'accent': 'var(--primary)',
      'accent-hover': 'var(--primary) / hover'
    },
    typography: {
      fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      baseSize: '14px',
      scale: 'Tailwind default (1.250 major third)',
      headingWeight: 600
    },
    spacing: { baseUnit: '0.25rem (4px)', scale: 'Tailwind spacing scale' },
    radius: 'var(--radius) — default 0.5rem (8px), configurable via CSS variable',
    notes: 'All colors are CSS custom properties — swap the HSL values in :root to change themes. Three common base palettes: zinc (neutral cool), neutral (pure gray), slate (blue-tinted dark).'
  },
  {
    name: 'figma',
    overview: 'Design tool aesthetic. Clean whites with vibrant accents. Uses a custom sans (Figma Sans). Dense toolbar, generous workspace canvas.',
    colors: {
      'bg-primary': '#ffffff',
      'bg-secondary': '#f5f5f5',
      'bg-tertiary': '#ebebeb',
      'text-primary': '#0d0d0d',
      'text-secondary': '#6b6b6b',
      'text-tertiary': '#999999',
      'border': '#e0e0e0',
      'accent': '#a259ff',
      'accent-hover': '#8b45e0',
      'success': '#0acf83',
      'warning': '#ff9900'
    },
    typography: {
      fontFamily: "'Figma Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      baseSize: '14px',
      scale: '1.200 (major third)',
      headingWeight: 600
    },
    spacing: { baseUnit: '4px', scale: '4px grid: 4, 8, 12, 16, 20, 24, 32, 40, 48' },
    radius: '4px (inputs), 8px (cards), 12px (large panels)',
    notes: 'Accent purple (#a259ff) is the signature — used for primary actions and selection states. Selection highlight uses a light purple wash (rgba(162, 89, 255, 0.1)).'
  }
];

/**
 * Convert a bundled brand entry to the same shape the handler returns.
 * @param {object} brand - A BUNDLED_BRANDS entry
 * @returns {object} Style lookup result with formatted content
 */
export function bundledBrandToContent(brand) {
  const lines = [];
  lines.push(`# ${brand.name.charAt(0).toUpperCase() + brand.name.slice(1)} — Design Token Reference (bundled)`);
  lines.push('');
  lines.push(`> ${brand.overview}`);
  lines.push('');

  if (brand.colors) {
    lines.push('## Colors');
    lines.push('');
    lines.push('| Token | Value |');
    lines.push('|-------|-------|');
    for (const [k, v] of Object.entries(brand.colors)) {
      lines.push(`| ${k} | ${v} |`);
    }
    lines.push('');
  }

  if (brand.typography) {
    lines.push('## Typography');
    lines.push('');
    lines.push(`- **Font family:** ${brand.typography.fontFamily}`);
    lines.push(`- **Base size:** ${brand.typography.baseSize}`);
    lines.push(`- **Scale:** ${brand.typography.scale}`);
    lines.push(`- **Heading weight:** ${brand.typography.headingWeight}`);
    lines.push('');
  }

  if (brand.spacing) {
    lines.push('## Spacing');
    lines.push('');
    lines.push(`- **Base unit:** ${brand.spacing.baseUnit}`);
    lines.push(`- **Scale:** ${brand.spacing.scale}`);
    lines.push('');
  }

  if (brand.radius) {
    lines.push('## Radius');
    lines.push('');
    lines.push(`- ${brand.radius}`);
    lines.push('');
  }

  if (brand.notes) {
    lines.push('## Notes');
    lines.push('');
    lines.push(brand.notes);
    lines.push('');
  }

  lines.push('---');
  lines.push('*Bundled reference from polish-design-tokens. Install the awesome-design-md skill for the full DESIGN.md.*');

  return lines.join('\n');
}
