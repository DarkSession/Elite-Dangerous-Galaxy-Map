# Tasks

## 1. The reading on the map

- [x] 1.1 Add `viewInsideBounds(bounds: BrowseBounds | null): boolean` to `DatasetWriter` in
      `packages/galaxy-map/src/app/datasets.ts`, with a doc comment that states it applies
      nothing, that the caller reads it before `setBounds`, and that it is false for bounds
      that resolve to unrestricted. Verify `pnpm exec tsc --noEmit` then fails at every
      construction of a `DatasetWriter`: the call in `create-map.ts` and the 13 call sites of
      the one `writer()` factory in `packages/galaxy-map/src/app/datasets.test.ts`.
- [x] 1.2 Implement it in `packages/galaxy-map/src/app/create-map.ts`, beside
      `applyDatasetBounds`. Read `asked = bounds ?? optionBounds`. Return false where
      `asked.mode === 'unrestricted'`, and false where `set.systemBox.empty`, whatever the
      mode: `clearSystems` in `src/scene-data/real-systems.ts` sets `boxEmpty` without
      resetting the corners, so an empty box still holds the corners of the set before it and
      condition 5 would read them. Otherwise resolve `asked` against `set.systemBox` into a
      **local** shape and read the cursor and the distance against it. Read condition 5 as
      well: `view.distance` at or above `farZoomLimit` of half the diagonal of
      `set.systemBox`, which is the distance `applyDatasetView` writes for `fit: 'systems'`.
      Take that expression from one shared helper, so the two cannot drift. Pass the member in
      the `createDatasetState` call. Verify `pnpm exec tsc --noEmit` is clean.
- [x] 1.3 Write the "inside" test as a direct predicate, not as a comparison against
      `clampCursor`: each axis between `min` and `max` for a box, `Math.hypot` at or under
      `radiusLy` for a sphere, and `view.distance <= maxDistanceLy` for both. Verify a unit
      test covers a cursor exactly on a sphere's surface, which a clamp round trip reads
      wrongly, one that covers a distance exactly at the frame distance of condition 5, and
      one over an empty set under a `sphere` bound. Put them in
      `packages/galaxy-map/src/app/create-map.test.ts`, which already drives `loadDataset`
      over a canvas that refuses WebGL2.
- [x] 1.4 Verify the member writes nothing: it must not assign `boundsSetting` or
      `resolvedBounds`, and must not call `resolveBoundsNow`, `reclampView`, `announce` or
      `wake`. Verify by a unit test in `packages/galaxy-map/src/app/create-map.test.ts` that
      reads `getBounds()` and `getView()` before and after a load whose view is held.
- [x] 1.5 Verify the member walks no record: it reads `set.systemBox`, the `bounds` argument
      and `view` only. Confirm by reading the code that it calls nothing that iterates the
      set.

## 2. The rule in the load

- [x] 2.1 In `runLoad` of `packages/galaxy-map/src/app/datasets.ts`, take the reading **after**
      `options.write(content)` and **before** `options.setBounds(...)`, passing the same
      `entry.bounds ?? null` expression that `setBounds` takes. Applying a bound clamps the
      camera into it, so a reading taken later is true for every restricted bound. Verify with
      the unit test of task 3.5, which fails if the two calls are swapped.
- [x] 2.2 Hold the entry's `view` back when all five conditions of the `dataset-catalog` delta
      hold: the load is not the start load, `entry.bounds !== undefined`, the `view` names
      `fit: 'systems'` and no other field, and the reading of task 2.1, which carries
      conditions 4 and 5, is true. Verify with the unit tests of task 3.2.
- [x] 2.3 Write the condition that reads "`fit` and no other field" as one named helper with a
      doc comment, so a later field added to `DatasetView` fails the helper rather than
      slipping through. Verify a unit test covers a `view` with each other field in turn.
- [x] 2.4 Verify the reading happens only where the first three conditions already hold, so a
      load that cannot be held does no geometry and no resolve.

## 3. The unit tests

