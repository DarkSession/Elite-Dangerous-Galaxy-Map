## 1. The region band and its range

- [x] 1.1 Add `regionBandHalfWidthCss(viewportHeightCss)` to `src/render/region-pass.ts`,
      returning `clamp(0.016 * height, 8, 24)`, and verify a unit test reads 17.28 at 1,080
      rows, 8 at 360 and 24 at 2,160
- [x] 1.2 Feed that half width into the ribbon pass in place of the fixed 3 CSS pixels, and
      verify `pnpm vitest run src/render/region-pass.test.ts` passes
- [x] 1.3 Delete the blur stage: `src/render/shaders/region-blur.frag`,
      `regionBlurRadiusCss`, `regionBlurSigma`, `regionBlurTaps`, the two blur targets, the
      `uPeak` uniform and its normalisation, and verify the pass holds one coverage target by
      reading `debug.regionCoverageSize()` in the browser test and by `grep -r "uPeak\|blur"
      src/render/region-pass.ts src/render/shaders/region-*` returning nothing
- [x] 1.4 Change the default `regionMode` to `accurate` in `src/app/create-map.ts`, and
      verify the browser scenario "The default mode is accurate" passes and
      `regionMode: 'simplified'` in the options still gives `simplified`
- [x] 1.5 Verify the band width on the screen: run the browser scenario "The band is the
      stated share of the viewport" at 1920x1080, 1280x720 and 640x360, and read the
      half-maximum width as 17.3, 11.5 and 8.0 CSS pixels within 1.0, which puts the whole
      band at 34.6, 23.0 and 16.0
- [x] 1.6 Verify the clamp holds at the small viewport: confirm the 640x360 reading comes
      from the floor of 8 and not from 1.6 per cent of 360 rows, which is 5.76
- [x] 1.7 Verify `REGION_RANGE_NONE` and `REGION_RANGE_FULL` did not move: confirm
      `grep -n "REGION_RANGE_NONE\|REGION_RANGE_FULL" src/render/region-pass.ts` still reads
      10000 and 20000, and run the browser scenario "A far line still draws while the near
      line is gone"

## 2. The flow field

- [x] 2.1 Add `buildRegionFlow(coarse)` to `src/scene-data/region-lines.ts`, a breadth-first
      walk per region over the eight-neighbourhood writing one direction byte per cell, with
      8 for the end of a path, and verify the unit scenarios "Every step stays on its own
      region" and "Following the field reaches the centre" pass
- [x] 2.2 Verify the concave case: add the unit scenario "The field crosses a region that
      lies in the way" with a two-lobed region and a second region in the gap, and confirm
      the walk goes through the neck
- [x] 2.3 Carry the field through `src/scene-data/types.ts`,
      `src/scene-data/messages.ts` and `src/scene-data/region-lines.worker.ts`, in the same
      message and transfer list as the boundary sets, and verify the unit scenario "The field
      is sent with the boundary sets" passes and the buffer is in the transfer list
- [x] 2.4 Verify the shipped data has no unreachable patch: run the unit scenario "The
      shipped data has no region the field cannot cross" and confirm it counts 0 cells that
      carry a region id and the end-of-path byte without being a root, so a package release
      that splits a region fails a test rather than freezing a label
- [x] 2.5 Verify the field costs the build nothing measurable: run
      `pnpm vitest run src/scene-data/region-lines.test.ts` and confirm the build stays
      inside its existing 120 second timeout

## 3. The region labels follow the field

- [x] 3.1 Pass the field to the label overlay beside the coarse grid, through
      `labels.setGrid`, and verify `pnpm vitest run src/app/labels.test.ts` passes
- [x] 3.2 In `smoothTarget`, replace "keep the carried point" with a step along the field,
      scaled to the screen length the straight step asked for, keeping the carried point only
      where the field names no step, and verify the unit scenario "A label walks around a
      region in its way" reaches the centre in 600 frames
- [x] 3.3 In `filterAnchor`, after the six halvings fail, take the field's step in place of
      the full straight step, and verify the unit scenario "A blocked anchor keeps moving"
      passes
- [x] 3.4 Cut the close step from `labelFade` in `src/app/labels.ts`. It then reads exactly
      what `regionFade` reads, so make it call `regionFade` rather than hold a second copy,
      and multiply each label's opacity by
      `smoothstep(REGION_RANGE_NONE, REGION_RANGE_FULL, r)`, where `r` is the camera's
      distance to that label's own plane anchor. Verify the browser scenario "A label and the
      line beside it read at the same strength" agrees within 0.05
