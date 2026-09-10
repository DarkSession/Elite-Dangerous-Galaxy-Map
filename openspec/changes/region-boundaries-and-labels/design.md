## Context

Phase 2 added the region overlay. See [proposal.md](proposal.md) for what is wrong with
it. What this design has to work with:

- **The data is a raster, and there is no better one.** The owner asked whether
  `RegionMapData.json` from klightspeed's EliteDangerousRegionMap gives continuous
  outlines. It does not. It is 2,048 rows of run-length pairs over 2,048 columns, 43 ids,
  21,204 runs, on the same 4,096/83 = 49.3494 light year grid the map already reads
  through `astro/codex-region-lookup`. Tracing that file directly gives 38,563 unit
  edges, the same count the phase 2 trace measures through the almanac, which is what
  says the two are the same data rather than two sources that happen to agree. It is the
  same data in a different container, so the staircase cannot be removed by changing the
  source. It has to be removed by processing the raster.
- **The present trace.** `traceRegionLines` emits a segment on each edge between two
  cells of different id and merges collinear neighbours within one row or column. Each
  edge is already emitted once, so the map does not draw a boundary twice. What it draws
  is 22,513 disconnected axis-aligned runs, and a boundary that runs diagonally becomes
  an alternating series of short horizontal and vertical pieces.
- **The present drawing.** `gl.LINES` with one flat colour at 0.55 opacity. WebGL2
  guarantees no line width but 1, and the drawing buffer runs at up to twice the CSS
  pixel ratio, so a boundary can be half a CSS pixel wide.
- **The present labels.** A region is a candidate when its axis-aligned bounds meet the
  visible plane box. The anchor is its centroid projected and then clamped into the
  viewport with a 48 pixel inset.
- **The overlay draws after the tone map**, so its colour reaches the screen as written
  and no look constant of the far view can change it or be changed by it.
- `astro/codex-region-lookup` is 199 KiB and worker only. The main thread has no
  position-to-region lookup.

## Goals / Non-Goals

**Goals:**

- A boundary that reads as one continuous line between two regions.
- A line thick enough to see, and legible over both the dark space between the arms and
  the bright disc.
- A label for every region the frame really shows, and for no region it does not.
- A stated bound on how far the drawn line may sit from the real region edge.

**Non-Goals:**

- Changing which regions exist or where their edges are.
- Region fill, shading or a picking test against a region.
- Making the boundary exact below the 49 light year resolution the data has.

## Decisions

### The trace links edges into chains at the nodes where two edges meet

The unit edges form a graph on the lattice. A node carries two edges almost everywhere,
and three or more only where three or more regions meet. Walking from a junction through
degree-two nodes gives a chain, and a chain therefore separates exactly one pair of
region ids from end to end.

Measured on the shipped data: 38,563 unit edges, 38,522 lattice nodes on a boundary, 82
junction nodes, and **123 chains**. That is the "one line between two regions" the map
wants, and it falls out of the graph rather than needing a rule.

### Average along the chain with the movement of each point capped

Each chain is smoothed in three stages: an average along the chain with the movement of
every point capped, a vertex reduction by Douglas-Peucker at 0.1 cells, and then a
rounding of the corners that are left. The reduction is load-bearing and not a tidy-up:
each rounding pass doubles the vertex count, so four passes over the averaged chain
without it would give about 619,000 vertices, five times the 120,000 the spec allows.
The tolerance of 0.1 cells sits far below the size of one step of the raster, so it only
drops a point that is nearly collinear with its neighbours. Every point of the averaged
chain is held within **0.75 cells** of the lattice node the trace put it on. The departure bound is one cell, and the
cap is below it on purpose: the departure is measured polyline to polyline, so the drawn
line can bow slightly between two capped vertices and read further from the boundary than
any single vertex moved. Measured over all 123 chains, a cap of 0.9 cells gives a
departure of 48.77 light years and a cap of one cell gives 52.92, which breaks the bound.
The cap needs that headroom, and the rounding stage below needs more of it again, which
is what takes the cap from 0.9 to 0.75. The cap is what keeps a real corner a
corner: an average alone rounds a genuine 90 degree turn as readily as it removes raster
noise, and the departure then follows the size of the window rather than a stated bound.

