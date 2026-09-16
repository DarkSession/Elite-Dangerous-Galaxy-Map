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

### Requirement: The handle reports the region at a plane point

The handle SHALL carry `regionNameAt(point)`, which takes a position in game coordinates
and returns the name of the codex region that holds it, or null. It SHALL read the coarse
region grid, whose cells are **197.3976** light years, and SHALL answer in the same tick.

The handle SHALL also carry `regionNameAtExact(point)`, which returns a promise of the same
name resolved on the game's own region grid of **49.3494** light years, or of null. The two
answers differ only within about 100 light years of a boundary, which is where the coarse
grid cannot tell one region from its neighbour.

`regionNameAt` is the reading for something that follows the cursor every frame, such as the
HUD's top bar. `regionNameAtExact` is the reading for something that names one place once,
such as the information panel of a selected system, where a wrong region is stated as a fact
and a user cannot tell it is wrong.

**The exact lookup SHALL NOT enter the main bundle.** The region cell table is about 199 KiB
and only the region worker reads it today. `regionNameAtExact` SHALL load it on its first
call and SHALL keep it after that, so the table arrives in a chunk of its own and a map that
never asks never fetches it. A second call while a first load runs SHALL wait on the same
load and SHALL NOT start a second one.

Both lookups SHALL read the `x` and `z` of the point and SHALL ignore its `y`, because the
region grid is a map of the galactic plane and a region has no upper or lower bound. A
point outside the grid SHALL give null, and so SHALL a point inside it that the grid marks
as no region.

`regionNameAt` SHALL give null before the scene data has loaded, rather than throw, because
the handle answers in the same tick the map is created and the grid arrives later.
`regionNameAtExact` reads no scene data, so it SHALL answer from the table alone and SHALL
NOT wait for the load. A failed load SHALL reject the promise rather than throw out of the
call, and SHALL NOT be kept: the next call SHALL start a fresh load. A held rejection would
make the region field read `Unknown` for every system for the life of the page after one
network fault, and it would never recover.

#### Scenario: The call names the region at a point

- **WHEN** a browser test waits for `ready` and calls `regionNameAt` with Sol
  (0, 0, 0), with the galactic centre (15, -35, 25895), and with a point far outside the
  grid at (400000, 0, 0)
- **THEN** the first gives `Inner Orion Spur`, the second gives `Galactic Centre`, and the
  third gives null

#### Scenario: The exact call names the region at a point

- **WHEN** a browser test awaits `regionNameAtExact` with the same three points
- **THEN** the readings are `Inner Orion Spur`, `Galactic Centre` and null

#### Scenario: The exact call is right where the coarse one is not

- **WHEN** a unit test finds a plane point whose coarse cell holds one region and whose own
  49.3494 light year cell holds another, and both calls read it
- **THEN** `regionNameAtExact` gives the region of the 49.3494 light year cell, and the two
  readings differ

#### Scenario: The height of the point does not change the answer

- **WHEN** a browser test calls `regionNameAt` and `regionNameAtExact` with (0, 0, 0) and
  with (0, 20000, 0)
- **THEN** each call gives the same answer for both points

#### Scenario: The call answers before the data loads

- **WHEN** a browser test builds a second map through `window.galaxyMapFactory` and calls
  `regionNameAt` with Sol before `ready` settles
- **THEN** the call returns null and does not throw

#### Scenario: The exact table stays out of the main bundle

- **WHEN** a unit test reads the build output and looks for the region cell table in the
  entry chunk, then a browser test loads a map, reads the requests the page made, calls
  `regionNameAtExact` twice at once and reads the requests again
- **THEN** the table is in no entry chunk, the page fetched it not at all before the calls,
  and the two calls together fetched it once

### Requirement: A region in view carries a label that fades with its own range

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

**The handover between the two rules SHALL carry a hysteresis band.** The centre rule SHALL
be taken up when the centroid projects **inside the frame**, and SHALL be held, once taken
up, while the centroid projects inside the frame grown by **a quarter of the frame** on each
side, which is the reach the carried target and the carried anchor already take.

The two rules can name places most of a frame apart, and the centroid's projection sits
exactly on the frame edge as the camera turns. Without the band the target crosses back and
forth between the two on almost every frame there. The smoothed target then settles
between them, which is a place neither rule chose, and the label sits on neither the centre
of its region nor the part of it the frame shows.

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
pixels. The bound is read on a settled anchor because the filter above adds up to the
cap of its own, which is 20 CSS pixels in a frame of 60 a second, while a label is still
going to a target that moved.

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

**Every rule of the placement SHALL read the seconds the frame covers.** The page SHALL
give the placement the time since the frame before, clamped to at most **0.1 seconds**, and
every share, floor and cap below SHALL be a rate over that time and not a figure per frame.

A rule per frame makes the speed of a label follow the frame rate of the display. The rules
below were measured at **60 frames a second**, and a figure per frame moves a label **2.4
times as fast** on a 144 Hz display and 0.5 times as fast on a 30 Hz one. A label on a fast
display therefore crossed much more of the screen in the same time than the one the rules
were tuned against. Each rate below is set so that a frame of 16.667 milliseconds gives
exactly what the rule per frame gave, so every measured reading in this requirement holds
at 60 frames a second and now holds at every other frame rate as well.

**The share SHALL fall by half over a fixed time.** The smoothed target SHALL take
`1 - 0.5 ** (seconds * 1000 / 71)` of the gap to the frame's own target, so the gap falls
by half every **71 milliseconds**. At 60 frames a second that is a share of 0.150, which is
the share this rule held per frame.

**The smoothed target SHALL NOT move over the map faster than 120 CSS pixels a second.**
The page SHALL read `carry`, which is how far the projection of the carried target moved
between the frame before and this frame. That is the map's own motion under the label. The
move of the smoothed target on the screen SHALL be at most `carry + 120 * seconds` CSS
pixels. Where the share asks for more, the move SHALL be cut to that bound, along the line
to the frame's own target.

**This is the rule that stops a label travelling further than it should.** A label rides
the map. `carry` is what the map moved, and the 120 CSS pixels a second is the whole of
what the label may add to that. A label can therefore never cross the frame while the
galaxy under it holds still, and it can never overtake the galaxy by more than a fifth of a
1080 row frame in a second.

**The cap SHALL NOT apply on a frame the caller marks as a view jump.** A jump is a write of
the view that is not a movement of it: `setView`, the landing of a selection flight, and a
view read from the URL. On such a frame the page SHALL drop the carried target and take the
frame's own target whole. The drift cap answers a label that wanders while the map moves
normally; on a jump the whole frame is another place, and holding a target from the frame
before would make the label walk the width of the screen to catch up.

**The anchor SHALL NOT be dropped on a jump.** It keeps the plane point it holds and walks
to the whole-taken target under its own cap of 1,200 CSS pixels a second. This is what the
scenarios "A pushed anchor comes back to the centre at once" and "A label that must really
move does not crawl" read, and their figures are figures of the anchor. The caller already
knows which writes of the view are jumps, so the page does not have to guess it from how far
the frame moved: a fast drag and a jump can move the same number of pixels.

**The share SHALL NOT grow with the gap**, and no gap SHALL take the frame's own target
whole. A reading at which the whole target is taken is a gate, and this requirement already
states what a gate does: it puts the label somewhere else in one frame, which is
the jump the filter is there to stop. The three rules that moved a target a long way in a
few frames all crossed it. The target rule hands over from the region's centre to the
frame's own samples, and the two can sit most of a frame apart. The search that moves a
label off a neighbour steps between rings of 12, 24, 48 and 96 CSS pixels. A region that
shows as two patches carries its target from one patch to the other. Under the cap above
each of those is a walk the user can follow.

The carried target is still dropped, and the frame's own target still taken whole, when it
no longer resolves to its region or goes out of reach of the frame. That is the rule for a
camera that really jumps, and the cap does not apply to it: there is nothing to walk from.

**Where the smoothed point falls on another region, the point SHALL follow the flow field
rather than stand still.** A region is not a convex shape and it can show as two separated
patches, so the straight line on the plane from the carried point to this frame's target can
run over a third region.

The page SHALL read the flow field at the carried point's own cell of the coarse grid, SHALL
take the step that cell names, and SHALL move the smoothed point along that step by the
screen distance the straight step would have moved it. The field's step is a step inside the
region toward the region's own centre, so the point walks around whatever lies between the
two and arrives on a path that never leaves its own region.

**Where the field names no step**, which is a cell it marks as the end of a path or a cell
outside the grid, the carried point SHALL be kept for that frame. Taking this frame's target
instead would carry the label to the other patch in one frame.

