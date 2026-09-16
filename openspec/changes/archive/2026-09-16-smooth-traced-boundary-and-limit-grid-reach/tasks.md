## 0. The claims this change falsifies

Each of the three faults overturns a claim the tree states in many places. Fault 1: the traced
set **departs from the data by 0**, it **keeps every 90 degree turn**, and the band's **width
hides the staircase**. Fault 2: **a level reaches 100 of its own lines and no further**. Fault
3: **the target drifts at 120 CSS pixels a second**.

This section is the sweep. It runs **first**, and tasks 3.3, 6.6 and 6.7 then act on what it
finds rather than on a list written by hand. Enumerating the sites by hand is what missed them
three times over.

The sweep runs over the **delta as well as the tree**. A stale claim in the delta ships as a
requirement, which is worse than a stale comment, and the review of this plan found one: the
requirement "The boundaries draw as one wide soft band over a smoothed line" retired the claim
that the band's width hides the raster and then restated it, in the same numbers, twelve
paragraphs down. Task 0.1a is that half of the sweep.

- [x] 0.1 Run each grep below over `src e2e tests docs README.md`, read every hit, and either
      update it or record why it stays true. This task is done when each grep returns only the
      hits named here as true.
      - `"90 degree"` — task 3.3 names the stale ones.
        `src/scene-data/region-lines.ts:421` stays: it is about the smoothed set's corner round.
      - `"staircase"` — **three sites stay and the sweep records why.** `docs/roadmap.md` 409,
        417 and 611 sit inside bullets that open "Reversed", "Reversed again" and "Phase 5.1
        removes this fade". Each records what an **earlier phase** decided, at a time when the
        `accurate` set really was the lattice staircase, so each is true as history and SHALL
        NOT be rewritten. Rewriting a phase record to match the present would delete the
        reason the present is what it is. Only the present-tense description of the set, at
        line 374, is stale, and task 6.6 rewrites it. Stale in `src/app/create-map.ts:83`, `src/render/region-pass.ts:16` and
        `:59`, `src/scene-data/region-lines.ts:524`, `e2e/region-views.ts:11`,
        `tests/region-views.ts:14`, `tests/region-views.test.ts:90`, `README.md` 151, 166 and
        176, and `docs/roadmap.md` 374, 398, 406 and 595. It stays only where it names the raw
        **trace**, which is still a staircase: `src/scene-data/region-lines.test.ts` 401, 402
        and 607, and `docs/roadmap.md` 185, 196 and 656.
      - `"departs from the trace by 0\|from the region data by 0"` — stale in
        `src/app/create-map.ts:89` and `src/scene-data/region-lines.ts:524`. Nothing here stays
        true. `docs/roadmap.md` 375 to 376 says the same thing, but the phrase wraps over the
        two lines so no grep of one line reaches it; the `22,718` grep below does, and task 6.6
        names it.
      - `"22,718\|266\.23"` — the traced set's old vertex count and its KiB, stale in
        `e2e/frame-budget.spec.ts:229` and `docs/roadmap.md:376`. Write the readings of task 2.5.
      - `"lattice node"` — stale in `e2e/region-views.ts:7`, `tests/region-views.ts` 6 and 764,
        and `docs/roadmap.md:738`. It stays in `src/scene-data/region-lines.ts` 79 and 94, which
        describe the trace itself.
      - `"100 of its own lines\|100 lines\|fades to nothing at 100"` — fault 2. Stale in
        `src/render/grid-pass.ts:199`, the doc comment of `gridDistanceFade`, which after task
        4.2 holds for the **numbered** level alone, and in `docs/roadmap.md:494`. It stays at
        `src/render/grid-pass.test.ts` 256 and 257, whose scenario does not move. Those four are
        every hit the pattern returns. `GRID_FADE_LINES` at `src/render/grid-pass.ts:43` and the
        formula at 202 do not match any of the three alternatives and are **not** hits; they are
        named here only because they do not move either.
        Task 4.1 says `gridDistanceFade` is unchanged; that is the **function** and not its
        comment.
      - `"screen axis"` — fault 1. Stale in `e2e/regions.spec.ts:1133`, which says both arms of
        the traced corner run along a screen axis "so a pixel row lands on the middle of each
        and the sampling loss of the scenario above is 0", and asserts the bound with no
        tolerance at line 1136. After task 1.3 neither arm does, which is why **task 3.3** gives
        that scenario the half pixel allowance the join scenario carries; the comment SHALL be
        restated with it. Nothing here stays true.
      - `"120 \* seconds\|120 CSS pixels a second"` — fault 3. Stale in `docs/roadmap.md` 703
        and 705. Nothing here stays true. `src/app/labels.ts` and `src/app/labels.test.ts` name
        `TARGET_DRIFT_PIXELS` rather than the figure, so task 5.1 moves most of them; task 5.3a
        names the one test that the rename does **not** carry.

      This task **finds** the sites and records the reading; several of the edits belong to a
      later task, which is why the sweep runs first. The vertex count and its KiB are written by
      task 2.5, the "90 degree" sites by 3.3, the `gridDistanceFade` comment by 4.2, and the
      cap by 5.1. Check this task off when every site is found and assigned, and confirm the
      seven greps at task 6.9, once the later tasks have run.
- [x] 0.1a Run the same seven greps, **and an eighth for `"screen axis"`**, over
      `openspec/changes/smooth-traced-boundary-and-limit-grid-reach/specs`, and read every hit
      in the delta itself. A delta both **retires** a claim and **restates** the requirement
      around it, so the same words appear in both roles a few hundred lines apart. For each hit
      decide which role it is in, and verify that no requirement retires a claim in one
      paragraph and rests on it in another. Pay particular attention to `"staircase"`: the drawn
      `accurate` set carries none after task 1.3, so every use of the word in the delta SHALL
      name either the **untouched trace** or the claim being retired, and never the drawn line.

      **A pattern list is not the whole of this task.** Eight patterns are eight claims someone
      thought of; the two the review gate caught were found by reading, not by grep. So also
      read every sentence of the two deltas that **describes the geometry of the drawn
      `accurate` set** — its turns, its segment lengths, how its arms lie against the pixel grid,
      what it departs from — and check each against the set task 1.3 builds. The set is smoothed,
      its median segment is 185 light years and no arm of it follows a screen axis; any sentence
      that assumes otherwise is carried over from the lattice set and is stale
