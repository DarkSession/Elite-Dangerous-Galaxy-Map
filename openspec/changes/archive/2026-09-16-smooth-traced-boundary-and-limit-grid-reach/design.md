## Context

Three faults, one of which needed a measurement before it could be designed. The sample
that settled it lives outside the tree, in a directory `.gitignore` already covers, and it
is not part of this change. What it measured is in `proposal.md` and in the spec deltas.

## Goals / Non-Goals

**Goals.** Take the saw tooth off the `accurate` line without rounding a real corner away.
Make the grid mark a neighbourhood of the cursor at every zoom. Make a region label reach
its place quickly.

**Non-Goals.** Removing the `simplified` mode. Changing the band's width, tone, coverage
rule, joins or either fade. Changing the anchor stage of the label placement. Changing
`gridVisibility`, which already takes the grid to nothing at 12,000 light years.

## Decisions

### 1. The traced set is drawn through the edge midpoints, then smoothed

The trace runs along cell corners. A cell corner is up to half a cell from the edge it
marks, so the lattice polyline is already 17.4 light years from the data. The midpoint of a
unit edge is the one point the two cells either side agree on, so it is the boundary the
data states. Building on the midpoints costs nothing: the trace already holds the edges.

The pipeline, on each chain, in cells:

1. `midpointChain` — the polyline through the midpoint of every unit edge, with the chain's
   two ends kept. A chain of `n` nodes gives `n + 1` points.
2. Two passes of `capChain(averageChain(out, 4), midpoints, 0.5)`. The average runs along
   the chain; the cap holds every interior point within half a cell of **its own midpoint**
   and not of the pass before, so the cap bounds the whole departure.
3. `simplifyChain(out, 0.05)` — Douglas-Peucker, far below the noise of the raster.

New constants in `src/scene-data/region-lines.ts`, all in cells:
`REGION_TRACED_SMOOTH_HALF_WIDTH = 4`, `REGION_TRACED_SMOOTH_PASSES = 2`,
`REGION_TRACED_MOVE_CAP = 0.5`, `REGION_TRACED_SIMPLIFY_TOLERANCE = 0.05`.

`midpointChain` is new and exported. Every other function already exists and is reused.

**Why there is no corner round.** The smoothed set ends with four capped Chaikin passes,
`REGION_ROUND_PASSES = 4`; the sample carried two of them over at first. They earn nothing here. Adding them improves the
roughness median from 0.060 to 0.057 CSS pixels and the 90th percentile from 0.263 to 0.231,
both moves under a twentieth of a pixel, and it makes the departure from the edge midpoints
**worse**, from 26.57 to 27.21 light years. What they cost is the vertex count: 22,908 with
them and **5,727** without, four times the set for nothing the eye can reach.

The reason is in the band and not in the line. The coverage rule is the exact distance to the
nearest segment under a `MAX` blend, so the outside of a corner is already a round cap of the
band's half width. Rounding the corner in the geometry does the same work a second time, at a
quarter of a cell, which is far below the pixel. The sample rendered both sets at the
**sharpest** corner of the set, a turn of 92.61 degrees, at the ranges 10,000, 16,000 and
20,000 light years: the worst single channel differs by **9 of 255** and the mean by 0.030.
The two frames are the same frame.

**What it costs.** The set moves 9 light years further from the data than the lattice
polyline does, 26.6 against 17.4. That is the price of the smoothness and it is the whole of
it. Both figures sit well inside the one cell the data's resolution allows, and the lattice
polyline's own 17.4 is not 0: it is what a corner-following trace costs.

**Why half a cell and not the smoothed set's 0.75.** Half a cell is the quantisation floor:
the data cannot say where inside a cell the boundary is, so half a cell is the whole of the
uncertainty and no more. The smoothed set's 0.75 buys a rounder curve by spending more than
the data allows, and that is what rounds a real corner away.

**Why an average of half width 4 and not 3.** The two read the same to a hundredth of a CSS
pixel of roughness, and half width 4 gives the smaller set.

