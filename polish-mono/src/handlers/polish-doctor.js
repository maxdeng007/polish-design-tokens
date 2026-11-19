/**
 * Handle polish_doctor tool call.
 * Check that all dependencies are installed.
 * Gracefully degrades: missing skills are reported with install instructions
 * and marked optional — they are not errors.
 * @param {object} params - Tool parameters
 * @param {object} deps - Dependencies
 * @returns {Promise<object>} Doctor report
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const DEPENDENCIES = [
  {
    name: 'dembrandt',
    type: 'npm',
    optional: true,
    check: () => {
      const candidates = [
        path.join(process.env.HOME || '', '.npm-global/bin/dembrandt'),
        '/usr/local/bin/dembrandt',
        '/opt/homebrew/bin/dembrandt'
      ];
      for (const c of candidates) {
        try { fs.accessSync(c, fs.constants.X_OK); return { installed: true, path: c }; } catch {}
      }
      try { require.resolve('dembrandt'); return { installed: true, path: 'node_modules' }; } catch { return { installed: false }; }
    },
    install: 'npm install -g dembrandt'
  },
  {
    name: 'taste',
    type: 'skill',
    optional: true,
    check: () => {
      const dirs = [
        path.join(process.env.HOME || '', '.qoder/skills/taste'),
        path.join(process.env.HOME || '', '.claude/skills/taste'),
        path.join(process.env.HOME || '', '.config/qoder/skills/taste')
      ];
      for (const d of dirs) {
        try { fs.accessSync(path.join(d, 'SKILL.md'), fs.constants.R_OK); return { installed: true, path: d }; } catch {}
      }
      return { installed: false };
    },
    install: 'git clone --depth 1 https://github.com/Leonxlnx/taste-skill /tmp/taste-skill && mkdir -p ~/.qoder/skills && cp -r /tmp/taste-skill/skills/taste-skill ~/.qoder/skills/taste && rm -rf /tmp/taste-skill'
  },
  {
    name: 'awesome-design-md',
    type: 'skill',
    optional: true,
    check: () => {
      const dirs = [
        path.join(process.env.HOME || '', '.qoder/skills/awesome-design-md'),
        path.join(process.env.HOME || '', '.claude/skills/awesome-design-md'),
        path.join(process.env.HOME || '', '.config/qoder/skills/awesome-design-md')
      ];
      for (const d of dirs) {
        try { fs.accessSync(path.join(d, 'SKILL.md'), fs.constants.R_OK); return { installed: true, path: d }; } catch {}
      }
      return { installed: false };
    },
    install: 'git clone --depth 1 https://github.com/VoltAgent/awesome-design-md /tmp/adm && mkdir -p ~/.qoder/skills/awesome-design-md/references && for d in /tmp/adm/design-md/*/; do cp "$d/DESIGN.md" ~/.qoder/skills/awesome-design-md/references/$(basename "$d").md 2>/dev/null; done && printf -- \'---\nname: awesome-design-md\ndescription: Curated collection of DESIGN.md files from popular brand design systems.\n---\n\n# Awesome DESIGN.md\nSee references/ for available brand design systems.\n\' > ~/.qoder/skills/awesome-design-md/SKILL.md && rm -rf /tmp/adm'
  },
  {
    name: 'impeccable',
    type: 'skill',
    optional: true,
    check: () => {
      const dirs = [
        path.join(process.env.HOME || '', '.qoder/skills/impeccable'),
        path.join(process.env.HOME || '', '.claude/skills/impeccable'),
        path.join(process.env.HOME || '', '.config/qoder/skills/impeccable')
      ];
      for (const d of dirs) {
        try { fs.accessSync(path.join(d, 'SKILL.md'), fs.constants.R_OK); return { installed: true, path: d }; } catch {}
      }
      return { installed: false };
    },
    install: 'git clone --depth 1 https://github.com/pbakaus/impeccable /tmp/impeccable && mkdir -p ~/.qoder/skills && cp -r /tmp/impeccable/.qoder/skills/impeccable ~/.qoder/skills/impeccable && rm -rf /tmp/impeccable'
  }
];

export async function polish_doctor(params, deps) {
  const results = [];
  let optionalMissing = 0;

  for (const dep of DEPENDENCIES) {
    const check = dep.check();
    if (!check.installed && dep.optional) optionalMissing++;
    results.push({
      name: dep.name,
      type: dep.type,
      optional: dep.optional,
      installed: check.installed,
      path: check.path || null,
      install: check.installed ? null : dep.install
    });
  }

  return {
    status: 'ok',
    dependencies: results,
    message: optionalMissing > 0
      ? `Core dependencies are installed. ${optionalMissing} optional dependency/dependencies not found — these enhance the experience but are not required for token auditing.`
      : 'All dependencies are installed.'
  };
}
