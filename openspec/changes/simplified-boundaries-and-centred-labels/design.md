## Context

See `proposal.md` for motivation and for the measurements.

Three facts shape the approach.

The trace already gives the right input. `traceRegionChains` links 38,563 unit edges into
123 chains, splitting at the 82 lattice nodes where three or more regions meet. A chain
separates exactly one pair of regions and no edge belongs to two chains, so the chains are
**shared** by construction. Everything below simplifies chains, never regions, which is
what keeps the map watertight.

The label work runs on the main thread every frame; the boundary work runs once in a
worker. `astro/codex-region-lookup` is 199 KiB and must stay in the worker chunk, out of
the page chunk, which has a 130,000 byte limit.

The previous change established that a position chosen on a screen-fixed lattice is
piecewise constant and therefore steps. Any anchor rule has to be a world-space point that
is projected, not a screen-space choice.

## Goals / Non-Goals

**Goals:**

- One simplification, one departure number, and a line that keeps the corners the data has.
- Corners shared exactly, so the drawn map has no slivers at any departure bound.
- A label anchor that is a fixed world point while it can be, and moves by a bounded step
  when it cannot.
- A label that is provably inside its own region, so no cap and no overlap rule is needed.

**Non-Goals:**

- Moving the region data or the trace. The 49.3494 light year raster and the chain linking
  stay as they are.
- Curved primitives. See the decision below; they were the starting point of this change
  and the measurement retired them.
- Removing the coarse region grid from the main thread. Placement no longer sweeps it, but
  the tests still resolve plane points through it, and taking it out is a separate saving.
- Moving the departure bound into page code. `REGION_DEPARTURE_LY` lives in
  `src/scene-data/region-lines.ts`, which imports the 199 KiB region lookup; importing it
  from `src/app/labels.ts` would pull that into the page chunk. The bound travels on the
  worker message with the boundary set instead.
- Any change to the ribbon shader, the coverage buffer or the composite.

## Decisions

### Straight segments only. The arc primitive was measured and dropped

This change began as a fit to two primitives: an arc holding a constant distance from the
galactic centre, and a ray holding a constant direction from it. The polar structure that
motivated it is visible in the data, but the primitive did not survive being built. The
share of boundary length that runs close to one of those two directions is not quoted here:
my measurement and an independent reimplementation during review disagreed by a wide margin
(92 percent against 70), the figure depends on choices the method has to state, and nothing
in this design now rests on it.

**A strict arc-and-ray fit cannot close its corners.** Two arcs of different radii never
meet. Two rays through the centre meet only at the centre. Built with the ends left on the
traced nodes, no arc endpoint lies on its own arc and the departure reaches 390 light
years. Built with the ends projected onto their own primitives, the two ends at an interior
joint land a median 225 light years apart, which is a 425 pixel hole in the line at the
closest zoom, 252 times over.

**Forcing the fit to alternate arc and ray fixes the corners and staircases the
diagonals.** Corners then close exactly, but a boundary that runs diagonally in polar
coordinates can only be drawn as a rectilinear staircase: 676 primitives at a 200 light
year bound, of which 245 are shorter than 500 light years. That is the faceting this change
exists to remove.

**Adding a general line to the arc fixes connectivity and still loses.** Measured against
the same chains at a 200 light year bound, counting a vertex as an invented corner when it
turns by more than 20 degrees while the traced boundary runs straight within 500 light
years of it:

```
                           primitives   drawn vertices   honest corners   invented
  straight lines only             421              544              222         10
  arcs preferred on a tie         463            3,101              241         47
  arcs preferred more strongly    494            4,070              239         52
```

(Those three rows come from one greedy at a 200 light year bound and are for comparison
between the models. The numbers this change asserts come from the straight fit at a 190
light year tolerance, measured separately: 439 segments and 562 vertices.)

Arcs make the line worse. The reason is the same connectivity constraint: an arc that has
to start on the previous corner cannot also choose its radius, so it takes the wrong radius
and needs a sharp turn to rejoin. A fit that chose corner positions and arc radii together
would do better, and that is a real piece of work — it is not a parameter.

It is also work with little left to buy. At a 200 light year departure a straight chord
already tracks a circle of radius 25,000 light years for 6,300 light years before it
leaves the bound, and the turn between two such chords is 14.5 degrees. The arc pays at a
tight bound — at one grid cell it gives 1,018 primitives against 2,701 vertices for a
straight fit — and stops paying at the loose bound this change asks for. The owner asked
for massive simplification and accepted loss to get it, which is the regime where the
straight line wins.

