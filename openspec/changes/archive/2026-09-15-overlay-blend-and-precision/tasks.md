## 1. The position precision

- [x] 1.1 Add `formatCoordinate(value, separators)` to `src/hud/dom.ts`: at most 3 decimal
      places, trailing zeros and a trailing point dropped, a thousands separator on the
      whole part when `separators` is true. Verify with a unit test over -9530.9375,
      -910.28125, 19808.125, 100, 0 and -25.5, in both forms.
- [x] 1.2 Call it from `fieldsOf` and from `copyPosition` in `src/hud/info-panel.ts`, and
      delete `copyPosition`'s `Math.round`. Verify the browser scenarios "The position keeps
      its fraction" and "A whole coordinate shows no decimal point" pass in `e2e/hud.spec.ts`.
- [x] 1.3 Update the existing test `the position button copies three whole numbers` in
      `e2e/hud.spec.ts` at line 1202, whose record is at `[1234.5, -20, 25895]` and which
      expects the field `1,235 / -20 / 25,895` and the clipboard `1235 / -20 / 25895`. Move
      its record to `[1235, -20, 25895]`, so the test keeps its name and still measures what
      it was written for: the field carries the separators and the copy drops them. Add a
      second test beside it for the scenario "The position button copies a fraction", with the
      record at `[1234.5, -20, 25895]` and a clipboard of `1234.5 / -20 / 25895`. Verify no
      assertion anywhere in the file still expects a rounded position.
- [x] 1.4 Verify `DISTANCE FROM SOL` and `RANGE` still read whole light years, with the
      scenario "The distance fields stay whole".

## 2. The background reading

- [x] 2.0 Extract `halve` from `src/render/glow-pass.ts`, where it is a closure and not an
      export, into a member both passes call. Leave the **glow** on its own size rule,
      `Math.max(1, width >> 1)`, which rounds down; give the **background chain** a rule that
      rounds up. Two rules and not one, because changing the glow's rule changes its target
      sizes at an odd drawing buffer and task 9.3 holds its baseline image byte-identical.
      Verify the scenario "The reading rounds its size up" with a unit test at 1920x1080,
      1280x720, 300x300 and 8x8, which must give 120x68, 80x45, 19x19 and 1x1, and that the
      glow's rule still gives 67 rows where the reading's gives 68 at **1281x1081**. Read the
      glow's own **target sizes** at 1281x721 and check they are the sizes its rule gave
      before the extraction; do not take a fresh screenshot there, which has no baseline to
      fail against.
- [x] 2.1 Add `src/render/background-pass.ts`: one tone map of the scene into a
      full-resolution `RGBA8` target, then a halving chain from it down to
      `ceil(width / 16) x ceil(height / 16)`. Reuse the halving of `glow-pass.ts` and
      `tonemap.frag`. The size rule and its unit test belong to task 2.0; do not write a
      second one here.

      The tone map runs **before** the chain, not after it. An earlier draft had it last,
      and the measurements of task 2.5 rejected that order: a star sprite's linear luminance
      dominates the linear mean of its whole 16 by 16 block, so the reading stepped by 0.2417
      in one frame where this order steps by 0.0232.
- [x] 2.2 Add the pixel buffer object path: two `PIXEL_PACK_BUFFER` buffers, a `fenceSync`
      after the copy, and `getBufferSubData` on a later frame only when the fence has
      passed. Verify with a unit test over the state machine: a first call gives null, a
      call after the fence gives the bytes, and a write never lands in the buffer the same
      frame reads.
- [x] 2.3 Wire the pass into `renderer.ts` after the tone map and before the grid draw, and
      build it only when `passes.grid && gridDraw && band > 0`. Verify a browser test that
      draws with the grid off allocates no target. Add `debug.backgroundSize()`, which the
      requirement now names, reporting the target's own size the way `coverageSize()` reports
      the region pass's, and verify the scenario "The reading is absent with the grid off".
      A null `backgroundReading()` shows only that no frame built one, not that no storage was
      taken.
- [x] 2.4 Add `debug.backgroundReading()` as a synchronous read of the small target, giving
      the width, the height, the red, the green, the blue and the luminance of every texel
      from 0 to 1. Verify the scenarios "The reading follows the picture" and "The reading is
      absent with the grid off", and that each texel's luminance matches its own channels.
- [x] 2.5 Verify the scenario "The reading holds still under the grain": 30 frames at a zoom
      of 4,000 light years with the cursor moving 20 light years a frame move the texel under
      a fixed screen point by less than 0.05 between neighbouring frames. 20 light years at
      that zoom is 4.67 CSS pixels, about three tenths of a 16 pixel reading texel. The camera has to
      move, because no shader takes a time uniform and a still frame is byte-identical.
      **The measured worst step is 0.0230**, against the bound of 0.05. The bound was 0.02
      while the chain averaged in linear light, where the same reading was **0.2417**. The
      order changed to the tone map first, which is what took the step down; no order reaches
      0.02, because a box average has a hard edge and a bright star sprite counts in full
      inside a texel and not at all outside it. Over the whole reading the share of texel
      steps above 0.02 falls from 5.53 per cent to 0.12 per cent over the disc, and from
      32.22 per cent to 0.64 per cent over the core.

## 3. The grid merges with the background

- [x] 3.1 Add `GRID_BG_LOW`, `GRID_BG_HIGH`, `GRID_LINE_MERGE_FLOOR`,
      `GRID_LABEL_MERGE_FLOOR`, `GRID_LINE_TINT_MAX`, `GRID_LABEL_TINT_MAX`,
      `gridBackgroundWeight(luminance, floor)` and `gridBackgroundTint(luminance, maximum)`
      to `src/render/grid-pass.ts`. Verify with the scenarios "The weight and the tint are one
      rule" and "A label and its line recede together".
- [x] 3.2 Give `grid.frag` `uBackground`, `uMergeRange`, `uMergeFloor` and `uTintMax`,
      sample the reading with linear filtering, scale the alpha by the weight and mix the
      colour toward the reading by the tint. Verify a unit test reads the four uniform names
      out of the shader source and matches them with the uniform list `createGridProgram`
      declares.
