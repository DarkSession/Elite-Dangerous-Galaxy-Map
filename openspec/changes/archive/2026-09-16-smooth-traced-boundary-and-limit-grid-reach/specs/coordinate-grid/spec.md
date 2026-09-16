## MODIFIED Requirements

### Requirement: The grid draws every decade level on the cursor's plane

The map SHALL draw a set of lines on a plane of constant `y` in game coordinates. The
lines SHALL run along the `x` and the `z` axes of the game frame, so a line of the grid
is a line of constant `x` or constant `z` and the user can read a coordinate from it.

**The plane** SHALL be at the cursor's own `y`, and not at `y = 0`. The camera sits above
the cursor at every pitch the map allows, because the pitch is held from 5 to 89 degrees,
so the grid is always below the camera. A user who presses `R` or `F` takes the grid with
them, and the plane they look at is the plane they measure on.

**A level** is a power of ten of light years, from 1 to 100,000. The grid SHALL draw every
one of the six levels in the same frame. A line of a level lies at a whole multiple of
that level's spacing on its own axis, so a line of the 1,000 light year level is also a
line of the 100 and the 10 light year levels, and the level that draws it is the coarsest
of the three.

**A level's look follows its spacing on the screen at the point that draws it.** Let `p`
be that spacing in CSS pixels, which is `focalCss * s / range` for a level of spacing `s`
at a point `range` light years from the camera, where `focalCss` is the CSS pixels per
light year at one light year of range. Then:

| Reading | Rule                                  | At `p` = 8 | At `p` = 40 | At `p` = 400 |
| ------- | ------------------------------------- | ---------- | ----------- | ------------ |
| `t`     | `smoothstep(40, 400, p)`              | 0          | 0           | 1            |
| Width   | `1.0 + 1.6 * t` CSS pixels            | 1.0        | 1.0         | 2.6          |
| Alpha   | `(0.18 + 0.27 * t) * smoothstep(8, 40, p)` | 0     | 0.18        | 0.45         |

The alpha reaches 0 at a spacing of 8 CSS pixels, so a level that would read as a wash of
lines draws nothing. The rule reads `p` at the point that draws the line and not at the
cursor, so a level fades out toward the horizon, where perspective closes its lines up,
and no level ever draws moire.

**The width is in CSS pixels**, so a line covers the same part of the screen at every
device pixel ratio. The old grid's width was in device pixels because it drew line
primitives, and `lineWidth` counts device pixels and is held at 1 by most drivers. A
level 400 CSS pixels apart is 2.6 CSS pixels wide, which no line primitive draws.

**A level fades out with distance from the cursor.** The alpha of a level SHALL be
multiplied by `clamp(1 - r / (100 * s), 0, 1)`, where `r` is the distance from the cursor
on the plane. A level therefore reaches 100 of its own lines each side of the cursor and
no further, so the 10 light year level covers 1,000 light years and the 1,000 light year
level covers 100,000.

**A level that carries no number takes a reach that follows the zoom instead, where that is
the smaller.** The reach of such a level SHALL be the **lesser** of its own `100 * s` and
`0.4 * d` light years, where `d` is the camera's distance to the cursor, and its alpha SHALL
be multiplied by the single ramp `clamp(1 - r / reach, 0, 1)`. The two are not multiplied
together: both are the ramp `1 - r / reach`, so the lesser of the two fades is exactly the
fade of the lesser of the two reaches, and a product would fade a line well before either
reach ended.

The sentence above about 100 of a level's own lines therefore states the reach of the
numbered level, and the ceiling of every other level's.

**The level that carries the numbers SHALL be exempt**, and SHALL keep its own reach of 100
lines. The requirement "The grid carries coordinate labels on its own plane" names that level
and gives a crossing a label only within 1.2 of its spacings. A label has to sit on a lit
line, and the numbered level is picked so that its crossings are far apart: at a camera
distance of 1,000 light years the numbers sit on the 1,000 light year level, a cursor at the
middle of a cell is 707 light years from its nearest crossing, and a reach of `0.4 * d` is
400, so `0.4 * d` first reaches 707 at a camera distance of 1,768 light years. Cutting that
level would leave the frame with lines and no numbers from **234** light years, where the
numbered level becomes 1,000, to **1,768**; and again below **177**, where the numbers sit on
the 100 light year level and `0.4 * d` falls under the 70.7 light years a cursor can sit from
its nearest crossing of it.

