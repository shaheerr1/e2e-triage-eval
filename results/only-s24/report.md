# Triage accuracy report

Generated 2026-10-06T08:03:24.942Z. Model(s): claude-opus-5-5. 1/1 runs triaged, 1 failures triaged, 3/3 triage calls succeeded, 12,738 input / 1,858 output tokens. Baseline: rules in `src/baseline.ts` over the same results files, 1 failures.

## Overall accuracy

Wilson 95% intervals. Repeats of the same failure are not independent, so the pooled interval is too narrow; the per-repeat and majority-vote rows are the honest ones. The baseline is deterministic, so it has one answer per failure.

| Classifier | Correct | Accuracy | 95% CI | Macro F1 |
| --- | --- | --- | --- | --- |
| Triage, repeat 1 | 0/1 | 0% | 0%–79% |  |
| Triage, repeat 2 | 0/1 | 0% | 0%–79% |  |
| Triage, repeat 3 | 0/1 | 0% | 0%–79% |  |
| Triage, majority of repeats | 0/1 | 0% | 0%–79% | – |
| Triage, pooled | 0/3 | 0% | 0%–56% | – |
| Rules baseline | 0/1 | 0% | 0%–79% | – |

## By evidence sufficiency

`evidence_sufficient` (labels.json, reasoning in docs/rubric.md): whether the results file alone lets a careful human separate the true category from its nearest alternative.

| Classifier | Sufficient: correct | Accuracy | 95% CI | Insufficient: correct | Accuracy | 95% CI |
| --- | --- | --- | --- | --- | --- | --- |
| Triage, majority | – | – | – | 0/1 | 0% | 0%–79% |
| Triage, pooled | – | – | – | 0/3 | 0% | 0%–56% |
| Rules baseline | – | – | – | 0/1 | 0% | 0%–79% |

Confidence the triage gave (pooled over repeats). On insufficient evidence, `low` is the right answer:

| Evidence | high | medium | low | Share low | 95% CI |
| --- | --- | --- | --- | --- | --- |
| Insufficient | 0 | 1 | 2 | 67% | 21%–94% |
| Sufficient | 0 | 0 | 0 | – | – |

## Per category

Triage pooled over repeats; baseline one answer per failure.

| Category | Support (failures) | Triage P | Triage R | Triage F1 | Baseline P | Baseline R | Baseline F1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| product_bug | 1 | – | 0.00 | – | – | 0.00 | – |
| test_bug | 0 | 0.00 | – | – | 0.00 | – | – |
| flaky | 0 | – | – | – | – | – | – |
| environment | 0 | – | – | – | – | – | – |

## Confusion matrices (rows = truth, columns = answer)

Triage, pooled over repeats:

| truth \ answer | product_bug | test_bug | flaky | environment | browserstack | unknown | missing |
| --- | --- | --- | --- | --- | --- | --- | --- |
| product_bug | · | 3 | · | · | · | · | · |
| test_bug | · | · | · | · | · | · | · |
| flaky | · | · | · | · | · | · | · |
| environment | · | · | · | · | · | · | · |

Rules baseline:

| truth \ answer | product_bug | test_bug | flaky | environment | browserstack | unknown | missing |
| --- | --- | --- | --- | --- | --- | --- | --- |
| product_bug | · | 1 | · | · | · | · | · |
| test_bug | · | · | · | · | · | · | · |
| flaky | · | · | · | · | · | · | · |
| environment | · | · | · | · | · | · | · |

`missing`: the triage left the failure out or its title could not be matched.

## Accuracy by the triage's own confidence

| Confidence | Correct | Accuracy | 95% CI |
| --- | --- | --- | --- |
| high | – | – | – |
| medium | 0/1 | 0% | 0%–79% |
| low | 0/2 | 0% | 0%–66% |

## Stability

Same category in all 3 repeats: **1/1** (100%, 95% CI 21%–100%).

## Next step leads to the fix (manual)

Filled in by hand in `next-steps.csv` (`leads_to_fix`: yes / partly / no). Not assessed yet (3 rows blank).

## Every failure

| Run | Scenario | Truth | Evidence | Test | Triage 1 | Triage 2 | Triage 3 | Stable | Baseline (rule) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| only-s24 | s24 | product_bug | insufficient | Product info › selecting a colour updates the stock for the selected size | ✗ test_bug (low) | ✗ test_bug (medium) | ✗ test_bug (low) | yes | ✗ test_bug (locator absent) |

## Seeded failures as observed

| Run | Scenario | Truth | Evidence sufficient | Failing test | Error type | Playwright status |
| --- | --- | --- | --- | --- | --- | --- |
| only-s24 | s24 | product_bug | no | Product info › selecting a colour updates the stock for the selected size | Error: expect(locator).toBeVisible() failed | failed, 2 attempts |

## Triage calls

| Run | Repeat | OK | Model | Input tokens | Output tokens | Seconds | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| only-s24 | 1 | yes | claude-opus-5-5 | 4246 | 601 | 9 |  |
| only-s24 | 2 | yes | claude-opus-5-5 | 4246 | 561 | 7.5 |  |
| only-s24 | 3 | yes | claude-opus-5-5 | 4246 | 696 | 9.1 |  |

## Run checks

| Run | Scenarios | Manifest | Leakage scan | Payload chars (dry run) | Totals |
| --- | --- | --- | --- | --- | --- |
| only-s24 | s24 | ✓ | ✓ clean | 6426 | passed 10, failed 1, flaky 0, skipped 19 |
