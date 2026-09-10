## 1. The simplification

- [x] 1.1 Add the chain simplification to `src/scene-data/region-lines.ts`: keep a traced
      node only where dropping it would move the line further than the fit tolerance from
      the trace, measuring the distance to the **segment** and not to the infinite line
      through its ends, and always keep the first and last node. Verify with a unit test on
      four hand-built chains — a straight run, a right-angle corner, a gentle curve and a
      chain that doubles back, where the segment and the line measures differ — that the
      result is 2, 3, a handful and the expected vertices, all of them traced nodes.
- [x] 1.2 Export two constants: a fit tolerance of 190 light years and an asserted departure
      bound of 200. Verify with a unit test that the tolerance is strictly below the bound.
- [x] 1.3 Remove `REGION_SMOOTH_PASSES`, `REGION_SMOOTH_HALF_WIDTH`, `REGION_MOVE_CAP`,
      `REGION_SIMPLIFY_TOLERANCE`, `REGION_ROUND_PASSES` and `REGION_ROUND_CAP` with the
      three smoothing stages that read them, and delete the suites in
      `src/scene-data/region-lines.test.ts` that cover the capped average, the vertex
      reduction and the corner rounding. Verify `pnpm lint` reports no unused export and
      `pnpm test` passes rather than merely runs.

      Measured: `pnpm lint` passes and reports no unused export. `pnpm test` gives 33 files
                  and 234 tests, with 4 failures, all of them in `tests/region-views.test.ts`, which
                  section 5 rewrites. `region-lines.test.ts` passes, 24 of 24.

- [x] 1.4 Verify the scenario `Every vertex is a traced node` with a unit test that looks up
      every simplified vertex among the nodes of its own chain's trace.
- [x] 1.5 Verify the scenario `The simplified line stays inside the departure bound` with a
      unit test that walks **both** polylines at a 10 light year step and measures each
      sampled point against the other line. A vertex-only check passes trivially and must
      not be used.

      Measured at a 10 light year step: **185.9** light years drawn to traced and **189.8**
                  traced to drawn, against the bound of 200. The artifacts said 185.8 and 189.8
                  before they were corrected; 185.881 rounds to 185.9.

- [x] 1.6 Add the traced-turn measure the spec defines: at a traced node, the angle between
      the chord from the point 500 light years back along the chain and the chord to the
      point 500 light years forward, and no value where a chain end is nearer than that.
      Verify with a unit test on a hand-built staircase that runs straight overall that the
      measure reads near zero, which an accumulated-turn measure would not.
- [x] 1.7 Verify the precision half of `The line keeps real corners and invents few`: at
      least one vertex over 60 degrees, and at least 90 percent of the vertices over 20
      degrees sitting at a traced node whose traced turn is also over 20 degrees.

      Measured: **227 of 235** vertices over 20 degrees sit at a traced node that also turns
                  over 20 degrees, which is 96.6 percent against the bound of 90. The worst invented
                  turn is 30.6 degrees and the largest turn in the set is 109.0. The artifacts said
                  228 of 235 and 97.0 percent before they were corrected, so this build keeps one
                  honest corner fewer. That is the tie-break difference the design says nothing rests
                  on; the reading holds the bound with 6.6 points of margin.

- [x] 1.8 Verify the recall half: grouping traced nodes within 500 light years of each other
      along the chain, at least 75 percent of the places where the traced turn is over 60
      degrees carry a simplified vertex within 500 light years that turns by more than 40
      degrees. A measured build gives 221 of 221; the 75 percent bound is deliberately far
      below that, because the fit is not tuned for recall. Leave out any node with a chain
      end nearer than 500 light years, as task 1.6 says: measuring those over a shortened
      reach adds 37 places that no vertex covers and drops the reading to 85.7 percent. Then
      run the same check against the smoothed polyline this change removes and confirm it
      fails there, so the test is known to be able to fail. Run that control **before** task
      1.3, or from the commit before it: task 1.3 deletes the smoothing stages, so afterwards
      there is no polyline left to fail the check.

      Measured: **221 of 221** places, which is 100 percent against the bound of 75, and
                  matches the artifacts. Negative control, run before task 1.3 against the smoothed
                  polyline: **0 of the same 221 places** are covered, which is 0 percent, because the
                  largest turn anywhere on the smoothed polyline is **14.3 degrees** and the check asks
                  for more than 40. The control was generous, taking a straight-line reach rather than
                  an along-chain reach. The check can therefore fail.

- [x] 1.9 Verify the scenarios `The set does not fragment` and `The set is small enough to
upload once` with unit tests on the segment lengths and the vertex count.

      Measured: **439 segments**, **5** of them shorter than 500 light years against the
                  bound of 20, and the longest is **14,970 light years**. The set holds **562 vertices**
                  in **6.586 KiB** over 123 chains, against the bounds of 300 to 2,000 vertices. Every
                  figure matches the artifacts.

- [x] 1.10 Verify the scenario `Two chains that meet share their end exactly` with a unit
      test driven from the lattice nodes where three or more chains of the trace meet, not
      from grouping the output.

      Measured: the trace has **82 lattice nodes** where three or more chains meet, and every
                  chain that meets at one ends on the same point.

- [x] 1.11 Confirm the scenarios `The boundary is a small number of chains`, `The set is
deterministic` and `The set is transferable` still pass unchanged.

## 2. The clearance field

- [x] 2.1 Compute one exact Euclidean distance transform over the region grid in the worker,
      seeded at zero on every cell that has a 4-neighbour of another id, as two separable
      passes, held as one `Uint16` per cell. Verify the scenario `The clearance field is
exact and its downsample is safe`, first half: on a hand-built grid, every cell is never
      above a search over every seeded cell and never more than one light year below it, which
      is what rounding down to whole light years allows. That is a distance to the last cell
      inside the region, not to the first cell outside it.

      Measured: the transform runs as two separable passes of the exact algorithm of
                  Felzenszwalb and Huttenlocher, in `src/scene-data/clearance.ts`. Over the shipped
                  grid the field holds 2,027 by 2,027 `Uint16` cells, which is **8,217,458 bytes**,
                  and its largest value is **21,635 light years**, which matches the artifacts.
                  Against a search over every seeded cell, on two hand-built grids, the field is
                  **never above the search** and **never as much as one light year below it**.

- [x] 2.2 Downsample by 8 to 254 by 254 `Uint16`, each cell carrying the **smallest**
      clearance of the cells it covers, anchored at the centre of its block. Verify the
      second half of the same scenario: no downsampled cell reports more clearance than the
      smallest exact value under it, and a bilinear read between cells never exceeds the
      exact field by more than one cell of the trace grid. Verify the scenario `The field is
1-Lipschitz`, which is what lets the page recover at a region's centre what this
      downsample loses.

      Measured: the downsample holds **254 by 254 cells** of `Uint16`, which is
                  **129,032 bytes**, and matches the artifacts. Over the whole shipped field no
                  downsampled cell is above the smallest exact value under it; the worst difference
                  is **0**. A bilinear read at every one of the 4.11 million trace cells exceeds the
                  exact field there by at most **47.89 light years**, which is **0.1213 of a block
                  width** and stays under the one trace cell of 49.3494 the task allows. The
                  artifacts said 0.116 of a block width and 45.8 light years before they were
                  corrected, and they derived those rather than measuring them. The measurement sits
                  2.1 light years above the derivation, so the derivation was wrong. It still sits
                  inside the two trace cells the label rule allows for, which is 98.70.

                  The Lipschitz reading over **1,000,000 pairs**, half of them drawn over the whole
                  field and half at a separation drawn over every scale: no pair differs by more
                  than the distance between the two cell centres. The closest any pair comes is
                  **21.36 light years of slack**, so the bound is never reached. A city-block
                  transform of the same seeds is run as a control on a hand-built grid: it holds
                  between neighbours, within one cell, and breaks the straight-line bound, so the
                  check is known to be able to fail.

- [x] 2.3 Seed the transform on the rim as well: a cell that resolves to no region counts as
      an id of its own, the same rule the trace uses. Verify the scenario `The rim seeds the
clearance field`.

      Measured: **11 of the 42 regions** touch the edge of the mapped area. For every
                  one of them the clearance at its centre is smaller than the distance to the
                  nearest cell of another named region, and the cell next to the outermost cell that
                  resolves to a region reads **0**. For **4 of the 11** the rim is nearer to the
                  centre than any named region, so the field would run further without the rim
                  seed.

