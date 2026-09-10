## MODIFIED Requirements

### Requirement: The boundary set is traced from the region grid

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

Each chain SHALL then be smoothed, and the smoothing SHALL meet three bounds at once.

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

The traced staircase measures 1,062.8 degrees per 1,000 light years over the whole set.
A rule that only rounds the corners of the staircase does not meet either bound: it
leaves the direction changes in place. The bounds are what separate a smoothed line from
a rounded staircase, and they are the reason the departure bound is one cell rather than
half of one. At the closest zoom of 500 light years one
CSS pixel is 0.53 light years, so half a cell is already 47 pixels; tightening the
departure below the resolution of the data buys nothing there and costs the straightness
the user sees.

The drawn line SHALL also carry no visible corner. **No vertex of a drawn chain SHALL
turn by more than 20 degrees.** The two bounds above measure how far the line wanders
over a distance; this one measures the line at a single point, and it is a separate
property. A line can hold both of the bounds above and still read as a polygon: measured
on a build that met them, the segments had a median length of 284 light years and 377
vertices turned by more than 20 degrees, the worst by 98.4. At the closest zoom of 500
light years a 284 light year segment crosses half the frame, so such a vertex reads as a
hard corner rather than as a curve.

The set SHALL be typed arrays only and transferable without copying. It SHALL hold the
vertices of every chain in one array of three `float32` per vertex, with the first and
last index of each chain, so a vertex shared by two segments is stored once.

#### Scenario: The boundary is a small number of chains

- **WHEN** a unit test builds the boundary set
- **THEN** it holds between 100 and 200 chains, and every chain has at least two vertices

#### Scenario: A chain separates one pair of regions

- **WHEN** a unit test walks every chain of the untouched trace and reads the pair of
  region ids on the two sides of each of its edges
- **THEN** every edge of a chain carries the same pair, and no two chains share an edge

#### Scenario: The drawn line stays near the boundary

- **WHEN** a unit test measures, for every chain, the largest distance from a point of
  the drawn chain to the traced boundary and the largest distance from a point of the
  traced boundary to the drawn chain
- **THEN** both are at most 49.3494 light years

#### Scenario: The drawn line reads as a line

- **WHEN** a unit test adds the absolute turn angle at every vertex of every drawn chain
  and divides by the drawn length of the whole set, and then measures the same ratio for
  each chain on its own
- **THEN** the whole set is at most 60 degrees for each 1,000 light years, no single
  chain is above 100, and the same whole-set measure over the traced staircase is more
  than 1,000

#### Scenario: The drawn line carries no visible corner

- **WHEN** a unit test measures the turn angle at every vertex of every drawn chain
- **THEN** no vertex turns by more than 20 degrees

#### Scenario: The set is small enough to upload once

- **WHEN** a unit test reads the vertex count of the whole set
- **THEN** it is between 20,000 and 120,000 vertices, which is at most 1.4 MiB of vertex
  data. Holding the corner bound costs vertices, because a corner is only removed by
  putting points around it. A set that meets the bounds above needs far fewer vertices than a rounded
  staircase does, because it has far fewer direction changes to carry. The floor guards
  against a set so reduced that it holds the departure bound only by cutting chains to a
  few long chords; the departure bound alone does not catch that, because a chord across
  a gentle curve can stay inside one cell

#### Scenario: The set is deterministic

- **WHEN** a unit test builds the boundary set twice
- **THEN** the two arrays are byte-identical

#### Scenario: The set is transferable

- **WHEN** a test posts the boundary set through a `MessageChannel` with its buffers in
  the transfer list
- **THEN** the receiver gets equal contents and the sender's buffers have length 0

### Requirement: The boundaries draw on the galactic plane in a zoom band

The boundary chains SHALL draw as lines on the plane `y = 0`, after the tone map, so no
look constant of the far view changes them and none of them changes the far view. They
SHALL be drawn camera-relative, as every other pass is.

A line SHALL be drawn in the width the screen sees, not in the width the card's default
line gives: a core of 2 CSS pixels, with an outline of 1 CSS pixel on each side, so the
whole line is 4 CSS pixels whatever the device pixel ratio is. The core SHALL be the
lighter colour and the outline SHALL be the darker one, so the line reads against both
the dark space between the arms and the bright disc.

Where two segments of a chain meet, the line SHALL NOT be brighter than a straight run of
the same chain, and SHALL show no gap. A join is where a naive draw of one quad per
segment shows its seams: the two quads overlap, and drawn straight onto the frame the
overlap blends twice.

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

- **WHEN** the browser test opens the same centre at 1,500 light years and at 500 light
  years with the overlay on, and again with it off
- **THEN** at both distances the frame with the overlay differs from the frame without
  it, because the boundary draws there now

#### Scenario: The line is four CSS pixels wide and two-toned

- **WHEN** the browser test opens a view a unit test has chosen so that a boundary chain
  crosses the frame within 5 degrees of vertical, reads one horizontal row of pixels
  across it, converts the run from device pixels to CSS pixels by the device pixel ratio,
  and compares it with the same row with the overlay off
- **THEN** the run of changed pixels is 4 CSS pixels wide within 1 CSS pixel, the middle
  of the run is lighter than both ends, and both ends are darker than the same pixels
  with the overlay off

#### Scenario: A join is not brighter than the line

- **WHEN** the browser test opens a view a unit test has chosen at a place where the
  drawn line **turns by at least 30 degrees within a reach of 8 CSS pixels**, and reads
  the luminance of every pixel the overlay changes within 8 CSS pixels of that place
- **THEN** taking each pixel's change as the frame with the overlay less the frame
  without it, no pixel at the bend has a larger change than the largest change on a
  straight run of the same chain in the same frame, and no pixel inside the bend is
  unchanged.

  The bend is measured over a reach and not between two neighbouring segments, because
  the requirement above holds every single vertex to 20 degrees, so no two neighbouring
  segments can meet under 160 degrees. That does not make the join weaker as a test: it
  makes it stronger. The median segment of the drawn set is 5.09 light years, which is
  about 10 CSS pixels at a zoom of 500 light years, against a line 4 CSS pixels wide, so
  the ribbon quads of a bend overlap more than they did when a bend was one sharp
  corner. The comparison is of the overlay's own contribution, because the overlay
  draws at less than full opacity and the galaxy under a corner can be brighter than the
  galaxy under a straight run

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
