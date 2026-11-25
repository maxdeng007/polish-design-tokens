import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { scan } from '../src/scan.js';

function withFixtures(files, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'polish-parse-boundary-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(tmp, name)), { recursive: true });
      fs.writeFileSync(path.join(tmp, name), content);
    }
    return fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const refNames = (graph) => graph.references.map(r => r.name);
const danglingNames = (graph) => graph.dangling.map(d => d.name);

test('CSS comment containing var() is not a reference', () => {
  withFixtures({
    'a.css': `:root { --primary: #1a73e8; }
/* var(--from-comment) */
.card { color: var(--primary); }
`
  }, (tmp) => {
    const graph = scan(tmp);
    assert.ok(!refNames(graph).includes('--from-comment'), '--from-comment in comment must not be a reference');
    assert.ok(!danglingNames(graph).includes('--from-comment'), 'no dangling from comment text');
    assert.ok(refNames(graph).includes('--primary'), 'real reference still detected');
  });
});

test('CSS string literal containing var() is not a reference', () => {
  withFixtures({
    'a.css': `:root { --primary: #1a73e8; }
.doc { --note: "var(--from-string)"; color: var(--primary); }
`
  }, (tmp) => {
    const graph = scan(tmp);
    assert.ok(!refNames(graph).includes('--from-string'), '--from-string in string must not be a reference');
    assert.ok(!danglingNames(graph).includes('--from-string'), 'no dangling from string text');
    assert.ok(refNames(graph).includes('--primary'), 'real reference still detected');
  });
});

test('JS line comment containing var() is not a reference', () => {
  withFixtures({
    'a.js': `// var(--js-comment)
const style = { color: 'var(--primary)' };
`
  }, (tmp) => {
    const graph = scan(tmp);
    assert.ok(!refNames(graph).includes('--js-comment'), '--js-comment in line comment must not be a reference');
    assert.ok(!danglingNames(graph).includes('--js-comment'), 'no dangling from line comment');
    assert.ok(refNames(graph).includes('--primary'), 'CSS-in-JS reference still detected');
  });
});

test('JS documentation string containing var() is not a reference', () => {
  withFixtures({
    'a.js': `const documentation = "var(--from-string)";
const style = { background: 'var(--primary)' };
`
  }, (tmp) => {
    const graph = scan(tmp);
    assert.ok(!refNames(graph).includes('--from-string'), '--from-string in plain string must not be a reference');
    assert.ok(!danglingNames(graph).includes('--from-string'), 'no dangling from documentation string');
    assert.ok(refNames(graph).includes('--primary'), 'CSS-in-JS object value still detected');
  });
});

test('JS template literal containing var() is not a reference', () => {
  withFixtures({
    'a.js': `const doc = \`var(--tpl-doc)\`;
const style = { color: \`var(--primary)\` };
`
  }, (tmp) => {
    const graph = scan(tmp);
    assert.ok(!refNames(graph).includes('--tpl-doc'), '--tpl-doc in standalone template literal must not be a reference');
    assert.ok(!danglingNames(graph).includes('--tpl-doc'), 'no dangling from template literal');
    assert.ok(refNames(graph).includes('--primary'), 'template literal in CSS context still detected');
  });
});

test('JS block comment containing token declaration is not a declaration', () => {
  withFixtures({
    'a.js': `/* '--fake': '#123456' */
const tokens = { '--real': '#1a73e8' };
`
  }, (tmp) => {
    const graph = scan(tmp);
    assert.ok(!graph.declarations.some(d => d.name === '--fake'), '--fake inside block comment is not a declaration');
    assert.ok(graph.declarations.some(d => d.name === '--real'), '--real declaration still detected');
  });
});

test('reference line numbers stay correct after masked regions', () => {
  withFixtures({
    'a.css': `/* line1
   var(--commented) */
:root { --primary: #1a73e8; }
/* multi
   line
   var(--commented2) */
.card { color: var(--primary); }
`
  }, (tmp) => {
    const graph = scan(tmp);
    const ref = graph.references.find(r => r.name === '--primary');
    assert.ok(ref, '--primary reference found');
    assert.equal(ref.line, 7, 'reference line must account for multi-line comment');
  });
});

test('HTML script comment does not create declaration or reference', () => {
  withFixtures({
    'a.html': `<!doctype html>
<style>
:root { --primary: #1a73e8; }
</style>
<script>
// var(--js-comment)
const tokens = { '--bg': 'var(--primary)' };
</script>
`
  }, (tmp) => {
    const graph = scan(tmp);
    assert.ok(!refNames(graph).includes('--js-comment'), 'comment in script must not be a reference');
    assert.ok(!danglingNames(graph).includes('--js-comment'), 'no dangling from script comment');
    assert.ok(graph.declarations.some(d => d.name === '--bg'), 'script token declaration still detected');
    const bg = graph.declarations.find(d => d.name === '--bg');
    assert.ok(bg.aliases.includes('--primary'), 'reference from script value still detected as alias');
  });
});
