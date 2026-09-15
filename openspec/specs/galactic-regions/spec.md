## Purpose

Names the part of the galaxy the view sits in. The 42 galactic codex regions draw
their boundaries on the galactic plane and carry a text label each, so the user can
tell the Inner Orion Spur from the Galactic Centre without leaving the map.

## Requirements

### Requirement: The region data comes from the almanac

The map SHALL read the 42 galactic codex regions from
`@elite-dangerous-almanac/core`, pinned to an exact version. Each region SHALL carry an
id from 1 to 42, a name, a footprint area, axis-aligned bounds on the galactic plane
and a centroid on the galactic plane. A plane position SHALL resolve to one region or
to none, on the grid of 4,096/83 light years the game uses.

The map SHALL depend on two constants of the package: the galaxy origin
(-49,985, -40,985, -24,105) and the sector edge of 1,280 light years. A unit test SHALL
assert both, so a release of the package that changes them fails the suite rather than
the map.

#### Scenario: The region list

- **WHEN** a unit test reads the region list
- **THEN** it holds 42 regions, their ids run from 1 to 42 without a gap, and every
  name is a non-empty string

#### Scenario: Known positions resolve

- **WHEN** a unit test resolves the regions at (0, 0, 0) and at (15, -35, 25,895)
- **THEN** the first is `Inner Orion Spur` and the second is `Galactic Centre`

#### Scenario: The package constants hold

- **WHEN** a unit test reads the galaxy origin and the sector edge from the package
- **THEN** the origin is (-49,985, -40,985, -24,105) and the edge is 1,280 light years


### Requirement: The boundary set is traced from the region grid

The map SHALL build the region boundary sets off the main thread. The build SHALL
resolve the region at the centre of every cell of the 49.3494 light year grid over the
model bounds in `x` and `z`, which is 2,027 by 2,027 cells, and SHALL emit a line
segment on the edge between two neighbouring cells that hold different region ids. A
cell that resolves to no region SHALL count as an id of its own, so the rim of the
mapped grid draws.

The unit edges SHALL then be linked into **chains**. A chain SHALL follow the boundary
through every lattice node that carries exactly two edges, and SHALL end at a node that
carries any other number, which is a node where three or more regions meet. Each chain
SHALL therefore separate exactly one pair of region ids, and no edge SHALL belong to two
chains.

The build SHALL emit **two** sets from that one trace, and SHALL emit them in one message:
the **smoothed set** the `simplified` mode draws and the **traced set** the `accurate`
mode draws. One trace serves both, so the second set costs the region lookups nothing.

**The traced set.** Each chain SHALL be packed as it was traced, with no average, no
vertex reduction to a tolerance and no corner rounding. A run of unit edges that continue
in the same direction SHALL be packed as one segment, because the middle nodes of such a
run lie exactly on the line between its ends. The packed line SHALL therefore pass through
every lattice node where the traced boundary turns, and its departure from the traced
boundary SHALL be **0** to the resolution of a `float32` coordinate.

The traced set is the staircase the region data is. Its turn measures 1,062.75 degrees for
each 1,000 light years of drawn length over the whole set, and its vertices turn by 90
degrees. Both bounds the smoothed set holds are therefore broken on purpose, and no bound
on turn applies to this set.

Collapsing the straight runs SHALL take the set to **between 15,000 and 40,000 vertices**,
which is at most 469 KiB, so it uploads once as the smoothed set does. On the pinned
version of `@elite-dangerous-almanac/core` the trace holds 38,686 nodes and the set holds
22,718 vertices, which is 266.23 KiB, so the traced set is the smaller of the two. The
bound is a range and the two figures are a reading, as they are for the smoothed set: the
region cells come from the pinned package, so a release that redraws a region moves both
readings without any defect in this map. The scenario "The package constants hold", of the
requirement "The region data comes from the almanac", is where a package release is meant
to fail the suite.

**The smoothed set.** Each chain SHALL be smoothed, and the smoothing SHALL meet three
bounds at once.

The drawn chain SHALL stay within **one grid cell, 49.3494 light years**, of the traced
boundary, measured both ways: every point of the drawn chain is within that distance of
the traced boundary, and every point of the traced boundary is within that distance of
the drawn chain. One cell is the resolution of the source raster, so the line claims no
accuracy the data does not have.

The drawn set SHALL also read as a line and not as a staircase. The measure is the sum
of the absolute turn angle at the vertices, for each 1,000 light years of drawn length,
and it SHALL meet two bounds:

- Over the whole set, taking the total turn over the total length, **at most 60 degrees
  for each 1,000 light years**.
- For **each chain on its own**, taking that chain's turn over that chain's length, at
  most **100 degrees for each 1,000 light years**.

The second bound is needed because the first is length-weighted, so the few longest
chains set it and a short chain could wander freely inside it. The user looks at one
boundary at a time, so the property has to hold for one boundary at a time.

The traced staircase measures 1,062.75 degrees per 1,000 light years over the whole set.
A rule that only rounds the corners of the staircase does not meet either bound: it
leaves the direction changes in place. The bounds are what separate a smoothed line from
a rounded staircase, and they are the reason the departure bound is one cell rather than
half of one. At a zoom of 500 light years one CSS pixel is 0.53 light years, so half a
cell is already 47 pixels; tightening the departure below the resolution of the data buys
nothing there and costs the straightness the user sees. The `accurate` mode is what serves
a user who wants the departure at 0 and will take the steps for it.

The drawn line SHALL also carry no visible corner. **No vertex of a drawn chain SHALL
turn by more than 20 degrees.** The two bounds above measure how far the line wanders
over a distance; this one measures the line at a single point, and it is a separate
property. A line can hold both of the bounds above and still read as a polygon: measured
on a build that met them, the segments had a median length of 284 light years and 377
vertices turned by more than 20 degrees, the worst by 98.4. At the closest zoom a 284
light year segment crosses more than a frame, so such a vertex reads as a hard corner
rather than as a curve.

Both sets SHALL be typed arrays only and transferable without copying. Each SHALL hold
the vertices of every chain in one array of three `float32` per vertex, with the first and
last index of each chain, so a vertex shared by two segments is stored once. Both SHALL
hold the same chain count, so a chain of one set is the same boundary as the chain of the
same index in the other.

#### Scenario: The boundary is a small number of chains

- **WHEN** a unit test builds the two boundary sets
- **THEN** each holds between 100 and 200 chains, the two counts are equal, and every
  chain of each has at least two vertices

#### Scenario: A chain separates one pair of regions

- **WHEN** a unit test walks every chain of the untouched trace and reads the pair of
  region ids on the two sides of each of its edges
