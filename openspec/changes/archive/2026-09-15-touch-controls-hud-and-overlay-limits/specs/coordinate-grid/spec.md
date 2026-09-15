## MODIFIED Requirements

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

**A label SHALL NOT draw stronger than the line it names.** The label's opacity SHALL be
multiplied by `alpha / 0.45`, where `alpha` is the drawn alpha of the label level at the
crossing, the reading the gate above already takes, and 0.45 is `GRID_MAX_ALPHA`, the alpha
a level draws at when it is fully bold with the camera distance band open.

A label level's spacing on the screen is at least 400 CSS pixels at the cursor, so the level
is fully bold there and the factor is 1: a label at the cursor keeps the whole of its own
opacity and nothing changes for it. The factor falls away from the cursor, where the
projection closes the lines up toward the horizon and the level's alpha falls with them.

Without the factor a label draws at a fixed 0.80 while its line draws at 0.09, which is the
gate. The number is then nearly nine times the strength of the line it names, and the grid
reads as a field of numbers with a few faint lines behind them. The gate is the floor of the
factor as well as of the line: 0.09 over 0.45 is 0.2, so no label draws below a fifth of its
own opacity, and no label is drawn that the factor would take below that.

**A label SHALL follow the background under it, by the same rule the lines follow.** A
number in `rgba(255, 196, 140, 0.86)` over a hard black shadow is a HUD label pasted on the
sky. The label SHALL read the background reading at the centre of its own box and take:

- an **opacity** of `0.80 * (alpha / 0.45) * (1 - (1 - 0.45) * merge)`, where `merge` is the
  same `smoothstep(0.08, 0.55, L)` the lines use;
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

**The page SHALL expose the readings of the labels of the last frame**, each one holding the
label's text, its position in CSS pixels, the drawn alpha of its level at its crossing and
the opacity the label was given. The factor is a ratio of two numbers, and only one of them
reaches a pixel of the frame, so a test cannot read it from the picture alone.

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

- **WHEN** the browser test turns the grid on at a zoom of **2,000 light years** at a pitch
  of **89 degrees** in the same **two** views the line scenarios use, one over the galactic
  core and one over the dark space between the arms, and reads the opacity of the crossing
  label **nearest the centre of the canvas** in each
- **THEN** the opacity over the core is between 0.40 and 0.55 of 0.80, the opacity over the
  dark space is above 0.75 of 0.80, and neither label carries a pure black shadow.

  The zoom is inside every band the labels read. The camera distance band draws the grid in
  full at 4,000 light years and nearer. The label level at 2,000 light years and 1,080 CSS
  rows is 1,000 light years, whose spacing on the screen is about 468 CSS pixels, so a
  1920 wide frame holds about four crossings and the level draws at 0.45 alpha, well above
  the 0.09 gate. At a zoom of 4,000, where the line scenarios read, the label level is
  10,000 light years and about 2,338 CSS pixels, and the frame may hold no crossing at all.

  The pitch and the nearest label are what hold the line factor at 1, so this scenario reads
  the background rule alone. Looking down from 89 degrees the projection is nearly flat over
  the frame, and the crossing at the middle carries the level's full 0.45 alpha. A label far
  out at a low pitch carries less, which is what the scenario below reads

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


#### Scenario: A label does not draw stronger than its line

- **WHEN** the browser test turns the grid on at a zoom of 3,000 light years at a pitch of
  **5 degrees**, which reaches furthest toward the horizon, over the dark space between the
  arms, and reads for every crossing label its own opacity and the drawn alpha of the level
  at its crossing
- **THEN** every label's opacity is `0.80 * alpha / 0.45` times its background weight, within
  0.01; the label nearest the top of the frame has a lower opacity than the label nearest the
  centre; and no label's opacity is above 0.80

#### Scenario: The factor is 1 at the cursor

- **WHEN** a unit test reads the label opacity factor at the drawn alpha a fully bold level
  gives with the band open, which is 0.45, and at the gate of 0.09
- **THEN** the first factor is 1 and the second is 0.2

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

  **MODIFIED in this scenario**: the pitch, the range premise and the band. The change that
  carries this scenario gives the boundary a **range fade** per pixel, nothing under 10,000
  light years and full at 20,000. The view this scenario used was a pitch of 89 degrees, where
  every pixel reads a plane point about 8,000 light years from the camera, so the boundary
  would now draw nothing anywhere in the frame and the reading could not be taken. A pitch of
  5 degrees reaches toward the horizon, where the plane is tens of thousands of light years
  off and the boundary draws in full.

  The scenario reads the **order** and nothing else. The boundary draws after the grid at an
  alpha of `0.55` times its own coverage alpha: the zoom fade is 1 at 8,000 light years and the
  range fade is 1 beyond 20,000, so the close end of the old zoom band no longer takes any of
  it. Where the coverage alpha is 1 the boundary keeps `1 - 0.55`, that is 0.45, of whatever
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
