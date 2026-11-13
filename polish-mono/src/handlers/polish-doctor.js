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
    optional: false,
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
    install: 'Add the taste skill to your Qoder/Claude skills directory'
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
    install: 'Clone awesome-design-md and add it to your skills directory'
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
    install: 'Add the impeccable skill to your Qoder/Claude skills directory'
  }
];

export async function polish_doctor(params, deps) {
  const results = [];
  let requiredMissing = false;
  let optionalMissing = 0;

  for (const dep of DEPENDENCIES) {
    const check = dep.check();
    if (!check.installed && !dep.optional) requiredMissing = true;
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

  const status = requiredMissing ? 'missing' : 'ok';

  return {
    status,
    dependencies: results,
    message: requiredMissing
      ? 'Required dependency dembrandt is missing. Run the install command above.'
      : optionalMissing > 0
        ? `Core dependencies are installed. ${optionalMissing} optional skill(s) not found — these enhance the experience but are not required for token auditing.`
        : 'All dependencies are installed.'
  };
}
