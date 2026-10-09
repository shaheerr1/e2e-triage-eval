/**
 * Ablation: retriage one run's results file with some failures removed from
 * the payload, everything else byte-for-byte as the reporter wrote it
 * (including totals), and compare with the batched run and the solo pilot.
 *
 *   tsx src/ablation.ts --run r1 --drop s16 [--repeats 3]
 *
 * Writes results/ablation-no-<ids>/: the trimmed e2e-results.json, the dry
 * run, each call's output, calls.json and comparison.md.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { forbiddenTerms, scanPayload } from './leakage.ts';
import { matchEntry } from './score.ts';
import { RESULTS, loadLabels, loadRuns, loadScenarios } from './scenarios.ts';
import { apiEnv, dryRun, triageOnce, type TriageCall } from './triage.ts';

function parseArgs(argv: string[]) {
  const args = { run: '', drop: [] as string[], repeats: 3 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--run') args.run = argv[++i];
    else if (argv[i] === '--drop') args.drop = argv[++i].split(',');
    else if (argv[i] === '--repeats') args.repeats = Number(argv[++i]);
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  if (!args.run || !args.drop.length) throw new Error('usage: --run <id> --drop <scenario[,scenario]>');
  return args;
}

type Call = TriageCall & { repeat: number };

function readCalls(dir: string, repeats: number): Call[] {
  const calls: Call[] = [];
  for (let k = 1; k <= repeats; k += 1) {
    const file = join(dir, `repeat-${k}`, 'call.json');
    if (existsSync(file)) calls.push(JSON.parse(readFileSync(file, 'utf8')));
  }
  return calls;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scenarios = loadScenarios();
  const labels = loadLabels();
  const run = loadRuns().find((r) => r.id === args.run);
  if (!run) throw new Error(`no run ${args.run}`);
  for (const id of args.drop) if (!run.scenarios.includes(id)) throw new Error(`${id} is not in ${run.id}`);

  const out = join(RESULTS, `ablation-no-${args.drop.join('-')}`);
  mkdirSync(out, { recursive: true });

  // Remove only the dropped failures' entries; the reporter's 2-space JSON is reproduced exactly.
  const source = join(RESULTS, 'raw', run.id, 'e2e-results.json');
  const results = JSON.parse(readFileSync(source, 'utf8')) as { failures: { title: string }[] };
  const dropTitles = new Set(args.drop.map((id) => scenarios.get(id)!.target));
  const before = results.failures.length;
  results.failures = results.failures.filter((f) => !dropTitles.has(f.title));
  if (results.failures.length !== before - dropTitles.size) throw new Error('dropped failure not found in the payload');
  const file = join(out, 'e2e-results.json');
  writeFileSync(file, JSON.stringify(results, null, 2));

  const terms = forbiddenTerms(scenarios.values());
  const dry = await dryRun(file, out);
  console.log(`dry run would send ${dry.chars} characters for ${results.failures.length} failures`);

  const api = apiEnv();
  for (let k = 1; k <= args.repeats; k += 1) {
    const hits = scanPayload(readFileSync(file, 'utf8'), terms);
    writeFileSync(join(out, 'leakage.json'), JSON.stringify(hits, null, 2));
    if (hits.length) throw new Error(`payload leaks: ${hits.map((h) => `"${h.match}" at ${h.where}`).join('; ')}`);
    const dir = join(out, `repeat-${k}`);
    const call = await triageOnce(file, dir, api);
    writeFileSync(join(dir, 'call.json'), JSON.stringify({ repeat: k, ...call }, null, 2));
    console.log(`repeat ${k}: ${call.ok ? `${call.model}, ${call.inputTokens} in / ${call.outputTokens} out tokens` : `not triaged: ${call.note}`}`);
  }

  // Comparison: this ablation, the batched run, and the solo pilot where one exists.
  const kept = run.scenarios.filter((id) => !args.drop.includes(id));
  const sources: { name: string; calls: Call[]; ids: string[] }[] = [
    { name: `Batched ${run.id}`, calls: readCalls(join(RESULTS, 'raw', run.id), args.repeats), ids: run.scenarios },
    { name: `Without ${args.drop.join(', ')}`, calls: readCalls(out, args.repeats), ids: kept },
  ];
  for (const id of kept) {
    const solo = join(RESULTS, `only-${id}`, 'raw', `only-${id}`);
    if (existsSync(solo)) sources.push({ name: `Solo ${id}`, calls: readCalls(solo, args.repeats), ids: [id] });
  }
  const md = [`# Ablation: ${run.id} without ${args.drop.join(', ')}`, '',
    `Payload: \`${run.id}\`'s e2e-results.json with only the ${args.drop.join(', ')} failure entr${args.drop.length > 1 ? 'ies' : 'y'} removed; totals, run info and every other failure unchanged.`, ''];
  const rows: string[][] = [];
  for (const id of kept) {
    const s = scenarios.get(id)!;
    for (const src of sources.filter((x) => x.ids.includes(id))) {
      for (const c of src.calls.filter((c) => c.ok)) {
        const e = matchEntry(s.target, c.failures);
        const mark = e?.category === labels[id].category ? '✓' : '✗';
        rows.push([id, labels[id].category, src.name, String(c.repeat), `${mark} ${e?.category ?? 'missing'}`, e?.confidence ?? '–', (e?.next_step ?? '').replace(/\|/g, '\\|')]);
      }
    }
  }
  md.push('| Scenario | Truth | Payload | Repeat | Category | Confidence | Next step |', '| --- | --- | --- | --- | --- | --- | --- |', ...rows.map((r) => `| ${r.join(' | ')} |`), '');
  const calls = readCalls(out, args.repeats);
  writeFileSync(join(out, 'calls.json'), JSON.stringify(calls.map(({ failures, ...c }) => ({ ...c, entries: failures.length })), null, 2));
  writeFileSync(join(out, 'comparison.md'), md.join('\n'));
  console.log(`wrote ${join(out, 'comparison.md')}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
