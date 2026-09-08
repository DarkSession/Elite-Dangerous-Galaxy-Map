## 1. Scenarios

- [x] 1.1 Add `ringMedian5(page, radius)` and `meanLuminanceFrame(page)` to `e2e/helpers.ts`; verify each once from a scratch test that prints its value on the current tree, and record the values in the design's context
- [x] 1.2 Change `e2e/look.spec.ts`: the chunks-from-above band of 0.05 to 0.13 on the three cloud blocks, the side floor of 0.05, the rim scenario at 44,000 light years, and the bounded-sum scenario at 12,000 light years; verify the band and the rim tests fail on the current tree with the values the design's context records, and the two guards pass
- [x] 1.3 Add 30,000 light years to `e2e/frame-budget.spec.ts`; verify the test prints ten means and passes

## 2. Scene data: the cloud set

- [x] 2.1 Add `CloudSet` to `src/scene-data/types.ts` with `count`, `positions`, `tints`, `radii` and `ratios`, and add `cloudSet` to `SceneData`; move the height draw of `generatePointCloud` in `src/scene-data/point-cloud.ts` into a helper both generators call; verify `pnpm test` passes and a one-off comparison shows the point cloud with seed 7 is byte-identical before and after the move
- [x] 2.2 Write `src/scene-data/cloud-set.ts` with `generateCloudSet(model, { count, seed, table })`: a cumulative over the square root of each cell's mass, the plane position by inverse transform with the cell jitter, the height from the shared helper, the tint from the zone, the radius log-uniform between the two range constants, and the density ratio of the cell; export `DEFAULT_CLOUD_COUNT`, `CLOUD_PLACEMENT_POWER`, `CLOUD_RADIUS_MIN_LY` and `CLOUD_RADIUS_MAX_LY`; verify `src/scene-data/cloud-set.test.ts` covers the spec's seven scenarios and passes
- [x] 2.3 Extend `src/scene-data/messages.ts` so the point cloud response carries the cloud set with `cloudSetTransferables`, build the set in `src/scene-data/point-cloud.worker.ts` from the same table, and pass it through `src/scene-data/load.ts`; verify `src/scene-data/messages.test.ts` covers the new transferables and `e2e/scene-data.spec.ts` still passes the 5 second and the 100 ms scenarios

## 3. The shape set

- [x] 3.1 Write `src/render/cloud-shapes.ts` with `generateCloudShapes(seed)` giving `{ side, count, data }`: value noise of three octaves from a seeded lattice, the threshold, the fall-off, zero outside the inscribed disc, each shape scaled to a peak of 255; verify `src/render/cloud-shapes.test.ts` covers the spec's five scenarios, passes, and reports a build time under 50 ms in Node
- [x] 3.2 Add `createShapeTexture(gl, shapes)` to `src/render/buffers.ts` as an R8 texture with linear filtering and clamp to edge; verify the render smoke tests in `e2e/render.spec.ts` pass with no WebGL error in the console

## 4. The cloud pass

- [x] 4.1 Add `createCloudBuffers(gl, set)` to `src/render/buffers.ts` with the position, tint, radius and ratio attributes at divisor 1 and the corner buffer, and remove `cloudVertexArray` from `PointBuffers` and its setup; verify `pnpm exec tsc --noEmit` passes and the point tests in `e2e/render.spec.ts` pass
- [x] 4.2 Rewrite `src/render/shaders/clouds.vert`: the four attributes, the hash of `gl_InstanceID` for the shape index and the rotation, the rotated corner mapped into the shape's atlas cell with a half-texel inset, the wanted radius from the sample's radius, the fade from half the cap to the cap with the quad moved out of the clip volume at the cap, and the brightness from the two powers; rewrite `src/render/shaders/clouds.frag` to read the shape texture and multiply by the brightness and the zone colour; verify both compile when the page loads, with no error in the console and the cloud scenarios reading the sprites' light
- [x] 4.3 Rewrite `src/render/cloud-pass.ts`: `createCloudPass(gl, program, buffers, shapeTexture)`, the uniforms for the shape texture, the two powers, the cap, the brightness and the zoom fade, one `drawArraysInstanced` over the set's count; remove `CLOUD_MAX_GAIN`, `CLOUD_RADIUS_LY` and `CLOUD_COUNT`, and the `spriteScale` value in `src/render/renderer.ts` that uses the radius; verify a clouds-only frame at the default view shows sprites of varied size with irregular outlines by eye
- [x] 4.4 Add `setCloudSet` to the renderer in `src/render/renderer.ts`, build the shape set and its texture in `createRenderer`, and upload the cloud set from `src/app/main.ts` in its own animation frame; verify the ready event arrives and `e2e/scene-data.spec.ts` passes the task bound
- [x] 4.5 Add `src/render/cloud-pass.test.ts` with the holds scenario: build the cloud set with the default count and seed 7, count the samples below `CLOUD_RATIO_FLOOR` and above `CLOUD_RATIO_CEILING`, and check each fraction against the band the spec states; verify `pnpm test` passes and the lint rule still allows the render-to-scene-data import

## 5. Tuning

- [x] 5.1 Tune the shape threshold and the octave amplitudes; verify the shape tests pass and a clouds-only frame at the default view shows ragged, mottled puffs by eye
- [x] 5.2 Tune the cloud brightness, the size power and the density power; verify the chunks-from-above band, the clouds-carry-light and the rim scenarios pass with the whole look test rerun, and record the values in the design's open questions
- [x] 5.3 If the halo past the rim left its band, tune the glow weight; verify the halo and the sky scenarios pass and record the value
- [x] 5.4 Tune the count and confirm the fade at the cap; verify the bounded-sum scenario and the frame budget at ten views pass, and record the measured layers per pixel at 12,000 and 30,000 light years
- [x] 5.5 If a scenario cannot be met without breaking another, change its threshold in the spec delta and state the reason in the design; verify `openspec validate far-view-cloud-look` passes

## 6. Baseline and documentation

- [x] 6.1 Regenerate the baseline with `pnpm exec playwright test e2e/look.spec.ts --update-snapshots`, compare it by eye with the reference for overlapping irregular puffs, a range of sizes and puffs at the rim, and verify the baseline test passes on a second run
- [x] 6.2 Re-measure the ring table of the third pass's design on the new frame and record it in this design's open questions beside the reference's values
- [x] 6.3 Update `docs/roadmap.md`: the look bullet with the cloud set, the shapes and the size range, the phase 1 rendering bullet with 40,000 sprites, the fade at the cap and the ten budget views, and the changes list, and the Purpose of `openspec/specs/far-view-scene-data/spec.md` to name the point cloud, the detail grid, the cloud set and the volume; verify the status line names this change
- [x] 6.4 Run `pnpm lint`, `pnpm exec prettier --check .`, `pnpm exec tsc --noEmit`, `pnpm build`, `pnpm test` and `pnpm test:e2e`; verify all pass and the frame budget test prints ten means under 16.7 ms
