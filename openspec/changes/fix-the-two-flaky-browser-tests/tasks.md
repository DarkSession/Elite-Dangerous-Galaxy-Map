## 1. Read the ground first

- [ ] 1.1 Read `reclampView` in `src/app/create-map.ts` and confirm it ends the glide on
      `moved` **or** `glideOutside`, so a test that wants the second one must make the
      first impossible; note the line number for the test comment
- [ ] 1.2 Build the demo site once, then run the two failing tests ten times each and
      record the failure rate, so the fix has a before to answer:
      `GALAXY_MAP_E2E_BUILT=1 pnpm exec playwright test --project=chromium-gpu -g "narrowing the bounds drops a running zoom glide" --repeat-each=10 --workers=1`
      and the same with `--project=firefox -g "the blurred panel backdrop fails the budget"`.
      Run one Playwright process at a time: a second one takes the port 4173 server of the
      first

## 2. The bounds test proves the drop and not the clamp

- [ ] 2.1 Rewrite the body of `narrowing the bounds drops a running zoom glide` in
      `e2e/navigation.spec.ts` so one `page.evaluate` reads the live distance and
      `zoomTargetLy()`, works out a sphere radius of `(distance + target) / 4`, calls
      `setBounds` with that radius and a `centre` of `[0, 0, 0]`, which is where the view
      opens, and gives back the cursor, the distance and the target it read before the
      call, the radius it used, and the cursor, the distance and the target after it.
      The centre matters: `reclampView` reads `moved` from the cursor as well as the
      distance, so a centre away from the cursor would move it, `moved` would be true, and
      the test would read the re-clamp again
- [ ] 2.2 Assert, in this order: the target read before the call is not null; the derived
      far limit is above that distance and below that target; the cursor after the call
      equals the cursor before it, so `moved` was false; the distance after the call equals
      the distance before it; the target after the call is null; the distance one second
      later still equals the distance before the call. Verify no assertion carries a
      hand-written tolerance on the far limit
- [ ] 2.3 Rewrite the comment above the test to name the spec scenario "Narrowing the
      bounds drops a running zoom glide" and to state why the bound is derived from the
      readings. Record the measured window a fixed bound gave: the glide passes 2,000 at
      50 ms, which is frame 3, and lands at 383 ms
- [ ] 2.4 Run the test 10 times and verify 10 of 10 pass:
      `GALAXY_MAP_E2E_BUILT=1 pnpm exec playwright test --project=chromium-gpu -g "narrowing the bounds drops a running zoom glide" --repeat-each=10 --workers=1`
- [ ] 2.5 Negative control: comment out the `glideOutside` clause of `reclampView`, run the
      test once, verify it fails, and put the clause back. Verify `git diff src/` shows no
      change from this task afterwards

## 3. The panel rise becomes a paired reading

- [ ] 3.1 Change `addRule` in `e2e/paint-cost.spec.ts` to take an id beside the rule text
      and to remove an element of that id before it writes one, and add a `removeRule`
      that takes the same id. Verify the label shadow test, which calls `addRule`, still
      passes
- [ ] 3.2 Add a helper that runs four pairs of moves, each pair one flat move and one
      blurred move beside it, in the order flat first, blurred first, blurred first, flat
      first, and gives back each pair's rise, its order, each flat mean, each blurred mean
      and the panel boxes. Verify the helper logs all five, because the reading is the
      evidence the spec records and the order tells a warm flat move from a cold one
- [ ] 3.3 Add `PANEL_RISE_MS = 1.5` beside `RISE_MS`, with a doc comment that states the
      recorded distribution and the rule the spec gives for a floor of this kind, and
      rewrite the `RISE_MS` doc comment, which still says "a floor of 2 ms holds four times
      that spread" — the reasoning this change removes from the spec. Verify neither
      comment names a number the spec no longer holds
