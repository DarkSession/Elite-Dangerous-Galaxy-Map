## 1. The stub context

The probe reads `getError`, which the stub does not answer. Until it does, the probe reads
a refusal on every stub context and three passing tests fail. This group comes first.

- [x] 1.1 Teach `fakeContext` in `src/render/nebula-volumes.test.ts` to answer `getError`,
      returning `NO_ERROR` by default, and to answer `getParameter` for
      `TEXTURE_BINDING_2D_ARRAY`. Give it per-format error injection, so a test can refuse
      one format and accept the other. Verify `pnpm exec vitest run
      src/render/nebula-volumes.test.ts` passes with the stub changed and no production
      code touched yet. **Read:** the stub gained `getError`, `getParameter` for
      `TEXTURE_BINDING_2D_ARRAY`, a `refuse` list of formats whose `texStorage3D` on that
      target raises `INVALID_OPERATION`, an `errorBefore` switch and a `live()` reader.
      With
      the stub changed and no production code touched, the file ran **26 of 26 passed**.
- [x] 1.2 Name the three tests that pass `blockFormats = true` and confirm each still takes
      the fast path after task 2.1: "uploads both volumes to a 2D array on both paths",
      "uploads the blocks with no decode where both extensions are there" and "refuses a
      side the blocks cannot cover". Record that the third still throws. A silent fall to
      the decode path would make it stop throwing rather than fail. **Read:** all three
      still pass after 2.1. "uploads the blocks with no decode where both extensions are
      there" reads 2 `compressedTexSubImage3D` calls and 0 `texSubImage3D` calls, which
      is the fast path. "refuses a side the blocks cannot cover" still throws
      `holds no blocks`, which only the fast path raises. "uploads both volumes to a 2D
      array on both paths" needed one line: the probe allocates on the same target before
      the upload, so the test now reads the **last two** `texStorage3D` calls. A separate
      check confirmed `nebulaBlockFormats` reports both formats on an accepting stub.

## 2. The probe

- [x] 2.1 Add the probe to `nebulaBlockFormats` in `src/render/nebula-volumes.ts`. For each
      of the two formats it makes a texture, binds it to `TEXTURE_2D_ARRAY`, drains the
      error queue, calls `texStorage3D(TEXTURE_2D_ARRAY, 1, format, 4, 4, 1)`, reads
      `getError`, and deletes the texture. It restores the previous
      `TEXTURE_BINDING_2D_ARRAY` before it returns. A refusal of either format returns
      `null`, and so does a `createTexture` that returns `null`. Verify `pnpm exec tsc
      --noEmit` and `pnpm lint` pass. **Read:** both pass. The probe is
      `takesBlockFormat`, and it reads both formats and not the first alone. The drain is
      bounded at 32 reads, because a lost context answers `CONTEXT_LOST_WEBGL` for ever.
- [x] 2.2 Correct the doc comment on `nebulaBlockFormats`. Its present reason for two
      states, that the mix is "a combination no desktop driver has", is false: Firefox is
      that combination. Write the real reason, that the owner weighed the per-format mix
      and chose the simpler renderer. Verify by reading the comment against the decision
      "A refused format takes both volumes to the decode path" in `design.md`. **Read:**
      the comment now says the owner weighed the per-format mix and chose the simpler
      renderer, and it names the Firefox refusal as the reason a present extension is not
      proof. The doc comment on `createNebulaVolumeTextures` restated the old condition,
      so it now states the probe as well.
- [x] 2.3 Add the unit scenario "A refused format takes both volumes to the decode path" to
      `src/render/nebula-volumes.test.ts`. Write it **twice**, once refusing the density
      format and once refusing the colour format. Confirm each fails without the probe:
      comment the probe out, run the file, record that both fail, restore it. A test that
      refuses only the first format would pass against a renderer that probes the first and
      trusts the second. **Read:** with the probe removed, both fail:
      `expected { density: 36283, colour: 33776 } to be null`. With the probe in place
      both pass.
