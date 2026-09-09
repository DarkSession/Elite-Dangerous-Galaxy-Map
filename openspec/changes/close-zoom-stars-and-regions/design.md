## Context

Phase 1 draws the galaxy from 2,000 to 120,000 light years with three scene passes and
a tone map. See [proposal.md](proposal.md) for why the map now needs a closer view.

What the design has to work with:

- **The density model.** `src/galaxy-model/model.ts` gives `volumeDensity` and
  `massDensity` from the corrected surface density, and `detailedVolumeDensity` from
  the corrected density refined by the 1024 x 1024 detail grid. Measured with the
  detail grid: 7.9125e-4 solar masses of mass-code-0 budget per cubic light year at
  Sol, 9.4023e-2 at 2,000 light years from the galactic centre and a peak of
  1.64182e-1. The integral over the model bounds is 4.1290e10 solar masses, 1.2 percent
  above the corrected model's 4.0817e10.
- **Camera-relative drawing.** Every pass takes a chunk origin already reduced by the
  camera position in `float64` on the CPU. Phase 1 uses one chunk for the whole point
  cloud; this change uses one chunk per boxel, which is what the roadmap reserved the
  scheme for.
- **The scale gap.** About 400 billion systems, about 1.5 million within 500 light
  years of Sol and about 190 million within 500 light years of the core. A frame can
  draw a few hundred thousand points, so every count is a sample.
- **The point cloud's light.** 2,000,000 samples, each of brightness 60 and 12 light
  years of radius, placed in proportion to the **detailed** volume density:
  `src/scene-data/point-cloud.worker.ts` builds the model with the detail grid and
  `buildSurfaceTable` accumulates `detailedSurfaceDensity`. That is the light budget the
  star field has to match, because the two draw the same space at the handover.
- **The import rule.** `src/scene-data/` must not import `src/render/`, and an ESLint
  rule fails the build on a breach.
- **The baseline image.** `e2e/look.spec.ts` pins the default view at 60,000 light
  years. Nothing this change adds may draw there.

## Goals / Non-Goals

**Goals:**

- A drawn star count that is bounded by a constant, not by the density under the
  camera.
- The same boxel always shows the same stars, whatever route the camera took.
- One light budget across the handover: the light per unit volume of the star field
  equals the light per unit volume of the point cloud, everywhere, from one constant.
- Region boundaries and labels that are an overlay, not part of the scene light, so
  they cannot move the far view's look constants.

**Non-Goals:**

- A star that can be selected, named or addressed. It is a light, not a record.
- Reproducing the game's own star placement inside a boxel.
- Mass code `a`. The base class rule cannot select size class 0 while the zoom stops at
  500 light years, so the finest boxel the field draws is the 20 light year one. A 10
  light year boxel would be 19 pixels at the closest zoom, which is where the class
  would start to earn its cost.

## Decisions

### The counts and the light read the detailed density

The roadmap asks which surface density the star counts read, the detailed one or the
corrected one, and answers "the detailed density is the game's map, so it is the better
budget". This change takes that answer, and takes it for the light as well.

It is not only the better budget, it is the only one that makes the handover work. The
point cloud places its samples in proportion to the detailed volume density. A star
field built on the corrected density would carry a different light per unit volume
wherever the detail grid bites: measured over the two, the ratio is 1.035 at Sol and
runs from 0.52 to 1.76 around the ring at 20,000 light years from the centre, which is
the outer disc's patchiness. On the detailed density the two agree by construction.

The model has no detailed mass density today, so the change adds
`detailedMassDensity(x, y, z)`, the detailed volume density times the same
`mc0_budget_msun_per_ly3_per_unit` constant `massDensity` uses.

### The boxel grid comes from the almanac, the star field does not

`@elite-dangerous-almanac/core` gives the grid the game itself uses:
`astro/galaxy-grid` publishes `GALAXY_ORIGIN` (-49,985, -40,985, -24,105) and
`SECTOR_EDGE_LY` 1,280, and `astro/mass-code` publishes `BASE_BOXEL_LY` 10 and
`boxelEdgeLy(sizeClass)`. Size class `s` has edge `10 * 2^s`, and class 7 is the
sector.

