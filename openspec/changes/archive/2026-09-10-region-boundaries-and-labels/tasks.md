## 1. The chain trace

- [x] 1.1 Add the edge graph and the chain walk to `src/scene-data/region-lines.ts`: link
      the unit edges through every lattice node of degree two and end a chain at every
      other node; verify the unit tests "the boundary is a small number of chains" and "a
      chain separates one pair of regions" pass, with 123 chains and 82 junction nodes on
      the shipped data
- [x] 1.2 Smooth each chain by averaging along it, with the movement of every point capped
      at **0.75 cells** from the lattice node the trace put it on; verify a unit test that
      no point moves further than the cap. The cap sits below the one cell departure bound
      because the departure is measured polyline to polyline and the rounding in 1.3 needs
      headroom of its own. Two box filter passes of half width 3, endpoints held and the
      window shrinking near an end so it stays symmetric, each followed by a clamp against
      the traced chain rather than against the pass before. The worst point movement over
      all 123 chains measures exactly 0.750 cells, so the cap binds
- [x] 1.3 Round the corners that the average leaves, with the cut capped at **0.3 cells**
      along each of the two segments that meet at a corner and at a quarter of the shorter
      segment, over **four passes**; verify the unit test "the drawn line carries no
      visible corner", that no vertex turns by more than 20 degrees. Record the worst
      vertex turn. The averaged line alone measures 98.4 degrees at its worst vertex and
      377 vertices above 20, which is the defect this task removes. Measured over all 123
      chains: the worst vertex turns **14.234 degrees** and **no vertex turns over 20**.
      The median segment falls from 284 to 5.09 light years. The pipeline is three
      stages: the average of task 1.2, a vertex reduction by Douglas-Peucker at 0.1
      cells, and these four rounding passes. The reduction has to run before the
      rounding, because each rounding pass doubles the vertex count and four passes over
      the averaged chain without it would give about 619,000 vertices, five times the
      120,000 the spec allows. A further reduction **after** the rounding was offered and
      **not taken**: at the 0.02 cell tolerance it leaves 5,770 vertices but
      the worst vertex turn rises to 43.1 degrees with 396 vertices over 20, which breaks
      the bound. At 0.001 cells it holds every bound and leaves 29,138 vertices, but that
      is not the tolerance the design names, so it is reported and not applied
- [x] 1.4 Verify the unit test "the drawn line reads as a line": the sum of the absolute
      turn angle over the whole drawn set is at most 60 degrees for each 1,000 light
      years of drawn length, no single chain is above 100, and the same whole-set measure
      over the traced staircase is more than 1,000. Record all three figures. Measured:
      the whole set turns **29.732** degrees for each 1,000 light years, the worst single
      chain **70.700** and the median chain 26.850, and the traced staircase **1,062.751**
- [x] 1.5 Verify the two-way departure at one grid cell: every point of a drawn chain is
      within 49.3494 light years of the traced boundary and every point of the traced
      boundary is within 49.3494 light years of a drawn chain, over all 123 chains. Record
      the measured figure. The largest distance read is **47.758 light years**, from the
      traced boundary to the drawn line. The proved bounds are 49.3423 and 49.3481, both
      inside 49.3494
- [x] 1.6 Keep `RegionLines` as one vertex array of three `float32` per vertex with the
      first and last index of each chain; verify the unit tests "the set is deterministic",
      "the set is transferable" and "the set is small enough to upload once" pass with the
      window of 20,000 to 120,000 vertices, and record the measured vertex count and byte
      size. Measured **68,672 vertices and 68,549 segments**, which is 824,064 bytes, that
      is **804.75 KiB**, inside the 1.4 MiB bound. All three tests pass