- [x] 0.2 Update the host-facing documentation of `src/app/create-map.ts`, which states **both**
      overturned claims on the exported `RegionMode` type and `DEFAULT_REGION_MODE`: line 83
      calls `accurate` "the staircase the region data is", and lines 88 to 90 say it "departs
      from the region data by 0" and that "The band is now wide enough to hide the raster's
      staircase without moving the line". This is the text a host reads, and no other task
      reaches it. Verify no host API moved: the type, the default and every member keep their
      names and their meanings, and only the prose changes


## 1. The traced set is drawn through the edge midpoints

- [x] 1.1 Add `midpointChain(points)` to `src/scene-data/region-lines.ts`, the polyline
      through the midpoint of every unit edge of a chain with its two ends kept, and verify
      a unit test reads `n + 1` points for a chain of `n` nodes and that every interior point
      is the mean of the two nodes it sits between
- [x] 1.2 Add the four constants the design names, all in cells:
      `REGION_TRACED_SMOOTH_HALF_WIDTH = 4`, `REGION_TRACED_SMOOTH_PASSES = 2`,
      `REGION_TRACED_MOVE_CAP = 0.5`, `REGION_TRACED_SIMPLIFY_TOLERANCE = 0.05`
- [x] 1.3 Change `packTracedLines` to run the three stages of the design on each chain:
      `midpointChain`, then two passes of `capChain(averageChain(out, 4), midpoints, 0.5)`,
      then `simplifyChain(out, 0.05)`. It runs **no** `roundChain` pass, which is what
      separates it from `packRegionLines`. Verify the cap reads the **midpoint polyline** and
      not the pass before it, by a unit test that pushes one interior point and reads that the
      cap brings it back to half a cell of its own midpoint
- [x] 1.4 Keep `collapseChain` exported. After task 1.3 nothing in `src/` calls it, but it is
      what builds the **lattice polyline** that the unit scenarios of task 2 measure the new
      set against, so it moves from the packer to the tests rather than going. Verify
      `grep -rn "collapseChain" src` finds it only at its own definition and in
      `src/scene-data/region-lines.test.ts`
- [x] 1.5 Verify the build still costs the worker nothing measurable. Run
      `pnpm vitest run src/scene-data/region-lines.test.ts`, read the wall time of the
      `beforeAll` at line 55, which calls `fillRegionGrid`, `traceRegionChains`,
      `packRegionLines` and `packTracedLines`, and write it into the task list here. Confirm it
      is inside the 120 second timeout the `beforeAll` carries. Do not read the file's total
      time: its tests carry timeouts of 120, 240 and 300 seconds, so a total says nothing about
      the build.

      **The reading: 240, 242 and 262 milliseconds over three runs**, against the 120 second
      timeout. The `beforeAll` also builds the coarse grid, the flow field and the flow roots,
      so the figure is above the four calls the task names

## 2. The readings of the traced set

Every figure below is a **reading**. Run the test, read the number, and write it into every
place `proposal.md`, the spec deltas and `design.md` name it. Several of these readings sit in
requirement prose and not only in a scenario: the roughness figures and their CSS pixel forms,
the two departures, the vertex count and its KiB, and the sharpest vertex.

Three figures of the round comparison are **sample readings** and no task re-runs them, because
nothing in the tree renders a set offline. The delta names them at the paragraph under its round
comparison: the **9 of 255**, the mean of **0.030**, and the **92.61 degrees** of that
paragraph alone. They stay as the sample took them.

**The 92.61 is two different figures.** The one in the round comparison is the turn of the set
the sample built, frozen with the render beside it. The 92.61 named elsewhere in the same
requirement is a **live** reading of the sharpest vertex, and task 2.3 moves it. The delta says
so in as many words; do not let one edit carry the other.

**The rest of the round comparison is frozen too, and it is not in the delta.** The comparison
sentence at `proposal.md:84` and `design.md` 42 to 45 reads the same build the render did, so
every figure in it stays as the sample took it:

| Figure | Where | What it is |
| --- | --- | --- |
| 0.060 to **0.057** CSS pixels | `proposal.md:84`, `design.md:43` | the roughness median, with and without the round |
| 0.263 to **0.231** CSS pixels | `design.md:43` | the 90th percentile, the same two ways |
| 26.57 to **27.21** light years | `proposal.md:84`, `design.md:45` | the departure, the same two ways |

Each is a **pair from one build**, and only the sample built the rounded variant: task 1.3 runs
no `roundChain`, so nothing in the tree can produce the second figure of any pair. Re-measuring
the first figure alone would set a fresh reading against a figure from another build, which is
worse than leaving both. They are what task 2.2's converted reading is compared against.

**This is where the wrong number gets written.** The live readings have the same values as the
frozen ones today and do not have to tomorrow:

- **0.057** is the frozen median in CSS pixels at `proposal.md:84` and `design.md:43`, **and**
  the new set's live 90th percentile in **cells** at delta lines 69 and 178, which task 2.2
  re-measures. Two different readings, two different units, one number.
- **26.57** is the frozen departure at `proposal.md:84` and `design.md:45`, **and** the live
  departure task 2.1 re-measures, stated as 26.6 in the delta and elsewhere in the proposal.
- **0.060** is the frozen median in CSS pixels at `proposal.md:84` and `design.md:43`, **and**
  the CSS pixel form of the live median task 2.2 re-measures, at `proposal.md` 23 and 92,
  `design.md:357` and delta line 84, all written as 0.06. Four live sites, two frozen ones.

Read the unit and the sentence before writing, exactly as the delta already asks for the two
readings of 92.61.

The 22,908 is not a sample reading — `roundChain` doubles a chain in each pass, so it is
exactly four times the count task 2.5 measures, and task 2.5 moves it.

