## Context

See [proposal.md](proposal.md) for the six faults and why they are one change.

Four facts of the tree shape everything below.

1. **The region boundary is a raster and nothing can make it truer.** The map traces the
   region grid at 49.3494 light years, which is `CODEX_REGION_MAP_LY_PER_CELL`, the game's
   own cell. There is no finer answer to find. The smoothed set already departs from the
   trace by 49.342 of a 49.3494 light year bound, so it has spent the whole budget the
   data's resolution allows, and no further smoothing is available inside the spec.
2. **The overlay is DOM, not GL.** The region labels, the marker names, the selection pin
   and the hover ring are all elements in one overlay. The map has no font in a shader and
   no text layout of its own.
3. **The label sweep and the region worker already share the coarse grid.** The worker
   builds a 507 by 507 grid of region ids, 251 KiB, and transfers it. The sweep reads it on
   the main thread, about 2,000 times a frame.
4. **`src/hud/` may not import `src/render/`, `src/scene-data/` or `src/camera/`.** The HUD
   reads the public handle of `src/app/create-map.ts` and nothing else, and ESLint fails the
   lint on a breach.

## Goals / Non-Goals

**Goals:**

- One mechanism for putting DOM content on the galactic plane, used by both the coordinate
  labels and the cursor marker.
- One owner for each look rule, read by both the shader and the DOM placement, so a number
  and the line it sits on cannot disagree.
- A region label that cannot stop for good, whatever shape its region has.
- One fade rule for a boundary and for the name that names it, so the two never part
  company at a zoom.
- An exact region for one named system, without the region table entering the main bundle.

**Non-Goals:**

- Text rendering in GL. Every label stays DOM.
- A new smoothing stage for the boundary. The smoothed set is untouched.
- Path-finding on the fine region grid. The flow field is built on the coarse grid the
  sweep already reads.
- Any change to how the cursor moves or what bounds it holds. The marker says where the
  cursor is; it does not restrict where it may go.

## Decisions

### 1. The band replaces the blur, and the width is a share of the viewport

`regionBlurRadiusCss`, `regionBlurSigma`, `regionBlurTaps`, the two blur targets, the peak
uniform and `region-blur.frag` all go. `region-pass.ts` gains
`regionBandHalfWidthCss(viewportHeightCss)`, which returns
`clamp(0.016 * height, 8, 24)`.

**Why the blur goes.** Its purpose is to round the staircase of a 6 CSS pixel line. Two
readings say a 34.6 CSS pixel band does not need it, and both rest on the range fade, which
draws no line nearer than 10,000 light years.

The first decides it: `regions.frag` computes an exact distance to the **segment** and blends
with `MAX`, so a 90 degree corner is already a round turn of radius `halfWidth`, 17.28 CSS
pixels at 1,080 rows. A Gaussian of standard deviation 1 to 2.667 cannot round it further.

The second is the staircase itself. One cell measures `46,157 / range` CSS pixels at 1,080
rows, and the nearest range that draws is 10,000 light years, where a cell is **4.62** against
a band of 34.6, which is 0.133 of it. The old 6 CSS pixel band had to blur that same 4.62
pixel step because it was three quarters of the whole line.

**Why a share and not a fixed number.** Every other look constant in the tree is a fixed CSS
number, and for a 6 CSS pixel line that is right. At 34.6 it is not: a fixed band would
cover a tenth of a 360 row window. The clamp at 8 and 24 keeps both ends sane, and it is
stated in half widths so `uHalfWidth` takes it directly.

**Alternative considered: keep the blur and recompute the table.** Rejected. Over a
triangular ridge of half width 17.28 a Gaussian lowers the peak by about `0.798 * sigma / w`,
which is 4.6 per cent at sigma 1 and 12.3 per cent at sigma 2.667. That is a real change, so
the table would have to be recomputed in full; what it would buy is rounding a corner that
`MAX` and the exact segment distance already round, at the cost of two full-screen passes,
two extra targets and a normalisation the spec spends 100 lines pinning.