- [x] 1.7 Re-run the searches in `tests/region-views.ts` and replace both constant sets in
      `e2e/region-views.ts`, because the geometry moves again. Both are replaced.
      `VERTICAL_CROSSING` is chain 38, vertices 22256 to 22288, cursor 400.735, 0,
      10118.807, distance 1875, yaw 179.9, and 0.014 degrees from vertical.
      `findSharpCorner` is rewritten to measure the bend over a reach, because the
      requirement that no vertex turns more than 20 degrees makes every join at least 160
      degrees and a bend is now a run of vertices rather than one corner. It walks each
      chain and compares the direction of the line at the two ends of a window of 8 CSS
      pixels. `SHARP_CORNER` is chain 122, vertex 67639, which **turns 37.079 degrees**
      over that reach against the threshold of 30, with a clearance of 6,412 light years
      and a bend line of 8 vertices. The fold test that guards the reading now measures
      the neighbourhood of a bend as 60 light years of arc rather than as a count of
      vertices, because the drawn line carries a vertex about every 5 light years
## 2. The coarse region grid

- [x] 2.1 Add the coarse region grid to `src/scene-data/region-lines.ts`: one byte per
      cell, at most 512 by 512 over the model bounds, taken from the trace grid so it
      costs no further region lookups; verify the unit test "the coarse region grid
      resolves known positions" passes
- [x] 2.2 Add the grid to the worker message, to `SceneData` and to its transferables;
      verify the existing scene-data transferable test passes
- [ ] 2.3 Verify the browser scenarios "time budget" and "main thread stays responsive"
      still pass with the grid in the ready gate, and record the measured figures.
      "Time budget" passes: the scene-data ready event arrives at 2,416 ms of the 5,000
      ms limit in the full `pnpm test:e2e` run. "Main thread stays responsive" passes in
      that same full run, where the longest task before the first frame is 0 ms. It
      fails when `e2e/scene-data.spec.ts` runs alone: the longest task is 436 ms against
      a limit of 100 ms, measured on 2026-09-09, with the ready event at 2,888 ms. That
      is the cold-start defect that GitHub issue #3 already records. The defect predates
      this change and phase 2. This change neither causes it nor fixes it, so the box
      stays unticked

## 3. The two-tone line

- [x] 3.1 Add the coverage buffer to `src/render/region-pass.ts`: one single-channel
      target the size of the drawing buffer, cleared and drawn only while the overlay
      fades in; verify a unit test of the target size against the drawing buffer size
- [x] 3.2 Write the ribbon shaders: a screen-space quad per segment expanded by the half
      width along the screen normal and along the segment, writing
      `1 - distance / halfWidth` with the blend equation set to `MAX`; verify the shaders
      compile through the page's `compileTestProgram` hook
- [x] 3.3 Add the composite step: the core colour above the core threshold, the outline
      colour above zero, with one smoothstep at each edge; verify the browser test "the
      line is four CSS pixels wide and two-toned" passes, with the run read across a
      chain within 5 degrees of vertical and converted from device pixels by the device
      pixel ratio
- [x] 3.4 Draw one instanced call per chain from the shared vertex array, reading the two
      endpoints of a segment at offsets one vertex apart; verify the browser test "a
      boundary is visible at medium zoom" passes
- [x] 3.5 Verify the browser test "a join is not brighter than the line" passes at a
      place where the drawn line turns by at least 30 degrees within a reach of 8 CSS
      pixels, with no unchanged pixel inside the bend. It passes at the bend of 37.079
      degrees. The largest change the overlay makes at the bend is 0.39521 against
      0.39830 on a straight run of the same chain in the same frame; 27 pixels lie on the
      drawn line inside the reading window and none of them is unchanged. The test reads
      the drawn line through the bend as the run of vertices the search gives, not as two
      segments

## 4. The close zoom

- [x] 4.1 Remove the fade out below 3,000 light years from `src/render/region-pass.ts`
      and keep the fade in from 30,000 to 20,000; verify the browser test "the boundary
      still draws at the closest zoom" passes at 1,500 and 500 light years
- [x] 4.2 Verify the browser scenarios "nothing at the far view" and "no label at the far
      view" both pass, and that the committed baseline image still matches without a
      retake

## 5. The labels

- [x] 5.1 Add the screen sampling to `src/app/labels.ts`: a grid of screen points about
      32 CSS pixels apart, each turned into a plane point at `y = 0` and read from the
      coarse grid, with the view-projection matrix inverted once for the whole sweep;
      verify a unit test that the sample count is about 2,000 at 1920x1080 and that the
      inverse is computed once. Measured 2,040 screen points at 1920x1080, of which
      1,848 land at the core view, and one call to `mat4.invert` per sweep. The reader
      of the coarse grid moved to `src/scene-data/regions.ts`, so the main thread never
      imports the 199 KiB region cell lookup