- [x] 3.3 Keep `gridLevels()` reporting the level alpha before the weight. Verify the
      existing scenario "The probes agree with the frame" still reads 0.45 within 0.01.
- [x] 3.4 Find the two views the merge scenarios need, one over the core and one over the
      dark space between the arms, and check every premise they carry with
      `backgroundReading()`. One criterion, stated once: at a zoom of 4,000 light years the
      **mean** luminance of the reading is at least 0.55 in the first view and at most 0.10 in
      the second; the texel under the line point each scenario samples holds the same bound;
      the dark view's **blue** channel under that point is below 60 of 255, so the band's own
      blue of 60 can still rise there; the frame holds a line of the **label level** at 4,000
      light years, which the scenarios read and which a 2,338 CSS pixel spacing may leave out
      of a 1,920 pixel frame; and at a zoom of 2,000 light years, which the label scenario
      uses, every bound still holds and each view holds at least one crossing label. No view
      in the tree holds these premises today, so the search may find none. If it does, move
      the **dark** view outward along the plane, where the disc is dimmer, before loosening
      any bound, and record the readings the chosen pair gave beside the scenarios. Verify the scenarios "The grid recedes over a bright background" and "The line
      takes the background's hue over the core", which read the **magnitude** of the change,
      because the line darkens the core rather than lightening it. The same two views serve
      task 4.4's label scenario and task 2.4's reading scenario, so find them once and share
      them. The pair the scenario states is a prediction until this task measures it; correct
      the sentence in the spec to the readings the chosen views give.
      **The pair is the cursor at `0, 0, 20000` for the core and at `-40000, 0, 20000` for
      the dark space.** With the tone map at the front of the chain the magnitude pair reads
      **15 of 255 over the core against 110 over the dark space, a ratio of 0.136**. The
      readings at 1920x1080, at a zoom of 4,000 light years and then of 2,000: the core mean
      is 0.652 and 0.662, its point luminance 0.684 and 0.673, its point blue 163 and 161 of
      255; the dark mean is 0.058 and 0.050, its point luminance 0.045 and 0.041, its point
      blue 16 and 15 of 255. Both views hold 15 crossing labels at 2,000 light years and a
      line of the label level at 4,000. The table sits beside the views in
      `e2e/grid.spec.ts`.
- [x] 3.5 Verify the scenario "The bold level reads over the galactic core" at its new bound
      of 4 of 255, by changing `toBeGreaterThanOrEqual(12)` at `e2e/grid.spec.ts:477`, the last
      line of the test `reads over the galactic core` at line 447, to 4. That test is the one
      grid pixel test that runs with the scene **on**, so it is the one the merge moves; the
      tests at lines 407, 432, 480 and 900 run under `SCENE_OFF`, where the merge is 0 and the
      weight is exactly 1. The predicted reading is about 9, from a level alpha of 0.45, a floor of
      0.30 and a tinted colour of (248, 203, 160) over a core of (244, 235, 226).
- [x] 3.6 Verify the existing scenario "A line is antialiased" still passes unchanged, the
      scenario "The overlays draw over the grid" at its new zoom of about 8,000 light years,
      which task 3.7 moves it to, and the new scenario "The grid draws under a marker", which
      is the marker half of the same test left where it is. Re-verify the two scenarios of the
      unmodified requirement "The grid draws every decade level on the cursor's plane" that
      read drawn grid pixels and now carry the merge as well: "A coarse line draws bolder than
      a fine one" and "A crossing is no brighter than its lines". Both should hold, since the
      merge is one multiplier at one background and it changes neither ordering, but neither
      has an owner otherwise.
- [x] 3.7 Move the **boundary** half of the existing test `draws under the marker and the
      region boundary` in `e2e/grid.spec.ts` and leave the **marker** half where it is, at its
      `d=1000` view: the grid band is full there, the background over that view is dark, and
      the merge is inert, so the marker reading does not move. Change the boundary assertion
      from `Math.abs(withGrid[c] - lines[c]) <= 2`, which reads the boundary colour exactly, to
      the reading the scenario now states, which is the only form that holds the **order**:
      read the rectangle in **four** frames, with neither overlay, with the grid alone, with
      the boundary alone and with both; take the crossing pixel as the one whose grid
      contribution times boundary contribution is largest, and the comparison pixel as the
      nearest pixel with the same grid contribution within a tenth and no boundary
      contribution; and assert that `withGrid - lines` at the crossing is between 0.45 and 0.85
      of `gridOnly - without` at the comparison pixel, on the channel that carries the largest
      grid contribution. The predicted ratio is 0.643, which is `1 - 0.55 * regionFade(8000)`.
      Neither the old assertion nor a distance between the crossing pixel and the two frames
      reads the order: both put the grid's contribution on one side and the boundary's on the
      other, so they compare the strength of the two overlays and pass at either order. The boundary half reads at a zoom of **6,000**
      light years today and
      asserts a gap above 20. The overlay's opacity there falls from 0.42 to
      `0.55 * regionFade(6000)`, which is 0.057, about a seventh of what it was, and the gap
      falls with it. Move the reading to about **8,000** light years, where the grid band
      leaves 0.50 and the overlay's opacity is 0.357, which is the best the two bands give
      together, and re-measure the bound rather than keeping 20 by assumption.

## 4. The coordinate labels merge with the background

- [x] 4.0 Add an accessor on the renderer that gives the read-back reading of the frame
      before, as the width, the height and a `Uint8Array` of RGBA, and hand it to
      `gridLabels.update(...)` at
      `src/app/create-map.ts:657`. This is the one edit `create-map.ts` takes: the region
      labels need none, because `labelFade` already gates the sweep and the opacity.
- [x] 4.1 Pass the reading of the frame before into `GridLabelFrame`, as the width, the
      height and a `Uint8Array` of RGBA, and read it at the centre of each label box in
      `src/app/grid-labels.ts`. Verify with a unit test that a box centre outside the
      reading falls back to the weight at luminance 0, which is 1.
