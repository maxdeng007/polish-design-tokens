/**
 * Handle polish_doctor tool call.
 * Check that all dependencies are installed.
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
    install: 'npx skills add Leonxlnx/taste-skill'
  },
  {
    name: 'awesome-design-md',
    type: 'skill',
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
    install: 'Install awesome-design-md skill from repo'
  },
  {
    name: 'impeccable',
    type: 'skill',
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
    install: 'Install impeccable skill from repo'
  }
];

export async function polish_doctor(params, deps) {
  const results = [];
  let allInstalled = true;

  for (const dep of DEPENDENCIES) {
    const check = dep.check();
    if (!check.installed) allInstalled = false;
    results.push({
      name: dep.name,
      type: dep.type,
      installed: check.installed,
      path: check.path || null,
      install: check.installed ? null : dep.install
    });
  }

  return {
    status: allInstalled ? 'ok' : 'missing',
    dependencies: results,
    message: allInstalled
      ? 'All dependencies are installed.'
      : 'Some dependencies are missing. Run the install commands above.'
  };
}
