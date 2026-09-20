# Tasks

Read [design.md](design.md) before starting. Its Migration Plan is what the group order
below follows: groups 1 to 3 are **additive** and leave a working tree, group 4 is the swap,
and group 5 goes one way or the other on the reading group 5 takes.

**Commit each group on its own**, with every `git add` naming its paths and never a bare
`-A`. Task 5.1 can abort the change, and a per-group commit is what makes that abort a
revert rather than a rewrite.

**This change starts only after `replace-nebula-sprites-with-volumes` is archived.** It
modifies a requirement that lives in that change's delta and not yet in
`openspec/specs/nebulae/spec.md`, which is why `openspec validate --strict` reports one
INFO about the MODIFIED header. Verify with `openspec list` that the other change is gone
from the active list before task 1.1.

## 1. The container, both ways

- [x] 1.1 Add `scripts/dds-to-ktx2.mjs`: read every `src/render/nebula-art/*.dds`, take the
      bytes after the 148-byte header, and write `<name>.ktx2` beside it. The header is
      exactly **208 bytes** — 12 identifier, 68 fixed, a 24-byte one-entry level index, a
      44-byte basic descriptor block, a 56-byte key/value block and 4 bytes of padding,
      because a BC1 or BC4 level must start at a multiple of 8. Set `vkFormat` to 139 for a
      density volume and 131 for a colour one, `pixelWidth` and `pixelHeight` to the side,
      `pixelDepth` to 0, `layerCount` to the side, `faceCount` to 1, `levelCount` to 1 and
      `supercompressionScheme` to 0. The side comes from `nebula-volumes.json`, not from the
      file size. **Pin the key/value block**: one entry, key `KTXwriter` with its zero (10
      bytes), value exactly `elite-dangerous-galaxy-map dds-to-ktx2` with its terminating zero
      (39 bytes), a `keyAndValueByteLength` of 49 and 3 bytes of padding, for 56 in all. The
      value keeps its zero because the format requires it and a general reader takes it as a C
      string. Verify the script writes 66 files and that every one is exactly `208 + blocks`
      bytes long.
- [x] 1.2 Add `readNebulaKtx2(bytes)` to `src/render/nebula-volumes.ts`: check the
      identifier, read the fixed fields, read the one level's offset and length from the
      level index, and return `{ format, side, layers, blocks }`. Throw the loader's typed
      error where the identifier is wrong, `levelCount` is not 1, `faceCount` is not 1,
      `supercompressionScheme` is not 0, `vkFormat` is neither 139 nor 131, `layerCount` is 0,
      or the level's slice runs past the file. Verify a unit test drives each of those seven
      refusals and the accepting case.
- [x] 1.3 Add the round-trip unit test: for every one of the 33 assets, run the script's
      writer over the committed `.dds` blocks, read the result back with `readNebulaKtx2`,
      and assert the blocks come back byte for byte and the side, layer count and format
      match the index. This is what makes the conversion provable, so it runs over all 66
      files and not a sample. **Put the writer in `scripts/ktx2.mjs`**, which the script and
      the test both import, so the two cannot hold different versions of the header. It is a
      build-time writer and not application code, so it does not go under `src/`, and the
      published bundle never carries it.
- [x] 1.4 Verify `pnpm lint`, `pnpm exec tsc --noEmit` and `pnpm exec vitest run` all pass.
      Nothing in the renderer has changed yet.

## 2. The files

- [x] 2.1 Run `scripts/dds-to-ktx2.mjs` and commit the 66 `.ktx2` files **beside** the 66
      `.dds` files. Verify `src/render/nebula-art/` holds 134 files and that `git status`
      shows no other addition.
- [x] 2.2 Extend `tests/fixtures/nebulae.json` with a `volume_blocks_sha256` map: the digest
      of the **block payload** of each of the 33 assets' two volumes, which is the same number
      whichever container holds it. Verify a unit test reads that digest out of both the
      `.dds` and the `.ktx2` file of every asset and finds it equal, which is the spec's
      scenario **The blocks are the blocks that were packed**.