**The alternatives, and why not.** A bounded corner round alone cannot work: the saw tooth's
amplitude is half a cell and a cap far below the cell is by definition smaller than the
thing it must remove. Four passes at a cap of 0.25 cell take the roughness only to 0.59 CSS
pixels, at 363,488 vertices. A coverage-space smooth works, and it costs a full-frame pass
every frame, it thins and dims the band where the nearest-segment direction is inconsistent,
and nothing about it can be measured in the data. Both readings are in `proposal.md`.

### 2. Roughness is the measure, and the turn bounds are not

The two turn bounds the smoothed set holds are length-weighted, so they cannot see a saw
tooth of one cell: the lattice polyline reads 1,062.75 degrees for each 1,000 light years
and a set at 60 can still carry a fine ripple. The measure that sees it is the **roughness**:
fit a straight line to a sliding window of 8 cells of arc and take the root mean square
departure from it.

Eight cells is about two periods of the worst saw tooth, which is the 45 degree staircase,
and it is short enough that a real bend of the boundary does not dominate the reading. The
measure is relative, so it is read against the lattice polyline in the same test: the new
set must read far below it, not below an absolute number alone.

### 3. A corner floor, not a corner ceiling

The smoothed set holds every vertex under 20 degrees, which is what removes a real corner.
The traced set SHALL have at least one vertex above 25 degrees. This is a **floor**, and it
is the difference that **justifies keeping `simplified`**: the two sets also differ in size
and in fidelity, and on both of those the traced set is the better one, so a corner is the
only thing the smoothed set gives that the traced set does not. On the pinned package the sharpest vertex of the traced set turns by 92.61 degrees and the
sharpest vertex of the smoothed set turns by 14.23.

### 4. The traced corner search measures over lengths, not over segments

`tests/region-views.ts` holds a search that finds a **90 degree** node of the traced set, and
two browser scenarios read the band there. Two of its premises are really one premise: that
the set's segments are long. Both break, and neither breaks because of the turn.

- **The arm.** The search asks that the two segments beside the node each reach `armLy`, the
  half width and 48 CSS pixels, which is **770 light years** at the scenario's 3840x2160 and
  20,000 light years. The new set's median segment is 185 light years. Seven of its vertices
  hold the arm premise and every one of them turns by under **4.45 degrees**, so the search
  would return a node that is not a corner. Those two figures are **sample readings** of the set
  task 1.3 builds and no task re-measures them; the argument rests on the median segment being
  far under the arm, which task 2.5 does measure.
- **The fold.** The test walks out from the node and calls a fold any vertex past 16 CSS
  pixels of arc that is still within the half width and 12 CSS pixels, which is 385 light
  years. On a straight run the arc is the distance, so a vertex at 200 light years of arc is
  at 200 light years of distance and counts as a fold. The test therefore passes a node only
  where a neighbouring segment is **longer than the fold reach**. On today's set that is 586
  **interior** vertices of 22,472, which is the set's 22,718 less the two ends of each of 123
  chains; it is the arm premise again, written a second way. The 586 is a **sample reading of
  the set this change replaces**, so no task re-measures it.

The search SHALL therefore be restated in lengths, which is how the other two searches of the
file already work:

1. **The turn is measured over a reach**, as `findSharpCorner` measures one over 8 CSS pixels.
   The reach is the reading's own radius, the half width and `TRACED_REACH_PIXELS`, which is
   **320.8 light years** at the scenario's view. The search walks back and forward to that
   radius and takes the angle between the two chords. A node whose window is short, at the end
   of a chain, is passed over.
