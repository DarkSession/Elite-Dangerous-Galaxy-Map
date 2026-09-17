## 1. The region band follows its range

- [x] 1.1 In `src/render/shaders/regions.vert`, replace `uniform float uHalfWidth` with
      `uniform float uBaseHalfWidth`, compute a half width per endpoint from that endpoint's
      camera range as `clamp(uBaseHalfWidth * 12000.0 / range, uFloorHalfWidth,
      uBaseHalfWidth)`, where both uniforms are in **device** pixels and `uFloorHalfWidth` is
      `2 * pixelRatio`, expand
      each end of the quad sideways and along by its own half width, and pass both as
      `flat out` varyings. Verify `pnpm build` compiles the shader and the page draws a band
      that narrows with range.
- [x] 1.2 In `src/render/shaders/regions.frag`, read the two varyings and divide the gap by
      `mix(vHalfStart, vHalfEnd, part)`. Verify the browser suite's region screenshot draws a
      continuous band with no step between neighbouring segments.
- [x] 1.3 In `src/render/region-pass.ts`, pass the base half width and the floor in device
      pixels, both scaled by `frame.pixelRatio`, in place of the frame half width. Verify a unit test of `regionBandHalfWidthCss` still reads 8,
      17.28 and 24 at 300, 1,080 and 2,000 CSS rows.
- [x] 1.4 Replace `REGION_EDGE_CSS` and `REGION_CORE_EDGE_CSS` with the constant shares 0.25
      and 0.087, drop `regionBandShares`, and set the two composite uniforms from the
      constants. Verify a unit test reads the two uniforms as 0.25 and 0.087 at every
      viewport height.
- [x] 1.5 Set `REGION_RANGE_NONE` to 8,000 and `REGION_RANGE_FULL` to 12,000. Verify the unit
      test of the two constants reads the new figures.
- [x] 1.6 Make the width rule's reference range read `REGION_RANGE_FULL` and not a second
      literal: the pass writes it into the shader through a uniform, or a unit test asserts
      that the `regions.vert` source holds no bare `12000`. Verify that test.
- [x] 1.7 Check that `src/app/labels.ts` still reads `REGION_RANGE_NONE` and
      `REGION_RANGE_FULL` from the region pass and writes neither figure by hand, so task 1.5
      moves the label fade with the band fade. Verify the label fade unit test reads 0 at
      8,000, 0.5 at 10,000 and 1 at 12,000.
- [x] 1.8 Add a unit test that reads the drawn band width at 1,080 CSS rows at ranges of
      8,000, 12,000, 20,000, 30,000, 40,000 and 60,000 light years, and asserts 34.6, 34.6,
      20.7, 13.8, 10.4 and 6.9 CSS pixels within **0.05**. The tolerance is tight enough
      that a wrong figure in the spec fails the test.
- [x] 1.9 Update the scenario readings of `galactic-regions` that the spec marks measurable —
      the band-share readings, the two-tone gaps, the corner radius, the two sweep errors, the
      2.4 CSS pixel floor shortfall and the dropout ray that read 15.9 —
      against the built pass, and write each reading into the spec where it differs from the
      planned figure.

## 2. The worker builds one boundary set

- [x] 2.1 In `src/scene-data/messages.ts`, make `RegionLinesResponse` carry one boundary set
      and drop the second field, and make `regionLinesTransferables` run once. Verify
      `tsc --noEmit` is clean.
- [x] 2.2 In `src/scene-data/region-lines.ts`, stop building the smoothed set, and delete the
      20-degree chain smoother and its unit tests. Verify no file imports the deleted helper
      and `pnpm lint` is clean.
- [x] 2.3 In `src/scene-data/region-lines.worker.ts`, post one set. Verify the worker unit
      test reads one boundary set in the message and no second one.
- [x] 2.4 In `src/render/region-pass.ts`, upload one set and drop the `traced` frame field and
      `setRegionDraw`'s second argument. Verify the renderer unit test reads one upload.
