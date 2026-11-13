import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measure } from '../src/measure.js';

test('measure normalizes documents with standard fields', () => {
  const obs = measure([
    { label: 'page-a', theme: 'light', variables: { '--bg': '#1a1a2e' } }
  ]);
  assert.equal(obs.documents.length, 1);
  assert.equal(obs.documents[0].label, 'page-a');
  assert.equal(obs.documents[0].theme, 'light');
  assert.deepEqual(obs.documents[0].variables, { '--bg': '#1a1a2e' });
});

test('measure accepts alternative field names', () => {
  const obs = measure([
    { page: 'home', mode: 'dark', resolved: { '--bg': '#000' } }
  ]);
  assert.equal(obs.documents[0].label, 'home');
  assert.equal(obs.documents[0].theme, 'dark');
  assert.deepEqual(obs.documents[0].variables, { '--bg': '#000' });
});

test('measure accepts url and name as label fallbacks', () => {
  const obs = measure([
    { url: 'https://example.com', theme: 'light', variables: {} },
    { name: 'dashboard', theme: 'light', variables: {} }
  ]);
  assert.equal(obs.documents[0].label, 'https://example.com');
  assert.equal(obs.documents[1].label, 'dashboard');
});

test('measure defaults theme to default', () => {
  const obs = measure([{ label: 'p', variables: {} }]);
  assert.equal(obs.documents[0].theme, 'default');
});

test('measure defaults label to unknown', () => {
  const obs = measure([{ variables: {} }]);
  assert.equal(obs.documents[0].label, 'unknown');
});

test('measure filters out invalid documents', () => {
  const obs = measure([
    { label: 'valid', theme: 'light', variables: {} },
    null,
    undefined,
    'not an object',
    { label: 'also-valid', theme: 'dark', variables: {} }
  ]);
  assert.equal(obs.documents.length, 2);
  assert.equal(obs.documents[0].label, 'valid');
  assert.equal(obs.documents[1].label, 'also-valid');
});

test('measure handles empty array', () => {
  const obs = measure([]);
  assert.equal(obs.documents.length, 0);
});

test('measure handles non-array input gracefully', () => {
  const obs = measure(null);
  assert.equal(obs.documents.length, 0);
  const obs2 = measure('string');
  assert.equal(obs2.documents.length, 0);
});