- [x] 4.2 Set each label's opacity to `0.80 * gridBackgroundWeight(L, 0.45)` and its colour
      to `mix(rgb(255, 196, 140), background, gridBackgroundTint(L, 0.35))`, through
      `setStyle` so a still frame writes nothing. Verify a unit test counts the style writes
      over two frames with the same reading and finds none in the second.
- [x] 4.3 Replace the hard black text shadow with `0 0 10px rgba(12, 6, 2, 0.75)` and
      `0 1px 2px rgba(12, 6, 2, 0.55)`. Verify a unit test reads the element style and finds
      no `#000` and no `rgb(0, 0, 0)`.
- [x] 4.4 Verify the browser scenario "A label recedes over a bright background", and that
      the existing label scenarios "A crossing label reads its own coordinates", "The label
      count is capped", "The plane label reads the cursor's height", "The labels go with the
      switch" and "The label level follows the zoom" still pass.

## 5. The grid budget

- [x] 5.1 Verify the scenario "The grid costs under a millisecond of draw time" at a pitch
      of 5 and of 89 degrees, with the background reading in the path. Four halvings from
      full resolution read about 1.33 frames of texels, so this is the task that decides the
      chain. If it does not fit inside 1 ms, take the first reduction as a sparse bilinear
      sample at a quarter size, which the design's decision 1a states, and measure again. That
      leaves three steps and not four; the requirement's chain bullet is written to cover both,
      so it needs no edit, but the task list SHALL record which one was taken.
      Do **not** take the glow pass's quarter target: it is clamped at 0.01 scene luminance,
      so every bright background reads the same there.
      **The four halvings from full resolution were taken.** The reading fits inside the
      bound with room to spare. `the grid draws inside its budget` measured, with the
      reading in the path, 0.957 ms with the grid off against 1.029 ms with it on at a pitch
      of 5 degrees, and 0.666 ms against 0.736 ms at a pitch of 89 degrees. That is 0.071 ms
      and 0.069 ms against the 1 ms bound, so decision 1a's sparse first reduction was not
      needed. The tone map that now runs at full resolution before the chain is inside the
      noise of this instrument: the same test read 0.056 ms and 0.077 ms with the tone map
      at the end of the chain, and 0.072 ms and 0.055 ms with it at the front in the
      experiment that chose the order.
- [x] 5.2 Verify the scenarios "The grid labels hold the frame rate" and "Reading the
      background back does not stall the frame": a mean interval of 18 ms or less over 120
      moving frames, with no single interval above 33 ms.
      Both read a mean of 16.666 ms and a worst of 16.800 ms over 120 frames, with 9 labels
      on the frame of the first. The new test
      `reading the background back does not stall the frame` in `e2e/frame-budget.spec.ts`
      moves the cursor by 20 light years in each of its 120 frames and checks
      `backgroundSize()` reads 120 by 68 first, so the read is in the path it measures.

## 6. The region overlay: the zoom band

- [x] 6.1 Replace `regionFade` in `src/render/region-pass.ts` with
      `smoothstep(5000, 10000, d) * (1 - smoothstep(20000, 30000, d))`, and add
      `REGION_CLOSE_NONE = 5000` and `REGION_CLOSE_FULL = 10000`. Name them for what they
      hold and not by analogy with `REGION_FADE_IN_NEAR` and `REGION_FADE_IN_FAR` beside
      them, whose sense runs the other way. Verify with a unit test at 4,000, 5,000, 7,500,
      10,000, 20,000, 25,000 and 30,000 light years. Rewrite the existing test
      `does not fade out at close zoom` at `src/render/region-pass.test.ts:132`, which asserts
      `regionFade(3000)`, `regionFade(1500)` and `regionFade(500)` are each 1 and which the
      new fade makes each 0, and rename it for what it now measures.
- [x] 6.2 Delete `REGION_NEAR_FADE_NONE`, `REGION_NEAR_FADE_FULL`, `regionNearFade`, the
      `uNearFade` uniform, the green channel of the coverage buffer and the near fade read
      in `region-composite.frag`. In `src/render/region-pass.test.ts`, delete
      `describe('the near fade')` at lines 152 to 181 **whole**: its three tests, `draws
      nothing at 200 light years and below`, `draws in full at 1,500 light years and above`
      and `rises smoothly between the two distances`, hold nothing but assertions on the three
      deleted names, so three tests go and not three assertions. Verify a unit test finds no `uNearFade` in either
      shader source, and that `createRegionPrograms` declares no such uniform. Do not sweep
      the tree for the three names here: `tests/region-views.ts` at lines 18, 813 and 814 and
      `tests/region-views.test.ts` at lines 6, 328 and 329 still hold them until task 8.1
      deletes `findFadingRun` and `FADING_RUN`. Task 8.1 carries the sweep.
- [x] 6.3 Give `labelFade` in `src/app/labels.ts` the same near end `regionFade` takes, by
      importing `REGION_CLOSE_NONE` and `REGION_CLOSE_FULL` from `src/render/region-pass.ts`.
      The sweep gate and the element opacity already read `labelFade` and SHALL NOT be
      duplicated in `create-map.ts`. Verify with a unit test at 4,000, 5,000, 7,500 and
      10,000 light years, and change `expect(labelFade(500)).toBe(1)` in
      `src/app/labels.test.ts` to `toBe(0)`. Rename the test that holds it,
      `follows the fade in of the lines and does not fade out` at `src/app/labels.test.ts:444`,
      which no longer says what it checks.
- [x] 6.4 Verify the scenario "The sweep does not run below the band", which reads
      `labelSampling()`'s `frames`, `meanMs` and `worstMs` and needs no new probe. The counter
      is cumulative, so call `resetLabelSampling` after the view is set and before the reading,
      as `e2e/labels.spec.ts:369` does; without it an earlier frame leaves the count above 0. Rewrite the
      existing test `the region the camera is inside is named at every zoom` at
      `e2e/labels.spec.ts:209`, whose distances are 20,000, 10,000, 4,000, 1,000 and 500 and
      which asserts a label at each: the new distances are 20,000, 15,000, 10,000, 7,500 and
      4,000, and the assertions change with them, including the opacity band of 0.2 to 0.8 at
      7,500 and no label at all at 4,000.