`src/scene-data/boxel.ts` wraps those into the index arithmetic the field needs. The
package supplies constants and pure functions only; it never sees a star.

_Alternative:_ write the arithmetic here and skip the dependency. Rejected because the
codex regions need the package anyway, and two sources for the galaxy origin is one
too many. `astro/codex-region-lookup` publishes the same origin, and the package
asserts the two agree.

### Four size classes draw at once, picked by the zoom distance

The base size class is `s0 = clamp(ceil(log2(distance / 320)), 0, 4)` and the field
draws classes `s0` to `s0 + 3`.

| Distance | Base class | Edges (ly)          | Reach (ly) | Reach / distance |
| -------- | ---------- | ------------------- | ---------- | ---------------- |
| 500      | 1          | 20, 40, 80, 160     | 480        | 0.96             |
| 640      | 1          | 20, 40, 80, 160     | 480        | 0.75             |
| 1,000    | 2          | 40, 80, 160, 320    | 960        | 0.96             |
| 2,000    | 3          | 80, 160, 320, 640   | 1,920      | 0.96             |
| 4,000    | 4          | 160, 320, 640, 1280 | 3,840      | 0.96             |

The reach is a step function of the base class and the zoom distance is continuous, so
the ratio is worst at the top of a class's band. `ceil` puts the band for class `s0` at
`(160 * 2^s0, 320 * 2^s0]`, which holds the ratio between 0.75 and 1.5. `round` would
put the band at `[226.3 * 2^s0, 452.5 * 2^s0)` and let the ratio fall to 0.53, so at a
zoom distance of 900 light years the field would stop at 480 and the near half of the
view to the cursor would be point cloud rather than stars.

The base class is clamped at 4, so above a zoom distance of 5,120 light years the reach
stops growing. That is inside the band where the field is fading out, and it is gone at
8,000.

**The blocks are built from the coarsest class down, not each on its own.** Let `c(s)`
be the index of the boxel of class `s` that holds the camera, on one axis.

1. The coarsest class draws the 8 boxels per axis with indices `c(s0+3) - 4` to
   `c(s0+3) + 3`.
2. It drops the 4 boxels per axis with indices `c(s0+3) - 2` to `c(s0+3) + 1`.
3. The class below draws exactly the refinement of those 4 boxels, which is the 8
   boxels per axis with indices `2 * (c(s0+3) - 2)` to `2 * (c(s0+3) + 1) + 1`.
4. Steps 2 and 3 repeat down to the base class, which drops nothing.

Building the blocks downward is what makes the nesting exact. A block of 8 boxels
centred on the camera's own boxel at each class independently does **not** nest: the
8 child indices `c - 4` to `c + 3` cover 4 parents only when `c` is even, and 5
otherwise, which leaves a gap or an overlap at almost every camera position. Refining
the parent's inner 4 boxels instead always gives 8 child boxels, and the camera is
always inside them.

Each class draws 512 boxels and each class above the base drops 64, so the drawn set
holds `512 + 3 * 448 = 1,856` boxels at every view. Checked over 50,000 random camera
positions and base classes: no gap, no overlap, the camera inside every block, and the
camera 3 to 4 boxels of the coarsest class from the nearest face, so the field covers a
sphere of radius `3 * edge(s0+3)`.

_Alternative:_ one class chosen by distance, cross-faded with the next. Rejected: one
class cannot be both fine in the foreground and cheap at the reach.

_Alternative:_ a screen-size rule that subdivides a boxel while its edge covers more
than N pixels. Rejected: the drawn count then depends on the view, and the bound the
proposal has to state would be a measurement rather than a constant.

### The count and the light are separate

This is the decision the rest of the star field hangs on.

**The count** in a boxel is how many stars the game would put there:
`detailedMassDensity(centre) * edge^3 * calibration`, where the calibration is in
systems per solar mass of budget. It sets how many points the field draws, and nothing
else.

**The light** of a boxel is what the far view already draws there:
`STAR_LIGHT * detailedMassDensity(centre) * edge^3`, with one constant

```
STAR_LIGHT = pointBrightness * pointRadiusLy^2 * pointCount / massIntegral
           = 60 * 12^2 * 2,000,000 / 4.1290e10
           = 4.185e-1
```