### 2. The range fade keeps 10,000 and 20,000 light years

An earlier draft of this change lowered `REGION_RANGE_NONE` to 250 and `REGION_RANGE_FULL`
to 1,000, so that the overlay would draw at a camera near the galactic plane. **The owner
decided to keep the figures as they are**, and this design follows that.

Two things follow from the decision, and both are deliberate.

**The overlay still draws nothing at a camera near the plane.** The fade reads a **per-pixel
range to the plane**, and the camera's height above `y = 0` does not follow its distance to
the cursor once the cursor leaves the plane. At the reported view
`c=1840.85884,-15539.75557,16507.94703&d=20016.72348&p=58.57998&y=24.66002` the camera sits
1,542 light years above the plane; the plane pixel under the cursor reads 1,542, the top
centre row reads 3,223 and the top corners about 4,300, all under the floor, so **at that
zoom** no part of the boundary draws. A zoom changes the camera's height as
`0.8533 d - 15,540`, so between about 24,000 and 29,000 light years the top rows do read
past 10,000 while the zoom fade is still partly open, and a band of about 0.07 alpha comes
back along the top of the frame. Nothing a user would steer by. What that view is
missing is not the boundary but any sign of where the cursor is, and the cursor marker of
decision 9 is the answer to it.

**The band's width is what carries the whole case for dropping the blur.** Keeping the floor
at 10,000 light years is what makes that case sound: the largest cell that can reach the
screen is 4.62 CSS pixels, against a band of 34.6. Had the floor gone to 250, a cell at
1,000 light years would measure 46.2 CSS pixels, wider than the whole band, and the traced
set would have read as the staircase it is in the new default mode.

**Alternative considered: read the camera's height above `y = 0` once per frame instead.**
Rejected on its own merits as well as by the decision. A per-frame reading cannot tell a line
near the horizon from one under the cursor, which is the fault the per-pixel fade was
introduced to fix in the change before this one. The scenario "A far line still draws while
the near line is gone" reads at a pitch of 30 degrees and would fail such an implementation.

### 3. The flow field: one byte per coarse cell, built by breadth-first walk

`region-lines.ts` gains `buildRegionFlow(coarse)`, returning a `Uint8Array` of
`size * size`. The worker sends it beside the two boundary sets and the coarse grid, in the
same message and the same transfer list.

**The encoding.** 0 to 7 name the eight neighbours, clockwise from `+x`. 8 means the cell is
the end of a path. A cell with no region takes 8, and so does a cell of a region the walk
never reached, which is a patch with no path to the centre. A unit test counts those and the
spec states the count is 0 on the shipped data, so a package release that splits a region
fails a test rather than freezing a label.

**The build.** For each region id, find the coarse cell holding that region's centroid; where
the centroid's own cell is not on the region, take the cell of the region nearest it. Push
that cell as the root, then walk breadth-first over the eight-neighbourhood, never leaving
the region id. Each cell reached writes the direction **back** to the cell that reached it.
The root writes 8. Every region is walked from one root, so a cell the walk never reaches is
in a patch with no path to the centre, and it keeps 8.

**Why one array for 42 regions.** A coarse cell holds exactly one region id, and the step it
carries is a step inside that region, so the 42 fields never overlap. One array of 257,049
bytes, which is 251 KiB, serves all of them, against 42 of the same, which is 10.3 MB.

**Why the coarse grid and not the fine one.** The sweep reads the coarse grid for everything
else, so a field on a different grid could disagree with it about which region a point is
in. The field is also a **direction**, not a position: the label's step size still comes from
`anchorStep`, and only its heading comes from the field, so a 197.4 light year cell is fine.

**How the label uses it.** In `smoothTarget` and in `filterAnchor`, where the straight step
lands off the region, read the field at the carried point's cell, turn the direction into a
plane vector (the neighbour cell's centre less this cell's centre, normalised), and take a
step along it of the same **screen** length the straight step asked for, solved by the same
share loop `filterAnchor` already runs. The label therefore moves at the same speed it
always did; only its heading changes.