### Simplify at 190 light years, assert 200

Exploration suggested the inner galaxy might need its own looser bound. With arcs gone that
distinction goes with it: a straight fit does not care which direction the boundary runs.
There is one number.

The fit tolerance and the asserted bound are deliberately different. Douglas-Peucker's
residual is exactly its tolerance, so fitting at 200 and asserting 200 leaves a knife edge:
a measured build lands at 200.0 light years traced to drawn, and any change of criterion —
distance to the segment rather than to the infinite line, a different tie-break — pushes it
over and fails the test for no real reason. Fitting at 190 gives 185.9 and 189.8 against a
bound of 200.

The distance used inside the fit is to the **segment**, not to the infinite line through
its ends. The two differ where a chain doubles back, and the segment measure is the one the
departure scenario checks.

The bound is checked by walking both polylines at a 10 light year step, not by checking
vertices. A vertex check passes trivially, because every vertex of the simplified line is a
traced node; the departure lives between the vertices.

### Corners need no store

With straight segments, a corner is a vertex, and a vertex is a traced node. Two chains
that meet at a lattice node keep that node as their first or last vertex, so they share the
point exactly and no rule is needed to make them agree. This is the whole of what the arc
model needed a corner store for.

### The label centre is the point furthest from any boundary

Not the centroid. `REGIONS` already carries a centroid, and for a concave region or a
region that shows as two patches the centroid lies outside it. The point furthest from
every boundary cannot.

It comes from one exact Euclidean distance transform over the same 2,027 by 2,027 region
grid the trace reads, seeded on every cell that has a neighbour of another id. Inside a
region that field is the distance to that region's own boundary, so one field serves all 42.
The per-region centre and clearance are its maximum within each region. Measured, the
clearance runs from 2,361 light years for the `Galactic Centre` to 8,496 for `Acheron`,
with a median of 4,520.

### The anchor slides out along one segment, and carries no state

Three earlier drafts failed here, and the first two failed the same way: they made the
anchor a **choice** and then tried to smooth the choice.

The first gave each region a precomputed interior path and slid the anchor along it. The
`Inner Orion Spur` centre is about 4,100 light years from Sol, so at `#c=0,0,0&d=500` it
projects far outside the frame, a single polyline is not guaranteed to reach the part the
frame shows, and a step bounded in screen pixels covers 4.3 light years per frame at that
zoom — about 960 frames to arrive.

The second made the target the point of greatest clearance whose projection lies in the
frame, and bounded the anchor's step toward it. That is an argmax over a feasible set, and
an argmax is not continuous: it jumps whenever two separated points change places. Bounding
the step converts the jump into a lag rather than removing it.

The third aimed a ray at the nearest point of the viewport inset rectangle and marched it in
64 samples. Two faults. The clamped point is fine — the rectangle is convex and the nearest
point projection onto a convex set is 1-Lipschitz — but the plane point under it is not: for
any pitch below 30 the horizon is inside the frame, and as the clamped point approaches it
the plane point runs to infinity. And a fixed sample count quantises the anchor to its
samples, so it jumps by a whole step and proves clearance only to within half a step.

The rule now has no choice in it and no fixed sampling:

```
  centre  --------------------------------->  plane point under the middle of the frame
     |
     +-- the anchor is the point NEAREST THE CENTRE whose floor-scale box is on screen.
         It is then kept only if it reads back as this region on the coarse grid,
         and the box is drawn at the largest scale the clearance there holds.
```

The wanted point is the plane point under the middle of the frame. It exists whenever the
camera sits above the galactic plane. That is not automatic: `View.cursor` carries a `y` of
its own, the controls move it on the R and F keys, and the URL fragment sets it, so the
camera can be below the plane. The spec makes that one of the four reasons no label is
drawn, rather than leaving the case unwritten. The anchor slides out only as far as it must
to get the box on screen, which is the owner's second rule word for word, and the clearance
at the anchor then holds the box off the border, which is the owner's third.

**There is no walk.** Three drafts of this rule tried to guarantee the clearance along the
whole segment from the centre to the anchor, first by sampling it, then by a sphere trace,
then by an exact solve cell by cell. Each was blocked for a different reason, and the last of
them for the deepest: the required clearance grows without bound as a plane point recedes
toward the horizon, while the clearance itself is at most 8,496 light years, so the points
that hold it are not a prefix of the segment. A walk that reported the first failure would
refuse a label whose anchor, nearer the camera, was perfectly safe.

