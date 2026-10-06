import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forbiddenTerms, scanPayload } from '../src/leakage.ts';

const terms = forbiddenTerms([{ id: 's07', target: 't', summary: '', fix: '', patch: 'patches/abc123def0.diff' }]);
const payload = (failure: Record<string, unknown>) =>
  JSON.stringify({ totals: { passed: 1, failed: 0, flaky: 1, skipped: 0 }, failures: [{ outcome: 'flaky', errors: [], ...failure }] });

test('a clean payload passes, including the schema\'s own "flaky" key and outcome', () => {
  assert.deepEqual(scanPayload(payload({ title: 'Product info › shows the price' }), terms), []);
});

test('category words, scenario ids and patch names are caught anywhere in a value', () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ title: 'Product info › a product bug' }, 'product bug'],
    [{ errors: ['looks flaky to me'] }, 'flaky'],
    [{ page: { snapshot: '- text: Environment check' } }, 'Environment'],
    [{ context: '// seeded by s07' }, 'seeded'],
    [{ context: 'see s07' }, 's07'],
    [{ errors: ['at abc123def0.diff'] }, 'abc123def0'],
  ];
  for (const [failure, match] of cases) {
    const hits = scanPayload(payload(failure), terms);
    assert.ok(hits.some((h) => h.match === match), `expected "${match}" in ${JSON.stringify(hits)}`);
  }
});

test('words that merely contain a term are not hits', () => {
  assert.deepEqual(scanPayload(payload({ errors: ['environmentally debugged, s070'] }), terms), []);
});