`massIntegral` is the integral of `detailedMassDensity` over the model bounds, computed
once by numeric integration and carried as a constant with its own unit test. Because
the point cloud places its samples in proportion to the same density, the expected point
cloud light in a volume is exactly the boxel's light, **at every density**, and the
handover cannot show a step.

Tying the light to the count instead would not work: the calibration falls with the
density, so a light proportional to the count would be too dim in the core by the same
factor. Separating them keeps one constant doing one job.

A boxel draws `n = min(256, round(count))` stars, each carrying `light / n`. The cap is
what bounds the frame:

```
1,856 boxels * 256 stars = 475,136 point sprites, at every view
```

**The calibration** is a ramp on the logarithm of the detailed mass density: 4.8 systems
per solar mass at the density of the disc at Sol, falling linearly in the logarithm to 1
at the model's peak density, held flat outside that range. At Sol this gives 3.798
systems per 1,000 cubic light years against the roadmap's measured 3.8, and 15,592
systems within 100 light years against its measured 16,000. The roadmap also records
"about 4 systems per solar mass in the disc"; 4.8 is the value that reproduces the
neighbourhood counts, and the roadmap's calibration line is corrected to it.

Two figures do not reconcile and the change accepts it. The ramp gives 1.49 million
systems within 500 light years of Sol against the roadmap's measured 2 million, and
9.23e10 over the whole model against the game's stated 400 billion. The first gap is the
model's own vertical fall-off: the roadmap's two neighbourhood figures together imply a
near-uniform 3.8 systems per 1,000 cubic light years over the whole 500 light year
sphere, and the model averages 2.84 over it because the density drops away from the
mid-plane. The second gap sits in the dense core, where the calibration falls to 1 and
where every boxel is capped anyway, so no drawn count changes. The 100 light year figure
is the one the closest zoom shows most of, and the ramp is fitted to it.

_Alternative:_ a global budget shared over the visible boxels in proportion to their
counts. Rejected: the count in a boxel would then depend on what else is on screen, so
the same boxel would not always show the same stars.

### A star's radius follows the spacing, and its light does not follow its radius

Where the cap bites, one star stands for many. A sprite of a fixed radius would then be
a hard bright point where the field means a wash. The radius in light years is therefore
`STAR_RADIUS_FRACTION * edge / n^(1/3)`, a fixed fraction of the mean spacing of the
stars the boxel actually draws. Measured on the shipped constants, that is a factor of
31 between a complete 20 light year boxel at Sol and a capped 1,280 light year boxel at
the core: the first draws sharp points, the second soft wide ones that read as a wash.

The point pass gets away with `brightness * wanted^2 / size^2` because every sample
shares one radius, so the radius is baked into the constant 60. The star pass cannot:
a factor of 31 in radius is a factor of 900 in deposited light if the brightness only
corrects the size clamp. The star brightness is therefore

```
brightness = lightPerStar * focal^2 / (range * size)^2
```

where `focal` is the pixels per light year at one light year of range and `size` is the
on-screen size after the clamp to 1 to 16 pixels. The sprite then deposits
`lightPerStar / range^2` times a fixed constant, whatever its radius and whatever the
clamp does — inverse square while the sprite is at the clamp, constant surface
brightness while it is resolved, which is what a real source does.

### The brightness of a star carries a spread, and the mean of the spread is 1

The field's grain and the light it shows on screen pull against each other. The handover
pins the linear light the field adds, and the tone map is concave, so the displayed sum
of a fixed light is largest when the light is spread evenly over pixels and smallest
when it sits on few. Grain is the opposite arrangement of the same light. A wider star
therefore raises the mean and lowers the grain, and no radius clears both thresholds the
spec sets.

A per-star spread of brightness moves the frontier out. The shader takes a fourth value
from the same hash that places the star and multiplies the brightness by
`(0.3 + 3 * u^4) / 0.9`, whose mean over `u` in 0 to 1 is 1, so a boxel's light does not
change. `src/render/shaders/points.vert` already does this for the point cloud, with a
harder shape.

