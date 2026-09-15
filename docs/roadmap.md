# Roadmap

The map is built in the phases below. Each phase is one OpenSpec change. This document
records what each phase must do and what we know about it so far. Update it when a
phase starts, when a decision changes, or when a question below gets an answer.

Last updated: 2026-09-15.

## Facts that hold for every phase

- **Coordinates.** Game coordinates in light years. Sol is (0, 0, 0). `x` points right,
  `y` points up out of the disc, `z` points from Sol toward the galactic centre. The
  game resolves positions to 1/32 light year. Every game position fits a `float32`
  exactly, because 1/32 is a power of two and the galaxy spans under 2^17 light years.
- **Galactic centre.** The density model uses (15, -35, 25895). Sagittarius A* in the
  game is at (25.2, -20.9, 25900).
- **Extent.** The generated volume spans `x` -49,985 to 50,015, `y` -40,985 to 40,925
  and `z` -24,105 to 75,895. The disc is empty beyond about 47,000 light years from the
  centre. Stellar mass sits within 2,867 light years of the mid-plane.
- **Scale.** The galaxy holds about 400 billion systems. Sol's neighbourhood has about
  3.8 systems per 1,000 cubic light years. The core, 2,000 light years out, has about
  73.
- **World frame.** The renderer draws in `(x, y, -z)` so a standard right-handed
  projection shows the centre at the top of the screen from Sol. The flip lives in one
  function at the data boundary. Stored positions stay in game coordinates.
- **Camera-relative drawing.** Every chunk holds positions relative to its own origin.
  The CPU computes `chunkOrigin - cameraPosition` in `float64` each frame. No buffer
  changes when the camera moves. Phase 1 sets this up with one chunk per pass. Phase 2
  uses one chunk per boxel, and the star field draws 1,856 of them per frame.
- **Data and rendering stay separate.** Data producers emit typed arrays and plain
  objects. The renderer knows nothing about where they came from. A lint rule enforces
  the import direction.
- **Hardware rendering is asserted.** The browser suite fails on a software renderer.
- **Look.** The target is the game's galaxy map background: a cream bulge, pink-brown
  arms that turn violet at the edge, dust lanes along the arms, sparkle from many
  small points. The game's logo and the satellite blob in its map background are not
  part of the target. The far view reaches this with a curve of two slopes on the
  density before emission, a power of 0.34 above a knee at five times the density of the
  disc at Sol and 0.87 below it, a volume ramp on two axes that runs from red-brown
  lanes through a salmon band to a near-white core over the inner disc and from a blue
  haze to dusty pink arms over the outer one, blended by galactocentric radius from
  20,000 to 32,000 light years, coloured extinction
  for the dust, a point ramp by zone, 40,000 cloud sprites of 500 to 4,000 light years
  with ragged generated shapes that give the haze its chunks out to the rim, a
  glow pass for the halo, and a tone map on the luminance over a dark grey background
  with a dither of one 8-bit step.

## Phase 1: far view

Changes: `far-view-galaxy-render`, then `far-view-look-second-pass`, then
`far-view-look-third-pass`, then `far-view-cloud-look`, then
`far-view-colour-and-texture`, then `far-view-look-thresholds`. Status: implemented,
under review. The owner accepts the point shader's zone key at 6, and the baseline
image pins it.

Draws the galaxy's shape from far away and lets the user move across it.

- **Density source.** The compact galaxy model in `src/galaxy-model/galaxy-model.json`,
  documented in [galaxy-density-model.md](galaxy-density-model.md): bulge, bar,
  exponential disc, truncation, four logarithmic spiral arms with a shared winding law,
  a two-component vertical profile, and a 64x64 correction grid. 29 parameters plus
  4,096 signed bytes, fitted to the game's own density maps. It ports to TypeScript in
  about 500 lines and needs no tables beyond the grid and a 24-point zone ramp. It does
  not place stars. A 1024x1024 detail grid in `src/galaxy-model/galaxy-detail.png`
  layers on top of it and holds the painted texture at 98 light years per cell. The
  point cloud samples the detailed density, and the volume pass multiplies its density
  by the ratio of the detailed density to the corrected one.
- **Accuracy.** Root-mean-square error of the log surface density is 0.223 with the
  correction grid alone and 0.007 with the detail grid, measured at 1024 cells inside
  44,000 light years. The game's map keeps a residual of 0.068 at its own 48.8 light
  year texels, below one pixel of the far view.
- **Data.** The parameter file, the detail grid and the fixtures in
  `tests/fixtures/galaxy-model.json` and `tests/fixtures/galaxy-detail.json` are
  committed data with no generating script. The parameter file carries only the fields
  the map reads: no description, fit report, samples or attribution text. Each fixture
  carries the SHA-256 of the file it pins. The map reads the PNG with its own decoder
  in `src/galaxy-model/png.ts`, which runs in Node and in a worker.
- **Rendering.** A point cloud of 2,000,000 samples drawn as additive sprites, and a
  256x64x256 density volume drawn by raymarching. Both are baked once in workers. A
  cloud pass draws a second set of 40,000 samples as large soft additive sprites
  between the volume and the points, so the haze is made of chunks in three
  dimensions. The set is placed by the square root of the cell mass with a floor that
  reaches the rim, each sprite reads one of 16 generated shapes with a ragged outline,
  and its radius is log-uniform from 500 to 4,000 light years. A sprite fades out from
  half the 64 pixel cap to the cap, which holds the layers per pixel near level from
  12,000 to 30,000 light years. The pass fades out below 12,000 light years and draws
  nothing at 2,000. A sprite carries the volume's two ramps and the same blend by
  radius, so it draws the lanes over the inner disc and the haze over the outer one. Its
  brightness falls with a gentle power below the density floor and fades to zero from
  44,000 to 48,000 light years, and a spread of mean 1 over a ground of 0.35 moves light
  from the median sprite to a few puffs at the rim, which carry the arm colour on the
  blue ground. A glow pass holds the
  brightest pixels down, blurs the volume and the clouds at one eighth resolution and
  adds them back, which gives the halo past the rim and the light between the arms.
  The points carry a large share of the light in the disc, which gives the disc its
  grain. The frame budget test measures ten views: two cursors at 2,000, 12,000,
  20,000, 30,000 and 120,000 light years.
