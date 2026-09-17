## Context

See `proposal.md` — Why. This section holds only the parts of the tree the approach turns
on.

**The region pass draws in two steps.** `src/render/region-pass.ts` expands each boundary
segment into a screen-space quad, and `regions.frag` writes `1 - gap / uHalfWidth` into a
single-channel coverage buffer with the `MAX` blend equation. A full-screen pass,
`region-composite.frag`, then reads that one channel and writes the band: `smoothstep(0,
uEdgeShare, coverage)` for the alpha and a threshold at 0.75 for the core tone. `uHalfWidth`
is one uniform for the whole frame, in device pixels.

**The boundary sets come from a worker.** `RegionLinesResponse` carries two sets, `lines`
(the smoothed one) and `traced`. `src/render/region-pass.ts` uploads both and the frame
picks one by `frame.traced`.

**The marker colour comes from one array.** `src/scene-data/real-systems.ts` holds
`categoryIndices`, a `Uint16Array` that `writeSystem` fills from
`categoryOf.get(system.primaryCategory)`. `src/render/system-pass.ts` reads it in
`buildMarkerColors` and in `buildMarkerStyleRanges`. A second array, `markerFlags`, says
which markers draw, and `refreshFlags` rebuilds it under a 2 millisecond bound. `refreshFlags`
is version-gated and runs lazily from the getters.

**The camera keys are a set.** `src/camera/controls.ts` holds `MOVEMENT_KEYS` of six names,
a `movementKeyOf(code)` that reads `code.startsWith('Key')`, a form-field guard in
`applyKeyDown`, and `moveByKeys(view, keys, seconds)`.

**The map has no shape layer.** There is no shape set, no shape pass and no shape member on
the handle.

## Goals / Non-Goals

**Goals:**

- Put the band width in the shader, so a range-following width costs no CPU work per frame
  and no new vertex attribute.
- Keep one boundary set in the worker, the renderer and the message.
- Make the drawn category a product of the sweep that already runs, not a second pass.
- Give the shapes a pass that reuses the region pass's two-step shape, so a join of one
  line blends once.
- Keep the demo's shape data out of `DatasetContent`, so a host's data set stays two arrays.

**Non-Goals:**

- No change to the region worker's trace, its chain linking or its smoothing of the traced
  set. Only the second set goes.
- No shape picking, no shape label and no shape in the category table.
- No new package. Everything here is built from what the tree already has.

## Decisions

### The band's half width is computed per vertex, in the vertex shader

`regions.vert` already holds the camera-relative position of both endpoints of the segment.
The range of an endpoint is the length of that vector, so the shader computes
`clamp(uBaseHalfWidth * 12000.0 / range, uFloorHalfWidth, uBaseHalfWidth)` for each end with
no new attribute and no CPU work.

**Both uniforms are in device pixels.** `uHalfWidth` is a device-pixel uniform today, and the
spec states the width rule and the floor in **CSS** pixels, so the CPU multiplies both by
`frame.pixelRatio` before it writes them. A literal `2.0` in the shader would be 1 CSS pixel
at a device pixel ratio of 2, and the floor would then bind at twice the stated range. The two half widths go to the fragment shader as `flat out`
varyings, and `regions.frag` reads
`mix(vHalfStart, vHalfEnd, part)`, where `part` is the projection parameter it already
computes.

**The range is read from the unclipped endpoint.** The shader clips the segment at the near
plane after it projects, so `vStart` and `vEnd` are the clipped screen positions while the
two half widths belong to the endpoints as they were. The fragment shader's `part` therefore
runs along the clipped segment and reads a half width that belongs to the whole one. The
range fade removes every pixel under 8,000 light years, and a segment that reaches the near
plane is inside that, so no pixel the pass writes is affected. The implementation leaves it
as it is, and this paragraph is here so the next reader does not take it for an oversight.

The quad is expanded sideways by each end's own half width, which makes a trapezoid. That
trapezoid holds the ramp **exactly**: the sideways offset is perpendicular to the segment, so
a point at quad parameter `t` projects to `part = t`, and the trapezoid's edge is the same
linear interpolation the fragment shader reads. The `along` expansion at each end takes that
end's own half width.

_Alternative considered: compute the half width on the CPU and pack it into the vertex
array._ That adds a `float32` per vertex, 22.4 KiB for the traced set, and it has to be
rewritten on every camera move, which is every frame. The shader already has the position.

