# Tasks

The seven items are ordered so each one is complete and tested before the next starts.
Items 2 to 7 do not depend on item 1, so the order is a review convenience and not a
dependency chain. Item 0 comes first because it measures the ground everything else stands on.

Run `pnpm test` for the unit tests and `pnpm test:e2e` for the browser tests. Run only one
Playwright suite at a time: a second run takes the first one's preview server on port 4173
and the failures look real.

## 0. Baseline

- [x] 0.1 Run `pnpm test` and `pnpm test:e2e` on a clean tree and record the results, so a
      failure that was already there is not read as a new one.
      **Result**: branched from `origin/main` at 37aa26b. `pnpm test` 808 passed in 67
      files. `pnpm test:e2e` both passes green, 52 tests in the timed pass. No pre-existing
      failure.
- [x] 0.2 Record the mean frame time of the default view with 10,000 systems at 1920x1080,
      through `debug.frameStats()`. Item 5 raises the drawn marker count at that view, and
      this is the number it is measured against.
      **Result**: **1.767 ms** mean over 300 frames, cursor (0,0,0), distance 60,000, yaw 0,
      pitch 35. `debug.systemMarkerCount()` reads **8,322** of 10,000: the camera rule cuts
      1,678 markers at the default view today, which is the band item 5 removes.
- [x] 0.3 Confirm `WEBGL_debug_renderer_info` reports the NVIDIA card and not SwiftShader or
      llvmpipe, so every measurement below is a hardware one.
      **Result**: `ANGLE (NVIDIA, Vulkan 1.4.341 (NVIDIA NVIDIA GeForce RTX 4080
      (0x00002704)), NVIDIA)`.

## 1. The selection flight follows a Van Wijk arc

- [x] 1.1 Rewrite `src/camera/flight.ts`: `planFlight(from, to)` returns
      `{ r0, S, durationMs, from, to }` and `flightAt(plan, elapsedMs)` returns a view. Use
      `r(i) = -Math.asinh(b(i))`. Export `FLIGHT_RHO` (1.42), `FLIGHT_SPEED` (1.6),
      `FLIGHT_MIN_MS` (400) and `FLIGHT_MAX_MS` (2000). Remove `FLIGHT_MS` and
      `flightEase`.
- [x] 1.2 Handle the two special cases: a pan below 1e-6 light years is a pure zoom, and a
      pan below 1e-6 with a zoom ratio whose log is below 1e-6 gives `S` of 0.
- [x] 1.3 Clamp each sampled distance with `clampDistance`, so a restricted far zoom limit
      holds over the middle of the path.
      **Note**: `flightAt` clamps to the global limits alone, because the module takes no
      bounds. A restricted far limit holds over the middle of the path through the frame
      loop, which passes every sampled view through `normaliseView` with the resolved
      bounds before it writes it.
- [x] 1.4 Update `src/camera/flight.test.ts`: the invariant over 40 even steps of `s` is 1
      within 2 per cent; the start and the end are exact; the 20,000 light year move at 100
      light years peaks at 17,463 within 2 per cent; the 100,000 light year move peaks at
      87,313; the 163,430 light year move asks for 142,695 and writes no more than 120,000;
      `S` of 0.96, 0.1 and 8.25 give 600, 400 and 2,000 ms; an identical start and end give
      `S` of 0.
- [x] 1.5 Update `src/app/create-map.ts`: `centreOn` calls `planFlight`, `advanceFlight`
      reads `plan.durationMs`, and `debug.selectionFlightMs()` reads it too.
- [x] 1.6 Update `e2e/` selection tests: every wait of 800 ms becomes 2,500 ms.
- [x] 1.7 Add the browser test for the restricted cap, which needs item 3, so leave it
      unchecked until 3 lands and then run it.
      **Result**: `e2e/selection.spec.ts`, "a restricted zoom limit caps the path". The
      path asks for 4,647 light years and the flight holds at the 4,000 light year cap.