**A label SHALL NOT be able to stop for good while a path to its region's centre exists.**
The rule this replaces kept the carried point whenever the straight step left the region.
That test fails in every frame at the same share, so a label whose region's centre lay behind
a third region never moved again, however long the centre stayed in view. The scenario "A
label walks around a region in its way" reads the new rule.

Where the field names no step because the carried point sits in a patch of its region with no
path to the centre, the label still holds. The requirement "The region worker builds a flow
field toward each region's centre" states that the shipped data holds no such patch, and a
unit test counts them, so the case is a guard and not a behaviour a user meets.

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
projection of the smoothed target, over a frame of `seconds`, the step SHALL be:

```
fall = 1 - 0.5 ** (seconds * 1000 / 16.667)
min(1200 * seconds, max(min(gap, 24 * seconds), gap * fall * min(1, gap / 48)))
```

That is: the gap falls by half every **16.667 milliseconds** at or above a gap of **48 CSS
pixels**, the speed falls with the gap below that, the step is never more than a cap of
**1,200 CSS pixels a second** and never less than a floor of **24 CSS pixels a second**.

At 60 frames a second those rates give a share of 0.500, a cap of 20.0 CSS pixels and a
floor of 0.40 CSS pixels in one frame, which is what this rule held per frame. Every
reading in this requirement is stated at 60 frames a second and is unchanged.

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
target whole, and moving half of the gap under the cap, changes the step by 1.0 CSS
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
frame 13, which is 217 milliseconds, and within 2 at frame 26.

**The browser reading of this push** is **162.3 milliseconds** to 8 CSS pixels, 45.6 to 20
and 378.9 to 2, against the 400 the browser suite allows. The worst frame moved the label by
20.03 CSS pixels, against the cap of 20.0 that a frame of 16.667 milliseconds gives. The push
is a `setView`, which the rule above marks as a view jump, so the target is taken whole and
the anchor runs alone.

The push starts **47.5 CSS pixels** from the middle of the region. The browser reads the label in the frame after the jump, and the anchor has already run
one step of its cap by then: the old rule crept the target as well, so the first reading sat
further out. The bound of 400 milliseconds stands, and the label goes where it belongs and
does not crawl.

The filter replaces a hold that kept the anchor where it was for as long as the point still
resolved to the region and still projected inside the frame. What the hold did, and should
not have, was keep a label at the frame edge it had been pushed to long after the region was
back in full view.

**The carried anchor SHALL NOT be dropped for leaving its own region.** The target is
always on its region, so an anchor that walks toward it comes back to the region on its
own. A gate does the opposite of what it is for: it drops the carried point in one frame,
and the label then goes to the target in one step, which is what a person sees as a jump.

**The carried anchor SHALL be dropped only when it goes out of reach of the frame.** The
reach is the frame grown by **a quarter of the frame** on each side. A wheel held down
changes the camera distance by 15 percent in a frame, which throws the anchor of a label
near the edge a little outside the frame while its region stays in view; the margin keeps
that anchor and the filter walks it back. A camera that jumps to another view leaves the
anchor further out than that, and the label re-places at once.

An earlier gate dropped the anchor at the frame edge itself, with no margin, and fired on
almost every wheel notch.

A region is not always a convex shape, so the straight line from the carried point to the
target can go over a neighbour. The step SHALL get shorter, halving up to six times, to
land on the region where a shorter step does.

**Where no shorter step does, the step SHALL follow the flow field**, read at the carried
point's own cell of the coarse grid and scaled to the screen distance the straight step
asked for. The anchor then walks around what lies between it and its target rather than
pressing into the edge that stops it. Where the field names no step there, the straight step
SHALL stand: the target is always on the region, so the anchor comes back to the region as
it walks.

A region that carried no label in the frame before SHALL start at the target.

**The drawn anchor SHALL be held inside the viewport, and not inside the inset.** The inset
is where the target rule puts a label that must move. To hold the drawn anchor there as
well pins a label near the frame edge to one place on the screen while the map slides under
it, which reads as the label moving over the map. The box rule moves the box itself fully
into the frame, so a label at the edge stays readable and still slides with its region.

**A zoom SHALL read like a drag.** The measure is how far a label moves from the projection
of its own region centre from one frame to the next, because a label that holds that offset
slides with the map. Over a drag of 60 light years a frame the worst reading is **2.7 CSS
pixels** and the mean is **0.13**. Over 28 steps of 15 percent of the distance, each in one
frame, which is more than a wheel notch moves in a frame, the worst is **7.0** and the mean
**0.49**. Over a wheel held down,
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

**A label SHALL fade exactly as the boundary at the same place fades.** A name and the line
it names SHALL read at the same strength, so a label's opacity SHALL be the product of the
same two fades the requirement "The boundaries draw as one wide soft band" states:

- the **zoom fade**, read once for the frame from the camera's distance to the cursor: 1 at
  20,000 light years and below, falling on a smooth step to 0 at **30,000** and above;
- the **range fade**, read from the camera's distance to the label's **own plane anchor**:
  0 at **10,000** light years and below, rising on a smooth step to 1 at **20,000** and
  above. These are `REGION_RANGE_NONE` and `REGION_RANGE_FULL`, the same two constants the
  composite pass takes, and no copy SHALL be made of them.

A label SHALL carry the product as the opacity of its element, and a label whose product is
**0** SHALL be left out of the overlay and SHALL NOT be placed. Every scenario that counts
the labels on the page therefore counts the labels a user can see, and a frame in which no
name could be read holds no label element at all.

**Why the label reads the range at one point while the line reads it per pixel.** The line
is a band of pixels and each pixel has its own plane point, so the pass reads the fade per
pixel. A label is one DOM element with one opacity: it names one place, its anchor is that
place, and the anchor is already a plane point the placement holds. Reading the fade there
gives the label the strength the boundary has under it. An earlier rule rejected a range
fade for labels because a box of text 100 CSS pixels wide would be taken away on one side
and kept on the other; that objection is about a per-pixel fade, and it does not reach a
fade read once at the anchor.

**The close end of the label's old zoom band goes.** The band held labels full from 20,000
down to 10,000 and faded them to none at 5,000. The range fade holds that end now, as it
does for the lines, so the label's zoom fade SHALL keep the far end alone and SHALL NOT
carry a close step. Where the two disagreed before, the map showed a name with no line under
it, or a line with no name beside it.

The label's zoom fade is then the **same function** the boundary's is, so the page SHALL
hold one of them and SHALL NOT keep a second copy. The two constants the old close step
took, `REGION_CLOSE_NONE` and `REGION_CLOSE_FULL`, SHALL go: nothing reads them once the
close step is gone, and a constant nobody reads is a rule a later reader will try to obey.

**What the user gives up, and what carries it.** The region the camera sits in has its
anchor near the cursor, so it is the **first** label to go as the user zooms in, not the
last. Below a zoom at which nothing on the plane reaches 10,000 light years, the frame
carries no region name at all. The HUD's top bar names the region under the cursor at every
zoom, and the requirement "The handle reports the region at a plane point" states it, so the
name is never lost; it moves from the map to the bar.

**The page SHALL skip the sampling sweep when no plane point in the frame can carry a
label.** The sweep SHALL run only when **both** of these hold:

- the **zoom fade is above 0**, which is a zoom below 30,000 light years. This half is
  unchanged and it is what keeps the default far view from sweeping;
- the **greatest range to the plane the frame holds** is above `REGION_RANGE_NONE`. This
  half replaces the old floor of "a zoom below 5,000 light years", which no longer matches
  what draws.

The greatest range SHALL be read from the camera alone in constant time, by unprojecting the
frame's **two top corners**, intersecting each ray with `y = 0` and taking the greater. A ray
that misses the plane SHALL count as beyond it, so a frame holding the horizon always sweeps.
The corners and not the top centre: at a pitch of 58.6 degrees and a camera 1,542 light years
up the top centre reads 3,223 light years and the corners about 4,300, so a gate on the
centre under-reads by about a third.

This is the same reading the gate replaced was reaching for. The sweep costs up to 2
milliseconds of the main thread, and a frame in which every label would draw at opacity 0
has no reason to pay it. Unlike the zoom floor, this gate takes the pitch and the camera's
height into account, so it skips exactly the frames that carry nothing.

The placement rules above are a pure function of the frame's samples and do not read either
fade, so the unit scenarios below hold at every camera distance they name. Several of them
sit at camera distances of 2,000, 640, 800 and 10 light years, where the label each of them
reads no longer reaches the screen, the anchor scenarios among them. Other regions further up
those frames do carry names, because the plane runs past 10,000 light years there. They are kept as regression bounds on the
placement itself, and their figures were measured there; they are not claims about what a
user sees at those zooms.

#### Scenario: No label at the far view

- **WHEN** the browser test opens the default view
- **THEN** the page holds no region label