Four figures are **arithmetic on** these readings and not readings of their own, so they move
when the readings move. Name each when writing the readings back:
- "**9** light years further from the data than the lattice polyline", which is the departure of
  task 2.1 less 17.4, in `proposal.md`, `design.md` and the delta;
- "a **twelfth** of the vertices", which is 68,672 divided by the count of task 2.5, in
  `proposal.md` and `design.md`;
- "**22,908**", which is four times that count, in the delta's round comparison;
- "**10** light years nearer the data", which is the smoothed set's departure less the traced
  set's, both re-measured by task 2.1, in `proposal.md` and `design.md`;
The word "**improves**" at `design.md:43` is **not** in this list. Both figures it compares,
0.060 and 0.057, are frozen, so the word describes one build against another build of the same
sample and no live reading can turn it round. Leave it alone.

What can go wrong there is a different thing, and task 2.2 SHALL check it. The frozen 0.060 and
the live median are the same quantity on two builds, so if task 2.2's converted median is not
about 0.060, the comparison at `design.md:43` is a reading of a set the tree no longer builds
while the text around it describes the set the tree does build. **Convert before comparing**:
task 2.2 reads cells and the frozen figures are CSS pixels, at 4.616 CSS pixels to the cell. If
the two differ by more than a twentieth of a pixel, add one sentence at `design.md:43` naming
the measured figure beside the frozen pair, and do not overwrite the pair. The case for dropping
the round rests on the vertex count and on the 9 of 255, not on the direction of a twentieth of
a pixel, and it SHALL NOT be written as if it did.

Do not carry any other figure over from the proposal without the run that produced it.

- [x] 2.1 Add the unit scenario "The traced set stays near the data": the largest distance
      from a point of the drawn chain to the nearest edge midpoint, and to the lattice
      polyline. Verify both are at most 49.3494 light years and write both readings in. The
      proposal's sample read 26.6 and 30.6. Measure the smoothed set against the edge
      midpoints in the same test and write that reading into the requirement "The region
      overlay has three modes and starts on the traced set", which argues the default from it.
      The sample read 36.8
- [x] 2.2 Add the roughness measure to the test file: fit a straight line to every window of
      8 cells of arc by the smaller eigenvalue of the window's scatter matrix, and take the
      root mean square departure. Add the unit scenario "The traced set reads as a line" and
      verify the median is at most 0.03 cells and the 90th percentile at most 0.08, and that
      the same two readings over the lattice polyline are above 0.25. The sample read 0.013
      and 0.057 against 0.273 and 0.302. Measure the **smoothed** set in the same test and
      write that reading into the follow-up of `design.md` and into the proposal's table,
      which both compare against it today without any run behind them. The sample read 0.0074
      cells, which is 0.034 CSS pixels
- [x] 2.3 Add the unit scenario "The traced set keeps the corners the smoothed set removes"
      and verify the traced set's sharpest vertex turns by more than 25 degrees and by more
      than the smoothed set's, and that the smoothed set's is at most 20. The sample read
      92.61 and 14.30
- [x] 2.4 Add the unit scenario "The traced set holds the turn bounds of a line" and verify
      the whole set is at most 60 degrees for each 1,000 light years and no chain is above
      100. The sample read 33.08 and 82.43
- [x] 2.5 Rewrite the unit scenario "The traced set drops the straight runs" for the new
      vertex count, and verify the set holds between 4,000 and 12,000 vertices, fewer than
      the trace has nodes, and fewer than the smoothed set. The sample read 5,727 vertices.
      Write the KiB figure from the count rather than from the proposal, and write four times
      the count into the round comparison of the same requirement, which reads 22,908 today.
      Measure the set's **median segment length** in the same test and write it into the three
      places that use it to argue the search rewrite: the delta's traced corner bullet,
      `design.md` decision 4 and `proposal.md`. The sample read 185 light years
- [x] 2.6 Delete the unit scenarios "The traced set departs by nothing" and "The traced set
      keeps every turn", which the change removes with their requirement, and verify
      `grep -rn "departs from the traced boundary by nothing\|keeps every turn" src e2e tests`
      returns nothing. The first test is named for the whole phrase and not for the scenario
      title, so a pattern of "departs by nothing" matches nothing and would catch no leftover
- [x] 2.7 Verify the set is still deterministic and still transferable: run the unit
      scenarios "The set is deterministic" and "The set is transferable" and confirm both
      sets pass

## 3. The region view searches and the two browser corner scenarios

