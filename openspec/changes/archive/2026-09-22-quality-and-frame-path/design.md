## Context

See `proposal.md` for the readings. What the design needs from the tree:

**The loop.** `createGalaxyMap` runs one `requestAnimationFrame` loop
(`create-map.ts:1985-2015`). `wake()` at `:1124` sets `awakeUntil = now + SETTLE_MS`;
24 call sites reach it, among them `announce`, which every view write, the flight, the
drag, the glide and the key movement go through, and `onPointer`, which every pointer
move goes through. `onInput` (`create-map.ts:1888`) ends the flight and does not wake:
a wheel notch sets the glide target and a key press records the key, and both move the
view only in `controls.update`, which the loop calls. The idle turn is what starts them
today.
The loop draws every frame while awake and one frame each `IDLE_DRAW_MS` otherwise. Of
the seven async completions in the file, the scene data and the nebulae wake the loop
and the icon texture (`icon-textures.ts:169`) does not; the idle draw covers that one
path. The renderer reads no hover: `hoverIndex` is read by `markers.update` alone.

**The read-back.** `background-pass.render` ends with `cycle.frame(pixels)`, which takes
the slot of the frame before and starts the next, after every draw command of the frame.
`createReadbackCycle` holds two slots, a fence per slot and the four hooks `start`,
`passed`, `take` and `drop`. Four slots and no fence measured the same; the cost is the
queue drain in `getBufferSubData`, not the fence.

**The sweeps.** `iconPass.prepare` (`icon-pass.ts:267`) walks `set.iconIndices` and
calls `set.system(index)` and `set.category(...)` for each candidate, which builds a
record object and a category object per call. The region label sweep calls `project(view, [x, 0, z], viewport)` per
sample (`labels.ts:368`), and `viewProjectionMatrix` (`projection.ts:120`) builds three
matrices per call. The grid label placement does the same per label.

**The switches.** Four layers hold a host flag in `create-map.ts` and a draw flag in the
renderer, ANDed with the pass switch in `drawFrame`. The nebulae hold the host flag and
write the pass switch itself (`create-map.ts:2458`).

## Goals / Non-Goals

**Goals:**

- No frame does work whose input did not change since the frame before.
- The loop costs nothing while the map is still, and every path that changes the picture
  wakes it.
- One copy of each helper, one rule for each kind of switch, no member without a reader.

**Non-Goals:**

- A change to any pass's output. The screenshot baselines are the check.
- A new dependency. `src/math.ts` is two functions.
- A worker for the icon sweep. It costs about a millisecond at 50,000 systems with
  icons, and the epoch skips it on a still frame.
- A change to `setStyle`. The `plane-overlay` spec says a placement writes a property
  only when it differs from the one the element holds, and the CSSOM read is that test.

## Decisions

### D1. The read-back takes at the start of the renderer frame and starts only for a label

`background-pass` gains `take()` and `start()` and drops the call from `render`.
`renderer.drawFrame` calls `take()` as its first statement, before any GL command, and
`start()` after the background chain, only when the caller asks for a reading. The
caller is `create-map`, which asks when the grid is on and the grid labels placed a label
in their last update. The renderer starts one on its own until a first reading lands, and
reads that after `take()`, so the frame that lands it starts no second copy. The bound is 0.5 ms: the
scenario, a held key over the core with the grid on, read 0.35 to 0.44 ms at the start
of the frame and 1.37 ms at the old position, heavier than the drag the review measured. The label of frame N then reads
the copy started in frame N-1, which is the one-frame latency the code has today; it is
two frames old only when the fence of N-1 has not passed by the start of N, and the
count of the new scenario, above 100 takes in 120 frames, bounds how often that happens.
Either way the picture is the same, because nothing moves it but a change, and a change
wakes a full draw whose labels read the reading of the frame that changed.

A probe `readbackStats()` returns the count and the mean of the takes since the last
`resetReadbackStats()`, measured with `performance.now` around `getBufferSubData`. It goes
on the debug object, on the `GalaxyMapGlobal` type of `src/render/global.ts`, and on
`window.__galaxyMap` through the probe loop of D10.

Alternatives: four slots and no fence, measured no change; a `readPixels` to a CPU array,
which waits for the frame; a take on the next `requestIdleCallback`, which lands after
the labels are placed and needs a second frame for every reading.

### D2. The loop stops, and a pointer move alone runs the overlays

`wake()` keeps `awakeUntil` and gains a restart: when `frameHandle` is null it requests a
frame. The loop, after its draw decision, stops when it is not awake, holds no pending
start, no flight and no pointer mark: it sets `frameHandle` to null and returns without
a request. `IDLE_DRAW_MS` and `drawnAt` go.

