## 1. Baseline

- [x] 1.1 Build the demo unminified, serve it on port 4190 and run `bench.mjs`, as design D11 says. Save the output as `baseline.json` in the scratch directory. Verify: the settle turn and the held key turn are within 20 per cent of the "Before" column of the design table. Where they are not, record the new numbers in `design.md` before you change code.
- [x] 1.2 Record the start-up cost of the detail grid on the main thread: in a CPU profile of a cold page load, the time in `decodeDetailGrid` and the count of long tasks before `ready`. Verify: the numbers are in the scratch notes for task 4.3.

## 2. Frame path

- [x] 2.1 Format through module-level `Intl.NumberFormat` objects in `labelNumber` (`src/app/grid-labels.ts`) and in `formatWhole`, `formatCoordinate` and `formatLightYears` (`src/hud/dom.ts`). Verify: a unit test compares the old and the new output of each function over 10,000 seeded values, the negative values and 0 among them, and `grep -rn toLocaleString packages/galaxy-map/src` finds no call outside the tests.
- [x] 2.2 Change the icon stack sweep in `src/render/icon-pass.ts` to `Math.sqrt` and to the early reject of design D5. Verify: a new unit test in `icon-pass.test.ts` runs the sweep over 5,000 seeded systems and gets the same kept indices, in the same order, as `offerNearest` without the reject. The existing icon-pass tests pass.
- [x] 2.3 Move `setStyle` to the new `src/app/set-style.ts`, which imports nothing, and keep the last written value in it, as design D3 says. Import it in `plane-overlay.ts`, `grid-labels.ts` and `src/hud/dom.ts`, and delete the copy in `hud/dom.ts`. Verify: the test "the placement reads and writes the four properties that move" in `plane-overlay.test.ts` changes to expect no reads. New tests cover the scenarios "The placement reads no style back" and "A value the browser gives back in another form is written once". The HUD tests pass, and `grep -n "^import" packages/galaxy-map/src/app/set-style.ts` finds nothing.
- [x] 2.4 Search for direct writes of each property that a `setStyle` call names, on the same elements. Change each one to `setStyle`. Verify: the search result is in the task notes, and each direct write it found is gone or is on an element that `setStyle` never touches.
- [x] 2.5 Add the kept hover pick of design D2 to `src/scene-data/picking.ts`. Call it from `drawFrame` and `overlayFrame` in `create-map.ts`. Verify: a new test in `picking.test.ts` covers the scenario "A still pointer runs no pick", and one more case changes each part of the key and sees a new pick.
- [x] 2.6 Add the stale flag, `invalidate()` and the compare of design D1 to `src/render/renderer.ts`. Mark the flag in each setter the design names. Call `backgroundPass.take()` on a skip, and add no sample to `frameStats`. Verify: `pnpm test` passes. The renderer needs a WebGL context, so the browser tests of tasks 2.8 and 2.9 check the skip.
- [x] 2.7 Rename `framesDrawn` in `create-map.ts` to a name that says it counts the turns that ran the frame work, as the delta says for the pending start. Verify: the pending start tests in `e2e/` pass, and the library-package scenario of 600 frames still passes.
- [x] 2.8 Call `renderer.invalidate()` from `wake()` in `create-map.ts`, and call `wake()` from the `look` probe in `src/app/debug.ts`. Verify: the scenarios "The wake probe renders on each frame" and "A look write through the probe reaches the screen" pass as new tests in `e2e/frame-budget.spec.ts`.
- [x] 2.9 Change the scenario "A view change wakes the loop" in `e2e/frame-budget.spec.ts` (the test "a still map draws at the idle rate and wakes on a change") to read the loop turns and the drawn frames, as the delta says. Add the scenario "A turn with no change keeps the picture". Verify: both pass, and the test fails if the skip is turned off, because more than 3 frames then draw.
- [x] 2.10 Change the flight half of "a flight and a held key hold the loop" (`e2e/frame-budget.spec.ts:1305`) so it does not count the renders of the settle window: count loop turns, or expect at least 60 renders in the time of the flight. Update the comment "a still map draws once each 200 ms" in `e2e/info-panel.spec.ts:617`. Verify: both tests pass.

## 3. Bugs

- [x] 3.1 Give each field of `fieldsOf` in `src/hud/info-panel.ts` an optional role, `range` or `region`, and find the live values by the role. Verify: two new tests in `info-panel.test.ts` cover the scenarios "A host value labelled RANGE keeps its value" and "A host value labelled REGION keeps its value". Both fail on the old code.
- [x] 3.2 Add the `ResizeObserver` of design D6 to `create-map.ts`. Its callback raises the view epoch and wakes the loop, and it does not resize the buffer. Disconnect it in `dispose`. Verify: the scenario "A host resizes the canvas box" passes as a new browser test, with the check of a canvas that is not empty in the first frame after the change. The test fails with the observer removed. The scenario "Resize" still passes.
- [x] 3.3 Add the `AbortController` of design D7 to `src/app/datasets.ts`, and type `load` as `load(signal: AbortSignal)`. Verify: three new tests in `datasets.test.ts` cover "A later load aborts the signal of the first", "Dispose aborts a load in flight" and "A load that settles after dispose writes nothing".
- [x] 3.4 Pass the signal to the fetch in `fetchMultifactionRecords` (`apps/demo/src/multifaction.ts`), and terminate the worker on an abort. Verify: the scenario "A second click stops the multifaction download" passes as a new test in `e2e/datasets.spec.ts`.

