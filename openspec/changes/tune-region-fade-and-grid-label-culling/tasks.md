## 1. The region range fade

- [x] 1.1 Add `REGION_WIDTH_RANGE = 12000` to `src/render/region-pass.ts` and make
      `regionBandHalfWidthAtRange` and the `uReferenceRange` uniform read it in place of
      `REGION_RANGE_FULL`. Verify `pnpm vitest run src/render/region-pass.test.ts`
      passes with every width expectation unchanged.
- [x] 1.2 Set `REGION_RANGE_NONE` to 5000 and `REGION_RANGE_FULL` to 8000, and update the
      comments on both to the new figures. Verify nothing else in `src/` reads either
      constant as a width, with
      `grep -rn "REGION_RANGE_FULL\|REGION_RANGE_NONE" src/`.
- [x] 1.3 Update `src/render/region-pass.test.ts`: the two constants read 5,000 and 8,000
      and `regionFade` keeps its zoom figures of 20,000 and 30,000. The range fade itself
      has no function in this module, so this task asserts the constants alone. Verify the
      file passes.
- [x] 1.4 Add the scenario "The band's width keeps its own reference range" to
      `src/render/region-pass.test.ts`, reading the whole band at 1,080 CSS rows at
      5,000, 8,000, 12,000, 20,000 and 40,000 light years against 34.6, 34.6, 34.6, 20.7
      and 10.4 CSS pixels. Verify it passes.

## 2. The region labels

- [x] 2.1 Update the existing `labelRangeFade` test in `src/app/labels.test.ts` to the
      scenario "The range fade reads its two figures": 0 at 4,000 and 5,000, 0.5 at 6,500,
      1 at 8,000 and 20,000. This is the CPU reading of the fade, and `labelRangeFade` and
      `labelSweepRuns` need no change themselves. Verify the file passes.
- [x] 2.2 Fix the doc comment on `labelSweepRuns` in `src/app/labels.ts`, which states
      that the whole frame lies inside the range floor at a pitch of 89 degrees and a zoom
      of 4,000 light years. Against the floor of 5,000 the corner rays of that view reach
      6,243 light years. Write the new example, a zoom of 2,500 light years, where the
      corners reach about 3,900. Verify by reading the comment against the test in 2.3.
      Measured: the corners reach 6,242.66 light years at 4,000 and 3,901.66 at 2,500, at
      1920x1080.
- [x] 2.3 Update the unit scenario for the sweep gate to a zoom of 2,500 light years, and
      verify the sweep does not run at a pitch of 89 degrees there and does run at 20.
      Measured: 3,901.66 light years at a pitch of 89, and the horizon at a pitch of 20.

## 3. The recorded views

- [ ] 3.1 Run the `NO_LINE_VIEW` search again against the floor of 5,000 light years and
      write what it finds into `e2e/region-views.ts`, including `rangeFloorLy`. Verify
      `pnpm vitest run tests/region-views.test.ts` passes with the assertion changed to
      `REGION_RANGE_NONE` and 5,000.
- [ ] 3.2 Run the `ONE_CHAIN_POINT` search again over the six zooms 4,000, 6,500, 8,000,
      20,000, 25,000 and 31,000 light years, write the point and its `heldCount` into
      `e2e/region-views.ts`, and verify `tests/region-views.test.ts` passes.
- [ ] 3.3 Confirm the three governed searches (width, join, traced corner) report the
      same counts as before, because premise one holds with more room and no view moves.
      Verify with the same test file, and record any count that did move.

## 4. The grid label gate

- [ ] 4.1 Add the unit test for "A label whose crossing is off the frame stays": a frame
      whose cursor puts a crossing inside the reach past the right edge, with the label's
      own quad still over the viewport, places that label. Verify it fails against the
      gate as it stands today.
- [ ] 4.2 Take the crossing's viewport test out of `gridLabelPlacements` in
      `src/app/grid-labels.ts`, leaving the near-plane, bounds, Jacobian and alpha gates
      and the `planePlacement` drop. Verify the test from 4.1 now passes.
- [ ] 4.3 Change the test "drop a candidate outside the viewport" in
      `src/app/grid-labels.test.ts` to read each placement's screen bounding box against
      the viewport rather than its anchor, and add the unit test for "A label goes when no
      part of it is on the frame". Verify
      `pnpm vitest run src/app/grid-labels.test.ts` passes.
- [ ] 4.4 Hold the background sample point inside the frame where `createGridLabelOverlay`
      reads it, and add the unit test for "A label at the edge reads the background inside
      the frame". Verify it passes.

## 5. The browser suite

- [ ] 5.1 Update `e2e/regions.spec.ts` for the new figures: the close-end scenario at
      8,000 and 4,000 light years, the far-line scenario reading the top 20 per cent and
      the rows below 45 per cent, and the close-fade scenario at 8,000, 6,500 and 4,000.
      Verify with `GALAXY_MAP_E2E_BUILT=1 pnpm exec playwright test e2e/regions.spec.ts`.
- [ ] 5.2 Update `e2e/labels.spec.ts`: `smoothstep(5000, 8000, range)`, the zoom ladder of
      20,000, 15,000, 10,000, 6,500 and 3,000 light years with the clause that one reading
      must land strictly inside the fade band, the sweep view at 2,500 light years, the
      no-line view, and the 40 light year window's worst cost of 0.020 against the room of
      0.024. Print the measured anchor range at each of the five zooms and replace the
      "about 4,000 light years" comment with the figure the run reads. Read the measured
      range at 6,500 against the paragraph "The ladder moves with the fade" in the delta, and
      soften its first sentence if the measurement disagrees with it. Verify with one
      Playwright run over that file.
- [ ] 5.3 Update the two grid browser scenarios the new gate reaches, in
      `e2e/grid.spec.ts`: "Every label sits on a line" SHALL skip a label whose anchor is
      outside the viewport and SHALL NOT clamp the read rectangle into the canvas, and
      SHALL fail when no label is read; "A label does not draw stronger than its line"
      SHALL work out its expected weight at the same held point the placement reads.
      Verify with one Playwright run over that file.
- [ ] 5.4 Run `e2e/frame-budget.spec.ts` and the sampling budget scenario, and record the
      mean and worst sampling times against the 2 ms and 4 ms bounds. The sweep now runs
      in frames that skipped it, so this is a reading and not an assumption.
- [ ] 5.5 Run `e2e/look.spec.ts`, read every snapshot that changed, confirm the change is
      band drawn between 5,000 and 8,000 light years of range, or a grid label kept at the
      frame edge, and nothing else, and accept the new baselines. Name the views that
      moved in the apply summary.

## 6. The whole suite and the gate

- [ ] 6.1 Run `pnpm lint` and the type check the `package.json` scripts hold, and fix what
      they report.
- [ ] 6.2 Run `pnpm vitest run` on its own, with no Playwright run in flight, and verify
      every unit test passes.
- [ ] 6.3 Run the whole Playwright suite once, one run at a time, and verify it passes
      with the renderer assertion holding on hardware.
- [ ] 6.4 Check that no figure of the two delta specs is left unmet, by reading each
      changed scenario against the test that holds it. Do not edit `openspec/specs/` by
      hand; the archive step carries the delta.
- [ ] 6.5 GATE — implementation review. Launch the `openspec-implementation-reviewer`
      subagent with this change id, wait for its verdict, fix what it blocks on, and
      state the verdict and every finding when presenting the work.
