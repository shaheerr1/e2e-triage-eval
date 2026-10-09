# e2e-triage-eval

**Question:** when a Playwright run fails, how often does `blaze-e2e-triage` (the failure triage
in [`@blaze-cms/plugin-testing-e2e`](https://www.npmjs.com/package/@blaze-cms/plugin-testing-e2e)
0.3.1) put each failure in the right category, how sure is it, and does it give the same answer
twice?

The triage reads `test-results/e2e-results.json` (written by the framework's reporter) and asks
Claude to put each failure in one of `product_bug`, `test_bug`, `flaky`, `environment`,
`browserstack` or `unknown`, with a confidence level, evidence and a next step. This harness seeds
failures with a known cause into a real app and suite, runs the CLI on the results, and scores the
answers.

## Findings

Sources: `results/report.md`, `results/next-steps.csv` and
`results/ablation-no-s16/comparison.md`.

### 1. Headline

The triage classified 30 of 32 seeded failures correctly. A rules baseline over the same results
files got 24 of 32.

| Classifier | Correct | Accuracy | 95% CI (Wilson) | Macro F1 |
|---|---|---|---|---|
| Triage, majority of 3 repeats | 30/32 | 94% | 80 to 98% | 0.94 |
| Rules baseline | 24/32 | 75% | 58 to 87% | 0.76 |

The single repeats scored 30, 30 and 29 out of 32. The intervals overlap at n=32, so the gap is
consistent but not conclusive.

### 2. Where the model adds value

The gain is in telling product bugs from test bugs. The baseline confused these two categories 7
times out of 16 failures. The triage never put a product bug in `test_bug` or a test bug in
`product_bug`.

| Category | Triage F1 | Baseline F1 |
|---|---|---|
| product_bug | 0.83 | 0.50 |
| test_bug | 1.00 | 0.59 |
| flaky | 1.00 | 1.00 |
| environment | 0.89 | 0.93 |

Triage scores are pooled over the 3 repeats. Flaky is trivial for both, because Playwright's own
`flaky` status is in the payload. On environment the baseline scores slightly higher, because the
triage labelled 6 product bug answers as environment (see 5).

### 3. Calibration

All 96 answers (32 failures × 3 repeats).

| Triage confidence | Correct | Accuracy |
|---|---|---|
| high | 41/41 | 100% |
| medium | 45/47 | 96% |
| low | 3/8 | 38% |

Practical reading: trust high, double check low. Caveat: 7 failures are labelled
evidence-insufficient (the results file alone can't separate the true category from its nearest
alternative). On those, 5 of 21 answers were still high confidence, 11 medium and 5 low.

### 4. Next steps

I judged 31 of 32 next steps (majority answer per failure) to lead to the real cause. The miss was
s24 in the batched run (stock shows 11, test expects 12; the product is wrong). Its next step
suggested updating the test expectation, which would hide a real product bug.

### 5. Batch effect

Both failures the triage got wrong in every repeat were product bugs (s11 price, s24 stock) in run
r1. That run also contained an unrelated failure: `/api/product` returning 502 (s16). In the
batched run the triage labelled both as `environment` and linked them to the 502.

Ablation: the same r1 results file with only the s16 entry removed, 3 repeats.

| Scenario (truth) | Batched r1 | Without s16 | s24 alone (pilot) |
|---|---|---|---|
| s11 (product_bug) | environment ×3 | test_bug, product_bug, product_bug | not run |
| s18 (test_bug) | test_bug ×3 | test_bug ×3 | not run |
| s24 (product_bug) | environment ×3 | test_bug ×3 | test_bug ×3 |

- Removing that one failure stopped the `environment` label in all 3 repeats.
- s11 became correct in 2 of 3. s24 moved to `test_bug`, the same as when triaged alone. It is
  still wrong, which the rubric expects for an evidence-insufficient case. s18 was unchanged.
- In the batched run, s24's next steps also lost the branch that leads to the fix ("if the data
  says 12, it is a product bug"). The solo and ablation next steps kept it.
- Payload caveat: the ablation changed nothing but the failure list, so the totals still said 4
  failed while 3 were listed. The model noticed this in 2 of 3 verdicts.

The same cross failure reasoning helped on s20 (wrong port, `/ returned 404`). The triage got it
right in all 3 repeats, where the baseline said `product_bug`. Batching cuts both ways.

### 6. Stability and cost

- 31 of 32 failures got the same category in all 3 repeats. The exception was s23 (product_bug,
  product_bug, unknown, all low confidence).
- About $0.07 per triage call (24 calls, 255,936 input and 36,962 output tokens, at $4 and $20
  per million). Total spend about $2.05, including the pilot and the ablation.

### 7. Limitations

- 32 seeded failures, 8 per category. Intervals are wide.
- Synthetic failures with one cause each, in one small app.
- One model version (`claude-opus-5-5`) and one framework version (0.3.1).
- BrowserStack excluded. No credentials, so that category was never tested.
- Flaky and slow-navigation environment failures are separable only by Playwright's status.

## Method

### App and suite

[Novera](https://github.com/shaheerr1/novera-product-page) (a Next.js product page) at commit
`ff9701c`, in `novera/`. Its Playwright suite in `tests-pw/e2e` is built on the framework, so the
results file is the reporter's own output, not a reconstruction. `novera/` is never modified;
each run works on a throwaway copy in the OS temp directory.

### Scenarios

32 seeded failures in `scenarios/`, 8 per category. Each one makes exactly one test fail.

| Category | How it is seeded | Examples |
|---|---|---|
| `product_bug` | Patch to Novera's `src/` (`scenarios/patches/*.diff`) | Stock label off by one, sold-out sizes not disabled, basket badge stuck (stale `useMemo` deps), 2.45 instead of 2.54 cm/inch, accordion never opens, quantity not clamped, price drops pence, delivery range never appears |
| `test_bug` | Patch to `tests-pw/e2e` only; product untouched | Stale class selector, wrong expected price, wrong expected count, assertion on the wrong element, wrong row, non-existent variant id, outdated heading copy, clock set with the wrong month index |
| `flaky` | Proxy makes the **first** page load slow (scripts, stylesheet, document, hero image or fonts); the retry is normal | `page.goto` times out on attempt 1 and passes on attempt 2, so Playwright records `flaky` |
| `environment` | The target is wrong for every attempt; app and tests untouched | Server not running, wrong port (another server answers 404), unresolvable host, 503 on everything, 502 on the API route, documents slower than the navigation timeout, 403 from a firewall, static assets answering 503 |

**BrowserStack is excluded**: there are no credentials, so every run sets
`BLAZE_TEST_BROWSERSTACK=false`. A `browserstack` answer is always wrong here.

### Rubric

[`docs/rubric.md`](docs/rubric.md), written before anything ran. The label is the seeded cause,
judged by where the fix belongs. Ambiguous cases are settled there, e.g. an intermittent product
timing problem that passes on retry is `flaky` (the CLI's own definition), a persistent 502 on an
API route is `environment`, and a wrong expected value is `test_bug` even though the run alone
can't show which side is intended.

### Ground truth

`labels.json` holds the only scenario → category mapping, plus `evidence_sufficient` per
scenario: whether the results file alone is enough for a careful human to separate the true
category from its nearest alternative. 25 are sufficient, 7 are not (e.g. s24: the page shows
"11 In Stock", the test expects 12, and only the product data says which is right). Each
decision and its reasoning is in the rubric, made before any triage call. The harness reads it to check runs and
to score, and never passes it, or anything derived from it, to the triage.

### Flaky versus slow-navigation environment

The flaky scenarios and the slow-navigation environment scenario (s21) produce the same error: a
`page.goto` timeout on a page that never loaded. **The only distinguishing signal is
Playwright's status**: `flaky` (retry passed) versus `failed` (retry failed too). The rubric makes
that status decisive and marks s21 evidence-insufficient.

### Leakage controls (`src/leakage.ts`)

- Before anything runs: target test titles, patch file names and contents, proxy response bodies
  and paths, base URLs and every env var name the harness sets are checked for category words,
  harness words ("scenario", "seeded", "injected"...), scenario ids and patch names. Any hit stops
  the harness.
- Before **every** triage call: the `e2e-results.json` payload is scanned for the same terms. Any
  hit aborts that run's triage. Only values are scanned: the reporter's schema keys (`flaky` in
  every count) and the `outcome` field (Playwright's own `flaky` verdict, which is legitimate
  evidence) are skipped.
- Scenario ids (`s01`–`s32`) are assigned in a shuffled order and say nothing about the cause.
  Patch files are named by content hash. No commits are made, so there are no commit messages.
  Copies live in a random temp directory, and Playwright children get a clean env (no shell
  variables, no API key).

### Runs: mixed batches

The 32 scenarios are grouped into 8 runs of 4 (`runs.json`), with varied mixes (e.g. 2 product + 1
test + 1 environment; 2 test + 2 environment), so the triage can't assume one cause per batch.
Each run:

1. copies Novera, applies the run's patches, `npm run build`, starts `next start`;
2. runs the full suite once through a pass-through proxy on the profile's base URL
   (`localhost:3100`), excluding tests that belong to network scenarios;
3. runs each network scenario's test on its own, with that scenario's proxy rules, base URL or
   server state, so the fault touches only its test;
4. merges the parts' blob reports with `playwright merge-reports` through the suite's own config,
   so the framework's reporter writes `e2e-results.json` as a sharded CI run would;
5. **manifest check**: the failures must be exactly the run's targets, with outcome `flaky` for
   flaky scenarios and `failed` for the rest. Otherwise the run is not triaged.

Retries are on (`CI=1`, framework default of 1 retry), as in CI.

### Triage

For each run: `blaze-e2e-triage --dry-run --no-slack --results <file>` first (payload size), then
`blaze-e2e-triage --no-slack --results <file>` 3 separate times. The CLI is the one installed in
`novera/node_modules`, run with the default model (`claude-opus-5-5`, effort medium). The key comes
from `.env.local` only. Token usage and the model actually used come from the CLI's
`Triaged with <model> (<in> input / <out> output tokens)` line, per call.

### Scoring (`src/score.ts`, tested in `test/score.test.ts`)

- Overall accuracy with a Wilson 95% interval: per repeat (n = 32), majority vote over repeats
  (n = 32) and pooled (n = 96; repeats aren't independent, so that interval is too narrow).
- Per-category precision, recall and F1, macro F1.
- Confusion matrix (columns include `browserstack`, `unknown` and `missing`).
- Accuracy by the triage's own confidence level, to see whether `high` means anything.
- Stability: share of failures with the same category in all 3 repeats.
- Accuracy separately for evidence-sufficient and evidence-insufficient failures, and, for the
  insufficient ones, how often the triage said `low` confidence.
- Next step leads to the fix: manual, in `results/next-steps.csv`, one row per failure. The
  `next_step_leads_to_fix` column is filled in by hand with `yes` or `no`. Rerunning
  `--stage score` keeps what you filled in.

### Rules baseline (`src/baseline.ts`, tested in `test/baseline.test.ts`)

A deterministic classifier over the same `e2e-results.json`, scored with the same metrics and
shown next to the triage. Rules, first match wins:

1. outcome `flaky` → `flaky`
2. connection refused, DNS failure or similar network error → `environment`
3. navigation status 5xx, 401, 403 or 407 → `environment`
4. a route check that "returned" 5xx/401/403 → `environment`
5. console errors with a 5xx resource status → `environment`
6. `page.goto` timeout → `environment`
7. locator not found, and the text it looked for is absent from the snapshot → `test_bug`
8. otherwise → `product_bug`

It needs no API calls, so its numbers exist as soon as the runs do.

## Results

The main numbers are in [Findings](#findings) at the top. All tables are in
[`results/report.md`](results/report.md), with raw data in `results/*.json` and `results/raw/`.

## Limitations

- **Small n.** 32 failures, 8 per category. Intervals are wide: 30/32 correct (94%) has a Wilson
  interval of 80 to 98%. Per-category numbers rest on 8 failures each.
- **Synthetic, seeded failures.** One cause per failure, one failing test per cause, a single small
  app. Real runs have cascades, several causes at once, and noisier pages.
- **Flaky failures are all one shape**: a slow first navigation that times out, then a clean
  retry. Playwright's `flaky` outcome is in the payload, which makes these easier than real flakes,
  where the retry may not pass.
- **Flaky versus slow-navigation environment rests on one field.** The error, test source and
  page capture of the flaky scenarios and of s21 look alike; only `outcome`/`attempts` separate
  them. A triage (or the rules baseline) that reads that field gets these right "for free", so
  accuracy on them says little about reasoning over the error itself.
- **7 of 32 failures are evidence-insufficient by design**, so accuracy has a ceiling below 100%
  for anyone, human or model, who sees only the results file. Read accuracy split by sufficiency.
- **Environment failures are scoped to one test each** by running them in their own Playwright
  invocation. In real life "server not running" usually fails every test.
- **Symmetric cases.** A wrong expected value (test) and a wrong displayed value (product) can
  look identical from one run; the rubric labels by the seeded cause, so some errors there are
  expected.
- **BrowserStack excluded**, so one of the six categories is never tested.
- **One model version, one framework version**, one effort setting, as the CLI ships them. The
  CLI uses server-side fallback, so the model that answered is recorded per call.
- The merged report has no `baseURL` in `run` (merge-reports doesn't carry it), the same for every
  run.

## Reproduce

Requirements: Node 20+, macOS or Linux, ports 3100, 3110 and 3200 free.

```bash
npm install
```

```bash
npm ci --prefix novera && npx --prefix novera playwright install chromium
```

```bash
cp .env.local.example .env.local   # then add ANTHROPIC_API_KEY
```

```bash
npm run eval
```

`npm run eval` does everything: input leakage check, 8 runs, dry runs, payload scans, 3 triage
calls per run, scoring and `results/report.md`. About 30–40 minutes, 24 API calls.

Other entry points:

```bash
npm run eval -- --only s24          # one scenario end to end, into results/only-s24/
```

```bash
npm run eval -- --stage run         # Playwright only, no API calls: checks every run's manifest
```

```bash
npm run eval -- --stage score       # rescore what's on disk, e.g. after filling next-steps.csv
```

```bash
npx tsx src/ablation.ts --run r1 --drop s16   # retriage r1 without the s16 failure, 3 repeats
```

```bash
npm test                            # metric, baseline and leakage tests
```

## Layout

```
docs/rubric.md            labelling rubric (written first)
scenarios/sNN.json        one definition per seeded failure: target test, mechanism, real fix
scenarios/patches/        product and suite patches, named by content hash
labels.json               ground truth (scenario -> category, evidence_sufficient)
runs.json                 8 mixed runs of 4
src/eval.ts               entry point (npm run eval)
src/runner.ts             copy, patch, build, run parts, merge, manifest check
src/proxy.ts              the misbehaving proxy and the wrong-port server
src/leakage.ts            input checks and payload scan
src/triage.ts             calls blaze-e2e-triage (dry run and real)
src/score.ts              metric functions
src/baseline.ts           rules baseline
src/report.ts             judgments, results/*.json, report.md, next-steps.csv
src/ablation.ts           retriage one run with failures removed from the payload
test/                     tests for score.ts, baseline.ts and leakage.ts
results/                  report.md, metrics.json, judgments.json, baseline.json, observed.json,
                          calls.json, runs.json,
                          next-steps.csv, raw/<run>/ (results file, dry run, each call's output)
results/ablation-no-s16/  r1 without s16: trimmed payload, each call's output, comparison.md
```
