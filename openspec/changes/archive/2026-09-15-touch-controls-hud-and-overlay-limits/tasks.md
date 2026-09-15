## 1. Touch gestures

- [x] 1.1 Add `pinchDistance(startDistance, startGap, gap)` and `pinchMiddle(a, b)` to
      [src/camera/controls.ts](src/camera/controls.ts), with the 10 to 120,000 light year
      clamp. Verify with unit tests in `src/camera/controls.test.ts` that read the spec's
      scenarios "A pinch zooms" and "A pinch holds the zoom limits".
- [x] 1.2 Add the pure reducer `touchGesture(state, reading)` to `controls.ts`, which takes
      a plain record of `pointerId`, `pointerType`, `x`, `y` and a time and returns the next
      state and the view action. `vitest.config.ts` sets `environment: 'node'`, so the
      reducer is what the unit tests drive. Verify with unit tests that a one-finger move
      asks for a plane drag and a two-finger move asks for an orbit and a distance.
- [x] 1.3 Restart the gesture inside `touchGesture` on every change in the count of
      pointers. Verify with the unit tests "A second finger does not move the view" and
      "Lifting one of two fingers does not move the view".
- [x] 1.4 Make `attachControls` turn a `PointerEvent` into a reading, call `touchGesture`,
      and apply the action through `dragCursor`, `orbit` and the distance write, branching on
      `event.pointerType === 'touch'` before the button rules. Verify the existing mouse unit
      tests and `e2e/navigation.spec.ts`, which holds the mouse control tests, still pass
      unchanged.
- [x] 1.5 End a running wheel glide on a pinch, as `setView` does. Verify with the browser
      test "A pinch ends the wheel glide", which reads the view the map holds, because the
      glide runs on the attached controls.
- [x] 1.6 Give the tap its own move limit of 10 CSS pixels, keeping `CLICK_HOLD_MS` at 400
      milliseconds, and make a tap that becomes a second finger not select. Verify with the
      browser test "A tap selects and a drag does not".
- [x] 1.7 Read the two earliest pointers while three or more are down, and ignore the rest.
      Verify with the unit test "A third finger does not change the gesture".
- [x] 1.8 Write `canvas.style.touchAction = 'none'` in `createMap` when it attaches the
      controls, and put the old value back on dispose. Verify with the browser test "The
      canvas takes the touches", which reads `none` before dispose and `auto` after it in a
      page that states no `touch-action` of its own.
- [x] 1.9 Add a second Playwright project to `playwright.config.ts` that shares the GPU
      launch arguments and sets `hasTouch: true`, and run the touch spec in it alone. Run
      `e2e/00-renderer.spec.ts` in both projects, so the new context asserts hardware
      rendering through `WEBGL_debug_renderer_info` as `chromium-gpu` does. Verify that
      `e2e/look.spec.ts` still runs in `chromium-gpu` only, so the baseline image is read by
      one project. Run the suite once: a second run takes the first one's server on port
      4173.
- [x] 1.10 Call the input hook from every gesture that acts on the view, so a running
      selection flight ends and the gesture acts on the view the flight had reached. Verify
      with the browser test "A gesture ends a running selection flight".
- [x] 1.11 Verify with the browser tests "One finger moves the cursor" and "Two fingers turn
      the camera" that the whole path from a touch event to the view holds the spec's
      figures.

## 2. The HUD

- [x] 2.1 Mark the `POSITION` field in [src/hud/info-panel.ts](src/hud/info-panel.ts) with
      a modifier class, give that class `grid-column: 1 / -1` in
      [src/hud/styles.ts](src/hud/styles.ts), and flip the existing
      `.gm-hud__field:last-child:nth-child(odd)` rule to `:nth-child(even)`, because
      `POSITION` now fills two cells. Verify with the browser tests for the panel layout:
      `POSITION` spans both columns, `DISTANCE FROM SOL` and `RANGE` share the row below, the
      position value does not wrap, and the scenario "An odd count of fields leaves no empty
      cell" reads both a four-field and a five-field record.
- [x] 2.2 Remove the `data-distance` write in [src/hud/categories.ts](src/hud/categories.ts)
      and the `.gm-hud__system-row::after` rule in `styles.ts`. Verify with the browser test
      "A row holds the name alone".