- [x] 2.2a Add the unit test for the spec's scenario **Every shipped file holds the shape the
      spec fixes**: read all 66 committed `.ktx2` headers and assert `levelCount` 1,
      `faceCount` 1, `supercompressionScheme` 0, a 208-byte header, a `vkFormat` that matches
      the volume's channel count, and `layerCount`, `pixelWidth` and `pixelHeight` all equal
      to the index's side.
- [x] 2.3 Fix every test that counts the art files, because the directory now holds 134. Two
      files, and no others:
      `tests/main-bundle.test.ts` — raise `NEBULA_ASSET_FILES` to 134, widen the
      `names.filter((name) => name.endsWith('.dds'))` volume filter to take `.ktx2` as well,
      and raise `expect(volumes).toHaveLength(66)` to **132**, or that assertion and the
      `volumes.length + index.length + transfer.length` sum disagree with the new count.
      `src/render/nebula-volumes.test.ts` — the two `nebulaAssetUrlCount()` assertions, which
      glob the directory and read 68 and `index.assets.length * 2 + 2` today. Both read 134
      once the `.ktx2` files land.
      **Leave the committed-set file list alone at this group.** It is built from the index's
      names with a `.dds` suffix, so it still finds 68 files and its `2_914_225` disk figure
      still holds; widening it here would break both. Task 5.2 is where it moves. Task 5.2
      also undoes the two edits above. Verify the whole unit suite passes.
- [x] 2.4 Verify `pnpm build` and the entry-chunk bounds of `tests/main-bundle.test.ts` read
      the same as before: the art loads as fetched assets, so 66 more files must add nothing
      to any chunk.

## 3. The reading that decides the change

- [x] 3.1 Add `the worst camera holds the fetch bound` to `e2e/nebula-cost.spec.ts`, in the
      timed pass, under exactly the conditions the spec's requirement **The march filters the
      third axis itself** states: every other pass off through `nebulaeAlone`, the camera at
      Barnard's Loop at **60, 120 and 260** light years, 1,280 by 720, the median of five runs
      of 120 frames. Assert the spec's absolute bounds — **0.98 ms** at 120 and **0.92 ms** at
      260 — and not a ratio computed in the test, so the test and the spec cannot disagree.
      Also read the whole frame at the near view with every pass on and assert it is inside
      16.7 ms. A nine-camera sweep ranked 120 the worst and 60 the next; the proposal carries
      the ranking.
- [x] 3.1a Run task 3.1's test against the tree as it stands, which still draws from the 3D
      textures, and record all three readings here beside this task. **The expected medians
      are 0.655 ms at 120 and 0.614 ms at 260**, which are the figures
      `e2e/nebula-cost.spec.ts` already records for those two cameras in the timed pass. 60
      light years has no committed baseline: take it, write it into the spec beside the other
      two, and set its bound at 1.5 times it. If either committed baseline moves by more than
      a tenth, restate all three and their bounds in the spec before going on.
      **The readings, on the 3D-texture tree:** 0.523 ms at 60 light years, 0.512 at 120 and
      0.485 at 260, each the median of five runs of 120 frames. The whole frame at the near
      view, every pass on, read 1.169 ms. Both committed figures moved by more than a tenth,
      0.655 to 0.512 and 0.614 to 0.485, so all three baselines and all three bounds are
      restated in the spec, the proposal and the test: 0.78 ms at 60, 0.76 at 120 and 0.72
      at 260.
- [x] 3.2 Add the unit test for the spec's scenario **The layer interpolation matches a
      trilinear filter**: a TypeScript statement of `t = clamp(w * layers - 0.5, 0,
      layers - 1)` with a `mix` by `fract(t)`, a known volume, and a trilinear filter of the
      same data to compare against, at points between layer centres, at both faces and past
      both ends, within one part in 10,000. It passes the day it is written, because it tests
      the arithmetic and not the shader. Record in the test's own comment that it is not an
      oracle for the shader and that the CPU fixture tests are what hold the shader to it.
- [x] 3.3 Verify `pnpm test:e2e` and `pnpm exec vitest run` both pass.

## 4. The swap

