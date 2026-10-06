# Labelling rubric

Written before any scenario was run or triaged. Labels in `labels.json` follow this document; the
rubric was not edited after seeing triage output. The "Flaky versus slow-navigation environment"
and "Evidence sufficiency" sections were added after one scenario (s24) had been run through
Playwright, and before any triage call.

## Unit of labelling

One label per failing test entry in a run's `e2e-results.json` (one test title on one platform).
Every scenario is built so that exactly one test fails because of it, and the harness refuses to
triage a run whose failures differ from the expected set (see "Manifest check" below).

## What decides the label

The label is the **cause we seeded**, judged by where the fix belongs, not by what the evidence
in the run happens to show. The triage only sees the run, so some cases are harder than others by
design. Ask, in order:

1. **Did Playwright record the test as `flaky`** (failed, then passed on retry with nothing changed
   between attempts)? Label `flaky`.
2. **Is the app's code and the test's code correct, but something outside both is wrong** (the
   server, the network path, the URL the suite points at, response times, upstream status codes)?
   Label `environment`.
3. **Was the only change to the test suite** (spec files, site profile, locators, expected values)
   while the product is untouched and behaves as intended? Label `test_bug`.
4. **Was the change to Novera's product source**, so a user of the page would see wrong behaviour,
   and the test's expectation matches the intended behaviour? Label `product_bug`.

## Categories

### product_bug

Novera's own code is wrong. A user would see the defect on the page. The test is correct: its
selector finds the intended element and its expectation is the intended behaviour. Fixing it
means changing `src/` in Novera.

Seeded as a patch to Novera's source (stock label off by one, sold-out sizes not disabled, basket
badge not updating, wrong cm conversion, accordion content never revealed, quantity clamp broken,
price formatted wrongly, delivery range never appearing).

### test_bug

The product is correct and unchanged; the test is wrong for it. Stale selectors, a wrong expected
text, count or variant id, an assertion aimed at the wrong element, copy the page no longer uses,
a wrong date set on the clock. Fixing it means changing `tests-pw/e2e/`.

### flaky

The failure is nondeterministic and the code under test and the test are both acceptable under
normal conditions: the same test passes on retry with no change. Playwright reports the test's
outcome as `flaky` (failed at least once, then passed).

Seeded as a timing problem: on the first attempt the page's scripts arrive late, so the test acts
on server-rendered markup before React has hydrated; the retry gets normal timing and passes.
Retries are enabled (`CI=1`, framework default of 1 retry) for every run.

### environment

App and test are both correct; the target they run against is not. Server not running, the suite
pointed at the wrong host or port, the server answering 5xx or 403, responses too slow for the
timeout, static assets failing to load. Fixing it means changing infrastructure or configuration,
not code. These failures fail on every attempt.

### browserstack (not seeded)

Remote browser or device problems. Excluded: there are no BrowserStack credentials, and every run
uses `BLAZE_TEST_BROWSERSTACK=false`. A triage answer of `browserstack` is always wrong here.

### unknown

Never used as a ground-truth label: every seeded failure has a known cause. A triage answer of
`unknown` counts as wrong for accuracy and recall. It is shown separately in the confusion matrix
so abstentions are visible rather than hidden among wrong guesses.

## Ambiguous cases

| Case | Label | Why |
|---|---|---|
| Intermittent product timing bug (the product itself is slow or racy, and the test passes on retry) | `flaky` | Rule 1 wins. From one run, a retry pass is indistinguishable from test timing. The CLI's own definition of flaky is "passed on retry". Whether the next step points at the product's timing is judged in the manual next-step column, not in the category. |
| Product defect that also fails on retry, but only sometimes | `product_bug` | Not recorded as flaky by Playwright, and the fix is in `src/`. (Not seeded.) |
| Transient 5xx that clears on retry | `flaky` | Rule 1. (Not seeded; all seeded 5xx are persistent and labelled `environment`.) |
| Persistent 5xx, 403, connection refused, DNS failure, navigation timeout | `environment` | Rule 2. The app and test code are untouched. |
| Suite pointed at the wrong port where another server answers 404 | `environment` | The page is "wrong", but the fix is the base URL, not code. |
| Static assets (`/_next/static`) failing, page renders without scripts | `environment` | The served code is correct; the network path to it is not. Fails on every attempt, unlike the hydration-timing flakes. |
| Wrong expected value where the page shows the intended value | `test_bug` | Rule 3, even though the run alone can't show which side is intended. The evidence is symmetric with a product bug whose value is wrong; this is a known hard case, reported as such. |
| Wrong value on the page where the test expects the intended value | `product_bug` | Rule 4. |
| Hydration race where the test acts before the page is interactive, and it passes on retry | `flaky` | Rule 1, even though a more robust test would wait for hydration. |
| Test bug and environment fault in the same test | n/a | Never seeded: each scenario has one cause and one target test. |

## Flaky versus slow-navigation environment

The flaky scenarios (s02, s03, s13, s14, s15, s19, s25, s32) and the slow-navigation environment
scenario (s21) produce the **same error shape**: a `page.goto` timeout (`Timeout 30000ms
exceeded`, waiting until "load") or a test timeout during navigation, on a page that never
finished loading. The reporter keeps the last failed attempt's error, and for a flaky test that is
the first attempt, so the error text, test source and page capture look alike.