The requirement never needed it. What has to be true is that the **drawn box** lies inside
its region, and the box is drawn at the anchor alone. So the clearance is read once, at the
anchor, and the scale is the largest that fits there. The slide is a bisection on a condition
that involves no clearance at all — "the projected point lies inside a fixed inset rectangle"
— which is exactly the condition the connectedness argument needs to be convex.

The walk did do one thing the clearance read alone cannot, and that job moves to a step
of its own. Starting inside the region and never crossing a point whose clearance was
too small, the walk could not leave the region. A clearance read cannot tell that: the
field holds a distance and no identity, so inside a neighbour it reports the neighbour's
room. **Step 3 therefore reads the anchor's region id from the coarse grid**, which the
page already holds for candidacy, and refuses the label when it is not this region. That
grid is 507 by 507 cells of 197.3976 light years and takes the id of one trace cell for
each, so near a boundary it can answer for the wrong side. Measurement says it cannot do
so where a label is drawn: over the whole trace grid the largest clearance at any cell
it reads wrongly is 110 light years, against the 298.7 a drawn label needs at least, and
of the 3,710,567 cells at or above that clearance not one reads back a different id.

That removes a whole class of problem with it: no per-cell threshold, no quadratic roots, no
cell-edge tie-break, no traversal bound, and a cost of one field read per region per frame
rather than hundreds.

**Behind the camera.** `project` returns a mirrored position with `inFront: false` for a
point behind the camera, and at `d=500` the `Inner Orion Spur` centre is behind the
camera at about 45 percent of yaws. The roadmap records the behind-camera negation as a
rule an earlier change was able to delete once the sweep made world-point projection
unnecessary. This change brings world-point projection back, so it brings the rule back
with it: a point that is not in front of the camera never satisfies the on-screen
condition, whatever its arithmetic returns.

**What it gives up.** The segment is straight, so for a region whose visible part sits past a
concavity, the segment cuts the corner and the anchor lands in a neighbour. The region test
then refuses the label. That is the honest trade for continuity, and the disappearance rule
names it as the first half of its fourth reason. A search that could round a corner would be
the argmax again.

Without that test the label would still be drawn, in the neighbour. The clearance field
carries a distance and no identity, so at a point inside region B it reports B's room,
and the box can pass. Measured at `#c=15,0,25895&d=20000&p=35&y=0` over the 27 regions
the frame shows, six anchors at 1280x720 and five at 1920x1080 land outside their own
region. At 1920x1080 `The Void`, whose anchor sits in `Outer Arm`, clears the size test
there by about 200 light years, reading the clearance the way the placement does, and
would be drawn inside its neighbour. Two more sit within about 100 light years of the
line either way, so how many would draw is decided at the tens of light years, and two
implementations can disagree on the count; that is why no count is quoted. The walk used
to prevent all of this as a side effect, by never leaving a point whose clearance held;
one coarse-grid read does it directly.

**What it costs.** One unprojection for the wanted point, shared by every region in the
frame; per region, one bisection for the slide, one coarse-grid read, one clearance read
and four corner unprojections for each box size the last step tests. The view-projection
matrix is built once for the frame and reused: `project` rebuilds it on every call, and
the sweep it replaces deliberately avoided that.

The earlier draft's cost argument was wrong and is worth recording so it is not repeated: it
claimed a search could be clipped by unprojecting the four frame corners, and that at wide
zoom the fade has already removed the labels. At `#c=15,0,25895&d=20000&p=35&y=0`, which is
the view the budget scenario uses, the four corners unproject to a plane box about 234,000
by 126,000 light years — larger than the whole 100,041 light year field, at a zoom where the
labels are fully faded in. Obliquity, not zoom, is what makes that box large.

### Fitting the box: at the floor scale, and against the drawn line

The feasibility test uses the box **at the floor scale**, not at full size. The scale and
the anchor otherwise depend on each other: the scale is the largest that fits at the anchor,
and the anchor depends on how big the box is. Testing at the floor breaks the circle and
keeps the promise that a region which can hold a small label is never refused a place for
it. The drawn scale is then the largest in `[0.7, 1]` that fits at the anchor the floor-scale
test chose.