- [x] 1.8 Run `pnpm test` and `pnpm test:e2e`. Confirm the frame-rate scenario still holds
      a mean interval at or under 18 ms with 10,000 systems.
      **Result**: 813 unit tests passed. Browser suite 384 + 52 passed. The flight interval
      reads **16.67 ms** mean and 16.80 ms worst over 121 frames, which is the 60 Hz refresh,
      so the longer flight drops no frame.
- [x] 1.9 Watch a flight in the running app at three scales: a click on a near marker, a
      HUD row from the default far view, and a HUD row from a 100 light year view. The
      third is the case the old rule could not show at all.
      **Result**, as a distance trace in the running app:
      - a 60 light year move at 500 light years runs the 400 ms floor and peaks at 502.7,
        so a near selection barely moves the camera out;
      - a 20,000 light year move from the default 60,000 falls 58,780 to 733 over 2,000 ms
        and never rises, because the start is already further out than the path asks for;
      - a 20,000 light year move at 100 light years rises 100 to **17,462** and falls back
        to 100 over 2,000 ms. The analysis predicted 17,462.8. The old rule held the
        distance at 100 for the whole move, which is 174 screen widths of blur.

## 2. The pitch runs from -89 to 89 degrees

This item carries the `plane-overlay` delta as well as the `coordinate-grid` one.

- [x] 2.1 `src/camera/view.ts`: `MIN_PITCH` becomes -89. Update its comment.
- [x] 2.2 `src/render/shaders/grid.frag`: replace the downward floor at line 77 with the
      both-directions form from [design.md](design.md). Write the 1e-6 floor out rather than
      using `sign`, which is 0 at 0. Update the `uPlaneY` comment at line 18.
- [x] 2.3 `src/render/grid-pass.ts`: update the comment that says `uPlaneY` is never
      positive.
      **Result**: no such comment is in `grid-pass.ts`. Its comment says only where the
      plane sits in the world frame and claims no sign. The claim lived in `grid.frag` and
      in `plane-overlay.ts`, and tasks 2.2 and 2.4 fixed both. A search of `src/` and
      `e2e/` for `never positive`, `always negative` and `camera sits above` found nothing
      else.
- [x] 2.4 `src/app/plane-overlay.ts`: the winding test at line 293 compares the signed area
      against the side of the plane the camera is on, as the `plane-overlay` delta states.
      Update the doc comment at line 238 and the premise it carries.
- [x] 2.5 Add unit tests: `clampPitch(-1000)` is -89; a drag of 20 pixels upward from 3
      degrees steps by 0.3 with no gap at 0; `planePlacement` keeps a quad at -45 degrees
      with a box within 2 per cent of the one at +45, and returns null at a pitch of 0
      without throwing. The last two are the `plane-overlay` delta's scenarios.
- [x] 2.6 Add browser tests: the grid draws at -45 degrees and its spacing reading matches
      +45; the crossing label counts at -45 and +45 are equal; the cursor marker's box width
      at -30 and +30 agree within 2 per cent; a frame at a pitch of 0 draws without error
      with the grid pixels inside a 4 pixel band.
- [x] 2.7 Add the label sweep cost comparison at -20 and +20 degrees, within 20 per cent.
      **Note**: the scenario said 60 frames. The sweep costs about 0.2 ms and the browser
      clock steps by 0.1, so over 60 frames the gap between the two pitches measured 0.8,
      2.4, 8.1 and 20.1 per cent over four runs: the bound sat on the noise floor. Over 300
      frames the same runs gave 0.9, 8.1, 0.9 and 1.7. The scenario now reads 300 frames
      and keeps the 20 per cent bound. `labels.spec.ts` already uses 300 for its own
      budget reading.
