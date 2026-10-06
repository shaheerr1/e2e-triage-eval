/**
 * A rule-based baseline over the same e2e-results.json the triage reads, so
 * the report can show where the model adds anything over simple rules.
 * Rules are tried in order; the first that fires decides.
 */
import type { Seeded } from './scenarios.ts';

/** The parts of the reporter's FailedTest that the rules (and the report) read. */
export interface FailedTest {
  title: string;
  outcome: 'failed' | 'flaky';
  attempts: number;
  errors: string[];
  context?: string;
  page?: {
    url: string;
    title?: string;
    lastNavigation?: { url: string; status: number };
    pageErrors: string[];
    consoleErrors: string[];
    snapshot?: string;
  };
}

export type Rule =
  | 'flaky status'
  | 'network error'
  | 'navigation status'
  | 'response status'
  | 'asset status'
  | 'navigation timeout'
  | 'locator absent'
  | 'default';

export interface BaselineAnswer {
  category: Seeded;
  rule: Rule;
}

const NETWORK = /net::ERR_(?:CONNECTION_REFUSED|NAME_NOT_RESOLVED|CONNECTION_RESET|CONNECTION_CLOSED|EMPTY_RESPONSE|ADDRESS_UNREACHABLE|TIMED_OUT)|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/;
const NAVIGATION_TIMEOUT = /page\.goto: (?:Test )?[Tt]imeout|navigating to "[^"]*", waiting until/;
const NOT_FOUND = /element\(s\) not found|waiting for (?:locator|getBy)/;
// An assertion that found its element and compared a value is not a missing element.
const VALUE_MISMATCH = /Received(?: string| value)?:|Expected: \d+\s+Received: \d+/;

const isInfraStatus = (status: number) => status >= 500 || status === 401 || status === 403 || status === 407;

/** The text a failing locator looked for, e.g. getByText('12 In Stock') → "12 In Stock". */
export function locatorTarget(error: string): string | undefined {
  const patterns = [
    /getByText\((['"])(.+?)\1/,
    /getByRole\('[^']+', \{ name: (['"])(.+?)\1/,
    /getByLabel\((['"])(.+?)\1/,
    /locator\((['"])(.+?)\1\)/,
  ];
  for (const p of patterns) {
    const m = p.exec(error);
    if (m) return m[2];
  }
  return undefined;
}

export function classify(f: FailedTest): BaselineAnswer {
  const errors = f.errors.join('\n');
  const all = [errors, ...(f.page?.pageErrors ?? []), ...(f.page?.consoleErrors ?? [])].join('\n');

  if (f.outcome === 'flaky') return { category: 'flaky', rule: 'flaky status' };
  if (NETWORK.test(all)) return { category: 'environment', rule: 'network error' };
  const nav = f.page?.lastNavigation?.status;
  if (nav !== undefined && isInfraStatus(nav)) return { category: 'environment', rule: 'navigation status' };
  const returned = /returned (\d{3})/.exec(errors);
  if (returned && isInfraStatus(Number(returned[1]))) return { category: 'environment', rule: 'response status' };
  if ((f.page?.consoleErrors ?? []).some((e) => /status of 5\d\d/.test(e))) return { category: 'environment', rule: 'asset status' };
  if (NAVIGATION_TIMEOUT.test(errors)) return { category: 'environment', rule: 'navigation timeout' };

  if (NOT_FOUND.test(errors) && !VALUE_MISMATCH.test(errors)) {
    const target = locatorTarget(errors);
    const snapshot = f.page?.snapshot ?? '';
    if (!target || !snapshot.includes(target)) return { category: 'test_bug', rule: 'locator absent' };
  }
  return { category: 'product_bug', rule: 'default' };
}