- [x] 4.1 Change the upload in `src/render/nebula-volumes.ts`. Replace `create3D` with a
      function that makes a `TEXTURE_2D_ARRAY` and takes one of two paths. Where the context
      carries both `EXT_texture_compression_rgtc` and `WEBGL_compressed_texture_s3tc`, call
      `texStorage3D` with `COMPRESSED_RED_RGTC1_EXT` or `COMPRESSED_RGB_S3TC_DXT1_EXT` and
      upload the blocks with `compressedTexSubImage3D`, all layers in one call. Otherwise
      decode as today and upload `R8` or `RGBA8` with `texSubImage3D`. Keep `CLAMP_TO_EDGE`
      on S and T, and keep `LINEAR` on both filters. Throw on the block path where a side is
      not a multiple of 4. Verify unit tests cover both paths over the fake context, and that
      the existing texture-exhaustion test still frees what it made.
- [x] 4.2 Change `src/render/shaders/nebulae.frag`: `uDensity` and `uColour` become
      `sampler2DArray`, and each read becomes two `texture` calls and a `mix`, with the layer
      count from `textureSize(sampler, 0).z` and the arithmetic of task 3.2. **Replace the
      `precision highp sampler3D;` line as well**: those two uniforms are its only users, and
      GLSL ES 3.00 gives `sampler2DArray` no default precision in the fragment language, so
      the shader does not compile without `precision highp sampler2DArray;`. Verify
      `src/render/nebula-pass.test.ts`'s source checks follow the new text — including the
      `(u, 1 - v, w)` convention and the `.rgb` swizzle on the colour read. The unit test of
      task 3.2 does not read the shader and does not change here.
- [x] 4.3 Change the binds in `src/render/nebula-pass.ts`: the two per-record binds move from
      `gl.TEXTURE_3D` to `gl.TEXTURE_2D_ARRAY`. **Split the unbind sweep**, which today loops
      over `DENSITY_UNIT`, `COLOUR_UNIT` and `VOLUME_UNIT` together and unbinds all three as
      `TEXTURE_3D`: the two volume units unbind as `TEXTURE_2D_ARRAY` and `VOLUME_UNIT` stays
      `TEXTURE_3D`. The galaxy volume in the **vertex** shader stays a `sampler3D` and its bind
      stays `TEXTURE_3D` — that texture is the renderer's own and this change does not touch
      it. Verify the pass's unit tests pass and that the program still links.
- [x] 4.4 Point the loader at the `.ktx2` files: `blocksOf` gives way to `readNebulaKtx2`,
      and the fetch list takes `-density.ktx2` and `-colour.ktx2`. Check each file's side and
      layer count against the index and throw where they disagree, which is the spec's
      scenario **A file that disagrees with the index is refused**. Verify a unit test drives
      that refusal.
- [x] 4.4a Fix `the volume decode holds the frame budget` in `e2e/nebula-cost.spec.ts`. It
      counts resource entries ending `.dds` and asserts 66, and counts `nebula-decode` marks
      and asserts 33. After task 4.4 the first must read `.ktx2`, and on the block path the
      second reads **0**, which is the point of the change. Rewrite it to assert 66 `.ktx2`
      fetches, and to assert the decode mark count is 33 on the decoding path and 0 on the
      block path, branching on the two extensions. Verify it passes on the development GPU,
      where both extensions are present.
- [x] 4.5 Update `e2e/nebulae.spec.ts`'s asset watcher: the `NEBULA_FILES` pattern and the
      `page.route('**/*-density-*.dds')` that holds a density file both name `.dds` today.
      Verify the watcher's positive control still reads 1 record file, 1 index, 1 transfer
      file, 33 density and 33 colour.
- [x] 4.6 Add the browser test for the spec's scenario **The blocks upload with no decode
      where the extensions are there** to `e2e/nebulae.spec.ts`, beside **The map needs no
      compressed-texture extension**, which already knows how to refuse an extension and runs
      in the parallel pass. Read `performance.getEntriesByName('nebula-decode')` and assert it
      is empty, then take a screenshot; repeat with both extensions refused and compare the
      two frames at 0.01 RMSE in display units.
