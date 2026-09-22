## 1. The helpers, the dead members and the readers

- [x] 1.1 Add `packages/galaxy-map/src/math.ts` with `smoothstep`, guarded as
      `grid-pass.ts:104` is, and `clamp` as `camera/view.ts:46` is. Import them in the
      six `smoothstep` sites and the two plain `clamp` sites, and delete the copies.
      Rename the guarded clamp of `app/labels.ts:165` to say what it does. Verify with
      a unit test in `src/math.test.ts` that `smoothstep(1, 1, 1)` returns 1 and not
      `NaN`, and that `pnpm lint` and `pnpm test` pass.
- [x] 1.2 Add `packages/galaxy-map/src/scene-data/read-field.ts` with `readPoint`,
      `readColor` and `readName`, and import it in `real-systems.ts`, `shapes.ts`,
      `marker-icons.ts` and `create-map.ts`. Delete the copies, and the inlined body in
      `readStartView`. Verify the existing reader tests in `shapes.test.ts`,
      `real-systems.test.ts` and `marker-icons.test.ts` pass unchanged.
- [x] 1.3 Add `packages/galaxy-map/src/app/view-input.ts` with `StartView` and one
      reader, and make `DatasetView` extend it in `datasets.ts`. Delete `readStartView`
      and `readDatasetView`. Verify `datasets.test.ts` and `create-map.test.ts` pass, and
      add one case that the reader rejects a `cursor` of two numbers.
- [x] 1.4 Keep one `setStyle` in `app/plane-overlay.ts`, exported, and import it in
      `app/grid-labels.ts`. Leave `hud/dom.ts` alone. Verify `pnpm lint` passes the
      HUD import rule.
- [x] 1.5 Delete `Controls.isInteracting`, `GalaxyModel.polar` with `toPolar` and
      `PolarPoint`, `GalaxyModel.armCount`, `StarBoxelTable.maskBytes`,
      `StarField.sweptCount`, `StarSuppression.cacheSize`, and `SceneDataOptions.count`
      and `.seed` with their defaults in `load.ts:89-90`. Delete the assertion on
      `field.sweptCount` at `star-field.test.ts:429` with the member, and delete
      `StarSuppression.sweptCount` with it: its readers are `star-field.ts:325, 392`,
      which fed the deleted member, and its own test at `star-suppression.test.ts:251`.
      Verify `grep -rnw` over `packages apps e2e tests` finds no reader of each, and
      `tsc` and `pnpm test` pass.
- [x] 1.6 Drop `export` from `MULTIFACTION_DUMP_URL`, `controlledCategory`,
      `presentCategory`, `DumpSystem` and `FactionRead` in `apps/demo/src/multifaction.ts`.
      Verify `multifaction.test.ts` passes and `pnpm build:demo-site` builds.
- [x] 1.7 In `create-map.ts` `flyTo`, read each of the four fields once into a local and
      drop the `as number` casts. Replace `labelNumber` in `grid-labels.ts` with
      `(Math.round(value) || 0).toLocaleString('en-US')`. Verify `grid-labels.test.ts`
      passes, with a case for `-0.4` giving `0` and `1234567.5` giving `1,234,568`.
- [x] 1.8 Replace the ten `if` lines of `renderer.setPasses` with one loop over the keys
      of `passes`. Verify `renderer.test.ts` passes and a non-boolean value leaves a
      switch as it is.

## 2. The switches, the nebulae and dispose

- [x] 2.1 Give every setter the one rule `if (typeof on !== 'boolean') return;`:
      `setSystemNamesVisible`, `setGridVisible` and `setCursorMarkerVisible`. Rename
      `getCursorMarkerVisible` to `isCursorMarkerVisible` in the interface, the object,
      `e2e/cursor-marker.spec.ts` and any wiki page under `docs/wiki/` that names it.
      Verify with a unit test in `create-map.test.ts` that reads the seven switches,
      calls each setter with `'yes'` and `undefined`, and reads them again unchanged.
- [x] 2.2 Add `setNebulaDraw(on)` to the renderer, held as `nebulaDraw` and ANDed with
      `passes.nebulae` where the nebulae draw. Make `setNebulaeVisible` and the attach
      path at `create-map.ts:1961` write it instead of `setPasses`. Verify with a
      browser test in `e2e/nebulae.spec.ts`: `debug.setPasses({ nebulae: false })`, then
      `areNebulaeVisible()` reads true, the drawn count is 0, and
      `setNebulaeVisible(true)` leaves it 0.
- [x] 2.3 Add `clear()` to `LabelOverlay` in `labels.ts`, which removes every shown
      element and resets the pool memory, and call it in `dispose`. Verify with a
      browser test that opens a map with a host-given `labelHost` at a view with region
      labels, disposes, and counts 0 children in that host.