- [x] 2.4 Derive, per region, the centre as the point of largest clearance and the clearance
      there. Verify with a unit test that for a hand-built concave region the centre lies
      inside the region while the centroid does not, and record the measured clearance of all
      42 regions in this file.

      Measured over the 42 regions, in light years: `Galactic Centre` 2,361,
                  `Outer Orion-Perseus Conflux` 2,466, `Norma Arm` 2,467, `Outer Orion Spur` 2,605,
                  `Empyrean Straits` 2,648, `Inner Scutum-Centaurus Arm` 2,778, `Ryker's Hope`
                  2,843, `Inner Orion-Perseus Conflux` 3,250, `Perseus Arm` 3,287,
                  `Orion-Cygnus Arm` 3,299, `Izanami` 3,300, `Temple` 3,306, `Arcadian Stream`
                  3,315, `Odin's Hold` 3,506, `Elysian Shore` 3,643, `Newton's Vault` 3,803,
                  `Sanguineous Rim` 3,849, `Aquila's Halo` 4,117, `Vulcan Gate` 4,133,
                  `Trojan Belt` 4,183, `Norma Expanse` 4,516, `The Conduit` 4,524, `Lyra's Song`
                  4,627, `The Veils` 4,767, `Hawking's Gap` 4,887, `Inner Orion Spur` 4,954,
                  `Xibalba` 4,962, `Outer Arm` 4,963, `Achilles's Altar` 4,972,
                  `Hieronymus Delta` 5,123, `Sagittarius-Carina Arm` 5,668, `Formorian Frontier`
                  5,680, `Dryman's Point` 5,793, `Kepler's Crest` 5,793, `Tenebrae` 5,922,
                  `The Abyss` 5,991, `The Void` 6,021, `Formidine Rift` 6,141, `Mare Somnia` 7,028,
                  `Outer Scutum-Centaurus Arm` 8,302, `Errant Marches` 8,323, `Acheron` 8,496.

                  The range runs from **2,361** for the `Galactic Centre` to **8,496** for
                  `Acheron`, with a median of **4,520**. Every one of the three matches the
                  artifacts.

                  The hand-built check: for a C-shaped region the centroid of its cells falls in the
                  neighbouring region, while the centre of largest clearance falls inside it.

- [x] 2.5 Verify the scenario `The worker returns the label geometry`: the message carries a
      centre and a clearance for all 42 regions and the boundary departure bound, and each
      centre resolves to its own region on the coarse grid.

      Measured: the message carries a centre and a clearance for **all 42 regions**, and
                  every centre resolves to its own region on the coarse grid. It carries the
                  departure bound of **200 light years**. The bound travels on the message, in
                  `RegionLabelGeometry`, because `REGION_DEPARTURE_LY` is declared beside the region
                  cell lookup.

- [x] 2.6 Verify the scenario `The clearance field is transferable`, and that the worker
      still meets the `Time budget` scenario of `far-view-scene-data` with the transform in
      it. Record the measured build time.

      Measured: the downsampled field moves through a `MessageChannel` with its buffer in
                  the transfer list. The receiver gets 254 by 254 `Uint16`, which is 129,032 bytes,
                  and the sender's buffer has length 0.

                  The whole region worker run, with the transform in it, takes **380 milliseconds**
                  in the dev container, against the 5 second budget of the `Time budget` scenario. A
                  unit test times `buildRegionData` and fails above 5 seconds. The parts are: the
                  grid fill 135 ms, the chain trace 48 ms, the pack 7 ms, the distance transform
                  **120 ms**, the per-region centres 64 ms and the coarse grid 2 ms. The browser half
                  of the scenario runs in `e2e/`, which this section does not touch.

## 3. The message

- [x] 3.1 Carry the pair of region ids of every chain, the departure bound, the per-region
      centres and clearances, and the downsampled clearance field through
      `src/scene-data/types.ts` and `src/scene-data/messages.ts` as typed arrays and plain
      numbers. The departure bound travels on the message rather than being imported,
      because it is declared in a module that imports the 199 KiB region lookup. Verify the
      scenario `A chain separates one pair of regions` reads the recorded pair.

      Measured: `RegionLines` carries `pairs`, two `Uint8` per chain, and the scenario
                  `A chain separates one pair of regions` now reads the recorded pair for every one
                  of the **123 chains** and matches it against the pair the trace holds on every
                  edge. The label geometry carries the centres as `float32`, the clearances as
                  `Uint16`, the downsampled field and the departure bound as a plain number. Every
                  buffer goes in the transfer list.

- [x] 3.2 Widen `setGrid` in `src/app/labels.ts` to take the label geometry as well as the
      coarse region grid, and thread it from `src/app/main.ts`. Verify with a unit test that
      placement before the geometry arrives places nothing rather than throwing.

      Measured: `setGrid` takes the coarse region grid and the label geometry together,
                  and `src/app/main.ts` threads both from the worker message. A unit test builds the
                  overlay with a fake host, calls `update` before `setGrid`, and reads that nothing
                  is placed and nothing is thrown. A second test calls `setGrid` and reads that
                  labels are then placed. The placement itself is left for section 4.

- [x] 3.3 Confirm `src/render/region-pass.ts` draws the smaller set with no change to the
      ribbon, the coverage buffer or the composite. Verify `pnpm test` and
      `src/render/region-pass.test.ts` pass.

      Measured: `src/render/region-pass.ts` needs no change. It reads the positions and
                  the chain index arrays only, so the added pair array does not reach it.
                  `src/render/region-pass.test.ts` passes, 10 of 10; its fixture gains the pair
                  array the type now requires.

- [x] 3.4 Verify the page chunk still excludes `astro/codex-region-lookup`, with
      `tests/main-bundle.test.ts` and the 130,000 byte limit.

      Measured: `pnpm build` gives a page chunk of **109,529 bytes**, against the limit
                  of 130,000. It was 108,194 bytes before this section, so the clearance reader and
                  the widened types add 1,335 bytes. `astro/codex-region-lookup` stays in
                  `region-lines.worker` alone, which is 235.84 KiB.

## 4. Label placement

- [x] 4.1 Replace candidacy: a region is a candidate when any part of it projects inside the
      viewport, tested through its own boundary segments, its centre, and the regions holding
      the plane points under the middle and the four corners of the frame. Project the 562
      vertices **once for the frame** into a shared array and let every region index into it,
      rather than projecting each region's own segments, which would project about 1,756
      endpoints instead of 562. Record the measured projection count. Clip a boundary
      segment against the camera plane before projecting it, and let a frame corner whose ray
      misses the plane contribute nothing. Remove `CANDIDATE_SHARE`, `HELD_SHARE` and
      `CARRIED_BONUS`. Verify with a unit test that a region filling the frame with no
      boundary and no centre in view is still a candidate, and verify the scenarios `A frame
corner that misses the plane contributes nothing` and `A boundary segment behind the
camera does not make a false candidate`.

      Measured: the frame projects the **562 vertices** of the boundary set once and
                  every region indexes into them. Candidacy costs **620 plane point projections**
                  in all at the label view — the 562 vertices, the 42 centres, the 5 frame points
                  and the clip of the few segments that cross the camera plane — against the about
                  1,756 endpoint projections a region that projected its own segments would make.
                  A whole frame makes at worst 1,094 projections at 1280x720 and 1,064 at
                  1920x1080, the rest being the slide. A unit test reads that a region filling the frame with
                  no boundary and no centre in view is still a candidate, that a frame corner whose
                  ray misses the plane at a pitch of 5 contributes nothing while the region under
                  the middle of the frame is still found, and that a segment whose end sits behind
                  the camera makes no candidate although its unclipped projection lands at 1278, 26
                  inside a 1280 by 720 frame. The same segment moved in front of the camera does
                  make the region a candidate, so the test reads the clip and not an empty rule.

- [x] 4.2 Add the required-clearance test: unproject the four corners of the box, at the scale
      under test and centred on the projection of the anchor, and take the largest distance
      from the anchor to those four plane points, plus the departure bound, plus half the line
      width converted at the largest light-years-per-pixel over the same corners, plus two
      cells of the trace grid. Measure it **at the anchor**. Refuse the box at that scale when
      a corner's ray does not meet the plane in front of the camera. Verify with a unit test
      that a box just inside the requirement is accepted and one just outside is refused, that
      dropping the departure term or the grid-cell term wrongly accepts a case the test
      names. Verify the scenarios `The footprint is measured on the plane` and `A box corner
past the horizon is refused`.

      Measured: the requirement unprojects the four corners of the box and takes the
                  largest distance from the anchor, plus the departure bound, plus half the four
                  pixel line width at the largest light years per pixel over those corners, plus
                  two cells of the trace grid. The light years per pixel is the largest singular
                  value of the Jacobian of the plane map at the corner, which is exact rather than
                  a difference of two samples. Unit tests read that a box just inside the
                  requirement draws at full size and that a box with only the requirement less the
                  departure bound, or less the two trace cells, does not.

                  The pixel form asks a median of **2.0036** times the plane form at 1280x720 and
                  **2.0792** at 1920x1080, and more than the plane form on every label. The spec
                  said 2.18 and 2.58 before they were corrected. Over the footprint term alone,
                  without the three constants both forms carry, the medians are **2.2111** and
                  **2.3308**, which is where the older pair came from. The smallest ratio is
                  **1.04**, on `Norma Arm`; the artifacts said 1.18 on the same label. The
                  scenario's asserted bound moved from 2 to 1.5 with the correction, because
                  2.0036 against a bound of 2 is a margin of 0.18 percent.

