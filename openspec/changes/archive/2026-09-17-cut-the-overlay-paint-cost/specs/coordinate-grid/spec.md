## MODIFIED Requirements

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

The gap is 0.04 of a spacing, which is about one cap height: the cap height is the lesser of
one tenth of the spacing and the height that holds `x : y : z` to 0.6 of a spacing, which is
about a twenty-third of the spacing. At the 1,000 light year level the gap is 40 light years.

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
- **THEN** the first reading is **0.55** within 0.02 and the second is 1 within 0.02

#### Scenario: No label stands past the reach

- **WHEN** the browser test turns the grid on at the 100 light year level at a pitch of 89
  degrees and reads every crossing label's text and the distance on the plane from the
  cursor to the crossing it names
- **THEN** every distance is below 200 light years, and at least one label is present

#### Scenario: A label is no wider than the cell it names

- **WHEN** the browser test reads the screen width of every crossing label's transformed quad
  and the level's own spacing on the screen at the same crossing, at zooms of 150 and 1,000
  light years
- **THEN** every label's width is at or below **0.6** of its level's spacing, and at least
  one label is above **0.4** of it, so the rule bounds the label without making it
  unreadably small

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