- **Navigation.** A cursor on the galactic plane. Left drag orbits the cursor with
  pitch clamped to 5 to 89 degrees. Right drag moves the cursor in the plane. The wheel
  zooms between 10 and 120,000 light years. Phase 3.1 moved the close end from 500. A
  wheel notch sets a target distance and the camera glides to it. The glide lands in 217
  milliseconds at 60 frames a second, which is the time the region labels settle in.
  Keys `W A S D` move the cursor in the
  plane and `R F` move the cursor off the plane. The view lives in the URL fragment.
- **Stack.** TypeScript, Vite, WebGL2 with an in-house wrapper, `gl-matrix`, plain DOM
  for the HUD, Vitest, Playwright with a GPU project, pnpm with the 7-day hold.
  three.js was considered and rejected: every pass is a custom shader, and its orbit
  controls pan in screen space rather than on the plane.
- **GPU path in the container.** Chromium reaches the NVIDIA card with
  `--use-gl=angle --use-angle=vulkan`, headless and headed. The `gl-egl` backend
  reaches only the Mesa software driver here. With `--disable-gpu` Chromium exposes a
  SwiftShader renderer string, not an empty one.
- **Precision limit.** Camera-relative drawing keeps two points 1/32 light year apart
  within `1e-2 * distance / 2,000` relative of the exact transform. That is the
  `float32` limit, about 2^16 between the distance and the separation at 2,000, and no
  code change can tighten it. The bound falls with the distance, so the closest zoom of
  10 light years holds 5e-5. Measured worst case 2.8e-5 at 10, 4.6e-3 at 2,000, 5.3e-2
  at 20,000 and 0.2 at 120,000; a camera-in-matrix transform is more than 10 times
  worse. The near plane is in the projection matrix, so the sweep reads the near plane
  the view gives it. Against the fixed near plane of 10 light years the map used before
  phase 3.1, the worst case at 10 light years is 2.6e-5.
- **Frame time measurement.** `gl.finish()` alone does not wait in Chromium's
  command-buffer WebGL. `measureFrames` reads one pixel after it to force the round
  trip, so the number is a superset of draw-to-finish.

## Phase 2: close zoom with decoration stars

Changes: `close-zoom-stars-and-regions`, then `region-boundaries-and-labels`. Status:
implemented.

Extends the zoom down to individual stars. Draws stars that are decoration, not real
systems, and fades them out as the user zooms in.

- **Constraint.** Public information only. The game's own generation rules are not
  reproduced. Star positions are invented.
- **Density.** The phase 1 model gives the mass budget at any point. The calibration is
  4.8 systems per solar mass of budget at the density of the disc at Sol, and it falls
  in the logarithm to 1 at the model's peak density. A boxel's count is the detailed
  density at its centre, times the boxel volume, times that calibration. The ramp
  reproduces the neighbourhood: 3.798 systems per 1,000 cubic light years at Sol
  against a measured 3.8, and 15,592 systems within 100 light years against a measured
  16,000. It does not reproduce two figures at galaxy scale: 1.49 million systems
  within 500 light years of Sol against a measured 2,000,000, and 9.23e10 over the
  whole model against the game's 400 billion. The first gap is the model's own vertical
  fall-off. The second sits in the core, where the calibration falls to 1 and every
  boxel is capped, so no drawn count changes.
- **Level of detail.** The game's mass-code hierarchy is an octree: a sector is 1,280
  light years, mass code `h`; each lower code halves the edge down to `a` at 10 light
  years. Each level is a chunk. A boxel's stars come from a hash of its address, so the
  same boxel always shows the same stars. Four classes draw at once, picked by the zoom
  distance, and the set steps from one group of four to the next. Phase 2.1 turns that
  step into a fade.
- **Budget.** Sol's neighbourhood has about 16,000 systems within 100 light years and
  about 2,000,000 within 500. The level-of-detail scheme must keep the drawn count
  bounded. The spec for this phase must state that bound.
- **Public data.** `@elite-dangerous-almanac/core`, the `astro` feature area. ESM only,
  Node 22 or later, zero dependencies, tree-shakeable, pre-1.0 with breaking changes
  expected, so pin an exact version. The 7-day hold resolves it one or two releases
  behind the newest. Relevant leaves and their bundled sizes:
  - `astro/galaxy-grid`, `astro/mass-code`, `astro/sector-name`,
    `astro/system-address`: sector and boxel geometry, procedural names both ways.
  - `astro/hand-authored-regions`: named regions as spheres (Pleiades, Coalsack, ...).
  - `astro/codex-region` (about 9 KiB) and `astro/codex-region-lookup` (199 KiB): the
    42 codex regions and a 49 light year lookup grid. The lookup grid is worker only,
    so it stays out of the main bundle.
  - `astro/nebulae-real` (about 16 KiB), `astro/nebulae-procgen` (about 16 KiB),
    `astro/nebulae-planetary` (about 399 KiB): 5,835 nebulae in total, each a name, a
    system and a position.
  - The package's 64 MB of ship SVG assets never enter a bundle.
- **Licence.** The almanac's code is MIT. Its data carries source-specific terms,
  including Frontier's non-commercial media-usage notice and CC BY-NC 4.0 for some
  derived material. Review `THIRD_PARTY_NOTICES.md` in the package before release.