## 4. Load

- [x] 4.1 Send the decoded detail grid from the point cloud worker, as design D8 says: add `grid` to `PointCloudResponse`, `detailGrid` to `SceneData`, and transfer `grid.values`. Verify: `load.test.ts` sees `detailGrid` with 1024 by 1024 values. A test of `sceneDataTransferables` includes the grid buffer.
- [x] 4.2 Build the star field from `scene.detailGrid` in `create-map.ts`, and delete the main-thread call of `loadDetailGrid`. Verify: a browser test reads `performance.getEntriesByType('resource')` in the page after `ready` and finds no entry for the detail PNG. The worker keeps a timeline of its own, so its fetch is not in this list. The close-view star tests in `e2e/stars.spec.ts` pass.
- [x] 4.3 Measure the start-up again as in task 1.2. Verify: the detail grid decode is gone from the main-thread profile, and the numbers go in the task notes.

## 5. Tidy

- [x] 5.1 Fold the plane projection and the Jacobian into one function each in `plane-overlay.ts`, as design D10 says. Call them from `planePlacement`, `planeSpanForScreenX` and the grid label sweep. Verify: `plane-overlay.test.ts`, `grid-labels.test.ts` and `cursor-marker.test.ts` pass unchanged.
- [x] 5.2 Make `project` call `projectWith` in `src/camera/projection.ts`. Keep the inverse matrix of the start view in `DragStart` and use `planePointFrom` in `dragCursor`. Verify: `projection.test.ts` and `controls.test.ts` pass unchanged.
- [x] 5.3 Add `makeSvg` to `src/hud/dom.ts` and use it in the icon builders of `categories.ts`, `info-panel.ts`, `top-bar.ts` and `index.ts`. Verify: `dom.test.ts` covers `makeSvg`, and the HUD unit tests and `e2e/hud.spec.ts` pass.
- [x] 5.4 Make `DatasetView` an alias of `ViewInput`, with its doc comment. Narrow `viewInsideBounds` to a `BrowseBounds`. Verify: `pnpm lint` and the `datasets.test.ts` tests pass.
- [x] 5.5 Keep the folded name of each record in the set when it is added, and read it in `refreshFlags`. Verify: the name filter tests in `real-systems.test.ts` pass, and a new test adds a record, filters by a mixed-case part of its name, and finds it.
- [x] 5.6 Keep the marker size beside `candidateX` and `candidateY` in `src/app/markers.ts`, and read the three arrays in the name pass. Verify: `markers.test.ts` passes unchanged.
- [x] 5.7 Call `coveredRadius` for the outer radius in `handoverRadii`. Verify: `star-pass.test.ts` passes unchanged.
- [x] 5.8 Delete `axisymmetricDensity`, `VolumeResponse` and `rayDirection`, and the tests of `rayDirection`. Post `null` to the point cloud worker, let the worker read the default count and seed, and delete `PointCloudRequest`. Update the comment in `labels.ts` that names `rayDirection`. Remove the `export` from `READY_EVENT` in `apps/demo/src/main.ts`. Verify: `grep -rn` finds none of the four names in `packages/galaxy-map/src/` and `apps/demo/src/`, and `pnpm lint` and `pnpm test` pass.
- [x] 5.9 Move the doc comment "Creates the renderer and compiles every program" from above `FrameState` to `createRenderer`. Verify: the comment sits directly above `export function createRenderer`, and `pnpm lint` passes.
- [x] 5.10 Move `categoryCountMs` to the internal `HudProbes` type of design D9. Verify: `tests/main-bundle.test.ts`, `e2e/count-cost.spec.ts` and `pnpm lint` pass, and `pnpm docs:wiki` writes a `HudHandle` page with no `categoryCountMs`.
- [x] 5.11 Count `CSSStyleDeclaration.prototype.setProperty` calls on HUD elements in the test "the HUD adds no work to a still frame" (`e2e/hud.spec.ts`), beside the mutation count. Verify: the count is 0 with task 2.3 in place, and more than 0 without it.

## 6. Verification

- [x] 6.1 Run `pnpm lint` and `pnpm test`. Verify: both pass.
- [x] 6.2 Run the full browser suite with `pnpm test:e2e`, with no other Playwright run on the machine. If a test fails because it counted renders at an unchanged view, change it to count loop turns, and name it in the task notes. Verify: the suite passes.
- [x] 6.3 Run `bench.mjs` on the new build, as in task 1.1. Verify: each reading is at or below the "With P1 to P5" column of the design table plus 20 per cent, and the settle window renders 0 frames.
- [x] 6.4 Run the implementation gate: the `openspec-implementation-reviewer` subagent. Verify: its verdict is APPROVE or APPROVE WITH NOTES. On BLOCK, fix and run it again.
