# Notes

## 1.1 Baseline bench

Build: unminified, `vite build --minify false`, served on port 4190. Renderer: ANGLE,
Vulkan, NVIDIA GeForce RTX 4080. The raw output is `baseline.json` in the scratch
directory.

| Reading                                        | Design "Before" | Baseline now |
| ---------------------------------------------- | --------------- | ------------ |
| Settle turn, demo set at 4,000 ly              | 0.67 ms         | 0.745 ms     |
| Settle turn, 50k systems, 4 icons, 20,000 ly   | 2.34 ms         | 2.275 ms     |
| Settle window total, 50k                       | 169 ms          | 163.8 ms     |
| Renders in one settle window (demo / 50k)      | about 71        | 72 / 71      |
| Turn while a key is held, 50k                  | 2.45 ms         | 2.519 ms     |
| Render while a key is held, 50k                | 1.68 ms         | 1.757 ms     |
| Turn while a key is held, demo                 | 1.19 ms         | 1.101 ms     |
| `measureFrames`, 50k, sol20000 / default60000  | 3.17 ms         | 4.349 / 2.642 ms |
| Hover turn, 50k (no HUD)                       | -               | 0.664 ms     |

Each settle turn and each held key turn is within 20 per cent of the "Before" column. The
design table does not say which view gives the 3.17 ms `measureFrames` reading.

## 1.2 Start-up, before

Script: `startup.mjs` in the scratch directory. It takes a CDP CPU profile of the main
thread from navigation to `ready`, five cold contexts, and counts `longtask` entries
before the `galaxy-map-ready` event.

| Run | Time to ready | Detail grid decode, main thread (self time) | Long tasks before ready |
| --- | ------------- | ------------------------------------------- | ----------------------- |
| 0   | 818 ms        | 5.0 ms                                      | 2 (250 ms)              |
| 1   | 805 ms        | 5.2 ms                                      | 0                       |
| 2   | 796 ms        | 5.4 ms                                      | 0                       |
| 3   | 815 ms        | 4.9 ms                                      | 0                       |
| 4   | 800 ms        | 4.8 ms                                      | 0                       |

The decode time is the self time of `decodeDetailGrid`, `decodeGreyscalePng`, `inflate`,
`unfilter`, `paeth` and the PNG header readers. Each run fetched the detail PNG once on
the main thread (one resource timing entry). Only the first run, which is the first
context of the browser, had long tasks before `ready`.

## 2.4 Direct style writes on `setStyle` elements

Search: `grep -rn "\.style\.\|\.style\[\|cssText\|removeAttribute('style')\|setAttribute('style'"`
over `packages/galaxy-map/src/app` and `src/hud`, not the tests, then a check of each
element that a `setStyle` call names.

| Element (`setStyle` properties)                                   | Direct writes on the same element                          | Result |
| ----------------------------------------------------------------- | ---------------------------------------------------------- | ------ |
| Grid label (`grid-labels.ts`: the 12 fixed ones, `font`, `opacity`, `color`, and `width`, `height`, `transform`, `z-index` through `writeOnPlane`) | none | clean |
| Cursor marker SVG (`cursor-marker.ts`, through `placeOnPlane`: `width`, `height`, `transform`, `z-index`) | `position`, `left`, `top`, `transformOrigin`, `pointerEvents`, `overflow` at creation | no shared property |
| Category swatch (`categories.ts`: `background`, `box-shadow`, `opacity`) | `border` at creation | no shared property |
| Category list (`categories.ts`: `--gm-list-cap`)                  | none | clean |
| Lightbox picture (`lightbox.ts`: `width`, `height`)               | none | clean |

The other direct writes (`markers.ts`, `labels.ts`, `create-map.ts`,
`dataset-dialog.ts`, `info-panel.ts` chips) are on elements that `setStyle` never
touches. No write changed.

## 2.6 and 2.8 Deviations

- `measureFrames` sets the stale flag before it draws. It draws the view that the caller
  gives, which is not the view of the last render, and the compare would then keep the
  values of a view the map never shows. The design does not name `measureFrames`.