- **Answers this phase gives.**
  - The star counts read the **detailed** density, and so does the light each boxel
    carries. It is the density the point cloud is placed by, so the two sources carry
    the same light per unit volume at every density and the handover shows no step. A
    star field on the corrected density would differ by a factor of 0.52 to 1.76 around
    the ring at 20,000 light years from the centre.
  - The labels and the boundaries are the 42 codex regions, drawn in a zoom band.
    Nebulae and hand-authored regions stay out.
  - The zoom band runs from 30,000 light years down. Both the boundaries and the labels
    are absent at 30,000 and full at 20,000. Both then stay to the closest zoom.
    `close-zoom-stars-and-regions` faded the boundaries out again below 3,000 light
    years, because one grid cell covers more than 15 pixels there and the line read as a
    staircase. `region-boundaries-and-labels` draws a smooth line, which has no such
    fault, so it removed that fade out. The star field fades in over the same kind of
    band: nothing at 8,000 light years, full at 4,000 and below.
  - A boundary is one line between two regions. The trace links the 38,563 unit edges of
    the 49.3494 light year raster into **123 chains**, and it ends a chain at each of the
    82 nodes where more than two edges meet. Each chain is then smoothed in three
    stages: two passes of an average along it with the movement of every point capped at
    0.75 of a grid cell from the node the trace put it on, a vertex reduction, and four
    capped corner rounding passes. The drawn line stays within one grid cell, 49.3494
    light years, of the traced boundary, measured both ways at 47.76. It turns 29.7
    degrees for each 1,000 light years of drawn length against the 1,063 degrees of the
    traced staircase, and no vertex of it turns by more than 20 degrees, measured at
    14.2. The rounding is what holds that last bound: the average alone leaves long
    straight runs meeting at corners of up to 98 degrees. The set holds 68,672 vertices
    and 68,549 segments, which is 804.75 KiB, and it draws in 123 instanced calls.
  - A line is a screen-space ribbon of two tones: a 2 CSS pixel light core with a 1 CSS
    pixel dark outline each side. Each segment writes `1 - distance / halfWidth` into a
    single-channel coverage buffer with the blend equation set to `MAX`, so a join keeps
    the smallest distance and is not brighter than the line. One fullscreen step then
    reads that buffer and writes the core colour and the outline colour.
  - A label follows the area its region covers on screen. The page samples the frame on a
    grid of screen points 32 CSS pixels apart, which is about 2,000 samples at 1920x1080,
    and reads each sample from a coarse region grid of 507 by 507 cells at 197.4 light
    years, 251 KiB. A region is a candidate when it holds at least 1 percent of the
    samples that land on the plane. A region that carried a label in the frame before
    stays a candidate to half that share. The region holding the sample nearest the
    centre of the frame is named first, and the rest follow by sample count after the
    count of a region that carried a label before is multiplied by 1.2. A label's anchor
    is worked out on the galactic plane and then projected: it is the mean of the plane
    positions of its region's samples. Where the region under that mean is another
    region, which is the frame that shows a region as two separated patches, the anchor
    is the plane position of the sample the region itself holds nearest the mean. The
    plane is what makes the anchor move. The sample grid is fixed in screen space, so
    anything averaged there changes only when a sample crosses a region edge: it holds
    still and then steps. An anchor is held from the frame before while its plane point
    still resolves to the region and still projects inside the frame.
    The three rules `close-zoom-stars-and-regions` used are gone, because the samples are
    already on the screen: the bounding box candidate test, the centroid projection and
    the behind-camera negation.
- **Open questions.**
  - Do decoration stars get names, for example the sector name under the cursor?
  - Do the volume ramp by density and the point ramp by zone unify into one?

## Phase 2.1: the level of detail fades

Change: not yet created.

Replaces the step at each level-of-detail threshold with a fade, so stars appear
gradually as the user zooms in.

- **Problem.** Phase 2 picks four size classes from the zoom distance with
  `clamp(ceil(log2(distance / 320)), 0, 4)`. The set steps at 640, 1,280, 2,560 and
  5,120 light years. At a step the finest class halves its edge, the coarsest class
  goes, and every boxel address changes, so one frame holds a different set of stars
  from the frame before it.
- **Scheme.** Take the position inside the class band,
  `f = s0 - log2(distance / 320)`, which runs from 0 to 1 over one octave of zoom. Draw
  five classes and weight the two ends by it: class `s0-1` at `f`; class `s0` with its
  full 512 boxels, its inner 64 at `1 - f`; the three middle classes at 1; class `s0+3`
  at `1 - f`. At `f = 0` this is the phase 2 set. At `f = 1` it is the next band's set.
  The step then changes nothing.
- **Fine end.** The two classes cover the same volume and their weights sum to 1, so
  the light is held and there is no edge in space.
- **Coarse end.** Class `s0+3` fades out where the point cloud takes over, so the fade
  and the radius the field stays fully lit to trade against one another. This is the
  part that needs work before the phase is proposed.
- **Cost.** 2,368 boxels against phase 2's 1,856, which is 28 percent more. A cap of
  200 stars per boxel in place of 256 gives 473,600 sprites, under phase 2's bound of
  475,136, so the frame budget does not move.
- **Not a superset.** The coarse set is not a subset of the fine one, because each
  boxel hashes its own stars. The change is a cross-dissolve between two star sets over
  one octave, which is about 5 wheel notches. A true superset needs a coarse star to
  resolve to a fine boxel's star, which costs per-vertex work the sprite count does not
  allow.
- **Test.** A browser test steps the zoom distance across each of the four thresholds
  and reads the mean absolute frame difference. A step must not differ more than a move
  of the same size away from a threshold.
- **Open questions.**
  - The coarse end rule, and the radius the field stays fully lit to.
  - Whether the cap comes down to 200 or the sprite bound goes up.
  - Whether the weight is `f` or a smoothstep of `f`.

## Phase 3: real systems from data

Change: `real-systems-from-data`. Status: implemented.

Makes the map a library and draws the host's real systems over the invented galaxy.

- **Entry point.** `createGalaxyMap(canvas, options)` in `src/app/create-map.ts`
  returns a handle in the same tick. The handle carries `addCategories`, `addSystems`,
  `clearSystems`, `clearSystemsAndCategories`, `systemCount`, `ready`, `dispose`,
  `getView`, `setView`, `onViewChange` and `debug`. The library owns the context, the
  scene data, the view, the controls and the frame loop. `src/app/main.ts` is the demo
  page alone: it owns the URL fragment, the message box and the test hooks. An ESLint
  rule fails a read of `window.location` in every file but that page.
- **Record shape.** A record is what an EDSM or a Spansh dump gives: a `name`, a
  `coords` object of `x`, `y` and `z`, and the name of a primary category. The reader
  keeps `id64` as a decimal string, `secondaryCategories`, `allegiance`, `government`,
  `primaryEconomy`, `security`, `population` and `bodyCount`, and drops every other
  field. It reports each rejected record with one of six reasons. The
  identity is the `id64`, or the name when there is none, and a second record with the
  same identity replaces the first. The set holds at most 10,000 systems, in one
  `Float64Array` of positions and one `Uint16Array` of category indices.