- [x] 3.1 Rewrite the traced corner search in `tests/region-views.ts` so every premise it
      holds is a length along the plane and none is the length of one segment. Four edits,
      each named by `design.md` decision 4:
      (a) read the turn over the read radius, the half width and `TRACED_REACH_PIXELS`, by
      the chord back to that radius and the chord forward to it, as `findSharpCorner` reads
      its bend over `JOIN_REACH_PIXELS`, and pass over a node whose window is short;
      (b) replace the clearance and the fold with **one** clearance, so
      `TRACED_NEIGHBOUR_ARC_PIXELS` and `TRACED_FOLD_REACH_PIXELS` go. It excludes the node's
      own **contiguous run**, walking out in each direction until the chain first leaves the
      clearance disc, and not a range of vertex indices; it requires everything else to stay
      outside that disc; it measures to the nearest point of a **segment** and not to the
      nearest vertex, which needs a tool that does not exist today: `clearanceFrom` reads
      vertices and takes a `keepOut` predicate, while `SegmentIndex.gapTo` measures to a segment
      and takes none. Give `SegmentIndex.gapTo` the `keepOut` parameter rather than making
      `clearanceFrom` segment-aware, so the vertex form stays for the searches that still want
      it. Make the parameter **optional**, because `findPointNearBothSets` calls
      `smoothedIndex.gapTo(point)` at `tests/region-views.ts:695` and does not want a keep-out;
      a required parameter turns up as a red type-check at task 6.1 instead of here. Its radius is **60 CSS pixels**, the larger of the two reading
      windows plus the half width, and not `CORNER_CLEARANCE_PIXELS`. The radius reading of
      task 3.4 marches its rays out to `halfWidth + 12`, which is 36 CSS pixels, further than
      the brightness reading's 30, so a disc of 54 would offer nodes at which the radius fit
      reads a foreign band as the edge. Verify the vertex form is gone by a unit test that
      moves one vertex of an excluded run without moving the line through it and reads that
      the search result does not change;
      (c) find the comparison run by `chordDeparture` against `STRAIGHT_TOLERANCE_LY`, as
      `findVerticalCrossing` finds its runs, keeping the run at least `JOIN_RUN_LEAST_PIXELS`
      long, so `TRACED_ARM_MARGIN_PIXELS` and the arm premise go;
      (d) take the **sharpest** holder in place of the first node turning exactly 90 degrees;
      (e) build the recorded `bendLine` from the **real vertices** between the back and the
      forward ends of the read window, as `findSharpCorner` does at `tests/region-views.ts`
      513 to 516, and not from the `along` helper at 851. `along` extrapolates along **one
      segment**, which held while a segment was long: the read radius is 30 CSS pixels, which
      is 320.8 light years, while the new set's median segment is 185, so `along` now reaches
      past the next vertex and records an arm that is off the chain. Both browser readings
      classify pixels against that polyline, so a wrong `bendLine` makes both of them read a
      line the map never drew. `TRACED_RUN_FROM_PIXELS` and `TRACED_RUN_SPAN_PIXELS` stay as
      they are; the three constants named below are the only ones that go. Edits (c) and (e)
      leave the `along` helper at line 851 with no caller, so delete it; `pnpm lint` at task 6.1
      finds it either way, and finding it here saves the round trip.
      Verify `grep -n "TRACED_ARM_MARGIN_PIXELS\|TRACED_FOLD_REACH_PIXELS\|TRACED_NEIGHBOUR_ARC_PIXELS" tests/region-views.ts`
      returns nothing, that the search returns a node, and that the node's turn is above **80**
      degrees, which is the floor task 3.4 verifies and the bound the radius scenario needs. If
      the re-run search returns a turn between 67.4 and 80 degrees, do **not** lower the floor:
      67.4 is where the radius error reaches the whole 2.0 CSS pixel bound, so a reading in that
      band means the corner is marginal and the answer is to report it, not to widen the gate.
      If any of the four searches returns nothing at all, stop and report it: every one throws
      on a miss, so a miss is loud, and a search that finds no view means a premise of this
      design is wrong.
      The sample read 1,172 holders and a sharpest turn of 88.47 degrees, and both are **indicative and not targets**: they move
      with details the design does not pin. Do **not** touch `findSharpCorner`
- [x] 3.1a Verify the rewritten search is not merely tuned to the new set: run it over the
      **lattice polyline** as well, which the packer no longer builds. Build it in the test as
      `packChains(grid, trace.chains.map((c) => collapseChain(chainPoints(c))))` — the grid is
      the first argument — so the search gets a whole `RegionLines`; all three functions are
      already exported and confirm it returns a corner there too, above the same 80
      degree floor. The sample read 16,266 holders and a sharpest turn of 102.53 degrees. A
      turn over a reach is not a turn at a vertex, so a lattice staircase reads past 90 over
      320.8 light years; do not assert 90
- [x] 3.2 Re-run all four searches of `tests/region-views.ts` and write **both** what they
      return into `e2e/region-views.ts`: the five counts, and the four recorded **views**. The
      delta says "Every view it holds SHALL be searched again", and a view is not a count. The
      five counts before this change were 23, 2, 81, 6 and 4,098. Write them into the **count
      table** of the requirement as well, not only into `e2e/region-views.ts`: three of its five
      rows move, and the only instruction that covered the table is the blanket one task 6.8(f)
      deletes. Verify
      `pnpm vitest run tests/region-views.test.ts` passes with the five counts asserted
- [x] 3.2a Re-measure the distance between the two sets at the view the browser scenario
      "Each mode draws its own frame" opens, at 1280x720 at a zoom of 12,000 light years, and
      write the reading into that scenario in place of the 2.56 CSS pixels it named for the old
      traced set. Verify the scenario still finds three different digests
- [x] 3.2b Re-measure how far apart the two drawn sets sit, and write the readings into the
      separation paragraph of "**The region overlay has three modes and starts on the traced
      set**", which is the requirement that gave a seventh and a twenty-third of a band and now
      carries "The separation of the two sets SHALL be re-measured". It is **not** in the band
      requirement. Both sets now depart from the lattice polyline, so the bound is two cells
      and not one and every figure there needs the run behind it
- [x] 3.2b1 Re-measure the reading "Above about 25,000 light years the two draw within 2 CSS
      pixels of each other", which sits one paragraph below the separation paragraph of "The
      region overlay has three modes and starts on the traced set". It is `46,157 / 25,000`
      under the one cell premise that the separation paragraph retires, so the range it names
      moves with the two cell bound. Write the measured range in
- [x] 3.2c Re-measure, on the drawn traced set, the longest **straight run** by chord
      departure against `STRAIGHT_TOLERANCE_LY`, and how many of its runs reach past 2,395
      light years, which is what scaling the comparison run by the band's growth would ask
      for. Write both into the paragraph of the region-view requirement that argues against
      scaling the search windows. It names 4,392 light years and 2, which are the longest
      single **segment** of the lattice polyline and a count of segments. A run by chord
      departure is not a segment, so both measures change, not only the set
- [x] 3.2d Restate the two places of "The boundaries draw as one wide soft band over a smoothed
      line" that the count table's new figures falsify:
      (a) the traced corner row of the table, which reads "nodes of the traced set" in this
      delta and "lattice nodes" in the base spec, and whose count the rewritten search changes;
      (b) the whole paragraph under the table, which argues that three of the four counts
      **fall** with the band's width. Only the **join** count belongs in that argument, because
      the join search reads the smoothed set, which this change does not touch. The other three
      clauses each break:
      - "the traced corner search 6 nodes of 10" — after task 3.1 that count rises, and it
        rises because the premises were rewritten. The sample read 1,172 holders;
      - "The two width counts do not move, because their clearance of 60 CSS pixels is far
        wider than the band" — one of the two counts straight runs **of the traced set**, which
        this change rebuilds, so it moves and the band's width does not explain it;
      - "the both-sets search 4,098 points of 4,605" — that search holds one candidate for each
        **traced segment**, and the set falls from 22,718 vertices to about 5,727, so the
        candidate pool falls about fourfold before the band is read at all.
      Give each of the three its own sentence, and label 2, 10 and 4,605 as readings of the set
      this change replaces
