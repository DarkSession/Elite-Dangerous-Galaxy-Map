## Why

The region boundaries draw as a smoothed polyline of 68,672 vertices. The owner reports
that the lines still do not read as straight where they should be straight, and that they
could be smoother. Three rounds of tuning the smoothing have not closed it, because the
fault is not in the parameters. The pipeline buys smoothness with vertex count, and it
holds a 20 degree per-vertex bound by **rounding away corners the region map really
has**. The result is a line that is neither straight nor faithful.

Measurement of the source data shows how much simpler the truth is. The 42 codex regions
are largely annular sectors about the galactic centre: long straight runs and gentle
curves, meeting at sharp corners. The fit below is the evidence — the whole 1,903 kly of
traced boundary draws inside its bound with 439 straight segments — and it needs almost no
vertices once the drawn line is allowed to depart from the traced raster by more than the
raster's own resolution.

The region labels have a fault of their own, and it is the same fault in a different place:
the rule was built around what a sampler could see rather than around what a region is. A
label anchors on the mean plane position of the samples its region holds in the frame, so it
sits on the centre of the part on screen rather than on the centre of the region. It drifts
as the camera moves, it can sit on top of its own boundary line, and it can disappear while
its region still fills the frame — because 12 labels are already placed, because another
label was placed first, or because its share of the samples fell below 1 percent.

The owner set four rules for what a label should do:

1. A label should in general be in the centre of its galactic region.
2. It moves away from the centre towards an area that is displayed, only if the centre is
   not clearly visible.
3. It stays within its boundaries and never touches or overlaps the border.
4. It disappears only when it is no longer visible on screen.

Rules 1 and 3 cannot be met by a sampler. The centre of a region is a property of the
region, not of the samples that happen to land on it, and staying off the border needs to
know where the border is.

**Why the two halves travel together.** The label half needs three things the boundary half
produces: the departure bound, so a box can be kept clear of a line that may sit up to that
far inside the region; the region pair of each chain, so candidacy can ask which boundaries
belong to a region; and the clearance field, which is built from the same region grid the
trace reads and in the same worker pass. The dependency runs one way — the boundaries need
nothing from the labels — so the two could be separated, at the cost of building the region
grid's derived data twice and of shipping a label rule that has no boundary to measure
itself against.

## What Changes

**The boundary set becomes a small set of straight segments with real corners.**

- The three smoothing stages are replaced by one simplification that keeps a vertex only
  where the boundary genuinely turns.
- Simplifying at 190 light years and asserting 200, the whole map is **439 segments and
  562 vertices, 6.6 KiB**, against 68,672 vertices and 804.75 KiB today. That is 122
  times fewer vertices. The fit tolerance sits below the asserted bound on purpose, so a
  change of tie-break cannot fail the test for no real reason.
- The departure holds **both ways**: measured 185.9 light years drawn to traced and 189.8
  traced to drawn, against a bound of 200, sampled every 10 light years along both lines
  rather than only at their vertices.
- **Corners are kept, not rounded.** Of the 235 vertices that turn by more than 20
  degrees, **227 sit where the traced boundary also turns** by more than 20 degrees, and
  only **8 are invented by the fit**, the worst at 31 degrees. Going the other way, **every
  one of the 221 places** where the traced boundary turns by more than 60 degrees carries a
  vertex that turns by more than 40 degrees. The largest turn in the set is about 108
  degrees; two implementations of the fit measured 107.9 and 109.0, and nothing rests on
  which is right.
- **BREAKING**: the turn budget of 60 degrees for each 1,000 light years, the 100 degree
  per-chain budget and the 20 degree per-vertex bound all go. They exist to stop a
  polyline reading as a staircase, and they do it by removing real structure. A right
  angle where two region borders meet is data, and the line now keeps it.
- **BREAKING**: the departure bound moves from one grid cell, 49.3494 light years, to 200
  light years. This is deliberately lossy. Nothing the page draws shows where the boundary
  truly lies, so a departure the viewer cannot check costs nothing, while the shape the
  viewer can check gets better.

**Labels move to the centre of their region and stay inside it.**

