## Context

See proposal.md — Why. This change touches four modules that share no code: the camera
controls, two HUD panels, the region overlay and the grid labels. The design below states
how each one changes, and the readings the specs already fix.

Three facts of the tree shape the work.

- `attachControls` in [src/camera/controls.ts](src/camera/controls.ts) branches on
  `event.button`. A touch pointer reports button 0, so a finger orbits today. The module
  holds every gesture rule as a pure function (`dragCursor`, `orbit`, `zoomTarget`), and
  the event handlers do nothing but read the event and call one.
- The region overlay is three passes: a ribbon draw into a single-channel coverage buffer
  with a `MAX` blend, a separable blur of that buffer, and a full-screen composite that
  reads it. `RegionPassFrame` carries `viewProjection` with no translation, so the camera
  sits at the origin of the frame the pass works in.
- `createLabelOverlay(...).update(view, viewport, on)` in
  [src/app/labels.ts](src/app/labels.ts) takes no time. Every rate in the module is
  therefore a rate per frame.

## Goals / Non-Goals

**Goals:**

- One gesture state machine for touch, with the view rules as pure functions a unit test
  reads without a browser.
- A region fade that is a property of the fragment, not of the frame, without a second
  channel in the coverage buffer and without a second draw of the boundary set.
- Label motion that is a rate per second, with every measured 60 frames a second reading
  of the current spec still true.
- No change to the far view. `e2e/look.spec.ts` and its baseline image must not move.

**Non-Goals:**

- No change to the mouse, wheel or keyboard rules.
- No pointer event abstraction layer. The module keeps the DOM events it has.
- No change to the region worker, the traced set or the Chaikin smoothing.
- No new frame loop. The label overlay reads the time the loop already measures.

## Decisions

### 1. The touch gestures live in `controls.ts`, beside the mouse rules

`attachControls` keeps a `Map<number, PointerState>` of the touch pointers that are down,
keyed by `pointerId`. The handlers branch on `event.pointerType === 'touch'` first and
fall through to the button rules for every other type, so a pen and a mouse are untouched.

**The gesture is a pure reducer.** `vitest.config.ts` sets `environment: 'node'`, so a
unit test has no DOM and cannot drive `attachControls`. The gesture therefore lives in a
pure function pair, the way `dragCursor`, `orbit` and `zoomTarget` already do:

- `touchGesture(state, event)` takes the gesture state and one reading — a pointer down, a
  pointer move, a pointer up — and returns the next state and what the view must do: a
  plane drag, an orbit, a distance, a select, or nothing. The reading is a plain record of
  `pointerId`, `pointerType`, `x` and `y` in CSS pixels and a time in milliseconds, which a
  unit test writes by hand.
- `pinchDistance(startDistance, startGap, gap)` returns the clamped distance, and
  `pinchMiddle(a, b)` returns the point half way between two pointers. `touchGesture` calls
  both.

`attachControls` keeps only the DOM work: it turns a `PointerEvent` into that record, calls
`touchGesture`, and applies what comes back through `dragCursor`, `orbit` and the distance
write. While three or more pointers are down the reducer reads the two that went down first,
so a palm or a resting finger does not stop the map. Every scenario the `map-navigation` delta marks "a unit test" reads `touchGesture`,
and the ones marked "the browser test" read the whole path.

`touchGesture` restarts on every change in the count of pointers: it reads the gap and the
middle again from the pointers that are down and asks the caller for the plane point again.
This is what stops the jump a second finger would otherwise make, and a unit test reads it
without a canvas.

`canvas.setPointerCapture` is called for the first touch pointer only. A second capture
call on the same element is not an error, but the release path then has two ids to track
for no gain: the capture is on the element, not on the pointer set.

**`touch-action: none` is an inline style on the canvas, written by `createMap`.** The
tree has no style the map writes for the canvas: the only style sheet the library injects
is [src/hud/styles.ts](src/hud/styles.ts), and the HUD is opt-in, so a rule there would
take every gesture away when the HUD is off. The canvas comes from the host, so `createMap`
writes `canvas.style.touchAction = 'none'` when it attaches the controls and puts back what
was there when it disposes. An inline style also beats a host style sheet that sets
`touch-action: auto`, which a general reset sheet may do.

A host that had to set the property itself would get a map that scrolls the page under the
user's finger, and the fault would read as a bug in the map.

The tap takes a move limit of 10 CSS pixels rather than the mouse's `CLICK_MOVE_CSS` of 4.
The browser reports the middle of a contact patch several millimetres wide, which moves more
than 4 CSS pixels in a tap the user means to hold still.

