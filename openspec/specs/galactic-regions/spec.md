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

### Requirement: The boundary set is built from one trace of the region grid

The map SHALL build the region boundary set off the main thread. The build SHALL
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

The build SHALL emit **one** set from that trace, the **traced set**, and SHALL emit it in
one message.

**The build emitted two sets.** The second was the **smoothed set**, which the `simplified`
region mode drew. That mode is gone, and the requirement "The region overlay has a host
switch and starts on" states why, so the set it drew goes with it. The build SHALL NOT pack it,
SHALL NOT transfer it and SHALL NOT upload it: it held **68,672** vertices against the
traced set's 5,727 on the pinned package, which is **805 KiB** of `float32` positions that no
longer cross the worker boundary or reach the card.

**What the boundary of the data is.** The trace runs along the corners of the cell
lattice, and a lattice corner sits up to **half a cell** from the edge it marks. The
boundary the data actually states is the **midpoint of every unit edge** between two cells
that hold different ids: that midpoint is the one point the two cells agree on. A polyline
along the lattice corners is therefore already **17.4 light years** from the polyline through
those midpoints. That is `sqrt(2) / 4` of a cell, the distance from the corner of a 45 degree
staircase to the midpoint line it steps about, and a curve is not less faithful for leaving
the staircase. Every departure bound below is measured to the **midpoint polyline**, and to
the lattice polyline, and never to either as a set of points.

**The traced set.** Each chain SHALL be drawn through the midpoint of each of its unit
edges, keeping its two ends, and that midpoint polyline SHALL then be smoothed. The
smoothing SHALL average along the chain and SHALL hold every interior point within **half a
cell** of the midpoint the trace gives it, so the set never claims a position the two cells
either side do not agree on. The set SHALL then take a vertex reduction.

The traced set SHALL NOT take a corner round. The band's
coverage is the exact distance to the nearest segment under a `MAX` blend, so the outside of
a corner is already round to the band's half width and a corner round in the geometry does
the same work a second time. Measured at the sharpest corner of the set, a turn of 92.61
degrees on the set the sample built, at the ranges 10,000, 16,000 and 20,000 light years, a
round of two capped passes
moves no channel by more than **9 of 255** and moves the mean by 0.030, while it takes the
set from 5,727 vertices to 22,908.

The 9 of 255, the 0.030 and the 92.61 degrees beside them are readings of an **offline** render
of the pass and nothing in this repository reproduces them, so all three stay as the sample took
them. The 92.61 degrees named elsewhere in this requirement is a **live** reading of the
sharpest vertex and moves with the data; the two agree today and need not agree tomorrow. The 22,908 is not:
`roundChain` doubles a chain in each pass, so it is four times the vertex count the unit
scenario "The traced set drops the straight runs" measures, and it moves with it.

The traced set SHALL meet four bounds at once.

- **It SHALL stay within one grid cell, 49.3494 light years, of the data**, measured from
  every point of the drawn chain to the nearest point of the **polyline through the edge
  midpoints**, and not to the nearest midpoint taken as a point. A chain lying exactly on the
  boundary reads half a cell against the points and 0 against the polyline, so the point
  measure would read the spacing of the reference and not a departure. On the pinned package the
  reading is **26.6** light years, which is nearer the data than the lattice polyline's own
  17.4 plus the half cell it is allowed.
- **It SHALL stay within one grid cell of the lattice polyline**, so it keeps the shape the
  trace found. On the pinned package the reading is **31.1** light years.
- **It SHALL read as a line and not as a staircase.** The measure is the **roughness**: the
  root mean square departure of the drawn chain from the straight line fitted to a sliding
  window of **8 cells** of arc. The median over the set SHALL be at most **0.03 cells** and
  the 90th percentile at most **0.08**. On the pinned package the readings are **0.013** and
  **0.050**, against **0.272** and **0.303** for the lattice polyline.

  The reading is of the **drawn line** and not of its vertices, so each chain is first
  resampled at a quarter of a cell along its arc. A reading at the vertices alone would
  measure where the vertices fall.
- **It SHALL keep the corners of the region data.** At least one vertex SHALL turn by
  more than **25 degrees**. On the pinned package the sharpest vertex turns by **92.61**
  degrees. A real corner of the region data is a fact about the galaxy, and the map draws it.

The roughness is what the fault was. A step of the lattice measures 4.62 CSS pixels at a
range of 10,000 light years on 1,080 rows. That is 0.133 of a 34.6 CSS pixel band, and one
step alone does not read. The staircase is **periodic** and it runs along the boundary, so
the eye reads the repeat. The roughness above measures the repeat and not one step: the
lattice polyline reads 0.272 cells, which is 1.26 CSS pixels at that view, and the traced set
reads 0.013 cells, which is 0.06.

The traced set SHALL also hold two length-weighted turn bounds: at most 60 degrees for each
1,000 light years over the whole set, and at most 100 for each chain on its own. On the
pinned package the readings are **33.08** and **82.43**. The second bound is needed because
the first is length-weighted, so the few longest chains set it and a short chain could wander
freely inside it. The user looks at one boundary at a time, so the property has to hold for
one boundary at a time.

The traced staircase measures 1,062.75 degrees per 1,000 light years over the whole set, so
the two bounds are what separate a smoothed line from a rounded staircase.

The set SHALL NOT hold a 20 degree bound on a single vertex. That bound rounds a real corner
of the region data away, and the smoothed set that held it is gone.

The vertex reduction SHALL take the set to **between 4,000 and 12,000 vertices**,
which is at most 140.6 KiB, so it uploads once. On the pinned version
of `@elite-dangerous-almanac/core` the trace holds 38,686 nodes and the set holds **5,727**
vertices, which is 67.11 KiB. The bound is a
range and the figures are a reading: the region cells come
from the pinned package, so a release that redraws a region moves every reading without any
defect in this map. The scenario "The package constants hold", of the requirement "The region
data comes from the almanac", is where a package release is meant to fail the suite.

The set SHALL be typed arrays only and transferable without copying. It SHALL hold
the vertices of every chain in one array of three `float32` per vertex, with the first and
last index of each chain, so a vertex shared by two segments is stored once.

#### Scenario: The boundary is a small number of chains

- **WHEN** a unit test builds the boundary set
- **THEN** it holds between 100 and 200 chains, and every chain has at least two vertices

#### Scenario: A chain separates one pair of regions

- **WHEN** a unit test walks every chain of the untouched trace and reads the pair of
  region ids on the two sides of each of its edges
- **THEN** every edge of a chain carries the same pair, and no two chains share an edge

#### Scenario: The traced set stays near the data

- **WHEN** a unit test measures, for every chain of the traced set, the largest distance from
  a point of the drawn chain to the **polyline through the midpoints** of the unit edges of
  the trace, and the largest distance from a point of the drawn chain to the lattice polyline
- **THEN** both are at most 49.3494 light years. On the pinned package the readings are 26.6
  and 31.1 light years

#### Scenario: The traced set reads as a line

- **WHEN** a unit test fits a straight line to every window of 8 cells of arc of every chain
  of the traced set, and reads the root mean square departure of the chain from that line
- **THEN** the median over the set is at most 0.03 cells and the 90th percentile at most
  0.08, and the same two readings over the lattice polyline are above 0.25. On the pinned
  package the readings are 0.013 and 0.050 against 0.272 and 0.303

#### Scenario: The traced set keeps the corners of the data

- **WHEN** a unit test reads the largest turn at a single vertex of the traced set
- **THEN** the reading is above 25 degrees. On the pinned package it is 92.61 degrees

#### Scenario: The traced set holds the turn bounds of a line

- **WHEN** a unit test adds the absolute turn angle at every vertex of the traced set and
  divides by its drawn length, and then measures the same ratio for each chain on its own
- **THEN** the whole set is at most 60 degrees for each 1,000 light years and no single chain
  is above 100, and the same whole-set measure over the **untouched trace** is more than
  1,000. The test reads `tracedPolyline(grid, index)`, the lattice polyline, and not the set
  the pass draws. On the pinned package the readings are 33.08 and 82.43

#### Scenario: The traced set drops the straight runs

- **WHEN** a unit test reads the vertex count of the traced set and the node count of the
  untouched trace
- **THEN** the set holds between 4,000 and 12,000 vertices and fewer than the trace has
  nodes. On the pinned package the readings are 38,686 nodes and 5,727 vertices, which is
  67.11 KiB

#### Scenario: The worker emits one set

- **WHEN** a unit test reads the message the region worker posts, and searches the built
  worker chunk for the smoothed set's own packing entry point
- **THEN** the message carries one boundary set and no second one, and the chunk holds no
  call of that entry point

#### Scenario: The set is deterministic

- **WHEN** a unit test builds the boundary set twice
- **THEN** the arrays of each build are byte-identical to the arrays of the other

#### Scenario: The set is transferable

- **WHEN** a test posts the boundary set through a `MessageChannel` with its buffers in
  the transfer list
- **THEN** the receiver gets equal contents and every sender buffer has length 0

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

The repository SHALL hold **two** `THIRD_PARTY_NOTICES.md` files, and each source SHALL
be in one of them alone.

**`packages/galaxy-map/THIRD_PARTY_NOTICES.md`** SHALL name what the package ships: the
almanac package and klightspeed's EliteDangerousRegionMap under MIT for the region
tables, Frontier Developments' media-usage rules, which are non-commercial, for the game
data and the art, the two bundled font families, and the selection pin. It SHALL NOT name
a data set the tarball does not carry. It ships in the tarball, so a source it names that
the tarball leaves out tells a host it installed something it did not.

**`THIRD_PARTY_NOTICES.md` at the repository root** SHALL name the sources of everything
beside the package: the demo site's data sets, which `dataset-catalog` lists, the loading
image the demo site serves from `public/`, the committed test extracts and the design
mockup. It SHALL point at the package file for the library's own sources.

The Frontier terms are the one statement in both files, because the package ships game
art and the demo site draws game data.

**The notices SHALL NOT give one kind of game content a section of its own.** The galaxy
data, the object records and the art are one source under one set of terms, and a section
for each invites a reader to think the terms differ. A part of the map that is this
project's own work SHALL carry no section at all, because a notices file lists what the
project does not own.

