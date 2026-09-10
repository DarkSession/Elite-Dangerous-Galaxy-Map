## 1. The arc primitive in the data

- [x] 1.1 Add a `curvature` array to `RegionLines` in `src/scene-data/types.ts`, one
      `float32` **per vertex** and indexed exactly as the vertices are: the value at a vertex
      belongs to the primitive that starts there, and the value at the last vertex of a chain
      is unused and zero. Record in the doc comment that a curvature of zero is a straight
      primitive, and why the array is per vertex rather than per primitive. Verify
      `pnpm lint` and `pnpm build` stay clean.
- [x] 1.2 Carry the curvature array through the worker message in
      `src/scene-data/messages.ts` and put its buffer in the transfer list. Verify with the
      existing transfer test, extended to read the curvature array: the receiver gets equal
      contents and the sender's buffer has length 0.
- [x] 1.3 Add an arc geometry helper module under `src/scene-data/` with four functions:
      the arc through a start point, an end point and a signed curvature; the point at a
      given fraction of its sweep; the tangent direction at each end; and the sagitta of a
      sub-chord over a given fraction of the sweep. Verify with unit tests that a curvature
      of zero gives the chord, that the sampled midpoint of a known arc sits on its circle to
      within 1e-9, that the tangents match the analytic ones, and that the sagitta matches
      `R(1 - cos(dtheta/2))`.

## 2. The biarc fit

- [x] 2.1 Add the tangent estimate at a kept vertex to `src/scene-data/region-lines.ts`.
      **The tangent at a break is one-sided**: it comes from inside the run alone, and the
      run on the other side takes its own; only a vertex inside a run takes a two-sided
      estimate. A chain end counts as a break. Verify with a unit test that puts a synthetic
      90 degree corner in a chain and checks the two tangents at that break differ by 90
      degrees, which a two-sided estimate would report as 0.
- [x] 2.2 Build both estimates for a vertex inside a run: the traced-node estimate over a
      reach of a few hundred light years, and the central difference of the two neighbouring
      kept vertices. Judge them on the measures they can move — the worst windowed drawn turn
      where the traced boundary runs straight, and the departure — and not on corner recall,
      which the one-sided tangent of task 2.1 decides. Verify by recording both measured
      figures in this task when it is checked off.
      **Measured, and it overturns the guess in the design.** The design expected the
      traced-node estimate to beat the central difference. It does not. **The traced-node
      estimate breaks the departure bound, at 283.9 and 320.4 light years against the bound
      of 200**, because a tangent read over 300 light years of raster points away from the
      local chord and the arc bulges off the line. The central difference holds **185.8 and
      189.8**. On the other measure the central difference also wins: the worst windowed
      drawn turn where the traced boundary runs straight is **2.40 degrees against 4.61**.
      **The build takes the central difference.** Both estimates stay in the module, so the
      test re-measures the choice rather than repeating it.
- [x] 2.3 Split each chain into runs, where a break is a chain end or a kept vertex whose
      two-chord traced turn is more than 20 degrees. Reuse the existing two-chord measure
      rather than writing a second one. Verify with a unit test that every break is a chain
      end or a node whose traced turn is over 20 degrees, and that the runs cover every span
      of the chain exactly once.
      **The corner test is 30 degrees, not 20.** The owner took the number from the sweep in
      task 3.6. No kept vertex of the set holds a traced turn between **22.93 and 39.59
      degrees**, so 25, 30 and 35 all give the same 472 breaks and 349 runs, and the result
      does not depend on the exact number. The test reads the constant, so it moves with it.
      **Measured: 472 breaks and 349 runs**, of which 285 runs hold one span.
- [x] 2.4 Fit an equal-tangent-length biarc to each span inside a run, emitting two arc
      primitives that meet tangentially at the joint. Emit one straight primitive for a run
      of a single span. Verify with a unit test that each biarc interpolates both kept
      vertices to within 1e-9 light years and matches the prescribed tangent at each end to
      within 1e-6 radians.
- [x] 2.5 Pack the fit into `packRegionLines` so the set holds the vertices of every chain
      in one array with the chain index ranges, and one curvature per vertex, with a vertex
      shared by two primitives stored once. Verify with a unit test that the primitive count
      is the vertex count less one per chain, that the curvature at every chain's last vertex
      is zero, and that the set has between 300 and 2,000 vertices and between 300 and 2,000
      primitives.