- [x] 2.5 Add the unit test the spec names: search the built worker chunk for the smoothed
      set's packing entry point and assert the chunk holds no call of it.
- [x] 2.6 Rewrite the four searches in `tests/region-views.ts` against premise three: every
      clearance reads the band's half width **at the reading range**, not `base`. Verify each
      search still returns a view and the derived windows read the half width the premise
      names.
- [x] 2.7 Point the join search and the width search at the traced set, drop the
      `findPointNearBothSets` search and put the one-chain search in its place, reading the
      six zooms 7,000, 10,000, 12,000, 20,000, 25,000 and 31,000 light years. Verify the
      one-chain window of 8 CSS pixels holds one chain and no other at all six.
- [x] 2.8 Write the search for the "No label where no line draws" view, which has no search
      function today, against the 8,000 light year floor. Verify it returns a view whose
      centre draws no line.
- [x] 2.9 Re-record every constant of `e2e/region-views.ts`: drop `SMOOTHED_CROSSING`, keep
      one `TRACED_CROSSING`, re-search `SHARP_CORNER` and `TRACED_CORNER`, replace
      `NEAR_BOTH_SETS` with the one-chain view, and add the no-line view. Verify the browser
      tests that open each recorded view pass.
- [x] 2.10 Measure and write in the four region-view search counts the spec marks "to be
      measured", and make `tests/region-views.test.ts` assert each of the four.

## 3. The region overlay becomes one switch

- [x] 3.1 In `src/app/create-map.ts`, replace `RegionMode`, `DEFAULT_REGION_MODE`,
      `getRegionMode` and `setRegionMode` with a `regions` boolean, `areRegionsVisible()` and
      `setRegionsVisible(on)`, and read `GalaxyMapOptions.regions` with a default of true.
      Verify the unit test reads `true`, `false`, `true`, `true` and `true` for the five
      option values the spec names.
- [x] 3.2 Update the handle table and the options list of `real-systems` → "The map is
      created through a library entry point that returns a handle" in the implementation:
      `areRegionsVisible` and `setRegionsVisible` in place of the two mode members, and the
      `regions` option in place of `regionMode`. Verify the browser test "The overlay switches
      are on the handle and not on debug".
- [x] 3.3 In `src/index.ts`, drop the `RegionMode` export. Verify the declaration test fails
      to compile a file that imports `RegionMode`.
- [x] 3.4 In `src/hud/options-panel.ts` and `src/hud/styles.ts`, replace the three-button
      segmented control with a **Galactic regions** switch that calls `setRegionsVisible`.
      Verify the HUD unit test reads four switches and no segmented control.
- [x] 3.5 Update the browser tests that set a region mode to use the switch. Verify
      `pnpm test:e2e` passes the region and HUD specs.
- [x] 3.6 Rebuild every region browser baseline, and read each new image against the owner's
      reference before committing it. Verify `pnpm test:e2e` passes with the new baselines.

## 4. A marker takes the colour of the first category that is on

- [x] 4.1 In `src/scene-data/real-systems.ts`, change `anyCategoryOn` to return the index of
      the first category the record names that is on, or -1, walking the primary category
      first and then the secondary ones in the record's order. Verify a unit test reads the
      index for a system whose primary category is off and whose second secondary category is
      on.
- [x] 4.2 Make `refreshFlags` write both `markerFlags` and `categoryIndices` from that one
      walk, and add a `refreshFlags()` call to the `categoryIndices` getter. Verify the sweep
      unit test reads no sweep above 2 milliseconds for 10,000 systems over 8 categories with
      4 each.
- [x] 4.3 Add the browser tests the spec names: the colour follows the first category that is
      on, the colour goes back when the category comes back on, the order is the record's
      order, and the style and the draw range follow the drawn category.
- [x] 4.4 Rewrite the browser test "The colour still follows the primary category" to read the
      case with every category on. Verify it passes.

## 5. `Q` and `E` turn the camera