- [x] 3.2e Fix the three assertions of `tests/region-views.test.ts` that hold the premises task
      3.1 removes. Verify each and do **not** relax one to make the suite green:
      (a) line 337, `expect(TRACED_CORNER.turnDegrees).toBe(90)`, and the name of the test at
      line 331, "turns by 90 degrees at a vertex of the traced set";
      (b) line 344, the whole test "puts each arm at more than 72 CSS pixels", which asserts the
      arm premise task 3.1(b) deletes, and which SHALL be removed and not weakened. Its browser
      twin, `e2e/regions.spec.ts:1128`, asserts `TRACED_CORNER.turnDegrees` is 90 and moves the
      same way: the turn is now read over the read radius, so it becomes the measured turn under
      the 80 degree floor of task 3.4;
      (c) line 390, `.toBeGreaterThan(halfWidth + 20)`, which is 44 CSS pixels. Decision 4
      derives the disc as the larger reading window plus the half width, so the assertion SHALL
      be **tightened** to `toBeGreaterThanOrEqual(2 * halfWidth + 12)`, which is 60 at this
      scenario's 2,160 rows. Not `toBeGreaterThan`: the search premise reads "nothing else SHALL
      come **inside** the disc", so a node whose nearest foreign segment sits at exactly 60
      holds the premise and must hold the test.
      Write the derivation and not the number, so the assertion cannot drift from the search.
      If the re-run search returns a node whose clearance is under it, the search is wrong and
      the fix belongs in task 3.1;
      (d) line 368, `expect(run / perPixel).toBeGreaterThanOrEqual(28 - 1e-9)`, and its comment
      at 365 to 367. That bound holds only because the search **builds** the run by walking a
      fixed 28 CSS pixels along one straight segment. Task 3.1(c) makes it a **search** for the
      longest chord-straight run in the window, which is 8 to 28 CSS pixels, and the sharpest
      node is where a chain is least likely to stay straight over the whole window. This one
      SHALL be **relaxed**, to `toBeGreaterThanOrEqual(8)`, which is what the join search's own
      version at line 243 asserts, and its comment restated. It is the one exception to the
      rule above, and it is an exception because the premise changed and not because the suite
      went red. The two start-distance assertions at 374 to 376 stay at `halfWidth + 12`,
      because the near edge of the window does not move
- [x] 3.3 Rename the browser scenario "A 90 degree corner of the traced set is not brighter
      than its line" to "The sharpest corner of the traced set is not brighter than its line"
      in `e2e/regions.spec.ts`, give it the same half pixel sampling allowance the join
      scenario carries, and verify it passes. The phrase sits in seven other places and every
      one of them SHALL be updated: `e2e/regions.spec.ts` lines 57, 893, 974, 1116 and 1134,
      `e2e/region-views.ts:228`, `tests/region-views.test.ts:324` and
      `src/render/region-pass.ts:13`. Five further places say the same thing in other words and
      the narrow phrase does not reach them: `tests/region-views.ts:6` and `:764`, the header
      and the doc comment of the function task 3.1 rewrites; `tests/region-views.test.ts:331`;
      `e2e/region-views.ts:7`; and `src/scene-data/region-lines.ts:525`, which says the traced
      set "departs from the trace by 0 and it keeps every 90 degree turn", which task 1.3 makes
      false. Confirm `grep -rn "90 degree" e2e tests src` returns only
      `src/scene-data/region-lines.ts:421`, which is about the smoothed set's corner round and
      stays true
- [x] 3.4 Run the browser scenario "The corner of the traced set is round to the band's half
      width" and verify the fitted radius is still 24.0 CSS pixels within 2.0 at 2,160 rows,
      so the band and not the line sets the radius. Write the turn the search read into the
      scenario and verify it is above **80** degrees. The sweep spans `180 - T` while the
      band's arc spans `T`, so the fit runs `90 - T` onto the straight part at each end and the
      radius error is `24 * (1 / cos(90 - T) - 1)`: 0.370 CSS pixels at 80 degrees, 1.540 at
      70, and the whole bound of 2.0 at 67.4. The sample read 88.47 degrees, at which the error
      is 0.009
- [x] 3.5 Run the browser scenario "A join is not brighter than the line" and verify it still
      passes with its existing allowance

## 4. The grid's reach follows the zoom

- [x] 4.1 Add `GRID_REACH_ZOOM = 0.4` and `gridZoomReach(cameraDistance)`, which returns
      `GRID_REACH_ZOOM * cameraDistance`, to
      `src/render/grid-pass.ts`, and verify `gridDistanceFade` is **unchanged**, so the unit
      scenario "A level fades out at 100 of its own lines" still reads 1, 0.5, 0 and 1, 0.995,
      0.99
- [x] 4.2 Add `gridReachPerLevel(focalCss, distance)` to `src/render/grid-pass.ts`, beside
      `gridLabelLevel` and the two fades, which returns one reach for each of the six levels:
      the level's own `GRID_FADE_LINES * spacing` for the level `gridLabelLevel` names, and the
      lesser of that and `gridZoomReach(distance)` for every other level, so the function task
      4.1 adds is read by shipping code and not by a test alone. The rule lives in
      `grid-pass.ts` and not in the renderer or the shader, so a unit test can read it without
      a frame. Carry the six on `GridPassFrame`,
      fill them in `src/render/renderer.ts`, which already works out the numbered level
      immediately before it calls `gridPass.draw`, and pass them to `grid.frag` as one array
      uniform beside `uSpacing`, added to the uniform name list of `createGridProgram` under its
      `uReach[0]` name, as `uSpacing[0]` is registered at `src/render/grid-pass.ts:326`, in the
      name list of `createGridProgram`: this codebase looks an array uniform up by its `[0]`
      name and a bare `uReach` finds nothing. Line 419 is the **upload**, `gl.uniform1fv`, which
      is the second half of the same work; `uFadeLines` sits at 321 and uploads at 404, and both
      of its sites go. The
      shader then holds **one** ramp per level and not two, so remove `uFadeLines`, and verify
      `grep -rn "uFadeLines" src` returns nothing and
      `pnpm vitest run src/render/grid-pass.test.ts` passes