## 3. The fit rules, measured

- [x] 3.1 Rewrite the departure test to sample each arc along its sweep rather than at its
      ends, at a step of 10 light years both ways. Verify no sampled point of either line
      is more than 200 light years from the other, and record the two measured figures.
      **Measured: 185.8 light years drawn to traced and 189.8 traced to drawn**, against the
      bound of 200 and the 185.8 and 189.8 the straight fit gives. The departure does not
      move with the corner test: it reads the same from a test of 20 to one of 65, and only
      a test of 70 breaks the bound, at 297.4 and 334.7.
- [x] 3.2 Add the tangent-continuity test: at every joint and every kept vertex inside a
      run, the angle between the arriving and leaving tangents is under 0.5 degrees.
      Verify the test fails when the joint of one biarc is moved by 1 light year.
      **Measured: 1.7e-6 degrees over the whole set**, and 2.9e-4 degrees after the pack
      rounds a position to `float32`. A joint moved by 1 light year reads **0.407 degrees**,
      which is 240,000 times the residual of the fit but still under the 0.5 degree bound,
      because the median primitive is 2,029 light years long. The test therefore holds the
      move against the residual of the fit as well as against the bound.
- [x] 3.3 Add the straight-run test: for runs whose traced boundary holds no turn over 5
      degrees, every primitive has a radius of at least 100,000 light years or a curvature
      of exactly zero. Verify it passes on the built set.
      **Measured: 1 run of the 349 qualifies**, and its 1 primitive carries a curvature of
      exactly zero. The raster staircase turns by more than 5 degrees over the 500 light year
      window almost everywhere, so the rule reads one run rather than many.
- [x] 3.4 Update the kept-vertex test so it checks kept vertices against traced nodes and
      leaves biarc joints out. Verify it still fails if a kept vertex is moved off the
      trace, and that the shared-chain-end test is unchanged and still passes.
- [x] 3.5 Update the corner test to measure the drawn turn **at a break**, between the
      tangent of the arriving primitive and the tangent of the leaving one. Verify the
      three bounds hold: at least one break over 60 degrees, at least 90 percent precision
      at 20 degrees, and at least 75 percent recall of the traced turns over 60 degrees.
      **Record both measured percentages in this task**; neither has been measured on the
      arc fit, and the straight fit gave 96.6 and 100.
      **Measured on the arc fit: precision 100 percent, 225 of 225 breaks**, against 96.6
      percent and 227 of 235 for the straight fit; **recall 100 percent, 221 of 221 places**,
      the same as the straight fit. The sharpest break turns **109.0 degrees**, so the bound
      of one break over 60 holds. The precision measure stays at 20 degrees, where the corner
      test is 30, so the two fits stay comparable. Recall holds all 221 places at any corner
      test up to 60; it is the departure bound and not recall that sets the ceiling.
- [x] 3.6 Replace the short-segment test with the faceting test, measured over a window and
      not at a break, and **relative** and not against a second threshold: walk the drawn
      line with each arc sampled along its sweep, take the two-chord turn of the drawn line
      over 500 light years each side, and verify that wherever it is more than 10 degrees it
      is not more than 10 degrees above the largest traced turn within 500 light years along
      the chain. Verify it fails when run over the straight fit, whose drawn turn reaches
      30.6 degrees where the traced turn is near zero. A break-only measure cannot fail, and
      a pair of absolute thresholds fails a correct fit on the `Galactic Centre`.
      **The rule gains an exclusion, and the exclusion is tied to the corner test.** The bound
      holds where the windowed traced turn is at most the corner test. Above that the place is
      a corner and the corner counts govern it: a raster rounds a right angle over a cell or
      two, so the window reads 78.9 degrees where the drawn line keeps the true 91.0, and no
      fit that keeps the corners of the region map can hold that to 10 degrees.
      **Measured with the corner test at 30 and the exclusion at 30: 229 samples turn by more
      than 10 degrees, 0 of them turn by more than 10 degrees above the traced turn, and the
      worst excess is 4.36 degrees.** The straight fit this replaces, measured against the
      same rule in the same test: **480 samples, 20 over the bound, worst excess 26.8
      degrees**. The test reads both, so the claim that the rule can fail is a measurement.
      **The exclusion and the corner test do not stand in for each other**, and the test
      comment says so. The corner test removes the fault from the line; the exclusion removes a
      corner out of the measure. At a corner test of 20 the exclusion alone would have
      forgiven the chain 67 kink, whose window reads 23.8: the rule would have passed at 1.9
      degrees below the traced turn while the drawn line still kinked 50.6 degrees.
