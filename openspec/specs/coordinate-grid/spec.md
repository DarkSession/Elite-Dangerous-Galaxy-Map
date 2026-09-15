## Purpose

Draws a grid on a plane under the camera, so the user can read distance and direction from
the frame itself. The plane follows the cursor, and six decade levels draw together, so the
grid stays readable from 10 light years to 120,000.

## Requirements

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

**The colour** SHALL be `rgb(255, 154, 60)`, which is the colour the grid draws in today.

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

### Requirement: The grid draws in one call of three vertices

The grid SHALL draw in **one** call, of **3** vertices, at every zoom the camera distance
band leaves on, whatever the pitch and the size of the host's data set. Three vertices are
one triangle that covers the frame; the plane, the levels and the lines are all worked out
for each fragment.

Where the band gives 0 the pass SHALL NOT draw, and the count SHALL be 0. A call whose
every fragment is empty would cost a full-screen pass and would make the three probes
disagree.

The count does not follow the data. The galaxy holds about 400 billion systems and the
host may add 10,000 of them; the grid draws the same call either way. The levels are
worked out for each fragment, so no line is a vertex and no buffer holds a line.

The grid SHALL be drawn camera-relative, by the rule of `far-view-rendering`. The plane
position of a fragment SHALL be worked out from the camera, and the phase of each level
SHALL be given to the pass in `float64` on the processor, so the shader never adds two
large numbers. The galaxy spans 100,000 light years and the finest level is 1 light year
apart, so a `float32` position alone cannot place a line.

#### Scenario: The call count and the vertex count are fixed

- **WHEN** the browser test turns the grid on and reads the grid's vertex count at the
  zoom distances 10, 1,000 and 11,000 light years, and then at 120,000
- **THEN** the first three readings are 3 and the pass draws in one call, and the last
  reading is 0

#### Scenario: A line sits on its coordinate at the closest zoom

- **WHEN** the browser test opens a view at a cursor of (45,000, 0, 45,000) at a zoom of
  10 light years, turns the grid on, and reads the game `x` of the pixels of one drawn
  line of the 1 light year level
- **THEN** the `x` is a whole number of light years within 0.05

### Requirement: The grid blends under the overlays at its own weights

The grid SHALL draw after the tone map and **before** the region boundary overlay and the
marker pass, and SHALL blend over the frame with alpha and no depth test. A region
boundary and a marker therefore draw over a grid line, and the grid adds no light the tone
map reads.

The look is the level rule of the requirement "The grid draws every decade level on the
cursor's plane": the colour `rgb(255, 154, 60)`, a width from 1.0 to 2.6 CSS pixels and an
alpha from 0 to 0.45, each following the level's spacing on the screen.

The alphas are about twice the ones the grid drew with before this change, which were 0.10
and 0.20. At 0.10 a line over the cream core of the galaxy moves a channel by about 20 of
255, which the user does not see against the grain of the point cloud. At 0.45 the bold
level reads over the core and the fine level still does not cover the stars.

A line SHALL be antialiased across its width, so a line that does not sit on a pixel
centre is not one pixel wide in one column and two in the next.

#### Scenario: The overlays draw over the grid

- **WHEN** the browser test turns the grid on at a view that shows a region boundary and a
  marker crossing a grid line, and reads the pixels where they cross
- **THEN** the boundary colour and the marker colour are what the crossing pixels hold

#### Scenario: The bold level reads over the galactic core

- **WHEN** the browser test opens a view over the galactic core at a zoom of 1,000 light
  years, reads a pixel on a line of the label level with the grid off and with it on
- **THEN** the two readings differ by at least 12 of 255 on at least one channel

#### Scenario: A line is antialiased

- **WHEN** the browser test turns the grid on at a view where a line of the label level
  runs down the frame, and reads the light the grid adds across that line on 20 rows
- **THEN** every row holds the same total within 10 per cent, at a device pixel ratio of 1


### Requirement: The grid reports what it drew

`debug` SHALL carry `gridVertexCount()`, which is the number of vertices the last grid
draw issued, so 3 in a frame the grid drew in and 0 in a frame it did not.

`debug` SHALL carry `gridSpacingLy()`, which is the spacing of the **label level** of the
last frame in light years, and 0 in a frame the grid did not draw in.

`debug` SHALL carry `gridLevels()`, which returns one entry for each of the six levels of
the last frame: the level's spacing in light years, its spacing on the screen at the
cursor in CSS pixels, its width in CSS pixels and its alpha at the cursor. The entries
SHALL be in order of rising spacing. In a frame the grid did not draw in the reading SHALL
be empty.

**The alpha SHALL be the alpha the level draws at, the camera distance band included.** The
probe reads what the frame holds, so a test that reads an alpha and a pixel compares two
readings of the same thing. The band is 1 at 4,000 light years and nearer, so no reading
inside that zoom band changes.

#### Scenario: The probes agree with the frame

- **WHEN** the browser test turns the grid on at a zoom of 1,000 light years at 1,080 CSS
  rows and reads `gridSpacingLy` and `gridLevels`
