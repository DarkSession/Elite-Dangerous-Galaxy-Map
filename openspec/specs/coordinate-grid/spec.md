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

### Requirement: The frame carries a background reading

The renderer SHALL build a **background reading**: the local brightness of the finished
picture of the galaxy, as a small texture, so an overlay can follow what it draws over.

- The reading SHALL be built from the scene target, which holds the volume, the clouds,
  the points, the stars and the glow, and not from the frame the user sees. The region
  overlay and the markers draw after the tone map and SHALL NOT be in it: the grid merges
  with the galaxy, not with the other overlays.
- The scene SHALL be **tone-mapped once at the full resolution of the frame**, with the
  same curve and the same exposure the frame uses, and the tone-mapped values SHALL then be
  averaged down. The reading is the mean of the picture a person sees, which is what an
  overlay merges with.

  The order matters, and the measurements chose it. Averaging in linear light first gives
  the mean scene radiance of the block, which one bright star dominates whole: a star sprite
  carries a linear luminance far above its background, so a 16 by 16 block reads 0.56 where
  the same block of the tone-mapped frame means 0.33. The reading then **steps** when the
  sprite crosses a texel edge. Over the disc at a zoom of 4,000 light years, with the camera
  moving 4.67 CSS pixels a frame, the linear order moves the texel under a fixed point by
  **0.2417** between two frames and this order by **0.0232**, and the share of all texel
  steps above 0.02 falls from **5.53 per cent** to **0.12 per cent**. A step of that size in
  the reading is a step in the merge weight, which is a grid line that flickers.
- The reading SHALL be **a sixteenth** of the drawing buffer on each axis, `ceil(w / 16)`
  by `ceil(h / 16)`, and at least one texel on each axis. At 1920x1080 that is 120 by 68
  texels. The size is what takes the point cloud's grain out: a grid line must not flicker
  because one bright star sits under it.
- The chain SHALL be a run of reductions to a sixteenth on each axis, and **each step SHALL
  round its size up**. Four halvings is what the change takes; the design's fallback for the
  frame budget replaces the first halving with a sparse bilinear sample at a quarter size,
  which is three steps to the same size. Rounding up at every step gives `ceil(n / 16)`
  exactly, because `ceil(ceil(n / 2) / 2)` is `ceil(n / 4)`: by halves 1080 goes 540, 270, 135,
  68 and not 67, and 300 goes 150, 75, 38, 19. Rounding down would drop the last row of an odd
  level and the reading would then miss the bottom of the frame.
  The last row or column of an odd level averages a part block, which costs that one row a
  little of its span and nothing anywhere else.
- The reading SHALL be built only in a frame in which the coordinate grid draws, which the
  camera distance band already decides: full at 4,000 light years and nearer, nothing at
  12,000 and further. Every other view SHALL pay nothing for it, and the reading SHALL hold
  no storage until the first frame that builds it.

Every scenario that reads the reading therefore names a zoom inside that band, and a
scenario that needs both a bright background and a dark one takes **two views**. One frame
at 4,000 light years does not hold the galactic core and the dark space between the arms
together.

The map SHALL read the reading back to the processor once in each frame that builds it,
and that read SHALL NOT wait for the card. The labels of a frame MAY therefore read the
reading of the frame before. One frame of delay on an opacity is not visible, and a read
that waits costs more than the pass it reads.

`debug` SHALL carry `backgroundSize()`, which returns the width and the height of the
reading's own target, and `[0, 0]` before the first frame that builds it. It reports the
storage and not the last reading, so a test can hold the rule that a frame without the grid
takes none.

`debug` SHALL carry `backgroundReading()`, which returns the width, the height, the red,
the green and the blue of every texel of the last reading, each from 0 to 1, and the
luminance of each texel by `0.2126 r + 0.7152 g + 0.0722 b`. It SHALL return null in a frame
that built none. The colour is part of the reading and not only the luminance, because the
labels tint themselves with it and a probe that gave the luminance alone could not check
that.

#### Scenario: The reading follows the picture

- **WHEN** the browser test turns the grid on at 1920x1080 at a zoom of 4,000 light years in
  two views, one over the galactic core and one over the dark space between the arms, and
  reads `backgroundReading()` in each
