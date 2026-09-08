## 1. Project setup

- [ ] 1.1 Create `package.json` with pnpm, `type: module`, and the scripts `dev`, `build`, `preview`, `test`, `test:e2e`, `lint`, `format`; verify `pnpm dev --host 0.0.0.0` starts on 5173 and `pnpm preview` on 4173
- [ ] 1.2 Add dev dependencies `vite`, `typescript`, `vitest`, `@playwright/test`, `eslint`, `typescript-eslint`, `prettier`, `eslint-config-prettier` and the runtime dependency `gl-matrix`; verify `pnpm install` succeeds, `pnpm-lock.yaml` exists, and no `package-lock.json` exists
- [ ] 1.3 Add `tsconfig.json` (strict, ES2022, DOM and WebWorker libs), `vite.config.ts` with `server.host: true` and a `?raw` declaration for `.vert`, `.frag` and `.glsl` imports; verify `pnpm build` produces `dist/`
- [ ] 1.4 Add `eslint.config.js` and `.prettierrc` with a `no-restricted-imports` rule that forbids `src/galaxy-model/**` and `src/scene-data/**` from importing `src/render/**`; verify `pnpm lint` passes on an empty `src/` and fails on a test file that breaks the rule
- [ ] 1.5 Add `vitest.config.ts` with the Node environment and `tests/fixtures/` readable; verify `pnpm test` runs one placeholder test
- [ ] 1.6 Add `playwright.config.ts` with one project `chromium-gpu` using the flags from `.devcontainer/README.md`, `webServer` running `pnpm build && pnpm preview`, and `e2e/` as the test directory; run `pnpm exec playwright install chromium` so the browser matches the resolved Playwright version; verify `pnpm test:e2e` launches Chromium on the container display
- [ ] 1.7 Add `index.html` and `src/app/main.ts` that create a full-viewport canvas; verify the page loads in the dev server with no console error

## 2. Galaxy model data

- [ ] 2.1 Write `src/galaxy-model/galaxy-model.json.test.ts` against the committed `src/galaxy-model/galaxy-model.json`: exact top-level key set, `format` equals `galaxy-density-model-v1`, the `zone` and `calibration` key sets, the absence of `description`, `fit` and `samples`, and the size limit; verify it passes
- [ ] 2.2 Write `tests/fixtures/galaxy-model.test.ts` against the committed `tests/fixtures/galaxy-model.json`: at least 200 points, the presence of Sol, the galactic centre, Colonia and at least one point beyond the maximum height, and `parameters_sha256` equals the SHA-256 of the parameter file's bytes; verify it passes

## 3. Galaxy model port

- [ ] 3.1 Write `src/galaxy-model/types.ts` and `src/galaxy-model/load.ts` that parse and validate the document (format, four arms, correction length, correction range) and throw a named error; verify unit tests for the wrong format, a 4,095-value grid and an out-of-range value pass
- [ ] 3.2 Implement the planar model from `docs/galaxy-density-model.md` in `src/galaxy-model/surface.ts`: polar conversion, axisymmetric density, arm winding, arm factor, arm azimuth, arm points, pitch angle, correction sampling, corrected surface density; verify the fixture tests for both surface densities, arm azimuths, points and pitch angles pass at 1e-6 relative, and the arm geometry test passes
- [ ] 3.3 Implement the vertical profile, blend weight and half-mass height in `src/galaxy-model/vertical.ts`; verify the fixture tests for the profile and the half-mass height pass, the normalisation test at radii 0, 10,400 and 30,000 passes within 0.02, and the cut beyond the maximum height returns 0
- [ ] 3.4 Add volume density, mass density and zone to `src/galaxy-model/model.ts` as one exported model object; verify the fixture tests for volume density, mass density and zone pass
- [ ] 3.5 Add a centre-and-edge unit test: edge below 1e-4 of the centre, centre above 100 times Sol; verify it passes

## 4. Scene data

- [ ] 4.1 Write `src/scene-data/random.ts`, a seeded 32-bit generator with a `float()` in [0, 1); verify a unit test pins the first five values for seed 7
- [ ] 4.2 Write `src/scene-data/point-cloud.ts`: 1024x1024 corrected surface density table, cumulative distribution, cell draw by binary search, in-cell jitter, inverse-transform height draw, `Float32Array` positions and `Uint8Array` tints; verify the count-and-bounds test with 100,000 samples and the determinism test with seed 7 pass
- [ ] 4.3 Add the distribution tests: radial fraction within 10,000 light years of the centre and vertical fraction within 210 light years of the mid-plane among samples 19,000 to 21,000 light years from the centre, each within 0.03 of the model's integral; verify they pass
- [ ] 4.4 Write `src/scene-data/volume.ts`: 256x64x256 `Uint8Array`, texel centres, logarithmic encoding with reported `lo` and `hi`; verify the dimension, value-at-Sol and above-the-disc tests pass
- [ ] 4.5 Write `src/scene-data/point-cloud.worker.ts` and `src/scene-data/volume.worker.ts` that run the generators and post results with buffers in the transfer list, and `src/scene-data/load.ts` that starts both and resolves a scene-data object; verify the `MessageChannel` transfer test shows equal contents and zero-length source buffers
- [ ] 4.6 Verify the import rule: `pnpm lint` passes with the scene-data modules present and fails if one imports from `src/render/`