- [x] 4.7 Verify `pnpm lint`, `pnpm exec vitest run` and `pnpm test:e2e` all pass, and that
      the two CPU fixture tests still read within their committed bounds — 0.02 for
      `barnards-loop` and 0.01 for `cats-eye`. Those two are what say the layer interpolation
      changed no frame. **If `cats-eye` breaches 0.01**, the GPU's block decode differs from
      `decodeBC1`; regenerate that fixture from the block path and record the old and new
      readings, rather than raise the bound. `design.md` states why.
      **Both fixtures read better and not worse:** `barnards-loop` fell from 0.0083 to
      **0.002374** RMSE against its 0.02 bound, and `cats-eye` from 0.0058 to **0.003860**
      against its 0.01. Neither fixture was regenerated. The shader's own two-layer mix is
      closer to the trilinear CPU reference than the card's 3D filter was, so the frame
      moved towards the reference and not away from it.
- [x] 4.7a **One bound of another change moves with the swap, and this is where it is
      recorded.** `the overlap stays inside the light it was measured at`, in
      `e2e/nebulae.spec.ts`, belongs to `blend-nebulae-order-independently`. Its first
      camera failed after task 4.2: the array's own layer interpolation raises the light a
      little, and the bound had 0.0007 of headroom because it is the previous reading
      rounded up.
      **The three readings, before this change and after it:** Barnard's Loop at 120 light
      years, 0.193286 to **0.194194**, a rise of **0.47 percent**; the Orion viewpoint at
      800, 0.043158 to **0.043239**, a rise of **0.19 percent**; the Orion viewpoint at
      3,000, 0.038243 to **0.038257**, a rise of **0.037 percent**.
      **Only the first bound moves, from 0.194 to 0.195.** The other two round up to the
      same thousandth they already held, so their numbers do not change.
      **Why the bound moves rather than the change stopping.** That scenario states its own
      rule: the bound at each camera is the figure the implementation measures, rounded up
      to the next thousandth, and the guard it does not move for is a rise of more than **a
      tenth**. The worst of the three rises is 0.47 percent, which is two orders under that
      guard. The evidence that the frame improved rather than degraded is task 4.7's pair of
      CPU fixture readings, which both fell. The baseline screenshot still matches.
      `openspec/changes/blend-nebulae-order-independently/tasks.md` is left alone: its line
      328 records what that change measured, which was true when it measured it.
      The test is also restructured to read all three cameras before it asserts any, so a
      bound that has to be restated is restated from three readings and not from one.
      **Two notes on what the comment now says.** Its headline compares the readings
      against the blend that ordered the records, which is two changes back, so the
      6.46, 0.23 and 0.055 percent it gives carry the order independence **and** this
      change together; the headline now says so and the split above is the part that is
      this change's. And the sentence **"No pixel of the three frames falls"** is
      dropped: it was a per-pixel claim of the ordering change, this change did not
      re-measure per pixel, and the mean is the only reading in hand. Nothing here
      replaces it, so a later reader who wants that claim has to take it again.

