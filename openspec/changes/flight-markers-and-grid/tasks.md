## 1. The marker size curve

- [ ] 1.1 Measure the fill risk first: add a temporary browser test that puts 10,000 glow
      systems within 10 light years of Sol at a zoom of 10 at 1920x1080 with the marker
      sprite forced to 40 CSS pixels, and read `measureFrames` for 300 frames. Verify the
      mean is under 16.7 ms, and report it beside the renderer string, so a software
      fallback cannot pass as a reading. Where the mean is over the budget, take the close
      cap down from 16 until it holds, and change the stop table in
      `specs/real-systems/spec.md` and in `design.md` to the number that holds, before
      writing any more code
- [ ] 1.2 Rewrite `markerCssSize` in `src/scene-data/marker-size.ts` as the four-stop
      log-linear curve of the spec, with no `focalCss` argument, and export the stop
      table. Verify `src/scene-data/marker-size.test.ts` reads 16, 14.28, 12, 12, 10.49,
      8.99 and 7 at the ranges 10, 20, 50, 1,000, 2,000, 4,000 and 10,000
- [ ] 1.3 Add the unit test for the curve's shape: 1,000 ranges spaced evenly in the
      logarithm from 1 to 200,000. Verify no two neighbouring readings differ by more than
      0.05, the reading never rises, the largest is 16 and the smallest is 7
- [ ] 1.4 Send the stop table to the marker pass as `uSizeRanges` and `uSizeValues`, and
      walk it in `src/render/shaders/systems.vert` in place of
      `clamp(uScale / range, uLimits.x, uLimits.y)`. Verify `pnpm build` passes and the
      existing marker browser tests still draw a marker at every zoom distance
- [ ] 1.5 Update `src/scene-data/picking.ts` so the pick radius reads the range alone, and
      update its comment, which states the 7.5 to 10 range. Verify the unit tests read a
      radius of 7.5 at a range of 10,000 and 12 at a range of 10
- [ ] 1.6 Update `src/app/markers.ts` to call `markerCssSize` without `focalCss`. Verify
      `src/app/markers.test.ts` passes and the ring, the pin offset and the label offset
      all follow the new size
- [ ] 1.7 Update the browser tests that put a marker "at the cap": in `e2e/systems.spec.ts`
      and `e2e/selection.spec.ts` the camera goes onto the system at the closest zoom.
      Verify the scenarios "The size falls to the floor and rises to the cap", "The glow
      sprite is 2.5 times the disc", "A restyled category restyles its markers" and "The
      pick radius holds at the floor and the cap" read 7, 12 and 16
- [ ] 1.8 Add the browser test for the viewport rule: one system 4,000 light years from
      the camera, read the row width at 1,080 CSS rows and at 400. Verify the two counts
      agree within 1 and each is 9 within 1
- [ ] 1.9 Add the browser test for the pick radius and the viewport: the largest whole
      pixel offset that still picks is the same at 1,080 and at 400 CSS rows
- [ ] 1.10 Re-run the marker frame budget scenarios of `e2e/frame-budget.spec.ts` with the
      new cap, including the worst case of 10,000 systems within 10 light years of Sol.
      Verify every mean is under 16.7 ms and report the readings

## 2. The selection flight

- [ ] 2.1 Add `src/camera/flight.ts` with `FLIGHT_MS`, the ease `1 - (1 - u)^3` and
      `flightAt(from, to, elapsedMs)`, which interpolates the cursor linearly and the
      distance geometrically and leaves the yaw and the pitch. Verify
      `src/camera/flight.test.ts` reads the five points of the scenario "The flight holds
      its curve" and that the reading at 350 ms is the end view exactly
- [ ] 2.2 Hold the flight state in `src/app/create-map.ts`: the start view, the end view
      and the start time. Start it in `applySelection` where `centreOn` writes today, and
      advance it in the frame loop before the draw, raising the view change listeners each
      frame it moves. Verify a browser test reads a view between the start and the end one
      frame after `setSelection`
- [ ] 2.3 Read `prefers-reduced-motion` at each selection and write the end state in one
      frame where it is `reduce`. Verify a browser test with
      `test.use({ reducedMotion: 'reduce' })` reads the end view in the next frame and
      `selectionFlightMs` of 0
- [ ] 2.4 Add `endFlight()` and call it from the pointer, wheel and key handlers and from
      `setView`. Verify the browser scenarios "A wheel notch ends the flight" and "A drag
      ends the flight" read a view between the start and the end and the input applied to
      it