- [x] 2.3 Replace `expanded` in `categories.ts` with an open **set** that a change of the
      filter text writes and a rebuild only reads, seeded from a pure
      `matchingCategories(filter, groups)`, and let the expand button add or remove one name
      from it. Keep the **last category the user expanded by hand** as a second piece of state,
      written by the expand button, because that is what the panel goes back to when the box is
      cleared. Verify with unit tests of `matchingCategories`, with the browser test "A list
      folded during a search stays folded", and with the scenario that reads the panel after
      the box is cleared.
- [x] 2.4 Share the 200 row budget over the open lists, at `floor(200 / open)` rows each,
      with one row each for the first 200 open lists where that is 0. Verify with the browser
      tests "The rows are shared over the open lists", "More open lists than rows" and "The
      node count does not follow the count of open lists".
- [x] 2.5 Verify with the browser tests that a filter opens every matching category, that a
      switched-off category opens too, that the set recomputes on each filter-text change,
      and that clearing the box gives the panel back to the one hand-expanded category.

## 3. The region reading views

- [x] 3.1 Verify first that `tests/region-views.ts` already holds the premises: each of the
      four searches takes the zoom as a parameter, the three governed searches put the cursor
      on the reading point, `CROSSING_ROW_PIXELS` is 100, `CENTRE_FLOOR_LY` is 5,000 and no
      ceiling of 16,000 is left. Record which of them a search does not hold and change only
      those.
- [x] 3.2 Change the viewport and the zoom each governed search is **called** with, in
      `tests/region-views.ts` and `e2e/region-views.ts`: the width search and the traced-corner
      search to **3840x2160 at 20,000 light years**, the join search to **3200x1800 at 20,000**.
      Verify with `tests/region-views.test.ts` that one CSS pixel covers 10.69 light years at
      the first two and 12.83 at the join, and that the blur radius reads 4.62 and 3.85.
- [x] 3.3 Add the five-zoom clearance rule to `findPointNearBothSets`, which keeps its viewport
      of **1280x720**: every other chain SHALL stay clear of the 8 CSS pixel window at zooms of
      9,000, 15,000, 20,000, 25,000 and 31,000 light years. Verify with its own unit test at
      each of the five zooms.
- [x] 3.4 Run each of the four searches under its new call and record the count it returns —
      the bends of the straight run, the nodes of the join search, the points of the both-sets
      search and the corners of the traced search. Verify each count is a reading of this run
      and not of the old one.
- [x] 3.5 Regenerate `e2e/region-views.ts` from the four searches and verify the generated
      file is in step with `tests/region-views.ts`.

## 4. The region range fade

- [x] 4.1 Add `uInverseViewProjection` and `uPlaneY` to the composite program in
      [src/render/region-pass.ts](src/render/region-pass.ts), add the two fields to
      `RegionPassFrame`, and fill them where `src/render/renderer.ts` builds the frame.
      Verify with a unit test that the inverse the renderer computes and the matrix it is
      given multiply to the identity within 1e-4.
- [x] 4.2 Add `REGION_RANGE_NONE` of 10,000 light years and `REGION_RANGE_FULL` of 20,000
      to [src/render/region-pass.ts](src/render/region-pass.ts), beside the other region
      constants, and do not reuse `REGION_CLOSE_NONE` and `REGION_CLOSE_FULL`, which are the
      label zoom band. Intersect the fragment ray with the plane in
      [src/render/shaders/region-composite.frag](src/render/shaders/region-composite.frag)
      and multiply the alpha by `smoothstep(REGION_RANGE_NONE, REGION_RANGE_FULL, range)`,
      passed to the shader as the two values the constants hold. A ray that misses the
      plane takes 1. Verify with the browser tests "The boundary draws in full at the close
      end of the band" and "The overlay fades out across the close end of the band".
- [x] 4.3 Change `regionFade` to the far end of the zoom band alone, full at 20,000 light
      years and below and none at 30,000 and above. Verify with the unit test for the new
      `regionFade` readings and the browser test "The overlay fades out across the far end
      of the zoom band".
- [x] 4.4 Verify with the browser test "A far line still draws while the near line is gone"
      that a close zoom at a pitch of **30 degrees** keeps the lines near the horizon and
      clears the lines near the cursor. The scenario reads at 30 degrees and not at 5, because
      30 puts the horizon at the top edge and every row of the frame then reads the plane.
