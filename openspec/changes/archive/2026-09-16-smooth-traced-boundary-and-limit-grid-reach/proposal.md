## Why

Three faults the owner found while reading the map after
`cursor-marker-cyan-grid-and-region-band` landed.

1. **The traced boundary reads as a zig-zag.** The change before this one made `accurate`
   the default and answered the raster with the band's own width. The reasoning was that a
   cell step of 4.62 CSS pixels sits inside a band of 34.6, so it cannot read. On the
   screen it does read: the staircase is periodic and runs along the boundary, so the eye
   reads the **repeat** and not one step.

   A sample settled the approach by measurement. It rasterised the real pass offline, with
   the same coverage rule, the same tone and the same range fade, and it measured the
   **roughness** of a drawn set: the root mean square departure from a straight line fitted
   over 8 cells of arc, in CSS pixels at a range of 10,000 light years on 1,080 rows, which
   is the nearest and therefore the worst view the range fade allows.

   | Set | Vertices | From the data | From the traced line | Roughness |
   | --- | ---: | ---: | ---: | ---: |
   | traced, as today | 22,718 | 17.4 ly | 0 ly | **1.26 px** |
   | simplified, as today | 68,672 | 36.9 ly | 36.9 ly | 0.065 px |
   | edge midpoints alone | 14,510 | 0 ly | 12.3 ly | 0.84 px |
   | midpoints, average of half width 4, cap 0.5 cell | 5,727 | 26.6 ly | 31.1 ly | **0.061 px** |

   The sample also corrected how fidelity is measured. The traced polyline is **not** the
   data: it runs along cell corners, and a cell corner is up to half a cell from the edge it
   marks. The honest boundary of the data is the **midpoint of every unit edge** between two
   cells that hold different ids. Measured that way the traced set is itself 17.4 light years
   off the data, so a curve is not less faithful for leaving the staircase.

   The sample refuted one of the three candidates and priced the others:

   - **A bounded corner round** cannot work. At a cap of 0.25 cell, two Chaikin passes take
     the roughness from 1.26 to 1.06 CSS pixels and four take it to 0.59 at 363,488
     vertices, sixteen times the data. The saw tooth's amplitude is half a cell and the cap
     is a quarter of one.
   - **A coverage-space smooth** works and costs. It thins and dims the band where the
     nearest-segment direction is inconsistent, it needs a full-frame pass every frame, and
     nothing about it can be measured in the data.
   - **A sub-cell trace** is right and is not enough alone: the midpoint polyline takes a
     third off the saw tooth, from 1.26 to 0.84 CSS pixels, which still reads.

2. **The grid fills the frame at every zoom.** `gridDistanceFade` gives a level a reach of
   `GRID_FADE_LINES * spacing`, which is 100 of that level's own lines each side of the
   cursor, and it never consults the zoom.

   The grid already stops at a wide view: `gridVisibility` takes it to nothing at 12,000 light
   years of camera distance and to full at 4,000, so a far view draws no grid at all. The
   fault lies inside that band. At a camera distance of 4,000 light years, a pitch of 45
   degrees, the top of the frame sits **7,727 light years** beyond the cursor,
   while the 100 light year level reaches 10,000 and the 1,000 light year level reaches
   100,000. Neither of those two reaches ends inside the frame, so what ends their lines is the
   perspective fade alone, and it ends only half of them. The shader reads the screen spacing
   **per axis** from the fragment derivatives, so the two line families of the 100 light year
   level behave differently at that view: the lines of constant depth fall under 8 CSS pixels
   **76 per cent** of the way up the frame, and the lines that run toward the horizon are still
   **9.9 CSS pixels** apart at the top row and are never ended by the 8 CSS pixel cut at all.
   Half the lattice therefore runs to the frame edge. The grid should
   say where the cursor is and how far things are from it, and a lattice that runs to the
   frame edge says neither.