- **THEN** every edge of a chain carries the same pair, and no two chains share an edge

#### Scenario: The drawn line stays near the boundary

- **WHEN** a unit test measures, for every chain of the smoothed set, the largest distance
  from a point of the drawn chain to the traced boundary and the largest distance from a
  point of the traced boundary to the drawn chain
- **THEN** both are at most 49.3494 light years

#### Scenario: The traced set departs by nothing

- **WHEN** a unit test measures the same two distances for every chain of the traced set
- **THEN** both are 0 within 0.01 light years. The packed set holds `float32` coordinates,
  and one step of a `float32` near 50,000 is 0.0078 light years, so a node lands up to half
  a step from where the trace put it and the departure of an exact packer is a fraction of
  one step rather than 0. On the pinned package the reading is 0.0040

#### Scenario: The traced set keeps every turn

- **WHEN** a unit test adds the absolute turn angle at every vertex of the traced set and
  divides by its drawn length
- **THEN** the ratio equals the ratio of the untouched trace within 1e-6 of it, so
  collapsing the straight runs removed no turn, and it is above 1,000 degrees for each
  1,000 light years. The bound is relative because the two readings part only by the
  `float32` rounding of the packed coordinates. On the pinned package the reading is
  1,062.75

#### Scenario: The traced set drops the straight runs

- **WHEN** a unit test reads the vertex count of the traced set and the node count of the
  untouched trace
- **THEN** the set holds between 15,000 and 40,000 vertices, it holds fewer than the trace
  has nodes, and it is smaller than the smoothed set. On the pinned package the readings
  are 38,686 nodes and 22,718 vertices, which is 266.23 KiB

#### Scenario: The drawn line reads as a line

- **WHEN** a unit test adds the absolute turn angle at every vertex of every chain of the
  smoothed set and divides by the drawn length of the whole set, and then measures the same
  ratio for each chain on its own
- **THEN** the whole set is at most 60 degrees for each 1,000 light years, no single
  chain is above 100, and the same whole-set measure over the traced staircase is more
  than 1,000

#### Scenario: The drawn line carries no visible corner

- **WHEN** a unit test measures the turn angle at every vertex of every chain of the
  smoothed set
- **THEN** no vertex turns by more than 20 degrees

#### Scenario: The set is small enough to upload once

- **WHEN** a unit test reads the vertex count of the smoothed set
- **THEN** it is between 20,000 and 120,000 vertices, which is at most 1.4 MiB of vertex
  data. Holding the corner bound costs vertices, because a corner is only removed by
  putting points around it. A set that meets the bounds above needs far fewer vertices than
  a rounded staircase does, because it has far fewer direction changes to carry. The floor
  guards against a set so reduced that it holds the departure bound only by cutting chains
  to a few long chords; the departure bound alone does not catch that, because a chord
  across a gentle curve can stay inside one cell

#### Scenario: The set is deterministic

- **WHEN** a unit test builds both boundary sets twice
- **THEN** the arrays of each build are byte-identical to the arrays of the other

#### Scenario: The set is transferable

- **WHEN** a test posts both boundary sets through a `MessageChannel` with their buffers in
  the transfer list
- **THEN** the receiver gets equal contents for both and every sender buffer has length 0

### Requirement: The boundaries draw on the galactic plane in a zoom band

The boundary chains SHALL draw as lines on the plane `y = 0`, after the tone map, so no
look constant of the far view changes them and none of them changes the far view. They
SHALL be drawn camera-relative, as every other pass is.

Which set draws SHALL follow the region mode: the smoothed set in `simplified`, the traced
set in `accurate`, and neither in `off`. Both sets draw through the same pass, with the
same width, the same two tones and the same join rule, so the mode changes where the line
sits and nothing else about it.

A line SHALL be drawn in the width the screen sees, not in the width the card's default
line gives: a core of 2 CSS pixels, with an outline of 1 CSS pixel on each side, so the
whole line is 4 CSS pixels whatever the device pixel ratio is. The core SHALL be the
lighter colour and the outline SHALL be the darker one.

**The two tones are washed out.** The core SHALL be `(0.505, 0.658, 0.853)` and the
outline `(0.125, 0.172, 0.267)`, and the opacity SHALL be **0.42**. Each tone is a third
of the way from where it was toward the average of the two, and the opacity fell from
0.55. The overlay's own contrast, the core's luminance less the outline's, times the
opacity, therefore falls from 0.389 to 0.198, which is 51 percent of what it was. The
wash is what makes the `accurate` staircase read as a soft edge rather than a row of
steps; the line keeps its hue and still reads as a boundary.

The consequence to know: the outline no longer darkens every background. Its luminance
rose from 0.051 to 0.169, so over the dark space between the arms, where the frame reads
below about 0.17, the outline now lightens the pixel rather than darkening it. It still
darkens the bright disc, and it is still darker than the core everywhere, which is what
makes the line read as a line.

The fade adds one channel to the coverage buffer and one interpolation to each fragment.
The overlay SHALL stay inside the frame budget `real-systems` states, which the browser
suite already measures at a 20,000 light year view with a full set.

Where two segments of a chain meet, the line SHALL NOT be brighter than a straight run of
the same chain, and SHALL show no gap. A join is where a naive draw of one quad per
segment shows its seams: the two quads overlap, and drawn straight onto the frame the
overlap blends twice. The rule SHALL hold for the traced set as well, whose joins are 90
degree corners and are the hardest case the pass draws.

The lines SHALL fade in as the zoom distance falls: nothing at 30,000 light years and
above, full at 20,000 and below.

**A line fades out as the camera comes near it.** The fade SHALL be worked out for each
pixel of the line, from the distance between the camera and the nearest point of the
segment that pixel draws, in light years: nothing at **200** light years and below, full
at **1,500** and above, on a smooth step between. The fade multiplies the zoom fade.

The fade is per pixel and not per chain, so one line that runs from under the camera out
to the horizon fades along its length rather than all at once. This is what the camera
approaching a boundary shows: the line goes before the camera reaches it.

This **reverses** the decision phase 3.1 recorded. That phase held the line to the closest
zoom, so a user at 10 light years could see which side of a boundary a system sat on.

What the fade takes away is the line **near the camera**, and not the whole overlay at a
close zoom. A line far across the frame still draws, which is what the per-pixel rule is
for. The zoom at which the whole frame goes empty is the zoom at which every plane point in
it is inside 200 light years. At the default pitch of 35 degrees and a 60 degree vertical
field of view, the top of the frame looks 5 degrees below the horizon, so it shows plane
points about 11.4 times the camera's height above the plane: about 65 light years at a zoom
of 10, about 990 at a zoom of 150, and about 3,300 at a zoom of 500. The overlay is
therefore empty at a zoom of 10, and at a zoom of 500 it is faint under the cursor and full
at the top of the frame.