- [x] 3.7 Update the size and determinism tests to read the curvature array as well.
      Verify two builds are byte-identical, the curvature array included, and record the
      measured primitive count, vertex count and KiB against the expected 588, 711 and 11.1.
      **Measured: 593 primitives — 285 straight and 308 arcs — over 716 vertices in 123
      chains, 11.188 KiB**, against the 588, 711 and 11.1 the spike gave at a corner test of
      20. The corner test of 30 adds 5 vertices and 5 primitives, which is 0.08 KiB. The two
      builds are byte-identical, the curvature included.

## 4. The renderer draws an arc

- [x] 4.1 Bind the curvature attribute in `src/render/region-pass.ts` at the same per-chain
      offset as the positions, and set the divisor of the **two endpoint attributes and the
      curvature attribute** to `SUB`, so one primitive covers `SUB` instances and the
      sub-index is `gl_InstanceID % SUB`. Leave the quad corner attribute, `RIBBON_CORNERS`,
      at divisor 0, or the strip draws nothing. `SUB` is 1 until task 4.3, so this task
      stands alone. Verify the pass still draws the straight set correctly by running the
      region browser tests before the arc data lands.
      The curvature binds at `first x 4` bytes as the positions bind at `first x 12`, and
      the draw sets the divisor of attributes 0, 1 and 3 to `SUB` and leaves attribute 2,
      the quad corner, at 0. The arc data had already landed, so the check ran on the arc
      set: the whole browser suite passed with the binding in place, the region tests
      included.
- [x] 4.2 Update `src/render/region-pass.test.ts`, which asserts one instance per segment
      and the exact attribute-pointer offsets. Verify the new expectations match the
      sub-instance count and the curvature attribute.
      The pointer offsets now read `[0, 0] [1, 12] [3, 0]` for the first chain and
      `[0, 36] [1, 48] [3, 12]` for the second. Two further tests read the divisors and the
      instance count of a curved chain against `regionSubSegments`.
- [x] 4.3 Choose `SUB` per draw call, which is per chain, from the **sagitta in pixels** and
      not from the turn: the sagitta grows with the radius at a fixed sub-angle, so a
      large-radius gentle arc is the worst case rather than the tightest one. The function
      takes the worst arc **in that chain** at the current zoom, because one `SUB` covers the
      whole draw call. Put the choice in one function with a unit test over the zoom band,
      and verify the sagitta of a sub-chord stays under half a CSS pixel at every zoom in the
      band for every arc of every chain.
      `regionSubSegments` holds the choice and `smallestLightYearsPerPixel` gives it the
      zoom. The scale is the smallest a CSS pixel covers anywhere in the frame: a plane
      point is never nearer the camera than its height above the plane, and a frame corner
      sits at the widest angle from the view axis. **Measured over the built set from 500
      to 30,000 light years, at pitches of 5 to 89 and at both 1920x1080 and 1280x720: the
      worst chain asks for 90 sub-chords and the worst sagitta of any arc of any chain is
      0.24999942 CSS pixels**, against the bound the constant sets. The cap of 256 is never
      reached, so the bound holds everywhere in the band. The whole set draws at most
      28,842 instances in that band, against 593 primitives.
      **The bound itself is a quarter of a CSS pixel, chosen on a sweep and not on an
      estimate.** The task and the design state half a pixel as a bound, so a tighter
      value still meets them. Read in the browser on the run the no-facet test walks:

      | sagitta | no-facet reading | sub-chords | instances | worst frame |
      | --- | --- | --- | --- | --- |
      | 0.5 | 2.283 deg | 64 | 20,493 | 1.557 ms |
      | 0.25 | **1.977 deg** | 90 | 28,842 | 1.538 ms |
      | 0.125 | 2.192 deg | 127 | 40,663 | 1.513 ms |

      The reading stops falling at 0.25. The rise at 0.125 sits inside the measure's own
      noise, so the tighter value adds no smoothness the frame can show and costs 41
      percent more sub-chords and instances. The frame budget does not decide it: all
      three sit at about 1.5 ms against the 16.7 ms bound and the 4 ms the coordinator
      set, because the overlay is a small part of the frame at every count.
