## 1. The data lands in this repository

The two data files are built by a step that is not in this tree. Whoever implements this
must be given both files. Nothing in this group derives them from what is here.

- [x] 1.1 Add `src/scene-data/nebulae.json` holding 358 records, each with a position in
      game coordinates, a radius in light years, a tile index and a name that may be
      empty; verify a unit test reads 358 records, every radius above 0 and at most 200,
      every tile index from 0 to 33 and every position finite
- [x] 1.2 Pack the sprite atlas at `src/render/nebula-art.webp`: 34 tiles of **256 by
      256** in a 6 by 6 grid, 1536 by 1536, RGBA, WebP quality 90 with alpha exactly
      lossless, one chosen projection per source, the outermost one-texel ring at alpha
      0, and at most 2 MiB. Verify that every tile a record names carries art. The file
      is 811,762 bytes, so 793 KiB. All 34 slots carry art, so all 358 records draw. The
      alpha channel round-trips with 0 error and the worst ring alpha is 0. The colour
      channels cost a mean of 1.7 levels in 255 over every pixel that is not fully
      transparent, with a 99th percentile of 7
- [x] 1.2a Map each record's template name to its art slot and to a tile index. The two
      spellings differ: a record names `Barnard's Loop` and the art slot drops the space
      and the apostrophe, so the pack step needs a stated transform or an explicit table,
      and the table is what ships. Verify all 358 records map, with no record left without
      a tile
- [x] 1.3 Verify the outermost one-texel ring inside every tile is alpha 0, by a test that
      decodes the atlas and reads that ring for each of the 34 tiles. The test runs in the
      browser, not in Vitest: Node 22 has neither `createImageBitmap` nor `ImageDecoder`,
      so it decodes no WebP. The test reads the bytes of the committed file. The spec
      scenario is updated to say so
- [x] 1.4 Record the SHA-256 of both files in the test fixtures, on the pattern
      `src/galaxy-model/detail.test.ts` uses; verify the test fails when either file
      changes and passes when neither does
- [x] 1.5 Confirm no file in the change and no new source file names anything outside this
      repository; verify by reading the change's files and the new sources back

## 2. The nebula set

- [x] 2.1 Add `src/scene-data/nebulae.ts` with the record type and a loader that fetches
      `./nebulae.json?url&no-inline` once, on the pattern of
      [src/galaxy-model/detail.ts](../../../src/galaxy-model/detail.ts); verify a unit
      test that the set builds once and returns the same object on a second call
- [x] 2.2 Verify the entry chunk holds no nebula record: search the built chunk for a
      record's name and for the string `nebulae.json` contents
- [x] 2.3 Verify the selection returns an empty list before the fetch resolves, and that a
      frame drawn then holds no nebula and reports no error
- [x] 2.4 Throw a typed error when the fetch fails or the asset does not parse, as
      `src/galaxy-model/detail.ts` does, and report it through `src/app/`; verify a unit
      test with a failing fetch that the error is typed and that a later frame still draws
      every other pass
- [x] 2.5 Add the apparent-radius calculation, the 1.5 CSS pixel floor, the drawn cap and
      the record budget, largest first; measure both the floor and the cap in CSS
      pixels, not in target texels; verify unit tests that a 200 light year record at
      10,000 light years and a 100 light year record at 5,000 take the same apparent
      radius, and that on a canvas 720 CSS pixels high a record whose uncapped radius is
      400 draws at 400 and one of 2,000 draws at the cap of 540
- [x] 2.6 Add the zoom band weight, 1 from the closest zoom to 12,000 light years and 0
      at and above 20,000, on the pattern of `CLOUD_FADE_FAR` in
      `src/render/cloud-pass.ts`; verify unit tests that at a canvas of 1280 by 720 CSS
      pixels one record passes the floor at 60,000 light years and takes weight 0, and
      that the weight is 1 at 10, at 2,000 and at 12,000
- [x] 2.7 Verify by unit test that the pass draws no instance and issues no draw call when
      the zoom weight is 0, so the default view and the close view cost nothing
- [x] 2.8 Sort the selected records from furthest to nearest; verify a unit test on a set
      whose input order is deliberately wrong
- [x] 2.9 Add the close fade, full at three times the record's radius and zero at one
      times; verify a unit test that a camera at the record's centre gives weight 0 and a
      camera at three radii gives weight 1