- [x] 4.3 Add the wanted point: the plane point under the middle of the frame, with the
      condition that the camera sits above the plane. Verify with a unit test that it exists
      at every pitch from `MIN_PITCH` to `MAX_PITCH` while the camera is above the plane,
      including pitches where the horizon is inside the frame, and verify the scenario `The
camera below the plane draws no label` for the case where it does not.

      Measured: the wanted point exists at every pitch from 5 to 89 while the camera
                  sits above the plane, including the pitches where the horizon is inside the
                  frame, and no region reports the below-the-plane reason at any of them. A camera
                  whose cursor sits 30,000 light years below the plane at a zoom of 20,000 and a
                  pitch of 35 draws no label and reports the reason rather than throwing.

- [x] 4.4 Read the clearance at the anchor and nowhere else, as the larger of the interpolated
      downsampled field and the region's recorded clearance less the distance from its centre.
      Verify the scenario `The clearance is tested where the box is drawn` with a unit test on
      a region whose segment dips below the required clearance between the centre and the
      anchor while holding it at the anchor. Read the field by interpolation rather than by
      nearest cell, and verify the scenarios `The clearance read does not step across a cell
of the field`, `The clearance read is exact at a region's centre` and `The clearance
read never claims more room than there is`. Record how many labels
      the field term alone would draw at the two viewports; a measured build gives 10 and 20
      against 13 and 20, and loses the region under the middle of the frame.

      The scenario was called `The drawn size does not step with the clearance field` and
                  read the drawn scale. The implementation review found it cannot be verified that way,
                  and the fault is in the scenario and not in the build. The anchor only moves when it
                  has slid; step 2 stops the slide at the first point whose floor-scale box fits the
                  viewport, so no larger box fits there and a moving anchor always draws at exactly the
                  floor. A test on the drawn scale reads 0.700 in all 40 frames and cannot fail. The
                  scenario now reads the clearance itself, which is the quantity the interpolation
                  exists to smooth, and it carries a nearest-cell control that fails it. The first draft
                  of the test asserted the read while its name claimed the drawn size, which is the same
                  fault one level down; it is corrected.

                  Measured: the read is the larger of the interpolated field and the region's
                  recorded clearance less the distance from its centre. Over **117,989 points**
                  inside the 42 regions it exceeds the exact field by at most **34.63 light
                  years**, against the 98.70 the two trace cells allow, and the centre term by at
                  most **0.82**, against the one light year the rounding allows. The centre term is
                  the larger at **12.3 percent** of them, which is the share the spec states. At
                  the 42 centres the read is exact, while the field alone reads a median of
                  **367.5** light years low.

                  The field term alone draws **10** labels at 1280x720 and **20** at 1920x1080,
                  against 14 and 20 with both terms. The spec states 10 and 20 against 13 and 20.
                  With the field alone the `Galactic Centre` carries no label at 1280x720, which is
                  the region under the middle of the frame.

                  A unit test reads the clearance at the anchor and not along the segment: a field
                  that dips to 100 light years between the centre and the anchor, which is below
                  the 298.7 the departure bound and the two trace cells ask for before any
                  footprint, still draws the label, because the box is drawn at the anchor alone.

- [x] 4.5 Add the slide: bisect the segment for the point nearest the centre whose
      floor-scale box lies inside the viewport, running until the interval is shorter than one
      CSS pixel on screen rather than for a fixed count, and take the centre itself when it
      already qualifies. Handle the case where no point of the segment qualifies, which
      includes a viewport smaller than the floor-scale box, by placing no label rather than by
      bisecting an interval with no feasible end. Treat a point that is not in front of the
      camera as never satisfying it.
      Verify the scenarios `The label holds the centre while the centre is usable`, `The
label leaves the centre when the centre leaves the frame` and `A centre behind the
camera never holds the label`.

      Measured: the slide bisects the segment and runs until the interval is shorter
                  than one CSS pixel on screen, and takes the centre when it already qualifies. A
                  viewport smaller than the floor-scale box places no label and reports the
                  no-anchor reason. A centre behind the camera whose unclipped projection lands
                  inside the frame never holds the label.

                  The two searches do not share one tolerance. The scale search runs to **one CSS
                  pixel of box width**, which the requirement names directly and which is about
                  0.008 of scale on a full-size box. The slide runs to **0.05 CSS pixels of screen
                  distance**, which the requirement's "shorter than one CSS pixel" allows with
                  margin. The slide needs the tighter number because whatever slack it leaves the
                  box grows into: the box of a slid label touches the edge of the viewport, and one
                  CSS pixel of slack on a 20 pixel box is 0.1 of scale. Measured over a pan of 40
                  light years a frame at a zoom of 2,000, a one pixel slide draws a slid label at
                  **0.700 to 0.747**, which pulses between frames; at 0.05 it draws at **0.700 in
                  every frame**. Over the 120 frame turn at `#c=0,0,0&d=500&p=35&y=0`, where the
                  `Inner Orion Spur` label slides, the drawn scale is **0.700 in every frame**
                  against 0.700 to 0.752 before, and the worst move of the label falls from 3.507
                  to **2.643 CSS pixels**. This is the design's "every slid label comes out at
                  exactly 0.700" and the browser scenario's "within 0.01 of the floor". A unit test
                  now reads it: at the label view every label that has left its centre — one at
                  1280x720 and two at 1920x1080 — draws inside 0.01 of the floor.

- [x] 4.6 Add the region test: read the anchor's region id from the coarse grid and place no
      label when it is not the label's own region. Verify with a unit test on a concave region
      whose visible part lies past the concavity. Verify the scenario `An anchor in a
neighbouring region draws no label`.

      Measured: the anchor must read back as its own region on the coarse grid. A unit
                  test builds a concave region whose neighbour lies as a band across the near part
                  of the frame, so the straight segment cuts through the neighbour: no label is
                  placed and the reason is the region test. The same view with the neighbour's
                  cells reading as the label's own region draws the label, so the clearance there
                  would have passed and it is the region test that refuses it.

- [x] 4.7 Add the four reasons a label is not drawn. Verify with a unit test that each fires
      on its own case and that no fifth case reaches the drawing step.

      Measured: the placement reports one reason per region — below the plane, off
                  screen, no anchor, another region, no room. The last two are the two halves of
                  the fourth reason the spec names. A unit test fires each on its own case, and
                  over four views every region reads a reason from that set, a region with a reason
                  is never drawn and a drawn region never carries one.