- [ ] 3.4 Rewrite `the blurred panel backdrop fails the budget` to take the four pairs and
      assert that the median of the four rises, which is the mean of the middle two of the
      sorted readings, is at least `PANEL_RISE_MS`. Keep the `flat.panels` floor of 2, so a
      page with no panel cannot pass the reading. Rewrite the inline comment of the test,
      which still names 2.5 ms and "the five readings" `browser-suite` no longer holds
- [ ] 3.5 Verify the label shadow test still reads one pair and `RISE_MS`, and that
      `GALAXY_MAP_E2E_BUILT=1 pnpm exec playwright test --project=firefox -g "the blurred label shadow" --workers=1`
      passes

## 4. The documents

- [ ] 4.1 Update the file comment at the head of `e2e/paint-cost.spec.ts` to state the
      paired reading, the turned-around second pair, and why the rise is a median
- [ ] 4.2 Add each reading to the `docs/roadmap.md` section of the work it belongs to: the
      spread of the panel rise to "Phase 5.6: the overlay paint cost", and the far zoom
      limit in doubles to "Phase 5.8: the free camera and the host controls". Verify
      neither bullet sits in the other section
- [ ] 4.3 Verify `openspec validate fix-the-two-flaky-browser-tests --strict` reports the
      change valid

## 5. Set the floor from a measured distribution

These tasks run **after** every other edit of the change, because the blur cost follows the
panel geometry and the reading must belong to the tree the change leaves.

- [ ] 5.1 Verify the tree is otherwise final: `pnpm lint` and `pnpm exec tsc --noEmit` are
      clean, `pnpm test` passes, and `git status` shows no edit of `src/hud/` from this
      change. Record the current `git rev-parse HEAD` and note that the shape categories
      work is in the working tree
- [ ] 5.2 Measure the new statistic 12 times and record every median, every flat mean,
      every blurred mean and the panel boxes:
      `GALAXY_MAP_E2E_BUILT=1 pnpm exec playwright test --project=firefox -g "the blurred panel backdrop fails the budget" --repeat-each=12 --workers=1`
- [ ] 5.3 Set the floor from the rule the spec states: at most the smallest of the 12
      medians less 0.3 ms. Where the smallest is 1.8 ms or above, the floor stays 1.5;
      where it is below, lower the floor in `PANEL_RISE_MS` and in the spec delta together
- [ ] 5.4 Where the sample standard deviation of the 12 medians is not below **0.325 ms**,
      which is the standard deviation of the 22 single pair readings, the pairing gave no
      smaller spread: drop task 3.2 and 3.4 back to one pair with a floor of 1.2 ms, and
      change `specs/browser-suite/spec.md` and `design.md` to the fallback the design names.
      Record the standard deviation the 12 medians gave and which of the two it chose
- [ ] 5.5 Write the readings into the requirement "A camera move holds the paint budget in
      Firefox" in
      `openspec/changes/fix-the-two-flaky-browser-tests/specs/browser-suite/spec.md`, as a
      table beside the table of 22 single pair readings. On the paired path, write the 12
      medians, the order of each pair and the panel boxes, and remove the sentence that
      marks 1.5 ms as the single pair value. On the fallback path of task 5.4, write the 12
      single pair rises and the panel boxes, and leave that sentence, because the scenario
      then states the single pair statistic again
- [ ] 5.6 Run the test 12 more times with the floor that task 5.3 or task 5.4 left, and
      verify 12 of 12 pass

## 6. Verify the whole tree

- [ ] 6.1 Run `pnpm lint` and `pnpm exec tsc --noEmit` again and verify both are clean
- [ ] 6.2 Run `pnpm test` and verify it passes, with `tests/browser-suite.test.ts` among
      the files it ran
- [ ] 6.3 Run `pnpm test:e2e` to the end, with no other Playwright run on the machine, and
      verify both passes are green
- [ ] 6.4 Mark every task above complete, then run the `openspec-implementation-reviewer`
      subagent with the change id and act on its verdict before a human sees the work