- [x] 5.2 Replace the candidate rule with the sample count: a region is a candidate when
      it holds at least 1 percent of the samples that land on the plane inside the model
      bounds; verify the browser test "a region with nothing on screen carries no label"
      passes. At `#c=0,0,0&d=500&p=35&y=0` all 920 landed samples are Inner Orion Spur
      and the page holds that one label
- [x] 5.3 Work the anchor out on the galactic plane and project it, rather than working
      it out on the screen: the mean of a region's sample plane positions, falling back to
      the plane position of the sample that region itself holds nearest that mean only when
      the region under the mean is a different region. Keep the 48 pixel inset only to hold
      a label's box inside the frame; verify the unit test that the anchor lies on the
      region for a region that shows as two separated patches, and the test "a label anchor
      moves with the camera and does not snap", which the unit test "a turn of 0.1 degrees
      a frame never moves the anchor 8 CSS pixels" carries: it turns the camera 0.1
      degrees a frame over 120 frames at 1920x1080 and reads a move in every frame and no
      move of 8 CSS pixels or more.
      Record the worst move and the number of still frames. The screen-space mean measured
      a worst move of 1.0 CSS pixels and was still in 58 percent of frames, which is the
      defect this task removes. Measured with the plane anchor over 120 frames at 0.1
      degrees a frame and 1920x1080: the worst move is **0.400 CSS pixels** and the anchor
      is **still in 0 of the 119 steps**, so it moves in every frame
- [x] 5.4 Add the placement order: the region holding the sample nearest the centre of
      the frame first, then the rest by sample count; verify the browser tests "the core
      is named" and "the region the camera is inside is named at every zoom" pass, and
      record where `Galactic Centre` ranks by sample count at the core view. Measured at
      `#c=15,0,25895&d=20000&p=35&y=0` and 1280x720: 834 landed samples, 24 candidates,
      and `Galactic Centre` holds 15 samples, which is 1.80 percent. 14 regions hold
      strictly more, so the scenario holds. Two regions tie with it on 15, so its rank
      reads 15th to 17th by the tie-breaking alone, which is why the spec states the count
      and not the rank
- [x] 5.5 Expose the mean and the worst sampling time from the page and verify the browser
      test "the sampling stays inside its budget" reads a mean under 2 ms and a worst frame
      under 4 ms at 1920x1080 over 300 frames. Record both. `labelSampling` now gives
      `worstMs` beside `meanMs`. Measured over 300 frames at the core view: a mean of
      **0.161 to 0.189 ms** against 2 ms and a worst frame of **1.0 to 2.5 ms** against 4
      ms, over **21 measurements**. Nine are ours: three full `pnpm test:e2e` runs, which
      gave 1.2, 1.0 and 1.1, and six repeats of `e2e/labels.spec.ts` alone, which gave
      1.3, 1.2, 1.2, 1.8, 1.4 and 1.5. Twelve are the gate's own, taken because it was
      told to spot-check the figures rather than trust them: ten repeats at 1.4, 1.4,
      1.4, 1.4, 1.5, 1.5, 1.6, 1.6, 1.7 and 2.5, and two full runs at 1.4 and 1.4. The
      2.5 is the honest top of the range and our nine readings missed it. The range is
      what the record needs and not the best reading: an earlier note here recorded a
      single worst frame of 1.000 ms, which read as comfortable, and the gate then
      measured the real tail of that build at **4.5 ms**, over the bound. Both ranges
      come from one machine and a few sessions, so they stay a sample and not a bound.
      The measured window covers the sweep and the placement together, so no part of the
      label work each frame sits outside a budget
- [x] 5.6 Delete the bounding box test, the centroid projection and the behind-camera
      negation with their unit tests; verify `pnpm lint` reports no unused export.
      `visiblePlaneArea`, `boundsMeet`, `PLANE_AREA_LIMIT`, `labelAnchor`, the old
      `orderCandidates` and `PlaneBox` are gone
