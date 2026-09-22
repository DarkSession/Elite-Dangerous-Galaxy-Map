## MODIFIED Requirements

### Requirement: The cursor carries a marker on its own plane

The map SHALL draw a marker at the cursor, as a plane-overlay element on the plane of
constant `y` the cursor sits on. The marker SHALL be an element in the overlay the library
owns for the region labels, not a pass on the canvas, so it stays a crisp vector at every
device pixel ratio and needs no shader. The capability `plane-overlay` states the transform
and the culling.

Nothing on the screen says where the cursor is. The cursor is the point the camera orbits,
the point the zoom moves toward and the plane the grid draws on, and it may sit anywhere in
the model bounds, which reach 40,985 light years in `y`. A user who takes the cursor far off
the galactic disc sees an empty frame and cannot tell why, or where to go back to.

**The marker lies on the plane and does not face the screen.** It is a mark on the map at a
place of the map, so it SHALL take the perspective of the plane it sits on: a circle on the
plane reads as an ellipse on the screen, squashed by the pitch, and the arrows lean with it.
A mark that faced the screen would say where the cursor projects and not where it is.

**The shape.** In a box **160 by 160** units, with the origin at the top left and the centre
at (80, 80):

- a **ring**, centred on the box, of outer radius **48** and stroke **4**, so its inner
  radius is 44;
- **four arrows**, each the outline through (80, 5), (93, 16), (90, 16), (90, 24),
  (70, 24), (70, 16) and (67, 16), closed back to the tip. That arrow points toward
  **negative `z`** in the game frame. The other three SHALL be the same outline turned about
  the centre of the box by 90, 180 and 270 degrees, so one points along each of the game
  `x` and `z` axes.

The arrow's tip therefore sits 75 units from the centre and its base 56, which clears the
ring's outer radius of 48 by 8 units. The arrows say which way the cursor moves, and the
ring says where it is.

**The look.** The fill of both the ring and the arrows SHALL be **`#3EF8FB`**, the same cyan
family the coordinate grid draws in. The marker carries no outline: by the Rec.709 weights
the map uses everywhere its luminance is **0.818**, above every part of the frame but the
core itself.

**The size.** The box SHALL be square on the plane, and its side SHALL be the light years
that the **box size on the screen** covers along the screen's horizontal at the cursor. The
ring measures 0.6 of the box and the arrow tips 0.94 of it, so both follow that one size.

**The box size on the screen SHALL follow the camera's distance to the cursor.** Let `d` be
that distance in light years. The size SHALL be `96 - 56 * smoothstep(12000, 60000, d)` CSS
pixels, which is:

| `d` light years | Box CSS pixels | Ring CSS pixels |
| --------------- | -------------- | --------------- |
| 12,000 and less | 96             | 58              |
| 30,000          | 78.3           | 47              |
| 60,000 and more | 40             | 24              |

The size is read on the screen and not fixed in light years because the marker is a control
and not a place: a fixed size in light years would fill the frame at a close zoom and vanish
at a wide one.

**One size at every zoom is wrong at the wide end.** The marker held 96 CSS pixels from the
closest zoom to the furthest. At the start view of 60,000 light years the galaxy disc
measures about 1,000 CSS pixels across a 1,080 row frame, so the marker covered about a
tenth of it and read as a thing of the map rather than as the cursor.

The near end of the band is **12,000** light years, which is where the coordinate grid goes
out. The marker therefore holds its full size through every view the grid draws in, and
shrinks only in the views that show the galaxy whole. The floor of **40** CSS pixels holds
the ring at 24 CSS pixels across, which is still a mark a user can find and tap.

**When it draws.** The marker SHALL draw in every frame the map draws, and SHALL be dropped
only by the rules `plane-overlay` states, which is a cursor behind the near plane or off the
frame.

**The switch SHALL be on the supported surface and not on `debug`.** `GalaxyMapOptions` SHALL
carry an optional `cursorMarker`, and the handle SHALL carry `setCursorMarkerVisible(on)` and
`isCursorMarkerVisible()`. The reader was `getCursorMarkerVisible()`; the name follows
`isGridVisible()`, and `real-systems` states the naming rule. The default SHALL be **on**. The grid is the precedent: it holds
a `grid` option and `setGridVisible`, and its pass switch on `debug` is a probe for the
browser tests and not the way a host turns it off. A host that draws its own cursor needs a
supported way to turn this one off, and `debug` is stated as no part of the supported
surface.

**The marker draws under the upright overlay elements.** A selection pin, a hover ring, a
marker name label or a region label at the same place SHALL draw over it, because each of
those names one thing and the cursor names a place.

#### Scenario: The marker sits at the cursor

- **WHEN** the browser test opens a view at a pitch of 45 degrees, draws a frame, and
  compares the centre of the marker's ring on the screen with the projection of the cursor
- **THEN** the two agree within **1** CSS pixel

#### Scenario: The marker lies on the plane

- **WHEN** the browser test reads the ring's screen bounding box at a pitch of **30
  degrees** and at a pitch of **89 degrees**
- **THEN** at 89 degrees the box's height is within 5 per cent of its width, and at 30
  degrees the height is between **0.40** and **0.60** of the width, so the ring is squashed
  by the pitch

#### Scenario: The marker holds its size on the screen

- **WHEN** the browser test reads the width of the ring's screen bounding box at a pitch of
  89 degrees at zooms of 100, 1,000 and 10,000 light years
- **THEN** each reading is **58** CSS pixels within 3, so the marker does not follow the
  zoom inside the near end of the size band, which every one of the three zooms sits in

#### Scenario: The marker shrinks as the camera pulls back

- **WHEN** the browser test reads the width of the ring's screen bounding box at a pitch of
  89 degrees at the camera distances 12,000, 30,000, 60,000 and 120,000 light years
- **THEN** the four readings are **58**, **47**, **24** and **24** CSS pixels within 3, so
  the marker falls across the band and holds its floor beyond it

#### Scenario: The marker follows the cursor off the plane

- **WHEN** the browser test opens
  `#c=1840.85884,-15539.75557,16507.94703&d=20016.72348&p=58.57998&y=24.66002`, where the
  cursor sits 15,540 light years below the galactic plane, draws a frame and reads the
  marker
- **THEN** the marker is in the overlay, and its ring's centre is within 1 CSS pixel of the
  projection of the cursor. Before this requirement nothing in that frame said where the
  cursor was

#### Scenario: The switch removes the marker

- **WHEN** the browser test reads the overlay for the marker, calls
  `setCursorMarkerVisible(false)`, draws a frame and reads again, then calls it with true and
  reads once more
- **THEN** the readings hold one marker, none, and one

#### Scenario: The option chooses the marker at start-up

- **WHEN** the browser test builds a map with `cursorMarker: false`, reads
  `isCursorMarkerVisible()` and the overlay, then builds one with no `cursorMarker` and
  reads both again
- **THEN** the first gives false and no marker, and the second gives true and one marker

#### Scenario: The marker carries four arrows and one ring

- **WHEN** the browser test reads the marker's own contents
- **THEN** it holds one ring and four arrows, each arrow's fill is `#3EF8FB`, and the four
  arrows point along the game `x` and `z` axes, one each way

#### Scenario: A selection pin draws over the marker

- **WHEN** the browser test selects a system at the cursor and reads the stacking of the pin
  and the marker in the overlay
- **THEN** the pin draws over the marker
