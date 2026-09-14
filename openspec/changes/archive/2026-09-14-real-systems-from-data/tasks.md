## 1. The category table, the record reader and the system set

- [x] 1.1 Add `src/scene-data/real-systems.ts` with the `Category`, `CategoryTable`,
      `RealSystem`, `RealSystemSet`, `AddReport` and `CategoryReport` types, the capacity
      constants of 10,000 systems and 256 categories, and the suppression radius of 3
      light years. Verify `pnpm build` checks the types.
- [x] 1.2 Read the model bounds from the parameter document in the reader, without the
      detail grid. Verify a unit test reads the same bounds the model reports.
- [x] 1.3 Implement `addCategories`: the required `name`, the `color` of three numbers
      from 0 to 255, the optional `description` dropped when it is not a string, every
      other field dropped, the name as the identity with a replace that keeps the
      category's table index and works on a full table, the bound of 256 and the report
      with `no-name`, `bad-color` and `over-capacity`. Bump a table version on every
      change. Verify the six category unit tests pass, "A replaced category keeps its
      index" and "A wrongly typed description is dropped" included.
- [x] 1.4 Implement `createSystemSet` and `addSystems`: the required `name`, `coords` and
      `primaryCategory`, the optional `secondaryCategories` with a repeat and the primary
      dropped and the whole field dropped when it is not an array, the seven optional
      fields, `id64` as a decimal string from a number, a string or a `bigint`, and every
      other field dropped. Verify the unit tests for the EDSM record, the Spansh record,
      the secondary categories, the unknown secondary category and the large `id64` pass.
- [x] 1.5 Implement `clearSystems`, which empties the set, and
      `clearSystemsAndCategories`, which empties the set and the category table together
      and raises both version counters. Leave no call that removes one category. Verify
      a unit test on the reader: after the paired clear the set is empty, a record that
      names a category of the emptied table is rejected as `unknown-category`, and the
      next calls accept 256 categories and 10,000 records. Task 7.12 checks the same call
      through the handle.
- [x] 1.6 Implement the reject report with the six reasons, `no-category` and
      `unknown-category` included, and the identity rule that replaces a record with the
      same `id64` or the same `name`. Verify the unit tests for each reason, for the
      replace and for the capacity bound pass.
- [x] 1.7 Hold the identity of each system in a `Map` from the identity string to the
      slot in the set, so `addSystems` does not scan the set for each record. Verify a
      unit test adds 10,000 records to an empty set and 10,000 more that all replace, and
      that each call takes under 50 ms.
- [x] 1.8 Hold the positions in one `Float64Array` and the primary category index in one
      `Uint16Array`, and bump a set version counter on every change. Verify a unit test
      reads both arrays and sees the version rise on an add, on a replace and on a
      clear.

## 2. Suppression on the CPU

- [x] 2.1 Add `src/scene-data/star-suppression.ts` with the per-class index: a map from
      boxel index to the systems inside the boxel grown by the suppression radius, with
      a system entering up to 8 entries. Verify a unit test finds a system from each of
      the 8 boxels that its grown box touches.
- [x] 2.2 Implement the sweep of one boxel: generate its placed star positions with
      `starOffsets` and return the 8 words of the bit mask. Verify the unit tests "A star
      inside the radius goes and one outside stays" and "The suppressed set does not
      depend on the camera" pass.
- [x] 2.3 Add the cache keyed by size class and boxel index, cleared on a version change
      and above 8,192 entries, and expose the number of boxels the last build swept.
      Verify the unit test "A camera move computes only the boxels the move brought in"
      reads 512 and then at most 64.
- [x] 2.4 Verify the unit test "Only the base class suppresses" passes, and that no sweep
      runs for a size class above the base.

## 3. The star field carries the mask

- [x] 3.1 Give `createStarField` the system set, sweep the base class block when the
      drawn set or the version changes, and write the mask buffer beside the boxel table.
      Verify a unit test reads a mask row for a boxel that holds a system and a zero row
      for one that does not.
