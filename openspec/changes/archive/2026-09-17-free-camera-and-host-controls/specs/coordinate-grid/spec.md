## MODIFIED Requirements

### Requirement: The grid draws every decade level to its own reach on the cursor's plane

The map SHALL draw a set of lines on a plane of constant `y` in game coordinates. The
lines SHALL run along the `x` and the `z` axes of the game frame, so a line of the grid
is a line of constant `x` or constant `z` and the user can read a coordinate from it.

**The plane** SHALL be at the cursor's own `y`, and not at `y = 0`. The camera SHALL be on
either side of it: the pitch runs from -89 to 89 degrees, which `map-navigation` states, so
the grid is below the camera at a positive pitch and above it at a negative one. The pass
SHALL therefore take the meeting of its ray with the plane in both directions, which the
requirement "The grid and its labels draw from under the plane" states. A user who presses
`R` or `F` takes the grid with them, and the plane they look at is the plane they measure
on.

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

**That reach is the only reach a level takes.** A level that carried no number took the
lesser of its own `100 * s` and `0.4 * d`, where `d` is the camera's distance to the
cursor. That second bound SHALL go. Every level, numbered or not, SHALL take
`clamp(1 - r / (100 * s), 0, 1)` and nothing else, so the reach of a level follows the
level and never the zoom.

The zoom bound drew the fine levels inside a disc of 0.346 of the viewport height about the
cursor, 374 CSS pixels on 1,080 rows, and left the numbered level alone outside it. The
frame then read as a patch of lattice around the cursor inside a coarse grid, and a user
who moved the cursor moved the patch with it. A grid that stops a few hundred pixels from
the cursor is not a grid of the map.

The lattice therefore runs to the edge of the frame again wherever its own reach and its
screen spacing allow. Two rules bound it: a level draws nothing below a screen spacing of 8
CSS pixels, which takes every level that would read as a wash, and a level stops at 100 of
its own lines. At a camera distance of 4,000 light years and 1,080 CSS rows the 100 light
year level measures 23.4 CSS pixels at the cursor and draws at an alpha of 0.09, and the 10
light year level measures 2.3 and draws nothing.

**At a shallow pitch those two rules leave the lattice running to the frame edge, and that
is accepted.** The shader reads the screen spacing **per axis** from the fragment
derivatives, so the two line families of one level end at different places. At a camera
distance of 4,000 light years, a pitch of 45 degrees and 1,080 CSS rows, the top of the
frame sits 7,727 light years beyond the cursor, inside the 100 light year level's own reach
of 10,000. The lines of constant depth fall under 8 CSS pixels 76 per cent of the way up
the frame; the lines that run toward the horizon are still 9.9 CSS pixels apart at the top
row and the 8 CSS pixel cut never ends them. Half of that lattice therefore reaches the
frame edge.

That is the reading the zoom bound was added for, and it is the behaviour the owner asks
for now. A grid that stops a few hundred CSS pixels from the cursor is the worse of the two
faults: it reads as a hole in the frame, while a lattice that runs on reads as a grid that
is simply fine. The perspective fade still takes the family that closes up, and the camera
distance band still takes the whole grid at 12,000 light years.

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
band, whose two tones are `(0.74, 0.55, 0.43)` and `(0.90, 0.79, 0.52)`, of luminance 0.581
and 0.794. An orange grid had to be told from both by
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

#### Scenario: The lattice runs to the edge of the frame

- **WHEN** the browser test turns the grid on at **1920x1080** at a pitch of 89 degrees at
  a camera distance of **4,000** light years, where the numbered level is 1,000 light
  years, and measures in CSS pixels the largest radius about the cursor at which the
  **100 light year** level lights any pixel of the frame
- **THEN** the radius is above **900** CSS pixels, which is past the 374 the zoom bound
  ended at and near the 1,101 CSS pixels from the middle of that frame to its corner.

  The level's own reach is 10,000 light years, and at that pitch and that distance the frame
  holds plane points out to about 2,330 light years at the middle of its top row and further
  at its corners, all inside the reach, so the reach ends outside the frame and the level
  draws over the whole of it