If **either build** carries the package's procedural naming tables, the package file SHALL
also hold the BSD 3-Clause text those tables require.

The repository emits two builds, the library and the demo site, so the search reads both.
The demo site is the one the public loads, and the library is the one another project
installs, so a table that reaches either one reaches a user.

**The root file SHALL also name `EDSM`**, the name lookup the Adamastor converter reads to
turn a route point into a position. The lookup runs in the converter, at build time, and
its answers are committed in the JSON, so the map makes no call to it. A source the
repository reads is a source the notices name, whether the map reads it or the build does.

#### Scenario: The notice names every source

- **WHEN** a unit test reads both notices files
- **THEN** the package file names `EliteDangerousRegionMap`, `MIT`, `Frontier` and
  `@elite-dangerous-almanac/core`, and the root file names `EDLoader1.svg`,
  `Guardian Structures`, `Notable Systems`, `UIA`, `Adamastor` and `EDSM`

#### Scenario: The package notices name nothing the tarball leaves out

- **WHEN** a unit test reads the package's notices file
- **THEN** it names no demo data set, no file under `apps/demo/` and no file under
  `.design/`, and the two files share one heading, which is the Frontier one

#### Scenario: The bundle carries no unlicensed table

- **WHEN** a test runs `pnpm build` and `pnpm build:demo-site` and searches both outputs
  for the package's procedural naming tables
- **THEN** either the tables are absent from both, or the package's
  `THIRD_PARTY_NOTICES.md` holds the BSD 3-Clause text in full

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

### Requirement: The boundaries draw as a wide band with a light core over a smoothed line

The boundary chains SHALL draw as lines on the plane `y = 0`, after the tone map, so no
look constant of the far view changes them and none of them changes the far view. They
SHALL be drawn camera-relative, as every other pass is.

The pass SHALL draw the **traced set**, which is the one set the worker builds. The region
overlay took three modes and now takes one switch, which the requirement "The region overlay
has a host switch and starts on" states, so no reading of this requirement follows a mode.

**The line is a band of two tones: a deeper outer band with a lighter core down its
middle.** One flat tone read as a wash of colour laid over the map. Two tones read as a
line: the outer tone marks the width of the boundary and the core marks where the boundary
itself runs.

- The **outer tone** SHALL be `(0.74, 0.55, 0.43)`, a deep amber. Its luminance by the
  Rec.709 weights is **0.581**.
- The **core tone** SHALL be `(0.90, 0.79, 0.52)`, a light amber of the same hue family.
  Its luminance is **0.794**.
- The **opacity** SHALL be **0.62** where the overlay draws in full, for both tones.
- **The half width SHALL follow the range from the camera to the point of the line.** Let

  `base = clamp(0.016 * viewportHeightCss, 8, 24)`

  which is the rule the band held before, and let `range` be the distance in light years
  from the camera to that point of the line. Then

  `halfWidth(range) = clamp(base * 12000 / range, 2, base)`

  so the band keeps the width it had at a range of **12,000 light years**, narrows as
  `1 / range` beyond it, and never grows above `base` nearer than that. At 1,080 CSS rows
  `base` is 17.28, so the whole band measures **34.6** CSS pixels at 12,000 light years and
  nearer, **20.7** at 20,000, **13.8** at 30,000, **10.4** at 40,000 and **6.9** at 60,000.

  **A far band drew as wide as a near one, and that is the fault this rule answers.** A
  region at the far side of the galaxy is a few hundred CSS pixels across on the screen, so a
  band of 34.6 read as a stripe laid over it, while the same band over a near region read as
  a line. A boundary bounds an area of the plane, so its width belongs to the picture and
  follows the picture.

  **12,000 light years is the width's own reference range, and it is no longer the range at
  which the range fade reaches full.** The two were one figure, and this change moves the
  fade to 5,000 and 8,000 light years and leaves the reference range at 12,000. They are now
  two figures: the fade says **where** a line draws and the reference range says **how wide**
  it is. No line therefore changes width at any range, and the band is at its widest over the
  whole of the fade band, which ends 4,000 light years nearer than the reference range.

  **The floor of 2 CSS pixels** keeps a far line drawn. At 1,080 rows it binds at a range of
  103,680 light years, which is past the far side of the galaxy from most views, so it is a
  guard and not a shaper.

  The half width SHALL be read **for each end of a segment** and SHALL be interpolated along
  it, so a segment that runs away from the camera narrows along its own length. A segment of
  the traced set has a median length of 185 light years, so a per-segment width would step at
  every vertex of a chain that runs into the distance.
- The coverage the pass writes SHALL be `max(0, 1 - gap / halfWidth)`, where `gap` is the
  distance from the middle of the line in CSS pixels, evaluated for each device pixel of the
  ribbon quad, in a single-channel buffer at the **full drawing buffer resolution**. This
  rule does not change either: both tones are read from that one channel.
- **The edge SHALL be a quarter of the half width**, and the top of the band SHALL be flat
  over the rest of its width. The alpha SHALL be `smoothstep(0, 0.25, coverage)`, so the
  alpha is 1 wherever the gap is under `0.75 * halfWidth` and falls to 0 over the quarter
  outside that.

  **The edge is a share and no longer a width in CSS pixels.** It was `min(0.25, 4 / halfWidth)`,
  which is 4 CSS pixels held under a quarter, and the quarter bound already
  acted at every half width under 16. With the half width following the range, a fixed 4 CSS
  pixel edge would take the whole of a band that is 6.9 CSS pixels wide at 60,000 light
  years, and the far line would be an edge with no band inside it. A share keeps one profile
  at every width: the band narrows and the shape of it does not change. At 1,080 rows and
  the reference range the edge is 4.3 CSS pixels, against the 4.0 the old rule gave there.
- **The core SHALL be the middle quarter of the band.** The tone SHALL be
  `mix(outer, core, m)` with `m = smoothstep(0.75 - c, 0.75 + c, coverage)`, where
  `c = 0.087` is the transition measured as a share of the half width. The core therefore
  runs where the gap is under `0.25 * halfWidth`, which is **8.6 CSS pixels** across at
  1,080 rows at the reference range, against the band's 34.6.

  The transition is a share for the reason the edge is a share, and 0.087 is the figure that
  reproduces the 1.5 CSS pixel ramp the old rule gave at 1,080 rows: `1.5 / 17.28`. The core's
  own flat part, where `m` is 1, is `2 * halfWidth * (0.25 - c)` wide, which is **0.326** of
  the half width at every width and 5.6 CSS pixels at 1,080 rows at the reference range.
- Where two quads of one join overlap, the buffer SHALL keep the larger coverage, which is
  the smaller distance. A join therefore reads as a straight run reads and not as twice one.

**Both parts are read from the one coverage channel**, so the pass holds the same single
target it held and the two tones cost one `mix` for each pixel of the composite.

**Why a flat top and a short edge.** The alpha was `smoothstep(0, 1, coverage)`, which rises
over the whole half width, so the band had no width at which it was itself: it was a soft
ridge that reached its tone at one line of pixels. Over the galaxy that reads as a smear of
colour. The reference the look follows draws a band with a flat top and an edge of about a
fifth of its half width, and the core inside it.

`base` is a share of the viewport and not a fixed number of CSS pixels because the band is
wide. A fixed 34.6 CSS pixels would cover a tenth of a 360 row window and a sixtieth of a
2,160 row one, and the boundary would read as a different thing on each. The clamp holds the
band readable at a small window and stops it growing past a reading at a large one. The
range term then narrows that width with depth, and the two terms multiply.

**The width is not what hides the raster, and the pass SHALL still NOT blur.** The region
data is a grid of 49.3494 light year cells. The change before this one answered the
staircase with the band's width alone, on the reading that one cell measures
`46,157 / range` CSS pixels at 1,080 rows and a 60 degree vertical field of view, so at the
nearest range that draws, which is now **5,000** light years, a cell is **9.23** CSS pixels
against a band of 34.6, which is **0.267** of it.

That reading is right and the conclusion drawn from it was wrong. It prices **one step in
isolation**. The staircase is periodic and it runs along the boundary, so the eye reads the
**repeat** and not one step, and the band's edge carries a regular saw tooth. The line is
smoothed instead, which the requirement "The boundary sets are built from one trace of the
region grid" states, and the drawn set reads **0.06** CSS pixels of roughness at that view
against the lattice polyline's **1.26**.

The band's width stays what it is, and one of the two readings that were given for it still
holds:

- **The corner is already round.** The coverage is an exact distance from the **segment**
  and not from an infinite line, and the pass blends with `MAX`, so the sharpest corner of
  the traced set is a round turn of the band's own half width **at that corner's range**,
  which is **17.28 CSS pixels** at 1,080 rows at the reference range and narrows with it. A blur of standard deviation 1 to 2.667 CSS pixels cannot make it rounder. This is
  why the pass needs no blur; it is not why the line needs no smoothing.

The normalisation SHALL therefore be 1, and the pass SHALL hold **one** full-resolution
coverage target and not three.

**What each tone carries.** The old 6 CSS pixel line carried a dark outline, which the one
cream tone of 0.755 luminance replaced: that tone lightens every part of the frame but the
galactic core. The two tones of this requirement carry it by **contrast between themselves**
as well. The outer tone at 0.581 is below the tone-mapped core, which reads about 0.93, and
above the dark space between the arms, which reads about 0.05, so the band lightens the
picture over most of it and darkens the brightest part of it. The core tone at 0.794 stands
0.213 above the outer tone, and at an opacity of 0.62 that is **0.132** of luminance the
core adds over the outer part, whatever the picture under the band, because both are laid
over the same background at the same opacity. A boundary therefore reads as a line over
the galactic centre, where a single tone had least to work with.

**A line goes out by its own range to the camera, and the overlay goes out by the zoom at
the far end alone.** Two fades SHALL multiply.

**The range fade** SHALL be read for each pixel, from the camera's distance to the point of
the galactic plane under that pixel:

- nothing at **5,000** light years and below,
- rising on a smooth step to full at **8,000**,
- full above 8,000.

**The two figures were 8,000 and 12,000, and 10,000 and 20,000 before that.** They still took
the lines away further out than the owner wants: a line first drew at 8,000 light years and
did not reach full strength until 12,000, so a view of a neighbourhood carried no boundary
over the ground near the cursor. The band now opens 3,000 light years nearer again and
reaches full 4,000 light years nearer.

