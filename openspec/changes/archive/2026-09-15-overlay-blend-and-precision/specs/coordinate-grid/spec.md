## ADDED Requirements

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


## MODIFIED Requirements

### Requirement: The grid blends under the overlays at its own weights

The grid SHALL draw after the tone map and **before** the region boundary overlay and the
marker pass, and SHALL blend over the frame with alpha and no depth test. A region
boundary and a marker therefore draw over a grid line, and the grid adds no light the tone
map reads.

The look is the level rule of the requirement "The grid draws every decade level on the
cursor's plane": the colour `rgb(255, 154, 60)`, a width from 1.0 to 2.6 CSS pixels and an
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

- **The alpha** SHALL be multiplied by `1 - (1 - 0.30) * merge`. A line over a background
  at or below 0.08 keeps its full level alpha. The same line over a background at or above
  0.55 keeps **0.30** of it.
- **The colour** SHALL be `mix(rgb(255, 154, 60), background, 0.60 * merge)`, where
  `background` is the reading's own colour. Over the bright core the line takes 60 per cent
  of the background's hue, so it reads as a change of brightness in the picture and not as
  a foreign orange stripe laid over it.

The two together are what "a bit more prominent than the environment, but only to some
degree" means, and they are why the grid fades into the picture as the picture gets
brighter rather than staying on top of it.

The **floor of 0.30** is not zero. A grid the user cannot find over the core is not a
coordinate grid. The floor is what keeps it readable there while the merge takes its
prominence away.

The reading is a sixteenth of the frame on each axis and SHALL be sampled with linear
filtering, so `merge` changes smoothly across the frame and a line does not step where two
texels meet.

`gridLevels()` SHALL keep reporting the level's alpha **before** the background weight, so
the probe stays a reading of the level rule and one frame's background does not move it.

A line SHALL be antialiased across its width, so a line that does not sit on a pixel
centre is not one pixel wide in one column and two in the next.

#### Scenario: The overlays draw over the grid

- **WHEN** the browser test opens a view that shows a region boundary crossing a grid line at
  a zoom of about **8,000 light years**, reads the same rectangle in **four** frames, with
  neither overlay, with the grid alone, with the boundary alone and with the two together, and
  takes two pixels from those readings: the **crossing**, which is the pixel where the product
  of the grid's own contribution and the boundary's own contribution is largest, and the
  **comparison**, which is the nearest pixel that carries the same grid contribution within a
  tenth and no boundary contribution at all
- **THEN** the grid's contribution at the crossing, which is the frame with both overlays less
  the frame with the boundary alone, is between **0.45 and 0.85** of the grid's contribution at
  the comparison pixel, which is the frame with the grid alone less the frame with neither.
  The reading is taken on the channel that carries the largest grid contribution.

  The scenario reads the **order** and nothing else. The boundary draws after the grid at an
  alpha of `0.55 * regionFade(8000)`, which is 0.357, so it keeps `1 - 0.357`, that is 0.643,
  of whatever the grid put down under it. If the grid drew last, the grid's contribution would
  be the same at both pixels and the ratio would be 1. The band is wide because the boundary's
  own alpha at the crossing is not always its largest, and because the background moves a
  little between the two pixels; it is narrow enough that the wrong order cannot pass.

  An earlier form of this scenario compared the crossing pixel's distance to the two frames.
  That reading does not hold the order: it puts the grid's contribution on one side and the
  boundary's on the other, so it compares the **strength** of the two overlays and passes at
  either order. Where no grid line meets the boundary it also passes on zero.

  The zoom is stated because the two overlays now draw in bands that barely meet. The grid
  band leaves 0.50 of its alpha at 8,000 light years and none at 12,000; the region band
  leaves 0.65 of its opacity at 8,000 and none at 5,000. 8,000 is where the product of the two
  is largest, and it is the only part of the zoom range where this reading can be taken at all

#### Scenario: The grid draws under a marker

- **WHEN** the browser test puts a marker at the cursor, which is the crossing of two grid
  lines, at a zoom of 1,000 light years, and reads the marker's own pixel with the grid off
  and with it on
- **THEN** the two readings are equal in every channel.

  The marker is opaque, so the order shows as an exact equality and needs no band. The view is
  close, where the grid band is full and the background under it is dark, so the merge of this
  change takes nothing off the line and the reading does not move

#### Scenario: The grid recedes over a bright background

- **WHEN** the browser test turns the grid on at a zoom of 4,000 light years in **two**
  views, one over the galactic core and one over the dark space between the arms, checks
  through `backgroundReading()` that the texel under the reading point is above 0.55
  luminance in the first and below 0.10 in the second, and reads the **magnitude** of the
  change the grid makes on a line of the label level in each, as the largest absolute
  channel difference between the frame with the grid and the frame without it