- [x] 2.9a Add the size fade, full at and below a quarter of the canvas height of
      apparent radius and zero at three times that, reading the uncapped radius, and
      multiply it with the close fade; move the drawn cap out to the size the fade has
      already taken to 0, so a sprite never stops growing while it can still be seen;
      verify unit tests of both edges, of the smooth step between them and of the
      multiplied fade the selection carries
- [x] 2.9b Fade both cuts, so no record enters or leaves the frame with weight. The
      floor fade is 0 at the size floor and 1 at twice it. The budget fade is 0 at the
      apparent size of the largest record the budget dropped and 1 at 1.25 times that
      size, and 1 where the budget dropped none. Verify unit tests of both edges of each
      fade, and a camera turn of 360 degrees over the records near `-4000, 998, 12500`
      in which no record is added or dropped with a fade above 0.05
- [x] 2.9c Attach the records and the atlas after the frame loop runs, and do not wait
      for either in the start chain. Close the decoded atlas on every path, including the
      one where the records fail and the atlas arrives. Expose whether the pair reached
      the renderer, so a test waits for it rather than racing the start. Verify a browser
      test that holds the atlas request open and never answers it: the map still starts
      and the pass reports 0 drawn and 0 calls
- [x] 2.9d Raise `NEBULA_MAX_DRAWN` from 32 to 256 and record why in the constant, the
      spec and the design. The fade band did not settle the second report, of the record
      near `-4813, 583, 10617`: at that view the cut of a 32 budget moves between 6.5 and
      9.6 pixels as the camera turns, which is wider than the band, so a record of 8
      pixels still went out. The size floor admits at most 184 records on a canvas 1,080
      CSS pixels tall and 225 on one of 2,160, so 256 takes the cut off this file. Verify
      the frame budget still holds, a unit sweep over both reported views in which nothing
      leaves the frame with weight, and a unit sweep over a crowded set that does reach
      the budget
- [x] 2.9e Add a unit test that sweeps the committed file over a camera at each record, a
      1,000 light year grid over the disc and a 100 light year grid over the core, and
      holds the largest count the floor lets through: 184 on a canvas of 1,080 CSS pixels
      and 225 on one of 2,160, both under the budget. The first figures written, 182 and
      223, came from a random sample that missed the peak
- [x] 2.9f Add `src/scene-data/nebulae.json` to `.prettierignore`, beside the other
      committed data. A fixture holds the SHA-256 of its bytes, so a format on save would
      break the fixture
- [x] 2.9g Give every tile a plain English name, and drop the `format` key. 15 of the 34
      tile names read as asset identifiers rather than as names of a thing, one of them
      with a spelling mistake. They are now `Bright cloud 1` to `6`, `Dark cloud 1` to
      `5` and `Planetary shell 1` to `4`, in the same order, so no tile index moves. The
      `format` key held a version string that no second version will ever answer: the
      tile count and the record fields are what tell this file from another one, and
      `buildNebulaSet` already refuses a file that fails them. Update the SHA-256 fixture
      and the recorded byte count, 14,626

- [x] 2.10 Confirm `src/scene-data/` still imports nothing from `src/render/`; verify
      `pnpm lint` passes with the `no-restricted-imports` rule unchanged

## 3. The pass

- [x] 3.1 Add the atlas texture to `src/render/buffers.ts`, fetched as
      `./nebula-art.webp?url&no-inline` and uploaded as `SRGB8_ALPHA8` with linear
      filtering and clamped wrapping; verify a unit test on the created texture's
      internal format and parameters
- [x] 3.2 Add `src/render/shaders/nebulae.vert` and `nebulae.frag`: an instanced
      screen-aligned quad, the tile lookup with the half-texel inset
      `src/render/shaders/clouds.vert` already uses, and the brightness constant applied
      to the colour channels only; verify the shaders compile in the context test
- [x] 3.3 Add `src/render/nebula-pass.ts` drawing all selected instances in one call with
      `blendFunc(ONE, ONE_MINUS_SRC_ALPHA)`; verify a unit test that the pass reports one
      draw call and sets that blend function
- [x] 3.4 Verify by unit test that doubling the brightness constant doubles the colour the
      pass sends per sprite and leaves the alpha unchanged