- A label anchors on the **point of its region furthest from any boundary**, precomputed
  on the plane. Unlike the centroid, this point always lies inside its region. Across the
  42 regions its clearance runs from 2,361 light years to 8,496, with a median of 4,520.
- The anchor leaves that point only when the point is off screen, or too near a frame edge
  to hold the whole label box. It then **slides out along the straight plane segment** from
  the centre towards the part of the region the frame shows, only as far as it must to get
  the box on screen. This is the owner's second rule word for word.
- **The anchor must read back as its own region**, on the coarse region grid the page already
  holds. The clearance field carries a distance and no identity, so without this test a label
  can be drawn, at full size, centred inside a neighbour. Measured at the view the label
  scenarios use, five of the 27 regions on screen at 1920x1080 get an anchor outside
  their own region, and `The Void` would be drawn inside `Outer Arm`.
- **The clearance a label reads is the larger of two lower bounds**: the downsampled
  field, and the region's own recorded clearance less the distance from its centre. The
  field the main thread holds is downsampled by 8 with a block minimum, so at a region's
  centre it reads a median of 367.5 light years low, which loses four labels at 1280x720
  including the region under the middle of the frame: the field alone draws 10 there where
  both terms draw 14. The second term costs nothing, is
  exact at the centre where most labels sit, and is sound because a distance field
  changes by at most one light year per light year.
- **The box is kept off the border by its true footprint on the plane**, found by
  unprojecting the four corners of the box, not by converting its pixel diagonal. The pixel
  form asks about twice as much under obliquity: at the same view it draws 2 labels at
  1280x720 and 4 at 1920x1080, and leaves the region under the middle of the frame unnamed.
  The footprint form draws 14 and 20.
- The anchor carries **no state between frames**. It is a point on the segment from the
  region's centre to the plane point under the middle of the frame, so it moves continuously
  as the camera moves, with no smoothing step and no lag. Over a 0.1 degree camera turn the
  drawn label moves, and moves by less than 12 CSS pixels.
- A label box SHALL lie wholly inside its own region on screen and SHALL NOT touch the
  drawn boundary line.
- Where the region on screen is too small, the label scales down to a floor of **0.7** and
  hides only below that.
- The 12 label cap and the label-against-label overlap rule are removed. Regions do not
  overlap, so labels that stay inside their regions cannot overlap either.
- **BREAKING**: the 2,000 point per-frame screen sweep is **removed**, not merely bypassed.
  Its 2 millisecond mean and 4 millisecond worst-frame budget becomes 0.5 and 2 on the
  placement that replaces it, and the two figures the page exposes for it change name and
  meaning.

## Capabilities

### New Capabilities

None. The work changes how an existing capability behaves.

### Modified Capabilities

- `far-view-scene-data`: `Generation runs off the main thread within budget` gains the
  region clearance field — one exact Euclidean distance transform over the trace grid, held
  in the worker as 8.2 MB and returned downsampled by 8 as 126 KiB — inside the same 5
  second budget. Its statement that the coarse grid is sampled "about 2,000 times a frame"
  also stops being true when the sweep goes.
- `galactic-regions`:
  - `The boundaries draw on the galactic plane in a zoom band` is **modified**. It keeps
    every rule it has, and its join scenario is raised to a corner of at least 60 degrees,
    which the polyline could never present.
  - `The boundary set is traced from the region grid` is **removed** and replaced by
    `The boundary set is simplified to straight segments`. The three turn bounds only
    describe a smoothed polyline and cannot be adjusted to the new line; they have to go.
  - `A region in view carries a label` is **removed** and replaced by `A region in view
    carries a label on its centre`. Every rule in it was built on the per-frame screen
    sweep: the candidate share, the half-share hold, the 1.2 order bonus, the 12 label cap
    and the overlap rule.

## Impact

- `src/scene-data/region-lines.ts` — the three smoothing stages and their six constants
  are replaced by one simplification. The trace itself does not change.
- `src/scene-data/region-lines.worker.ts`, `src/scene-data/messages.ts`,
  `src/scene-data/types.ts` — the message carries the region pair of each chain, so the
  label work can ask which boundaries belong to a region, and it carries the per-region
  label geometry.