`onInput` calls `wake()`, so a wheel notch and a key press start a loop that stopped;
the glide and the held key then hold it awake through `announce` on every turn that moves
the view, and a drag does the same. `Controls.isInteracting` reports a drag and has no
caller; the drag needs no reader here, because it writes the view.

`wake()` returns at once on a disposed map. Every handle setter calls it with no
disposed check, and a late async completion can call it too; today that writes a
timestamp and nothing else, and under this design it would request a frame on a map
whose `dispose` stopped the loop, against the `real-systems` rule that `dispose` stops
it.

`onPointer` no longer calls `wake()`. It sets `pointerMoved = true` and restarts the loop
if it is stopped, without moving `awakeUntil`. The loop turn then reads:

1. Awake, pending start or flight: `drawFrame`, a full frame.
2. Else, `pointerMoved`: `overlayFrame`, which runs `pickSystem` and `markers.update`
   and nothing else, and clears the mark.
3. Else: stop.

`overlayFrame` does not touch the renderer, so `frameStats` does not count it. A pointer
move inside the settle window falls under rule 1, which is where the region labels still
ease. `frameIntervals` records a turn only where the loop turns, so a still map reports
none.

The browser suite holds the map awake with pointer moves in four places: `hoverFrames`
of `e2e/frame-budget.spec.ts`, its copy in `e2e/canonn-page.spec.ts`, and the inline
`waitForFunction` loops of `e2e/grid.spec.ts:2668` and `e2e/labels.spec.ts:636`. A
pointer move no longer draws, so the debug object gains `wake()`, and each of the four
calls it each frame beside the pointer move, which keeps the pick in the measured work.

The icon texture wakes through a `onReady` callback on `createIconTextures`, which the
renderer takes as an `onChange` option and `create-map` sets to `wake`. That is the one
async path without a wake; the scene data and the nebulae already have one.

Alternative: keep the idle draw at a longer interval. It still costs a full frame for
nothing, and the one path it covers is a one-line callback.

### D3. A view epoch

`announce` and `onResize` increment `viewEpoch`. One stage holds the epoch of its last
run and returns early on a match: the call of `gridLabelPlacements` inside the `update`
of `createGridLabelOverlay`. The memo lives in that closure, beside the pool, and not in
`gridLabelPlacements`, which stays a pure exported function with its own unit tests, so
a spy on the function counts its calls. The rest of `update`, the per-label read of the
background reading that sets the colour and the opacity, runs on every full frame,
because the reading of a view lands one or two frames after the view by D1 and a gate
over the whole update would freeze every label's tint on the reading of the view before.

The star field's `readSet` stays out of the epoch. It already returns early on an
unchanged key, which is its block list and the set version, and a frame with an
unchanged view has an unchanged block list. An epoch gate in front of that key would
skip the re-read a set change asks for, because `addSystems` wakes the loop and does not
move the view, and the field would keep drawing stars the new systems suppress. D7 is
what that stage gets.

The region label sampling stays out of the epoch. `galactic-regions` bounds it as a mean
over 300 frames at one view, and the `coordinate-grid` scenario "The label sweep costs
the same under the plane" reads the same counter, so a sampling that ran once per view
would hold both tests at their timeouts. The stages that ease, the region label positions
and the flight, run on every full frame as they do today. The set version and the switch
state join the key where a stage reads them; the star field already keys on its block
list.

Alternative: compare the view fields per stage. The epoch is one integer and one compare.

### D4. The icon sweep reads flat tables

`createSystemSet` gains two flat views beside `iconIndices`: the icon start and count
per record and the icon vector list, which the set fills when a category or a record
changes, as it fills `drawRanges`. The stack limit per record is `drawRanges` itself. `iconPass.prepare` reads
them and never calls `set.system` or `set.category`. The `Math.fround` calls on the
offsets stay: 0.09 ms is not worth a float-precision question in the placement test.

The two tests of `icon-pass.test.ts:463` that spy `set.system` spy the getters of the
three views instead: the no-icon test asserts no read, and the control asserts a read.

### D5. Dropped: one projection sweep for the pick, the names and the icons

The three read different candidate lists. The pick and the name sweep walk the drawn
ranges and drop a candidate on the camera range before they project it; the icon sweep
walks `iconIndices`, which the spec bounds by the records with icons and not by the set.
One sweep over the whole set would pay 50,000 projections for a set with ten icons. The
proposal's Non-goals record it.

### D6. The label sweeps build the matrix once

`labels.sampleFrame` takes a `viewProjectionMatrix` built once per call and projects
with it, through a `projectWith(matrix, point, viewport)` beside `project` in
`projection.ts`. `gridLabelPlacements` already built its matrix once per call, so it does
not change. `project` stays for the callers that project one point.

### D7. The star field caches per boxel