- [x] 4.4 Expand an arc into sub-segments in `src/render/shaders/regions.vert`: read the
      primitive's ends and curvature, take the sub-index from `gl_InstanceID`, and emit the
      same screen-space quad the pass emits today. Take the straight path below a curvature
      threshold chosen against the largest radius the fit produces. Verify
      `src/render/shaders/regions.frag` is untouched by `git diff`.
      The shader reads the sub-chord point the same way `src/scene-data/arc.ts` does, so a
      test, the fit and the card all measure the same curve. The world frame the card reads
      negates `z`, so the turn runs the other way there and the shader says so. The straight
      threshold is **1e-9 per light year**, and the widest arc the fit produces has a radius
      of **177,654 light years**, so the threshold stands 5,600 times below anything the
      data holds. `git diff` reports no change to `regions.frag`.
- [x] 4.5 Verify the drawn width and the two-tone rule still hold: the existing four-CSS-
      pixel test and the long-segment test pass unchanged on the arc set.
      Both pass. The width reading gives **one run of 4 CSS pixels**, lighter in the middle
      than at both ends and darker at both ends than the frame without the overlay. The long
      segment reads **4, 4 and 4 CSS pixels** at the left, the middle and the right of the
      frame, over the 14,970 light year primitive.
- [x] 4.6 Verify the frame stays inside the budget with the overlay on: run
      `e2e/frame-budget.spec.ts`, which covers 500 to 30,000 light years, and record the
      mean frame time at 1920x1080 against the 16.7 ms bound.
      **Measured at 1920x1080 over 300 frames a view, with the overlay on, at 16 views:
      the worst mean is 1.661 ms** against the bound of 16.7. Inside the fade band the
      readings run 0.772 ms at 2,000 light years, 1.661 at 12,000 and 1.485 at 20,000 over
      Sol, and 0.869, 1.322 and 1.519 over the galactic centre. The overlay draws at most
      20,130 sub-chord quads into a single-channel buffer, which is a small part of that.

## 5. The drawn line, measured in the browser

- [x] 5.1 Update the view finders in `tests/region-views.ts` and `e2e/regions.spec.ts` so
      `clearanceFrom` and the segment distance helpers measure to an arc rather than to a
      chord. Verify a view chosen on a curved chain resolves within 25 light years of the
      drawn line.
      Both files take the exact reading off the arc's circle rather than sampling it, which
      is what the many thousands of readings of each search can afford. The browser search
      also takes its candidate at the middle of a primitive's **sweep** rather than of its
      chord. **Measured in the browser: the boundary sample resolves 0.0 light years from
      the drawn line**, against the bound of 25. The page gained a
      `regionLineCurvature` hook, because a reader cannot measure to the drawn line without
      it.
- [x] 5.2 Regenerate the three committed view constants in `e2e/region-views.ts` —
      `VERTICAL_CROSSING`, `SHARP_CORNER` and `LONG_SEGMENT` — whose vertex indices the biarc
      joints shift. Verify `tests/region-views.test.ts`, which re-runs the search and
      compares, passes against the regenerated constants.
      All three come from the search and none by hand. The indices moved as the biarc
      joints predicted: the crossing from vertex 169 to **208**, the corner from 438 to
      **562** and the long primitive from 484 to **616**. The views themselves barely
      moved: the corner is the same 98.29 degree break of chain 97 and the long primitive
      is the same 14,970 light year one of chain 109. `tests/region-views.test.ts` passes,
      27 tests over five choices.
- [x] 5.3 Add a finder for the joint of a biarc and a browser test that reads the luminance
      change within 8 CSS pixels of it. Verify no pixel at the joint changes more than the
      largest change on a straight run of the same chain, and no pixel inside the joint is
      unchanged.
      `findBiarcJoint` reads the joints off the packed set: a break is a vertex where the
      drawn line turns, and the fit lays a run out as a kept vertex, a joint, a kept vertex,
      so the joints sit at the odd offsets inside a run. The test `reads the joints the fit
      recorded` rebuilds the fit and compares that derivation with the fit's own record of
      which vertices it kept: the two agree at **every one of the 154 joints**.
      The chosen joint is vertex 275 of chain 48, where two arcs of curvature -5.61e-5 and
      1.69e-4 meet and the drawn line turns **0.000047 degrees**.
      **Measured in the browser: the largest change at the joint is 0.29331 and the largest
      change on the straight run is 0.29331**, so the joint is not brighter, and **28 of 28
      pixels on the middle of the drawn line inside the reading are changed**, so it shows
      no notch. The reading is shared with the break test, which reads 0.30198 at the
      corner against 0.30674 on its straight run.
