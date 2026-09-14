## Purpose

Draws a grid on the galactic plane, so the user can read distance and direction from the
frame itself. The spacing follows the zoom, so the grid stays readable from 10 light years
to 120,000.

## ADDED Requirements

### Requirement: The grid draws on the galactic plane at a spacing that follows the zoom

The map SHALL draw a set of lines on the galactic plane, at `y = 0` in game coordinates.
The lines SHALL run along the `x` and the `z` axes of the game frame, so a line of the
grid is a line of constant `x` or constant `z` and the user can read a coordinate from it.

The grid draws at `y = 0` and not at the cursor's height, because the plane is the galaxy's
own reference and the region boundaries of `galactic-regions` already draw there. A grid
that followed the cursor up and down would move under the galaxy as the user pressed `R`
or `F`.

**The spacing** SHALL be the smallest value `s` of the sequence
1, 2, 5, 10, 20, 50, ... light years, from 1 to 100,000, whose spacing on the screen at
the cursor is at least **40 CSS pixels**. The spacing on the screen at the cursor is
`focalCss * s / distance`, where `distance` is the zoom distance and `focalCss` is the CSS
pixels per light year at one light year of range, which the renderer works out as
`height / (2 * tan(30 degrees))` from the viewport height in CSS rows.

The sequence steps by 2 or by 2.5 between one value and the next, so the chosen spacing on
the screen lies in 40 to 100 CSS pixels at every zoom distance and every viewport the map
draws in. The grid therefore never reads as a wash of lines and never shows one line
alone.

The sequence starts at 1 light year and not at 10. At the closest zoom of 10 light years
and 1,080 CSS rows a spacing of 10 light years would put its lines 935 CSS pixels apart,
which is one line on the screen.

#### Scenario: The spacing follows the zoom through the sequence

- **WHEN** a unit test asks for the spacing at a viewport of 1,080 CSS rows at the zoom
  distances 10, 100, 1,000, 10,000 and 120,000 light years
- **THEN** the answers are 1, 5, 50, 500 and 10,000 light years

#### Scenario: The spacing on the screen stays inside its band

- **WHEN** a unit test sweeps the zoom distance from 10 to 120,000 light years in 200 steps
  at 1,080 CSS rows, and again at 400 CSS rows, and reads the spacing on the screen at each
  step
- **THEN** every reading is at least 40 and below 100 CSS pixels

#### Scenario: A line is a line of constant game coordinate

- **WHEN** the browser test turns the grid on at a view over Sol, reads the frame, and
  reads the game coordinates of two pixels on one drawn line
- **THEN** the two points share an `x` or a `z`, and that value is a whole multiple of the
  spacing


### Requirement: The grid holds a fixed line count

The grid SHALL draw **129** lines on each axis, so at most **258** lines in all. The lines
SHALL be centred on the cursor: on each axis the middle line SHALL be at the multiple of
the spacing nearest the cursor's own coordinate, and the other 128 SHALL be 64 on each side
of it.

A line that lies outside the galaxy model bounds on its own axis SHALL be left out, so the
grid does not reach past the volume the map draws.

The count does not follow the data. The galaxy holds about 400 billion systems and the host
may add 10,000 of them; the grid draws the same 258 lines either way, in **one** draw call
of at most 516 vertices.

The grid SHALL be drawn camera-relative, by the rule of `far-view-rendering`: the vertex
positions SHALL be the offsets from the camera, worked out on the processor in `float64`
each frame. 516 vertices is small enough to rebuild every frame, so the grid needs no
buffer that survives a camera move.

#### Scenario: The line count is fixed

- **WHEN** the browser test turns the grid on and reads the grid's vertex count at the zoom
  distances 10, 1,000 and 120,000 light years
- **THEN** every reading is 516 or fewer, and the pass draws in one call

#### Scenario: The grid follows the cursor

- **WHEN** the browser test turns the grid on, reads the middle line's coordinate, moves
  the cursor 10 spacings along `x`, and reads it again
- **THEN** the second reading is the first plus 10 spacings

#### Scenario: The grid stops at the model bounds

- **WHEN** the browser test moves the cursor to the model's upper `x` bound at a zoom of
  120,000 light years and reads the drawn lines
