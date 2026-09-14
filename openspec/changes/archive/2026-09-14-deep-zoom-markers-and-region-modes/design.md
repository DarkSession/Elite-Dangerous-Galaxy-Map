## Context

See [proposal.md](proposal.md) for the motivation. The state this design builds on:

- `src/camera/view.ts` clamps the zoom distance to 500 to 120,000 light years.
  `src/camera/projection.ts` builds the perspective matrix with a fixed `NEAR_PLANE` of 10
  light years. No pass enables `DEPTH_TEST`, so the near plane clips and nothing else.
- `src/render/system-pass.ts` draws the whole marker set with one `drawArrays(POINTS)`. It
  holds two `Float32Array` buffers of `MAX_SYSTEMS * 3`: the offsets, rebuilt every frame
  from `float64` positions, and the core colours, rebuilt only when `set.version` or
  `set.categoryVersion` moves.
- `src/scene-data/region-lines.ts` fills a 2,027 by 2,027 region grid, traces it into 123
  chains of 38,563 unit edges, smooths each chain and packs one `RegionLines` set of
  68,672 vertices. `src/scene-data/region-lines.worker.ts` runs the whole build and posts
  the set with its buffers transferred.
- `src/render/star-pass.ts` derives the handover radii and the star field's boxel blocks
  from the zoom distance through `baseSizeClass`, which steps at 320, 640, 1,280, 2,560 and
  5,120 light years. The map cannot reach 320 today.

Measured on this tree while drafting: the traced boundary is 123 chains, 38,563 unit edges,
38,686 nodes, 1,903,061 light years of length and 1,062.75 degrees of turn for each 1,000
light years. The smoothed set is 68,672 vertices, 804.75 KiB.

## Goals / Non-Goals

**Goals**

- One size rule and one pass for both marker styles, so a mixed set costs one draw call.
- Both boundary sets from one trace and one worker message, so the accurate mode adds no
  region lookup and no second worker run.
- No frame that draws today draws differently, except where the spec says so.

**Non-Goals**

- No change to the smoothing constants of the simplified set.
- No new debug probe beyond what the specs name.
- No region mode in the URL fragment. The demo page keeps its fragment as it is, and the
  browser tests reach the mode through the handle on `window.galaxyMap`.

## Decisions

### The near plane is `min(10, distance / 10)`

The cursor sits exactly `distance` light years from the camera, so a fixed near plane of
10 clips the cursor at a zoom distance of 10. Making the near plane a tenth of the zoom
distance puts the cursor at ten near planes at every zoom, and the `min` holds it at
today's 10 light years for every zoom distance of 100 and above.

`projectionMatrix(viewport)` therefore becomes `projectionMatrix(view, viewport)`, and
`viewProjectionMatrix` passes the view through. `NEAR_PLANE` stays exported as the 10 light
year ceiling and a new `nearPlane(distance)` holds the rule, so the unit test reads one
function.

_Alternative rejected._ A near plane fixed at 1 light year for every zoom. It would clip
nothing, but it changes the matrix of every view that draws today, so the committed
baseline image and the byte-identical scenarios of three specs would all have to move for
a change that gains nothing at the far view.

### A marker's style and range ride the cached attribute buffer

The offsets are rebuilt every frame; the colours are rebuilt only on a version change. The
style and the range come from the category table, which changes exactly when
`categoryVersion` changes, so they belong with the colours. The pass therefore holds two
cached buffers: the `vec3` colour buffer it holds today, and a new `vec2` buffer of
`(style, maxDrawRange)`. Both are rebuilt under the same version guard, so a frame that
changes neither writes neither.

The range cut runs in the vertex shader: `if (range > aStyleRange.y) { gl_Position =
vec4(0.0, 0.0, 2.0, 1.0); gl_PointSize = 0.0; return; }`. A clip-space `z/w` of 2 is behind
the far plane, so the point is clipped and no fragment is written.