- [x] 6.5 Verify the scenario "Nothing at the far view", and rewrite the existing test
      `the boundary still draws at the closest zoom` at `e2e/regions.spec.ts:439`, which fails
      outright, into the scenario "The boundary draws in full at the close end of the band":
      the overlay draws at 10,000 light years in both modes and adds nothing at 4,000.
- [x] 6.6 Rewrite the existing test `the boundary fades out as the camera comes near` in
      `e2e/regions.spec.ts`, whose `FADE_DISTANCES` are 1,500, 500 and 150 light years and
      which now reads three zeros. Keep it reading `NEAR_BOTH_SETS`, which is the view the
      scenario names and the view task 8.2e buys the 20 CSS pixel clearance for. The generator
      rewrites that constant's value under the new premises, so read the constant and do not
      copy its coordinates into the test. Change the
      distances to **12,000, 7,500 and 5,000** and the
      assertion to the scenario "The overlay fades out across the close end of the band":
      falling readings, and none at 5,000. Rename the test for what it now measures.
- [x] 6.7 Move the **two** region label tests in `e2e/labels.spec.ts` that open three views
      at 500 light years to **12,000**: `a region with nothing on screen carries no label` at line
      222, `the camera keeps the label of the region it sits in when it turns away` at line
      238, and any other `d=500` view in that file. The second one asserts the exact list
      `['Inner Orion Spur']`, which the wider frame changes; rewrite it to the scenario "The
      camera keeps the label of the region it sits in when it turns away", which now measures
      the shares in the test rather than writing them in.
- [x] 6.8 Move the test `the accurate region mode is under budget at the closest zooms` in
      `e2e/frame-budget.spec.ts`, which measures at 500 and 10 light years, to **5,200 and
      10,000**, and correct its comment, which says the views are "inside the band where the
      overlay draws in full". Task 8.5's reading at 5,200 belongs to this test, so do the two
      together and leave one test, not two.

## 7. The region overlay: one soft band through a blur

- [x] 7.1 Change the coverage target to `R8` and keep it at the **full** drawing buffer size.
      Change `REGION_LINE_WIDTH_CSS` from 4 to **6**, so the ribbon quad's half width is 3 CSS
      pixels and covers the ramp `max(0, 1 - gap / 3)` without cutting it. Verify
      `coverageSize()` reports the full drawing buffer in a browser test, and a unit test that
      the quad's half width and the ramp's denominator are the same number. The browser test
      reads the pass through a new `debug.regionCoverageSize()`, which the requirement names,
      because the pass itself is not on the handle. Update the
      existing test `follows the drawing buffer size` at `src/render/region-pass.test.ts:245`,
      which asserts `gl.RG8` and `gl.RG` and counts exactly one `texImage2D` call on a resize:
      the format is now `R8` and `RED`, and the ping-pong pair of task 7.2 adds two more
      targets to the count. Do **not** touch the assertions at
      `src/render/region-pass.test.ts:215` and `:228`, which hold `REGION_LINE_OPACITY` at 0.42
      and `REGION_LINE_WIDTH_CSS` at 4. Both values change, but both lines sit inside blocks
      that task 7.6 deletes whole, so there is nothing there to update.
- [x] 7.2 Add `src/render/shaders/region-blur.frag`, a **new** shader: one channel, a
      variable standard deviation, step and tap count, no weight and no tint. The pair takes
      its storage only in a frame that blurs, so `simplified` holds one full-resolution
      target and not three. Verify it with a unit test that counts `texImage2D` over a run
      of draws in each mode. Do **not** edit
      `blur.frag`, which is fixed at nine taps with `SIGMA = 2.0`, carries the haze tint and
      feeds the glow, whose baseline image task 9.3 holds byte-identical. Add the two passes
      over a ping-pong pair of full-resolution `R8` targets, with a Gaussian of standard
      deviation `radius / 3` CSS pixels sampled one **CSS pixel** apart and
      `2 * ceil(radius) + 1` taps, which reaches 17 at the largest radius of 8 and never
      passes it. Give the coverage target a **linear** filter, which the step needs at a
      device pixel ratio above 1. Verify with a unit test over the tap count at radii of 3,
      3.85, 4.62, 5.77 and 8, at device pixel ratios of 1 and 2, which must not change it, and over
      the kernel's sum, which must be 1 within 1e-6.
- [x] 7.2a Add `focalCss` and the camera's `distance` to `RegionPassFrame` at
      `src/render/region-pass.ts:106-121`, which carries neither today, and pass them from
      `renderer.ts`, which already holds `focalCss` at `src/render/renderer.ts:524`. The blur
      radius of task 7.3 reads both. Verify with the unit test of task 7.3, which calls the
      rule through the frame.
- [x] 7.3 Add `regionBlurRadiusCss(focalCss, distance, traced)`:
      `min(focalCss * 49.3494 / distance, 8)` when traced, and 0 otherwise, with the pass
      skipping the blur below **3 CSS pixels**. The radius is the whole cell, not a part of
      it. Verify with a unit test that at 1,080 CSS rows the radii are 8 at 5,770 and below,
      5.77 at 8,000, 4.62 at 10,000 and 3.85 at 12,000, that the blur runs below about 15,390
      and not above it; that at 720 rows the radii are 5.13 at 6,000, 3.85 at 8,000 and 3.08
      at 10,000 and the threshold is about 10,260; that the blur therefore runs at **both**
      heights over the whole close part of the band, from where the fade first leaves above 0.1
      of the opacity at about 5,980 light years up to the threshold, which is past the 10,000
      the fade reaches full opacity at; and that `simplified` never blurs. The blur does not
      run above the threshold, where the cell is under 3 CSS pixels, and the requirement does
      not ask it to.
- [x] 7.4 Add `regionBlurPeak(radiusCss, halfWidthCss)`, which takes no device pixel ratio,
      because the normalisation is a reading of the continuous ramp. It sums the same
      discrete kernel the shader uses against the continuous ramp, pass it to the composite as
      `uPeak`, divide the blurred coverage by it and clamp the `smoothstep` at 1. Verify with a
      unit test that the peak reads 0.758, 0.679, 0.613, 0.530 and 0.411 at radii of 3.00,
      3.85, 4.62, 5.77 and 8.00 CSS pixels, within 0.005, and 1 where the blur does not run.