- **THEN** `gridSpacingLy` is 1,000, the reading holds 6 entries, the entry for 1,000
  light years reports a screen spacing of 935 CSS pixels within 1 and an alpha of 0.45
  within 0.01, and the entry for 1 light year reports an alpha of 0

#### Scenario: The probes report nothing with the grid off

- **WHEN** the browser test turns the grid off, draws a frame and reads `gridVertexCount`,
  `gridSpacingLy` and `gridLevels`
- **THEN** the readings are 0, 0 and empty

#### Scenario: The alpha carries the band

- **WHEN** the browser test turns the grid on at a zoom of 8,000 light years, where the
  band reads 0.5, and reads the alpha of the **10,000 light year** level, then reads the
  same alpha at a zoom of 4,000 light years
- **THEN** the first reading is half the second, within 0.01: 0.225 against 0.45

The level is the 10,000 light year one and not the 1,000, because a level's alpha carries
its screen fade as well as the band, and the two move together. The 1,000 light year level
measures 234 CSS pixels at 4,000 light years and 117 at 8,000, which is inside the fade
band of 40 to 400 pixels, so its drawn alpha reads 0.3305 and then 0.1059, a ratio of
0.320. The 10,000 light year level measures 2,338 and 1,169 pixels, both above the 400
pixel saturation, so its screen fade holds at 1 and the band alone moves it.

### Requirement: The grid carries coordinate labels

While the grid draws, the map SHALL place coordinate labels over the canvas, as elements
in the overlay the library owns for the region labels. A label is DOM text and not a pass
on the canvas, so it stays a crisp vector at every device pixel ratio and needs no font in
a shader.

**The label level** SHALL be the smallest of the six levels whose spacing on the screen at
the cursor is at least **400 CSS pixels**. At 1,080 CSS rows that is 1,000 light years over
the zoom band from 234 to 2,337 light years, which is the band the user reads a system's
neighbourhood in.

**A crossing label** SHALL sit at a crossing of two lines of the label level and SHALL
read the `x` coordinate and the `z` coordinate of that crossing, in whole light years, in
that order. The candidates SHALL be the crossings within **8** label spacings of the
cursor on each axis, which is 289 crossings, so the sweep projects at most 289 points. The
work of one frame is therefore fixed: it follows the label level and not the size of the
host's data set, which may hold 10,000 systems.

The placement SHALL hold to these bounds:

- A candidate that projects outside the viewport, or that lies behind the near plane,
  SHALL be dropped.
- At most **32** crossing labels SHALL be in the overlay in any frame. The nearest to the
  centre of the canvas SHALL be kept.
- A candidate whose label box overlaps a box already placed SHALL be skipped, by the same
  box test the region labels and the marker name labels use.

**A label SHALL NOT stand where its own lines do not draw.** Two more readings decide, and
both are readings the lines themselves hold:

- A crossing outside the galaxy model bounds SHALL be dropped, because the lines stop
  there.
- The level's drawn alpha at the crossing SHALL be at least **0.09**. The reading is the
  level's own alpha rule, taken at the crossing's spacing on the screen, multiplied by the
  camera distance band.

  The spacing on the screen SHALL come from the projection's **local rate** at the
  crossing, which is the quantity `grid.frag` reads as a derivative of the plane point.
  The sweep SHALL project the crossing and two points a small step along the game `x` and
  `z` axes, and SHALL invert the 2 by 2 matrix those two steps make, which gives the light
  years of each game axis that one CSS pixel covers there. The reading therefore carries
  the foreshortening that closes the lines up toward the horizon, on both screen axes. The
  greater of the two axis readings decides, because the alpha at a point is the larger of
  the two axes' readings.

  **The step SHALL be small and SHALL NOT be one level spacing.** A gap measured over a
  whole spacing is a secant of a map that bends hard toward the horizon, and the two
  readings part company where the gate matters most: at a pitch of 5 degrees and a zoom of
  3,000 light years, a crossing 65,000 light years out makes a gap of about 144 CSS pixels
  over one spacing, while the shader reads 1.4 CSS pixels there and draws nothing. A gate
  on the secant would keep a label over an empty frame, which is the fault the gate is
  for.

0.09 is what a level draws at 24 CSS pixels with the band open, the middle of the fade band
from 8 to 40. The floor of 8 CSS pixels is where a level's alpha reaches 0 and not where
its line becomes readable, so a label placed there would stand over nothing. One reading
and not two, because the band is the other way a line goes out: without it a label would
stand at full opacity at 11,500 light years, where the label level still measures 813 CSS
pixels but the band leaves 0.011 of the alpha.

**The plane label** SHALL be one more element, centred on the lower edge of the canvas and
22 CSS pixels above it, which reads the `y` of the plane the grid draws on, in whole light
years. The `x` and the `z` are on the crossings, and the `y` is one number for the whole
grid, so it is stated once. The lower edge is the free edge: the HUD's top bar covers the
top, its category browser the left and its information panel the right.

Every label SHALL leave the overlay when the grid switch goes off, and when the camera
distance band gives 0.

#### Scenario: A crossing label reads its own coordinates