What is bought for it is that the `accurate` staircase, whose 49.3494 light year step is
about 4,600 CSS pixels at a zoom of 10 and 1,080 rows, is never on the screen at the zoom
where it is worst. The browser suite runs at 1280x720, where the same figures are two thirds
of these.

**The chosen views are constants and they move.** `tests/region-views.ts` searches the
boundary set for the views the scenarios above open, and `e2e/region-views.ts` holds what it
found. Two of them sit at a zoom of 500 light years, where the near fade now draws nothing,
so they SHALL be searched again at a zoom where the camera is 1,500 light years or more
from the place the scenario reads. The crossing view sits at 1,875 and is already above
that.

The region labels SHALL NOT take this fade. A label is placed at a point inside its own
region, and the camera is always near the region it is looking into, so a near fade on the
labels would empty the overlay of names at every close zoom. Labels keep the zoom fade
alone, which the requirement "A region in view carries a label" states.

#### Scenario: Nothing at the far view

- **WHEN** the browser test renders the default view at 1280x720 with the region
  overlay on, and again with it switched off
- **THEN** the two image files are byte-identical

#### Scenario: A boundary is visible at medium zoom

- **WHEN** the browser test opens a view at 10,000 light years centred on a plane point
  that a unit test has found within 25 light years of a boundary chain, and reads the
  luminance at the projection of that point and at the projection of a plane point
  1,000 light years away from any chain
- **THEN** the first reading is at least 0.05 above the second, and with the overlay
  switched off the two readings differ by less than a fifth of the difference with it on

#### Scenario: The boundary still draws at the closest zoom

- **WHEN** the browser test opens at 4,000 light years and at 1,500, with the overlay on
  and again with it off, in each of `simplified` and `accurate`, centred on a plane point a
  unit test has found **on** a chain of **both** sets
- **THEN** at both distances and in both modes the frame with the overlay differs from the
  frame without it.

  1,500 light years is now the closest zoom at which the line draws in full. The centre has
  to be on both sets and not only on the traced one, because the smoothed line may sit
  49.3 light years from the traced one. The two lines coincide over most of their length, so
  such a point exists: the search gives a point on a traced segment within half a light year
  of the smoothed set

#### Scenario: The boundary fades out as the camera comes near

- **WHEN** the browser test opens the view of the scenario above at 1,500 light years, at
  500 and at 150, with the overlay on and again with it off, in each of `simplified` and
  `accurate`, and reads the overlay's own contribution as the **largest** difference within
  8 CSS pixels of the projection of the centre, the frame with the overlay less the frame
  without it
- **THEN** in both modes the contribution at 500 is below a third of the contribution at
  1,500 and above zero, and at 150 it is zero.

  The centre sits **on** a chain of both sets, which is what the scenario above states and
  what the search gives. A centre merely within 25 light years of one would be 47 CSS pixels
  from the line at a zoom of 500 against a line 4 pixels wide, and a reading beside the line
  would report zero for the wrong reason. The reading
  is a search within 8 CSS pixels of the projection, which covers the line's own width and
  the rounding, as the existing suite already searches near a point.

  The reading is near the cursor, which is the point the camera is 150 or 500 light years
  from. The frames are not byte-identical at 150: the top of the frame shows plane points
  about 990 light years away, and the line still draws there. Only a view straight down
  empties the whole frame

#### Scenario: One line fades along its own length

- **WHEN** the browser test opens a view at 3,000 light years and a pitch of 5 degrees, a
  unit test having chosen the cursor and the yaw so that one chain runs from the lower edge
  of the frame to the cursor, and reads the overlay's own contribution at the pixel where
  the chain crosses the lower tenth of the frame and at the pixel of the cursor
- **THEN** the contribution at the lower edge is below a third of the contribution at the
  cursor, and both are on the same chain

#### Scenario: The line is four CSS pixels wide and two-toned

- **WHEN** the browser test opens a view in which the camera is **1,500 light years or
  more** from the place it reads, so the near fade is full there, a unit test having chosen
  the view so that a boundary chain
  crosses the frame within 5 degrees of vertical, reads one horizontal row of pixels
  across it, converts the run from device pixels to CSS pixels by the device pixel ratio,
  and compares it with the same row with the overlay off, in each of `simplified` and
  `accurate`
- **THEN** in both modes the run of changed pixels is 4 CSS pixels wide within 1 CSS pixel,
  the middle of the run is lighter than both ends, and every pixel of the run differs from
  the same pixel with the overlay off.

  The ends are no longer held to be darker than the frame under them. The washed outline
  reads at a luminance of 0.169, so over the dark space between the arms it lightens the
  pixel. What holds everywhere is that the middle is lighter than the ends

#### Scenario: A join is not brighter than the line

- **WHEN** the browser test opens a view in which the camera is **1,500 light years or
  more** from the bend, so the near fade is full there, a unit test having chosen the place
  so that the drawn line **turns by at least 30 degrees within a reach of 8 CSS pixels**,
  and reads the luminance of every pixel the overlay changes within 8 CSS pixels of that
  place
- **THEN** taking each pixel's change as the frame with the overlay less the frame
  without it, no pixel at the bend has a larger change than the largest change on a
  straight run of the same chain in the same frame, and no pixel inside the bend is
  unchanged.

  The bend is measured over a reach and not between two neighbouring segments, because
  the requirement above holds every single vertex of the smoothed set to 20 degrees, so no
  two neighbouring segments of it can meet under 160 degrees. That does not make the join
  weaker as a test: it makes it stronger. The median segment of the drawn set is 5.09 light
  years, which is 2.0 CSS pixels at a zoom of 1,600 light years and 1280x720, against a
  line 4 CSS pixels wide, so the ribbon quads of a bend overlap more than they did when a
  bend was one sharp corner. The view is at 1,600 and not at the 500 it was, because the
  near fade draws nothing at 500. The comparison is of the overlay's own contribution, because the overlay
  draws at less than full opacity and the galaxy under a corner can be brighter than the
  galaxy under a straight run

#### Scenario: A 90 degree corner of the traced set is not brighter than its line

- **WHEN** the browser test sets the mode to `accurate`, opens a view a unit test has
  chosen at a lattice node where the traced line turns by 90 degrees, at a zoom of **1,600
  light years**, where the camera is 1,600 light years from the node so the near fade is
  full there and a 49.3494 light year segment is 19.2 CSS pixels at 1280x720, which is
  longer than the 8 CSS pixel read radius, and reads the overlay's own
  contribution at every pixel within 8 CSS pixels of the node
