import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { polish_doctor } from '../src/handlers/polish-doctor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeTempHome() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'polish-doctor-home-'));
  return tmp;
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Create a fake skill directory in the given home so the check finds it. */
function installFakeSkill(home, name) {
  const skillDir = path.join(home, '.qoder', 'skills', name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Fake skill\n', 'utf8');
}

/**
 * Create a fake bin directory with stub `git` and `npm` executables that
 * exit with code 1 immediately. Prepending this dir to PATH makes install
 * commands fail fast, so tests can exercise the install-attempt code path
 * without actually cloning repos or installing packages.
 */
function makeFakeBin(home) {
  const binDir = path.join(home, '.fake-bin');
  fs.mkdirSync(binDir, { recursive: true });
  const stub = '#!/bin/sh\nexit 1\n';
  fs.writeFileSync(path.join(binDir, 'git'), stub, { mode: 0o755 });
  fs.writeFileSync(path.join(binDir, 'npm'), stub, { mode: 0o755 });
  return binDir;
}

// --- Default behavior (no install parameter) ---

test('polish_doctor without install returns structured results for each dependency', async () => {
  const home = makeTempHome();
  const originalHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const report = await polish_doctor({});
    assert.equal(report.status, 'ok');
    assert.ok(Array.isArray(report.dependencies));
    const names = report.dependencies.map(d => d.name);
    assert.deepEqual(names, ['dembrandt', 'taste', 'awesome-design-md', 'impeccable']);
  } finally {
    process.env.HOME = originalHome;
    cleanup(home);
  }
});

test('polish_doctor without install does not attempt installation', async () => {
  const home = makeTempHome();
  const originalHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const report = await polish_doctor({});
    for (const dep of report.dependencies) {
      assert.equal(dep.installAttempted, undefined, `${dep.name} should not have installAttempted`);
    }
  } finally {
    process.env.HOME = originalHome;
    cleanup(home);
  }
});

test('polish_doctor without install includes install commands for missing deps', async () => {
  const home = makeTempHome();
  const originalHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const report = await polish_doctor({});
    const missing = report.dependencies.filter(d => !d.installed);
    assert.ok(missing.length > 0, 'should have missing deps with empty home');
    for (const dep of missing) {
      assert.ok(dep.install, `${dep.name} should have install command`);
      assert.equal(dep.installAttempted, undefined);
    }
  } finally {
    process.env.HOME = originalHome;
    cleanup(home);
  }
});

test('polish_doctor install:false behaves same as default', async () => {
  const home = makeTempHome();
  const originalHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const def = await polish_doctor({});
    const explicit = await polish_doctor({ install: false });
    const defMissing = def.dependencies.filter(d => !d.installed).length;
    const expMissing = explicit.dependencies.filter(d => !d.installed).length;
    assert.equal(defMissing, expMissing);
    for (const dep of explicit.dependencies) {
      assert.equal(dep.installAttempted, undefined);
    }
  } finally {
    process.env.HOME = originalHome;
    cleanup(home);
  }
});

// --- Installed detection ---

test('polish_doctor detects installed skills via fake skill directories', async () => {
  const home = makeTempHome();
  installFakeSkill(home, 'taste');
  installFakeSkill(home, 'awesome-design-md');
  const originalHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const report = await polish_doctor({});
    const taste = report.dependencies.find(d => d.name === 'taste');
    assert.equal(taste.installed, true);
    assert.ok(taste.path.includes('taste'));

    const adm = report.dependencies.find(d => d.name === 'awesome-design-md');
    assert.equal(adm.installed, true);

    const impeccable = report.dependencies.find(d => d.name === 'impeccable');
    assert.equal(impeccable.installed, false);
  } finally {
    process.env.HOME = originalHome;
    cleanup(home);
  }
});

test('polish_doctor message reflects missing optional deps', async () => {
  const home = makeTempHome();
  installFakeSkill(home, 'taste');
  const originalHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const report = await polish_doctor({});
    const missingCount = report.dependencies.filter(d => !d.installed).length;
    assert.ok(report.message.includes('optional'), 'should mention optional');
    assert.ok(report.message.includes(String(missingCount)), `should mention ${missingCount} missing`);
  } finally {
    process.env.HOME = originalHome;
    cleanup(home);
  }
});

// --- Install: true behavior ---

