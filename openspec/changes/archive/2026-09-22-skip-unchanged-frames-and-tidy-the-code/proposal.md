## Why

The second code review of 2026-09-22 measured the frame path in the real animation loop,
in headless Chromium on the RTX 4080. The measurements found these costs:

- The loop renders the full canvas on every turn of the 1,200 ms settle window. After each
  interaction it renders about 71 frames of a picture that does not change.
- Four other costs repeat on every turn:
  - `toLocaleString`, which is 29 times slower in Chrome than a kept `Intl.NumberFormat`.
  - `Math.hypot` in the icon sweep.
  - A CSSOM read before each style write. For `font`, `box-shadow` and some `transform`
    values the compare never matches.
  - A hover pick at an unchanged view and pointer.
- The review also found three bugs, one wasted start-up load, duplicated code and dead
  code.

This change does all the work that the review found worth doing, so one gate reviews it.

## What Changes

**Frame path** (measured; the numbers are in `design.md`):

- The renderer renders the canvas only when an input changed since its last render. An
  input is a wake, the view, the drawing buffer size, the read-back switch or a renderer
  setter. A turn with no change keeps the pixels of the last render and still collects a
  pending background read-back.
- The grid label numbers and the HUD number formats use `Intl.NumberFormat` objects that
  the module creates once.
- The icon stack sweep uses `Math.sqrt` and rejects a stack that is farther than the
  furthest kept stack before it offers it.
- `setStyle` keeps the last value it wrote for each element in a `WeakMap`. It does not
  read the CSSOM. The plane overlay and the HUD use one `setStyle`.
- The hover pick runs only where the view, the pointer, the set or the canvas size
  changed.

**Bugs:**

- The information panel finds the live `RANGE` and `REGION` values by the role of the
  built-in field, not by the label. A host value with the label `RANGE` no longer takes
  the live range readout.
- A `ResizeObserver` on the canvas wakes the loop when the canvas box changes without a
  window resize.
- A dataset load that settles after `dispose` does not write the map.

**Additions:**

- `load` in a dataset catalog entry receives an `AbortSignal`. The map aborts the signal
  when a later load starts or when the map is disposed. The demo's multifaction load passes
  the signal to its fetch.

**Load:**

- The point cloud worker sends the decoded detail grid to the main thread. The main
  thread no longer fetches the detail PNG and decodes it a second time.

**Duplicated code** (no change in behavior):

- One plane projection and one Jacobian helper in `plane-overlay.ts`. The grid label
  sweep and `planeSpanForScreenX` both read the Jacobian.
- `project` calls `projectWith`.
- The map sends no `PointCloudRequest` to the point cloud worker. It always sent the
  default count and seed, so the worker reads the defaults itself, and the type goes.
- One SVG icon helper in `hud/dom.ts`.
- One view input type replaces `ViewInput` and `DatasetView`.
- The drag keeps the inverse matrix of the start view and does not build it on each
  pointer move.
- The name filter keeps the folded names.
- The markers project each system once per frame.

**Dead code:**

- Delete `axisymmetricDensity`, `VolumeResponse` and `rayDirection`, and the tests of
  `rayDirection`.
- Remove the `export` from `READY_EVENT` in the demo. `e2e/helpers.ts` declares its own.
- `star-pass.ts` calls `coveredRadius` and does not repeat its formula.

**Small fixes:**

- Put the renderer's misplaced doc comment back above `createRenderer`.
- **BREAKING (types only):** `categoryCountMs` leaves the public `HudHandle` type. The
  `debug` object keeps it. A TypeScript host that calls `map.hud.categoryCountMs()` no
  longer compiles. No known host calls it.

### Non-goals

- **The HUD's 10 Hz tick stays.** After the `setStyle` fix, an idle page with the HUD costs
  about 0.4 ms of script per second. A state-change event on the handle would add public
  API to save that.
- **The markers and the region labels keep their direct `left`, `top` and `opacity`
  writes.** The review counted the repeat writes that pass through `setStyle`. It found no
  measured cost in the direct writes.