- **THEN** no pixel at the corner has a larger contribution than the largest contribution
  on a straight run of the same chain in the same frame, and no pixel inside the corner is
  unchanged

### Requirement: A region in view carries a label

The page SHALL draw region labels as text over the canvas. A region SHALL be a candidate
for a label when it covers enough of the frame to be worth naming, measured by sampling.

The page SHALL sample the frame on a grid of screen points, resolve the plane point
under each one at `y = 0`, and read the region that holds it from a region grid the
scene data carries. A region SHALL be a candidate when it holds at least 1 percent of
the samples that fall on the plane inside the model bounds. A region that holds no
sample SHALL NOT be a candidate, whatever its bounds are.

A region that carried a label in the frame before SHALL stay a candidate until its share
falls below **half** that threshold. Without this a region sitting on the threshold
enters and leaves the candidate set between frames, and its label blinks.

A label's anchor SHALL be worked out **on the galactic plane and then projected to the
screen**, not worked out on the screen. The sample points are a grid that is fixed in
screen space, so any position averaged or chosen in screen space changes only when a
sample crosses a region edge: it holds still and then steps. The plane position under a
sample moves with the camera, so a position worked out from those moves with the camera
too, and its projection slides rather than steps.

**A label belongs at the centre of its region.** A label's target SHALL be the region's
own centroid on the galactic plane, while the region under that centroid is that region
and while the centroid projects inside the frame with the 48 CSS pixel label inset. The
inset is the room the label box needs, and it is the same figure the anchor is held
inside, so the target is the centre exactly while the centre has room for the label.

The centroid is one fixed point of the galaxy. Nothing about the frame goes into it, so a
label on it does not move over the map at any camera speed: its projection slides with the
camera, and nothing else moves it. At a view of the whole galaxy 11 of the 20 labels sit on
the centre of their region, and over a drag of 90 frames every one of the 512 readings of a
label on its centre holds the same plane point as the frame before, to the last digit.

**Where the centre has no room, the label SHALL move the least it can.** This rule SHALL
apply only while the centroid projects **inside the frame**. Outside the frame the rule
says nothing useful: holding a projection that is far away inside the inset gives a corner
of the frame, and a corner carries nothing about where the region is. The frame then shows
only a part of the region, and the rule below answers that case.

The page SHALL hold the projection of the centroid inside the inset and read that held
point back to the plane. When the region under the read-back point is the label's own
region, that point SHALL be the target. This is the shortest move on the screen that gives
the label room.

When the read-back point is over another region, the page SHALL search out from the
**projection of the centroid** on rings of **12, 24, 48 and 96 CSS pixels**, twelve
directions to a ring, and take the first point that is on the label's own region and
inside the inset. The rings are a coarse step and not the least move: a point on the
region at 60 pixels is skipped, and the point at 96 taken. Four rings hold the worst
reading of the measure to 4.7 CSS pixels, so a finer step buys nothing a reader can see. The search SHALL measure on the screen and not on
the plane: at a low pitch one light year across the screen is many light years up it, so a
point near on the plane can be far on the screen, and the rule is about the screen.

The search SHALL stop at **96 CSS pixels**. A region can reach into the inset band at the
edge of the frame, and the point of it that is both on the region and inside the inset can
be hundreds of pixels along that band. To move the label there costs more than it gives:
the label leaves the middle of its region for a corner of the frame. Where no point that
near holds the label, the target SHALL stay the centroid, and the box rule below moves the
box itself into the frame. The label then touches the frame edge, stays on the middle of
its region and stays readable.

**Where the centre does not project inside the frame, the label SHALL go to the part of
the region the frame shows.** The target SHALL be the mean of the plane positions of the
samples its region holds, or, when the region under that mean is another region, the plane
position of the sample its own region holds nearest that mean. A region under the camera
fills the whole frame, and the middle of the frame is where its label belongs.

Over a view in which regions reach past the frame, the displaced target measures **4.7 CSS
pixels** from the projection of the centroid at worst. An earlier rule that measured
nearness on the plane moved one such label **192 CSS pixels** sideways to hold a 29 pixel
move down, which reads as the label leaving its region.

Reading the frame's samples is what makes a label move while the camera moves, because the
sample grid is fixed on the screen and slides over the plane. The centre rule is there so
that a label whose region has room for it reads none of that.

**The label box SHALL NOT cross the edge of its own region.** A box that crosses the edge
reads as naming the region beside it. The box is a screen thing and the target is a plane
point, so the page SHALL read the plane step of one screen pixel across and one down, and
then move the target in those two directions. Six points of the box SHALL be tested
against the region: the four corners and the middle of the top and the bottom edge. The
search SHALL grow its step over five passes and try twelve directions at each, SHALL take
the point that leaves the fewest points of the box off the region, and SHALL stop as soon
as none are. Every candidate SHALL sit on the region and project inside the frame, so the
search never moves a label off its region or off the screen.

A region narrower on the screen than the label is wide has no point that holds its box.
At a view of the whole galaxy 1 of 12 boxes still crosses, at a wide view 2 of 12, and at
two closer views none. To hold those as well needs the label to get smaller, which this
change does not do.

The anchor SHALL move in every frame in which the camera moves, and SHALL NOT snap to the
grid of sample points. While a region shows as one connected patch and its anchor has
settled on the target, a camera turn of 0.1
degrees between two frames SHALL move its anchor, and SHALL move it by less than 8 CSS
pixels. The bound is read on a settled anchor because the filter above adds up to 20 CSS
pixels of its own while a label is still going to a target that moved.

Both halves are needed. A rule that snaps to the nearest sample moves the anchor a whole
sample spacing at once, 32 CSS pixels, which the upper bound catches. A rule that
averages sample positions in screen space passes that upper bound easily, at a worst move
of 1.0 CSS pixels, and still reads as jumping, because the anchor is unmoved in 58
percent of frames and carries the whole motion in the rest. Only the lower bound catches
that one.

**The target SHALL be smoothed before the anchor follows it.** The target of a frame is
the mean above, or the fallback above. A region that carried a label in the frame before
SHALL carry the smoothed target it used into this frame, and the smoothed target of this
frame SHALL be the carried one moved a share of the way to the frame's own target, in
plane coordinates.

The carried target SHALL be dropped, and the frame's own target taken whole, when it no
longer resolves to its region and when it goes out of reach of the frame. The reach is the
frame grown by **a quarter of the frame** on each side, which is the reach the carried
anchor takes below. A zoom magnifies the view, so a point on the centre of its region can
go off the frame while the region itself stays in view; a target further out than the
reach is stale.