- **Category table.** The host groups its systems by category. A category carries a
  name, an RGB colour and an optional description. The name is the identity, and a
  category added twice replaces the first and recolours its markers without moving its
  table index. The table holds at most 256. No call removes one category:
  `clearSystemsAndCategories` empties the table and the set together, so a system in
  the set can never name a category the table does not hold.
- **Marker look.** One point sprite per system, drawn after the tone map and after the
  region overlay, so nothing can cover a marker and the scene light does not change.
  The disc is `focalCss * 20 / range` CSS pixels, held between a floor of 7 and a cap
  of 12, with the primary category's colour in the core and a fixed dark ring of
  (0.02, 0.04, 0.10) over the outer 2 CSS pixels. A marker draws at every zoom distance
  from 500 to 120,000 light years and does not fade. Phase 3.1 made the disc one of two
  styles, took the close end of the zoom to 10, and gave each category a draw range.
- **Close fade.** The invented star field draws in full at a zoom distance of 2,560
  light years and adds no light at 640 and below, on a smoothstep between. The light it
  gives up leaves the frame: the point cloud keeps the handover weight and does not
  take it back, so both invented sources stand down and the close view holds the host's
  systems alone. The fade changes the light a star deposits and no count, so the placed
  count, the drawn count and the star radius do not read it.
- **The `stars` switch controls one pass.** The handover weight followed the switch, so
  turning the star pass off handed the point cloud its near field back. It now follows
  the zoom distance alone while the field stands. Without that, a frame at 640 light
  years drawn with the pass off cannot match the frame drawn with it on, because the
  close fade has already taken the field's light and only the point cloud moves. A field
  that has not loaded still gives the point cloud its near field, so a close view does
  not start empty. The trade is that the switch no longer conserves light: the reading
  "The handover keeps the light" holds a margin of 0.0002 against a limit of 0.02, and
  the unit scenario "The two fades sum to one" is what holds the sum now. No production
  frame changes, because nothing outside the tests turns the switch off.
- **Suppression rule.** A decoration star within 3 light years of a real system is not
  drawn. The rule is a correctness rule, not a speed one: the user cannot tell an
  invented star from a real one, so an invented star beside a real system reads as a
  place the user can go to. The radius is about half the mean system spacing at Sol. The sweep runs on the
  CPU over the base size class alone, from a per-class index of boxel to systems, with
  a cache keyed by size class and boxel index, so a camera move sweeps only the boxels
  it brought in. The result reaches the shader as an `R32UI` bit mask of 8 texels per
  boxel row, and a `uSuppress` uniform of 0 makes the shader read no texel at all. The
  boxel divides its light over the stars that remain, so suppression changes the
  brightness of no frame.
- **The twin outside the base class block.** The base class block spans 8 base boxels
  per axis and reaches at most 2 base edges past the camera, so a coarser class draws
  its own star near a real system further out and the two stand together there. The
  marker is the brighter of the two and the close fade takes the invented star out
  before the camera reaches it. Suppression in every drawn class would remove the twin
  at the cost of a sweep of 1,856 boxels instead of 512; the index and the cache carry
  either rule.
- **Answers to the phase's open questions.**
  - The data does not come from the map. The host holds it and passes plain records to
    `addSystems`, so the map bundles no dump and fetches nothing.
  - The reader validates each record itself and reports the rejects. It reads the EDSM
    and Spansh field names and needs no schema from the host.
  - A real system does replace the decoration star at its position, inside the base
    size class and within 3 light years.

## Phase 3.1: deep zoom, marker styles and region modes

Change: `deep-zoom-markers-and-region-modes`. Status: implemented.

Takes the zoom to 10 light years, gives a category its own marker look and draw range,
and gives the region overlay three modes.

- **The zoom reaches 10 light years.** `MIN_DISTANCE` is 10, not 500. The near plane
  follows the zoom as `min(10, distance / 10)`, so the cursor stays in front of it at
  every zoom, and 10 light years stays the ceiling. The projection reads the view rather
  than a constant.
- **The star field holds below 640 light years.** The handover radii and the boxel list
  read `max(distance, 640)`, so they freeze at their 640 light year value. The close fade
  still reads the view's own distance, so the field adds no light below 640. Without the
  hold the base size class would fall as the camera comes in, and the map would rebuild
  1,856 boxels for a field that draws nothing.
- **Two marker styles.** A category carries `markerStyle`, which is `glow` or `disc`.
  `glow` is the default, so the look of a far view changes: a glow is a soft radial halo
  with four spikes and no ring, and its sprite is 2.5 times the disc diameter. The alpha
  rule is `min(1, spikes + max(core, halo))`, and `src/render/system-pass.ts` exports the
  same rule as `glowAlpha`, so a unit test reads it at its own resolution.
- **A draw range per category.** `maxDrawRange` is how far the camera may be from a
  system and still draw its marker, in light years. It is 120,000 by default, which is
  the far zoom limit, so a marker of a category that names no range draws at every zoom.
  The cut is by the camera's own distance to each system, it does not fade, and the
  vertex shader puts a cut marker behind the far plane so no fragment is written.
- **Three region modes.** `off`, `simplified` and `accurate`, and `simplified` is the
  default. The handle carries `getRegionMode` and `setRegionMode`, and `GalaxyMapOptions`
  carries `regionMode`. A mode change binds another vertex array and uploads nothing, so
  it takes effect in the next frame and does not rebuild the scene data.
- **Two boundary sets from one trace.** The worker traces the region grid once and sends
  both sets in one message. The smoothed set is the line the map drew before. The traced
  set is the 49.3494 light year staircase the region data holds: each chain is packed as
  it was traced, with the straight runs collapsed to one segment, so it departs from the
  trace by 0 and keeps every 90 degree turn. It holds 22,718 vertices, which is 266.23
  KiB, so it is the smaller of the two.
- **The accurate data is the data already in the tree.** klightspeed's
  `RegionMapData.json`, which the request named as the accurate source, is the same
  raster as `@elite-dangerous-almanac/core/astro/codex-region-lookup`: a comparison of
  20,000 random plane positions gives zero mismatches, and both are the same 2,048 row
  run-length raster at 4,096/83 light years per cell from the origin (-49,985, -24,105).
  The accurate mode is therefore not a new source. It is the same source drawn without
  the smoothing.