- **THEN** each reading holds 120 by 68 texels, the **mean** luminance of the first is at
  least 0.55 and the mean luminance of the second is at most 0.10, every channel of every
  texel is between 0 and 1, and the luminance of each texel matches its own three channels.

  The mean is the one reading the two views are chosen by, so every scenario that uses the
  pair states its premise in the same terms

#### Scenario: The reading rounds its size up

- **WHEN** a unit test asks for the reading size of 1920 by 1080, of 1280 by 720, of 300 by
  300 and of 8 by 8
- **THEN** the sizes are 120 by 68, 80 by 45, 19 by 19 and 1 by 1, and each one is the size
  four halvings that round up give

#### Scenario: The reading is absent with the grid off

- **WHEN** the browser test draws a frame with the grid off and reads `backgroundReading()`
  and `backgroundSize()`
- **THEN** the reading is null and the size is `[0, 0]`, so no frame built one and no storage
  was taken

#### Scenario: The reading holds still under the grain

- **WHEN** the browser test turns the grid on at **1920x1080** over the disc at a zoom of
  4,000 light years, moves the cursor by 20 light years in each of 30 frames, which is 4.67
  CSS pixels, about three tenths of a 16 pixel reading texel, and reads the texel under a
  fixed screen point in every frame
- **THEN** the luminance changes by less than **0.05** between any two neighbouring frames.

  0.05 and not 0.02. The bound is what the order above holds with margin: the worst reading
  over the four views measured is 0.0232, over the disc. No order of the chain reaches 0.02,
  because a box average has a hard edge and a sprite's whole contribution leaves a block in
  one step. What the bound holds is that the reading cannot cross the merge band, from 0.08
  to 0.55, in a few frames.

  The camera has to move. No shader of this map takes a time uniform and the tone map's
  dither is a fixed hash of the pixel, so 30 frames with the camera still are byte-identical
  and a still test could not fail. What the requirement claims is that the reading does not
  jump as the point cloud's grain slides under it, and only a moving camera shows that

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

**The alpha SHALL be the level's own alpha with the camera distance band, and SHALL NOT
carry the background weight.** The probe is a reading of the level rule and the band, which
are properties of the view alone. The background weight is a property of the picture under
each pixel, it moves from pixel to pixel along one line, and one number could not report it.

A test that reads an alpha and a pixel therefore compares two readings that differ by the
background weight, which the requirement "The grid blends under the overlays at its own
weights" states. Over dark space the weight is 1 and the two readings are the same thing;
over the galactic core the weight falls to its floor of 0.30 and the pixel is lighter than
the probe says. A test of a pixel against the probe SHALL either read over dark space or
carry the weight itself. The band is 1 at 4,000 light years and nearer, so no reading inside
that zoom band changes for the band's own sake.

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

### Requirement: The grid blends under the overlays by weight and darkening

The grid SHALL draw after the tone map and **before** the region boundary overlay and the
marker pass, and SHALL blend over the frame with alpha and no depth test. A region
boundary and a marker therefore draw over a grid line, and the grid adds no light the tone
map reads.

The look is the level rule of the requirement "The grid draws every decade level on the
cursor's plane": the colour `rgb(96, 214, 224)`, a width from 1.0 to 2.6 CSS pixels and an
alpha from 0 to 0.45, each following the level's spacing on the screen.

The alphas are about twice the ones the grid drew with before the change that set them,
which were 0.10 and 0.20. At 0.10 a line over the dark space between the arms moves a
channel by about 20 of 255, which the user does not see against the grain of the point
cloud. 0.45 is what makes the bold level read. The merge below is what keeps that alpha
from shouting over a bright background; it takes the place of the flat compromise the old
figures were.

**The grid SHALL follow the background under it.** A fixed alpha makes one line read the
same over the dark space between the arms and over the cream core, and the grid then sits
on the picture rather than in it. The grid SHALL read the background reading at each
pixel and change two things by it.

Let `L` be the luminance of the background reading under the pixel, from 0 to 1, and

```
merge = smoothstep(0.08, 0.55, L)
```

- **The alpha** SHALL be multiplied by `1 - (1 - 0.55) * merge`. A line over a background
  at or below 0.08 keeps its full level alpha. The same line over a background at or above
  0.55 keeps **0.55** of it.
- **The colour** SHALL be `mix(rgb(96, 214, 224), rgb(16, 74, 120), merge)`. Over a dark
  background the line is a light cyan. Over the bright core it is a **deep blue** of the
  same hue.