- [x] 2.4 Add the unit scenario that the probe leaves the context as it found it: no
      texture left bound, none left allocated, and no error left in the queue.
      **Read:** "leaves the context as the probe found it" reads 2 `createTexture` calls,
      2 `deleteTexture` calls, no live texture, a null `TEXTURE_BINDING_2D_ARRAY` and
      `NO_ERROR`. With the probe removed it fails:
      `expected [] to have a length of 2 but got +0`.
- [x] 2.5 Add the unit scenario that an error raised before the probe does not read as the
      probe's own: the stub raises one error, then accepts both allocations, and the
      renderer still reports both formats. Confirm it fails without the drain. **Read:**
      with the drain removed it fails:
      `expected null to deeply equal { density: 36283, colour: 33776 }`. The file reads
      **30 of 30 passed** with the drain in place.

## 3. The durable guard, in the browser the suite runs everywhere

- [x] 3.1 Move `BRIGHT_VIEW`, `DARK_VIEW` and `CLOSE_VIEW` out of `e2e/nebulae.spec.ts` into
      a new `e2e/nebula-views.ts`, beside `e2e/region-views.ts`, and import them back.
      Verify `GALAXY_MAP_E2E_BUILT=1 pnpm exec playwright test e2e/nebulae.spec.ts
      --project=chromium-gpu` passes with no other change. **Read:** **28 of 28 passed**
      after a fresh build.
- [x] 3.2 Add the scenario "The nebulae draw where the target refuses a block format" to
      `e2e/nebulae.spec.ts`. It patches `texStorage3D` in the page to refuse
      `COMPRESSED_RED_RGTC1` on a `TEXTURE_2D_ARRAY` and to pass every other call through,
      opens `CLOSE_VIEW`, reads the frame with the nebulae on and again with them off, and
      asserts the two differ and that the load records a block decode. Use `withNebulae`
      and `meanLuminanceFrame`, which `e2e/nebulae.spec.ts` already pairs. **Read:** the
      patch makes `texStorage3D` allocate nothing for that pair and the next `getError`
      read `INVALID_OPERATION`, which is the error Firefox raises for this pair. The run
      reads
      `on 0.17613, off 0.17379, added 0.00234, decodes 33`, twice with the same figures.
      The bound is 0.001, a little under half the reading.
- [x] 3.3 Confirm the guard of 3.2 fails against the fault. Comment out the probe of task
      2.1, run **`pnpm build:demo-site`**, then run the spec, and record that it fails and
      how it reads. Restore the probe and rebuild. Do **not** reuse the
      `GALAXY_MAP_E2E_BUILT=1` command of task 3.1 for this: that flag runs `pnpm preview`
      alone, which serves the previous bundle, so the reverted source never reaches the
      browser and the test passes for the wrong reason. **Read:** with the probe removed
      and `pnpm build:demo-site` run, the spec fails at `expect(decodes).toBe(33)` with
      **0** decodes, and the two frames read `on 0.17379, off 0.17379, added 0`. The
      frames are the same frame, which is the fault: the textures hold nothing and the
      march reads 0. The probe was restored, the tree rebuilt, and the whole spec file
      then read **29 of 29 passed**.

## 4. The Firefox reading

- [x] 4.1 Add `e2e/nebulae-firefox.spec.ts`. It opens `CLOSE_VIEW` from `e2e/nebula-views.ts`,
      reads the frame with the nebulae on and again with them off, and asserts the two
      differ. It reads pixels and asserts on no draw count, because every count reads
      correctly in the fault. It calls no `toHaveScreenshot`. **Read:** the one test is
      "the nebulae draw". It asserts `off > 0` and `on - off > 0.001`, and asserts on no
      count.
- [x] 4.2 Have the same spec log which path the browser took, as a diagnostic and not an
      assertion, so a reader of the run learns the answer for the browser in front of them.
      The `nebulae` delta asks for this, because the Firefox reading in the spec is one
      browser on one day. **Read:** the spec logs the decode count, which is the path — 0
      is the block path and 33 the decode path — the two extensions the context carries,
      and the `getError` of a 4 by 4 allocation of each format on `TEXTURE_2D` and on
      `TEXTURE_2D_ARRAY`.