- [x] 4.7b **The fallback decode is now one task, and that is a regression this change
      does not fix.** The implementation gate found it and it is recorded here rather
      than repaired, because repairing it needs a wider change than this one.
      **What moved.** The decode used to sit in `loadNebulaVolumes`, inside a per-asset
      `async` callback, so each of the 33 assets was a task of its own and the worst was
      2.3 ms against the 16.7 ms frame budget. Task 4.1 moved the choice between the
      block path and the decoding path into `createNebulaVolumeTextures`, because the
      choice needs a context and the loader has none. That call is synchronous, so all
      33 decodes now run inside it.
      **What it costs.** Twenty-eight readings on the development card give a sum of
      14.2 to 19.2 ms in one task, with a worst single asset of 1.8 to 2.9 ms. The one
      task therefore straddles the 16.7 ms frame budget. It is paid once, at load,
      after the first frame, and nothing waits on the set, so it shows as one long
      frame and in no other way. It is the normal path on a GPU that carries ETC or
      ASTC rather than S3TC and RGTC, where a slower CPU makes it worse.
      **Why it is not fixed here.** Splitting the decode across tasks again needs either
      a context parameter on `NebulaSource.loadVolumes`, which takes none, or a
      `createDraw` that finishes after it returns. Both change the source interface a
      host passes, and one of them changes when the pass may first draw. That is wider
      than this change and it is the owner's call, not this change's.
      **What is done instead.** The proposal's sentence that the fallback "decodes as it
      does today" is true of the work and false of the tasking, and this entry is the
      record of that. `e2e/nebula-cost.spec.ts` gains `the fallback decode is one task`,
      in the timed pass, which refuses the two extensions so the fallback is actually
      taken — every other test in that file runs on the block path, where the decode
      count is 0 and any decode assertion passes vacuously. It asserts on the **sum**,
      which is what one task costs, and not on the per-asset worst, which no longer
      describes a task. Its bound is 24 ms, the worst reading plus a quarter. It is a
      ratchet against the decode growing and not a promise that the frame budget
      holds.
      **The bound was set from an understated tail and is corrected.** The first four
      readings ran 15.0 to 17.6 ms and put the bound at 22. The gate then sampled 15.0,
      15.3, 15.9, 16.4 and 19.2, and nine further runs gave 14.5 to 16.9, so the real
      worst of nineteen is 19.2 and a bound of 22 sat 14 percent above it rather than
      the quarter it claimed. A ratchet that close to the tail trips on a busy machine
      and not on a change to the code. The rule did not move; the worst it is taken from
      is corrected, and the bound follows it to 24. A third gate pass read nine more
      sums, 14.2 to 17.8 ms. They leave the worst of twenty-eight at 19.2 and move the
      floor to 14.2.
      Two comments that claimed one asset a task are corrected:
      `src/render/nebula-volumes.ts` now states what runs in the one call and why it
      cannot sit in the loader, and the decode paragraph of `e2e/nebula-cost.spec.ts`
      says which path its own test reads and points at the fallback guard.
      **The `nebula-decode` mark is narrowed to the decode.** It used to open before the
      density volume and close after the colour one, so it covered `texStorage3D` and
      `texSubImage3D` as well. The upload of an asset now runs after its mark closes, so
      the entry measures what its name says.

## 5. The decision

- [x] 5.1 Run task 3.1's test against the swapped tree and record all three readings here.
      **If any camera is above its bound, take the abort branch** of task 5.1a. Otherwise go
      on to task 5.2.
      **The readings, on the swapped tree:** 0.5275 ms at 60 light years against a bound of
      0.78, 0.5217 at 120 against 0.76 and 0.4733 at 260 against 0.72, each the median of
      five runs of 120 frames. Against the baselines of 0.523, 0.512 and 0.485 those are
      ratios of 1.01, 1.02 and 0.98, where the bound is 1.5. The whole frame at the near
      view, every pass on, read 1.095 ms against 16.7. **Every camera holds its bound, so
      the change goes on to task 5.2** and the abort branch of 5.1a is not taken.
- [ ] 5.1a **Not taken.** Every camera held its bound at task 5.1. **The abort branch.** Revert the group 4 commit and the group 2 commit, which
      removes the 66 `.ktx2` files, the `volume_blocks_sha256` map and the file-count edits
      together. Keep group 1: `readNebulaKtx2` and its tests are what a later attempt starts
      from, and the reader is dead code in the published bundle until then — move it and the
      writer to `scripts/` so the library ships neither. Keep task 3.1's cost test and task
      3.2's arithmetic test; both pass on the reverted tree, because neither reads the shader.
      Then withdraw this change: write the measured reading into `design.md` as the answer,
      mark the remaining tasks as not done with that reason, and do **not** archive it. The
      spec delta describes a tree that does not exist, so it must not reach
      `openspec/specs/nebulae/spec.md`.