#### Scenario: The core is named

- **WHEN** the browser test opens `#c=15,0,25895&d=20000&p=35&y=0`
- **THEN** a label reading `Galactic Centre` is on the page, its box lies inside the
  viewport, and it is placed even though at least 12 other regions hold more samples.

  The zoom is 20,000 light years, where the zoom fade is 1 and the cursor's own range is at
  the top of the range fade, so this view reads the placement and not the fade

#### Scenario: The region the camera is inside is named at every zoom

- **WHEN** the browser test opens `#c=0,0,0&p=35&y=0` at each of 20,000, 15,000, 10,000,
  7,500 and 4,000 light years, and at each zoom reads the `Inner Orion Spur` label, its
  opacity, and the range from the camera to that label's own plane anchor
- **THEN** at 20,000 the label is on the page with its box inside the viewport; at every
  zoom at which it is on the page its opacity is `smoothstep(10000, 20000, range)` within
  **0.05**; and at 4,000 the `Inner Orion Spur` label is not on the page at all, because its
  anchor sits about 4,000 light years away and the range fade reads 0 there.

  "Every zoom" is every zoom the overlay draws in, and that is now the same set of zooms the
  boundary draws in. The label's anchor sits near the cursor, so the label goes as the user
  zooms in, at the same distance the line beside it goes. The HUD's top bar names the region
  at every zoom instead

#### Scenario: A label and the line beside it read at the same strength

- **WHEN** the browser test opens `#c=0,0,0&d=18000&p=35&y=0` at **1920x1080**, reads a
  region label's
  opacity and the range `r` from the camera to that label's own plane anchor, then takes a
  cross-section across a boundary band whose own plane point is within **100** light years of
  `r`, and reads the **greatest** alpha of that cross-section
- **THEN** the label's opacity and the band's alpha divided by the band's own opacity of
  0.55 agree within **0.05**, so the name and the line at the same distance carry the same
  strength.

  The reading is taken on a line at the anchor's range and **not** at the anchor itself. An
  anchor sits in the interior of its region, which the box rule pushes away from the edge, so
  the coverage at the anchor's own pixel is 0 and there is no band alpha to read there.

  **Why the greatest alpha of a cross-section, and not a pixel chosen by its distance from
  the centre.** The alpha is `smoothstep(0, 1, max(0, 1 - gap / halfWidth))`, which with
  `u = gap / halfWidth` is `1 - 3u**2 + 2u**3`. It reads exactly 1 only at `u = 0`, and it
  falls away faster than a reader expects: at a tenth of the half width it is already
  **0.972**, a departure of 0.028. The greatest alpha of a cross-section is the pixel nearest
  the centre, which is within half a device pixel of it. At 1,080 CSS rows and a device pixel
  ratio of 1 the half width is 17.28 device pixels, so `u` is at most 0.029 and the departure
  at most **0.0025**. A higher ratio makes `u` smaller, so a ratio of 1 is the worst case.

  The viewport is the other way about, because the half width follows it: at 720 CSS rows the
  half width is 11.52 and the departure 0.0055, and at the clamp floor of 8 it is 0.0112. The
  scenario names 1920x1080, and at the worst viewport the map supports the sum below reads
  0.033 against the same bound of 0.05, so the reading holds everywhere.

  **The 0.05 bound and what it has to carry.** Three terms, each at its worst:

  | source | worst cost |
  | --- | --- |
  | reading the nearest pixel rather than the exact centre | 0.0025 |
  | the 100 light year range window, at a slope of `1.5 / 10,000` a light year | 0.015 |
  | 8-bit quantisation of the band's alpha, `1 / 255 / 0.55` | 0.007 |
  | **sum** | **0.025** |

  That leaves half the bound for the projection of the anchor and the plane point under the
  pixel. A window of 200 light years would cost 0.030 on its own and take the sum past 0.04,
  which is why the window is 100

#### Scenario: No label where no line draws

- **WHEN** the browser test opens
  `#c=1840.85884,-15539.75557,16507.94703&d=20016.72348&p=58.57998&y=24.66002&g=1`, where
  every plane point in the frame is under 10,000 light years from the camera, and reads the
  region labels
- **THEN** the page holds no region label, and the frame holds no boundary either. Before
  this requirement the names stood over a frame with no lines under them

#### Scenario: The sweep is skipped only when nothing could draw

- **WHEN** a unit test reads whether the sampling sweep ran, at a pitch of **89 degrees** at
  a zoom of 4,000 light years, and at a pitch of **20 degrees** at the same zoom
- **THEN** the sweep does not run at 89 degrees, where the whole frame is under the range
  floor, and does run at 20 degrees, where the frame holds the horizon and the plane runs
  past 10,000 light years. A gate on the zoom alone would skip both

#### Scenario: A region with nothing on screen carries no label

- **WHEN** the browser test opens `#c=0,0,0&d=12000&p=35&y=0`, reads every label on the
  page, and works out for itself which regions the frame shows, by resolving the plane
  point under a grid of screen points against the coarse region grid rather than reading
  the counts the label code made
- **THEN** every label on the page names a region the frame shows, and no label names a
  region it does not

#### Scenario: The camera keeps the label of the region it sits in when it turns away

- **WHEN** the browser test opens `#c=0,0,0&d=20000&p=35&y=0` and then
  `#c=0,0,0&d=20000&p=35&y=180`, where the camera turns through 180 degrees over the region
  it sits in, and in each view works out for itself what share of the plane samples each
  region holds, by resolving a grid of screen points against the coarse region grid rather
  than reading the counts the label code made
- **THEN** both views hold a label reading `Inner Orion Spur`, every label on the page names
  a region whose measured share is at least 1 percent, and no region whose measured share is
  at least 5 percent is left without a label.

  **The zoom is 20,000 light years so that the range fade takes nothing.** The camera sits
  `20,000 * sin 35` = 11,472 light years above the plane, and the bottom edge ray is 65
  degrees below horizontal, so the nearest plane point in the frame is 12,657 light years
  away. Every anchor therefore clears the 10,000 light year floor and the 5 per cent clause
  stays an invariant of the **placement**, which is what this scenario reads.

  At a zoom of 12,000 it would not be. There the camera is 6,883 light years up, the nearest
  plane point is 7,594, and the bottom 37 per cent of the frame's rows read ranges under
  10,000. A region holding well over 5 per cent whose anchor landed in that band would draw
  at opacity 0 and be left out, so the clause would pass or fail on where the shipped data
  puts one centroid.

  **The centre rule fires in both views, and that is not what this scenario reads.** The
  Inner Orion Spur's centroid sits at `x = -2,451.1, z = 3,802.0`, which is 4,524 light years
  from Sol. At this zoom the frame's plane footprint reaches 11,034 light years behind the
  cursor along the look direction, so a centroid that near projects inside the frame at both
  yaws. What this scenario reads is that a 180 degree turn drops no label and leaves no large
  region unnamed. The branch that answers a centre outside the frame has its own scenario,
  "A label whose centre is outside the frame goes to the visible part".

  The shares are measured by the test and not written into it, because the shares at this
  distance are not the shares another gives

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

#### Scenario: A label walks around a region in its way

- **WHEN** a unit test builds a region shaped as two lobes joined by a neck, with a second
  region filling the gap between the lobes, carries a label's target in the far lobe, puts
  this frame's target on the region's centre in the near lobe, and runs 600 frames of 1/60
  second with the camera still
- **THEN** the target reaches the centre, every frame's target sits on the label's own
  region, and no frame's target sits on the second region. Under the rule this replaces the
  target held its first position in all 600 frames

#### Scenario: A blocked anchor keeps moving

- **WHEN** the same unit test carries the label's anchor in the far lobe and reads how far
  the anchor moves on the screen in each of the 600 frames
- **THEN** no run of 60 consecutive frames leaves the anchor within 1 CSS pixel of where it
  started that run, until the anchor is within 1 CSS pixel of its target

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
  15** and within 2 by frame 30, and it moves by no more than 20 CSS pixels in any one
  frame, which is the cap of 1,200 CSS pixels a second over a frame of 16.667 milliseconds

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

- **WHEN** the camera jumps and the label of a region starts about 47.5 CSS pixels from the
  middle of its region
- **THEN** the label comes within 8 CSS pixels of the middle inside **400 milliseconds**,
  and no frame moves it more than `1200 * seconds` CSS pixels.

  The browser reads the label in the frame after the jump. A jump takes the target whole,
  so the anchor has already run one step of its cap by the first reading, and the label
  starts about 47.5 CSS pixels out rather than the 70 the push asks for. The measured
  reading is 162.3 milliseconds to 8 CSS pixels

#### Scenario: The rates give the old figures at 60 frames a second