**The zoom fade** SHALL be read once for the frame, from the camera's distance to the
cursor:

- full at **20,000** light years and below,
- falling on a smooth step to nothing at **30,000** and above.

The zoom band has no close end. The range fade above holds that end per pixel instead,
because a zoom is one number for the whole frame and the lines in that frame are not all at one
range. At a zoom of 6,000 light years the boundary a few hundred light years from the cursor
is under the 5,000 light year floor and the boundary near the horizon is 40,000 light years
off, well above it. The close end of the old zoom band took both away, so a user who zoomed in
to read a neighbourhood lost the region lines of the whole galaxy around them and not only the
one under the cursor.

The close end is per pixel because one frame holds lines whose ranges are far apart, and the
floor cuts the near ones and keeps the far ones. **It is not there to hide a staircase.** The
drawn set is smoothed, so the near line carries none, and the retired reading above is the one
this paragraph used to rest on. What the floor buys is stated in "What the close zoom shows
instead" below: under 5,000 light years the map names the region in the HUD's top bar, which
reads at every zoom, instead of drawing a boundary that would cross the frame as one band.

**The plane point under the pixel** is what the range is measured to. The boundary chains
are drawn on the plane `y = 0`, so for any pixel a line covers, that point is the line's own
point and the reading is exact. Where the ray through the pixel does not meet the plane in
front of the camera, which is a pixel above the horizon, the fade SHALL be full. Nothing of
the boundary set is drawn there.

The range fade above is the only fade the line takes over its own distance, and it needs
no second channel in the coverage buffer: the composite pass reads the plane point under
each pixel from the frame's own projection, so the coverage buffer SHALL stay one channel.

**What the close zoom shows instead.** Below 5,000 light years of range the map draws no
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
overlap blends twice. The rule SHALL hold for the sharpest corner of each set, which is the
hardest case the pass draws. With no blur in the pass the `MAX` blend equation holds the rule
by itself.

Neither set carries a 90 degree lattice node any more, so no arm is guaranteed to run along a
screen axis and every reading of this rule SHALL carry the half pixel term of the instrument
below.

A chain that runs at an angle to the screen needs one term, and it is a term of the
**instrument** and not of the pass. Comparing the largest reading of two places on a band
compares two samples of a flat top. The top is flat over the whole of the band but its edge
and its core transition, so a pixel row within half a pixel of the middle of a line lands
inside the **core's own flat part**, which is `0.326 * halfWidth` CSS pixels wide at every
width: **4.7** at the half width of 14.4 this rule reads at, and 5.6 at the 17.28 of 1,080
CSS rows at the reference range. Both samples therefore read the same plateau and the half
pixel sampling loss of the ridge profile is **0**. The scenario "A join is not brighter than the
line" SHALL allow **one 8-bit step**, 0.0039, which is the quantisation of the frame it
reads and not a property of the pass. The 3 per cent tolerance the blur needed is gone.

**The chosen views are constants and they moved.** `tests/region-views.ts` searches the
boundary set for the views the scenarios below open, and `e2e/region-views.ts` holds what it
found. Every view it holds was searched again for the set this change builds, and
`tests/region-views.test.ts` asserts each count, so a count that moves fails a test.

**The three premises below govern three of the four searches**: the width search, the join
search and the traced-corner search. Each of those reads a window of the frame and compares
two parts of it, or compares it with the same window drawn another way, so the whole window
must carry one strength of the range fade.

**The one-chain search is exempt from every premise.** The view it finds is the one the fade
scenarios open, at zooms of **4,000, 6,500, 8,000, 20,000, 25,000 and 31,000** light years.
It exists to be read inside both fades, so a premise that put it outside them would take away
the only view that reads them. It keeps its viewport of **1280x720**, and its window of 8 CSS
pixels SHALL hold one chain and no other at every one of those six zooms.

The search was the **both-sets** search, and it held a point on a traced segment within half
a light year of the smoothed set. The smoothed set is gone, so the search holds a point on the
traced set alone, and its three close zooms follow the range fade to its new figures. The
three close zooms move again with this change, from 7,000, 10,000 and 12,000, so the search
SHALL run again and `e2e/region-views.ts` SHALL hold what it finds.

**Premise one: the reading point SHALL sit at a range of at least 20,000 light years from
the camera.** Each of the three searches puts the **cursor on the reading point**, so the
range of that point is the zoom itself, and a zoom of 20,000 light years holds the premise
exactly.

The range fade is a smooth step that ends at **8,000** light years, so its slope at 20,000 is
**zero** with 12,000 light years to spare. The premise held at its own floor two changes ago,
when the fade ended at 20,000; it holds with more room again. A window around a point at that
range carries one strength over the whole of itself, to better than a millionth: the three
searches work at a pitch of 89 degrees, where every plane point of a window a few tens of CSS
pixels wide sits within about 3 light years of the cursor's own range.

Inside the fade the strength follows the range, and the slope is steepest in the middle. At a
range of 6,500 light years, the middle of the fade, a window of 40 CSS pixels spans about 280
light years, which the fade reads as 14 per cent. A window there would fail the corner rule on the fade and not on
the drawing. This is why the premise is a floor and not a band.

**Premise one does not move, and no view moves with it.** A floor that followed the fade would
put the three views at 8,000 light years, which would change every viewport of the table
below, every window stated in CSS pixels and every count. The premise is a floor, and a floor
that is met with room is still met.

**Premise two: the zoom SHALL be at most 20,000 light years**, where the zoom fade is full.
Above it the whole overlay fades out. With premise one the two together fix the zoom of each
of the three views at **exactly 20,000 light years**. The zoom fade does not change here.

**Premise three: the band's half width at the reading range SHALL be the one every window is
derived from.** The half width follows the range, so at the 20,000 light years premise one
fixes, the half width is `base * 0.6`: **14.4** CSS pixels at the 24 of 2,160 and 1,800 rows,
and 10.4 at the 17.28 of 1,080. Every clearance this requirement states as "the half width
plus a figure" SHALL read that number and not `base`.

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

**The counts below were measured under these premises and not carried over.** The premises
above changed which runs, bends, nodes and points each search holds, so every count the
requirement stated before was a reading of the old rule. A count is a fact of the data and
the view, so a stated count that nobody measured is worse than no count at all.

**These are the counts the four searches hold** under the premises and the restated
windows of this requirement, each read from the search itself.

| search        | what the count holds      | count |
| ------------- | ------------------------- | ----- |
| width         | straight runs             | 6     |
| join          | bends of the traced set   | 3     |
| traced corner | corners of the traced set | 1,457 |
| one chain     | plane points              | 4,688 |

**The four counts were measured by the implementation and written into this
requirement.** Three things moved under them at once: the smoothed set is gone, so the width
search and the join search read the traced set where two of them read the smoothed one; the
band's half width at the reading range falls from 24 to 14.4, so every clearance derived from
it falls with it and more candidates hold their premises; and the one-chain search now reads
six zooms and not five. A count is a fact of the data and the view, so a count carried over
from the reading before would be worse than none.

The four searches held **23, 6, 81, 1,070 and 1,126** before this change, over five rows
where there are now four, the two width rows being one set each. Those five are readings of
the set and the band this change replaces.

The same four searches held 23, 2, 6,713, 10 and 4,605 against the 6 CSS pixel band, at
these viewports and zooms. Those five are readings of the set this change replaces, and
each of the four counts that moved moved for its own reason.

Each count is the number of candidates that hold every premise of its search, and not the
number the search keeps. `tests/region-views.test.ts` SHALL assert each of the four counts it
finds, so a count that moves fails a test and nobody can carry a stale count forward.

**The join search SHALL read the traced set.** It read the smoothed set, which is gone. The
traced set keeps its corners, so it carries bends, and the search's own premises decide which
of them it can read.

**The width search SHALL take the zoom as given** and SHALL NOT derive it from the run it
found. It SHALL hold the run over the reading row with at least **100 CSS pixels** of it
above and below, in place of crossing the whole frame. At 2,160 rows and 20,000 light years
one CSS pixel is 10.69 light years, so the run needs 2,138 light years, which is what the
same rule asked for at 1,080 rows and 10,000.

The search SHALL drop the premise that the view sits within 16,000 light years of the
galactic centre. That premise was there so the disc under the line could be brighter than
the **dark outline** of the 6 CSS pixel line, and no part of this band is drawn to be darker
than the picture: the outer tone is deeper than the core, not darker than the sky. In its
place the reading point SHALL sit at least **5,000 light years** from the galactic centre,
which keeps the reading off the bright core, where the outer tone darkens rather than
lightens. The clearance SHALL stay at **60 CSS pixels**.

The floor and the searches do not move for the two tones. Each search reads the band
against the picture under it or against another part of the same band, and both tones are
laid over one background at one opacity, so a view that held one tone holds two.

The search SHALL run **once**, and `e2e/region-views.ts` SHALL hold one crossing view. It ran
once for each set, because a near-vertical straight run of the smoothed set is not one of the
traced set. There is one set now, so there is one view.

**The other three searches SHALL state their reading windows in CSS pixels, not in light
years**, and SHALL each take the zoom and the viewport its scenario names. They SHALL hold:

- the **join** search: a clearance of 20 CSS pixels, a fold reach of 12 CSS pixels, a
  neighbourhood of 16 CSS pixels of arc, and a comparison run between 16 and 40 CSS pixels
  from the bend and at least 8 CSS pixels long. The straight run must sit outside the
  reading window, which reaches 12 CSS pixels;