- [x] 3.5 Delete `REGION_CLOSE_NONE` and `REGION_CLOSE_FULL` from
      `src/render/region-pass.ts`, which nothing reads once `labelFade` drops its close step.
      Delete the four assertions of `src/render/region-pass.test.ts` that name them, and
      rewrite the `the label fade` block of `src/app/labels.test.ts` lines 464-475, whose six
      close-step assertions now read 1 and not 0. Verify
      `grep -rn "REGION_CLOSE_" src e2e tests` returns nothing
- [x] 3.6 Replace the range half of the sweep's skip gate at `src/app/labels.ts:1339`,
      keeping the zoom half: the sweep runs when `regionFade(distance) > 0` **and** the
      greatest range to the plane the frame holds is above `REGION_RANGE_NONE`. Read that
      range by unprojecting the frame's two top corners, intersecting each with `y = 0` and
      taking a miss as beyond. Verify the unit scenario "The sweep is skipped only when
      nothing could draw" skips at a pitch of 89 degrees and runs at 20, at a zoom of 4,000
      light years, and the browser scenario "The sweep does not run when the frame can carry
      no label" reads 0 frames at both of its views
- [x] 3.7 Verify the two faults are gone together: run the browser scenarios "No label where
      no line draws" at
      `#c=1840.85884,-15539.75557,16507.94703&d=20016.72348&p=58.57998&y=24.66002&g=1` and
      "The region the camera is inside is named at every zoom", the second reading each
      opacity as the range fade at the label's own anchor within 0.05 and finding no
      `Inner Orion Spur` label at a zoom of 4,000
- [x] 3.8 Verify the placement itself did not move: run the whole of
      `src/app/labels.test.ts`, which holds the unit scenarios "A label anchor moves with the
      camera and does not snap" and "A region in two patches keeps its anchor on itself". Both
      sit at zooms where the label they read is now left out of the overlay, so they stay unit
      readings of the placement and SHALL NOT be run against the page
- [x] 3.9 Verify the two browser scenarios that count labels: "The core is named" and "The
      camera keeps the label of the region it sits in when it turns away", the second at a
      zoom of 20,000 light years, where the nearest plane point in frame is 12,657 light
      years, so the range fade takes no label away and the 5 per cent clause still reads the
      placement

## 4. The exact region and the information panel

- [x] 4.1 Add `regionNameAtExact(point)` to the handle in `src/app/create-map.ts`, loading
      `astro/codex-region-lookup` through a module-level cached dynamic import, and verify
      the browser scenarios "The exact call names the region at a point", "The exact call
      is right where the coarse one is not" and "The height of the point does not change the
      answer" pass
- [x] 4.2 Update `tests/main-bundle.test.ts` for the new rule: the lookup is in no entry
      chunk and in no chunk an entry chunk imports at load, asserting those two rules and
      **not** a count of carrier chunks. Run `pnpm build` then
      `pnpm vitest run tests/main-bundle.test.ts`, and verify the browser part of the
      scenario "The exact table stays out of the main bundle" shows two concurrent calls
      fetch it once
- [x] 4.3 Add the `REGION` field to `src/hud/info-panel.ts` after `RANGE`, taking both
      columns, with an empty value until the promise resolves and `Unknown` for null or a
      rejection, and verify the browser scenarios "The panel names the system's region", "The
      region field is exact" and "A position off the region map reads Unknown" pass
- [x] 4.4 Drop a lookup whose selection has changed before it resolves, and verify the
      browser scenario "A stale lookup does not write" passes
- [x] 4.5 Verify the grid does not reflow: run the browser scenario "The grid does not reflow
      when the region arrives" and confirm every field box is unchanged
- [x] 4.6 Verify the HUD boundary still holds: run `pnpm lint` and confirm
      `src/hud/hud-boundary.test.ts` passes, so the panel reads the handle and not
      `src/scene-data/`

## 5. The plane overlay

- [x] 5.1 Add `src/app/plane-overlay.ts` with the four-corner projection, the 8 by 8
      homography solve and the `matrix3d` write, and verify the unit scenario "A plane
      rectangle projects to the quad the camera sees" agrees with the camera projection
      within 0.01 CSS pixels
- [x] 5.2 Verify it is not affine: run the unit scenario "The far edge is shorter than the
      near edge" at a pitch of 30 degrees and confirm at least 5 per cent
- [x] 5.3 Add the culling rules, and verify the unit scenarios "A quad crossing the near
      plane is dropped" and "A singular placement is dropped" pass and neither throws
- [x] 5.4 Add the screen bounding box the overlap test uses, and verify a unit test that two
      plane elements at a low pitch overlap by their boxes and not by their own rectangles
- [x] 5.5 Verify a plane element does not transform an upright one: run the browser scenario
      "A plane element does not transform an upright one" with the grid on and a system
      selected