**The colour SHALL NOT be mixed toward the background.** The rule this replaces mixed the
line 60 per cent toward the background's own colour, so over the cream core an orange line
became a warm, dim stripe carrying neither hue contrast nor luminance contrast. The grid
was then least readable exactly where a user needs it most, which is the fault this change
answers.

Darkening in place of tinting is what holds the contrast. By the Rec.709 weights the map
uses everywhere, `rgb(96, 214, 224)` has a luminance of **0.744** and `rgb(16, 74, 120)` has
**0.254**. The tone-mapped core reads about 0.93 and the dark space between the arms about
0.05, so the light end stands **above** a dark background by 0.69 and the deep end stands
**below** a bright one by 0.68. One line reads at both ends of the picture, and its hue never
leaves cyan, so it is never taken for the warm things in the frame.

The **floor of 0.55** is not zero and it is above the 0.30 it replaces. A grid the user
cannot find over the core is not a coordinate grid. 0.30 of a 0.45 alpha is 0.135, which a
user does not find over the core; 0.55 of it is 0.248, on a line that now carries a
luminance contrast of 0.68 as well.

The reading is a sixteenth of the frame on each axis and SHALL be sampled with linear
filtering, so `merge` changes smoothly across the frame and a line does not step where two
texels meet.

`gridLevels()` SHALL keep reporting the level's alpha **before** the background weight, so
the probe stays a reading of the level rule and one frame's background does not move it.

A line SHALL be antialiased across its width, so a line that does not sit on a pixel
centre is not one pixel wide in one column and two in the next.

#### Scenario: The overlays draw over the grid

- **WHEN** the browser test opens a view at a zoom of about **8,000 light years** at a pitch
  of **5 degrees**, which shows a region boundary crossing a grid line at a place whose plane
  point is at least **20,000 light years** from the camera, reads the same rectangle in
  **four** frames, with neither overlay, with the grid alone, with the boundary alone and with
  the two together, and takes two pixels from those readings: the **crossing**, which among
  the pixels **whose own plane point is beyond 20,000 light years** is the one where the
  product of the grid's own contribution and the boundary's own contribution is largest, and
  the **comparison**, which is the nearest pixel that carries the same grid contribution
  within a tenth and no boundary contribution at all
- **THEN** the grid's contribution at the crossing, which is the frame with both overlays less
  the frame with the boundary alone, is between **0.30 and 0.75** of the grid's contribution at
  the comparison pixel, which is the frame with the grid alone less the frame with neither.
  The reading is taken on the channel that carries the largest grid contribution.

  The pitch is 5 degrees because the boundary takes a **range fade** per pixel, nothing
  under 10,000 light years and full at 20,000. At a pitch of 89 degrees every pixel reads a
  plane point about 8,000 light years from the camera, so the boundary would draw nothing
  anywhere in the frame and the reading could not be taken. A pitch of 5 degrees reaches
  toward the horizon, where the plane is tens of thousands of light years off and the
  boundary draws in full.

  The scenario reads the **order** and nothing else. The boundary draws after the grid at an
  alpha of `0.55` times its own coverage alpha: the zoom fade is 1 at 8,000 light years and the
  range fade is 1 beyond 20,000, so neither fade takes any of it. Where the coverage alpha is 1 the boundary keeps `1 - 0.55`, that is 0.45, of whatever
  the grid put down under it. If the grid drew last, the grid's contribution would be the same
  at both pixels and the ratio would be 1. The band is wide because the boundary's own alpha at
  the crossing is not always its largest, and because the background moves a little between the
  two pixels; it is narrow enough that the wrong order cannot pass.

  **The measured ratio is 0.40.** The view the test finds holds 35 rows whose plane point is
  beyond 20,000 light years, the reading falls on the blue channel, and the grid moves that
  channel by 2 of 255 at the crossing against 5 at the comparison pixel. The band above is
  the bound the reading must fall inside, and 0.45 is the figure the rule gives at full
  coverage: the crossing pixel does not carry the boundary's full coverage alpha, so the
  measured ratio sits a little under it.

  An earlier form of this scenario compared the crossing pixel's distance to the two frames.
  That reading does not hold the order: it puts the grid's contribution on one side and the
  boundary's on the other, so it compares the **strength** of the two overlays and passes at
  either order. Where no grid line meets the boundary it also passes on zero.

  The zoom is stated because the grid draws in a band of its own: it leaves 0.50 of its alpha
  at 8,000 light years and none at 12,000. The boundary now has no close end to its zoom band,
  so the pair meets over the whole of the grid's band, and 8,000 light years is kept because it
  is the reading this scenario was taken at