- [x] 3.1 Give every fake writer in `packages/galaxy-map/src/app/datasets.test.ts` the new
      member, returning **false** by default, so the existing expectations stand. Verify the
      existing test `writes the bounds and the view of the entry that loaded` still passes
      unchanged.
- [x] 3.2 Add tests over the fake writer: the view is held when all five conditions hold; it
      is applied when the entry names no `bounds`; when the reading is false; when the `view`
      names any field beside `fit`; when the camera is nearer than the frame of the new set,
      which is condition 5; and on the start load. Verify `pnpm test` passes.
      **Five tests, not six. Condition 5 lives inside `viewInsideBounds`, which the fake
      writer replaces with a constant, so over that writer it is the same case as "the
      reading is false". Condition 5 is read where the geometry is:
      `holds the view at the frame distance and frames it below` in `create-map.test.ts`
      reads the frame distance and one light year under it, and `a camera zoomed in closer
      than the frame is framed again` in `e2e/datasets.spec.ts` reads it in the browser.**
- [x] 3.3 Add a test that a held view calls `applyView` **zero** times, not once with the
      current view, so the map's `jumped` flag and its announce do not run. Verify the fake
      writer records no call. **The assertion sits inside `holds the view where the camera
      already shows the new set` in `datasets.test.ts`, and not in a test of its own: that
      test already drives the held load, and the one `applyView` its reading allows is the
      start load's.**
