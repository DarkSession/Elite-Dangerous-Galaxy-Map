## 0. Before anything

- [x] 0.1 Confirm `pnpm test` passes on the tree. `add-nebulae` has landed as commit
      `63184db`, so `src/render/nebula-pass.ts`, `src/render/shaders/nebulae.vert`,
      `src/render/shaders/nebulae.frag` and `src/scene-data/nebulae.ts` are in place. This
      change edits every one of those files
- [x] 0.2 Read the current reading of the entry chunk: run `pnpm test` and note the
      `the entry chunk holds N bytes` line. Write N here. It is the baseline task 5.1
      measures against. **The reading is 266,996 bytes**

## 1. The shared extinction rule

- [x] 1.1 Add `src/render/shaders/volume-density.glsl` holding one function that takes a
      point in the world frame, the camera-relative galactic centre and the volume
      uniforms, and gives back the compressed density with the rim fade and the height
      fade applied. **It returns a scalar, not the extinction per channel.** `volume.frag`
      needs that scalar in four places that have nothing to do with extinction — the three
      colour-ramp keys `smoothstep(LANE_LOW, LANE_HIGH, compressed)`,
      `smoothstep(CORE_LOW, CORE_HIGH, compressed)`,
      `smoothstep(PATCH_LOW, PATCH_HIGH, compressed)`, and the emission term
      `colour += transmittance * tint * (compressed * uEmission * step)`. Only
      `vec3 extinction = DUST * (compressed * uAbsorption * step)` wants the weights. A
      function that returned `DUST * compressed` would force the caller either to re-declare
      `DUST`, which task 1.4a's test forbids, or to divide it back out through
      `extinction.g`, which works only because `DUST.g` is exactly 1.0 — an unwritten
      coupling that would shift the colour ramp silently the first time the green weight is
      tuned. Move the constants the rule needs — `GAMMA`, `LOW_GAMMA`, `KNEE`, `RIM_FULL`,
      `RIM_ZERO`, `HEIGHT_FULL`, `HEIGHT_ZERO` **and `const vec3 DUST`** — into the file.
      `DUST` moves as a **constant both shaders read**, not as something the function
      applies: the requirement names the dust weights as part of the one rule and forbids a
      second copy, and each shader applies them where it needs them. Leave the colour ramp
      constants in `volume.frag`. `uAbsorption` is a uniform and stays one.
      Two mechanical details. **`radius` is used twice and only one use moves.**
      `volume.frag:111` computes `length(point.xz - uCentre.xz)`; line 112 applies the rim
      fade, which moves into the shared function, and line 120 keys
      `smoothstep(BLEND_IN, BLEND_OUT, radius)` for the colour blend, which stays. The
      caller therefore keeps that one line. Do not try to return the radius as well — a
      repeated line is not a duplicate constant and task 1.4a's test does not object.
      **Keep the empty-sample skip.** `volume.frag:99` is `if (encoded <= 0.0) continue;`,
      and it skips the `uDetail` fetch at line 105. The shared function SHALL return 0 on
      that same condition, before the second fetch. A function that fetched both textures
      unconditionally would cost the volume pass an extra fetch on every empty sample —
      about 50 million steps a frame — and task 1.3 compares frames, not cost, so nothing
      in this change would catch it
- [x] 1.2 Add `VOLUME_DENSITY_MARKER` and `putVolumeDensity` to
      `src/render/shader-include.ts`, on the pattern of `MARKER_ALPHA_MARKER` and
      `putMarkerAlpha`, including the throw when the source carries no marker. **The unit
      test goes in `src/render/nebula-pass.test.ts`**, on the precedent of
      `src/render/system-pass.test.ts` lines 585-598, which tests `putMarkerAlpha` through
      the pass wrapper that calls it: it asserts the rule is in place, that the marker line
      is gone, that the rule appears once, and that a source with no marker throws. There is
      no `src/render/shader-include.test.ts` and no `src/render/volume-pass.test.ts` in the
      tree, so do not write the task as if either existed
- [x] 1.3 Replace the moved lines of `src/render/shaders/volume.frag` with the marker and
      call the density function; verify the browser test that renders the volume alone
      gives the same frame as before the move, to within the tone map's dither
- [x] 1.4 Verify by unit test that the source the volume program compiles and the source
      the nebula program compiles both hold the text of `volume-density.glsl`, that
      neither holds the marker line, and that the text in both is the text of the file.
      Read the files from the tree as `src/render/system-pass.test.ts` does, so no second
      copy of the rule can pass the test