_Alternative considered: one half width per segment, not per endpoint._ The median segment
of the traced set is 185 light years long, and a chain runs toward the horizon, so
neighbouring segments would take visibly different widths and the band would step. The spec
states the interpolation for this reason.

### The edge and the core become shares, so the composite needs no per-pixel half width

`region-composite.frag` reads the coverage channel alone. Its `uEdgeShare` is
`min(0.25, 4 / halfWidth)` and its `uCoreEdge` is `1.5 / halfWidth`, both derived on the CPU
from the one frame-wide half width. With a per-pixel half width the CPU can no longer derive
them.

The fix is to make both **constant shares**: `uEdgeShare` becomes 0.25 and `uCoreEdge`
becomes 0.087, which is `1.5 / 17.28`, the value the old rule gave at the reference half
width.

`uCoreEdge` therefore keeps its reading at the reference half width. `uEdgeShare` does not:
the old rule gave 0.2315 at a half width of 17.28, because the cap of 0.25 bound only below a
half width of 16. The edge of the band is therefore a little wider than it was at 1,080 rows,
4.3 CSS pixels against 4.0, and the spec states that reading. The coverage channel is already normalised by the half width, so a constant share is
a constant **fraction of the band**, and the band then keeps one profile as it narrows. That
is the behaviour the spec asks for.

_Alternative considered: write the half width into a second channel of the coverage buffer._
That turns an R8 buffer into an RG8 one and adds a texture read per pixel of the composite,
to reproduce a profile the shares give for free.

### The worker emits one set and the smoothed helpers go

`RegionLinesResponse` loses `lines` and keeps one field, which holds the traced set.
`regionLinesTransferables` then runs once. `region-pass.ts` uploads one set and
`setRegionDraw` loses its second argument.

The helper that smoothed a chain to a 20 degree turn bound, and its unit tests, go with the
set. The traced set's own smoothing and its vertex reduction stay untouched. Deleting the
helper is the point of the non-goal "The smoothed boundary set is gone, not parked": a
helper nothing calls is a helper nobody maintains.

### `refreshFlags` becomes the only writer of the drawn category

`anyCategoryOn(system)` already walks the primary category and then the secondary ones in
order, and returns at the first one that is on. Changing it to return **that category's
index**, or -1, gives the drawn category from the same walk, in the same read of the same
memory. `refreshFlags` then writes `markerFlags[index]` and `categoryIndices[index]` in one
loop, and the 2 millisecond bound holds because the loop does the same work it did.

`writeSystem` keeps its write of the primary index, so a system added between two sweeps has
a sane value. The `categoryIndices` getter gains a `refreshFlags()` call, which the
`markerFlags` getter already has, so a read after a category switch is never stale.

_Alternative considered: a second array, `drawnCategoryIndices`._ That is 20 KiB for 10,000
systems and two arrays to keep in step, and no caller wants the record's primary index —
`buildMarkerColors` and `buildMarkerStyleRanges` both want the drawn one.

### `Q` and `E` join the movement keys

`MOVEMENT_KEYS` grows to eight names. `movementKeyOf` reads `code.startsWith('Key')`, and
`KeyQ` and `KeyE` match it, so the guard, the release-outside-the-field rule and the
flight-ending rule all follow with no change. `moveByKeys` gains the yaw step:
`60 * seconds` degrees, added for `E` and subtracted for `Q`, wrapped into 0–360, and
skipped when both are held.

The eight names are one list, so `system-selection`'s "a movement key ends the flight" rule
reads the same list and needs no second edit.

### The shape lines draw through a colour buffer, like the region band

A line's joins must blend once. Two quads of one join overlap, and an ordinary `SRC_ALPHA`
blend would draw the overlap twice and leave a bright dot at every corner.

The pass therefore follows the region pass's two-step shape. Each segment draws as a quad
into an **RGBA8 buffer at frame size** with premultiplied colour and the `MAX` blend
equation. Two quads of one join carry the same colour, so `MAX` keeps the larger alpha and
the corner reads exactly as the straight run does. A full-screen pass then writes that buffer
over the frame with an ordinary `SRC_ALPHA` blend.

This also gives the near-plane clip for free: each segment is its own quad, so it takes the
same per-segment clip `regions.vert` already holds.