- [ ] 2.5 Add `debug.selectionFlightMs()` and its hook in `src/app/main.ts` and
      `e2e/global.d.ts`. Verify it reads above 0 during a flight and 0 before and after
- [ ] 2.6 Put `test.use({ reducedMotion: 'reduce' })` on the `describe` blocks of
      `e2e/selection.spec.ts` and `e2e/hud.spec.ts` that read the view right after a
      selection. `test.use` is scoped to a file or a `describe`, so the setting must not sit
      at file level in a file that will also hold the flight tests. Verify both files pass
      with no change to their readings
- [ ] 2.7 Add the flight tests in a `describe` of their own in `e2e/selection.spec.ts`, with
      no `test.use`: the far selection, the click at a far view, the second selection during
      a flight, the close view that keeps its distance, and the cleared selection that does
      not move. Verify each reads the spec's values
- [ ] 2.8 Add the frame rate reading: 10,000 systems, a flight from 20,000 light years at
      1920x1080, and `frameIntervalStats` over the flight. Verify the mean is 18 ms or less
      and report it beside the renderer string

## 3. The coordinate grid

- [ ] 3.1 Rewrite the level rule in `src/render/grid-pass.ts`: the six decade levels, the
      screen spacing `focalCss * s / range`, `t = smoothstep(40, 400, p)`, the width
      `1.0 + 1.6 * t`, the alpha `(0.18 + 0.27 * t) * smoothstep(8, 40, p)` and the
      distance fade `clamp(1 - r / (100 * s), 0, 1)`. Export each as a function. Verify
      `src/render/grid-pass.test.ts` reads the table of the spec and the fade scenario's
      six readings
- [ ] 3.2 Add the label level rule: the smallest of the six levels at least 400 CSS pixels
      apart at the cursor. Verify the unit test reads 100, 1,000 and 10,000 at the zoom
      distances 200, 1,000 and 3,000 at 1,080 CSS rows
- [ ] 3.3 Add the per-level camera phase: the camera's `x` and `z` modulo each level's
      spacing, worked out in `float64`. Verify a unit test at a camera of (45,000, 0,
      45,000) gives a phase in `[0, s)` for every level and that adding a small offset
      places a line within 0.001 light years of a whole multiple
- [ ] 3.4 Write the geometry half of the new shaders: `grid.vert` emits a full-screen
      triangle, and `grid.frag` un-projects the fragment to a camera-relative ray,
      intersects it with the plane at the cursor's height, discards a ray that misses the
      plane or lands outside the model bounds, and writes a flat colour over the rest.
      Verify the shaders compile through the program probe and that the frame shows a flat
      plane that ends at the model bounds and at the horizon
- [ ] 3.5 Add the level loop to `grid.frag`: for each of the six levels the distance to the
      nearest line from the phase uniform, the fragment's own screen spacing from the
      derivative of the plane coordinate, the width, the alpha, the distance fade, and the
      max over the levels. Verify the frame shows the three levels and that a browser
      reading of a bold line and a fine line matches the level rule the unit tests hold
- [ ] 3.6 Rewrite `createGridPass` to draw one call of 3 vertices with the new uniforms,
      keeping its place in `src/render/renderer.ts` after the tone map and before the
      region overlay and the markers. Verify a unit test on a recording context sees one
      `drawArrays` of 3
- [ ] 3.7 Replace `debug.gridPlanes()` with `debug.gridLevels()`, point `gridSpacingLy()`
      at the label level, and update `src/app/main.ts` and `e2e/global.d.ts`. Verify the
      probes read the values of the scenario "The probes agree with the frame" and are
      empty with the grid off
- [ ] 3.8 Add `src/app/grid-labels.ts`: the 289 candidate crossings, the projection, the
      viewport and near-plane drops, the 32 nearest the centre, the overlap skip that
      reuses `boxesOverlap`, and the plane label on the lower edge of the canvas, 22 CSS pixels up. Verify
      `src/app/grid-labels.test.ts` covers the candidate count, the cap of 32 and the
      overlap skip
- [ ] 3.9 Call the grid label overlay from the frame loop after the marker overlay, and
      clear it when the grid switch goes off. Verify the browser scenarios "A crossing
      label reads its own coordinates", "The plane label reads the cursor's height" and
      "The labels go with the switch"
- [ ] 3.10 Rewrite the geometry tests of `e2e/grid.spec.ts`: the constant game coordinate,
      the vertex count of 3 at three zooms, the line at a cursor of (45,000, 0, 45,000) at
      the closest zoom, the plane that follows the cursor, and the model bounds. Verify each
      passes