- [x] 3.2 Rename `drawnStarCount` to `placedStarCount` and `systemCount(density, volume)`
      to `systemsInVolume` in `src/scene-data/star-field.ts`, and update every caller and
      test. Verify `pnpm build` and `pnpm test` are green.
- [x] 3.3 Divide the boxel's light by the drawn count, which is the placed count less the
      suppressed stars, and keep the radius on the placed count. Verify the unit tests
      "Suppression does not change a boxel's light" and "Suppression does not change the
      star radius" pass.
- [x] 3.4 Report the drawn count and the suppressed count from the table. Verify a unit
      test reads both over a set with and without systems.
- [x] 3.5 Confirm the existing close-view-stars unit tests still pass with an empty system
      set. Verify `pnpm test` is green.

- [x] 3.6 Move `STARS_PER_BOXEL` to `src/scene-data/boxel.ts`, which already owns the
      star placement and imports neither module, and read it from there in
      `star-field.ts`, `star-suppression.ts`, `star-pass.ts` and their tests. The mask
      width `MASK_WORDS` reads the constant at the top level, so the pair
      `star-field.ts` and `star-suppression.ts` must not import each other's values:
      the unbundled dev server evaluates the two in order and the constant would sit in
      its temporal dead zone. Verify the dev server draws the map with no console error.

## 4. The star shader drops a suppressed star

- [x] 4.1 Upload the mask as an `R32UI` texture of 8 texels by one row per record in
      `src/render/star-pass.ts`, with a `uSuppress` uniform that is 0 when nothing is
      suppressed. Verify `compileTestProgram` accepts the new shader.
- [x] 4.2 Read the mask in `src/render/shaders/stars.vert` and give a suppressed star no
      size and a clipped position. Verify the browser test "A frame reports the suppressed
      count" passes.
- [x] 4.3 Verify the browser tests "The same view gives the same frame with systems
      loaded", "Systems lower the sum and not the bound" and "Loading systems does not
      change the galaxy's brightness" pass.

## 5. The invented field fades out as the camera comes in

- [x] 5.1 Add the close fade to `src/render/renderer.ts`: a smoothstep of the zoom
      distance that is 0 at 640 light years and below and 1 at 2,560 and above. Give
      `star-pass.ts` the handover weight times the close fade, and give `point-pass.ts`
      the handover weight unchanged, so the faded light leaves the frame instead of moving
      to the point cloud. Keep the draw guard at line 341 on the handover weight alone,
      not on the product, so the field still builds its table, the sweep still runs and
      both counts still report below 640 light years. Verify the unit tests "The close
      fade follows the zoom distance", "The two fades sum to one" and "The close fade
      takes light out of the frame" pass, and that neither
      `stars.vert` nor `points.vert` changes.
- [x] 5.2 Add `setCloseFade` to the renderer and to the handle's `debug` member: a number
      from 0 to 1 holds the fade, `null` gives it back to the zoom distance. Verify a unit
      test reads the held value and then the zoom distance value after `null`.
- [x] 5.3 Verify that the close fade changes no count: the placed count, the drawn count
      and the star radius do not read the fade, and the sweep runs whatever the fade is.
      Verify `pnpm test` is green and the existing "The bound holds at every view" and
      "Six close views under budget" browser tests still pass at every listed view,
      475,136 vertices included.
- [x] 5.4 Update the three readings in `e2e/stars.spec.ts` that pin the field at
      `#c=0,0,0&d=500&p=35&y=0` to hold the close fade at 1: "The field alone rises above
      the background", "The field has grain" and "The switch removes the field". Add the
      new reading "The field adds no light at the close zoom distances", which opens the
      same view without the override. Verify all four pass.
- [x] 5.5 Update the two determinism readings, "The same view gives the same frame by any
      route" and "The same view gives the same frame with systems loaded", to hold the
      close fade at 1. Verify both pass and the two image files are byte-identical.
- [x] 5.6 Verify the browser tests "The invented field goes as the camera comes in", "A
      real system stays when the invented field goes" and "The point cloud does not take
      the faded light back" pass. The last one reads the densest close view,
      `#c=15,0,25895&d=500&p=35&y=0`, which is where a point sample handed the field's
      light would show as a saturated block.

