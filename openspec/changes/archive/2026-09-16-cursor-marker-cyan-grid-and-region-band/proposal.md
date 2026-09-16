## Why

Seven faults, found while reading the map against the look the game's own galaxy map
holds. One leaves the user with nothing to steer by, one freezes a label, and five are
places where the map's own answer is worse than the one it copies.

1. **A frame with no overlay says nothing about where the user is.** `REGION_RANGE_NONE`
   draws no boundary nearer than 10,000 light years, and the reading is the range from
   the camera to the plane point a pixel sees. At the view
   `c=1840.85884,-15539.75557,16507.94703&d=20016.72348&p=58.57998&y=24.66002` the camera
   sits 1,542 light years above the plane; the pixel under the cursor reads 1,542, the
   top centre row 3,223 and the top corners about 4,300, all under the floor, so at that
   zoom the whole overlay is gone. Only a zoom near 27,000 light years brings any of it
   back, as a band of about 0.07 alpha along the top of the frame. The
   two range figures stay as they are: they hold the overlay off a camera that is inside
   the boundary rather than looking at it, and the wide band below depends on them. What
   that frame needs is the cursor marker of fault 4, which draws at every range.
2. **A region label can freeze.** `smoothTarget` walks the label's target toward the
   region's centroid along a straight line on the plane, and drops the step whole when
   the point lands on another region. A region is not convex, so where a third region
   lies between the label and the centroid the test fails in every frame at the same
   share, and the label never moves again.
3. **The map cannot name the region of a system exactly.** `regionNameAt` reads the
   coarse grid, whose cells are 197.4 light years. That is enough for a top bar that
   names the neighbourhood under a moving cursor, and wrong for an information panel
   that states one system's region as a fact.
4. **A cursor off the galactic plane leaves the user with nothing to steer by.** The
   cursor may sit anywhere in the model bounds, which reach 40,985 light years in `y`,
   and nothing on the screen says where it is. A user who takes the cursor far below the
   disc sees an empty frame and cannot tell why.
5. **The coordinate grid disappears into the galactic core.** Over a bright background a
   line keeps 0.30 of its alpha and takes 0.60 of the background's own colour, so an
   orange line over the cream core is dim, warm and most of the way to being the core.
   The grid is least readable exactly where a user needs it most.
6. **The coordinate labels stand off the map.** They are screen-aligned text beside a
   crossing, and the `y` of the plane sits in a separate label at the lower edge of the
   canvas. A coordinate that does not lie on the plane it names reads as chrome and not
   as part of the map.
7. **A region name and the boundary it names fade at different distances.** The label
   takes a zoom band, none at 30,000 light years and full from 20,000 down to 10,000. The
   boundary takes the far end of that band and a **per-pixel range fade** in its place at
   the close end. The two therefore part company: at a zoom of 10,000 light years a label
   reads at full opacity over a frame whose boundary near the cursor draws nothing, and at
   the view of fault 1 the names stand over a frame with no lines at all.

The boundary is a raster of 49.3494 light year cells, and the map spends a whole
smoothing stage turning its staircase into a curve. That stage has no budget left: the
smoothed set already departs from the trace by 49.342 of a 49.3494 light year bound. A
band wide enough to swallow one cell hides the staircase with no smoothing at all, and it
stays true to the data. This change takes that route, which is also the one the game's own
map takes.

## What Changes

**The region band.**

- The boundary line's width becomes **3.2 percent of the viewport height**, clamped to
  16 to 48 CSS pixels, in place of a fixed 6 CSS pixels. At 1,080 CSS rows that is 34.6.
- The default region mode becomes **`accurate`**, which draws the traced set. The traced
  set departs from the region data by 0 and keeps every turn the data holds.
- `REGION_RANGE_NONE` and `REGION_RANGE_FULL` stay at 10,000 and 20,000 light years.
- **The blur stage goes.** It exists to round the staircase of a 6 CSS pixel line. A band
  17.28 CSS pixels each side swallows a 49.3494 light year cell at every range the overlay
  draws at: the nearest is 10,000 light years, where a cell measures 4.62 CSS pixels, or
  0.133 of the band. The coverage ramp is also an exact distance to the segment, so a 90
  degree corner is already round to the band's own half width. With it go the two blur
  passes, the normalisation by the kernel's peak, the peak uniform, and the two extra
  coverage targets.
