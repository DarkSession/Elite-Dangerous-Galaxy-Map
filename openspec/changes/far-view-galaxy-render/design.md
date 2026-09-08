## Context

See proposal.md for motivation. The repository holds the phase 1 application code. The
tooling is fixed by the dev container and editor configuration: TypeScript, Vite on
5173 and 4173, Vitest, Playwright, ESLint, Prettier, pnpm with a 7-day release hold,
and a real NVIDIA GPU behind Chromium.

The density source is the compact galaxy model in `src/galaxy-model/galaxy-model.json`,
with its formulas in `docs/galaxy-density-model.md` and reference values in
`tests/fixtures/galaxy-model.json`. It is closed-form: bulge, bar, exponential disc,
truncation, four logarithmic spiral arms with a shared winding law, a two-component
vertical profile blended by radius, and a 64x64 correction grid of `ln(data / model)`.
The port is about 500 lines with no tables beyond the grid and a 24-point zone ramp.

Game coordinates: `x` right, `y` up out of the disc, `z` from Sol toward the galactic
centre. Sol is the origin and 1 unit is 1 light year. The game resolves positions to
1/32 light year. The galactic centre used by the model is (15, -35, 25895). The
generated volume spans about 100,000 light years on `x` and `z`.

## Goals / Non-Goals

**Goals:**

- Frame cost that does not depend on galaxy size: bake once, draw from buffers.
- A data path that a different density source can replace without touching the
  renderer.
- Positions exact to the `float32` limit of the camera-relative frame at every zoom
  distance, which is 1/32 light year within about 1e-2 at the closest zoom.
- The layout and conventions that phases 2 to 4 build on: chunked, camera-relative
  drawing and a cursor-based camera.

**Non-Goals:**

- A general scene graph or material system.
- Streaming or level of detail. Phase 1 has one static chunk per pass.
- Matching the game pixel for pixel. The target is the same structures at the same
  brightness ratios.

## Decisions

### Raw WebGL2 with a thin wrapper, not three.js

Every pass in this map is a custom shader: additive point sprites and a raymarched
volume. Three.js would supply a camera, controls and a scene graph that the passes
bypass, at about 600 KB, and its OrbitControls pan in screen space rather than on the
galactic plane. The wrapper is small: context creation, program compilation from
`.vert` and `.frag` files imported with Vite's `?raw`, buffer and texture upload, and
uniform setting. `gl-matrix` supplies vector and matrix math. Its latest release is
older than the 7-day hold.

Alternative considered: `regl` or `twgl`. Both are thin, but both are unmaintained or
near it, and neither removes the shader work. Not worth a dependency.

### WebGL2, not WebGL1 and not WebGPU

The volume pass needs 3D textures and the point pass needs `gl_PointSize` in the vertex
shader and `GL_POINTS`. WebGL2 gives all of these in every current browser.
WebGPU is not in every browser and the project's rules name WebGL.

### Point cloud sampled from a 2D density table plus a closed-form vertical draw

The worker builds a 1024x1024 table of corrected surface density over the bounds
(98 light year cells), turns it into a cumulative distribution, draws a cell by binary
search on a uniform random number, and jitters uniformly inside the cell. The height
comes from the vertical profile by inverse transform: the inner `sech2` component gives
`h * atanh(u)` and the outer exponential gives `-h * ln(u)`, chosen by the blend weight
at that radius. This is exact for the vertical profile and accurate to a cell for the
plane, with no rejection loop.

Alternative considered: rejection sampling against the analytic function. Arm contrast
makes the acceptance rate poor near the bar and the loop cost unpredictable.

Randomness comes from a seeded 32-bit generator so a seed reproduces a cloud. Sample
positions are stored as `float32` light years. The tint is the zone value at `(x, z)`,
one byte.

### Density volume baked on the CPU in a worker

The volume is 256 x 64 x 256 `uint8`, 4 MB, covering the bounds in `x` and `z` and
-3,000 to 3,000 light years in `y`, past the model's 2,867 light year cut so the
outermost layers are zero. Each texel evaluates the model once at its centre:
4.2 million evaluations at about 60 arithmetic and transcendental operations each,
under 2 seconds in a worker. The encoding is logarithmic between fixed `lo` and `hi`
bounds so the shader decodes with one multiply-add and one `exp`. The floor is 1 map
unit per light year, not the model's epsilon of 300. The disc near Sol is about 30 map
units per light year. With the model's epsilon the whole outer disc fell into the
lowest eight byte values. That made a stepped edge under the emission power.