- [x] 4.3 Add the new spec to the Firefox project's `testMatch` in `playwright.config.ts`.
      Verify with `GALAXY_MAP_E2E_BUILT=1 pnpm exec playwright test
      e2e/nebulae-firefox.spec.ts --project=firefox`, after a build. **Read:** **3 of 3
      passed**, on the card `ANGLE (NVIDIA, Vulkan 1.4.341 (NVIDIA GeForce RTX 4080))`.
      Firefox reads `on 0.17613, off 0.17379, added 0.00234, decodes 33`, so it takes the
      decode path and draws. Its format probe reads `BC4 on TEXTURE_2D 0`,
      `BC4 on TEXTURE_2D_ARRAY 1282`, `BC1 on TEXTURE_2D 0`, `BC1 on TEXTURE_2D_ARRAY 0`,
      where 0 is `NO_ERROR` and 1282 is `INVALID_OPERATION`.
- [x] 4.4 Confirm the Firefox spec fails against the fault, by the same method and the same
      build warning as task 3.3. Record that it fails and how. **Read:** with the probe
      removed and `pnpm build:demo-site` run, Firefox reads
      `on 0.17379, off 0.17379, added 0, decodes 0` and fails at
      `expect(on - off).toBeGreaterThan(0.001)` with **0**. The two frames are the same
      frame, which is the fault. The probe was restored and the tree rebuilt.
- [x] 4.5 Run the same spec in Chromium and record that it passes there too, so the reading
      is not one browser's alone. **Read:** **3 of 3 passed** in `chromium-gpu`, with
      `on 0.17618, off 0.17379, added 0.00239, decodes 0`. Chromium takes the block path
      and its format probe reads 0 for all four combinations. The spec is not in the
      `chromium-gpu` project's `testIgnore` list, so that project runs it on every suite
      run as well.
- [x] 4.6 Update the unit test of `playwright.config.ts` for the Firefox project's
      `testMatch`, which asserts the renderer spec and the paint budget spec "and nothing
      else". Verify the file passes. **Read:** the test now reads the `firefoxSpecs` list
      itself and asserts it equals the renderer spec, the paint budget spec and
      `nebulae-firefox.spec.ts`, in that order. `tests/browser-suite.test.ts` reads
      **9 of 9 passed**.
- [x] 4.7 Add the unit scenario "No spec the Firefox project runs holds a baseline image":
      read every spec the project's `testMatch` holds and assert none calls
      `toHaveScreenshot`. Verify it passes, and verify it fails when `e2e/look.spec.ts` is
      added to the list. **Read:** it passes over the three specs, and the positive
      control asserts `look.spec.ts` does hold one. With `look.spec.ts` added to the list
      the file reads **2 failed | 7 passed**:
      `look.spec.ts holds a baseline image: expected true to be false`, and the order
      assertion of 4.6 fails beside it.

## 5. The cost spec's own probe

- [x] 5.1 Change how `e2e/nebula-cost.spec.ts` decides whether the run took the block path.
      It calls `getExtension` on a throwaway context, which is the reasoning this change
      declares wrong, and it reads correctly on the development card by luck. Make it
      allocate on a `TEXTURE_2D_ARRAY` instead, the way the renderer's probe does. Verify
      with one Playwright run over that file. **Read:** the page now allocates 4 by 4 by 1
      texels of each format on a `TEXTURE_2D_ARRAY` and reads `getError`, as the
      renderer's probe does. `e2e/nebula-cost.spec.ts` reads **8 of 8 passed** in
      `chromium-timed`, and the decode test reads
      `blocks true, files 66, assets 0, decodeMs 0`.