#### Scenario: The grid draws under a marker

- **WHEN** the browser test puts a marker at the cursor, which is the crossing of two grid
  lines, at a zoom of 1,000 light years, and reads the marker's own pixel with the grid off
  and with it on
- **THEN** the two readings are equal in every channel.

  The marker is opaque, so the order shows as an exact equality and needs no band. The view is
  close, where the grid band is full and the background under it is dark, so the merge of this
  change takes nothing off the line and the reading does not move

#### Scenario: The grid recedes over a bright background

- **WHEN** the browser test turns the grid on and the **region overlay off** at a zoom of
  4,000 light years in **two** views, one over the galactic core and one over the dark
  space between the arms, checks
  through `backgroundReading()` that the texel under the reading point is above 0.55
  luminance in the first and below 0.10 in the second, and reads the **magnitude** of the
  change the grid makes on a line of the label level in each, as the largest absolute
  channel difference between the frame with the grid and the frame without it
- **THEN** the change over the core is between **0.40 and 0.80** of the change over the dark
  space, and the change over the core is at least **24 of 255**.

  The reading is a magnitude and not an addition. Over the core the line is
  `rgb(16, 74, 120)`, whose luminance is 0.254, and the tone-mapped core reads about 0.93,
  so a line over the core **removes** light rather than adding it. The band and the floor
  are both wider than the ones they replace, because the floor on the alpha rose from 0.30
  to 0.55 and the line no longer takes the background's own colour. **The measured pair is
  56 of 255 over the core against 94 of 255 over the dark space**, which is a ratio of
  0.596. The old rule gave 15 of 255 against 110. A stated reading that nobody measured is
  worse than none.

  **The region overlay is off for this reading.** The reading is an absolute channel change
  against the frame drawn without the grid, and the boundary band now draws at every zoom
  under 30,000 light years, so a band crossing either reading point would be counted as the
  grid's own change. Every other scenario of this requirement reads the grid over the
  background alone for the same reason.

  **The band moved with the rule, and it had to.** It read 0.10 to 0.50 while the line took
  0.60 of the background's own colour, and a ratio near 0.14 was the old rule working as
  designed: the grid got out of the way over the core. That is the fault this change
  answers, so a band that still demanded it would fail the change for doing its job. The new
  band asks that the grid still **recedes**, which is a ratio under 1, while staying
  **readable**, which the floor of 24 of 255 holds. The measured 0.596 sits near the middle
  of it.

  The views the browser test takes are the cursor at
  `0, 0, 20000` for the core and at `-40000, 0, 20000` for the dark space, which read a mean
  luminance of 0.652 and 0.058 and a point luminance of 0.685 and 0.045. Two views and not one
  frame, because a frame at 4,000 light years does not hold both the core and inter-arm
  space

#### Scenario: The line darkens over the core and keeps its hue

- **WHEN** the browser test reads the change the grid makes at the two points of the
  scenario above, channel by channel, as the frame with the grid less the frame without it
- **THEN** over the dark space every channel rises and **blue rises the most**; over the core
  every channel falls and **red falls the most**.

  This is what darkening rather than tinting does. Over the dark space the line is a light
  cyan, whose blue is its largest channel, so blue rises most. Over the core the line is a
  deep blue against a cream background, so every channel falls, and red falls most because
  red is where the cream background and the blue line stand furthest apart.

  The line's hue is cyan at both ends, so neither reading can be taken for the region
  boundary band, whose tone is warm. Under the rule this replaces the line took 60 per cent
  of the background's own colour over the core, and red was then nearly unchanged

#### Scenario: The weight and the darkening are one rule

- **WHEN** a unit test reads `gridBackgroundWeight` and `gridBackgroundColour` at luminances
  of 0.00, 0.08, 0.30, 0.55 and 0.90, at both floors and for both the line's and the label's
  light and deep colours