- [x] 2.4 In `controls.dispose`, release the drag, orbit and touch pointer captures
      inside a `try` before the listeners come off. Verify with a unit test in
      `controls.test.ts` that a `pointerdown` then `dispose` calls
      `releasePointerCapture` with that id.

## 3. The renderer frame and the debug object

- [x] 3.1 In `renderer.drawFrame`, compute `cursorOffset` and the volume centre once at
      the top. Put the sixteen per-frame readings in one `frame` object reset at the top,
      and move the overlay stage (grid through icons) into `drawOverlays(frame)`. Verify
      `pnpm test:e2e` passes with every screenshot baseline unchanged.
- [x] 3.2 Move `GalaxyMapDebug` and its object into `src/app/debug.ts` as
      `createDebug(deps)`. Replace the 41 debug forwards of
      `apps/demo/src/main.ts:359-400` with one loop over the keys of the object that
      forwards function members alone, so the getters `look` and `renderer` are read
      once and dropped by their value; keep `getView` and `setView`, which are handle
      members, and the `renderer` accessor at `main.ts:425` as they are. The loop widens
      `window.__galaxyMap` from 41 names to every function member of the debug object.
      Add the four new probes to `GalaxyMapGlobal` in `src/render/global.ts`. Verify
      `pnpm test:e2e` passes, which reads every probe.

## 4. The read-back

- [x] 4.1 Split `cycle.frame` in `background-pass.ts` into `take()` and `start()`, drop
      the call from `render`, and time each take with `performance.now`. Add
      `readbackStats()` and `resetReadbackStats()` to the renderer and the debug object.
      Verify `background-pass.test.ts` passes with a case that `take` before any `start`
      reads nothing.
- [x] 4.2 Call `take()` as the first statement of `renderer.drawFrame`, and `start()`
      after the background chain only when the frame asks for a reading. Pass the ask
      from `create-map`: the grid is on and the grid labels placed a label in their last
      update. The renderer starts one on its own until a first reading lands. Verify with two browser tests, the timed one in
      `e2e/readback-cost.spec.ts` (in `timedSpecs`) and the other in `e2e/grid.spec.ts`:
      grid on at 4,000 light years and a pitch of 5 degrees with a
      movement key held for 120 frames reads a count above 100 and a mean of 0.50 ms or
      less (five readings gave 0.35 to 0.44 ms, and the old position 1.37 ms); grid on at 4,000 light years and a pitch of 0 degrees, where
      `gridLabelReadings()` is empty, with the key held reads a count of 0 and a
      `backgroundSize()` of 120 by 68.
- [x] 4.3 Verify the label reads a reading that landed: grid on at a pitch of 5 degrees,
      three frames, `backgroundFrame()` is present and its size matches the spec.
      Verify the existing grid label contrast tests pass unchanged.

## 5. The loop

- [x] 5.1 Add `onReady` to `createIconTextures`, called after `entry.state = 'ready'`,
      wired as an `onChange` option of `createRenderer` and set to `wake` in
      `create-map`. Verify `icon-textures.test.ts` calls it once per landed texture.
- [x] 5.2 Make `wake()` restart a stopped loop and return at once on a disposed map,
      call it from `onInput` in `create-map`, make the loop stop when it is not awake
      and holds no pending start, no flight and no pointer mark, and delete
      `IDLE_DRAW_MS` and `drawnAt`. Verify with a unit test in `create-map.test.ts` that
      `setGridVisible(true)` after `dispose` requests no animation frame. Add `wake()` to the
      debug object, and call it each frame beside the pointer move in the four loops
      that hold the map awake: `hoverFrames` of `e2e/frame-budget.spec.ts`, its copy in
      `e2e/canonn-page.spec.ts`, and the `waitForFunction` loops of
      `e2e/grid.spec.ts:2668` and `e2e/labels.spec.ts:636`. Verify the still test reads
      0 draws and 0 turns over two seconds, the view, switch and icon-texture scenarios
      each draw, and every reading the four loops take holds its bound.
- [x] 5.3 Make `onPointer` set a pointer mark and restart the loop without moving
      `awakeUntil`. Add `overlayFrame()`, which runs `pickSystem` and `markers.update`
      alone, and run it on a turn that is not awake and holds the mark. Verify with a
      browser test: 1,000 systems, the settle window out, the pointer moved across the
      canvas for three seconds, 0 drawn frames, and the hover ring under the pointer.
- [x] 5.4 Verify a flight, a wheel notch and a held key wake and hold the loop: after the
      settle window, `flyTo` over three seconds draws more than 100 frames, one wheel
      notch draws more than 10 frames in the next 300 ms, and a `W` pressed and held for
      three seconds draws more than 100 frames. Add the three readings to
      `e2e/frame-budget.spec.ts`.

