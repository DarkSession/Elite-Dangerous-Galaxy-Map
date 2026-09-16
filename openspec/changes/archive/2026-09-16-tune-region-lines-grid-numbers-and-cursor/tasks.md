## 1. The boundary band draws in two tones

- [x] 1.1 Add the look constants to `src/render/region-pass.ts`: `REGION_TONE` becomes
      `[0.74, 0.55, 0.43]`, `REGION_TONE_CORE` is `[0.90, 0.79, 0.52]`,
      `REGION_LINE_OPACITY` becomes `0.62`, `REGION_EDGE_CSS` is `4`,
      `REGION_EDGE_MAX_SHARE` is `0.25`, `REGION_CORE_SHARE` is `0.25` and
      `REGION_CORE_EDGE_CSS` is `1.5`. Rewrite two comments of that file: the module head
      at `src/render/region-pass.ts:5`, which says the line is one soft warm band, and the
      constant comment at `src/render/region-pass.ts:29`, which states the one cream tone of
      0.755 luminance that the change replaces. Verify by updating `src/render/region-pass.test.ts` to read
      each constant and the two luminances, 0.581 and 0.794, and run `pnpm test`
- [x] 1.2 Add a pure function to `src/render/region-pass.ts` that turns a half width in CSS
      pixels into the two shares the shader takes, `min(0.25, 4 / halfWidth)` and
      `1.5 / halfWidth`. Verify with a unit test that reads the shares at half widths of 8,
      11.52, 17.28 and 24, where the edge share is 0.25, 0.25, 0.2315 and 0.1667, and run
      `pnpm test`
- [x] 1.3 Give `src/render/shaders/region-composite.frag` the flat top and the core:
      `alpha = smoothstep(0, uEdgeShare, coverage)` and
      `tone = mix(uTone, uToneCore, smoothstep(0.75 - uCoreEdge, 0.75 + uCoreEdge, coverage))`.
      Rewrite the file's head comment, which states the one-tone rule the change replaces.
      Verify with `e2e/regions.spec.ts`'s shader compile test
- [x] 1.4 Send `uToneCore`, `uEdgeShare` and `uCoreEdge` from `createRegionPass`, beside
      the tone and the opacity it already sends, and name them in the composite program's
      uniform list. Verify by running `e2e/regions.spec.ts` and reading a boundary in the
      frame

## 2. The grid drops the zoom reach

- [x] 2.1 Remove `GRID_REACH_ZOOM` and `gridZoomReach` from `src/render/grid-pass.ts`, and
      make `gridReachPerLevel(out?)` return `100 * spacing` for every level, with its
      comment rewritten. Rewrite the comment of `gridDistanceFade` at
      `src/render/grid-pass.ts:206`, which says every level but the numbered one stops at
      the lesser of its own reach and the zoom bound. Verify by updating
      `src/render/grid-pass.test.ts`, dropping the readings of the zoom reach and the
      exemption, and run `pnpm test`
- [x] 2.2 Update the one call in `src/render/renderer.ts` to the new signature and remove
      the comment about the exemption there. Verify that `pnpm build` type checks and that
      `e2e/grid.spec.ts`'s vertex count tests pass
- [x] 2.3 Replace the lattice reach tests of `e2e/grid.spec.ts` with the scenario "The
      lattice runs to the edge of the frame": at 1920x1080, a pitch of 89 degrees and a
      camera distance of 4,000 light years, the largest radius at which the 100 light year
      level lights a pixel is above 900 CSS pixels. Add the second scenario "The lattice
      draws past the old zoom bound at a shallow pitch", which reads the middle column of
      the bottom row at a pitch of 45 degrees at the same distance, where the plane point is
      2,070 light years from the cursor and the zoom bound reached 1,600. Verify by running
      that file

## 3. A number leaves its crossing and reaches further

- [x] 3.1 In `src/app/grid-labels.ts` raise `GRID_LABEL_REACH` to `2` and add
      `GRID_LABEL_GAP_SHARE = 0.04`. Rewrite the comment of `GRID_LABEL_SPAN` at
      `src/app/grid-labels.ts:36`, which says the reach takes every crossing past 1.2
      spacings. Verify with the unit tests of the reach fade in
      `src/app/grid-labels.test.ts`, which read 0.55 at 90 light years on the 100 light
      year level and 0 at 200, and run `pnpm test`