- [x] 4.5 Keep the region **labels** on the zoom band they hold, none below 5,000 light
      years. Verify with the browser test "The region the camera is inside is named at every
      zoom" and the label fade scenarios, which must not move.

## 5. The region blur

- [x] 5.1 Remove `regionBlurRuns` and replace both of its call sites — the early return in
      `regionBlurPeak` and the blur branch in `draw` — with the test that the radius is above
      0, which is false in `simplified` alone. Floor the kernel's standard deviation at 1 CSS
      pixel and set the tap count to `2 * ceil(3 * sigma) + 1`. Verify with the unit test
      "The blur keeps a straight run and rounds a corner", which now reads the radii 0.50,
      1.50 and 2.99 as well and checks they give the 3.00 row to three decimal places, and
      with a unit test that `simplified` gives a radius of 0 and a normalisation of 1.
- [x] 5.2 Read the blur radius at `max(cursorDistance, REGION_RANGE_NONE)` in
      `regionBlurRadiusCss`, which is the cursor with a floor at 10,000 light years.
      Verify with a unit test that every zoom of 10,000 light years and below gives the same
      radius at a given viewport.
- [x] 5.3 Verify with the browser tests "The blurred band is wider than the unblurred one"
      and "The far band is wider than the unblurred one as well" that the widths and the
      peaks hold at 3840x2160 at 20,000 light years and at 1920x1080 at 20,000.
- [x] 5.4 Measure the blur table again with a script that reproduces the kernel, the ridge
      and twelve sub-pixel phases, and write the readings into the spec if any row moves.
      Verify that the script's output and the table agree to the tolerances the spec states.

## 6. The region label filter

- [x] 6.1 Add a `seconds` argument to `update` on the label overlay and pass the `seconds`
      the loop in [src/app/create-map.ts](src/app/create-map.ts) already computes, which is
      clamped to 0.1. **Every `drawFrame` outside the loop passes 0**, so a redraw does not
      advance the filter; state it as a rule at the call so a new call site follows it.
      Verify with a unit test that 0 seconds moves no label, and with a browser test that
      `drawNow` leaves every label where it was.
- [x] 6.2 Turn the target share, the anchor share, the anchor cap and the anchor floor into
      rates per second. Verify with the unit test "The rates give the old figures at 60
      frames a second".
- [x] 6.3 Add the drift cap on the smoothed target of `carry + 120 * seconds` CSS pixels,
      and remove `targetShare`'s growth with the cube of the gap and the whole-take gate at
      120 CSS pixels. Verify with the unit tests "The target does not overtake the map" and
      "The share of the gap follows the gap".
- [x] 6.4 Add the jump flag to `update` and raise it from `createMap` for `setView`, the
      landing of a selection flight and a view read from the URL fragment, and not for a
      drag, a wheel glide or a flight in progress. Drop the carried target on a jump and keep
      the anchor. Verify with the unit test "A view jump takes the target whole".
- [x] 6.5 Give the centroid-to-samples handover a hysteresis band: taken up inside the
      frame, held until the centroid leaves the frame grown by a quarter. Verify with the
      unit test "The handover does not cross back and forth".
- [x] 6.6 Leave the ring search of 12, 24, 48 and 96 CSS pixels as it is. The drift cap is
      what turns the ring step into a walk. Verify with the unit tests "A target that must
      cross the frame walks there" and "The filter does not hop between samples" that a
      target the rings name 96 CSS pixels away is reached over frames and not in one.
- [x] 6.7 Verify with the unit test "A label moves the same distance at every frame rate"
      that runs of frames of exactly 1/30, 1/60 and 1/144 of a second, read after the frames
      the scenario names — 3, 6 and 9, then 6, 12 and 18, then 15, 29 and 44 — agree within 10
      CSS pixels at the first mark and within 2 at the other two. Do not write the frame times
      as milliseconds: 33.333 milliseconds moves the first mark to the fourth frame and breaks
      the bound.
- [x] 6.8 Verify that every label scenario the spec keeps still reads its stated figure,
      including "A pushed anchor comes back to the centre at once", which asks for 8 CSS
      pixels by frame 15 and 2 by frame 30.