**The share SHALL grow with the screen gap between the two targets.** For a gap of `gap`
CSS pixels the share SHALL be `0.15 + 0.85 * min(1, gap / 120) ** 3`. At the gap the
sample grid gives a still region the share is near 0.15, and the smoothed target holds
about seven frames of the target. At **120 CSS pixels** the share is 1 and the frame's own
target is taken whole: above that figure the target has really moved, and the label must
go there at once.

The share SHALL follow the **cube** of the reach, and not the reach itself. A share that
follows the reach gives too much of a gap of 30 or 60 pixels to the label at once, and the
worst frame of a drag grows from 5.8 CSS pixels to 10.9. The cube holds the smoothing over
the whole range a drag works in, and opens it only near the figure where the target has
really moved.

The share SHALL grow and SHALL NOT step at one figure. A step is a gate. A gate that fires
puts the label somewhere else in one frame, which is the jump this filter is there to
stop.

Where the smoothed point falls on another region, the carried point SHALL be kept. A
region can show as two separated patches, and the point between this frame's target and
the one before then falls in the gap. Taking this frame's target instead would carry the
label to the other patch in one frame.

**A held anchor goes to its smoothed target at once, and answers the sampling noise
slowly.** A region that carried a label in the frame before SHALL carry its anchor's plane
point into this frame, and that point SHALL then move toward the smoothed target.

The step SHALL be read on the screen and not on the plane, because a plane step of a fixed
size covers a different number of pixels at every zoom. The projection is not linear, so
the share of the plane gap that gives the wanted step SHALL be **solved for**: the page
reads what a share really moved on the screen and corrects it, **up as well as down**,
until the step is the one asked for. A correction that goes downward alone makes the label
crawl near the camera, where the first guess undershoots: over a jump from a camera
distance of 640 to 10 the anchor ran at about a third of the cap and took 52 frames rather
than 25.

For a gap of `gap` CSS pixels between the projection of the carried point and the
projection of the smoothed target, the step SHALL be:

```
min(20, max(min(gap, 0.4), gap * 0.5 * min(1, gap / 48)))
```

That is: **half the gap** at or above a gap of **48 CSS pixels**, falling with the gap
below that, never more than a **20 CSS pixel** cap and never less than a **0.4 CSS pixel**
floor.

**Why both parts are needed.** The anchor is read from a grid of samples that is fixed on
the screen. The grid slides over the plane while the camera moves, so samples cross region
edges and the target of a frame does not move smoothly. Over a drag of 30 light years a
frame at a camera distance of 2000, the target steps 3.3 CSS pixels in a middle frame, and
it changes that step by 2.2 CSS pixels from one frame to the next. A mean of the target
over 20 frames still moves 1.9 pixels a frame, so most of that is not noise to average
away: the visible part of a region really does travel under the camera, and the label must
follow it.

A person reads the change of step from frame to frame, and not the step: a label that
keeps its step slides with the map, and a label that changes it jumps. Taking each frame's
target whole, and moving half of the gap under a 20 pixel cap, changes the step by 1.0 CSS
pixels in a middle frame of that drag and by 3.0 in the worst tenth, and the labels shake.

Speed that falls with the gap takes that to 0.45 and 1.3, because a large gap is a real
move and a small gap is the noise. It cannot go further on its own: the band from 8 to 48
pixels is both the noise the label must ignore and the last part of every relocation, so
more damping there slows every move. Smoothing the target first separates the two. The
anchor then follows a line that already moves smoothly, at the same speed as before, and
the change of step falls to **0.09** and **0.36**. Over a faster drag of 200 light years a
frame at a distance of 20000 it is **0.16** and **0.67**.

The knee is 48 CSS pixels because that is the smallest real move the anchor must answer at
full speed. The floor is there because speed that falls with the gap otherwise takes
hundreds of frames over the last few pixels.

A label pushed to the frame edge by a camera that then jumps back measures 128 CSS pixels
from the middle of its region in the unit test. It is within 8 CSS pixels of that middle at
frame 13, which is 217 milliseconds, and within 2 at frame 26. In the browser the push
leaves the label 70 CSS pixels out and reads **382 milliseconds** to 8 CSS pixels, against
the 400 the browser suite allows. The browser is slower than the unit test because the
camera jump there moves the target as well as the anchor, and the two filters run in
series. The label goes where it belongs and does not crawl.

The filter replaces a hold that kept the anchor where it was for as long as the point still
resolved to the region and still projected inside the frame. What the hold did, and should
not have, was keep a label at the frame edge it had been pushed to long after the region was
back in full view.

**The carried anchor SHALL NOT be dropped for leaving its own region.** The target is
always on its region, so an anchor that walks toward it comes back to the region on its
own. A gate does the opposite of what it is for: it drops the carried point in one frame,
and the label then goes to the target in one step, which is what a person sees as a jump.

**The carried anchor SHALL be dropped only when it goes out of reach of the frame.** The
reach is the frame grown by **a quarter of the frame** on each side. A wheel notch changes
the camera distance by 15 percent in a single frame, which throws the anchor of a label
near the edge a little outside the frame while its region stays in view; the margin keeps
that anchor and the filter walks it back. A camera that jumps to another view leaves the
anchor further out than that, and the label re-places at once.

An earlier gate dropped the anchor at the frame edge itself, with no margin, and fired on
almost every wheel notch.

A region is not always a convex shape, so the straight line from the carried point to the
target can go over a neighbour. The step SHALL get shorter, halving up to six times, to
land on the region where a shorter step does. Where none does, the step SHALL stand: the
anchor comes back to the region as it walks.

A region that carried no label in the frame before SHALL start at the target.

**The drawn anchor SHALL be held inside the viewport, and not inside the inset.** The inset
is where the target rule puts a label that must move. To hold the drawn anchor there as
well pins a label near the frame edge to one place on the screen while the map slides under
it, which reads as the label moving over the map. The box rule moves the box itself fully
into the frame, so a label at the edge stays readable and still slides with its region.

**A zoom SHALL read like a drag.** The measure is how far a label moves from the projection
of its own region centre from one frame to the next, because a label that holds that offset
slides with the map. Over a drag of 60 light years a frame the worst reading is **2.7 CSS
pixels** and the mean is **0.13**. Over 28 wheel notches, each a change of distance of 15
percent in one frame, the worst is **7.0** and the mean **0.49**. Over a wheel held down,
with no still frame between the notches, the worst is **13.2** and the mean **1.40**.

Before these rules the same wheel notches gave a worst reading of **38.3** and the held
wheel **36.9**, and the anchor of one label ran **2,500 CSS pixels** past the frame while
its region stayed in view.

