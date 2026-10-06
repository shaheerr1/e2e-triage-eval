# Triage accuracy report

Generated 2026-10-06T08:26:41.832Z. Model(s): claude-opus-5-5. 8/8 runs triaged, 32 failures triaged, 24/24 triage calls succeeded, 255,936 input / 36,962 output tokens. Baseline: rules in `src/baseline.ts` over the same results files, 32 failures.

## Overall accuracy

Wilson 95% intervals. Repeats of the same failure are not independent, so the pooled interval is too narrow; the per-repeat and majority-vote rows are the honest ones. The baseline is deterministic, so it has one answer per failure.

| Classifier | Correct | Accuracy | 95% CI | Macro F1 |
| --- | --- | --- | --- | --- |
| Triage, repeat 1 | 30/32 | 94% | 80%–98% |  |
| Triage, repeat 2 | 30/32 | 94% | 80%–98% |  |
| Triage, repeat 3 | 29/32 | 91% | 76%–97% |  |
| Triage, majority of repeats | 30/32 | 94% | 80%–98% | 0.94 |
| Triage, pooled | 89/96 | 93% | 86%–96% | 0.93 |
| Rules baseline | 24/32 | 75% | 58%–87% | 0.76 |

## By evidence sufficiency

`evidence_sufficient` (labels.json, reasoning in docs/rubric.md): whether the results file alone lets a careful human separate the true category from its nearest alternative.

| Classifier | Sufficient: correct | Accuracy | 95% CI | Insufficient: correct | Accuracy | 95% CI |
| --- | --- | --- | --- | --- | --- | --- |
| Triage, majority | 25/25 | 100% | 87%–100% | 5/7 | 71% | 36%–92% |
| Triage, pooled | 74/75 | 99% | 93%–100% | 15/21 | 71% | 50%–86% |
| Rules baseline | 21/25 | 84% | 65%–94% | 3/7 | 43% | 16%–75% |

Confidence the triage gave (pooled over repeats). On insufficient evidence, `low` is the right answer:

| Evidence | high | medium | low | Share low | 95% CI |
| --- | --- | --- | --- | --- | --- |
| Insufficient | 5 | 11 | 5 | 24% | 11%–45% |
| Sufficient | 36 | 36 | 3 | 4% | 1%–11% |

## Per category

Triage pooled over repeats; baseline one answer per failure.

| Category | Support (failures) | Triage P | Triage R | Triage F1 | Baseline P | Baseline R | Baseline F1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| product_bug | 8 | 1.00 | 0.71 | 0.83 | 0.50 | 0.50 | 0.50 |
| test_bug | 8 | 1.00 | 1.00 | 1.00 | 0.56 | 0.63 | 0.59 |
| flaky | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| environment | 8 | 0.80 | 1.00 | 0.89 | 1.00 | 0.88 | 0.93 |

## Confusion matrices (rows = truth, columns = answer)

Triage, pooled over repeats:

| truth \ answer | product_bug | test_bug | flaky | environment | browserstack | unknown | missing |
| --- | --- | --- | --- | --- | --- | --- | --- |
| product_bug | **17** | · | · | 6 | · | 1 | · |
| test_bug | · | **24** | · | · | · | · | · |
| flaky | · | · | **24** | · | · | · | · |
| environment | · | · | · | **24** | · | · | · |

Rules baseline:

| truth \ answer | product_bug | test_bug | flaky | environment | browserstack | unknown | missing |
| --- | --- | --- | --- | --- | --- | --- | --- |
| product_bug | **4** | 4 | · | · | · | · | · |
| test_bug | 3 | **5** | · | · | · | · | · |
| flaky | · | · | **8** | · | · | · | · |
| environment | 1 | · | · | **7** | · | · | · |

`missing`: the triage left the failure out or its title could not be matched.

## Accuracy by the triage's own confidence

| Confidence | Correct | Accuracy | 95% CI |
| --- | --- | --- | --- |
| high | 41/41 | 100% | 91%–100% |
| medium | 45/47 | 96% | 86%–99% |
| low | 3/8 | 38% | 14%–69% |

## Stability

Same category in all 3 repeats: **31/32** (97%, 95% CI 84%–99%).

## Next step leads to the fix (manual)

Filled in by hand in `next-steps.csv`, one row per failure (`next_step_leads_to_fix`). Not assessed yet (32 rows blank).