3. **A galactic region label takes seconds to go where it belongs.** The placement has two
   stages and only the second is quick. The **anchor** stage closes half its gap every 16.667
   milliseconds and may run at 1,200 CSS pixels a second. The **target** stage in front of it
   is held to `TARGET_DRIFT_PIXELS`, **120 CSS pixels a second** over and above the motion
   the map makes under the label.

   The cap, not the half-life, is what makes it slow. At a gap of 300 CSS pixels the share of
   `TARGET_HALF_LIFE_MS` asks for 45 CSS pixels in a 16.667 millisecond frame and the cap
   allows **2.0**, so the cap binds by a factor of 22. The requirement states the slowness on
   purpose: under the scenario "A target that must cross the frame walks there" the rule takes
   **2.65 seconds** over a 300 CSS pixel move, against the 3 seconds the scenario allows, and
   reaching within 8 CSS pixels takes 2.43.

## What Changes

**The traced boundary's edge.** The `accurate` mode's set SHALL be built through the edge
midpoints and then smoothed by the capped average the smoothed set already uses, re-tuned:
an average of half width 4 held within **0.5 cell** of the midpoint the trace gives, then the
vertex reduction. It SHALL take **no corner round**. The set's departure bound stays one cell.

The corner round the smoothed set ends with earns nothing here, and the sample measured that.
**Two** passes of that round, not the four `REGION_ROUND_PASSES` gives the smoothed set, move
the roughness from 0.060 to 0.057 CSS pixels and the departure from 26.57 to 27.21 light
years, while they take the set from 5,727 vertices to 22,908, which is 4 times over. Four
passes would be 16 times over. The band's coverage is the
exact distance to the nearest segment under a `MAX` blend, so the outside of a corner is
already round to the band's half width; rendered at the sharpest corner of the set, the two
sets differ by at most **9 of 255** in one channel.

The new set beats the smoothed set on **all three** axes that can be measured: a **twelfth**
of the vertices, 5,727 against 68,672, 10 light years nearer the data, and 0.061 CSS pixels of
roughness against 0.065, which are both far under one pixel.

An earlier draft of this proposal said the new set tied the third axis, 0.06 against 0.03. The
0.03 came from the offline sample and was wrong. The shipped measurement over the real
`buildRegionData()` sets reads **0.065** CSS pixels for the smoothed set, so the new set is the
smoother of the two by a margin no eye can see. The correction does not change what this change
does; it removes the one axis on which `simplified` looked better. It is **9 light years further
from the data than the lattice polyline the `accurate` mode draws today**, 26.6 against 17.4,
and that is the price of the smoothness. Both sit well inside the one cell the data's own resolution allows. This change does
**not** remove the `simplified` mode for that reason. Removing a mode is a breaking change to
the host API and it is not what the owner asked for. The observation is recorded in
`design.md` as a follow-up.

The claim in "The boundaries draw as one wide soft band" that the band's width hides the
raster SHALL be replaced by what the sample measured. The band's width is still right and the
reason for it is still right; the claim that it makes smoothing unnecessary is not.

**The grid's reach.** The reach of a level that carries no number SHALL become the lesser of
its own `GRID_FADE_LINES * spacing` and a bound that follows the **zoom**, so the dense
lattice marks a neighbourhood of the cursor at every zoom instead of running to the frame
edge. The existing per-level reach rule and its scenario stay as they are; the zoom bound is a
second factor beside them.

**The level that carries the coordinate numbers SHALL be exempt** and SHALL keep its own
reach. A label has to sit on a lit crossing, and the numbered level's crossings are the ones
most easily cut, because they are the furthest apart. The reach is a disc of radius 374 CSS
pixels, and a lattice of spacing `s` always leaves a crossing inside a disc of radius
`s / sqrt 2`, so the disc first misses one at a spacing of 529 CSS pixels. Above a camera
distance of 233.8 light years the numbers sit on the 1,000 light year level, a cursor at the
middle of a cell is 707 light years from its nearest crossing, and `0.4 * d` only reaches 707
at a camera distance of 1,768. Cutting that level would therefore leave the frame with lines
and no numbers from 234 to 1,768 light years, and again below 177, where the numbers sit on
the 100 light year level and `0.4 * d` falls under its own 70.7. The exemption
costs little: the numbered level is 100 or 1,000 light years and never more, so every level
above it is still cut, and at a camera distance of 4,000 light years it carries about 8 lines
across a 1,920 CSS pixel frame against the 100 light year level's 82. The coordinate labels
are then unchanged by this change.