- **THEN** the weight is 1 at 0.08 and below, falls to its own floor at 0.55 and above, and
  never goes under it; the colour is the light one at 0.08 and below and the deep one at
  0.55 and above; and both readings are monotonic between.

  One module SHALL own both rules, and the shader and the label placement SHALL read them
  from it, so a number and the line it sits on cannot disagree

#### Scenario: The bold level reads over the galactic core

- **WHEN** the browser test opens a view over the galactic core at a zoom of 1,000 light
  years, reads a pixel on a line of the label level with the grid off and with it on
- **THEN** the two readings differ by at least **10 of 255** on at least one channel.

  The bound was 4 of 255 under the floor of 0.30 and the tint toward the background. The
  floor is now 0.55 and the line over the core is a deep blue against cream rather than a
  dimmed orange, so the same line moves a channel by more than twice what it moved. The
  floor and the darkening together are what hold this bound

#### Scenario: A line is antialiased

- **WHEN** the browser test turns the grid on at a view where a line of the label level
  runs down the frame, and reads the light the grid adds across that line on 20 rows
- **THEN** every row holds the same total within 10 per cent, at a device pixel ratio of 1

### Requirement: The grid carries coordinate labels on its own plane

While the grid draws, the map SHALL place coordinate labels **flat on the grid's own
plane**, as plane-overlay elements in the overlay the library owns for the region labels. A
label is DOM text and not a pass on the canvas, so it stays a crisp vector at every device
pixel ratio and needs no font in a shader. The capability `plane-overlay` states the
transform, the culling and the degenerate cases.

A label that stands upright on the screen beside a crossing reads as chrome laid over the
map. A label that lies on the plane it names, tilted and sheared with the lines around it,
reads as part of the map, and a user can tell at a glance which plane a coordinate belongs
to.

**A label SHALL read all three game coordinates** of its crossing, as `x : y : z`, in whole
light years, in that order, with a thousands separator in each. The `x` and the `z` are the
crossing's own, and the `y` is the `y` of the plane the grid draws on, which is the cursor's.

**The label level SHALL be 100 or 1,000 light years, and no other.** It SHALL be **100**
while the 100 light year level's spacing on the screen at the cursor is at least **400 CSS
pixels**, and **1,000** otherwise. At 1,080 CSS rows and a 60 degree vertical field of view
that gives 100 light years at a zoom of 233.8 light years and nearer, and 1,000 above it.

The six decade levels draw lines and only these two carry numbers. A coordinate label is a
tool for reading a neighbourhood, and above 1,000 light years a whole multiple carries no
reading a user acts on.

**Two levels leave a band with few numbers, and that is accepted.** From a zoom of about 300
to about 900 light years the level is 1,000 light years, whose crossings sit further apart
than the frame is wide, so a cursor away from a crossing sees no coordinate label at all. The
reach rule below would take those labels anyway: a crossing more than 1,200 light years from
the cursor carries no label whatever level it is on. Adding the 10,000 light year level would
not fill the band either, because its crossings are ten times further apart again. The map
shows the grid lines there and no numbers, and the HUD's information panel names a position
exactly at every zoom.

**A label's size SHALL follow its level and not the screen.** A label therefore holds the
same share of a grid cell at every zoom, and it grows and shrinks with the cell it sits in,
as everything else drawn on the plane does.

**The label's whole width on the plane SHALL be at most 0.6 of a level spacing.** The text is
`x : y : z`, which runs to about 20 characters, so its width is roughly 14 cap heights. A cap
height of one tenth of the spacing would make the label about **1.4 spacings** wide: every
label would then cross its neighbours, the overlap rule below would drop all but one, and the
cap of 8 could never be reached.

The cap height SHALL therefore be **the lesser of one tenth of the level's spacing and the
height that holds the label's own measured width to 0.6 of a spacing**. The width share is
0.6 and not 1: a label that ran the whole width of its own cell read as too large, and 0.6
leaves the number clearly inside the cell it names. The placement SHALL
measure the text once per level, as the region labels measure each name once, and SHALL set
the height from that measurement rather than from a character count.

**A crossing SHALL carry a label only near the cursor, and its opacity SHALL fall with the
distance.** Let `d` be the distance on the plane from the cursor to the crossing and `s` the
level's spacing. Then:

- a crossing with `d` at or above **1.2 s** SHALL carry no label;
- a crossing with `d` below that SHALL take a reach opacity of `1 - d / (1.2 s)`.