- [x] 1.4a Verify by unit test that **neither** `volume.frag` nor `nebulae.vert` declares
      a dust weight, a gamma, a knee, a rim bound or a height bound of its own. The test
      of 1.4 compares the shared text and passes with a duplicate constant sitting beside
      it, so this is the test that catches the drift

- [x] 1.5 Fix the existing compile test in `e2e/nebulae.spec.ts`, at the test
      `the nebula shaders compile` around line 100. It reads `nebulae.vert` **raw from the
      tree** and hands it to `compileTestProgram`. After tasks 1.1 and 3.1 that raw file
      carries a marker line and calls a function only `volume-density.glsl` declares, so it
      fails to compile and the test goes red. The tree already solved this shape:
      `e2e/systems.spec.ts` composes the marker shaders through `putMarkerAlpha` before
      compiling, with a comment saying a probe that compiled the raw file would compile a
      source the map never uses. Do the same here with `putVolumeDensity` and
      `shaderSource('volume-density.glsl')`

## 2. One volume texture, two passes

- [x] 2.1 Change `createVolumePass` to take a `VolumeTexture` rather than a
      `DensityVolume`, and stop it creating and disposing the texture; verify with the
      volume pass's unit tests, which live in `src/render/renderer.test.ts` — there is no
      `src/render/volume-pass.test.ts`
- [x] 2.2 Move the `createVolumeTexture` call and the dispose into `src/render/renderer.ts`
      so the renderer owns the texture, gives it to the volume pass, and holds it for the
      nebula draw; verify no texture leaks when the volume is replaced, by a unit test
      that sets a volume twice and counts `deleteTexture` calls on a stub context
- [x] 2.3 Verify by unit test that one upload serves both passes: setting a volume calls
      `texStorage3D` once, and drawing a frame with both passes on binds that one texture

## 3. The march

- [x] 3.1 Add the march to `src/render/shaders/nebulae.vert`: clip the segment from the
      camera to the record's centre against the volume box, take `NEBULA_MARCH_STEPS`
      midpoint samples through the shared density function, accumulate
      `depth += DUST * density * uAbsorption * step * uOcclusion` into a `vec3`, where
      `density` is the **scalar** the shared function returns and `DUST` is the constant
      that file holds, and write
      `exp(-depth)` into a new `vec3 vTransmittance` varying. Name the step count as a
      constant with a comment that says why 64. The depth is a `vec3` and not a scalar
      because the requirement says the transmittance carries the volume's three dust
      weights; a scalar depth gives a grey transmittance, which task 5.1's blue-to-red
      ratio reading then fails. Call the shared function's result `density` here and in
      task 1.1, one word for one thing
- [x] 3.1a Put the march **after** the shader's early-out. `nebulae.vert` collapses a
      vertex whose `clip.w` is at or below 0, or whose weight is at or below 0, and a
      collapsed sprite must not pay for 64 texture fetches. **Say what the unit test can
      see.** A stub-context Vitest test reads uniform and buffer calls; it cannot observe
      vertex-shader control flow, so it cannot watch a record take the early-out. The unit
      test asserts the **source**: that the march in `nebulae.vert` sits after the `return`
      of the early-out, not before it. The behaviour itself belongs to the browser suite,
      where `e2e/nebulae.spec.ts` reads the drawn count and `e2e/paint-cost.spec.ts` reads
      the frame cost. Do not accept a weaker unit test in place of the source assertion
- [x] 3.2 Scale the sprite in `src/render/shaders/nebulae.frag`: the colour channels take
      `vTransmittance` and the alpha takes its mean, both on top of the weight the shader
      already applies
- [x] 3.3 Add the uniforms the march needs to `createNebulaProgram` and bind them in
      `NebulaPass.draw`: the volume sampler, the box bounds, the camera-relative centre,
      `uLo`, `uSpan`, `uEpsilon`, `uAbsorption`, the detail sampler and its scale, and
      `uOcclusion`. **The volume sampler and the detail sampler each take a texture unit
      of their own**, and both are set on **every** draw whether or not a texture is
      bound. `createNebulaPass` binds the atlas to `TEXTURE0` and sets `uAtlas` to 0, and
      an uninitialised `sampler3D` also reads 0; two samplers of different types on one
      unit make the draw fail with `INVALID_OPERATION`, which is exactly the frame task
      3.4 describes