- [x] 4.3 Add the unit scenarios "A level fades out at the zoom reach", "The reach is the
      lesser of the two", "The level's own reach still binds where it is the smaller" and "The
      numbered level keeps its own reach", and verify the readings are 1, 0.5, 0 at 0, 800 and
      1,600 light years at a camera distance of 4,000; 0.375 for the 100 light year level at
      1,000 light years; 0.5 for the 10 light year level at 500; and 0.99 for the numbered
      level at 1,000. All four read the ramp `clamp(1 - distance / reach, 0, 1)` against the
      reach `gridReachPerLevel` gives, which is the reach the renderer sends and the shader
      applies. Do **not** add a second fade function for the zoom: nothing in `src/` would
      read it, and `design.md` decision 5 says why
- [x] 4.3a Verify the requirement "The grid holds the frame budget", which the delta carries as
      MODIFIED for one reason: the base says that at a pitch of 5 degrees "its levels cross the
      whole frame and reach toward the horizon", and after task 4.2 only the numbered level
      does. **The delta already carries the corrected sentence**, so there is no prose edit to
      make here; the work is the check. Verify the **readings** do not move with it: `grid.frag` loops all six levels at
      every fragment whatever their reach, so a cut level still costs its spacing, its
      derivative and its ramps. Re-run the browser scenario "The grid costs under a millisecond
      of draw time" at both pitches and confirm each pair still differs by 1 ms or less. If a
      reading **falls**, do not record it as a win of this change: the fill did not move, so
      report it and find what did
- [x] 4.4 Add the browser scenario "The lattice marks the same part of the frame at every
      zoom", at **1920x1080** and a pitch of **89 degrees**, which is what makes the reach disc
      project as a near-circle. **Measure** the **largest** radius anywhere in the frame at
      which the 100 light year level lights a pixel, at the camera distances 500, 1,000 and
      2,000 light years, and write the three readings into the scenario. Read the largest
      radius and not the radius along the row through the cursor, for the reason the scenario
      gives. Verify the three are within 20 CSS pixels of each other **and** that each is below
      374 CSS pixels, which is the scenario's second clause. Do not write 374: that is
      where the ramp reaches 0, and the last pixel a frame shows sits short of it by an amount
      no one has measured
- [x] 4.5 Add the browser scenario "The lattice stops at its reach and the numbered level goes
      on", at **1920x1080**, at a yaw of **30 degrees**, with the cursor **50 light years** off
      a crossing of the 100 light year level on both axes. At 4:3 the 3,200 light year mark
      falls outside the frame at a pitch of 45; at a yaw of 0 the middle row runs along one
      axis of the grid and crosses none of that family. **Measure** the count of grid lines the
      **row** through the middle of the frame
      crosses between the cursor and 1,600 light years, and between 1,600 and 3,200, at a camera
      distance of 4,000 light years at each of the pitches 45, 60 and 89 degrees. Write the
      counts in and verify the count for each 1,000 light years falls by at least a factor of 5
      at all three pitches, and that every line the second band carries belongs to the numbered
      level. Do not sample a column and do not use a pitch of 5: at that pitch the 100 light
      year level's spacing along the depth axis is 2.1 CSS pixels, under the 8 at which a level
      draws nothing, so a column counts lines that are not there and reads the same with this
      change and without it
- [x] 4.6 Verify nothing else about the grid moved. Run the **whole** of `e2e/grid.spec.ts`
      and not only "A wide view draws no grid", "The band follows the camera distance", "A
      coarse line draws bolder than a fine one" and "The grid stops at the model bounds". Every
      level but the numbered one now draws nothing past 0.346 of the viewport height from the
      cursor, so any scenario that reads a grid pixel away from the cursor is in the blast
      radius. Read each failure before changing it: a scenario that read a line of a cut level
      needs a new reading point and not a relaxed bound
- [x] 4.7 Verify the coordinate labels are untouched by this change. `src/app/grid-labels.ts`
      SHALL NOT be edited, and the browser scenarios "A label fades with its distance from the
      cursor", "No label stands past the reach", "No label stands past the last line", "Every
      label sits on a line" and "A label does not draw stronger than its line" SHALL pass with
      their existing readings and with no tolerance added. If any of them needs a change, the
      exemption is not working and the design is wrong

## 5. The region label's drift cap

The cap binds the **drawn** placement, so it moves readings all over the requirement "A region
in view carries a label that fades with its own range" and not only the two scenarios the
proposal names. Most of those readings are **logged and not asserted**: the test prints them and
asserts a bound, so the suite goes green whatever they read, and a stale figure survives a green
run. Task 5.0 carries the sweep that found them, for the implementer to confirm.

