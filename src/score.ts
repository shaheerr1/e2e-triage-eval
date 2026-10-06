/** Metric functions. Pure, so test/score.test.ts can check them against a hand-worked example. */
import { ANSWERS, SEEDED, type Answer, type Seeded } from './scenarios.ts';

export type Confidence = 'high' | 'medium' | 'low';

export interface Judgment {
  run: string;
  scenario: string;
  repeat: number;
  test: string;
  truth: Seeded;
  /** From labels.json: whether the payload alone can separate the truth from its nearest alternative. */
  sufficient?: boolean;
  predicted: Answer;
  confidence?: Confidence;
  summary?: string;
  evidence?: string;
  nextStep?: string;
}

export interface Interval {
  low: number;
  high: number;
}

export interface Rate {
  correct: number;
  n: number;
  rate: number | null;
  ci: Interval | null;
}

/** Wilson score interval for k successes in n trials (95% by default). */
export function wilson(k: number, n: number, z = 1.959964): Interval | null {
  if (n === 0) return null;
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: Math.max(0, centre - margin), high: Math.min(1, centre + margin) };
}

export function rate(correct: number, n: number): Rate {
  return { correct, n, rate: n ? correct / n : null, ci: wilson(correct, n) };
}

export function accuracy(js: Judgment[]): Rate {
  return rate(js.filter((j) => j.truth === j.predicted).length, js.length);
}

/** Rows are the truth, columns the triage's answer. */
export function confusion(js: Judgment[]): Record<Seeded, Record<Answer, number>> {
  const m = Object.fromEntries(
    SEEDED.map((t) => [t, Object.fromEntries(ANSWERS.map((a) => [a, 0]))]),
  ) as Record<Seeded, Record<Answer, number>>;
  for (const j of js) m[j.truth][j.predicted] += 1;
  return m;
}

export interface ClassScores {
  support: number;
  predicted: number;
  tp: number;
  /** null when the triage never answered this category. */
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

export function perCategory(js: Judgment[]): Record<Seeded, ClassScores> {
  const out = {} as Record<Seeded, ClassScores>;
  for (const c of SEEDED) {
    const tp = js.filter((j) => j.truth === c && j.predicted === c).length;
    const support = js.filter((j) => j.truth === c).length;
    const predicted = js.filter((j) => j.predicted === c).length;
    const precision = predicted ? tp / predicted : null;
    const recall = support ? tp / support : null;
    const f1 =
      precision === null || recall === null ? null : precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    out[c] = { support, predicted, tp, precision, recall, f1 };
  }
  return out;
}

/** Unweighted mean of the per-category F1 scores that exist. */
export function macroF1(scores: Record<Seeded, ClassScores>): number | null {
  const f1s = SEEDED.map((c) => scores[c].f1).filter((f): f is number => f !== null);
  return f1s.length ? f1s.reduce((a, b) => a + b, 0) / f1s.length : null;
}

/** Accuracy within each confidence level the triage gave, to see if confidence is calibrated. */
export function byConfidence(js: Judgment[]): Record<Confidence, Rate> {
  const levels: Confidence[] = ['high', 'medium', 'low'];
  return Object.fromEntries(levels.map((l) => [l, accuracy(js.filter((j) => j.confidence === l))])) as Record<Confidence, Rate>;
}

/** Accuracy for failures whose evidence is sufficient, and for those whose evidence is not. */
export function bySufficiency(js: Judgment[]): { sufficient: Rate; insufficient: Rate } {
  return {
    sufficient: accuracy(js.filter((j) => j.sufficient === true)),
    insufficient: accuracy(js.filter((j) => j.sufficient === false)),
  };
}

/** How often each confidence level was given; `low` as a rate, since low is the right answer to weak evidence. */
export function confidenceMix(js: Judgment[]): { high: number; medium: number; low: number; none: number; lowShare: Rate } {
  const count = (c: Confidence | undefined) => js.filter((j) => j.confidence === c).length;
  return { high: count('high'), medium: count('medium'), low: count('low'), none: count(undefined), lowShare: rate(count('low'), js.length) };
}

const key = (j: Judgment) => `${j.run}/${j.scenario}`;

function groups(js: Judgment[]): Map<string, Judgment[]> {
  const g = new Map<string, Judgment[]>();
  for (const j of js) g.set(key(j), [...(g.get(key(j)) ?? []), j]);
  return g;
}

/** Share of failures that got the same category in every one of `repeats` repeats. */
export function stability(js: Judgment[], repeats: number): Rate {
  let stable = 0;
  let n = 0;
  for (const list of groups(js).values()) {
    n += 1;
    if (list.length === repeats && list.every((j) => j.predicted === list[0].predicted)) stable += 1;
  }
  return rate(stable, n);
}

/**
 * One answer per failure: the category most repeats agreed on. A tie (no
 * category has a strict majority) is scored as wrong.
 */
export function majority(js: Judgment[]): Judgment[] {
  const out: Judgment[] = [];
  for (const list of groups(js).values()) {
    const counts = new Map<Answer, number>();
    for (const j of list) counts.set(j.predicted, (counts.get(j.predicted) ?? 0) + 1);
    const [top, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const winner = count * 2 > list.length ? top : 'missing';
    out.push({ ...list[0], repeat: 0, predicted: winner, confidence: undefined });
  }
  return out;
}

const normalise = (title: string) => title.toLowerCase().replace(/\s*(›|>|»)\s*/g, ' › ').replace(/\s+/g, ' ').trim();

/**
 * Finds the triage entry for a failure. The CLI asks for titles "as given",
 * so exact (normalised) first, then either containing the other's leaf title.
 */
export function matchEntry<T extends { test: string }>(title: string, entries: T[]): T | undefined {
  const want = normalise(title);
  const exact = entries.find((e) => normalise(e.test) === want);
  if (exact) return exact;
  const leaf = want.split(' › ').pop()!;
  return entries.find((e) => {
    const got = normalise(e.test);
    return got.includes(leaf) || leaf.includes(got.split(' › ').pop()!);
  });
}

/** Map the triage's category onto the answers we score; anything unrecognised is "unknown". */
export function toAnswer(category: string | undefined): Answer {
  if (category === undefined) return 'missing';
  return (ANSWERS as readonly string[]).includes(category) ? (category as Answer) : 'unknown';
}