- [x] 5.2 Confirm the scenario "The blocks upload with no decode where the extensions are
      there" is held by the changed test. The delta widened its WHEN from carrying the two
      extensions to carrying them **and** proving both formats, and the scenario keeps its
      older name because a MODIFIED requirement replaces the whole block and a renamed
      scenario reads to the validator as a dropped one. **Read:** two tests hold it and
      neither reads the extension list as a stand-in for the path. The Chromium test "the
      blocks upload with no decode where the extensions are there" reads `nebula-decode`,
      which is the path the renderer took, and asserts 0 on the block path, 33 on the
      decoding path and 0.01 RMSE between the two frames. `e2e/nebula-cost.spec.ts` reads
      `blocks` from the allocation of task 5.1.

## 6. The readings the change states

- [x] 6.1 Record the probe's readings in Firefox and Chromium, from the runs of tasks 3.2
      and 4.3: which format each browser refuses on `TEXTURE_2D_ARRAY`, and which path each
      browser then takes. Confirm they match the table in `proposal.md`, and correct the
      table where they do not. **Read**, as `getError` after a 4 by 4 allocation, where 0
      is `NO_ERROR`:

      | browser  | BC4 2D | BC4 2D array | BC1 2D | BC1 2D array | path       |
      | -------- | ------ | ------------ | ------ | ------------ | ---------- |
      | Firefox  | 0      | **1282**     | 0      | 0            | decode, 33 |
      | Chromium | 0      | 0            | 0      | 0            | blocks, 0  |

      Firefox refuses BC4 on the array target alone, which is the table of `proposal.md`.
      The error code is **not** the one the table stated: 1282 is `INVALID_OPERATION` and
      the table said `INVALID_ENUM`. The table, the `nebulae` delta and the Chromium guard
      are corrected to `INVALID_OPERATION`.
- [x] 6.2 Read the decode mark in Firefox on the fallback path and record the sum, so the
      14.2 to 19.2 ms the `nebulae` delta states is read in the browser that now takes that
      path. Record it whatever it says. If it lies outside the stated range, do not move the
      range in this task; report it, because the range is a Chromium figure and a second
      browser's reading may belong beside it rather than inside it. **Read:** eight
      readings of the sum in Firefox are **16, 17, 20, 15, 21, 20, 13, 21 ms**, and the
      worst single asset is 1 to 2 ms. A ninth reading, taken inside the whole-suite run
      of task 7.3, is **23 ms** with a worst asset of 3 ms. The range is therefore **13 to
      23 ms**, which sits
      **outside** the stated 14.2 to 19.2 at both ends. Firefox rounds `performance.now()`
      to 1 ms, so every one of the 33 marks is quantized and the sum carries that error;
      the figures are integers for that reason. The range is not moved here. Five Chromium
      readings taken beside these, on the same tree, are 16.2, 16.7, 16.0, 16.9 and
      17.2 ms, which are all inside the stated range, so the Chromium figure holds and the
      Firefox reading belongs beside it and not inside it.
- [x] 6.3 Confirm the fallback path itself renders in Firefox, and not only that the fast
      path is avoided. The fallback uploads plain `R8` and `RGBA8` to a `TEXTURE_2D_ARRAY`,
      where before the slice arrays it uploaded to a `TEXTURE_3D`. Task 4.1 reads a drawn
      frame, so this is a check of that result and not a second run. **Read:** the Firefox
      run of task 4.3 reads `decodes 33` and `added 0.00234` in one reading. The 33 decodes
      are the fallback path and the added light is the frame it drew, so Firefox uploads
      plain `R8` and `RGBA8` to a `TEXTURE_2D_ARRAY` and the march reads them. The added
      light matches the Chromium decode path of task 3.2 to five places, 0.0023389 against
      0.0023389, so the two browsers draw the same frame on that path.

## 7. The whole suite and the gate

- [x] 7.1 Run `pnpm lint` and `pnpm exec tsc --noEmit`, and fix what they report.
      **Read:** both pass with nothing reported.