The numbered level is 100 or 1,000 light years and never more, so it is **not** the coarsest
level on the screen and every level above it is cut like every other. Cutting every level
but the numbered one still takes the dense lattice away, which is the whole of what reads as
a lattice. At a camera distance of 4,000 light years the numbered level is 1,000 light years
and its crossings sit 233.8 CSS pixels apart, so it carries about 8 lines across a 1,920 CSS
pixel frame, against the 100 light year level's 82, which the reach cuts to 32 inside the
disc.

**The exemption puts one step in the reach**, at the camera distance where the numbered level
changes. That is 233.8 light years at 1,080 CSS rows. Below it the numbers sit on the 100
light year level, which is then exempt and reaches 10,000 light years; above it they sit on
the 1,000 light year level and the 100 light year level is cut to `0.4 * d`, which is 93.5
light years there. Crossing that zoom downward, the 100 light year lines outside the reach
disc appear in one frame. The frame holds about one and a half of that level's cells between
the disc and its own edge **across** the frame at that zoom, and about three and a half **up**
the frame at a pitch of 45, so the step is a few lines and not a lattice, and the lines it
brings are the ones that were already inside the frame. It is accepted rather than
smoothed, because a level that fades in over a zoom band would put a second band beside the
camera distance band and give the grid two things to do at once.

The zoom reach is a **fixed size on the screen**. A disc of radius `0.4 * d` light years
around the cursor projects to `0.4 * focalCss` CSS pixels at the cursor's own range, and
`focalCss` is `rows / (2 tan 30)`, so the radius is **0.346 of the viewport height** whatever
the viewport and whatever the zoom: 374 CSS pixels on 1,080 rows. Every level below the
numbered one therefore marks the same neighbourhood of the cursor at every zoom.

Without this bound every level that draws runs past the frame. The grid draws only while the
camera is nearer than 12,000 light years, which the band below states, and at the near end of
that band, a camera distance of 4,000 light years and a pitch of 45 degrees, the top of the
frame sits **7,727 light years** beyond the cursor. The field of view is 60 degrees vertically
whatever the viewport, so the row count is not part of that figure. The 100 light year level
reaches 10,000 there and the 1,000 light year level reaches 100,000, so both cover the whole
frame. At a pitch of 5 degrees the top ray of the frame runs 25 degrees above the horizontal,
the frame holds the horizon, and no per-level reach ever ends inside it.

**The grid fades in as the camera comes near.** The alpha of every level SHALL be
multiplied by a band over the camera's distance to the cursor: 0 at **12,000** light years
and further, 1 at **4,000** and nearer, with a smooth step between, so the band reads 0.5
at 8,000. The reading SHALL be the camera's distance to the cursor, one value for the whole
frame, and SHALL NOT be each fragment's own range to the camera: a band by fragment range
would open the grid under the camera at every zoom.

The grid is a tool for reading a neighbourhood, and at a wide view its coarse levels lie
over the whole galaxy. At the start view of 60,000 light years and 1,080 CSS rows the
10,000 light year level measures 156 CSS pixels across at an alpha of 0.25, which washes
the galaxy disc with ten lines each way. The near end of the band is the zoom at which the
1,000 light year level carries the frame: 234 CSS pixels at 4,000 light years.

**Where the band gives 0 the grid SHALL draw nothing at all**, and the pass SHALL NOT
draw. The probes then read what they read for a grid that is switched off, which "The grid
reports what it drew" states, and the coordinate labels leave the overlay with the lines.

**The colour** SHALL be **`rgb(96, 214, 224)`**, a cyan, over a dark background. The
requirement "The grid blends under the overlays by weight and darkening" states how it changes
over a brighter one.