- **WHEN** a unit test reads the target share, the anchor share, the anchor cap and the
  anchor floor for a frame of 16.667 milliseconds
- **THEN** the target share is 0.150, the anchor share is 0.500, the cap is 20.0 CSS pixels
  and the floor is 0.400 CSS pixels, each within 0.001

#### Scenario: The share of the gap follows the gap

- **WHEN** a unit test reads the share of the gap the target rule takes over a frame of
  16.667 milliseconds, at gaps of 4, 30, 90 and 120 CSS pixels
- **THEN** every reading is 0.150 to three places.

  The share does not grow with the gap. It reads one figure at every gap, and the drift cap
  of `carry + 120 * seconds` CSS pixels holds a large gap instead.

#### Scenario: A label moves the same distance at every frame rate

- **WHEN** a unit test settles a label, pushes its anchor 128 CSS pixels from the middle of
  its region, and runs the placement forward over 300 milliseconds with the camera still, in
  frames of exactly **1/30**, **1/60** and **1/144 of a second**, and reads how far the anchor
  has come after the frames **3, 6 and 9** at 1/30, **6, 12 and 18** at 1/60 and **15, 29 and
  44** at 1/144, which are the first frames that end at or after 100, 200 and 300
  milliseconds
- **THEN** the three readings are within **10 CSS pixels** of each other at 100 milliseconds
  and within **2 CSS pixels** at 200 and at 300.

  The frames are named and not the marks, because a mark does not fall on a frame boundary at
  every rate and floating point decides which side of it a sum of frame times falls on: six
  additions of 1/60 give 0.09999999999999999, which is under 0.1. The frame times are exact
  fractions of a second and not 33.333, 16.667 and 6.944 milliseconds: at 33.333 milliseconds
  the third frame ends at 99.999 and a test that read the mark would take the fourth, which
  reads 118.25 and breaks the bound below.
  Under it the rates give 116.0, 108.2 and 108.8 CSS pixels at 100 milliseconds, 120.8,
  119.9 and 120.3 at 200, and 123.2, 122.8 and 123.4 at 300. The spread is 7.8, 0.9 and 0.6.

  Under a rule per frame the 144 Hz run reaches 8 CSS pixels of the middle at frame 13, which
  is 90 milliseconds, and the 30 Hz run is still 11.4 CSS pixels out at 300 milliseconds,
  which is 9 frames.

  100 milliseconds is the coarsest mark because the damping `min(1, gap / 48)` and the cap of
  `1200 * seconds` are not rates: a 1/30 second frame takes one coarse step through the
  damping band where a 1/60 second frame takes two. The exponential term is a rate and
  carries no spread. The spread is therefore in the first frames alone, and it is gone by 200
  milliseconds

#### Scenario: The target does not overtake the map

- **WHEN** a unit test runs the placement over 120 frames of a drag of 30 light years a
  frame across the galactic centre, and over 120 frames with the camera still, and for every
  label reads how far its smoothed target moved on the screen and how far the projection of
  the target it carried moved
- **THEN** in every frame of both runs the target's move is at most the carried point's move
  plus `120 * seconds` CSS pixels, within 0.01, and over the still run no target moves more
  than 2.1 CSS pixels in any frame.

  The frames are 16.667 milliseconds, where `120 * seconds` is 2.0 CSS pixels

#### Scenario: A view jump takes the target whole

- **WHEN** a unit test settles a label, then runs one frame that it marks as a view jump, in
  which the region's own target names a plane point **300 CSS pixels** from the one the label
  carried, and then runs 30 frames with the camera still
- **THEN** the smoothed target is the frame's own target in the jump frame, the anchor is
  still the plane point it held before the jump, and the anchor comes within 8 CSS pixels of
  the new target inside **25 frames of 16.667 milliseconds**.

  The anchor's own rule gives 21 frames from a gap of 300 CSS pixels, and 25 is the bound
  with room for the projection solve. Under the drift cap the same move would take 2.5
  seconds, so this reading is what shows the cap did not apply

#### Scenario: A target that must cross the frame walks there

- **WHEN** a unit test places a label whose centre rule and whose sample rule name points
  **300 CSS pixels** apart, moves the camera so the centre rule hands over to the sample
  rule, and runs the placement on with the camera still
- **THEN** over frames of 16.667 milliseconds no frame moves the smoothed target more than
  2.1 CSS pixels, the target comes within **1 CSS pixel** of the new rule's point within
  **3 seconds**, and it never passes it. The approach is exponential, so the target never
  reaches the point exactly. The rule gives about 2.65 seconds

#### Scenario: The handover does not cross back and forth

- **WHEN** a unit test runs the placement over 120 frames of a slow camera turn that holds
  the centroid of one region within 10 CSS pixels of the frame edge
- **THEN** the rule that names that label's target changes at most once over the 120 frames

#### Scenario: The label walks smoothly while the camera drags

- **WHEN** a unit test runs the placement over 90 frames of a drag of 30 light years a
  frame across the galactic centre, and over 90 frames of a drag of 200 light years a frame
  at a camera distance of 20000, and reads for every label the length of the change of its
  screen step from one frame to the next, with both ends of each step projected through the
  frame they are read in, leaving out the frames in which a label leaves its region or the
  frame
- **THEN** the step changes by less than **0.2 CSS pixels** in a middle reading and by less
  than **0.7** in the worst tenth, over more than 200 readings of each drag, and no reading
  is over the cap of `1200 * seconds` CSS pixels. Taking each frame's target whole under a
  flat half-gap step
  gives 1.0 and 3.0 on the slower drag

#### Scenario: The filter does not hop between samples

- **WHEN** a unit test runs the placement over 120 frames of a slow pan across a region
  whose two nearest samples to the mean are within 1 light year of each other
- **THEN** the target of a frame moves by less than 1 CSS pixel, because the centre rule
  reads no sample while the centre of the region has room; no frame moves the anchor by
  more than the cap of `1200 * seconds` CSS pixels; and the anchor's plane point changes by
  less than one
  sample spacing in any single frame

#### Scenario: Labels neither crowd nor overlap

- **WHEN** the browser test opens `#c=15,0,25895&d=20000&p=35&y=0` and reads the box of
  every label
- **THEN** there are at most 12 labels and no two boxes overlap

#### Scenario: The sampling stays inside its budget

- **WHEN** the browser test opens `#c=15,0,25895&d=20000&p=35&y=0` at 1920x1080 and reads
  the mean and the worst sampling time the page exposes over 300 frames
- **THEN** the mean is under 2 milliseconds and the worst single frame is under 4

#### Scenario: The sweep does not run when the frame can carry no label

- **WHEN** the browser test opens `#c=0,0,0&d=4000&p=89&y=0`, where the whole frame lies
  inside the range floor, draws 60 frames and reads `labelSampling()`, which carries
  `frames`, `meanMs` and `worstMs`; then opens `#c=0,0,0&d=60000&p=35&y=0`, the default far
  view, and reads the same
- **THEN** in each view the page holds no region label, `frames` is 0 and both `meanMs` and
  `worstMs` are 0, so the sweep ran in no frame of the sixty.

  The two views read the two halves of the gate. At a pitch of 89 degrees and a zoom of
  4,000 the top corner ray meets the plane at 6,243 light years, under the floor, so the
  range half closes. At 60,000 light years the plane runs out to about 395,000, so the range
  half is open and the **zoom** half closes it. A gate on either half alone lets one of these
  two through

### Requirement: The boundaries draw as one wide soft band

The boundary chains SHALL draw as lines on the plane `y = 0`, after the tone map, so no
look constant of the far view changes them and none of them changes the far view. They
SHALL be drawn camera-relative, as every other pass is.

Which set draws SHALL follow the region mode: the smoothed set in `simplified`, the traced
set in `accurate`, and neither in `off`. Both sets draw through the same pass, with the same
half width, the same tone and the same join rule, and the drawn band is the same width in
both.

**The line is one soft tone.**

- The tone SHALL be `(0.86, 0.74, 0.60)`, a warm cream.
- The opacity SHALL be **0.55** where the overlay draws in full.
- **The half width SHALL be 1.6 per cent of the viewport height in CSS pixels, clamped to
  8 and 24 CSS pixels**, so the whole band runs from 16 to 48 CSS pixels across and
  measures **34.6** at 1,080 CSS rows. The clamp acts at 500 CSS rows and below, and at
  1,500 and above.
- The coverage the pass writes SHALL be `max(0, 1 - gap / halfWidth)`, where `gap` is the
  distance from the middle of the line in CSS pixels, evaluated for each device pixel of the
  ribbon quad, in a single-channel buffer at the **full drawing buffer resolution**.
- The alpha SHALL be `smoothstep(0, 1, coverage)`. The `smoothstep` **clamps at 1**, so the
  band has a flat top.
