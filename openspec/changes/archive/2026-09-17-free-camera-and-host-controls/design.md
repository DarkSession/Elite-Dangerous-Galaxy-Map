## Context

See [proposal.md](proposal.md) for the motivation. The facts that shape the approach:

- `src/camera/flight.ts` is a pure function of two views and a time. The frame loop in
  `src/app/create-map.ts` owns the state. The new path needs numbers worked out once for
  each flight, so the module gains a plan object.
- `normaliseView` in `src/camera/view.ts` is the one place every limit is applied. The
  controls, the flight, `setView` and the fragment reader all pass through it. That makes
  it the right seam for the browsable bounds.
- `src/render/shaders/grid.frag` line 77 reads `float denom = min(dir.y, -1e-6);`, which
  hard-codes a downward ray. `src/app/plane-overlay.ts` line 293 reads
  `if (!(area > 0)) return null;`, which hard-codes one screen winding. These two are the
  whole cost of a camera under the plane. `region-composite.frag` already takes both
  directions, and `planePointFrom` in `src/camera/projection.ts` already does too.
- `systems.vert` receives `aOffset`, which the CPU works out as system minus camera in
  `float64`. The cull reads `length(aOffset)`.
- `src/app/url-view.ts` holds the fragment format and the demo page is its only caller.
- `src/hud/geometry.ts` repeats the camera rule because the HUD may not import
  `src/camera/`. A cursor range needs no camera, so the file loses that repeat.

## Goals / Non-Goals

**Goals:**

- One seam for every view limit, so a new bound cannot be applied in one path and missed
  in another.
- The flight module stays pure and testable without a DOM.
- The renderer learns no new concept. The cull change is one uniform.

**Non-Goals:**

- No change to the marker size rule, the picking ray or what the map draws outside the
  bounds.
- No new dependency. The path is about 40 lines of arithmetic.

## Decisions

### The flight becomes a plan plus a sampler

`flightAt(from, to, elapsedMs)` becomes `planFlight(from, to, limits)` returning a plan
that holds `r0`, `S`, `durationMs` and the two endpoint views, and `flightAt(plan, elapsedMs)`
returning a view. The Van Wijk terms `b(i)`, `r(i)` and `S` cost two `asinh` calls and are
the same in every frame of one flight, so working them out once a frame would be waste and,
worse, would let floating-point drift move the target between frames.

`FLIGHT_MS` goes. `plan.durationMs` replaces it. `debug.selectionFlightMs()` reads it, so
the browser tests keep their probe.

**Why not a tween library.** The path is not a tween. It is a closed-form geodesic that
needs the start and the end of both the cursor and the distance to work out its own length.
No tween library models that.

**Why `asinh` and not the `ln(-b + sqrt(b*b + 1))` of the paper.** They are the same
function, and the paper's form subtracts two nearly equal numbers when `b` is large and
positive. `b0` reaches about `0.873 * D / d0`, so the widest move the model allows, 163,430
light years at a distance of 10, gives `b0` of 14,269.48, where the paper's form loses about
6 of the 16 digits of a `float64`: it reads -10.259025468483 against the true
-10.259025471818, a gap of 3.3e-9. That is far inside the tolerance of every scenario, so
this is not a fault being fixed. It is a free choice: `Math.asinh` is exact across the whole range and is
one call rather than three. The implementation SHALL use `r(i) = -Math.asinh(b(i))`.

### The bounds live in one shape, resolved once

The three modes resolve to one internal shape:

```
{ kind: 'box',    min: [x,y,z], max: [x,y,z], maxDistanceLy }
{ kind: 'sphere', centre: [x,y,z], radiusLy,  maxDistanceLy }
```

`unrestricted` and `auto` both give a box; `sphere` gives a sphere. `normaliseView` takes
the resolved shape and applies it. `getBounds` returns what the host gave, kept beside the
resolved shape, because a host that reads back a resolved box after asking for `auto` would
have to guess which mode it is in.

**`auto` keeps a running box.** `addSystems` widens six numbers as it reads each record,
which the reader already walks. Nothing sweeps the set. `clearSystems`,
`clearSystemsAndCategories` and a dataset load reset the six numbers to empty, and an empty
box resolves to `unrestricted`.

**The far zoom limit is `2 * R`.** At a distance of `R / sin(fov / 2)` a sphere of radius
`R` is tangent to the frustum, so it just fills the height of the frame. `sin` and not
`tan`: `tan` is the rule for a flat disc facing the camera, and would cut the limit to
`1.73 * R`, which hides the edge of the space the user may browse.