- The `simplified` mode and its smoothed set stay, unchanged, as an option.

**The region labels.**

- The region worker builds a **flow field** over the coarse grid: one direction per cell,
  pointing along the inside of its own region toward that region's centroid. One
  `Uint8Array` of 507 by 507 covers all 42 regions, because a cell belongs to one region.
- `smoothTarget` and `filterAnchor` follow the flow field where the straight step leaves
  the region, so a label walks around a region that lies in its way instead of stopping.
- **A label fades exactly as the boundary at the same place fades.** Its opacity becomes
  the zoom fade times the **range fade read at its own plane anchor**, which are the two
  the boundary takes. The close end of the label's own zoom band goes, so `labelFade`
  keeps the far end alone. A label's anchor is one plane point and its element has one
  opacity, so the fade is read once there rather than per pixel.
- The sampling sweep's skip gate keeps its zoom half and replaces its floor of 5,000 light
  years with "no plane point in the frame is beyond `REGION_RANGE_NONE`", read from the
  frame's two top corners in constant time. The old floor did not follow what draws; the
  new half does exactly.
- A label whose opacity reads 0 is left out of the overlay and not placed transparent.
- The region the camera sits in is now the **first** label to go as the user zooms in and
  not the last. The HUD's top bar names the region under the cursor at every zoom, so the
  name moves from the map to the bar rather than being lost.

**The region of a system.**

- The handle gains `regionNameAtExact(point)`, which resolves the region on the game's own
  49.3494 light year grid. It loads the region lookup through a **dynamic import** on the
  first call, so the 199 KiB table still never enters the main bundle.
- The information panel carries a **`REGION`** field for the selected system.

**The cursor marker.**

- The map draws a marker on the galactic plane at the cursor: a ring with four arrows
  around it, in `#3EF8FB`, lying flat on the plane rather than facing the screen. Its box
  is **96 CSS pixels**, so the ring reads about 58 CSS pixels across at every zoom.

**The coordinate grid.**

- `GRID_COLOR` becomes `[96, 214, 224]` and `GRID_LABEL_COLOR` becomes `[140, 235, 240]`.
  A cyan grid separates from the warm region band and from the cream core by hue, which
  the orange one could not.
- The tint toward the background goes: `GRID_LINE_TINT_MAX` and `GRID_LABEL_TINT_MAX`
  become 0. In its place the colour **darkens** toward `[16, 74, 120]` as the background
  brightens, so the grid holds contrast by luminance and keeps its hue.
- The merge floors rise: the line's from 0.30 to **0.55**, the label's from 0.45 to
  **0.75**.

**The coordinate labels.**

- A label lies **flat on the galactic plane**, placed by the exact plane-to-screen
  homography, and reads `x : y : z` of its crossing with a thousands separator.
- The label level is **100 or 1,000 light years**, and no other.
- A crossing carries a label only within **1.2 spacings** of the cursor, and the opacity
  falls linearly to 0 there. At 90 light years on the 100 light year level that is 0.25.
- A label's cap height is the lesser of one tenth of the level's spacing and the height
  that holds its measured width to **0.6** of a spacing. The width bound is the binding
  one for `x : y : z`, which gives about a twenty-third of the spacing.
- **BREAKING**: the plane label at the lower edge of the canvas goes. Its `y` moves into
  the crossing labels, so `gm-grid-plane-label` no longer exists.

**Non-goals.**

- No further smoothing of the smoothed set. Its departure from the trace already measures
  49.342 of a 49.3494 light year bound, so it has no budget left, and the wide band on the
  traced set removes the need.
- No change to the far end of the fade. `REGION_FADE_IN_NEAR` and `REGION_FADE_IN_FAR`
  stay at 20,000 and 30,000 light years for both the lines and the labels.
- No font in a shader. Every label stays DOM text.

## Capabilities

### New Capabilities

- `plane-overlay`: an overlay element placed flat on the galactic plane, by a CSS
  `matrix3d` built from the exact plane-to-screen homography. The coordinate labels and
  the cursor marker both sit on it, so the transform, the culling and the degenerate cases
  are stated once.