2. **One clearance premise replaces the clearance and the fold**, and it says what the fold
   test meant to say: tell the chain **returning** from elsewhere, which corrupts the reading,
   from the chain **continuing**, which is the line being read. The fold test decided that by
   arc length, which is why it failed on a dense chain. The replacement decides it by
   geometry.

   - **What is excluded** is the node's own **contiguous run**: walk out from the node in each
     direction and keep every segment until the chain first leaves the clearance disc. That is
     the line in and the line out. It is not a range of vertex indices.
   - **What is required** is that nothing else — no other chain, and no later part of this one
     — comes inside the clearance disc.
   - **The distance is to the nearest point of a segment**, not to the nearest vertex. A
     vertex distance is a reading of where the vertices fall, which is the fault this whole
     decision exists to remove.
   - **The radius is derived, not chosen.** Two scenarios read this node, and the disc has to
     cover the further of the two. The brightness reading reaches `choice.reachPixels`, the
     half width and 6 CSS pixels, which is 30. The **radius** reading reaches
     `halfWidth + 12`, which is 36, and marches each ray out to it. A line 60 CSS pixels from
     the node can still light a pixel 36 from it, so the radius is **60 CSS pixels**, not the
     54 that the brightness reading alone would give, and not `CORNER_CLEARANCE_PIXELS`.

   Excluding the contiguous run and not a range of indices is what keeps the comparison run's
   near end alive: the run sits on the node's own line, between 36 and 64 CSS pixels out, and
   24 of those 28 are inside the clearance disc on the excluded run.

   The disc covers the corner reading, and it covers the comparison run out to 60 CSS pixels.
   It does not cover the last 4, and a foreign line up to 88 CSS pixels away can light one of
   those pixels. That is deliberate: a foreign line there raises the run's **own** reading, so
   it makes `bend <= straight` easier to hold and cannot turn a failure into a pass.

   `TRACED_NEIGHBOUR_ARC_PIXELS` and `TRACED_FOLD_REACH_PIXELS` go with the fold.
3. **The comparison run is found by chord departure**, as `findVerticalCrossing` finds its
   runs: the longest run of the same chain that stays within `STRAIGHT_TOLERANCE_LY` of its
   chord, sits between the half width and 12 CSS pixels of the node and 28 CSS pixels further
   out, and is at least `JOIN_RUN_LEAST_PIXELS` long. It is no longer a point measured along one
   straight segment, so `TRACED_ARM_MARGIN_PIXELS` and the arm premise go.
4. **The search takes the sharpest node that holds every premise**, in place of the first
   node that turns by exactly 90 degrees.

The sample ran this search over both sets, and the tree then measured it. On the **lattice
polyline** it holds **16,240** nodes and the sharpest turns by **102.53 degrees**; on the
**new** set it holds **1,070** and the sharpest turns by **88.47 degrees**, at
4,424, 32,277 light years. The sample predicted 16,266 and 1,172 for the two counts and the
turns exactly; `tests/region-views.test.ts` asserts the measured counts. Both are real corners, so the search
is not tuned to the new set. The turn over a reach is not the turn at a vertex, and a lattice
staircase can read past 90 degrees over 320.8 light years, which is why today's figure is
above 90. **The counts are indicative and not targets.** They move with details this
text does not pin, and tasks 3.1, 3.1a and 3.2 measure them again.

**The corner radius still reads the band.** The scenario "The corner of the traced set is
round to the band's half width" fits a radius over a sweep of `180 - T` for a turn `T`, while
the band's own outer arc spans exactly `T`. The two agree only at `T = 90`, so the bound of
2.0 CSS pixels rested on an unstated premise. The sweep overshoots the arc by `90 - T` at each
end and runs that far onto the straight part, where the tangent leaves the circle by
`r * (1 / cos(90 - T) - 1)`. At a radius of 24 that is **0.009 CSS pixels** at `T = 88.47`,
0.370 at `T = 80`, 1.540 at `T = 70`, and it reaches the whole bound of 2.0 at **`T = 67.4`**.

The scenario therefore takes a floor of **80 degrees**, where the error is 0.370 CSS pixels,
under a fifth of the bound. The floor is derived from the formula above and the bound it
guards; a floor of 60 would pass turns at which the error is already 3.71 CSS pixels, which is
past the bound. The scenario also states the turn it read.

The set's whole one cell departure bound is 4.6 CSS pixels at the scenario's view against a
band half width of 24, and the measured departure of 26.6 light years is 2.5 CSS pixels
there, so the fitted radius still reads the band and not the line.

**`findSharpCorner` is not touched.** It carries the same fold test and the same latent
premise, and the smoothed set it reads is not changed by this change. Fixing it there would
move `SHARP_CORNER`'s recorded view and its browser readings for no gain. The asymmetry is
deliberate and is recorded as a follow-up.