- the **traced corner** search: a read radius of **6 CSS pixels** and a comparison run
  between 12 and 40 CSS pixels from the node and at least 8 CSS pixels long. It SHALL state
  **no arm length**, and it SHALL NOT take `CORNER_CLEARANCE_PIXELS`; the clearance bullet
  below states its own radius and derives it. Every window it holds SHALL be a length
  along the plane and none SHALL be the length of one segment, because the traced set is no
  longer a sparse lattice and its median segment is 185 light years.

  **The turn SHALL be read over the read radius**, the half width and 6 CSS pixels, by
  the angle between the chord back to that radius and the chord forward to it, as the join
  search measures its bend over 8 CSS pixels. A node whose window is short, at the end of a
  chain, SHALL be passed over. The search SHALL take the **sharpest** node that holds every
  premise.

  **One clearance premise SHALL replace the clearance and the fold**, and it SHALL tell the
  chain **returning** from elsewhere, which corrupts the reading, from the chain
  **continuing**, which is the line being read. That is what the fold test meant to say. The
  fold test decided it by arc length: on a chain whose vertices sit closer together than the
  fold reach, the walk meets the chain's own straight continuation and calls it a fold, so the
  test passed a node only where a neighbouring segment was longer than the fold reach. That is
  an arm premise in disguise, and it holds at 586 of the 22,472 **interior** vertices the
  lattice polyline carries, which is its 22,718 less the two ends of each of 123 chains. The
  586 is a **sample reading of the set this change replaces**, so no task re-measures it and
  nothing can break on it; the 22,472 is arithmetic on the replaced set's own 22,718 and the 123 chains the suite
  still asserts. The replacement SHALL decide it by geometry:

  - **The node's own contiguous run SHALL be excluded.** The search walks out from the node in
    each direction and excludes every segment until the chain first leaves the clearance disc.
    That is the line in and the line out. It SHALL NOT be a range of vertex indices, which
    would exclude by where the vertices happen to fall.
  - **Nothing else SHALL come inside the clearance disc**: no other chain, and no later part
    of this one.
  - **The distance SHALL be measured to the nearest point of a segment** and NOT to the
    nearest vertex. A vertex distance reads where the vertices fall and not where the line is.
  - **The radius SHALL be the larger of the two reading windows plus the band's half width**,
    which is **40.8 CSS pixels**, and not `CORNER_CLEARANCE_PIXELS`. It is derived, and
    premise three says which half width it derives from: **14.4**, the half width at the
    reading range, and not the 24 of `base`. Two scenarios read this node. The brightness
    reading reaches the half width and 6 CSS pixels, which is 20.4; the **radius** reading
    reaches the half width and 12, which is 26.4, and marches each ray out to it. A line 40.8
    CSS pixels from the node can still light a pixel 26.4 from it, and a line further away
    cannot. A disc of 34.8 would cover the brightness reading alone and would offer nodes at
    which the radius fit reads a foreign band as the edge.

    **The figures were 30, 36, 60 and 54.** Those are the same four rules read at a half width
    of 24, which is what the band measured at every range before this change. The reading half
    width is now 14.4, so each one falls by the part of it that is the half width.

  Excluding the contiguous run and not a range of indices is what keeps the near end of the
  comparison run alive. The run sits on the node's own line, and 14.4 of the 28 CSS pixels it
  spans lie inside the clearance disc, on the excluded run.

  **What the disc does not cover.** The comparison run is itself read at pixels 26.4 to 54.4
  CSS pixels from the node, and a foreign line up to 68.8 CSS pixels away can light one of
  them. The
  premise does not reach that far on purpose: a foreign line there **raises** the run's own
  reading, which makes `bend <= straight` easier to hold rather than harder, so it cannot turn
  a failing pass into a passing one.

  **The comparison run SHALL be found by chord departure**, the longest run of the same chain
  that stays within `STRAIGHT_TOLERANCE_LY` of its chord, as the **width** search finds its
  runs. The join search finds its run the same way against its own tolerance of 2 light years;
  this search SHALL take the width search's 5. It is no longer a point along one straight segment, so no arm has
  to reach past it;
- the **one chain** search: a clearance of 20 CSS pixels.

**All three searches SHALL take the same radius floor the width search takes**, a floor of
**5,000 light years** from the galactic centre, and SHALL drop the ceiling of 16,000 that
each holds today. The ceiling was there so the disc under the line could be brighter than
the dark outline of the 6 CSS pixel line, which is gone. The join search holds no radius premise today and SHALL
take none.

**The three searches SHALL hold their windows per search and not in one module constant.**
`NEIGHBOUR_ARC_LY` and the fold reach are shared between the join search and the traced
corner search today, and the two scenarios read at different zooms, so one light year figure
cannot serve both once the windows are stated in CSS pixels. Each search SHALL derive its
own windows from the zoom and the viewport it is given. The traced corner search keeps
neither of those two windows, so after this change they belong to the join search alone.

The join search SHALL keep its fold reach and its neighbourhood of arc unchanged in CSS
pixels. It now reads the traced set, so its view and its count move; the windows themselves do
not, because each one is stated in CSS pixels and each is derived from the zoom and the
viewport its scenario names.
**The cost.** With the overlay on at 1920x1080 at a zoom of **4,000 light
years**, which is the closest zoom the overlay draws at, the draw time SHALL be at most **1 ms** more than the same view drawn with the overlay
off, read with `measureFrames`. The overlay SHALL stay inside the frame budget
`real-systems` states, which the browser suite already measures at a 20,000 light year view
with a full set.

**The pass runs at every zoom under 30,000 light years.** A close zoom therefore pays for
the ribbon draw and the composite. The cost reading above is taken at a close zoom for that
reason, and it has more room than it had: the two blur passes are gone.

The ribbon draw is the whole boundary set whatever the zoom, and the composite is a
full-screen pass whose cost follows the drawing buffer. Neither reads a star system, so the
cost is the same for a set of none and a set of 50,000, and it does not follow the 400
billion systems of the galaxy.

`debug` SHALL carry `regionCoverageSize()`, which returns the width and the height of the
coverage buffer, and null before the first frame that draws the overlay. It reports the
storage and not a reading of it, so a test can hold the buffer at the full drawing buffer
size and can hold a frame above the band to taking none.

The pass SHALL take its coverage storage in the first frame that needs it, so the overlay
costs no memory at 30,000 light years and above. It SHALL hold **one** full-resolution
target.

**The width rule adds no draw call, no vertex and no buffer.** It adds one divide and one
clamp for each end of a segment in the vertex step, and one interpolation for each fragment
of a ribbon. The edge and the core become constants where they were divides, so the composite
step is one operation cheaper for each pixel than it was.

**Every window and every count of the older requirement was a reading of a 6 CSS pixel band,
and the band is now 34.6 CSS pixels at 1,080 rows.** Each window that was measured against the
old band is restated here, so that a window holding one band still holds one band, and the
counts above are what the searches read under the restated windows.
`tests/region-views.test.ts` asserts each count, so a count that moves fails a test and nobody
can carry a stale count forward.

**Three windows already collide with the new band**, and the restatement SHALL start with
them. The join search asks for a comparison run **16 to 40 CSS pixels** from the bend and
holds the straight run outside a reading window that reaches **12 CSS pixels**; the traced
corner search read **16 CSS pixels** of arc, which the clearance bullet above replaces; and
the join, the traced corner and the one-chain searches each asked for **20 CSS pixels** of
clearance. The traced corner search stops asking for that window under the clearance bullet
above, which derives its own; the other two keep it. At 3200x1800 and a reading range of
20,000 light years the half width is **14.4** CSS pixels, so every one of those windows falls
inside the band itself and reads band against band.

**The restatement SHALL be additive and SHALL NOT scale a window by the band's growth.** A
window that measures a **clearance from the band** — the width search's 20 CSS pixels, the
join search's reading window and the distance from the bend at which its comparison run
starts — SHALL become the half width **at the reading range** plus the figure it already
holds. The width search's
own clearance of 60 CSS pixels, which the paragraph above holds at 60, follows the same rule:
the stated figure stays 60 and the search adds the half width to it, so the reading row holds
one band and 60 clear CSS pixels on each side of it. A window that
measures **along** the band — an arc, a run length, a comparison span — SHALL stay as it is,
because it already measures what it needs to measure.

Scaling every window by the band's growth does not work, and the figures say why. The old
half width was 3 CSS pixels and the new one is at most 24, a factor of 8, which would put the
far end of the traced corner search's comparison run at 320 CSS pixels from the node and ask
for a straight run of 224 CSS pixels. At 3840x2160 and a zoom of 20,000 light years that run
is **2,395 light years**, about 49 cells, and it has to sit between 1,026 and 3,421 light
years of the node. The longest straight run of the drawn traced set measures **3,745.9 light
years**, and only **7** of its **3,833** runs reach past even 2,395, so almost no node could
hold one and the search returns nothing. A run is the longest stretch of a chain that stays
within `STRAIGHT_TOLERANCE_LY` of its chord, which is the measure the rewritten search uses,
and not a single segment. **Those two figures are a one-off reading and no test reproduces
them**, because they price an alternative this change rejected rather than anything it ships.
The definition above is enough to take them again. The
join search moves the same way: scaling its bend reach changes what counts as a bend, and
its count ran from 6,713 to 13,380 when this was tried.

The premises themselves do not move. The range fade now reaches full at 8,000 light years,
so premise one still holds at its floor of 20,000 with a slope of zero, and premise two still
fixes the zoom of the three governed views at 20,000. The viewport table stays as it is: it
was set by the premises and not by the kernel or by the band's width.

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

- **WHEN** the browser test opens the crossing view of the traced set, whose zoom is
  **20,000 light years**, at **1920x1080**, at **1280x720** and at **640x360**, and reads the
  **half-maximum width** of the band across a straight run, in CSS pixels, in each, where the
  maximum is the band's **outer plateau** on that same row and not the largest reading of it
- **THEN** the readings are **18.1**, **12.1** and **8.4** CSS pixels, each within **1.0**
  CSS pixel.

  **The maximum is the outer plateau.** The largest reading of a row sits at the middle of
  the line, where the tone is the **core** one, so half of it is not half of the profile the
  outer tone draws. The reference SHALL therefore be the reading at a gap of
  `0.75 * halfWidth - 1` CSS pixels, which is inside the flat top and one CSS pixel clear of
  the edge, where the profile alpha is 1 and the tone is the outer one. The corner scenario
  below takes its reference by the same rule.

  The half-maximum width then follows the flat top. The alpha is
  `smoothstep(0, 0.25, 1 - gap / halfWidth)`, which is 0.5 at a gap of `0.875 * halfWidth`, so
  the width at half maximum is `1.75 * halfWidth`.

  The cursor sits on the reading point, so its range is the zoom, 20,000 light years, and the
  half width is `base * 12000 / 20000`. The three values of `base` are 17.28, 11.52 and 8, so
  the three half widths are **10.37**, **6.91** and **4.80**, and the readings are 18.1, 12.1
  and 8.4.

  The whole band, which is where the contribution reaches 0, is **20.7**, **13.8** and
  **9.6** CSS pixels at the three viewports. The third carries the `base` floor: 1.6 per cent
  of 360 rows is 5.76, below the floor of 8, so `base` is 8 and not 5.76.

  **The built pass reads 18.0, 12.0 and 8.2 CSS pixels**, each inside the 1.0 CSS pixel
  bound. The whole band reads 20, 14 and 10 CSS pixels, as whole rows of the frame.

  **The readings were 30.6, 20.2 and 14.0** against a band whose width did not follow the
  range. They fall by 0.59, 0.60 and 0.60. The last two are the width change alone. The first is
