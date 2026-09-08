## Why

The repository has no application code. Nothing draws the galaxy, and nothing can be
measured against the performance the project demands. The Elite Dangerous community
has no browser map that looks like the game's galaxy map; existing web maps draw
catalogued systems as dots and show none of the galaxy's shape.

This change is phase 1 of four. It draws the galaxy from far away, with the shape the
game shows: bar, bulge, disc, four spiral arms and dust lanes. The user can move the
view across the galaxy and zoom between whole-galaxy and region scale. Phases 2 to 4
add decoration stars at close zoom, real systems from data, and selection with a HUD.
Each later phase is its own change.

## Problem

The galaxy holds about 400 billion systems. No browser can hold or draw them, and no
public data set lists them. The far view must draw the galaxy's shape without a star
catalogue.

The repository holds a compact analytic model of the game's stellar-mass distribution
as data: 29 parameters plus a 64x64 correction grid, fitted to the game's own density
maps, with a fixture of reference values and a document of the formulas. It gives the
mass density at any point in light years. It does not place individual stars. This is
enough for the far view and is the only density source this change uses.

## What Changes

- Create the project: `package.json`, Vite, TypeScript, ESLint, Prettier, Vitest and
  Playwright, with the scripts the editor configuration already calls (`dev`, `build`,
  `preview`).
- Port the galaxy model to TypeScript from the formulas in
  `docs/galaxy-density-model.md`. The committed fixture pins the port.
- Generate scene data from the model in Web Workers: a point cloud of 2,000,000 samples
  and a 256x64x256 density volume.
- Render the scene with WebGL2 in two scene passes and a tone map: additive point
  sprites and a raymarched volume. Render camera-relative so positions stay exact at
  every distance.
- Add a camera with the game's control scheme: a cursor on the galactic plane that the
  user drags, an orbit around the cursor with clamped pitch, and wheel zoom between
  2,000 and 120,000 light years from the cursor.
- Assert on the hardware renderer in the browser tests and fail the suite on software
  rendering.

## Non-goals

- Individual stars, procedural or real. The far view shows density only.
- Placing systems by the game's own generation rules.
- The `@elite-dangerous-almanac/core` dependency. Phase 2 adds it.
- The HUD, system selection and system data. Phases 3 and 4 add them.
- Nebula labels, region labels, the satellite galaxies and the game logo.
- Touch input and gamepad input.
- Tinting beyond the volume ramp by density and the point ramp by zone.

## Capabilities

### New Capabilities

- `galaxy-density-model`: the TypeScript port of the compact galaxy model, its stripped
  parameter file and the fixture that pins the port.
- `far-view-scene-data`: the point cloud and density volume generated from the model,
  as typed arrays with no rendering types.
- `far-view-rendering`: the WebGL2 renderer, its two scene passes and tone map,
  camera-relative drawing, the hardware renderer assertion and the frame budget.
- `map-navigation`: the cursor, orbit and zoom controls and their limits.

### Modified Capabilities

None. The repository has no specs yet.

## Scale

- The model evaluates in constant time per sample. The point cloud is 2,000,000
  samples at 13 bytes each, three `float32` coordinates and one tint byte (26 MB in the
  GPU). The volume is 4,194,304 bytes.
- Scene data generation completes in under 5 seconds in a worker on the dev container.
- The renderer holds a mean frame time under 16.7 ms at 1920x1080 on the dev
  container's GPU, at every zoom distance in range.
- Positions span 100,000 light years. The game's own resolution is 1/32 light year, and
  the renderer keeps it to the `float32` limit of the camera-relative frame: within
  1e-2 at the closest zoom distance, growing in proportion to the distance.

## Impact

- New directories under `src/`: `galaxy-model/`, `scene-data/`, `render/`, `camera/`
  and `app/`. New `e2e/` for Playwright tests. `tests/fixtures/` already holds the
  model fixture.
- New runtime dependency: `gl-matrix`, for vector and matrix math. It is small, typed,
  and its latest release is more than a year old, so the 7-day hold does not affect it.
  No other runtime dependency.
- New development dependencies: `vite`, `typescript`, `vitest`, `@playwright/test`,
  `eslint`, `typescript-eslint`, `prettier`, `eslint-config-prettier`, and the three
  the ESLint flat config and the Node test imports need, `@eslint/js`, `globals` and
  `@types/node`. No entry in `minimumReleaseAgeExclude`.
- The 13 KB parameter file, the 69 KB fixture, `docs/galaxy-density-model.md` and
  `docs/roadmap.md` are in the working tree with this proposal and are committed with
  it. `AGENTS.md` gains a pointer to the roadmap; task 8.2 edits it again. The
  parameter file carries no attribution text, description or fit report. No script in
  the repository regenerates the data; the fixture carries the parameter file's SHA-256
  so a changed parameter file fails the tests until the fixture is replaced.
- The data layer, the scene-data layer and the renderer share only typed arrays and
  plain objects. A future data source replaces the first two without touching the
  third.