The grid drew in `rgb(255, 154, 60)`, an orange. Two things in the frame are warm: the
galactic core, whose tone-mapped luminance reaches about 0.93, and the region boundary
band, whose tone is `(0.86, 0.74, 0.60)`. An orange grid had to be told from both by
brightness alone, and over the core it could not be. A cyan grid is told from both by hue
at any brightness, and it is the only cool line the map draws.

**Where two levels cover one point**, the alpha SHALL be the larger of the two and not
their sum, so a crossing is no brighter than the lines that meet there.

**Outside the galaxy model bounds** the grid SHALL draw nothing. A point of the plane
whose `x` or whose `z` lies outside the bounds carries no line.

#### Scenario: A line is a line of constant game coordinate

- **WHEN** the browser test turns the grid on at a view over Sol, reads the frame, and
  reads the game coordinates of two pixels on one drawn line
- **THEN** the two points share an `x` or a `z`, and that value is a whole multiple of a
  power of ten light years

#### Scenario: Three levels carry the frame at one zoom

- **WHEN** a unit test reads the level rule at a viewport of 1,080 CSS rows at the zoom
  distances 10, 100, 1,000 and 10,000 light years, taking `p` at the cursor
- **THEN** at every one of the four distances, between 2 and 3 levels have a spacing on
  the screen from 8 to 4,000 CSS pixels, and among those levels the coarser of any two has
  an alpha and a width at or above the finer one's. A level over 4,000 CSS pixels apart
  draws at most one line in a 1920 pixel frame, and a level under 8 draws none

#### Scenario: A coarse line draws bolder than a fine one

- **WHEN** the browser test turns the grid on at a zoom of 1,000 light years over Sol and
  counts the pixels across a line of the 1,000 light year level and across a line of the
  100 light year level, on a row that crosses both
- **THEN** the first count is greater than the second, and the light the grid adds on the
  first line is at least 1.4 times the light it adds on the second

#### Scenario: The grid moves with the cursor off the plane

- **WHEN** the browser test turns the grid on, sets a cursor at `y = 0` and reads the
  plane height the grid draws at, then sets a cursor at `y = -600` and reads it again
- **THEN** the two readings are 0 and -600, and in both frames the grid draws below the
  camera

#### Scenario: A level fades out at 100 of its own lines

- **WHEN** a unit test reads the distance fade of the 10 light year level at 0, 500 and
  1,000 light years from the cursor on the plane, and the fade of the 1,000 light year
  level at the same three distances
- **THEN** the first three readings are 1, 0.5 and 0, and the second three are 1, 0.995
  and 0.99

#### Scenario: The grid stops at the model bounds

- **WHEN** the browser test moves the cursor to the model's upper `x` bound at a zoom of
  3,000 light years and reads the frame
- **THEN** no grid line draws more than 30 light years beyond that bound, which is about
  nine CSS pixels at that zoom

#### Scenario: A crossing is no brighter than its lines

- **WHEN** the browser test turns the grid on and reads the light the grid adds at a
  crossing of two lines of the 1,000 light year level and on each of the two lines a
  little away from the crossing
- **THEN** the reading at the crossing is not above the larger of the other two, within
  one 8-bit step

#### Scenario: The band follows the camera distance

- **WHEN** a unit test reads the band at the camera distances 3,000, 4,000, 8,000, 12,000
  and 60,000 light years
- **THEN** the readings are 1, 1, 0.5, 0 and 0

#### Scenario: A wide view draws no grid

- **WHEN** the browser test opens the start view of 60,000 light years, reads the frame
  with the grid switch on, and reads it again with the switch off
- **THEN** the two frames hold the same pixels

#### Scenario: A level fades out at the zoom reach

- **WHEN** a unit test reads the fade of the **10,000 light year** level at a camera distance
  of 4,000 light years, at 0, 800 and 1,600 light years from the cursor on the plane, where
  the numbered level is 1,000 light years
- **THEN** the readings are 1, 0.5 and 0, so the reach is 1,600 light years, which is
  `0.4 * 4000`. The level is named because the reading holds only for a level the zoom bound
  binds: the 10,000 light year level's own reach is 1,000,000 light years, far above 1,600,
  and it is not the numbered level, so it is not exempt