- [x] 5.1 In `src/camera/controls.ts`, add `Q` and `E` to `MOVEMENT_KEYS` and add the yaw step
      to `moveByKeys`: 60 degrees per second, `E` positive, `Q` negative, wrapped into 0–360,
      and no turn while both are held. Verify a unit test reads a yaw change of 60 degrees
      for one second of `E` and 0 for one second of both.
- [x] 5.2 Add the browser tests the spec names: a turn changes no pitch, no distance and no
      cursor; the form-field guard holds; a release outside the page stops the turn; and a
      turn key ends a running selection flight.
- [x] 5.3 Add the "A turn key works with a button focused" HUD keyboard test. Verify it
      passes.
- [x] 5.4 Update `README.md`'s control scheme with the two keys.

## 6. The selection flight runs 600 ms

- [x] 6.1 In `src/camera/flight.ts`, set `FLIGHT_MS` to 600. Verify the curve unit test reads
      the start at 0 ms, the end exactly at 600 ms, and the cursor at 0, 0.578, 0.875, 0.984
      and 1 of the way at 0, 150, 300, 450 and 600 ms.
- [x] 6.2 Update every browser test that waits 350 or 500 ms for a flight to wait 800 ms.
      Verify `pnpm test:e2e` passes the selection spec.

## 7. The shape set

- [x] 7.1 Add `src/scene-data/shapes.ts` with the shape set: `addSpheres`, `addLines`,
      `clearShapes`, `sphereCount`, `lineCount`, `getSphere` and `getLine`, with the caps and
      the defaults the spec names. Verify a unit test reads the defaults 0.18 opacity, 2 CSS
      pixel width and `closed` false, and that `dispose()` releases the shape set.
- [x] 7.2 Implement the reject reasons the spec names, and the capacity and point-capacity
      rules. Verify a unit test reads each of the ten reasons from a set of bad inputs.
- [x] 7.3 Implement line point resolution: a `[x,y,z]` coordinate, or a `{ system }` identity
      matched by id64 string or by name without case, resolved against the current system set
      at add time, with an unresolvable reference rejecting the whole line. Verify a unit test
      reads `unknown-system` for a line with one bad point and a resolved position for a good
      one.
- [x] 7.4 Add the shape types to `src/index.ts`: `SphereInput`, `LineInput`, `LinePoint`,
      `Sphere`, `Line`, `ShapeReport` and `ShapeReject`. Verify the declaration test compiles
      a file that uses each of the seven in a type position.
- [x] 7.5 Add the read budget test: 1,024 spheres and 4,096 lines of 65,536 coordinate points
      read in under 40 milliseconds.

## 8. The shape pass

- [x] 8.1 Add `src/render/shaders/spheres.vert` and `spheres.frag`: one instanced
      screen-aligned quad per sphere, sized by the projected radius, with
      `alpha = min(1, opacity / sqrt(1 - r^2))` and nothing at or beyond `r = 1`. Expose the
      alpha rule as a function the unit tests read, and verify the unit test that asserts
      0.18, 0.2078, 0.4129 and 1 at `r` of 0, 0.5, 0.9 and 0.9838, and the browser test that
      reads the edge of a sphere brighter than its middle.
- [x] 8.2 Implement the three sphere culls: a projected radius under 1 CSS pixel, a centre at
      or behind the near plane, and a camera range at or inside the radius. Verify the three
      browser tests the spec names.
- [x] 8.3 Add `src/render/shaders/shape-lines.vert` and `shape-lines.frag`: one quad per
      segment into an RGBA8 frame-size buffer with premultiplied colour and the `MAX` blend
      equation, a fixed CSS-pixel width, antialiasing over the outer 1 device pixel, and the
      per-segment near-plane clip. Verify the browser tests "A corner carries no bright dot",
      "A line draws between two systems", "A width is a width in CSS pixels", "The width does
      not follow the range" and "A line behind the camera draws nothing".
- [x] 8.4 Draw one more segment, from the last point to the first, where `closed` is true.
      Verify the browser test "A closed line joins its ends".