- [x] 6.9 Measure the browser push in `e2e/labels.spec.ts` again and write the reading into
      the requirement, which marks the old 382 milliseconds as retired. Verify the reading is
      under the 400 millisecond bound the browser suite holds.

## 7. The grid coordinate labels

- [x] 7.1 Multiply a label's opacity by `alpha / GRID_MAX_ALPHA` in the style step of
      [src/app/grid-labels.ts](src/app/grid-labels.ts), reading `GRID_MAX_ALPHA` from the
      grid pass. Verify with the unit test "The factor is 1 at the cursor", which reads 1 at
      0.45 and 0.2 at the gate of 0.09.
- [x] 7.2 Add `gridLabelReadings()` to `GalaxyMapDebug` in `create-map.ts`, returning for
      each label of the last frame its text, its position in CSS pixels, its `alpha` and the
      opacity it was given. Verify with a browser test that the reading count matches the
      label count and that each position matches the element's own.
- [x] 7.3 Verify with the browser test "A label does not draw stronger than its line" at a
      zoom of 3,000 light years and a pitch of 5 degrees that every label's opacity is
      `0.80 * alpha / 0.45` times its background weight, and that a label near the top of
      the frame is fainter than one at the centre.
- [x] 7.4 Verify with the browser test "A label recedes over a bright background", now at a
      pitch of 89 degrees and the label nearest the canvas centre, that the background rule
      alone is read there.
- [x] 7.5 Move the view of `draws under the region boundary` in `e2e/grid.spec.ts` to a pitch
      of 5 degrees, and give the test a per-pixel plane range through `planePointAt`, so it
      picks the crossing among the pixels whose plane point is beyond 20,000 light years. At a
      zoom of 8,000 and a pitch of 5 those rows are a strip of about 33 rows at 1,080, between
      42.4 and 45.5 per cent of the frame height, which the rectangle the test reads today
      covers. Make the test fail with a readable message when no crossing lands in the strip.
      Verify with the browser test "The overlays draw over the grid" that the ratio falls
      between 0.30 and 0.75, and write the reading it gives into the `coordinate-grid` spec.

## 8. Measure the spec's readings again

- [x] 8.1 Write the four counts into the `galactic-regions` spec, which this change took the
      old ones out of. Verify that every count in the requirement is one this work measured.
- [x] 8.2 Verify with the browser test "The overlay costs under a millisecond" at 1920x1080
      at a zoom of 4,000 light years, which is the widest kernel the radius rule gives.
- [x] 8.3 Verify with the browser test "The sampling stays inside its budget" that the label
      sweep still holds under 2 milliseconds as a mean over 300 frames and under 4 in any
      single frame.
- [x] 8.4 List every test in `e2e/` outside `regions.spec.ts` that reads an **absolute**
      pixel value of the frame at a zoom under 30,000 light years with the region overlay on.
      Verify the list by that rule and not by a count. A test that subtracts two frames taken
      at the same overlay state does not qualify: the overlay stands in both readings, so a
      wider boundary scales the difference and does not move it past its bound. `the clouds
      fade at close range` and `the sum of the sprites stays bounded` in `e2e/look.spec.ts`
      are of that kind.
- [x] 8.5 Turn the overlay off in each test the list holds whose reading is not about the
      overlay, as `e2e/grid.spec.ts` already does in its other tests. Take the suites to change
      from the list task 8.4 measured and not from a guess. The baseline image of
      `e2e/look.spec.ts` already draws with `regions: false`, so it must not move; say so if
      the list puts another test of that file in scope.
- [x] 8.6 Where a scenario of another capability states the overlay state, stop and write a
      delta for that capability rather than change the setup in silence. Verify by naming
      every suite changed and every delta added, or by stating that none was needed.

## 9. Close the change

- [x] 9.1 Run `pnpm lint`, `pnpm test` and the one Playwright run, and verify all three
      pass. Verify the run asserts hardware rendering through `WEBGL_debug_renderer_info`.
- [x] 9.2 Verify `e2e/look.spec.ts` passes with its committed baseline image unchanged.
- [x] 9.3 Update [docs/roadmap.md](docs/roadmap.md) where a decision in this change replaces
      one it records, and verify the entry names the change.
- [x] 9.4 Run `openspec validate touch-controls-hud-and-overlay-limits` and verify it
      reports the change valid.
