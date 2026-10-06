/**
 * Leakage controls. Nothing the triage can see may name a category, a
 * scenario or a patch: not test titles, patch names or contents, env var
 * names, or anything a server sends to the page.
 */
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { SCENARIOS_DIR, type Scenario } from './scenarios.ts';

const CATEGORY_WORDS: RegExp[] = [
  /product[\s_-]*bugs?/i,
  /test[\s_-]*bugs?/i,
  /\bbugs?\b/i,
  /\bbuggy\b/i,
  /\bflak(?:y|e|es|iness)\b/i,
  /\benvironment(?:s|al)?\b/i,
  /\bbrowser[\s_-]*stack\b/i,
  // Words that would give the harness away.
  /\bscenarios?\b/i,
  /\bseed(?:ed|ing)?\b/i,
  /\binject(?:ed|ion)?\b/i,
  /\bsabotag/i,
  /\bground[\s_-]*truth\b/i,
];

export interface Hit {
  where: string;
  match: string;
}

export function forbiddenTerms(scenarios: Iterable<Scenario>): RegExp[] {
  const terms = [...CATEGORY_WORDS];
  for (const s of scenarios) {
    terms.push(new RegExp(`\\b${s.id}\\b`, 'i'));
    if (s.patch) {
      const name = basename(s.patch);
      terms.push(new RegExp(escape(name.replace(/\.diff$/, '')), 'i'));
    }
  }
  return terms;
}

export function findTerms(text: string, terms: RegExp[], where: string): Hit[] {
  const hits: Hit[] = [];
  for (const term of terms) {
    const m = term.exec(text);
    if (m) hits.push({ where, match: m[0] });
  }
  return hits;
}

/**
 * Everything a scenario puts in front of the run: the target test's title,
 * the patch's name and every line of it, proxy bodies and base URLs, and
 * the names of env vars the harness sets.
 */
export function checkInputs(scenarios: Scenario[], envNames: string[], terms: RegExp[]): Hit[] {
  const hits: Hit[] = [];
  for (const s of scenarios) {
    hits.push(...findTerms(s.target, terms, `${s.id} target title`));
    if (s.patch) {
      // The patch's own name is in `terms`, so only check its name for category words.
      hits.push(...findTerms(basename(s.patch), CATEGORY_WORDS, `${s.id} patch name`));
      hits.push(...findTerms(readFileSync(join(SCENARIOS_DIR, s.patch), 'utf8'), terms, `${s.id} patch content`));
    }
    for (const rule of s.shard?.proxyRules ?? []) {
      if (rule.body) hits.push(...findTerms(rule.body, terms, `${s.id} response body`));
      if (rule.path) hits.push(...findTerms(rule.path, terms, `${s.id} proxy path`));
    }
    if (s.shard?.baseUrl) hits.push(...findTerms(s.shard.baseUrl, terms, `${s.id} base URL`));
  }
  for (const name of envNames) hits.push(...findTerms(name, terms, `env var ${name}`));
  return hits;
}

/**
 * Scans an e2e-results.json payload. Only values are checked: the schema's
 * own keys (`flaky` in every count) are the reporter's, not ours. `outcome`
 * is skipped for the same reason: "flaky" there is Playwright's verdict,
 * which is exactly the evidence the triage is meant to use.
 */
export function scanPayload(json: string, terms: RegExp[]): Hit[] {
  const hits: Hit[] = [];
  const walk = (value: unknown, path: string) => {
    if (typeof value === 'string') hits.push(...findTerms(value, terms, path));
    else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) if (k !== 'outcome') walk(v, `${path}.${k}`);
    }
  };
  walk(JSON.parse(json), '$');
  return hits;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