- Where two quads of one join overlap, the buffer SHALL keep the larger coverage, which is
  the smaller distance. A join therefore reads as a straight run reads and not as twice one.

The width is a share of the viewport and not a fixed number of CSS pixels because the band
is wide. A fixed 34.6 CSS pixels would cover a tenth of a 360 row window and a sixtieth of a
2,160 row one, and the boundary would read as a different thing on each. The clamp holds the
band readable at a small window and stops it growing past a reading at a large one.

**The width is what hides the raster, and it replaces the blur.** The region data is a grid
of 49.3494 light year cells, so the traced boundary is a staircase whose step is one cell.
The pass SHALL NOT blur. Two readings say why the band alone is enough, and both rest on
the range fade below, which draws no line nearer than 10,000 light years.

- **The corner is already round.** The coverage is an exact distance from the **segment**
  and not from an infinite line, and the pass blends with `MAX`, so a 90 degree corner of
  the traced set is a round turn of the band's own half width, **17.28 CSS pixels** at 1,080
  rows. A blur of standard deviation 1 to 2.667 CSS pixels cannot make it rounder.
- **The staircase is far smaller than the band.** One cell measures `46,157 / range` CSS
  pixels at 1,080 rows and a 60 degree vertical field of view. The nearest range that draws
  is 10,000 light years, where a cell is **4.62** CSS pixels against a band of 34.6, which is
  **0.133** of it. A step of the staircase therefore moves the band's edge by about a quarter
  of the edge's own ramp, and every line further out moves it less.

The readings are what the range fade buys. At a range of 1,000 light years a cell would
measure 46.2 CSS pixels, which is more than the whole band, and the traced set would read as
the staircase it is. The range fade draws nothing there, which is why the width alone is
enough and the blur is not.

The normalisation SHALL therefore be 1 in both modes, and the pass SHALL hold **one**
full-resolution coverage target and not three.

The dark outline is what carried the old 6 CSS pixel line over the bright disc. The warm
tone carries it instead: its luminance is 0.755, above every part of the frame but the core
itself, so the band lightens the picture nearly everywhere and needs no darker edge to be
seen.

**A line goes out by its own range to the camera, and the overlay goes out by the zoom at
the far end alone.** Two fades SHALL multiply.

**The range fade** SHALL be read for each pixel, from the camera's distance to the point of
the galactic plane under that pixel:

- nothing at **10,000** light years and below,
- rising on a smooth step to full at **20,000**,
- full above 20,000.

**The zoom fade** SHALL be read once for the frame, from the camera's distance to the
cursor:

- full at **20,000** light years and below,
- falling on a smooth step to nothing at **30,000** and above.

The zoom band has no close end. The range fade above holds that end per pixel instead,
because a zoom band could not tell a line that shows its staircase from one that does not, because
a zoom is one number for the whole frame. At a zoom of 8,000 light years the boundary a few
hundred light years from the cursor steps about 6 CSS pixels a cell, and the boundary near
the horizon is 40,000 light years off and steps under 1.2. The close end took both away, so
a user who zoomed in to read a neighbourhood lost the region lines of the whole galaxy
around them and not only the one under the cursor.

The range fade takes away the lines that carry the staircase and keeps the ones that do not.
The largest cell that can draw is therefore the cell at 10,000 light years, which is **4.62
CSS pixels at 1,080 rows** and 3.08 at 720. That reading is what the band's width answers:
4.62 against 34.6 is 0.133 of the band, so the widest staircase a frame can hold moves the
band's edge by about a quarter of its own ramp.

**The plane point under the pixel** is what the range is measured to. The boundary chains
are drawn on the plane `y = 0`, so for any pixel a line covers, that point is the line's own
point and the reading is exact. Where the ray through the pixel does not meet the plane in
front of the camera, which is a pixel above the horizon, the fade SHALL be full. Nothing of
the boundary set is drawn there.

The range fade above is the only fade the line takes over its own distance, and it needs
no second channel in the coverage buffer: the composite pass reads the plane point under
each pixel from the frame's own projection, so the coverage buffer SHALL stay one channel.

**What the close zoom shows instead.** Below 10,000 light years of range the map draws no
boundary, and it places no region name whose own anchor is that near either. The user reads the
region from the HUD's top bar, which names the region under the cursor at every zoom. The
requirement "The handle reports the region at a plane point" states that, and the handle
carries it as `regionNameAt`, with `regionNameAtScreen` beside it.

**The labels take both fades as well.** The requirement "A region in view carries a label
that fades with its own range" states it: the label takes the zoom fade of this requirement
and the range fade of this requirement, the second read once at the label's own plane anchor
rather than per pixel. A name and the line under it therefore read at the same strength at
every zoom, which is the whole point of giving them one rule.

Where two segments of a chain meet, the line SHALL NOT be brighter than a straight run of
the same chain, and SHALL show no gap. A join is where a naive draw of one quad per
segment shows its seams: the two quads overlap, and drawn straight onto the frame the
overlap blends twice. The rule SHALL hold for the traced set as well, whose joins are 90
degree corners and are the hardest case the pass draws. With no blur in the pass the `MAX`
blend equation holds the rule by itself: for the traced set, whose arms run along the screen
axes, the corner and the arm read the same number **to the last digit** and the reading
carries no tolerance.

A chain that runs at an angle to the screen needs one term, and it is a term of the
**instrument** and not of the pass. Comparing the largest reading of two places on a band
compares two samples of a flat top, and only a line a pixel row lands on is sampled at its
middle. The scenario "A join is not brighter than the line" therefore allows the **half pixel
sampling loss**, `opacity * (3u**2 - 2u**3)` at `u = 0.5 / halfWidth`, which is 0.00071 at a
half width of 24. The 3 per cent tolerance the blur needed is gone, and 0.00071 is three per
cent of it.

**The chosen views are constants and they move again.** `tests/region-views.ts` searches
the boundary set for the views the scenarios below open, and `e2e/region-views.ts` holds what
it found. Every view it holds SHALL be searched again.

**The two premises below govern three of the four searches**: the width search, the join
search and the traced-corner search. Each of those reads a window of the frame and compares
two parts of it, or compares it with the same window drawn another way, so the whole window
must carry one strength of the range fade.

**The both-sets search is exempt from both premises.** The view it finds is the one the fade
scenarios open, at zooms of 9,000, 15,000, 20,000, 25,000 and 31,000 light years. It exists
to be read inside both fades, so a premise that put it outside them would take away the only
view that reads them. It keeps its viewport of **1280x720**, and its window of 8 CSS pixels
holds one chain and no other at every one of those zooms.

**Premise one: the reading point SHALL sit at a range of at least 20,000 light years from
the camera.** Each of the three searches puts the **cursor on the reading point**, so the
range of that point is the zoom itself, and a zoom of 20,000 light years holds the premise
exactly.

The range fade is a smooth step that ends at 20,000 light years, so its slope there is
**zero**. A window around a point at that range therefore carries one strength over the whole
of itself, to better than a millionth: the three searches work at a pitch of 89 degrees, where
every plane point of a window a few tens of CSS pixels wide sits within about 3 light years of
the cursor's own range, and the fade's flat top reads no difference over 3 light years.

Inside the fade the strength follows the range, and the slope is steepest in the middle. At a
range of 15,000 light years a window of 40 CSS pixels spans about 430 light years, which the
fade reads as 6 per cent, twice the 3 per cent the corner rule allows. A window there would
fail the corner rule on the fade and not on the drawing. This is why the premise is a floor
and not a band.

**Premise two: the zoom SHALL be at most 20,000 light years**, where the zoom fade is full.
Above it the whole overlay fades out. With premise one the two together fix the zoom of each
of the three views at **exactly 20,000 light years**.

**The viewport and the zoom of the three governed views SHALL move together**, so that one
CSS pixel covers the number of light years it covers today:

| search        | view today          | view after          | light years a CSS pixel covers |
| ------------- | ------------------- | ------------------- | ------------------------------ |
| width         | 1920x1080 at 10,000 | 3840x2160 at 20,000 | 10.69                          |
| traced corner | 1920x1080 at 10,000 | 3840x2160 at 20,000 | 10.69                          |
| join          | 1920x1080 at 12,000 | 3200x1800 at 20,000 | 12.83                          |

Every window these three searches state in CSS pixels therefore holds the same number of
light years it holds today, and every count of runs, bends and nodes they report is a count
over the same geometry. The zoom of each is 20,000 light years, which is premise two's
bound, and the rows follow it.

The cell on the screen is the same as well, because it is read in CSS pixels from the same
zoom and viewport. At 2,160 rows and a range of 20,000 light years the cell measures **4.62
CSS pixels**, which is what the readings at 1,080 rows and 10,000 light years were taken at.
At 1,800 rows and 20,000 light years it measures **3.85**.