- [x] 2.8 Run `pnpm test` and `pnpm test:e2e`.
- [x] 2.9 Look at the running app from under the disk at -20, -45 and -80 degrees, with the
      grid, the labels, the cursor marker, the region overlay and the shapes all on. This is
      the step that catches a seventh assumption the design did not find.
      **Result**: it did catch one. The region lines, the region labels, the cursor marker,
      the density and the grid all drew correctly at -20, -45 and -80, with the element
      counts equal to the positive pitch of the same size. The **grid's coordinate labels
      read backwards**: a label lies on the plane, so a reader under the disk saw its face
      from behind. The design did not find it and the spec sentence for it contradicted
      itself. The owner chose to turn the element over to face the reader. `plane-overlay`
      now solves the homography with the height axis reversed where the camera is under the
      plane, and both specs state the rule. Confirmed by screenshot: the label reads
      `0 : -35 : 26,000` from -45 degrees as it does from +45.

## 3. The browsable space takes three modes

- [x] 3.1 Add the `BrowseBounds` type and the resolved shape to `src/camera/view.ts`, with
      `resolveBounds(bounds, systemBox)` and `farZoomLimit(resolved)`.
- [x] 3.2 `clampCursor` takes the resolved shape: a box clamps per axis, a sphere moves an
      outside cursor to the nearest surface point. `clampDistance` takes the far limit.
      `normaliseView` passes both.
- [x] 3.3 `src/camera/controls.ts`: the wheel target clamps to the far limit rather than to
      a constant 120,000.
- [x] 3.4 `src/scene-data/real-systems.ts`: keep a running six-number box as records are
      read. Reset it on `clearSystems` and `clearSystemsAndCategories`. Expose it.
- [x] 3.4a Make the selection end state, the HUD centre view button and `flyTo` all take
      the cursor clamp and the far zoom limit, so a system outside the bounds lands on the
      nearest allowed cursor rather than moving the camera out or refusing the selection.
      **Note**: `centreOn` normalises the end view before it plans the path, and the HUD
      centre view button goes through `setView`, which normalises too. `flyTo` arrives in
      item 7 and takes the same path, which task 7.1 states.
- [x] 3.5 `src/app/create-map.ts`: hold the host's setting and the resolved shape, add the
      `bounds` option, `getBounds` and `setBounds`, re-resolve on every change of the set
      and on a dataset load, and re-clamp the view in that frame, raising the view change
      listeners where the clamp moved it.
- [x] 3.6 Reject an unreadable setting and leave the previous one in place.
- [x] 3.7 Unit tests: a sphere clamps (3000,0,0) to (1000,0,0) at radius 1,000; the far
      limit is `2 * R`, floored at 10 and capped at 120,000; an empty auto box resolves to
      unrestricted.
- [x] 3.8 Browser tests: the eight bounds scenarios of the `map-navigation` delta, including
      that the bounds hide nothing, plus `system-selection`'s "A selection outside the
      bounds lands on the nearest allowed cursor".
- [x] 3.9 Run task 1.7 now, and `pnpm test` and `pnpm test:e2e`.
      **Result**: 827 unit tests passed in 67 files. Browser suite 400 passed in the
      parallel pass and 52 in the timed pass, with no failure. Task 1.7's test is in and
      green.

## 4. The host sets the start camera

- [x] 4.1 Add the `StartView` type and the `startView` option to `src/app/create-map.ts`.
      Apply a readable one before the first frame. Ignore an unreadable one in whole.
- [x] 4.2 Hold a pending system identity. Apply it in the first frame the set holds it.
      Drop it on `setView`, `flyTo`, `setSelection`, the first user input through the
      existing `onInput` hook, or 600 drawn frames.
      **Note**: `flyTo` arrives in item 7 and calls `dropPendingStart` there, which task
      7.1 states.
- [x] 4.3 Make `cursor` beat `system` where the host gives both.
- [x] 4.4 Confirm the demo page still overrides the start view from the URL fragment, and
      say so in a comment in `src/app/main.ts`, because a reader will expect the option to
      win.