**The arc can ask for more than the cap.** Where the two end distances are small next to
`D` the path peaks at about `0.873 * D`, and inside a sphere `D` reaches `2 * R`, so that
case peaks at `1.75 * R` against a cap of `2 * R`. The rule of thumb does not hold when the
start distance is itself large. With a start distance equal to `D` and an **end** distance
of 500, which is the spec's sphere scenario, the peak is about `1.16 * D`, and that is how
it reaches 4,647 against a cap of 4,000. With both end distances equal to `D` it is about
`1.33 * D`. The rule of thumb needs both end distances, not just the start. So
the cap does bind, and clamping the sampled distance is what handles it. The plan does not
need to know.

### The pitch: two lines, and the reason they are the only two

**`grid.frag`.** Replace the downward floor with a rule that takes the meeting where the ray
runs toward the plane:

```glsl
float denom = dir.y;
float safe = abs(denom) < 1e-6 ? (denom < 0.0 ? -1e-6 : 1e-6) : denom;
float t = uPlaneY / safe;
float along = t > 0.0 ? min(t, reach) : reach;
```

The floor is written out and not `sign(denom) * 1e-6`, because GLSL `sign(0.0)` is `0.0`
and a ray exactly along the plane would then divide by zero.

`reach` on a miss is what holds the derivatives finite on the horizon row today, and it
must hold on both sides. `uPlaneY` is no longer never-positive, so the comment at line 18
and the one in `grid-pass.ts` change with it.

**`plane-overlay.ts`.** The winding test compares against the side of the plane the camera
is on:

```ts
const side = camera[1] - placement.planeY;
if (!(area * side > 0)) return null;
```

At `side` of 0 the camera lies in the plane, every quad is edge-on, and the test drops
them all, which is right. This is one expression and it removes the need for any dead band.

**One other reading needs a change, and the rest do not.** `planePointFrom` already solves
for either sign, but `farthestPlaneRange` sampled the frame's two **top** corners, and the
far row of the frame is the bottom row under the plane. At a pitch of -45 degrees and a
distance of 4,000 light years the top row reads 3,918 light years and the bottom row 14,621,
so the label sweep gate dropped every region label of a frame that was full of plane. The
reading takes all four corners, which is the same answer above the plane and the mirror of it
below, and `galactic-regions` carries the delta. The rest hold as they are:
`region-composite.frag` tests `part >= 0.0` and is direction-free. The volume raymarch reads
`abs(point.y - uCentre.y)`. The cursor marker and the grid labels both reach the screen
through `planePlacement`, so the winding fix covers both.

**Alternative rejected: a dead band around 0.** It makes a drag jump 10 degrees through the
plane, and it does not remove either of the two fixes above, because a camera at -5 degrees
still needs the upward ray and the other winding.

### The cull moves to the cursor with one uniform

`systems.vert` gains `uniform vec3 uCursorOffset`, the cursor minus the camera in the
renderer's world frame. `SystemPassFrame` in `src/render/system-pass.ts` carries
`viewProjection`, `camera`, `pixelRatio` and `set` today, so it gains one field. The same
offset is already worked out for `grid.frag`, but in `grid-pass.ts`, which is a different
pass, so this is a new field here and not a value lying about. Then:

```glsl
float cameraRange = length(aOffset);              // the size, unchanged
float cursorRange = length(aOffset - uCursorOffset); // the cull, new
```

The CPU writes no new buffer and rebuilds nothing. The cost is one subtract and one length
for each marker vertex, at most 10,000 a frame.

**The count loop moves with it.** `rebasePositions` in the same file repeats the cut on the
CPU, because the shader cannot report how many markers it drew and `debug.systemMarkerCount()`
has to answer. It already walks every position, so it takes the same cursor offset and
compares against `offset - cursorOffset`. Its signature grows one argument. Left on the camera
range it would report a number the pixels contradict, which is the same fault one level down.

**Four sites hold this rule**, and they move together: the vertex shader cut, the count loop
beside it, `systemAt` in `src/scene-data/picking.ts`, and `rangeOf` in `src/app/markers.ts`
which gates the hover ring, the selection pin and the name labels. `rangeOf` gates on the
cursor range and still **returns** the camera range, because `markerCssSize` and
`offerNearest` read its return and both are camera rules.

**Alternative rejected: culling on the CPU.** It would need a sweep of the set on every
view change, which is 10,000 distance tests a frame against zero now.

### The grid label size comes from a composed worst case