- [x] 3.3a Verify by unit test that the three samplers hold three different unit numbers
      and that a draw with no volume texture still sets all three
- [x] 3.4 Make the pass take the volume texture and the detail texture **per frame**,
      because the nebulae may attach before the volume arrives and the volume may be
      replaced; with no texture bind none and send `uOcclusion` as 0
- [x] 3.5 Verify by unit test that a draw with no volume texture sends `uOcclusion` as 0
      and that the uniforms it sends are the uniforms the pass sent before this change. A
      stub-context test compares uniform values, not frames
- [x] 3.6 Verify by unit test that the frame the renderer draws with `passes.volume` off
      sends `uOcclusion` as 0, so a nebula is not dimmed by material that is not drawn

## 4. The look constant and the test hook

- [x] 4.1 Add `nebulaOcclusion` to `LookSettings` in `src/render/renderer.ts`, default
      `1`, and a `DEFAULT_NEBULA_OCCLUSION` constant beside `DEFAULT_NEBULA_BRIGHTNESS`
      in `src/render/nebula-pass.ts`. **Split the verification by what each test can
      see.** The unit test reads the default as 1 and asserts the pass **sets the uniform**
      to it; the multiplication happens in the shader, and no stub-context test can observe
      it. The multiplication is covered by the occlusion readings of `e2e/nebulae.spec.ts`,
      which move when the constant moves. Do not write the unit test as if it checked the
      arithmetic
- [x] 4.2 Clamp the constant to 0 through 1 **where the uniform is set**, not inside the
      setter. `GalaxyMapDebug` exposes `look` as a mutable `LookSettings` that the caller
      may change in place, and the renderer reads `look.*` each frame, so a clamp in the
      setter alone is bypassed by a write to `debug.look`. Verify by unit test that a
      value outside the range and a value that is not a number take the default, written
      **both** through the setter and straight onto `debug.look`
- [x] 4.3 Add `setNebulaOcclusion(value: number)` to `GalaxyMapDebug` in
      `src/app/create-map.ts`. A setter is added beside the mutable `look` handle because
      the browser tests reach the hook through `window.__galaxyMap`, where a named call is
      what the page can expose and type; the clamp of 4.2 covers both routes. expose it on `window.__galaxyMap` from `src/app/main.ts`,
      and type it in `src/render/global.ts`; verify the HUD boundary lint still passes,
      because the hook sits on `debug` and the HUD must not read `debug`

## 5. The tests

- [x] 5.1 Add to `e2e/nebulae.spec.ts` the four readings the spec names: a nebula behind
      the core dims, a nebula with little in front of it barely changes, the blue to red
      ratio falls through the bulge, and a dark nebula behind the core stops cutting a
      hole. Three of the four read the same pixels twice in one run, with
      `setNebulaOcclusion(1)` then `setNebulaOcclusion(0)`. **The first one reads three
      times**, because it measures the sprite's own contribution: the block with the
      nebula pass off, then the block at occlusion 1 and at 0 with the pass on. It asserts
      the contribution is smaller in magnitude at 1. The spec says why a block reading
      cannot serve there. Measured at the core view: 0.00087 against 0.01505.
      **Assert the hook exists before reading**, with
      `typeof window.__galaxyMap.setNebulaOcclusion === 'function'`, and assert the two
      readings are not bit-identical. Every hook call in this suite is optional-chained
      (`window.__galaxyMap?.setPasses?.(...)`), so a missing or misnamed hook would make
      both readings the same frame. Three of the four scenarios assert a strict inequality
      and fail loudly on that; the "barely changes" one would pass green over a feature that
      never ran
