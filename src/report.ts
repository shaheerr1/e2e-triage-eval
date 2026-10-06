/** Turns raw triage calls and results files into judgments, metrics, results/*.json and report.md. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { classify, type FailedTest, type Rule } from './baseline.ts';
import { ANSWERS, SEEDED, type Labels, type RunDef, type Scenario } from './scenarios.ts';
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
  type Judgment,
  type Rate,
} from './score.ts';
import type { TriageCall } from './triage.ts';

export interface RunRecord {
  run: RunDef;
  /** Manifest check problems; empty when the run's failures were exactly as expected. */
  problems: string[];
  leakage: { where: string; match: string }[];
  dryRunChars?: number;
  totals?: Record<string, number>;
  /** The run's e2e-results.json failures. */
  failures?: FailedTest[];
  calls: (TriageCall & { repeat: number })[];
  triaged: boolean;
}

export function judgments(records: RunRecord[], scenarios: Map<string, Scenario>, labels: Labels): Judgment[] {
  const out: Judgment[] = [];
  for (const r of records) {
    for (const call of r.calls.filter((c) => c.ok)) {
      for (const id of r.run.scenarios) {
        const s = scenarios.get(id)!;
        const entry = matchEntry(s.target, call.failures);
        out.push({
          run: r.run.id,
          scenario: id,
          repeat: call.repeat,
          test: s.target,
          truth: labels[id].category,
          sufficient: labels[id].evidence_sufficient,
          predicted: toAnswer(entry?.category),
          confidence: entry?.confidence,
          summary: entry?.summary,
          evidence: entry?.evidence,
          nextStep: entry?.next_step,
        });
      }
    }
  }
  return out;
}

/** The rules baseline on every run that passed its manifest check (no API calls needed). */
export function baselineJudgments(records: RunRecord[], scenarios: Map<string, Scenario>, labels: Labels): (Judgment & { rule: Rule })[] {
  const out: (Judgment & { rule: Rule })[] = [];
  for (const r of records.filter((r) => r.problems.length === 0 && r.failures)) {
    for (const id of r.run.scenarios) {
      const s = scenarios.get(id)!;
      const failure = r.failures!.find((f) => f.title === s.target);
      if (!failure) continue;
      const answer = classify(failure);
      out.push({
        run: r.run.id,
        scenario: id,
        repeat: 1,
        test: s.target,
        truth: labels[id].category,
        sufficient: labels[id].evidence_sufficient,
        predicted: answer.category,
        rule: answer.rule,
      });
    }
  }
  return out;
}

/** First line of each error, e.g. "TimeoutError: page.goto: Timeout 30000ms exceeded." */
export function errorType(f: FailedTest): string {
  const lines = [...new Set(f.errors.map((e) => e.split('\n')[0].trim()))];
  const text = lines.join(' + ');
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

const pct = (x: number | null | undefined) => (x === null || x === undefined ? '–' : `${(100 * x).toFixed(0)}%`);
const dec = (x: number | null | undefined) => (x === null || x === undefined ? '–' : x.toFixed(2));
const ci = (r: Rate) => (r.ci ? `${pct(r.ci.low)}–${pct(r.ci.high)}` : '–');
const frac = (r: Rate) => (r.n ? `${r.correct}/${r.n}` : '–');
const row = (cells: (string | number)[]) => `| ${cells.join(' | ')} |`;
const table = (head: string[], rows: (string | number)[][]) => [row(head), row(head.map(() => '---')), ...rows.map(row)].join('\n');
const cell = (text: string | undefined) => (text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

function summarise(js: Judgment[]) {
  const classes = perCategory(js);
  return { accuracy: accuracy(js), perCategory: classes, macroF1: macroF1(classes), confusion: confusion(js), bySufficiency: bySufficiency(js) };
}

/**
 * results/next-steps.csv: one row per failure. The triage category is the majority over repeats
 * (or "missing" on a tie); the next step is from the first repeat that gave that category.
 * Values already filled in next_step_leads_to_fix are kept across rescoring.
 */
function nextSteps(js: Judgment[], file: string): { filled: number; blank: number } {
  const head = ['scenario', 'true_category', 'triage_category', 'triage_next_step', 'next_step_leads_to_fix'];
  const kept = new Map<string, string>();
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n').slice(1)) {
      const cols = parseCsvLine(line);
      if (cols.length === head.length) kept.set(cols[0], cols[4].trim());
    }
  }
  const counts = { filled: 0, blank: 0 };
  const lines = [head.join(',')];
  for (const m of majority(js)) {
    const repeats = js.filter((j) => j.run === m.run && j.scenario === m.scenario).sort((a, b) => a.repeat - b.repeat);
    const source = repeats.find((j) => j.predicted === m.predicted) ?? repeats[0];
    const value = kept.get(m.scenario) ?? '';
    counts[value ? 'filled' : 'blank'] += 1;
    lines.push([m.scenario, m.truth, m.predicted, source?.nextStep ?? '', value].map(csv).join(','));
  }
  writeFileSync(file, lines.join('\n') + '\n');
  return counts;
}

