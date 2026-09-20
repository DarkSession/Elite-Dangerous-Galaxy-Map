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
      target raises `INVALID_ENUM`, an `errorBefore` switch and a `live()` reader. With
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

- [ ] 3.1 Move `BRIGHT_VIEW`, `DARK_VIEW` and `CLOSE_VIEW` out of `e2e/nebulae.spec.ts` into
      a new `e2e/nebula-views.ts`, beside `e2e/region-views.ts`, and import them back.
      Verify `GALAXY_MAP_E2E_BUILT=1 pnpm exec playwright test e2e/nebulae.spec.ts
      --project=chromium-gpu` passes with no other change.
- [ ] 3.2 Add the scenario "The nebulae draw where the target refuses a block format" to
      `e2e/nebulae.spec.ts`. It patches `texStorage3D` in the page to refuse
      `COMPRESSED_RED_RGTC1` on a `TEXTURE_2D_ARRAY` and to pass every other call through,
      opens `CLOSE_VIEW`, reads the frame with the nebulae on and again with them off, and
      asserts the two differ and that the load records a block decode. Use `withNebulae`
      and `meanLuminanceFrame`, which `e2e/nebulae.spec.ts` already pairs.
- [ ] 3.3 Confirm the guard of 3.2 fails against the fault. Comment out the probe of task
      2.1, run **`pnpm build:demo-site`**, then run the spec, and record that it fails and
      how it reads. Restore the probe and rebuild. Do **not** reuse the
      `GALAXY_MAP_E2E_BUILT=1` command of task 3.1 for this: that flag runs `pnpm preview`
      alone, which serves the previous bundle, so the reverted source never reaches the
      browser and the test passes for the wrong reason.

## 4. The Firefox reading

- [ ] 4.1 Add `e2e/nebulae-firefox.spec.ts`. It opens `CLOSE_VIEW` from `e2e/nebula-views.ts`,
      reads the frame with the nebulae on and again with them off, and asserts the two
      differ. It reads pixels and asserts on no draw count, because every count reads
      correctly in the fault. It calls no `toHaveScreenshot`.
- [ ] 4.2 Have the same spec log which path the browser took, as a diagnostic and not an
      assertion, so a reader of the run learns the answer for the browser in front of them.
      The `nebulae` delta asks for this, because the Firefox reading in the spec is one
      browser on one day.
- [ ] 4.3 Add the new spec to the Firefox project's `testMatch` in `playwright.config.ts`.
      Verify with `GALAXY_MAP_E2E_BUILT=1 pnpm exec playwright test
      e2e/nebulae-firefox.spec.ts --project=firefox`, after a build.
- [ ] 4.4 Confirm the Firefox spec fails against the fault, by the same method and the same
      build warning as task 3.3. Record that it fails and how.
- [ ] 4.5 Run the same spec in Chromium and record that it passes there too, so the reading
      is not one browser's alone.
- [ ] 4.6 Update the unit test of `playwright.config.ts` for the Firefox project's
      `testMatch`, which asserts the renderer spec and the paint budget spec "and nothing
      else". Verify the file passes.
- [ ] 4.7 Add the unit scenario "No spec the Firefox project runs holds a baseline image":
      read every spec the project's `testMatch` holds and assert none calls
      `toHaveScreenshot`. Verify it passes, and verify it fails when `e2e/look.spec.ts` is
      added to the list.

## 5. The cost spec's own probe

- [ ] 5.1 Change how `e2e/nebula-cost.spec.ts` decides whether the run took the block path.
      It calls `getExtension` on a throwaway context, which is the reasoning this change
      declares wrong, and it reads correctly on the development card by luck. Make it
      allocate on a `TEXTURE_2D_ARRAY` instead, the way the renderer's probe does. Verify
      with one Playwright run over that file.
- [ ] 5.2 Confirm the scenario "The blocks upload with no decode where the extensions are
      there" is held by the changed test. The delta widened its WHEN from carrying the two
      extensions to carrying them **and** proving both formats, and the scenario keeps its
      older name because a MODIFIED requirement replaces the whole block and a renamed
      scenario reads to the validator as a dropped one.

## 6. The readings the change states

- [ ] 6.1 Record the probe's readings in Firefox and Chromium, from the runs of tasks 3.2
      and 4.3: which format each browser refuses on `TEXTURE_2D_ARRAY`, and which path each
      browser then takes. Confirm they match the table in `proposal.md`, and correct the
      table where they do not.
- [ ] 6.2 Read the decode mark in Firefox on the fallback path and record the sum, so the
      14.2 to 19.2 ms the `nebulae` delta states is read in the browser that now takes that
      path. Record it whatever it says. If it lies outside the stated range, do not move the
      range in this task; report it, because the range is a Chromium figure and a second
      browser's reading may belong beside it rather than inside it.
- [ ] 6.3 Confirm the fallback path itself renders in Firefox, and not only that the fast
      path is avoided. The fallback uploads plain `R8` and `RGBA8` to a `TEXTURE_2D_ARRAY`,
      where before the slice arrays it uploaded to a `TEXTURE_3D`. Task 4.1 reads a drawn
      frame, so this is a check of that result and not a second run.

## 7. The whole suite and the gate

- [ ] 7.1 Run `pnpm lint` and `pnpm exec tsc --noEmit`, and fix what they report.
- [ ] 7.2 Run `pnpm exec vitest run` on its own, with no Playwright run in flight, and
      verify every unit test passes.
- [ ] 7.3 Run the whole Playwright suite once, one run at a time, and verify it passes with
      the renderer assertion holding on hardware in both browsers.
- [ ] 7.4 Check that no figure of the two delta specs is left unmet, by reading each changed
      scenario against the test that holds it. Do not edit `openspec/specs/` by hand; the
      archive step carries the delta.
- [ ] 7.5 Confirm the archive order the design states is still correct: this change is
      archived **after** `store-nebula-volumes-as-slice-arrays`, because its delta is
      written against the text that change leaves behind. Record the check.
- [ ] 7.6 GATE — implementation review. Launch the `openspec-implementation-reviewer`
      subagent with this change id, wait for its verdict, fix what it blocks on, and state
      the verdict and every finding when presenting the work.