The four search results in `tests/region-views.ts` are constants that the test re-derives by
running the search. Every one of them may move, and the task list requires each to be
re-measured and written back rather than guessed.

### 5. The grid's reach takes the lesser of two fades

`gridDistanceFade(distance, spacing)` stays exactly as it is, so its scenario and its readings
stay exactly as they are. Beside it goes `gridZoomReach(cameraDistance)`, which returns
`GRID_REACH_ZOOM * cameraDistance` with `GRID_REACH_ZOOM = 0.4`. Both live in
`src/render/grid-pass.ts`.

**The zoom bound is a reach and not a fade.** An earlier draft of this decision added a
`gridReachFade(distance, cameraDistance)` beside `gridDistanceFade`. Once the `min` moved to
the CPU, as the next paragraph explains, nothing in `src/` read that function: the renderer
wants a reach and the shader holds the only ramp. This delta argues about `REGION_CLOSE_NONE`
that a constant nobody reads is a rule a later reader will try to obey, and the same holds for
a function. `gridZoomReach` is read by `gridReachPerLevel`, and the ramp is checked through
`gridReachPerLevel` rather than through a second fade that ships unread.

A level's alpha takes the **lesser** of the two fades, and not the product. Both are the ramp
`1 - r / reach`, so the lesser of the two fades is exactly the fade of the lesser of the two
reaches, which is the rule the proposal states. A product would double-count: two ramps that
each read 0.6 would give 0.36, and the line would fade well before either reach ended.

Because the lesser of two ramps is the ramp of the lesser reach, the work is a `min` of two
**reaches** and not of two fades, and a reach is one number for each level for each frame.
The Implementation paragraph below therefore puts the `min` on the CPU, and the shader keeps
one ramp for each level.

**Why 0.4.** A disc of radius `0.4 * d` light years about the cursor projects to
`0.4 * focalCss` CSS pixels at the cursor's own range. `focalCss` is `rows / (2 tan 30)`, so
the radius is `0.4 * rows / 1.1547 = 0.346 * rows`: **374 CSS pixels on 1,080 rows**, and the
same share of the frame at every viewport and every zoom. The grid therefore reads as the same
tool wherever the camera is.

**What else reads inside the disc.** Every level but the numbered one now draws nothing past
0.346 of the viewport height from the cursor, so any existing reading of a grid pixel away from
the cursor is in the blast radius. The browser scenarios of `e2e/grid.spec.ts` survive for two
reasons, and task 4.6 runs them: most read a point on the **numbered** level, which is exempt,
and the rest read inside the disc. The one to watch is a crossing read past 20,000 light years
of the cursor, which today is drawn by the 10,000 light year level and after this change is
cut. Task 6.2 runs the whole suite, so a breach is loud rather than silent.

The shader needs no new reading. The camera's distance to the cursor is already in the frame,
because `gridVisibility` reads it, and the `min` happens on the CPU under decision 5a, so the
shader takes six reaches and no camera distance.

### 5a. The level that carries the numbers is exempt from the zoom reach

The coordinate labels need room to be read. `GRID_LABEL_CSS = 400` keeps the numbers on the
100 light year level only while that level's crossings are at least 400 CSS pixels apart, and
moves them to the 1,000 light year level above a camera distance of 233.8 light years. Above
that the numbered crossings sit `focalCss * 1000 / d` CSS pixels apart: **935** at a camera
distance of 1,000 light years and **234** at 4,000, against a reach disc of radius
`0.4 * focalCss`, which is **374** CSS pixels.

The binding case is the near end of that band, where the crossings sit furthest apart and
fewest of them fall inside the disc. At a camera distance of 1,000 light years the numbered level is 1,000 light years, a cursor at the
middle of a cell is 707 light years from its nearest crossing and the reach is 400, so the
frame would carry lines and no numbers. `src/render/grid-pass.ts:220` already records a band
where a cursor away from a crossing sees no coordinate label, "from a zoom of about 300 to
about 900 light years". Cutting the numbered level would widen that band to run from **234**
light years, where the numbered level becomes 1,000, to **1,768**, where `0.4 * d` first
reaches the 707 light years a cursor can sit from its nearest crossing. The same fault returns
below **177**, where the numbers sit on the 100 light year level and `0.4 * d` falls under its
own 70.7.