The candidate that holds the sample nearest the centre of the frame SHALL be placed
first, so the region the view is centred on is always named. Ordering by sample count
alone does not do this: at a view of the galactic centre at 1280x720, 24 regions clear
the threshold and 14 of them hold more samples than the `Galactic Centre`, so the cap
below is reached before it. The remaining candidates SHALL be placed in order of the samples they hold, most first,
after the count of a candidate that carried a label in the frame before is multiplied by
**1.2**. The order decides which label the overlap rule drops, so an order that changes
between frames drops a different label each time and the set of labels flickers. The
bonus is a margin and not a priority: a region that now fills the frame still overtakes a
region that is leaving it, which a rule placing every past label ahead of every new one
would prevent. Candidates that are still equal after the bonus SHALL be placed in order
of region id, so the order is total and cannot change between two frames that hold the
same counts.

When no sample lands on the plane inside the model bounds, no label SHALL be placed. A
label whose box would overlap a label already placed SHALL be dropped, and at most 12
labels SHALL be placed.

The sampling SHALL cost, at 1920x1080, less than 2 milliseconds of the main thread as a
mean over 300 frames and less than 4 milliseconds in any single frame. The page SHALL
expose both figures so a test can read them.

Labels SHALL follow the same zoom fade in as the boundaries: none at 30,000 light years
and above, full at 20,000 and below. Labels SHALL NOT fade out at close zoom.

#### Scenario: No label at the far view

- **WHEN** the browser test opens the default view
- **THEN** the page holds no region label

#### Scenario: The core is named

- **WHEN** the browser test opens `#c=15,0,25895&d=20000&p=35&y=0`
- **THEN** a label reading `Galactic Centre` is on the page, its box lies inside the
  viewport, and it is placed even though at least 12 other regions hold more samples

#### Scenario: The region the camera is inside is named at every zoom

- **WHEN** the browser test opens `#c=0,0,0&p=35&y=0` at each of 20,000, 10,000, 4,000,
  1,000 and 500 light years
- **THEN** a label reading `Inner Orion Spur` is on the page at every one of the five
  distances, and its box lies inside the viewport

#### Scenario: A region with nothing on screen carries no label

- **WHEN** the browser test opens `#c=0,0,0&d=500&p=35&y=0`, reads every label on the
  page, and works out for itself which regions the frame shows, by resolving the plane
  point under a grid of screen points against the coarse region grid rather than reading
  the counts the label code made
- **THEN** every label on the page names a region the frame shows, and no label names a
  region it does not

#### Scenario: The camera keeps the label of the region it sits in when it turns away

- **WHEN** the browser test opens `#c=0,0,0&d=500&p=35&y=0`, where every plane sample
  resolves to the Inner Orion Spur, and then `#c=0,0,0&d=500&p=35&y=180`, where the
  camera looks away from that region's centroid and the samples are about 91 percent
  Inner Orion Spur, about 8 percent Sanguineous Rim and about 1 percent Elysian Shore
- **THEN** the first view holds exactly one label, `Inner Orion Spur`; the second holds
  `Inner Orion Spur` as well, because it holds about 91 percent of the samples of that
  frame; and the second view names no region other than `Inner Orion Spur`,
  `Sanguineous Rim` and `Elysian Shore`. Those three are the regions that clear the 1
  percent rule in that frame: the measured shares are 91.3, 7.5 and 1.2 percent. The
  expected names are written out rather than read back from the counts the label code
  itself made, so the test can fail

#### Scenario: A label anchor moves with the camera and does not snap

- **WHEN** a test opens `#c=0,0,0&d=2000&p=35&y=0` at 1920x1080, turns the camera by 0.1
  degrees between frames over 120 frames, and reads the anchor of `Inner Orion Spur` in
  every frame, where that region shows as one connected patch
- **THEN** the anchor moves in every frame, and no frame moves it by 8 CSS pixels or
  more. The vertical field of view is 60 degrees, so at 1080 rows a 0.1 degree turn
  carries a point about 1.6 CSS pixels at the centre of the frame and about 3.4 at its
  side, and the upper bound holds that with room. Two rules fail this scenario. Taking
  the sample nearest the mean moves the anchor 32 CSS pixels at once, which the upper
  bound catches. Averaging the sample positions in screen space passes the upper bound at
  a worst move of 1.0 CSS pixels and fails the lower one, because it leaves the anchor
  unmoved in 58 percent of the frames

#### Scenario: A region in two patches keeps its anchor on itself

- **WHEN** a unit test places a region whose samples fall in two separated patches of one
  frame, so that the mean of its sample positions lies on a different region
- **THEN** the anchor is a sample the region itself holds, it is not the mean, and the
  region under it is that region. Taking the sample nearest the mean without restricting
  it to the region's own samples would put the anchor on the region the mean landed on

#### Scenario: A region on the threshold does not blink

- **WHEN** a unit test runs the placement over consecutive frames in which one region's
  share falls from above 1 percent to 0.7 percent and then to 0.4 percent
- **THEN** the region is a candidate while its share is above 1 percent, it is still a
  candidate at 0.7 percent because it carried a label in the frame before, and it is not
  a candidate at 0.4 percent

#### Scenario: A region entering the frame overtakes one that is leaving

- **WHEN** a unit test runs the placement over consecutive frames of a pan in which a
  region that carries a label falls to 60 percent of the samples of a region that carries
  none
- **THEN** the region that carries none is placed first, because the 1.2 bonus is a
  margin against a swap on a near tie and not a priority that holds a stale label in
  place; and where the two counts are within the bonus of each other the region that
  carried a label keeps its place

#### Scenario: A pushed anchor comes back to the centre at once

- **WHEN** a unit test runs the placement over a camera that jumps in one frame from a
  corner of the frame, where the region's anchor is held against the 48 pixel inset, to the
  middle of the frame, and then over 60 further frames with the camera still
- **THEN** the anchor starts more than 40 CSS pixels from the projection of the region's
  mean, no frame carries it away from that mean, it is within 8 CSS pixels of it **by frame
  15** and within 2 by frame 30, and it moves by no more than 20 CSS pixels in any one frame

#### Scenario: A label sits on the centre of its region

- **WHEN** a unit test reads the labels of a view of the whole galaxy at 1280 by 720, and
  for each one works out whether its region's centroid sits on that region, projects inside
  the frame with the 48 pixel inset, and holds the label box
- **THEN** every label whose centre has that room takes the centroid itself as its target,
  to the last digit, and more than half of the labels of the frame do

#### Scenario: A label whose centre has no room goes to the visible part

- **WHEN** a unit test reads the labels of a view at a camera distance of 800 inside the
  galactic centre, where a region reaches well past the frame
