## 1. The zoom reaches 10 light years

- [x] 1.1 Move `MIN_DISTANCE` in `src/camera/view.ts` from 500 to 10, and verify
      `src/camera/view.test.ts` holds the scenarios "Limits", "The close limit takes more
      notches than the old one" and "A fragment below the old limit now loads"
- [x] 1.2 Add `nearPlane(distance)` to `src/camera/projection.ts` as `min(10, distance/10)`,
      keep `NEAR_PLANE` as the 10 light year ceiling, and verify a unit test reads 1, 5, 10,
      10, 10, 10 at 10, 50, 100, 500, 20,000 and 120,000 light years
- [x] 1.3 Change `projectionMatrix` to take the view, update every call site the compiler
      names, and verify `pnpm build` type-checks. `viewProjectionMatrix` already takes it
- [x] 1.4 Add the unit test that projects the cursor at every wheel step from 10 to 120,000
      light years at pitch 5 and 89, and verify it lands in front of the near plane and
      within 1 pixel of the screen centre
- [x] 1.5 Add the browser test that renders the default view and `#c=0,0,0&d=500&p=35&y=0`
      and verify each file is byte-identical to the same view drawn with a fixed near plane
      of 10
- [x] 1.6 Add the browser test that adds one category and one system at Sol, opens
      `#c=0,0,0&d=10&p=35&y=0`, and verify the middle pixel holds the marker's colour, so
      the near plane did not clip it
- [x] 1.7 Move `PRECISION_LIMIT_AT_MIN_DISTANCE` in `src/camera/precision.test.ts` from
      2.5e-3 to 5e-5, add 500 light years to `DISTANCES` as its own entry, because
      `MIN_DISTANCE` now supplies the 10 that entry used to give, correct the file's header
      comment, which names 500 as the closest zoom, and verify every relative error stays
      below `1e-2 * distance / 2,000`. Run the sweep after task 1.3, so it reads the new
      near plane: the worst case at 10 light years is then 2.8e-5, and against the old fixed
      near plane it is 2.6e-5

## 2. The star field holds below 640 light years

- [x] 2.1 Add `effectiveStarDistance(distance)` to `src/render/star-pass.ts` as
      `max(distance, CLOSE_FADE_NEAR)`, and verify a unit test reads 640, 640, 640, 640,
      640, 2,000 and 120,000 at 10, 100, 320, 500, 640, 2,000 and 120,000
- [x] 2.2 Feed the effective distance to `handoverRadii` and to `starField.update` in
      `src/render/renderer.ts`, leave `closeFade` on the view's own distance, and verify the
      unit test that reads the handover radii at every wheel step from 10 to 640 gets 240
      and 480 every time
- [x] 2.3 Verify the unit test that lists the drawn boxels at 10, 100, 320 and 500 light
      years from one camera position gets four equal lists of 1,856 boxels
- [x] 2.4 Drop the browser scenario that read the mean luminance at 640, 320, 100 and 10
      light years, because the frame mean cannot see the step the hold prevents, and verify
      the three unit scenarios of tasks 2.2, 2.3 and 2.6a read the three values the hold
      protects
- [x] 2.4a Add the browser scenario that holds the camera at one position, reads the star
      vertex count and the star drawn count at 10, 100, 320 and 640 light years, and gets
      four equal readings. The three unit scenarios call the rule themselves, so none of
      them fails when the render loop stops calling it. Verify the new scenario fails with
      the hold removed from `src/render/renderer.ts`: the drawn count at 10 light years
      then reads 225,870 against 340,529
- [x] 2.5 Correct the `closeFade` doc comment in `src/render/star-pass.ts`, which says the
      zoom distance is clamped to 500, and the note in the scenario "A base class change
      costs one slow frame at most", and verify neither still names 500 as the closest zoom
- [x] 2.6 Add the two 10 light year views to the close zoom frame budget test and verify
      each mean is under 16.7 ms over 300 frames
- [x] 2.6a Verify the unit test that the base size class is 1 at 10, 100, 320 and 640 light
      years, and that the covered radius is at least 0.75 times the zoom distance over 200
      steps from 10 to 5,120
- [x] 2.6b Add the `d=10` view to "the invented field goes as the camera comes in" and to
      "a real system stays when the invented field goes" in `e2e/stars.spec.ts`, and verify
      the frame with the star pass on is byte-identical to the frame with it off at 10 light
      years