#### Scenario: The reach is the lesser of the two

- **WHEN** a unit test reads the combined fade of the 100 light year level at a camera
  distance of 4,000 light years, at 1,000 light years from the cursor, where the numbered
  level is 1,000 light years and the 100 light year level is therefore not exempt
- **THEN** the reading is 0.375, which is the zoom fade at that distance, because the zoom
  reach of 1,600 light years is below the level's own 10,000. It is not the product of the
  two fades, which is 0.338

#### Scenario: The level's own reach still binds where it is the smaller

- **WHEN** a unit test reads the combined fade of the 10 light year level at a camera
  distance of 4,000 light years, at 500 light years from the cursor
- **THEN** the reading is 0.5, which is the level's own reach of 1,000 light years and not
  the zoom reach of 1,600

#### Scenario: The numbered level keeps its own reach

- **WHEN** a unit test reads, at **1,080 CSS rows**, the combined fade of the numbered level
  at a camera distance of 4,000 light years, at 1,000 light years from the cursor, and reads
  the numbered level itself at the camera distances 200 and 4,000 light years
- **THEN** the numbered level is 100 light years at 200 and 1,000 light years at 4,000, and
  its fade at 1,000 light years from the cursor is 0.99, which is its own reach of 100,000
  light years and not the zoom reach of 1,600

#### Scenario: The lattice marks the same part of the frame at every zoom

- **WHEN** the browser test turns the grid on at **1920x1080** at a pitch of 89 degrees, at
  the camera distances 500, 1,000 and 2,000 light years, where the numbered level is 1,000
  light years at all three, and measures in CSS pixels the **largest** radius about the cursor
  at which the 100 light year level lights any pixel of the frame
- **THEN** the three radii are within 20 CSS pixels of each other, and each is below 374 CSS
  pixels, which is where the ramp reaches 0, by the distance over which the ramp falls under
  one 8-bit step. On the pinned package they read **367.5**, **361.9** and **360.6** CSS
  pixels, a spread of 6.9 and each 6.5 to 13.4 short of the 374 the ramp ends at.

  The reading SHALL be the largest radius anywhere in the frame and NOT the radius along the
  row through the cursor. The row reading is quantised by the level's own line spacing, which
  runs from 187 CSS pixels at a camera distance of 500 light years down to 47 at 2,000, so at
  the near zoom it can fall short by nearly a whole 187 and would fail a bound of 20 that the
  behaviour itself holds

#### Scenario: The lattice stops at its reach and the numbered level goes on

- **WHEN** the browser test turns the grid on at **1920x1080** at a camera distance of 4,000
  light years, at a yaw of **30 degrees**, with the cursor **50 light years** off a crossing
  of the 100 light year level on both axes, at each of the pitches 45, 60 and 89 degrees,
  samples the **row** through the middle of the frame, and counts the grid lines it crosses
  between the cursor and 1,600 light years out, and between 1,600 and 3,200 light years out
- **THEN** at every one of the three pitches the count of lines for each 1,000 light years
  falls by at least a factor of **5** between the two bands, and every line the second band
  carries belongs to the numbered level. On the pinned package the inner band carries **34**,
  **35** and **36** lines at the pitches 45, 60 and 89 and the outer band carries **4** at all
  three, which is **10.6**, **10.9** and **11.3** lines for each 1,000 light years against
  **1.25**, a fall by a factor of 8.5 to 9.0. No line of the outer band sits off the numbered
  level at any of the three pitches.

  The row and not the column, and 45 degrees and not 5. At a pitch of 5 the horizon sits 82
  CSS pixels above the middle of the frame, the whole 3,200 light year run compresses into 36
  CSS pixels, and the 100 light year level's spacing along the depth axis is **2.1** CSS
  pixels, under the 8 at which a level's alpha reaches 0. A column at that pitch therefore
  counts lines that are not drawn, and reads the same with this change and without it.

  The viewport, the yaw and the cursor offset are all premises. At 4:3 the 3,200 light year
  mark falls outside the frame at a pitch of 45, so the second band has nothing to count. At a
  yaw of 0 the row through the middle of the frame runs along one axis of the grid, so it lies
  on a line of constant `z` and crosses none of that family; the yaw of 30 degrees makes it
  cross both families. The cursor offset keeps the row itself off a line.

  Without the zoom reach both bands carry the same count, so the ratio is 1 and the scenario
  fails.

