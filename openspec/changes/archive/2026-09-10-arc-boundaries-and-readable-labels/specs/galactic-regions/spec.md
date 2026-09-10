## ADDED Requirements

### Requirement: The boundary set is simplified to arcs

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
chains. The set SHALL carry the pair of region ids of every chain, so a reader can ask
which boundaries belong to a region.

Each chain SHALL then be **simplified to a small set of kept vertices**, exactly as
before: a traced node is kept only where dropping it would move the line further than the
fit tolerance from the trace, measured to the segment and not to the infinite line through
its ends, and the first and last node are always kept. Every **kept vertex** SHALL be a
node of the traced chain, and the first and last kept vertex SHALL be the first and last
traced node. A chain end is a lattice node shared by every chain that meets there, so two
regions cannot round the same corner to two different places and open a sliver between
them.

**The drawn primitive SHALL be an arc.** A primitive SHALL carry a start point, an end
point and a **signed curvature**. A curvature of zero is a straight line, so one primitive
type carries both and no reader needs a second code path.

**The kept vertices SHALL be joined by a biarc spline.** A **run** is a maximal stretch of
a chain between two breaks, where a break is a chain end or a kept vertex at which the
traced boundary really turns. Inside a run, each pair of consecutive kept vertices SHALL be
joined by two circular arcs that meet **tangentially** at a joint, so the drawn line has no
turn anywhere inside a run except at the kept vertices themselves, where it also has none.
A run of a single span SHALL be drawn as one straight primitive, because both of its
tangents are then fixed by the break at each end and the biarc degenerates.

The **joint** of a biarc is a computed point, not a traced node. It SHALL lie between the
two kept vertices it joins. Only the kept vertices carry the guarantee that they are traced
nodes, and only chain ends carry the guarantee that neighbouring chains share them.

**A break SHALL be a place the traced boundary turns, and nowhere else.** The break test
SHALL be the two-chord traced turn defined below, at more than **30 degrees**. This is what
keeps the right angles the region map has: the spline is tangent-continuous inside a run
and discontinuous only where the data turns.

The threshold is 30 because a measured sweep puts it inside an **empty band**. Over the
whole set, thresholds of 25, 30 and 35 give the identical fit — 472 breaks, 349 runs, 716
vertices, 593 primitives, 11.188 KiB — because no kept vertex holds a traced turn between
**22.93 and 39.59 degrees**. A threshold of 30 sits 7.1 degrees above the highest wobble and
9.6 below the lowest real corner, so the result does not depend on the exact number. Below the band sit four breaks with
traced turns of 20.2, 20.9, 21.0 and 22.9, which are raster jitter and not corners: the one
at 22.9 lies between two right angles of 82.4 and 76.2 on a smooth bend near the galactic
centre, and a break there made the drawn line kink **50.6 degrees** where the boundary turns
23.8 over the window. That is the faceting this change exists to remove, and a threshold of
20 keeps it. The ceiling is the departure bound rather than the corner counts: recall holds
at 221 of 221 up to 60 degrees, but at 70 the fit rounds a real corner into a run and the
departure leaves the 200 light year bound at 297.4 and 334.7.

**The tangent at a break SHALL be one-sided.** The fit needs a direction at every kept
vertex. At a vertex inside a run that direction SHALL be estimated from the line on both
sides, because the line runs through. At a **break** the fit SHALL take the direction from
the inside of the run alone, and the run on the other side SHALL take its own, so the two
tangents at a break are different and the drawn line turns there. A two-sided estimate at a
break averages across the corner and rounds it, which is the exact fault of the smoothing
pipeline this project already removed: it rounded a real corner and a raster wobble alike,
and the right angles of the region map were lost. A chain end SHALL be treated as a break.

The drawn line SHALL stay within **200 light years** of the traced boundary, measured both
ways and **sampled along both lines rather than only at their vertices**, with the drawn
line sampled along its arcs and not only at its primitive ends: every point of the drawn
line is within that distance of the traced boundary, and every point of the traced
boundary is within that distance of the drawn line.

The simplification SHALL run at a tolerance **strictly below** that bound, so the
asserted bound carries slack and a change of tie-break cannot fail the test for no real
reason. At a tolerance of 190 light years a measured build gives 185.8 and 189.8 light
years, sampled every 10 light years. The arc spline does not cost accuracy: an arc bulges
towards the traced boundary that its chord was cutting the corner off, and the measured
departure is the same to one decimal place as the chord fit gives at the same tolerance.

This bound is deliberately looser than the 49.3494 light year resolution of the source.
Nothing the page draws shows where the boundary truly lies, so a departure the viewer
cannot check costs nothing. The shape the viewer can check is what improves.

**The line SHALL keep the corners the region map has, and SHALL invent few of its own.**
Both directions SHALL be measured, and both against the same definition. The turn of the
drawn line SHALL be measured **at a break**, between the tangent direction of the primitive
arriving at it and the tangent direction of the primitive leaving it. Inside a run that
turn is zero by construction, so the counts below run over breaks alone.

The **turn of the traced boundary at one of its nodes** SHALL be the angle between two
chords: the chord from the traced point 500 light years back along the chain to that node,
and the chord from that node to the traced point 500 light years forward. Where a chain end
is nearer than 500 light years, the node SHALL be left out of both measures rather than
measured over a shorter reach. This definition is required, and not merely suggested,
because the traced line is a raster staircase that turns 1,062 degrees for each 1,000 light
years: under an accumulated-turn or a largest-single-node reading, every window holds a 90
degree step and the rule below cannot fail.

- **Invents few.** Of the breaks of the drawn line that turn by more than 20 degrees, **at
  least 90 percent** SHALL sit at a traced node whose traced turn is also more than 20
  degrees. The count SHALL stay at 20 degrees although the break test is at 30, because 20 is
  what the straight fit was measured at and the two fits have to stay comparable.
- **Keeps what is there.** Of the places where the traced boundary turns by more than 60
  degrees, **at least 75 percent** SHALL carry a break of the drawn line, within 500 light
  years along the chain, that turns by more than 40 degrees. Traced nodes within 500 light
  years of each other along the chain count as one place, which is the same reach the turn
  itself is measured over.

Both bounds are measured on both fits. The straight fit gives 227 of 235 breaks, which is
96.6 percent, and 221 of 221 places kept. The arc fit gives **225 of 225 and 221 of 221**,
both 100 percent, against bounds of 90 and 75. The arc fit invents no corner at all, because
the tangent at a break is one-sided and every break sits at a traced turn over 30 degrees.

The precision bound is close to true by construction, and that is worth saying rather than
hiding. A break exists only at a chain end or where the traced turn is over 30 degrees, and
inside a run the drawn turn is zero, so a drawn turn over 20 degrees can only sit at a break
that already passes the test. What the bound still catches is a break test that drifts from
the count — a different reach, a different measure of turn, or a chain seam counted as a
corner. The recall bound is not construction: a rounded corner fails it.