- [x] 2.6c Correct the comment in `src/scene-data/star-field.ts` that measures the grain
      constants "at the closest zoom", and verify it names the distance it means rather than
      the limit
- [x] 2.7 Run the existing `close-view-stars` suites and verify the far view baseline image
      and the byte-identical handover scenarios still pass

## 3. The category carries a style and a range

- [x] 3.1 Add `markerStyle` and `maxDrawRange` to `Category` in
      `src/scene-data/real-systems.ts`, with the defaults `glow` and 120,000, and add
      `bad-style` and `bad-range` to `CategoryRejectReason`
- [x] 3.2 Validate both fields in `addCategories` and verify the unit test of six
      categories reports `no-name`, `bad-color` twice, `bad-style` and `bad-range` at the
      right indices
- [x] 3.3 Verify the unit tests that read the defaults on a category with neither field and
      that a replacement under the same name drops the style and the range the old one
      carried

## 4. The marker pass draws two styles and cuts by range

- [x] 4.1 Add the `(style, maxDrawRange)` cached buffer to `src/render/system-pass.ts`
      beside the colour buffer, under the same version guard, and verify a unit test builds
      it for a mixed set and finds the right pair per marker
- [x] 4.2 Count the markers inside their range in the rebase loop, by the squared range, and
      verify the unit test that the count matches a `float64` reference over 1,000 spread
      positions
- [x] 4.3 Add the range cut and the 2.5 size factor to `src/render/shaders/systems.vert`,
      and verify the unit test of the size rule reads the disc between 7 and 12 CSS pixels
      and the glow between 17.5 and 30
- [x] 4.3a Hold the sprite size at the card's maximum point size from
      `ALIASED_POINT_SIZE_RANGE`, and verify the unit test that no size the pass asks for
      at a device pixel ratio of 1, 2 or 3 is above it
- [x] 4.4 Add the glow branch to `src/render/shaders/systems.frag` as
      `min(1, spikes + max(core, halo))`, with `core = clamp((2.5 - r) / 1.5, 0, 1)`,
      `halo = 0.85 * (1 - r/R)^3` and the four spikes
      `0.55 * max(0, 1 - p/1.0) * max(0, 1 - a/R)^2`
- [x] 4.4a Export the same rule from `src/render/system-pass.ts` as `glowAlpha`, as
      `starBrightness` mirrors `stars.vert`, and verify the unit test that reads it at 1,000
      steps at the floor and the cap radius finds 1 at the centre, no rise outward and no
      neighbouring pair above 0.05
- [x] 4.5 Verify the unit test on a recording context that a mixed set of 200 systems
      records exactly one `drawArrays` call of count 200
- [x] 4.6 Verify the browser tests of the glow: the centre holds the category colour within
      2 per channel, the spike is 0.1 of luminance above the diagonal at half the radius,
      the diagonal never rises outward and ends below 0.02, and the glow row of a category
      of the colour (255, 255, 255) is between 2.0 and 2.7 times the disc row of a second
      category of the same colour, both at the cap size
- [x] 4.7 Verify the browser tests of the range cut: a marker outside its range does not
      draw, two systems of one category cut at their own ranges in one frame, the cut does
      not fade, a changed range changes the count, and two categories cut at their own
      ranges
- [x] 4.8 Update every existing marker browser test that reads a disc pixel to set
      `markerStyle: 'disc'` on its categories, and verify the ring colour scenario, the
      floor and cap scenario and "two markers overlap in the order the set holds them" at
      `e2e/systems.spec.ts:407` all pass. That last one reads a pixel 1.25 CSS pixels from
      a marker centre, where a glow is not opaque
- [x] 4.9 Give the category of "a marker shows at every zoom distance" a `maxDrawRange` of
      200,000 and the category of the floor and cap scenario the same, and verify the
      120,000 light year view reads the zoom limit and not the default range cut
- [x] 4.10 Verify the browser test "a restyled category restyles its markers": add the
      `disc` category of the colour (255, 255, 255), read the middle pixel and the row
      width, replace the category with a `glow` of the same name, and check the row width
      grows by a factor between 2.0 and 2.7 with no change to the system count

## 5. The traced boundary set