- [x] 7.5 Verify the unit scenario "The blur keeps a straight run and rounds a corner": build
      both coverage fields point-sampled on a device pixel grid, blur and normalise at radii
      of 3.00, 3.85, 4.62, 5.77 and 8.00 CSS pixels, and read the peaks and the half-maximum
      contours
      over **twelve sub-pixel phases** of the line. Every reading must fall inside the table
      the requirement states, and the normalised peak must stay between 0.91 and 1. Measure
      the corner's departure against a **sharp corner of the same width**, as the scenario
      states, and not against the unblurred corner: the reference contour is the one a sharp
      corner holds at the blurred straight run's own half-maximum half width. State the
      method in a comment in the test.
- [x] 7.6 Replace the two tones in `region-composite.frag` with one: `REGION_TONE` of
      `(0.86, 0.74, 0.60)`, whose luminance is 0.755, `REGION_LINE_OPACITY` of 0.55, a
      coverage ramp of `max(0, 1 - gap / 3)` in the ribbon step and an alpha of
      `smoothstep(0, 1, coverage / uPeak)` in the composite, which clamps at 1 and gives the
      band a flat top. Verify with a unit test that the largest normalised reading near a 90
      degree corner is 1.04, 1.07, 1.10, 1.13 and 1.15 of a straight run's at radii of 3.00,
      3.85, 4.62, 5.77 and 8.00, within 0.01, so the clamp has something to hold. The reading
      is about one CSS pixel inside the turn and not at the apex, which sits a little under the
      straight run. Verify the scenario "A 90 degree corner of the traced set is not
      brighter than its line", which is the one browser reading of the clamp, at **1920x1080**
      at a zoom of **10,000 light years**, where the radius is 4.62 and the blur runs. At
      1280x720 and 12,000 light years the blur does not run and the reading would check
      nothing the change added. Delete `REGION_CORE_COLOUR`,
      `REGION_OUTLINE_COLOUR`, `REGION_CORE_WIDTH_CSS`, `regionCoreLevel` and
      `REGION_EDGE_SOFT_PIXELS`, and with them the two blocks of
      `src/render/region-pass.test.ts` those constants exist for: `describe('the washed
      tones')` at lines 183 to 224, which holds three tests, and `describe('the two-tone
      line')` at lines 226 to 242, which holds two. Five tests go, not two assertions. Verify
      no file still names the deleted symbols.
- [x] 7.7 Verify the scenarios "The line is one tone and lightens what it crosses" and "The
      blurred band is wider than the unblurred one", both at **1920x1080** at a zoom of
      **10,000 light years** over each mode's own crossing view. `simplified` reads the
      unblurred band at 3.0 to 3.5 CSS pixels; `accurate` blurs at a radius of 4.62 and reads
      4.6 to 4.9. One view pair and one zoom serve both scenarios, so read the two rows once.
      `e2e/regions.spec.ts` sets 1280x720 at module scope at line 17, so every task here that
      names 1920x1080 needs its tests inside a `test.describe` with its own `test.use`; tasks
      7.6, 7.7, 8.3 and 8.5 read 1920x1080 and task 8.4b stays at 1280x720. Task 8.3 needs it
      most: at the module-scope 1280x720 one CSS pixel is 19.25 light years instead of 12.83,
      the join's 20 CSS pixel clearance falls to 13.3, and its comparison run starts inside the
      12 CSS pixel window the reading excludes.
- [x] 7.8 Verify the scenario "A boundary is visible at medium zoom".

## 8. The region view constants

- [x] 8.1 Delete the search, the constant and the test for the view of "One line fades along
      its own length" from `tests/region-views.ts`, `tests/region-views.test.ts`,
      `e2e/region-views.ts` and `e2e/regions.spec.ts`. That scenario went with the removed
      requirement. It is the last user of `regionNearFade`, so verify here that no file names
      it, `REGION_NEAR_FADE_NONE`, `REGION_NEAR_FADE_FULL` or `FADING_RUN` any more; task 6.2
      leaves that sweep to this task.
- [x] 8.2 Move every remaining search in `tests/region-views.ts` to a zoom of 10,000 light
      years or more, and copy each search's output by hand into the constants of
      `e2e/region-views.ts`, which `tests/region-views.test.ts` then asserts the search against.
      There is no generator; the unit test is what holds the two together. The four views the
      constants file carries sit at 1,875, 1,600, 1,600 and 3,000 light years today.
- [x] 8.2a Rewrite `findVerticalCrossing` at `tests/region-views.ts:133-235` to the premises
      the requirement now states. Today it derives the zoom from the run
      (`run.length * 0.7 / (2 * tan 30)` at line 166), which puts a ceiling of about 2,300
      light years on it, because the longest straight run is 3,800 light years in the smoothed
      set and 3,306 in the traced one, and a 10,000 light year frame is 11,547 tall. Take the
      **zoom as a parameter**; hold at least **100 CSS pixels** of the run above and below the
      reading row in place of the whole-frame crossing; replace the `radius > 16000` premise at
      line 197, which existed for the dark outline this change removes, with a floor of
      **5,000 light years** from the galactic centre, which keeps the reading off the core; and
      **keep** the clearance at line 189 at 60 CSS pixels. Run the search **once for each set**
      and hold one crossing view for each in `e2e/region-views.ts`, because a near-vertical
      straight run of the smoothed set is not one of the traced staircase. `VERTICAL_CROSSING`
      at `e2e/region-views.ts:125` becomes two exports, one per set; rename its three readers
      with it: `e2e/regions.spec.ts` at lines 13, 545 and 552, and
      `tests/region-views.test.ts` at lines 12 and 67 to 118, whose block reads the constant 17
      times. Measured at
      1920x1080 and 10,000 light years, where one CSS pixel is 10.69 light years: 282 smoothed
      runs and 2 traced runs cover the reading row, 24 smoothed and 2 traced also clear 60 CSS
      pixels, the best smoothed run is 346 CSS pixels long and clears 174.0, and the best
      traced run is 309 long and clears 154.6. The nearest of them to the galactic centre sits
      at 15,633 light years, so the radius floor rejects none of them.