**The line SHALL NOT facet.** This replaces the bound on short segments that the straight
fit carried. That bound allowed at most 20 segments shorter than 500 light years, and it
guarded against a fit that met the departure bound by cutting the line into many short
pieces. It cannot be carried over: an arc is drawn as a run of short pieces on purpose, and
shortness is now what makes the line smooth rather than what makes it rough. The property
it was standing in for SHALL be measured directly instead:

**Where the traced boundary does not turn, the drawn line SHALL NOT turn.** The turn of the
drawn line SHALL be measured the same way as the turn of the traced boundary: **walk the
drawn line, arcs sampled along their sweep, and at every sample take the angle between the
chord from 500 light years back along the drawn line and the chord to 500 light years
forward.** Wherever that angle is more than 10 degrees, it SHALL NOT be more than 10 degrees
above the largest traced turn at the traced nodes within 500 light years along the chain of
that sample.

**The bound SHALL apply where the traced turn is at most the corner test, and not above it.**
Above the corner test the place is a corner, and the corner counts govern it. The exclusion
is needed because the raster rounds a right angle over a cell or two, so the window under-reads
it: measured, a true right angle draws 91.0 degrees where the two-chord traced turn reads only
78.9. No fit that keeps the corners of the region map can hold a right angle to 10 degrees
above that reading, and a rule that demanded it would forbid the corners this change keeps.

**The exclusion and the corner test go together, and neither replaces the other.** With the
corner test at 20 degrees the exclusion would have forgiven the worst fault in the set: the
chain 67 bend has a windowed traced turn of 23.8, so the exclusion drops it, and the test
passes at 1.9 degrees **below** the traced turn while the drawn line kinks 50.6 degrees.
The corner test removes the fault from the line; the exclusion removes a corner from the
test. Measured with both in place, the arc fit's worst excess is 4.4 degrees against a bound
of 10, and that reading is honest rather than forgiven.

The bound is **the drawn turn against the traced turn**, and not two thresholds of their
own. Two thresholds leave a dead band that a correct fit falls into. A circle of radius `R`
gives a windowed turn of `500 / R` radians, so a drawn turn over 10 degrees means `R` under
2,865 light years and a traced turn over 20 degrees means `R` under 1,432: every boundary
that curves between those two radii would fail while being fitted exactly as this change
intends. That band is not hypothetical. Measured over the three chains that bound the
`Galactic Centre`, the traced turn itself has a median of 9.0 degrees and a 90th percentile
of 33.8 over the same window, 45.3 percent of its 481 nodes are over 10 degrees and 15.6
percent are over 20, so about 30 percent of that boundary sits inside the band — the region
this change exists to draw as a circle. A relative bound has no band: the drawn line is
allowed to turn wherever the traced boundary turns, and nowhere else.

The window is what makes the rule bite at all. Measured only at a break, the rule is true by
construction, because a break already needs a traced turn over the corner test. Measured over a
window it reads the whole drawn line: a chord fit shows the corner it cut across, and an arc
that bulges the wrong way shows its bulge. The straight fit this replaces turns by up to 30.6
degrees where the traced turn is near zero, which is 30.6 above it, and that is the faceting
this change removes.

The traced turn is taken as the largest within 500 light years along the chain because the
drawn line is not the traced line: it may lie up to the departure bound away from it, and a
break may sit a cell from the traced node it answers. That is the same reach the corner
counts above use.

The set SHALL be typed arrays only and transferable without copying. It SHALL hold the
vertices of every chain in one array of three `float32` per vertex, with the first and
last index of each chain, so a vertex shared by two primitives is stored once.

**The curvature SHALL be one `float32` per vertex, indexed exactly as the vertices are.**
The value at a vertex belongs to the primitive that starts there, and the value at the last
vertex of a chain is unused and SHALL be zero. A curvature array indexed per primitive would
need a second per-chain offset, because the chain index array counts vertices and a chain of
`n` vertices holds `n - 1` primitives; the renderer binds the positions of a chain at
`first x 12` bytes and would then need a different offset for the curvature. One value per
vertex costs 492 bytes over the whole set and removes that offset.

#### Scenario: The boundary is a small number of chains

- **WHEN** a unit test builds the boundary set
- **THEN** it holds between 100 and 200 chains, and every chain has at least two vertices

#### Scenario: A chain separates one pair of regions

- **WHEN** a unit test walks every chain of the untouched trace and reads the pair of
  region ids on the two sides of each of its edges
- **THEN** every edge of a chain carries the same pair, that pair is the one the set
  records for the chain, and no two chains share an edge

#### Scenario: The drawn line stays inside the departure bound

- **WHEN** a unit test walks both the drawn line and the traced boundary at a step of 10
  light years, sampling each arc along its sweep rather than at its ends, and for every
  sampled point measures the distance to the other line
- **THEN** no sampled point of either line is more than 200 light years from the other

#### Scenario: Every kept vertex is a traced node

- **WHEN** a unit test reads every kept vertex of every chain and looks for it among the
  nodes of that chain's trace
- **THEN** every kept vertex is a traced node, and the first and last kept vertex of a
  chain are the first and last node of its trace. Biarc joints are not kept vertices and
  are not checked

#### Scenario: Two chains that meet share their end exactly

- **WHEN** a unit test takes the lattice nodes at which three or more chains of the trace
  meet, and reads the end vertex of every chain that meets there
- **THEN** the ends are the same point to within 1e-6 light years, so no sliver can open
  between the regions that meet at that node

#### Scenario: The spline is tangent-continuous inside a run

- **WHEN** a unit test walks every run of every chain and, at every joint and every kept
  vertex inside the run, measures the angle between the tangent of the primitive arriving
  and the tangent of the primitive leaving
- **THEN** no angle inside a run exceeds 0.5 degrees, which is the arithmetic left over
  from the fit rather than a turn in the line

#### Scenario: A straight run stays straight

- **WHEN** a unit test finds the runs whose traced boundary holds no turn over 5 degrees
  anywhere along it, and reads the curvature of every primitive in them
- **THEN** every one of those primitives has a radius of at least 100,000 light years or a
  curvature of exactly zero, so the fit does not invent a curve where the data has none

#### Scenario: The line keeps real corners and invents few

- **WHEN** a unit test measures the turn at every break of every chain and, for each break
  that turns by more than 20 degrees, measures the turn of the traced boundary over a reach
  of 500 light years each side of the same place
- **THEN** at least one break turns by more than 60 degrees, because the region map meets
  at right angles; of the breaks that turn by more than 20 degrees, at least 90 percent sit
  at a traced node whose traced turn is also more than 20 degrees; and of the places where
  the traced turn is more than 60 degrees, grouping traced nodes within 500 light years of
  each other along the chain, at least 75 percent carry a break within 500 light years
  along the chain that turns by more than 40 degrees. The traced turn is the two-chord
  measure the requirement defines, and nodes within 500 light years of a chain end are left
  out of both counts