**Alternative rejected**: a `TouchEvent` listener beside the pointer listeners. Pointer
events already carry every touch, `setPointerCapture` already holds a pointer that leaves
the canvas, and two event families on one element means two code paths that must agree
about which one handled an event.

**Alternative rejected**: a pinch that reads the gap of the frame before, not of the
gesture start. It drifts: a pinch out and back leaves the distance where the rounding of
each frame left it, not where it began.

### 2. The region fade moves into the composite shader

The composite is a full-screen pass, so it can find the plane point under each pixel
itself. Two new uniforms carry what it needs:

- `uInverseViewProjection`, the inverse of the matrix the ribbon pass already takes. The
  camera is the origin of that frame.
- `uPlaneY`, which is minus the camera's `y`. The galactic plane is `y = 0` in the world,
  so it is `uPlaneY` in the camera's frame.

The shader unprojects the fragment's clip point, makes the ray from the origin, and
intersects it with `y = uPlaneY`. The length of the ray to that point is the range. The
range fade is `smoothstep(10000, 20000, range)`, and the fragment's alpha is the coverage
alpha times that fade times the frame's zoom fade.

A ray that does not meet the plane, which is a pixel above the horizon, takes a fade of 1.
Coverage only reaches such a pixel through the blur, from a line whose own range is very
large, where the fade is 1 anyway.

**Alternative rejected**: a second channel in the coverage buffer holding the range. It
doubles the buffer, and the `MAX` blend that the coverage needs is wrong for a range: two
lines that cross would give the range of the far one to both. The spec records that an
earlier per-pixel fade worked this way; the composite's own ray is cheaper and exact.

**Alternative rejected**: a fade per vertex in the ribbon program. The coverage buffer
holds one channel and the `MAX` blend, so a faded coverage value cannot be told from a
thin line, and the blur would then smear the fade into the normalisation.

**What this costs.** Two more uniforms and about ten instructions in a full-screen pass
that already runs. Nothing reads a star system, so the cost is the same at 400 billion
systems as at none.

### 3. The blur takes a floor on its standard deviation, and reads the radius at the fade

`regionBlurRuns` goes. The kernel's standard deviation becomes `max(radius / 3, 1)` CSS
pixels and the tap count follows it as `2 * ceil(3 * sigma) + 1`, so a small radius still
gives a 7 tap kernel and a straight staircase still softens.

The range fade takes **its own two constants**, `REGION_RANGE_NONE` of 10,000 light years
and `REGION_RANGE_FULL` of 20,000. It must not reuse `REGION_CLOSE_NONE` and
`REGION_CLOSE_FULL`: those are the close end of the **label** zoom band, which this change
keeps, and a later move of the label band would otherwise move the boundary fade and the blur
radius floor with it.

`regionBlurRadiusCss` reads the cell at `max(cursorDistance, REGION_RANGE_NONE)`: the
cursor, with a floor. The nearest line that draws is 10,000 light years off, so the widest
staircase in the frame is the cell at 10,000 light years, whatever the zoom. Reading at
the cursor would ask for a radius of 40 CSS pixels at a zoom of 1,000 light years, for a
staircase no pixel of the frame holds.

`regionBlurRuns` has two call sites: `regionBlurPeak` returns 1 when it says no, and `draw`
skips the blur passes when it says no. Both take the same replacement predicate, **the
radius is above 0**. The radius is 0 in `simplified`, which never blurs, and above 0 in
`accurate` at every zoom, so the two modes keep the behaviour the spec states and the
normalisation follows the kernel that actually ran.

A unit test reproduces the kernel, the ridge and twelve sub-pixel phases and checks the
table in the spec, so the floor's effect on the table is measured and not assumed.

**Alternative rejected**: a radius that follows the nearest drawn line in the frame. It
needs a reading of the depth buffer or a pass over the boundary set, and it gives a radius
that changes as the camera turns, which reads as the band breathing.

### 4. The label filter takes seconds, and the drift cap sits on the target

`update(view, viewport, on)` becomes `update(view, viewport, on, seconds)`. The loop in
[src/app/create-map.ts](src/app/create-map.ts) already computes `seconds`, clamped to 0.1,
and passes it to `controls.update`. The label overlay reads the same value, so a tab that
comes back from the background does not teleport every label.