The clearance is a distance to the **traced** boundary. The rule is about the **drawn**
line, which may sit up to the departure bound on the region's side of it, and which is 4
CSS pixels wide. The test therefore requires

```
  clearance  >=  the box's footprint on the plane + the departure bound
                 + half the line width + two cells of the trace grid
```

where the footprint is the largest distance from the anchor to the four corners of the box
**unprojected onto the plane**, and the line width is converted at the largest
light-years-per-pixel over those same corners.

**The footprint has to be unprojected, not estimated in pixels.** The first draft took half
the box diagonal in pixels and converted it at the largest light-years-per-pixel over the
corners. Both choices are conservative and under obliquity they multiply: at pitch 35 the
along-plane scale is about 1.9 times the across-plane one, and it was applied to the whole
diagonal of a box about 7 times wider than tall, so the requirement came out about twice the
true footprint. Measured at `#c=15,0,25895&d=20000&p=35&y=0` over the 27 regions the frame
shows, it drew 2 labels at 1280x720 and 4 at 1920x1080, put the `Galactic Centre` at 0.43 and
0.66 — both under the floor, so the region under the middle of the frame went unnamed — and
would have failed five scenarios of this change and one it does not touch. Unprojecting the
four corners costs four ray-plane intersections for each box size tested and draws 14 and 20
at the same views, with the `Galactic Centre` at 0.76 and 1.00.

A conservative requirement cannot be repaired with a smaller floor. Naming the `Galactic
Centre` at 1280x720 under the pixel form would have needed a floor of 0.43, which is a 5.6
pixel font.

The specs then check the result directly rather than trusting the arithmetic: the five
points of a box must resolve to the label's own region, and no box may contain a pixel the
overlay drew.

### Reading a clearance the main thread does not hold exactly

The worker holds the exact field at 8.2 MB and the page holds it downsampled by 8, each
cell carrying the smallest exact value in its block. That is safe in the direction that
matters — a block minimum never claims room the region does not have — but it is
expensive in the other one, and the anchors sit at exactly the worst points for it: a
region's centre is a local maximum of the field, so its block minimum is a long way
below it. Measured at the 42 centres the loss is a median of 367.5 light years.

That loss is not academic. With the field read alone a measured build draws 10 labels at
1280x720 rather than 14, and the `Galactic Centre` reads 2,041 against the 2,196 its
floor-scale box needs, so the region under the middle of the frame goes unnamed although
its true clearance is 2,361 — which is the scenario the current spec already guarantees.

The fix costs nothing to send and nothing to run. The field is a distance, so it is
1-Lipschitz: from the exact value at one point it bounds the field at any other point by
subtracting the distance. The worker already sends each region's centre and the exact
clearance there, so the page takes `max(field read, centre clearance - distance from the
centre)`. Both terms are lower bounds, both are continuous, and the second is exact at
the centre. Measured over 327,765 points inside the regions it never exceeds the true
clearance by more than the one light year the rounding to whole light years allows, it
is the larger of the two at 12.3 percent of them, and it reproduces the exact field's
answer at both viewports: 14 and 20 labels, `Galactic Centre` at 0.76 and 1.00.

The alternatives were measured and are worse. Downsampling by 4 is 502 KiB and still
puts the `Galactic Centre` at the floor; by 2 is 2 MB and does not reach the exact
answer either; only the undownsampled 8.2 MB field does, and it is 65 times the
transport for what one subtraction gives.

### Scale down before hiding

The scale is continuous in `[0.7, 1]`, the largest that fits at the anchor. A discrete
set of sizes would make the text step as the camera moves. Below 0.7 the label is not
drawn. 0.7 of the 13 pixel style is 9.1 pixels; it is a look number and easy to move.

**A label that has left its centre is always drawn at exactly the floor.** Step 2 stops
at the first point whose floor-scale box fits the viewport, so at that point no larger
box fits and step 4 can return nothing above 0.7. Every slid label in a measured build
comes out at 0.700: `Norma Expanse` and `Outer Arm` at the label view, `Inner Orion
Spur` at 500 and 600 light years. At 1,000 light years that region's centre still
projects inside the frame, so it does not slide and draws at full size. The band is
really two states — a label at its centre, sized by the room it has, and a label that
has moved, at 9.1 pixels. That is a look consequence of the rule rather than a fault in
it, and the owner should see it stated before the floor is chosen.