smaller because the edge share also moved there, from `min(0.25, 4 / 17.28)` of 0.2315 to a
flat 0.25, because the viewport and the range are
  two independent terms of one product

#### Scenario: Nothing at the far view

- **WHEN** the browser test renders the default view at 1280x720 with the region
  overlay on and with it off, and compares the two image files
- **THEN** the two image files are byte-identical

#### Scenario: The range fade reads its two figures

- **WHEN** a unit test reads the range fade at 4,000, 5,000, 6,500, 8,000 and 20,000 light
  years, and reads the two constants the composite pass and the labels take
- **THEN** the fade is 0 at 4,000 and at 5,000, 0.5 at 6,500, and 1 at 8,000 and at 20,000,
  and the two constants are 5,000 and 8,000

#### Scenario: The band's width keeps its own reference range

- **WHEN** a unit test reads the band's half width at 1,080 CSS rows at ranges of 5,000,
  8,000, 12,000, 20,000 and 40,000 light years
- **THEN** the whole band measures 34.6 CSS pixels at 5,000, 8,000 and 12,000 light years,
  20.7 at 20,000 and 10.4 at 40,000, which is what it measured before the fade moved

#### Scenario: The boundary draws in full at the close end of the band

- **WHEN** the browser test opens the one-chain view, at a zoom of **8,000 light years** and
  again at **4,000**, at 1280x720, with the overlay on and again with it off, and reads the
  frames within 8 CSS pixels of the projection of the centre
- **THEN** at 8,000 light years the frame with the overlay differs from the frame without
  it; at 4,000 the two frames are identical within that window, and no label names a region
  whose anchor is within 5,000 light years of the camera.

  The label clause is about the anchor's range and not the zoom. At a pitch of 35 degrees the
  frame at 4,000 light years still holds plane points out to about 26,300 light years, so
  regions far up the frame do carry names; what has gone is every name near the cursor, along
  with every line near it.

  The band this scenario reads is the range band and not the zoom band, so the reading at
  4,000 light years is a window and not the whole frame.

  8,000 light years is the closest range at which a line draws in full: the range fade
  reaches 1 at 8,000 and the zoom fade leaves 8,000 at 1, so both readings are 1 at the
  cursor's own range. At 4,000 the centre sits at the cursor, where the range fade is 0. The
  rest of the frame is not read there, because a line near the horizon is over 5,000 light
  years off and does draw, which is the whole point of the range fade

#### Scenario: A far line still draws while the near line is gone

- **WHEN** the browser test opens a view at a zoom of **4,000 light years** at a pitch of
  **30 degrees**, with the overlay on and again with it off, and counts the pixels the overlay
  changed in the **top 20 per cent of the rows** and in the rows **below 60 per cent**
- **THEN** the top band holds changed pixels and the lower band holds none.

  The bands are set by the geometry and not by eye. The vertical field of view is 60 degrees,
  so the horizon sits at `0.5 - 0.5 * tan(pitch) / tan(30)` of the frame height from the top.
  A pitch of 30 degrees puts it at the top edge, so every row of the frame reads the plane. A
  lower pitch would put the horizon inside the frame and the rows above it would be sky, which
  is why this scenario does not read at a pitch of 5.

  At a zoom of 4,000 light years and a pitch of 30 the camera sits **2,000 light years** above
  the plane. The rows whose plane point is beyond 8,000 light years, where the range fade is
  1, are the top **25.9 per cent**; the rows whose plane point is under 5,000, where the fade
  is 0, are everything below **40.3 per cent**.

  **Those two figures are the centre column, and the reading takes whole rows.** The test
  counts the pixels of a rectangle that runs the width of the frame, so a row is held only
  when **every** column of it is under the floor. A ray at the side of the frame carries a
  horizontal term, so it leaves the plane at a shallower angle than the centre ray of the
  same row and meets it further away. The range at a row share `s` is
  `2000 * |d| / s` for `d = (xn * tan30 * aspect, yn * tan30, -1)` and `yn = 1 - 2 s`. At
  1280x720 the centre column reads **4,993.8** light years at `s = 0.403`, which is the
  40.3 per cent above, while the corner column reads **7,133.4** there. The corner column
  does not fall to 5,000 light years until `s = `**0.5743**.

  **The lower band SHALL therefore clear the corner figure and not the centre one.** It is
  **60 per cent**, which leaves 2.6 points of room over the 57.43. The top band is unaffected,
  because a corner ray reads **longer** than the centre ray and the top band asks for a range
  above 8,000 light years: at 20 per cent the centre column reads 10,583 light years and every
  column beside it reads more.

  **The measured reading.** The overlay changes pixels down to **row 341 of 720**, which is
  **47.36 per cent**, at columns **1,085 to 1,102**. That is right of the middle of the frame
  and not at its corner, because the band draws only where a boundary chain runs. The 60 per
  cent bound is the geometry and the 47.36 is what this data draws inside it.

  The two readings were 17.8 and 25.9 against the fade of 8,000 and 12,000, and the bands read
  10 and 35 per cent. The fade opens nearer again, so both rows move down the frame and both
  bands move with them.

  **This scenario no longer reads the two fade figures.** The old bands of 10 and 35 per cent
  did. Against the bands of 20 and 60 per cent the old fade of 8,000 to 12,000 would also
  pass: the top band reads 10,583 to 14,743 light years, which draws, and the lower band
  reads 4,792 and under, which does not. The claim this scenario holds is therefore the
  narrow one, that a far line draws while a near line is gone, and not where the two figures
  sit. The scenario "The boundary fades out across the close end" and the two unit tests of
  `src/render/region-pass.test.ts` hold the figures themselves.

  **Why 35 per cent held against the old floor.** The corner column under-read there as
  well: at 35 per cent the corner ray met the plane at **8,249** light years, just past the
  old floor of 8,000, where the fade reads **0.01107**. The band's alpha at that strength is
  `0.62 * 0.01107`, which is 0.0069, and over dark space that moves red by 1.3 of 255 and
  green by 1.0. That is 0.0036 of luminance, **above** the 0.001 the test counts a pixel at,
  so the threshold alone does not explain why the row held.

  **What the run reads is the true floor.** At the columns the band draws in, 1,085 to
  1,102, the fade at row 341 works out at 0.0137 and at row 342 at 0.0126. The reading sees
  0.0137 and does not see 0.0126, so its true floor sits near **0.013** of fade and not at
  0.001. The old corner fade of 0.01107 sat just under that, by about one part in ten and
  not by a factor. The row also held because no boundary chain runs at the frame corner in
  this view, which is a property of the data and not of the rule.

  **That is the reason for 60 per cent and not 50.** A bound of 50 per cent would pass this
  run, because the drawn pixels stop at 47.36 per cent, but it would pass on where the
  chains fall. Below 60 per cent every column, the corner included, reads 4,792 light years
  or less, where the fade is exactly 0. The lower band then holds 0 by geometry

#### Scenario: A boundary is visible at medium zoom

- **WHEN** the browser test opens a view at 20,000 light years centred on a plane point
  a unit test has found on a chain, reads the frame with the overlay on and with it off,
  and takes the largest change of any pixel
- **THEN** the first reading is at least 0.05 above the second, and with the overlay
  off the change is 0

#### Scenario: The overlay fades out across the close end of the band

- **WHEN** the browser test opens the one-chain view, the same view the scenario "The boundary
  draws in full at the close end of the band" opens, at zooms of **8,000**, **6,500** and
  **4,000 light years**, with the overlay on and again with it off, and reads the overlay's
  own contribution as the **largest** difference within 8 CSS pixels of the projection of the
  centre, the frame with the overlay less the frame without it
- **THEN** the contribution at 6,500 is between a fifth and four fifths of the contribution
  at 8,000, and the contribution at 4,000 is zero.

  The centre sits at the cursor, so its range to the camera is the zoom. 6,500 light years is
  the middle of the smooth step, where the range fade reads 0.5, and 4,000 is below the 5,000
  at which it reaches 0. The bounds are wide because the reading is a pixel of the frame and
  not the fade itself.

  **Both contributions are read against a band at its widest.** The half width is `base` at
  every range nearer than the width rule's reference range of 12,000 light years, and the two
  readings this scenario compares sit at 8,000 and 6,500, so the width rule does not enter the
  ratio.

  The view is named and not taken from the scenario before it, because the 8 CSS pixel window
  has to hold one chain and no other: the search that finds this view keeps every other chain
  clear of it, and the 25 light year search the medium zoom scenario uses does not

#### Scenario: The overlay fades out across the far end of the zoom band

- **WHEN** the browser test opens the same view at zooms of **20,000**, **25,000** and
  **31,000** light years and reads the band's contribution at each
- **THEN** the contribution at 25,000 is between a fifth and four fifths of the contribution
  at 20,000, and the contribution at 31,000 is 0.

  The band narrows over these three zooms, because the centre's range is the zoom and the
  width follows it. The reading is the **largest** difference inside the window, which is the
  reading at the middle of the line, and that reading follows the opacity and not the width.
  A narrower band carries the same contribution at its own middle

#### Scenario: The band carries a lighter core inside a deeper outer part

- **WHEN** the browser test opens the crossing view at **3840x2160** at a zoom of **20,000
  light years**, where `base` is 24 and the half width at the cursor's own range is **14.4**
  CSS pixels, reads a row across a straight run of the band, and reads the luminance at the
  middle of the run, at **6** and at **9** CSS pixels from the middle, and at **18** CSS
  pixels from it
