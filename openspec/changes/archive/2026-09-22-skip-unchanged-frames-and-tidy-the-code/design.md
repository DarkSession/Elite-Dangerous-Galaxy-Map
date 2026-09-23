## Context

See `proposal.md` for the reasons. This section gives the state of the code that the
decisions below depend on.

- The loop in `src/app/create-map.ts` turns while `now < awakeUntil`, while a start is
  pending, or while a flight runs. `wake()` moves `awakeUntil` to 1,200 ms after now. Each
  awake turn calls `drawFrame`, which calls `renderer.render(view)` and then the overlays.
  A turn on which only the pointer moved calls `overlayFrame`, which runs the pick and the
  markers and renders nothing.
- Every write of the view passes through `announce`, which raises `viewEpoch` and calls
  `wake()`. Every handle member that changes the picture calls `wake()`. The renderer's
  icon texture callback calls `wake()` through `onChange`.
- No shader reads a clock. The context sets `preserveDrawingBuffer: true`
  (`src/render/context.ts:70`), so the pixels of the last render stay in the canvas.
- `renderer.render` times `drawFrame` and adds the time to `frameStats`. `measureFrames`
  calls the internal `drawFrame` directly.
- `drawFrame` in the renderer calls `backgroundPass.take()` at its top. It starts a new
  read-back only when the read-back switch is on or no reading has landed.
- The `debug` probe `look` returns the renderer's `LookSettings` object. Browser tests
  write fields of it in place (`e2e/nebulae.spec.ts`) and then ask for a draw.
- `debug.wake()` calls `wake()`. Six browser test loops call it on each frame to hold the
  loop awake under pointer moves: `e2e/helpers.ts:682`, `labels.spec.ts:652`,
  `frame-budget.spec.ts:412`, `canonn-page.spec.ts:247`, `grid.spec.ts:2680` and
  `grid.spec.ts:2711`.
- The set versions: `version` rises on every change to the set, and `categoryVersion`
  rises on a change of the category table, of a visibility, or of the name filter
  (`src/scene-data/real-systems.ts`). `pickSystem` reads the positions, the marker flags and
  the draw ranges, which these two versions cover.

### Baseline

The review measured these numbers in headless Chromium on the RTX 4080, at 1920x1080, on
unminified builds. It used the rAF wrapper of `bench.mjs` in this change directory.

| Reading                                             | Before  | With P1 to P5 |
| --------------------------------------------------- | ------- | ------------- |
| Settle turn, demo set at 4,000 ly                   | 0.67 ms | 0.21 ms       |
| Settle turn, 50k systems, 4 icons, 20,000 ly        | 2.34 ms | 0.25 ms       |
| Settle window total, 50k                            | 169 ms  | 18 ms         |
| Renders in one settle window                        | about 71 | 0            |
| Turn while a key is held, 50k                       | 2.45 ms | 1.69 ms       |
| Render while a key is held, 50k                     | 1.68 ms | 0.85 ms       |
| Frame with a GPU wait (`measureFrames`), 50k        | 4.33 ms | 3.48 ms       |
| Turn while a key is held, demo                      | 1.19 ms | 0.97 ms       |
| Script time in a 3 s held key, demo (CPU profile)   | 224 ms  | 168 ms        |
| CSSOM reads during a held key, demo                 | 15,525  | 0             |
| Style writes during a held key, demo                | about 6,900 | 3,378     |

P1 is the kept number format. P2 is the icon sweep. P3 is the render skip. P4 is the kept
style value. P5 is the kept pick.

The `measureFrames` row waits for the GPU on each frame, and its reading moves with the
state of the machine. The review read 3.17 ms before and 3.53 ms with P1 to P5, because
the machine read about 1.2 ms higher for every build after the first three runs. The row
therefore gives the means of the runs of the apply day, where the "Before" build and the
change ran in the same hour. Judge this row against a "Before" run of the same hour.

## Goals / Non-Goals