### Requirement: The grid holds the frame budget

The grid's vertex count is fixed at 3, but its fill is not: at a pitch of 5 degrees, which
is the shallowest the camera reaches, the numbered level crosses the whole frame and reaches
toward the horizon, and the shader tests all six levels at every fragment whatever their
reach. The cost that has to be measured is therefore the fill and not the vertex count, and
the zoom reach does not lower it. The reach cuts what a level **draws**, not what the shader
**reads**: the loop over the six levels runs for each fragment either way, and a level the
reach has cut still costs its own spacing, its own derivative and its ramps. The
readings below therefore SHALL NOT move because of the zoom reach, and a reading that falls
is a reading of something else.

Measured with the reach in place over three runs, the grid adds **0.05 to 0.14 milliseconds**
at a pitch of 5 degrees and **0.05 to 0.08** at 89, against the 1 millisecond bound. The
reading is stated as a range on purpose: the run-to-run spread of one build is about
0.09 milliseconds at the shallow pitch, which is larger than the whole of what the grid costs,
so a single figure here claims a precision the instrument does not have and two runs would
disagree with it. Nothing smaller than that spread can be read from this scenario, and the
zoom reach is expected to move the cost by nothing at all.

The grid now carries a second pass as well. The background reading averages the scene down
to a sixteenth of the frame on each axis, and the requirement "The frame carries a
background reading" builds it only in a frame the grid draws in. Its cost is therefore the
grid's cost and it SHALL be measured as such.

The bound holds against hardware rendering and says nothing about a software one. The suite
already fails on SwiftShader and llvmpipe, which `e2e/00-renderer.spec.ts` checks, so a run
that reaches this measurement is on a real card by then.

With the grid on at 1920x1080, the draw time SHALL be at most **1 ms** more than the same
view drawn with the grid off. The bound does not move for the background reading, and the
room for it is what the grid does not use: the grid measured 0.012 to 0.042 ms against this
bound before the reading existed.

The reading is not free. Four halvings from the full-resolution scene target read about
**1.33 frames** of texels in total, and the first halving alone reads the whole frame. The
budget scenario is therefore the one that decides whether the reading is built this way, and
the design names the fallback if it is not. The reading SHALL be taken with `measureFrames`,
which redraws
one fixed view and waits for the card, because the grid is a draw pass and that is the
instrument the project already uses for a pass's own cost.

The reading SHALL be taken at a pitch of 5 degrees and at a pitch of 89 degrees, so the
shallow view that draws the most fill is measured as well as the view from above.

The coordinate labels are not part of this reading, because they are DOM elements and not
a draw pass. The requirement "The grid labels hold the frame rate" measures them, and the
read of the background reading back to the processor is part of that measurement, because
it runs on the main thread.

#### Scenario: The grid costs under a millisecond of draw time

- **WHEN** the browser test opens a view at 1920x1080 at a pitch of 5 degrees, reads
  `measureFrames` with the grid off and with it on, and repeats both at a pitch of 89
  degrees
- **THEN** each pair differs by 1 ms or less

#### Scenario: The grid labels hold the frame rate

- **WHEN** the browser test adds 10,000 systems, turns the grid on at a pitch of 5 degrees
  at 1920x1080, draws 120 frames and reads the animation frame interval statistics
- **THEN** the mean interval is 18 ms or less, which is the bound
  `system-selection` states for the same instrument

#### Scenario: Reading the background back does not stall the frame

- **WHEN** the browser test turns the grid on at 1920x1080, draws 120 frames with the
  camera moving, and reads the animation frame interval statistics
- **THEN** the mean interval is 18 ms or less and no single interval is above 33 ms