- **Why the traced set matters at close zoom.** One CSS row covers
  `1.1547 * distance / 1080` light years, so the 49.3494 light year departure of the
  smoothed line is 92 CSS pixels at a zoom of 500 and about 4,600 at a zoom of 10. It
  falls under one CSS pixel only above a zoom of about 46,000, and the overlay does not
  draw above 30,000. The departure is therefore always visible where the user asks which
  region a system is in. The bullet below reverses this part of the decision.
- **Reversed: the boundary does not draw near the camera.** The change
  `library-datasets-and-publishing` fades the line out by the distance from the camera to
  the nearest point of the segment each pixel draws: nothing at 200 light years and below,
  full at 1,500 and above, on a smooth step between. The fade is per pixel, so one line
  fades along its own length, and a line far across the frame still draws. The overlay is
  empty at a zoom of 10 light years, because every plane point in that frame is inside 200
  light years. A user at the closest zoom can therefore no longer read which side of a
  boundary a system sits on. The trade buys this: the staircase of the traced set, which is
  about 4,600 CSS pixels at a zoom of 10, is off the screen at the zoom where it is worst.
- **Reversed again: the overlay draws inside a zoom band, as one soft band.** Phase 5.1
  takes the near fade out and puts a zoom band in its place: the overlay draws nothing at
  5,000 light years and below, rises to full at 10,000, holds to 20,000 and falls to
  nothing at 30,000. The two-tone ribbon with its dark outline becomes one warm cream band
  of 6 CSS pixels with a soft edge. In `accurate` the coverage passes through a separable
  blur whose radius is the traced set's own 49.3494 light year cell measured on the screen,
  capped at 8 CSS pixels, so the 90 degree corners of the staircase draw as round turns.
  The region labels take the same band, so a name never outlives its boundary.

## Phase 4: selection and HUD

Change: `selection-and-hud`. Status: implemented.

Lets the user select a placed system, draws a coordinate grid and shows the record in a
HUD.

- **Picking.** On the CPU, in `src/scene-data/picking.ts`: project each drawn system to
  the screen and take the nearest inside a pixel radius. The sweep reads the same
  `markerFlags` array the marker pass reads, so the pick and the screen never disagree.
  The pointer pick runs once per frame. With 10,000 systems, the name labels on and the
  pointer on a marker, the pick and the two overlay marks together stay under a mean of
  0.5 ms per frame and a worst of 1 ms, against a budget of 2 ms. The reading moves from
  run to run, so the numbers here are the bound the runs hold to and not one run's pair.
- **Selection.** `setSelection(identity)` takes the `id64`, or the name when the record
  has none. The handle carries `getSelection`, `onSelectionChange`, `getHover` and
  `systemAt`. A left click on the canvas selects the system under the pointer. A click
  that finds no system keeps the selection, because the same button orbits the camera
  and a click between markers is more often a missed grab.
- **The coordinate grid.** `src/render/grid-pass.ts` draws lines on the galactic plane,
  with a spacing that steps with the zoom. The `grid` option and `setGridVisible` turn
  it on. It draws 516 vertices. Its draw cost is under what the frame timer resolves.
  The reading with the grid on and the reading with it off differ by less than 0.03 ms
  at a pitch of 5 degrees, where its fill is worst, and at a pitch of 89. The difference
  changes sign from run to run, so it is smaller than the spread of the instrument. The
  budget is 1 ms. Phase 4.1 replaced this grid with the plane fill below.
- **HUD.** Plain DOM in one `div.gm-hud`, built by `src/hud/`, behind a dynamic import,
  so it is a chunk of its own, about 27 kB, that a host which does not ask for the HUD
  never loads. It holds the top bar with the region name and the zoom distance, the
  category browser with a search box, the map option switches, and the information panel
  with the fields, the description, the thumbnails and a lightbox. It reads the map
  through the public handle alone, and an ESLint rule stops it importing
  `src/render/`, `src/scene-data/` or `src/camera/`. Every writer compares before it
  writes, so a still map makes no DOM write. The HUD holds 464 elements with 10,000
  systems in one expanded category, because the expanded list draws at most 200 rows.
- **The record fields the HUD shows.** The reader keeps `allegiance`, `government`,
  `primaryEconomy`, `security`, `population` and `bodyCount` from a dump, and the host
  may add `description`, `primaryStar` and `images`. A field the record does not carry
  leaves no empty row.
- **Answers to the open questions.**
  - **Selection moves the cursor.** It puts the cursor on the system and caps the
    distance at 500 light years. A view already closer than 500 does not change, so a
    close view stays close.
  - **The selection does not go in the URL fragment.** The fragment carries the view
    alone. A link that selects a system would need the host's data set to hold that
    system, and the library holds no data of its own.
  - **Every HUD control works from the keyboard.** Each control is a button or an input
    in the tab order, `Escape` closes the lightbox and then clears the selection, and
    the lightbox holds the focus while it is open.
- **One mockup control is not built.** The map options panel of the mockup carries a
  **Category glow** switch. No spec of this phase states what the switch does to the
  frame, so the HUD does not draw it. Build it when the look it controls is specified.

## Phase 4.1: the selection flight, the marker size curve and the grid levels

Change: `flight-markers-and-grid`. Status: implemented.

Flies the camera to a selection, takes the viewport out of the marker size, rewrites the
coordinate grid as a plane fill with six decade levels, and replaces the demo data set.

- **The selection flight.** `src/camera/flight.ts` holds `flightAt(from, to, elapsedMs)`,
  a pure function of two views and a time. It runs for 350 ms on the ease `1 - (1 - u)^3`,
  moves the cursor linearly and the distance geometrically, and leaves the yaw and the
  pitch. Any pointer, wheel or key input ends it where it has reached, and `setView` ends
  it too. A page that reports `prefers-reduced-motion: reduce` writes the end view in one
  frame. `debug.selectionFlightMs()` reads the time the flight has left, and 0 when no flight
  runs. Over a flight from
  20,000 light years with 10,000 systems at 1920x1080 the animation frame interval is a
  mean of 16.664 ms over 22 frames, against a bound of 18 ms.