## 6. The sweeps and the epoch

- [x] 6.1 Add two flat views to `createSystemSet` (`drawRanges` already holds the stack
      limit per record): the icon start and count per
      record, the icon vector list, and the stack limit per record, filled where
      `drawRanges` is. Make `iconPass.prepare` read them and never call `set.system` or
      `set.category`. Change the two tests at `icon-pass.test.ts:463` that spy
      `set.system` to spy the getters of the three views: no read in the no-icon case,
      a read in the control. Add an `iconSweepMs` probe. Verify with a browser test that
      50,000 systems with 4 icons each read a mean of 1.2 ms or less over 120 frames.
- [x] 6.2 Add `projectWith(matrix, point, viewport)` to `projection.ts` and build the
      matrix once per call in `labels.sampleFrame` and `gridLabelPlacements`. Verify
      `projection.test.ts` shows `projectWith` equal to `project` on ten points, and the
      label placement tests pass unchanged.
- [x] 6.3 Add `viewEpoch` in `create-map`, incremented in `announce` and `onResize`, and
      the early return on a matching epoch around the `gridLabelPlacements` call in the
      `update` of `createGridLabelOverlay`, with the memo in that closure, not in the
      pure function and not around the background read. Leave `readSet` and the region
      label sampling out. Verify with a unit test that two updates with one view call
      `gridLabelPlacements` once and apply the background twice, that the contrast test at
      `e2e/grid.spec.ts:2180` and the two 300-frame sampling tests at
      `e2e/labels.spec.ts:632` and `e2e/grid.spec.ts:2664` pass, and `pnpm test:e2e`
      passes.
- [x] 6.4 Cache the density and the zone per boxel in `readSet`, keyed on
      the string key `star-suppression` uses (a boxel index is a 3-tuple, so no numeric
      key exists), capped at 8,192 and cleared on a model change. Verify with
      a unit test in `star-field.test.ts` that a second read of the same set calls the
      model's density once per new boxel and not per boxel.
- [x] 6.5 Move the four constant writes of `writeOnPlane` (`position`, `left`, `top`,
      `transform-origin`) to the element factories in `grid-labels.ts` and
      `cursor-marker.ts`, and leave `setStyle` as it is. Verify `plane-overlay.test.ts`
      shows a placement reads and writes four properties, and the cursor marker and grid
      label browser tests pass unchanged.

## 7. The reading, the docs and the gate

- [x] 7.1 Run `pnpm lint`, `pnpm test` and `pnpm test:e2e`, one Playwright run at a time,
      and record the frame budget readings in this file. Readings of 2026-09-22: lint
      clean; 1,582 unit tests pass in 102 files; `pnpm test:e2e` passes 718 tests in the
      parallel pass and 82 in the timed pass. Frame budget, held key: 1.075 ms at the
      origin and 0.961 ms at the core at 10 ly; 1.471 and 1.354 ms with 50,000 systems;
      1.651 ms with 50,000 markers in range. Region overlay 1.091 ms at 4,000 ly and
      1.461 ms at 12,000 ly. Every 120-frame interval reads 16.665 to 16.667 ms. The
      read-back reads a mean of 0.35 ms and a worst of 1.30 ms over 120 frames with 8
      labels placed. The label sweep reads 0.187 ms mean over 300 frames.
- [x] 7.2 Read the entry chunk size with `pnpm test:package` and set `ENTRY_CHUNK_LIMIT`
      in `tests/main-bundle.test.ts` with a history comment that records the reading. The
      reading comes from `tests/main-bundle.test.ts` under `pnpm test`, which builds the
      library; `pnpm test:package` reads the tarball. The entry chunk holds 279,529
      bytes, from 276,570 on the commit before, and the bound rises to 285,000.
- [x] 7.3 Update `docs/wiki/` where it names `getCursorMarkerVisible` or the setter rule,
      and check `pnpm docs:wiki` builds. `docs/wiki/` names neither, so no page changes.
      The build script keeps a `#anchor` on a rewritten link, because the generated
      `DatasetView` page now links into `StartView`, and `pnpm docs:wiki` builds.
- [x] 7.4 Launch the `openspec-implementation-reviewer` subagent with the change id,
      fix on BLOCK, re-run, and present the verdict with the findings. The gate returned
      APPROVE WITH NOTES on 2026-09-22 with nine findings. Eight are fixed in the tree:
      the renderer holds the read-back bootstrap, so the frame that lands the first
      reading starts no second copy; the loop counts an interval for a drawn frame only;
      the `RECORD_VALUES` comment, two exports, two test comments, the empty-set
      suppression test and the D6 premise. The nebulae arm of the switch test stays as
      it is, because `e2e/nebulae.spec.ts` reads the switch with a nebula source.