- [x] 8.2b Update the premise tests of the **crossing** search in `tests/region-views.test.ts`.
      The block at lines 96 to 102, which is a comment and two assertions inside the test
      `crosses within 5 degrees of vertical` and not a test of its own, becomes a check that
      the run covers the reading row by 100 CSS pixels each way; the clearance check keeps its
      60 CSS pixels; and a new check holds the 5,000 light year radius floor. The premise tests
      of the other three searches belong to task 8.2g.
- [x] 8.2c Give `findTracedCorner` the zoom and the viewport its scenario names, in place of
      its `const distance = 1600`, and restate its constants in CSS pixels: `TRACED_ARM_LY =
      160` becomes **48 CSS pixels**, which is 513 light years at 1920x1080 and 10,000 light years,
      and not 20: the run's far end reaches 40 CSS pixels from the node, so an arm of 20 would
      put the comparison past the next node and off the drawn line;
      `TRACED_RUN_FROM_LY = 60` and `TRACED_RUN_TO_LY = 140` become 12 and 40 CSS pixels, which
      are 128 and 428 light years there; `TRACED_BEND_REACH_LY = 12` at
      `tests/region-views.ts:535`, which builds the `bendLine` the reader classifies a pixel
      against, becomes **6 CSS pixels**, the corner's own reading radius, which is 64 light
      years there; the clearance of 150 becomes 20 CSS pixels, which is 214; and the search takes its own copies of the neighbourhood arc and the fold reach, 16
      and 12 CSS pixels, because `NEIGHBOUR_ARC_LY` is shared with `findSharpCorner`, which
      reads at a different zoom. 60 light years is 5.6 CSS pixels at that zoom, inside the 6
      CSS pixel read radius task 8.3 names, so the comparison run would sit in the reading
      window. Replace the `radius > 16000` premise at `tests/region-views.ts:582` with the same
      **5,000 light year floor** task 8.2a gives the width search; it is there for the dark
      outline this change removes. Measured over the real data at those figures, **10** nodes
      hold every premise and the first of them clears 3,306 light years, which is 309.3 CSS
      pixels, with arms of 3,306 and 543. With the old ceiling kept instead of the floor the
      count is 1, so the premise has to be stated and not assumed.
      `TRACED_BEND_REACH_LY` is what keeps the reader's own bound: left at 12 light years it is
      1.12 CSS pixels at the new zoom, the `bendLine` is an L about 2.2 CSS pixels end to end,
      and `readJoin`'s `insideCount` at `e2e/regions.spec.ts:682-687` reads 3 to 8 over the
      sub-pixel phases, against `toBeGreaterThan(8)` at line 728. At 6 CSS pixels it reads 11
      to 24, so that assertion needs no change.
- [x] 8.2d Give `findSharpCorner` the zoom and the viewport its scenario names, in place of
      its `const distance = 1600`, and restate its four light year constants in CSS pixels: the
      clearance of 150 becomes 20 CSS pixels, `NEIGHBOUR_ARC_LY = 60` becomes 16, the fold
      reach of 30 becomes 12, and the comparison run window of 40 to 200 light years becomes 16
      to 40 CSS pixels with a least length of 8. At the scenario's own 1920x1080 and 12,000
      light years one CSS pixel is 12.83 light years, so the old window of 40 to 200 light
      years is 3.1 to 15.6 CSS pixels. It starts inside the 12 CSS pixel exclusion the reader
      applies at `e2e/regions.spec.ts` (`toBend > JOIN_RADIUS * 1.5`) and leaves only 3.6 CSS
      pixels of usable run, which is too little for `straightChange` to read. Measured over the real data, **6,713** bends
      hold every premise at 1920x1080 and 12,000 light years.
- [x] 8.2e Raise `BOTH_SETS_CLEARANCE_LY` at `tests/region-views.ts:455` from 200 to a
      clearance of **20 CSS pixels**, which is 385 light years at 1280x720 and 12,000 light
      years, the largest zoom the fade scenario reads the view at. 200 light years is 10.4 CSS
      pixels there. A neighbouring band is 6 CSS pixels wide, so at 10.4 its near edge sits 7.4
      CSS pixels from the centre, inside the 8 CSS pixel window that scenario reads; at 20 CSS
      pixels the same edge sits at 17. Replace the `radius > 16000` premise at
      `tests/region-views.ts:495` with the same **5,000 light year floor**, for the same reason
      as tasks 8.2a and 8.2c. Measured over the real data, **4,613** points hold the new
      premises, and the one the search keeps, which is the one on the longest traced segment,
      clears **3,578** light years, or 186.0 CSS pixels. The search walks the segments in order
      and keeps only a longer one than it holds, so it improves its best four times over those
      4,613; four is not the premise count. With the old ceiling kept, 474 points hold and the
      search keeps the committed `NEAR_BOTH_SETS`, clearing 1,653.2 light years, which already
      passes the raised clearance; so the clearance alone moves no view and the floor is what
      moves it.
- [x] 8.2f Give `readJoin` at `e2e/regions.spec.ts:622` the reading radius from the view it is
      given, in place of the module constant `JOIN_RADIUS = 8` at line 52, which it reads at
      lines 636, 639, 645, 648, 682 and 693. `findSharpCorner` keeps writing
      `reachPixels: JOIN_REACH_PIXELS`, which is 8, and `findTracedCorner` SHALL write **6**,
      which is the radius its scenario states. The window each reading excludes,
      `reach * 1.5`, then follows: 12 CSS pixels for the join and 9 for the traced corner, both
      under the near end of their own comparison run.