- [x] 3.2 Offset the placement anchor in the sweep to
      `[gameX - widthLy / 2 - gap, gameZ + heightLy / 2 + gap]`, keeping the reported
      anchor at the projected crossing. The sign on `z` is the opposite of the sign on `x`
      because `planeCorners` in `src/app/plane-overlay.ts` runs the element's local `y`
      downward along the game `-z` axis, so the rectangle's bottom right corner is at
      `(anchor.x + widthLy / 2, anchor.z - heightLy / 2)`. Verify with a unit test that
      reads the placed quad's four game corners against the crossing, asserts that the
      third of them is the crossing **less** the gap on `x` and **plus** the gap on `z`, and
      run `pnpm test`
- [x] 3.3 Read the background at the centre of the placement's screen bounding box rather
      than at the crossing, and update the comment that names the anchor. The sample moves
      about a third of a spacing, which is 340 light years at the 1,000 light year level, so
      check that the scenario "A label recedes over a bright background" still reads inside
      its bounds over both views. Verify with the unit tests of the label opacity and run
      `pnpm test`
- [x] 3.4 Update `e2e/grid.spec.ts` for the two reach readings that move, 0.25 to 0.55 and
      120 to 200 light years, and add the two scenarios "A number stands clear of the lines
      it names" and "Every corner of the cursor's own cell carries a number". The first
      asserts that the corner nearest the crossing is the label's own bottom right corner,
      which is the third of the four `plane-overlay` reports, so a wrong sign fails it. The
      second puts the cursor 5 light years from a crossing on each axis and reads a furthest
      corner of 134.4 light years. Verify by running that file

## 4. The cursor marker follows the zoom

- [x] 4.1 In `src/app/cursor-marker.ts` add `CURSOR_MARKER_SIZE_MIN_CSS = 40`,
      `CURSOR_MARKER_NEAR_LY = 12000` and `CURSOR_MARKER_FAR_LY = 60000`, and a pure
      `cursorMarkerSizeCss(distance)` that reads
      `96 - 56 * smoothstep(12000, 60000, distance)`. Verify by **creating**
      `src/app/cursor-marker.test.ts`, which the module does not have, with readings at the
      camera distances 1,000, 12,000, 30,000, 60,000 and 120,000 of 96, 96, 78.3, 40 and
      40, and run `pnpm test`
- [x] 4.2 Read the size from `view.distance` in `cursorMarkerSideLy` and in the overlay's
      `update`, so the plane rectangle and the element's own box take one size. Verify
      with `e2e/cursor-marker.spec.ts`
- [x] 4.3 Add the scenario "The marker shrinks as the camera pulls back" to
      `e2e/cursor-marker.spec.ts`, reading 58, 47, 24 and 24 CSS pixels of ring width at
      the camera distances 12,000, 30,000, 60,000 and 120,000. Verify by running that file

## 5. The tests that read the band's profile

- [x] 5.1 Give the band row harness of `e2e/regions.spec.ts` the two tones. It holds
      `TONE_LUMINANCE` and `BAND_OPACITY` as literals at `e2e/regions.spec.ts:663-667` and
      turns a pixel into an alpha through them, and `readBandRow` at
      `e2e/regions.spec.ts:695-768` takes the half maximum from the **peak** of the row.
      Five more readings turn a pixel through `TONE_LUMINANCE` or `BAND_OPACITY`, at lines
      734, 948, 1036, 1157 and 1214. 734 is the one inside `readBandRow` itself, and tasks
      5.4 and 5.6 own the last three.
      Take both tone luminances, 0.581 and 0.794, and the opacity 0.62; read the profile
      through the **outer** tone; take the reference at a gap of `halfWidth - edge - 1` CSS
      pixels from the middle of the run, which is the outer plateau; and report the half
      maximum against that reference
