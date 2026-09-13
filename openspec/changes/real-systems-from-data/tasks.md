## 1. The record reader and the system set

- [ ] 1.1 Add `src/scene-data/real-systems.ts` with the `RealSystem`, `RealSystemSet` and
      `AddReport` types, the capacity constant of 10,000 and the suppression radius of 3
      light years. Verify `pnpm build` checks the types.
- [ ] 1.2 Read the model bounds from the parameter document in the reader, without the
      detail grid. Verify a unit test reads the same bounds the model reports.
- [ ] 1.3 Implement `createSystemSet`, `addSystems` and `clearSystems`: the required
      `name` and `coords`, the seven optional fields, `id64` as a decimal string from a
      number, a string or a `bigint`, and every other field dropped. Verify the unit
      tests for the EDSM record, the Spansh record and the large `id64` pass.
- [ ] 1.4 Implement the reject report with the four reasons, and the identity rule that
      replaces a record with the same `id64` or the same `name`. Verify the unit tests
      for each reason, for the replace and for the capacity bound pass.
- [ ] 1.5 Hold the positions in one `Float64Array` and bump a version counter on every
      change. Verify a unit test reads the array and sees the version rise on an add,
      on a replace and on a clear.

## 2. Suppression on the CPU

- [ ] 2.1 Add `src/scene-data/star-suppression.ts` with the per-class index: a map from
      boxel index to the systems inside the boxel grown by the suppression radius, with
      a system entering up to 8 entries. Verify a unit test finds a system from each of
      the 8 boxels that its grown box touches.
- [ ] 2.2 Implement the sweep of one boxel: generate its `drawn` star positions with
      `starOffsets` and return the 8 words of the bit mask. Verify the unit tests "A star
      inside the radius goes and one outside stays" and "The suppressed set does not
      depend on the camera" pass.
- [ ] 2.3 Add the cache keyed by size class and boxel index, cleared on a version change
      and above 8,192 entries. Verify a unit test reads the same mask twice and sees the
      second read do no sweep.
- [ ] 2.4 Measure the sweep: a new drawn set and a one-boxel camera move, with 10,000
      systems spread over the base block. Verify the unit test "The sweep stays inside the
      frame budget" holds 12 ms and 2 ms.

## 3. The star field carries the mask

- [ ] 3.1 Give `createStarField` the system set, sweep the base class block when the
      drawn set or the version changes, and write the mask buffer beside the boxel table.
      Verify a unit test reads a mask row for a boxel that holds a system and a zero row
      for one that does not.
- [ ] 3.2 Divide the boxel's light by `drawn - suppressed` and keep the radius on `drawn`.
      Verify the unit tests "Suppression does not change a boxel's light" and
      "Suppression does not change the star radius" pass.
- [ ] 3.3 Report the drawn count less the suppressed stars, and the suppressed count, from
      the table. Verify a unit test reads both over a set with and without systems.
- [ ] 3.4 Confirm the existing close-view-stars unit tests still pass with an empty system
      set. Verify `pnpm test` is green.

## 4. The star shader drops a suppressed star

- [ ] 4.1 Upload the mask as an `R32UI` texture of 8 texels by one row per record in
      `src/render/star-pass.ts`, with a `uSuppress` uniform that is 0 when nothing is
      suppressed. Verify `compileTestProgram` accepts the new shader.
- [ ] 4.2 Read the mask in `src/render/shaders/stars.vert` and give a suppressed star no
      size and a clipped position. Verify the browser test "A frame reports the suppressed
      count" passes.
- [ ] 4.3 Verify the browser tests "The same view gives the same frame with systems
      loaded", "Systems lower the sum and not the bound" and "Loading systems does not
      change the galaxy's brightness" pass.

## 5. The marker pass

- [ ] 5.1 Add `src/render/shaders/systems.vert` and `systems.frag`: a point sprite of 7
      CSS pixels times the device pixel ratio, a light core over the inner 5/7 and a dark
      ring. Verify `compileTestProgram` accepts both.
- [ ] 5.2 Add `src/render/system-pass.ts` with the colour constants, the buffer and the
      per-frame rebase from the `Float64Array`. Verify a unit test checks the rebase
      against the `float64` result over 1,000 positions.
- [ ] 5.3 Draw the pass in `src/render/renderer.ts` after the tone map and after the
      region overlay, with alpha blending and no depth test, and add the `systems` switch
      and the drawn marker count. Verify the browser test "The switch removes the markers"
      passes.
- [ ] 5.4 Verify the browser tests "A marker shows at every zoom distance", "A marker is 7
      pixels wide", "The marker colour is not the zone ramp" and "A region boundary does
      not cover a marker" pass.
- [ ] 5.5 Verify the unit test "Position error at the far corner" holds 0.01 light years
      at every listed cursor and zoom distance.

## 6. The library entry point

- [ ] 6.1 Move the bootstrap into `src/app/create-map.ts` as `createGalaxyMap(canvas)`,
      which returns the handle in the same tick with `addSystems`, `clearSystems`,
      `systemCount`, `ready` and `dispose`. Verify `pnpm build` checks the types.
- [ ] 6.2 Reduce `src/app/main.ts` to the demo page: call the entry point, put the handle
      on `window.galaxyMap`, keep the `window.__galaxyMap` hooks. Verify the existing
      browser tests pass unchanged.
- [ ] 6.3 Add the test hooks for the marker count and the suppressed count to
      `src/render/global.ts`. Verify the types build and the hooks read from the page.
- [ ] 6.4 Verify the browser tests "The handle works before the first frame" and "The
      handle empties the set" pass.

## 7. Budgets and the whole suite

- [ ] 7.1 Add the frame budget browser test with 10,000 systems at the eight views. Verify
      each mean is under 16.7 ms.
- [ ] 7.2 Verify the baseline image still matches and the far view is byte-identical with
      an empty set, through "The far view does not change" and "The added passes leave the
      far view alone".
- [ ] 7.3 Run `pnpm test`, `pnpm test:e2e`, `pnpm lint` and `pnpm build`. Verify all four
      are green and report the output as it is.

## 8. Documentation and the review gate

- [ ] 8.1 Update `docs/roadmap.md`: mark phase 3 implemented, record the four decisions
      this change settled and answer its three open questions. Verify the phase 3 section
      names the record shape, the entry point, the suppression rule and the marker look.
- [ ] 8.2 Update `README.md` with the entry point and a short example of `addSystems`.
      Verify the example matches the handle the code exposes.
- [ ] 8.3 Run the implementation review gate: launch the
      `openspec-implementation-reviewer` subagent with this change id, act on its
      findings, and re-run it after a BLOCK. Verify the verdict and the findings are
      reported to the human.
