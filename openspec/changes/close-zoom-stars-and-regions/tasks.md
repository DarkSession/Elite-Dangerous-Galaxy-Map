## 1. The zoom limit

- [ ] 1.1 Change `MIN_DISTANCE` in `src/camera/view.ts` from 2,000 to 500; verify the
      unit tests "zoom in", "limits" and "a stored fragment still loads" pass. This
      comes first because every close-zoom browser test later opens a fragment at 500
      light years, which `clampDistance` would otherwise raise to 2,000
- [ ] 1.2 Extend the camera-relative precision unit test to 500 light years, and set
      `PRECISION_LIMIT_AT_MIN_DISTANCE` in `src/camera/precision.test.ts` to 2.5e-3 so
      the bound does not loosen fourfold when `MIN_DISTANCE` falls; verify every
      relative error stays below `1e-2 * distance / 2,000` at 500, 2,000, 20,000 and
      120,000
- [ ] 1.3 Update the zoom range in `README.md` and in `docs/roadmap.md`; verify both
      read 500 to 120,000 light years
- [ ] 1.4 Run the existing navigation browser tests; verify they pass at the new limit

## 2. The dependency and its terms

- [ ] 2.1 Add `@elite-dangerous-almanac/core` with `pnpm add` and pin the exact version
      the 7-day hold resolves; verify `pnpm-lock.yaml` holds that version with no range
      and that no `package-lock.json` appeared. If the resolved version is not 0.2.8,
      re-measure the trace figures in `design.md` against it and correct them
- [ ] 2.2 Add a unit test that asserts the package's galaxy origin is
      (-49,985, -40,985, -24,105) and its sector edge is 1,280 light years; verify it
      passes with `pnpm test`
- [ ] 2.3 Add `THIRD_PARTY_NOTICES.md` naming `@elite-dangerous-almanac/core`,
      `EliteDangerousRegionMap`, `MIT` and `Frontier`, and a unit test that reads it;
      verify the scenario "the notice names every source" passes
- [ ] 2.4 Run `pnpm build` and search the bundle for the package's procedural naming
      tables; verify either that they are absent, or that the BSD 3-Clause text is added
      to `THIRD_PARTY_NOTICES.md`

## 3. The model and the boxel grid

- [ ] 3.1 Add `detailedMassDensity(x, y, z)` to `src/galaxy-model/model.ts`, the
      detailed volume density times the budget constant; verify the unit tests
      "detailed and corrected agree without a grid" and "the detail grid moves the
      budget" pass
- [ ] 3.2 Write `src/scene-data/boxel.ts`: the size class edges from the package, the
      boxel index of a position, the origin of an index, and the hash of a boxel index
      with a star index; verify the unit test "a star lies inside its boxel" passes for
      200 boxels of each class
- [ ] 3.3 Add the base class rule `clamp(ceil(log2(distance / 320)), 0, 4)` and the
      top-down block builder — the coarsest class takes indices `c - 4` to `c + 3`,
      each class above the base drops `c - 2` to `c + 1`, and the class below draws the
      refinement of exactly those; verify the unit tests "base class follows the zoom
      distance" and "the drawn set holds 1,856 boxels" pass
- [ ] 3.4 Add the nesting test over 20,000 random camera positions at every base class
      the rule can select, 1 to 4;
      verify that a class's dropped boxels are exactly the block of the class below,
      that every block holds 8 boxels per axis, and that the camera lies inside every
      block
- [ ] 3.5 Add the covered-radius tests; verify the shortest distance from the camera to
      a face of the coarsest block is at least `3 * edge(s0+3)` at every one of those
      positions, and that the covered radius is at least 0.75 of the zoom distance at
      200 distances spaced in the logarithm from 500 to 5,120 light years
- [ ] 3.6 Run `pnpm lint`; verify `src/scene-data/` still imports no renderer

## 4. The counts and the light

- [ ] 4.1 Write the calibration ramp in `src/scene-data/star-field.ts` on the detailed
      mass density: 4.8 systems per solar mass at the density of the disc at Sol,
      falling in the logarithm to 1 at the model's peak density; verify the unit tests
      "the count at Sol matches the neighbourhood measurement" and "the calibration
      falls with the density" pass
- [ ] 4.2 Add the drawn count capped at 256; verify the scenario "empty space draws no
      star" passes
- [ ] 4.3 Compute the integral of `detailedMassDensity` over the model bounds, carry it
      as a constant with a unit test that reproduces it by numeric integration within 1
      percent, and derive
      `STAR_LIGHT = 60 * 12^2 * 2,000,000 / massIntegral`; verify the scenario "the two
      sources carry the same light per unit volume" passes at all 34 places it names
- [ ] 4.4 Add the light per star, the radius by spacing and the brightness rule
      `lightPerStar * focal^2 / (range * size)^2`; verify the scenarios "the cap does
      not change a boxel's light", "a capped boxel draws wider stars" and "the deposited
      light does not follow the radius" pass
- [ ] 4.5 Add the boxel table builder that writes one record per boxel — the origin
      less the camera position in `float64`, the edge, the drawn count, the light per
      star, the star radius and the population zone — with a cache by boxel index; verify a unit test
      that the table holds 1,856 records and that moving the camera inside one boxel of
      the base class recomputes no count

## 5. The star pass

- [ ] 5.1 Write `src/render/shaders/stars.vert` and `stars.frag`: the hash from
      `gl_InstanceID` and `gl_VertexID`, the position inside the boxel, the size clamp
      of 1 to 16 pixels with the brightness compensation, and the point cloud's colour
      ramp by zone; verify the shaders compile through the page's `compileTestProgram`
      hook