#### Scenario: The line does not facet

- **WHEN** a unit test walks the drawn line, sampling each arc along its sweep, and at every
  sample measures the two-chord turn of the drawn line over 500 light years each side, and
  the largest two-chord traced turn at the traced nodes within 500 light years along the
  chain, leaving out the samples whose traced turn is above the corner test
- **THEN** at every sample whose traced turn is at most the corner test, the drawn turn is
  not more than 10 degrees above it. The arc fit reads a worst excess of 4.4 degrees. The
  turn is windowed and not read at a break alone, or the rule would be true by construction;
  it is relative and not two thresholds, or a boundary curving between 1,432 and 2,865 light
  years fails while being fitted correctly; and it stops at the corner test, or a right angle
  fails because the raster under-reads it. It can fail in the direction that matters: run
  over the straight fit it replaces, the same test finds drawn turns of up to 30.6 degrees
  where the traced turn is near zero

#### Scenario: The set is small enough to upload once

- **WHEN** a unit test reads the vertex count and the primitive count of the whole set
- **THEN** it holds between 300 and 2,000 vertices and between 300 and 2,000 primitives,
  which is at most 31.2 KiB of vertex and curvature data at 16 bytes a vertex. A measured
  build of the fit gives 593 primitives over 716 vertices, which is 8.4 KiB of vertex data
  and 2.8 KiB of curvature, **11.2 KiB** in all, against 439 primitives, 562 vertices and
  6.6 KiB for the straight fit it replaces, which carries no curvature array at all. The floor guards against a set so reduced that
  a chain becomes one chord across a whole region

#### Scenario: The set is deterministic

- **WHEN** a unit test builds the boundary set twice
- **THEN** the two arrays are byte-identical, the curvature array included

#### Scenario: The set is transferable

- **WHEN** a test posts the boundary set through a `MessageChannel` with its buffers in
  the transfer list
- **THEN** the receiver gets equal contents and the sender's buffers have length 0, the
  curvature array included


## MODIFIED Requirements

### Requirement: The boundaries draw on the galactic plane in a zoom band


The boundary chains SHALL draw as lines on the plane `y = 0`, after the tone map, so no
look constant of the far view changes them and none of them changes the far view. They
SHALL be drawn camera-relative, as every other pass is.

A line SHALL be drawn in the width the screen sees, not in the width the card's default
line gives: a core of 2 CSS pixels, with an outline of 1 CSS pixel on each side, so the
whole line is 4 CSS pixels whatever the device pixel ratio is. The core SHALL be the
lighter colour and the outline SHALL be the darker one, so the line reads against both
the dark space between the arms and the bright disc.

Where two primitives of a chain meet, the line SHALL NOT be brighter than a straight run
of the same chain, and SHALL show no gap. A join is where a naive draw shows its seams: the
two pieces overlap, and drawn straight onto the frame the overlap blends twice. This has to
hold in three places, not one: where two straight primitives meet at a right angle, because
the region map meets at right angles and the line keeps those corners; where two arcs meet
at the joint of a biarc, which is by far the most common join in the set; and where an arc
meets a straight primitive at a break.

**A curve SHALL NOT read as a chain of facets.** Whatever the pass does to put an arc on
the screen, the drawn result SHALL show no turn at a joint inside a run. This is the drawn
half of the rule the boundary set carries: the set may hold a curve, and the pass has to
draw one.

A primitive is long. The set holds straight primitives of up to 14,970 light years. The
drawn width SHALL hold along the whole of such a primitive, including when both of its ends
project far outside the frame, and SHALL hold along the whole sweep of an arc, including an
arc whose centre lies far outside the frame. A region boundary that follows a circle about
the galactic centre has a radius of tens of thousands of light years, so at the closest zoom
its centre is many frame widths away.

The lines SHALL fade in as the zoom distance falls: nothing at 30,000 light years and
above, full at 20,000 and below. They SHALL NOT fade out at close zoom. A line that curves where
the data curves does not read as a staircase at any zoom, which is why the phase 2 fade out
below 3,000 light years stays removed.

#### Scenario: Nothing at the far view

- **WHEN** the browser test renders the default view at 1280x720 with the region overlay
  on, and again with it switched off
- **THEN** the two image files are byte-identical

#### Scenario: A boundary is visible at medium zoom

- **WHEN** the browser test opens a view at 10,000 light years centred on a plane point
  that a unit test has found within 25 light years of a boundary chain, and reads the
  luminance at the projection of that point and at the projection of a plane point 1,000
  light years away from any chain
- **THEN** the first reading is at least 0.05 above the second, and with the overlay
  switched off the two readings differ by less than a fifth of the difference with it on

#### Scenario: The boundary still draws at the closest zoom

- **WHEN** the browser test opens the same centre at 1,500 light years and at 500 light
  years with the overlay on, and again with it off
- **THEN** at both distances the frame with the overlay differs from the frame without it,
  because the boundary draws there now

#### Scenario: The line is four CSS pixels wide and two-toned

- **WHEN** the browser test opens a view a unit test has chosen so that a boundary chain
  crosses the frame within 5 degrees of vertical, reads one horizontal row of pixels
  across it, converts the run from device pixels to CSS pixels by the device pixel ratio,
  and compares it with the same row with the overlay off
- **THEN** the run of changed pixels is 4 CSS pixels wide within 1 CSS pixel, the middle
  of the run is lighter than both ends, and both ends are darker than the same pixels with
  the overlay off

#### Scenario: A join between two arcs is not brighter than the line

- **WHEN** the browser test opens a view a unit test has chosen at the joint of a biarc,
  where two arcs meet tangentially, and reads the luminance of every pixel the overlay
  changes within 8 CSS pixels of that joint
- **THEN** taking each pixel's change as the frame with the overlay less the frame without
  it, no pixel at the joint has a larger change than the largest change on a straight run
  of the same chain in the same frame, and no pixel inside the joint is unchanged.

  This is the join the set now holds most of, and the straight fit never had it. It is also
  the easiest to get wrong in the direction the viewer sees: two arcs that overlap slightly
  at a tangential joint draw a bright spot every few hundred light years along every curve

#### Scenario: A curve shows no facet

- **WHEN** the browser test opens a view at 8,000 light years on a region whose boundary a
  unit test has found to curve through more than 60 degrees inside one run, and walks the
  drawn line, fitting the direction of the drawn run over a window of 12 CSS pixels at each
  step
- **THEN** the direction changes by less than 3 degrees between neighbouring windows
  everywhere inside the run. A tessellation too coarse for the zoom fails this, and so does
  a fit that put a break where the data does not turn.

  The unit test SHALL choose the **widest** run that meets the sweep, and this is a
  requirement of the measurement rather than a convenience. The reading is the direction of a
  weighted centroid over a 12 CSS pixel baseline, so where a run flattens and lies along a row
  of pixels, less than one pixel of rise across the baseline turns into degrees. Measured on a
  narrow run the reading is about 8 degrees, and it is the measure and not the line: it does
  not move when the sub-chord count is raised fourfold, and it halves when the baseline is
  doubled. A kink in the drawn line does neither