**The counts in this requirement were measured at the old viewports and zooms, and the
implementation SHALL measure them again.** The premises above change which runs, bends,
nodes and points each search holds, so the counts the requirement stated before are
readings of the old rule and are taken out of this delta. The implementation SHALL run each
of the four searches under the new premises, SHALL write the counts it finds back into this
requirement, and SHALL NOT carry the old ones over. A count is a fact of the data and the
view, so a stated count that nobody measured is worse than no count at all.

**These are the counts the four searches hold** under the premises and the restated
windows of this requirement, each read from the search itself.

| search                     | what the count holds      | count |
| -------------------------- | ------------------------- | ----- |
| width, of the smoothed set | straight runs             | 23    |
| width, of the traced set   | straight runs             | 2     |
| join                       | bends of the smoothed set | 81    |
| traced corner              | lattice nodes             | 6     |
| both sets                  | plane points              | 4,098 |

The same four searches held 23, 2, 6,713, 10 and 4,605 against the 6 CSS pixel band, at
these viewports and zooms. The two width counts do not move, because their clearance of 60
CSS pixels is far wider than the band at either width. The other three fall, because the
restatement holds a reading window and a comparison run clear of a band that is now 24 CSS
pixels of half width: the join search keeps 81 bends of 6,713, the traced corner search 6
nodes of 10, and the both-sets search 4,098 points of 4,605.

Each count is the number of candidates that hold every premise of its search, and not the
number the search keeps. `tests/region-views.test.ts` SHALL assert each of the five counts
it finds, so a count that moves fails a test and nobody can carry a stale count forward.

**The width search SHALL take the zoom as given** and SHALL NOT derive it from the run it
found. It SHALL hold the run over the reading row with at least **100 CSS pixels** of it
above and below, in place of crossing the whole frame. At 2,160 rows and 20,000 light years
one CSS pixel is 10.69 light years, so the run needs 2,138 light years, which is what the
same rule asked for at 1,080 rows and 10,000.

The search SHALL drop the premise that the view sits within 16,000 light years of the
galactic centre. That premise was there so the disc under the line could be brighter than
the **dark outline**, and the outline is gone. In its place the reading point SHALL sit at
least **5,000 light years** from the galactic centre, which keeps the reading off the bright
core, where the band no longer lightens. The clearance SHALL stay at **60 CSS pixels**.

The search SHALL run **once for each set**, and `e2e/region-views.ts` SHALL hold one crossing
view for each. A near-vertical straight run of the smoothed set is not a near-vertical
straight run of the traced staircase, so one view cannot serve both modes.

**The other three searches SHALL state their reading windows in CSS pixels, not in light
years**, and SHALL each take the zoom and the viewport its scenario names. They SHALL hold:

- the **join** search: a clearance of 20 CSS pixels, a fold reach of 12 CSS pixels, a
  neighbourhood of 16 CSS pixels of arc, and a comparison run between 16 and 40 CSS pixels
  from the bend and at least 8 CSS pixels long. The straight run must sit outside the
  reading window, which reaches 12 CSS pixels;
- the **traced corner** search: arms of **48 CSS pixels**, a clearance of 20 CSS pixels, a
  neighbourhood of 16 CSS pixels of arc, a fold reach of 12 CSS pixels, and a comparison run
  between 12 and 40 CSS pixels from the node, against a read radius of 6. The polyline the
  reading classifies a pixel against SHALL reach the read radius, 6 CSS pixels along each
  arm. The arms SHALL be longer than the far end of the run, or the comparison reads past
  the next node and off the drawn line, and the arm SHALL be **derived** from the run's far
  end and not stated as a figure of its own: it is that end plus 8 CSS pixels, which is 72
  at a half width of 24. The 48 above is the reading against the 6 CSS pixel band and moves
  with the run under the additive restatement below;
- the **both sets** search: a clearance of 20 CSS pixels.

**All three searches SHALL take the same radius floor the width search takes**, a floor of
**5,000 light years** from the galactic centre, and SHALL drop the ceiling of 16,000 that
each holds today. The ceiling was there so the disc under the line could be brighter than
the dark outline, which is gone. The join search holds no radius premise today and SHALL
take none.

**The three searches SHALL hold their windows per search and not in one module constant.**
`NEIGHBOUR_ARC_LY` and the fold reach are shared between the join search and the traced
corner search today, and the two scenarios read at different zooms, so one light year figure
cannot serve both once the windows are stated in CSS pixels. Each search SHALL derive its
own windows from the zoom and the viewport it is given.
**The cost.** With the overlay on at 1920x1080 in `accurate` at a zoom of **4,000 light
years**, which is the closest zoom the overlay draws at, the draw time SHALL be at most **1 ms** more than the same view drawn with the overlay
off, read with `measureFrames`. The overlay SHALL stay inside the frame budget
`real-systems` states, which the browser suite already measures at a 20,000 light year view
with a full set.

**The pass runs at every zoom under 30,000 light years.** A close zoom therefore pays for
the ribbon draw and the composite. The cost reading above is taken at a close zoom for that
reason, and it has more room than it had: the two blur passes are gone.

The ribbon draw is the whole boundary set whatever the zoom, and the composite is a
full-screen pass whose cost follows the drawing buffer. Neither reads a star system, so the
cost is the same for a set of none and a set of 10,000, and it does not follow the 400
billion systems of the galaxy.

`debug` SHALL carry `regionCoverageSize()`, which returns the width and the height of the
coverage buffer, and null before the first frame that draws the overlay. It reports the
storage and not a reading of it, so a test can hold the buffer at the full drawing buffer
size and can hold a frame above the band to taking none.

The pass SHALL take its coverage storage in the first frame that needs it, so the overlay
costs no memory at 30,000 light years and above. It SHALL hold **one** full-resolution
target in both modes, where it held three.

**Every window and every count above is a reading of a 6 CSS pixel band, and the band is
now 34.6 CSS pixels at 1,080 rows.** The searches SHALL restate each window that was
measured against the old band so that a window holding one band still holds one band, and
SHALL then run again and write the counts they find into this requirement, in place of the
five stated above. `tests/region-views.test.ts` SHALL assert each count, so a count that
moves fails a test and nobody can carry a stale count forward.

**Three windows already collide with the new band**, and the restatement SHALL start with
them. The join search asks for a comparison run **16 to 40 CSS pixels** from the bend and
holds the straight run outside a reading window that reaches **12 CSS pixels**; the traced
corner search reads **16 CSS pixels** of arc; and the join, the traced corner and the
both-sets searches each ask for **20 CSS pixels** of clearance. At 3200x1800 the half width is the clamp, 24 CSS pixels, so every one of those
windows falls inside the band itself and reads band against band.

**The restatement SHALL be additive and SHALL NOT scale a window by the band's growth.** A
window that measures a **clearance from the band** — the width search's 20 CSS pixels, the
join search's reading window and the distance from the bend at which its comparison run
starts — SHALL become the half width **plus** the figure it already holds. The width search's
own clearance of 60 CSS pixels, which the paragraph above holds at 60, follows the same rule:
the stated figure stays 60 and the search adds the half width to it, so the reading row holds
one band and 60 clear CSS pixels on each side of it. A window that
measures **along** the band — an arc, a run length, a comparison span — SHALL stay as it is,
because it already measures what it needs to measure.

Scaling every window by the band's growth does not work, and the figures say why. The old
half width was 3 CSS pixels and the new one is at most 24, a factor of 8, which would ask
the traced corner search for two straight arms of 384 CSS pixels. At 3840x2160 and a zoom of
20,000 light years that is **4,105 light years**, about 83 cells. The longest straight
segment in the whole traced set measures **4,392 light years** and only **2** segments reach
past 4,105, so no two of them meet at a 90 degree node and the search returns nothing. The
join search moves the same way: scaling its bend reach changes what counts as a bend, and
its count ran from 6,713 to 13,380 when this was tried.

The premises themselves do not move. The range fade still reaches full at 20,000 light
years, so premise one still holds there with a slope of zero, and premise two still fixes
the zoom of the three governed views at 20,000. The viewport table stays as it is: it was
set by the premises and not by the kernel.

**The corner tolerance of 3 per cent goes.** It was there because a blur lifted the inside
of a corner above a straight run's peak, and because the blurred ridge was a sample of a
kernel whose phase moved. With no blur the `MAX` blend equation holds the corner and the arm
at the same number exactly, as it did before the blur was added, so every scenario that read
the tolerance SHALL read an exact bound.

#### Scenario: The coverage buffer holds the whole drawing buffer

- **WHEN** the browser test reads `debug.regionCoverageSize()` at a zoom of 40,000 light
  years, then at a zoom of 15,000, at a device pixel ratio of 1 and again at 2
