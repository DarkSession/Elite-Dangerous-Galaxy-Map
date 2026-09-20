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

## 5. The decision

- [ ] 5.1 Run task 3.1's test against the swapped tree and record all three readings here.
      **If any camera is above its bound, take the abort branch** of task 5.1a. Otherwise go
      on to task 5.2.
- [ ] 5.1a **The abort branch.** Revert the group 4 commit and the group 2 commit, which
      removes the 66 `.ktx2` files, the `volume_blocks_sha256` map and the file-count edits
      together. Keep group 1: `readNebulaKtx2` and its tests are what a later attempt starts
      from, and the reader is dead code in the published bundle until then — move it and the
      writer to `scripts/` so the library ships neither. Keep task 3.1's cost test and task
      3.2's arithmetic test; both pass on the reverted tree, because neither reads the shader.
      Then withdraw this change: write the measured reading into `design.md` as the answer,
      mark the remaining tasks as not done with that reason, and do **not** archive it. The
      spec delta describes a tree that does not exist, so it must not reach
      `openspec/specs/nebulae/spec.md`.
- [ ] 5.2 If the bound holds: delete the 66 `.dds` files and their entries from
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
- [ ] 5.3 Update the size figures everywhere they are written: the four-row table and
      the on-disk paragraph in the spec delta, `AGENTS.md`, `README.md` and
      `THIRD_PARTY_NOTICES.md`. Read the total from the files rather than trusting this
      number; **the expected art-directory total is 2,918,185 bytes**, which is
      2,774,432 of volumes, 135,168 of transfer tables and 8,585 of index. Read the wire
      total from the files too: the proposal predicts none, because it depends on the
      exact header bytes. Verify the unit test that pins the documented total passes —
      it reads both `AGENTS.md` and `README.md` — and that
      `tests/third-party-notices.test.ts` passes.
- [ ] 5.4 Add the video-memory reading for the block path to the budget test in
      `src/render/nebula-volumes.test.ts`: the block payload of every volume plus the transfer
      tables, against the spec's 3.0 MiB bound. Keep the decoded total and its 6.5 MiB bound
      beside it, because the decoding path still pays it. Verify both readings print and both
      hold.
- [ ] 5.4a Correct the comments that state a fact this change falsifies. None is covered by a
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
      count, which is wrong from group 2 until task 5.2.
      `THIRD_PARTY_NOTICES.md` — "both in `.dds` block form".
- [ ] 5.5 Verify the whole gate: `pnpm lint`, `pnpm exec vitest run`, `pnpm build`,
      `pnpm test:e2e` and `openspec validate store-nebula-volumes-as-slice-arrays`, and that
      the baseline screenshot still matches.

## 6. The review gate

- [ ] 6.1 Run the `openspec-implementation-reviewer` subagent over the finished change and
      act on its findings. On BLOCK, fix and re-run it. Report the verdict and every finding,
      including the ones not acted on and why.