**The region label's speed.** `TARGET_DRIFT_PIXELS` SHALL rise from 120 to **1,200** CSS
pixels a second, which is `ANCHOR_MAX_SPEED`, the cap the anchor stage already runs under.
`TARGET_HALF_LIFE_MS` SHALL stay at 71, because the sample above shows the cap is the binding
term, so the scenario "The rates give the old figures at 60 frames a second" keeps every one
of its four readings.

Two rules SHALL be kept while the cap rises, and the change states that it keeps them: a
label on the centre of its region SHALL still not move over the map at all while the camera
drags, which is what makes a settled label read as painted on; and the target SHALL still not
overtake the map or hunt about its place.

## Non-Goals

- **The `simplified` mode SHALL NOT be removed.** The new `accurate` set beats it on size and
  on fidelity, but removing a mode breaks the host API and the owner did not ask for it.
  `design.md` records the observation as a follow-up.
- **The per-level grid reach SHALL NOT change.** `GRID_FADE_LINES` stays at 100 and
  `gridDistanceFade` keeps its rule and its scenario. The zoom bound is a second factor beside
  them, not a replacement.
- **The coordinate labels SHALL NOT move.** The numbered level is exempt from the zoom reach,
  so `src/app/grid-labels.ts` is not edited.
- **`TARGET_HALF_LIFE_MS` SHALL NOT change.** The cap is the binding term; the half life is
  not, and moving it would move readings this change has no reason to touch.
- **`findSharpCorner` SHALL NOT change.** Only the traced set's corner search loses its
  premise. The asymmetry that leaves between the two searches is recorded as a follow-up.

## Capabilities

### Modified Capabilities

- `galactic-regions`: how the `accurate` set is built and what it departs from, what the
  band's width is claimed to hide, and the cap that moves a region label's target.
- `coordinate-grid`: a level's reach follows the zoom as well as its own spacing, and the
  frame budget's premise that every level crosses the frame at a shallow pitch. The budget's
  readings do not move: the shader tests all six levels at every fragment whatever their
  reach.

## Impact

- `src/scene-data/region-lines.ts`: the packer for the `accurate` set, and the constants it
  reads. `src/scene-data/region-lines.test.ts` and `tests/region-views.ts` move with it.
- `src/render/grid-pass.ts`: the reach of a level, computed once per level per frame.
  `src/render/shaders/grid.frag` takes the six reaches as one array uniform and loses
  `uFadeLines`. `src/render/renderer.ts` fills them, because it already works out the numbered
  level immediately before it draws the grid.
- `src/app/labels.ts`: `TARGET_DRIFT_PIXELS`.
- `src/app/create-map.ts`: the host-facing documentation of `RegionMode` and
  `DEFAULT_REGION_MODE`, which states both of the claims this change overturns. No host API
  moves. Two lines of `loadRegionLookup` are also rewrapped: the file failed
  `prettier --check` before this change, and running the formatter over a file this change
  edits fixes that with it. No statement of that function moves.
- `openspec/specs/galactic-regions/spec.md` and
  `openspec/specs/coordinate-grid/spec.md`.
- `eslint.config.js`: one ignore entry, `*.local/**`. This is **not** part of the three faults.
  The approach for the boundary was settled by an offline sample in `boundary-sample.local/`,
  which `.gitignore` covers through `*.local` and ESLint did not, so `pnpm lint` failed on a
  scratch directory that ships nothing and blocked this change's own verification. No rule and
  no shipping file moves.

The two browser searches that read a **90 degree corner of the traced set** lose their
premise. The turn is not the whole of it: the search also asks that the two segments beside
the node each run 770 light years, and it calls a fold anything past 16 CSS pixels of arc
that is still within 385 light years. Both premises say the set's segments are long, and the
new set's median segment is 185 light years. `design.md` decision 4 states what replaces
them, and the sample measured the replacement on both sets.

**A note on the change id.** It names two of the three faults. The label cap is the third and
it is invisible from the outside of the name. The three are kept together because all three
fall out of the change before this one, and splitting them would split one review of one look.