- **WHEN** the browser test turns the grid on at a cursor of (1,000, 0, 2,000) at a zoom
  of 1,000 light years, draws a frame, and reads the crossing labels
- **THEN** at least one label is present, every label's text holds two whole multiples of
  1,000, and each label sits within 2 CSS pixels of the projection of the crossing it
  names

#### Scenario: The label count is capped

- **WHEN** the browser test turns the grid on at a pitch of 5 degrees, which shows the
  most crossings, draws a frame and counts the crossing labels
- **THEN** the count is 32 or fewer

#### Scenario: The plane label reads the cursor's height

- **WHEN** the browser test turns the grid on, sets a cursor at `y = -600`, draws a frame
  and reads the plane label
- **THEN** the label is present and its text holds -600

#### Scenario: The labels go with the switch

- **WHEN** the browser test turns the grid on, draws a frame and counts every grid label,
  then turns it off, draws a frame and counts again
- **THEN** the first count is above 0 and the second is 0

#### Scenario: The label level follows the zoom

- **WHEN** the browser test turns the grid on at 1,080 CSS rows and reads `gridSpacingLy`
  at the zoom distances 200, 1,000 and 3,000 light years
- **THEN** the readings are 100, 1,000 and 10,000

#### Scenario: No label stands past the last line

- **WHEN** the browser test turns the grid on with the cursor at the model's upper `x`
  bound at a zoom of 1,000 light years and a pitch of 89 degrees, where the label level is
  1,000 light years and the crossing at `x` = 51,000 projects inside the frame, and reads
  every crossing label's text
- **THEN** no label names an `x` above the bound, and at least one names 50,000, so the
  sweep dropped the crossing past the bound and kept the one inside it

#### Scenario: A label goes out with its lines

- **WHEN** the browser test turns the grid on at a zoom of 11,500 light years, where the
  band leaves 0.011 of the alpha, draws a frame and counts every grid label, and repeats
  at a zoom of 3,000 light years
- **THEN** the first count is 0 and the second is above 0

#### Scenario: Every label sits on a line

- **WHEN** the browser test turns the grid on at a zoom of 3,000 light years at a pitch of
  5 degrees, which reaches furthest toward the horizon, reads each crossing label's
  position and reads the drawn pixel there
- **THEN** every label sits on a pixel the grid lit

### Requirement: The grid holds the frame budget

The grid's vertex count is fixed at 3, but its fill is not: at a pitch of 5 degrees, which
is the shallowest the camera reaches, its levels cross the whole frame and reach toward the
horizon. The cost that has to be measured is therefore the fill and not the vertex count,
and this change moves the whole cost into the fill: the levels, the widths and the fades
are worked out for every fragment the plane covers.

With the grid on at 1920x1080, the draw time SHALL be at most **1 ms** more than the same
view drawn with the grid off. The reading SHALL be taken with `measureFrames`, which
redraws one fixed view and waits for the card, because the grid is a draw pass and that is
the instrument the project already uses for a pass's own cost.

The reading SHALL be taken at a pitch of 5 degrees and at a pitch of 89 degrees, so the
shallow view that draws the most fill is measured as well as the view from above.

The coordinate labels are not part of this reading, because they are DOM elements and not
a draw pass. The requirement "The grid labels hold the frame rate" measures them.

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


### Requirement: The grid has a switch and starts off

`GalaxyMapOptions` SHALL carry an optional `grid`, and the handle SHALL carry
`setGridVisible(on)` and `isGridVisible()`. The grid SHALL be off unless the options ask
for it, so no view the map draws today changes.

The handle SHALL carry a grid change notification, which `real-systems` states, so a host
page can learn that the switch moved and can write it where it keeps its state. The HUD's
coordinate grid switch calls `setGridVisible` and no other member, so one notification
covers every way the switch moves.

**The demo site starts with the grid on**, which `library-package` states, and it keeps the
switch in its URL fragment, which `map-navigation` states. That is the demo page's own
option and not a change of the default: a host that gives no `grid` option still gets no
grid.

The renderer's pass switches SHALL carry a `grid` entry, as the other passes do, so the
browser tests can read a frame with the grid alone and a frame without it.

A change to the switch SHALL reach the next frame and SHALL NOT rebuild the scene data.
The coordinate labels SHALL follow the same switch, so one call turns the grid and its
labels on together.

#### Scenario: The grid is off by default and the frame does not move

- **WHEN** the browser test opens the default view with the grid off, as a map built with
  no `grid` option has it, and compares the frame with the committed baseline image
- **THEN** the frames match, because nothing new draws

#### Scenario: The switch reaches the next frame

- **WHEN** the browser test calls `setGridVisible(true)`, draws one frame and reads a
  pixel on a grid line, then calls `setGridVisible(false)`, draws one frame and reads it
  again
- **THEN** the two readings differ, and the second matches the frame drawn with the grid
  off

#### Scenario: The library default does not follow the demo site

- **WHEN** a unit test creates a map with no `grid` option and reads `isGridVisible()`, and
  a browser test opens the demo site with no fragment and reads the same
- **THEN** the first reading is false and the second is true