- [x] 5.2 If the bound holds: delete the 66 `.dds` files and their entries from
      `tests/fixtures/nebulae.json`, and fix everything that reads them. Named, because the
      proposal's "the tests that read any of them" is not a plan:
      `src/render/nebula-volumes.ts` (`NEBULA_DDS_HEADER_BYTES`, and `blocksOf` if task
      4.4 left it); `src/render/nebula-volumes.test.ts` (the committed-set file list,
      which now takes a `.ktx2` suffix; its `2_914_225` disk literal, which task 5.3
      moves to **2,918,185**; the two `nebulaAssetUrlCount()` assertions, back to 68;
      the **three `nebulaAssetUrl` calls** in the same test, which pass
      `<name>-density.dds`, `<name>-colour.dds` and, in the refusal test,
      `no-such-asset-density.dds` — the first two throw once the glob holds no `.dds`
      entry; that test's own title, which names the file count; and the test `holds a
      DX10 .dds of the size its side implies`, which the KTX2 shape test of task 2.2a
      replaces and which is deleted here); `src/render/nebula-march.test.ts` (its
      `blocks()` helper slices at 148); `tests/nebula-fixture.test.ts` (the same
      148-byte slice, in its byte-for-byte decode check);
      `scripts/build-nebula-fixture.mjs` (it builds the CPU reference from `.dds`
      bytes); `src/scene-data/nebulae.test.ts` (it hashes every file of
      `volume_files_sha256` and asserts the map holds `assets * 2` entries); the
      round-trip test of task 1.3 (its `.dds` input is gone, so it round-trips the
      `.ktx2` file against itself); and `tests/main-bundle.test.ts` —
      `NEBULA_ASSET_FILES` back to 68, the volume filter back to one extension, **and
      all four `.dds` regular expressions**. Two are the `NEBULA_NEEDLES` entries
      `/-density-[\w-]+\.dds/` and `/-colour-[\w-]+\.dds/`, read by the loop that
      requires a needle to be absent and by the loop that requires it present. Two more
      are inline copies of `/-density-[\w-]+\.dds/`: one in the assertion that the first
      chunk does **not** name a volume, and one in the assertion that the second chunk
      does. **Two of the four go stale silently** — the absence loop and the inline
      absence assertion both keep passing against a pattern nothing matches any more —
      and two fail loudly. Change all four together.
      **Replace the whole-file digests, do not just delete them.** `tests/fixtures/nebulae.json`
      holds `volume_files_sha256` keyed by `.dds` name. Rekey it to the 66 `.ktx2` names with
      their digests, because the spec's scenario **The assets do not drift** needs it. The
      block digests of task 2.2 stay as they are, since a block payload has no container.
      Verify `src/render/nebula-art/` holds 68 files and the whole unit suite passes.
- [x] 5.3 Update the size figures everywhere they are written: the four-row table and
      the on-disk paragraph in the spec delta, `AGENTS.md`, `README.md` and
      `THIRD_PARTY_NOTICES.md`. Read the total from the files rather than trusting this
      number; **the expected art-directory total is 2,918,185 bytes**, which is
      2,774,432 of volumes, 135,168 of transfer tables and 8,585 of index. Read the wire
      total from the files too: the proposal predicts none, because it depends on the
      exact header bytes. **The readings:** 2,918,185 bytes on disk, which is 2.783 MiB,
      and 1,160,103 bytes over the wire, which is 1.106 MiB. The wire total rose by 4,376
      bytes over the `.dds` set and sits far under the 1.3 MiB bound.
      Verify the unit test that pins the documented total passes —
      it reads both `AGENTS.md` and `README.md` — and that
      `tests/third-party-notices.test.ts` passes.
- [x] 5.4 Add the video-memory reading for the block path to the budget test in
      `src/render/nebula-volumes.test.ts`: the block payload of every volume plus the transfer
      tables, against the spec's 3.0 MiB bound. Keep the decoded total and its 6.5 MiB bound
      beside it, because the decoding path still pays it. Verify both readings print and both
      hold. **The readings:** 2,895,872 bytes on the block path, which is 2.762 MiB against
      3.0, and 6,320,128 on the decoding path, which is 6.027 MiB against 6.5.
- [x] 5.4a Correct the comments that state a fact this change falsifies. None is covered by a
      test, so each has to be found by hand:
      `e2e/nebula-cost.spec.ts` — the decode paragraph over `the volume decode holds the frame
      budget`, which says the loader decodes 33 assets in 16.9 ms from `.dds` blocks, and the
      reading comment over `the box costs the same from inside as from outside`, which holds
      the 0.614 and 0.655 figures. **Keep that pre-change pair somewhere explicit**, in the new
      cost test's own comment, because the spec cites it as the indicative reading; overwriting
      it with post-change numbers would leave the spec citing a figure the tree no longer
      holds.
      `e2e/nebulae.spec.ts` — the comment over the no-extension scenario, which says a
      run that uploaded the blocks unchanged "would find no format and draw nothing".
      After this change that is the fast path.
      `tests/main-bundle.test.ts` — "2.77 MiB of art" over the file-emission test.
      `src/render/buffers.ts` and `src/render/buffers.test.ts` — both state the art file
      count, which is wrong from group 2 until task 5.2. Task 5.2 puts the directory back at
      68 files and 66 volumes, so both read true again and neither is edited.
      `THIRD_PARTY_NOTICES.md` — "both in `.dds` block form".
- [x] 5.4b **One cost test measures with an instrument that cannot hold its bound, and
      this change gave it one that can.** `the box costs the same from inside as from
      outside` in `e2e/nebula-cost.spec.ts` read a frame mean at one camera and then the
      other, and asserts the difference is under 20 percent.
      **What moves is a ramp at the start of the test, not the swap.** The card runs
      fast for the first frames of the file, so whichever camera is read first is read
      high. Nine fresh runs of the file gave the first camera 0.483 to 0.546 eight times
      and 0.7225 once, 48 percent above the rest, and that run failed on a share of
      0.285. Across this change's whole-suite runs the test read 3.2, 12.9, 0.8 and 26.6
      percent, and the 0.8 came after the swap had landed, so the swap is not what moves
      it. The test came in with `Replace the nebula sprites with marched volumes`, so
      the weak instrument is not this change's work either. This change met it.
      **A median of five did not fix it.** It was tried first. Five repeats inside one
      process read 15.03 to 15.34 percent and looked tight, but repeats inside one page
      share the ramp, so they measure nothing about it. Across fresh processes the two
      medians still spread 28 points, because both medians sit on the same slope at
      different points on it. A median at one camera shrinks the ramp; it does not
      cancel it.
      **What the test does now.** The two cameras alternate inside one `page.evaluate`,
      nine times over 60 frames each, and the test pools the two sums over 540 frames
      each. A ramp that falls through the call leaves both sums, so it cancels out of
      their difference. This is the pattern `the vertex march is a small share of the
      pass` takes in the same file, for the same problem. One warm-up read of 60 frames
      is thrown away before the rounds start.
      **The residual, measured across fresh processes and not inside one.** Nine fresh
      runs give a pooled share of 0.068, 0.077, 0.077, 0.079, 0.082, 0.084, 0.095, 0.101
      and 0.111: a spread of **4.4 points**, against 28 points for the two medians over
      the same nine runs. The worst of the nine is a little over half the bound. In the
      worst run the nine per-round shares still spread 0.378, and the pooled share reads
      0.111, which is the pooling doing its work.
      A whole-suite run reads 0.110, inside that band. The two medians did not manage
      that: they read 15 percent with the file run alone and 3.8 percent in a whole
      suite, because each median sat on a different part of the ramp. The pooled share
      does not depend on what ran before it.
      **The bound stays at 20 percent.** No bound moved and none was softened.

- [x] 5.5 Verify the whole gate: `pnpm lint`, `pnpm exec vitest run`, `pnpm build`,
      `pnpm test:e2e` and `openspec validate store-nebula-volumes-as-slice-arrays`, and that
      the baseline screenshot still matches.

## 6. The review gate

- [ ] 6.1 Run the `openspec-implementation-reviewer` subagent over the finished change and
      act on its findings. On BLOCK, fix and re-run it. Report the verdict and every finding,
      including the ones not acted on and why.