- [ ] 3.11 Rewrite the look tests of `e2e/grid.spec.ts`: the coarse line bolder and
      brighter than the fine one, the crossing no brighter than its lines, the bold level
      over the galactic core, the antialiasing across a line, and the overlays over the
      grid. Verify each passes
- [ ] 3.12 Rewrite the switch and probe tests of `e2e/grid.spec.ts`: the grid off by
      default, the switch reaching the next frame, and the probes empty with the grid off.
      Verify each passes
- [ ] 3.13 Look at the frame at a pitch of 5 degrees and confirm the grid fades into the
      distance rather than ending at a line, which is the risk `design.md` names. Report
      what the frame shows
- [ ] 3.14 Read the grid frame budget with `measureFrames` at a pitch of 5 and of 89
      degrees at 1920x1080, with the grid off and on. Verify each pair differs by 1 ms or
      less, read `frameIntervalStats` with the labels on to verify a mean of 18 ms or less,
      and report both beside the renderer string
- [ ] 3.15 Verify the committed baseline image still matches, because the grid is off
      unless the options ask for it

## 4. The demo data set

- [ ] 4.1 Add `data/` to `.gitignore` and add `scripts/build-demo-systems.mjs`, which
      fetches `guardian_ruins.json` into `data/` when it is absent and writes
      `src/app/demo-systems.json`. Verify `pnpm build:demo` writes a file that the reader
      accepts
- [ ] 4.2 Write the conversion as an exported function of
      `scripts/build-demo-systems.mjs` that takes the parsed dump and returns the record
      set, with the fetch and the file write in a separate entry part that runs only when
      the script is the entry module, so a test can import the conversion with no network.
      The conversion: group the sites by system name, drop a record with no name
      or no finite coordinates, take the distinct site types in the dump's order as the
      primary and the secondary categories, give one thumbnail URL per type with the type
      as its caption, and write a description that names the site count and the bodies.
      Verify the output holds one category for each site type in the dump, and one
      record for each system name the dump gives coordinates for. Where the count is
      not the 3 categories and the 212 systems the spec states, write the new counts
      into `specs/real-systems/spec.md` and `proposal.md`, because the dump grows
- [ ] 4.3 Commit the generated `src/app/demo-systems.json` and add
      `src/app/demo-systems.test.ts`. Verify the tests read the category names, the record
      count, the images that match the categories one for one and in order, the records that
      name more than one category, the names with no repeat, and a reader report that
      rejects none
- [ ] 4.4 Commit a fixture extract of about 20 sites over 8 systems in `tests/fixtures/`
      beside the expected output of the conversion over it, and add the unit test that
      imports the conversion of task 4.2 and runs it over the extract. Verify the test passes on a clean checkout with no
      network
- [ ] 4.5 Change `e2e/hud.spec.ts` "a demo picture loads from the built page" so it stops
      reading `src/app/demo-systems.json` and names a record of its own whose picture the
      build serves from `public/`. Keep one project-owned picture there for it. Verify the
      test passes and a search of `e2e/` finds no `ruins.canonn.tech` and no read of the
      demo set
- [ ] 4.6 Update `README.md`, `THIRD_PARTY_NOTICES.md` and the comment at
      `src/app/main.ts:28`, which names 15 categories and 381 systems, to state the new set
      and the thumbnail URLs. Verify the notice still holds the Canonn MIT text and the
      Frontier media-usage paragraph
- [ ] 4.7 Open the dev page and confirm the information panel shows the thumbnails from
      `ruins.canonn.tech` and the lightbox opens one. Report what it shows, and report the
      panel a second time with the network off, which must show the caption and no broken
      image icon

## 5. Close out

- [ ] 5.1 Add this phase to `docs/roadmap.md`: the flight, the size curve, the grid levels,
      the grid labels and the demo set, with the measured numbers of tasks 1.10, 2.8 and
      3.14. Verify the document names the readings and not the targets
- [ ] 5.2 Run `pnpm lint`, `pnpm build`, `pnpm test` and `pnpm test:e2e`. Verify all four
      pass, and report any failure with its output rather than working around it
- [ ] 5.3 Run the implementation review gate: launch the `openspec-implementation-reviewer`
      subagent with this change id, wait for its verdict, fix what it blocks on, and re-run
      the gate. Verify the verdict is APPROVE or APPROVE WITH NOTES before anything is
      shown to a human
