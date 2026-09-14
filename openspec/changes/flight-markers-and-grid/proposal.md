## Why

Four things in the close view read badly, and the demo data set does not show what the
HUD can hold.

1. **A selection teleports the camera.** `setSelection` writes the cursor and the
   distance in one frame. From a view at 20,000 light years the frame after the click
   shows another place in the galaxy, and the user loses the direction they came from.
2. **A marker changes size with the window.** The disc diameter is
   `focalCss * 20 / range`, and `focalCss` follows the viewport height. The same system
   at the same range therefore draws 12 CSS pixels in a 1,080 row canvas and 7 in a 400
   row one. Below 1,000 light years the size should not move at all, and in the last two
   wheel notches, from 50 down to 10 light years, a marker should grow.
3. **The grid is hard to see and hard to read.** Every line is one device pixel at an
   alpha of 0.10 or 0.20, so on a bright core the grid disappears. One spacing draws at
   a time, with a 1-2-5 sequence, so the blocks are 10, 20 or 50 light years and the eye
   cannot count them in tens. The grid draws at `y = 0`, so a cursor 600 light years
   above the plane looks at a grid far below the view. No line carries its coordinate,
   so the user cannot read a position off the frame.
4. **The demo data set holds two images.** It carries 381 systems in 15 categories, and
   two of them carry a picture. The information panel's thumbnail grid and its lightbox
   therefore show on two records out of 381, so a change to either is hard to see.

## What Changes

**The camera flies to a selection.** The move starts in the frame of the click and runs
for 350 ms on an ease-out curve. The cursor and the distance both interpolate. Any
pointer, wheel or key input ends the flight at once and leaves the view where the flight
had reached. The end state is what the map writes today: the cursor on the system, the
distance at `min(distance, 500)`, the yaw and the pitch unchanged.

**The marker size follows the range alone.** `markerCssSize` drops its `focalCss` term
and becomes one curve of the camera range in light years: 16 CSS pixels at 10 and below,
16 down to 12 from 10 to 50, a fixed 12 from 50 to 1,000, 12 down to 7 from 1,000 to
10,000, and 7 beyond. The pick radius, the hover ring, the pin offset and the name label
offset all read the same rule, so they follow. **BREAKING** for a host that measured the
old size: a marker at 4,000 light years grows from 7 CSS pixels to 9, and a glow sprite
caps at 40 CSS pixels rather than 30.

**The grid draws every decade level at once.** A level is a power of ten from 1 to
100,000 light years, and the grid draws them all together. A level's width and its light
follow its own spacing on the screen: a level 40 CSS pixels apart draws 1 CSS pixel wide
at an alpha of 0.18, and a level 400 CSS pixels apart draws 2.6 CSS pixels wide at an
alpha of 0.45, on a smooth step between. A level closer than 40 CSS pixels fades out and
is gone at 8. Two or three levels therefore carry the frame at any one zoom, and they read
as 10 / 100 / 1,000 light year blocks over a whole decade of zoom. Nothing steps as the zoom
crosses a decade, because a level's look follows its spacing on the screen and not its
rank.

**The grid plane follows the cursor.** The grid draws at the cursor's own height, not at
`y = 0`. The camera is above the cursor at every pitch the map allows, so the grid is
always under the camera.

**The grid carries coordinates.** The label level is the smallest power of ten at least
400 CSS pixels apart on the screen, which is 1,000 light years over the zoom band from
234 to 2,337 light years. A label sits at each crossing of that level and reads the two
plane coordinates in light years. At most 32 labels are placed in a frame, nearest the
centre of the canvas first. One more label, centred on the lower edge of the canvas and 22 CSS
pixels above it, states the height the grid plane sits at.

**The demo page loads the Guardian Ruins set.** The set is a conversion of
`Source/data/MapData-GR.js` of CanonnED3D-Map and the `guardian_ruins.json` dump it
fetches: 600 sites in 212 systems, in three categories (Ruins Alpha, Ruins Beta, Ruins
Gamma). 166 of the 212 systems hold more than one site type, so most records carry
secondary categories. Each system carries one thumbnail for each site type it holds, by
its `ruins.canonn.tech` URL, so the project redistributes no image. The 15 categories of
structures and beacons go. The source names a fourth category, Unknown, which no record
of the dump uses, so the conversion drops it rather than put an empty row in the HUD's
category browser.

