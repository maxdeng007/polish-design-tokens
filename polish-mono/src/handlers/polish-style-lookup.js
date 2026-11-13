/**
 * Handle polish_style_lookup tool call.
 * Look up a style target from awesome-design-md's DESIGN.md collection.
 * Degrades gracefully: if the skill is not installed, returns a clear
 * "not found" message with install guidance instead of an error.
 * @param {object} params - Tool parameters
 * @param {string} [params.brand] - Brand name to look up (e.g. "vercel", "stripe")
 * @param {object} deps - Dependencies
 * @returns {Promise<object>} Style lookup result
 */
import fs from 'fs';
import path from 'path';

const SKILL_CANDIDATES = [
  path.join(process.env.HOME || '', '.qoder/skills/awesome-design-md'),
  path.join(process.env.HOME || '', '.claude/skills/awesome-design-md'),
  path.join(process.env.HOME || '', '.config/qoder/skills/awesome-design-md')
];

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
  const skillDir = findSkillDir();
  if (!skillDir) {
    return {
      found: false,
      available: false,
      error: 'awesome-design-md skill is not installed on this machine',
      searched: SKILL_CANDIDATES,
      install: 'Clone the awesome-design-md skill and add it to your skills directory (~/.qoder/skills/awesome-design-md or ~/.claude/skills/awesome-design-md)',
      note: 'This is an optional skill. Without it, style lookup cannot find DESIGN.md references. All other polish tools work without it.'
    };
  }

  const files = findDesignFiles(skillDir);
  if (files.length === 0) {
    return {
      found: false,
      available: true,
      error: 'No DESIGN.md files found in awesome-design-md skill',
      skillDir,
      note: 'The skill is installed but contains no DESIGN.md files. Check the skill repository for the correct structure.'
    };
  }

  const brand = (params.brand || '').toLowerCase().trim();

  if (!brand) {
    return {
      found: false,
      available: true,
      error: 'brand parameter is required',
      available: files.map(f => f.name).sort()
    };
  }

  const match = files.find(f => f.name === brand || f.name.includes(brand));
  if (!match) {
    return {
      found: false,
      available: true,
      error: `No DESIGN.md found for brand "${brand}"`,
      available: files.map(f => f.name).sort()
    };
  }

  const content = fs.readFileSync(match.path, 'utf8');
  return {
    found: true,
    available: true,
    brand: match.name,
    path: match.path,
    content
  };
}