- [x] 5.0 Confirm the sweep below, which lists every figure the requirement states and says
      whether `src/app/labels.test.ts` **asserts** it or only **logs** it. An asserted figure
      fails loudly and needs no task. A logged figure that this change moves SHALL be
      re-measured and written back; a logged figure the change cannot move SHALL be recorded as
      unmoved with the reason. `grep -n "console.log" src/app/labels.test.ts` names all 24 tests
      that log. Confirm the classification rather than trust it, and give any test the sweep
      missed the same treatment.

      The cap reaches a reading only where the **smoothed target** moves. Of the 24 logging
      tests, four carry a stated figure the cap moves:

      | Scenario | Logged figure | Task |
      | --- | --- | --- |
      | A zoom reads like a drag | 2.7 and 0.13, 7.0 and 0.49, 13.2 and 1.40 | 5.4a |
      | The label walks smoothly while the camera drags | 0.09, 0.36, 0.16, 0.67 | 5.4b |
      | The target does not overtake the map | the still-run bound of 2.1 | 5.3 |
      | A target that must cross the frame walks there | 2.65 seconds | 5.2 |

      Two more sit on the cap's path but state no figure, only an upper bound of 600 frames that
      a faster target can only meet sooner: "A label walks around a region in its way" and "A
      blocked anchor keeps moving". Log the frame each one reaches and confirm it fell.

      The rest are **unmoved**, for three reasons that the sweep SHALL check one at a time:

      1. **A view jump takes the target whole**, so the cap is not on that path. This covers
         "A view jump takes the target whole", whose unit test marks the frame as a jump, and
         the browser reading of "A label that must really move does not crawl", whose push is a
         real `setView`. Both were measured at both caps and neither moves: the browser reading
         spreads 152.3 to 154.4 milliseconds at a cap of 120 and 154.3 to 166.1 at 1,200, two
         overlapping ranges, and the run-to-run jitter of one build is larger than any
         difference between them. The requirement now states that reading as a **range**,
         because a single figure claims a precision the instrument does not have.

         **The reason does not stretch to a test that only changes the view.** "A label reaches
         its place after a view jump" never marks a jump in its unit test, so the cap governs it
         and its reading fell from frame 26 to frame **10**. That figure is deterministic: two
         runs give the same frame. Check whether a test marks the jump, not whether its name
         says jump.
      2. **The camera is still and the push is on the anchor**, so the target does not move.
         This covers "A pushed anchor comes back to the centre at once" and the nine readings of
         "A label moves the same distance at every frame rate", 116.0 through 123.4 and the
         spreads 7.8, 0.9 and 0.6, which are anchor readings alone.
      3. **The reading is not a distance the cap can scale**: the label set of "The label set
         does not change over a turn of 0.2 degrees a frame", the rule-change count of "The
         handover does not cross back and forth", and whether the sweep ran in "The sweep is
         skipped only when nothing could draw".

      Two figures the cap does move are already rewritten in the delta and need no re-measuring:
      `carry + 120 * seconds` becomes `carry + 1200 * seconds` in "The share of the gap follows
      the gap", and the jump scenario's old note that the drift cap would take 2.5 seconds is
      gone. Verify both read as stated after task 5.1
- [x] 5.1 Change `TARGET_DRIFT_PIXELS` from 120 to 1,200 in `src/app/labels.ts`, leave
      `TARGET_HALF_LIFE_MS` at 71, and verify the unit scenario "The rates give the old
      figures at 60 frames a second" still reads 0.150, 0.500, 20.0 and 0.400
- [x] 5.2 Rewrite the unit scenario "A target that must cross the frame walks there" for the
      new cap and verify no frame moves the target more than 20.1 CSS pixels, the target comes
      within 1 CSS pixel inside 0.8 seconds, it never passes the point, and crossing 300 CSS
      pixels takes at least **15** frames, which is `300 / 20.0` and the floor the cap sets.
      The **0.8 seconds** is a prediction and not a measurement: the test logs the frame the
      target arrives at and asserts only a bound. Read that log and write the measured time into
      the scenario. If it is not 0.8, correct the delta rather than the measurement
- [x] 5.3 Verify the two rules the change keeps: run the unit scenarios "A label on its centre
      does not move over the map", which reads 512 identical plane points, and "The target does
      not overtake the map". In the second, change the cap clause to `1200 * seconds`, which is
      what the code enforces, and **re-measure** the still-run bound of 2.1 CSS pixels rather
      than relaxing it. Neither scenario may be weakened beyond those two edits
- [x] 5.3a Fix the one unit test the new cap makes false. `src/app/labels.test.ts:872`, "cuts a
      move the drift cap does not allow", holds a gap of 100 CSS pixels whose share asks 15.02.
      The old cap of 2.0 cut that and the new cap of 20.0 does not, so the test no longer
      measures a cut. Its expectation reads `TARGET_DRIFT_PIXELS * FRAME_SECONDS`, which follows
      the constant while the behaviour does not, so reading the constant by name is what makes
      it fail. **Raise the gap** so the cap still binds — a gap of 300 asks 45.05 against 20 —
      and do not weaken the assertion. Restate the comment of its neighbour "gives the map its
      own move for free" at line 881, which says "The label may add 2 to that" and is now 20;
      that test still passes, because its share of 45.05 is cut to the cap either way
- [x] 5.4 Verify the rest of the placement did not move: run the whole of
      `src/app/labels.test.ts`, including "A view jump takes the target whole", "The share of
      the gap follows the gap", "A label moves the same distance at every frame rate", "The
      handover does not cross back and forth" and "The label walks smoothly while the camera
      drags"
- [x] 5.4a Re-measure the six readings of the paragraph "A zoom SHALL read like a drag", which
      the delta states inside "A region in view carries a label that fades with its own range".
      They are readings of the **drawn anchor** taken with the cap at 120, and task 5.1 makes
      the smoothed target ten times faster, so every one of them may move. Run the unit scenario
      "moves the label over the map no more than a drag does" in `src/app/labels.test.ts`, read
      the three worst and mean pairs it logs, and write all six in. The test asserts bounds and
      not these figures, so it goes green either way and the spec would otherwise state six
      numbers nobody measured. The readings under the old cap were 2.7 and 0.13, 7.0 and 0.49,
      13.2 and 1.40. If `held.worst` reaches its bound of 20, do **not** raise the bound: the
      design's trade-off argument rests on the headroom, so report it and re-make the argument