**The only distinguishing signal is Playwright's own status**: `outcome: "flaky"` with
`attempts: 2` (the retry passed) versus `outcome: "failed"` with `attempts: 2` (the retry failed
too). Rule 1 makes that status decisive: retry passed → `flaky`; failed on every attempt →
`environment`. Nothing else in the payload separates them, and with one retry, "failed twice" is
weak evidence of a persistent problem. That is why s21 is marked evidence-insufficient below while
the flaky scenarios, whose status is explicit, are marked sufficient.

## Evidence sufficiency

`labels.json` records, per scenario, `evidence_sufficient`: whether the information in
`e2e-results.json` alone (error, test source around the failing line, page snapshot, console and
page errors, navigation status, outcome and attempts) is enough for a careful human to tell the
true category from its **nearest alternative**. Decided from the scenario design before any
triage call. The human is assumed to know general web facts (2.54 cm per inch, what 403 or
`ERR_NAME_NOT_RESOLVED` mean, that JS months start at 0) but not Novera's product data or specs.

Insufficient (7):

| Id | Truth | Nearest alternative | Why the payload can't separate them |
|---|---|---|---|
| s24 | product_bug | test_bug | Page shows "11 In Stock", test expects 12. Which number is right lives in the product data. |
| s11 | product_bug | test_bug | Page shows £25, test expects £24.99. Suggestive (25 is 24.99 rounded), but a price change to £25 with a stale test looks the same. |
| s30 | test_bug | product_bug | Page shows £24.99, test expects £24.90. Mirror image of s11. |
| s08 | test_bug | product_bug | Page has 2 sizes marked out of stock, test expects 3. Which is right lives in the stock data. |
| s20 | environment | product_bug | Route check says "/ returned 404". It is an API request with no page capture, the merged run has no `baseURL`, and the passing tests aren't listed, so nothing shows it hit another server. A missing home route reads the same. |
| s16 | environment | product_bug | "/api/product returned 502". 502 usually means a gateway, but hosting platforms also return 502 when the route handler crashes. Status alone doesn't decide. |
| s21 | environment | flaky | Navigation timeout on both attempts; see the section above. Two timeouts with one retry don't prove a persistent cause, and it is the only test affected. |

Sufficient (25), with the deciding evidence:

| Id | Truth | Nearest alternative | Deciding evidence in the payload |
|---|---|---|---|
| s05 | product_bug | test_bug | Snapshot lists radio "S (out of stock)" without `[disabled]`: the page contradicts itself. |
| s06 | product_bug | flaky | Snapshot still shows "Calculating delivery date" 10s after load, on both attempts; the expected range never appears in any form. |
| s12 | product_bug | test_bug | Quantity box holds 99 while the snapshot says "12 In Stock"; the clamp the test describes visibly didn't happen. |
| s23 | product_bug | test_bug | After the add, the snapshot's basket button still says "Basket, 0 items". The cart didn't change, so it isn't just a stale badge selector. |
| s27 | product_bug | test_bug | 27.5 in is 69.85 cm; the page shows 67.4. The test's value is checkable arithmetic. |
| s28 | product_bug | test_bug | The click on the "Free Shipping Worldwide" heading succeeded (the locator matched), yet the content stays hidden on both attempts. |
| s01 | test_bug | product_bug | Error waits on `.quantity-stepper__field`; the snapshot shows the Quantity textbox present and working. |
| s07 | test_bug | product_bug | Test source sets `new Date(2026, 10, 5)` under a comment saying 5 October; the page shows a November range. |
| s10 | test_bug | product_bug | Asserts "2" on the Add to Cart button (which reads "Added") while the snapshot shows "Basket, 2 items". |
| s17 | test_bug | product_bug | Locator wants "Free Worldwide Shipping"; the snapshot has a coherent heading "Free Shipping Worldwide". |
| s18 | test_bug | product_bug | Variable `rowM` uses `/^L\b/`; the received row is the L row with its own plausible values. |
| s29 | test_bug | product_bug | Waits on `#colour-yellow`; the comment above says Mustard and the snapshot lists Mustard, with no yellow. |
| s02, s03, s13, s14, s15, s19, s25, s32 | flaky | environment | `outcome: "flaky"`, `attempts: 2`: the retry passed. This is the only separating signal (see above). |
| s04 | environment | product_bug | `net::ERR_CONNECTION_REFUSED`. |
| s22 | environment | product_bug | `net::ERR_NAME_NOT_RESOLVED` for `novera-web.internal`. |
| s09 | environment | product_bug | Navigation status 503, page reads "Service Unavailable". |
| s26 | environment | product_bug | Navigation status 403, page reads "Access denied … blocked by the security policy". |
| s31 | environment | product_bug | Console errors: scripts and styles under `/_next/static` failed to load with 503. |

Scoring reports accuracy separately for sufficient and insufficient cases. For insufficient cases
it also reports how often the triage said `low` confidence, since lowering confidence is the right
response when evidence can't decide.

## Manifest check

Before a run is triaged, the harness compares its failures with the expected set:

- every scenario's target test is present with the expected outcome (`flaky` for flaky
  scenarios, `failed` for the rest);
- no other test failed or was flaky.

A run that fails this check is not triaged, so every failure the triage sees has exactly one known
label.

## Correctness of a triage answer

- **Category**: correct when the triage's category equals the label. A failure the triage left
  out, or whose title can't be matched, counts as `missing` and is wrong.
- **Next step** (manual): would doing the suggested next step lead a developer to the actual fix?
  Filled in by hand in `results/next-steps.csv` as `yes`, `partly` or `no`.
