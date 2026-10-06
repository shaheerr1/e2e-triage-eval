/**
 * Metric functions against a hand-worked example.
 *
 * Six failures, one repeat:
 *
 *   truth         predicted     confidence
 *   product_bug   product_bug   high    ✓
 *   product_bug   test_bug      high    ✗
 *   test_bug      test_bug      low     ✓
 *   flaky         flaky         high    ✓
 *   environment   environment   medium  ✓
 *   environment   unknown       low     ✗
 *
 * Accuracy 4/6. Wilson 95% for 4/6, by hand:
 *   p = 0.6667, z² = 3.8415, denom = 1 + 3.8415/6 = 1.64025
 *   centre = (0.6667 + 3.8415/12) / 1.64025 = 0.98679 / 1.64025 = 0.60161
 *   margin = 1.96 · √(0.6667·0.3333/6 + 3.8415/144) / 1.64025
 *          = 1.96 · √(0.037037 + 0.026677) / 1.64025 = 1.96 · 0.252416 / 1.64025 = 0.30162
 *   → [0.2999, 0.9032]
 *
 * Per category:
 *   product_bug  tp 1, predicted 1, support 2 → P 1.00, R 0.50, F1 0.667
 *   test_bug     tp 1, predicted 2, support 1 → P 0.50, R 1.00, F1 0.667
 *   flaky        tp 1, predicted 1, support 1 → P 1.00, R 1.00, F1 1.000
 *   environment  tp 1, predicted 1, support 2 → P 1.00, R 0.50, F1 0.667
 *   macro F1 = (0.667 + 0.667 + 1 + 0.667) / 4 = 0.75
 *
 * By confidence: high 2/3, medium 1/1, low 1/2.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  accuracy,
  byConfidence,
  bySufficiency,
  confidenceMix,
  confusion,
  macroF1,
  majority,
  matchEntry,
  perCategory,
  stability,
  toAnswer,
  wilson,
  type Judgment,
} from '../src/score.ts';

const j = (scenario: string, truth: Judgment['truth'], predicted: Judgment['predicted'], confidence?: Judgment['confidence'], repeat = 1): Judgment => ({
  run: 'r1',
  scenario,
  repeat,
  test: scenario,
  truth,
  predicted,
  confidence,
});

const example: Judgment[] = [
  j('a', 'product_bug', 'product_bug', 'high'),
  j('b', 'product_bug', 'test_bug', 'high'),
  j('c', 'test_bug', 'test_bug', 'low'),
  j('d', 'flaky', 'flaky', 'high'),
  j('e', 'environment', 'environment', 'medium'),
  j('f', 'environment', 'unknown', 'low'),
];

const close = (actual: number | null | undefined, expected: number, digits = 3) =>
  assert.ok(actual !== null && actual !== undefined && Math.abs(actual - expected) < 10 ** -digits, `${actual} ≉ ${expected}`);

test('wilson interval matches the hand calculation', () => {
  const ci = wilson(4, 6)!;
  close(ci.low, 0.2999);
  close(ci.high, 0.9032);
});

test('wilson edge cases', () => {
  assert.equal(wilson(0, 0), null);
  const all = wilson(10, 10)!;
  close(all.high, 1);
  close(all.low, 0.7225); // known value for 10/10
  const none = wilson(0, 10)!;
  close(none.low, 0);
  close(none.high, 0.2775);
});

test('accuracy', () => {
  const a = accuracy(example);
  assert.equal(a.correct, 4);
  assert.equal(a.n, 6);
  close(a.rate, 4 / 6);
});

test('precision, recall and F1 per category', () => {
  const s = perCategory(example);
  assert.deepEqual([s.product_bug.precision, s.product_bug.recall], [1, 0.5]);
  close(s.product_bug.f1, 2 / 3);
  assert.deepEqual([s.test_bug.precision, s.test_bug.recall], [0.5, 1]);
  close(s.test_bug.f1, 2 / 3);
  assert.deepEqual([s.flaky.precision, s.flaky.recall, s.flaky.f1], [1, 1, 1]);
  assert.deepEqual([s.environment.precision, s.environment.recall], [1, 0.5]);
  close(macroF1(s), 0.75);
});

test('precision is null for a category the triage never answers', () => {
  const s = perCategory([j('x', 'flaky', 'unknown')]);
  assert.equal(s.flaky.precision, null);
  assert.equal(s.flaky.recall, 0);
  assert.equal(s.flaky.f1, null);
});

test('confusion matrix: rows truth, columns answer', () => {
  const m = confusion(example);
  assert.equal(m.product_bug.product_bug, 1);
  assert.equal(m.product_bug.test_bug, 1);
  assert.equal(m.environment.unknown, 1);
  assert.equal(m.flaky.flaky, 1);
  const total = Object.values(m).reduce((sum, row) => sum + Object.values(row).reduce((a, b) => a + b, 0), 0);
  assert.equal(total, 6);
});

test('accuracy by confidence', () => {
  const c = byConfidence(example);
  assert.deepEqual([c.high.correct, c.high.n], [2, 3]);
  assert.deepEqual([c.medium.correct, c.medium.n], [1, 1]);
  assert.deepEqual([c.low.correct, c.low.n], [1, 2]);
});

test('stability and majority across repeats', () => {
  const repeats = [
    // a: same in all three
    j('a', 'flaky', 'flaky', 'high', 1),
    j('a', 'flaky', 'flaky', 'high', 2),
    j('a', 'flaky', 'flaky', 'high', 3),
    // b: 2 of 3 agree, on the wrong answer
    j('b', 'test_bug', 'product_bug', 'medium', 1),
    j('b', 'test_bug', 'product_bug', 'medium', 2),
    j('b', 'test_bug', 'test_bug', 'low', 3),
    // c: three different answers, no majority
    j('c', 'environment', 'environment', 'low', 1),
    j('c', 'environment', 'flaky', 'low', 2),
    j('c', 'environment', 'unknown', 'low', 3),
  ];
  const s = stability(repeats, 3);
  assert.deepEqual([s.correct, s.n], [1, 3]);

  const m = majority(repeats);
  assert.deepEqual(
    m.map((x) => [x.scenario, x.predicted]),
    [
      ['a', 'flaky'],
      ['b', 'product_bug'],
      ['c', 'missing'],
    ],
  );
  assert.equal(accuracy(m).correct, 1);
});

test('a failure missing from a repeat is not stable', () => {
  const s = stability([j('a', 'flaky', 'flaky', 'high', 1), j('a', 'flaky', 'flaky', 'high', 2)], 3);
  assert.equal(s.correct, 0);
});

test('title matching', () => {
  const entries = [{ test: 'Product info › shows the product name and price' }, { test: 'route responds: home (/)' }];
  assert.equal(matchEntry('Product info › shows the product name and price', entries), entries[0]);
  assert.equal(matchEntry('product info > shows the product name and price', entries), entries[0]);
  assert.equal(matchEntry('Smoke: site health › route responds: home (/)', entries), entries[1]);
  assert.equal(matchEntry('Delivery estimate › something else', entries), undefined);
});

test('answers outside the scored set', () => {
  assert.equal(toAnswer('browserstack'), 'browserstack');
  assert.equal(toAnswer('something'), 'unknown');
  assert.equal(toAnswer(undefined), 'missing');
});

test('accuracy by evidence sufficiency, and the confidence mix', () => {
  // Mark b (wrong, high) and f (wrong, low) and c (right, low) insufficient.
  const marked = example.map((x) => ({ ...x, sufficient: !['b', 'c', 'f'].includes(x.scenario) }));
  const s = bySufficiency(marked);
  assert.deepEqual([s.sufficient.correct, s.sufficient.n], [3, 3]);
  assert.deepEqual([s.insufficient.correct, s.insufficient.n], [1, 3]);
  const mix = confidenceMix(marked.filter((x) => !x.sufficient));
  assert.deepEqual([mix.high, mix.medium, mix.low, mix.none], [1, 0, 2, 0]);
  close(mix.lowShare.rate, 2 / 3);
});