## Every failure

| Run | Scenario | Truth | Evidence | Test | Triage 1 | Triage 2 | Triage 3 | Stable | Baseline (rule) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| r1 | s11 | product_bug | insufficient | Product info › shows the product name and price | ✗ environment (low) | ✗ environment (medium) | ✗ environment (low) | yes | ✗ test_bug (locator absent) |
| r1 | s16 | environment | insufficient | Smoke: site health › route responds: /api/product (/api/product) | ✓ environment (medium) | ✓ environment (high) | ✓ environment (high) | yes | ✓ environment (response status) |
| r1 | s18 | test_bug | sufficient | Product extras › the size chart switches between inches and centimetres | ✓ test_bug (high) | ✓ test_bug (high) | ✓ test_bug (high) | yes | ✗ product_bug (default) |
| r1 | s24 | product_bug | insufficient | Product info › selecting a colour updates the stock for the selected size | ✗ environment (low) | ✗ environment (medium) | ✗ environment (low) | yes | ✗ test_bug (locator absent) |
| r2 | s02 | flaky | sufficient | Product info › quantity cannot go above the stock of the selected variant | ✓ flaky (medium) | ✓ flaky (medium) | ✓ flaky (medium) | yes | ✓ flaky (flaky status) |
| r2 | s03 | flaky | sufficient | Product info › Add to Cart updates the header basket badge | ✓ flaky (medium) | ✓ flaky (medium) | ✓ flaky (medium) | yes | ✓ flaky (flaky status) |
| r2 | s05 | product_bug | sufficient | Product info › sizes that are out of stock for the colour are disabled | ✓ product_bug (medium) | ✓ product_bug (medium) | ✓ product_bug (medium) | yes | ✓ product_bug (default) |
| r2 | s07 | test_bug | sufficient | Delivery estimate › the delivery date range is calculated from the visitor's date after load | ✓ test_bug (high) | ✓ test_bug (high) | ✓ test_bug (high) | yes | ✓ test_bug (locator absent) |
| r3 | s17 | test_bug | sufficient | Product extras › opening an accordion item reveals its content | ✓ test_bug (high) | ✓ test_bug (high) | ✓ test_bug (high) | yes | ✓ test_bug (locator absent) |
| r3 | s19 | flaky | sufficient | Product extras › the size chart switches between inches and centimetres | ✓ flaky (medium) | ✓ flaky (medium) | ✓ flaky (medium) | yes | ✓ flaky (flaky status) |
| r3 | s22 | environment | sufficient | Smoke: site health › home page renders with site chrome | ✓ environment (high) | ✓ environment (high) | ✓ environment (high) | yes | ✓ environment (network error) |
| r3 | s29 | test_bug | sufficient | Product info › selecting a colour updates the stock for the selected size | ✓ test_bug (high) | ✓ test_bug (high) | ✓ test_bug (high) | yes | ✓ test_bug (locator absent) |
| r4 | s06 | product_bug | sufficient | Delivery estimate › the delivery date range is calculated from the visitor's date after load | ✓ product_bug (medium) | ✓ product_bug (medium) | ✓ product_bug (medium) | yes | ✗ test_bug (locator absent) |
| r4 | s09 | environment | sufficient | Product info › quantity cannot go above the stock of the selected variant | ✓ environment (high) | ✓ environment (high) | ✓ environment (high) | yes | ✓ environment (navigation status) |
| r4 | s20 | environment | insufficient | Smoke: site health › route responds: home (/) | ✓ environment (medium) | ✓ environment (medium) | ✓ environment (low) | yes | ✗ product_bug (default) |
| r4 | s25 | flaky | sufficient | Product info › selecting a colour updates the stock for the selected size | ✓ flaky (high) | ✓ flaky (high) | ✓ flaky (medium) | yes | ✓ flaky (flaky status) |
| r5 | s04 | environment | sufficient | Product info › shows the product name and price | ✓ environment (medium) | ✓ environment (medium) | ✓ environment (medium) | yes | ✓ environment (network error) |
| r5 | s10 | test_bug | sufficient | Product info › Add to Cart updates the header basket badge | ✓ test_bug (high) | ✓ test_bug (high) | ✓ test_bug (high) | yes | ✗ product_bug (default) |
| r5 | s14 | flaky | sufficient | Product extras › opening an accordion item reveals its content | ✓ flaky (medium) | ✓ flaky (medium) | ✓ flaky (medium) | yes | ✓ flaky (flaky status) |
| r5 | s27 | product_bug | sufficient | Product extras › the size chart switches between inches and centimetres | ✓ product_bug (high) | ✓ product_bug (high) | ✓ product_bug (high) | yes | ✓ product_bug (default) |
| r6 | s01 | test_bug | sufficient | Product info › quantity cannot go above the stock of the selected variant | ✓ test_bug (high) | ✓ test_bug (high) | ✓ test_bug (high) | yes | ✓ test_bug (locator absent) |
| r6 | s15 | flaky | sufficient | Delivery estimate › the delivery date range is calculated from the visitor's date after load | ✓ flaky (high) | ✓ flaky (high) | ✓ flaky (high) | yes | ✓ flaky (flaky status) |
| r6 | s23 | product_bug | sufficient | Product info › Add to Cart updates the header basket badge | ✓ product_bug (low) | ✓ product_bug (low) | ✗ unknown (low) | no | ✗ test_bug (locator absent) |
| r6 | s28 | product_bug | sufficient | Product extras › opening an accordion item reveals its content | ✓ product_bug (medium) | ✓ product_bug (medium) | ✓ product_bug (medium) | yes | ✓ product_bug (default) |
| r7 | s08 | test_bug | insufficient | Product info › sizes that are out of stock for the colour are disabled | ✓ test_bug (high) | ✓ test_bug (high) | ✓ test_bug (high) | yes | ✗ product_bug (default) |
| r7 | s21 | environment | insufficient | Product extras › the size chart switches between inches and centimetres | ✓ environment (medium) | ✓ environment (medium) | ✓ environment (medium) | yes | ✓ environment (navigation timeout) |
| r7 | s30 | test_bug | insufficient | Product info › shows the product name and price | ✓ test_bug (medium) | ✓ test_bug (medium) | ✓ test_bug (medium) | yes | ✓ test_bug (locator absent) |
| r7 | s31 | environment | sufficient | Product info › selecting a colour updates the stock for the selected size | ✓ environment (medium) | ✓ environment (medium) | ✓ environment (medium) | yes | ✓ environment (asset status) |
| r8 | s12 | product_bug | sufficient | Product info › quantity cannot go above the stock of the selected variant | ✓ product_bug (medium) | ✓ product_bug (high) | ✓ product_bug (medium) | yes | ✓ product_bug (default) |
| r8 | s13 | flaky | sufficient | Smoke: site health › home page renders with site chrome | ✓ flaky (medium) | ✓ flaky (medium) | ✓ flaky (medium) | yes | ✓ flaky (flaky status) |
| r8 | s26 | environment | sufficient | Product info › Add to Cart updates the header basket badge | ✓ environment (high) | ✓ environment (high) | ✓ environment (high) | yes | ✓ environment (navigation status) |
| r8 | s32 | flaky | sufficient | Product info › sizes that are out of stock for the colour are disabled | ✓ flaky (medium) | ✓ flaky (medium) | ✓ flaky (medium) | yes | ✓ flaky (flaky status) |

