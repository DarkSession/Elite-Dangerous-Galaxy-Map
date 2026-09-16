## Why

This is a draft. It holds three faults the owner found while reading the map after
`cursor-marker-cyan-grid-and-region-band` landed. **Fault 1 needs a sample before this
change goes to a review round**, which the owner asked for directly.

1. **The traced boundary reads as a zig-zag.** The change before this one made `accurate`
   the default and answered the raster with the band's own width: the half width is
   `clamp(0.016 * viewportHeightCss, 8, 24)` CSS pixels, 17.28 at 1,080 rows, and the
   largest cell the range fade lets draw measures 4.62 CSS pixels at 10,000 light years,
   which is 0.133 of the band. The reasoning said a step that small sits inside the band's
   own ramp. On the screen it does not read that way. The staircase is periodic and it
   runs along the boundary, so the eye reads the **repeat** and not one step, and the
   band's edge carries a regular saw tooth the smoothed set does not have.

   The smoothed set is not the answer, and this change does not simply switch the default
   back. `simplified` departs from the region data by 49.342 light years of a 49.3494
   light year bound, so it has spent the whole budget the data's resolution allows, and it
   rounds real corners of the region data away. What is wanted is the traced set's
   fidelity with the smoothed set's edge.

2. **The grid fills the frame at every zoom.** `gridDistanceFade` gives a level a reach of
   `GRID_FADE_LINES * spacing`, which is 100 of that level's own lines each side of the
   cursor. The reach therefore follows the **level** and never the zoom: the 10,000 light
   year level reaches 1,000,000 light years, so at a far view every coarse level covers
   the whole plane and the grid reads as a full-frame lattice rather than as a scale near
   the cursor. The grid should say where the cursor is and how far things are from it, and
   a lattice that fills the frame says neither.

3. **A galactic region label takes seconds to go where it belongs.** The placement has two
   stages and only the second is quick. The **anchor** stage closes half its gap every
   16.667 milliseconds and may run at 1,200 CSS pixels a second, which is fast. The
   **target** stage in front of it is held to `TARGET_DRIFT_PIXELS`, **120 CSS pixels a
   second** over and above the motion the map itself makes under the label, so a target
   that must cross half a 1920 pixel frame takes **8 seconds** and a whole frame takes 16.
   The requirement states the slowness on purpose: the scenario "A target that must cross
   the frame walks there" holds a 300 CSS pixel move to 2.1 CSS pixels a frame and allows
   **2.65 seconds** for it.

   The cap was set to stop a label sliding over the map while the map holds still. That is
   worth keeping as an idea and it is set far too low: a name that arrives two and a half
   seconds after the view does reads as lag, not as smoothness. The flow-field walk the
   change before this one added makes it worse, because a label that must go around a
   region that lies in its way covers more ground at the same cap.

## What Changes

**The traced boundary's edge.** The approach is not chosen yet. Three candidates, to be
settled by the sample:

- **A coverage-space smooth of the traced set.** Keep the traced vertices and low-pass the
  **coverage buffer** along the boundary rather than across it, so the saw tooth goes and
  the corner stays. This is not the blur the last change deleted: that one was isotropic
  and ran across the band as well as along it.
- **A sub-cell trace.** Read the region grid's own neighbourhood to place each boundary
  vertex inside its cell rather than on the cell corner, as a marching-squares trace with
  interpolation does. The departure from the data stays 0 at the cell level and the
  staircase's amplitude falls below one cell.
- **A bounded corner round on the traced set.** Chaikin with a cap far below the cell, so
  the set keeps every real corner of the region data and loses only the 90 degree lattice
  artefact.

**The grid's reach.** The reach becomes the lesser of the level's own
`GRID_FADE_LINES * spacing` and a bound that follows the **zoom**, so a level that would
cover the frame fades out at a stated distance from the cursor instead.

**The region label's speed.** `TARGET_DRIFT_PIXELS` rises well above 120 CSS pixels a
second, and `TARGET_HALF_LIFE_MS` falls from 71 if the half-life is the binding term rather
than the cap. The aim is a label that reads as **almost instant**: it should reach its place
in a small fraction of a second, not in seconds. The scenarios that pin the present rates
have to move with it, chiefly "A target that must cross the frame walks there", "A label
that must really move does not crawl", "A displaced label moves only a little" and "The
rates give the old figures at 60 frames a second".

Two rules are worth keeping while the rates rise, and the change SHALL say which it keeps:
a label on the centre of its region must still not move over the map at all while the
camera drags, which is what makes a settled label read as painted on; and the target must
still not overtake the map or hunt about its place.

**Two look figures from the change before this one.**

- The cursor marker's box falls from **160 to 96 CSS pixels**, and the coordinate label's
  width bound from **1 to 0.6** of a level's spacing. Both were tuned by eye against the
  owner's reading that each was too large. They are recorded here because they were made
  under the last change and belong in its history, not because this change moves them
  again.

## Capabilities

### Modified Capabilities

- `galactic-regions`: how the traced set's edge is drawn and what the band's width is
  claimed to hide, and the rates that move a region label's target with every scenario that
  reads them.
- `coordinate-grid`: the reach of a level follows the zoom and not only its own spacing.

## Impact

Unknown until the approach for fault 1 is chosen. Fault 2 touches `gridDistanceFade` in
`src/render/grid-pass.ts` and its scenarios in `openspec/specs/coordinate-grid/spec.md`.

Fault 3 touches `TARGET_DRIFT_PIXELS` and `TARGET_HALF_LIFE_MS` in `src/app/labels.ts` and
about six scenarios of `openspec/specs/galactic-regions/spec.md`.

**This proposal is not ready for a review round.** The owner asked to see a sample of the
smoothed traced boundary before the artifacts are written out, so the specs, the design and
the tasks are deliberately absent.