The first plan for this change was Douglas-Peucker at half a cell followed by two capped
rounding passes. It was built, and the owner saw the result: the lines still wander. The
measurement says why. Douglas-Peucker keeps the **extremes** of a wiggle by construction,
because the point it keeps is the one furthest from the chord. Rounding then softens
those corners without removing them, so the drawn line still changes direction as often
as the staircase does. Measured as the sum of the absolute turn angle for each 1,000
light years of drawn length. The five rows below are measured over the **30 longest
chains**, which is the sample the comparison ran on. The whole-set figures follow, and
they differ a little, so do not quote a row of this table as a whole-set figure:

| Pipeline                          | Turn per 1,000 ly | Departure | Vertices |
| --------------------------------- | ----------------- | --------- | -------- |
| the traced staircase              | 1,104 deg         | 0         | 18,852   |
| Douglas-Peucker + rounding, built | 980 deg           | 24.7 ly   | 36,924   |
| capped average, half a cell       | 82 deg            | 29.5 ly   | 3,873    |
| **capped average, one cell**      | **26 deg**        | 48.8 ly   | 1,950    |
| average with no cap               | 20 deg            | 84.0 ly   | 1,996    |

The built pipeline removes 11 percent of the turning of the raw staircase. That is the
defect the owner reported, and no tolerance inside Douglas-Peucker fixes it, because
keeping the extremes is what the method does.

Measured over all 123 chains, the choice gives **4,211 vertices, 4,088 segments, 49.3
KiB, a two-way departure of 48.77 light years and 26.0 degrees of turn for each 1,000
light years**. The worst single chain turns 68.9 degrees per 1,000 light years and the
median chain turns 24.3, which is why the spec carries a per-chain bound of 100 beside
the whole-set bound of 60. The traced staircase measures 1,062.8 over the whole set. The largest movement of any point is exactly 0.900 cells, so the cap binds everywhere it
can and it is the cap, not the width of the averaging window, that sets the departure.

The departure bound moves from half a cell to one cell, and the owner chose that. One
cell is the resolution of the source raster, so the line claims no accuracy the data
does not have. Half a cell bought accuracy that cannot be seen: at the closest zoom of
500 light years one CSS pixel is 0.53 light years, so half a cell is already 47 pixels
and one cell is 93. Below the size of a cell the position of the boundary is not known
at all, and the straightness is what the eye reads.

The set gets **smaller**, not larger: 49.3 KiB against 870 KiB for the built pipeline and
528 KiB for the loose runs of phase 2. A line with few direction changes needs few
vertices to carry them.

### The average leaves a polygon, so the corners are rounded after it

The average was built at a cap of 0.9 and the owner looked at it again. The wander was
gone and the line was still not smooth. The measurement says why, and it is a different
property from the one the first two bounds hold:

| Measure on the averaged line | Value  |
| ---------------------------- | ------ |
| turn over the whole set      | 26 deg per 1,000 ly |
| median segment length        | 284 ly |
| vertices turning over 20 deg | 377    |
| worst vertex turn            | 98.4 deg |

A line can wander very little over 1,000 light years and still be a chain of long straight
runs meeting at hard corners. At the closest zoom of 500 light years a 284 light year
segment crosses half the frame, so a 98 degree vertex reads as a corner, not a curve. The
first two bounds cannot see this, because they measure turn against **length** and a
corner has turn with no length.

So the spec gains a third bound that measures the line at one point: no vertex may turn by
more than 20 degrees. Corners are removed by putting points around them, with the cut
capped so a corner is rounded and not cut off. Measured over the 30 longest chains, with
the cut capped at 0.3 cells:

| Pipeline                        | Departure | Worst vertex turn | Over 20 deg | Vertices |
| ------------------------------- | --------- | ----------------- | ----------- | -------- |
| cap 0.9, no rounding            | 48.77 ly  | 98.4 deg          | 181         | 1,950    |
| cap 0.9, rounding x4            | 54.42 ly  | 13.6 deg          | 0           | 31,200   |
| cap 0.75, rounding x3           | 47.70 ly  | 23.9 deg          | 9           | 15,936   |
| **cap 0.75, rounding x4**       | 47.76 ly  | **14.3 deg**      | **0**       | 31,872   |

Rounding costs about 5.6 light years of departure, which is why the movement cap comes
down to 0.75: the two together then sit at 47.76 light years, inside the one cell bound.
Three rounding passes leave 9 vertices above 20 degrees, so four is the choice.

Scaling the 30 chain sample to all 123 gives roughly 69,000 vertices and about 810 KiB.
The implementation records the measured figures. That is more than the 49.3 KiB the
averaged line alone needs and about the same as the first build, and it is still 123
instanced draw calls, so the cost is memory and not frame time.

The spec does not name this method. It states the departure bound, a bound on the turn
for each 1,000 light years, and a window on the vertex count, so a different smoothing
that meets all three is free to replace this one.

_Alternative:_ fit a spline through the points. Rejected for the same reason as before: a
spline overshoots at a sharp corner, so the departure would need a search rather than a
cap.

_Alternative:_ keep Douglas-Peucker as the smoothing and raise its tolerance. Rejected:
at one cell it gives 52.5 light years of departure and still keeps the extremes, so it
straightens the line far less than the average does at the same bound. It stays in the
pipeline as the vertex reduction between the average and the rounding, where it removes
points rather than choosing the shape of the line.

### The set stores vertices once and the pass draws segments from them

The chains go to the card as one `Float32Array` of three values per vertex, with the
first and last index of each chain. A segment's two endpoints are the same buffer read at
two offsets one vertex apart, so no vertex is stored twice, which halves the set. The
rounding stage makes the set large enough for that to matter: roughly 69,000 vertices at
12 bytes each is about 810 KiB, against about 1.6 MiB if each segment carried its own
pair. The pass
issues one instanced draw per chain, which is 123 draw calls.

### The two colours come from a coverage buffer, not from two draws

A ribbon is a screen-space quad per segment, expanded by the half width along the screen
normal and by the half width along the segment, so a join between two segments is filled
rather than notched.

Those quads overlap at every join. Drawn straight onto the frame with alpha blending, the
overlap blends twice and a join is brighter than the line: at the core opacity of 0.55 a
doubled join reads 0.80. So the pass draws instead into a single-channel buffer the size
of the drawing buffer, writing `1 - distance / halfWidth`, with the blend equation set to
`MAX`. Taking the largest of those values is taking the smallest distance, which is what
a join needs. A fullscreen step then reads that buffer once and writes the core colour
where the value is above the core threshold, the outline colour where it is above zero,
and nothing elsewhere, with one smoothstep at each edge for the antialiasing.

This also gives the two tones from one number, so the core and the outline cannot drift
apart, and the line keeps its width in CSS pixels whatever the device pixel ratio is.

_Alternative:_ draw the outline pass and then the core pass. Rejected: it doubles the
geometry and still blends joins twice within each pass.

### Labels come from sampling the frame, not from bounding boxes

The label rules are inverted. Rather than asking which regions might be in view and then
forcing each answer onto the screen, the page asks what is on the screen and reads the
regions off it.

The region worker returns a coarse grid of region ids over the model bounds, at most 512
by 512 cells. Taking every fourth cell of the 2,027 by 2,027 trace grid gives 507 cells
at 197.4 light years, which is 251 KiB. It costs no extra region lookups.