- [x] 5.1a Choose the views and write each one in the test as a constant, as
      `e2e/nebulae.spec.ts` already does, so the test states what it looks at. Use a
      **named** record of `src/scene-data/nebulae.json` where one works, and the record
      **index** otherwise. One of the four scenarios needs an unnamed record: 190 of the
      358 records carry a name, only `G2 Dust Cloud` sits beyond the galactic centre and
      its 8.62 light year radius stops it drawing past about **3,600** light years — the focal
      is `canvasHeightCss / (2 tan 30°)` = 623.5 on the suite's 720 CSS-pixel canvas,
      against `NEBULA_MIN_PIXELS` of 1.5 — and the dark records the existing tests read — index 199 at 88.93 ly and index 187 at
      94.06 ly — carry no name. A camera on the far side of the core looking at Barnard's
      Loop, about 33,000 light years out at about **3.8** CSS pixels of radius, is the
      workable named view. Say in the test what block size the reading uses: a sprite
      about 8 pixels across is tighter than the 10-pixel blocks the existing dark-record
      tests read

      **The measured views.** "Barely changes" reads `BRIGHT_VIEW` over a 10 pixel block.
      "Turns warm" reads `CORE_VIEW`, `#c=18.0,-36.9,25760.9&d=6000&p=0.83&y=178.71`,
      Barnard's Loop at 3.78 CSS pixels seen through the centre, over a 6 pixel block.
      "Stops cutting a hole" reads `DARK_CORE_VIEW`,
      `#c=-3163.1,163.1,23474.2&d=6000&p=-2.84&y=-127.30`, record 199 at 3.60 CSS pixels
      and 15,414 light years, over a 6 pixel block.

      **Why "behind the core dims" reads the sprite's contribution and not the block.**
      This is the record of the measurement that changed the scenario. 14 views were
      measured at 6, 10, 16 and 24 pixel blocks: `CORE_VIEW`, the
      dark record 199 view, five cameras along the disc toward Barnard's Loop at 8,000 to
      24,000 light years, and eight further through-the-centre views over the brightest
      records. Every one of them reads **above** at occlusion 1, by 0.1 to 40 percent, and
      in every one `no nebula pass > occlusion 1 > occlusion 0`. `BRIGHT_VIEW`, which has
      the least in front of it, is the only view that reads below, by 0.095 percent.

      The cause is the model, not the march. A pixel is `C + (1 - a) B` at 0 and
      `T C + (1 - a m) B` at 1, so the reading falls only where `C > a B`: the sprite must
      add more light than it holds back. The volume emits and absorbs in proportion —
      `uEmission / uAbsorption` is 40 — so a column thick enough to attenuate a sprite is
      bright enough that `a B` is far above `C`. Through the centre `B` is 0.85 to 0.89
      after the tone map, and every sprite there, bright or dark, already reads as a hole
      at occlusion 0. Scaling the alpha by the same transmittance, which this spec
      requires under "Colour and alpha both", then makes the block brighter.

      The scenario therefore reads the sprite's own contribution — the block with the
      pass on, less the block with the pass off — which falls toward 0 as the
      transmittance does, for a hole and for a source alike. The owner chose that over
      dropping the scenario or giving up the alpha scaling. It reads `CORE_VIEW` over a 6
      pixel block: **-0.00087 at occlusion 1 against -0.01504 at 0**, with the pass-off
      block at 0.88944. The spec carries the algebra; the test carries the figures
- [x] 5.1b Write the measured tolerance of the "barely changes" scenario into the test
      beside the view, as a figure read from the frame, not as "the dither". The spec
      settles the view: `BRIGHT_VIEW`, the camera `e2e/nebulae.spec.ts:30` already names,
      whose 5,912 light year segment the design's table costs at 0.997, 0.994 and 0.989.
      The expected change is therefore about **1.1 percent** on the worst channel, against
      the spec's band of under 2 percent. Record what you measured beside that
      expectation. A reading far above 1.1 percent is a defect in the march, not a reason
      to widen the band
- [x] 5.2 Add the vertex sampler check: read `MAX_VERTEX_TEXTURE_IMAGE_UNITS` through the
      context and check the nebula program links with no error
- [x] 5.3 Run `e2e/look.spec.ts`. The pinned baseline at 60,000 light years must not
      change, because no nebula draws there. If "the sum of the sprites stays bounded" at
      12,000 fails, re-read its bound from a measurement and write the measured figure
      and the reason in the test. Do not widen it to whatever the frame gives
- [x] 5.4 Change `e2e/frame-budget.spec.ts` to assert a **measured** floor on
      `mostNebulae` inside the band, rather than only that it is above 0, and run it with
      the occlusion at 1. **Measure the count first and write the reading here**, then set
      the floor from it; do not carry an estimate into the assertion. **The near end of the
      band is open**: `nebulaZoomWeight` is `1 - smoothStep(12000, 20000, distance)` and the
      step clamps at 0, so 500, 1,000, 2,000, 4,000 and 12,000 all draw at weight 1 — five of
      the eight distances, and over two cursors that is **ten of the sixteen views** the
      loop runs. 20,000 is
      exactly `NEBULA_ZOOM_FAR_ZERO`, so its weight is 0 and `selectNebulae` returns no
      instances; it and 30,000 and 120,000 draw nothing. Expect the floor to be set by a
      **near** view. The count stays under `NEBULA_MAX_DRAWN` because the size floor admits
      at most 184 records, which `src/scene-data/nebulae.ts` states beside the budget. Verify the frame interval holds the budget
      `far-view-rendering` states, and record the measured mean and worst here. This is the
      same discipline task 5.1b applies to the tolerance

      **The readings.** The most sprites one view draws is **178**, at the cursor on Sol
      and 500 light years, on the 1,920 by 1,080 canvas of this file. The counts of the
      other near views are 176, 168, 137 and 106 at Sol and 148, 149, 149, 150 and 150 at
      the centre; 20,000, 30,000 and 120,000 draw none. The floor in the test is 178. The
      frame interval over the 16 views is a **mean of 1.063 ms** and a **worst of
      1.597 ms**, against the 16.7 ms budget