- [x] 3.9 Negate y in the tile lookup of `src/render/shaders/nebulae.vert`. The atlas
      uploads with no flip, so texture row 0 holds the top row of the file, and the old
      lookup put that row at the bottom of the sprite and drew every tile upside down.
      Verify a browser test that reads the light a block loses above and below the middle
      of one dark sprite; check it fails on the old lookup
- [x] 3.10 Collapse the quad in the vertex shader where the weight is 0, as the cloud
      shader does at its cap. A record at weight 0 is one the camera sits inside or one
      the size fade has taken out, and both reach the cap, so the frame laid a capped
      sprite of fragments that changed nothing
- [x] 3.11 Delete the nebula program in the renderer's dispose, beside the other twelve.
      A host that mounts and unmounts the map leaked one linked program and its two
      shaders on every cycle
- [x] 3.12 Create the atlas texture before the old pass is disposed in `setNebulae`, and
      throw `NebulaError` from the atlas loader and its two shape checks. A second call
      with a bad atlas threw between the dispose and the assignment, which left the frame
      drawing through a freed vertex array. The record half already throws that type

- [x] 3.13 Hold the range at 1 light year in the selection, as the vertex shader does.
      104 records carry a radius under 1 light year, so a camera that flies into one read
      twice the size the shader drew. Verify a unit test of a record of 0.1 light years at
      half a light year
## 4. Wiring

- [x] 4.1 Add `nebulae` to `PassSwitches` and draw the pass into the half-resolution
      target after the cloud sprites; verify a browser test at a view inside the band that
      the frame with the switch on differs from the frame with it off, and that the frame
      with it off matches a capture taken in the same run with the pass never enabled
- [x] 4.2 Add `passes.nebulae` to the glow guard in `src/render/renderer.ts`, so the glow
      runs when the nebulae drew and the volume and the clouds did not; verify the browser
      test in task 5.5
- [x] 4.3 Add the nebula brightness to `LookSettings` beside the cloud brightness; verify
      a unit test that the renderer takes and returns the value. `src/app/create-map.ts`
      needed no edit: `get look()` gives back `renderer.look` by reference, so the new
      field reaches the handle without one
- [x] 4.4 Expose the drawn instance count and the draw-call count from the pass, as the
      shape pass does; verify a unit test reads both

## 5. Browser tests

Run one Playwright run at a time: a second run stops the first one's preview server.

- [x] 5.1 Verify the pinned baseline image of the default view at 60,000 light years is
      unchanged with the nebula pass on
- [x] 5.2 Verify a dark nebula lowers the luminance at the centre of its sprite, and a
      bright nebula raises the luminance at its brightest pixel, each against the same
      pixel with the pass off
- [x] 5.3 Verify a view inside the zoom band reports one draw call and a drawn count
      above 60 and at most 256. The view holds about 122 records above the floor on the
      720 pixel canvas of the test, so the budget cuts nothing there
- [x] 5.4 Verify a camera at the centre of a nebula, at a zoom distance inside the band,
      sees no light from it, and that the same record ahead of the camera at three radii
      does contribute
- [x] 5.4a Verify a close zoom draws the nebulae, and that one record's contribution
      falls as the camera closes on it from three radii to 1.2
- [x] 5.5 Verify the glow reads the nebulae: a view drawing a bright nebula with the
      volume and the cloud switches off has a halo that the same view with the glow off
      does not
- [x] 5.6 Run `e2e/frame-budget.spec.ts` with the nebula pass on; verify every returned
      mean is under 16.7 ms and record the readings at 12,000, 20,000 and 30,000 light
      years in this file. Add no second timing test: that spec already runs in a pass of
      its own, and a new file would take its readings under six parallel workers.
      Readings at 1920 by 1080, mean of 300 frames: from the cursor at Sol, 3.485 ms at
      12,000, 2.930 ms at 20,000 and 2.206 ms at 30,000; from the galactic centre,
      2.893 ms, 3.527 ms and 3.727 ms. All 21 tests of the spec pass. A reading is one
      sample of a loaded machine and not a pin: a later run of the same test on an idle
      machine read 1.431 ms, 1.330 ms and 1.083 ms, and 1.314 ms, 1.397 ms and 1.332 ms.
      The bound of 16.7 ms is what the test holds, and both sets are far under it