- **THEN** no line of constant `x` lies beyond that bound


### Requirement: The grid draws under the overlays

The grid SHALL draw after the tone map and **before** the region boundary overlay and the
marker pass, and SHALL blend over the frame with alpha and no depth test. A region boundary
and a marker therefore draw over a grid line, and the grid adds no light the tone map
reads.

**The look.** A line SHALL be 1 device pixel wide, in `rgba(255, 154, 60, 0.10)`. Every
fifth line from the middle SHALL be in `rgba(255, 154, 60, 0.20)`, so the user can count.

The width is in device pixels and not in CSS pixels because the pass draws line
primitives. A line primitive takes its width from `lineWidth`, which counts device pixels,
and which most drivers hold at 1. A width in CSS pixels would need each line drawn as two
triangles, which is 6 vertices a line and 1,548 for the grid, and the 516 vertex count
above is what this spec pins.

The consequence to know: on a display with a device pixel ratio of 2 a line covers half a
CSS pixel, so the grid reads fainter than it does at a ratio of 1. The browser tests run at
a device pixel ratio of 1 and no test reads that view.

**The fade.** A line SHALL fade out with its distance from the cursor on the plane,
reaching an alpha of 0 at 64 spacings, which is the edge of the grid. Without the fade the
grid ends at a hard rectangle, which reads as an object in the scene rather than as a
graticule.

#### Scenario: The overlays draw over the grid

- **WHEN** the browser test turns the grid on at a view that shows a region boundary and a
  marker crossing a grid line, and reads the pixels where they cross
- **THEN** the boundary colour and the marker colour are what the crossing pixels hold

#### Scenario: The grid fades to nothing at its edge

- **WHEN** the browser test turns the grid on and reads the alpha the frame gains from the
  grid at the cursor, at 32 spacings from it and at 64 spacings from it
- **THEN** the readings fall, and the reading at 64 spacings is 0 within one 8-bit step

#### Scenario: Every fifth line is brighter

- **WHEN** the browser test reads the light the grid adds on the middle line, on the line
  one spacing from it and on the line five spacings from it
- **THEN** the first and the third are about twice the second


### Requirement: The grid holds the frame budget

The grid's vertex count is fixed, but its fill is not: at a pitch of 5 degrees, which is
the shallowest the camera reaches, its 258 lines cross the whole frame and the far ones
crowd toward the horizon. The cost that has to be measured is therefore the fill and not
the vertex count.

With the grid on at 1920x1080, the draw time SHALL be at most **1 ms** more than the same
view drawn with the grid off. The reading SHALL be taken with `measureFrames`, which redraws
one fixed view and waits for the card, because the grid is a draw pass and that is the
instrument the project already uses for a pass's own cost.

The reading SHALL be taken at a pitch of 5 degrees and at a pitch of 89 degrees, so the
shallow view that draws the most fill is measured as well as the view from above.

#### Scenario: The grid costs under a millisecond of draw time

- **WHEN** the browser test opens a view at 1920x1080 at a pitch of 5 degrees, reads
  `measureFrames` with the grid off and with it on, and repeats both at a pitch of 89
  degrees
- **THEN** each pair differs by 1 ms or less


### Requirement: The grid has a switch and starts off

`GalaxyMapOptions` SHALL carry an optional `grid`, and the handle SHALL carry
`setGridVisible(on)` and `isGridVisible()`. The grid SHALL be off unless the options ask
for it, so no view the map draws today changes.

The renderer's pass switches SHALL carry a `grid` entry, as the other passes do, so the
browser tests can read a frame with the grid alone and a frame without it.

A change to the switch SHALL reach the next frame and SHALL NOT rebuild the scene data.

#### Scenario: The grid is off by default and the frame does not move

- **WHEN** the browser test opens the default view with no `grid` option and compares the
  frame with the committed baseline image
- **THEN** the frames match, because nothing new draws

#### Scenario: The switch reaches the next frame

- **WHEN** the browser test calls `setGridVisible(true)`, draws one frame and reads a pixel
  on a grid line, then calls `setGridVisible(false)`, draws one frame and reads it again
- **THEN** the two readings differ, and the second matches the frame drawn with the grid
  off