The count the page reports must be the drawn count, and the shader cannot report it. The
CPU already walks every position each frame to rebase it, so the same loop compares the
squared range against the squared limit and counts. That is one multiply and one compare per
marker on top of three subtractions, on a set capped at 10,000.

_Alternative rejected._ Compacting the buffers on the CPU to the markers that draw. It gives
the count for free and uploads fewer vertices, but the colour buffer would have to be
rebuilt every frame rather than on a version change, because the compaction order changes
with the camera. At 10,000 markers the vertex count is not the cost, so the cache is worth
more than the compaction.

### The glow is alpha shaping over a flat colour

The fragment shader writes the category colour at every point of the sprite and puts the
whole shape in the alpha. That is what lets the spec pin the middle pixel to the category
colour within 2 per channel: with an opaque core the blend is the colour itself, whatever
lies under it.

The sprite carries `vStyle` from the vertex shader. The fragment shader branches on it.
Both styles read the same `vRadius`, and the vertex shader multiplies the disc size by 2.5
for the glow, so one size rule feeds both and the `markerCssSize` unit test still covers
the base.

The alpha is `min(1, spikes + max(core, halo))`. Taking the larger of the core and the halo
rather than substituting one for the other inside a radius is what keeps the alpha
continuous: an opaque disc joined to the halo drops 0.35 at the cap size and 0.46 at the
floor size in one device pixel, which draws a hard-edged disc inside the glow. The core's
plateau is 1.0 CSS pixel, which covers the 0.71 CSS pixels a pixel centre can lie from the
sprite centre at a device pixel ratio of 1, so the middle pixel is opaque and a test reads
the category colour unmixed.

The rule is also exported as `glowAlpha` from `system-pass.ts`, the way `starBrightness`
mirrors `stars.vert` today, so a unit test measures it at its own resolution rather than
through a screenshot. A screenshot cannot tell a step from a steep fall at one device pixel.

The spike is the product of a triangular profile across the axis and a squared falloff
along it, summed over the two axes. It is four multiplies and two `max` calls per fragment.

The pass reads `ALIASED_POINT_SIZE_RANGE` once at creation and holds `gl_PointSize` under
its maximum. A 30 CSS pixel glow at a device pixel ratio of 3 asks for 90 device pixels,
which is the largest sprite the map draws, and a driver that silently clamps would break
the size scenarios rather than report anything.

_Alternative rejected._ A texture atlas of the two sprites. It reads cleanly but adds an
asset, a sampler and a mip policy, and a 30 CSS pixel sprite generated in the shader has no
resolution limit at a device pixel ratio of 2 or 3.

### Both boundary sets come from one trace

`packRegionLines` already takes the trace and produces the smoothed set. The traced set is a
second packer over the same `RegionTrace`, so the 4.11 million region lookups of
`fillRegionGrid` run once. The traced packer walks each chain's nodes and keeps a node only
where the direction changes, plus the two ends. The direction of a unit edge is one of four
integer vectors, so the test is an integer comparison and the collapse is exact: a dropped
node lies on the straight line between its neighbours.

Measured on this tree: 22,718 vertices, 266.23 KiB, against the smoothed set's 68,672 and
804.75 KiB. The accurate set is the smaller of the two, so carrying both costs 1,071 KiB of
vertex data where the map carries 805 KiB today.

`RegionLinesResponse` gains a second `RegionLines`, and `regionResponseTransferables` adds
its three buffers to the transfer list. `SceneData` and the renderer hold both.

_Alternative rejected._ Building the accurate set on demand when the mode first changes. It
saves 266 KiB until the user asks, at the cost of a second worker round trip and a frame of
delay in the middle of an interaction. The set is small enough that the delay is the larger
cost.

### The region mode lives in the app layer

`create-map.ts` holds the mode, and the renderer takes it as a frame input beside the pass
switches. The renderer picks the set and the label overlay reads a boolean for `off`. This
keeps `src/render/` free of a host-facing enumeration and keeps the `regions` pass switch
what it is, a renderer probe.