The shape is the mild one on purpose. A boxel draws at most 256 stars, so the spread's
own scatter divided by the square root of the count is the scatter of the boxel's drawn
light. The point cloud's harder shape, `(0.05 + 12 * u^16) / 0.755882`, has a standard
deviation of 2.6 times its mean, which puts a boxel 16 percent out and the worst of
1,856 boxels 67 percent out; that is a checkerboard at the boxel scale. The mild shape
has a standard deviation of 0.89, which is 5.6 percent per boxel. The point cloud can
afford the harder shape because its 2,000,000 samples are not grouped into boxels.

### The CPU owns the boxel table, the GPU owns the star positions

Per frame the CPU writes one record per boxel: the boxel origin **less the camera
position, computed in `float64`**, the edge, the drawn count, the light per star, the
star radius, the population zone and the boxel seed. That is 1,856 * 9 values, 66,816
bytes or 65 KiB, uploaded with `bufferSubData`.

The seed is the ninth value because the shader cannot recover the boxel's address on
its own. `gl_InstanceID` is only the slot in the table, and the camera-relative origin
carries no grid index. The CPU therefore hashes the grid index and the size class into
one 32-bit seed, `boxelSeed(index, sizeClass)`, and the shader hashes that seed with
the star index. The seed reaches the shader as an unsigned integer attribute, not as a
`float32`, because a `float32` holds only 24 of its 32 bits.

The pass is one `drawArraysInstanced(POINTS, 0, 256, 1856)` call. `gl_InstanceID` is
the boxel, `gl_VertexID` is the star index inside it. The vertex shader hashes the seed
and the star index into three values in 0 to 1 and places the star at
`origin + u * edge`. A vertex whose index is at or above the boxel's drawn count gets a
size of 0 and a position behind the camera.

Two consequences fall out:

- **Precision.** Every number in the shader is a camera-relative offset of at most
  8,000 light years, where `float32` spacing is 9.8e-4 light years. The drawn position
  is far inside the 1/32 light year the game resolves to, and far inside a pixel at
  every view. This is why the roadmap reserved one chunk per boxel for this phase.
- **Determinism.** A star's position depends on the boxel index and the star index
  only. Neither depends on the camera, so the same boxel always shows the same stars.

The counts are cached by boxel index and recomputed only when the set changes, which is
when the camera crosses a boxel of any drawn class. The recompute is at most 1,856
density evaluations, measured at 0.75 ms warm, and at the closest zoom it happens a few
times a second.

_Alternative:_ generate the positions on the CPU into a large buffer. Rejected: 475,136
positions rewritten whenever the camera crosses a boxel is far more work than 1,856
records rewritten every frame.

_Alternative:_ read the count in the shader from the density volume texture. Rejected:
the volume is 390 light years per texel, which is 20 times the smallest boxel, and the
count would then be untestable outside a browser.

### The handover is one weight, so the light cannot double or drop

The renderer computes two radii per frame: `inner = 3 * edge(s0+2)` and
`outer = 3 * edge(s0+3)`. The outer radius is the sphere the field is proved to cover,
and the inner one is half of it, so the whole fade band lies inside that sphere and the
field is complete everywhere the fade applies. The coarsest class's nearest face sits
between `2 * edge(s0+2)` and `4 * edge(s0+2)` from the camera depending on where in its
boxel the camera is, so the inner radius is not that face; it does not need to be,
because whichever class covers a range inside the sphere covers it in full. It also computes a global weight `w`, which is 1 at a zoom
distance of 4,000 light years and below, 0 at 8,000 and above, and smooth between.

- A star's brightness carries `w * (1 - smoothstep(inner, outer, range))`.
- A point cloud sample's brightness carries `1 - w * (1 - smoothstep(inner, outer, range))`.

The two are one minus the other by construction, so their sum is exactly 1 at every
range and every view. With the equal light per unit volume above, that makes the total
light continuous across the handover rather than only the weights. Above 8,000 light
years `w` is 0, the point pass is untouched, and the baseline image at 60,000 light
years cannot move.

_Alternative:_ fade the whole point pass by the zoom distance. Rejected: the distant
galaxy would lose its grain at close zoom, and the frame at 500 light years still shows
the disc out to the horizon.

### Regions are an overlay drawn after the tone map

The boundary lines and the labels are not scene light. The lines draw to the default
framebuffer after the tone map, with alpha blending, so their colour is exact and no
look constant of the far view can change them or be changed by them. The labels are DOM
elements in an overlay `div` over the canvas.