- [x] 3.4 Add a test that a held load does **not** drop a pending start view: the fake writer
      records no `applyView` call, and a `startView` naming a record the second set holds still
      centres the camera when that set arrives. Put it in
      `packages/galaxy-map/src/app/create-map.test.ts`, which is where `pendingStart` is
      reachable. Verify it fails if the held path calls `dropPendingStart`.
      **The landing is read in the browser and not in the unit test. `applyPendingStart`
      runs in the frame loop alone, and the loop needs a WebGL2 context, which the canvas
      of `create-map.test.ts` refuses. The unit test there reads that a held load raises no
      view change and moves no camera, and that the load still wrote the entry's bounds. The browser test `a held load lets a pending start
      view land` in `e2e/datasets.spec.ts` reads the landing: the camera centres on
      (1000, 0, 1000) and keeps its 60,000 light year distance.**
- [x] 3.5 Add a test that fixes the **order**: a fake writer whose `setBounds` records the
      call and whose `viewInsideBounds` records the call, asserting the reading came first.
      Verify it fails when the two lines are swapped.

## 4. The browser tests

- [x] 4.1 Add the ten scenarios of the `dataset-catalog` delta to `e2e/datasets.spec.ts`: a
      step inside the bounds holds the camera; a camera outside the new bounds is framed; a
      camera zoomed in closer than the frame is framed again; a camera zoomed out past the
      frame keeps its view; an entry with no bounds still frames; a named field beats a camera
      inside the bounds; the start load frames although the camera is inside its bounds; an
      `auto` bound over an empty set applies the view, read through an interrupted flight; and
      a held view lets a running flight land; and a held load lets a pending start view land.
      Verify each passes on the hardware renderer.
- [x] 4.2 Check the existing test `opens the camera on the box of the cycle it loads` in
      `e2e/cycles-page.spec.ts`. It steps from cycle 0 to cycle 1 without touching the camera,
      and condition 5 re-frames that step, so it **passes and for the right reason**. Verify
      that by running it, and do not weaken it. Add a comment saying that it now reads
      condition 5, not the old unconditional frame.
- [x] 4.3 Add the two scenarios of the `thargoid-war-cycles-page` delta to
      `e2e/cycles-page.spec.ts`: stepping to the next cycle holds the view, and a camera taken
      outside the bounds is framed again. Verify both pass.
- [x] 4.4 Verify the existing scenarios of `e2e/datasets.spec.ts` that ride the same path still
      pass: `` `fit` frames the set ``, `` `fit` ends a running flight ``, `` `fit` ends the
      wheel glide ``, `a named field wins over `fit`` and `a deep link beats the entry at
      start`. Each names no `bounds`, so condition 1 holds the old behaviour for it.
- [x] 4.5 Verify `the Thargoid war set restricts the bounds and frames itself` in
      `e2e/datasets.spec.ts` still passes, and record **why** in a comment on the test. The
      demo page's `thargoid-war` entry names `bounds: { mode: 'auto' }` and
      `view: { fit: 'systems' }`, so conditions 1 to 3 hold. It still frames because the
      default camera distance of 60,000 light years is above that entry's far zoom limit of
      3,816, so condition 4 fails. That margin is the reason the demo page is unaffected
      and it is written down nowhere today.
      **The reading: the test passes. The bounds are `auto`, the set holds 189 systems and
      the camera stands at 370.22 light years, which is the entry's own frame. The far zoom
      limit of that box is 3,815.93 and the page opens at 60,000, so condition 4 fails and
      the entry frames as it did.**
- [x] 4.6 Verify the two 40 ms measurements still pass, and record both readings:
      `a full set switches inside the 40 ms budget with the dialog open` in
      `e2e/dataset-cost.spec.ts`, and `a full set of 50,000 systems switches inside the 40 ms
      budget` in `e2e/datasets.spec.ts`. Each has a `full-b` entry that names
      `bounds: { mode: 'auto' }` and `view: { fit: 'systems' }`, so both are on the new path.
      The check adds a fixed amount of arithmetic, so the readings should not move; say so
      with the numbers if they do.
      **The readings, both on one worker: 34 ms with the dialog open, and 30.40 ms without
      it. Both are under the 40 ms budget, and both sit inside the 30 to 36 ms band
      `e2e/dataset-cost.spec.ts` already records for a one-worker run.**
- [x] 4.7 Verify `e2e/canonn-page.spec.ts` still passes, and record the result.
      `apps/demo/canonn/main.ts` gives all 114 entries `bounds: { mode: 'auto' }` and
      `view: { fit: 'systems' }`, so that page is on the new path as well. The proposal states
      the measurement and why a hold there is wanted. If a test asserts a camera move across a
      load, read it against the five conditions before you touch it.
      **The reading: all 9 tests pass, unchanged. No test of the page asserts a camera move
      across a load, so none was touched. The one `setView` in the file runs after a load,
      not across one. The largest entry loads at a mean frame interval of 16.68 ms and the
      pick reads 0.71 ms, both inside their budgets.**

## 5. The documentation

- [x] 5.1 Update the TSDoc on `DatasetView` and on `DatasetEntry.view` in
      `packages/galaxy-map/src/app/datasets.ts`, which is what the generated wiki reference is
      built from. State the five conditions and the two ways a host keeps the old behaviour:
      name a field beside `fit`, or drop `bounds` from the entry. Verify `pnpm docs:wiki`
      builds and the page carries the new text.
- [x] 5.2 Add a paragraph to `docs/wiki/Examples/A-dataset-catalog.md` stating the rule. The
      page describes no camera behaviour today, so this is new prose and not an edit. Verify
      `pnpm docs:wiki` builds.
- [x] 5.3 Verify no page of `docs/wiki/` and no comment of `apps/demo/` states that a load
      always applies the entry's view. Correct each that does. Two are known:
      `apps/demo/cycles/main.ts` says "A switch to another cycle replaces the records and
      opens the camera on the new box", which the change makes false; and
      `apps/demo/src/main.ts` says the `thargoid-war` entry "opens the camera on it", which
      stays true only by the margin task 4.5 names, so it has to say why.
- [x] 5.4 Verify the `map-navigation` delta reads true against the code: the sentence that
      states `fit: 'systems'` opens on the systems now carries the exception. Check no other
      wiki page repeats that sentence unqualified.

## 6. The gates

- [x] 6.1 Run `pnpm lint`, `pnpm exec prettier --check .` and `pnpm exec tsc --noEmit`, and
      verify all three are clean.
- [x] 6.2 Run `pnpm test`, then separately `pnpm test:e2e` — one Playwright run at a time —
      and verify both are green. Report the results as they were.
- [x] 6.3 Run the `openspec-implementation-reviewer` subagent on this change, fix what it
      blocks on, and re-run it. Report the verdict and every finding, including the ones not
      acted on and why.