- [x] 4.8 Add the continuous scale in `[0.7, 1]`, the largest whose box both holds the
      required clearance at the anchor and lies inside the viewport, found by bisection on the
      scale, run until the interval of scales left is narrower than one CSS pixel of box
      width rather than for a fixed count. Record the measured worst number of steps, and
      with it the worst number of corner unprojections a frame makes, because the budget
      rests on that count. Verify the scenario `A small region scales its label and then
hides it`, and record the scale of every region at `#c=15,0,25895&d=20000&p=35&y=0`
      at 1280x720 and at 1920x1080, against the counts the spec states.

      Measured: the scale bisects until the interval of scales left is narrower than
                  one CSS pixel of box width. Over 300 frames the worst search of a frame takes
                  **15 steps** at 1280x720 and **16** at 1920x1080, and the worst frame makes
                  **356** corner unprojections at 1280x720 and **212** at 1920x1080. The tighter
                  slide adds four or five steps to each region that slides; it moves no label count
                  and no drawn scale except the slid ones, which now sit at the floor.

                  At `#c=15,0,25895&d=20000&p=35&y=0`, of the **27 regions** the frame shows, which
                  is the count the spec states:

                  - 1280x720 draws **14** labels, which the spec now states after the correction
                    from 13: `Galactic Centre`
                    0.761, `Empyrean Straits` 0.709, `Ryker's Hope` 0.794, `Odin's Hold` 1.000,
                    `Norma Arm` 1.000, `Izanami` 1.000, `Norma Expanse` 0.700, `Trojan Belt` 1.000,
                    `The Veils` 1.000, `The Conduit` 0.887, `Mare Somnia` 1.000, `Acheron` 1.000,
                    `Outer Scutum-Centaurus Arm` 0.709, `The Abyss` 0.813. One of the 14 has left
                    its centre, `Norma Expanse`, and it draws at the floor, 0.700. The two 0.709
                    readings, `Empyrean Straits` and `Outer Scutum-Centaurus Arm`, are labels on
                    their own centre whose clearance caps them there, which is the continuous band
                    the rule gives. An earlier record of this block put `Norma Expanse` at 0.709 and
                    then called it the floor; the build gives 0.700.
                  - 1920x1080 draws **20** labels, which is the count the spec states: `Galactic
                    Centre` 1.000, `Empyrean Straits` 1.000, `Ryker's Hope` 1.000, `Odin's Hold`
                    1.000, `Norma Arm` 1.000, `Arcadian Stream` 1.000, `Izanami` 1.000, `Inner
                    Orion-Perseus Conflux` 0.873, `Norma Expanse` 0.700, `Trojan Belt` 1.000, `The
                    Veils` 1.000, `Newton's Vault` 0.963, `The Conduit` 1.000, `Mare Somnia` 1.000,
                    `Acheron` 1.000, `Formorian Frontier` 1.000, `Hieronymus Delta` 0.878, `Outer
                    Scutum-Centaurus Arm` 1.000, `Outer Arm` 0.700, `The Abyss` 1.000. Two of the
                    20 have left their centre, `Norma Expanse` and `Outer Arm`, and both draw at
                    the floor.

                  The `Galactic Centre` reads **0.761** and **1.000**, against the 0.76 and 1.00
                  the spec states. Five labels at 1280x720 hold their clearance by less than half a
                  percent, so the count at that viewport is decided at the tens of light years, as
                  the design says. The box widths come from a measurement of the page style in
                  Chromium and are written out in `src/app/labels.test.ts`.

                  A small region drawn over a widening frame is at full size, then between the
                  floor and 1, then not drawn, and its box lies inside its region in every frame it
                  is drawn.

- [x] 4.9 Draw a label at its scale: add the scale to `PlacedLabel`, apply it in the overlay
      rather than setting only `left` and `top`, and measure a name's box at the scale it is
      drawn at rather than caching one size per name. Verify with a unit test that a label
      placed at 0.7 reports a box 0.7 of the full one, and with a browser test that the drawn
      element is smaller.

      Measured: `PlacedLabel` carries the scale, the overlay sets `transform` with a
                  `top left` origin beside `left` and `top`, and the placement measures a name at
                  the scale under test. A label at 0.7 reports a box 0.7 of the full one, which is
                  what the transform draws. The browser reading of the drawn element belongs to
                  section 6.

- [x] 4.10 Remove the whole label memory: `LabelMemory` at `src/app/labels.ts:293`,
      `NO_LABEL_MEMORY` at :301, `PreviousLabels` at :284 and `HeldAnchors` at :287, together
      with the `memory` parameters at :342, :492 and :587 and everything that reads or writes
      them. Nothing is left holding state, so an empty type must not be left behind either;
      the lint does not catch an exported unused type. Verify the scenario `The placement
carries no state between frames`.

      Measured: `LabelMemory`, `NO_LABEL_MEMORY`, `PreviousLabels`, `HeldAnchors` and
                  every `memory` parameter are gone, and no empty type is left behind. A grep over
                  `src`, `e2e` and `tests` finds no definition and no caller of any of them. One
                  frame placed after a run of 100 different frames gives labels identical to the
                  same frame placed from a fresh start.

- [x] 4.11 Remove `MAX_LABELS` and the label-against-label overlap rule. Remove `LABEL_INSET`
      and the clamp in `labelBox`, so a box is centred on its anchor and never slid off it.
      Verify the scenario `More than twelve labels can show at once`, and a unit test that a
      box whose anchor sits near the frame edge is centred on the anchor.

      Measured: `MAX_LABELS`, the label-against-label overlap rule and `LABEL_INSET`
                  are gone. A frame in which 20 regions each have room draws **20** labels, none
                  overlapping. Every box is centred on its anchor: at the label view the middle of
                  every box equals the projection of its plane point to nine places, at both
                  viewports, and no two boxes overlap.

- [x] 4.12 Build the view-projection matrix once for a frame and reuse it for every
      projection the placement makes. `project` rebuilds it on every call, and the sweep this
      replaces avoided that deliberately. Verify with a unit test that placing one frame
      builds the matrix once.

      Measured: the frame builds one view-projection matrix and turns it into a plane
                  map, a 3 by 3 homography each way. A projection is then nine multiplications and
                  an unprojection is nine more, and the light years per pixel comes from the
                  Jacobian of the same map. A unit test spies on `mat4.multiply`, which
                  `viewProjectionMatrix` alone calls, and reads one call for a whole frame. The map
                  agrees with `project` and `planePoint` to one part in a thousand, including the
                  sign that says a point is in front of the camera.

- [x] 4.13 Fit the placement scratch buffers outside the timed window, so a resize cannot
      allocate inside a measurement. Verify with a unit test that a second call at the same
      viewport allocates nothing.

      Measured: the overlay fits the buffers before it starts the clock, and
                  `placeLabels` only checks them. The buffers follow the vertex count and not the
                  viewport, so a resize allocates nothing at all. A second frame at the same
                  viewport hands back the same arrays.

- [x] 4.14 Remove `sampleFrame`, `fitSampleBuffers`, `samplePointCount`, `SAMPLE_SPACING` and
      the per-frame sweep from `update()`, and replace `regionSampleCounts`,
      `regionSampleTotal`, `labelSampling` and `resetLabelSampling` in `src/app/main.ts` with
      the placement equivalents, and remove the helpers in `e2e/labels.spec.ts` that wrap the
      first two and the sampling reset. Delete the suites in `src/app/labels.test.ts` that
      cover the
      frame sweep, the candidate share, the mean-of-samples anchor, the placement order, the
      hysteresis and the held anchor. Verify by grepping for `sampleFrame` and finding no
      caller, that `pnpm test` passes, and that the measured window covers everything the
      labels cost the main thread.

      Measured: `sampleFrame`, `fitSampleBuffers`, `samplePointCount`,
                  `SAMPLE_SPACING`, `SampleBuffers`, `FrameSamples`, `labelCandidates`,
                  `chooseLabels`, `CANDIDATE_SHARE`, `HELD_SHARE`, `CARRIED_BONUS`, `LABEL_INSET`
                  and `MAX_LABELS` have no definition and no caller left in `src`, `e2e` or
                  `tests`. `regionSampleCounts`, `regionSampleTotal`, `labelSampling` and
                  `resetLabelSampling` are replaced by `regionLabelPlacements`, `labelPlacement`
                  and `resetLabelPlacement`, which carry the scale of every drawn label and the
                  mean, the worst and the work of the placement. The window the page times covers
                  the whole placement, which is everything the labels cost the main thread before
                  the elements move.

                  The suites that covered the frame sweep, the candidate share, the mean-of-samples
                  anchor, the placement order, the hysteresis and the held anchor are deleted.
                  `src/app/labels.test.ts` now holds 41 tests, all passing. In `e2e/labels.spec.ts`
                  the two helpers that wrapped the sample counts are gone with the sampling reset,
                  and the retired browser test `the camera keeps the label of the region it sits in
                  when it turns away` is deleted with them, because its body read the sample shares
                  the helpers gave and `tsc` covers `e2e`. Section 6.12 asks for that deletion.

                  In node the placement takes a mean of **0.028 ms** and a worst of **0.221 ms**
                  over 300 frames at 1280x720, and **0.021 ms** and **0.137 ms** at 1920x1080,
                  against a budget of 0.5 and 2 milliseconds. The tighter slide moves the mean by
                  0.001 ms. The browser reading belongs to
                  section 6.9. `pnpm lint` passes, `pnpm build` passes with a page chunk of
                  **112,484 bytes** against the limit of 130,000, and `pnpm test` gives 268 passed
                  with the 4 failures in `tests/region-views.test.ts` that section 5 owns.

## 5. The view-choosing fixtures