**Goals:**

- A turn with no change to the picture does no GPU work and no canvas work.
- The frame path does no string formatting through `toLocaleString`, and no CSSOM read.
- Every behavior change lands with a test that fails without it. A refactor lands with
  the existing tests passing unchanged, or with a test that compares the old and the new
  output.
- The numbers in the table above hold within 20 per cent on the same machine.

**Non-Goals:**

- The proposal lists the product non-goals. At the design level:
- This change does not make the settle window shorter. The window still holds the label
  ease.
- It does not move work off the main thread except the detail grid decode.
- It does not change a shader.

## Decisions

### D1. The renderer decides the skip, from a stale flag and a short compare

`render(view)` SHALL return before it draws where all of these hold:

1. The stale flag is off.
2. The six view values equal the ones of the last render.
3. The drawing buffer has the size it had at the last render. The `resize()` step runs
   first, so a change of the canvas box shows here, whichever path resized the buffer.
4. The read-back switch equals the one of the last render.
5. The system set's `version` and `categoryVersion`, and the shape set's version, equal
   the ones of the last render.

A skipped call still calls `backgroundPass.take()`, so a reading that a render started
lands. It adds nothing to `frameStats`. A render clears the stale flag and keeps the
values it compared.

These set the stale flag:

- `renderer.invalidate()`. The map's `wake()` calls it, so every change that wakes the
  loop renders once. The `wake` probe and a draw from outside the loop reach it through
  `wake()`.
- Every renderer setter that changes what the renderer draws: the data setters, the pass
  switches, the look setters, the holds and the nebula order.
- The three setters that `drawFrame` calls on every turn (`setSystemIconsDraw`,
  `setSelectedSystem`, `setBackgroundReadback`). These set the flag only where the value
  changed.
- The icon texture callback.

The `look` probe on `debug` calls `wake()` before it returns the object. A test writes the
look in the same task, so the write is in place before the next turn renders.

**Alternatives considered:**

- *A key string of every input, with `JSON.stringify(look)`.* The prototype did this, and
  it measured well. It builds a string on each turn, and it has to list every input by
  hand. The stale flag gets the same result from the paths that already exist.
- *The wake flag alone.* Every change path wakes today, but the start chain calls
  renderer setters between frames, and a future path can forget the wake. The compare of
  the view, the size and the set versions costs a few number compares. It covers the
  inputs that change most often, including the ones a path could forget.
- *A skip in `create-map.ts`.* The map does not know when the drawing buffer resized or
  when a read-back is due. The renderer knows both.

### D2. The hover pick is kept on a key

A small helper in `src/scene-data/picking.ts` holds the last answer of `pickSystem` and
its key: the view epoch, the pointer `x` and `y`, `set.version`, `set.categoryVersion`,
and the canvas width and height. It runs the pick again only where one part of the key
changed. `drawFrame` and `overlayFrame` both call it. The epoch rises on each view write
and on each resize, so it stands for the view and the size of the drawing buffer.

**Alternative:** mark the pick stale in `wake()` and on a pointer move. That also works,
but the helper with a key has no link to the loop, and a unit test can read it.

### D3. One `setStyle`, which keeps the last written value

`setStyle` moves to a new module with no imports, `src/app/set-style.ts`. It keeps a
`WeakMap<ElementCSSInlineStyle, Map<string, string>>` of the values it wrote. It writes
only where the new value differs from the kept one, and it never reads `style`.
`plane-overlay.ts`, `grid-labels.ts` and `src/hud/dom.ts` import it, and `hud/dom.ts`
deletes its own copy.

The module has no imports because the HUD imports it as a value. `plane-overlay.ts`
imports `src/camera/projection.ts` as a value, so a HUD import of `plane-overlay.ts` would
reach the camera layer through `src/app/`. The lint checks only direct imports, and it
would not see that. The comment above the old `setStyle` in `plane-overlay.ts` changes to
match.

