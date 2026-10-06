import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classify, locatorTarget, type FailedTest } from '../src/baseline.ts';

const page = (over: Partial<NonNullable<FailedTest['page']>> = {}): FailedTest['page'] => ({
  url: 'http://localhost:3100/',
  title: 'Novera | Twill Overshirt',
  lastNavigation: { url: 'http://localhost:3100/', status: 200 },
  pageErrors: [],
  consoleErrors: [],
  snapshot: '- heading "Twill Overshirt" [level=1]\n- paragraph: 11 In Stock\n- button "Add to Cart"',
  ...over,
});

const failure = (over: Partial<FailedTest>): FailedTest => ({
  title: 'Product info › something',
  outcome: 'failed',
  attempts: 2,
  errors: ['Error: boom'],
  page: page(),
  ...over,
});

test('flaky status wins over everything else', () => {
  const f = failure({ outcome: 'flaky', errors: ['Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3100/'] });
  assert.deepEqual(classify(f), { category: 'flaky', rule: 'flaky status' });
});

test('connection refused and DNS failures are environment', () => {
  for (const e of ['Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3100/', 'Error: page.goto: net::ERR_NAME_NOT_RESOLVED at http://x.internal/', 'Error: apiRequestContext.get: getaddrinfo ENOTFOUND x.internal']) {
    assert.deepEqual(classify(failure({ errors: [e], page: undefined })), { category: 'environment', rule: 'network error' }, e);
  }
});

test('5xx and 403 navigation status is environment; 404 is not', () => {
  assert.equal(classify(failure({ page: page({ lastNavigation: { url: '/', status: 503 } }) })).rule, 'navigation status');
  assert.equal(classify(failure({ page: page({ lastNavigation: { url: '/', status: 403 } }) })).rule, 'navigation status');
  assert.equal(classify(failure({ page: page({ lastNavigation: { url: '/', status: 404 } }) })).category, 'product_bug');
});

test('route checks: 502 is environment, 404 is not', () => {
  const routed = (status: number) => failure({ page: undefined, errors: [`Error: /api/product returned ${status}\n\nexpect(received).toBeLessThan(expected)`] });
  assert.deepEqual(classify(routed(502)), { category: 'environment', rule: 'response status' });
  assert.equal(classify(routed(404)).category, 'product_bug');
});

test('assets failing with 5xx in the console are environment', () => {
  const f = failure({ page: page({ consoleErrors: ['Failed to load resource: the server responded with a status of 503 (Service Unavailable)'] }) });
  assert.deepEqual(classify(f), { category: 'environment', rule: 'asset status' });
});

test('a navigation timeout that never passed is environment', () => {
  const f = failure({ errors: ['TimeoutError: page.goto: Timeout 30000ms exceeded.\nCall log:\n  - navigating to "http://localhost:3100/", waiting until "load"'] });
  assert.deepEqual(classify(f), { category: 'environment', rule: 'navigation timeout' });
});

test('locator not found and its target absent from the snapshot is test_bug', () => {
  const css = failure({ errors: ['Test timeout of 45000ms exceeded.', "Error: locator.fill: Test timeout of 45000ms exceeded.\nCall log:\n  - waiting for locator('.quantity-stepper__field')"] });
  assert.deepEqual(classify(css), { category: 'test_bug', rule: 'locator absent' });
  const text = failure({ errors: ["Error: expect(locator).toBeVisible() failed\n\nLocator: getByText('12 In Stock')\nExpected: visible\nTimeout: 10000ms\nError: element(s) not found"] });
  assert.deepEqual(classify(text), { category: 'test_bug', rule: 'locator absent' });
});

test('locator not found but its target is in the snapshot falls through to product_bug', () => {
  const f = failure({ errors: ["Error: expect(locator).toBeVisible() failed\n\nLocator: getByText('11 In Stock')\nError: element(s) not found"] });
  assert.deepEqual(classify(f), { category: 'product_bug', rule: 'default' });
});

test('a value mismatch on a found element is product_bug', () => {
  const f = failure({ errors: ["Error: expect(locator).toHaveText(expected) failed\n\nLocator: locator('.product-info__add')\nExpected: \"2\"\nReceived: \"Added\"\nCall log:\n  - waiting for locator('.product-info__add')"] });
  assert.deepEqual(classify(f), { category: 'product_bug', rule: 'default' });
});

test('locator targets', () => {
  assert.equal(locatorTarget("getByText('12 In Stock')"), '12 In Stock');
  assert.equal(locatorTarget("getByRole('heading', { name: 'Free Worldwide Shipping' })"), 'Free Worldwide Shipping');
  assert.equal(locatorTarget("waiting for locator('#colour-yellow')"), '#colour-yellow');
  assert.equal(locatorTarget('no locator here'), undefined);
});