**"Exactly the floor" is a property of the slide's tolerance, not of the rule alone.** The
two searches run to different tolerances, and they have to. The scale search stops at one
CSS pixel of box width, which the requirement names. The slide runs tighter, to 0.05 CSS
pixels, because whatever slack the slide leaves, the box grows into: a slid box sits against
the edge of the viewport, so a pixel of slack lets a larger box fit and the label draws above
the floor. Measured, one CSS pixel gives a slid label 0.700 to 0.747 over a pan, and 0.05
gives 0.700 in every frame. The requirement is satisfied either way, because it bounds where
a search may stop rather than naming a target, but the claim above and the browser scenario
that allows 0.01 of the floor both need the tighter one. It costs four or five bisection
steps for each region that slides, which is 0.001 milliseconds of the 0.5 millisecond mean.

**One property the drawn scale cannot carry.** Because a moving anchor is a slid anchor and
a slid anchor draws at the floor, the drawn size never steps with the clearance field — it
never moves at all. The scenario that guards the interpolated field read therefore reads the
clearance and not the drawn scale. Written on the drawn scale it would read 0.700 in every
frame and could not fail, which is the fault this change exists to remove from the label
rules, not one to reintroduce.

### Candidacy without the sweep, and the sweep actually goes

A region is a candidate when any part of it projects inside the viewport. The test walks the
region's own boundary segments, which the message now attributes to a region pair, its
centre, and the regions holding the plane points under the middle and the four corners of
the frame. The last of those is not decoration: `MAX_PITCH` is 89 and `MIN_DISTANCE` is 500,
so a camera looking almost straight down inside a large region sees about 577 light years
with no boundary in frame and its centre thousands of light years away. Without the frame
points that region fills the screen and is not a candidate.

`sampleFrame` and the whole per-frame sweep are **removed** from `update()`, not left in
place and ignored. The sweep's own record puts it at 1.0 to 1.8 milliseconds a frame; if it
stayed, the budget would fall from 2 milliseconds to 0.5 while the page went on paying the
same cost outside the measured window. `regionSampleCounts` and `regionSampleTotal`, which
`e2e/labels.spec.ts` reads, go with it.

**Candidacy SHALL share one projection of the vertex set.** There is no cull to lean on: the
four frame corners unproject to a plane box larger than the whole field at the view the
budget scenario uses, so candidacy runs on all 42 regions every frame. Each of the 439
segments belongs to two regions, so a region that projects its own segments makes about 878
segment tests and about 1,756 endpoint projections. Projecting the 562 vertices once for the
frame, and letting each region index into that array, is **562 projections** instead, plus
the clip of the few segments that cross the camera plane. That is a third of the work and it
is what the budget assumes.

The rest is one bisection and one clearance read per region, about 20 bisection steps for
each region that slides, and four unprojections for each box the size step tests. Against
that, the sweep it replaces does about 2,040 ray casts at 1.0 to 1.8 milliseconds. The slide
reads no clearance field at all; it is a bisection on a projection.

The per-frame allocation fault the previous change fixed applies here too: the placement
must fit its scratch buffers outside the timed window, not inside it.

## Risks / Trade-offs

- **A 200 light year departure is four times looser than the data resolution.** → Nothing
  the page draws shows the true boundary, so the viewer cannot see the error. The label
  rules are the one place it could show, because a label that must stay inside its region
  is measured against the _drawn_ line while its clearance is measured against the traced
  one. The fit test adds the departure bound explicitly, and the specs measure the box
  against the drawn overlay pixels.

- **Right angles are now real, and the join rule has never been tested on one.** The
  smoothed polyline held every vertex to 20 degrees, so the sharpest join the ribbon ever
  saw was gentle. → The vertex shader already extends each quad by the half width along the
  segment at both ends and the fragment shader measures distance to the clamped segment, so
  each segment draws as a capsule and `MAX` blending keeps the smallest distance. That
  construction is angle-independent and a right angle should join cleanly. The scenario is
  kept because "should" is not "does".

- **The views the drawing scenarios open at are chosen by a search, and the search now needs
  a brightness guard.** `tests/region-views.ts` carries `DISC_DENSITY_CEILING`, which no
  artifact asked for. It is needed because every one of those readings compares the drawn
  line with the frame under it: the sharpest corner in the set, 109 degrees at chain 67
  vertex 322, sits on the core bulge at 31 times the surface density the committed width
  reading works over, and a saturated frame cannot read as lighter under the core of the
  line. The ceiling sits above the brightest view chosen and far below the next candidate,
  so no view rests on a near tie. It decides the view for `A join is not brighter than the
line`, `The line is four CSS pixels wide and two-toned` and `A long segment holds its width
across the frame`. It weakens no threshold — the join scenario asks for 60 degrees and the
  chosen corner turns 98.29 — but it does mean the sharpest corner in the set is never the
  one drawn by a test.