- **The marker size follows the range alone.** `markerCssSize` lost its `focalCss` term
  and is now a four-stop log-linear curve of the camera range: 16 CSS pixels at 10 light
  years and below, 12 from 50 to 1,000, and 7 at 10,000 and beyond. The same system draws
  the same size in a 1,080 row canvas and a 400 row one. The glow sprite is 2.5 times the
  disc, so its cap moved from 30 to 40 CSS pixels. The fill that cap buys was measured
  before the curve was written: 10,000 forced 40 CSS pixel glow markers within 10 light
  years of Sol at 1920x1080 draw in a mean of 1.617 ms, against the 16.7 ms budget, so the
  close cap stayed at 16. The worst case the marker pass draws is 10,000 systems inside
  10 light years of Sol at a zoom of 10, where every sprite is at or near the cap. It
  reads 1.506 ms, and no marker reading of the suite is over 1.52 ms.
- **The grid is one triangle.** `src/render/grid-pass.ts` draws 3 vertices, not 516. The
  fragment shader un-projects each pixel to a ray, meets it with the plane at the cursor's
  own height, and works out six decade levels from 1 to 100,000 light years. A level's
  width and alpha follow its own spacing on the screen at that pixel, from the derivative
  of the plane coordinate, so no level draws moire and every level fades out toward the
  horizon. Where two levels cover a pixel the alpha is the larger and not the sum. Each
  level fades to nothing at 100 of its own lines from the cursor. The camera phase of each
  level is worked out in `float64` on the processor, so the shader never adds two large
  numbers. Phase 5 multiplies one more factor into every level's alpha: a smooth step
  over the camera's distance to the cursor, which reads 0 at 12,000 light years and 1 at
  4,000. Where it reads 0 the pass does not draw at all, so the three probes read what
  they read for a grid that is switched off.
- **The grid costs no measurable fill.** At 1920x1080 the draw time with the grid on is
  0.966 ms against 0.954 ms with it off at a pitch of 5 degrees, and 0.728 ms against
  0.686 ms at a pitch of 89. Both differences are under 0.05 ms, against a budget of 1 ms.
- **Phase 5.1 gives the grid a background reading.** The renderer tone-maps the scene
  target once at full resolution, then halves it four times into a texture of
  `ceil(width / 16) x ceil(height / 16)`, which is 120 by 68 at 1920x1080. `grid.frag`
  samples that texture and `src/app/grid-labels.ts` reads the same numbers at each label's
  own box, so a line and the number on it take the same weight. The draw time with the
  reading in the path is 1.029 ms against 0.957 ms with the grid off at a pitch of 5
  degrees, and 0.736 ms against 0.666 ms at a pitch of 89, so the chain holds the 1 ms
  bound.
- **The grid carries coordinates.** `src/app/grid-labels.ts` places a DOM label on each
  crossing of the label level, which is the smallest level at least 400 CSS pixels apart
  at the cursor. It sweeps 289 candidates, drops the ones outside the viewport or behind
  the near plane, keeps the 32 nearest the centre of the canvas and skips a box that
  overlaps one already placed. One more label states the plane's height on the lower edge.
  With 31 labels on screen, 10,000 systems and a pitch of 5 degrees, the animation frame
  interval is a mean of 16.666 ms, against a bound of 18 ms. Phase 5 adds two gates to
  the sweep, because the labels read neither bound the lines read. A crossing outside the
  model bounds on the game x or z axis is dropped, as `grid.frag` already discards such a
  fragment. A crossing whose level draws under 0.09 alpha there is dropped as well, which
  reads the level's screen spacing and the camera band together.
- **The demo set is the Guardian Ruins.** `scripts/build-demo-systems.mjs` converts the
  `guardian_ruins.json` dump of CanonnED3D-Map into `demo-data/guardian-ruins.json`: 600 sites
  in 212 systems in 3 categories, where 166 systems hold more than one site type. A record
  is one system and carries one thumbnail for each type it holds, by its
  `ruins.canonn.tech` URL, so the repository holds no picture. The script fetches the dump
  into `data/`, which the repository ignores. The browser suite reaches no network: the one
  test that reads a thumbnail from the built page names a picture of the project's own
  under `public/`.
- **The readings above are from one machine.** Every one was taken on
  `ANGLE (NVIDIA, Vulkan 1.4.341 (NVIDIA NVIDIA GeForce RTX 4080 (0x00002704)), NVIDIA)`.
  A software renderer gives another number, and the suite fails a run that falls back to
  one.
- **The baseline image did not move.** The grid is off unless the options ask for it and
  the browser suite's helper clears the demo set, so the committed far view is
  byte-identical.

## Phase 5: the library build, the dataset catalog and the published site

Change: `library-datasets-and-publishing`. Status: implemented.

Builds the map as a package, types the record input, gives the host a dataset catalog,
and publishes the demo site.

- **Two builds, two configurations.** `pnpm build` runs the type check, then the Vite
  library build into `dist/`, then the declaration emit into `dist/types`. The emit runs
  second, because Vite empties `dist/` and would take the declarations with it.
  `pnpm build:demo-site` builds the page into `dist-demo/` with the base path
  `/Elite-Dangerous-Galaxy-Map/`. `vite.config.lib.ts` holds the library build and
  `vite.config.ts` holds the page, so no option carries a condition and neither output
  overwrites the other.
- **The library keeps its chunks.** The build emits one ES format, sets
  `publicDir: false`, leaves code splitting on and keeps `gl-matrix` and
  `@elite-dangerous-almanac/core` external. The HUD and the three workers stay separate
  chunks, so a host that asks for no HUD downloads none of it. The entry chunk measured
  162,593 bytes and the HUD chunk 47,360 bytes.
- **The entry is `src/index.ts`.** The barrel exports `createGalaxyMap` and the 20 types
  the public calls name, and it does not export `GalaxyMapDebug`. `package.json` names
  the barrel in `exports`, so a host cannot deep-import a module the barrel left out.
- **The record input is typed.** `addCategories` and `addSystems` take
  `readonly CategoryInput[]` and `readonly SystemRecordInput[]`. The run-time reader and
  its rejection report stay, because the data comes from a file or a network call the
  compiler does not see.
- **Answers to the open questions of this phase.**
  - **The typed methods replace the `unknown` ones.** They do not sit beside them for a
    release. The package has no consumer outside this repository yet, so the break costs
    nothing.
  - **The library exports no type guard.** The reader already reports each record it
    rejects, with an index and a reason, so a consumer that wants to filter reads that
    report.
  - **The HUD needs no further field of a Spansh record.** It shows the six fields the
    reader keeps and the three the host adds, which phase 4 lists.