- [x] 5.7 Verify the browser tests "the camera keeps the label of the region it sits in
      when it turns away" and "labels neither crowd nor overlap" pass. At
      `#c=0,0,0&d=500&p=35&y=180` the 920 landed samples are 91.3 percent Inner Orion
      Spur, 7.5 percent Sanguineous Rim and 1.2 percent Elysian Shore

- [x] 5.8 Add the hysteresis: a region that carried a label stays a candidate until its
      share falls below half the threshold, its sample count is multiplied by 1.2 for the
      placement order, and candidates still equal after the bonus are ordered by region id;
      verify the unit tests "a region on the threshold does not blink" and "a region
      entering the frame overtakes one that is leaving". Both pass. The blink test runs
      three consecutive frames at 1.2, 0.7 and 0.4 percent of 1,000 samples. The overtake
      test places a fresh region on 100 samples ahead of a carried region on 60, and keeps
      the carried region ahead on a near tie of 95 against 100
- [x] 5.9 Hold a region's anchor from the frame before while the plane point under it
      still resolves to that region and still projects inside the frame; verify a unit test
      that the held anchor is kept while both hold and is dropped when either fails, and
      that holding it does not stop the label moving, because the projection of a held
      plane point still moves with the camera. Four unit tests cover it. The overlay owns
      the memory as a `LabelMemory` of the ids and their plane anchors, and the placement
      takes it as an argument, so the placement stays a function of what it is given
## 6. Whole-suite verification

- [x] 6.1 Run `pnpm test`; verify every unit test passes. **All 231 tests pass over 33
      files.**
- [x] 6.2 Run `pnpm lint` and `pnpm build`; verify both pass with no error. Both pass,
      and `pnpm exec prettier --check .` reports every file in Prettier style. The main
      bundle is 109.20 kB, inside the 130,000 byte line `tests/main-bundle.test.ts` holds
- [x] 6.3 Run `pnpm test:e2e`; verify `e2e/00-renderer.spec.ts` reports the hardware
      renderer and not SwiftShader or llvmpipe, and that the baseline image still matches
      without a retake. **All 62 tests pass in 2.8 minutes.** The renderer reads
      `ANGLE (NVIDIA, Vulkan 1.4.341 (NVIDIA NVIDIA GeForce RTX 4080 (0x00002704)),
      NVIDIA)`. "The default view matches the baseline image" passes and `git status`
      leaves `e2e/look.spec.ts-snapshots/default-view-chromium-gpu-linux.png` unchanged
- [x] 6.4 Run the frame budget suite at 1920x1080; verify every view stays under 16.7 ms
      with the coverage buffer in the frame, and record the means. The label sampling is
      outside the measured window, so read its own budget from task 5.5 rather than from
      this suite. The suite sets the viewport itself with
      `test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })` and
      asserts the drawing buffer is 1920 by 1080, so `pnpm test:e2e` needs no argument.
      Mean frame time over 300 frames, in milliseconds, at cursor Sol and cursor
      galactic centre: 500 ly 0.790 and 0.773; 1,000 ly 0.729 and 0.787; 2,000 ly 0.759
      and 0.821; 4,000 ly 0.827 and 0.874; 12,000 ly 1.477 and 1.360; 20,000 ly 1.402
      and 1.494; 30,000 ly 1.146 and 1.383; 120,000 ly 0.528 and 0.587. The worst is
      **1.494 ms** against the budget of 16.7 ms. The set grew from 4,211 vertices to
      68,672 and the frame time did not follow it, because the draw stays 123 instanced
      calls
- [x] 6.5 Update `docs/roadmap.md`: record that the boundary is traced as chains and
      smoothed, that the line is a two-tone ribbon, that the lines stay to the closest
      zoom, and that the labels follow the area a region covers on screen. Phase 2 now
      lists both changes, and its decision that the boundaries fade out below 3,000
      light years is replaced rather than repeated. The three smoothing stages, the
      68,672 vertices, the 804.75 KiB, the 20 degree corner bound and the plane-space
      anchor are all recorded