**The boundary trace.** `astro/codex-region-lookup` resolves a plane position to one of
42 regions on a grid of 4,096/83 = 49.3494 light years. A worker fills the 2,027 x 2,027
grid over the model bounds by calling `findCodexRegionAt` at each cell centre, then
emits a line where two neighbouring cells hold different region ids, merging collinear
neighbours into one run. A cell outside the mapped grid counts as its own id, so the rim
of the codex map draws: 1,159,000 of the 4,108,729 cells resolve to no region, and
dropping the region-against-none edge would cut the trace from 38,563 unit segments to
29,631 and lose the outline of the map. Measured on the shipped 0.2.8 data: 143 ms to
fill, 38,563 unit segments, 22,513 merged runs. Two endpoints of three `float32` each is
540,312 bytes, that is 528 KiB, uploaded once.

**The zoom band.** Lines and labels fade in from 30,000 light years, full at 20,000.
The lines fade out again from 3,000 light years, zero at 2,000, because below 3,000 one
grid cell covers more than 15 pixels and the boundary reads as a staircase rather than a
line. Labels stay to the closest zoom.

**Label placement.** The visible plane area is the axis-aligned box of the plane points
under the four viewport corners and the centre, with each ray's point held to 8 times
the zoom distance from the cursor so a near-horizon ray does not make the box infinite.
A region is a candidate when its own bounds meet that box.

The anchor is the projection of the region's centroid at `y = 0`. A centroid behind the
camera has a negative `w`, and dividing by it puts the anchor on the opposite side of
the frame from the region. Negating the whole clip position does not help, because
`-x / -w` is `x / w`; the fix is to negate the two screen axes and not `w`, or to negate
the result of the divide. Worked through the scenario's own view,
`#c=0,0,0&d=500&p=35&y=180`, the Inner Orion Spur centroid has `w = -2,614`: without the
flip the anchor lands above and left of the frame, with it the anchor lands below and
right, which is where the region is. This is not a corner case — at 500 light years
inside a region the centroid is often thousands of light years behind the camera.

The anchor is then held inside the viewport with a 48 pixel inset, so the region the
camera sits inside keeps a label at the frame edge. The candidate whose centroid is
nearest the cursor is placed first, and the rest follow largest footprint first. A label
that would overlap a placed one is dropped, and at most 12 are placed. The nearest
centroid goes first because a pure largest-first order never names the region the view
is centred on: at a view of the galactic centre 33 regions are candidates and the
`Galactic Centre` is the smallest of them, so the cap of 12 is reached long before it.

_Alternative:_ draw the labels into the canvas. Rejected: text in WebGL needs a glyph
atlas, and a DOM label is readable by the browser test without a pixel measure.

### The far view's pass requirement keeps its name

`far-view-rendering`'s requirement is titled "Three scene passes and a tone map compose
the far view", and its body now names the star pass and the region overlay as well. The
title stays. A requirement's header is its identity in an OpenSpec delta, so a rename
costs a REMOVED and an ADDED pair that drops the requirement from the main spec and puts
it back, which is a large and noisy delta for a title. The title also stays true of the
far view itself. The star weight is 0 at every zoom distance above 8,000 light years, so
the star pass adds no fourth scene pass there. The region overlay is not a scene pass at
all: it draws after the tone map, and it draws nothing at 30,000 light years and above,
which is where the default view and the baseline image sit. Three scene passes and a
tone map are what compose the far view.

### The dependency and its terms

`@elite-dangerous-almanac/core` is pinned to an exact version. It is pre-1.0 and expects
breaking changes. Every measurement in this design comes from 0.2.8, which the 7-day
hold released on the day this was written; 0.2.11 is already published and three
releases ahead, so the version the hold resolves at implementation time may differ and
the trace figures are re-measured if it does. Four leaves are imported:
`astro/galaxy-grid`, `astro/mass-code`, `astro/codex-region` (about 9 KiB) and
`astro/codex-region-lookup` (199 KiB, worker only). The package is ESM, has no
dependencies and marks itself side-effect free.