- [x] 5.4b Re-measure the four readings of the filter under a drag that the requirement states,
      "the change of step falls to 0.09 and 0.36" and "Over a faster drag of 200 light years a
      frame at a distance of 20000 it is 0.16 and 0.67". Run the unit scenario "The label walks
      smoothly while the camera drags", read the three figures it logs for each of the two
      drags, and write the four in. The test asserts only the bounds 0.2, 0.7 and
      `ANCHOR_MAX_PIXELS`, so it goes green whatever they read. They move with this change: the
      test's own comment says the worst reading is "a target that really relocates" and that
      "the cap bounds what one frame of that costs", and task 5.1 multiplies that cap by ten. If
      `at(0.9)` reaches its bound of 0.7, do **not** relax the bound; report it and re-make the
      argument. **The 0.67 this task quotes is itself stale**: run on the committed tree with the
      cap at 120 the reading is 0.3768, so the four figures the requirement states were already
      wrong before this change. Measure, do not assume, and report what the stale figures were
- [x] 5.5 Verify the label reaches its place quickly in the page: run the browser scenarios of
      `e2e/labels.spec.ts` and confirm none regressed

## 6. The suite, the baselines and the documents

- [x] 6.1 Run `pnpm lint`, `pnpm exec tsc --noEmit` and `pnpm vitest run`, and verify all
      three pass with no new warning
- [x] 6.2 Run the full Playwright suite once on `chromium-gpu` alone, and verify it asserts
      the hardware renderer through `WEBGL_debug_renderer_info` and does not report SwiftShader
      or llvmpipe. Run one Playwright job at a time: a second run takes the first one's server
      on port 4173 and the failures look real
- [x] 6.3 Run `chromium-touch` and verify it passes
- [x] 6.4 Regenerate the baseline image for both projects once the look of tasks 1 and 4 is
      settled, and verify a second run passes against the new baseline.
      **Measured: no regeneration is needed, and regenerating would be wrong.** There is one
      baseline, `e2e/look.spec.ts-snapshots/default-view-chromium-gpu-linux.png`, and
      `chromium-touch` holds none. The scenario "The default view matches the baseline image"
      **passes unchanged** in the full run. Neither change can reach that view: it opens the
      default camera at **60,000 light years**, where the overlay's zoom fade is 0 above 30,000
      so no boundary draws at all, and where `gridVisibility` is 0 above 12,000 and the library
      default has the grid off in any case. Writing a new file would produce the same image and
      would throw away the evidence that the default view did not move
- [x] 6.5 Verify the frame budget: run the browser scenario "The overlay costs under a
      millisecond", the grid's own budget scenarios "The grid costs under a millisecond of
      draw time" and "The grid labels hold the frame rate", and the `map-hud` and
      `real-systems` budget scenarios, and confirm none regressed
- [x] 6.6 Update `docs/roadmap.md`: record that the band's width does not hide the raster,
      that the `accurate` set is drawn through the edge midpoints and smoothed, what now
      separates the two modes, the grid's zoom reach, and the label cap. `docs/roadmap.md`
      also names "a 90 degree corner of the traced set" at lines 406 and 762, which the grep of
      task 3.3 does not reach; update both
- [x] 6.7 Update the two sentences of `README.md` this change falsifies: line 150, which says
      `accurate` draws "the 49.3494 light year staircase the region data holds", and line 167,
      which says "The width is what hides the staircase" and names "a 90 degree corner of the
      traced set". Also update line 176, which says a close zoom takes the lines away "where the
      staircase would show", and the grid paragraph at lines 215 to 225, which documents the
      camera distance fade and does not yet say that every level but the numbered one stops at a
      fixed disc about the cursor. Verify no host API moved
- [x] 6.8 Delete every instruction to measure from the spec deltas once its reading is written
      in. A requirement that says "SHALL be measured and written in here" forever is not a
      requirement. There are **nine**, six written by this change and three carried over.
      The six this change writes:
      (a) the scenario "The lattice stops at its reach and the numbered level goes on", in the
      `coordinate-grid` delta, which asks for both counts;
      (b) the window-scaling paragraph of "The boundaries draw as one wide soft band over a
      smoothed line", which asks for the longest straight run and the count past 2,395 light
      years, and which task 3.2c measures;
      (c) the separation paragraph of "The region overlay has three modes and starts on the
      traced set", which task 3.2b measures;
      (d) the scenario "Each mode draws its own frame", which task 3.2a measures;
      (e) the scenario "The target does not overtake the map", which task 5.3 measures;
      (e2) the sentence "Those four readings, and the six of ... SHALL be re-measured at 1,200 and
      written back here", in the requirement "A region in view carries a label that fades
      with its own range", which tasks 5.4a and 5.4b measure. It is there because those ten are
      the only stale figures in either delta that the requirement does not otherwise mark.
      The three carried over from the base spec read differently, so the grep below has to
      reach them as well:
      (f) "the implementation SHALL measure them again ... SHALL write the counts it finds back
      into this requirement", in the ADDED requirement "The boundaries draw as one wide soft
      band over a smoothed line";
      (g) "SHALL then run again and write the counts they find into this requirement, in place
      of the five stated above", in the same requirement;
      (h) "Every view it holds SHALL be searched again", in the same requirement, which task 3.2
      carries out. None of the four patterns below reaches (h), so delete it by hand. All
      three ask for the counts task 3.2 writes into the table that now sits above them.
      Verify
      `grep -rn "SHALL be measured and written\|SHALL be re-measured\|SHALL measure them again\|write the counts" openspec/changes/smooth-traced-boundary-and-limit-grid-reach/specs`
      returns nothing. The path is this change's **specs** and not `openspec/changes`: the
      wider path also reaches two archived changes, which SHALL NOT be edited, and this task's
      own text. The pattern says "measured **and written**" on purpose: the clearance
      rule of task 3.1 reads "The distance SHALL be measured to the nearest point of a
      segment", which is a permanent requirement and not an instruction to measure, and a
      looser pattern would ask the implementer to delete it
- [x] 6.9 Run `openspec validate smooth-traced-boundary-and-limit-grid-reach --strict` and
      verify it reports the change as valid after every reading of tasks 2, 3, 4 and 5 is
      written back

## 7. The implementation review gate

- [x] 7.1 Run the tests yourself first, then launch the `openspec-implementation-reviewer`
      subagent with this change id, and verify it returns APPROVE or APPROVE WITH NOTES. On
      BLOCK, fix what it found and run the gate again. Do not present a blocked change with
      the objections attached as caveats