## 7. Review gate

- [x] 7.1 Run the `openspec-implementation-reviewer` subagent with the change id, fix
      what it blocks on, and re-run it; verify the verdict is APPROVE or APPROVE WITH
      NOTES before the work goes to a human. The first run returned **APPROVE WITH
      NOTES**, the second and the third **BLOCK**, and the fourth **APPROVE WITH NOTES**.

      The third run blocked on the label sampling budget. `e2e/labels.spec.ts` read a
      worst frame of **4.5 ms** against the bound of 4 in one full suite run, while the
      mean held at 0.18 to 0.23 against its bound of 2. The note here recorded a single
      best reading of 1.000 ms, which hid a tail that reached 4.5 over 13 measurements.
      The cause the gate named, as a candidate and not a proved one, is the five typed
      arrays the sweep allocated every frame: about 67 KB a frame and 20 MB over the 300
      frames the test runs, all inside the timed window, so a young-generation collection
      landing there costs 20 times the mean. The fix removes the allocation rather than
      the bound. `SampleBuffers`, `samplePointCount` and `fitSampleBuffers` let the
      overlay hold one set of arrays and hand it back every frame, and `sampleFrame`
      still allocates its own when a caller gives none, so the unit tests call it
      unchanged. A unit test asserts that two sweeps write into the caller's buffers and
      that a pool already large enough is handed back. Task 5.5 records the range over
      21 measurements after the fix, nine ours and twelve the gate's own: a worst frame
      of 1.0 to 2.5 ms. The second
      candidate the gate named, the `getBoundingClientRect` in `measureById`, is reached
      only for a region name the overlay has not measured before; the label set of the
      budget view is stable, so every name is cached after the first frame and no frame
      of the 300 forces a layout. About 8.4 KB a frame is still allocated inside the
      window, by the 256 wide scratch arrays of `labelCandidates`. It is left alone:
      pooling it would trade the placement's purity, which the design asks for, for
      headroom the measurements say is not needed. The second run blocked on an honest fault of the first round of fixes:
      the edit that corrected two stale comments in `e2e/regions.spec.ts` never ran,
      because the script that carried it stopped on an earlier error, and this note
      already reported it as done. Both comments are corrected now, and the gate also
      found two more headers of the same class, in `e2e/region-views.ts` and
      `tests/region-views.ts`, which still described the join view as a corner under 150
      degrees. The first run traced every requirement and scenario to code and to a test. It
      returned seven findings, of which six are acted on: the design, the proposal and this task list
      recorded a two stage smoothing where the code has three, and now name the vertex
      reduction and say why it has to run before the rounding; the reduction's own unit
      test ran on the raw staircase, where it drops only exactly collinear points, and
      now runs on the averaged chain, where it measures 4.933 light years, that is the
      0.1 cell tolerance; two comments in `e2e/regions.spec.ts` still named 74,000
      vertices at 25 light years apart and a line one device pixel wide; the exposed
      sampling figure covered the sweep alone and now covers the sweep and the placement
      together, measured at a mean of 0.215 ms and a worst of 1.000 ms; and a closed loop
      chain would carry an unmeasured staircase corner at its seam, so the corner test
      now asserts that the shipped trace holds no closed loop, which it does not. The one
      finding not acted on is `rayDirection` in `src/camera/projection.ts`, which this
      change left with no caller in the page. It is kept on the API argument alone: it is
      part of the camera module before this change, it is one line over
      `rayDirectionFrom`, and the test that says the two agree is what records why the
      sweep may hold one inverse. A comment now says so. ESLint is not evidence here,
      because `no-unused-vars` does not follow exports. The fourth run lifted the block
      and returned APPROVE WITH NOTES with three notes. Two are acted on: the recorded
      range understated the tail, so task 5.5 now carries all 21 readings, and
      `samplePointCount` and `sampleFrame` each held their own copy of the grid formula,
      which would silently restore the allocation if the two ever drifted apart, so both
      now read the shape from `sampleColumns` and `sampleRows`. The third note agrees
      with leaving the 8.4 KB of `labelCandidates` scratch alone