The cost is that two lines of different colours that cross take a channel-wise maximum at
the crossing pixel. The maximum adds nothing: a channel both lines write reads the stronger
of the two and never their sum. Where the two colours differ from channel to channel, the
pixel reads the brighter parts of both and not either colour whole. The pass keeps one
value for each pixel and the lines carry no depth order, so nothing there names a winner.

_Alternative considered: a mitred triangle strip per line._ A strip never overlaps itself, so
one draw would do and there would be no second buffer. A strip cannot take the region pass's
per-segment near-plane clip, because clamping one vertex of a strip moves the joint and kinks
the line, and a route line between two systems does cross the near plane at a close zoom. A
mitre also needs a length limit, which cuts the corner at a sharp turn — the fault the "no
bright dot" rule exists to prevent, in the other direction.

### A sphere is one instanced billboard with a limb-brightening falloff

A sphere draws as a screen-aligned quad at its centre, sized by its projected radius. The
fragment shader reads `r`, the distance from the centre in units of the projected radius, and
writes `alpha = min(1, opacity / sqrt(1 - r^2))`, which is 0 at and beyond `r = 1`. That is
the optical depth through a thin shell, so the edge of the sphere reads bright and the middle
reads faint, and a viewer sees a shell and not a disc.

The draw is instanced: one quad, one instance per sphere, so 1,024 spheres cost one draw
call.

_Alternative considered: a ray-marched sphere in a full-screen pass._ It reads the depth
buffer and gives a correct intersection with the star field, which no host asked for, and it
costs a full-screen pass for a set that is usually a few dozen spheres.

### A line point resolves at add time, not at draw time

A `{ system }` point is resolved against the current system set when `addLines` runs, and the
line holds the resolved position. A line therefore costs nothing per frame, and the pass
never reads the system set.

The cost is that a line added before its systems cannot resolve, and the whole line is
rejected with `unknown-system`. The demo site's listener runs **after** `loadDataset` writes
the set, which `dataset-catalog` states, so the demo never hits it, and a host that hits it
gets a reject it can read.

_Alternative considered: hold the identity and resolve every frame._ That makes a line follow
a set it was not added against, which is a surprise, and it puts a hash lookup per point in
the frame loop.

### The demo's shape data is JSON beside the system data, added by the catalog listener

`scripts/build-demo-systems.mjs` gains two conversions. The UIA one reads the four sphere
lists of `MapData-UIA.js`, the nine waypoint tables and the report file, and writes
`demo-data/uia.json`. The Adamastor one reads the
`routes` of `MapData-Adamastor.js`, resolves each point against that file's own `systems`
list and then against the EDSM name lookup, and writes `demo-data/adamastor.json`.

Both JSON files hold the systems, the categories **and** the shapes. `DatasetContent` keeps
its two arrays, so the shape part is read by the demo page and not by the library's dataset
reader.

`DatasetInfo`, which an `onDatasetChange` listener reads, carries the entry's id and no
content, so the listener needs a way back to the shapes. The demo holds a module-level map
from entry id to shapes. Each entry's `load()` imports its JSON once, writes that file's
shapes into the map under its own id, and returns the two arrays the reader wants. The
listener then reads the map by the id it is given and calls `addSpheres` and `addLines` in
the same step, with no wait.

**The listener must not wait.** It runs inside `loadDataset`, after that load has won its
ticket and written the set. A listener that imported the shapes itself would resolve later,
and a second load started in between would have cleared the shapes already, so the first
entry's route would draw over the second entry's systems. A synchronous read of a map that is
already filled cannot do that.

`clearSystemsAndCategories()` empties the shapes, which `map-shapes` states, and
`writeDataset` calls it before it writes, so a switch away from a shape set leaves none
behind. `src/app/datasets.ts` needs no change.

The EDSM lookup runs in the converter, at build time, and its answers are committed in the
JSON. The map makes no network call for a shape.

_Alternative considered: add `spheres` and `lines` to `DatasetContent`._ That puts the shape
types in the dataset reader, the dataset validator and every host's data file, for two demo
entries. The user chose shapes apart from the data sets.

### The UIA converter builds the run-time map and then reads it with the same two readers

`MapData-UIA.js` holds 16 systems and no route. `formatHDs` fetches nine waypoint tables
and one report file and builds everything else in the browser: 363 waypoint markers, the
route of each anomaly, one mean direction line each, and the two ends and the line of every
hyperdiction near an anomaly. A converter that reads the literal alone therefore writes a
set the live map never shows, which is what the first pass wrote.

