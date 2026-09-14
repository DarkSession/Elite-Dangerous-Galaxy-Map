## Context

See [proposal.md](proposal.md) for the motivation. This document covers how the four parts
are built.

What the tree holds today, and what shapes the approach:

- **The view** is one object of a cursor, a distance, a yaw and a pitch, in `float64`, held
  by `src/app/create-map.ts`. `setSelection` writes it in one call and raises the view
  change listeners once. The frame loop is a plain `requestAnimationFrame` loop in the same
  file, and it already runs every frame whether the view moved or not.
- **The marker size** lives in one function, `markerCssSize(focalCss, range)` in
  `src/scene-data/marker-size.ts`. Three readers use it: the marker pass, the pick sweep
  and the overlay marks. The vertex shader holds the same rule a second time, as
  `clamp(uScale / range, uLimits.x, uLimits.y)`, and `uScale` carries `focalCss * 20`.
- **The grid** is `src/render/grid-pass.ts`: 258 line primitives built on the processor
  every frame into two `Float32Array` buffers, drawn with `gl.LINES` at `lineWidth(1)`. The
  fragment shader reads the plane offset in spacings and picks one of two alphas. The
  browser tests read the drawn lines from `debug.gridPlanes()`.
- **The overlay** is one element the library owns. `src/app/labels.ts` writes the region
  labels into it and `src/app/markers.ts` writes the hover ring, the selection pin and the
  marker name labels. Both are called once a frame from the loop, and both compare before
  they write, so a still map makes no DOM write.
- **The demo set** is `src/app/demo-systems.json`, loaded by a dynamic import that only the
  dev build keeps. The production build drops it, and the browser suite serves the
  production build.

## Goals / Non-Goals

**Goals:**

- One rule for the marker size, read by the pass, the pick and the overlay, with no
  viewport term, and held in one place.
- A grid whose cost does not follow its line count, so three levels and wide lines cost
  what one level and thin lines cost.
- A flight that never holds the user: any input ends it in the frame it arrives.
- A demo set that is rebuilt by a script and not by hand.

**Non-Goals:**

- No change to the public handle. `selectionFlightMs` is a `debug` member, not an option, so
  `GalaxyMapOptions` and the handle table of `real-systems` do not move.
- No animation for any other view change. The wheel, the drag and the keys stay as they
  are, and the flight code is not a general tween system.
- No change to the region overlay, the star field, the point cloud or the tone map.

## Decisions

### The flight is a pure function of two views and a time

`src/camera/flight.ts` holds `flightAt(from, to, elapsedMs)`, which returns a view, and
`FLIGHT_MS = 350`. It holds no state and no timer. `create-map.ts` holds the state: the
start view, the end view and the start time, or null when no flight runs. The frame loop
reads the clock once, calls `flightAt`, writes the view, and raises the listeners.

*Why not a tween library or a spring:* a spring has no end time, so `selectionFlightMs`
would have no answer and a test would have to wait for a threshold. A library is a
dependency for 30 lines of arithmetic, and the 7-day release hold makes each new dependency
a decision of its own.

*Why the frame loop and not a timer:* the loop already runs every frame. A timer would
write the view between frames and raise the listeners more often than the map draws.

### The cursor moves linearly and the distance geometrically

The cursor is a point, so a straight line between two points is what the user expects to
see. The distance is a scale, so it moves by a constant factor for each unit of eased time:
`d = d0 * (d1 / d0) ** e`. A linear distance from 20,000 to 500 light years would still be
at 10,000 half way through, where a light year covers no pixels, and would then cross the
last 1,000 light years in two frames. The wheel already zooms by a factor per notch, so the
flight and the wheel move the zoom the same way.

*Alternative considered:* interpolate the camera position rather than the cursor and the
distance. The camera position is worked out from all four view fields, so interpolating it
would change the yaw and the pitch as a side effect, and the spec says both hold.

### One `endFlight` call sits in the input handlers that already exist

`create-map.ts` already owns the pointer, wheel and key listeners. Each one calls
`endFlight()` first, which drops the flight state and leaves the view where it stands.
`setView` calls it too. There is no new listener and no capture phase, so a click that
starts a selection ends the flight and starts the next one in the same handler.

### Reduced motion is read at each selection

`window.matchMedia('(prefers-reduced-motion: reduce)').matches` is read when the selection
is made, not once at start up, so a user who changes the setting does not reload. Where it
is true, the map writes the end state and raises the listeners once, which is what it does
today. Playwright sets the media by test, so the existing selection tests take
`test.use({ reducedMotion: 'reduce' })` and keep their readings.

### The marker size is a log-linear curve with four stops

`markerCssSize(range)` loses its `focalCss` argument and reads a table of four stops:
`(10, 16)`, `(50, 12)`, `(1000, 12)`, `(10000, 7)`. Between two stops the size is even in
the logarithm of the range, and outside the ends it holds the end value. The curve is
monotone and continuous, which the unit scenario "The size curve is continuous" pins.