- **THEN** the first reading is null and the others are the drawing buffer's own width and
  height

#### Scenario: The band is the stated share of the viewport

- **WHEN** the browser test opens the crossing view of the traced set at **1920x1080**, at
  **1280x720** and at **640x360**, and reads the **half-maximum width** of the band across a
  straight run, in CSS pixels, in each
- **THEN** the readings are **17.3**, **11.5** and **8.0** CSS pixels, each within **1.0**
  CSS pixel.

  The half-maximum width is the **half width** and not the whole band. The alpha is
  `smoothstep(0, 1, 1 - gap / halfWidth)`, which is 0.5 at a coverage of 0.5, that is at a
  gap of `halfWidth / 2`, so the width at half maximum is `2 * halfWidth / 2`. The base
  spec's own table reads 3.00 to 3.50 for a half width of 3, which is the same rule.

  The whole band, which is where the contribution reaches 0, is **34.6**, **23.0** and
  **16.0** CSS pixels at the three viewports. The third is the clamp: 1.6 per cent of 360
  rows is 5.76, below the floor of 8, so the half width is 8 and not 5.76

#### Scenario: Nothing at the far view

- **WHEN** the browser test renders the default view at 1280x720 with the region
  overlay on and with it off, and compares the two image files
- **THEN** the two image files are byte-identical

#### Scenario: The boundary draws in full at the close end of the band

- **WHEN** the browser test opens a view a unit test has found **on** a chain of both sets,
  at a zoom of **20,000 light years** and again at **4,000**, at 1280x720, with the overlay
  on and again with it off, in each of `simplified` and `accurate`, and reads the frames
  within 8 CSS pixels of the projection of the centre
- **THEN** at 20,000 light years the frame with the overlay differs from the frame without it
  in both modes; at 4,000 the two frames are identical within that window, and no label
  names a region whose anchor is within 10,000 light years of the camera.

  The label clause is about the anchor's range and not the zoom. At a pitch of 35 degrees the
  frame at 4,000 light years still holds plane points out to about 26,300 light years, so
  regions far up the frame do carry names; what has gone is every name near the cursor, along
  with every line near it.

  The band this scenario reads is the range band and not the zoom band, so the reading at
  4,000 light years is a window and not the whole frame.

  20,000 light years is the closest range at which a line draws in full: the range fade
  reaches 1 at 20,000 and the zoom fade leaves 20,000 at 1, so both readings are 1 at the
  cursor's own range. At 4,000 the centre sits at the cursor, where the range fade is 0. The
  rest of the frame is not read there, because a line near the horizon is over 10,000 light
  years off and does draw, which is the whole point of the range fade.

  The centre has to be on both sets and not only on the traced one, because the smoothed line
  may sit 49.3 light years from the traced one. The two lines coincide over most of their
  length, so such a point exists: the search gives a point on a traced segment within half a
  light year of the smoothed set

#### Scenario: A far line still draws while the near line is gone

- **WHEN** the browser test opens a view at a zoom of **4,000 light years** at a pitch of
  **30 degrees**, in `accurate`, with the overlay on and again with it off, and counts the
  pixels the overlay changed in the **top 10 per cent of the rows** and in the rows **below 30
  per cent**
- **THEN** the top band holds changed pixels and the lower band holds none.

  The bands are set by the geometry and not by eye. The vertical field of view is 60 degrees,
  so the horizon sits at `0.5 - 0.5 * tan(pitch) / tan(30)` of the frame height from the top.
  A pitch of 30 degrees puts it at the top edge, so every row of the frame reads the plane. A
  lower pitch would put the horizon inside the frame and the rows above it would be sky, which
  is why this scenario does not read at a pitch of 5.

  At a zoom of 4,000 light years and a pitch of 30 the camera sits **2,000 light years** above
  the plane. The rows whose plane point is beyond 20,000 light years, where the range fade is
  1, are the top **11.0 per cent**; the rows whose plane point is under 10,000, where the fade
  is 0, are everything below **21.1 per cent**. The two bands this scenario reads, 10 per cent
  and 30 per cent, sit inside those and do not touch.

  The close end of the zoom band this replaces cleared both bands

#### Scenario: A boundary is visible at medium zoom

- **WHEN** the browser test opens a view at 20,000 light years centred on a plane point
  a unit test has found on a chain, reads the frame with the overlay on and with it off,
  and takes the largest change of any pixel
- **THEN** the first reading is at least 0.05 above the second, and with the overlay
  off the change is 0

#### Scenario: The overlay fades out across the close end of the band

- **WHEN** the browser test opens the view a unit test has found **on** a chain of both sets,
  the same view the scenario "The boundary draws in full at the close end of the band" opens,
  at zooms of **20,000**, **15,000** and **9,000 light years**, with the overlay on and again
  with it off, in each of `simplified` and `accurate`, and reads the overlay's own
  contribution as the **largest** difference within 8 CSS pixels of the projection of the
  centre, the frame with the overlay less the frame without it
- **THEN** in both modes the contribution at 15,000 is between a fifth and four fifths of the
  contribution at 20,000, and the contribution at 9,000 is zero.

  The centre sits at the cursor, so its range to the camera is the zoom. 15,000 light years is
  the middle of the smooth step, where the range fade reads 0.5, and 9,000 is below the 10,000
  at which it reaches 0. The bounds are wide because the reading is a pixel of the frame and
  not the fade itself.

  The view is named and not taken from the scenario before it, because the 8 CSS pixel window
  has to hold one chain and no other: the search that finds this view keeps every other chain
  clear of it, and the 25 light year search the medium zoom scenario uses does not

#### Scenario: The overlay fades out across the far end of the zoom band

- **WHEN** the browser test opens the same view at zooms of **20,000**, **25,000** and
  **31,000** light years and reads the band's contribution in each mode
- **THEN** in both modes the contribution at 25,000 is between a fifth and four fifths of
  the contribution at 20,000, and the contribution at 31,000 is 0

#### Scenario: The line is one tone and lightens what it crosses

- **WHEN** the browser test opens the crossing view of the drawn set at **3840x2160** at a
  zoom of **20,000 light years**, reads a row across a straight run of the band, and
  compares the middle of the run with its two ends
- **THEN** in both modes the middle of the run is lighter than both ends, and no pixel of
  the run is darker than the frame drawn with the overlay off

#### Scenario: A join is not brighter than the line

- **WHEN** the browser test opens a view at **3200x1800** at a zoom of **20,000 light
  years** on a bend of the smoothed set and reads the band's contribution at the bend and
  along a straight run of the same chain
- **THEN** no pixel at the bend has a contribution above the largest contribution of the
  straight run by more than the **half pixel sampling loss**, and no pixel of the bend has a
  contribution of 0.

  The sampling loss is `opacity * (3u**2 - 2u**3)` at `u = 0.5 / halfWidth`, which is
  **0.00071** at an opacity of 0.55 and a half width of 24. It is derived and not chosen.

  **Why a comparison of two peaks needs it.** The band's top is flat, so the largest reading
  of a run is the reading of the pixel nearest the middle of the line, and how near that is
  depends on where the pixel grid falls across the line. An arm of the traced set runs along
  a screen axis and a pixel row lands on its middle exactly; a chain of the smoothed set runs
  at an angle and cannot. The measured deficit is **0.000217**, which is the loss at an offset
  of 0.275 CSS pixels, inside the half pixel the bound allows. The rule is about the pass, and
  without this term the reading is about the pixel grid

#### Scenario: A 90 degree corner of the traced set is not brighter than its line

- **WHEN** the browser test sets the mode to `accurate`, opens a view a unit test has chosen
  at a 90 degree corner of the traced set at **3840x2160** at a zoom of **20,000 light
  years**, and reads the band's contribution at the corner and along each arm
- **THEN** no pixel at the corner has a contribution above the largest contribution of the
  arms. Both arms run along a screen axis, so a pixel row lands on the middle of each and the
  sampling loss of the scenario above is 0 here. The `MAX` blend holds this exactly, and the
  reading carries **no tolerance**: the corner and the arm read the same number to the last
  digit

#### Scenario: The corner of the traced set is round to the band's half width

- **WHEN** the browser test reads the outer edge of the band around the same 90 degree
  corner and fits a radius to it
- **THEN** the radius is the band's own half width, **24.0 CSS pixels** at 2,160 rows,
  within **2.0** CSS pixels, so the corner is round without a blur.

  24 is the clamp and not 1.6 per cent of 2,160, which is 34.56. The clamp holds the half
  width at 24 from 1,500 rows up, and the scenario above this one opens the same corner at
  3840x2160

#### Scenario: The overlay costs under a millisecond