Alternative considered: render the volume layer by layer on the GPU. Faster, but it
puts the model in a shader, which ties the data layer to the renderer and duplicates
the port. The CPU bake keeps the model in one place and the volume a plain array.

### Two passes: raymarched volume, then additive points

The volume pass raymarches the 3D texture from the camera through the volume's bounding
box, 96 steps. Each step decodes the density, divides it by the peak texel and raises
the ratio to the power 0.35. The peak texel is about 250 times the density at Sol. The
power brings that ratio to about 7, so the bulge and the disc share one display range,
as the game's map does. A smoothstep fade from 0.03 to 0.09 of the compressed value
removes the thin haze past the truncation and gives the disc a soft edge. The emission
and a small absorption term scale with this compressed density, so the arms show dust
against the bulge. The volume colour ramp runs by compressed density: violet haze at
the edge of the disc, pink-brown arms, cream bulge. It draws to a half-resolution
target and upsamples. The point pass draws
2,000,000 `GL_POINTS` with additive blending and a soft radial falloff in the fragment
shader, point size scaled by distance and clamped to 1 to 4 pixels. The point colour
ramp runs by population zone, from blue-white to warm white. Each sample gets a
brightness from a hash of its index, with a mean of one; most samples are dim and a
few are bright, so the disc has grain. A final pass tone-maps the sum with a curve on
the luminance that scales the colour, so the arms keep their hue.

Alternative considered: linear emission from the decoded density. The bulge saturates
to white and the arms are too dark to see. The power is a look choice and stays in the
shader.

The frame budget holds because both passes read baked data: at 1920x1080 the volume
pass is about 50 million texture samples at half resolution, and the point pass is one
draw call.

### Camera-relative drawing with per-chunk origins

Each chunk holds positions relative to its own origin. Per frame the CPU computes
`chunkOrigin - cameraPosition` in `float64` and uploads it as one `vec3` uniform. The
vertex shader adds the relative position to that offset and multiplies by a view
matrix whose translation is zero. No buffer changes when the camera moves. In phase 1
the point cloud is one chunk with its origin at Sol, the volume is one chunk with its
origin at the bounds corner, and the scheme is what phase 2 chunks per boxel.

A unit test emulates the shader arithmetic with `Math.fround` to check the precision
requirement without a GPU. The requirement is 1e-2 relative at the closest zoom
distance and grows in proportion to the distance, because that is what `float32`
reaches: at distance 2,000 light years the separation of 1/32 light year is 1/64,000
of the coordinate, about 2^-16, which leaves 8 mantissa bits, and one rounding in the
matrix multiply is about 4e-3 of the separation. The measured worst case over a cursor,
yaw and pitch sweep is 4.6e-3 at 2,000, 5.3e-2 at 20,000 and 0.2 at 120,000, each
about half its bound. A transform that keeps the camera in the matrix is more than 10
times worse, and the test checks that too.

### World frame is game coordinates with `z` negated

The renderer's world frame is `(x, y, -z)` in game coordinates, which makes it
right-handed for a standard projection and puts the galactic centre at the top of the
screen when the camera looks from Sol toward the centre. The flip lives in one function
at the data boundary, and every stored position stays in game coordinates.

### Cursor camera, in the project's own code

The view is `{cursor, distance, yaw, pitch}` with a fixed 60 degree vertical field of
view. Yaw 0 puts the camera on the `-z` side of the cursor looking toward `+z`, so the
default view from Sol has the galactic centre at the top of the screen. The camera
position is derived from the view each frame. Left drag changes yaw and pitch, as in
the game's map. Right drag intersects the pointer ray with the plane at the cursor's
height at drag start and moves the cursor by the difference. The wheel scales
distance. The view lives in one plain object so the URL fragment, the tests and the
renderer read the same state.

### Layout