- [x] 5.7 Make the handover weight read the zoom distance alone while the field stands,
      in place of `drawsStars ? starWeight(distance) : 0`. The `stars` switch then does not
      move the point cloud, so the frame at 640 light years is byte-identical with the star
      pass on and with it off. Keep the weight at 0 while the field has not loaded, so the
      first frames of a close view are not empty. Verify "The invented field goes as the
      camera comes in", "A real system stays when the invented field goes", "The handover
      keeps the light" and "The far view is unchanged" pass.

## 6. The marker pass

- [x] 6.1 Add `src/render/shaders/systems.vert` and `systems.frag`: a point sprite whose
      CSS diameter is `clamp(focalCss * 20 / range, 7, 12)` and whose `gl_PointSize` is
      that times the device pixel ratio, with `focalCss` the renderer's device-pixel
      `focal` over the ratio; a core colour read from a per-vertex attribute; a ring of
      (0.02, 0.04, 0.10) over the outer 2 CSS pixels; and an antialiasing ramp confined to
      the outer 1 device pixel. Verify `compileTestProgram` accepts both.
- [x] 6.2 Add `src/render/system-pass.ts` with the ring colour constant, the position
      buffer and the per-frame rebase from the `Float64Array`. Verify a unit test checks
      the rebase against the `float64` result over 1,000 positions.
- [x] 6.3 Build the per-system colour buffer in `system-pass.ts` from the `Uint16Array`
      of category indices and the category table, and upload it when the set version or
      the table version changes, not each frame. Verify a unit test reads the buffer for
      three systems of two categories, and reads it again after a category is replaced
      under the same name.
- [x] 6.4 Draw the pass in `src/render/renderer.ts` after the tone map and after the
      region overlay, with alpha blending and no depth test, and add the `systems` switch
      and the drawn marker count. Verify the browser test "The switch removes the markers"
      passes.
- [x] 6.5 Verify the browser tests "A marker shows at every zoom distance", "The size
      falls to the floor and rises to the cap", which reads the cap at a range of 500
      light years, because the 60 degree field of view at the 720 rows the browser suite
      renders puts the cap boundary at about 1,040; "The marker colours reach the frame
      over both grounds", "The colour follows the category and not the position", "A
      recoloured category recolours its markers", "The page reports the marker count",
      "Two markers overlap in the order the set holds them" and "A region boundary does
      not cover a marker" pass.
- [x] 6.6 Verify the unit test "Position error at the far corner" holds 0.01 light years
      at every listed cursor and zoom distance.

## 7. The library entry point

- [x] 7.1 Add the frame time accumulator to `src/render/renderer.ts`: each frame the loop
      draws adds its time to a mean, a worst and a count, with a reset. Build it like the
      label sweep's `sampling`. Verify a unit test reads the three numbers over 10 frames
      of known time.
- [x] 7.2 Add a cancel signal to `loadSceneData` in `src/scene-data/load.ts`, and
      terminate every worker it started when the signal fires. Verify a unit test aborts a
      load and sees each worker terminated.
- [x] 7.3 Move the bootstrap into `src/app/create-map.ts` as
      `createGalaxyMap(canvas, options)`: build the context, start the scene-data load,
      own the frame loop, and return a handle with `addCategories`, `addSystems`,
      `clearSystems`, `clearSystemsAndCategories`, `systemCount` and `ready` in the same
      tick. Verify `pnpm build` checks the types.
- [x] 7.4 Move the view state, the controls and the label overlay into the entry point,
      and add `getView`, `setView` and `onViewChange`. Take the label host from
      `options.labelHost`, and make one in the canvas's parent when the option is absent,
      so no `getElementById` stays in the library. Verify the browser test "The library
      makes its own label host" passes.
- [x] 7.5 Put every renderer probe behind the handle's `debug` member, `frameStats` and
      `resetFrameStats` included. Verify `pnpm build` checks the types.
- [x] 7.6 Reject `ready` when the context is null or the renderer is software, leave the
      frame loop unstarted, and keep `addSystems` working. Verify the unit test "No WebGL2
      context rejects ready" and the browser test "The page shows the failure" pass.