At the 100 light year level a crossing 90 light years from the cursor therefore draws at
**0.25**, and one at the cursor draws at 1. A user moving the cursor sees the crossing ahead
of them come up as the one behind them goes down, so the numbers follow the cursor rather
than filling the frame.

The reach is 1.2 spacings and not 1 so that a crossing stays named while the cursor crosses
the cell beyond it. A cursor at the middle of a cell sits `0.707 s` from **all four** of that
cell's corners, so a reach of one spacing already names all four, at an opacity of 0.293. What
one spacing does not do is hold a crossing while the cursor moves the next half cell away
from it: the label would reach 0 exactly as the cursor reaches the far edge of the next cell,
and the number would go out at the moment the user is furthest from any other. 1.2 carries it
through that edge, and it gives the reading this change is specified against, 0.25 at 90
light years on the 100 light year level.

The placement SHALL hold to these bounds:

- The candidates SHALL be the crossings within **2** label spacings of the cursor on each
  axis, which is 25 crossings, so the sweep projects at most 25 points. The work of one frame
  is therefore fixed: it follows the label level and not the size of the host's data set,
  which may hold 10,000 systems.
- A candidate that projects outside the viewport, or that lies behind the near plane, or
  whose plane quad the projection turns away from the camera, SHALL be dropped.
- At most **8** crossing labels SHALL be in the overlay in any frame. The nearest to the
  cursor SHALL be kept.
- A candidate whose screen bounding box overlaps a box already placed SHALL be skipped, by
  the same box test the region labels and the marker name labels use. The box is the
  bounding box of the label's transformed quad, because a label on the plane is not an
  upright rectangle on the screen.

**A label SHALL NOT stand where its own lines do not draw.** Two more readings decide, and
both are readings the lines themselves hold:

- A crossing outside the galaxy model bounds SHALL be dropped, because the lines stop
  there.
- The level's drawn alpha at the crossing SHALL be at least **0.09**. The reading is the
  level's own alpha rule, taken at the crossing's spacing on the screen, multiplied by the
  camera distance band.

  The spacing on the screen SHALL come from the projection's **local rate** at the
  crossing, which is the quantity `grid.frag` reads as a derivative of the plane point. The
  sweep SHALL project the crossing and two points a small step along the game `x` and `z`
  axes, and SHALL invert the 2 by 2 matrix those two steps make, which gives the light
  years of each game axis that one CSS pixel covers there. The reading therefore carries
  the foreshortening that closes the lines up toward the horizon, on both screen axes. The
  greater of the two axis readings decides, because the alpha at a point is the larger of
  the two axes' readings.

  **The step SHALL be small and SHALL NOT be one level spacing.** A gap measured over a
  whole spacing is a secant of a map that bends hard toward the horizon, and the two
  readings part company where the gate matters most.

  The same two steps give the plane basis the transform needs, so the sweep reads them
  once and the gate and the placement share one reading.

0.09 is what a level draws at 24 CSS pixels with the band open, the middle of the fade band
from 8 to 40. The floor of 8 CSS pixels is where a level's alpha reaches 0 and not where
its line becomes readable, so a label placed there would stand over nothing.

**A label SHALL NOT draw stronger than the line it names.** The label's opacity SHALL be
multiplied by `alpha / 0.45`, where `alpha` is the drawn alpha of the label level at the
crossing, the reading the gate above already takes, and 0.45 is `GRID_MAX_ALPHA`, the alpha
a level draws at when it is fully bold with the camera distance band open.

Without the factor a label draws at a fixed 0.80 while its line draws at 0.09, which is the
gate. The number is then nearly nine times the strength of the line it names, and the grid
reads as a field of numbers with a few faint lines behind them. The gate is the floor of the
factor as well as of the line: 0.09 over 0.45 is 0.2, so no label draws below a fifth of its
own opacity, and no label is drawn that the factor would take below that.

**A label SHALL follow the background under it, by the same rule the lines follow.** The
label SHALL read the background reading at the centre of its own box and take:

- an **opacity** of `0.80 * (alpha / 0.45) * reach * (1 - (1 - 0.75) * merge)`, where `merge`
  is the same `smoothstep(0.08, 0.55, L)` the lines use and `reach` is the distance fade
  above;
- a **colour** of `mix(rgb(140, 235, 240), rgb(20, 88, 140), merge)`.

