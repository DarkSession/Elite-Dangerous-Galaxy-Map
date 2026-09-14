## ADDED Requirements

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
  120,000 light years and reads the frame
- **THEN** no grid line draws beyond that bound

#### Scenario: A crossing is no brighter than its lines

- **WHEN** the browser test turns the grid on and reads the light the grid adds at a
  crossing of two lines of the 1,000 light year level and on each of the two lines a
  little away from the crossing
- **THEN** the reading at the crossing is not above the larger of the other two, within
  one 8-bit step


### Requirement: The grid draws in one call of three vertices

The grid SHALL draw in **one** call, of **3** vertices, whatever the zoom distance, the
pitch and the size of the host's data set. Three vertices are one triangle that covers the
frame; the plane, the levels and the lines are all worked out for each fragment.

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
  zoom distances 10, 1,000 and 120,000 light years
- **THEN** every reading is 3, and the pass draws in one call

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

**The plane label** SHALL be one more element, centred on the lower edge of the canvas and
22 CSS pixels above it, which reads the `y` of the plane the grid draws on, in whole light
years. The `x` and the `z` are on the crossings, and the `y` is one number for the whole
grid, so it is stated once. The lower edge is the free edge: the HUD's top bar covers the
top, its category browser the left and its information panel the right.

Every label SHALL leave the overlay when the grid switch goes off.

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


## MODIFIED Requirements

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

The renderer's pass switches SHALL carry a `grid` entry, as the other passes do, so the
browser tests can read a frame with the grid alone and a frame without it.

A change to the switch SHALL reach the next frame and SHALL NOT rebuild the scene data.
The coordinate labels SHALL follow the same switch, so one call turns the grid and its
labels on together.

#### Scenario: The grid is off by default and the frame does not move

- **WHEN** the browser test opens the default view with no `grid` option and compares the
  frame with the committed baseline image
- **THEN** the frames match, because nothing new draws

#### Scenario: The switch reaches the next frame

- **WHEN** the browser test calls `setGridVisible(true)`, draws one frame and reads a
  pixel on a grid line, then calls `setGridVisible(false)`, draws one frame and reads it
  again
- **THEN** the two readings differ, and the second matches the frame drawn with the grid
  off


## REMOVED Requirements

### Requirement: The grid draws on the galactic plane at a spacing that follows the zoom

**Reason**: Both halves of this requirement change. The plane moves from `y = 0` to the
cursor's own height, and the one spacing of the 1-2-5 sequence becomes six decade levels
that draw together. The requirement "The grid draws every decade level on the cursor's
plane" replaces it.

The old requirement gave two reasons for `y = 0`, and both are answered. The first was that
the region boundaries of `galactic-regions` draw there: they still do, and at a cursor off
the plane the grid and the boundaries are now two planes that cross on the screen. That is
the trade the owner asked for, and it buys a grid the user can measure the plane they are
looking at on. The second was that a grid which followed the cursor would move under the
galaxy as the user pressed `R` or `F`: it now does, which is the point, because the user
who moves off the plane wants the grid to come with them.

**Migration**: A host reads the grid through `setGridVisible` and `isGridVisible`, which
do not change. A test that read the 1-2-5 spacing from `gridSpacingLy` now reads the label
level, which is a power of ten: the readings at 10, 100, 1,000, 10,000 and 120,000 light
years move from 1, 5, 50, 500 and 10,000 to 10, 100, 1,000, 10,000 and 100,000.

### Requirement: The grid holds a fixed line count

**Reason**: The grid no longer holds a line as geometry. The levels are worked out for
each fragment, so the 129 lines an axis, the 516 vertices and the plane offsets of each
vertex all go. The requirement "The grid draws in one call of three vertices"
replaces it, and the fade it stated is now a rule of each level.

**Migration**: `debug.gridPlanes()` is removed, because there are no line vertices to
report. A test that read the drawn lines from it reads `debug.gridLevels()` for what each
level drew, and reads the frame itself for where a line lies.

### Requirement: The grid draws under the overlays

**Reason**: The draw order is unchanged, but every look rule of this requirement changes.
The width moves from 1 device pixel to 1.0 to 2.6 CSS pixels, the alphas move from 0.10
and 0.20 to 0 to 0.45, the "every fifth line" rule goes with the 1-2-5 sequence, and the
fade at 64 spacings becomes a fade at 100 lines of each level. The requirement "The grid
blends under the overlays at its own weights" replaces it.

**Migration**: A test that read a fifth line as twice the light of its neighbour reads a
coarser level as bolder and brighter than the level below it. A test that read the fade at
64 spacings reads the fade of one level at 100 of its own lines.