#### Scenario: A join is not brighter than the line

- **WHEN** the browser test opens a view a unit test has chosen at a vertex where the two
  segments meet at **at least 60 degrees**, and reads the luminance of every pixel the
  overlay changes within 8 CSS pixels of that vertex
- **THEN** taking each pixel's change as the frame with the overlay less the frame without
  it, no pixel at the corner has a larger change than the largest change on a straight run
  of the same chain in the same frame, and no pixel inside the corner is unchanged.

  This is a harder test than the one it replaces. The smoothed polyline held every vertex
  to 20 degrees, so no two neighbouring segments could meet under 160 degrees and the
  sharpest thing the join rule ever saw was gentle. The simplified line keeps the right
  angles the region map has

#### Scenario: A long segment holds its width across the frame

- **WHEN** the browser test opens a view at 500 light years that a unit test has chosen so
  that a segment longer than 10,000 light years crosses the whole frame with both of its
  ends far outside it, and reads the width of the drawn run at the left, the middle and
  the right of the frame
- **THEN** the three widths agree within 1 CSS pixel, and each is 4 CSS pixels within 1


### Requirement: A region in view carries a label on its centre


The page SHALL draw region labels as text over the canvas.

**A region SHALL be a candidate when any part of it projects inside the viewport.** This
SHALL NOT depend on the share of the frame the region covers. A region that covers one
corner of the frame is named while its label fits, and a region that covers none of the
frame is not a candidate whatever its bounds are.

The test SHALL include the region that holds the plane point under the middle of the
frame, and the regions that hold the plane points under the four corners of the frame. A
region can fill the whole frame with none of its boundary and none of its centre in view:
the camera may sit inside a large region at the closest zoom, where the frame covers about
577 light years, and a rule that only walks boundaries and centres would then find nothing.

A frame corner whose ray runs away from the plane SHALL contribute nothing rather than
being treated as an error. The top edge of the frame looks 30 degrees above the view
axis, which is half the 60 degree vertical field of view, so the whole top edge misses
the plane at any pitch below 30, corners and edge middle alike, and the smallest pitch
the camera allows is 5.

A boundary segment with either end behind the camera SHALL be clipped against the camera
plane before it is projected. The projection returns a mirrored position for a point behind
the camera, so an unclipped segment gives a mirrored line, and both "does this cross the
viewport" and "which region is under this point" are then wrong.

**A region's centre SHALL be the plane point inside it that lies furthest from any of the
region's boundaries**, and it SHALL be the same point in every frame. This is not the
centroid: a region can be concave, and its centroid then lies outside it, while the
furthest point from the boundary cannot. Each region SHALL also carry the **clearance** at
that point, its distance to the nearest boundary. Measured over the 42 regions the
clearance runs from 2,361 light years for the `Galactic Centre` to 8,496 for `Acheron`,
with a median of 4,520.

**The required clearance of a label SHALL be worked out on the plane, not in pixels.** The
four corners of the box, at the scale it is drawn at and centred on the projection of the
anchor, SHALL be unprojected to the galactic plane. The required clearance is the largest
distance from the anchor to those four plane points, plus the boundary departure bound, plus
half the drawn line width converted at the largest light-years-per-pixel over the same four
corners, plus **two cells** of the trace grid. It SHALL be measured **at the anchor**, and
nowhere else. When a corner's ray does not meet the plane in front of the camera, the box
reaches past the horizon and SHALL NOT be drawn at that scale.

Three of those terms need saying. The corner term is the box's true footprint on the plane:
under perspective a rectangle on the screen unprojects to a trapezium, so the four distances
differ, and the largest of them is the radius of a disc about the anchor that holds the whole
box. The departure term is needed because the clearance is a distance to the traced boundary
while the rule is about the drawn line, and the drawn line may lie up to the departure bound
inside the region. The grid cell term covers the clearance field's downsample: a downsampled
cell carries the smallest exact value under it, and reading between such cells can return
more than the exact field holds at that point. With a block minimum over 8 by 8 cells
anchored at block centres and a field that is 1-Lipschitz, that overshoot is bounded by
measurement rather than by derivation: over every cell of the trace grid the largest is 0.1213
of a block width, which is 47.89 light years against a trace cell of 49.3494. Two cells rather
than one is deliberate margin, and the measurement sits above the 0.116 an earlier derivation
gave, which is why the margin is taken and not argued away.

**The footprint SHALL NOT be approximated by the pixel diagonal.** An earlier draft took half
the pixel diagonal of the box and converted it at the largest light-years-per-pixel over the
corners. Under obliquity those two choices compound: the along-plane scale at pitch 35 is
about 1.9 times the across-plane scale, and it was applied to the whole diagonal of a box
that is about 7 times wider than it is tall, so the requirement came out about twice the true
footprint. Measured over the 27 regions the frame shows at
`#c=15,0,25895&d=20000&p=35&y=0`, that draft drew **2** labels at 1280x720 and **4** at
1920x1080, and gave the `Galactic Centre` a scale of 0.43 and 0.66, both under the floor, so
the region under the middle of the frame carried no label. The rule above draws **14** and
**20** at the same views and gives the `Galactic Centre` 0.76 and 1.00.

**The clearance at a point SHALL be the larger of two lower bounds**: the interpolated
read of the downsampled clearance field, and the region's own recorded clearance less
the distance from the region's centre to that point. The second is sound because the
field is 1-Lipschitz, and it is exact at the centre, which is where most labels sit.
Measured over the plane, it never exceeds the true clearance by more than the one light
year the rounding allows, and it is the larger of the two at 12.3 percent of the points
inside the regions.

The second term is not decoration. The main thread holds the field downsampled by 8, and
each cell of it carries the smallest exact value in its block, so a read at a region's
centre — a local maximum of the field — comes back a median of 367.5 light years low. With
the field read alone a measured build draws **10** labels at 1280x720 rather than 14,
and the `Galactic Centre` reads 2,041 against the 2,196 its floor-scale box needs, so
the region under the middle of the frame carries no label although its true clearance
there is 2,361. With both terms the build draws 14 and 20, the same as it would with the
exact field, at the same scales.

**The anchor SHALL be a function of the camera alone, with no state carried between
frames.** It SHALL be worked out on the galactic plane and then projected, never chosen on
the screen. It SHALL be built in four steps:

1. **The wanted point.** The plane point under the middle of the frame. It exists whenever
   the camera sits above the galactic plane, which is when `cursor.y + distance x sin(pitch)`
   is greater than zero. The camera's cursor carries a `y` of its own and the controls move
   it, so this is not always true; when it is not, no label is drawn at all.