- [x] 5.1 Rewrite `nearestVertex` in `e2e/regions.spec.ts:99` to measure the distance to the
      nearest **segment**, and remove its `ring <= 12` give-up, which with 562 vertices can
      return infinity. Verify the scenario `A boundary is visible at medium zoom` still finds
      an away point whose exact re-check `awayClearance > 1000` holds, over the 200
      candidates `e2e/regions.spec.ts:140` slices.

      Measured: `nearestVertex` and its bucket grid are gone. The search now calls
                  `gapTo`, the exact distance to the nearest segment, which is what the two chosen
                  points are re-checked with. It reads 200 candidates by 288 offsets, which is at
                  most **57,600 readings over 439 segments**, and takes **87 milliseconds** in node
                  over the same data the page holds.

                  The search now takes the **clearest** pair over all 200 candidates and not the
                  first pair that holds. It gives a boundary point at `400.73, 0, -6413.24`, which
                  is **0 light years** from the drawn line, and an away point at
                  `2800.73, 0, -6413.24`, whose exact clearance is **2,400 light years** against the
                  1,000 the scenario asks for. The two sit at galactocentric radii of **32,311** and
                  **32,428**, inside the 400 light year band the search holds them to.

                  Why the vertex measure had to go, measured on the same set: the boundary point is
                  0 light years from the drawn line and **1,653 light years** from the nearest
                  vertex, so the old measure would have called it clear. The away point reads 2,400
                  to the nearest segment and **2,914** to the nearest vertex. The worst case is the
                  middle of segment 484: 0 light years from the line and **7,485** from the nearest
                  vertex.

- [x] 5.2 Rewrite `clearanceFrom` in `tests/region-views.ts` to measure to segments rather
      than to vertices, and check every place it is used as a guard that nothing else of the
      boundary comes near the middle of the frame.

      Measured: `clearanceFrom` walks every segment of every chain and takes the
                  distance to the nearest one the caller does not exclude. It is used three times,
                  and every use is a guard on the frame of a reading:

                  - The crossing: the reading takes a row 40 CSS pixels wide, and the guard asks for
                    60 CSS pixels. The chosen view holds **1,650.4 light years**, which is **513 CSS
                    pixels**.
                  - The corner: the guard asks for half the diagonal of the frame, **588.5 light
                    years** at a zoom of 500 over 1280x720, so no other part of the boundary is drawn
                    anywhere in the frame. The chosen view holds **1,655.2 light years**, which is
                    **2,064 CSS pixels**. Only the two segments that meet at the bend are excluded,
                    so the rest of the same chain counts and a chain that folds back over its own
                    bend fails the guard. This replaces the `NEIGHBOUR_ARC_LY` fold test.
                  - The long segment: the same half-diagonal guard. The chosen view holds **7,461.8
                    light years**.

- [x] 5.3 Rewrite `findSharpCorner` in `tests/region-views.ts` for the new set: raise
      `BEND_TURN_DEGREES` from 30 to 60, which is what the modified join scenario needs; and
      replace the neighbour and straight-run tests that assume close vertices —
      `NEIGHBOUR_ARC_LY` of 60, the 30 light year fold test at line 320, the 40 to 200 light
      year straight-run window at lines 331 to 334, and the run floor at line 340 — with
      tests measured along segments. Verify `tests/region-views.test.ts` passes and update
      the constants it pins, including its `turn >= 30` assertion and its walk of `bendLine`
      as a run of consecutive vertices.

      Measured: a bend is now one vertex, and the turn is the angle between the segment
                  that arrives and the segment that leaves. The set holds **219 vertices that turn by
                  60 degrees or more**, so the search has a wide choice.

                  The chosen view is **chain 97, vertex 438**, at `-7643.22, 0, 41529.70`, zoom 500,
                  yaw 0, pitch 89. The two segments meet at **98.29 degrees**. They are **1,655** and
                  **3,368 light years** long, so both run far past the frame, which is 1,026 by 577
                  light years. The bend sits at the centre of the frame.

                  The sharpest corner in the whole set is **109.0 degrees**, at chain 67 vertex 322,
                  and the search refuses it: its frame sits on the core bulge at a corrected surface
                  density of **6.90e6**, which is 31 times the **2.23e5** the committed width reading
                  works over, and a saturated frame cannot read as lighter under the core of the
                  line. The chosen frame reads **7.14e4**, under the ceiling of 3e5.

                  `bendLine` is no longer a run of vertices. It is three points: a point **19.25
                  light years** back along the segment that arrives, which is 24 CSS pixels, the
                  vertex itself, and a point 19.25 light years forward. The line is straight between
                  its vertices, so three points hold the whole 8 CSS pixel join reading. The test
                  reads that the middle point is the vertex and that the two ends lie on the two
                  segments, one on each, rather than walking neighbouring vertices.

                  The straight run is a part of the longer of the two segments, from **48 to 240 CSS
                  pixels** from the bend, which is 38.5 to 192.5 light years. It is **154 light
                  years**, which is 192 CSS pixels, against the 30 the test asks for. Its two ends
                  project to **600.6, 387.4** and **442.3, 497.7** in the 1280x720 frame, both well
                  inside it. The old 40 to 200 light year window and the 30 light year run floor are
                  gone with the run of close vertices they measured.

                  The pinned `turn >= 30` assertion is now `turn >= 60`.

- [x] 5.4 Check whether `findVerticalCrossing` still finds a chain crossing the frame within
      5 degrees of vertical from a set of 562 vertices, and rewrite it against segments if it
      does not. Verify by reading back the view it chooses.

      Measured: the search **does** still find a crossing, and it does not return NaN.
                  The NaN in the failing test came from the pinned constants and not from the
                  search: `VERTICAL_CROSSING.from` was 22256, past the 562 vertices the new set
                  holds, so `positions[from * 3]` read `undefined`. The search itself was rewritten
                  only where it measures clearance, which now reads segments.

                  The chosen view is **chain 38, vertices 169 to 170**, one straight segment of
                  **3,306 light years**. The cursor sits at its middle, `400.73, 0, 10266.86`, at a
                  zoom of **2,004** light years, yaw 0, pitch 89. The segment stands at **0.000
                  degrees from the vertical** on the screen: it runs along `z`, so a yaw of 0 stands
                  it upright exactly. Its two ends project to `640.0, 881.8` and `640.0, -147.0` in
                  a 1280x720 frame, so the chain runs down the middle column and leaves the frame at
                  the top and at the bottom, and the reading row across the middle cuts it square.
                  The clearance is **1,650.4 light years**, which is 513 CSS pixels.

                  Longer runs exist — the longest is 11,677 light years — but every run over 3,306
                  light years sits at a galactocentric radius of 39,805 or more, past the 16,000 the
                  brightness guard allows, or in a frame brighter than the ceiling. The chosen run is
                  the longest one inside the disc.

- [x] 5.5 Add a search for a segment longer than 10,000 light years and a view at 500 light
      years in which it crosses the whole frame with both ends outside it. Verify the chosen
      view in `tests/region-views.test.ts` and carry the constants into `e2e/region-views.ts`.

      Measured: `findLongSegment` takes the longest segment first. The set holds **3
                  segments over 10,000 light years**: 14,970, 11,677 and 11,565.

                  The chosen view is **chain 109, segment 484 to 485**, which is **14,970.45 light
                  years**, the longest in the set. The cursor sits on the segment at
                  `29080.99, 0, 56071.12`, at the closest zoom of **500** light years, yaw **134.6**,
                  pitch 89. The segment lies at **89.9993 degrees from the vertical**, which is
                  0.0007 degrees from flat, so it runs from the left edge of the frame to the right
                  edge. Its two ends project to `x = 9,945.4` and `x = -8,723.8` at `y = 360` in a
                  1280x720 frame, and both are in front of the camera, so the drawn line crosses the
                  whole width and the reading meets it at the left, the middle and the right.

                  Both ends sit **7,462** and **7,509 light years** from the cursor, which is 7.3
                  times the width of the frame. The clearance is **7,461.8 light years**, so nothing
                  else of the boundary is drawn in the frame. The constants travel to
                  `e2e/region-views.ts` as `LONG_SEGMENT`.

                  A finding to record: the three searches now share a brightness guard,
                  `DISC_DENSITY_CEILING` of **3e5** corrected surface density over the frame. The
                  committed width reading works over a frame of **2.23e5**, and the core bulge
                  reaches **8e6**. The ceiling sits a little over the brightest frame the searches
                  choose, **2.50e5** at the crossing, and far under the next candidate, **1.47e6**,
                  so no view rests on a near tie. Without it the crossing would open at a frame 6.6
                  times brighter than the committed reading and the corner would open on the core
                  bulge. The guard is a quality guard and not a requirement: no scenario asks for it.

