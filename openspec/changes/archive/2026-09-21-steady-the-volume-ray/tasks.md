## 1. Pin the fault before you touch the shader

- [x] 1.1 Add the `float32` emulation unit test of the volume pass's ray reconstruction
      to `packages/galaxy-map/src/camera/precision.test.ts`, beside the vertex transform
      emulation already there. It builds the inverse of the view and projection matrix
      for the reported view on a 1600 x 1000 frame, emulates the reconstruction at one
      pixel near the top of the screen, and sweeps the near plane from 1.80 to 2.04
      light years in steps of 0.02. Verify it **fails** on the present rule: the
      far-minus-near form carried across the triangle sits more than 0.1 degrees from
      the `float64` direction at one or more of those near planes.
- [x] 1.2 Add a browser test file with the two "does not step" scenarios of
      `far-view-rendering`: the zoom sweep and the two orbit sweeps, at 1600 x 1000,
      volume pass alone. Verify it **fails** on the present code, and record the worst
      step of each of the three sweeps in the run output.
- [x] 1.3 Add the held-near-plane sweep of the `map-navigation` scenario "The near plane
      alone changes no light" to the same browser test file, using the `setNearPlane`
      debug hook. Verify it **fails** on the present code.

## 2. Change the reconstruction

- [x] 2.1 Change `packages/galaxy-map/src/render/volume-pass.ts` to import the vertex
      source from `./shaders/fullscreen.vert?raw`, and delete
      `packages/galaxy-map/src/render/shaders/volume.vert`. Verify no other file
      references the deleted path with
      `grep -rn "volume.vert" packages apps e2e tests`. The only true hit is
      `volume-pass.ts`; a hit in `packages/galaxy-map/dist/` is stale build output,
      which is git-ignored, so leave it alone.
- [x] 2.2 Change `packages/galaxy-map/src/render/shaders/volume.frag` to read
      `in vec2 vTexture`, build the pixel's normalised device coordinate as
      `vTexture * 2.0 - 1.0`, unproject the near point with `uInverseViewProjection`,
      and normalise it into the march's direction. Keep the `// @volume-density` include
      line and the march below it untouched. Verify the program still compiles and every
      uniform still resolves by running `pnpm test` over
      `packages/galaxy-map/src/render/`.
- [x] 2.3 Check `packages/galaxy-map/src/render/volume-pass.ts` and
      `packages/galaxy-map/src/render/renderer.test.ts` for a uniform name list or a
      shader-source probe that names removed code, and update it. Verify with
      `pnpm test`.
- [x] 2.4 Verify the four sweeps of task group 1 now pass, and record the measured worst
      step of each against the 0.002 bound, so the real margin is on the record.

## 3. Read what moved, before you re-record anything

- [x] 3.1 Run the whole unit suite with `pnpm test`. Report every failure with its
      output. Re-record nothing yet.
- [x] 3.2 Run the browser suite with `pnpm test:e2e`, one run at a time. Report every
      failure with its output.
- [x] 3.3 For each moved reading in `e2e/look.spec.ts`, state the old value, the new
      value and the size of the move, and judge it against the **near plane 10**
      yardstick, not the reported view's 2.6 degrees. Every view that suite reads sits
      at 100 light years or more, where the present ray error is 0.002 to 0.16 degrees,
      which is 0.02 to 1.9 pixels of 720 rows. A move of that size is the change
      working. A larger move is a second fault: stop and say so rather than widening the
      reading.
- [x] 3.4 Give particular attention to the two numeric scenarios the proposal names as
      at risk, "Bulge has a soft top" (no two adjacent rows differ by more than 0.05)
      and "Background is dark grey" (corner luminance between 0.02 and 0.06). Report the
      measured value of each. If either leaves its bounds, stop: the change then needs a
      spec delta it does not carry, and that is a decision for a human.
- [x] 3.5 Compare the committed baseline image
      `e2e/look.spec.ts-snapshots/default-view-chromium-gpu-linux.png` against the new
      frame and report the share of pixels that differ against the 2 percent the
      "Look matches the baseline" scenario allows. Re-record it only after 3.3 and 3.4
      are answered, and only if they are clean.
- [x] 3.6 Run `pnpm test:e2e` again after any re-record and verify the suite is green.

## 4. Confirm the user's report

- [x] 4.1 Open the reported view
      `#c=-4.15271,-50.71937,-152.73213&d=146.35196&p=34.56875&y=19.66992&g=1`, zoom in
      to 15 light years and out again, and orbit one degree. State the sweep numbers
      from task 2.4 as the evidence, not the eye alone.
- [x] 4.2 Run `e2e/frame-budget.spec.ts` and verify the mean draw time holds inside the
      budget the **Frame budget** requirement states. Report the figure.
- [x] 4.3 Run `pnpm lint` and `pnpm format`, and verify both are clean. Leave the GLSL
      files unformatted, as the project requires.

## 5. Review gate

- [x] 5.1 Run the unit suite and the browser suite yourself, and report the results as
      they were.
- [x] 5.2 Launch the `openspec-implementation-reviewer` subagent with the change id
      `steady-the-volume-ray`, wait for its verdict, fix anything it blocks on, and
      re-run the gate. Present the verdict and every finding, including the ones you did
      not act on, and why.