**Alternative considered: a stall timer that takes the target whole after N frames.**
Rejected. It fixes the freeze by introducing the jump the whole filter exists to prevent.

**Alternative considered: a fan of trial directions each frame.** Rejected. It is a greedy
local search that sits in a pocket of a concave region, which is the same freeze with more
code.

### 4. The label takes the boundary's own fade, read once at its anchor

`labelFade(distance)` loses its close step and becomes `1 - smoothstep(20000, 30000, d)`,
which is exactly `regionFade`, so `labelFade` calls it rather than holding a second copy.
Each label then multiplies that by `smoothstep(REGION_RANGE_NONE, REGION_RANGE_FULL, r)`,
where `r` is the camera's distance to that label's own plane anchor. Both constants come
from `region-pass.ts`, as `labelFade`'s already do, so no copy is made.

`REGION_CLOSE_NONE` and `REGION_CLOSE_FULL` then have no reader and go with the close step.
`regionFade` stopped reading them in the change before this one; `labelFade` was the last.

**Why the anchor and not per pixel.** The composite pass reads the range per pixel because
a band of pixels holds many plane points. A label holds one: it is a DOM element with one
opacity, naming one place, and the placement already carries that place as a plane point.
Reading the fade there gives the label the strength the boundary has under it.

The rule this replaces rejected a range fade for labels on the grounds that a box of text
100 CSS pixels wide "would be taken away on one side and kept on the other". That is an
argument against a per-pixel fade applied to a box. It does not reach a fade read once at
the anchor, which is what a single `opacity` can carry.

**What it costs.** The region the camera sits in has its anchor near the cursor, so it is the
first label to go as the user zooms in rather than the last. That is a real loss and it is
the point: at a zoom of 10,000 light years the boundary near the cursor already draws
nothing, so the name stood over a frame with no line under it. The HUD's top bar names the
region under the cursor at every zoom, so the name moves to the bar and is not lost.

**The sweep's skip gate has to move with it, and it stays a conjunction.** `labels.ts:1339`
gates the sweep on `labelFade(view.distance) > 0`, which after the close step goes is
`regionFade(d) > 0`. That half stays: it is what keeps the default 60,000 light year view
from paying 2 milliseconds a frame for labels that would all read 0. The half that goes is
the floor of 5,000 light years, which was where the old fade reached 0 and now means nothing.

Its replacement is the **greatest range to the plane the frame holds**, which the camera
gives in constant time: unproject the frame's two **top corners**, intersect each with
`y = 0`, take the greater, and take a miss as beyond. The corners and not the top centre —
at the fault-1 view the centre reads 3,223 light years and the corners about 4,300, so a
gate on the centre under-reads by about a third. The sweep runs when the zoom fade is above 0
**and** that range is above `REGION_RANGE_NONE`.

The new half is strictly better than a zoom floor, because it reads the pitch. At a pitch of
89 degrees and a zoom of 4,000 light years the top corner ray meets the plane at 6,243 light
years, the whole frame is inside the floor and the sweep is skipped. At a pitch of 35 degrees
and the same zoom the top edge meets the plane at about 26,300, names do draw far up the
frame, and the old floor wrongly skipped it.

**A label whose opacity reads 0 is left out of the overlay** rather than placed transparent.
Several surviving scenarios count the labels on the page, and an invisible element in the
overlay would make each of them read something other than what its author meant. It also
saves the placement work.

**Alternative considered: give the label the range of the pixel under its anchor from the
coverage buffer.** Rejected. It would read the boundary's own alpha rather than the fade, so
a label whose anchor is not on a line would read 0 — and an anchor is almost never on a line,
because the box rule pushes it away from its region's edge. It also puts a GPU read-back on
the main thread in every frame. The anchor's range is a `float64` subtraction the placement
already has the operands for.