test('polish_doctor install:true does not attempt install for already-installed deps', async () => {
  const home = makeTempHome();
  installFakeSkill(home, 'taste');
  installFakeSkill(home, 'awesome-design-md');
  installFakeSkill(home, 'impeccable');
  const originalHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const report = await polish_doctor({ install: true });
    const installed = report.dependencies.filter(d => d.installed);
    for (const dep of installed) {
      assert.equal(dep.installAttempted, undefined, `${dep.name} is installed, should not attempt install`);
    }
  } finally {
    process.env.HOME = originalHome;
    cleanup(home);
  }
});

test('polish_doctor install:true marks missing deps as attempted when install fails', async () => {
  const home = makeTempHome();
  const binDir = makeFakeBin(home);
  const originalHome = process.env.HOME;
  const originalPath = process.env.PATH;
  process.env.HOME = home;
  process.env.PATH = binDir + path.delimiter + originalPath;
  try {
    const report = await polish_doctor({ install: true });
    const missingDeps = report.dependencies.filter(d => !d.installed);
    assert.ok(missingDeps.length > 0, 'should have missing deps');
    for (const dep of missingDeps) {
      assert.equal(dep.installAttempted, true, `${dep.name} should have installAttempted=true`);
      assert.ok(dep.installResult, `${dep.name} should have installResult`);
      assert.equal(dep.installResult, 'failed', `${dep.name} install should fail with stubbed git/npm`);
      assert.ok(dep.installError, `${dep.name} should have installError on failure`);
    }
  } finally {
    process.env.HOME = originalHome;
    process.env.PATH = originalPath;
    cleanup(home);
  }
});

test('polish_doctor install:true marks deps as installed on successful install', async () => {
  // Create fake git that succeeds and writes the expected skill files for
  // the repo being cloned. The install command for each skill clones a
  // specific repo URL; the stub detects which skill from the URL and
  // creates only that skill's directory, so each dep independently goes
  // through the install-attempt path.
  const home = makeTempHome();
  const binDir = path.join(home, '.fake-bin');
  fs.mkdirSync(binDir, { recursive: true });

  const gitStub = `#!/bin/sh
case "$*" in
  *Leonxlnx/taste-skill*)
    mkdir -p "$HOME/.qoder/skills/taste"
    echo "# Fake" > "$HOME/.qoder/skills/taste/SKILL.md"
    ;;
  *VoltAgent/awesome-design-md*)
    mkdir -p "$HOME/.qoder/skills/awesome-design-md"
    echo "# Fake" > "$HOME/.qoder/skills/awesome-design-md/SKILL.md"
    ;;
  *pbakaus/impeccable*)
    mkdir -p "$HOME/.qoder/skills/impeccable"
    echo "# Fake" > "$HOME/.qoder/skills/impeccable/SKILL.md"
    ;;
esac
exit 0
`;
  fs.writeFileSync(path.join(binDir, 'git'), gitStub, { mode: 0o755 });
  fs.writeFileSync(path.join(binDir, 'npm'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });

  const originalHome = process.env.HOME;
  const originalPath = process.env.PATH;
  process.env.HOME = home;
  process.env.PATH = binDir + path.delimiter + originalPath;
  try {
    const report = await polish_doctor({ install: true });
    const skills = report.dependencies.filter(d => d.type === 'skill');
    for (const dep of skills) {
      assert.equal(dep.installed, true, `${dep.name} should be installed after successful install`);
      assert.equal(dep.installAttempted, true, `${dep.name} should have installAttempted=true`);
      assert.equal(dep.installResult, 'success', `${dep.name} should have installResult=success`);
    }
  } finally {
    process.env.HOME = originalHome;
    process.env.PATH = originalPath;
    cleanup(home);
  }
});

test('polish_doctor returns message all installed when everything is present', async () => {
  const home = makeTempHome();
  installFakeSkill(home, 'taste');
  installFakeSkill(home, 'awesome-design-md');
  installFakeSkill(home, 'impeccable');
  const originalHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const report = await polish_doctor({});
    // dembrandt might or might not be installed depending on the machine
    const allInstalled = report.dependencies.every(d => d.installed);
    if (allInstalled) {
      assert.ok(report.message.includes('All dependencies'));
    } else {
      assert.ok(report.message.includes('optional'));
    }
  } finally {
    process.env.HOME = originalHome;
    cleanup(home);
  }
});