- [x] 5.4 Add a finder for a run that curves through more than 60 degrees, and the
      no-facet browser test at 8,000 light years: fit the drawn direction over a 12 CSS
      pixel window and verify it changes by less than 3 degrees between neighbouring
      windows.
      `findCurvedRun` takes the run whose tightest arc is widest, because a circle of radius
      R turns `window / R` over one window. The chosen run is 274 to 282 of chain 48: it
      curves through **61.16 degrees**, its tightest arc has a radius of **5,913 light
      years**, and the frame holds **67 windows carrying 52.53 degrees** of it. The reading
      takes no ceiling on the brightness of the disc, and the other four do: six of the
      seven runs that curve through 60 degrees bound the `Galactic Centre`, and the reading
      is of the pixels the overlay **changes**, which a bright frame does not stop.
      The widest run is taken because the measure needs it, and that is measured rather
      than assumed. The next run, 345 to 353 of chain 60 at a radius of 4,015 light years,
      reads **8.0 degrees where its geometry gives 2.2**. That reading is the measure and
      not the line: it holds at 7.913, 8.192 and 8.039 as the sub-chord sagitta is cut
      from 0.5 to 0.25 to 0.125 of a pixel, and it falls to 4.957 when the baseline is
      doubled. A fixed error in where a centroid lands does both; a kink in the drawn line
      does neither. It is worst where that run flattens and runs along a row of pixels,
      over six windows whose rise is under a pixel.
      The direction comes from the weighted centroid of the changed pixels over a **disc**
      of the window, and not from the principal axis of them: that fit carries about 3
      degrees of noise on a band 4 pixels wide and 12 long, which is the bound itself.
      **Measured at the chosen sagitta of 0.25: the walk sweeps 53.35 degrees against the
      52.53 the geometry gives, and the worst change between two neighbouring windows is
      1.977 degrees**, against the bound of 3. Two runs give the same figures to every
      digit.
      **The 0.485 degrees over the 1.492 the arc geometry gives is the measure and not the
      line.** The sweep of task 4.3 separates the two: the reading falls by only 0.31
      degrees between a sagitta of 0.5 and 0.25, and does not fall at all below that, so
      the sub-chord expansion is 0.31 at half a pixel and nothing measurable at a quarter.
      What is left is the measure's own floor, which is where the weighted centroid lands
      inside a pixel over a baseline of 12.
- [x] 5.5 Verify the right-angle join test still passes on the arc set, and that the medium
      zoom, closest zoom and far-view tests are unchanged.
      All pass, and none of the three changed. The join at the 98.29 degree break reads
      0.30198 against 0.30674 on the straight run, with 27 of 27 pixels inside it changed.
      The medium zoom reading lifts the boundary 0.288 above the away point with the overlay
      on and 0.004 with it off, against a bound of 0.05 and a fifth. The far view is
      byte-identical with the overlay on and off, and the two close views both differ.

## 6. The label clears the frame edge

- [x] 6.1 Add the label margin constant to `src/app/labels.ts` at 8 CSS pixels, and inset
      the viewport by it in **both** feasibility tests: the slide, which tests the
      floor-scale box, and the scale search, which then grows the box by up to 1.43 times.
      Verify the box stays centred on its anchor and the anchor stays on the segment by
      reading the code path, and that the placement still carries no state between frames.
      `LABEL_MARGIN_CSS` is 8, and one function `boxInsideInsetViewport` holds the inset
      for both steps. The box is still built as `anchorU - width / 2`, and the anchor is
      still `centre + (wanted - centre) * at`, so neither moves off its anchor or off the
      segment. The unit tests `is centred on its anchor and never slid off it` and `is a
      function of the camera alone and carries no state between frames` both pass.