- [x] 7.7 Implement `dispose`: stop the frame loop, remove the listeners the map added,
      delete the GPU objects, abort the scene-data load, and make a second call do
      nothing. Verify the browser test "Dispose stops the map and repeats safely" passes.
- [x] 7.8 Reduce `src/app/main.ts` to the demo page: call the entry point, put the handle
      on `window.galaxyMap`, parse the URL fragment into `setView` and write it back from
      `onViewChange`, catch a `ready` rejection into the message box and
      `window.__galaxyMap.error`, and set every `window.__galaxyMap` hook the browser
      tests read from `debug`, `renderer` included. Verify the existing browser tests pass
      unchanged.
- [x] 7.9 Add a `no-restricted-properties` rule to `eslint.config.js` that fails the lint
      on `window.location` in every file but `src/app/main.ts`. Verify `pnpm lint` is
      clean, and fails when a read of `window.location.hash` is put in
      `src/app/create-map.ts`.
- [x] 7.10 Add the test hooks for the marker count, the suppressed count and the frame
      statistics to `src/render/global.ts`, and add `systems` to the `setPasses` parameter
      type. Verify the types build and the hooks read from the page.
- [x] 7.11 Declare `window.galaxyMap` in `e2e/global.d.ts` beside `window.__galaxyMap`.
      Verify `pnpm build` and `pnpm test:e2e` type-check the new spec file.
- [x] 7.12 Verify the browser tests "The handle works before the first frame", "The handle
      empties the set", "The handle empties the set and the table together" and "The page
      writes the fragment from the handle" pass.
- [x] 7.13 Verify the category unit tests run through the handle as well as the reader:
      "A category is read and kept", "Adding the same name replaces the colour", "Each
      category fault gets its own reason", "The table bound rejects the excess", "A
      replaced category keeps its index" and "A wrongly typed description is dropped".

## 8. Budgets and the whole suite

- [x] 8.1 Add the frame budget browser test with 10,000 systems at the eight views, each
      system in a category. Verify each mean is under 16.7 ms.
- [x] 8.2 Add the sweep frame tests to the browser suite, both reading `frameStats` and
      both with 10,000 systems near the camera: a pan of 200 light years at
      `#c=0,0,0&d=1000&p=35&y=0`, and a zoom from 500 to 3,000 light years, which crosses
      the base class boundaries at 640, at 1,280 and at 2,560. The zoom starts at 500
      because `map-navigation` clamps the zoom distance there and the boundary at 320
      cannot be reached. Verify the worst frame of the pan is under 20 ms and the worst
      frame of the zoom is under 50 ms.
- [x] 8.3 Verify the baseline image still matches and the far view is byte-identical with
      an empty set, through "The far view does not change" and "The added passes leave the
      far view alone".
- [x] 8.4 Run `pnpm test`, `pnpm test:e2e`, `pnpm lint` and `pnpm build`. Verify all four
      are green and report the output as it is.

## 9. Documentation and the review gate

- [x] 9.1 Update `docs/roadmap.md`: mark phase 3 implemented, record the six decisions
      this change settled and answer its three open questions. Verify the phase 3 section
      names the record shape, the entry point, the category table, the close fade, the
      suppression rule, the marker look and the twin that survives outside the base class
      block.
- [x] 9.2 Write the purpose of the `close-view-stars` delta into
      `openspec/specs/close-view-stars/spec.md` by hand. `openspec archive` keeps the
      purpose a capability already has, so the old sentence would survive and say the
      field fills the near field at every close zoom distance. Verify the archived spec
      names the close fade.
- [x] 9.3 Update `README.md` with the entry point and a short example that calls
      `addCategories` and then `addSystems`. Verify the example matches the handle the
      code exposes, and say that the invented field fades out below 2,560 light years of
      zoom distance.
- [x] 9.4 Run the implementation review gate: launch the
      `openspec-implementation-reviewer` subagent with this change id, act on its
      findings, and re-run it after a BLOCK. Verify the verdict and the findings are
      reported to the human.
