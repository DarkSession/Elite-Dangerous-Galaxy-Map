## Why

A review of the frame path on 2026-09-22 measured work the map repeats while its input
holds still, and a read of the source found dead members, copies of the same helper and
two functions that do five jobs each. The readings, on an RTX 4080 at 1920x1080 with the
camera moving unless the row says otherwise:

| Reading                                                                  | Value             |
| ------------------------------------------------------------------------ | ----------------- |
| Background read-back per frame, in the animation loop                    | 0.40 ms           |
| The same read-back taken at the start of the renderer frame              | 0.19 ms           |
| Full draws in 3 s of pointer moves over a still camera                   | 180               |
| Draws in 3 s of a map nobody touches                                     | 15, 2.3 % busy    |
| Icon sweep, 50,000 systems with 4 icons each                             | 1.49 ms per frame |
| The same sweep without the record and category lookups                   | 1.00 ms per frame |
| Region label sweep over 180 frames                                       | 40 ms             |
| Grid label placement over 180 frames                                     | 31 ms             |
| Star field boxel read over 180 frames                                    | 13 ms             |
| Style reads and writes of the plane overlay over 180 frames              | 18 ms             |
| CPU per drawn frame, default demo set, 4,000 light years                 | 0.46 ms           |

The read-back is the one item that a tight draw loop cannot see: `measureFrames` gives
no gap between frames, so the browser suite reads 0.05 ms where the loop pays 0.40 ms.
A pointer move over a still camera changes the hover ring and one name label, both DOM
elements, and the renderer never reads the hover, yet the map renders the whole canvas
for it. The idle draw every 200 ms exists because one path changes the picture without
a wake, the icon texture that lands after its fetch, so a map nobody touches keeps a
core 2.3 % busy to cover it.

The source holds five dead interface members and a dead chain of three in the galaxy
model, six copies of `smoothstep` of which five divide by zero at `low === high`, three
copies each of `clamp`, `setStyle` and `readColor`, two of `readPoint`, one region label
overlay that leaves its elements in a host-owned label host after `dispose`, one nebula
switch that the renderer probe can silently override, and three visibility setters that
each read a non-boolean a different way.

## What Changes

**The frame path.**

- The background read-back SHALL be taken at the start of the next renderer frame,
  before any draw command, and SHALL NOT be taken while no coordinate label is placed.
- A frame in which nothing but the pointer moved SHALL NOT render the canvas. It runs the
  pick and the overlays alone.
- The frame loop SHALL stop 1200 ms after the last change instead of drawing every
  200 ms. Every path that changes the picture wakes it, and two join the list: the icon
  texture landing, and an input on the canvas, which is a wheel notch or a key press that
  moves nothing until the loop turns. **BREAKING** for a reading of `frameIntervalStats` on a still map,
  which now reports no turns. No supported member changes.
- The icon sweep SHALL read the set's flat tables and SHALL NOT build a record or a
  category object per candidate.
- The region label sweep and the grid label placement each build the view-projection
  matrix once per sweep instead of once per point.
- The star field caches the density and the zone per boxel, keyed on the boxel, so a
  boxel that stays in the drawn set is not read again.
- The plane overlay writes its constant styles once per element, at creation, and not
  in every placement.
- A view epoch lets the grid label projection sweep return early while the view is
  unchanged. The star field already keys its read on its block list and the set version,
  and the region label sampling stays out: two requirements measure that sampling over
  300 frames at one view.

**The source.**

- Delete the dead members: `Controls.isInteracting`, `GalaxyModel.polar` with `toPolar`
  and `PolarPoint`, `GalaxyModel.armCount`, `StarBoxelTable.maskBytes`,
  `StarField.sweptCount` with `StarSuppression.sweptCount`, which nothing but its own
  test reads once the field's member goes, `StarSuppression.cacheSize`,
  `SceneDataOptions.count` and `.seed`, and the `export` of five file-local names in
  the demo's `multifaction.ts`.
- One `smoothstep` and one `clamp` in a new `src/math.ts`; one `setStyle` in `src/app/`;
  one `readPoint`, `readColor` and `readName` in a new `src/scene-data/read-field.ts`;
  one reader for `StartView` and `DatasetView`; `flyTo` reads each field once;
  `labelNumber` calls `toLocaleString`; `setPasses` loops over its keys; the demo page
  forwards the debug probes with a loop.
- `dispose` removes the region labels from the label host and releases any pointer
  capture the canvas holds.
- The nebulae get a renderer draw flag beside the pass switch, as the regions, the
  shapes, the grid and the icons have, so `debug.setPasses({ nebulae })` and
  `setNebulaeVisible` no longer write one field.
- **BREAKING**: every visibility setter leaves the state unchanged on a value that is
  not a boolean. `setSystemNamesVisible` and `setGridVisible` read any non-boolean as
  off today, and `setCursorMarkerVisible` reads it as on. The options keep their own
  defaults, which each capability states.
- **BREAKING**: `getCursorMarkerVisible()` becomes `isCursorMarkerVisible()`, which is
  the form `isGridVisible()` uses for the other singular thing. No alias stays: the
  package is at 0.7.0, one browser test calls it and no sample page does.
