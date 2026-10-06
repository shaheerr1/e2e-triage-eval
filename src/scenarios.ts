import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProxyRule } from './proxy.ts';

export const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
export const NOVERA = join(ROOT, 'novera');
export const SCENARIOS_DIR = join(ROOT, 'scenarios');
export const RESULTS = join(ROOT, 'results');

/** Categories the triage can answer with; the first four are the ones we seed. */
export const SEEDED = ['product_bug', 'test_bug', 'flaky', 'environment'] as const;
export const ANSWERS = [...SEEDED, 'browserstack', 'unknown', 'missing'] as const;
export type Seeded = (typeof SEEDED)[number];
export type Answer = (typeof ANSWERS)[number];

/** How a scenario changes the run. Runs only on its own shard when `shard` is set. */
export interface ShardSetup {
  /** Rules for the proxy on the base URL. */
  proxyRules?: ProxyRule[];
  /** false: nothing listens on the base URL. */
  proxy?: false;
  /** Point the suite somewhere else. */
  baseUrl?: string;
  /** Start an unrelated server on this port. */
  stranger?: number;
}

export interface Scenario {
  id: string;
  /** The failing test's title as the results file writes it: "Describe › test". */
  target: string;
  summary: string;
  /** Where the real fix is, for judging next steps by hand. */
  fix: string;
  /** Patch under scenarios/, applied to the run's copy of Novera. */
  patch?: string;
  shard?: ShardSetup;
}

export interface RunDef {
  id: string;
  scenarios: string[];
}

export function loadScenarios(): Map<string, Scenario> {
  const map = new Map<string, Scenario>();
  for (const file of readdirSync(SCENARIOS_DIR).filter((f) => f.endsWith('.json')).sort()) {
    const s = JSON.parse(readFileSync(join(SCENARIOS_DIR, file), 'utf8')) as Scenario;
    if (!!s.patch === !!s.shard) throw new Error(`${file}: needs exactly one of patch or shard`);
    map.set(s.id, s);
  }
  return map;
}

/** Ground truth for one scenario. */
export interface Label {
  category: Seeded;
  /** Whether e2e-results.json alone lets a careful human separate the truth from its nearest alternative (docs/rubric.md). */
  evidence_sufficient: boolean;
}

export type Labels = Record<string, Label>;

export function loadLabels(): Labels {
  return JSON.parse(readFileSync(join(ROOT, 'labels.json'), 'utf8'));
}

export function loadRuns(): RunDef[] {
  return JSON.parse(readFileSync(join(ROOT, 'runs.json'), 'utf8'));
}

/** The leaf of a "Describe › test" title, which is what Playwright's --grep sees last. */
export function leafTitle(title: string): string {
  return title.split(' › ').pop()!;
}

/** Each run must hit distinct tests, or two causes would share one failure. */
export function checkRun(run: RunDef, scenarios: Map<string, Scenario>): void {
  const targets = new Set<string>();
  for (const id of run.scenarios) {
    const s = scenarios.get(id);
    if (!s) throw new Error(`${run.id}: unknown scenario ${id}`);
    if (targets.has(s.target)) throw new Error(`${run.id}: two scenarios target "${s.target}"`);
    targets.add(s.target);
  }
}
