## 1. Scenarios

- [x] 1.1 Add `ringColour5(page, radius)` to `e2e/helpers.ts`: the 5 x 5 mean colour at the 72 ring points less the mean corner colour, computed inside the page as `ringSpread` does; verify it once from a scratch test that prints the dark and the bright 18-point medians of `rg` at 14,000 and of `bl` at 44,000 on the current tree, and check them against the design's context values 0.061, 0.055 and 0.077, 0.045
- [x] 1.2 Change `e2e/look.spec.ts` for the modified scenarios: the centre colour window, the ring at 20,000 light years in the patch contrast test with its factor of 1.6, and the rim light test reading the 90th percentile and the median; verify the centre window and the 20,000 ring fail on the current tree with the values the design's context records, and the rim light test passes
- [x] 1.3 Add the four new scenarios to `e2e/look.spec.ts`: the inner disc ring luminance, the red-brown lanes, the blue haze with pink patches, and the rim puff contrast; verify each fails on the current tree with the values the design's context records, and each prints its readings with `console.log` as the other look tests do

## 2. The volume

- [x] 2.1 In `src/render/shaders/volume.frag`, add the second ramp axis: the LANE and PATCH colours, the inner and the outer ramp, and the blend by galactocentric radius with the two blend radii as constants, leaving the existing DUST extinction constant as it is and changing its comment so it no longer says the lanes are brown; verify the shader compiles when the page loads with no error in the console, and a volume-only frame at the default view shows brown lanes inside 20,000 light years and blue space beyond 30,000 by eye
- [ ] 2.2 In `src/render/shaders/volume.frag`, move the knee constant and, if the ring luminance scenario asks, the low slope, and re-set `DEFAULT_EXPOSURE` in `src/render/composite-pass.ts` to hold the ring at 32,000 light years; verify the inner disc ring luminance scenario, the arm gap scenario and the patch contrast scenario pass together
- [x] 2.3 If the ring at 14,000 light years does not reach 0.56 with the knee at 2.13e-2 and the low slope at 0.87, stop: record the value reached and the constants in the design's open questions and report it to the human with the threshold as the question; verify the report names the reading, the constants and the scenario, and that no threshold in the spec or the test was moved
- [x] 2.4 Move CORE toward white in `src/render/shaders/volume.frag`, `src/render/shaders/clouds.frag` and `src/render/shaders/points.frag`, keeping the three equal; verify the centre colour window, the bulge fall-off scenario and the colour scenario at 9,000 light years pass

## 3. The cloud sprites

- [x] 3.1 In `src/render/shaders/clouds.vert`, add the spread: a third hash of the sample index, the factor `(1 + k) * pow(h, k)`, the key `1 - smoothstep(floor, 3 * floor, ratio)` on the held ratio, the mix into the brightness, and two varyings that carry the factor over its maximum and the key; add `CLOUD_SPREAD_POWER` to `src/render/cloud-pass.ts` with a `uSpreadPower` uniform; verify the shader compiles, the bounded-sum scenario passes, and a clouds-only frame at the default view shows a few bright puffs on a faint ground at the rim by eye
- [ ] 3.2 In `src/render/shaders/clouds.frag`, compute the colour by zone as today and the spread colour `mix(HAZE, PATCH, t)`, blend them by the carried key, then mix toward CORE by zone; verify the rim puff scenario and the haze-and-patches scenario pass, and the chunk band, the clouds-carry-light, the rim light and the lane scenarios are rerun and pass

## 4. Tuning

- [ ] 4.1 Tune the ramp keys and the blend radii; verify the lane scenario and the haze scenario pass with the whole look test rerun, and record the values in the design's open questions
- [ ] 4.2 If the dark quartile `bl` at 44,000 light years is below 0.10 with the sprites tuned, raise `DEFAULT_GLOW_TINT` in `src/render/glow-pass.ts`; verify the haze scenario, the halo scenario and the two sky scenarios pass, and record the value
- [x] 4.3 Tune `DEFAULT_POINT_BRIGHTNESS` in `src/render/renderer.ts` and `DEFAULT_GLOW_WEIGHT` in `src/render/glow-pass.ts` for the margins; verify the grain scenario reads at least 0.045 and the halo scenario at least 0.025 in the printed values, with the Sol luminance, the sky and the patch contrast scenarios rerun, and record the values
- [ ] 4.4 Run `pnpm exec playwright test e2e/00-renderer.spec.ts e2e/look.spec.ts e2e/frame-budget.spec.ts`; verify the renderer test names a hardware renderer, every look scenario passes except the baseline, and every one of the ten frame means stays under 16.7 ms

## 5. Baseline and documentation

- [x] 5.1 Regenerate the baseline with `pnpm exec playwright test e2e/00-renderer.spec.ts e2e/look.spec.ts --update-snapshots`, so the renderer assertion runs in the same invocation; verify the renderer test passes, the baseline scenario passes on a second run, and the image shows red-brown lanes, a white core, blue space between the outer patches and separate puffs at the rim by eye
- [x] 5.2 Fill the design's open questions: the constants table, the scenario readings table, and the ring tables of luminance and chroma against the reference, read from the tuned frame with the scratch scripts; verify every number in the tables comes from the tuned tree
- [x] 5.3 Update `docs/roadmap.md`: the rendering bullet gains the two-axis ramp, the moved knee, the low slope, the near-white core, the spread and the two-colour sprite, and the changes list gains `far-view-colour-and-texture`; verify the two edits read correctly and `openspec validate far-view-colour-and-texture --strict` reports the change valid
- [ ] 5.4 Run `pnpm build`, `pnpm lint`, `pnpm exec prettier --check .`, `pnpm test` and `pnpm test:e2e`; verify every command exits 0 and the browser suite reports a hardware renderer