## Seeded failures as observed

| Run | Scenario | Truth | Evidence sufficient | Failing test | Error type | Playwright status |
| --- | --- | --- | --- | --- | --- | --- |
| r1 | s11 | product_bug | no | Product info › shows the product name and price | Error: expect(locator).toBeVisible() failed | failed, 2 attempts |
| r1 | s16 | environment | no | Smoke: site health › route responds: /api/product (/api/product) | Error: /api/product returned 502 | failed, 2 attempts |
| r1 | s18 | test_bug | yes | Product extras › the size chart switches between inches and centimetres | Error: expect(locator).toContainText(expected) failed | failed, 2 attempts |
| r1 | s24 | product_bug | no | Product info › selecting a colour updates the stock for the selected size | Error: expect(locator).toBeVisible() failed | failed, 2 attempts |
| r2 | s02 | flaky | yes | Product info › quantity cannot go above the stock of the selected variant | TimeoutError: page.goto: Timeout 30000ms exceeded. | flaky, 2 attempts |
| r2 | s03 | flaky | yes | Product info › Add to Cart updates the header basket badge | TimeoutError: page.goto: Timeout 30000ms exceeded. | flaky, 2 attempts |
| r2 | s05 | product_bug | yes | Product info › sizes that are out of stock for the colour are disabled | Error: expect(locator).toBeDisabled() failed | failed, 2 attempts |
| r2 | s07 | test_bug | yes | Delivery estimate › the delivery date range is calculated from the visitor's date after load | Error: expect(locator).toBeVisible() failed | failed, 2 attempts |
| r3 | s17 | test_bug | yes | Product extras › opening an accordion item reveals its content | TimeoutError: locator.click: Timeout 15000ms exceeded. | failed, 2 attempts |
| r3 | s19 | flaky | yes | Product extras › the size chart switches between inches and centimetres | TimeoutError: page.goto: Timeout 30000ms exceeded. | flaky, 2 attempts |
| r3 | s22 | environment | yes | Smoke: site health › home page renders with site chrome | Error: page.goto: net::ERR_NAME_NOT_RESOLVED at http://novera-web.internal:3100/ | failed, 2 attempts |
| r3 | s29 | test_bug | yes | Product info › selecting a colour updates the stock for the selected size | TimeoutError: locator.click: Timeout 15000ms exceeded. | failed, 2 attempts |
| r4 | s06 | product_bug | yes | Delivery estimate › the delivery date range is calculated from the visitor's date after load | Error: expect(locator).toBeVisible() failed | failed, 2 attempts |
| r4 | s09 | environment | yes | Product info › quantity cannot go above the stock of the selected variant | TimeoutError: locator.fill: Timeout 15000ms exceeded. | failed, 2 attempts |
| r4 | s20 | environment | no | Smoke: site health › route responds: home (/) | Error: / returned 404 | failed, 2 attempts |
| r4 | s25 | flaky | yes | Product info › selecting a colour updates the stock for the selected size | TimeoutError: page.goto: Timeout 30000ms exceeded. | flaky, 2 attempts |
| r5 | s04 | environment | yes | Product info › shows the product name and price | Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3100/ | failed, 2 attempts |
| r5 | s10 | test_bug | yes | Product info › Add to Cart updates the header basket badge | Error: expect(locator).toHaveText(expected) failed | failed, 2 attempts |
| r5 | s14 | flaky | yes | Product extras › opening an accordion item reveals its content | TimeoutError: page.goto: Timeout 30000ms exceeded. | flaky, 2 attempts |
| r5 | s27 | product_bug | yes | Product extras › the size chart switches between inches and centimetres | Error: expect(locator).toContainText(expected) failed | failed, 2 attempts |
| r6 | s01 | test_bug | yes | Product info › quantity cannot go above the stock of the selected variant | TimeoutError: locator.fill: Timeout 15000ms exceeded. | failed, 2 attempts |
| r6 | s15 | flaky | yes | Delivery estimate › the delivery date range is calculated from the visitor's date after load | TimeoutError: page.goto: Timeout 30000ms exceeded. | flaky, 2 attempts |
| r6 | s23 | product_bug | yes | Product info › Add to Cart updates the header basket badge | TimeoutError: locator.waitFor: Timeout 15000ms exceeded. | failed, 2 attempts |
| r6 | s28 | product_bug | yes | Product extras › opening an accordion item reveals its content | Error: expect(locator).toBeVisible() failed | failed, 2 attempts |
| r7 | s08 | test_bug | no | Product info › sizes that are out of stock for the colour are disabled | Error: expect(locator).toHaveCount(expected) failed | failed, 2 attempts |
| r7 | s21 | environment | no | Product extras › the size chart switches between inches and centimetres | TimeoutError: page.goto: Timeout 30000ms exceeded. | failed, 2 attempts |
| r7 | s30 | test_bug | no | Product info › shows the product name and price | Error: expect(locator).toBeVisible() failed | failed, 2 attempts |
| r7 | s31 | environment | yes | Product info › selecting a colour updates the stock for the selected size | Error: expect(locator).toBeVisible() failed | failed, 2 attempts |
| r8 | s12 | product_bug | yes | Product info › quantity cannot go above the stock of the selected variant | Error: expect(locator).toHaveValue(expected) failed | failed, 2 attempts |
| r8 | s13 | flaky | yes | Smoke: site health › home page renders with site chrome | TimeoutError: page.goto: Timeout 30000ms exceeded. | flaky, 2 attempts |
| r8 | s26 | environment | yes | Product info › Add to Cart updates the header basket badge | Error: expect(locator).toBeVisible() failed | failed, 2 attempts |
| r8 | s32 | flaky | yes | Product info › sizes that are out of stock for the colour are disabled | TimeoutError: page.goto: Timeout 30000ms exceeded. | flaky, 2 attempts |