The numbered level is therefore **exempt** from the zoom reach and keeps its own reach of 100
lines. The exemption costs little. `gridLabelLevel` returns 100 or 1,000 light years and
never more, so the numbered level is not the coarsest level on the screen and every level
above it is still cut; each of those carries at most one line across a frame in any case. At
a camera distance of 4,000 light years the numbered level is 1,000 light years and its
crossings sit 233.8 CSS pixels apart, so it carries about **8 lines** across a 1,920 CSS pixel
frame, against the 100 light year level's **82**, which the reach cuts to 32 inside the disc.
It is that fine lattice that reads as a lattice. Everything about the coordinate labels is then unchanged, including the
reach of 1.2 spacings, the scenarios that read 0.25 at 90 light years and below 120, and the
equality of "A label does not draw stronger than its line". The requirement "The grid carries
coordinate labels on its own plane" is not touched by this change.

**What the exemption costs.** At a low pitch the numbered level still runs toward the horizon,
so the frame's furthest lit grid pixel does not move. What moves is the **density**: every
finer level stops at the reach. That is the right half of the fault, and the spec measures it
as a count of lines for each 1,000 light years inside and outside the reach rather than as an
extent.

**Implementation.** The reach is per level, so the CPU computes one reach for each of the six
levels — the lesser of `100 * spacing` and `GRID_REACH_ZOOM * distance` for a level that
carries no number, and `100 * spacing` for the one that does. That rule is
`gridReachPerLevel(focalCss, distance)` in `src/render/grid-pass.ts`, beside `gridLabelLevel`
and the two fades, so a unit test reads it without a frame. `grid.frag` takes the six as one
array uniform beside `uSpacing`.

The shader then holds **one** ramp per level and not two, so `uFadeLines` becomes dead and goes.
That is the point of computing the reach on the CPU: the `min` happens once per level per frame
instead of once per fragment per level, and the exemption, which needs `gridLabelLevel`, never
has to be expressed in GLSL.

`GridPassFrame` carries neither the camera distance to the cursor nor the numbered level today,
so it gains the six reaches as one array. `src/render/renderer.ts` already works out the
numbered level immediately before it calls `gridPass.draw`, so the reaches are computed there
from figures the frame already holds.

### 6. The label's drift cap rises to 1,200, and the half life does not move

At a gap of 300 CSS pixels the share of 71 milliseconds asks for 45 CSS pixels in a 16.667
millisecond frame and the old cap allowed 2.0. The cap bound the move by a factor of 22, so
the cap is the whole fault and the half life is not part of it.

`TARGET_DRIFT_PIXELS` goes from 120 to **1,200**, which is `ANCHOR_MAX_SPEED`. Matching the
anchor's own cap is the point: the target can then never ask the anchor for more than the
anchor may give, so the two stages cannot fight, and the anchor stays the stage that sets what
the eye sees.

Leaving `TARGET_HALF_LIFE_MS` at 71 keeps the scenario "The rates give the old figures at 60
frames a second" true in all four of its readings, and keeps "The share of the gap follows the
gap" at 0.150. Only the figures that name the cap move.

The two rules the proposal asks to keep are kept, and neither depends on the cap. A label on
its region's centre does not move over the map because its target **is** the centroid, a fixed
plane point; the scenario "A label on its centre does not move over the map" reads 512
identical plane points and is untouched. The target does not overtake the map because the cap
is still `carry + rate * seconds`, an addition on top of the map's own motion, and the
scenario "The target does not overtake the map" reads that.

## Risks / Trade-offs

- **Every reading of the traced set moves.** Vertex counts, departures, turns and the four
  region-view searches are all re-measured. A figure written from memory rather than from a
  run is the main way this change can go wrong, so each task names the run that produces it.
