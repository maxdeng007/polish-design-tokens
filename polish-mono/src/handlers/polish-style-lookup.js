/**
 * Handle polish_style_lookup tool call.
 * Look up a style target from awesome-design-md's DESIGN.md collection.
 * Falls back to bundled design token references when the skill is not
 * installed, so the tool is useful on fresh machines.
 * @param {object} params - Tool parameters
 * @param {string} [params.brand] - Brand name to look up (e.g. "vercel", "stripe")
 * @param {object} deps - Dependencies
 * @returns {Promise<object>} Style lookup result
 */
import fs from 'fs';
import path from 'path';
import { BUNDLED_BRANDS, bundledBrandToContent } from './bundled-design-md.js';

const SKILL_CANDIDATES = [
  path.join(process.env.HOME || '', '.qoder/skills/awesome-design-md'),
  path.join(process.env.HOME || '', '.claude/skills/awesome-design-md'),
  path.join(process.env.HOME || '', '.config/qoder/skills/awesome-design-md')
];

function bundledBrandNames() {
  return BUNDLED_BRANDS.map(b => b.name);
}

function findBundledBrand(brand) {
  return BUNDLED_BRANDS.find(b => b.name === brand || b.name.includes(brand));
}

function findSkillDir() {
  for (const d of SKILL_CANDIDATES) {
    try {
      fs.accessSync(path.join(d, 'SKILL.md'), fs.constants.R_OK);
      return d;
    } catch {}
  }
  return null;
}

function findDesignFiles(dir) {
  const files = [];

  // Check references/ subdirectory for brand .md files
  const refDir = path.join(dir, 'references');
  try {
    const entries = fs.readdirSync(refDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.md')) {
        files.push({
          name: e.name.replace(/\.md$/i, '').toLowerCase(),
          path: path.join(refDir, e.name)
        });
      }
    }
  } catch {}

  // Fallback: check root for design.md files
  if (files.length === 0) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isFile() && e.name.toLowerCase().endsWith('design.md')) {
          files.push({
            name: e.name.replace(/\.design\.md$/i, '').toLowerCase(),
            path: path.join(dir, e.name)
          });
        }
      }
    } catch {}
  }

  return files;
}

export async function polish_style_lookup(params, deps) {
  const brand = (params.brand || '').toLowerCase().trim();
  const skillDir = findSkillDir();

  if (!skillDir) {
    // No skill installed — use bundled fallback data
    if (!brand) {
      return {
        found: false,
        available: true,
        source: 'bundled',
        error: 'brand parameter is required (skill not installed; showing bundled brands)',
        availableBrands: bundledBrandNames()
      };
    }

    const bundled = findBundledBrand(brand);
    if (bundled) {
      return {
        found: true,
        available: true,
        source: 'bundled',
        brand: bundled.name,
        content: bundledBrandToContent(bundled)
      };
    }

    return {
      found: false,
      available: true,
      source: 'bundled',
      error: `No design reference found for brand "${brand}" (skill not installed; showing bundled brands)`,
      availableBrands: bundledBrandNames(),
      note: 'Install the awesome-design-md skill for the full DESIGN.md collection: git clone into ~/.qoder/skills/awesome-design-md'
    };
  }

  // Skill is installed — search its DESIGN.md files first
  const files = findDesignFiles(skillDir);

  if (files.length === 0) {
    // Skill installed but no files — fall back to bundled
    if (!brand) {
      return {
        found: false,
        available: true,
        source: 'bundled',
        error: 'No DESIGN.md files in skill; showing bundled brands',
        skillDir,
        availableBrands: bundledBrandNames()
      };
    }

    const bundled = findBundledBrand(brand);
    if (bundled) {
      return {
        found: true,
        available: true,
        source: 'bundled',
        brand: bundled.name,
        skillDir,
        content: bundledBrandToContent(bundled)
      };
    }

    return {
      found: false,
      available: true,
      source: 'bundled',
      error: `No design reference found for brand "${brand}"`,
      skillDir,
      availableBrands: bundledBrandNames()
    };
  }

  if (!brand) {
    return {
      found: false,
      available: true,
      source: 'skill',
      error: 'brand parameter is required',
      availableBrands: files.map(f => f.name).sort()
    };
  }

  const match = files.find(f => f.name === brand || f.name.includes(brand));
  if (match) {
    const content = fs.readFileSync(match.path, 'utf8');
    return {
      found: true,
      available: true,
      source: 'skill',
      brand: match.name,
      path: match.path,
      content
    };
  }

  // Brand not in skill files — try bundled fallback
  const bundled = findBundledBrand(brand);
  if (bundled) {
    return {
      found: true,
      available: true,
      source: 'bundled',
      brand: bundled.name,
      skillDir,
      content: bundledBrandToContent(bundled)
    };
  }

  return {
    found: false,
    available: true,
    source: 'skill',
    error: `No DESIGN.md found for brand "${brand}"`,
    availableBrands: files.map(f => f.name).sort()
  };
}