That grid is larger than the 199 KiB lookup table it stands in for, so the reason for
sending it is not its size. It is that the lookup table is code and data together and is
built to answer one position at a time, while the grid is a transferable typed array the
main thread indexes directly, and the label sweep reads it about 2,000 times a frame.

Each frame the page samples the viewport on a grid of screen points about 32 CSS pixels
apart, which is roughly 2,000 samples at 1920x1080. Each sample is turned into a plane
point at `y = 0` and looked up in the coarse grid. From the counts:

- **Candidacy** is holding at least 1 percent of the samples that land on the plane
  inside the model bounds. A region with nothing on screen holds none, so it cannot get a
  label. That is the first defect.
- **Order** puts first the region holding the sample nearest the centre of the frame, and
  then the rest by sample count, most first. The first rule is needed and cannot be
  dropped: at a view of the galactic centre at 1280x720, 24 regions clear the 1 percent
  threshold and 14 of them hold more samples than the `Galactic Centre`, which holds
  1.80 percent, so a pure sample-count order reaches the cap of 12 before it and the
  scenario "The core is named" fails. The count is the figure to hold, not the rank:
  two regions tie with the `Galactic Centre` on 15 samples, so its rank reads 15th or
  16th by the tie-breaking alone. That is the
  same defect the phase 2 spec solved with the nearest centroid, in the new terms. The
  sample-count order then fixes the second defect: a region that fills the frame beats a
  large region that is mostly off screen.
- **The anchor** is worked out on the galactic plane and then projected. It is the mean of
  that region's sample **plane positions** when the region under the mean is the same
  region, and otherwise the sample **that region itself holds** whose plane position is
  nearest the mean.

  Working it out on the screen does not do. The sample grid is fixed in screen space, so
  anything averaged or chosen there changes only when a sample crosses a region edge: it
  holds still and then steps. The owner saw this and reported it as jumping, and it
  measures as a worst move of only 1.0 CSS pixels with the anchor unmoved in 58 percent
  of frames. A plane position moves with the camera, so its projection slides. This is
  also why the phase 2 labels moved smoothly: they projected a plane centroid. What phase
  2 lacked was any tie to what the frame shows, which the samples now give.

  A held anchor keeps its plane point while that point still resolves to the region and
  still projects inside the frame, so the anchor does not hop between two samples that
  are almost equally near the mean. Its projection still moves with the camera. Taking the nearest sample of any region would land the anchor on the
  region the mean fell on, which is the region the fallback exists to avoid. The mean on its own
  is not enough, because a region can appear in the frame as two separated patches and the
  mean of those falls between them, on a different region.

  Always taking the nearest sample is not enough either, and the owner saw why. The
  samples sit on a grid 32 CSS pixels apart, so the anchor can only sit on that grid: it
  holds still while the camera turns and then moves a whole spacing at once. Measured at
  2,000 light years while the camera turns 0.2 degrees a frame, the anchor is still in 94
  percent of frames and its worst move is 32.0 CSS pixels. The mean is continuous, so it
  is the rule that holds wherever it can, and the nearest sample is the fallback for the
  split case only.

- **Hysteresis** keeps the set and the order from flickering. A region that carried a
  label stays a candidate until its share falls below half the threshold, and its sample
  count is multiplied by 1.2 for the ordering. Without the first rule a region on the
  threshold blinks; without the second the overlap rule drops a different label each time
  the counts swap.

  The bonus is a margin, not a priority. Placing every region that carried a label ahead
  of every region that did not would hold up to 12 stale labels through a pan while the
  region that now fills the frame waited for a slot, and that contradicts what the count
  order is for. A multiplier lets a region that gains the frame overtake one that is
  losing it, and only suppresses a swap on a near tie. Candidates still equal after the
  bonus are ordered by region id, so the order is total and two frames with the same
  counts give the same order.