- [ ] 5.2 Write `src/render/star-pass.ts` with one
      `drawArraysInstanced(POINTS, 0, 256, 1856)` call and the per-frame
      `bufferSubData` upload of the boxel table; verify the browser tests "the field
      alone rises above the background" and "the field has grain" pass
- [ ] 5.3 Add the handover: the inner radius `3 * edge(s0+2)`, the outer radius
      `3 * edge(s0+3)`, the weight that is 1 at 4,000 light years and 0 at 8,000, and
      the fade in both the star and the point shaders; verify the unit tests "the two
      fades sum to one" and "the fade band lies inside the covered sphere" pass
- [ ] 5.4 Add the `stars` switch to `PassSwitches`, `GalaxyMapGlobal` and
      `e2e/global.d.ts`, and expose both the vertex count and the sum of the drawn
      counts; verify the browser tests "the switch removes the field" and "the bound
      holds at every view" pass
- [ ] 5.5 Add the `float32` emulation unit test for the drawn position; verify every
      drawn position is within 0.01 light years of the `float64` result at the far
      corner and the galactic centre, at 500, 2,000 and 8,000 light years
- [ ] 5.6 Verify the browser scenarios "the same view gives the same frame by any
      route", "the far view is unchanged" and "the handover keeps the light" pass

## 6. The region data

- [ ] 6.1 Write `src/scene-data/regions.ts`: the 42 region records from
      `astro/codex-region`; verify the unit tests "the region list" and "known
      positions resolve" pass
- [ ] 6.2 Write `src/scene-data/region-lines.ts`: the 2,027 by 2,027 grid fill through
      `findCodexRegionAt`, with a cell outside the map counting as an id of its own, and
      the boundary trace with collinear runs merged; verify the
      unit tests "the set is the boundary" and "the set is deterministic" pass and the
      run count lands between 20,000 and 26,000
- [ ] 6.3 Write `src/scene-data/region-lines.worker.ts`, add `regionLines` to
      `SceneData` and its transferables, and start it beside the two existing workers;
      verify the unit test "the set is transferable" and the existing scene-data
      transferable test pass
- [ ] 6.4 Verify the browser scenarios "time budget" and "main thread stays responsive"
      still pass with the third worker in the ready gate

## 7. The region overlay

- [ ] 7.1 Write `src/render/region-pass.ts` and its shaders: camera-relative lines on
      `y = 0`, drawn to the default framebuffer after the tone map with alpha blending;
      verify the shaders compile and a line is drawn at a view inside the band
- [ ] 7.2 Add the fade in from 30,000 to 20,000 light years and the fade out from 3,000
      to 2,000; verify the browser tests "nothing at the far view", "a boundary is
      visible at medium zoom" and "nothing at the closest zoom" pass
- [ ] 7.3 Add the `regions` switch to `PassSwitches`, `GalaxyMapGlobal` and
      `e2e/global.d.ts`; verify the browser tests "the switch removes both parts" and
      "the switch is inert where nothing draws" pass

## 8. The labels

- [ ] 8.1 Add the label overlay element and its style to `index.html`, with
      `pointer-events: none`; verify the existing navigation browser tests still pass,
      so the overlay takes no pointer input
- [ ] 8.2 Write the visible plane area in `src/app/labels.ts`: the plane points under
      the four viewport corners and the centre, each held to 8 times the zoom distance
      from the cursor, and their axis-aligned box; verify a unit test that the box holds
      the cursor and grows with the zoom distance
- [ ] 8.3 Add the candidate rule by region bounds and the anchor: the projected
      centroid, with the two screen axes negated and not `w` when the centroid is behind
      the camera, then held inside the viewport with a 48 pixel inset; verify a unit
      test that the Inner Orion Spur centroid at the view `#c=0,0,0&d=500&p=35&y=180`
      anchors below and right of the frame rather than above and left, and a unit test
      of the inset
- [ ] 8.4 Add the placement order, the overlap rule and the cap of 12; verify a unit
      test that a smaller region's label is dropped when it overlaps a larger one's and
      that at most 12 survive
- [ ] 8.5 Wire the labels into the frame loop behind the `regions` switch and the same
      zoom fade in; verify the browser tests "no label at the far view", "the core is
      named", "the region under the cursor keeps its label at the closest zoom", "a
      centroid behind the camera labels the right edge" and "labels neither crowd nor
      overlap" pass

## 9. Whole-suite verification

- [ ] 9.1 Run `pnpm test`; verify every unit test passes
- [ ] 9.2 Run `pnpm lint` and `pnpm build`; verify both pass with no error
- [ ] 9.3 Run `pnpm test:e2e`; verify the baseline image test still matches without a
      retake and the scenarios "the far view is unchanged" and "the added passes leave
      the far view alone" pass
- [ ] 9.4 Run the frame budget suite at 1920x1080; verify the six close views at 500,
      1,000 and 4,000 light years and the ten existing views all stay under 16.7 ms, and
      record the measured means
- [ ] 9.5 Update `docs/roadmap.md`: mark phase 2 implemented, correct the calibration
      line to 4.8 systems per solar mass in the disc with the neighbourhood figures it
      reproduces and the two galaxy-scale figures it does not, correct the codex region
      lookup size to 199 KiB, record the answers to the phase 2 open questions — the
      counts and the light read the detailed density, the labels and boundaries are the
      codex regions in a zoom band, and the zoom band is 30,000 light years down —
      and record that one chunk per boxel is now in use. The level-of-detail line and
      the phase 2 status line are already corrected, and phase 2.1 records the fade
      between the classes, so leave both alone

## 10. Review gate

- [ ] 10.1 Run the `openspec-implementation-reviewer` subagent with the change id, fix
      what it blocks on, and re-run it; verify the verdict is APPROVE or APPROVE WITH
      NOTES before the work goes to a human