#### Scenario: The lattice draws past the old zoom bound at a shallow pitch

- **WHEN** the browser test turns the grid on at **1920x1080** at a pitch of **45 degrees**
  at a camera distance of **4,000** light years, and reads the middle column of the
  **bottom row** of the frame for a line of the **100 light year** level
- **THEN** the level lights pixels in that row.

  The plane point under the middle of the bottom row is **2,070 light years** from the
  cursor, on the camera's own side of it: the camera sits 2,828 light years above the plane
  and 2,828 behind the cursor, and the bottom row looks 75 degrees below the horizontal,
  which meets the plane 758 light years from the point below the camera. The zoom bound of
  `0.4 * d` reached 1,600 light years, so it drew nothing in that row. The level's own reach
  of 10,000 light years keeps it, and the range there gives a screen spacing of 31.9 CSS
  pixels, which draws at an alpha of 0.16.

  This scenario reads the near side of the frame and the one above it reads the far side, so
  the two together hold the lattice over the whole frame at both ends of the pitch range

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
reach rule below would take those labels anyway: a crossing more than 2,000 light years from
the cursor carries no label whatever level it is on. Adding the 10,000 light year level would
not fill the band either, because its crossings are ten times further apart again. The map
shows the grid lines there and no numbers, and the HUD's information panel names a position
exactly at every zoom.

**A label's size SHALL follow its level and not the screen.** A label therefore holds the
same share of a grid cell at every zoom, and it grows and shrinks with the cell it sits in,
as everything else drawn on the plane does.

**The label's whole width on the plane SHALL be at most 0.6 of a level spacing.** The text is
`x : y : z`, which runs to 27 characters at its widest, so its width is roughly 23 cap
heights. A cap height of one tenth of the spacing would make the label about **2.3 spacings**
wide: every label would then cross its neighbours, the overlap rule below would drop all but
one, and the cap of 8 could never be reached.

**Every label of a level SHALL take one cap height**, and that height SHALL come from the
**widest text the active browsable bounds allow** and not from each label's own text. The
map SHALL build that worst-case text once: for each of the game `x`, `y` and `z` it takes
the bound endpoint whose written form is the longest, and it composes the three as
`x : y : z`. Inside the model bounds that text is `-49,985 : -40,985 : -24,105`, which is 27
characters and gives a cap height of about **0.026 of a spacing**.

**A sphere bound has no endpoint on an axis**, so the map SHALL take the endpoints of the
sphere's own axis-aligned box, which is the centre plus and minus the radius on each axis.
A box bound gives its endpoints directly.

The cap height SHALL therefore be **the lesser of one tenth of the level's spacing and the
height that holds the worst-case text to 0.6 of a spacing**. The width share is
0.6 and not 1: a label that ran the whole width of its own cell read as too large, and 0.6
leaves the number clearly inside the cell it names. The placement SHALL
measure the worst-case text once for each font, as the region labels measure each name once,
and SHALL set the height from that measurement rather than from a character count.

**Each label's own box SHALL still follow its own text**, so a short number sits in a short
box and the overlap test stays honest. The cap height alone is shared.

**The size came from each label's own text.** A monospaced font makes the width
proportional to the character count, so `0 : 0 : 0` took three times the cap height of
`-49,985 : -40,985 : -24,105`, and two labels beside each other differed by up to 1.6 times.
The grid read as numbers at mixed sizes and not as one scale. Labels near the origin lose
height under the new rule, and that is accepted.

**The `y` term SHALL come from the bounds and not from the cursor.** The `y` a label carries
is the `y` of the plane, which is the cursor's. Taking its written length would resize every
label of the frame as the user moved the cursor up and down.

**A restriction narrows the worst case.** Where the host sets browsable bounds, which
`map-navigation` states, the three endpoints come from those bounds, so a map held to a
small sphere carries larger numbers. A change of the bounds SHALL change the label size in
the frame it happens.