The floor is **0.75** and not the lines' 0.55, and the label darkens to `rgb(20, 88, 140)`
rather than the line's `rgb(16, 74, 120)`, because text needs more contrast than a line to
stay readable. A label and the line it sits on therefore recede together and the label keeps
more of itself.

The floor was 0.45 and the label was a warm `rgb(255, 196, 140)` mixed 35 per cent toward
the background. Over the core that gave text at 0.36 opacity in the core's own hue, which a
user cannot read. The two changes together are what make the numbers readable over the
galactic centre, which is the fault this change answers.

The shadow SHALL be a soft dark glow and SHALL NOT be pure black: `0 0 10px` and `0 1px 2px`
of `rgba(2, 12, 20, 0.75)` and `rgba(2, 12, 20, 0.55)`. The glow is cool rather than the warm
`rgba(12, 6, 2, ...)` it replaces, so it sits under a cyan label rather than beside it.

**The plane label SHALL go.** The grid carried one more element, centred on the lower edge
of the canvas and 22 CSS pixels above it, which read the `y` of the plane on its own. That
`y` is now the middle number of every crossing label, so the separate element was a second
place to read one value, and it was the one part of the grid that did not lie on the grid.
The element `gm-grid-plane-label` SHALL no longer be placed. A host that read it SHALL read
any crossing label and take the second of its three numbers; the page's label readings carry
every label's text, so nothing that read the `y` from the page loses the reading.

Every label SHALL leave the overlay when the grid switch goes off, and when the camera
distance band gives 0.

**The page SHALL expose the readings of the labels of the last frame**, each one holding the
label's text, the screen position of its anchor in CSS pixels, the drawn alpha of its level
at its crossing, its reach opacity and the opacity the label was given. The factor and the
reach are ratios, and neither reaches a pixel of the frame on its own, so a test cannot read
them from the picture alone.

#### Scenario: A crossing label reads its own coordinates

- **WHEN** the browser test turns the grid on at a cursor of (1,000, -600, 2,000) at a zoom
  of 1,000 light years, draws a frame, and reads the crossing labels
- **THEN** at least one label is present, every label's text is three whole numbers
  separated by ` : `, every first and third number is a whole multiple of 1,000, every
  second number is -600, and every number of four digits or more carries a thousands
  separator.

  The separator rule is stated against the digit count and not against every number, because
  a crossing at `x = 0` reads `0` and a crossing at `x = -600` reads `-600`, and neither
  carries one

#### Scenario: A label lies on the plane

- **WHEN** the browser test turns the grid on at a pitch of **30 degrees** at a zoom of
  1,000 light years, draws a frame, and reads the four screen corners of the crossing label
  nearest the cursor
- **THEN** the quad is not an upright rectangle: its top edge is shorter than its bottom
  edge by at least 5 per cent, and both edges are within 2 degrees of the screen direction
  of the grid line of constant `z` through the same crossing

#### Scenario: A label follows the grid cell it sits in

- **WHEN** the browser test reads the cap height of the same label in CSS pixels, and the
  level's own spacing on the screen at the cursor, at zooms of 800, 1,000 and 1,250 light
  years, all on the 1,000 light year level
- **THEN** the three ratios of cap height to spacing agree with each other within 2 per
  cent, so the label holds one share of the cell at every zoom, and each ratio is at or
  below one tenth.

  The share is read against itself and not against one tenth, because the cap height is the
  **lesser** of one tenth and the height that holds the measured text to 0.6 of a spacing.
  For `x : y : z` the width bound is the lesser one, so the share is about a twenty-third.
  What this scenario holds is that the share does not follow the zoom

#### Scenario: The label level follows the zoom

- **WHEN** the browser test turns the grid on at 1,080 CSS rows and reads `gridSpacingLy`
  at the zoom distances 100, 200, 300, 1,000, 3,000 and 11,000 light years
- **THEN** the readings are 100, 100, 1,000, 1,000, 1,000 and 1,000, so no label level other
  than 100 and 1,000 is ever taken

#### Scenario: A label fades with its distance from the cursor

- **WHEN** the browser test turns the grid on at the 100 light year level at a pitch of 89
  degrees, puts the cursor 90 light years from a crossing on one axis and level with it on
  the other, draws a frame and reads that label's reach opacity, then moves the cursor onto
  the crossing and reads it again