- [x] 7.2 Run `pnpm exec vitest run` on its own, with no Playwright run in flight, and
      verify every unit test passes. **Read:** **82 of 82 files, 1188 of 1188 tests
      passed**.
- [x] 7.3 Run the whole Playwright suite once, one run at a time, and verify it passes with
      the renderer assertion holding on hardware in both browsers. **Read:** the suite
      passes. The parallel pass reads **556 passed** in 8.0 minutes and the timed pass
      **64 passed** in 3.4 minutes, for **620 of 620**, and the script exits 0. The
      renderer check holds on hardware in both browsers: Chromium reads
      `ANGLE (NVIDIA, Vulkan 1.4.341 (NVIDIA GeForce RTX 4080 (0x00002704)), NVIDIA)` and
      Firefox reads `NVIDIA GeForce RTX 4080/PCIe/SSE2`. Neither SwiftShader nor llvmpipe
      appears. The Firefox project runs six tests, which are the renderer pair, the new
      nebula reading and the three paint budget readings.
- [x] 7.4 Check that no figure of the two delta specs is left unmet, by reading each changed
      scenario against the test that holds it. Do not edit `openspec/specs/` by hand; the
      archive step carries the delta. **Read:** `openspec/specs/` is untouched. The three
      new `nebulae` scenarios are held: "A refused format takes both volumes to the decode
      path" by the three unit scenarios of tasks 2.3 to 2.5, which cover each format on
      its own, the drain and the restored context; "The nebulae draw where the target
      refuses a block format" by the Chromium guard of task 3.2; "The nebulae draw in
      Firefox" by `e2e/nebulae-firefox.spec.ts`. The widened WHEN of "The blocks upload
      with no decode where the extensions are there" is held by task 5.2. The prose figure
      14.2 to 19.2 ms keeps its ratchet at 24 ms in `e2e/nebula-cost.spec.ts`, and five
      readings taken now are 16.0 to 17.2 ms. The log of the path the browser took is task
      4.2. The twelve scenarios the requirement carries over are held by the tests that
      already held them, which the suite run of 7.3 covers. In `browser-suite`, the
      `testMatch` scenario is held by task 4.6 and the baseline scenario by task 4.7.
- [x] 7.5 Confirm the archive order the design states is still correct: this change is
      archived **after** `store-nebula-volumes-as-slice-arrays`, because its delta is
      written against the text that change leaves behind. Record the check. **Read:** the
      order holds, and change 2 is already archived. `openspec/changes/archive/` holds
      `2026-09-20-store-nebula-volumes-as-slice-arrays`, and
      `openspec/specs/nebulae/spec.md` now carries the sentence this delta corrects, at
      line 302: "Where the context carries both `EXT_texture_compression_rgtc` and
      `WEBGL_compressed_texture_s3tc`, the renderer SHALL upload the blocks with no
      decode." The delta's MODIFIED heading "The art comes from 33 volume assets" matches
      the requirement at line 233, and the `browser-suite` heading "The browser gate runs
      Chromium and Firefox" matches the requirement at line 12 of that spec. This change
      is the only one left to archive of the two.
- [x] 7.6 GATE — implementation review. Launch the `openspec-implementation-reviewer`
      subagent with this change id, wait for its verdict, fix what it blocks on, and state
      the verdict and every finding when presenting the work. Done: the gate returned
      APPROVE WITH NOTES. It reproduced the unit falsifications itself and confirmed the
      probe is reachable on every exit path. Four of its five findings were answered in
      `07b80e0`: the spec stated a decode range Firefox does not hold, a test could not
      see a fast path that allocates nothing, the stub repeated the wrong error name, and
      a third copy of the bright view survived. The fifth, a timed fetch-bound test that
      failed four times for the gate, was not acted on: it belongs to an archived change,
      a probe that runs twice at load cannot reach it, and it did not reproduce over four
      runs here, which read medians of 0.585 to 0.682 against bounds of 0.78 and 0.76.
      The gate measured 69 to 92 percent GPU use by another process during its own runs.