### 5. The exact region comes from a dynamic import, not a worker and not a bigger grid

`create-map.ts` gains `regionNameAtExact(point)`. It holds a module-level
`Promise<typeof import(...)> | null`, created on the first call:

```ts
let lookup: Promise<CodexRegionLookup> | null = null;
const load = (): Promise<CodexRegionLookup> =>
  (lookup ??= import('@elite-dangerous-almanac/core/astro/codex-region-lookup'));
```

Vite emits the 199 KiB table as its own chunk, so the main bundle is unchanged and a map
that never asks never fetches it. A second call while the first load runs awaits the same
promise.

**Alternative considered: ask the region worker.** Rejected. `runWorker` terminates each
worker on its first response, so an exact query needs a long-lived worker, a request and
response protocol and a lifetime to manage, for one lookup per selection.

**Alternative considered: transfer the full 2,027 by 2,027 grid, 4.11 MB.** Rejected. It
makes every map pay 4.11 MB of resident memory for a reading the information panel takes
once per selection.

**Why the panel does not use `regionNameAt`.** The coarse cell is 197.4 light years. A top
bar that names the neighbourhood under a moving cursor can carry that; a panel that states
one system's region as a fact cannot, because a user has no way to tell a wrong answer from
a right one.

### 6. The plane overlay is a CSS `matrix3d` holding the exact homography

A new module `src/app/plane-overlay.ts` places an element on a plane of constant `y`.

Given an anchor, a size on the plane and the plane's `y`, it projects the four corners
camera-relative in `float64`, then solves the 3 by 3 homography `H` that maps the element's
own corners, in its local CSS pixel box, to those four screen points. The solve is the
standard 8 by 8 linear system of the direct linear transform, with `h33` fixed at 1. `H`
goes into `matrix3d` as the columns `(h11, h21, 0, h31)`, `(h12, h22, 0, h32)`,
`(0, 0, 1, 0)`, `(h13, h23, 0, h33)`, with `transform-origin: 0 0`.

**Why not an affine approximation.** `grid-labels.ts` already reads the projection's local
rate at a crossing, and a scale and shear built from it would be one matrix write and no
solve. It is wrong across the element's own width: an affine map keeps a rectangle's far
edge the same length as its near edge, and a label a whole grid cell wide then parts company
with the lines it sits between. The homography is exact and costs one 8 by 8 solve.

**Why not SDF text in GL.** It would need a font atlas, a shader, a text layout and a
baseline of its own, and the project's stated reason for DOM labels is that they stay crisp
vectors at every device pixel ratio with no font in a shader.

**The host carries no `perspective`.** The matrix supplies its own, and a host perspective
would apply a second, unrelated projection over it.

**Culling.** A corner at or behind the near plane, a back-facing quad, a bounding box wholly
outside the viewport, or a singular solve all drop the element. The near-plane case matters:
a quad with corners on both sides of the camera has no single projected quadrilateral, and a
homography solved through such a corner wraps the element across the frame.

### 7. The grid darkens instead of tinting, and one module owns both rules

`grid-pass.ts` keeps `gridBackgroundWeight` with a new floor and replaces
`gridBackgroundTint` with `gridBackgroundColour(luminance, light, deep)`, which returns
`mix(light, deep, merge)`. `grid.frag` takes `uColorLight` and `uColorDeep` in place of
`uColor` and `uTintMax`, and drops the background **colour** sample, keeping only its
luminance. `grid-labels.ts` calls the same two functions with the label's own pair, exactly
as it calls the line's pair today.

**Why darkening and not a hue swap alone.** A cyan line mixed 60 per cent toward the cream
core is a grey-blue at 13 per cent alpha, which is no more findable than the orange was. The
tint is the mechanism that destroys the contrast, so the tint has to go. Darkening keeps one
hue at both ends and holds contrast by luminance: 0.744 over a 0.05 background, 0.254 under
a 0.93 one.

**A second benefit.** The region band is warm cream and the grid is now the only cool line
in the frame, so the two overlays are told apart by hue rather than by width.