- **THEN** each label whose centre has no room takes a target that is not the centroid,
  that sits on its own region, and that projects inside the frame

#### Scenario: A label whose centre is outside the frame goes to the visible part

- **WHEN** a unit test places the label of the region the camera sits in at a camera
  distance of 10, where the region fills the frame and its centre projects far outside it
- **THEN** the label sits near the middle of the frame, on the mean of the region's own
  samples, and not against an edge of it

#### Scenario: A label reaches its place after a view jump

- **WHEN** a unit test settles the label of `Inner Orion Spur` at a camera distance of 640,
  then jumps the camera to a distance of 10 and runs the placement on
- **THEN** the anchor is within 8 CSS pixels of its target by frame 25. A step corrected
  downward alone ran at about a third of the cap and took 52 frames

#### Scenario: A displaced label moves only a little

- **WHEN** a unit test reads the labels of a view of a corner of the galaxy at a camera
  distance of 9000, where regions reach past the frame, and for each label whose centre has
  no room but still projects inside the frame reads how far its target is from the
  projection of the centroid
- **THEN** no target is more than 6 CSS pixels from the centre, and the worst reading is
  4.7 CSS pixels

#### Scenario: The label box stays inside its own region

- **WHEN** a unit test places the labels of four views, from the whole galaxy to a camera
  distance of 800, and tests six points of each label box against the region grid
- **THEN** at most 2 of the 12 boxes of any view cross the edge of their own region, and
  every one that does belongs to a region narrower on the screen than the label is wide

#### Scenario: A label on its centre does not move over the map

- **WHEN** a unit test runs the placement over 90 frames of a drag of 200 light years a
  frame at a camera distance of 20000, and reads the plane point of every label whose
  target is its region's centroid
- **THEN** every one of the 512 readings holds the same plane point as the frame before, to
  the last digit, and none moves

#### Scenario: A zoom reads like a drag

- **WHEN** a unit test reads, for every label, how far it moves from the projection of its
  own region centre from one frame to the next, over a drag of 60 light years a frame, over
  28 wheel notches of 15 percent each with 6 still frames between them, and over the same
  28 notches with no still frame between them
- **THEN** the drag moves a label by less than 8 CSS pixels at worst, the notches by less
  than 12 at worst and less than 1 on the mean, and the held wheel by less than 20 at worst
  and less than 2 on the mean

#### Scenario: A label that must really move does not crawl

- **WHEN** the camera jumps and the label of a region starts about 70 CSS pixels from the
  middle of its region
- **THEN** the label comes within 8 CSS pixels of the middle inside **400 milliseconds**,
  and no frame moves it more than 20 CSS pixels

#### Scenario: The share of the gap follows the gap

- **WHEN** a unit test reads the share for a gap of 4, 30, 90 and 120 CSS pixels
- **THEN** the share at 4 pixels is 0.15 to three places, the share at 30 pixels is under
  0.17, the share at 90 pixels is over 0.4, and the share at 120 pixels is 1

#### Scenario: The label walks smoothly while the camera drags

- **WHEN** a unit test runs the placement over 90 frames of a drag of 30 light years a
  frame across the galactic centre, and over 90 frames of a drag of 200 light years a frame
  at a camera distance of 20000, and reads for every label the length of the change of its
  screen step from one frame to the next, with both ends of each step projected through the
  frame they are read in, leaving out the frames in which a label leaves its region or the
  frame
- **THEN** the step changes by less than **0.2 CSS pixels** in a middle reading and by less
  than **0.7** in the worst tenth, over more than 200 readings of each drag, and no reading
  is over the 20 pixel cap. Taking each frame's target whole under a flat half-gap step
  gives 1.0 and 3.0 on the slower drag

#### Scenario: The filter does not hop between samples

- **WHEN** a unit test runs the placement over 120 frames of a slow pan across a region
  whose two nearest samples to the mean are within 1 light year of each other
- **THEN** the target of a frame moves by less than 1 CSS pixel, because the centre rule
  reads no sample while the centre of the region has room; no frame moves the anchor by
  more than the 20 CSS pixel cap; and the anchor's plane point changes by less than one
  sample spacing in any single frame

#### Scenario: Labels neither crowd nor overlap

- **WHEN** the browser test opens `#c=15,0,25895&d=20000&p=35&y=0` and reads the box of
  every label
- **THEN** there are at most 12 labels and no two boxes overlap

#### Scenario: The sampling stays inside its budget

- **WHEN** the browser test opens `#c=15,0,25895&d=20000&p=35&y=0` at 1920x1080 and reads
  the mean and the worst sampling time the page exposes over 300 frames
- **THEN** the mean is under 2 milliseconds and the worst single frame is under 4

### Requirement: The region overlay has a switch

The renderer SHALL expose a `regions` switch beside the switches for the volume, the
clouds, the points, the glow and the stars. The switch SHALL remove both the boundary
lines and the labels.

#### Scenario: The switch removes both parts

- **WHEN** the browser test opens `#c=15,0,25895&d=20000&p=35&y=0`, takes a screenshot,
  switches the regions off and takes a second screenshot
- **THEN** the page holds no region label after the switch, and the second screenshot
  differs from the first, because the first draws boundary lines

#### Scenario: The switch is inert where nothing draws

- **WHEN** the browser test opens `#c=15,0,25895&d=60000&p=35&y=0`, which is above the
  fade in distance, and takes a screenshot with the regions on and one with them off
- **THEN** the two image files are byte-identical


### Requirement: The region data carries its attribution

The repository SHALL hold a `THIRD_PARTY_NOTICES.md` file that names the source of the
region data and its terms: klightspeed's EliteDangerousRegionMap under MIT for the
region tables, and Frontier Developments' media-usage rules, which are non-commercial,
for the game data behind them. If **either build** carries the package's procedural
naming tables, the file SHALL also hold the BSD 3-Clause text those tables require.

The repository now emits two builds, the library and the demo site, so the search reads
both. The demo site is the one the public loads, and the library is the one another project
installs, so a table that reaches either one reaches a user.

The file SHALL also name the sources the demo site adds: the two further Canonn Research
Group data sets, which `dataset-catalog` lists, and the loading image the demo site serves
from `public/`.

#### Scenario: The notice names every source

- **WHEN** a unit test reads `THIRD_PARTY_NOTICES.md`
- **THEN** it names `EliteDangerousRegionMap`, `MIT`, `Frontier`,
  `@elite-dangerous-almanac/core`, `EDLoader1.svg`, `Guardian Structures` and
  `Notable Systems`

#### Scenario: The bundle carries no unlicensed table

- **WHEN** a test runs `pnpm build` and `pnpm build:demo-site` and searches both outputs
  for the package's procedural naming tables