- **The grid shows fewer lines above the numbered level.** At a camera distance of 4,000 light
  years the numbered level is 1,000 light years, so that level keeps every line it has today.
  What the reach cuts there is the 100 light year level, from about 82 lines across the frame
  to 32 inside the disc, and the 10,000 light year level, whose nearest crossing is rarely
  inside 1,600 light years and which therefore usually draws nothing. That is the intent: the
  numbered level marks the scale, and the fine lattice marks the neighbourhood.
- **The traced set trades 9 light years of departure for the smoothness**, 26.6 against the
  lattice polyline's 17.4. A reader who wants the line nearest the data is now served by
  neither mode. The trade is deliberate and the alternative is the saw tooth.
- **A handover during a wheel zoom now moves the target ten times as far in a frame.** The
  cap was 2.0 CSS pixels a frame and is 20.0. This change does not touch the wheel, but it
  raises the ceiling on what a handover inside the notches may add. Two scenarios show it, and
  both stated readings taken under the old cap that said nothing about the new one: "A zoom
  reads like a drag" and "The label walks smoothly while the camera drags".

  **Both sets of stated readings were already stale before this change, and the implementation
  measured that.** The requirement said the 90th percentile of the faster drag was 0.67 against
  a bound of 0.7, and an earlier draft of this list called that the assertion nearest to
  breaking, at 96 per cent of its bound. Run on the committed tree with the cap still at 120 it
  reads **0.3768**, which is 54 per cent. The drag readings of "A zoom reads like a drag" were
  stale the same way, 2.7 and 0.13 stated against 5.695 and 0.1513 measured. Ten readings were
  re-measured and written back; that is what task 5.0 exists for, and it found the defect in the
  figures this list was arguing from.

  **The assertion nearest to breaking is a different one**, and it is the one this change really
  moves. In the same scenario `at(1)`, the worst single frame, ran 8.345 and 9.219 CSS pixels
  under the old cap and runs **15.986** and 13.859 under the new one, against `ANCHOR_MAX_PIXELS`
  of 20. That is 80 per cent of its bound where it was 42, and it is the cap doing exactly what
  it is raised to do: the test's own comment calls that reading "a target that really relocates".
  The two bounds the earlier draft worried about did not move. `at(0.9)` reads 0.3882 against
  0.7, and the held-wheel worst reads **13.188 before and after**, unmoved by the cap. Tasks 5.4a and 5.4b re-measure all ten
  readings rather than carrying them over, task 5.0 sweeps for any other reading the suite logs
  rather than asserts, and tasks 5.4 and 5.5 run the whole of `src/app/labels.test.ts` and
  `e2e/labels.spec.ts`.
- **A label now covers most of a 300 CSS pixel gap in about 15 frames and settles later.**
  The cap allows 20.0 CSS pixels in a frame, so **15** frames is the floor a 300 pixel move
  can take, and a floor is not an arrival: the share of the gap falls as the gap closes, so the last CSS
  pixel takes about 39 frames, which is 0.65 seconds. That is a quick move, not an instant
  one. Anything quicker would need the half life as well, and that would break a scenario this
  change keeps.

## Follow-up, not taken here

The traced set now beats the smoothed set on **all three** axes that can be measured: **a
twelfth** of the vertices, 5,727 against 68,672, 10 light years nearer the data, and 0.061 CSS
pixels of roughness to the smoothed set's **0.065**, which are both so far under one pixel that
neither can be seen. It loses only the 20 degree vertex ceiling, which is the thing it is kept
for.

The roughness figure is a correction. The offline sample read the smoothed set at 0.034 CSS
pixels and this document said so; the shipped measurement over the real `buildRegionData()`
sets reads 0.065. The sample was wrong, and the third axis is a win rather than a tie. The only reason left
to keep `simplified` is a host that wants every corner rounded away. Whether that is worth a
mode is a question for its own change, because removing one breaks the host API.

`findSharpCorner` keeps the fold test that decision 4 replaces in `findTracedCorner`. It
passes a bend only where a neighbouring segment is longer than the fold reach, which on the
smoothed set is 7,073 vertices of 68,426. It still finds a bend, so nothing is broken; but the
premise is an accident of vertex spacing and not the thing the test means to say. Correcting
it moves `SHARP_CORNER`, so it belongs to a change that touches the smoothed set.