- [x] 4.5 Browser tests: the nine `library-package` start-view scenarios.
      **Result**: `e2e/start-view.spec.ts`, nine tests, all green. Four of the scenarios put
      the record at the origin, where the default cursor already is, so they could not tell
      a pending start from a dropped one. The delta now puts the record at (1,000, 0, 0)
      and names the reason.
- [x] 4.6 Run `pnpm test` and `pnpm test:e2e`.
      **Result**: 827 unit tests passed. Browser suite 409 in the parallel pass and 52 in
      the timed pass, with no failure.

## 5. The draw-range cull and the HUD range measure from the cursor

- [x] 5.1 `src/render/shaders/systems.vert`: add `uniform vec3 uCursorOffset`, cull on
      `length(aOffset - uCursorOffset)` and keep `length(aOffset)` for the size. Update the
      comments so the two ranges are not confused.
- [x] 5.2 `src/render/system-pass.ts`: add a cursor offset field to `SystemPassFrame`,
      which carries `viewProjection`, `camera`, `pixelRatio` and `set` today, and set the
      uniform from it. `grid-pass.ts` works out the same offset, but it is a different pass,
      so this is a new field here.
- [x] 5.2a `src/render/renderer.ts`: pass the cursor offset into the system pass frame.
- [x] 5.2b `src/render/system-pass.ts`: `rebasePositions` counts the drawn markers on a CPU
      repeat of the shader cut, and that count is what `debug.systemMarkerCount()` reports.
      Pass the cursor offset in and compare against it. Its signature changes, so update
      every caller. Leave the `float32` read-back and the `limit <= 0` guard as they are.
- [x] 5.3 `src/scene-data/picking.ts`: gate the candidate test on the cursor range. The
      pick radius still reads the camera range, because it follows the disc diameter.
- [x] 5.3a `src/app/markers.ts`: in `rangeOf`, gate on the cursor range and keep returning
      the **camera** range, which `markerCssSize` and `offerNearest` both read. This gates
      the hover ring, the selection pin and the marker name labels together.
- [x] 5.3b `src/hud/geometry.ts`: replace `rangeFromCamera` with `rangeFromCursor`, which is
      a hypot against `view.cursor`. Remove `cameraPosition`, which then has no caller.
- [x] 5.4 `src/hud/info-panel.ts`: call `rangeFromCursor` at both sites.
- [x] 5.4a Confirm the four gates agree: a marker the pass draws is counted, picked, ringed,
      pinned and named at every camera position.
      **Result**: the four readers of `DEFAULT_MAX_DRAW_RANGE_LY` and `maxDrawRange` are
      `systems.vert`, `rebasePositions` of `system-pass.ts`, `pickSystem` of `picking.ts`
      and `rangeOf` of `markers.ts`. All four now compare the squared cursor range against
      the squared limit. The two `system-selection` tests of task 5.6a read the agreement
      from the outside, with the camera 20,000 light years off a marker 1,500 light years
      from the cursor.
- [x] 5.5 Update the marker count tests that assumed a camera range.
- [x] 5.6 Browser tests: an orbit does not change the marker count; a zoom does not change
      it; the default view draws all 1,000; two categories still cut at their own ranges.
- [x] 5.6a Browser tests for the two `system-selection` scenarios: a drawn marker is
      pickable and counted with the camera zoomed out to 20,000 light years, and the pin,
      the hover ring and the name label are all present in the same view. The ring needs a
      pointer move onto the marker, because it follows the hover and not the selection.
- [x] 5.7 HUD tests: a landed selection reads `0 LY`; an orbit and a zoom both leave a
      400 light year reading unchanged.