- **WHEN** the browser test opens a view at 1920x1080 in `accurate` at a zoom of 4,000
  light years, which is the closest zoom the overlay draws at, and reads the frame time
  with the overlay on and with it off
- **THEN** the two readings differ by 1 ms or less

### Requirement: The region overlay has three modes and starts on the traced set

The map SHALL expose a region mode with exactly three values: `off`, `simplified` and
`accurate`. **`accurate` SHALL be the default.**

- `off` SHALL draw no boundary line and place no label.
- `simplified` SHALL draw the smoothed boundary set.
- `accurate` SHALL draw the traced boundary set. It SHALL place the same labels
  `simplified` places, and both SHALL draw through the same pass at the same width, which
  the requirement "The boundaries draw as one wide soft band" states.

**The default was `simplified`.** The smoothed set exists to turn the raster's staircase
into a curve, and it buys that by moving the line: its departure from the region data
measures 49.342 light years against a bound of 49.3494, so it has spent the whole of what
the data's own resolution allows. The band is now wide enough to hide the staircase without
moving the line at all, so the map's default is the set that departs from the data by 0.
`simplified` stays, for a host that wants the curve.

`GalaxyMapOptions` SHALL carry an optional `regionMode`. The handle SHALL carry
`getRegionMode()` and `setRegionMode(mode)`. `setRegionMode` SHALL take effect in the next
frame and SHALL NOT rebuild the scene data, because the worker builds both sets in one
pass and the renderer holds both.

A value that is not one of the three SHALL leave the mode unchanged, and `setRegionMode`
SHALL report nothing: the reader of a whole data set reports its rejects, while a mode is
one value the host controls directly.

The `regions` pass switch SHALL stay as it is, a renderer probe the browser tests read. A
switch of `off` and a mode of `off` SHALL draw the same frame, so the two never disagree.

**Where the two sets differ.** The two sets differ in where the line sits, not in what the
data says. The smoothed line may sit up to 49.3494 light years from the boundary the region
data holds. **At 1,080 CSS rows** and a 60 degree vertical field of view, one CSS row covers
`1.1547 * distance / 1080` light years, so the departure in CSS pixels is about
`46,157 / distance`: 4.6 pixels at a range of 10,000 light years, 2.3 at 20,000 and 1.5 at
30,000.

A line draws only at a range of 10,000 light years and beyond, so the departure runs from
about 4.6 CSS pixels at the near end of that band down to about 1.5 at the far end. The band
is **34.6** CSS pixels wide at 1,080 rows, so the two sets sit between a **seventh** and a
**twenty-third** of a band apart everywhere the overlay draws.

**The mode therefore changes little on the screen, and that is the reason the default
moves.** When the band was 6 CSS pixels the same 4.6 pixel departure was most of a band and
the choice was a real one. At 34.6 it is not, so the map should draw the set that departs
from the region data by **0** and let the smoothed set be the option. Above about 25,000
light years the two draw within 2 CSS pixels of each other and the mode changes almost
nothing at all.

**Neither mode blurs.** The blur is gone from the pass, so the two sets differ in the line's
**position** alone and in nothing else about how it is drawn.

#### Scenario: The default mode is accurate

- **WHEN** the browser test creates a map with no `regionMode` in the options and reads
  `getRegionMode()`
- **THEN** it is `accurate`

#### Scenario: The options choose the mode

- **WHEN** the browser test builds a map through the library entry point with
  `regionMode` of `accurate`, of `off`, of the string `precise`, with an empty options
  object and with no options at all, and reads `getRegionMode()` on each
- **THEN** the readings are `accurate`, `off`, `accurate`, `accurate` and `accurate`, so a
  value the map does not know takes the default as a bad value on `setRegionMode` leaves the
  mode

#### Scenario: Each mode draws its own frame

- **WHEN** the browser test opens a view a unit test has chosen at a 90 degree corner of
  the traced set, at **1280x720** at a zoom of **12,000 light years**, and takes a digest of
  the canvas in each of the three modes
- **THEN** the three digests differ from one another.

  The view has to sit at a corner. The two sets carry the same line along a straight run of
  the boundary, so a view chosen anywhere else can draw the same frame in `simplified` and in
  `accurate`, and the reading would then say nothing about the mode. 12,000 light years is
  inside the band where the overlay draws in full. The scenario states the viewport because
  the departure of the two sets follows it: at 1280x720 the two lines sit about **2.56** CSS
  pixels apart there against a band of **23.0** CSS pixels, which is about a ninth of a band
  and still moves enough pixels to change a digest

#### Scenario: The off mode removes both parts

- **WHEN** the browser test opens `#c=15,0,25895&d=20000&p=35&y=0`, sets the mode to `off`
  and reads the page and the frame
- **THEN** the page holds no region label, and the frame is byte-identical to the frame
  the same view draws with the `regions` pass switch off

#### Scenario: The mode changes without a rebuild

- **WHEN** the browser test opens a view, sets the mode to `simplified`, draws one frame,
  sets it back to `accurate` and draws one more, and reads how many times the scene data
  loaded
- **THEN** the frames differ, the scene data loaded once, and neither change waited for a
  load

#### Scenario: The labels do not follow the mode

- **WHEN** the browser test opens `#c=15,0,25895&d=20000&p=35&y=0` in `simplified` and in
  `accurate`, and reads the text of every label
- **THEN** the two label sets hold the same names in the same order

#### Scenario: A bad mode changes nothing

- **WHEN** the browser test sets the mode to `simplified`, then calls `setRegionMode` with
  the string `precise` and with `undefined`, and reads the mode
- **THEN** it is still `simplified`

### Requirement: The region worker builds a flow field toward each region's centre

The region worker SHALL build a **flow field** over the coarse region grid and SHALL send it
in the same message as the boundary sets and the grid. The field SHALL hold one byte for
each cell of the coarse grid, so it is 507 by 507 bytes, which is 251 KiB, and it SHALL be
transferable without a copy.

The byte of a cell SHALL name the step to take from that cell to come nearer its **own
region's centroid while staying on its own region**. The step SHALL be one of the eight
neighbours of the cell, or a ninth value that means the cell is at the end of its path. A
cell that holds no region SHALL take the ninth value.

One field SHALL cover all 42 regions, because a cell belongs to exactly one region and the
step it holds is a step inside that region.

The field SHALL be built by a breadth-first walk over the cells of one region at a time,
from the cell that holds that region's centroid, or, where the centroid's own cell is not on
the region, from the cell of the region nearest it. A cell reached by the walk SHALL point
back along the edge the walk reached it by. A cell of the region the walk never reaches SHALL
take the ninth value, because no path inside the region joins it to the centre.

**The field is what lets a label cross a region that lies in its way.** A region is not a
convex shape and it can show as separated patches, so the straight line on the plane from a
label to its region's centre can run over a third region. The requirement "A region in view
carries a label that fades with its own range" states how the label follows the field.

The walk SHALL run once, off the main thread, over the 257,049 cells of the coarse grid. Its
cost does not follow the star systems the map holds, and the main thread never builds it.

#### Scenario: The field is sent with the boundary sets

- **WHEN** a unit test runs the region worker's build and reads the response
- **THEN** it carries the flow field beside the two boundary sets and the coarse grid, the
  field holds 507 by 507 bytes, and its buffer is in the transfer list

#### Scenario: Every step stays on its own region

- **WHEN** a unit test walks every cell of the field that holds a region and takes the step
  its byte names
- **THEN** the cell the step reaches holds the same region id as the cell it left

#### Scenario: Following the field reaches the centre

- **WHEN** a unit test starts at every cell of the field that holds a region and follows the
  steps until a cell takes the ninth value
- **THEN** every walk ends and no walk visits a cell twice; every walk that started at a cell
  the build's own walk reached ends at that region's root cell; and a walk that started at a
  cell the build never reached ends at once, on that cell

#### Scenario: The shipped data has no region the field cannot cross

- **WHEN** a unit test builds the field over the shipped coarse grid and counts, for each of
  the 42 regions, the cells of that region the build's walk did not reach
- **THEN** the count is **0** for every region, so on the shipped data every label has a path
  to its own region's centre.

  The count is a fact of the pinned `@elite-dangerous-almanac/core` and of the 197.3976 light
  year coarse cell, not a property the build guarantees. A release that splits a region into
  parts the coarse grid cannot join makes this count non-zero and fails this test, which is
  where such a release is meant to be caught

#### Scenario: The field crosses a region that lies in the way

- **WHEN** a unit test builds a grid holding one region shaped as two lobes joined by a
  neck, with a second region filling the gap between the lobes, and follows the field from a
  cell of the far lobe
- **THEN** the walk goes through the neck and reaches the centre cell, and no cell of the
  walk holds the second region. A straight line between the two ends crosses the second
  region