## 6. Browser tests

Every reading below comes from the hardware renderer the dev container passes through:
`ANGLE (NVIDIA, Vulkan 1.4.341 (NVIDIA NVIDIA GeForce RTX 4080 (0x00002704)), NVIDIA)`.
`e2e/00-renderer.spec.ts` asserts it before the suite runs.

The scenarios that name a viewport sit in the block for that viewport. The three that
name none — `No label at the far view`, `The region the camera is inside is named at
every zoom` and `A region with nothing on screen carries no label` — follow the
preamble and now run at 1920x1080. The page grew one hook for this section,
`regionCentres`, which returns the centre and the clearance of every region as the
worker measured them.

- [x] 6.1 Verify the scenario `A label sits on the centre of its region`.

      Measured: at 1280x720 the `Galactic Centre` label sits **6.2 light years** from
                  its own centre, against the 200 the scenario allows. Its centre is at
                  `-364.18, 27440.45`. The centre projects well inside the frame in that view, so
                  the slide does not start and the label draws on the centre.

- [x] 6.2 Verify the scenario `A label lies inside its own region`, resolving the four corners
      and the middle of every label box through the coarse region grid.

      Measured: the frame draws **20 labels** at 1920x1080, and all **100 points** —
                  four corners and the middle of each box — resolve to the region the label names.

- [x] 6.3 Verify the scenario `A label never touches its boundary`, by intersecting every
      label box with the pixels the overlay changed between an on and an off frame.

      Measured: at 1280x720 the overlay changes **43,722 pixels** of the frame, and
                  **not one** of them falls inside any of the 14 label boxes. The whole frame is
                  read twice inside the page and compared there, so the test moves counts rather
                  than four megabytes of pixels.

- [x] 6.4 Verify the scenario `No two labels overlap`.

      Measured: no two of the 20 boxes at 1920x1080 overlap. The old assertion
                  `labels.length <= 12` is gone: it is the cap this change removes, and a measured
                  build draws **14** labels at 1280x720 and **20** at 1920x1080.

- [x] 6.5 Verify the scenario `The region under the middle of the frame is named`.

      Measured: the region under the middle of the frame is the `Galactic Centre`, and
                  it carries a label at a scale of **0.761** at 1280x720. The spec says 0.76.

- [x] 6.6 Verify the scenario `The region the camera is inside is named at every zoom`,
      including the closest distance, 500 light years, where the `Inner Orion Spur` centre is
      about 4,100 light years away and behind the camera at about 45 percent of yaws, so the
      slide is what is under test. At 1,000 the centre still projects inside the frame and
      the label draws at full size on the centre.

      Measured at 1920x1080, at `#c=0,0,0&p=35&y=0`: the `Inner Orion Spur` label is on
                  the page and inside the viewport at all five distances. It draws at **1.000** at
                  20,000, 10,000, 4,000 and 1,000 light years, and at the **floor, 0.700**, at 500,
                  which is the slide holding the label on the page after the centre leaves the
                  frame.

- [x] 6.7 Verify the scenario `A label moves with the camera and does not snap` in **both**
      views, reading the drawn position of the label in CSS pixels each frame against the 12
      pixel bound and the lower bound that it moves at all. Record the measured worst move in
      each view, because the slide term of that bound is measured rather than derived.

      Measured at 1920x1080 over 120 turns of 0.1 degrees, reading the drawn box of the
                  `Inner Orion Spur` label in every frame. The label is on the page in all 121
                  frames of both views.

                  - `#c=0,0,0&d=2000&p=35&y=0`, where the centre projects inside the frame: the
                    drawn position moves **1.382 to 1.565 CSS pixels** a frame. The unit
                    measurement recorded under task 4.5 is 1.559.
                  - `#c=0,0,0&d=500&p=35&y=0`, where it does not and the slide runs: **2.000 to
                    2.641 CSS pixels** a frame. The unit measurement recorded under task 4.5 is
                    2.643.

                  Both views hold the 12 pixel bound with a factor of more than 4, and neither ever
                  leaves the label unmoved, so the slide adds about 1.1 CSS pixels to the 1.6 the
                  camera carries a fixed plane point.

- [x] 6.8 Verify the scenario `A label falls to the floor scale before it leaves`. Verify the
      four reasons themselves with unit tests, one case each, as task 4.7 says. Record how
      many of the pans you run show a label leaving and returning; a measured build shows two
      of 168, and the artifacts say that is allowed rather than a fault. Count a pan that
      starts with the label on the page, loses it and gets it back; a counter that only sees
      the label appear misses that case and reports one.

      Measured at 1920x1080: **168 pans**, the 42 regions in four directions, each one
                  starting on the region's own centre at a zoom of 2,000 light years and stepping
                  100 light years a frame. A pan ends when the label is off the page and a 32 pixel
                  screen sweep of the coarse region grid finds no part of the region, which is the
                  scenario's own stop and reads nothing the label code made.

                  **160 of the 168 pans** take the region off the screen. The other **8** reach the
                  model bounds first: the cursor is held inside them, so the camera cannot pan
                  further and the region stays on the screen. Those 8 carry no reading and the test
                  says so rather than counting them.

                  The largest scale a label ever left the page from is **0.7023**, against the floor
                  of 0.700 and the 0.01 the scenario allows. The artifacts quote 0.701.

                  **4 of the 168 pans show a label leaving and returning**, against the two of 168
                  the artifacts said before they were corrected: `Arcadian Stream` panning in `-z`,
                  `Mare Somnia` in `-x`, `Aquila's Halo` in `-z` and `Kepler's Crest` in `+x`. The
                  artifacts named `Mare Somnia` and `Hawking's Gap`, from a different pan:
                  a run of the same 168 pans at a zoom of 20,000 light years and a step of 100 gives
                  **2 returns**, at `Newton's Vault` and `Sanguineous Rim`. The count therefore
                  depends on the pan and not on the placement, which is what the spec says when it
                  calls a return allowed rather than a fault. Every return leaves and comes back at
                  the floor scale.

                  The four reasons carry their unit tests already, in `the four reasons a label is
                  not drawn` at `src/app/labels.test.ts:1176`, one case each: the camera below the
                  plane, a region with nothing on screen, no point of the segment holding the box in
                  the frame, and the anchor refused by the region test or by the size test. A fifth
                  test walks four views and checks no sixth reason reaches the drawing step.

- [x] 6.9 Verify the scenario `The placement stays inside its budget` at 1920x1080 over 300
      frames, against 0.5 milliseconds mean and 2 milliseconds worst. Repeat the run enough
      times to state a range rather than one reading, and record the range in this file.

      Measured over **five runs of 300 frames** at `#c=15,0,25895&d=20000&p=35&y=0`:

                  | Run | Mean, ms | Worst frame, ms |
                  | --- | -------- | --------------- |
                  | 1   | 0.0663   | 0.400           |
                  | 2   | 0.0473   | 0.200           |
                  | 3   | 0.0450   | 0.200           |
                  | 4   | 0.0473   | 0.200           |
                  | 5   | 0.0420   | 0.100           |

                  The mean runs **0.0420 to 0.0663 ms** against the 0.5 bound, and the worst frame
                  **0.100 to 0.400 ms** against the 2. The old bounds of 2 and 4 are gone. The
                  worst-frame readings step in 0.1 ms because the browser rounds `performance.now`
                  to that, so the worst frame is read to one step and not more.

- [x] 6.10 Verify the scenario `A join is not brighter than the line` at a vertex of at least
      60 degrees. This is the drawing scenario most likely to fail, because the ribbon has
      never been asked to hold a right angle.

      Measured at chain 97, vertex 438, where the two segments meet at **98.29 degrees**:
                  the largest change over the 8 CSS pixels around the corner is **0.30198**, and the
                  largest change on a straight run of the same chain in the same frame is
                  **0.30674**. The corner is therefore **not** brighter than the line, with 1.6
                  percent to spare. **27 pixels** lie on the drawn line inside the corner and
                  **none** of them is unchanged, so the join shows no gap either. The ribbon holds
                  the right angle the simplified line keeps.

- [x] 6.11 Verify the scenario `A long segment holds its width across the frame` on a segment
      longer than 10,000 light years at a zoom of 500 light years.

      Measured on `LONG_SEGMENT`, chain 109 segment 484 to 485, **14,970.45 light
                  years**, at a zoom of 500 light years and 1280x720. The segment runs 0.0007
                  degrees from flat, so a column of pixels cuts it square. The drawn run is **4.0
                  CSS pixels** at each of the three columns, x = 64, 640 and 1216, so the three
                  agree exactly and each is 4 within 1. Both ends of the segment sit more than 7,000
                  light years outside the frame.