- [x] 5.8 Measure the default view with 10,000 systems at 1920x1080 again and compare with
      task 0.2. Report the two numbers. If the budget `real-systems` states is broken, stop
      and say so rather than lowering the bound.
      **Result**: task 0.2 read **1.767 ms** with 8,322 markers drawn. The same view now
      reads **0.97 ms** with **10,000** drawn (0.978, 0.990 and 0.952 over three runs).
      The pair is not a like-for-like comparison, because the two readings were taken in
      different page states. The cost of the markers the old rule cut was therefore
      measured in one run at one view, by cutting the same set with `maxDrawRange`:
      3,748 markers read 0.775 ms, 5,472 read 0.771, 6,893 read 0.783 and 10,000 read
      0.856. The 1,678 markers the old rule dropped cost about **0.08 ms**. The budget of
      16.7 ms holds with room, and `e2e/frame-budget.spec.ts` now carries the reading as a
      test.
- [x] 5.9 Review the Playwright baseline image. The default view now draws the outer disk
      markers it used to cut, so the baseline may legitimately move. Look at the difference
      before accepting it, and say in the commit what changed and why.
      **Result**: the baseline does not move and was not touched. `openMap` clears the
      system set, so the frame the baseline holds carries no marker at all and the cull
      cannot reach it. `e2e/look.spec.ts` passes unchanged, the baseline image included.
- [x] 5.10 Run `pnpm test` and `pnpm test:e2e`.
      **Result**: 832 unit tests passed in 68 files. Browser suite 417 in the parallel pass
      and 53 in the timed pass, with no failure. An earlier run of the parallel pass
      reported 33 failures across unrelated specs, with black frames and 30 second
      timeouts; every one of them passed on a run of its own and on this full run, so they
      were contention on the machine and not the change.

## 6. Every coordinate label of a level takes one size

- [x] 6.1 `src/app/grid-labels.ts`: add `worstCaseLabelText(bounds)`, which takes the longer
      written endpoint of each of `x`, `y` and `z` and composes them with
      `crossingLabelText`. A sphere bound has no axis endpoint, so take its axis-aligned
      box, which is the centre plus and minus the radius.
      **Result**: the model bounds give `-49,985 : -40,985 : -24,105`, 27 characters, which
      is the text the spec states.
- [x] 6.2 Change `gridLabelCapHeightLy` to take the worst-case measurement rather than the
      label's own. Keep each label's own `widthPerEm` for its own box.
      **Note**: `GridLabelFrame` gained a `browse: ResolvedBounds` field, which
      `src/app/create-map.ts` fills from the resolved browsable bounds.
- [x] 6.3 Cache the worst-case measurement against the bounds and the font, in the
      measurement cache the overlay already holds. Recompute it when the bounds change.
      **Note**: two caches. `createGridLabelMeasure` already holds each text it reads
      against the one font it measures with. A `WeakMap` holds the worst-case string
      against the bounds object, which `resolveBounds` replaces when the space changes.
- [x] 6.4 Update the constant comments at lines 84 and 224, which state 20 characters and 14
      cap heights, to the 27 characters and about 23 cap heights the worst case gives.
      **Note**: the gap comment moved with them. The gap of 0.04 of a spacing was about one
      cap height and is now about one and a half.
- [x] 6.5 Unit test: the cap height rule for the 1,000 light year level with the model
      bounds is 0.026 of the spacing within 5 per cent, and is below the one tenth bound.
      **Result**: 0.0259 of the spacing with the monospace measure the unit tests take.
      Four more unit tests came with it: the one cap height of a frame, the narrower bound,
      the longer endpoint of each axis, and the width bound at the worst case. The one cap
      height test fails when the sweep reads each label's own measurement, which is the
      check that it discriminates.
