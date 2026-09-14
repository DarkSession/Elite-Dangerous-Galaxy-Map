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
lighter colour and the outline SHALL be the darker one, so the line reads against both
the dark space between the arms and the bright disc.

Where two segments of a chain meet, the line SHALL NOT be brighter than a straight run of
the same chain, and SHALL show no gap. A join is where a naive draw of one quad per
segment shows its seams: the two quads overlap, and drawn straight onto the frame the
overlap blends twice. The rule SHALL hold for the traced set as well, whose joins are 90
degree corners and are the hardest case the pass draws.

The lines SHALL fade in as the zoom distance falls: nothing at 30,000 light years and
above, full at 20,000 and below. They SHALL NOT fade out at close zoom. A smoothed
boundary does not read as a staircase, which is why the phase 2 fade out below 3,000
light years is removed.

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

- **WHEN** the browser test opens at 1,500 light years, at 500 and at 10, with the overlay
  on and again with it off, in each of `simplified` and `accurate`, centred on a plane
  point a unit test has found within 25 light years of a chain of **both** sets
- **THEN** at all three distances and in both modes the frame with the overlay differs
  from the frame without it.

  The centre has to be near both sets and not only near the traced one. At a zoom of 10
  light years the frame covers about 12 light years across the cursor, while the smoothed
  line may sit 49.3 light years from the traced one, which is the whole reason the
  `accurate` mode exists. A point chosen against one set alone can therefore leave the
  other set's line outside the frame. The two lines coincide over most of their length, so
  such a point exists

#### Scenario: The line is four CSS pixels wide and two-toned

- **WHEN** the browser test opens a view a unit test has chosen so that a boundary chain
  crosses the frame within 5 degrees of vertical, reads one horizontal row of pixels
  across it, converts the run from device pixels to CSS pixels by the device pixel ratio,
  and compares it with the same row with the overlay off, in each of `simplified` and
  `accurate`
- **THEN** in both modes the run of changed pixels is 4 CSS pixels wide within 1 CSS pixel,
  the middle of the run is lighter than both ends, and both ends are darker than the same
  pixels with the overlay off

#### Scenario: A join is not brighter than the line

- **WHEN** the browser test opens a view a unit test has chosen at a place where the
  drawn line **turns by at least 30 degrees within a reach of 8 CSS pixels**, and reads
  the luminance of every pixel the overlay changes within 8 CSS pixels of that place
- **THEN** taking each pixel's change as the frame with the overlay less the frame
  without it, no pixel at the bend has a larger change than the largest change on a
  straight run of the same chain in the same frame, and no pixel inside the bend is
  unchanged.

  The bend is measured over a reach and not between two neighbouring segments, because
  the requirement above holds every single vertex of the smoothed set to 20 degrees, so no
  two neighbouring segments of it can meet under 160 degrees. That does not make the join
  weaker as a test: it makes it stronger. The median segment of the drawn set is 5.09 light
  years, which is about 10 CSS pixels at a zoom of 500 light years, against a line 4 CSS
  pixels wide, so the ribbon quads of a bend overlap more than they did when a bend was one
  sharp corner. The comparison is of the overlay's own contribution, because the overlay
  draws at less than full opacity and the galaxy under a corner can be brighter than the
  galaxy under a straight run

#### Scenario: A 90 degree corner of the traced set is not brighter than its line

- **WHEN** the browser test sets the mode to `accurate`, opens a view a unit test has
  chosen at a lattice node where the traced line turns by 90 degrees, at a zoom that puts
  the two segments at more than 20 CSS pixels each, and reads the overlay's own
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

A label's anchor SHALL be the projection of the mean of the plane positions of the
samples its region holds, when the region under that mean is the same region. When it is not, the anchor
SHALL be the projection of the plane position of **the sample its own region holds whose
plane position is nearest that mean**.
Taking the nearest sample of any region would put the anchor on the region the mean
landed on, which is the region the fallback exists to avoid. A region can appear in the frame as
two separated patches, and the mean of those falls between them, on a different region;
the second rule is what puts the anchor on the region in that case.

The anchor SHALL move in every frame in which the camera moves, and SHALL NOT snap to the
grid of sample points. While a region shows as one connected patch, a camera turn of 0.1
degrees between two frames SHALL move its anchor, and SHALL move it by less than 8 CSS
pixels.

Both halves are needed. A rule that snaps to the nearest sample moves the anchor a whole
sample spacing at once, 32 CSS pixels, which the upper bound catches. A rule that
averages sample positions in screen space passes that upper bound easily, at a worst move
of 1.0 CSS pixels, and still reads as jumping, because the anchor is unmoved in 58
percent of frames and carries the whole motion in the rest. Only the lower bound catches
that one.

A region whose anchor is held from the frame before SHALL keep it while the region under
that anchor is still the same region and the anchor still projects inside the frame. This
keeps the anchor on one point of the galaxy rather than letting it move between two
samples that are almost equally near the mean. The projection of that point still moves
with the camera, so holding it does not hold the label still on the screen.

The anchor SHALL then be held inside the viewport with an inset of 48 pixels, which only
moves a label whose box would otherwise cross the frame edge.

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
for the game data behind them. If the built bundle carries the package's procedural
naming tables, the file SHALL also hold the BSD 3-Clause text those tables require.

#### Scenario: The notice names every source

- **WHEN** a unit test reads `THIRD_PARTY_NOTICES.md`
- **THEN** it names `EliteDangerousRegionMap`, `MIT`, `Frontier` and
  `@elite-dangerous-almanac/core`

#### Scenario: The bundle carries no unlicensed table

- **WHEN** a test runs `pnpm build` and searches the built bundle for the package's
  procedural naming tables
- **THEN** either the tables are absent, or `THIRD_PARTY_NOTICES.md` holds the BSD
  3-Clause text in full
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

The two sets differ in where the line sits, not in what the data says. The smoothed line
may sit up to 49.3494 light years from the boundary the region data holds. At 1,080 CSS
rows and a 60 degree vertical field of view, one CSS row covers `1.1547 * distance / 1080`
light years, so that departure is 92 CSS pixels at a zoom of 500 light years and about
4,600 at a zoom of 10, and it falls under one CSS pixel only above a zoom of about 46,000.
The overlay does not draw above 30,000, so the departure is always at least 1.5 CSS pixels
where the user can see it, and it is the close zoom that makes it matter, which is where a
user asks which region a system is in.

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
  and in `accurate`, and the reading would then say nothing about the mode

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
  worker

#### Scenario: The labels do not follow the mode

- **WHEN** the browser test opens `#c=15,0,25895&d=20000&p=35&y=0` in `simplified` and in
  `accurate`, and reads the text of every label
- **THEN** the two label sets hold the same names in the same order

#### Scenario: A bad mode changes nothing

- **WHEN** the browser test sets the mode to `accurate`, then calls `setRegionMode` with
  the string `precise` and with `undefined`, and reads the mode
- **THEN** it is still `accurate`