- `setBackgroundReadback` sets the flag where the value changed, and the compare also
  reads the switch. Both are in the design, and they overlap.
- The icon stack sweep rejects a candidate before the projection, not after it. The
  result is the same, and the unit test of 2.2 holds that, ties included.
- A draw from outside the loop (`drawNow`) calls `wake()`, which marks the renderer
  stale, so `drawNow` always renders. The design says this ("a draw from outside the loop
  reach[es] it through `wake()`").

## 2.9 Check with the skip off

The compare in `render` was turned off (`false && !stale && ...`), the demo built, and
"a still map draws at the idle rate and wakes on a change" ran. It failed as expected:
18 turns and 19 draws in 300 ms, against the bound of 3. With the skip on: 18 turns and
1 draw. The source went back to the skip before the next build.

## 2.10 Search for tests that count renders at an unchanged view

Search: `grep -nF ".frames" e2e/*.ts | grep -i framestats`, then a read of each caller.

| Test | Result |
| ---- | ------ |
| `frame-budget.spec.ts` "a still map draws at the idle rate and wakes on a change" | Changed (2.9): the view change half reads the turns and the draws. |
| `frame-budget.spec.ts` "a flight and a held key hold the loop" | Changed: the flight half counts loop turns (`frameIntervalStats`), more than 100. It read 142 turns and 71 draws. The held key half moves the view on each turn and still reads 180 draws. |
| `systems.spec.ts` "dispose stops the map and repeats safely" | Changed: it counted draws in 30 frames after `dispose`, which a still map with a running loop also passes now. It now wakes the map first and compares the loop turns before and after `dispose`. |
| `info-panel.spec.ts:617` "a failed load falls back and does not throw" | Comment changed. The selection flight draws in the 20 frames (it read 3 then 23). |
| `helpers.ts` `hoverFrames`, `heldKeyFrames`; `grid.spec.ts` `animationFrames`; `frame-budget.spec.ts` `intervalOver120Frames` and the read-back interval test | No change. Each one wakes the map or writes the view on each frame. |
| `frame-budget.spec.ts` "an icon texture wakes the loop" and "a pointer move over a still camera renders no canvas" | No change. Both pass. |

Other comments changed: `datasets.spec.ts` (the 700 `drawNow` calls are turns of the
frame work) and `start-view.spec.ts` (600 turns of the frame work).

## Tests added or changed in section 2

- `grid-labels.test.ts`: `labelNumber` against `toLocaleString` over 10,000 seeded values.
- `dom.test.ts`: the kept number formats against `toLocaleString` over 10,000 seeded
  values and the 1/32 step.
- `icon-pass.test.ts`: the sweep with the early reject against `offerNearest` with no
  reject, over 5,000 systems in mirrored pairs, so the set holds ties.
- `plane-overlay.test.ts`: the placement test expects no reads. Two new tests: "the
  placement reads no style back" and "a value the browser gives back in another form is
  written once".
- `picking.test.ts`: "runs no pick for a still pointer" and "picks again when any part of
  the key changes".
- `frame-budget.spec.ts`: new tests "a turn with no change keeps the picture", "the wake
  probe renders on each frame" and "a look write through the probe reaches the screen".
  The last one read 982,248,369 lit, and 982,048,789 both from the loop and from `drawNow`.

## 3.1 Field roles

Two new unit tests in `info-panel.test.ts` open the panel over a fake document (the
unit run has no DOM), with the pattern of `options-panel.test.ts`. They stub
`HTMLElement`, because `focusMark` reads `instanceof HTMLElement`. With the old lookup
by label, both fail: the live write goes into the host field.

## 3.2 Canvas box observer

New browser test "a host resizes the canvas box" in `e2e/render.spec.ts`, at 1280x720 and
ratio 1. Three builds checked it:

| Build | Buffer width | Colour sum in the first frame after the change | Result |
| ----- | ------------ | ---------------------------------------------- | ------ |
| The observer as designed | 600 | 80,132,090 | pass |
| The observer not connected | 1280 | 314,813,690 | fail (width) |
| The callback resizes the buffer | 600 | 0 | fail (empty frame) |

The sum leaves out the alpha byte. The context has no alpha, so an empty buffer reads
255 there, and a sum with alpha passed on the empty frame. `canvasSum` in
`frame-budget.spec.ts` leaves out the alpha byte for the same reason.

## 3.3 and 3.4 Load abort

- Deviation, small: a replaced load that rejects (for example with the `AbortError` of a
  fetch that took the signal) now rejects with the cancelled error, as a replaced load
  that resolves does. Before, it rejected with the host's own error. Without this, every
  host that passes the signal to `fetch` would see `AbortError` in place of the cancelled
  error. A fourth unit test, "a load that rejects on the abort rejects as cancelled",
  holds it.
- The newest controller is dropped when its load settles, so `clear()` does not abort
  the signal of a load that already finished.
- `fetchMultifactionRecords(url, signal)` takes the signal second, so the three unit
  tests that pass a URL do not change. The demo entry calls it with `undefined` for the
  URL.
- New browser test "a second load stops the multifaction download" in
  `e2e/datasets.spec.ts`. The HUD starts no second load while one runs, so the test loads
  through the handle. It read `net::ERR_ABORTED` for the dump request, the cancelled
  error for the first load, `guardian-ruins` on the map and no page error.

## 4.1 and 4.2 Detail grid

- `load.test.ts` gets the new test "carries the detail grid the point cloud worker
  decoded". A worker double answers with the real PNG decoded by `decodeDetailGrid`, and
  the load gives `detailGrid` with 1024 by 1024 values.
- `messages.test.ts`: the scene fixture holds a `detailGrid`, and the test checks that its
  buffer moves.
- New browser test "the page fetches no detail grid of its own" in `e2e/render.spec.ts`.
  Before the change, the start-up script found one page resource entry for the PNG in
  each run (table 1.2). After it, none. The 22 tests of `e2e/stars.spec.ts` pass.

## 4.3 Start-up, after

Same script and method as 1.2, on an unminified build of the change so far.

| Run | Time to ready | Detail grid decode, main thread (self time) | Long tasks before ready | Detail PNG entries of the page |
| --- | ------------- | ------------------------------------------- | ----------------------- | ------------------------------ |
| 0   | 826 ms        | 0 ms                                        | 2 (278 ms)              | 0 |
| 1   | 786 ms        | 0 ms                                        | 0                       | 0 |
| 2   | 782 ms        | 0 ms                                        | 0                       | 0 |
| 3   | 765 ms        | 0 ms                                        | 0                       | 0 |
| 4   | 797 ms        | 0 ms                                        | 1 (50 ms)               | 0 |

The decode is gone from the main-thread profile. The mean time to ready of runs 1 to 4
is 783 ms, against 804 ms before. The first run is the first context of the browser, and
it has the long tasks both before and after. Run 4 had one long task of 50 ms. The
long task count is noise at this sample size.

## Section 5 Tidy

- 5.1: `planeFrame`, `projectOnPlane` and `planeJacobian` in `plane-overlay.ts` hold the
  plane projection and the Jacobian. `planePlacement`, `planeSpanForScreenX` and the grid
  label sweep call them. The sweep writes the Jacobian into one module `Float64Array`, so
  it allocates nothing per label. `plane-overlay.test.ts`, `grid-labels.test.ts` and
  `cursor-marker.test.ts` pass. The changes in the first two files are from task 2.3 and
  from the `labelNumber` test, not from 5.1.
- 5.2: `project` calls `projectWith`. `DragStart` keeps `inverse` and `origin`, and
  `beginDrag` and `dragCursor` call `planePointFrom`. `projection.test.ts` and
  `controls.test.ts` pass with no change for 5.2.
- 5.2 deviation: the kept inverse is the one of the start viewport. Before, each move
  built the inverse from the current viewport. A viewport that changes during a drag
  therefore maps the pixel through the old aspect until the drag ends. A drag and a
  resize at the same time is rare, and the next drag uses the new viewport.
- 5.3: `makeSvg(doc, viewBox, size)` in `hud/dom.ts`. The icon builders of `index.ts`,
  `top-bar.ts`, `categories.ts` and `info-panel.ts` call it. `dom.test.ts` has a test for
  it. The whole `e2e/hud.spec.ts` passes (see 5.11).
- 5.4: `DatasetView` is `ViewInput`, and `viewInsideBounds` takes a `BrowseBounds`.
  Finding: the wiki page of `DatasetView` now reads "`DatasetView` = `ViewInput`", and
  `DatasetEntry.view` and `DatasetInfo.view` show `ViewInput` with no link, because the
  package does not export `ViewInput`. The doc comment still names the fields in prose.
  Before, the page listed the `fit` field. I did not export `ViewInput`, because that adds
  a public name the design does not ask for.
- 5.5: the set keeps `foldedNames`. New test "finds a record added after the filter by a
  mixed-case part of its name" in `real-systems.test.ts`.
- 5.6: `candidateSize` beside `candidateX` and `candidateY`. `markers.test.ts` passes
  unchanged.
- 5.7: `handoverRadii` returns `coveredRadius(distance)` as the outer radius.
  `COVERED_BOXELS` is 3, the same factor as `coveredRadius`. `star-pass.test.ts` passes
  unchanged (23 tests).
- 5.8: deleted `axisymmetricDensity`, `VolumeResponse`, `rayDirection` and
  `PointCloudRequest`, and the `rayDirection` test "gives the same ray as the call that
  inverts the matrix itself" in `projection.test.ts`. The plane point test beside it
  stays, because `planePoint` stays. The load posts `null` to the point cloud worker, and
  the worker reads `DEFAULT_POINT_COUNT` and `DEFAULT_SEED`. The `labels.ts` comment no
  longer names `rayDirection`. `READY_EVENT` in `apps/demo/src/main.ts` is no longer
  exported; `e2e/helpers.ts` keeps its own copy. `grep -rn` finds none of the four names
  in `packages/galaxy-map/src/` and `apps/demo/src/`.
- 5.9: the comment sits directly above `export function createRenderer`.
- 5.10: `HudProbes` in `hud/types.ts` holds `categoryCountMs`. `createHud` returns
  `HudHandle & HudProbes`, and the map and `DebugDeps.hud()` keep that type. The package
  index does not export `HudProbes`. `pnpm docs:wiki` writes `Interfaces/HudHandle.md`,
  and no wiki file holds `categoryCountMs` or `HudProbes`. `tests/main-bundle.test.ts`
  and `e2e/count-cost.spec.ts` pass.
- 5.11: "the HUD adds no work to a still frame" wraps
  `CSSStyleDeclaration.prototype.setProperty` and counts calls on the style of the HUD
  root and each element under it. With 2.3 in place: 0 calls, 0 mutations. With
  `setStyle` put back to the read-back compare: 20 calls in 120 frames, 0 mutations, and
  the test fails on the call count. The mutation count alone did not see these writes.
  The whole `e2e/hud.spec.ts` and `e2e/count-cost.spec.ts` pass: 177 tests with the two
  renderer checks.

## 6.1 Lint and unit tests

`pnpm lint`: no findings. `pnpm test`: 102 files, 1,600 tests, all pass.

## 6.2 Full browser suite

`pnpm build:demo-site`, then `GALAXY_MAP_E2E_BUILT=1 pnpm test:e2e`. The first phase
gave 755 passed (6.0 min), and the timed phase gave 86 passed (3.8 min). No test failed
and no test was flaky, so no further test changed to count loop turns.

## 6.3 Bench, after

Build: unminified, `vite build --minify false`, served on port 4190, the same RTX 4080
through ANGLE and Vulkan. I ran the bench six times on the new build, and four more times
on the baseline build between them, so that each number has a baseline from the same
hour. The table gives the range.

| Reading                                      | Baseline, 5 runs | After, 6 runs  | Design "With P1 to P5" | Limit (+20 %) | Holds |
| -------------------------------------------- | ---------------- | -------------- | ---------------------- | ------------- | ----- |
| Settle turn, demo, 4,000 ly                  | 0.65-0.75 ms     | 0.21-0.25 ms   | 0.21 ms                | 0.25 ms       | yes   |
| Settle turn, 50k, 20,000 ly                  | 2.28-2.44 ms     | 0.22-0.26 ms   | 0.25 ms                | 0.30 ms       | yes   |
| Settle window total, 50k                     | 164-178 ms       | 16.2-19.1 ms   | 18 ms                  | 21.6 ms       | yes   |
| Renders in one settle window (demo / 50k)    | 72 / 71-72       | 0 / 0          | 0                      | 0             | yes   |
| Turn while a key is held, 50k                | 2.46-2.57 ms     | 1.59-1.70 ms   | 1.69 ms                | 2.03 ms       | yes   |
| Render while a key is held, 50k              | 1.67-1.77 ms     | 0.79-0.88 ms   | 0.85 ms                | 1.02 ms       | yes   |
| `measureFrames`, 50k, sol20000               | 4.29-4.36 ms     | 3.40-3.60 ms   | 3.48 ms                | 4.18 ms       | yes   |
| `measureFrames`, 50k, default60000           | 2.64-2.83 ms     | 1.74-1.88 ms   | -                      | -             | -     |
| Turn while a key is held, demo               | 1.10-1.24 ms     | 0.84-0.94 ms   | 0.97 ms                | 1.16 ms       | yes   |

Style probe and CPU profile of a held key on the demo, from the scripts of the review:

| Reading                                   | After    | Design "With P1 to P5" | Limit | Holds |
| ----------------------------------------- | -------- | ---------------------- | ----- | ----- |
| Script time in a 3 s held key             | 162 ms   | 168 ms                 | 202   | yes   |
| CSSOM reads during a held key             | 0        | 0                      | 0     | yes   |
| Style writes during a held key            | 3,373    | 3,378                  | 4,054 | yes   |

Script time is the sampled total less `(idle)`, `(program)` and `(garbage collector)`:
3,002 - 2,766 - 66 - 8 ms.

**The `measureFrames` reading at sol20000 missed its first limit of 2.76 ms.** The table
above gives the corrected column. What the raw files of the
review show:

- The review's two baseline runs (`base1`, `base2`) read 3.17 and 3.16 ms at sol20000.
  That is the design's "Before". Today the same baseline build reads 4.29 to 4.36 ms in
  five runs. The machine gives this view about 37 per cent more GPU time than on the day
  of the review.
- The design's "With P1 to P5" column matches the review's `p123` run (P1 to P3):
  `measureFrames` 2.304 ms, held key 1.617 ms, render 0.814 ms. The review's `p12345` run
  read 3.525 ms at sol20000.
- Against a baseline of the same hour, the change takes 20 per cent off sol20000
  (4.33 to 3.47 ms mean) and 33 per cent off default60000. The design's two columns
  differ by 27 per cent at sol20000.

I did not change the code for this reading. `measureFrames` draws with a GPU wait on
each frame, and no task of this change reduces the GPU work at sol20000.

**Resolution.** The design row took the value of the review's run with P1 to P3. The
review's run with P1 to P5 read 3.53 ms, which is within 20 per cent of the reading of the
apply. The row now gives the same-hour means of the apply day, 4.33 and 3.48 ms, with a
note that the reading moves with the machine. The change takes 20 per cent off it.

## Gate findings, fixed

- The drag keeps the viewport size of its inverse, and builds the inverse again where
  the size changed. A resize during a drag now maps the pointer as the old code did. A
  new test in `controls.test.ts` holds it, and it fails without the fix.
- The design table gives the review's P1 to P5 values for the held key rows, and the
  same-hour means of the apply day for the `measureFrames` row.
- The doc comment of `DatasetView` no longer names the internal file `./view-input`.