**A label SHALL stand clear of the two lines it names.** The label's rectangle on the plane
SHALL sit so that the crossing is its **bottom right** corner, less a gap of **0.04** of a
level spacing on each of the game `x` and the game `z` axes. The label therefore lies in the
cell above and left of the crossing, in the frame the text itself reads in, and neither of
the two lines runs under a digit.

The rectangle runs along the game axes, which `plane-overlay` states: its width runs along
`x`, its height runs along `z`, and its **anchor sits at its middle**. The element's local
`y` grows **downward along the game `-z` axis**, which is what makes the text read the right
way round at the default view, so the rectangle's top edge is its `+z` edge and its bottom
edge is its `-z` edge. Its **bottom right** corner is therefore at
`(anchor.x + width / 2, anchor.z - height / 2)` in game coordinates.

The anchor the placement gives the overlay SHALL therefore be the crossing **less** half the
label's width and the gap on `x`, and **plus** half its height and the gap on `z`:

- `anchor.x = crossing.x - width / 2 - gap`
- `anchor.z = crossing.z + height / 2 + gap`

The two signs are not the same, and the `z` one follows the element's own frame and not the
game frame. The label then lies toward `-x` and `+z` from the crossing, which is up and to
the left of it on the screen at the default view.

A label was centred on its crossing, so both lines crossed the text through its middle. A
number is read against the lines it names, and a line through the middle of a row of digits
is the one place a reader cannot tell one digit from another.

The gap is 0.04 of a spacing, which is about 1.5 cap heights: the cap height is the lesser of
one tenth of the spacing and the height that holds the worst-case text to 0.6 of a spacing,
which is about 0.026 of the spacing. At the 1,000 light year level the gap is 40 light years.

**The reported anchor SHALL stay the crossing.** The reading the page exposes names the
place the label belongs to, and that place is the crossing and not the middle of the text.
The background reading the label follows SHALL still be read at the centre of the label's
**own box**, which now sits off the crossing, because that is the picture the text draws
over.

**A crossing SHALL carry a label only near the cursor, and its opacity SHALL fall with the
distance.** Let `d` be the distance on the plane from the cursor to the crossing and `s` the
level's spacing. Then:

- a crossing with `d` at or above **2 s** SHALL carry no label;
- a crossing with `d` below that SHALL take a reach opacity of `1 - d / (2 s)`.

At the 100 light year level a crossing 90 light years from the cursor therefore draws at
**0.55**, and one at the cursor draws at 1. A user moving the cursor sees the crossing ahead
of them come up as the one behind them goes down, so the numbers follow the cursor rather
than filling the frame.

**The reach is 2 spacings, so every corner of the cursor's own cell carries a number.** The
furthest corner of the cell a cursor sits in is `1.41 s` away, at the moment the cursor sits
on the opposite corner. The reach was 1.2 spacings, which took that corner and left the cell
named on one side only: a user beside a crossing read numbers behind them and none ahead.
Two spacings names all four corners wherever the cursor sits in the cell, and it names them
at an opacity of at least `1 - 1.41 / 2`, which is **0.29**.

The reach is 2 and not more because 2 is what the candidate ring already holds. The ring
below reads the crossings within 2 spacings of the cursor's own cell on each axis, and a
crossing three steps out is at least 2 spacings away, so no reach above 2 could name a
crossing the ring holds. A wider reach would need a wider ring, which is more work in each
frame for numbers the cap of 8 would drop.

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

**The dark edge SHALL be a stroke and SHALL NOT be a blurred shadow.** A label SHALL carry
a stroke of **2.5 CSS pixels** in `rgba(2, 12, 20, 0.9)`, drawn under the glyph, and SHALL
carry no `text-shadow`. The colour is the same cool dark the blurred glow used, so the edge
sits under a cyan label rather than beside it, and it SHALL NOT be pure black.

The edge was `0 0 10px` and `0 1px 2px` of `rgba(2, 12, 20, 0.75)` and
`rgba(2, 12, 20, 0.55)`. Firefox rasterises a blurred text shadow on the CPU, in
`nsTextFrame::PaintOneShadow`. With the camera moving, the overlay's two blurred
label shadows together cost **4.2 ms** of every frame, of a frame that cost 12.1 ms in
all, which `browser-suite` states with the view and the reading they come from. The
marker name label carries the other of the two, which `system-selection` states. A stroke
in place of both costs under 1 ms. Chromium blurs on the GPU and shows about 1 ms for the
same work, so the reading that moves is Firefox's.