- [x] 8.5 Add the full-screen pass that writes the line buffer over the frame with a
      `SRC_ALPHA` blend, and allocate the buffer only when the map holds a line and the
      shapes are on. Verify a unit test reads no buffer allocated for a map with no line.
- [x] 8.6 Add `src/render/shape-pass.ts`, put it in the overlay order region boundaries →
      spheres → lines → markers and labels, and add the renderer `shapes` switch. Verify the
      browser tests "The four overlays draw in their order", "A marker draws over a shape" and
      "A sphere draws no label".
- [x] 8.7 Add the draw-call test: 1 sphere and 1 line, and a full set, both reading 3.
- [x] 8.8 Add the frame-budget browser test: 10,000 systems, 1,024 spheres, 4,096 lines of
      65,536 points at 1920x1080, mean animation frame interval 18 milliseconds or less.

## 9. The shapes on the handle and in the HUD

- [x] 9.1 In `src/app/create-map.ts`, add `addSpheres`, `addLines`, `clearShapes`,
      `sphereCount`, `lineCount`, `getSphere`, `getLine`, `setShapesVisible` and
      `areShapesVisible`, read `GalaxyMapOptions.shapes` with a default of true, and clear the
      shapes from `clearSystems` and `clearSystemsAndCategories`. Verify the unit tests the
      spec names, and the browser test "The handle carries the shape members".
- [x] 9.2 Confirm no shape is picked: `systemAt` reads none, none hovers and none is selected.
      Verify the browser test that clicks the middle of a sphere and reads no selection.
- [x] 9.3 In `src/hud/options-panel.ts`, add the **Shapes** switch with `aria-pressed`, and
      make it draw with no shape on the map. Verify the HUD unit test and the keyboard test.
- [x] 9.4 Add the browser tests "The switch removes both parts", "The option starts the map
      with the shapes on", "A shape is not a category" and "A later change to the set does not
      move the line".

## 10. The demo data

- [x] 10.1 In `scripts/build-demo-systems.mjs`, add the UIA conversion: read the four sphere
      lists of `MapData-UIA.js`, give each list a colour, and write `demo-data/uia.json`.
      Verify a fixture test of about 20 records, with its expected counts in the file beside
      it, reads the four lists and the four colours. **Task 14.7 replaces the colours this
      task first wrote with the colours of the source's own materials.**
- [x] 10.2 Add the Adamastor conversion: read the `routes` of `MapData-Adamastor.js`, resolve
      each point against that file's own `systems` list and then against the EDSM name lookup
      without case, drop an unresolvable point, drop a route left with fewer than two points,
      and write `demo-data/adamastor.json`. Verify a fixture test of about 20 records, with
      its expected counts in the file beside it, reads the resolution order and reports every
      drop by name.
- [x] 10.3 Write a point whose system is in the entry's own record set as a system reference
      and every other point as a coordinate. Verify a fixture test reads both forms in the
      output.
- [x] 10.4 Take the line colour from the source category table, with a fallback of
      (160,160,160) for the Adamastor route naming category `50`. Verify a fixture test reads
      the fallback for that route.
- [x] 10.5 Run both converters and commit `demo-data/uia.json` and `demo-data/adamastor.json`.
      Verify `pnpm build` copies both into the demo output.
- [x] 10.6 Add a test that reads the two committed files and asserts the counts of the
      catalog table: 8 systems, 4 categories, 8 lines and 38 points for `adamastor`, and the
      counts of the `uia` file. **Task 14.8 replaces the `uia` counts this task first wrote
      with 1,116 systems, 18 categories, 54 spheres and 983 lines.**

## 11. The demo site

- [x] 11.1 Check that `writeDataset` in `src/app/create-map.ts` clears the shapes, which it
      gets from task 9.1's `clearSystemsAndCategories`, and that a failed load reaches neither
      `writeDataset` nor the listeners. Verify the unit tests "A load clears the shapes" and
      "A failed load leaves the shapes".