## 5. Camera

- [ ] 5.1 Write `src/camera/view.ts`: the view state, default view, cursor clamp to model bounds, pitch clamp 5 to 89, yaw wrap, distance clamp 2,000 to 120,000; verify unit tests for the clamp at (60,000, 0, 0), the pitch clamp and the zoom limits pass
- [ ] 5.2 Write `src/camera/projection.ts`: camera position from the view, the game-to-world flip `(x, y, -z)`, view and projection matrices with zero translation, and a `project(point, viewport)` helper; verify unit tests show the cursor at the screen centre within 1 pixel, the centre above Sol and (10,000, 0, 0) to the right of Sol at the default view
- [ ] 5.3 Write `src/camera/precision.test.ts`, a `Math.fround` emulation of the vertex transform with the cursor at (50,000, 0, 75,000) and distance 2,000; verify the clip-space separation of two points 1/32 light year apart is within 1e-3 relative of the `float64` result
- [ ] 5.4 Write `src/camera/controls.ts`: left drag by plane intersection, right drag at 0.3 degrees per pixel, wheel at 1.15 per notch, `W`/`A`/`S`/`D`/`R`/`F` at one quarter of the distance per second, `preventDefault` on wheel, drag and context menu; verify unit tests for one forward notch at 20,000 giving 17,391 and for the key movement pass
- [ ] 5.5 Write `src/app/url-view.ts` that parses and writes `#c=,d=,p=,y=` with a 500 ms throttle; verify unit tests for the parse of `#c=-9530,-910,19808&d=8000&p=50&y=120` and for the default view without a fragment pass

## 6. Renderer

- [ ] 6.1 Write `src/render/context.ts`: WebGL2 context creation, the `WEBGL_debug_renderer_info` read exposed as `window.__galaxyMap.renderer`, the software-renderer check, and the no-WebGL2 message; verify a unit test with a stubbed renderer string `SwiftShader` reports an error and a stubbed null context reports the WebGL2 message without throwing
- [ ] 6.2 Write `src/render/program.ts` and `src/render/buffers.ts`: shader compilation with error text, buffer and 3D texture upload; verify a browser smoke test compiles a trivial program without error
- [ ] 6.3 Write `src/render/shaders/points.vert` and `points.frag` and `src/render/point-pass.ts`: per-chunk origin uniform, distance-scaled point size clamped to 1 to 4 pixels, additive blend, soft falloff; verify a browser test renders the point cloud and the frame is not black
- [ ] 6.4 Write `src/render/shaders/volume.vert` and `volume.frag` and `src/render/volume-pass.ts`: box intersection, 96 steps, logarithmic decode, colour ramp and absorption, half-resolution target; verify a browser test renders the volume alone and the pixel at the centre is brighter than the pixel at Sol
- [ ] 6.5 Write `src/render/composite-pass.ts` and `src/render/renderer.ts`: volume, then points, then tone map, resize to viewport times device pixel ratio capped at 2, one `float64` origin subtraction per chunk per frame, and `window.__galaxyMap.measureFrames(n)` that times draw-to-`gl.finish()` per frame and returns the mean while the normal loop never calls `gl.finish()`; verify the resize browser test gives a 1600x1200 drawing buffer at 800x600 and ratio 2, and `measureFrames(10)` returns a positive number
- [ ] 6.6 Wire `src/app/main.ts`: renderer check, scene-data load, view from the URL fragment, controls, render loop, the scene-data ready event; verify the page renders the default view in the dev server

## 7. Browser tests

- [ ] 7.1 Write `e2e/00-renderer.spec.ts` that reads `window.__galaxyMap.renderer` and fails when it is missing, empty, or contains `SwiftShader`, `llvmpipe` or `Software`; verify it passes on the container GPU and fails with a missing string when Chromium runs with `--disable-gpu`
- [ ] 7.2 Write `e2e/scene-data.spec.ts`: ready event within 5 seconds, and no long task over 100 ms via `PerformanceObserver` from navigation start to the first drawn frame, uploads and shader compilation included; verify it passes
- [ ] 7.3 Write `e2e/look.spec.ts`: luminance at the centre above 0.8, at Sol above 0.05, at (-45,000, 0, 0) below 0.02, and the 1280x720 baseline with `maxDiffPixelRatio: 0.02`; verify it passes and commit the baseline image
- [ ] 7.4 Write `e2e/frame-budget.spec.ts` that sets the six views by URL fragment at 1920x1080, calls `window.__galaxyMap.measureFrames(300)` for each, and asserts each mean is under 16.7 ms; verify it passes
- [ ] 7.5 Write `e2e/navigation.spec.ts`: plane point under the pointer after a 200-pixel drag within 1 pixel, `W` held for 1 second moving 5,000 light years within 10 percent, `d=30000` in the fragment within 1 second of a zoom, and no context menu on right drag; verify it passes

## 8. Documentation

- [ ] 8.1 Write `README.md` with setup, the scripts, the control scheme, a pointer to `docs/galaxy-density-model.md`, and the renderer assertion; verify the commands in it run as written
- [ ] 8.2 Update `AGENTS.md`: remove the greenfield note, list the `src/` layout and the import rule; verify `pnpm lint` and both test suites pass on the final tree