`drawFrame` is also called from several places outside the loop, the debug hooks and the
first draw among them. **Every call outside the loop passes 0 seconds**, stated as a rule and
not as a list of call sites, because a new call site must follow it too. Such a call redraws
the frame the loop last built and must not advance a filter. A browser test that steps frames
by hand therefore reads a still picture, and a test that wants the label to move drives the
loop.

`update` also takes a **jump** flag. `createMap` knows which writes of the view are jumps:
`setView`, the landing of a selection flight and a view read from the URL fragment. A drag,
a wheel glide and a flight in progress are not. On a jump the overlay drops the carried
target and takes the frame's own target whole, and keeps the anchor. The anchor then walks to
it at 1,200 CSS pixels a second, which is what the spec's push and crawl scenarios measure,
so the drift cap does not change a single measured landing time.

Each rate becomes a rate per second, set so that a frame of 16.667 milliseconds gives the
figure the module holds now:

| Rule           | Now, per frame | After, per second                       |
| -------------- | -------------- | --------------------------------------- |
| Target share   | 0.150          | half-life of 71 milliseconds            |
| Anchor share   | 0.5            | half-life of 16.667 milliseconds        |
| Anchor cap     | 20 CSS pixels  | 1,200 CSS pixels a second               |
| Anchor floor   | 0.4 CSS pixels | 24 CSS pixels a second                  |

The anchor keeps its 1,200 CSS pixels a second. The spec's push scenario reads 8 CSS
pixels of the middle at frame 13, which is 217 milliseconds, and that figure is tied to
the landing time of the wheel zoom glide. A cap of 240 CSS pixels a second would break it.

The **drift cap** is what answers the user's report, and it sits on the smoothed target,
not on the anchor: a target may not move more than `carry + 120 * seconds` CSS pixels in a
frame, where `carry` is how far the projection of the point it already held moved. A label
therefore travels with the map for free and drifts over the map at 120 CSS pixels a second
at most. `targetShare`'s growth with the cube of the gap goes, and so does the gate that
took the whole gap at 120 CSS pixels.

The handover from the centroid rule to the frame-samples rule takes a hysteresis band: the
centre rule is taken up when the centroid is inside the frame, and held until the centroid
leaves the frame grown by a quarter. Without the band a centroid that sits on the frame edge
changes the rule in every other frame, and the two rules can name points most of a frame
apart.

**The ring search stays as it is.** The rings of 12, 24, 48 and 96 CSS pixels name a target,
and the drift cap is what the label follows to get there: a ring 96 CSS pixels away is now
0.8 seconds of walking and not one frame. Making the rings finer would change which point
the search names without changing how the label reaches it, and the spec states why four
rings are enough.

**Alternative rejected**: a fixed frame time of 16.667 milliseconds. It is the fault, not
a fix: the display decides the frame time and the module must read it.

**Alternative rejected**: working out a jump from how far the frame moved. A fast drag and a
`setView` can move a point the same number of pixels in one frame, so a gate on the motion
would fire on a drag or miss a small jump. The caller already knows which it wrote.

**Alternative rejected**: a cap on the anchor alone. The anchor is what makes a label that
must really move go where it belongs at once. The complaint is about a label that travels
while the map holds still, which is the target's own drift.

### 5. The HUD changes are DOM and CSS only

- `.gm-hud__field-grid` keeps its two columns. The `POSITION` field takes
  `grid-column: 1 / -1`. `DISTANCE FROM SOL` and `RANGE` follow it in order, so the grid
  puts them on the row below with no rule of their own.
- The existing rule `.gm-hud__field:last-child:nth-child(odd)` widens a field that is alone
  on its row. `POSITION` now fills two cells, so a grid of `n` fields fills `n + 1` cells and
  the last field is alone when `n` is **even**. The selector becomes `:nth-child(even)`.
- The `::after` rule that draws `data-distance` on a system row goes, and so does the
  `row.dataset['distance']` write in [src/hud/categories.ts](src/hud/categories.ts).
- `let expanded: string | null` becomes `let open: Set<string>`, which is **state and not a
  reading of the filter text**. A change of the filter text writes it: to the categories that
  hold a kept system while the text is not empty, and to the one category the user last
  expanded by hand while it is. The expand button adds or removes one name from it. A rebuild
  of the panel reads it and never writes it, so a fold made during a search survives the next
  camera move. The pure part is `matchingCategories(filter, groups)`, which a unit test reads;
  the seeding is one call of it on each text change.
- `MAX_SYSTEM_ROWS` becomes a budget over every open list together. Each open list draws
  at most `floor(200 / open)` rows, so the HUD's node count does not follow the
  count of open categories. This keeps the budget the `map-hud` spec states.