- **THEN**:
  - the middle is lighter than the reading at 6 CSS pixels by **0.132** of luminance,
    within 0.02. The two readings differ by `opacity * (coreLuminance - outerLuminance)`,
    which is `0.62 * (0.794 - 0.581)`, and that difference does not follow the picture under
    the band, because both tones are laid over one background at one opacity;
  - the readings at 6 and at 9 CSS pixels differ by at most **one 8-bit step**, so the
    outer part is a plateau and not a ramp;
  - the reading at 18 CSS pixels is the frame drawn with the overlay off, within one 8-bit
    step, because it lies outside the band's 14.4 CSS pixel half width.

  The three gaps follow the profile at that half width. The core's transition ends at
  `0.337 * halfWidth`, which is 4.9; the flat top of the outer part runs to
  `0.75 * halfWidth`, which is 10.8; the band ends at 14.4. So 6 and 9 both sit on the outer
  plateau, and 18 is outside the band. The gaps were 12, 16 and 30 against a half width of
  24.

  **The built pass reads** 0.510 at the middle, 0.380 at 6 CSS pixels, 0.381 at 9 and
  0.054 at 18. The middle stands **0.130** of luminance over the reading at 6, the two
  plateau readings differ by 0.0014, which is under one 8-bit step, and the reading at 18
  is the frame with the overlay off to the last bit

#### Scenario: A join is not brighter than the line

- **WHEN** the browser test opens a view at **3200x1800** at a zoom of **20,000 light
  years** on a bend of the traced set and reads the band's contribution at the bend and
  along a straight run of the same chain
- **THEN** no pixel at the bend has a contribution above the largest contribution of the
  straight run by more than **one 8-bit step**, 0.0039, and no pixel of the bend has a
  contribution of 0.

  **Why the tolerance is one 8-bit step and no longer a sampling loss.** The band's top is
  flat, so the largest reading of a run is the reading of the pixel nearest the middle of the
  line, and how near that is depends on where the pixel grid falls across the line. With the
  ridge profile that offset cost the reading `opacity * (3u**2 - 2u**3)` at
  `u = 0.5 / halfWidth`, which was 0.00071. With the flat top of this requirement a pixel
  within half a pixel of the middle sits inside the core's flat part, which is
  `0.326 * halfWidth` and therefore **4.7** CSS pixels wide at the half width of 14.4, so two
  peaks read one plateau and the offset costs nothing. What is
  left is the frame's own 8-bit quantisation. The tolerance is derived from the profile and
  not chosen

#### Scenario: The sharpest corner of the traced set is not brighter than its line

- **WHEN** the browser test opens a view a unit test has chosen
  at the sharpest corner of the traced set at **3840x2160** at a zoom of **20,000 light
  years**, and reads the band's contribution at the corner and along each arm
- **THEN** no pixel at the corner has a contribution above the largest contribution of the
  arms. The `MAX` blend holds this exactly. The corner is no longer a 90 degree lattice node,
  so neither arm is guaranteed to run along a screen axis and the reading SHALL carry the same
  half pixel sampling allowance the scenario above carries.

  The corner is the sharpest node the search holds, and the turn it reads is read over the
  read radius and not between two segments. On the pinned package it turns **86.69** degrees

#### Scenario: The corner of the traced set is round to the band's half width

- **WHEN** the browser test sweeps rays out from the same corner through the quadrant the
  two arms do not span, reads each ray where the band falls to **half the outer plateau on
  that same ray**, and takes the **median** of that radius plus `0.125 * halfWidth`, which is **1.8** CSS pixels
  at the half width of 14.4 this view reads at
- **THEN** the radius is the band's own half width at the corner's range, **14.4 CSS
  pixels** at 2,160 rows and a range of 20,000 light years, within **2.0** CSS pixels, so the
  corner is round without a blur. The built pass reads a median of **14.46** CSS pixels.

  **The ray is read against the outer plateau and not against the peak.** The band carries
  two tones, so the peak at the middle of the line is the **core** tone and the edge the
  sweep reads carries the **outer** tone. A ratio of the two would mix the tones with the
  alpha. The reference reading SHALL therefore be taken on the same ray at a gap of
  `0.75 * halfWidth - 1` CSS pixels, which is **9.8** at a half width of 14.4: it is inside
  the outer plateau and one CSS pixel clear of the edge, where the alpha is 1 and the tone
  is the outer one. Both readings then carry one
  tone, and the range fade, the zoom fade and the tone divide out as they did.

  **The half-alpha point and the correction.** The alpha is
  `smoothstep(0, 0.25, 1 - gap / halfWidth)`, so half the plateau sits at
  `gap = 0.875 * halfWidth`, which is `0.125 * halfWidth` inside the band's own edge: **1.8**
  CSS pixels at a half width of 14.4. The sweep therefore adds `0.125 * halfWidth` rather
  than doubling its reading, which is what the ridge profile needed. That point sits in the
  middle of the edge, where the ramp is steepest, so a small error in alpha is a small error
  in radius. A floor near 0 sits on the flattest
  part of the ramp, under one 8-bit step of the band over a bright background, so the radius
  it returns follows how bright the galaxy is under the corner and not the band's own width.
  Against the **24 CSS pixel** half width the band carried at every range before this change,
  that floor came back **2.4 CSS pixels short** of the offset curve.

  Read again at this corner against the half width of 14.4, the floor of 0.005 comes back
  **0.3 CSS pixels over** the half width and no longer short: a median of **14.7** CSS pixels
  over 26 rays, from 14.2 to 16.5. The half-plateau rule stays, because the floor still reads
  a point on the flattest part of the ramp, and what it returns there follows the background
  and not the band.

  **The median and not the mean.** Where the background is already as bright as the band's own
  tone there is no room left to read a contribution in, and a ray that crosses such a patch
  reads short. That is a hole in the reading and not a narrow corner, so the middle reading
  is taken, which one dropout cannot move.

  One ray of the old sweep dropped out and read **15.9** against the 24 CSS pixel half width.
  At this corner the sweep reads **all 26 rays** and none drops out: the readings run from
  **14.3** to **16.3** CSS pixels, with a median of **14.5** and a mean of 14.9. The median
  stays, because the dropout is a property of the background under the corner and not of the
  band, and a second corner can meet it again.

  14.4 is `base * 12000 / 20000` with `base` at its clamp of 24. The clamp holds `base` at 24
  from 1,500 rows up, and the scenario above this one opens the same corner at 3840x2160. The
  line's own corner carries the whole one cell departure bound, which is 4.6 CSS pixels at
  this view against a band half width of 14.4, so the band and not the line still sets the
  radius. On the pinned package the set's departure is 26.6 light years, which is
  2.5 CSS pixels there.

  **The sweep and the arc SHALL agree.** The reading sweeps `180 - T` for a turn `T`, while
  the band's outer arc spans exactly `T`, so the two agree only at `T = 90` and the bound of
  2.0 rests on the corner being near a right angle. The sweep overshoots the arc by `90 - T`
  at each end and runs that far onto the straight part, where the tangent leaves the circle by
  `r * (1 / cos(90 - T) - 1)`. At a radius of 14.4 that error is **0.024 CSS pixels** at
  the `T = 86.69` this corner turns, 0.222 at `T = 80`, 0.924 at `T = 70`, and it reaches the
  whole bound of 2.0 at **`T = 61.4`**.

  The scenario SHALL state the turn it read, and SHALL fail if the turn falls below **80
  degrees**, where the error is 0.222 CSS pixels, under a ninth of the bound. The floor stays
  at 80 although the narrower band gives it more room, because the turn is a property of the
  line and the floor guards a reading of it

#### Scenario: The overlay costs under a millisecond

- **WHEN** the browser test opens a view at 1920x1080 at a zoom of 4,000
  light years, which is the closest zoom the overlay draws at, and reads the frame time
  with the overlay on and with it off
- **THEN** the two readings differ by 1 ms or less

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

**The smoothed target SHALL NOT move over the map faster than 1,200 CSS pixels a second.**
The page SHALL read `carry`, which is how far the projection of the carried target moved
between the frame before and this frame. That is the map's own motion under the label. The
move of the smoothed target on the screen SHALL be at most `carry + 1200 * seconds` CSS
pixels. Where the share asks for more, the move SHALL be cut to that bound, along the line
to the frame's own target.

**The cap is 1,200 and not 120 CSS pixels a second.** The cap, and not the half life, is what
set the speed of a handover. At a gap of 300 CSS pixels the share of 71 milliseconds asks for
45 CSS pixels in a 16.667 millisecond frame while the old cap allowed **2.0**, so the cap
bound the move by a factor of 22 and a label took 2.43 seconds to come within 8 CSS pixels of
its place. That 2.43 is a **sample reading of the retired cap**, so no task re-measures it. The half life is therefore unchanged, and every reading of the scenario "The rates
give the old figures at 60 frames a second" is unchanged with it.

**This is the rule that stops a label travelling further than it should.** A label rides
the map. `carry` is what the map moved, and the 1,200 CSS pixels a second is the whole of
what the label may add to that. A label can therefore never cross the frame in one frame
while the galaxy under it holds still, and it can never overtake the galaxy by more than one
1080 row frame in 0.9 seconds. The cap is the anchor's own cap, so the target never asks the
anchor for more than the anchor may give, and the two stages cannot fight.

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
the change of step falls to **0.00008** and **0.23**. Over a faster drag of 200 light years a
frame at a distance of 20000 it is **0.00000004** and **0.39**.

The knee is 48 CSS pixels because that is the smallest real move the anchor must answer at
full speed. The floor is there because speed that falls with the gap otherwise takes
hundreds of frames over the last few pixels.

A label pushed to the frame edge by a camera that then jumps back measures 128 CSS pixels
from the middle of its region in the unit test. It is within 8 CSS pixels of that middle at
frame 13, which is 217 milliseconds, and within 2 at frame 26.

**The browser reading of this push** is **152 to 166 milliseconds** to 8 CSS pixels over
repeated runs, 35 to 49 to 20 and 368 to 383 to 2, against the 400 the browser suite allows.
The worst frame moved the label by 19.9 to 20.03 CSS pixels, against the cap of 20.0 that a
frame of 16.667 milliseconds gives.