- The debug interface and object move out of `create-map.ts` into `src/app/debug.ts`.
  The renderer frame function computes the cursor offset and the volume centre once and
  hands the overlay stage to a function of its own.

### Scale

The frame path holds the default demo set and a set of 50,000 systems with 4 icons each,
at 1920x1080, with the camera moving. The bounds the specs state are measured on that
set. The read-back bound is measured in the animation loop, not with `measureFrames`.
Every bound is read on the hardware renderer: the suite's first test fails the run on a
software renderer, and the context refuses one, so no bound here is read on llvmpipe.

### Non-goals

- A change to any shader or to what a frame looks like. Every screenshot baseline holds.
- `createSystemSet.grow`, the six `tab` branches of `hud/categories.ts`, the
  `setNebulaOcclusion` renderer hop and the three read-pixel helpers of the renderer.
  Each is small and correct as it stands.
- The grid label measure cache, which holds a fallback-font reading if the font lands
  after the first measure. A wake alone does not fix it, so it is its own change.
- A wake on a font load. No path in the library measures text again after a font lands.
- One projection sweep shared by the pick, the marker names and the icon stacks. The
  three read different candidate lists, and the icon sweep is bounded by the records
  with icons and not by the set. A shared sweep over the whole set would break that
  bound for a set with few icons, and it was not measured.
- A deprecated alias for `getCursorMarkerVisible`.
- `setCategoryVisible(name, visible)` and `setShapeCategoryVisible(name, visible)`. They
  take a name and are filters, not switches; their rule stays as `real-systems` and
  `map-shapes` state it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `far-view-rendering`: "A still map draws at an idle rate" says the loop keeps running
  and draws every 200 ms. It changes to a loop that stops, a list of what wakes it, and a
  frame for a pointer move alone that renders no canvas.
- `coordinate-grid`: "The frame carries a background reading" says the read-back runs
  once in each frame that builds the reading, and that a label may read the frame
  before. It changes to a read-back at the start of the next frame, taken only while a
  label is placed, with a bound measured in the animation loop.
- `real-systems`: "The handle releases what it holds on dispose" gains the region labels
  and the pointer capture. A new requirement gives every visibility setter one rule for
  a value that is not a boolean.
- `nebulae`: "The host and the user turn the nebulae off and on" gains the rule that the
  pass switch and the host switch are two switches.
- `system-icons`: "The icon placement is bounded" gains the rule that the sweep reads the
  flat tables, and its control scenario counts a table read instead of a record read.
- `map-navigation`: "The cursor carries a marker on its own plane" renames the reader.

## Impact

- `packages/galaxy-map/src/app/create-map.ts`: the loop, the wake, the hover-only frame,
  the view epoch, `dispose`, the setters, the debug object out to `src/app/debug.ts`,
  `readStartView` out to a shared reader.
- `packages/galaxy-map/src/render/renderer.ts`: the read-back call at the top of the
  frame, the nebula draw flag, the frame split, `setPasses`.
- `packages/galaxy-map/src/render/background-pass.ts`: the take moves out of `render`.
- `packages/galaxy-map/src/render/icon-pass.ts`: the table reads.
- `packages/galaxy-map/src/app/labels.ts`, `grid-labels.ts`, `plane-overlay.ts`,
  `cursor-marker.ts`: the matrix once per sweep, the constant styles once, `clear`.
- `packages/galaxy-map/src/scene-data/star-field.ts`, `star-suppression.ts`, `load.ts`,
  `real-systems.ts`, `shapes.ts`, `marker-icons.ts`: the boxel cache, the dead members,
  the shared readers.
- `packages/galaxy-map/src/galaxy-model/model.ts`, `surface.ts`, `types.ts`: the dead
  chain.
- `packages/galaxy-map/src/camera/controls.ts`, `view.ts`, `flight.ts`: `isInteracting`,
  `clamp`, the pointer capture.
- `packages/galaxy-map/src/render/icon-textures.ts`: a ready callback that wakes.
- `packages/galaxy-map/src/render/global.ts`: the `window.__galaxyMap` type of the
  `/testing` subpath gains `readbackStats`, `resetReadbackStats`, `iconSweepMs` and
  `wake`, which the demo page forwards from the debug object.
- `apps/demo/src/main.ts`, `multifaction.ts`: the probe loop, the exports.
- `e2e/frame-budget.spec.ts`, `e2e/canonn-page.spec.ts`, `e2e/grid.spec.ts` and
  `e2e/labels.spec.ts`: four loops hold the map awake with a pointer move, which no
  longer draws, so each calls a `wake` probe. `e2e/cursor-marker.spec.ts`,
  `e2e/nebulae.spec.ts`, `e2e/systems.spec.ts` and the unit tests beside each changed
  file.
- `docs/wiki/`: the renamed reader and the setter rule, where the pages state them.
- `tests/main-bundle.test.ts`: `ENTRY_CHUNK_LIMIT` takes a reading after the change.
  The deletions and the merges take bytes out, the wake paths and the epoch add a few,
  and the debug move changes nothing, because the object was already in the entry chunk.
- No change to any dependency or to the exports map. The public type surface loses
  `getCursorMarkerVisible` and gains `isCursorMarkerVisible`; the `/testing` type gains
  the four probes above.