**Non-goals.** The flight does not change the keyboard or the pointer controls. The
selection stays out of the URL fragment. The grid keeps its switch and still starts off.
No spec of the far view, the star field or the region overlay changes. The library still
ships no data and fetches none: the demo page is a host application, and it alone loads
the ruins set.

Two more are worth naming, because a reader will look for them.

**The HUD's centre view button keeps its instant move.** The button moves the cursor and
keeps the distance, so it does not zoom, and the flight's value is in the zoom. It also
reaches the map through `setView`, which ends a flight by the rule above, so making it fly
needs a new public method. That belongs with the typed library API of phase 5, and
`map-hud` therefore does not change here.

**The region boundaries stay at `y = 0`.** The grid moves to the cursor's height and the
boundaries do not, so a user who presses `R` or `F` sees the two on different planes. The
boundaries mark regions of the galaxy, which are at the plane; the grid is a ruler for the
height the user is looking at. Moving both would need a spec of what a region boundary
means off the plane, which no request asks for.

## Capabilities

### New Capabilities

None. Every change lands in a capability the project already holds.

### Modified Capabilities

- `system-selection`: the selection flight replaces the instant view write, and the pick
  radius follows the new marker size rule.
- `real-systems`: the marker size rule loses its viewport term and gains a close band,
  the glow sprite cap moves from 30 to 40 CSS pixels, and the demo data set the dev page
  loads is stated.
- `coordinate-grid`: every decade level draws at once, a level's width and light follow
  its spacing on the screen, the plane follows the cursor, and the label level carries
  coordinate labels on its crossings.

## Impact

**Code**

| File                              | What changes                                            |
| --------------------------------- | ------------------------------------------------------- |
| `src/scene-data/marker-size.ts`   | The size curve, with no `focalCss` term                 |
| `src/render/system-pass.ts`       | The size uniforms the shader reads                      |
| `src/render/shaders/systems.vert` | The same curve in the vertex shader                     |
| `src/scene-data/picking.ts`       | Reads the new size; `focalCss` leaves the radius rule   |
| `src/app/markers.ts`              | Reads the new size for the ring, the pin and the labels |
| `src/render/grid-pass.ts`         | The decade levels, the widths, the plane, the labels     |
| `src/render/shaders/grid.*`       | One plane fill with the levels in the fragment shader   |
| `src/app/grid-labels.ts`          | New: the crossing labels in the overlay                 |
| `src/app/create-map.ts`           | The flight, and the grid label overlay in the frame loop |
| `src/camera/flight.ts`            | New: the interpolation and its curve                    |
| `src/app/demo-systems.json`       | The Guardian Ruins set with its thumbnails              |
| `tests/fixtures/guardian-ruins.*` | New: the extract and the expected conversion output     |
| `scripts/build-demo-systems.mjs`  | New: the conversion, so the set is reproducible          |

**Tests**: `e2e/grid.spec.ts`, `e2e/selection.spec.ts`, `e2e/systems.spec.ts` and
`e2e/frame-budget.spec.ts` all read numbers this change moves. `e2e/hud.spec.ts` holds a
test that reads a demo record's picture from the built page; the new set names its pictures
on another host, so that test takes a record of its own and a picture the build serves, and
the browser suite still reaches no network. `src/camera/flight.test.ts` and
`src/render/grid-pass.test.ts` hold the unit readings.

**Documents**: `README.md` names the demo set. `THIRD_PARTY_NOTICES.md` names the source
of the records and of the thumbnail URLs. `docs/roadmap.md` gains this phase.

**Scale**: the set still holds at most 10,000 systems, and the marker pass still draws
them in one call with no level of detail. The grid still draws in one call, and its
vertex count is fixed at 3, which no data size and no zoom changes. The galaxy holds
about 400 billion systems, and nothing here reads that number: the grid and the markers
both cost what the view costs, not what the galaxy holds. The grid's cost moves from its
vertices to its fill: it draws 3 vertices rather than 516, and its fragment work is what
the 1 ms budget now measures.

**Risk**: a glow sprite caps at 40 CSS pixels rather than 30, which is 1.78 times the
fragments. The frame budget of 16.7 ms with 10,000 glow markers at the cap is the reading
that has to be taken again.