- [x] 6.12 Delete the retired browser test `the camera keeps the label of the region it sits
in when it turns away` at `e2e/labels.spec.ts:170`, which asserts label sets from
      measured sample shares of 91.3, 7.5 and 1.2 percent. Nothing produces those shares after
      this change. Verify `pnpm test:e2e` holds no reference to them.

      Verified: the test is gone, and a grep over `e2e/` finds no `regionSampleCounts`,
                  no `regionSampleTotal` and none of the three shares.

- [x] 6.13 Verify the scenario `A near region is named in an oblique frame`.

      Measured at 1280x720 at `#c=0,20000,0&d=20000&p=5&y=0`, the cursor 20,000 light
                  years above the plane: **7 regions carry labels**, against the four the scenario
                  asks for; the artifacts said 6 before they were corrected. Every one of the 7 names
                  a region the test finds on the screen for itself. The frame shows **34 regions** by
                  an 8 pixel sweep of the coarse region grid, against the 19 the artifacts say; the
                  sweep and its spacing are the test's own, so the two counts are not measured the
                  same way, and the spec now says so rather than quoting one of them.

- [x] 6.14 Confirm the scenario `The switch removes both parts` at `e2e/regions.spec.ts:554`,
      which asserts at least one label with the overlay on and none with it off, at the same
      view the label scenarios use. It is the untouched scenario the new placement most
      exposes, because it fails if the placement draws nothing at that view.

      Confirmed, unchanged. The new placement draws 14 labels at that view and 1280x720,
                  the frame differs with the overlay off, and no label is left on the page.

- [x] 6.15 Confirm the scenarios `No label at the far view`, `Nothing at the far view`,
      `A boundary is visible at medium zoom`, `The boundary still draws at the closest zoom`,
      `The line is four CSS pixels wide and two-toned`, `A region with nothing on screen
carries no label`, `Main thread stays responsive` and `The coarse region grid resolves
known positions` all still pass. Do not retake the committed baseline image.

      Confirmed, all eight. `A boundary is visible at medium zoom` reads **0.5171** on
                  the line against **0.2288** away from it, a lift of **0.2882** against the 0.05
                  the scenario asks for, and with the overlay off the same two points differ by
                  **0.0039**, which is a fourteenth of the lift. `The line is four CSS pixels wide and
                  two-toned` reads one run of 4 device pixels at a device pixel ratio of 1, lighter
                  in the middle than at both ends. `A region with nothing on screen carries no
                  label` now runs at 1920x1080 and finds one region on the screen, `Inner Orion
                  Spur`, with one label. `Main thread stays responsive` reads a longest task of 0 ms
                  and the scene data ready after 2,175 ms. `The coarse region grid resolves known
                  positions` is a unit test and passes.

                  The baseline image was not retaken. `the default view matches the baseline image`
                  passes against the committed
                  `e2e/look.spec.ts-snapshots/default-view-chromium-gpu-linux.png`, and the suite
                  never ran with `--update-snapshots`.

                  One stale comment section 5 left is fixed: `e2e/regions.spec.ts` said "The
                  smoothed boundary does not read as a staircase", which this change makes untrue.
                  It now reads "A line with few vertices and no invented corners does not read as a
                  staircase", which is the sentence the modified requirement carries.

## 7. Records

- [x] 7.1 Replace the phase 2 paragraphs in `docs/roadmap.md` that record the three smoothing
      stages, the turn bounds and the 68,672 vertices, **and** the paragraphs at lines 198 to
      217 that record the label sweep, the 1 percent candidate share, the half-share hold,
      the 1.2 order bonus, the mean-of-samples anchor, the held anchor and the behind-camera
      negation. Verify by reading the file back for any remaining reference to a smoothing
      pass or to the sweep.

      Done. The boundary bullet now records one simplification at a 190 light year
                  tolerance against the asserted bound of 200, the two-way departure, the precision
                  and recall corner figures, the 562 vertices and 439 segments at 6.586 KiB, and the
                  corner that two chains share without a store. The label bullets now record the
                  centre of largest clearance, the distance transform and its downsample, the four
                  placement steps, the two-term clearance read and the required clearance. They also
                  record what is gone: the sweep, the 1 percent candidate share, the half-share hold,
                  the 1.2 order bonus, the mean-of-samples anchor, the held anchor, the 12 label cap
                  and the label-against-label overlap rule. The roadmap now records that **the
                  behind-camera rule is back**, because the placement projects world points again. It
                  used to record it as a rule `close-zoom-stars-and-regions` was able to delete.

                  Read back: a search over `docs/roadmap.md` for `smooth`, `sweep`, `sample`,
                  `68,672`, `68,549`, `804.75`, `candidate share`, `held anchor`, `hysteresis`,
                  `MAX_LABELS`, `centroid` and `1 percent` leaves no stale reference. The hits that
                  remain are the phase 1 point cloud samples, the `smoothstep` open question of phase
                  2.1, and the new text, which names the removed rules as removed. The zoom band
                  bullet said `region-boundaries-and-labels` draws a smooth line; it now says the line
                  holds few vertices and invents no corners, which is the sentence
                  `e2e/regions.spec.ts` carries. The phase 2 heading gains this change, and the file
                  date moves to 2026-09-10.