**2.5 pixels is the width the label is built at, not the width the user sees.** A
coordinate label sits on the plane and takes the plane's transform, which scales it with
the camera. The transform scales the stroke with the glyph, so the drawn edge reads about
1.25 to 2.5 CSS pixels over the distances the grid labels are drawn at. The computed style
answers `2.5px` at every distance, because it reads the built width, and that is the number
the scenario below asserts.

The edge is therefore hard rather than soft. That is a look change, and it is the price of
the frame.

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
  edge by at least 2 per cent, and both edges are within 2 degrees of the screen direction
  of the grid line of constant `z` through the same crossing.

  The margin was 5 per cent while each label took its own size. The label at the origin
  reads `0 : 0 : 0`, which the worst-case rule above now sizes at about a third of that
  height, and the depth the quad spans shrinks with it. The reading is 3.0 per cent

#### Scenario: A label follows the grid cell it sits in

- **WHEN** the browser test reads the cap height of the same label in CSS pixels, and the
  level's own spacing on the screen at the cursor, at zooms of 800, 1,000 and 1,250 light
  years, all on the 1,000 light year level
- **THEN** the three ratios of cap height to spacing agree with each other within 2 per
  cent, so the label holds one share of the cell at every zoom, and each ratio is at or
  below one tenth.

  The share is read against itself and not against one tenth, because the cap height is the
  **lesser** of one tenth and the height that holds the worst-case text to 0.6 of a spacing.
  The width bound is the lesser one, so the share is about 0.026. What this scenario holds is
  that the share does not follow the zoom

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
- **THEN** the first reading is **0.55** within 0.02 and the second is 1 within 0.02

#### Scenario: No label stands past the reach

- **WHEN** the browser test turns the grid on at the 100 light year level at a pitch of 89
  degrees and reads every crossing label's text and the distance on the plane from the
  cursor to the crossing it names
- **THEN** every distance is below 200 light years, and at least one label is present

#### Scenario: A label is no wider than the cell it names

- **WHEN** the browser test puts the cursor at (40,000, -40,000, 70,000), where the labels
  run to 25 characters, and reads the screen width of every crossing label's transformed
  quad and the level's own spacing on the screen at the same crossing, at zooms of 150 and
  1,000 light years
- **THEN** every label's width is at or below **0.6** of its level's spacing, and at least
  one label is above **0.4** of it, so the rule bounds the label without making it
  unreadably small

#### Scenario: Every label of a frame has one cap height

- **WHEN** the browser test puts the cursor at (995, -600, 1,005) at a zoom of 150 light
  years, draws a frame, and reads the text and the cap height of every crossing label
- **THEN** at least two labels are present, their texts are not all the same length, and
  every cap height is the same within 1 per cent.

  The assertion reads the texts the frame actually placed and does not predict a length.
  Which crossings survive the reach, the alpha gate and the cap of 8 follows the placement
  rules, and two labels of the same length would make the reading say nothing

#### Scenario: The cap height comes from the worst case and not from the frame

- **WHEN** a unit test reads the cap height rule for the 1,000 light year level with the
  model bounds active
- **THEN** it is 0.026 of the spacing within 5 per cent, which is the height that holds
  `-49,985 : -40,985 : -24,105` to 0.6 of a spacing, and it is below the one tenth the other
  bound allows

#### Scenario: A narrower bound gives larger numbers

- **WHEN** the browser test reads the cap height of a crossing label at a zoom of 1,000
  light years with no bounds set, then sets a sphere bound of radius 900 light years at the
  origin, whose box endpoints are -900 and 900 and whose worst-case text is therefore
  `-900 : -900 : -900` at 18 characters, and reads it again
- **THEN** the second reading is larger than the first, in about the ratio 27 to 18