The kept value is the truth only while every write of that property on that element
passes through `setStyle`. The implementation checks this with a search for direct writes
of each property that a `setStyle` call names. Where a direct write exists, it changes to
`setStyle`.

**Alternative:** normalize the value before the compare. That needs the browser's
serializer rules for each property, and they differ between browsers.

### D4. Number formats are created once

`labelNumber` in `src/app/grid-labels.ts` formats through one module-level
`Intl.NumberFormat('en-US')`. `formatWhole`, `formatCoordinate` and `formatLightYears` in
`src/hud/dom.ts` do the same, with one formatter for each set of options. The output
stays the same: the prototype compared 300,000 values.

### D5. The icon sweep rejects before it offers

The sweep computes the range as `Math.sqrt(x * x + y * y + z * z)`. Where the keeper is
full and the range is not below the range of its last entry, the sweep skips the offer.
This is the same rule that `offerNearest` applies inside, so the kept set does not change.
A unit test runs the sweep over one seeded set with and without the early reject and
compares the kept indices.

### D6. A `ResizeObserver` joins the window listener

The map observes the canvas with a `ResizeObserver`. Its callback raises `viewEpoch`,
places the loading image and calls `wake()`. It SHALL NOT resize the drawing buffer.
The `resize()` step at the top of the next render changes the buffer, and that render
draws into it at once.

The browser runs observer callbacks after the animation frame callbacks and before the
paint. A change of `canvas.width` clears the drawing buffer, and `preserveDrawingBuffer`
does not keep pixels across a resize. A callback that resized the buffer would therefore
paint an empty canvas for one frame, on each frame of a box that grows over time.

The window `resize` listener stays as it is, because a change of the device pixel ratio
does not always change the canvas box. That event fires before the animation frame
callbacks, so it has no empty frame. `dispose` disconnects the observer. Where the browser
gives no `ResizeObserver`, as in a unit test, the map uses the window listener alone, as
`src/hud/categories.ts:532` does.

### D7. A dataset load takes an `AbortController`

`runLoad` in `src/app/datasets.ts` creates one `AbortController` for each load and keeps
the controller of the newest load. A new load aborts the controller it replaces. `clear()`,
which `dispose` calls, aborts the newest controller and raises the load counter, so a load
that settles later fails the ticket check and rejects with `CANCELLED_MESSAGE`. `load` is
typed `load(signal: AbortSignal)`. A host function that declares no parameter still fits
the type.

In the demo, `fetchMultifactionRecords` takes the signal and passes it to `fetch`. Where
the signal aborts while the worker reads, the demo terminates the worker and rejects.

### D8. The worker sends the detail grid it decoded

The point cloud worker already decodes the detail grid to build its model. After it posts
the cloud, it has no more use for the grid. `PointCloudResponse` gains `grid`, the
`SurfaceDetailGrid`, and the worker transfers `grid.values`. `SceneData` gains
`detailGrid`. The map builds the star field model from `scene.detailGrid` and deletes its
own call of `loadDetailGrid`.

The main thread then does not fetch the 347,358 byte PNG a second time and does not
decode it. A decode in Node takes about 7 ms. The implementation measures the start in
Chrome before and after, as a main-thread long task count and the time to `ready`.

**Alternative:** decode on the main thread only, and send the grid to the worker. That
puts the decode back on the thread the change wants to clear.

### D9. `categoryCountMs` moves to an internal type

`createHud` returns `HudHandle & HudProbes`. `HudProbes` is an internal interface with
`categoryCountMs()`. The map keeps the HUD under that type and gives it to `debug`. The
public `hud` getter returns the plain `HudHandle`. The object still carries the method at
run time. Only the type loses it.

### D10. The duplicated code folds into one place each

- **Plane projection:** one function in `plane-overlay.ts` projects a plane point to the
  screen, or gives null in front of the near plane. `planePlacement` and
  `planeSpanForScreenX` call it.