- [x] 6.6 Browser tests: every label of a frame has one cap height within 1 per cent, with
      the shortest and the longest text both present; a sphere bound of radius 900 gives a
      larger reading; moving the cursor's `y` to -40,000 does not change the reading; the
      width scenario at the far cursor.
      **Result**: the three labels of the frame at (995, -600, 1,005) all read 17.279 CSS
      pixels of cap height at three text lengths. The sphere of radius 900 reads 37.406
      against the model's 25.888, a ratio of 1.445 against the 27 to 18 of the character
      counts. The cursor at `y` = -40,000 reads 25.888, the same. The width scenario now
      runs at (40,000, -40,000, 70,000), where the widest label takes 0.576 of a spacing.
      **Note**: the scenario "A label lies on the plane" needed its figure changed. It reads
      the perspective across the quad of the label at the origin, which is now about a third
      of the height it took from its own text, so the far edge is 3.0 per cent shorter than
      the near one and no longer 5. The delta spec and the test both state 2 per cent and
      why.
- [x] 6.7 Look at the grid in the running app near the origin and at (40,000, -40,000,
      70,000). Near the origin the labels are smaller than they were; confirm they are still
      readable, because that is the trade the owner accepted.
      **Result**: four frames at 1,920 by 1,080, at zooms of 1,000 and 300 light years and a
      pitch of 35 degrees. The two cursors give the same cap heights, 14.8 CSS pixels at the
      cursor's own row and 4.5 one spacing beyond it, which is the point of the change: the
      grid reads at one scale wherever the user stands. `0 : 0 : 0` is clearly readable at
      14.8 CSS pixels. The row one spacing beyond the cursor is small at a pitch of 35
      degrees, and that is perspective and not the size rule.
- [x] 6.8 Run `pnpm test` and `pnpm test:e2e`.

## 7. The host surface: flyTo, the interaction switches and the view codec

- [x] 7.1 Add `flyTo`, `isFlying` and `onFlightEnd` to the handle. `flyTo` returns a promise
      that settles with `'landed'` or `'interrupted'` and never rejects. It does not touch
      the selection and it works with every interaction switch off. It calls
      `dropPendingStart` and it takes the bounds clamp, which tasks 4.2 and 3.4a state.
      **Result**: `flyTo` reads the target over a copy of the view, clamps it with
      `normaliseView(next, resolvedBounds)`, drops the pending start and ends any running
      flight before it plans. A field that is not a finite number keeps the value the view
      holds, as a field the host leaves out does.
- [x] 7.2 Settle a pending `flyTo` promise as `'interrupted'` on a second `flyTo`, on a
      selection, on the user's input and on `setView`. Settle it as `'landed'` on the
      landing. Make sure `dispose` settles any pending promise rather than leaving it.
      **Note**: one place settles them. `finishFlight(how)` ends the flight, settles the
      promise and raises the listeners, and it does nothing where no flight runs, so a
      listener hears one call for each flight and none for anything else. `endFlight` is
      `finishFlight('interrupted')`, which the user's input, `setView`, a selection, a
      second `flyTo` and `dispose` all call.
- [x] 7.3 Add the `InteractionSwitches` type, the `interaction` option, `getInteraction` and
      `setInteraction`. Gate each handler in `src/camera/controls.ts` on its switch. Keep
      `preventDefault` on the wheel and the context menu whatever the switch says.
      **Note**: the controls read `options.interaction?.()` once for each input, as they
      already read the bounds. The wheel holds off the page scroll before it reads the
      switch, and the context menu is refused whatever the switches say.
- [x] 7.4 Confirm a drag in progress stops moving the view when its switch goes off.
      **Result**: the browser test presses, moves 20 pixels, which turns the yaw 6
      degrees, turns `orbit` off, moves 20 more and releases. The yaw reads 6 degrees at
      both readings, so the second 20 pixels moved nothing.
- [x] 7.5 Rename `src/app/url-view.ts`'s three functions to `encodeView`, `decodeView` and
      `decodeGrid`, export them from the entry point, and make `src/app/main.ts` import them
      from there. Keep them pure: they apply the model limits and never a map's browsable
      bounds.
      **Note**: the three names are `encodeView`, `decodeView` and `decodeGrid`
      everywhere, and the demo page imports them from `src/app/url-view.ts`.