2. **The slide.** The anchor is the point of the straight plane segment from the region's
   centre to the wanted point **nearest the centre** at which the label box at the floor
   scale, centred on the projection of that point, lies wholly inside the **viewport inset
   by the label margin**. When the centre itself satisfies that, the anchor is the centre
   and the slide does not start. A point whose projection is not in front of the camera
   never satisfies it, whatever the arithmetic of the projection returns for such a point.

   **The label margin SHALL be at least 8 CSS pixels**, and a drawn box SHALL clear every
   frame edge by at least that much. Without it the slide stops at the first point where the
   box merely clears the edge, so a slid label sits flush against it: measured at
   `#c=15,0,25895&d=20000&p=35&y=0` at 1920x1080, 2 of the 20 labels touch a frame edge —
   `Outer Arm` at 0.0 CSS pixels and `Norma Expanse` at 0.2, while the other 18 clear by 90.5
   or more — and
   a label flush with the edge reads as clipped although it is inside. The margin is not a
   clamp. The box stays centred on its anchor and the anchor stays on the segment, so
   nothing is moved across a region boundary; the slide stops a little sooner.
3. **The region test.** The anchor SHALL resolve to the label's own region on the coarse
   region grid. When it resolves to another region, or to no region, no label is drawn. This
   is the step that ties the box to its region: the clearance field carries a distance and no
   identity, so it cannot tell an anchor inside the region from one inside a neighbour.
4. **The size.** The label is drawn at the largest scale in `[0.7, 1]` whose box, centred on
   the anchor, both holds the required clearance at the anchor and lies wholly inside the
   **viewport inset by the label margin**. When no scale down to the floor does, the label is
   not drawn. The inset applies here as well as in the slide, and it has to: the slide tests
   the box at the floor scale, and this step then grows it by up to 1.43 times in width. A
   label that never slides, because its centre is in frame near an edge, would otherwise
   grow until its box is flush with that edge. The search SHALL
   run until the interval of scales left is narrower than one CSS pixel of box width, so the
   work per frame is bounded and the drawn size does not step. The slide's search runs to a
   tolerance of its own, which is tighter; the paragraph on the slide gives it.

This is the owner's rule read literally: the label sits at the centre of its region, and
moves away from the centre towards the part that is displayed, only as far as it must.

**The clearance SHALL be tested at the anchor and not along the segment.** An earlier draft
required every point between the centre and the anchor to hold the clearance, and walked the
segment to find where that first failed. It is the wrong requirement twice over. The rule
that matters is that the drawn box lies inside its region, and the box is drawn at the anchor
alone; and because the required clearance grows without bound as a plane point recedes toward
the horizon while the clearance itself is at most 8,496 light years, the set of points that
hold it is not a prefix of the segment. A walk that reports the first failure would then
refuse a label whose anchor, nearer the camera, is perfectly safe.

Step 2 needs no such walk. Its condition is only "the projected point lies inside a fixed
inset rectangle", and the argument below shows the set that satisfies it is a single
interval, so the nearest such point is well defined and moves continuously. Step 3 is what
the walk was really being asked to do, and it does it in one read rather than hundreds.

**Steps 3 and 4 together put the whole box inside the region.** Step 3 puts the anchor
inside it. Step 4 makes the clearance at the anchor at least the radius of a disc that
holds the box, so every point of the box lies inside that disc, and the disc holds no
boundary.

The coarse grid is coarse — 507 by 507 cells of 197.3976 light years, with a diagonal of
279.16 — and it takes the id of one trace cell for each of them, so near a boundary it
can answer for the wrong side. It cannot do so where a label is drawn, and this rests on
measurement rather than on the cell size alone: over the whole trace grid the largest
clearance at any cell the coarse grid reads wrongly is **110 light years**, while a
drawn label needs at least the departure bound plus two trace cells, which is 298.7. Of
the 3,710,567 cells at or above that clearance, **not one** reads back a different id.

Step 2 is continuous in the camera, and its "nearest the centre" is well defined rather than
a choice among candidates. The argument matters, because without it the rule would be an
argmax and would jump:

- The segment ends at the wanted point, which projects to the exact middle of the frame, so
  the set of points that satisfy step 2 contains the far end and is not empty, unless the
  viewport is itself smaller than the floor-scale box and its margins.
- The part of the segment in front of the camera is a suffix, because "in front" is one side
  of a plane. A projective map takes a line to a line and is monotone on each side of its
  pole, and the pole is exactly where the segment crosses that plane. So over that suffix the
  projection traces a straight path across the screen, in one direction.
- "The floor-scale box lies inside the viewport" is "the projected point lies inside a fixed
  inset rectangle", which is convex.

A line crossing a convex set, traversed monotonically, meets it in exactly one interval. So
the feasible set is one interval ending at the far end of the segment, and the anchor is its
near end. There are no disjoint stretches to choose between.

The same argument bounds how fast the anchor can slide. The screen path always passes through
the middle of the frame, so it crosses the edge of the inset rectangle at an angle no
shallower than the rectangle's own diagonal, about 29 degrees at 1920x1080. The entry point
therefore cannot sweep much faster than the path itself moves.

The anchor SHALL move whenever the camera moves. Over a camera turn of 0.1 degrees between
two frames, the **drawn position of a label** SHALL move, and SHALL move by less than 12
CSS pixels. Both halves are needed. A rule that chooses on a screen-fixed lattice leaves
the label unmoved in most frames and carries the whole motion in the rest, which only the
lower bound catches. The upper bound holds two terms: the camera carries a fixed plane point
about 1.6 CSS pixels at the middle of the frame and about 3.4 at its side, at 1080 rows and a
60 degree vertical field of view, and the slide adds a term the argument above bounds but
does not put a number on, so it SHALL be measured against this bound rather than assumed.

**A label box SHALL be centred on its anchor**, and SHALL NOT be moved from it to fit the
frame. The old rule held a box inside the viewport with a 48 pixel inset, which slides a box
off its anchor and can push it across a boundary. Step 2 already keeps the box inside the
frame wherever the slide can reach.

**A label SHALL stay legible over the frame behind it.** The text SHALL hold a contrast
ratio of at least **3 to 1** against the ground it is drawn on, measured from the pixels the
page draws. The style is one colour with a dark glow, chosen for the dark space between the
arms; over the core both the text and the background are bright, the glow reads as a smudge,
and the weakest label on the page is `GALACTIC CENTRE` — the one region the rules above work
hardest to guarantee is named. Whatever the style does about it, the property is measured
from the frame and not asserted by eye.

The measurement SHALL be defined, because the number depends on which pixels are read and
how they are combined, and two honest builds must get the same answer:

- The pixels SHALL be read from the frame **with the label drawn**, inside the label's box.
  The ground is what the eye sees around the glyph, so a treatment that changes the ground —
  a plate behind the text, or a wider outline — SHALL be credited by the measurement. A read
  of the frame with the label switched off cannot credit either, and would leave a colour
  change as the only treatment the rule can see.