`astro/galaxy-grid` is imported for two constants, but its module also reaches the
procedural naming tables, which come from EDTS under BSD 3-Clause and whose terms
require the licence text in full. Tree-shaking should drop them. The change does not
assume it: a task greps the built bundle for those tables after `pnpm build`, and the
notices file gains the BSD text if they survive.

The package's own code is MIT. The codex region tables come from klightspeed's
EliteDangerousRegionMap, also MIT, and the game data behind them falls under Frontier's
media-usage rules, which are non-commercial. This map is a non-commercial fan project,
so the terms hold, and the change adds `THIRD_PARTY_NOTICES.md` to the repository root
naming all of them.

## Risks / Trade-offs

- **2.5 million points per frame.** The star field's 475,136 sprites join the point
  cloud's 2,000,000. The worst fill is not the closest zoom but 4,000 light years, where
  the star weight is still 1, the coarsest class is the 1,280 light year sector, nearly
  every boxel is capped and the radius by spacing puts most sprites at the 16 pixel
  clamp: roughly 9e7 additive fragments, about 45 full-screen overdraws. The cloud pass
  is no help there, because it fades out only below 6,000 light years and draws in full
  above 12,000. → The frame budget test adds 500, 1,000 and 4,000 light years at both
  cursors. If a view misses 16.7 ms, the levers in order are the 16 pixel size clamp,
  the radius fraction and the cap of 256.
- **One star can stand for a million systems.** At a zoom distance of 4,000 light years
  with the cursor near the core, a 1,280 light year boxel holds 2.755e8 systems, so each
  of its 256 stars carries 1.076e6 of them and deposits 37 times the light of one point
  cloud sample, which the tone map takes to white. → The radius by spacing makes those
  stars wide and soft rather than hard points, and the volume pass draws the wash under
  them, but the core will read as a scatter of bright blobs rather than a smooth field.
  The levers, in order: the cap, the radius fraction, and dropping the coarsest class
  where the density is above a threshold. The browser test measures the grain, not the
  count, so a change of lever does not rewrite the suite.
- **The calibration does not reconcile at galaxy scale.** 9.23e10 systems against the
  game's 400 billion, and 1.49 million within 500 light years of Sol against a measured
  2 million. → Accepted and stated above, with the cause of each. The calibration is one
  function with its own unit test, so a better measurement is a one-file change.
- **The boundary is a staircase at 49 light years.** The data has no finer resolution.
  → The lines fade out below 3,000 light years, where the steps would read as steps.
- **A line is one device pixel.** WebGL2 guarantees no other line width, and the
  drawing buffer runs at up to twice the CSS pixel ratio, so a boundary can be half a
  CSS pixel wide. → Accepted for this change. Instanced quads are the fix if it reads
  too faint.
- **A pre-1.0 dependency.** A patch release can change an export. → The version is
  pinned exactly, the four leaves are wrapped in `src/scene-data/`, and a unit test
  asserts the two constants the map depends on: the galaxy origin and the sector edge.

- **The main thread builds a second model before the first frame.** The star field's
  counts read the detailed density, so the main thread fetches and decodes the
  1024 x 1024 detail grid and builds a `GalaxyModel` that carries it, as
  `point-cloud.worker.ts` does. That work sits inside the window
  `far-view-scene-data`'s "Main thread stays responsive" scenario measures, and the
  requirement names workers rather than a main-thread build. The scenario passes in the
  suite. It fails when that spec runs alone in a cold browser, at 373 to 392 ms against
  its 100 ms limit, but it fails there before this change as well, at 301 to 342 ms: the
  long task is the main bundle's module evaluation and it grows with the bundle. This
  change makes a pre-existing defect worse and does not cause it. The defect belongs to
  the test's own premise, which measures a warm browser, and it is reported separately.

## Migration Plan

No data migration. The zoom limit only widens, so every stored URL fragment still
loads and normalises to the same view it did before. Rollback is the revert of the
change: the two new passes and the label overlay are additive, and the point pass's
range fade is inert while the star field's weight is 0.

## Open Questions

- Whether the volume ramp by density and the point ramp by zone unify into one ramp.
  The roadmap carries this across phases; the star field reuses the point ramp
  unchanged, so the answer does not change any requirement here.
- Whether a decoration star ever gets a name, for example the sector name under the
  cursor. Phase 4 owns the HUD, and nothing here places text on a star.