- **Jacobian:** one function in `plane-overlay.ts` projects a plane point and two points a
  small step along `x` and `z`, and writes the two screen steps into an array the caller
  gives. The grid label sweep in `grid-labels.ts` and `planeSpanForScreenX` call it. The
  sweep runs 25 candidates each frame, so the function allocates nothing.
- **`project`:** it calls `projectWith(viewProjectionMatrix(view, viewport),
  cameraPosition(view), point, viewport)`.
- **SVG icons:** one `makeSvg(doc, viewBox, size)` in `hud/dom.ts` sets the shared
  attributes. The icon builders in `categories.ts`, `info-panel.ts`, `top-bar.ts` and
  `index.ts` call it.
- **View input:** `DatasetView` becomes `export type DatasetView = ViewInput`, with its
  doc comment. The public name stays.
- **Drag:** `DragStart` keeps the inverse view-projection matrix of the start view.
  `dragCursor` calls `planePointFrom` with it.
- **Name filter:** the set keeps the folded name of each record when it adds the record.
  `refreshFlags` reads the kept name.
- **Markers:** the keeper walk keeps the marker size beside `candidateX` and
  `candidateY`, in a third array. The name pass reads the three arrays and does not call
  `placeOf` a second time for the same record.
- **`viewInsideBounds`:** it takes a `BrowseBounds`. The one caller already checks that
  the entry names bounds.
- **`handoverRadii`:** the outer radius calls `coveredRadius`.

### D11. The measurement method

`bench.mjs` in this change directory is the script of the review. It serves the same two
scenarios as the baseline table:

1. Build unminified: `vite build --minify false --outDir <scratch>` in `apps/demo`.
2. Serve the build with `vite preview --outDir <scratch> --port 4190`.
3. Run `node openspec/changes/skip-unchanged-frames-and-tidy-the-code/bench.mjs 4190`.

The script wraps `requestAnimationFrame` and times each turn. It holds `D` for 3 s, reads
the 2 s after the release as the settle window, moves the pointer for 3 s, and reads
`measureFrames` at four views. No other Playwright run may use the machine at the same
time.

## Risks / Trade-offs

- [A change path that neither wakes nor touches a compared input shows its change late,
  on the next change.] → Every renderer setter sets the stale flag, and every handle
  member already wakes. The full browser suite runs, including the six "wakes the loop"
  scenarios.
- [A browser test counted the renders of the settle window.] → Two tests are known:
  - "A view change wakes the loop" in `e2e/frame-budget.spec.ts`, which this change
    rewrites.
  - "a flight and a held key hold the loop" (`e2e/frame-budget.spec.ts:1305`). It expects
    more than 100 renders in the 3 s after a `flyTo` from the default view. The flight
    takes about 1,143 ms, which is about 69 view writes. Today the settle window adds
    about 72 renders, and with the skip it adds none. The flight half of the test
    changes to count loop turns, or to expect at least 60 renders in the time of the
    flight.

  `e2e/info-panel.spec.ts:617` needs one render in the 20 frames after a selection. The
  selection flight covers that window, so it holds. Its comment "a still map draws once
  each 200 ms" is out of date, and it changes. The full suite runs. A test that fails
  because it counted renders at an unchanged view changes to count loop turns, and the
  task notes name each one.
- [A test keeps the `look` object from one `evaluate` and writes it in a later one, with
  no draw.] → The known tests write and then call `drawNow` or `setView`. The full suite
  runs.
- [A direct style write bypasses the kept value in `setStyle`.] → D3 search. A unit test
  covers the `font` case.
- [A host's `load` ignores the signal.] → Nothing changes for it. The ticket check still
  drops its late answer.
- [`HudHandle` loses a member in its type.] → No known host calls it. The API wiki and
  the `main-bundle` test follow the type.

## Migration Plan

No data migrates. A TypeScript host that calls `map.hud.categoryCountMs()` changes the
call to `map.debug.categoryCountMs()`. The change rolls back as one revert.