- **The host owns the data.** `GalaxyMapOptions` carries `datasets` and `dataset`, and
  the handle carries `getDatasets`, `getLoadedDataset`, `loadDataset` and
  `onDatasetChange`. An entry carries an id, a label, an async `load()` and the optional
  collection, region, description and system count the HUD shows. `loadDataset` calls
  `load()`, empties the set, adds what comes back and clears the selection and the name
  filter. A later call wins and an earlier one rejects as cancelled. The library fetches
  nothing and caches nothing.
- **The demo site carries three sets.** Guardian Ruins, 212 systems in 3 categories;
  Guardian Structures, 163 systems in 10 categories; and Notable Systems, 16 systems in
  4 categories. `scripts/build-demo-systems.mjs` holds one converter per source and
  writes the three files into `demo-data/`. The repository commits no dump.
- **A system belongs to every category it names.** The marker draws when any category the
  system is in is on, and the category browser counts and lists the system under each
  one. The marker keeps the colour and the style of the primary category. One sweep over
  10,000 systems in 4 categories stays under 2 ms.
- **The loading image.** `GalaxyMapOptions.loadingImage` is a URL. The library puts the
  picture in the canvas's parent, centred on the canvas, and removes it when `ready`
  settles, whether it settles or fails. The demo site names `public/EDLoader1.svg`, which
  it serves from its own origin, because the browser suite now serves the demo site and
  reaches no host but the page's own.
- **The region boundary is washed out and fades near the camera.** The fade reads the
  camera's own distance to the drawn line, per fragment. Phase 3.1 records the reversal
  it makes: the traced staircase is off the screen at the zoom where it is worst, and the
  overlay is empty at a zoom of 10 light years. **Phase 5.1 removes this fade.** Its zoom
  band empties the overlay below 5,000 light years, which is far above every distance the
  fade acted at, so the fade has nothing left to do. The coverage buffer goes back to one
  channel.
- **The coordinate grid is reachable, bounded and remembered.** The demo site starts the
  grid on and the library default stays off. The URL fragment carries the switch as `g=1`
  or `g=0`, and the handle gains `onGridChange`, because the grid is not view state and
  the page cannot otherwise learn that the HUD switch moved. The camera distance band and
  the two label gates sit with the phase 4.1 grid facts above.
- **The pipeline.** `.github/workflows/ci.yml` runs on every push to `main` and on every
  pull request that targets `main`. It installs with a frozen lockfile, then runs the
  lint, the type check, the unit tests, the library build and the demo site build, in
  that order. Every action is pinned to a commit SHA, for the reason the 7-day release
  hold gives: a mutable tag gives whatever it points at on the day the run starts. After
  the checks pass on a push to `main`, the workflow publishes `dist-demo/` to
  <https://darksession.github.io/Elite-Dangerous-Galaxy-Map/>.
- **The browser suite stays a local gate.** The workflow does not run Playwright. The
  suite fails a run that falls back to SwiftShader or llvmpipe, and a GitHub-hosted
  runner carries no GPU. A run without a card skips the suite; it does not run it against
  a software renderer.

## Phase 5.1: the overlay blend and the position precision

Change: `overlay-blend-and-precision`. Status: implemented.

Makes the coordinate grid follow the background under it, redraws the region boundary as
one soft band inside a zoom band, and shows a system position at full precision.

- **The frame carries a background reading.** `src/render/background-pass.ts` tone-maps
  the scene target once at full resolution with the frame's own exposure, then halves it
  four times into a texture a sixteenth of the frame on each axis. The order matters. An
  average in linear light first lets one star sprite dominate the linear mean of its whole
  16 by 16 block: over the disc at a zoom of 4,000 light years, with the camera moving
  4.67 CSS pixels a frame, that order moves the texel under a fixed point by 0.2417
  between two frames and this order by 0.0232. The reading holds the region overlay and
  the markers out, because it is built from the scene target and not from the frame the
  user sees.
- **The processor copy is one frame late.** The pass copies the reading into a
  `PIXEL_PACK_BUFFER`, places a fence, and reads it on a later frame, so no frame waits
  for the card. Two buffers ping-pong, so the frame that writes one never reads it. A
  label's opacity is therefore one frame behind the picture, which a frame of 16.7 ms
  hides. `debug.backgroundReading()` reads the small target synchronously, because a test
  must see the frame it just drew.
- **The grid merges with the picture.** `merge = smoothstep(0.08, 0.55, L)`, where `L` is
  the reading's luminance under the pixel. A line keeps `1 - 0.70 * merge` of its level's
  alpha and takes `0.60 * merge` of the background's colour. A coordinate number keeps
  more, at a floor of 0.45 and a tint of 0.35, because text needs more contrast than a
  line. One function in `src/render/grid-pass.ts` holds the rule, the shader takes it
  through uniforms and the label module calls it, so no second copy of the constants
  exists. Measured at a zoom of 3,000 light years at 1920x1080: a line of the label level
  moves a channel by 110 of 255 over the dark space between the arms and by 15 of 255 over
  the core, where the reading is 0.0446 and 0.6814.
- **The boundary is one soft band.** The tone is `(0.86, 0.74, 0.60)` at an opacity of
  0.55, the half width is 3 CSS pixels, and the coverage is a triangular ridge in a
  single-channel buffer at the full drawing buffer size. The dark outline is gone. In
  `accurate` the coverage passes through a separable Gaussian of standard deviation
  `radius / 3` CSS pixels, sampled one CSS pixel apart, with `2 * ceil(radius) + 1` taps
  and never more than 17. The radius is the traced set's own cell of 49.3494 light years
  measured on the screen at the cursor, capped at 8 CSS pixels, and the blur runs only at
  a radius of 3 and above. `simplified` never blurs, because the smoothed set has no
  staircase. The blurred coverage is divided by the same kernel's response at the ridge,
  so the band's opacity holds at every radius. Its width does grow with the radius, from
  3.0 to 3.5 CSS pixels unblurred to 4.65 at a zoom of 10,000 light years at 1,080 rows.