### 8. The coordinate labels: two levels, a reach fade, and text on the plane

`grid-labels.ts` keeps its sweep and its two gates, and changes what it places.

- The level set falls from six to `[100, 1000]`. `gridLabelLevel` returns 100 while the 100
  level's screen spacing at the cursor is at least 400 CSS pixels, and 1,000 otherwise.
- The candidate ring falls from 8 spacings to 2, which is 25 crossings rather than 289, so
  the per-frame sweep gets cheaper rather than dearer.
- The reach fade is `1 - d / (1.2 * spacing)`, clamped at 0, where `d` is the plane distance
  from the cursor. It multiplies the opacity beside the line factor and the background
  weight.
- The text is `x : y : z` with a thousands separator, the `y` being the plane's own, rounded
  to a whole light year.
- The element is placed through `plane-overlay.ts`, sized so its cap height on the plane is
  one tenth of the level's spacing. The two small steps the gate already takes along the
  game axes give the plane basis the placement needs, so the sweep reads them once.
- The plane label at the lower edge goes, and `PLANE_LABEL_BOTTOM_CSS` with it.

**Why 1.2 spacings.** A reach of exactly one spacing takes a crossing's label to 0 at the
moment the cursor reaches the far edge of the next cell, which is when the user is furthest
from every other crossing, so the numbers all go out together. 1.2 carries a crossing through
that edge. It also gives 0.25 at 90 light years on the 100 light year level, which is the
reading this change is specified against.

**The label's width has to be bounded against the spacing.** `x : y : z` runs to about 20
characters, so at a cap height of one tenth of the spacing the text is about 1.4 spacings
wide and every label crosses its neighbours. The placement measures the text once per level,
as the region labels measure each name once, and takes the **lesser** of one tenth of the
spacing and the height that holds the measured width to **0.6** of a spacing.

The width share is 0.6 and not 1. A label bounded to a whole spacing fills the width of its
own cell, which the owner read as too large; 0.6 leaves the number clearly inside the cell it
names and gives a cap height of about a twenty-third of the spacing. The one tenth ceiling
then binds only a text under six cap heights, which no crossing label is, so it is a guard
and not the rule that sets the size.

### 9. The cursor marker is one plane-overlay element holding five shapes

`src/app/cursor-marker.ts` builds one SVG element with a 160 by 160 view box: a ring and
four arrows, the three extra arrows being the first rotated by 90, 180 and 270 degrees. The
element is placed by `plane-overlay.ts` at the cursor, on the cursor's own plane, sized so
the box's side on the plane is the light years that 96 CSS pixels cover along the screen's
horizontal at the cursor.

It is one element and not five, so the overlay writes one transform a frame.

The overlay's stacking puts plane elements under upright ones, so a selection pin, a hover
ring, a marker name or a region label at the same place draws over the marker.

## Risks / Trade-offs

**Transformed text can rasterise blurry.** → Chromium rasterises a transformed element at
the composited scale, and text scaled **up** by a `matrix3d` goes soft. The placement sizes
the element's local box so that the transform mostly scales **down**: the element is built
at a local font size near the largest it is drawn at, and shrunk. Where that is not enough,
`will-change: transform` promotes the element and forces a fresh raster. The scenario "A
label lies on the plane" reads the geometry; a blurry label is a look fault, so the
Playwright baseline is what catches it.

**A smaller label is softer, and the guard reads that rather than a placement fault.** The
edge contrast of the plane text against the same text upright measures 0.922 at a width
share of 1, and about 0.805 at the share of 0.6 this change ships. Raising the element's own
font size by an octave moves the reading from 0.809 to 0.813, so the loss is resampling of a
small glyph and not under-sampling of the source. The guard's bound is therefore 0.75, which
still catches a gross blur in the placement, and the crispness of the number is a size
decision the owner owns.