- [x] 7.6 Export the six camera types from the entry point. Update the type declaration
      test so it uses each of them in a type position.
      **Result**: the barrel now exports four values and 32 types, the six camera types
      among them. Both surface tests
      read the new list: `src/index.test.ts` reads the source and
      `tests/main-bundle.test.ts` reads the built declaration and the built module.
- [x] 7.7 Raise `package.json` to 0.2.0.
- [x] 7.8 Unit tests: the view round trips within 1e-5; a pitch of -89 round trips; an old
      fragment decodes unchanged; `decodeGrid` returns true, false and null.
      **Result**: six unit tests for the codec and three for `readInteraction`. The
      flight module gained four: the even turn rate, the short way round the yaw, the
      duration of a turn-only flight, and the 0 duration of the same view.
- [x] 7.9 Browser tests: the nine `flyTo` scenarios and the seven interaction scenarios.
      **Result**: `e2e/fly-to.spec.ts` holds 13 tests: one for each of the eleven scenarios
      of the requirement, and two more, the clamped target and the selection that
      interrupts. `e2e/navigation.spec.ts` gained nine, which are the seven interaction
      scenarios, the keys scenario this change adds and the default reading.
- [x] 7.10 Check the entry chunk is still under 254,000 bytes.
      **Result**: 236,815 bytes after the gate fixes, against the bound of 254,000.
- [x] 7.11 Run `pnpm test` and `pnpm test:e2e`.

## 8. Close out

- [x] 8.1 Run the full `pnpm test` and `pnpm test:e2e` on the finished branch and record the
      results as they actually are.
      **Result**, before the gate: `pnpm lint` clean, `pnpm build` clean, `pnpm test` 847
      tests in 68 files all passed, `pnpm test:e2e` 441 in the parallel pass and 52 of 53
      in the timed pass. The one failure was `e2e/paint-cost.spec.ts` "the blurred panel
      backdrop fails the budget" in Firefox, where the rise from the CSS backdrop blur read
      1.8999 ms against a 2 ms floor. That test adds a blur rule to the HUD panel and
      measures the frame cost; it reads no code this change touches, and it passed on a
      re-run and on a re-run of the whole timed pass. The reading sits on the floor, so the
      test is borderline on this machine.
      **Result**, after the three gate fixes: `pnpm lint` clean, `pnpm build` clean with the
      entry chunk at 236,815 bytes against the 254,000 bound, `pnpm test` 849 tests in 68
      files all passed, `pnpm test:e2e` 442 in the parallel pass and 53 in the timed pass,
      with no failure.
- [x] 8.2 Update [README.md](../../../README.md) with the new options, the handle members
      and the pitch range, and the control scheme section where it states the pitch limits.
      **Result**: a new section, "The camera a host drives", covers `bounds`, `startView`,
      `interaction`, `flyTo`, `isFlying`, `onFlightEnd`, the flight path and the three
      fragment calls. The entry point paragraph names `encodeView`, `decodeView` and
      `decodeGrid`. The handle paragraph names the seven new camera members. The controls
      table reads "Pitch stops at -89 and 89 degrees", and the wheel row reads the far
      limit of the bound in place of the fixed 120,000. `maxDrawRange` now reads from the
      cursor, and the HUD paragraph says `RANGE` reads 0 after a flight lands.
- [x] 8.3 Update [docs/roadmap.md](../../../docs/roadmap.md) with the decisions this change
      makes that span phases: the flight path and its constants, the bounds modes and the
      cursor-range rule.
      **Result**: a new section, "Phase 5.8: the free camera and the host controls", holds
      six decisions: the Van Wijk and Nuij path with rho 1.42, a speed of 1.6 and the 400
      to 2,000 ms band; the turn as a path length of its own; the pitch from -89 to 89
      through 0; the three bounds modes with the zoom clamp; the host camera API; and the
      one grid label size. "Facts that hold for every phase" gained the cursor-range rule,
      because it governs every later change that draws or culls by range.
