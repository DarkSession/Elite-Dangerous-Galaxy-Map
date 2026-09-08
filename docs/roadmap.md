# Roadmap

The map is built in four phases. Each phase is one OpenSpec change. This document
records what each phase must do and what we know about it so far. Update it when a
phase starts, when a decision changes, or when a question below gets an answer.

Last updated: 2026-09-08.

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
  changes when the camera moves. Phase 1 sets this up with one chunk per pass; phase 2
  uses it with one chunk per boxel.
- **Data and rendering stay separate.** Data producers emit typed arrays and plain
  objects. The renderer knows nothing about where they came from. A lint rule enforces
  the import direction.
- **Hardware rendering is asserted.** The browser suite fails on a software renderer.
- **Look.** The target is the game's galaxy map background: a cream bulge, pink-brown
  arms that turn violet at the edge, dust lanes along the arms, sparkle from many
  small points. The game's logo and the satellite blob in its map background are not
  part of the target. The far view reaches this with a curve of two slopes on the
  density before emission, a power of 0.35 above a knee at the density of the disc at
  Sol and 0.70 below it, a four-stop volume ramp by emission from a greyed blue-violet
  haze through dusty pink-brown arms and a soft salmon band to a cream-white core, coloured extinction
  for the dust, a point ramp by zone, cloud sprites that give the haze its chunks, a
  glow pass for the halo, and a tone map on the luminance over a dark grey background
  with a dither of one 8-bit step.

## Phase 1: far view

Changes: `far-view-galaxy-render`, then `far-view-look-second-pass`, then
`far-view-look-third-pass`. Status: implemented, under review.

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
  cloud pass draws 10,000 of the samples as large soft additive sprites between the
  volume and the points, so the haze is made of chunks in three dimensions; it fades
  out below 12,000 light years and draws nothing at 2,000. A glow pass holds the
  brightest pixels down, blurs the volume and the clouds at one eighth resolution and
  adds them back, which gives the halo past the rim and the light between the arms.
  The points carry a large share of the light in the disc, which gives the disc its
  grain. The frame budget test measures eight views: two cursors at 2,000, 12,000,
  20,000 and 120,000 light years.
- **Navigation.** A cursor on the galactic plane. Left drag orbits the cursor with
  pitch clamped to 5 to 89 degrees. Right drag moves the cursor in the plane. The wheel
  zooms between 2,000 and 120,000 light years. Keys `W A S D` move the cursor in the
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
  code change can tighten it. Measured worst case 4.6e-3 at 2,000, 5.3e-2 at 20,000 and
  0.2 at 120,000; a camera-in-matrix transform is more than 10 times worse.
- **Frame time measurement.** `gl.finish()` alone does not wait in Chromium's
  command-buffer WebGL. `measureFrames` reads one pixel after it to force the round
  trip, so the number is a superset of draw-to-finish.

## Phase 2: close zoom with decoration stars

Change: not yet created.

Extends the zoom down to individual stars. Draws stars that are decoration, not real
systems, and fades them out as the user zooms in.

- **Constraint.** Public information only. The game's own generation rules are not
  reproduced. Star positions are invented.
- **Density.** The phase 1 model gives the mass budget at any point. Measured against
  the game: about 4 systems per solar mass of budget in the disc and about 1 in the
  densest parts. Counts per boxel come from density times boxel volume times that
  calibration.
- **Level of detail.** The game's mass-code hierarchy is an octree: a sector is 1,280
  light years, mass code `h`; each lower code halves the edge down to `a` at 10 light
  years. Each level is a chunk. A boxel's stars come from a hash of its address, so the
  same boxel always shows the same stars. Per-level alpha driven by camera distance
  gives the fade.
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
  - `astro/codex-region` (about 9 KiB) and `astro/codex-region-lookup` (about 208 KiB):
    the 42 codex regions and a 49 light year lookup grid.
  - `astro/nebulae-real` (about 16 KiB), `astro/nebulae-procgen` (about 16 KiB),
    `astro/nebulae-planetary` (about 399 KiB): 5,835 nebulae in total, each a name, a
    system and a position.
  - The package's 64 MB of ship SVG assets never enter a bundle.
- **Licence.** The almanac's code is MIT. Its data carries source-specific terms,
  including Frontier's non-commercial media-usage notice and CC BY-NC 4.0 for some
  derived material. Review `THIRD_PARTY_NOTICES.md` in the package before release.
- **Open questions.**
  - Do decoration stars get names, for example the sector name under the cursor?
  - Do nebulae and hand-authored regions get labels, as in the game's map?
  - Do the volume ramp by density and the point ramp by zone unify into one?
  - Do the star counts per boxel read the detailed surface density or the corrected
    one? The detailed density is the game's map, so it is the better budget.
  - The zoom distance at which decoration stars appear and the distance at which
    they are fully faded.

## Phase 3: real systems from data

Change: not yet created.

Adds real systems from a JSON data object, a few thousand at most.

- **Record shape.** In-game coordinates, a system name, and additional data for the
  HUD. The exact fields are not yet decided.
- **Rendering.** One instanced pass, separate from the decoration stars. At this count
  no level of detail is needed.
- **Data path.** The data object is a data source like the density model: it enters as
  a plain object and leaves the data layer as typed arrays.
- **Open questions.**
  - Where the JSON comes from: bundled, fetched at load, or user-supplied.
  - The record format and how it is validated.
  - Whether real systems replace the decoration star at the same position.

## Phase 4: selection and HUD

Change: not yet created.

Lets the user select a placed system and shows its information in the HUD.

- **Picking.** On the CPU: project each real system to the screen and take the nearest
  within a pixel radius. No GPU id buffer at a few thousand systems.
- **HUD.** Plain DOM over the canvas. Shows the selected system's name, coordinates and
  the notable information from its record.
- **Open questions.**
  - Whether selection moves the cursor to the system.
  - Whether a selected system appears in the URL fragment.
  - Keyboard access to selection.

## Sources

- Galaxy density model: [galaxy-density-model.md](galaxy-density-model.md) in this
  repository.
- Almanac: `@elite-dangerous-almanac/core` on npm, source at
  `DarkSession/Elite-Dangerous-Almanac`. The API reference is the repository wiki.