```
src/
  app/            bootstrap, renderer check, error messages, URL fragment
  galaxy-model/   model port, parameter JSON, types
  scene-data/     point cloud worker, volume worker, seeded random
  render/         context wrapper, passes, shaders/*.vert|*.frag
  camera/         view state, projection, controls
docs/
  galaxy-density-model.md  the formulas the port implements
tests/fixtures/            model fixture (committed data)
e2e/                       Playwright tests, baseline images
```

An ESLint `no-restricted-imports` rule keeps `galaxy-model/` and `scene-data/` from
importing `render/`.

Prettier formats `src/`, `e2e/`, `tests/` and the repository root. `.prettierignore`
excludes the committed data files, whose bytes the fixture hashes, the shader files,
the OpenSpec artifacts, the generated skill and command files, the dev container and
editor configuration, and the lockfile. Those files are owned by other tools or other
changes, and reformatting them adds diff noise.

The renderer owns the point and volume programs and deletes them once. Those passes
own only their buffers or texture, so a second upload of the point cloud or the volume
reuses the compiled program. The composite pass owns its own two programs, blit and
tone map, because nothing re-creates it.

### Testing

Vitest runs the model, sampler, camera and precision tests in Node. Playwright runs one
project, `chromium-gpu`, with the flags from the dev container README. The ANGLE
backend is `vulkan`, not `gl-egl`: in this container `gl-egl` reaches only the Mesa
software driver, headless and headed alike, and Vulkan reaches the NVIDIA card in both
cases. Its first test reads the exposed renderer string and fails the suite when it is
missing, empty or names a software renderer. With `--disable-gpu` current Chromium
exposes a SwiftShader string rather than no string, so the test fails on the software
name; the missing-string branch stays for builds that give no context at all. The
baseline image is captured on the dev container GPU and compared with a 2 percent
pixel-ratio tolerance.

Frame times cannot come from `requestAnimationFrame`: under vsync its deltas sit at
16.67 ms whatever the GPU load. The page exposes `window.__galaxyMap.measureFrames(n)`,
which renders `n` frames, calls `gl.finish()` after each and times draw-to-finish with
`performance.now()`. In Chromium's command-buffer WebGL `gl.finish()` returns before
the card is done, so the function reads one pixel after it to force the round trip; the
time is a superset of the draw time. The normal loop never calls `gl.finish()`.

The 7-day hold resolves `@playwright/test` to a release older than the browser cached
at container build, so setup runs `pnpm exec playwright install chromium` once to
fetch the matching build into the cache volume.

## Risks / Trade-offs

- [The model's fit error is a factor of about 1.2 with the correction grid, and the
  painted clumps are smoothed] → Accept. The baseline test compares against the map's
  own output, not against the game.
- [Volume raymarching is the one pass with per-pixel cost] → Half-resolution target
  and a fixed step count. If the budget test fails, drop steps before resolution.
- [The correction grid at 1,562 light years per cell shows as blocks at close zoom] →
  Bilinear sampling in the bake. Phase 2 replaces the close view with stars.
- [Two million additive points alias into a uniform haze at the far zoom] → Point size
  clamps at 1 pixel and brightness scales by distance so the haze matches the volume.
  The baseline test pins the result.
- [The 26 MB buffer upload, the 4 MB 3D texture upload and the raymarcher compile can
  approach the 100 ms long-task limit in one task] → Do them in separate animation
  frames: compile programs first, upload the volume next, upload the points last, and
  draw the first frame after that.
- [The baseline image ties the test to one GPU and driver] → The tolerance is 2
  percent, and a driver change regenerates the baseline in a reviewed commit.
- [The parameter file and the fixture are committed data with no generator in the
  repository] → The fixture carries the parameter file's SHA-256, so a changed
  parameter file fails the tests until a matching fixture replaces it. The formulas
  document is the reference for the port.
- [The 7-day hold resolves each dev dependency to a version at least a week old] →
  Expected. No exclusions.

## Open Questions

- The exact colour ramp, power and absorption strength. They tune the look and do not
  change the specs; the baseline is captured after tuning.
- The compressed emission makes the disc look thick at zoom distances near 10,000
  light years, because the low density above the plane gains brightness. Does phase 2
  reduce the volume pass emission at close range, or does the near look replace it?
- Whether the volume ramp by density and the point ramp by zone unify into one.