### Modified Capabilities

- `galactic-regions`: the band width, the default mode, the flow field the labels follow,
  the label fade that now matches the boundary's, and the exact region at a plane point.
- `coordinate-grid`: the colour, the merge rule, the label level set, the label reach and
  fade, the label text, and the removal of the plane label.
- `map-navigation`: the cursor carries a marker on the galactic plane.
- `map-hud`: the information panel carries the region of the selected system.
- `library-package`: the exact region lookup sits in no entry chunk and in no chunk an
  entry chunk imports at load. How many chunks carry it follows the build.

**Five requirements are replaced rather than modified**, because each carries a scenario
whose own name reads behaviour this change removes, and a delta cannot drop or rename a
scenario:

| Replaced | By | The scenario that forced it |
| --- | --- | --- |
| The boundaries draw as one soft band inside a zoom band | The boundaries draw as one wide soft band | three scenarios reading the blur |
| The region overlay has three modes | The region overlay has three modes and starts on the traced set | The default mode is simplified |
| The grid blends under the overlays at its own weights | The grid blends under the overlays by weight and darkening | The weight and the tint are one rule |
| The grid carries coordinate labels | The grid carries coordinate labels on its own plane | The plane label reads the cursor's height |
| A region in view carries a label | A region in view carries a label that fades with its own range | The region the camera is inside is named at every zoom |

Each replacement carries every rule of the requirement it replaces that still holds, and
states in its **Migration** what a reader should go to instead.

## Impact

**Code.**

- `src/render/region-pass.ts`, `src/render/shaders/region-composite.frag`: the width rule
  and the removal of the blur stage.
- `src/render/shaders/region-blur.frag`: deleted.
- `src/app/create-map.ts`: the default region mode, `regionNameAtExact`, the cursor marker
  and the flow field handover.
- `src/scene-data/region-lines.ts`, `src/scene-data/region-lines.worker.ts`,
  `src/scene-data/messages.ts`, `src/scene-data/types.ts`: the flow field.
- `src/app/labels.ts`: `smoothTarget` and `filterAnchor` follow the flow field, `labelFade`
  drops its close end, each label takes the range fade at its anchor, and the sweep's skip
  gate reads the frame's greatest range to the plane.
- `src/render/grid-pass.ts`, `src/render/shaders/grid.frag`: the colour, the merge and the
  cut of `GRID_LEVELS` to two levels.
- `src/app/grid-labels.ts`: the plane placement, the level set, the reach, the fade, the
  text, and the removal of the plane label.
- `src/app/plane-overlay.ts`: new, the homography and the `matrix3d` it writes.
- `src/app/cursor-marker.ts`: new, the ring and the arrows.
- `src/hud/info-panel.ts`, `src/hud/types.ts`: the `REGION` field.

**Bundle.** The region lookup stays out of every entry chunk. The dynamic import puts it
in a chunk of its own, loaded on the first exact query, in a build that bundles the core
package. The library build marks that package external, so its only carrier stays the region
worker's chunk. `tests/main-bundle.test.ts` asserted a count and now asserts the two rules
that matter instead.

**Memory.** The flow field is 507 by 507 bytes, which is 251 KiB, transferred without a
copy beside the coarse grid it matches.

**Scale.** Every figure above is fixed by the region grid and the viewport, not by the
data set. The flow field is built once over 257,049 cells. The coordinate label sweep
projects at most 25 candidate crossings a frame and places at most 8, against a screen
sweep over every crossing in the frame before it. None of it follows the 10,000 systems the map may hold, or the 400 billion the
galaxy has.

**Tests.** The Playwright baseline image changes: the grid is cyan, the band is wider and
the labels lie on the plane. Only `chromium-gpu` holds a baseline image: `chromium-touch`
runs `00-renderer.spec.ts` and `touch.spec.ts` alone and neither takes a screenshot.

**Documentation.** [README.md](../../../README.md) states the handle, the options and the
information panel, and [docs/roadmap.md](../../../docs/roadmap.md) records the decisions
that span phases. Both carry the region band, the grid colour and the overlay ranges, so
both need this change.