- [x] 8.2g Update the premise tests of the three searches tasks 8.2c, 8.2d and 8.2e restate,
      in `tests/region-views.test.ts`. Every one of them holds an old window as a CSS pixel
      bound, and four of them fail outright under the new premises:
      `holds a straight run of the same chain inside the frame` at lines 176 to 179, for the
      join, where `run / perPixel` above **30** becomes at least **8**, because the new window
      of 16 to 40 CSS pixels gives a run of 8 to 24;
      the run ends at lines 182 to 185, for the join, where above `JOIN_RADIUS_PIXELS * 2`,
      which is 16, becomes at least **16**, the near end of the new window and above the 12 CSS
      pixels that reading excludes;
      `carries no other chain near the reading` at lines 195 to 198, for the join, where above
      `JOIN_RADIUS_PIXELS * 4`, which is 32, becomes above **20**, the new clearance;
      `holds a line across the frame at the closest zoom` at lines 212 to 217, where the
      clearance above **200** becomes above **385**, and the comment, which describes a zoom of
      10 light years, becomes the 12,000 the fade scenario reads at;
      `puts each arm at more than 20 CSS pixels` at lines 235 to 246, where **20** becomes
      **48**, and the test's name with it;
      `holds a straight run of the same chain inside the frame` at lines 249 to 252, for the
      traced corner, where above **30** becomes at least **28**, which is 40 less 12;
      the run ends at line 255, for the traced corner, where above `JOIN_RADIUS_PIXELS * 2`,
      which is 16, becomes at least **12**, the near end of its window and above its own
      reading radius of 6;
      and `carries no other chain near the reading` at lines 267 to 270, for the traced corner,
      where above 32 becomes above **20**.
      `JOIN_RADIUS_PIXELS` no longer serves both searches, so each test SHALL read the radius
      from its own view, as task 8.2f gives it.
- [x] 8.2h Rewrite the header comments of the two view files, which list the views they hold
      and the premises the searches take. `tests/region-views.ts` at lines 3 to 9 names the
      fading run task 8.1 deletes and does not know of the second crossing view; the header of
      `findVerticalCrossing` at lines 129 to 131 still derives the zoom from the run; and the
      header of `findTracedCorner` at lines 537 to 550 still says "both arms longer than 160
      light years, so each one is more than 20 CSS pixels", "the same 1,600 light year zoom,
      where one CSS pixel covers 2.57 light years", and that the camera "is above the near fade
      band", which this change removes. `e2e/region-views.ts` at lines 3 to 8 carries the same
      list of five views.
- [x] 8.2i Verify that `e2e/region-views.ts` now holds a view for each of the corner, the join,
      the two crossings and the on-a-chain scenario, and no more. This runs after tasks 8.2c to
      8.2e, which rewrite three of those four searches.
- [x] 8.3 Verify the scenarios "A join is not brighter than the line" and "A 90 degree
      corner of the traced set is not brighter than its line" at their new views, with the
      join read radius at 8 CSS pixels and the corner read radius at 6, which task 8.2f wires
      through the view.
- [x] 8.4 Add `region-blur.frag` to the shader compile test at `e2e/regions.spec.ts:369`,
      which compiles `regions.frag` and `region-composite.frag` today. Move
      `MEDIUM_DISTANCE = 10000` at `e2e/regions.spec.ts:20` to 15,000, which task 7.8's
      scenario now reads at, and replace the loop at `e2e/regions.spec.ts:541` that builds
      the tests named `the <mode> line is four CSS pixels wide and two-toned` with the two
      width scenarios task 7.7 names.
- [x] 8.4b Verify the scenario "Each mode draws its own frame" at **1280x720** at a zoom of
      12,000 light years, by changing `MODE_COMPARISON_VIEW` at `e2e/regions.spec.ts:44-49`,
      whose `distance` is 2,000 today. The new fade draws nothing there, so all three digests
      would match and the failure would read as a mode fault and not a zoom fault. Verify the
      rest of `e2e/regions.spec.ts` with it, including "The off mode removes both parts", "The
      mode changes without a rebuild", "The labels do not follow the mode" and "A bad mode
      changes nothing".
- [x] 8.5 Verify the scenario "The overlay costs under a millisecond" at 1920x1080 in
      `accurate` at a zoom of **5,200** light years, where the cap holds the blur radius at
      its largest of 8 CSS pixels and the kernel at its widest of 17 taps. This is the reading task 6.8 moves the existing frame
      budget test to, so the two make one test and not two.

## 9. The look against the reference

- [x] 9.1 Take a screenshot of the map at a zoom of 3,000 light years with the grid on over
      the bright disc, and one over the dark space between the arms. Sample both numerically
      and check the grid's addition against `GRID_LINE_MERGE_FLOOR`,
      `GRID_BG_LOW` and `GRID_BG_HIGH`. Adjust those three numbers alone if the reading
      does not match the intent, and record the readings.

      **The reading matches the intent, so the three numbers do not move.** Measured at
      1920x1080 at a device pixel ratio of 1, at a zoom of 3,000 light years, over the two
      views the grid scenarios open: the cursor at `0, 0, 20000` for the core and at
      `-40000, 0, 20000` for the dark space. Each view gave a frame with the grid off and a
      frame with the grid on, and the readings below are of those pixels.

      | reading | core view | dark view |
      | ------- | --------- | --------- |
      | mean luminance of the background reading | 0.6581 | 0.0545 |
      | luminance of the texel under the reading point | 0.6814 | 0.0446 |
      | blue of that texel | 162 of 255 | 16 of 255 |
      | weight from `gridBackgroundWeight` | 0.3000 | 1.0000 |
      | change on a line of the label level | 15 of 255 | 110 of 255 |
      | that change, channel by channel | -4, -10, -15 | +110, +64, +19 |

      The core texel reads 0.6814, above `GRID_BG_HIGH` of 0.55, so the weight is exactly
      `GRID_LINE_MERGE_FLOOR`. The dark texel reads 0.0446, below `GRID_BG_LOW` of 0.08, so
      the weight is 1. The two edges therefore bracket the pair the look was written for, and
      neither view sits on the ramp between them.

      The drawn ratio is **0.1364**, inside the 0.02 to 0.20 the scenario "The grid recedes
      over a bright background" states, and the same figure that scenario measured at 4,000
      light years. The core line still moves a channel by 15 of 255, above the 4 of 255 the
      scenario "The bold level reads over the galactic core" holds. Over the core no channel
      rises and blue falls the most; over the dark space every channel rises and red rises
      the most, which is what the tint does. The reference image holds no coordinate grid, so
      the check is against the three constants and not against a picture.