## 6. Before review

- [x] 6.1 Run `pnpm test` and read the `the entry chunk holds N bytes` line. If N passes
      `ENTRY_CHUNK_LIMIT`, move the bound to the next round figure above N and add an
      entry to the comment block with the reading and the reason, which is what that
      comment asks of the next change to touch the chunk. Write the reading here either
      way. **The reading is 275,909 bytes**, 8,913 above the 266,996 of task 0.2. It
      passed the old bound of 270,000, so the bound moves to 280,000 and the comment
      block in `tests/main-bundle.test.ts` carries the reading and the reason. The growth
      is above the 2,500 to 5,500 bytes the design estimates: the march and the shared
      density rule reach the chunk as shader text, which no minifier reduces
- [x] 6.2 Run `pnpm lint`, `pnpm test` and `pnpm test:e2e`; verify all three pass, and
      paste the failing output here if any does not. Run one Playwright suite at a time.
      **All three pass.** `pnpm lint` reports nothing. `pnpm test` gives 72 files and
      1,034 tests passed. `pnpm test:e2e` ends with
      `=== e2e: parallel pass passed, timed pass passed ===`, the timed pass at 57 tests.
      The fourth reading of task 5.1 landed after that run, so `e2e/nebulae.spec.ts` ran
      again on its own, at 21 tests passed, and `pnpm lint` and `pnpm test` ran again
      with the same result
- [x] 6.3 Run the implementation review gate with the `openspec-implementation-reviewer`
      subagent and act on its verdict; verify the verdict is recorded before any human
      sees the work

      **The verdict: APPROVE WITH NOTES.** The gate ran as a second Opus agent, separate
      from the one that implemented the change, and read only. It traced every clause of
      the spec delta to code and to a test, checked all 30 claimed tasks against the diff,
      and re-ran `pnpm lint`, `pnpm test` and `pnpm exec tsc --noEmit` clean. It did not
      run Playwright, because a run was already complete and a second one takes the port.

      **Two notes acted on.** The comment at `src/render/volume-pass.ts` said
      "`shader-include.ts` holds the rule itself". That is wrong and it gave "the rule" two
      meanings three lines apart: `shaders/volume-density.glsl` holds the rule and
      `shader-include.ts` holds the marker. The comment now says so. The comment in
      `e2e/frame-budget.spec.ts` recorded a worst view mean of 1.588 ms from an earlier
      run, against the 1.063 ms mean and 1.597 ms worst that task 5.4 records. The comment
      now carries the figures of the run that set the floor.

      **Four notes not acted on, and why.** (1) `nebula-pass.ts` imports
      `withVolumeDensity` from `./volume-pass`. That is not an import-rule breach, because
      both sit in `src/render/`, but `make-nebulae-optional` must undo it; the gate agreed
      to leave it on the condition that change owns the move to a `volume-density.ts`.
      (2) The "barely changes" band of 2 percent is 21 times the measured 0.095 percent
      signal. The spec fixes that band, so the code meets the requirement; moving it is a
      spec change and the human decides it. (3) `nebulaOcclusionOf` substitutes the default
      of 1 rather than clamping, so a NaN turns the effect on and -0.5 gives 1. Task 4.2's
      verification sentence asks for exactly that and a test holds it; its first sentence
      says "clamp" and disagrees with itself. No spec requirement covers out-of-range
      input. The gate added that `setNebulaOcclusion` stores the raw value in
      `look.nebulaOcclusion`, so a host reads back what it wrote while the frame draws at
      1. (4) The empty-sample skip in `volume.frag` moved from `encoded <= 0.0` to
      `compressed <= 0.0`; the gate verified the two are identical in effect.