function csv(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') (cur += '"'), (i += 1);
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') out.push(cur), (cur = '');
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function confusionTable(m: ReturnType<typeof confusion>): string {
  return table(['truth \\ answer', ...ANSWERS], SEEDED.map((t) => [t, ...ANSWERS.map((a) => (m[t][a] ? (t === a ? `**${m[t][a]}**` : m[t][a]) : '·'))]));
}

export function writeReport(outDir: string, records: RunRecord[], scenarios: Map<string, Scenario>, labels: Labels, repeats: number): string {
  const js = judgments(records, scenarios, labels);
  const base = baselineJudgments(records, scenarios, labels);
  const calls = records.flatMap((r) => r.calls.map((c) => ({ run: r.run.id, ...c })));
  const okCalls = calls.filter((c) => c.ok);
  const repeatIds = [...new Set(js.map((j) => j.repeat))].sort();
  const perRepeat = repeatIds.map((k) => ({ repeat: k, ...accuracy(js.filter((j) => j.repeat === k)) }));
  const voted = majority(js);
  const triage = { pooled: summarise(js), majority: summarise(voted) };
  const baseline = summarise(base);
  const conf = byConfidence(js);
  const mix = { sufficient: confidenceMix(js.filter((j) => j.sufficient)), insufficient: confidenceMix(js.filter((j) => j.sufficient === false)) };
  const stable = stability(js, repeats);
  const steps = nextSteps(js, join(outDir, 'next-steps.csv'));
  const models = [...new Set(okCalls.map((c) => c.model))];
  const tokensIn = okCalls.reduce((a, c) => a + (c.inputTokens ?? 0), 0);
  const tokensOut = okCalls.reduce((a, c) => a + (c.outputTokens ?? 0), 0);

  const observed = records.flatMap((r) =>
    r.run.scenarios.map((id) => {
      const s = scenarios.get(id)!;
      const f = r.failures?.find((x) => x.title === s.target);
      return { run: r.run.id, scenario: id, truth: labels[id].category, sufficient: labels[id].evidence_sufficient, test: s.target, errorType: f ? errorType(f) : undefined, outcome: f?.outcome, attempts: f?.attempts };
    }),
  );

  const metrics = {
    generatedAt: new Date().toISOString(),
    models,
    runs: records.length,
    runsTriaged: records.filter((r) => r.triaged).length,
    failures: new Set(js.map((j) => `${j.run}/${j.scenario}`)).size,
    calls: { total: calls.length, ok: okCalls.length, inputTokens: tokensIn, outputTokens: tokensOut },
    triage: { accuracyPerRepeat: perRepeat, ...triage, byConfidence: conf, confidenceMix: mix, stability: stable, nextSteps: steps },
    baseline,
  };
  writeFileSync(join(outDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
  writeFileSync(join(outDir, 'judgments.json'), JSON.stringify(js, null, 2));
  writeFileSync(join(outDir, 'baseline.json'), JSON.stringify(base, null, 2));
  writeFileSync(join(outDir, 'observed.json'), JSON.stringify(observed, null, 2));
  writeFileSync(join(outDir, 'calls.json'), JSON.stringify(calls.map(({ failures, ...c }) => ({ ...c, entries: failures.length })), null, 2));
  writeFileSync(
    join(outDir, 'runs.json'),
    JSON.stringify(records.map((r) => ({ id: r.run.id, scenarios: r.run.scenarios, triaged: r.triaged, problems: r.problems, leakage: r.leakage, dryRunChars: r.dryRunChars, totals: r.totals })), null, 2),
  );

  const md: string[] = [];
  md.push('# Triage accuracy report', '');
  md.push(
    `Generated ${metrics.generatedAt}. Model(s): ${models.join(', ') || '–'}. ` +
      `${metrics.runsTriaged}/${records.length} runs triaged, ${metrics.failures} failures triaged, ${okCalls.length}/${calls.length} triage calls succeeded, ` +
      `${tokensIn.toLocaleString('en-GB')} input / ${tokensOut.toLocaleString('en-GB')} output tokens. ` +
      `Baseline: rules in \`src/baseline.ts\` over the same results files, ${base.length} failures.`,
    '',
  );
  const skipped = records.filter((r) => !r.triaged);
  if (skipped.length) {
    md.push('**Runs not triaged:**', '');
    for (const r of skipped) {
      const why = [...r.problems, ...r.leakage.map((h) => `leakage: "${h.match}" in ${h.where}`)];
      md.push(`- ${r.run.id}: ${why.join('; ') || 'no successful triage call'}`);
    }
    md.push('');
  }

  md.push('## Overall accuracy', '');
  md.push('Wilson 95% intervals. Repeats of the same failure are not independent, so the pooled interval is too narrow; the per-repeat and majority-vote rows are the honest ones. The baseline is deterministic, so it has one answer per failure.', '');
  md.push(
    table(['Classifier', 'Correct', 'Accuracy', '95% CI', 'Macro F1'], [
      ...perRepeat.map((r) => [`Triage, repeat ${r.repeat}`, frac(r), pct(r.rate), ci(r), '']),
      ['Triage, majority of repeats', frac(triage.majority.accuracy), pct(triage.majority.accuracy.rate), ci(triage.majority.accuracy), dec(triage.majority.macroF1)],
      ['Triage, pooled', frac(triage.pooled.accuracy), pct(triage.pooled.accuracy.rate), ci(triage.pooled.accuracy), dec(triage.pooled.macroF1)],
      ['Rules baseline', frac(baseline.accuracy), pct(baseline.accuracy.rate), ci(baseline.accuracy), dec(baseline.macroF1)],
    ]),
    '',
  );

  md.push('## By evidence sufficiency', '');
  md.push('`evidence_sufficient` (labels.json, reasoning in docs/rubric.md): whether the results file alone lets a careful human separate the true category from its nearest alternative.', '');
  const suff = (name: string, s: ReturnType<typeof summarise>) => [
    name,
    frac(s.bySufficiency.sufficient), pct(s.bySufficiency.sufficient.rate), ci(s.bySufficiency.sufficient),
    frac(s.bySufficiency.insufficient), pct(s.bySufficiency.insufficient.rate), ci(s.bySufficiency.insufficient),
  ];
  md.push(
    table(['Classifier', 'Sufficient: correct', 'Accuracy', '95% CI', 'Insufficient: correct', 'Accuracy', '95% CI'], [
      suff('Triage, majority', triage.majority),
      suff('Triage, pooled', triage.pooled),
      suff('Rules baseline', baseline),
    ]),
    '',
  );
  md.push('Confidence the triage gave (pooled over repeats). On insufficient evidence, `low` is the right answer:', '');
  md.push(
    table(['Evidence', 'high', 'medium', 'low', 'Share low', '95% CI'], [
      ['Insufficient', mix.insufficient.high, mix.insufficient.medium, mix.insufficient.low, pct(mix.insufficient.lowShare.rate), ci(mix.insufficient.lowShare)],
      ['Sufficient', mix.sufficient.high, mix.sufficient.medium, mix.sufficient.low, pct(mix.sufficient.lowShare.rate), ci(mix.sufficient.lowShare)],
    ]),
    '',
  );

  md.push('## Per category', '');
  md.push('Triage pooled over repeats; baseline one answer per failure.', '');
  md.push(
    table(['Category', 'Support (failures)', 'Triage P', 'Triage R', 'Triage F1', 'Baseline P', 'Baseline R', 'Baseline F1'],
      SEEDED.map((c) => {
        const t = triage.pooled.perCategory[c];
        const b = baseline.perCategory[c];
        return [c, observed.filter((o) => o.truth === c).length, dec(t.precision), dec(t.recall), dec(t.f1), dec(b.precision), dec(b.recall), dec(b.f1)];
      })),
    '',
  );

  md.push('## Confusion matrices (rows = truth, columns = answer)', '');
  md.push('Triage, pooled over repeats:', '', confusionTable(triage.pooled.confusion), '');
  md.push('Rules baseline:', '', confusionTable(baseline.confusion), '');
  md.push('`missing`: the triage left the failure out or its title could not be matched.', '');

  md.push("## Accuracy by the triage's own confidence", '');
  md.push(table(['Confidence', 'Correct', 'Accuracy', '95% CI'], (['high', 'medium', 'low'] as const).map((l) => [l, frac(conf[l]), pct(conf[l].rate), ci(conf[l])])), '');

  md.push('## Stability', '');
  md.push(`Same category in all ${repeats} repeats: **${frac(stable)}** (${pct(stable.rate)}, 95% CI ${ci(stable)}).`, '');

  md.push('## Next step leads to the fix (manual)', '');
  md.push(
    'Filled in by hand in `next-steps.csv`, one row per failure (`next_step_leads_to_fix`). ' +
      (steps.filled === 0 ? `Not assessed yet (${steps.blank} rows blank).` : `${steps.filled} assessed, ${steps.blank} blank.`),
    '',
  );

  md.push('## Every failure', '');
  md.push(
    table(['Run', 'Scenario', 'Truth', 'Evidence', 'Test', ...repeatIds.map((k) => `Triage ${k}`), 'Stable', 'Baseline (rule)'],
      observed.map((o) => {
        const list = js.filter((j) => j.run === o.run && j.scenario === o.scenario);
        const b = base.find((x) => x.run === o.run && x.scenario === o.scenario);
        const mark = (pred: string) => (pred === o.truth ? '✓' : '✗');
        return [o.run, o.scenario, o.truth, o.sufficient ? 'sufficient' : 'insufficient', cell(o.test),
          ...repeatIds.map((k) => {
            const j = list.find((x) => x.repeat === k);
            return j ? `${mark(j.predicted)} ${j.predicted}${j.confidence ? ` (${j.confidence})` : ''}` : '–';
          }),
          list.length ? (list.length === repeats && list.every((x) => x.predicted === list[0].predicted) ? 'yes' : 'no') : '–',
          b ? `${mark(b.predicted)} ${b.predicted} (${b.rule})` : '–'];
      })),
    '',
  );

  md.push('## Seeded failures as observed', '');
  md.push(
    table(['Run', 'Scenario', 'Truth', 'Evidence sufficient', 'Failing test', 'Error type', 'Playwright status'],
      observed.map((o) => [o.run, o.scenario, o.truth, o.sufficient ? 'yes' : 'no', cell(o.test), cell(o.errorType) || '**not failing**', o.outcome ? `${o.outcome}, ${o.attempts} attempts` : '–'])),
    '',
  );

  md.push('## Triage calls', '');
  md.push(table(['Run', 'Repeat', 'OK', 'Model', 'Input tokens', 'Output tokens', 'Seconds', 'Note'],
    calls.map((c) => [c.run, c.repeat, c.ok ? 'yes' : 'no', c.model ?? '–', c.inputTokens ?? '–', c.outputTokens ?? '–', c.seconds, cell(c.note)])), '');

  md.push('## Run checks', '');
  md.push(table(['Run', 'Scenarios', 'Manifest', 'Leakage scan', 'Payload chars (dry run)', 'Totals'],
    records.map((r) => [r.run.id, r.run.scenarios.join(' '), r.problems.length ? `✗ ${cell(r.problems.join('; '))}` : '✓',
      r.leakage.length ? `✗ ${r.leakage.length} hits` : r.dryRunChars !== undefined ? '✓ clean' : 'not scanned yet', r.dryRunChars ?? '–',
      r.totals ? Object.entries(r.totals).map(([k, v]) => `${k} ${v}`).join(', ') : '–'])), '');

  const text = md.join('\n');
  writeFileSync(join(outDir, 'report.md'), text);
  return text;
}