- The panel holds up to 256 categories, so `floor(200 / open)` can reach 0. The **first 200
  open lists in the panel's own order draw one row each, and every open list past the 200th
  draws none**: its category is still marked open and still shows its count, and the user
  narrows the filter to reach it. Without the tie-break a filter that matched in 256
  categories would draw 256 rows and break the budget it is there to hold.

**Alternative rejected**: 200 rows for each open list. A filter that matches in 12
categories would then build 2,400 rows, and the spec's node budget exists because the
panel is rebuilt on every camera move.

### 6. The grid label factor reuses the reading the gate already takes

`GridLabelPlacement` already carries `alpha`, the drawn alpha of the label level at the
crossing, because the placement gate reads it. The style step multiplies the label's
opacity by `alpha / GRID_MAX_ALPHA`. No new sweep and no new projection.

The existing gate of 0.09 is the floor of the factor as well: `0.09 / 0.45` is 0.2, so no
label draws below a fifth of its own opacity and no extra floor is needed.

`alpha` never leaves the module today, so the browser test that reads it needs a hook.
`GalaxyMapDebug` takes `gridLabelReadings()`, which returns for each label of the last frame
its text, its position in CSS pixels, its `alpha` and the opacity it was given. It follows
`gridSpacingLy()`, which the grid label scenarios already read.

[src/app/grid-labels.ts](src/app/grid-labels.ts) already imports `gridVisibility` from the
render module, so `GRID_MAX_ALPHA` comes from the same place and no copy of 0.45 is made.

## Risks / Trade-offs

- **The range fade invalidates the measured readings of the `galactic-regions` spec.** →
  The three views that compare a window with itself move to a zoom of 20,000 light years
  with the cursor on the reading point, where the fade's step ends and its slope is zero, and
  the viewport moves with the zoom so each window keeps its size in CSS pixels and in light
  years. The both-sets view is exempt: it exists to be read inside both fades. Every figure must be measured again and written down.
  The tasks state this as its own step.
- **The composite's ray is an approximation for a blurred pixel.** → A blurred pixel sits
  up to 8 CSS pixels from the line that fed it, so it reads the range of its own plane
  point and not of that line. The difference matters only near the horizon, where both
  ranges are far above 20,000 light years and the fade is 1 for both.
- **The floored blur now runs at every zoom in `accurate`.** → The pass costs one more
  full-screen read and write pair at zooms that skipped it. The spec's cost scenario moves
  to the widest kernel the radius rule can give, which is 11 taps at a zoom of 10,000 light
  years and below.
- **A touch user's one-finger drag changes meaning.** → This is stated as BREAKING in the
  proposal. There is no setting to keep the old gesture: two gestures on one finger cannot
  both be the default.
- **`touch-action: none` takes the browser's own zoom away over the canvas.** → It is what
  makes the pinch reach the map at all. The HUD and the page around the canvas keep their
  own behaviour, because the property is on the canvas alone.
- **The range fade takes the boundary out of one `coordinate-grid` scenario's view.** →
  "The overlays draw over the grid" reads the drawing order at a zoom of 8,000 light years at
  a pitch of 89 degrees, where every pixel's plane point is about 8,000 light years from the
  camera and the boundary would now draw nothing. The `coordinate-grid` delta moves that view
  to a pitch of 5 degrees, where the crossing's plane point is beyond 20,000 light years, and
  restates the expected ratio. The reading itself must be measured again.
- **The overlay now draws at every zoom under 30,000 light years, in both modes.** → A
  browser scenario outside `galactic-regions` that reads pixels at a close zoom may now see
  band pixels near the horizon, where nothing drew before. `e2e/grid.spec.ts` turns the regions off in every
  test but the one above; every other suite must be read for a pixel assertion at a close zoom, and
  the ones that find one turn the overlay off as the grid suite does.
- **The touch browser tests need a second Playwright project.** → `devices['Desktop Chrome']`
  sets `hasTouch: false`, so a touch context is a new project. It shares the GPU launch
  arguments, and `e2e/look.spec.ts` stays in `chromium-gpu` alone, so the baseline image is
  still read by one project. Only one Playwright run may be in flight, because a second run
  takes the first one's server on port 4173.
- **The label rate change touches a module with 30 measured scenarios.** → Each rate is set
  so a frame of 16.667 milliseconds gives the figure the module holds now, and one new
  scenario reads the four rates at that frame time. A reading that moves is then a fault
  and not a re-tune.