Three phase 2 rules go with this: the bounding box test, the centroid projection, and the
behind-camera negation that the phase 2 design worked through at length. None of them has
anything to act on once the anchor comes from samples that are already on the screen. The
48 pixel inset stays, but only to keep a label's box from crossing the frame edge.

The cost is about 2,000 ray-plane intersections per frame. `rayDirection` inverts the
view-projection matrix on every call today, so the sampling inverts it once and reuses
it; without that the sampling would be 2,000 matrix inversions a frame. The sweep runs in
the page update and not between the first draw call and `gl.finish()`, so the frame
budget suite cannot see it. It therefore carries a budget of its own, 2 milliseconds at
1920x1080, and the page exposes the time so a browser test can read it.

_Alternative:_ send the full 2,027 by 2,027 grid, 4.1 MB. Rejected: 197 light years is
finer than a label needs, and 251 KiB is a sixteenth of the memory.

_Alternative:_ keep the bounding box test and only fix the clamp. Rejected: it fixes the
label that should not be there and not the label that is missing, because the order would
still be by the region's own footprint.

### The lines keep drawing at close zoom

Phase 2 removed the lines below 3,000 light years because one grid cell covers more than
15 pixels there and the boundary read as a staircase. The smoothed line does not, so the
fade out goes and the boundary stays to the closest zoom. The fade in from 30,000 to
20,000 is unchanged, which is what keeps the far view and its baseline image untouched.

## Risks / Trade-offs

- **The drawn line is not the region edge.** It can sit up to 49.3494 light years from
  the boundary the lookup would give, so at the closest zoom a star within about one
  grid cell of a border can appear on the wrong side of the line. The line was already a
  fiction at that scale, because the data resolves to 49.3494 light years and no finer.
  The bound is stated in the spec and has its own test, so the error is known rather than
  discovered.
- **A full-screen single-channel buffer joins the frame.** At 1920x1080 that is 2 MB and
  one more fullscreen pass. It is cleared and drawn only while the overlay fades in, so
  it costs nothing at 30,000 light years and above.
- **About 69,000 vertices against 22,513 runs.** The set is built once in a worker and
  uploaded once. About 810 KiB is more than the 528 KiB it replaces, and the corner bound
  is what buys that: a corner is only removed by putting points around it. The draw is
  123 instanced calls either way, so the cost is memory and not frame time.
- **The label sampling runs every frame.** About 2,000 ray-plane intersections and grid
  reads. If it shows in the frame budget, the levers are a coarser sample grid and
  updating the labels every second frame; the label set changes slowly with the camera.
- **The coarse grid is 197 light years and the line is now drawn to 49.3.** The
  boundary draws at the closest zoom, where a label sample four times coarser than the
  line can put a sample on the far side of the line the user sees. It moves a label
  anchor by at most one coarse cell and it cannot move a label onto a region that has
  nothing on screen, so it is accepted. A finer grid is the fix if a label ever sits on
  the wrong side of a visible boundary.
- **This change cannot be archived before `close-zoom-stars-and-regions`.** It modifies
  requirements that change adds. `openspec validate` reports it as an informational note
  and `openspec archive` would refuse until the phase 2 change is archived.

  Folding this work into that change instead was weighed and rejected. It would rewrite
  three of the seven requirements of a change that is already implemented, reviewed and
  open as a draft pull request, and it would discard passing unit and browser tests for
  rules this change replaces. Keeping them apart leaves phase 2 reviewable as the phase
  the owner asked for and leaves this change reviewable as the answer to three defects
  the owner found in it. The cost is that the two must land in order.

## Migration Plan

No data migration. The overlay is drawn from scene data that is rebuilt on every load, so
there is nothing stored to convert. Rollback is the revert of the change.

## Open Questions

- Whether a label should carry the same dark outline the lines get. Text over the bright
  disc has the same legibility problem the lines have, and this change does not touch the
  label style.
- Whether the coarse region grid should later serve a HUD readout of the region under the
  cursor. Phase 4 owns the HUD, and nothing here places text on the cursor.