The vertex shader holds the same curve. It cannot import the table, so the pass sends the
four stops as two `vec4` uniforms, `uSizeRanges` and `uSizeValues`, and the shader walks
them. One edit of the table therefore changes the shader as well, and there is no second
copy of the numbers.

*Alternative considered:* work out the size for all 10,000 systems on the processor each
frame and send it as an attribute. The pass already rebases 10,000 positions each frame, so
40 KB more per frame is not the cost that rules it out; the reason is that the size is then
a frame-old value for any system the camera moved past, and the pick sweep and the shader
would disagree by one frame. The uniform keeps one rule with no copy and no lag.

*Consequence for the tests:* the cap of 16 is reached at a range of 10 light years or less,
where the old cap of 12 was reached at about 1,560. Every browser test that put a marker
"at the cap" has to put the camera on the system at the closest zoom.

### The grid becomes a plane fill with the levels in the fragment shader

The pass draws **one full-screen triangle**, 3 vertices, which is what `gridVertexCount()`
reports, with no depth test and alpha blending, in the same place in the frame it draws
today. For each fragment:

1. Un-project the fragment to a ray in camera-relative world space.
2. Intersect the ray with the plane `y = cursorY`, in camera-relative terms. The plane sits
   below the camera at every allowed pitch, so a ray that points up misses and the fragment
   is discarded.
3. Take the plane position of the fragment, relative to the camera, on `x` and `z`.
4. For each of the six levels, work out the distance to the nearest line of that level, the
   level's spacing on the screen at this fragment, its width, its alpha and its distance
   fade, and keep the largest alpha.
5. Discard where the plane position lies outside the galaxy model bounds.

*Why this and not geometry:* a line primitive takes its width from `lineWidth`, which most
drivers hold at 1 device pixel, so it cannot draw a 2.6 CSS pixel line. A ribbon of two
triangles a line can, but three levels over the reach each level needs is about 4,600
vertices, the same line is drawn by up to three levels, and the antialiasing has to be
written by hand anyway. The fill approach draws every level for the price of the plane, and
the antialiasing falls out of the derivative.

*The cost this moves:* the whole cost is now fill. The 1 ms budget is measured at a pitch
of 5 degrees, where the plane covers most of the frame. The early discards (the ray that
misses the plane, the position outside the bounds) keep the shader off the sky.

### The grid keeps its precision with a phase uniform per level

The galaxy spans 100,000 light years and the finest level is 1 light year apart, so
`float32` cannot hold an absolute plane coordinate well enough to place a line: at 50,000
light years the spacing of `float32` is about 0.004 light years, and at the closest zoom
one CSS pixel is 0.011 light years.

The processor therefore works out, in `float64`, the camera's own position modulo each
level's spacing, and sends the six pairs as a uniform array. The shader adds the
camera-relative plane offset, which is small near the camera, to that phase. The absolute
coordinate is never formed in the shader.

The browser scenario "A line sits on its coordinate at the closest zoom" reads this at a
cursor of (45,000, 0, 45,000), which is where a `float32` coordinate alone fails.

### The grid labels are a third writer into the same overlay

`src/app/grid-labels.ts` holds `createGridLabelOverlay(host)` with an `update(frame)` and a
`clear()`, which is the shape `markers.ts` already has. The frame loop calls it after the
marker overlay. It reuses `boxesOverlap` from `labels.ts` and the nearest-keep helper from
`markers.ts`, so the three overlay writers share one box test and one bounded-keep rule.

The candidate set is the 17 by 17 crossings of the label level within 8 spacings of the
cursor, which is 289 points. The sweep projects them with the same matrix the pick uses,
drops those outside the viewport or behind the near plane, keeps the 32 nearest the centre
of the canvas, and skips a box that overlaps one already placed. 289 projections a frame is
about a thirtieth of the pick sweep's 10,000, so the work sits inside the frame interval
bound the selection capability already holds.

*Why the DOM and not the canvas:* the region labels, the marker names and the selection pin
are all DOM, for the same reason: text stays crisp at every device pixel ratio and needs no
font atlas in a shader.

### The debug surface changes with the pass

`gridPlanes()` reported the plane offset of each line vertex. There are no line vertices
now, so it is removed. `gridLevels()` replaces it and reports, for each of the six levels,
its spacing, its spacing on the screen at the cursor, its width and its alpha at the
cursor. `gridSpacingLy()` keeps its name and reports the label level, which is the number a
user could read off the frame. `gridVertexCount()` keeps its name and reports 3.

`e2e/grid.spec.ts` is rewritten against these. The scenarios that read the frame rather
than the probes (the constant coordinate, the overlays over the grid, the bounds) keep
their shape.

### The demo set is built by a script and committed as the output

`scripts/build-demo-systems.mjs` reads `guardian_ruins.json`, groups the sites by system
name, and writes `src/app/demo-systems.json`. The file exports the conversion on its own,
as a function of the parsed dump that returns the record set. The fetch and the write run
in a separate part that the script starts only when it is the entry module. A unit test can
then import the conversion and run it over a fixture with no network and no file write. The script fetches the dump into `data/`,
which `.gitignore` gains, because the project does not commit dumps. `package.json` gains
`build:demo`.