**The reading is stated as a range because a single figure overstates it.** Three runs of one
build spread 11.8 milliseconds, which is larger than any difference the drift cap makes here.

**The drift cap does not move this reading.** The push is a `setView`, which the rule above
marks as a view jump, so the target is taken whole on that frame and the anchor runs alone
from it. Measured over three runs at each cap, the reading is 152.3 to 154.4 milliseconds at
120 CSS pixels a second and 154.3 to 166.1 at 1,200 — two overlapping spreads with no
resolvable difference between them. The unit scenario "A label reaches its place after a view
jump" is the one that moves, from frame 26 to frame **10**, because its test changes the view
between two runs and never marks a jump at all.

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
slides with the map. Over a drag of 60 light years a frame the worst reading is **5.8 CSS
pixels** and the mean is **0.15**. Over 28 steps of 15 percent of the distance, each in one
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
same two fades that the requirement
"The boundaries draw as a wide band with a light core over a smoothed line" states:

- the **zoom fade**, read once for the frame from the camera's distance to the cursor: 1 at
  20,000 light years and below, falling on a smooth step to 0 at **30,000** and above;
- the **range fade**, read from the camera's distance to the label's **own plane anchor**:
  0 at **5,000** light years and below, rising on a smooth step to 1 at **8,000** and
  above. These are `REGION_RANGE_NONE` and `REGION_RANGE_FULL`, the same two constants the
  composite pass takes, and no copy SHALL be made of them. The two figures moved with the
  lines again, and the label follows them because it reads the same constants.

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
last. Below a zoom at which nothing on the plane reaches 5,000 light years, the frame
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
frame's **four corners**, intersecting each ray with `y = 0` and taking the greatest. A ray
that misses the plane SHALL count as beyond it, so a frame holding the horizon always sweeps.
The corners and not the centre of a row: at a pitch of 58.6 degrees and a camera 1,542 light
years up the top centre reads 3,223 light years and the corners about 4,300, so a gate on the
centre under-reads by about a third.

**All four corners and not the top two.** The camera can look at the plane from under it,
which `map-navigation` states. Above the plane the top row of the frame holds the plane that
runs furthest away; under the plane the picture is mirrored and the bottom row does. At a
pitch of -45 degrees and a distance of 4,000 light years the top row reads 3,918 light years
and the bottom row 14,621, so a gate on the top row alone drops every region label of a
frame that is full of plane. The reading SHALL therefore answer the same way at a pitch and
at its negative. Above the plane the bottom corners always read shorter than the top ones, so
the four-corner reading is the two-corner reading there and no figure in this capability
moves.

This is the same reading the gate replaced was reaching for. The sweep costs up to 2
milliseconds of the main thread, and a frame in which every label would draw at opacity 0
has no reason to pay it. Unlike the zoom floor, this gate takes the pitch and the camera's
height into account, so it skips exactly the frames that carry nothing.

The placement rules above are a pure function of the frame's samples and do not read either
fade, so the unit scenarios below hold at every camera distance they name. Several of them
sit at camera distances of 2,000, 640, 800 and 10 light years, where the label each of them
reads no longer reaches the screen, the anchor scenarios among them. Other regions further up
those frames do carry names, because the plane runs past 5,000 light years there. They are kept as regression bounds on the
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
  **2,500** and **1,000** light years, and at each zoom reads the `Inner Orion Spur` label,
  its opacity, and the range from the camera to that label's own plane anchor
- **THEN** at 20,000 the label is on the page with its box inside the viewport; at every
  zoom at which it is on the page its opacity is `smoothstep(5000, 8000, range)` within
  **0.05**; at least one zoom of the ladder reads a range **strictly inside** the fade band
  of 5,000 to 8,000 light years, and the test SHALL fail when none does; and at 1,000 the
  `Inner Orion Spur` label is not on the page at all, because its anchor falls under 5,000
  light years there and the range fade reads 0.

  **The ladder moves with the fade.** It read 20,000, 15,000, 10,000, 7,500 and 4,000
  against the band of 8,000 to 12,000. Against 5,000 to 8,000 each of those four open zooms
  puts the anchor at or above 8,000, so the ladder would read the fade at 1 at every zoom
  that carries the label and never on its slope. The two close rungs therefore move, and the
  clause above makes the reading of the slope a condition of the test rather than a hope
  about one zoom.

  **The anchor range runs far past the zoom, and the two are not one ratio.** The anchor at
  a close zoom is not the region's centroid: the centroid does not project inside the frame
  there, so the anchor is the part of the region the frame shows. At a pitch of 35 degrees
  that part sits well **up** the frame and not at the cursor. An earlier reading of this rule
  said the range was near the zoom itself, which the measurement below disproves.

  The ratio runs from **1.17** at 20,000 light years to **2.60** at 2,500, so no single
  factor states it. Over the close end the relation is **affine**: `range = 4,400 +
  0.84 * zoom` fits the 1,500, 2,000, 2,500 and 3,000 rungs to a few light years. It drifts
  above 4,000, where 10,000 reads 13,520 against the 12,800 the line gives. Read the table
  below and not a factor. No test holds the affine rule, so a later change SHALL measure the
  ladder again rather than take the rule from here.

  **The measured ladder**, at 1280x720 and a pitch of 35 degrees:

  | zoom (ly) | anchor range (ly) | opacity |
  | --- | --- | --- |
  | 20,000 | 23,347.76 | 1.000 |
  | 15,000 | 18,411.43 | 1.000 |
  | 10,000 | 13,520.29 | 1.000 |
  | 8,000 | 11,590.2 | 1.000 |
  | 6,500 | 10,160.61 | 1.000 |
  | 5,000 | 8,754.2 | 1.000 |
  | 4,000 | 7,836.4 | 0.991 |
  | 3,000 | 6,940.58 | 0.713 |
  | **2,500** | **6,504.6** | **0.501** |
  | 2,000 | 6,077.8 | 0.294 |
  | 1,500 | 5,663.5 | 0.125 |
  | **1,000** | no label | — |

  The rungs sit where they do because of that table. **2,500** is the rung that reads the
  slope: 6,504.6 light years is strictly inside the band, and its opacity of 0.501 is the
  middle of the smooth step. **1,000** is the first rung of the probe at which the label
  leaves the page. **6,500 is dropped**, because it reads 10,160.61 light years at an opacity
  of 1, which is the reading the 10,000 rung already gives. The four rungs above 2,500
  therefore read the top of the fade, one rung reads its slope and one reads its floor.

  "Every zoom" is every zoom the overlay draws in, and that is now the same set of zooms the
  boundary draws in. The label goes as the user zooms in, at the same distance the line
  beside it goes. The HUD's top bar names the region at every zoom instead

#### Scenario: A label and the line beside it read at the same strength

- **WHEN** the browser test opens `#c=0,0,0&d=18000&p=35&y=0` at **1920x1080**, reads a
  region label's opacity and the range `r` from the camera to that label's own plane
  anchor, then reads every pixel of the frame whose own plane point is within **40** light
  years of `r`, turns each one into an alpha through the band's **core** tone, keeps the
  pixels whose background reads under **0.5** of luminance, and takes the **greatest** of
  those alphas
- **THEN** the label's opacity and that alpha divided by the band's own opacity of **0.62**
  agree within **0.05**, so the name and the line at the same distance carry the same
  strength.

  The reading is taken on a line at the anchor's range and **not** at the anchor itself. An
  anchor sits in the interior of its region, which the box rule pushes away from the edge, so
  the coverage at the anchor's own pixel is 0 and there is no band alpha to read there.

  **Why the core tone, and why the greatest reading.** The band draws in two tones and the
  reading turns a pixel into an alpha through one of them. The greatest reading sits at the
  middle of a line, where the tone is the **core** one, so the core tone is the one to read
  it through. The profile alpha there is exactly **1**, because the top of the band is flat,
  so the reading is `opacity * rangeFade * zoomFade` exactly and the label's opacity is the
  product of the same two fades. A pixel of the outer part reads
  `alpha * (outer - background) / (core - background)`, which is below the core's reading
  over a background darker than both tones.

  **Why the background bound of 0.5.** Over a background **brighter** than both tones both
  rooms are negative and that ratio turns above 1, so a pixel of the outer part would read
  above a pixel of the core and the greatest reading would carry the wrong tone. The two
  tone luminances are 0.581 and 0.794, so a bound of 0.5 keeps every pixel that is read
  below both. It also holds the room at 0.294 or more, well clear of the 0.05 floor the
  reading already carries for a background near the tone. The test SHALL fail if the window
  holds no pixel under the bound.

  **The 0.05 bound and what it has to carry.** Two terms, each at its worst:

  | source | worst cost |
  | --- | --- |
  | the 40 light year range window, at a slope of `1.5 / 3,000` a light year | 0.020 |
  | 8-bit quantisation of the band's alpha, `1 / 255 / 0.62` | 0.006 |
  | **sum** | **0.026** |

  **The window stays at 40 light years and the bound stays at 0.05.** The range fade is a
  smooth step, whose steepest slope is `1.5` over the width of its band. The band was 10,000
  light years wide, then 4,000, and is now **3,000**, so the window's worst cost rises from
  0.015 to 0.020 and the sum of 0.026 leaves **0.024** of the bound. A window of 100
  light years would cost 0.05 on its own, which is the whole bound, so the window SHALL NOT
  grow back. The test SHALL fail if the window holds no pixel under the background bound.

  The ridge profile carried a third term of **0.0025**, for reading the pixel nearest the
  middle of the line rather than the middle itself: its alpha reached 1 at one line of
  pixels and fell away as `1 - 3u**2 + 2u**3`. The flat top takes that term to 0. The core's
  own flat part is `0.326 * halfWidth` CSS pixels wide, which is **5.6** at 1,080 CSS rows
  at the reference range and **3.4** at 1,080 rows and a range of 20,000 light years, so a
  pixel carries the full core tone wherever the pixel grid falls across the line, at every
  viewport, every device pixel ratio and every range at which a line draws. That leaves the
  **0.024** the table above states for the projection of the anchor and the plane point
  under the pixel, which is a little under half the bound and was a little over it while
  the fade band was 4,000 light years wide.

#### Scenario: No label where no line draws

- **WHEN** the browser test opens
  a view a unit test has searched for, where every plane point in the frame is under
  **5,000** light years from the camera, and reads the region labels