## Triage calls

| Run | Repeat | OK | Model | Input tokens | Output tokens | Seconds | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| r1 | 1 | yes | claude-opus-5-5 | 9844 | 1513 | 16.7 |  |
| r1 | 2 | yes | claude-opus-5-5 | 9844 | 1207 | 11.5 |  |
| r1 | 3 | yes | claude-opus-5-5 | 9844 | 1352 | 13.7 |  |
| r2 | 1 | yes | claude-opus-5-5 | 13686 | 1578 | 17 |  |
| r2 | 2 | yes | claude-opus-5-5 | 13686 | 1572 | 16 |  |
| r2 | 3 | yes | claude-opus-5-5 | 13686 | 1670 | 16.9 |  |
| r3 | 1 | yes | claude-opus-5-5 | 9945 | 1334 | 14.1 |  |
| r3 | 2 | yes | claude-opus-5-5 | 9945 | 1220 | 11.7 |  |
| r3 | 3 | yes | claude-opus-5-5 | 9945 | 1285 | 11.7 |  |
| r4 | 1 | yes | claude-opus-5-5 | 7917 | 1678 | 17.8 |  |
| r4 | 2 | yes | claude-opus-5-5 | 7917 | 1462 | 15.3 |  |
| r4 | 3 | yes | claude-opus-5-5 | 7917 | 1641 | 20.3 |  |
| r5 | 1 | yes | claude-opus-5-5 | 10723 | 1657 | 15.8 |  |
| r5 | 2 | yes | claude-opus-5-5 | 10723 | 1650 | 16 |  |
| r5 | 3 | yes | claude-opus-5-5 | 10723 | 1678 | 16.1 |  |
| r6 | 1 | yes | claude-opus-5-5 | 13172 | 2157 | 22.7 |  |
| r6 | 2 | yes | claude-opus-5-5 | 13172 | 2041 | 21.1 |  |
| r6 | 3 | yes | claude-opus-5-5 | 13172 | 1973 | 19.7 |  |
| r7 | 1 | yes | claude-opus-5-5 | 11099 | 1478 | 15.1 |  |
| r7 | 2 | yes | claude-opus-5-5 | 11099 | 1463 | 14 |  |
| r7 | 3 | yes | claude-opus-5-5 | 11099 | 1443 | 14.1 |  |
| r8 | 1 | yes | claude-opus-5-5 | 8926 | 1254 | 13.6 |  |
| r8 | 2 | yes | claude-opus-5-5 | 8926 | 1368 | 14.1 |  |
| r8 | 3 | yes | claude-opus-5-5 | 8926 | 1288 | 16.7 |  |