The converter now builds the same entries the source builds, in the source's own shape: an
entry of a `systems` list and an entry of a `routes` list. It appends them to the parsed
source and hands the whole thing to `ed3dRecords` and `ed3dLines`, the two readers the
Adamastor set already uses. One rule therefore makes every record and one rule makes every
line, and the new code is only the part that reads the two files.

Three rules follow from the map and not from the source:

- **One name gives one record.** A waypoint is also an end of a hyperdiction, two
  hyperdictions share an end, and a sphere sits on a waypoint. `real-systems` holds one
  record per name, so `ed3dRecords` keeps the first entry of a name and merges the
  categories of a later one into it. 2,180 entries — 16 of the literal, 53 sphere centres,
  371 waypoints and direction points, and 1,740 hyperdiction ends — come to 1,116 records.
- **The direction line stops at the model bounds.** The source runs it 65,000 light years
  out, and `addSystems` rejects a record outside the bounds, which cost the set its eight
  direction markers on the first run. The converter clips the ray instead, so the line
  points the same way and ends where the map ends.
- **The estimated position marker is left out.** The source works it out from the clock at
  the moment the page opens. A committed file cannot hold a value that follows the clock.

The set draws 983 lines, which is why `MAX_LINES` rises from 1,024 to 4,096. The report
file grows with every report, so 4 per cent of room over the reading is not room at all.
The cost of the raise is the segment buffer, which holds `MAX_LINE_POINTS + MAX_LINES`
segments: 4,096 costs 4.6 per cent more than 1,024, and the draw call count does not move.

_Alternative considered: keep the demo set at the 16 systems of the literal._ That is a
smaller file and a set that does not match the map it is named after. The owner chose
everything, with the cap raised in the same change.

## Risks / Trade-offs

**The four region-view search counts move under this change and the numbers are not known
yet.** → The spec marks all four "to be measured" and requires the implementation to write
the readings in. `tests/region-views.test.ts` asserts each count, so a stale count fails a
test rather than sitting in the spec.

**The library entry chunk bound is a guess of 230,000 bytes.** → The spec requires the
implementation to read the built size and set the bound about 30 kB above it, and to move the
bound rather than work around a reading that lands far from 230,000.

**A per-pixel half width changes every region screenshot the browser suite holds.** → The
change is meant to be visible, so every region baseline is rebuilt once, by hand, and read
against the reference before it is committed.

**The MAX-blended line buffer is a second frame-size buffer.** → It is RGBA8 at the drawing
buffer size, 8.3 MB at 1920x1080 at a device pixel ratio of 1. It is allocated only when the
map holds a line and the shapes are on, and it is released with the rest of the pass.

**The Adamastor route names may not all resolve.** → 3 of the 41 points do not:
`Extention1`, `Extention2` and `Route Intersection` are not system names. The converter drops
an unresolvable point, drops a route left with fewer than two points, and reports both, so
the build is never silently short.

**EDSM's name lookup is a third-party service the build depends on.** → It runs in the
converter, not in the map, and its answers are committed. A build with no network reads the
committed JSON and does not call it. The converter is run by hand when the source data
changes.

**`RegionMode` goes from the published surface.** → The package is at version 0.1.0 and the
surface is not frozen. The removal and its migration are written in the
`galactic-regions` and `library-package` deltas.

## Migration Plan

There is no data migration and no stored state to move. The steps are:

1. Land the region width, the fade figures and the one boundary set together. They touch the
   same three shaders and the same worker message, and a half-landed pair draws a band with
   the wrong profile.
2. Rebuild the region browser baselines and read them against the reference.
3. Land the drawn category, the two keys and the flight time, which are independent of each
   other and of step 1.
4. Land `map-shapes`: the set, the pass, the handle members and the HUD switch.
5. Land the two converters, the two JSON files and the two catalog entries.
6. Update `THIRD_PARTY_NOTICES.md` with the two Canonn sets and EDSM, and extend the
   attribution scenario of `galactic-regions` that `tests/third-party-notices.test.ts` reads.
7. Update `docs/roadmap.md`.

**Rollback**: the change is one branch. A host on 0.1.0 that cannot take the `RegionMode`
removal stays on the released version until it takes the two-line migration.