- The **text pixels** are the pixels whose colour is within 10 percent of the text colour in
  each channel, which is the solid core of the glyphs and not their antialiased edge.
- The **ground pixels** are the pixels of the box that are neither text pixels nor within 1
  CSS pixel of one, so the antialiased edge falls in neither set.
- The ratio SHALL be `(L1 + 0.05) / (L2 + 0.05)`, where `L1` and `L2` are the WCAG relative
  luminance of the **median** text pixel and the median ground pixel, ordered so the ratio is
  at least 1. The median rather than the extreme, because one bright star behind a glyph is
  not a legibility fault.
- Every label on the page SHALL hold the bound, not the average of them.

**A label box SHALL lie wholly inside its own region on screen, and SHALL NOT touch the
drawn boundary line.** The box is the drawn text with its padding. This rule is what makes a
cap on the label count unnecessary: regions do not overlap on the plane, and the plane
projects one to one, so two boxes that each lie inside their own region cannot overlap each
other.

**With the overlay on and the zoom inside the fade band, a label SHALL NOT be drawn when,
and only when**, one of four things is true. The overlay switch and the fade are rules of
their own, above; they remove every label together and are not reasons one label is missing
while its neighbours are drawn.

- **The camera is not above the galactic plane**, so step 1 has no wanted point. No label is
  drawn in that frame at all.
- No part of its region projects inside the viewport.
- **No point of the segment has its floor-scale box inside the inset viewport**, which also
  covers the degenerate case of a viewport smaller than that box and its margins.
- **The anchor fails step 3 or step 4**: it resolves to another region, or the clearance
  there does not hold the box at any scale down to the floor. The first half is what happens
  when the region's visible part lies past a concavity, because the segment is straight and
  cuts the corner. The second is what happens when the zoom has widened until the box needs
  more light years than the region has, or when a corner of the box reaches past the horizon.

These four are exhaustive: a region is either a candidate or not, which is the second
reason, and for a candidate step 1 either yields a wanted point or does not, step 2
either yields an anchor or does not, and steps 3 and 4 either accept that anchor or do
not.
There SHALL be no maximum number of labels, and no rule that drops a label because another
label was placed first.

**A label SHALL fall to the floor scale before it leaves the page**, except when the
first of the four reasons removes every label at once. The scale is continuous in the
camera wherever the label is drawn, and the anchor is too, so a label that is about to
go for the second, third or fourth reason shrinks through the band first. A scale above
the floor means the anchor is the region's centre, which always reads back as its own
region, so only step 4 can refuse it and step 4 is continuous. A camera that drops below
the galactic plane is the one case that takes a label off at whatever size it had.
Measured over 168 steady pans, 42 regions in four directions, the largest scale a label
ever left the page from is 0.7023. Eight of those pans reach the model bounds before the
region leaves the frame, because the cursor is held inside them; they carry no reading, so the
figure is over the 160 that finish.

The rule does not promise that a label leaves once and stays away. Both sides of the
size test move as the camera moves, and neither is monotone along a pan: the anchor
slides, and the light years under a pixel grow with range. A label can therefore leave
and return. That is measured, not assumed: of the same 168 pans at a zoom of 2,000 light
years, **four** show a return — `Arcadian Stream` panning in `-z`, `Mare Somnia` in `-x`,
`Aquila's Halo` in `-z` and `Kepler's Crest` in `+x`. Every one leaves and returns at the
floor scale. The count belongs to the pan and not to the placement: the same 168 pans at a
zoom of 20,000 give **two** returns, at `Newton's Vault` and `Sanguineous Rim`. No count is
asserted for that reason. What the rule does give is that no
label is ever dropped because another was placed first: there is no ordering between
labels left for a near tie to swap, which is what made the old placement blink, and the
same camera always gives the same answer.

**The region the view is centred on SHALL be named** whenever its label fits at any scale
down to the floor. The plane point under the middle of the frame names one region, and that
region carries a label. The `Galactic Centre` has the smallest clearance of the 42, at 2,361
light years, so it is the region where this is most likely to fail.

The placement SHALL cost, at 1920x1080, less than **0.5 milliseconds** of the main thread
as a mean over 300 frames and less than **2 milliseconds** in any single frame. The page
SHALL expose both figures so a test can read them.

The work is small and bounded because there is no walk. Per region: one unprojection for the
wanted point, which is shared by every region in the frame; a bisection for the slide, which
SHALL run until the interval is shorter than one CSS pixel on screen rather than for a fixed
count, and which a measured build runs to 0.05 CSS pixels; and **one read of the clearance
field**, at the anchor. The slide is run tighter than the bound because whatever slack it
leaves, the box grows into: the slack lets a larger box fit, so at one CSS pixel a slid label
draws up to 0.747 rather than at the floor, and `A label falls to the floor scale before it
leaves` allows 0.01. At 0.05 CSS pixels every slid label draws at 0.700, and the extra four or
five steps for each region that slides cost 0.001 milliseconds of the 0.5 millisecond mean. The view-projection matrix
SHALL be built once for a frame and reused, not rebuilt per projected point. The screen sweep
this replaces read about 2,000 points and cost 1.0 to 1.8 milliseconds.

Labels SHALL follow the same zoom fade in as the boundaries: none at 30,000 light years
and above, full at 20,000 and below. Labels SHALL NOT fade out at close zoom.

**The browser scenarios below run at 1920x1080 unless one names another viewport.** The
viewport changes the answer, because the box is a fixed number of pixels while the light
years under a pixel are not: at `#c=15,0,25895&d=20000&p=35&y=0` a measured build of this
rule draws **14** labels of the 27 regions the frame shows at 1280x720 and **20** at
1920x1080, and gives the `Galactic Centre` a scale of 0.76 and 1.00. The existing label suite
runs its block at 1280x720; scenarios that count labels or read one region's box SHALL name
the viewport they hold at.

#### Scenario: No label at the far view

- **WHEN** the browser test opens the default view
- **THEN** the page holds no region label

#### Scenario: A label sits on the centre of its region

- **WHEN** the browser test opens, at 1280x720, `#c=15,0,25895&d=20000&p=35&y=0`, reads
  the box of the `Galactic Centre` label, and resolves the plane point under the middle of
  that box
- **THEN** the plane point is within 200 light years of that region's precomputed centre,
  because the centre projects well inside the frame in that view and the slide does not
  start

#### Scenario: A label clears the frame edge

- **WHEN** the browser test opens, at 1920x1080, `#c=15,0,25895&d=20000&p=35&y=0` and reads
  the box of every label on the page
- **THEN** every box clears all four frame edges by at least the label margin. A measured
  build of the rule this replaces puts 2 of 20 boxes hard against an edge, at 0.0 and 0.2
  CSS pixels

#### Scenario: A label over the bright core stays legible