- [x] 6.2 Add the browser assertion that every box clears all four frame edges by at least
      the margin at 1920x1080. Verify it fails on the current build and passes after the
      change. Measured before the change:
      **2 of 20** boxes clear the frame edge by less than 8 CSS pixels, `Outer Arm` at 0.0
      and `Norma Expanse` at 0.2, and the test fails. The other 18 clear it by 90.5 or
      more, so the reading is two flush boxes and not six. After the change every box
      clears every edge, and the nearest sits at exactly 8.0.
- [x] 6.3 Verify the label count and the `Galactic Centre` scale do not fall: the build
      still draws 14 labels at 1280x720 and 20 at 1920x1080 at
      `#c=15,0,25895&d=20000&p=35&y=0`. Report the figures if the margin removes a label or
      lowers a scale, because the inset in the scale search can do both. Measured with and
      without the margin, the counts are the same: **14** at 1280x720 and **20** at
      1920x1080. The `Galactic Centre` draws at **0.761** and **1.000**, the same figure
      with the margin and without it. No other label lost scale either: the two labels the
      margin moves, `Norma Expanse` and `Outer Arm`, already drew at the floor of 0.700.

## 7. The label stays legible over the disc

- [x] 7.1 Add the contrast measurement to `e2e/labels.spec.ts`, reading the frame **with the
      label drawn**: take the text pixels as those within 10 percent of the text colour in
      each channel, the ground pixels as those in the box that are neither text nor within 1
      CSS pixel of it, and the ratio as the WCAG relative luminance of the median of each.
      Verify the measurement runs and report the current ratio for every label, with
      `GALACTIC CENTRE` named.
      The frame is read as a screenshot and not through `readRect`, because a label is text
      in the document and `readRect` reads the drawing buffer of the canvas alone. The text
      colour is read from the computed style, so the measure follows the treatment 7.3
      chooses. The 10 percent is taken of the 0 to 255 channel range and not of the colour
      itself, which is undefined for a channel that is zero.
      **Measured at `#c=15,0,25895&d=20000&p=35&y=0` at 1920x1080: 6 of the 20 labels hold
      less than 3 to 1, and the weakest is `GALACTIC CENTRE` at 1.20 to 1**, text 0.7461
      over ground 0.6142. The other five are `Izanami` 1.39, `Empyrean Straits` 1.40,
      `Odin's Hold` 1.46, `Ryker's Hope` 1.49 and `Norma Arm` 2.04. The rest run from 3.31
      for `Inner Orion-Perseus Conflux` to 13.48 for `Mare Somnia`. The test fails on the
      current style, as it must until 7.3, and its message lists every label worst first.
- [x] 7.2 Report the measured ratios to the owner with a screenshot of the core, and the
      three treatments the design lists: a darker outline, a translucent plate, or a
      different text colour. **Stop here for the owner's choice**; the style is a look
      decision and the spec fixes only the bound. Verify the choice is recorded in this task
      before 7.3 starts.
      **The owner chose the translucent black plate at an opacity of 0.45.** The plate sits
      behind the text, so it darkens the ground the glyph is drawn on and leaves the text
      colour alone. `GALACTIC CENTRE` is the weakest label at every opacity, so it decides
      the choice. A black plate composited over the box gives it **2.42 at 0.30, 2.77 at
      0.35, 3.19 at 0.40, 3.70 at 0.45 and 4.30 at 0.50**. The owner took 0.45: it clears
      the bound of 3 with margin, and the frame behind the label still shows through.
      **A colour change alone cannot reach the bound, and that is measured.** The 20 grounds
      of task 7.1 run from **0.0085 to 0.6142**. One text luminance has to clear a factor of
      three against every one of them. None does: over the 20 grounds the best single text
      luminance is pure white, and it reads **1.58 to 1** against the 0.6142 ground of
      `GALACTIC CENTRE`. A text dark enough to clear 3 to 1 against 0.6142 must sit at or
      below 0.1714, and it then reads 1.01 to 1 against the 0.1728 ground of `Inner
      Orion-Perseus Conflux`. The treatment has to change the ground, which the plate does
      and a colour does not.