## Run checks

| Run | Scenarios | Manifest | Leakage scan | Payload chars (dry run) | Totals |
| --- | --- | --- | --- | --- | --- |
| r1 | s11 s16 s18 s24 | ✓ | ✓ clean | 18814 | passed 7, failed 4, flaky 0, skipped 19 |
| r2 | s02 s03 s05 s07 | ✓ | ✓ clean | 27557 | passed 7, failed 2, flaky 2, skipped 19 |
| r3 | s17 s19 s22 s29 | ✓ | ✓ clean | 19051 | passed 7, failed 3, flaky 1, skipped 19 |
| r4 | s06 s09 s20 s25 | ✓ | ✓ clean | 14624 | passed 7, failed 3, flaky 1, skipped 19 |
| r5 | s04 s10 s14 s27 | ✓ | ✓ clean | 20681 | passed 7, failed 3, flaky 1, skipped 19 |
| r6 | s01 s15 s23 s28 | ✓ | ✓ clean | 25995 | passed 7, failed 3, flaky 1, skipped 19 |
| r7 | s08 s21 s30 s31 | ✓ | ✓ clean | 21976 | passed 7, failed 4, flaky 0, skipped 19 |
| r8 | s12 s13 s26 s32 | ✓ | ✓ clean | 16856 | passed 7, failed 2, flaky 2, skipped 19 |