- **WHEN** the browser test opens, at 1920x1080, `#c=15,0,25895&d=20000&p=35&y=0`, reads the
  pixels of every label's box from the frame with the label drawn, splits them into text
  pixels and ground pixels by the rule the requirement gives, and works out the ratio of
  their median relative luminance
- **THEN** every label holds at least 3 to 1, and the `Galactic Centre` label holds it over
  the brightest part of the disc. That is the label the placement rules guarantee and the
  frame under it is the brightest on the map, so it is where the style fails first

#### Scenario: A label lies inside its own region

- **WHEN** the browser test opens, at 1920x1080, `#c=15,0,25895&d=20000&p=35&y=0` and, for
  every label on the page, resolves the plane point under each of the four corners of its
  box and under its middle
- **THEN** all five points of every box resolve to the region that label names

#### Scenario: A label never touches its boundary

- **WHEN** the browser test opens, at 1280x720, `#c=15,0,25895&d=20000&p=35&y=0` twice,
  once with the region overlay on and once with it off, takes the pixels the overlay
  changed, and intersects them with the box of every label
- **THEN** no label box contains a pixel the overlay changed

#### Scenario: No two labels overlap

- **WHEN** the browser test opens, at 1920x1080, `#c=15,0,25895&d=20000&p=35&y=0` and
  reads the box of every label
- **THEN** no two boxes overlap. The rule above makes this a consequence rather than a
  separate step, and the scenario is kept because it is the property the viewer sees

#### Scenario: The region the camera is inside is named at every zoom

- **WHEN** the browser test opens `#c=0,0,0&p=35&y=0` at each of 20,000, 10,000, 4,000,
  1,000 and 500 light years
- **THEN** a label reading `Inner Orion Spur` is on the page at every one of the five
  distances, and its box lies inside the viewport. At the closest distance this exercises
  the slide and not the centre: the region's centre is about 4,100 light years from Sol,
  so at a zoom of 500 light years it projects far outside the frame. At 1,000 it still
  projects inside the frame and the label draws on the centre

#### Scenario: The region under the middle of the frame is named

- **WHEN** the browser test opens, at 1280x720, `#c=15,0,25895&d=20000&p=35&y=0` and
  resolves the plane point under the middle of the frame to a region
- **THEN** that region carries a label on the page, at full size or at any scale down to
  the floor. Should the measured build place this region below the floor, the fix is a
  smaller floor or a smaller label, not a weaker scenario: the guarantee that the region
  the view is centred on is named is one the current spec already gives

#### Scenario: The label holds the centre while the centre is usable

- **WHEN** a unit test places a label for a region whose centre projects inside the
  viewport with room for the whole box
- **THEN** the anchor is the region's centre exactly

#### Scenario: A near region is named in an oblique frame

- **WHEN** the browser test opens, at 1280x720, a view with the cursor 20,000 light years
  above the plane at a pitch of 5 degrees and a zoom of 20,000 light years, so the camera
  sits 21,743 light years above the plane, the middle-of-frame ray meets the plane about
  249,000 light years away and the bottom edge about 38,000
- **THEN** at least four regions carry labels. This frame is the hard case and the
  scenario says so rather than claiming comfort: over the corners of a box that sits just
  above the bottom edge the largest light-years-per-pixel is about 122, so a mid-length
  box at the floor scale has a footprint of about 2,900 light years and needs about 3,500
  of clearance, against a median region clearance of 4,520 and a smallest of 2,361. A
  measured build of the rule draws 7 labels in that frame. How many regions the frame shows
  depends on how they are counted: a sweep of the coarse grid at 8 CSS pixels finds 34

#### Scenario: The label leaves the centre when the centre leaves the frame

- **WHEN** a unit test places a label for a region whose centre projects outside the
  viewport while part of the region is still on screen
- **THEN** the anchor is not the region's centre, it lies on the segment from the centre
  towards the plane point under the middle of the frame, the whole box lies inside the
  region, and the box lies inside the viewport

#### Scenario: An anchor in a neighbouring region draws no label

- **WHEN** a unit test places a label for a concave region whose visible part lies past the
  concavity, so the straight segment from the centre cuts the corner and the anchor lands in
  the neighbour
- **THEN** no label is placed, and the same anchor would have passed the clearance test,
  because the neighbour has room there

#### Scenario: The footprint is measured on the plane

- **WHEN** a unit test works out the required clearance of a label at
  `#c=15,0,25895&d=20000&p=35&y=0` both ways: from the four corners unprojected onto the
  plane, and from half the pixel diagonal converted at the largest light-years-per-pixel over
  those corners
- **THEN** over the labels on the page the pixel form asks for a median of at least 1.5
  times what the plane form asks for, and for more than the plane form on every label. The
  smallest ratio measured is 1.04, on `Norma Arm`, whose box sits near the middle of the frame
  where the two screen axes scale alike; the median is 2.00 at 1280x720 and 2.08 at 1920x1080,
  so a scenario that named one label would rest on which label it named.

  The bound sits below the measurement on purpose. Both forms carry the same three constant
  terms — the departure bound, the line width and the two trace cells — and those dilute the
  ratio. Over the footprint term alone the medians are 2.21 and 2.33, which is where an
  earlier draft's quoted 2.18 and 2.58 came from. A bound of 2 would sit 0.18 percent below
  the measured median at 1280x720, which is the knife edge this change refuses elsewhere

#### Scenario: A box corner past the horizon is refused

- **WHEN** a unit test places a label at a pitch low enough that the horizon crosses the box,
  so a corner's ray does not meet the plane in front of the camera
- **THEN** the box is refused at that scale, and the label is drawn at a smaller scale or not
  at all, rather than measured against a corner that has no plane point

#### Scenario: The clearance read never claims more room than there is

- **WHEN** a unit test compares the clearance the placement reads with the exact field, at at
  least a hundred thousand points spread over the 42 regions
- **THEN** the read never exceeds the exact field by more than the two cells of the trace grid
  the requirement allows for, and the term taken from the region's centre never exceeds it by
  more than the one light year the rounding allows. This is the property the whole label rule
  rests on, and it holds away from the centres, not only at them

#### Scenario: The clearance read is exact at a region's centre

- **WHEN** a unit test reads the clearance the placement uses at each of the 42 region
  centres, and compares it with the exact clearance the worker recorded for that region
- **THEN** the two agree, although the downsampled field alone reads a median of 367.5 light
  years low at those points

#### Scenario: The clearance is tested where the box is drawn

- **WHEN** a unit test places a label for a region on whose segment the required clearance
  is not held at some point between the centre and the anchor, while it is held at the
  anchor itself
- **THEN** the label is drawn. A rule that walked the segment and stopped at the first
  place the clearance failed would refuse it, and the box it refused would have been
  inside the region

#### Scenario: The camera below the plane draws no label