- [x] 7.3 Change the `.region-label` style in `index.html` to the chosen treatment. Verify
      with the measurement from 7.1 that every label holds at least 3 to 1, and record the
      ratio the `Galactic Centre` label reaches over the brightest part of the disc.
      The style keeps the text colour `#cfe4ff` and adds `background: rgba(0, 0, 0, 0.45)`
      with a `border-radius` of 3 px, so the plate does not read as a hard rectangle. The
      padding stays at `2px 6px`, so the box the placement measures does not change.
      **The wide glow goes and the tight one stays.** The 6 px glow was tuned for dark
      ground and now sits under the plate. Measured, it moves the `Galactic Centre` reading
      from **3.41 to 3.69**, because it darkens the ground pixels more than 1 CSS pixel out
      from the glyph. Both hold the bound of 3. The build keeps `0 0 2px #000` alone: the
      2 px reading sharpens the glyph edge, and the 6 px one is a halo on a plate that
      already carries the contrast.
      **Measured at `#c=15,0,25895&d=20000&p=35&y=0` at 1920x1080, all 20 labels hold the
      bound, worst first: `GALACTIC CENTRE` 3.41** (text 0.7491 over ground 0.1846),
      `Empyrean Straits` 3.80, `Izanami` 3.82, `Odin's Hold` 4.00, `Ryker's Hope` 4.02,
      `Norma Arm` 5.17, `Inner Orion-Perseus Conflux` 6.85, `The Veils` 7.69, `Arcadian
      Stream` 7.82, `Formorian Frontier` 7.82, `Norma Expanse` 8.06, `Trojan Belt` 8.57,
      `Newton's Vault` 8.65, `Outer Arm` 8.84, `Hieronymus Delta` 9.79, `The Conduit`
      10.06, `Outer Scutum-Centaurus Arm` 12.41, `The Abyss` 13.84, `Acheron` 13.96 and
      `Mare Somnia` 14.55. Before the change the same six labels read 1.20, 1.39, 1.40,
      1.46, 1.49 and 2.04, so the plate lifts the weakest label by 2.21.
- [x] 7.4 Verify the change of style does not break the box rules: the labels still lie
      inside their own regions, still clear their boundaries, and still do not overlap.
      The plate draws inside the box and the padding does not change, so the box the
      placement measures is the box it measured before. **All 14 tests of
      `e2e/labels.spec.ts` pass.** The frame shows the same 20 labels at 1920x1080 and the
      same 14 at 1280x720. All 100 corner and middle points of the 20 boxes resolve to the
      region their label names, no two boxes overlap, **0 of 20 boxes clear a frame edge by
      less than 8 CSS pixels**, and of the 43,730 pixels the overlay changes, none lies in a
      label box. `pnpm lint` is clean, the 311 unit tests pass, and the committed baseline
      image is untouched: `e2e/look.spec.ts` passes without `--update-snapshots` and
      `git status` shows no change under `e2e/look.spec.ts-snapshots/`.

## 8. Documentation and verification

- [x] 8.1 Replace the straight-segment record in the phase 2 notes of `docs/roadmap.md`
      with the arc set: the primitive and vertex counts, the upload size, the unchanged
      departure figures, the faceting rule that replaces the short-segment bound, and the
      label margin and contrast rules. Verify no figure in the file is stale by checking each
      against a test output.
- [x] 8.2 Run `pnpm lint`, `pnpm build`, `pnpm test` and `pnpm test:e2e`. Verify the lint
      is clean, the page chunk stays under 130,000 bytes, every unit test passes, every
      browser test passes, and `e2e/00-renderer.spec.ts` confirms hardware rendering.
      **Measured: lint clean; build clean with the page chunk at 117.26 kB against 130,000
      bytes; 311 unit tests in 35 files pass; 72 browser tests pass in 3.9 minutes, the
      renderer check among them.**
- [x] 8.3 Verify the committed Playwright baseline image is untouched: the look test passes
      without `--update-snapshots` and `git status` shows no change under
      `e2e/look.spec.ts-snapshots/`. **Verified: the whole suite ran without
      `--update-snapshots` and `git status` reports nothing under that directory.**
      `src/render/shaders/regions.frag` is also byte-identical, which `git diff` confirms.
- [x] 8.4 Run the implementation review gate with the `openspec-implementation-reviewer`
      subagent. Verify the verdict is not BLOCK, and report every finding, including the
      ones not acted on and why. **Ran twice. The first pass gave APPROVE WITH NOTES over
      ten findings; six were fixed and four were reported with reasons. The second pass
      gave APPROVE.**