- **The overlay draws in a zoom band.** Nothing at 5,000 light years and below, full from
  10,000 to 20,000, nothing again at 30,000 and above. The lines and the labels take the
  same band. Below it the HUD's top bar names the region under the cursor, and the handle
  answers for any plane point with `regionNameAt`. Phase 5.2 replaces the close end of
  this band for the **lines** with a fade on the range of each pixel. The labels keep the
  band.
- **The panel shows a position at full precision.** `POSITION` shows each coordinate to at
  most 3 decimal places, with the trailing zeros dropped and the thousands separators
  kept. The copy text uses the same digits with no separators. The game resolves a
  position to 1/32 of a light year, which the record already holds. `DISTANCE FROM SOL`
  and `RANGE` still read whole light years.
- **The far view did not move.** The background reading is read and never written back
  into the scene, so the committed baseline image is byte-identical: 0 of 3,686,400 bytes
  differ.

## Phase 5.2: touch, the HUD panels and the overlay limits

Change: `touch-controls-hud-and-overlay-limits`. Status: implemented.

Gives the canvas a touch gesture set, moves three HUD readings, makes the region label
filter read elapsed time, replaces the close end of the overlay's zoom band with a range
fade per pixel, and ties a grid coordinate label to its own line.

- **Touch is a gesture set of its own.** One finger moves the cursor in the galactic
  plane, two fingers pinch to zoom and drag to orbit, and a tap selects. A one-finger drag
  orbited before, so this is breaking for a touch user. The reducer `touchGesture(state,
  reading)` in `src/camera/controls.ts` holds the whole rule and takes no DOM, because
  `vitest.config.ts` sets `environment: 'node'`. `attachControls` turns a `PointerEvent`
  into a reading and writes the view the reducer gives. A second Playwright project,
  `chromium-touch`, runs `e2e/touch.spec.ts` on a touch context, and it runs
  `e2e/00-renderer.spec.ts` as well, so the new context asserts the hardware renderer as
  `chromium-gpu` does.
- **The HUD panels.** `POSITION` takes both columns of the field grid, so the longest text
  of the panel no longer wraps. `DISTANCE FROM SOL` and `RANGE` share the row under it. The
  system row holds the name alone. Every category that holds a match opens by itself while
  the search box is not empty, and clearing the box gives the panel back to the one
  category the user opened by hand.
- **The row budget is shared.** The 200 system rows are a budget over every open list
  together, at `floor(200 / open)` rows each. Where more than 200 lists are open, the first
  200 show one row each and the rest show none.
- **The label filter reads elapsed time.** Every share, cap and floor is a rate per second,
  in the half-life form `1 - 0.5 ** (seconds * 1000 / halfLifeMs)`, so a label moves the
  same way at 30, 60 and 144 frames a second. The anchor keeps its cap of 1,200 CSS pixels
  a second. A **drift cap** goes on the smoothed target: the target may move at most
  `carry + 120 * seconds` CSS pixels on the screen in a frame, where `carry` is how far the
  map moved the point the filter already held. A label therefore travels with the map for
  free and drifts over it at 120 CSS pixels a second at most. The cap is solved by
  bisection on the real projection, because the plane point that gives a wanted screen
  move has no closed form. The handover from the region's centre to the frame's own samples
  takes a hysteresis band of `ANCHOR_REACH_SHARE`, 0.25 of the frame, so it does not cross
  back and forth. A frame that writes the view rather than moving it — `setView`, the
  landing of a selection flight, a view read from the URL fragment — drops the carried
  target and takes this frame's own target whole.
- **The boundary fades by the range of each pixel.** A fragment of a line draws nothing
  within 10,000 light years of the camera and in full beyond 20,000, on a smooth step
  between. The composite reads the plane point of each pixel through
  `uInverseViewProjection` and `uPlaneY`, so one line fades along its own length and a line
  near the horizon still draws while the line under the camera is gone. The fade holds its
  own constants, `REGION_RANGE_NONE` and `REGION_RANGE_FULL`, and does not reuse the close
  fade the phase before it removed. The zoom band that took the whole overlay away below
  5,000 light years goes; the far end, from 20,000 to 30,000, stays. The region **labels**
  keep the zoom band, because a label names the region the view sits in and is not a line
  on the plane.
- **The blur runs at every zoom in `accurate`.** The kernel's standard deviation is
  `max(radius / 3, 1)` CSS pixels, so a small radius still smooths, and the tap count is
  `2 * ceil(3 * sigma) + 1`. The radius reads the traced cell at
  `max(cursorDistance, 10,000)` light years: the cursor, with a floor at the nearest range
  the fade draws.
- **A grid coordinate label follows its own line.** The label's opacity is multiplied by
  `alpha / GRID_MAX_ALPHA`, the drawn alpha of its level at its crossing over the alpha at
  the cursor. The placement already reads that alpha for its gate, so the rule adds no
  work. The gate at `GRID_LABEL_MIN_ALPHA` of 0.09 floors the factor at 0.2.
  `debug.gridLabelReadings()` reports the text, the place, the alpha and the opacity of
  every label the overlay holds, so a browser test reads the rule and not a screenshot.
- **The browser reading views moved.** The three searches that are governed by the range
  fade read at a range of at least 20,000 light years and a zoom of exactly 20,000, and
  their viewports rise with the zoom so that one CSS pixel covers the light years it
  covered before. `tests/region-views.test.ts` asserts the count each search holds: 23 and
  2 straight runs for the width search over the smoothed and the traced set, 6,713 bends
  for the join search, 10 lattice nodes for the traced corner search and 4,605 plane points
  for the both-sets search.
- **The tests that read an absolute pixel turn the overlay off.** The pass now draws at
  every zoom under 30,000 light years, where it drew nothing below 5,000. Seventeen browser
  tests outside `e2e/regions.spec.ts` read an absolute pixel value at such a zoom, and each
  one whose reading is not about the overlay switches the overlay off. `e2e/look.spec.ts`
  holds none of them, so the committed baseline image does not move.

## Sources

- Galaxy density model: [galaxy-density-model.md](galaxy-density-model.md) in this
  repository.
- Almanac: `@elite-dangerous-almanac/core` on npm, source at
  `DarkSession/Elite-Dangerous-Almanac`. The API reference is the repository wiki.