- **THEN** the change over the core is between **0.02 and 0.20** of the change over the dark
  space, and both are at least 2 of 255.

  The reading is a magnitude and not an addition. `rgb(255, 154, 60)` has a luminance of
  0.662 and the tone-mapped core reads about 0.93, so a line over the core **removes** light
  rather than adding it. The measured pair is 15 of 255 over the core against 110 over the
  dark space, a ratio of 0.136. The views the browser test takes are the cursor at
  `0, 0, 20000` for the core and at `-40000, 0, 20000` for the dark space, which read a mean
  luminance of 0.652 and 0.058 and a point luminance of 0.685 and 0.045. Two views and not one
  frame, because a frame at 4,000 light years does not hold both the core and inter-arm
  space

#### Scenario: The line takes the background's hue over the core

- **WHEN** the browser test reads the change the grid makes at the two points of the
  scenario above, channel by channel, as the frame with the grid less the frame without it
- **THEN** over the dark space every channel rises and red rises the most; over the core no
  channel rises by more than 2 of 255 and blue falls.

  The dark view SHALL be chosen with a **blue** channel below 60 of 255 under the reading
  point. The line's own blue is 60, and the haze the scene carries is strongly blue, so a
  dark background can still hold a blue above 60; the line's blue would then fall there for a
  reason that has nothing to do with the merge.

  This is what taking 0.60 of the background's hue does over a background brighter than the
  line: what is left of the line's own colour is its warmth, so the blue channel is where
  the line still reads and red is nearly unchanged

#### Scenario: The weight and the tint are one rule

- **WHEN** a unit test reads `gridBackgroundWeight` and `gridBackgroundTint` at luminances
  of 0.00, 0.08, 0.30, 0.55 and 0.90, at both floors and both tint maxima
- **THEN** the weight is 1 at 0.08 and below, falls to its own floor at 0.55 and above, and
  never goes under it; the tint is 0 at 0.08 and below and its own maximum at 0.55 and
  above; and both are monotonic between

#### Scenario: The bold level reads over the galactic core

- **WHEN** the browser test opens a view over the galactic core at a zoom of 1,000 light
  years, reads a pixel on a line of the label level with the grid off and with it on
- **THEN** the two readings differ by at least 4 of 255 on at least one channel.

  The bound was 12 of 255 before the merge. At a background of 0.55 or above the merge
  leaves 0.30 of the level's alpha, so the same line now moves a channel by about a third
  of what it moved. The floor is what holds this bound above zero

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

**A label SHALL follow the background under it, by the same rule the lines follow.** A
number in `rgba(255, 196, 140, 0.86)` over a hard black shadow is a HUD label pasted on the
sky. The label SHALL read the background reading at the centre of its own box and take:

- an **opacity** of `0.80 * (1 - (1 - 0.45) * merge)`, where `merge` is the same
  `smoothstep(0.08, 0.55, L)` the lines use;
- a **colour** of `mix(rgb(255, 196, 140), background, 0.35 * merge)`.

The floor is **0.45** and not the lines' 0.30, and the tint reaches 0.35 and not 0.60,
because text needs more contrast than a line to stay readable. A label and the line it sits
on therefore recede together and the label keeps a little more of itself.

The base opacity falls from 0.86 to 0.80 because the label no longer carries a hard outline
to sit over. The shadow SHALL be a soft dark glow and SHALL NOT be pure black: `0 0 10px` and
`0 1px 2px` of `rgba(12, 6, 2, 0.75)` and `rgba(12, 6, 2, 0.55)`. A hard black shadow draws a
second outline that no part of the picture carries.

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

#### Scenario: A label recedes over a bright background

- **WHEN** the browser test turns the grid on at a zoom of **2,000 light years** in the same
  **two** views the line scenarios use, one over the galactic core and one over the dark
  space between the arms, and reads the opacity of a crossing label in each
- **THEN** the opacity over the core is between 0.40 and 0.55 of 0.80, the opacity over the
  dark space is above 0.75 of 0.80, and neither label carries a pure black shadow.

  The zoom is inside every band the labels read. The camera distance band draws the grid in
  full at 4,000 light years and nearer. The label level at 2,000 light years and 1,080 CSS
  rows is 1,000 light years, whose spacing on the screen is about 468 CSS pixels, so a
  1920 wide frame holds about four crossings and the level draws at 0.45 alpha, well above
  the 0.09 gate. At a zoom of 4,000, where the line scenarios read, the label level is
  10,000 light years and about 2,338 CSS pixels, and the frame may hold no crossing at all

#### Scenario: A label and its line recede together

- **WHEN** a unit test reads the line weight and the label weight of the same background
  luminance, at 0.02, at 0.20, at 0.30 and at 0.80
- **THEN** at 0.02 both weights are 1, because `merge` is 0 at a luminance of 0.08 and below;
  at 0.20, at 0.30 and at 0.80 both weights fall as the luminance rises, neither falls below
  its own floor, and the label weight is above the line weight.

  The label and line readings are 1.000 and 1.000 at 0.02, 0.911 and 0.886 at 0.20, 0.751 and
  0.683 at 0.30, and 0.450 and 0.300 at 0.80, each within 0.005. The label keeps more of
  itself only where the merge acts at all

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
horizon. The cost that has to be measured is therefore the fill and not the vertex count.

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