- **THEN** the page holds no region label, and the frame holds no boundary either. Before
  this requirement the names stood over a frame with no lines under them.

  **The view is a recorded constant and it moves with the floor.** It was last found against
  a floor of 8,000 light years. A frame whose farthest plane point is under 8,000 is not a
  frame whose farthest plane point is under 5,000, so the search SHALL run again and
  `e2e/region-views.ts` SHALL hold what it finds. The recorded view SHALL carry the floor it
  was found against, and a unit test SHALL fail when that figure is not `REGION_RANGE_NONE`

#### Scenario: The sweep is skipped only when nothing could draw

- **WHEN** a unit test reads whether the sampling sweep ran, at a pitch of **89 degrees** at
  a zoom of 2,500 light years, and at a pitch of **20 degrees** at the same zoom
- **THEN** the sweep does not run at 89 degrees, where the whole frame is under the range
  floor, and does run at 20 degrees, where the frame holds the horizon and the plane runs
  past 5,000 light years. A gate on the zoom alone would skip both.

  The zoom was 4,000 light years against the floor of 8,000. At a pitch of 89 degrees the
  corner rays of a 4,000 light year view meet the plane at 6,243 light years, which clears the
  new floor of 5,000, so the view no longer reads the gate it is there for. At 2,500 light
  years the same corners meet the plane at about 3,900 light years, under the floor

#### Scenario: The greatest plane range reads the same under the plane

- **WHEN** a unit test reads the greatest plane range, and whether the sweep runs, at a pitch
  and at its negative, over distances of 1,000, 4,000 and 10,000 light years and pitches of
  20, 45, 60 and 80 degrees
- **THEN** the two ranges agree to three decimal places at every pair, and the gate answers
  the same way at both

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
  away. Every anchor therefore clears the 5,000 light year floor with 7,657 light years to
  spare, and the 5 per cent clause stays an invariant of the **placement**, which is what
  this scenario reads.

  The zoom stays at 20,000 and the room under it grows. Against the floor of 8,000 a zoom of
  12,000 would not have held: the camera is 6,883 light years up there, the nearest plane
  point is 7,594, and the bottom **10.8** per cent of the frame's rows read ranges under
  8,000. Against the floor of 5,000 no row of that view reads under the floor at all, because
  the camera cannot be nearer the plane than its own height. The view does not move, because
  every count below was measured at 20,000 and a view that holds with more room is still a
  view that holds.

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
  downward alone ran at about a third of the cap and took 52 frames. The unit test does not
  mark the view change as a jump, so the drift cap applies to the target: the measured
  reading is **frame 10** at a cap of 1,200 and was frame 26 at a cap of 120

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
  reading is 152 to 166 milliseconds to 8 CSS pixels over repeated runs, which the drift cap
  does not move

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
  of `carry + 1200 * seconds` CSS pixels holds a large gap instead.

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
  plus `1200 * seconds` CSS pixels, within 0.01, and over the still run no target moves more
  than **0.1** CSS pixels in any frame.

  The first clause is the cap the code enforces, so it moves with the cap. The second is a
  **reading** and not the cap: over a still camera every label is settled, so the gap is 0 and
  the target does not move at all. The measured still run reads **0** CSS pixels and the drag
  run reads 20.0, at both the old cap and the new one. The bound was 2.1 while the cap was 2.0,
  which made it a restatement of the cap rather than a reading; at 0.1 it states the rule it is
  there for, that a settled label does not hunt about its place while the camera holds still

  The frames are 16.667 milliseconds, where `1200 * seconds` is 20.0 CSS pixels

#### Scenario: A view jump takes the target whole

- **WHEN** a unit test settles a label, then runs one frame that it marks as a view jump, in
  which the region's own target names a plane point **300 CSS pixels** from the one the label
  carried, and then runs 30 frames with the camera still
- **THEN** the smoothed target is the frame's own target in the jump frame, the anchor is
  still the plane point it held before the jump, and the anchor comes within 8 CSS pixels of
  the new target inside **25 frames of 16.667 milliseconds**.

  The anchor's own rule gives 21 frames from a gap of 300 CSS pixels, and 25 is the bound
  with room for the projection solve. This scenario reads that a jump frame takes the target
  whole rather than walking to it, which it does whatever the cap is

#### Scenario: A target that must cross the frame walks there

- **WHEN** a unit test places a label whose centre rule and whose sample rule name points
  **300 CSS pixels** apart, moves the camera so the centre rule hands over to the sample
  rule, and runs the placement on with the camera still
- **THEN** over frames of 16.667 milliseconds no frame moves the smoothed target more than
  20.1 CSS pixels, the target comes within **1 CSS pixel** of the new rule's point within
  **0.8 seconds**, and it never passes it. The approach is exponential, so the target never
  reaches the point exactly. The target still walks: crossing 300 CSS pixels takes at least
  **15** frames, which is `300 / 20.0` and the floor the cap sets, so the user follows it
  rather than finding it somewhere else.

  The measured walk takes **39 frames**, which is **0.650 seconds**, and its worst frame
  moves the target 20.0 CSS pixels

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

- **WHEN** the browser test opens `#c=0,0,0&d=2500&p=89&y=0`, where the whole frame lies
  inside the range floor, draws 60 frames and reads `labelSampling()`, which carries
  `frames`, `meanMs` and `worstMs`; then opens `#c=0,0,0&d=60000&p=35&y=0`, the default far
  view, and reads the same
- **THEN** in each view the page holds no region label, `frames` is 0 and both `meanMs` and
  `worstMs` are 0, so the sweep ran in no frame of the sixty.

  The two views read the two halves of the gate. At a pitch of 89 degrees and a zoom of
  2,500 the corner rays meet the plane at about 3,900 light years, under the floor, so the
  range half closes. At 60,000 light years the plane runs out to about 395,000, so the range
  half is open and the **zoom** half closes it. A gate on either half alone lets one of these

### Requirement: The region worker builds a flow field toward each region's centre and sends it with the boundary set

The region worker SHALL build a **flow field** over the coarse region grid and SHALL send it
in the same message as the boundary set and the grid. The field SHALL hold one byte for
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

**The message carried two boundary sets.** It now carries one, which the requirement "The
boundary set is built from one trace of the region grid" states, so the response the test
reads holds the field, one boundary set and the coarse grid.

#### Scenario: The field is sent with the boundary set

- **WHEN** a unit test runs the region worker's build and reads the response
- **THEN** it carries the flow field beside one boundary set and the coarse grid, the
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

### Requirement: The region overlay has a host switch and starts on

The map SHALL carry one region overlay state, which is on or off. **On SHALL be the
default.**

- On SHALL draw the boundary set and place the labels.
- Off SHALL draw no boundary line and place no label.

`GalaxyMapOptions` SHALL carry an optional `regions` of type `boolean`. The handle SHALL
carry `areRegionsVisible()` and `setRegionsVisible(on)`. `setRegionsVisible` SHALL take
effect in the next frame and SHALL NOT rebuild the scene data, because the worker already
built the set and the renderer holds it.

A value that is not a boolean SHALL leave the state unchanged, and `setRegionsVisible` SHALL
report nothing. The reader of a whole data set reports its rejects, while a switch is one
value the host controls directly.

The `regions` pass switch SHALL stay as it is, a renderer probe the browser tests read, and
the requirement "The region overlay has a switch" states it. The pass switch off and the host
switch off SHALL draw the same frame, so the two never disagree.

**The two switches are not the same switch.** The pass switch is on `debug` and belongs to
the browser tests. The host switch is on the handle and belongs to the host and the HUD.

**The overlay had three modes: `off`, `simplified` and `accurate`.** `simplified` drew a
second boundary set, the **smoothed set**, which rounded every corner away. Two things ended
that choice.

The first is the band. The pass draws a band 34.6 CSS pixels wide at 1,080 rows, and the two
sets sit **15.7** light years apart at most, which is 1.5 CSS pixels at a range of 10,000
light years and 0.7 at 20,000. The mode moved the line by a twentieth of the band at the
near end of the range where a line draws, and by less further out. The user could not read
the difference.

The second is the corners. The traced set keeps a corner of the region data, and its
sharpest vertex turns by 92.61 degrees. The smoothed set held every vertex under 20 degrees
and turned its sharpest by 14.23. A real corner of the region data is a fact about the
galaxy, so the map draws it and there is nothing left for the second set to offer.

Dropping the mode drops the smoothed set with it, and that set was **68,672** vertices,
**805 KiB** of `float32` positions that crossed the worker boundary and went to the card on
every load.

#### Scenario: The overlay starts on

- **WHEN** the browser test creates a map with no `regions` in the options and reads
  `areRegionsVisible()`
- **THEN** it is `true`

#### Scenario: The options choose the state

- **WHEN** the browser test builds a map through the library entry point with `regions` of
  `false`, of `true`, of the string `on`, with an empty options object and with no options
  at all, and reads `areRegionsVisible()` on each
- **THEN** the readings are `false`, `true`, `true`, `true` and `true`, so a value that is
  not a boolean takes the default

#### Scenario: The switch removes both parts and draws the pass switch frame

- **WHEN** the browser test opens `#c=15,0,25895&d=20000&p=35&y=0`, calls
  `setRegionsVisible(false)` and reads the page and the frame
- **THEN** the page holds no region label, and the frame is byte-identical to the frame the
  same view draws with the `regions` pass switch off

#### Scenario: The state changes without a rebuild

- **WHEN** the browser test opens `#c=15,0,25895&d=20000&p=35&y=0`, switches the regions
  off, draws one frame, switches them on, draws one more, and reads how many times the scene
  data loaded
- **THEN** the frames differ, the scene data loaded once, and neither change waited for a
  load

#### Scenario: A bad value changes nothing

- **WHEN** the browser test calls `setRegionsVisible(false)`, then calls it with the string
  `on` and with `undefined`, and reads `areRegionsVisible()`
- **THEN** it is still `false`

#### Scenario: No mode member is left on the handle

- **WHEN** a unit test reads the handle a map returns and the built type declaration
- **THEN** the handle holds `areRegionsVisible` and `setRegionsVisible`, holds neither
  `getRegionMode` nor `setRegionMode`, and the declaration exports no `RegionMode`
