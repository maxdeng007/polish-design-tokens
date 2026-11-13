import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Set HOME to a non-existent directory so the awesome-design-md skill
// is never found, simulating a fresh machine. Must happen before dynamic import.
const FAKE_HOME = path.join(os.tmpdir(), 'polish-test-fake-home-' + Date.now());
fs.mkdirSync(FAKE_HOME, { recursive: true });
process.env.HOME = FAKE_HOME;

const { polish_style_lookup } = await import('../src/handlers/polish-style-lookup.js');

test('no skill, no brand — returns bundled brand list', async () => {
  const result = await polish_style_lookup({}, {});
  assert.equal(result.found, false);
  assert.equal(result.available, true);
  assert.equal(result.source, 'bundled');
  assert.ok(Array.isArray(result.availableBrands));
  assert.ok(result.availableBrands.includes('vercel'));
  assert.ok(result.availableBrands.includes('stripe'));
  assert.ok(result.availableBrands.includes('linear'));
});

test('no skill, valid brand — returns bundled content', async () => {
  const result = await polish_style_lookup({ brand: 'vercel' }, {});
  assert.equal(result.found, true);
  assert.equal(result.available, true);
  assert.equal(result.source, 'bundled');
  assert.equal(result.brand, 'vercel');
  assert.ok(typeof result.content === 'string');
  assert.ok(result.content.includes('# Vercel'));
  assert.ok(result.content.includes('Colors'));
  assert.ok(result.content.includes('Typography'));
  assert.ok(result.content.includes('bundled'));
});

test('no skill, valid brand with substring — returns bundled content', async () => {
  const result = await polish_style_lookup({ brand: 'strip' }, {});
  assert.equal(result.found, true);
  assert.equal(result.source, 'bundled');
  assert.equal(result.brand, 'stripe');
});

test('no skill, invalid brand — returns error with available list', async () => {
  const result = await polish_style_lookup({ brand: 'nonexistentbrand' }, {});
  assert.equal(result.found, false);
  assert.equal(result.available, true);
  assert.equal(result.source, 'bundled');
  assert.ok(result.error.includes('nonexistentbrand'));
  assert.ok(Array.isArray(result.availableBrands));
  assert.ok(result.availableBrands.length > 0);
});

test('bundled content includes key token sections for each brand', async () => {
  const brands = ['vercel', 'stripe', 'linear', 'notion', 'anthropic', 'github', 'shadcn', 'figma'];
  for (const brand of brands) {
    const result = await polish_style_lookup({ brand }, {});
    assert.equal(result.found, true, `${brand} should be found`);
    assert.equal(result.source, 'bundled');
    assert.ok(result.content.includes('Colors'), `${brand} should have Colors section`);
    assert.ok(result.content.includes('Typography'), `${brand} should have Typography section`);
    assert.ok(result.content.includes('Spacing'), `${brand} should have Spacing section`);
  }
});

test('bundled vercel content includes signature black background', async () => {
  const result = await polish_style_lookup({ brand: 'vercel' }, {});
  assert.ok(result.content.includes('#000000'));
  assert.ok(result.content.includes('#ffffff'));
  assert.ok(result.content.includes('Geist'));
});

test('bundled anthropic content includes warm cream background', async () => {
  const result = await polish_style_lookup({ brand: 'anthropic' }, {});
  assert.ok(result.content.includes('#f5f0e8'));
  assert.ok(result.content.includes('#d97757'));
});

test('no skill, brand param is case-insensitive', async () => {
  const result = await polish_style_lookup({ brand: 'VERCEL' }, {});
  assert.equal(result.found, true);
  assert.equal(result.brand, 'vercel');
});

test('no skill, brand param with whitespace is trimmed', async () => {
  const result = await polish_style_lookup({ brand: '  linear  ' }, {});
  assert.equal(result.found, true);
  assert.equal(result.brand, 'linear');
});
