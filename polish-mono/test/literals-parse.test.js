import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSource } from '../src/parse.js';

test('parseCss: whitelisted property collects scalar literal', () => {
  const r = parseSource('a{color:#fff}', 'a.css');
  assert.equal(r.literals.length, 1);
  assert.deepEqual(r.literals[0], {
    value: '#fff', normalized: '#ffffff', kind: 'color',
    property: 'color', file: 'a.css', line: 1
  });
});

test('parseCss: property outside whitelist is not collected', () => {
  const r = parseSource('a{margin:8px}', 'a.css');
  assert.equal(r.literals.length, 0);
});

test('parseCss: non-scalar component skips the whole value', () => {
  const r = parseSource('a{background:#fff url(x.png)}', 'a.css');
  assert.equal(r.literals.length, 0);
});

test('parseCss: scalar components on one line yield two occurrences', () => {
  const r = parseSource('a{padding:8px 16px}', 'a.css');
  assert.equal(r.literals.length, 2);
  assert.deepEqual(r.literals.map(l => l.value), ['8px', '16px']);
  assert.equal(r.literals[0].line, 1);
  assert.equal(r.literals[1].line, 1);
});

test('parseCss: var() values are skipped', () => {
  const r = parseSource('a{color:var(--x)}', 'a.css');
  assert.equal(r.literals.length, 0);
});

test('parseCss: named colors are matched as-is, never normalized', () => {
  const r = parseSource('a{color:white} b{color:#fff}', 'a.css');
  assert.deepEqual(r.literals.map(l => l.normalized), ['white', '#ffffff']);
});

test('parseCss: quoted values are not literals', () => {
  const r = parseSource('a{color:"#fff"}', 'a.css');
  assert.equal(r.literals.length, 0);
});

test('parseCss: comments never produce literals', () => {
  const r = parseSource('a{/* padding: 8px */}', 'a.css');
  assert.equal(r.literals.length, 0);
});

test('parseCss: line numbers follow the declaration', () => {
  const r = parseSource('a{\nb{color:#fff}\n}', 'a.css');
  assert.equal(r.literals[0].line, 2);
});

test('parseHtml: inline style attribute is collected', () => {
  const r = parseSource('<div style="padding:8px 16px">x</div>', 'a.html');
  assert.equal(r.literals.length, 2);
  assert.equal(r.literals[0].file, 'a.html');
});

test('parseHtml: <style> block is collected', () => {
  const r = parseSource('<style>\na{color:#fff}\n</style>', 'a.html');
  assert.equal(r.literals.length, 1);
  assert.equal(r.literals[0].line, 2);
});

test('parseJs: JSX style object is collected', () => {
  const src = 'const A = () => <div style={{ background: "#fff", padding: "8px" }} />;';
  const r = parseSource(src, 'a.jsx');
  assert.equal(r.literals.length, 2);
  assert.deepEqual(r.literals.map(l => l.value), ['#fff', '8px']);
  assert.equal(r.literals[0].line, 1);
});

test('parseJs: setProperty with whitelisted property is collected', () => {
  const r = parseSource("el.setProperty('color', '#fff');", 'a.js');
  assert.equal(r.literals.length, 1);
  assert.equal(r.literals[0].value, '#fff');
  assert.equal(r.literals[0].property, 'color');
});

test('parseJs: non-CSS-context string is not collected', () => {
  const r = parseSource('const doc = "color: #fff";', 'a.js');
  assert.equal(r.literals.length, 0);
});