#### Scenario: Moving the cursor does not resize the labels

- **WHEN** the browser test reads the cap height of a crossing label with the cursor's `y`
  at 0, then moves the cursor's `y` to -40,000 and reads it again
- **THEN** the two readings are the same within 1 per cent

#### Scenario: A number stands clear of the lines it names

- **WHEN** the browser test turns the grid on at a pitch of **89 degrees** at a zoom of
  1,000 light years, draws a frame, and reads the four screen corners of every crossing
  label and the screen position of the crossing each one names
- **THEN** no crossing lies inside its own label's quad, each crossing sits within **0.12**
  of the level's spacing on the screen from the nearest corner of that quad, and that
  nearest corner is the label's **own bottom right** corner, which is the third of the four
  corners `plane-overlay` reports, in every label of the frame.

  0.12 is the bound and 0.057 is the reading the rule gives: the gap of 0.04 of a spacing on
  each axis puts the bottom right corner `0.04 * sqrt(2)` of a spacing from the crossing.

  The corner is named because the offset has a sign on each axis and the wrong sign on
  either one still clears the lines. A label placed at `+x` or at `-z` from its crossing
  reads the same distance from it and lies in the wrong cell, and this reading is what tells
  the two apart. At a pitch of 89 degrees and the default yaw the game `+z` axis runs up the
  screen and the game `+x` axis runs right, so the bottom right corner of the label is the
  corner nearest the crossing and the label lies above and left of it

#### Scenario: Every corner of the cursor's own cell carries a number

- **WHEN** the browser test turns the grid on at a pitch of **89 degrees** at a zoom of
  **200** light years, where the label level is 100 light years, puts the cursor **5 light
  years** from a crossing on each axis, draws a frame and reads every crossing label's text
- **THEN** the four crossings of the cell the cursor sits in all carry a label, one in each
  quadrant about the cursor, and the furthest of the four is **134.4** light years away,
  which the reach of 200 light years draws at an opacity of **0.33**.

  The offset of 5 light years is what separates the two reaches. The four corners then sit
  at 7.1, 95.1, 95.1 and 134.4 light years, so the old reach of 1.2 spacings, 120 light
  years, named three of them and left the quadrant beyond the cursor with no number. An
  offset of 20 light years would put the furthest corner at 113, inside the old reach as
  well, and the scenario would pass before the change and after it.

  The cap of 8 holds all four. Eleven of the 25 candidates lie inside the reach, and the
  four corners of the cursor's own cell are the first, second, third and sixth nearest, so
  the cap takes none of them. The level draws at its full 0.45 alpha at that zoom, 467 CSS
  pixels of spacing on the screen, so the alpha gate takes none of them either

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
  channel of `rgb(140, 235, 240)`, and neither label carries a pure black edge.

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

#### Scenario: A label carries a stroke and no shadow

- **WHEN** the browser test turns the grid on at a zoom of 1,000 light years and reads the
  computed `text-shadow`, `-webkit-text-stroke-width`, `-webkit-text-stroke-color` and
  `paint-order` of every coordinate label
- **THEN** every label reads `none` for the shadow, `2.5px` for the stroke width, a stroke
  colour within 2 on each channel of `rgba(2, 12, 20, 0.9)`, and `stroke` or `stroke fill`
  for the paint order, which is what puts the stroke under the glyph.

  The two paint order strings are one value. `stroke fill markers` is the full order, so a
  browser may drop the keywords the order implies: Chromium serialises the computed value
  as `stroke` and the style the element carries is `stroke fill`. The scenario reads the
  computed property, so it takes either

## ADDED Requirements

### Requirement: The grid and its labels draw from under the plane

The camera pitch runs from -89 to 89 degrees, which `map-navigation` states. The coordinate
grid, its crossing labels and the cursor marker SHALL draw at a **negative** pitch as they
draw at the positive pitch of the same size.

**The grid's ray SHALL meet the plane in both directions.** A fragment sends a ray from the
camera through its own pixel. Above the plane the ray that meets it points down, and under
the plane it points up. The pass SHALL take the meeting where the ray runs **toward** the
plane, whichever side the camera is on, and SHALL treat a ray that runs away from the plane
as a miss, as it does now.