- [x] 8.4 Check every task above is ticked, and name any that is not and why.
      **Result**: 76 of the 77 tasks are ticked. 8.5 is the gate and runs next. No task was
      dropped, narrowed or deferred. Two pieces of added scope are recorded in the spec
      deltas: the "A label lies on the plane" margin moved from 5 to 2 per cent, because a
      label is now about a third of its old height and its quad spans more of the depth;
      and the flight gained a turn term, because `flyTo` gives a target yaw and a pitch and
      the path held the start values.
- [x] 8.5 **Gate.** Launch the `openspec-implementation-reviewer` subagent with this change
      id and wait for its verdict. On BLOCK, fix and re-run it. Report the verdict and the
      findings, including any not acted on and why.
      **Run 1**: BLOCK, on three defects. (a) `farthestPlaneRange` read the frame's two top
      corners, and the far row is the bottom row under the plane, so the region label sweep
      was gated off in a band of views below the plane. It reads all four corners now, and a
      unit test sweeps three distances by four pitches against their negatives. (b)
      `reclampView` ended the wheel glide only where the clamp moved the view, so a glide
      could carry the camera past a far limit that narrowed under it. It now also ends a
      glide whose held target lies outside the new space, and a browser test covers it. (c)
      `flyTo` on a system the set does not hold returned before `dropPendingStart` and
      `endFlight`. Both run at the top of the call now; the delta states the rule and carries
      a scenario, and a browser test covers it. Five smaller points were acted on:
      `FlightOutcome` is exported and named in the delta and both surface tests; the README
      no longer says the library reads the URL; the notes of 1.3, 4.5, 7.9 and 7.10 were
      corrected; `projection.test.ts` iterates the real pitch limits and gained the missing
      "camera under the plane" test.
      **Run 2**: BLOCK, on two artifact defects, both from fix (a). (d) The four-corner rule
      contradicted the live `galactic-regions` spec, which states the two-corner rule. The
      change now carries a `galactic-regions` delta with the four-corner rule, a scenario for
      the symmetry and the reason; the proposal names the capability and `src/app/labels.ts`;
      `design.md` no longer claims nothing else needs a change; and the dead citation in
      `labels.test.ts` now names the new scenario. (e) The `coordinate-grid` scenario "A
      coordinate label reads the same way round from either side" had the far and the near
      corner the wrong way round against the code and both tests. The direction moves to the
      requirement prose, where it reads far above the plane and near under it, and the
      scenario now states what the browser test can see.
      **Run 3**: APPROVE WITH NOTES. The two artifact defects of run 2 are fixed, and the
      reviewer re-derived every figure of the `galactic-regions` delta from the projection
      code and found them right. Five notes, all documentation, all acted on: the
      `library-package` delta now records the built chunk at 236,815 bytes, says why the
      254,000 bound stays where it is, and `tests/main-bundle.test.ts` carries the reading;
      the pitch-0 prose said the grid draws as a line, where it draws nothing, in both
      `coordinate-grid` and `map-navigation`, and the scenario now names the 0.5 degree
      reading that carries the no-dead-band rule; a dead citation in `grid-labels.test.ts`
      and a near-miss one in `controls.test.ts` now name the scenarios that exist; and the
      label's corner is named by its axes and not by its distance from the camera, which
      follows the yaw.
      One point was not acted on: `src/scene-data/real-systems.ts` keeps its type-only import
      of `SystemBox` from `src/camera/view`. It breaks no import rule, the ESLint block for
      `src/scene-data/**` names `src/render/` alone, and the import is erased at build. The
      reviewer accepted it and recorded the wart: the producer of the box is the data module,
      so the type would sit more naturally there.