- **THEN** either the tables are absent from both, or `THIRD_PARTY_NOTICES.md` holds the
  BSD 3-Clause text in full

### Requirement: The region overlay has three modes

The map SHALL expose a region mode with exactly three values: `off`, `simplified` and
`accurate`. `simplified` SHALL be the default.

- `off` SHALL draw no boundary line and place no label.
- `simplified` SHALL draw the smoothed boundary set, which is the set the map draws today.
- `accurate` SHALL draw the traced boundary set, which the requirement below defines. It
  SHALL place the same labels `simplified` places.

`GalaxyMapOptions` SHALL carry an optional `regionMode`. The handle SHALL carry
`getRegionMode()` and `setRegionMode(mode)`. `setRegionMode` SHALL take effect in the next
frame and SHALL NOT rebuild the scene data, because the worker builds both sets in one
pass and the renderer holds both.

A value that is not one of the three SHALL leave the mode unchanged, and `setRegionMode`
SHALL report nothing: the reader of a whole data set reports its rejects, while a mode is
one value the host controls directly.

The `regions` pass switch SHALL stay as it is, a renderer probe the browser tests read. A
switch of `off` and a mode of `off` SHALL draw the same frame, so the two never disagree.

**Where the two sets differ, now that the near fade is there.** The two sets differ in
where the line sits, not in what the data says. The smoothed line may sit up to 49.3494
light years from the boundary the region data holds. **At 1,080 CSS rows** and a 60 degree
vertical field of view, one CSS row covers `1.1547 * distance / 1080` light years, so the
departure in CSS pixels is about `46,157 / distance`: 31 pixels at a zoom of 1,500 light
years, 5.8 at 8,000, 1.8 at 25,000 and 1.5 at 30,000. It falls as the camera pulls back,
and it drops under one CSS pixel above a zoom of about 46,000.

The overlay draws between 1,500 and 30,000 light years, so the departure runs from about 31
CSS pixels at the near end of that band down to about 1.5 at the far end. `accurate` is
therefore worth choosing at the **near end** of the band, from 1,500 to about 8,000 light
years, which is its lower fifth by distance, where the departure is 31 down to 5.8 CSS
pixels and the user sees which line
they are given. Above about 25,000 the two sets draw within 2 CSS pixels of each other and
the mode changes almost nothing on the screen.

This paragraph said before that the close zoom is what makes the difference matter, because
the departure reaches about 4,600 CSS pixels at a zoom of 10 and 1,080 rows. The near fade
takes the line
away where the camera is within 200 light years of it, so at a zoom of 10 the whole frame is
inside the fade and that reading is no longer on the screen. What the mode now answers is
which side of a boundary a **region** lies on at the zoom a user reads the galaxy at, and
not which side one system lies on at the zoom a user reads one system at.
The requirement "The boundaries draw on the galactic plane in a zoom band" records that
trade and why it was taken.

#### Scenario: The default mode is simplified

- **WHEN** the browser test creates a map with no `regionMode` in the options and reads
  `getRegionMode()`
- **THEN** it is `simplified`

#### Scenario: The options choose the mode

- **WHEN** the browser test builds a map through the library entry point with
  `regionMode` of `accurate`, of `off`, of the string `precise`, with an empty options
  object and with no options at all, and reads `getRegionMode()` on each
- **THEN** the readings are `accurate`, `off`, `simplified`, `simplified` and
  `simplified`, so a value the map does not know takes the default as a bad value on
  `setRegionMode` leaves the mode

#### Scenario: Each mode draws its own frame

- **WHEN** the browser test opens a view a unit test has chosen at a 90 degree corner of
  the traced set, at a zoom of 2,000 light years, and takes a digest of the canvas in each
  of the three modes
- **THEN** the three digests differ from one another.

  The view has to sit at a corner. The two sets carry the same line along a straight run
  of the boundary, so a view chosen anywhere else can draw the same frame in `simplified`
  and in `accurate`, and the reading would then say nothing about the mode. 2,000 light
  years is above the near fade band, so the line draws in full

#### Scenario: The off mode removes both parts

- **WHEN** the browser test opens `#c=15,0,25895&d=20000&p=35&y=0`, sets the mode to `off`
  and reads the page and the frame
- **THEN** the page holds no region label, and the frame is byte-identical to the frame
  the same view draws with the `regions` pass switch off

#### Scenario: The mode changes without a rebuild

- **WHEN** the browser test opens a view, sets the mode to `accurate`, draws one frame,
  sets it back to `simplified` and draws one more, and reads how many times the scene data
  loaded
- **THEN** the frames differ, the scene data loaded once, and neither change waited for a
  load

#### Scenario: The labels do not follow the mode

- **WHEN** the browser test opens `#c=15,0,25895&d=20000&p=35&y=0` in `simplified` and in
  `accurate`, and reads the text of every label
- **THEN** the two label sets hold the same names in the same order

#### Scenario: A bad mode changes nothing

- **WHEN** the browser test sets the mode to `accurate`, then calls `setRegionMode` with
  the string `precise` and with `undefined`, and reads the mode
- **THEN** it is still `accurate`

### Requirement: The handle reports the region at a plane point

The handle SHALL carry `regionNameAt(point)`, which takes a position in game coordinates
and returns the name of the codex region that holds it, or null.

The lookup SHALL read the `x` and `z` of the point and SHALL ignore its `y`, because the
region grid is a map of the galactic plane and a region has no upper or lower bound. A
point outside the grid SHALL give null, and so SHALL a point inside it that the grid marks
as no region.

The call SHALL give null before the scene data has loaded, rather than throw, because the
handle answers in the same tick the map is created and the grid arrives later.

The HUD names the region under the cursor in its top bar, which `map-hud` states. Before
this requirement the only way to ask was `debug.regionNameAtScreen`, and `debug` is not
part of the supported surface.

#### Scenario: The call names the region at a point

- **WHEN** a browser test waits for `ready` and calls `regionNameAt` with Sol
  (0, 0, 0), with the galactic centre (15, -35, 25895), and with a point far outside the
  grid at (400000, 0, 0)
- **THEN** the first gives `Inner Orion Spur`, the second gives `Galactic Centre`, and the
  third gives null

#### Scenario: The height of the point does not change the answer

- **WHEN** a browser test calls `regionNameAt` with (0, 0, 0) and with (0, 20000, 0)
- **THEN** the two readings are equal

#### Scenario: The call answers before the data loads

- **WHEN** a browser test builds a second map through `window.galaxyMapFactory` and calls
  `regionNameAt` with Sol before `ready` settles
- **THEN** the call returns null and does not throw