- [x] 9.2 Take a screenshot at **1920x1080** at a zoom of **10,000 to 12,000 light years** in
      `accurate` over a 90 degree corner, where the fade is full and the blur still runs, so
      the band is readable. 6,000 light years is not a reading: the fade leaves 0.104 there
      and the band draws at 0.057 opacity. Check the band's width, its tone and the rounding,
      adjust `REGION_TONE`, `REGION_LINE_OPACITY`, the cap of 8 CSS pixels and the 3 CSS pixel
      blur threshold alone if needed, and record the readings. The blur factor of 0.7 is gone;
      the radius is the whole cell.

      **The reading matches the intent, so none of the four numbers moves.** Measured at
      1920x1080 at a device pixel ratio of 1, in `accurate`, at the view `TRACED_CORNER` of
      `e2e/region-views.ts`: the cursor at `400.73, 0, -4760.04`, a zoom of 10,000 light
      years, a yaw of 0 and a pitch of 89. The blur radius there is **4.616 CSS pixels**,
      which is the whole cell of 49.3494 light years at a focal length of 935.31 CSS pixels.
      The radius is above the threshold of 3 and below the cap of 8, so the blur runs and
      neither bound acts. The coverage buffer reads 1920 x 1080, which is the full drawing
      buffer. The frame with the overlay off and the frame with it on gave the readings
      below. The alpha is `(on - off) / (tone - off)`, channel by channel.

      | reading | the arm at constant z | the arm at constant x |
      | ------- | --------------------- | --------------------- |
      | peak alpha | 0.5454 | 0.5461 |
      | half maximum width, CSS pixels | 4.654 | 4.651 |
      | alpha at the peak, channel by channel | 0.5455, 0.5479, 0.5426 | 0.5449, 0.5472, 0.5462 |
      | spread of the three | 0.0053 | 0.0023 |

      The peak alpha holds `REGION_LINE_OPACITY` of 0.55, because `regionFade(10000)` is 1
      and the normalised coverage reaches 0.94 of its own peak. The width sits inside the
      4.68 to 4.88 the table states for a radius of 4.62, within the 0.05 CSS pixel tolerance
      the requirement gives it. The three channel alphas agree to 0.0053, which shows the
      drawn colour is `REGION_TONE` and nothing else: a tone that differed would give three
      different alphas. The band lightens what it crosses, from (59, 51, 60) to (146, 126,
      111).

      The corner: the largest alpha near the 90 degree node is 0.5491, which is **1.0054** of
      the arm's own peak, inside the 3 per cent the corner rule allows. The band's outward
      half maximum contour sits **1.729 CSS pixels** from the node, against **2.327** for the
      arm's own half width, so the corner draws as a round turn and not as a square one. The
      reference image holds no region boundary, so the check is against the four constants
      and not against a picture.
- [x] 9.3 Verify no other look constant of the far view moved: run
      `pnpm test:e2e e2e/look.spec.ts` and confirm the baseline image is byte-identical.

      `pnpm test:e2e e2e/look.spec.ts` gives **24 passed**. The committed baseline image is
      unchanged on disk. The frame the default view draws was also compared to that baseline
      pixel by pixel: 1280 x 720 in both, **0 of 3,686,400 bytes differ**. The far view is
      therefore byte-identical and no look constant of it moved.

## 10. The documents and the close

- [x] 10.1 Update `docs/roadmap.md`: a phase entry for this change, the grid's background
      reading beside the phase 4.1 grid facts, the region band and the blur beside the phase
      3.1 region facts, and the reversal of the near fade recorded where phase 5 records it.

      Four edits. "Phase 5.1: the overlay blend and the position precision" holds the phase
      entry, before "Sources". Phase 4.1 gains "Phase 5.1 gives the grid a background
      reading", with the draw times of task 5.1. Phase 3.1 gains "Reversed again: the overlay
      draws inside a zoom band, as one soft band", under the bullet that records the near
      fade. Phase 5's own near fade bullet now says that this change removes the fade and
      returns the coverage buffer to one channel.
- [x] 10.2 Update `README.md` lines 147 to 151, which describe `simplified` and `accurate` as
      drawing a boundary and name **no** zoom band. Add the band: nothing below 5,000 light
      years, full from 10,000 to 20,000, nothing above 30,000, with the region name in the top
      bar at every zoom. Also state the grid's merge with the background. Verify no sentence
      names the 200 to 1,500 light year near fade.

      The region mode paragraph gains a paragraph that states the band, the one warm cream
      band, the labels in the same band, the top bar below the band, and the blur in
      `accurate`. The `grid` option paragraph gains a paragraph that states the merge with
      the background. A search of the file for "200 light years" and for "1,500" finds
      nothing, so no sentence names the near fade.
- [x] 10.3 Verify the archive order: `library-datasets-and-publishing` archives first. Run
      `openspec validate overlay-blend-and-precision` and confirm it is clean.

      `library-datasets-and-publishing` is archived, as
      `openspec/changes/archive/2026-09-15-library-datasets-and-publishing`, so its text is
      the main spec and this change waits on nothing. `openspec validate
      overlay-blend-and-precision` gives "Change 'overlay-blend-and-precision' is valid".
      `openspec validate --all --strict` gives 15 passed, 0 failed, with only the "requirement
      text is very long" notes the tree already carries.
- [x] 10.4 Run `pnpm lint`, `pnpm build`, `pnpm build:demo-site`, `pnpm test` and
      `pnpm test:e2e`, and verify every one is clean before the implementation gate.

      Each ran on its own, in that order. `pnpm lint` reports nothing. `pnpm build` passes the
      type check and writes `dist/index.js` at 183.37 kB with the HUD chunk at 46.38 kB.
      `pnpm build:demo-site` transforms 109 modules and writes `dist-demo/`. `pnpm test`
      gives **58 test files passed, 594 tests passed**. `pnpm test:e2e` gives **324 passed**
      in 17.8 minutes, with no failure and no flake. The card is
      `ANGLE (NVIDIA, Vulkan 1.4.341 (NVIDIA NVIDIA GeForce RTX 4080 (0x00002704)), NVIDIA)`,
      so no run fell back to a software renderer.