- [x] 7.2 Record the measured figures in this file: the segment count, the vertex count, the
      count shorter than 500 light years, the longest segment, the two-way departure sampled
      at 10 light years, the precision and recall corner figures, the per-region clearances,
      the worker build time, and the placement budget range, each against its bound.

      Every figure below comes from the `Measured:` block of the section that produced it.
                  The section is named in brackets.

                  **The set.** **439 segments**, of which **5** are shorter than 500 light years,
                  against the bound of at most 20 (1.9). The longest segment is **14,970 light years**
                  (1.9); section 5.5 reads the same segment as 14,970.45, which is the same figure to
                  more places. The set holds **562 vertices** in **6.586 KiB** over 123 chains,
                  against the bound of 300 to 2,000 vertices (1.9).

                  **The departure**, walked along both lines at a 10 light year step: **185.9** light
                  years drawn to traced and **189.8** traced to drawn, against the bound of 200 (1.5).

                  **The corners.** Precision: **227 of 235** vertices that turn by more than 20 degrees
                  sit at a traced node that also turns by more than 20 degrees, which is **96.6
                  percent** against the bound of 90 (1.7). The worst invented turn is **30.6 degrees**
                  and the largest turn in the set is **109.0 degrees** (1.7), which section 5.3 reads
                  again at chain 67 vertex 322. Recall: **221 of 221** places where the traced boundary
                  turns by more than 60 degrees carry a vertex within 500 light years that turns by
                  more than 40 degrees, which is **100 percent** against the bound of 75 (1.8). The
                  negative control against the smoothed polyline this change removes covers **0 of the
                  same 221 places**, because the largest turn anywhere on that polyline is 14.3
                  degrees. The check can therefore fail.

                  **The per-region clearances**, in light years (2.4): `Galactic Centre` 2,361,
                  `Outer Orion-Perseus Conflux` 2,466, `Norma Arm` 2,467, `Outer Orion Spur` 2,605,
                  `Empyrean Straits` 2,648, `Inner Scutum-Centaurus Arm` 2,778, `Ryker's Hope` 2,843,
                  `Inner Orion-Perseus Conflux` 3,250, `Perseus Arm` 3,287, `Orion-Cygnus Arm` 3,299,
                  `Izanami` 3,300, `Temple` 3,306, `Arcadian Stream` 3,315, `Odin's Hold` 3,506,
                  `Elysian Shore` 3,643, `Newton's Vault` 3,803, `Sanguineous Rim` 3,849,
                  `Aquila's Halo` 4,117, `Vulcan Gate` 4,133, `Trojan Belt` 4,183, `Norma Expanse`
                  4,516, `The Conduit` 4,524, `Lyra's Song` 4,627, `The Veils` 4,767, `Hawking's Gap`
                  4,887, `Inner Orion Spur` 4,954, `Xibalba` 4,962, `Outer Arm` 4,963,
                  `Achilles's Altar` 4,972, `Hieronymus Delta` 5,123, `Sagittarius-Carina Arm` 5,668,
                  `Formorian Frontier` 5,680, `Dryman's Point` 5,793, `Kepler's Crest` 5,793,
                  `Tenebrae` 5,922, `The Abyss` 5,991, `The Void` 6,021, `Formidine Rift` 6,141,
                  `Mare Somnia` 7,028, `Outer Scutum-Centaurus Arm` 8,302, `Errant Marches` 8,323,
                  `Acheron` 8,496. The range runs from **2,361** to **8,496** with a median of
                  **4,520**. Every one of the 42 centres resolves to its own region on the coarse grid
                  (2.5), so every clearance is measured inside the region it names.

                  **The worker build time.** The whole region worker run, with the distance transform
                  in it, takes **380 milliseconds** against the 5 second budget of the `Time budget`
                  scenario (2.6). The parts are the grid fill 135 ms, the chain trace 48 ms, the pack
                  7 ms, the distance transform **120 ms**, the per-region centres 64 ms and the coarse
                  grid 2 ms.

                  **The placement budget**, over five runs of 300 frames at 1920x1080 in the browser:
                  the mean runs **0.0420 to 0.0663 ms** against the bound of 0.5, and the worst frame
                  **0.100 to 0.400 ms** against the bound of 2 (6.9). The browser rounds
                  `performance.now` to 0.1 ms, so the worst frame is read to one step. Section 4.14
                  times the same placement in node over 300 frames and reads a mean of **0.028 ms**
                  and a worst of **0.221 ms** at 1280x720, and **0.021** and **0.137** at 1920x1080,
                  against the same two bounds. The two are not a disagreement: they measure different
                  hosts, and both hold both bounds.

                  **Two sections measure the clearance error, in different ways, and both stand.**
                  Section 2.2 reads the bilinear interpolation of the downsampled field against the
                  exact field at every one of the 4.11 million trace cells and finds it above by at
                  most **47.89 light years**. Section 4.4 reads the two-term clearance the placement
                  uses, at 117,989 points inside the 42 regions, and finds it above the exact field by
                  at most **34.63 light years**. Both sit under the 98.70 light years the two trace
                  cells of the required clearance allow.

                  **Readings the artifacts predicted wrongly, and now carry as measured.** The
                  planning artifacts quoted these from an earlier measurement. The build did not
                  reproduce them, so the artifacts were corrected to the measured value rather than
                  the measurement adjusted to the artifacts. Each entry gives the measured value
                  first and what the artifacts said before the correction.

                  - Precision **227 of 235**, 96.6 percent. The artifacts said 228 and 97.0 (1.7).
                  - The bilinear overshoot **47.89 light years**, 0.1213 of a block width. The
                    artifacts said 45.8 and 0.116, and derived them rather than measuring them; the
                    measurement sits above the derivation, so the derivation was wrong (2.2).
                  - The pixel form of the required clearance asks a median of **2.0036** times the
                    plane form at 1280x720 and **2.0792** at 1920x1080. The artifacts said 2.18 and
                    2.58. Over the footprint term alone the medians are 2.2111 and 2.3308, which is
                    where the older pair came from. The scenario's asserted bound moved from 2 to
                    1.5 with that correction, because a median of 2.0036 against a bound of 2 is a
                    margin of 0.18 percent (4.2).
                  - The field alone reads a median of **367.5 light years** low at the 42 centres (4.4).
                  - The placement draws **14 labels** at 1280x720 at the label view. The artifacts
                    said 13. 1920x1080 draws 20, which they had right (4.8, 6.4).
                  - **4 of 168 pans** show a label leaving and returning, at `Arcadian Stream`,
                    `Mare Somnia`, `Aquila's Halo` and `Kepler's Crest`. The artifacts said 2, at
                    `Mare Somnia` and `Hawking's Gap`. The same 168 pans at a zoom of 20,000 light
                    years give 2 returns, at `Newton's Vault` and `Sanguineous Rim`, so the count
                    depends on the pan and not on the placement, and no count is asserted (6.8).
                  - The largest scale a label ever left the page from is **0.7023**, against the
                    floor of 0.700 and the 0.01 the scenario allows. The artifacts said 0.701 (6.8).
                  - The oblique frame carries **7 labels**, against the four the scenario asks for.
                    The artifacts said 6 (6.13).

- [x] 7.3 Run `pnpm lint`, `pnpm build`, `pnpm test` and `pnpm test:e2e` and record that each
      passes, with the hardware renderer asserted rather than assumed.

      Measured, all four run in order on 2026-09-10 from a clean working tree:

                  - `pnpm lint` passes. `eslint .` reports nothing.
                  - `pnpm build` passes. `tsc --noEmit` reports nothing and `vite build` transforms 75
                    modules in 89 ms. The page chunk is **112.67 kB**, against the 130,000 byte limit
                    `tests/main-bundle.test.ts` holds, and `region-lines.worker` is 235.84 kB, so
                    `astro/codex-region-lookup` stays out of the page.
                  - `pnpm test` passes: **34 files, 279 tests, 0 failures**, in 4.33 s.
                  - `pnpm test:e2e` passes: **68 tests, 0 failures**, in 3.7 minutes, on one worker.

                  The renderer is asserted and not assumed. `e2e/00-renderer.spec.ts` runs first and
                  reports `ANGLE (NVIDIA, Vulkan 1.4.341 (NVIDIA NVIDIA GeForce RTX 4080
                  (0x00002704)), NVIDIA)`. The suite fails on a software renderer, so every browser
                  reading above comes from the hardware card.

                  This run reads the placement budget again, over its own five runs of 300 frames:
                  a mean of **0.0413 to 0.0650 ms** against the 0.5 bound and a worst frame of
                  **0.200 to 0.300 ms** against the 2. Section 6.9 records 0.0420 to 0.0663 and 0.100
                  to 0.400 from an earlier run. The two agree on the mean to about 0.001 ms; the worst
                  frame moves by one 0.1 ms step of `performance.now`, which is the resolution the
                  browser gives. The roadmap therefore records the mean as 0.04 to 0.07 ms and the
                  worst frame as 0.4 or less.

## 8. Review

- [x] 8.1 Run the implementation review gate: the `openspec-implementation-reviewer`
      subagent, read-only, given this change id. Record its verdict and every finding,
      including any not acted on and why. On BLOCK, fix and run it again.

      The gate ran twice.

          **Run 1: BLOCK**, one blocking finding and eight notes.

          The blocking finding: the scenario `The drawn size does not step with the clearance
          field` was not verified and could not be as written. The test that carried its name
          read the drawn scale and then only logged it; both its assertions were on the
          clearance read. The scenario is unsatisfiable by this design, because a moving anchor
          is a slid anchor, the slide stops at the first point whose floor-scale box fits, and
          no larger box fits there, so a moving anchor always draws at exactly the floor. The
          design already stated that fact, so the two artifacts contradicted each other. Acted
          on: the scenario is rewritten as `The clearance read does not step across a cell of
          the field`, the spec says why the drawn scale cannot carry it, the test is renamed to
          what it checks, and the drawn scale it used to only log now carries an assertion that
          the largest scale is at most the floor.

          The eight notes, all acted on: the spec sentence that still said the slide runs to one
          CSS pixel; the footprint ratio bound, which the gate agreed should move from 2 to 1.5;
          `DISC_DENSITY_CEILING`, now recorded in the design with the three scenarios whose view
          it decides; `boxesOverlap`, a dead production export, moved into the test; the
          corner-misses-the-plane test, which passed even with the guard deleted and now builds
          a region only a missed corner can reach; a conditional assertion that checked nothing
          on its other branch; the record error that put `Norma Expanse` at 0.709; and the
          ragged last block of the downsample, now commented.

          **Run 2: APPROVE WITH NOTES**, eight notes, no blocking finding.

          The gate closed the first run's block by mutation rather than by reading: it swapped
          the bilinear read for a nearest-cell read and the test failed, `expected 198 to be
          less than 99`. It also confirmed the corner test fails with the horizon guard removed,
          and that the recall bound is not vacuous — at a fit tolerance of 1900 instead of 190,
          recall falls to 34 of 221 and the test fails.

          Seven of the eight notes are acted on: the stale divergence record in this file, which
          claimed the build disagreed with its own specs in seven places after the specs were
          corrected; the proposal's "loses three labels", which is four; the 185.8 and 368
          roundings, now 185.9 and 367.5 in every artifact and in the roadmap; the Impact list,
          which named `regions.ts` for types that went to `types.ts` and never named the new
          module `clearance.ts`; a tautological assertion running 400 times; work counters that
          reported the previous frame when a frame placed nothing; and the `pairs` array, which
          the determinism and transferability tests skipped.

          The eighth needs no action and the gate said so: the recall negative control is not in
          the tree, because task 1.8 ran it against the smoothed polyline before task 1.3 deleted
          that code. The gate checked the bound is not vacuous by mutation instead.