- [x] 11.2 In `src/app/main.ts`, add the `uia` and `adamastor` catalog entries, hold a
      module-level map from entry id to shapes that each entry's `load()` fills before it
      returns, and add the shapes from the `onDatasetChange` listener by reading that map
      synchronously.
- [x] 11.3 Add the browser test that reads `systemCount`, `categoryCount()`, `sphereCount()`
      and `lineCount()` after each of the five entries loads, against the table the spec holds:
      1,116, 18, 54 and 983 for `uia`, and 8, 4, 0 and 8 for `adamastor`.
- [x] 11.4 Add the browser test "A second load leaves only its own shapes": start a load of
      `uia`, start a load of `adamastor` before the first settles, and read 0 spheres and 8
      lines.
- [x] 11.5 Add the browser test "The Adamastor lines connect the markers": a line end sits on
      a marker within 2 CSS pixels.
- [x] 11.6 Add the unit test "A listener can add a line naming a loaded system", which reads
      that the listener runs after the set is written.
- [x] 11.7 Add the browser tests "The catalog holds the five sets" and "A switch away from a
      shape set clears the shapes".

## 12. The package and the records

- [x] 12.1 Run the library build, read the entry chunk size, write it into the
      `library-package` spec, and set the bound about 30 kB above it. Verify the bundle test
      passes against the written bound.
- [x] 12.2 Update `THIRD_PARTY_NOTICES.md` with the UIA and Adamastor data of the Canonn
      Research Group and the EDSM name lookup. Verify `tests/third-party-notices.test.ts`
      passes against the extended list in the `galactic-regions` attribution scenario.
- [x] 12.3 Update `docs/roadmap.md` with the phase, the facts and the decisions of this
      change.
- [x] 12.4 Update `README.md` where it names the region modes.

## 13. The whole suite

- [x] 13.1 Run `pnpm lint`, `pnpm build` (which runs `tsc --noEmit` first) and `pnpm test`.
      Verify all three are clean.
- [x] 13.2 Run `pnpm test:e2e` once, on hardware rendering, and read `WEBGL_debug_renderer_info` to
      confirm no software fallback. Verify the whole browser suite passes.

## 14. The whole UIA map, and the line cap

The demo set held the 16 systems of `MapData-UIA.js` and no line, because the live map
builds every waypoint, every route and every hyperdiction at run time from two more files.
This group reads those files as well.

- [x] 14.1 Raise `MAX_LINES` from 1,024 to 4,096 in `src/scene-data/shapes.ts`, with the
      reason in the comment. Carry the new figure through `e2e/frame-budget.spec.ts` (a full
      set is now 4,096 lines of 16 points), `e2e/shapes.spec.ts`, `src/render/shape-pass.test.ts`
      and `src/scene-data/shapes.test.ts`. Verify the four suites pass.
- [x] 14.2 Fetch `csvCache/uia_waypoints_1..9.json` and `csvCache/route_UIA_Hyperdictions.csv`
      into the ignored `data/csvCache/`, by the rule the dumps hold. Verify the repository
      commits no copy.
- [x] 14.3 Add `uiaWaypointRows` and `uiaWaypointSet` to `scripts/build-demo-systems.mjs`:
      the header reading, the placeholder skip, the `N`/`Y`/`F` letter table, the join rules
      and the mean direction line. Verify the fixture test reads the four lines the letters
      `N N Y Y F N` give.
- [x] 14.4 Stop the mean direction line at the model bounds, read from
      `src/galaxy-model/galaxy-model.json`. Verify `addSystems` rejects no record of the set.
- [x] 14.5 Add `parseCsv` and `uiaHyperdictionSet`: the quoted fields with a comma decimal
      separator, the pair de-dupe with the hostile flag, the 24 light year affiliation filter
      and the commander description. Verify the three fixture tests pass.
- [x] 14.6 Add the `UIA#1` to `UIA#8` categories and `ed3dSphereRecords`, and make
      `ed3dRecords` hold one record per name. Verify one name that two sources name gives one
      record that carries the categories of both.