- **No native `<dialog>` for the dataset library.** It changes the look, so it needs the
  design look gate and a change of its own.
- **The test-oracle exports and the shader mirrors stay** (`decodeVolumeValue`,
  `decodeDetailRatio`, `buildRegionLines`, `collapseChain` and the others). They pin
  formats, and the build removes them from the bundle.
- **The rebase of system positions stays on the CPU.** A shader rebase saves at most
  0.2 ms per frame at 50,000 systems.
- **The loop keeps its fixed 1,200 ms settle window.** Stopping it when the labels
  converge saves nothing more once the settle turns skip the render.
- **The default arguments in `controls.ts` stay.** They have no cost in production.
- **`startFrame` keeps its four small arrays per frame.** The probes read the frame
  object, and a reused array could change under a probe that keeps it. The review
  measured no cost from them.
- **Three small copies stay.** The rule `id64 ?? name` is one expression in four places,
  and a shared function would make the HUD import `create-map.ts` as a value. The HUD keeps
  its copy of the default view, because the import rules keep it out of `src/camera/`.
  `MODEL_BOUNDS` keeps its own check of the parameter file, because the shared
  `galaxyModel` would add the model preparation to the start of the main chunk.

### Scale

The frame path is measured at two sets, at 1920x1080 on the project's RTX 4080:

- The demo page with the demo set and the HUD, at a zoom distance of 4,000 light years.
- 50,000 systems with 4 icons each, without the HUD, at 20,000 light years. This is the
  set bound of `real-systems`.

The cost of the render skip does not follow the set. It compares a fixed list of values.
The pick cache and the icon sweep reject follow the set in the same way as the code they
replace.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `far-view-rendering`: the loop turns on every frame of the settle window, but it renders
  the canvas only after a change. The canvas follows its own box as well as the window.
- `plane-overlay`: a placement skips a style write that equals the value the library last
  wrote. It does not compare against the value the element reports.
- `map-hud`: a host value does not take the place of a built-in readout.
- `dataset-catalog`: `load` receives a cancel signal, and a load that settles after
  `dispose` writes nothing.

## Impact

- **Library code:**
  - `src/render/renderer.ts`, `src/render/icon-pass.ts` and `src/render/star-pass.ts`.
  - `src/app/create-map.ts`, `src/app/plane-overlay.ts`, `src/app/grid-labels.ts`,
    `src/app/markers.ts`, `src/app/labels.ts`, `src/app/datasets.ts`,
    `src/app/debug.ts` and a new `src/app/set-style.ts`.
  - `src/camera/controls.ts` and `src/camera/projection.ts`.
  - `src/hud/dom.ts`, `src/hud/info-panel.ts`, `src/hud/categories.ts`,
    `src/hud/top-bar.ts`, `src/hud/index.ts` and
    `src/hud/types.ts`.
  - `src/scene-data/point-cloud.worker.ts`, `src/scene-data/messages.ts`,
    `src/scene-data/load.ts`, `src/scene-data/types.ts`, `src/scene-data/picking.ts` and
    `src/scene-data/real-systems.ts`.
  - `src/galaxy-model/surface.ts`.
- **Demo:** `apps/demo/src/main.ts` and `apps/demo/src/multifaction.ts`.
- **Tests:**
  - `e2e/frame-budget.spec.ts`: the view change scenario counts loop turns and renders,
    and the flight half of "a flight and a held key hold the loop" stops counting the
    renders of the settle window.
  - `plane-overlay.test.ts`: it now counts writes, not CSSOM reads.
  - New unit tests and browser tests for each scenario in the deltas.
- **Public API:**
  - The map calls `DatasetEntry.load` with an `AbortSignal`. A host function that
    declares no parameter still fits the type and keeps working.
  - `HudHandle` loses `categoryCountMs` from its type.
  - The API wiki pages follow from the TypeScript source.
- **Dependencies:** none.