**The dynamic import needs a bundler that splits chunks, and it breaks a stated bound.** →
`library-package` says the region cell lookup is "in the region worker chunk alone", and
`tests/main-bundle.test.ts` asserts exactly one carrier chunk. The import adds a second, so
the change carries a `library-package` delta that restates the rule as: in no entry chunk, in
no chunk the entry chunk imports at load. It does **not** state how many chunks carry it,
because that follows the build: `vite.config.lib.ts` marks the core package external, so the
library build's only carrier is the region worker's chunk, while a build that bundles the
package carries it in the worker's chunk and one lazily loaded one. Task 4.2 updates that test rather than only adding a new one. A host that
consumes the library build gets one more file to serve, and the alternative is 199 KiB in
every main bundle.

**A user who zooms in loses the region name from the map before they expect to.** → The
region the camera sits in is the first label to go, not the last, because its anchor is
nearest. The HUD's top bar carries the name at every zoom and the change does not touch it.
The alternative is what the map does today, which is a name with no line under it. The owner
asked for the two to fade together.

**The Playwright baseline changes in both projects.** → The grid is cyan, the band is six
times wider and the labels lie on the plane, so the `chromium-gpu` baseline needs
regenerating. `chromium-touch` holds none: it runs `00-renderer.spec.ts` and `touch.spec.ts`
alone and neither takes a screenshot.

**A passing baseline is not evidence that the look is unchanged.** `e2e/look.spec.ts` allows
`maxDiffPixelRatio: 0.02`, and the cursor marker, the cyan grid and the wider band together
change fewer pixels of the default far view than that, so the old baseline still passed
against the new frame. The baseline therefore has to be regenerated deliberately, with
`--update-snapshots=all` and not `--update-snapshots`, and the image gate cannot be read as a
check on a look change of this size. The tasks regenerate them in one step, after the look is settled, so the
baseline is not rewritten twice.

**The region view searches have to be re-measured.** → Every count in the band requirement
is a reading of a 6 CSS pixel band. The premises and the viewports do not move, because the
range fade keeps its figures, but every window stated in CSS pixels was sized against that
6 pixel band and has to be restated against 34.6. The spec says the implementation measures
the counts again and writes them back, which is the rule the requirement already set for
itself the last time these moved. `tests/region-views.test.ts`
asserts each count, so a stale one fails.

**A wider band may wash the galactic core.** → The tone's luminance is 0.755, below the
core's 0.93, so the band **darkens** the core rather than blowing it out. It is six times
more of the frame than before, which is a look judgement the baseline image and the owner's
own reading settle, not a test.

**The flow field's 197.4 light year cell could make a blocked label heading step.** → Only
the heading comes from the field; the step length still comes from `anchorStep` on the
screen. A heading that changes by one of eight directions as the label crosses a cell
boundary changes the label's direction by at most 45 degrees at a speed already capped at
1,200 CSS pixels a second, and it happens only while the straight path is blocked.

**`accurate` as the default changes what the map draws by very little.** → That is the
point, and it is why the default can move. Everywhere the overlay draws, the two sets sit
between a seventh and a twenty-third of a band apart, so the map should draw the set that
departs from the region data by **0**. A host that wants the curve passes
`regionMode: 'simplified'`. The staircase would only show below a range of about 6,700 light
years, and the range fade draws nothing under 10,000.

## Migration Plan

The change ships in one piece; there is no staged rollout and nothing persists across a
reload but the URL fragment, which this change does not touch.

Three things a host can see:

1. **The default region mode changes** from `simplified` to `accurate`. A host that relied on
   the old default passes `regionMode: 'simplified'`.
2. **`gm-grid-plane-label` is gone.** A host that read it reads any crossing label and takes
   the second of its three numbers.
3. **The cursor marker is a new element of the overlay, and it is on by default.** A host
   that draws its own cursor passes `cursorMarker: false` or calls
   `setCursorMarkerVisible(false)`.

Rollback is a revert of the change. No data format, no stored state and no URL parameter
changes, so a reverted build reads every link this one wrote.