- `src/scene-data/types.ts` — gains the types for the per-region label centre and
  clearance and for the shared clearance field. The values themselves are computed in the
  worker and arrive by message; the page code that reads them must keep importing no region
  lookup. The boundary departure bound travels on the same message, for the same reason.
  An earlier draft of this list put these types in `src/scene-data/regions.ts`. They belong
  in `types.ts` with the rest of the message shapes, and `regions.ts` is unchanged.
- `src/scene-data/clearance.ts` — **new**. The distance transform, the downsample, the
  bilinear reader and the per-region centres. It is a module of its own because the page
  reads the field while the transform runs in the worker, and because it must import
  `region-lines.ts` as a type only: a value import would pull the 199 KiB region lookup
  into the page chunk.
- `src/app/labels.ts` — `sampleFrame` and the whole per-frame sweep go, with
  `SAMPLE_SPACING`, `LABEL_INSET`, `MAX_LABELS`, `CANDIDATE_SHARE`, `HELD_SHARE` and
  `CARRIED_BONUS`, and the whole label memory with them. Placement reads the per-region
  geometry, reads the coarse region grid at the anchor to check it is the right region,
  tests the box against the clearance field and scales it. The box is centred on its
  anchor and is no longer clamped into the
  viewport, because a clamp slides a box off its anchor and can push it across a boundary.
- `src/render/region-pass.ts` — unchanged in how it draws a ribbon; it takes a far smaller
  vertex set and much longer segments.
- `src/app/main.ts` — `regionSampleCounts`, `regionSampleTotal`, `labelSampling` and
  `resetLabelSampling` are replaced by the placement equivalents. `e2e/labels.spec.ts`
  reads the first two, so it changes with them.
- `e2e/labels.spec.ts` — the bounds it asserts change, and it stops reading the two sample
  globals.
- `e2e/regions.spec.ts`, `tests/region-views.ts`, `tests/region-views.test.ts` and
  `e2e/region-views.ts` — these choose the views the drawing scenarios use, and they rest on
  a vertex spacing of about 5 light years that no longer holds. `nearestVertex` in
  `e2e/regions.spec.ts:99` measures to vertices and gives up after `ring <= 12`, so with 562
  vertices it can return infinity or call a point on the middle of a 14,970 light year
  segment clear. In `tests/region-views.ts`, `clearanceFrom` measures to vertices,
  `BEND_TURN_DEGREES` is 30 where the new join scenario needs 60, `NEIGHBOUR_ARC_LY` is 60
  and the fold test is 30 light years, and `findSharpCorner` accepts a straight run only
  between 40 and 200 light years from the corner with a run floor at line 340 — none of
  which a set of thousand-light-year segments can satisfy. `tests/region-views.test.ts` pins
  the constants those searches produce.
- `src/app/labels.test.ts` and `src/scene-data/region-lines.test.ts` — whole suites go, not
  just bounds. The first covers the frame sweep, the candidate share, the mean-of-samples
  anchor, the placement order, the hysteresis and the held anchor; the second covers the
  capped average, the vertex reduction and the corner rounding. None of those exist after
  this change.
- `docs/roadmap.md` — the phase 2 record of the smoothing stages is replaced, and so is the
  record of the label sweep, the 1 percent candidate share, the half-share hold, the 1.2
  order bonus, the mean-of-samples anchor and the held anchor.
- No dependency changes.

**Scale.** The region grid is 2,027 by 2,027 cells over the model bounds, which is 4.11
million lookups, and it runs once in a worker. The clearance field is one exact distance
transform over the same 4.11 million cells, two separable passes, no further lookups.
The simplification runs over 38,563 unit edges in 123 chains. The clearance field is one
`Uint16` per cell of that grid, 8.2 MB, held in the worker only; the main thread
receives one centre and one clearance per region and a copy of the field downsampled by
8, which is 254 by 254 and 126 KiB. Placement runs every frame over at most 42 regions.
It projects the 562 vertices once for the frame and shares them, which is 562
projections rather than the about 1,756 a per-region walk would make. Each region then
costs one bisection for the slide, one coarse-grid read, one clearance read and four
corner unprojections for each box size it tests, against the 2,040 ray casts the sweep
does today at 1.0 to 1.8 milliseconds.