- [x] 5.2 Update the readings of the scenario "The band is the stated share of the
      viewport" in `e2e/regions.spec.ts` to 30.6, 20.2 and 14.0 CSS pixels at half maximum,
      from `2 * halfWidth - edge` with an edge of `min(4, 0.25 * halfWidth)`. Replace the
      two assertions that follow the one-tone profile. Drop the `darkened` count, which is
      no longer 0 because the outer tone at 0.581 sits below the tone-mapped core, and
      replace `middleIsLighter` with the reading the scenario "The band carries a lighter
      core inside a deeper outer part" states: the middle of the run stands above the outer
      plateau at `halfWidth - edge - 1` CSS pixels, which holds at every one of the three
      viewports. Verify by running that test
- [x] 5.3 Replace the one-tone reading with the two-tone one, as the scenario "The band
      carries a lighter core inside a deeper outer part" states: the middle of a run is
      0.132 of luminance above a point 12 CSS pixels out, within 0.02; the readings at 12
      and 16 CSS pixels agree within one 8-bit step; the reading at 30 CSS pixels is the
      frame without the overlay. The scenario reads at **3840x2160**, where the half width
      is 24, and `e2e/regions.spec.ts` holds band describes at 1920x1080, 1280x720 and
      640x360 only, so this task adds a describe at that viewport. Verify by running that
      test
- [x] 5.4 Update the join tolerance to one 8-bit step and drop the half pixel sampling
      loss term, which `e2e/regions.spec.ts:1150-1159` and `1206-1216` work out from
      `BAND_OPACITY`, from both the join test and the corner test. The comments above both
      terms state the ridge profile and go with them. Verify by running those tests
- [x] 5.5 Update the corner radius reading: take the reference on each ray at a gap of
      `halfWidth - edge - 1` CSS pixels, which is 19.0 at a half width of 24, read the
      half-plateau point and add 2.0 CSS pixels in place of doubling. Verify that the
      reading is 24.0 within 2.0 CSS pixels
- [x] 5.6 Update the strength reading of `e2e/regions.spec.ts:1714`, which divides the peak
      alpha by `BAND_OPACITY`. Turn each pixel into an alpha through the **core** tone, keep
      only the pixels whose background reads under 0.5 of luminance, take the greatest of
      those and divide by 0.62. Fail the test where the window holds no pixel under the
      background bound. Verify by running that test
- [x] 5.7 Update the order reading of `e2e/grid.spec.ts:743-744`, where the band is 0.30 to
      0.75, to 0.25 to 0.70, and state the measured ratio in the requirement. The figure the
      rule gives at full profile alpha is `1 - 0.62`, that is 0.38, in place of 0.45. Verify
      by running that test
- [x] 5.8 Confirm that `tests/region-views.test.ts` still asserts its five counts without a
      change, because the searches read geometry and clearances and not the tone. Verify by
      running `pnpm test`

## 6. The whole suite and the look

- [x] 6.1 Run `pnpm lint`, `pnpm build` and `pnpm test`, and fix what they report
- [x] 6.2 Run `pnpm test:e2e` once, on its own, because a second Playwright run kills the
      first one's server, and fix what it reports
- [x] 6.3 Read the grid's own draw time from the scenario "The grid costs under a
      millisecond of draw time" over three runs at both pitches, now that every level draws
      to its own reach, and write the range into the requirement "The grid holds the frame
      budget" in place of the 0.05 to 0.14 and 0.05 to 0.08 milliseconds it states
- [x] 6.4 Regenerate the `e2e/look.spec.ts` baseline image, compare it with the one it
      replaces, and state what moved. Only the cursor marker is expected to
- [x] 6.5 Take a screenshot of a boundary at a view that matches the owner's reference,
      sample the band across its width, and check the outer tone, the core and the flat
      top against the readings the design records. Report the numbers
- [x] 6.6 Update `docs/roadmap.md`: the band's two tones and its profile, the reversal of
      the zoom reach and why, the label reach and offset, and the marker's size band

## 7. Review

- [x] 7.1 Run the `openspec-implementation-reviewer` subagent on this change id and fix
      what it returns, or say plainly that it could not be launched