The region pass keeps its vertex buffers per set: the pass is created once with both sets
and holds two vertex arrays, so a mode change is a bind and not an upload.

### The star field reads an effective zoom distance

`effectiveStarDistance(distance) = max(distance, CLOSE_FADE_NEAR)`, which is
`max(distance, 640)`. `handoverRadii` and `starField.update` both take it; `closeFade` keeps
the real distance. The rule is one function in `star-pass.ts` beside `closeFade`, so the two
constants that bound the close band sit together.

This is the only change of this kind the deeper zoom needs. The cloud pass is already at 0
below 6,000 light years, the volume pass has no distance rule, and the point cloud's own
size clamp is in device pixels.

### The precision bound extends to 10 light years without a change to the rule

`far-view-rendering` bounds the camera-relative error at `1e-2 * distance / 2,000`, and
`precision.test.ts` carries that as a constant at the closest zoom. The closest zoom moves,
so the constant moves from 2.5e-3 to 5e-5; the rule itself does not. Measured on this tree
with the test's own emulation, over its seven cursors, six yaws, five pitches and three
axes, and with the near plane this change gives a 10 light year view, the worst relative
error at that zoom distance is **2.8e-5**, which is 0.55 of the bound. The near plane is
part of the projection matrix, so it moves the reading: the same sweep against a near plane
fixed at 10 light years gives 2.6e-5, which is not the figure the map will produce. At 10
light years the separation of 1/32 is 1/320 of the coordinate, so 16 of the 24 mantissa
bits are left, against 8 at the reference distance of 2,000.

## Risks / Trade-offs

- **The 120,000 light year default range cuts markers inside the drawn disc, not only past
  its rim.** At the default view the camera sits at (0, 34,415, -49,149) and the cut falls
  at 39,915 light years of galactocentric radius on the far side. The disc carries
  stars to about 47,000, whose rim is 126,800 light years from that camera, so a band of
  the outer disc the frame still draws loses its markers. → The specs state the figures, and
  a host sets a larger `maxDrawRange` per category; 283,500 cuts nothing anywhere, because
  that is the bounds diagonal of 163,429 plus the 120,000 the camera can stand off. The two
  browser tests that open 120,000 light years use a category of 200,000 so they read the
  zoom limit and not the range limit. If the owner would rather no view lose a marker by
  default, the one number to change is the default, and nothing else in the design moves.

- **The accurate mode draws 90 degree corners, which is the hardest case for the join
  rule.** → The region pass writes `1 - distance / halfWidth` into a coverage buffer with
  the blend equation `MAX`, so a join keeps the smallest distance and cannot blend twice.
  The rule is geometry-independent, and the spec adds a scenario that reads a 90 degree
  corner directly rather than trusting that.

- **The glow's spike could read as an artefact at a device pixel ratio above 1.** The spike
  half-width is 1.0 CSS pixel, which is 2 or 3 device pixels, so it has room. → The spec
  measures the spike against the diagonal at 0.5 of the radius, which is a ratio the pixel
  ratio does not change.

- **Holding the star field's distance at 640 keeps the boxel sweep running at the closest
  zoom, where it draws nothing.** → It costs what it costs at 500 light years today, and the
  frame budget scenario at 10 light years is what holds it. Skipping the sweep below 640
  would be a further change, and it is a non-goal here because it would make the two counts
  the page reports depend on the zoom distance, which `close-view-stars` forbids.

- **`projectionMatrix` changes signature, and several call sites and tests read it.**
  `viewProjectionMatrix` already takes the view, so only the one function moves. → The
  change is mechanical and the compiler finds every site. The scenario "The near plane
  changes no view that draws today" is what proves the rule did not move an existing frame.

## Migration Plan

No data migration and no stored state. A URL fragment written before this change loads
unchanged, because the zoom range only widened. A host that calls `addCategories` with the
fields it uses today gets `glow` markers where it used to get `disc` markers, which is the
intended look change; a host that wants the old look adds `markerStyle: 'disc'`.
