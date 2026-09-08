## 1. Readback and test helpers

- [x] 1.1 Add `readRect(x, y, width, height)` to the renderer in `src/render/renderer.ts`, expose it on the page global in `src/render/global.ts` and `src/app/main.ts`; verify a unit-free check in the browser that `readRect(x, y, 1, 1)` equals `readPixel(x, y)` at three pixels
- [x] 1.2 Add the `clouds` field to `PassSwitches`, `setPasses` and the page global's `setPasses` type, on by default and unused until the pass exists; verify `pnpm exec tsc --noEmit` passes
- [x] 1.3 Add to `e2e/helpers.ts`: `readRect`, `meanLuminance5(page, point)`, `cornerMean(page)`, `ringSpread(page, radius)` for the 10th and 90th percentiles of the corner-subtracted 5 x 5 means at 72 points on a circle around the galactic centre, `bandPass(page, point)` for the 120 x 120 block measure of the spec, and `columnLuminance(page, x, fromY, toY)`; verify each once from a scratch test that prints its value on the current tree

## 2. Scenarios

- [x] 2.1 Add to `e2e/look.spec.ts` the tests that must fail on the current tree: Sol's colour, the band colour at (9,015, 0, 25,895), the bulge fall-off, the patch contrast at 32,000 and 38,000, the chunks from above and from the side, the clouds carrying light, the soft top, the flat-colour dither, the bounded halo and the sky; verify each fails on the current tree and record its value in the design's open questions
- [x] 2.2 Add to `e2e/look.spec.ts` the tests that guard a property the tree already has: the centre's green over blue by 0.06, the median blue over red on the 38,000 circle, the clouds fading at 2,000 light years, and the stable dither as two screenshots compared as buffers; verify each passes on the current tree
- [x] 2.3 Add the distance of 12,000 light years to `e2e/frame-budget.spec.ts`; verify the test prints eight means and passes on the current tree

## 3. Volume and points

- [x] 3.1 Change `volume.frag`: the emission curve with two slopes and the knee constant, the four-stop ramp with the colours and ranges of the design, and the fade by height beside the fade by radius; verify the shader compiles in the browser and the soft-top test passes
- [x] 3.2 Change `points.frag`: the cool and warm colours and the zone key of the design; verify the Sol colour test reads green above blue

## 4. Tone map

- [x] 4.1 Change `tonemap.frag`: the curve `W * L / (1 + L)`, the white level and the exposure default in `renderer.ts` aimed at the centre near `L = 2.5`, and the triangular dither from a pixel hash after the blend; verify the flat-colour dither test, the stable-dither test and the centre test pass

## 5. Glow

- [x] 5.1 Change `glow-pass.ts`: two linear blits from the half-resolution target through a quarter target to the eighth target before the blur, so the downsample is a 4 x 4 box; set the sigma to 3 percent per round and the weight to 0.5; verify the sky test passes and the halo test reads inside 0.02 to 0.05

## 6. Cloud pass

- [x] 6.1 Write `src/render/shaders/clouds.vert` and `clouds.frag`: instanced quads from a corner attribute, the sprite radius in light years from the camera-relative range, the cap at 64 target pixels with the brightness scaled by the square of the wanted over the drawn radius, the fade uniform, the fall-off `(1 - r^2)^2` and the colour `mix(haze, arms, zone)` with the volume ramp's constants; verify both compile in the browser
- [x] 6.2 Change `src/render/buffers.ts` to build a second vertex array over the position and tint buffers with the attribute divisor 1 and a corner buffer, exposed on `PointBuffers` and disposed with it, and `src/render/point-pass.ts` to expose the buffers to the cloud pass; verify the point tests in `e2e/render.spec.ts` still pass
- [x] 6.3 Write `src/render/cloud-pass.ts`: the program over the cloud vertex array, drawn with `drawArraysInstanced` for the first 10,000 samples with additive blending into the half-resolution target, with the brightness and the fade as uniforms, rebuilt when `setPointCloud` runs; verify the clouds-fade test passes and a frame with the clouds alone shows sprites at the default view
- [x] 6.4 Add `cloudBrightness` to `LookSettings`, wire the `clouds` switch to the pass; draw the pass in `renderer.ts` after the volume and before the glow; change `e2e/render.spec.ts` so the points-alone test and the all-off test switch the clouds off; verify `pnpm lint`, `pnpm exec tsc --noEmit` and the render smoke tests pass

## 7. Tuning

- [x] 7.1 Tune the ramp and the point colours; verify the colour tests and the centre test pass, and record the values in the design's open questions
- [x] 7.2 Tune the knee, the low slope, the exposure and the white level; verify the bulge fall-off, the gap and the patch tests pass with the whole look test rerun, and record the values
- [x] 7.3 Tune the glow sigma and weight; verify the halo and the sky tests pass, and record the values
- [x] 7.4 Tune the cloud radius, brightness and fade; verify the chunk tests, the clouds-carry-light test and the frame budget test at eight views pass, and record the values
- [x] 7.5 If a scenario cannot be met without breaking another, change its threshold in the spec delta and state the reason in the design; verify `openspec validate far-view-look-third-pass` passes

## 8. Baseline and documentation

- [x] 8.1 Regenerate the baseline with `pnpm exec playwright test e2e/look.spec.ts --update-snapshots`, compare it by eye with the reference for the cream-white bulge with its fall-off, the salmon band, the pink-brown arms, the blue-violet patchy haze and the dark sky, and verify the baseline test passes on a second run
- [x] 8.2 Take side-view screenshots at `#c=15,0,25895&d=70000&p=5&y=0` and at `d=25000`, verify by eye that the sky shows no horizontal bands and the bulge has no hard top, and keep them out of the repository
- [x] 8.3 Update `docs/roadmap.md`: the look bullet with the four-stop ramp, the two-slope curve, the clouds and the dither, and the phase 1 rendering bullet with the cloud pass and the eight frame budget views; verify the status line names this change
- [x] 8.4 Run `pnpm lint`, `pnpm exec prettier --check .`, `pnpm exec tsc --noEmit`, `pnpm build`, `pnpm test` and `pnpm test:e2e`; verify all pass and the frame budget test prints eight means under 16.7 ms