The conversion rules are in the spec. The one to know here is that a system's categories
are its distinct site types in the order the dump lists them, and its images follow the
same order, so the primary category and the first thumbnail always agree.

*Why remote thumbnail URLs:* the pictures are Canonn's, hosted by Canonn. A URL reads them
without redistributing them, and the library never fetches an image itself: the browser
does, from the `src` the host put in the record. The three URLs were read while this design
was written and each answered with a PNG of about 50 KB. A picture that does not load
leaves the thumbnail's own pattern and its caption in view, which `src/hud/info-panel.ts`
already does, so a developer with no network sees a working panel.

*What this costs a browser test:* `e2e/hud.spec.ts` holds "a demo picture loads from the
built page", which reads `src/app/demo-systems.json`, puts its first pictured record on the
built page, and waits until every thumbnail has loaded. With remote URLs that test would
make the browser suite depend on `ruins.canonn.tech`, which the project does not accept:
`map-hud` already refuses a font CDN for the same reason. The test therefore stops reading
the demo set and names a record of its own, whose picture is a file the build serves from
`public/`. It still proves what it was written to prove, that the built page serves a
picture it is given. The demo set's own URLs are then checked by a unit test that reads
every record, which is a stronger check than the old test's one record.

*Why a committed fixture for the conversion:* the script fetches the dump into an ignored
directory, so a clean checkout and a CI run hold no dump, and a test that re-ran the script
would need the network. The repository therefore commits a small extract, about 20 sites
over 8 systems, and the expected output of the conversion over it. The rule test reads
those two files. The committed set itself is checked against the conversion's own rules
rather than rebuilt, because the live dump gains records and the committed file is a
snapshot of the day it was made.

## Risks / Trade-offs

**The glow fill at the closest zoom** → The cap moves from 30 to 40 CSS pixels, which is
1.78 times the fragments, and the worst case writes 16 million fragments over a 2 million
pixel frame. Measure it first, before the rest of the marker work is built on it. If the
16.7 ms budget does not hold, the close cap comes down from 16 to 14, which is 1.36 times
the old fill, and the spec's table changes with it.

**The grid fill at a pitch of 5 degrees** → Six levels of arithmetic over most of the frame
against a 1 ms budget. The discards are what hold it: a ray that misses the plane costs
nothing, and a position outside the model bounds costs nothing. If the budget does not
hold, the level loop stops at the first level whose spacing on the screen is over 4,000 CSS
pixels, because no further level draws a second line in the frame.

**A step where the plane meets the horizon** → At a pitch of 5 degrees the derivative of the
plane coordinate grows without bound toward the horizon, and the density fade takes every
level to 0 there. The frame should show the grid fading into the distance rather than
ending at a line. Read it in the browser before the budget is measured.

**The existing selection tests** → Every browser test that reads the view right after
`setSelection` now reads a view in flight. They take `test.use({ reducedMotion: 'reduce' })`
and keep their readings. `test.use` is scoped to a file or a `describe`, so the tests that
read the flight itself go in a `describe` of their own with no `test.use`, in the same
file.

**The baseline image** → The grid is off unless the options ask for it and the demo set is
dropped from the production build, so the committed baseline should not move. Check it
early; if it moves, the cause is a bug and not the change.

**The demo page needs the network for its thumbnails** → A developer with no network sees
the caption and the thumbnail pattern and no picture. That is the trade for not
redistributing Canonn's images. If it becomes a problem, the answer is to commit three
PNGs and add them to `THIRD_PARTY_NOTICES.md`, which is the option the owner did not take.

**The page chunk guard** → `tests/main-bundle.test.ts` holds a size limit on the page
chunk. The chunk read 144,230 bytes before this change and 152,848 after it, against a
limit of 150,000, so the change crosses the guard. The new bytes are the selection flight,
the grid pass and the grid labels, and not the import the guard watches for: the sibling
test still finds the 199 KiB region cell lookup in the region worker alone. The limit
therefore moves to 170,000, which still catches that regression, because a chunk that
pulled the lookup in reads over 340,000 bytes. The owner chose the new limit over a split
of the page chunk: a grid pass that arrives a frame late needs a spec of what the frame
shows meanwhile, which no request asks for.

## Migration Plan

The work goes in four independent parts, and each one can be built and merged on its own:

1. The marker size, because the glow fill measurement gates the numbers the other parts
   quote.
2. The selection flight.
3. The grid, which is the largest part and the one that rewrites a test file.
4. The demo set, which touches no library code.

No data migrates and no host has to change a call. A host that measured the old marker size
on the screen sees a bigger marker; nothing in the public handle changes name or type.

Rollback is per part: each is a self-contained set of files, and the parts do not read one
another.

## Open Questions

- Whether the coordinate label should carry a unit, as `1000 LY`, or the number alone. The
  HUD already writes `LY` after a distance in the top bar. This is a text change in one
  place and does not move the spec's bounds.