- **WHEN** a unit test places labels for a view whose camera sits at or below `y = 0`,
  which the cursor's own height and the pitch together allow
- **THEN** no label is placed, and the placement reports the reason rather than throwing
  on a wanted point that does not exist

#### Scenario: A frame corner that misses the plane contributes nothing

- **WHEN** a unit test runs candidacy at a pitch of 5 degrees, where the upper corners of
  the frame look above the horizon
- **THEN** candidacy uses the corners that do meet the plane, ignores the ones that do
  not, and still finds the region under the middle of the frame

#### Scenario: A boundary segment behind the camera does not make a false candidate

- **WHEN** a unit test runs candidacy on a region whose only boundary segment near the
  frame has one end behind the camera, positioned so that the unclipped projection of that
  end lands inside the viewport while the segment itself is wholly behind or outside it
- **THEN** the region is not a candidate on the strength of that segment

#### Scenario: The clearance read does not step across a cell of the field

- **WHEN** a unit test moves the camera so that the anchor travels across several cells of
  the clearance field, and reads the clearance the placement uses in every frame, and reads
  it again with the field taken by nearest cell rather than by interpolation
- **THEN** the interpolated read changes by a small amount from frame to frame, and the
  nearest-cell read steps by at least twice as much at a cell edge.

  The scenario reads the clearance and not the drawn scale, because the drawn scale cannot
  carry the property. The anchor only moves when it has slid, step 2 stops the slide at the
  first point whose **floor-scale** box fits the viewport, and no larger box fits there, so
  a moving anchor always draws at exactly the floor. A scenario written on the drawn scale
  would read 0.700 in every frame and could not fail. The clearance read is the quantity the
  interpolation exists to smooth, and a nearest-cell read fails this

#### Scenario: A centre behind the camera never holds the label

- **WHEN** a unit test places a label for a region whose centre lies behind the camera, in
  a view where the projection arithmetic returns a mirrored position for it that falls
  inside the viewport
- **THEN** the anchor is not the centre, and the label is either placed further along the
  segment or not drawn

#### Scenario: A label moves with the camera and does not snap

- **WHEN** a test opens `#c=0,0,0&d=2000&p=35&y=0` at 1920x1080, where the region's centre
  projects inside the frame, and again `#c=0,0,0&d=500&p=35&y=0`, where it does not, turns
  the camera by 0.1 degrees between frames over 120 frames in each, and in every frame
  reads the drawn position of the `Inner Orion Spur` label
- **THEN** in both views the label moves in every frame, and no frame moves it by 12 CSS
  pixels or more. The second view is the one that tests the slide: the first holds a fixed
  plane point whose projection moves by construction, so it cannot fail on the rule the
  bound exists to protect

#### Scenario: The placement carries no state between frames

- **WHEN** a unit test places the labels of one frame twice, once after a run of 100
  different frames and once from a fresh start
- **THEN** the two results are identical, because the anchor is a function of the camera
  alone

#### Scenario: A small region scales its label and then hides it

- **WHEN** a unit test places a label for a region whose area on screen shrinks over
  consecutive frames from wide enough for the full box, to wide enough only for a smaller
  one, to narrower than the floor scale
- **THEN** the label is drawn at full size, then at a scale between 0.7 and 1, then not
  drawn; and in every frame in which it is drawn its box lies inside the region

#### Scenario: A label falls to the floor scale before it leaves

- **WHEN** the browser test opens a view holding a region at 1920x1080, then pans steadily
  in one direction until no part of that region projects inside the viewport, reading the
  scale of that label in every frame
- **THEN** in the last frame the label is on the page its scale is within 0.01 of the floor.
  A browser cannot check the "only when" of the four reasons without recomputing the
  placement, which would make the test a copy of the code; this asserts the part of it the
  viewer sees, which is that a label shrinks away rather than vanishing at full size

#### Scenario: More than twelve labels can show at once

- **WHEN** a unit test places labels for a frame in which 20 regions each project inside
  the viewport with room for their boxes
- **THEN** 20 labels are placed, because there is no cap and no label is dropped for
  overlapping another

#### Scenario: A region with nothing on screen carries no label

- **WHEN** the browser test opens `#c=0,0,0&d=500&p=35&y=0`, reads every label on the
  page, and works out for itself which regions the frame shows, by resolving the plane
  point under a grid of screen points against the coarse region grid rather than reading
  anything the label code made
- **THEN** every label on the page names a region the frame shows, and no label names a
  region it does not

#### Scenario: The placement stays inside its budget

- **WHEN** the browser test opens `#c=15,0,25895&d=20000&p=35&y=0` at 1920x1080 and reads
  the mean and the worst placement time the page exposes over 300 frames
- **THEN** the mean is under 0.5 milliseconds and the worst single frame is under 2


## REMOVED Requirements

### Requirement: The boundary set is simplified to straight segments

**Reason**: The requirement holds the drawn line to one primitive, a straight segment, and
guards its quality with a bound on short segments. Both describe the fault this change
removes. Measured on the real data the straight fit turns by up to 30.6 degrees where the
traced boundary runs straight, and the `Galactic Centre`, a near-circular region, draws as a
heptagon. The fit tolerance cannot repair it: below about 80 light years the simplification
stops cutting across the 49.3494 light year raster and starts tracing it, so at 60 light
years the worst such turn is 90 degrees and 243 places turn by more than 15, against 14
today. The primitive is the limit, not the parameter.

**Migration**: The replacement is `The boundary set is simplified to arcs`. The trace, the
chain linking, the region pair of each chain, the kept-vertex rule, the 200 light year
departure bound measured both ways, the two-chord traced turn, the precision and recall
corner rules, the chain-end sharing and the transferability all carry over word for word.
The fit tolerance stays at 190 light years and the measured departure is unchanged at 185.8
and 189.8, because an arc bulges towards the traced boundary that its chord was cutting the
corner off.

Three things change. The primitive gains a signed curvature, so one type carries an arc and
a straight line. The kept vertices are joined by a tangent-continuous biarc spline, broken
only where the traced boundary turns by more than 30 degrees. A biarc joint is therefore a
computed point and is no longer guaranteed to be a traced node; only kept vertices and chain
ends carry that guarantee, which is what still keeps the map watertight.

The bound of at most 20 segments shorter than 500 light years is **retired**. It stands in
for "the line does not read as faceted", and for an arc spline it measures the opposite of
what it means: an arc is drawn as a run of short pieces, and shortness is what makes it
smooth. `The line does not facet` replaces it and measures the property directly — at a
place the traced boundary does not corner, the turn of the drawn line over a 500 light year
window each side is at most 10 degrees above the traced turn — and it can fail on the line this change removes, whose
drawn turn reaches 30.6 degrees where the traced turn is near zero. The bound is relative
and not a pair of thresholds, because two thresholds leave a band of curvature that a
correct fit falls into. `The set is small enough to upload once` carries over at its new
numbers and gains a bound on the primitive count.