- [x] 5.6 Verify the write rule: run the unit scenario "The placement writes no style it
      already holds"

## 6. The cursor marker

- [x] 6.1 Add `src/app/cursor-marker.ts` with the 160 by 160 view box, the ring of outer
      radius 48 and stroke 4, and the four arrows in `#3EF8FB`, and verify the browser
      scenario "The marker carries four arrows and one ring" passes
- [x] 6.2 Place it through `plane-overlay.ts` at the cursor on the cursor's own plane, sized
      from 96 CSS pixels at the cursor, and verify the browser scenarios "The marker sits at
      the cursor" and "The marker holds its size on the screen" pass
- [x] 6.3 Verify it lies on the plane: run the browser scenario "The marker lies on the
      plane" and confirm the ring's box is square at 89 degrees and between 0.40 and 0.60 as
      tall as it is wide at 30 degrees
- [x] 6.4 Add the `cursorMarker` option to `GalaxyMapOptions` and
      `setCursorMarkerVisible(on)` and `getCursorMarkerVisible()` to the handle, on by
      default, and verify the browser scenarios "The switch removes the marker" and "The
      option chooses the marker at start-up" pass
- [x] 6.5 Verify the stacking: run the browser scenario "A selection pin draws over the
      marker"
- [x] 6.6 Verify the reported fault: run the browser scenario "The marker follows the cursor
      off the plane" at
      `#c=1840.85884,-15539.75557,16507.94703&d=20016.72348&p=58.57998&y=24.66002` and confirm
      the marker is in the overlay, so the frame that held no overlay now says where the
      cursor is

## 7. The grid goes cyan

- [x] 7.1 Replace `GRID_COLOR` with `rgb(96, 214, 224)` and add `rgb(16, 74, 120)` as the
      deep colour, replace `gridBackgroundTint` with
      `gridBackgroundColour(luminance, light, deep)`, and raise `GRID_LINE_MERGE_FLOOR` to
      0.55, and verify the unit scenario "The weight and the darkening are one rule" passes
- [x] 7.2 Change `grid.frag` to take `uColorLight` and `uColorDeep` in place of `uColor` and
      `uTintMax`, reading the background's luminance only, and verify
      `pnpm vitest run src/render/grid-pass.test.ts` passes
- [x] 7.3 Verify the look over the core: run the browser scenarios "The grid recedes over a
      bright background" and "The line darkens over the core and keeps its hue", and **write
      the measured pair of channel changes into the first scenario** in place of the 15
      against 110 the old rule gave
- [x] 7.4 Verify the bold level is findable over the core: run the browser scenario "The bold
      level reads over the galactic core" and confirm at least 10 of 255
- [x] 7.5 Verify the draw order did not move: run the browser scenarios "The overlays draw
      over the grid" and "The grid draws under a marker"

## 8. The coordinate labels on the plane

- [x] 8.1 Keep `GRID_LEVELS` at its six decade levels, which the requirement "The grid draws
      every decade level on the cursor's plane" still states, and cut only the **label** level
      set to `[100, 1000]` in `src/render/grid-pass.ts`. Update `gridLabelLevel` to read the
      two-level set, rewrite the label-level assertions of `src/render/grid-pass.test.ts`
      against it, and verify the browser scenario
      "The label level follows the zoom" reads 100, 100, 1,000, 1,000, 1,000 and 1,000 at 100,
      200, 300, 1,000, 3,000 and 11,000 light years
- [x] 8.2 Cut the candidate ring to 2 spacings and the cap to 8, and verify the browser
      scenario "The label count is capped" reads 8 or fewer at a pitch of 5 degrees
- [x] 8.3 Add the reach fade `1 - d / (1.2 * spacing)`, and verify the browser scenarios "A
      label fades with its distance from the cursor" reads 0.25 within 0.02 at 90 light years
      and "No label stands past the reach" finds every distance below 120
- [x] 8.4 Change the text to `x : y : z` with a thousands separator, and verify the browser
      scenario "A crossing label reads its own coordinates" passes at a cursor of
      (1,000, -600, 2,000)
- [x] 8.5 Measure the label text once per level, and set the cap height to the lesser of one
      tenth of the level's spacing and the height that holds the measured width to 0.6 of a
      spacing, and verify the browser scenario "A label is no wider than the cell it names"
      finds every label at or below its spacing and at least one above 0.7 of it
- [x] 8.6 Place each label through `plane-overlay.ts` at that cap height, reusing the two axis
      steps the alpha gate already takes, and verify the browser scenarios "A label lies on
      the plane" and "A label follows the grid cell it sits in" pass, the second reading one
      share of the cell at all three zooms