**A plane element SHALL be kept on either winding.** `plane-overlay` owns that rule and
states it: the quad's signed area is compared against the side of the plane the camera is
on, so an element seen from under the plane is not dropped for reading the other way round.
This capability does not restate it.

**At a pitch of 0** the camera lies in the plane. Every ray of the frame then meets the
plane at the camera itself, so the grid covers no pixel, and a plane element whose projected
area is 0 is dropped. That is the projection and not a rule of its own, and the map SHALL
NOT hold a dead band around 0: half a degree off the plane the grid is back.

**A label SHALL be turned to face the reader under the plane.** A label lies on the plane,
so a reader under the disk would see its face from behind and its text would run backwards.
`plane-overlay` owns the rule and states it: the element is painted on the other face of the
plane. The label still lies flat on the plane and reads the same way round from either side.
The label's own top left therefore takes the corner at the low `x` and the high `z` of its
plane rectangle above the plane, and the corner at the low `x` and the low `z` under it. The
corner is named by the axes and not by its distance from the camera, because which of the
two is the far one follows the yaw. At a yaw of 0 the first is the far corner. The grid lines themselves carry no text and need no
turn.

The frame cost under the plane SHALL be the cost above it. The label sweep runs when the
frame holds the horizon, and a frame at a pitch of -20 degrees holds as much of the plane as
one at +20 degrees, so the pitch range adds no work.

#### Scenario: The grid draws under the plane

- **WHEN** the browser test turns the grid on at a pitch of **-45 degrees** at a zoom of
  1,000 light years, draws a frame, and reads the grid vertex count and the drawn pixels
- **THEN** the frame differs from the same frame drawn with the grid pass off, and the grid
  spacing reading is the same as at a pitch of +45 degrees

#### Scenario: Crossing labels draw under the plane

- **WHEN** the browser test turns the grid on at a pitch of **-45 degrees** at a zoom of
  1,000 light years, draws a frame and reads the crossing labels, then does the same at
  **+45 degrees**
- **THEN** both readings hold at least one label, and the two counts are equal

#### Scenario: The cursor marker draws under the plane

- **WHEN** the browser test reads the cursor marker's screen bounding box at a pitch of -30
  degrees and at +30 degrees, at the same zoom and yaw
- **THEN** both boxes are present, and their widths agree within 2 per cent

#### Scenario: A coordinate label reads the same way round from either side

- **WHEN** the browser test reads one crossing label's text and the screen position of its
  own top left at a pitch of -45 degrees and at +45 degrees, at the same zoom and yaw
- **THEN** the text is the same at both, and the top left lands on a different corner of the
  label's plane rectangle, which is the turn that keeps the text the right way round

  The screen alone cannot name the corner, because the turn is what keeps the label looking
  the same from either side. `plane-overlay` names it in a unit test.

#### Scenario: The grid is edge-on at a pitch of 0

- **WHEN** the browser test sets a pitch of 0 degrees at a zoom of 1,000 light years with
  the grid on, draws a frame, and then draws one at a pitch of 0.5 degrees
- **THEN** the frame at 0 draws without error and its grid pixels lie inside a band 4 CSS
  pixels tall, which an empty frame meets, and the frame at 0.5 degrees holds the grid on
  more than 20 rows, which is the reading that says there is no dead band

#### Scenario: The label sweep costs the same under the plane

- **WHEN** the browser test resets the label sampling, draws **300** frames at a pitch of
  -20 degrees at 1920x1080, reads the sampling, then does the same at +20 degrees
- **THEN** the two mean sweep times agree within 20 per cent

The count is 300 and not 60 because the sweep costs about 0.2 milliseconds a frame and the
browser's clock steps by 0.1. Over 60 frames the run-to-run gap between the two pitches
was measured at 0.8, 2.4, 8.1 and 20.1 per cent, which puts the bound on the noise floor.
Over 300 frames the same four runs gave 0.9, 8.1, 0.9 and 1.7 per cent.
