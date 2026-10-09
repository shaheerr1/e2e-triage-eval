# Ablation: r1 without s16

Payload: `r1`'s e2e-results.json with only the s16 failure entry removed; totals, run info and every other failure unchanged.

| Scenario | Truth | Payload | Repeat | Category | Confidence | Next step |
| --- | --- | --- | --- | --- | --- | --- |
| s11 | product_bug | Batched r1 | 1 | ✗ environment | low | Fix the /api/product 502 and rerun; if £25 persists, compare the CMS price for products[0] and check whether the price formatter rounds to whole pounds. |
| s11 | product_bug | Batched r1 | 2 | ✗ environment | medium | Fix the /api/product 502 and rerun. If it still shows £25, treat it as a price-formatting or rounding product bug. |
| s11 | product_bug | Batched r1 | 3 | ✗ environment | low | Fix the /api/product 502 and rerun. If the page still shows £25, treat it as a price rounding/formatting product bug or update the profile test data. |
| s11 | product_bug | Without s16 | 1 | ✗ test_bug | low | Check products[0]'s price in the CMS. If it is 24.99 and is shown as £25, raise a price-rounding bug. If it is 25, update the expectation or read the price from profile data. |
| s11 | product_bug | Without s16 | 2 | ✓ product_bug | low | Check the price for profile.data.products[0] in the CMS/fixture. If it is 24.99, fix the price formatter's rounding; if it is 25, update the test. |
| s11 | product_bug | Without s16 | 3 | ✓ product_bug | low | Check the Twill Overshirt price in the product data. If it is 24.99, fix the price formatter. If it is 25, update the test or read the price from profile data. |
| s18 | test_bug | Batched r1 | 1 | ✓ test_bug | high | Change the regex on line 12 of product-extras.spec.ts to /^M\b/, or keep L and expect 28 / 71.1. |
| s18 | test_bug | Batched r1 | 2 | ✓ test_bug | high | Change the locator in product-extras.spec.ts line 12 to getByRole('row', { name: /^M\b/ }) and check that the cm expectation 69.9 matches M. |
| s18 | test_bug | Batched r1 | 3 | ✓ test_bug | high | Change line 12 to name: /^M\b/ (and check the 69.9 cm value matches M), or keep L and expect 28 inches. |
| s18 | test_bug | Without s16 | 1 | ✓ test_bug | high | Change line 12 of product-extras.spec.ts to getByRole('row', { name: /^M\b/ }), or keep the L row and expect 28 inch and the matching cm value. |
| s18 | test_bug | Without s16 | 2 | ✓ test_bug | high | Change line 12 to getByRole('row', { name: /^M\b/ }), then rerun to check the CM assertion (69.9). |
| s18 | test_bug | Without s16 | 3 | ✓ test_bug | high | In product-extras.spec.ts:12, change the regex to /^M\b/, or keep L and expect 28 and the matching cm value. |
| s24 | product_bug | Batched r1 | 1 | ✗ environment | low | After /api/product is healthy, verify the Sage/S stock in the source data and either reset the fixture data or update the expectation in product-info.spec.ts. |
| s24 | product_bug | Batched r1 | 2 | ✗ environment | medium | Fix the /api/product 502 and rerun. If it still shows 11, compare the stock fixture in profile data with the CMS value and update whichever is wrong. |
| s24 | product_bug | Batched r1 | 3 | ✗ environment | low | After /api/product is healthy, rerun. If stock is still 11, confirm the seeded stock for Sage/S and update either the fixture or the test. |
| s24 | product_bug | Without s16 | 1 | ✗ test_bug | medium | Find out whether Sage/S stock was changed in the fixture data or reduced by an earlier test. Then pin the seed data or take the expected count from profile data rather than a literal. |
| s24 | product_bug | Without s16 | 2 | ✗ test_bug | low | Confirm the Sage/S stock in the fixture data. Then read expected stock counts from profile.data instead of hardcoding them, or fix the fixture if 12 is correct. |
| s24 | product_bug | Without s16 | 3 | ✗ test_bug | low | Compare the seed stock for Sage/S with 11. Then either update the expectation or read it from profile data, and make sure no other test changes stock without resetting it. |
| s24 | product_bug | Solo s24 | 1 | ✗ test_bug | low | Check the real stock for Twill Overshirt Sage/S in the novera fixture or CMS. If it is 11, read expected stock from profile.data instead of hardcoding '12 In Stock' and '5 In Stock'. If it should be 12, file a product bug on the stock display. |
| s24 | product_bug | Solo s24 | 2 | ✗ test_bug | medium | Check the Sage/S stock in the fixture or CMS data for profile.data.products[0]. If 11 is correct (or something decremented it), read the expected count from test data instead of hardcoding it; if the source says 12, treat this as a product bug in the stock display. |
| s24 | product_bug | Solo s24 | 3 | ✗ test_bug | low | Check the Sage/S stock in the novera fixture or backend. If it is 11, or an add-to-cart test decrements it, read the expected count from profile.data instead of hardcoding '12 In Stock' (and '5 In Stock'). If the source data really says 12, treat it as a stock-calculation bug. |
