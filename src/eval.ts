/**
 * npm run eval [-- --only <scenario>] [--runs r1,r2] [--stage all|run|triage|score] [--repeats 3]
 *
 *   run     copy Novera, apply patches, build, run Playwright, merge results, check the manifest
 *   triage  dry run, leakage scan, then the triage CLI once per repeat (costs API credits)
 *   score   judgments, metrics, results/*.json and report.md from what is on disk
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FailedTest } from './baseline.ts';
import { checkInputs, forbiddenTerms, scanPayload } from './leakage.ts';
import { writeReport, type RunRecord } from './report.ts';
import { ENV_NAMES, executeRun } from './runner.ts';
import { RESULTS, SEEDED, checkRun, loadLabels, loadRuns, loadScenarios, type RunDef } from './scenarios.ts';
import { apiEnv, dryRun, triageOnce, type TriageCall } from './triage.ts';

function parseArgs(argv: string[]) {
  const args = { only: undefined as string | undefined, runs: undefined as string[] | undefined, stage: 'all', repeats: 3 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--only') args.only = argv[++i];
    else if (a === '--runs') args.runs = argv[++i].split(',');
    else if (a === '--stage') args.stage = argv[++i];
    else if (a === '--repeats') args.repeats = Number(argv[++i]);
    else throw new Error(`unknown argument ${a}`);
  }
  if (!['all', 'run', 'triage', 'score'].includes(args.stage)) throw new Error(`unknown stage ${args.stage}`);
  return args;
}

const log = (msg: string) => console.log(`[eval ${new Date().toISOString().slice(11, 19)}] ${msg}`);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scenarios = loadScenarios();
  const labels = loadLabels();
  const allRuns = loadRuns();

  // Definitions hang together: every scenario labelled and in exactly one run, runs hit distinct tests.
  for (const id of scenarios.keys()) {
    if (!SEEDED.includes(labels[id]?.category) || typeof labels[id].evidence_sufficient !== 'boolean') throw new Error(`labels.json: ${id} has no valid label`);
    if (allRuns.filter((r) => r.scenarios.includes(id)).length !== 1) throw new Error(`runs.json: ${id} must be in exactly one run`);
  }
  allRuns.forEach((r) => checkRun(r, scenarios));

  // Leakage, part 1: nothing we feed into a run names a category, scenario or patch.
  const terms = forbiddenTerms(scenarios.values());
  const inputHits = checkInputs([...scenarios.values()], ENV_NAMES, terms);
  if (inputHits.length) {
    for (const h of inputHits) console.error(`leakage: "${h.match}" in ${h.where}`);
    throw new Error('scenario inputs leak; fix them before running');
  }
  log(`inputs clean: ${scenarios.size} scenarios, ${allRuns.length} runs`);

  let runs: RunDef[];
  let outDir: string;
  if (args.only) {
    if (!scenarios.has(args.only)) throw new Error(`no scenario ${args.only}`);
    runs = [{ id: `only-${args.only}`, scenarios: [args.only] }];
    outDir = join(RESULTS, `only-${args.only}`);
  } else {
    runs = args.runs ? allRuns.filter((r) => args.runs!.includes(r.id)) : allRuns;
    outDir = RESULTS;
  }
  mkdirSync(outDir, { recursive: true });
  let api: Record<string, string> | undefined;

  for (const run of runs) {
    const raw = join(outDir, 'raw', run.id);
    const resultsFile = join(raw, 'e2e-results.json');

    if (args.stage === 'all' || args.stage === 'run') {
      log(`${run.id}: building and running ${run.scenarios.join(', ')}`);
      rmSync(raw, { recursive: true, force: true });
      const outcome = await executeRun(run, scenarios, labels, raw);
      writeFileSync(join(raw, 'manifest.json'), JSON.stringify({ ok: outcome.ok, problems: outcome.problems }, null, 2));
      log(`${run.id}: manifest ${outcome.ok ? 'ok' : `FAILED: ${outcome.problems.join('; ')}`}`);
    }

    if (args.stage === 'all' || args.stage === 'triage') {
      const manifest = readJson<{ ok: boolean }>(join(raw, 'manifest.json'));
      if (!manifest?.ok) {
        log(`${run.id}: skipping triage, manifest check failed or run missing`);
        continue;
      }
      // Dry run first, to see what would be sent.
      const dry = await dryRun(resultsFile, raw);
      log(`${run.id}: dry run would send ${dry.chars ?? '?'} characters`);
      try {
        api ??= apiEnv();
      } catch (error) {
        // Scan anyway, so a run can be checked end to end before a key exists.
        const hits = scanPayload(readFileSync(resultsFile, 'utf8'), terms);
        writeFileSync(join(raw, 'leakage.json'), JSON.stringify(hits, null, 2));
        log(`${run.id}: leakage scan ${hits.length ? `FOUND ${hits.length} hits` : 'clean'}; no triage: ${(error as Error).message}`);
        continue;
      }

      for (let k = 1; k <= args.repeats; k += 1) {
        // Leakage, part 2: scan the payload before every call; abort the run on any hit.
        const hits = scanPayload(readFileSync(resultsFile, 'utf8'), terms);
        writeFileSync(join(raw, 'leakage.json'), JSON.stringify(hits, null, 2));
        if (hits.length) {
          for (const h of hits) console.error(`leakage: "${h.match}" at ${h.where}`);
          log(`${run.id}: ABORTED, payload leaks; no triage for this run`);
          break;
        }
        const dir = join(raw, `repeat-${k}`);
        rmSync(dir, { recursive: true, force: true });
        const call = await triageOnce(resultsFile, dir, api);
        writeFileSync(join(dir, 'call.json'), JSON.stringify({ repeat: k, ...call }, null, 2));
        log(
          `${run.id} repeat ${k}: ${call.ok ? `${call.model}, ${call.inputTokens} in / ${call.outputTokens} out tokens, ${call.seconds}s` : `not triaged: ${call.note}`}`,
        );
      }
    }
  }

  // Score everything on disk for the runs in scope.
  const records: RunRecord[] = runs.map((run) => {
    const raw = join(outDir, 'raw', run.id);
    const manifest = readJson<{ ok: boolean; problems: string[] }>(join(raw, 'manifest.json'));
    const leakage = readJson<RunRecord['leakage']>(join(raw, 'leakage.json')) ?? [];
    const results = readJson<{ totals: Record<string, number>; failures: FailedTest[] }>(join(raw, 'e2e-results.json'));
    const dry = existsSync(join(raw, 'dry-run.txt')) ? /Would send (\d+) characters/.exec(readFileSync(join(raw, 'dry-run.txt'), 'utf8')) : null;
    const calls: (TriageCall & { repeat: number })[] = [];
    for (let k = 1; k <= args.repeats; k += 1) {
      const call = readJson<TriageCall & { repeat: number }>(join(raw, `repeat-${k}`, 'call.json'));
      if (call) calls.push(call);
    }
    return {
      run,
      problems: manifest ? manifest.problems : ['not run'],
      leakage,
      dryRunChars: dry ? Number(dry[1]) : undefined,
      totals: results?.totals,
      failures: results?.failures,
      calls,
      triaged: !!manifest?.ok && leakage.length === 0 && calls.some((c) => c.ok),
    };
  });
  const report = writeReport(outDir, records, scenarios, labels, args.repeats);
  log(`wrote ${join(outDir, 'report.md')}`);
  if (args.only) console.log(`\n${report}`);
}

function readJson<T>(file: string): T | undefined {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : undefined;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