The map builds the worst-case text from the active bounds: for each of `x`, `y` and `z` it
takes the bound endpoint whose `labelNumber` is the longer, and composes them with
`crossingLabelText`. Inside the model bounds that is `-49,985 : -40,985 : -24,105`, 27
characters, which `measure` reports at about 16.2 em wide against a cap of 0.698 em, so the
cap height is `0.6 * 0.698 / 16.2`, about **0.0259** of a spacing.

The string is composed from the real endpoints and not from 27 zeroes, so the measurement
stays honest if the page ever loads a font whose digits are not tabular.

It is cached against the bounds and the font, in the measurement cache the overlay already
holds, and recomputed when either changes. Each label's own `widthPerEm` still sets its own
box; only `capHeightLy` is shared. Because `capPerEm` is one number for a font, one cap
height gives one `fontCss` for the whole level, which is the size the user sees.

### The interaction switches gate inside the handlers

The listeners stay attached and each handler returns early when its switch is off. Detaching
and reattaching would lose a drag in progress, would need the pointer capture unwound, and
would let the page scroll under a disabled wheel, which the spec forbids. The wheel handler
still calls `preventDefault` before it reads its switch.

`select` gates the `onClick` call and the tap, not the press bookkeeping, so a press that is
not a click still behaves as a press.

### `startView` holds a pending identity with three exits

A host adds its systems after `createGalaxyMap` returns, so a `system` start cannot resolve
in the first frame. The map holds the identity and applies it in the first frame the set
holds it. It drops the pending start on the first `setView`, `flyTo` or `setSelection`, on
the first user input through the existing `onInput` hook, and after 600 drawn frames, which
is about 10 seconds at 60 frames a second.

The frame count and not a timer: the map already counts frames, a timer would fire while
the tab is hidden and the map is not drawing, and a host that loads a slow dataset would
lose its start view to a clock it cannot see.

**Alternative rejected: resolve only at the first `addSystems`.** A host that adds in
batches would lose the start when the first batch does not hold the system.

### `url-view.ts` moves rather than being rewritten

`formatViewFragment`, `parseViewFragment` and `parseGridFragment` are renamed to
`encodeView`, `decodeView` and `decodeGrid` and re-exported from the entry point. The demo
page imports them from there. The format does not change, so an old link decodes as it did.

## Risks / Trade-offs

- **The flight time changes for every selection, and a long one now takes up to 2 seconds.**
  → The owner set 600 ms by feel. `rho`, `V` and the two clamps are named constants in one
  file, and the four cases in the spec's scenarios pin the arithmetic, so retuning is a
  number change and not a rewrite. Reduced motion still arrives in one frame.
- **The cull change makes the default view draw every marker where it drew fewer.** → The
  set caps at 10,000 and the pass is one draw call. The task list measures the default view
  with a full set against the frame budget `real-systems` already holds, before anything
  else lands.
- **The Playwright baseline image may move**, because the default view now draws the outer
  disk markers it cut. → The task list reviews the baseline as its own step rather than
  regenerating it in passing.
- **A pitch under the plane is a large visual surface with two small fixes.** The risk is
  that a third assumption is hiding somewhere. → The task list adds a browser test that
  draws at -45 and +45 degrees and compares the two frames' overlay readings, which catches
  a missing element rather than a wrong pixel.
- **`RANGE` in the HUD reads `0 LY` after every landed selection.** The owner chose this
  with the consequence stated. → The spec records it as intended, so a later reader does
  not file it as a fault.
- **Labels near the origin lose about two thirds of their cap height.** → The owner accepted
  the loss on 2026-09-16 when the rule was chosen. A restricted bound gives the height back.
- **Seven items in one branch.** → The task list is ordered so each item is complete and
  tested before the next starts, and items 2 to 7 do not depend on item 1.

## Migration Plan

The package goes from 0.1.0 to 0.2.0 in one step. Two calls change what they do:

1. **`maxDrawRange`** now measures from the cursor. A host that tuned a range against the
   camera reads a different set of markers. The release note SHALL say so and SHALL name
   163,500 as the value that cuts nothing.
2. **The pitch floor** moves from 5 to -89. A host that clamped its own values to 5 keeps
   working; a host that wrote 5 as "lowest" now has more below it.

Nothing else is breaking. `startView`, `bounds`, `interaction`, `flyTo` and the three view
calls are additions, and a host that passes none of them gets the map it has today, with the
new flight path and the new pitch range.

There is no data migration and no stored state to convert. An old URL fragment decodes to
the same view.
