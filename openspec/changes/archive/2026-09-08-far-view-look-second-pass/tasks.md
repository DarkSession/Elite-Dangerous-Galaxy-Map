## 1. Committed data

- [x] 1.1 Check the two data files that arrived with the proposal: `src/galaxy-model/galaxy-detail.png` has SHA-256 `75c138ef94e8df02579e8a798f3dcde256c6c56f01880b35703c53919645e1d3` and 347,358 bytes, and `tests/fixtures/galaxy-detail.json` has `format` `galaxy-detail-fixture-v1` and 203 points; if either is missing or differs, stop and ask, because no script in the repository regenerates them
- [x] 1.2 Add `tests/fixtures/galaxy-detail.json` to `.prettierignore` beside the model fixture; verify `pnpm exec prettier --check .` passes
- [x] 1.3 Write `tests/fixtures/galaxy-detail.test.ts`: `png_sha256` equals the hash of the PNG's bytes, at least 200 points, the presence of (0, 0), (15, 25895), (-9530, 19808) and a point outside the bounds; verify it passes

## 2. Galaxy model

- [x] 2.1 Write `src/galaxy-model/png.ts`: a decoder for 8-bit greyscale non-interlaced PNG that reads the signature and the IHDR chunk, inflates the IDAT chunks through `DecompressionStream('deflate')`, applies the five row filters, and throws a named error on any other shape; verify a unit test decodes a 2 x 2 image built in the test and a wrong-size image is rejected with the size in the message
- [x] 2.2 Write `src/galaxy-model/detail.ts`: `SurfaceDetailGrid` (size, scale, values), `decodeDetailGrid(bytes)` that checks 1024 x 1024, `sampleDetail(grid, bounds, x, z)` with the bilinear rule of the correction grid, and `loadDetailGrid()` that fetches the PNG through a Vite `?url` import; verify a unit test decodes the committed PNG from disk and its SHA-256 equals the fixture's `detail_sha256`
- [x] 2.3 Add `detailedSurfaceDensity(x, z)` and `detailedVolumeDensity(x, y, z)` to the model object, with `createGalaxyModel(source, detail?)` taking an optional grid and returning the corrected values when no grid is given; verify `src/galaxy-model/detail.test.ts` checks the detail and the detailed surface density at every fixture point within the stated tolerance, and the arm texture test gives a ratio above 3 detailed and below 2.5 corrected
- [x] 2.4 Verify the existing model fixture tests still pass with the model built without a grid, and `pnpm lint` passes

## 3. Scene data

- [x] 3.1 Add `SurfaceDetail` (size, origin, extent, scale, data) to `src/scene-data/types.ts` and to `SceneData`, and add its buffer to `sceneDataTransferables`; verify the transfer test in `messages.test.ts` shows equal contents and a zero-length source buffer for the grid
- [x] 3.2 Change `buildSurfaceTable` to evaluate the detailed surface density and to emit the ratio grid from the same loop, `round(127 * clamp(ln(detailed / corrected), -3, 3) / 3) + 128` with the ratio taken as 1 where both are 0; verify a unit test decodes the cell that contains Sol within a factor of 1.03 of the model's ratio at that cell's centre
- [x] 3.3 Change the point cloud worker to load the detail grid, build the model with it, generate the cloud, and post the cloud and the ratio grid together with both buffers in the transfer list; change `loadSceneData` to return `{ pointCloud, volume, detail }`; verify the page still reaches the ready event in the dev server
- [x] 3.4 Update `distribution.test.ts` to integrate the detailed surface density, with the test model built from the committed grid; verify the radial and vertical distribution tests pass within 0.03
- [x] 3.5 Verify `e2e/scene-data.spec.ts` still passes: ready within 5 seconds and no task over 100 ms, with the detail texture upload in its own animation frame

## 4. Renderer

- [x] 4.1 Add `createDetailTexture` to `src/render/buffers.ts`: an R8 2D texture with linear filtering and clamp to edge; add `setDetail(detail)` to the renderer and call it from `main.ts` in its own animation frame; verify `pnpm test:e2e e2e/render.spec.ts` still passes
- [x] 4.2 Change `volume.frag` and `volume-pass.ts`: sample the detail texture at `vec2(local.x, 1.0 - local.z)`, the same `z` flip as the volume texture, and multiply the decoded density by `exp((value * 255 - 128) * uDetailScale)`, replace the density fade with a fade by radius from a `uCentre` uniform, full inside 47,000 and zero at 51,000 light years, and make the extinction a `vec3` with blue absorbed most; verify the volume-alone browser test still gives a centre brighter than Sol
- [x] 4.3 Write `src/render/glow-pass.ts` and `src/render/shaders/blur.frag`: two targets at one eighth of the frame, two rounds of a separable 9-tap Gaussian, the first of which downsamples, with sigma at a fixed fraction of the frame height, 4.5 percent after tuning, and an additive blit into the scene target with a weight and a tint; add the `glow` switch to `setPasses`, `LookSettings` and the page global; verify the pass compiles and the frame budget test passes at the six views
- [x] 4.4 Change `tonemap.frag`: scale the curve to a white level below 1, and blend the colour over a constant dark grey after the gamma curve as `grey + (1 - grey) * colour`; move the cream stop of the volume ramp so no channel clips at the white level; verify the centre pixel at the default view has luminance between 0.8 and 0.97 with red above blue by at least 0.08, and the points alone read a centre luminance at least 0.3 above the mean of the four corners
- [x] 4.5 Tune the look constants against the scenarios: the glow weight and tint for the halo pixel at least 0.05 above its value without the glow, the emission and the point brightness for grain above 0.06 at Sol measured with the scenario's 26 x 26 read and inner 24 x 24 block and luminance above 0.10 at (13,736, 0, 2,116), and the grey for corners between 0.02 and 0.06; verify each number by reading the pixels in the browser and record the reached values in the design's open questions

## 5. Browser tests

- [x] 5.1 Extend `e2e/look.spec.ts` with the centre colour, the dark point between the arms, the halo pixel with and without the glow switch, the grain block at Sol and the four corners; verify the tests pass on the container GPU
- [x] 5.2 Change the points-alone test in `e2e/render.spec.ts` to compare the centre and the brightest pixel with the mean of the four corner pixels, margin 0.3, instead of with black, and to assert in the same test that with all passes off both differences are below 0.3; verify it passes
- [x] 5.3 Regenerate the baseline image with `pnpm exec playwright test e2e/look.spec.ts --update-snapshots`, compare it by eye with the reference for the cream bulge, the pink-brown arms, the lit gaps, the violet halo and the grain, and verify the baseline test passes on a second run
- [x] 5.4 Run the whole suite: `pnpm lint`, `pnpm build`, `pnpm test`, `pnpm test:e2e`; verify all pass and the frame budget test prints six means under 16.7 ms

## 6. Documentation

- [x] 6.1 Add a "Detail grid" section to `docs/galaxy-density-model.md`: the file, the encoding, the sampling rule, the detailed density formula, and the accuracy table from the design; verify the formulas match the code by reading them side by side
- [x] 6.2 Update `docs/roadmap.md`: the density source and accuracy bullets of phase 1, the look bullet, the data bullet with the second committed file, and the phase 2 open question on which density the star counts use; verify the dates and the status line are current
- [x] 6.3 Update `README.md`: the committed data paragraph names the detail PNG and its fixture beside the model files; verify the commands in it still run as written