- [x] 14.7 Change `UIA_SPHERE_LISTS` to the colours of the source's own materials, and give
      each list the marker category `formatHDs` gives it. Verify the four colours in the
      committed file.
- [x] 14.8 Run `pnpm build:demo-data`, read the counts, and write them into the
      `dataset-catalog` spec, `src/app/main.ts`, `src/app/demo-systems.test.ts`,
      `e2e/datasets.spec.ts`, `README.md` and `docs/roadmap.md`.
- [x] 14.9 Write the three new fixtures, extend `tests/fixtures/uia-extract.js` with the
      category groups the new records need, and rebuild `tests/fixtures/uia-demo-set.json`.
      Verify `tests/fixtures/uia.test.ts` passes.
- [x] 14.10 Say in `THIRD_PARTY_NOTICES.md` that the set carries commander names and that
      the fixtures carry invented ones. Verify `tests/third-party-notices.test.ts` passes.
- [x] 14.11 Run `pnpm lint`, `pnpm build`, `pnpm test` and `pnpm test:e2e` again, read the
      entry chunk size last, and re-run the implementation review gate. The reading is
      224,559 bytes again, so the 254,000 bound and the figures in the specs stand.

## 15. The findings of the second review gate

- [x] 15.1 Fix the race in the browser test "a load replaces the set and clears the
      selection and the filter": `setSelection` starts a 600 ms flight, and the test read the
      view twice inside it. The test now waits for `selectionFlightMs()` to reach 0 before it
      takes the first reading. Verify the spec files the gate ran together pass.
- [x] 15.2 Correct two counts: the entry count in `design.md` is 2,180 and not 1,819, and
      the report file holds 2,924 rows and not 2,923. Verify both against the sources.
- [x] 15.3 Say in `tasks.md` that 14.7 replaces the sphere colours of 10.1 and that 14.8
      replaces the `uia` counts of 10.6.
- [x] 15.4 Add the scenario and the browser test for the line crossing rule: a red line over
      a green one reads yellow, and no channel is brighter than the line that carries it.
- [x] 15.5 Say in `map-shapes` that the sphere sprite is sized at the range of the centre
      and not by the silhouette, with the error at eight, four and 1.2 radii.
- [x] 15.6 Correct the direction line: it runs **against** the mean step. Name the two
      divergences the record left out: the source asks for two parseable times as well, and
      it reads a coordinate with `parseFloat`, which drops the comma decimals.

## 16. The findings of the third review gate

- [x] 16.1 Correct the size of the `parseFloat` divergence in `dataset-catalog`: it is up to
      0.96875 light years on one axis and up to 1.607 light years in space, worst on the pair
      `Oochorrs RE-O d7-4` to `Oochorrs SZ-N d7-5`. Say the same in the `commaNumber`
      comment.
- [x] 16.2 Write down the one-row lag of the mean step, which the source makes and the
      converter keeps: in `dataset-catalog`, in a comment of `uiaWaypointSet` at the block
      that makes the sum, and in a new test with a table that bends at the last row.
- [x] 16.3 Correct the reason for the shape clear in `dataset-catalog`: `writeDataset` calls
      the system set's clear and then `clearShapes()`, so the two calls are one step and must
      stay together.

## 17. The findings of the fourth review gate

- [x] 17.1 Correct the size of the mean-step lag. Measure the angle over the rows the
      converter keeps, which `uiaNamedRows` filters, and not over every row of the table. The
      divergence is 0.011 to 0.245 degrees over the eight tables. Correct `dataset-catalog`
      and the comment of `uiaWaypointSet`.
- [x] 17.2 Drop the word "committed" from "the committed report file" in `dataset-catalog`.
      The report file sits in the ignored `data/` directory, and the same page uses "the
      committed file" for `demo-data/uia.json`.
- [x] 17.3 Say in 16.2 that the lag rule sits in the comment at the sum block and not in the
      leading doc comment of `uiaWaypointSet`.