`readSet` keeps a `Map` from the boxel key `star-suppression` already uses, the size
class and the three index coordinates as a string (a boxel index is a 3-tuple, so no
numeric key exists), to the density and the zone it read, capped at the same 8,192 entries `star-suppression` uses,
cleared on a model change. A boxel that stays in the drawn set across a camera move costs
no model read. With D3 the whole read is skipped on a still frame.

### D8. Constant styles are written once

`writeOnPlane` (`plane-overlay.ts:350-357`) writes eight properties per placement, and
four of them never change: `position`, `left`, `top` and `transform-origin`. Each write
is a CSSOM read first. The four move to the element factories, `grid-labels.ts:718` and
`cursor-marker.ts`, which already write their own constants at creation, and the
placement writes the size, the transform and `z-index` alone. `setStyle` keeps its CSSOM
compare, which is the rule the `plane-overlay` spec states. The HUD keeps its own
`setStyle`, for the chunk reason `grid-labels.ts:140` states.

### D9. The nebulae hold a draw flag

`renderer.setNebulaDraw(on)`, held beside `regionDraw`, `shapeDraw`, `gridDraw` and
`iconDraw`, and ANDed with `passes.nebulae` in `drawFrame`. `setNebulaeVisible` and the
attach path write the draw flag and never the pass switch.

### D10. The debug object moves out, the renderer frame splits, the helpers merge

- `GalaxyMapDebug` and its object move to `src/app/debug.ts` as
  `createDebug(deps)`, where `deps` holds getters for the renderer, the controls, the
  overlays, the set, the view and the two accumulators. `create-map.ts` loses about 600
  lines. The demo page forwards the probes with one loop over the keys of the object
  that forwards function members alone. The loop reads the two getters `look` and
  `renderer` at forward time, before `ready`, and drops them by their value, which is
  not a function; that read is harmless, and the page keeps its `renderer` accessor and
  reaches `look` through `map.debug.look` as the browser tests do today. The loop widens
  the probe object from the 41 names the page forwards today to every function member
  of the debug object, which is 56 plus the four this change adds.
- `renderer.drawFrame` computes `cursorOffset` and the volume centre once at the top,
  keeps the sixteen per-frame readings in one `frame` object reset each frame, and
  hands the overlay stage to `drawOverlays(frame)`.
- `src/math.ts` holds two functions, `smoothstep` with the `high <= low` guard and `clamp`; the
  guarded clamp of `labels.ts` keeps its name in that file. `src/scene-data/read-field.ts`
  holds `readPoint`, `readColor` and `readName`. `src/app/view-input.ts` holds
  `StartView` and its reader; `DatasetView` extends it. `setStyle` lives once in
  `src/app/plane-overlay.ts`.
- `setPasses` loops over the keys of `passes`. `flyTo` reads each field once.
  `labelNumber` returns `(Math.round(value) || 0).toLocaleString('en-US')`; the `|| 0`
  keeps negative zero as `0`, which is the one difference measured over 300,000 values.

### D11. One rule for the switches, and one rename

Every setter reads `if (typeof on !== 'boolean') return;`. `getCursorMarkerVisible`
becomes `isCursorMarkerVisible` with no alias: the package is at 0.7.0, one browser test
and no sample page calls it, and the wiki is generated from the source.

### D12. Dispose clears the region labels and the capture

`LabelOverlay` gains `clear()`, which removes every shown element and resets the pool
memory; `dispose` calls it beside the other three clears. `controls.dispose` calls
`releasePointerCapture` for each held pointer id before the listeners come off, inside a
`try`, because a browser throws on an id it does not hold.

## Risks / Trade-offs

- [A path changes the picture without a wake, and a stopped loop shows it late] → The
  list in the spec names every path, the review read all seven async completions and
  the two input paths that move nothing until the loop turns, and a browser scenario
  covers each kind: the view, a switch, the icon texture, the pointer, the wheel and a
  held key.
- [The two-frame-old reading colours a label against the wrong background] → The
  picture does not change between two frames of one view, and a change wakes a full
  draw. The scenario "The label reads a reading that landed" reads it.
- [The `hoverFrames` helper measures a frame that no longer draws] → the helper calls
  the `wake` probe each frame; the readings it takes keep their meaning.
- [The bundle limit moves] → the task list takes a reading and records it in the
  history comment, as every change before it did.
- [The rename breaks a host] → recorded as BREAKING in the proposal and in the wiki.

## Migration Plan

1. A host that calls `getCursorMarkerVisible()` calls `isCursorMarkerVisible()`.
2. A host that passed a non-boolean to `setSystemNamesVisible`, `setGridVisible` or
   `setCursorMarkerVisible` passes a boolean. The state no longer moves on anything else.
3. A host that reads `frameIntervalStats` on a still map reads zero turns.

Rollback is a revert; no data and no stored state changes.