- [x] 8.7 Give the label the cyan pair `rgb(140, 235, 240)` and `rgb(20, 88, 140)`, raise
      `GRID_LABEL_MERGE_FLOOR` to 0.75 and change the shadow to `rgba(2, 12, 20, ...)`, and
      verify the browser scenario "A label recedes over a bright background" passes
- [x] 8.8 Remove the plane label and `PLANE_LABEL_BOTTOM_CSS`, and verify no
      `gm-grid-plane-label` element is in the overlay and `grep -rn "gm-grid-plane-label\|
      PLANE_LABEL_BOTTOM_CSS" src e2e` returns nothing
- [x] 8.9 Verify the label's opacity is still the product of its three factors: run the
      browser scenario "A label does not draw stronger than its line" and the unit scenario
      "The factor is 1 at the cursor"
- [x] 8.10 Verify the transformed text is not blurry: read the label nearest the cursor in the
      Playwright screenshot at 1920x1080 at a pitch of 30 degrees and confirm its edge
      contrast is at least **0.75** of the same text drawn upright. The bound is 0.75 and
      not 0.85: the reading is 0.922 while a label is a whole spacing wide and about 0.805
      at the width share of 0.6, because a smaller glyph loses proportionally more of its
      edge to the transform's resampling. Building the element one octave larger moves it
      only from 0.809 to 0.813, so the loss is not under-sampling of the source

## 9. The region view searches

- [x] 9.1 Restate every reading window of the four searches in `tests/region-views.ts`
      **additively**: a window that measures a clearance from the band takes the half width
      plus the figure it already holds, and a window that measures along the band keeps its
      figure. Do not scale a window by the band's growth, which asks the traced corner search
      for arms of 4,105 light years when the longest straight segment of the set is 4,392.
      Keep the premises, the ranges and the viewports as they are, and verify
      `pnpm vitest run tests/region-views.test.ts` runs
- [x] 9.2 Run each of the four searches, write the counts they find into the requirement "The
      boundaries draw as one wide soft band", and verify `tests/region-views.test.ts` asserts
      all five counts and passes
- [x] 9.3 Verify the corner is round without a blur: run the browser scenario "The corner of
      the traced set is round to the band's half width" and confirm 24.0 CSS pixels within
      2.0, which is the clamp at 2,160 rows and not 1.6 per cent of 2,160
- [x] 9.4 Verify the join rule needs no tolerance: run the browser scenarios "A join is not
      brighter than the line" and "A 90 degree corner of the traced set is not brighter than
      its line" with the tolerance removed

## 10. The suite and the baselines

- [x] 10.1 Run `pnpm lint` and `pnpm vitest run` and verify both pass with no new warning
- [x] 10.2 Run the full Playwright suite once, on `chromium-gpu` alone, and verify it asserts
      the hardware renderer through `WEBGL_debug_renderer_info` and does not report
      SwiftShader or llvmpipe
- [x] 10.3 Regenerate the `chromium-gpu` baseline image with `--update-snapshots=all`, once
      the look of tasks 1, 6, 7 and 8 is settled, and verify a second run passes against the
      new baseline. `chromium-touch` holds no baseline: it runs `00-renderer.spec.ts` and
      `touch.spec.ts` alone and neither takes a screenshot. `--update-snapshots=all` and not
      `--update-snapshots`, because the old baseline still passes against the new frame:
      `maxDiffPixelRatio` is 0.02 and this change moves fewer pixels of the default far view
      than that. Run one Playwright job at a time: a second run takes the first one's server
      on port 4173 and the failures look real
- [x] 10.4 Verify the frame budget: run the browser scenario "The overlay costs under a
      millisecond" and the `map-hud` and `real-systems` budget scenarios, and confirm none
      regressed
- [x] 10.5 Update `README.md` for every host-visible change: the default `regionMode`, the
      `cursorMarker` option with `setCursorMarkerVisible` and `getCursorMarkerVisible`,
      `regionNameAtExact`, the `REGION` field of the information panel, the region labels
      now fading with the boundary, and the removal of `gm-grid-plane-label`
- [x] 10.6 Update `docs/roadmap.md`: record that the region boundary answers its raster with
      band width and not with smoothing, that the grid is cyan, that the region labels and
      the boundary now take one fade rule, and that the range figures were reviewed and
      kept
- [x] 10.7 Run `openspec validate cursor-marker-cyan-grid-and-region-band --strict` and
      verify it reports the change as valid after every count and reading written back in
      tasks 7.3 and 9.2

## 11. The implementation review gate

- [x] 11.1 Run the tests yourself first, then launch the `openspec-implementation-reviewer`
      subagent with this change id, and verify it returns APPROVE or APPROVE WITH NOTES. On
      BLOCK, fix what it found and run the gate again. Do not present a blocked change with
      the objections attached as caveats