- [x] 5.7 Run the `close-view-stars` browser tests; verify the whole-frame luminance
      scenario at `#c=0,0,0&d=2000&p=35&y=0` is unchanged. The nebulae now draw at 2,000
      light years, and the scenario compares two readings that both hold them, so the
      same nebula light is in both
- [x] 5.8 Audit every browser test that reads frame light at a zoom distance below 20,000
      light years. "The bulge has a soft top" reads 25,000, where the band is closed, and
      the `nebulae: false` in its `setPasses` states that rather than changing it. Check
      "the sum of the sprites stays bounded" at 12,000. Do not widen a band an existing
      test states: verify each test passes with its stated limits unchanged
- [x] 5.8a Switch the nebulae off in the three readings of `e2e/stars.spec.ts` that read
      an absolute pixel value at 500 light years. The band has no near end, so 135 sprites
      draw there and one bright sprite takes the difference between the brightest pixel
      and the corners to 0.14003 against a bound of 0.01
- [x] 5.8b Write a `close-view-stars` delta for the two scenarios that name the switch
      list and state an absolute difference, and for the paragraph that gives the reason
      for the region switch. A test that needs a switch the scenario does not name is a
      spec the change has moved, not a test detail. The grain reading divides by the mean
      of its own block, so it is not in the delta
- [x] 5.9 Pin the brightness constant: verify a named view's nebula luminance stays inside
      a stated band, so a later change to the constant fails a test. The constant is 8,
      set by eye: at the starting value of 2 a bright nebula reads as almost nothing, and
      at 16 the edge of the sprite quad shows. The view over Barnard's Loop adds 0.0557 to
      the mean luminance of a 24 pixel block, and the band is 0.04 to 0.07

## 6. Documentation

- [x] 6.1 Take the deleted `docs/roadmap.md` out of `AGENTS.md` and `README.md`; verify
      neither file still sends a reader to it. The owner deleted the roadmap during this
      change, and both files named it. Two main specs still name the roadmap as the
      source of a measured figure, at `openspec/specs/close-view-stars/spec.md` 150 and
      `openspec/specs/real-systems/spec.md` 974. A main spec changes through a delta, so
      this change leaves them and reports them
- [x] 6.1a Name the roadmap deletion in the Impact of `proposal.md`, so a reader of the
      proposal against the diff does not meet 1,327 deleted lines the proposal never
      mentions
- [x] 6.2 Add the nebula records and the atlas to `THIRD_PARTY_NOTICES.md` with their
      terms, and add both to the list `tests/third-party-notices.test.ts` checks; verify
      the test fails when a name is missing from the notices file

## 7. Before review

- [x] 7.1 Move `ENTRY_CHUNK_LIMIT` in `tests/main-bundle.test.ts` to **270,000** and add
      an entry to the comment block above it with the new reading and the reason; verify
      the test passes and that the new reading leaves room under the bound. The reading is
      266,996 bytes, above the 260,000 the proposal planned, so the bound is the next
      round figure above the reading and leaves 3,004 bytes of room
- [x] 7.1a Take the entry chunk reading again, after the last edit of a `.vert`, a
      `.frag` or a `.glsl` file. The first reading of 265,501 bytes was taken before the
      budget raise and the shader comments that came with it, so it was 1,565 bytes under
      the tree it described
- [x] 7.2 Run `pnpm lint`, `pnpm test` and `pnpm test:e2e`; verify all three pass and
      paste the failing output in the change if any does not. All three pass: lint clean,
      1,018 unit tests in 72 files, and 502 browser tests in the parallel pass with 57 in
      the timed pass. The frame budget draws up to 178 sprites at 0.818 ms, against the
      16.7 ms bound
- [x] 7.3 Run the implementation review gate with the `openspec-implementation-reviewer`
      subagent and act on its verdict; verify the verdict is recorded before any human
      sees the work. The gate ran eight times. The last run returned APPROVE WITH NOTES
      with four notes, and all four are acted on: the one art-slot identifier left in
      task 1.2a, the word "source" in the `tileNames` comment, the dark scenario that
      still said "the same pixel" where the test reads a block mean, and the two browser
      test comments that called record 154 a dark record after the tile rename. Earlier
      runs raised the stale entry chunk reading, the throw window in `setNebulae`, the
      missing range clamp, the unasserted claim in the budget test and the roadmap
      deletion the proposal did not name