- **THEN** the first reading is **0.25** within 0.02 and the second is 1 within 0.02

#### Scenario: No label stands past the reach

- **WHEN** the browser test turns the grid on at the 100 light year level at a pitch of 89
  degrees and reads every crossing label's text and the distance on the plane from the
  cursor to the crossing it names
- **THEN** every distance is below 120 light years, and at least one label is present

#### Scenario: A label is no wider than the cell it names

- **WHEN** the browser test reads the screen width of every crossing label's transformed quad
  and the level's own spacing on the screen at the same crossing, at zooms of 150 and 1,000
  light years
- **THEN** every label's width is at or below **0.6** of its level's spacing, and at least
  one label is above **0.4** of it, so the rule bounds the label without making it
  unreadably small

#### Scenario: The label count is capped

- **WHEN** the browser test turns the grid on at a pitch of 5 degrees, which shows the
  most crossings, draws a frame and counts the crossing labels
- **THEN** the count is 8 or fewer

#### Scenario: The labels go with the switch

- **WHEN** the browser test turns the grid on, draws a frame and counts every grid label,
  then turns it off, draws a frame and counts again
- **THEN** the first count is above 0 and the second is 0

#### Scenario: A label recedes over a bright background

- **WHEN** the browser test turns the grid on and the **region overlay off** at a zoom of
  **1,000 light years** at a pitch of **89 degrees** in the same **two** views the line
  scenarios use, one over the galactic core and one over the dark space between the arms,
  and reads the opacity and the colour of the crossing label **nearest the cursor** in each
- **THEN** the opacity over the core is between 0.70 and 0.80 of 0.80, the opacity over the
  dark space is above 0.95 of 0.80, the colour over the core is within 8 of 255 on each
  channel of `rgb(20, 88, 140)`, the colour over the dark space is within 8 of 255 on each
  channel of `rgb(140, 235, 240)`, and neither label carries a pure black shadow.

  The label nearest the cursor holds the reach fade at 1 and the line factor at 1 at a pitch
  of 89 degrees, so this scenario reads the background rule alone

#### Scenario: A label and its line recede together

- **WHEN** a unit test reads the line weight and the label weight at background luminances
  of 0.02, 0.20, 0.30 and 0.80
- **THEN** at 0.02 both weights are 1, because `merge` is 0 at a luminance of 0.08 and below;
  at 0.20, at 0.30 and at 0.80 both weights fall as the luminance rises, neither falls below
  its own floor, and the label weight is above the line weight

#### Scenario: No label stands past the last line

- **WHEN** the browser test turns the grid on with the cursor at the model's upper `x`
  bound at a zoom of 1,000 light years and a pitch of 89 degrees, where the label level is
  1,000 light years and the crossing at `x` = 51,000 lies inside the reach, and reads
  every crossing label's text
- **THEN** no label names an `x` above the bound, and at least one names 50,000, so the
  sweep dropped the crossing past the bound and kept the one inside it

#### Scenario: A label goes out with its lines

- **WHEN** the browser test turns the grid on at a zoom at which the camera distance band
  leaves 0.011 of the alpha, draws a frame and counts every grid label, then repeats at a
  zoom of 3,000 light years
- **THEN** the first count is 0 and the second is above 0

#### Scenario: Every label sits on a line

- **WHEN** the browser test turns the grid on at a zoom of 3,000 light years at a pitch of
  5 degrees, which reaches furthest toward the horizon, reads each crossing label's anchor
  position and reads the drawn pixel there
- **THEN** every label's anchor sits on a pixel the grid lit

#### Scenario: A label does not draw stronger than its line

- **WHEN** the browser test turns the grid on at a zoom of 3,000 light years at a pitch of
  **5 degrees**, over the dark space between the arms, and reads for every crossing label
  its own opacity, its reach opacity and the drawn alpha of the level at its crossing
- **THEN** every label's opacity is `0.80 * alpha / 0.45` times its reach opacity times its
  background weight, within 0.01, and no label's opacity is above 0.80

#### Scenario: The factor is 1 at the cursor

- **WHEN** a unit test reads the label opacity factor at the drawn alpha a fully bold level
  gives with the band open, which is 0.45, and at the gate of 0.09
- **THEN** the first factor is 1 and the second is 0.2