- **Segments are now up to 14,970 light years, against a median of 5.09 today.**
  `regions.frag` carries the segment ends as flat `highp` floats in device pixels, and a
  segment whose ends project far outside the frame gives large coordinates. → A new
  scenario reads the drawn width at three places across the frame on such a segment.

- **The segment cannot round a concavity**, so a region whose visible part lies past one has
  its anchor in a neighbour, the region test refuses it, and it is unnamed until the camera
  moves. Measured at the view the label scenarios use, that is six of 27 regions at 1280x720
  and five at 1920x1080, all of which the required clearance would have refused anyway at
  1280x720. → This is the price of an anchor with no jump in it, and the disappearance rule
  names it. If it shows up in practice the fix is a second wanted point, not a search: aim at
  the region's own on-screen extent rather than at the middle of the frame.

- **The slide term of the 12 pixel bound is not derived, though it is bounded.** The screen
  path always passes through the middle of the frame, so it crosses the edge of the inset
  rectangle at an angle no shallower than about 29 degrees at 1920x1080, and the entry point
  cannot sweep much faster than the path moves. The camera-carry term is 1.6 to
  3.4 CSS pixels at 0.1 degrees, and the slide adds an unknown amount on top. → The spec says
  the bound is to be measured rather than assumed, and the scenario runs 120 frames in the
  view where the slide is active. If the measurement exceeds 12, the bound moves and the
  reason is recorded; what must not happen is a bound that was never checked.

- **The label rules may leave a region on screen unnamed** when it is on screen but never
  wide enough for 0.7 of its box. → This is the answer the owner chose over letting a label
  cross its own border. The scenario for it pins the sequence full size, scaled, hidden.

- **The `Galactic Centre` has the smallest clearance of the 42, at 2,361 light years**, so
  it is the region most likely to be scaled or dropped. → The scenario for the region under
  the middle of the frame accepts a scaled label, and the old `The core is named` guarantee
  survives in that form rather than being lost quietly.

- **Removing the cap could put many labels on screen at once.** → Regions are disjoint and
  every box lies inside its region, so they cannot overlap, and a wide view fits few regions
  with room for a box. If the result reads as crowded it is a look call, and the fix is a
  larger required clearance rather than a cap.

- **An exact distance transform over 4.11 million cells is added to the worker.** → It is
  two separable passes and runs once, alongside a fill that already resolves the region at
  4.11 million points. It costs 8.2 MB as `Uint16` in the worker; the main thread gets the
  254 by 254 downsample at 126 KiB.

## Migration Plan

The change is a build-time and main-thread rewrite behind an unchanged message boundary
shape, so there is no data migration and no persisted state. Roll back by reverting the
commit; nothing outside the repository holds the old set.

`docs/roadmap.md` records the three smoothing stages and their measured figures in the
phase 2 notes. That paragraph is replaced with the simplification, its segment count, its
departure bound and its corner figures, so the roadmap does not describe a pipeline that no
longer exists.

## Open Questions

- The floor scale of 0.7 and the 200 light year departure are look numbers, chosen from
  measurement rather than from seeing them on screen. Both are single constants and can be
  moved after the owner looks at a build, without touching the approach or the task
  breakdown. The floor is a look number only because the requirement above it is exact: the
  earlier pixel-diagonal draft asked about twice the true footprint, and no floor could
  rescue it, since naming the `Galactic Centre` at 1280x720 would have needed a floor of 0.43
  and a 5.6 pixel font. A conservative requirement cannot be tuned away with a floor, so it
  had to be replaced rather than compensated for.
- Every label that has left its centre draws at exactly the floor scale, which is a 9.1 pixel
  font. Whether that reads as right is the owner's call on a build; the fix, if it is wrong,
  is a higher floor or a slide that stops where a larger box still fits.
- How many labels the new rule draws is measured at one view and one pair of viewports: 14 at
  1280x720 and 20 at 1920x1080, of 27 regions on screen. Whether that reads as right or as
  crowded is the owner's call on a build, and the answer moves the floor, not the rule.