- [x] 5.1 Add the traced packer to `src/scene-data/region-lines.ts`: walk each chain's
      nodes, keep a node only where the integer direction changes, keep both ends, and pack
      to the same `RegionLines` shape
- [x] 5.2 Verify the unit test that the traced set holds between 15,000 and 40,000
      vertices, fewer than the trace has nodes, and fewer than the smoothed set. Assert the
      range and not the reading, so a package release that redraws a region fails "The
      package constants hold" and not this test. On the pinned package the readings are
      38,686 nodes and 22,718 vertices, which is 266.23 KiB
- [x] 5.3 Verify the unit test that the traced set departs from the traced boundary by 0
      within 0.01 light years, both ways. The tolerance is 0.01 and not 0, because one
      `float32` step near 50,000 light years is 0.0078
- [x] 5.4 Verify the unit test that the traced set's turn equals the untouched trace's
      within 1e-6 and is above 1,000 degrees per 1,000 light years. Assert the bound and not
      the reading, for the reason task 5.2 gives. On the pinned package the reading is
      1,062.75
- [x] 5.5 Verify the unit test that the two sets hold the same chain count and that each
      build is byte-identical to the last
- [x] 5.6 Carry the second set through `RegionData`, `RegionLinesResponse`,
      `regionResponseTransferables`, `SceneData` and `src/scene-data/types.ts`, and verify
      the `MessageChannel` test transfers both sets and leaves every sender buffer at
      length 0

## 6. The region mode

- [x] 6.1 Hold both vertex arrays in `src/render/region-pass.ts` and pick one per draw, and
      verify a unit test on a recording context that a mode change binds a different vertex
      array and uploads nothing
- [x] 6.2 Add the mode to `GalaxyMapOptions`, `getRegionMode` and `setRegionMode` in
      `src/app/create-map.ts`, default `simplified`, and pass it to the renderer and to the
      label overlay
- [x] 6.2a Verify the browser test that `getRegionMode` and `setRegionMode` are on the
      handle and on neither `debug` nor the pass switches
- [x] 6.3 Verify the browser tests of the mode: the default is `simplified`, the three modes
      draw three different frames, `off` matches the `regions` switch off frame byte for
      byte and places no label, a bad value changes nothing, and the labels are the same in
      both drawing modes
- [x] 6.4 Verify the browser test that a mode change draws a different frame without a
      second scene data load
- [x] 6.5 Add the unit test that finds a plane point within 25 light years of a chain of
      both sets, and verify the browser tests that both modes draw a 4 CSS pixel two-toned
      line, that both still draw at 1,500, 500 and 10 light years from that point, and that
      a 90 degree corner of the traced set is not brighter than its own straight run

## 7. The frame budget and the whole suite

- [x] 7.1 Add the two 10 light year views to the marker frame budget test and verify each
      mean is under 16.7 ms over 300 frames at 1920x1080
- [x] 7.2 Add the worst-case budget view, 10,000 systems of a category of `maxDrawRange`
      300,000 all within 10,000 light years of Sol at a zoom of 10, and verify the mean is
      under 16.7 ms
- [x] 7.3 Run `pnpm test` and verify the whole unit suite passes
- [x] 7.4 Run `pnpm test:e2e` and verify the whole browser suite passes on hardware, with
      the renderer assertion reporting the NVIDIA card and not a software renderer
- [x] 7.5 Run `pnpm lint` and `pnpm build` and verify both are clean, including the
      `no-restricted-imports` rule that keeps `scene-data` free of `render`

## 8. Documentation

- [x] 8.1 Update `docs/roadmap.md`: add this change under a phase, record the zoom limit,
      the two marker styles, the default draw range, the three region modes and the finding
      that the klightspeed data is the data already in the tree
- [x] 8.2 Update `README.md` where it states the zoom range and the control scheme, and
      verify the stated range reads 10 to 120,000 light years
- [x] 8.3 Update `docs/roadmap.md` where it states the navigation zoom range of 500 to
      120,000 and the precision figures, and verify it names the measured worst case at 10
      light years

## 9. Review gate

- [x] 9.1 Run `openspec validate deep-zoom-markers-and-region-modes --strict` and verify it
      reports the change valid
- [x] 9.2 Launch the `openspec-implementation-reviewer` subagent with this change id, act on
      its findings, and verify its verdict is APPROVE or APPROVE WITH NOTES before any human
      sees the work
