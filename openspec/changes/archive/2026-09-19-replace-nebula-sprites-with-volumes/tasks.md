## 1. Hold the spike and bring in the art

- [x] 1.1 **Keep the spike.** `public/spike/`, `spike/`, `src/render/spike-blocks.ts`,
      `src/render/spike-nebula-pass.ts`, the two `spike-nebula` shaders and the `SPIKE` block
      in `src/render/renderer.ts` stay in the tree through groups 2 to 5. They are the
      reference the new pass is measured against: the spike marches a known asset with a known
      rotation and a known light gain, so an A/B against it tells a decode fault from a march
      fault from a rotation fault. Task 6.3a deletes it.
- [x] 1.1a **The spike's own files are never staged.** They are untracked today and stay
      untracked until task 6.3a deletes them. Their file names and the first line of
      `spike/march-check.mjs` carry names from another source. A commit that swept them in
      would write those names into history, where task 6.3a's delete cannot reach. Every `git add` in
      this change names its paths, never a bare `-A`.
- [x] 1.1b **Nothing is committed before task 6.3a.** The `SPIKE` block is a different case:
      66 lines of an already tracked file, `src/render/renderer.ts`, which tasks 4.5 and 5.0
      both edit before 6.3a runs. Staging that file stages the block with the work, so naming
      paths cannot keep it out. Worse, such a commit does not build: the block value-imports
      the untracked `./spike-nebula-pass`, so `tsc --noEmit` fails for anyone who checks it
      out. The change lands as one commit after task 6.3a, which is what design.md's "Rollback
      is the revert of one commit" assumes.
- [x] 1.1c **What holding it costs, measured.** With the spike in the tree `pnpm build` writes
      `dist/index.js` at **264,726 bytes** against `ENTRY_CHUNK_LIMIT` of 260,000, and the pair
      reads 270,249 where the tree reads 259,599 — the spike costs 10,650 bytes. Both are
      readings, not bounds; the only bound is the 260,000 on `index.js` alone. So
      `tests/main-bundle.test.ts` is **red from here until task 6.3a**, with an assertion
      message that blames a main-thread import of `region-lines.ts` and points at the wrong
      module. **Do not raise the bound.** It is the guard `library-package` and task 6.8 rest
      on. Until task 6.3a verify with `pnpm exec vitest run src` and the named test files, not
      with `pnpm test`. Three readings tell an expected red from a new one:
      `vitest run src` is **61 files and 905 tests, all green**; `vitest run tests` is **17
      files and 189 tests with one failure**, the bundle one; `pnpm test` is the 78 and the
      1,094 together.
- [x] 1.2 Copy the **33** low volume assets the records reach, their transfer tables and
      their index into `src/render/nebula-art/`. Six of the source set's 39 are reached by no
      record and are left out. Name the files by the convention the stripped index implies and
      the loader writes: `<name>-density.dds`, `<name>-colour.dds`, one `transfer.bin` and one **`nebula-volumes.json`**
      — name the index, and name it nebula-shaped: Vite emits assets as
      `assets/[name]-[hash][extname]`, so an `index.json` would emit as `assets/index-<hash>.json`,
      which task 5.1a's watcher pattern could never find.
      Rename every file and every index entry to the library's own kebab-case name in this
      step, so no name from another source lands in the tree. Verify the directory holds 66 `.dds` files,
      one `transfer.bin` of exactly 135,168 bytes and one `nebula-volumes.json`, and that every
      name is in the design's table.

      **The owner supplies the input at implementation time**: the input directory for this
                                                  task, the regenerated record file task 2.1 needs, and the two CPU fixtures task 7.1
                                                  commits. None of the three is in the tree, no repository file names a source for them,
                                                  and no script here produces them. Stop and ask rather than guess a path.

- [x] 1.2a Strip the index to what the map reads. It keeps **two** top-level keys: `assets`,
      an ordered list, and `transfer: { sha256 }`, the digest of `transfer.bin` — the only
      guard on 135,168 bytes of extinction data that the -193.5 and 3,066 readings and the
      no-clamp decision all rest on. Each entry keeps **four** keys: `name`,
      `density: { size, sha256 }`, `colour: { size, sha256 }` and
      `error: { per_axis: { x, y, z } }` as emission RMSE over peak.

- [x] 1.2b Check that no name from another source survives. Run
      `git add -- src/render/nebula-art src/scene-data/nebulae.json`, then
      `git grep -nE "[A-Za-z]+_[A-Za-z]+_[0-9]|_Low\b|_Med\b|_High\b" -- src/render/nebula-art src/scene-data/nebulae.json`
      and confirm it returns nothing. The pattern is the **name shape** the spec's scenario
      names, so this task file carries no such name of its own. Cross-check the result against
      the design's name table: every asset name in the index must appear in it, and the table
      is the whole of the allowed set. Stage those two paths and no more: untracked files are
      invisible to `git grep`, and a bare `git add -A` would stage the spike, whose file names
      carry names from another source.
- [x] 1.2c Add the unit test that checks the two names the spec's scenarios argue from. Read
      `transfer.bin` as 33 by 256 by 4 `float32` in the index's asset order. Assert the asset
      holding the largest extinction is `dark-02` at 3,066, and the one holding the largest
      negative extinction is `cats-eye` at -193.5. Without this the scenarios **The step rate
      trades cost for nothing visible** and **The march reproduces the reference integral**
      argue from properties nothing verifies, and a wrong name would ship in silence. If a
      reading lands on a different asset, move the **name** in the spec, the design and this
      file — not the test.
- [x] 1.2d Add `src/render/nebula-art/` to `.prettierignore`, beside
      `src/scene-data/nebulae.json`. The index is committed data whose byte size task 3.3
      counts, and `pnpm format` would rewrite it and shift the reading.
- [x] 1.2e Add the unit test covering **Every asset name is the library's own**: read the 33
      names from the index and assert each is kebab-case, distinct, and not of the
      `Word_Word_NN` shape.
- [x] 1.3 Record the SHA-256 of each of the 66 volumes in its entry, and of `transfer.bin` in
      the index's second top-level key. The index cannot hash itself, so write its own
      SHA-256 into `tests/fixtures/nebulae.json` beside `records_sha256`, where
      `atlas_sha256` sat — task 2.3 deletes that key and this replaces it. Verify a unit test
      hashes all 67 other files against the index and the index against the fixture, covering
      **The assets do not drift**. Add the matching field to the `NebulaFixture` interface at
      `src/scene-data/nebulae.test.ts` lines 38 to 45, whose three art fields task 2.0b deletes.
      The hashing test reads the index with `readFileSync` and does not import it, for the reason
      task 2.4 spells out: `eslint.config.js` line 104 stops `src/scene-data/**/*.ts` importing
      `src/render/` and carries no `**/*.test.ts` exemption.
- [x] 1.4 Add a unit test that reads the per-axis compaction error of all 33 assets and
      asserts every figure is at most 0.03, covering **The compaction error holds on every
      axis**.

## 2. Regenerate the record set

- [x] 2.0 Delete or rewrite every test that names a tile or the atlas. In
      `src/scene-data/nebulae.test.ts`: the whole `the committed nebula atlas` block, `hold 358
  records, with a radius, a tile and a finite position each`, `name every one of the 34
  tiles`, `refuses a tile index outside the atlas`, `refuses a file that names the wrong
  number of tiles` — whose comment says the tile count is what tells a nebula record file
      from another file, and whose successor check is the record shape and a non-negative whole
      asset index — and `hold no field a reader can derive` at lines 103 to 105, which asserts
      the file keys are exactly `['records', 'tiles']`. In `e2e/nebulae.spec.ts`: `no tile of the
  atlas bleeds into its neighbour` and `a sprite draws its tile the same way up as the file`.
- [x] 2.0a Fourteen fixtures pass a `tiles:` key and all of them change: eleven in
      `src/scene-data/nebulae.test.ts`, two in `src/render/nebula-pass.test.ts` and one in
      `src/render/renderer.test.ts` — `oneNebula()` at lines 425 to 429, which builds a 34-name
      array and a six-field record. `renderer.test.ts` stays red from task 2.2 until task 4.4a
      repairs it, which is expected.
- [x] 2.0b **Delete every constant these deletions orphan, here and not later.** An unused
      module-level constant is an ESLint **error**, and tasks 2.1a, 5.0, 6.1 and 6.2 all verify
      `pnpm lint`, so one left behind is a red build and not a deferred tidy. In
      `e2e/nebulae.spec.ts`: `TILE_UP_VIEW` (line 54, used only at 311), `atlasPath` (30),
      `ATLAS_COLUMNS` (35), `ATLAS_TILE_SIDE` (36) and `TILE_COUNT` (37), whose only uses are at
      158, 198, 203, 204 and 207 inside the tile-bleed test. In `src/scene-data/nebulae.test.ts`:
      `atlasPath` (33) and `atlasBytes` (49), used only inside the block task 2.0 deletes, and
      the `NebulaFixture` fields `tile_count`, `atlas_sha256` and `atlas_bytes` (42 to 44), which
      task 2.3 removes from the fixture. `atlasBytes` is the urgent one: it is a module-level
      `readFileSync` of `nebula-art.webp`, so once task 6.7 deletes that file it throws at import
      and takes all of that file's tests down. Verify `pnpm exec vitest run src` reports no
      failure from a missing atlas, and `pnpm lint` passes. Not `pnpm test`: task 1.1c records
      why the bundle test is red until task 6.3a.
- [x] 2.1 Regenerate `src/scene-data/nebulae.json` from the file task 1.2 says the owner
      supplies: join the asset index and the three
      rotation angles onto each record, drop the tile index and drop the `tiles` name list.
      Add **no** list of its own: the asset names live in the volume index alone, so the two
      files cannot fall out of step. Verify the file holds 358 records, no `tile` field and no name list, that task 1.2b's
      name-shape sweep run again over `src/scene-data/nebulae.json` returns nothing — 1.2b
      swept the file this task replaces, not the one built from the owner's input — and that the unit test covering **The loader refuses a file that is not a
      record set** passes.
- [x] 2.1a Delete `NEBULA_TILE_COUNT` at `src/scene-data/nebulae.ts` line 19 and the two
      checks that read it, and replace it with **nothing**. The loader's new refusal is the
      record shape and a non-negative whole asset index; it holds no asset count. A constant of
      33 in the data layer would be a second source of truth for the art and would break "a
      repacked set is a drop-in", and `eslint.config.js` line 104 stops that layer reading
      the index anyway. Passing the count in at load is out too: `NebulaSource.loadSet()` takes
      no argument (`src/render/nebula-slot.ts` line 110) and `src/app/create-map.ts` line 1433
      runs it **in parallel** with the art load, so a count argument would put the record parse
      behind the index fetch and change the loader shape the design keeps. Task 2.4's unit test
      is what pairs the two files, at build time, over the committed data. Verify `pnpm lint`
      passes and the scenario **The loader refuses a file that is not a record set** passes.
- [x] 2.2 Update the record type and loader in `src/scene-data/nebulae.ts`. Verify the unit
      test covering **The set loads whole** passes: 358 records, radii above 0 and at most
      200, asset indexes 0 to 32, rotations of three finite numbers.
- [x] 2.3 Update `tests/fixtures/nebulae.json`: write the new `records_sha256` and
      `records_bytes`, and **delete `tile_count`, `atlas_sha256` and `atlas_bytes`**, which
      name art the tree no longer holds. Task 1.3 adds the volume index's digest in
      `atlas_sha256`'s place. The asset digests go in the volume index, under task
      1.3, not here. Verify the test covering **The records do not drift** passes and the
      fixture holds four keys: the two record ones, `record_count` and the index digest.
- [x] 2.4 Add a unit test that every asset index names an asset the set holds and every one
      of the 33 assets is named by at least one record, covering **Every record names an
      asset the set holds**. Two records that resolve to the same asset are expected: two
      templates share `bright-02`. The test reads the volume index with `readFileSync` and
      does **not** import it: `eslint.config.js` line 104 stops `src/scene-data/**/*.ts`
      importing `src/render/` and carries no `**/*.test.ts` exemption.
- [x] 2.5 Add a unit test that reads the five records carrying a rotation and asserts each
      is three finite radians and the file holds no matrix, covering **The record file
      holds the raw angles**.

## 3. Decode and upload the volumes

- [x] 3.0 Rename `src/render/nebula-atlas.ts` to `src/render/nebula-volumes.ts` in the
      `ignores` list of `eslint.config.js`, at line 200, **before** the module exists. The
      exemption is what lets that one module value-import `NebulaError` from
      `../scene-data/nebulae`, which task 3.4 gives the new loader as it gives the old one.
      Without it `pnpm lint` fails from task 3.1 onward, and the first task that would notice
      is 5.0, two groups later. Check it now:
      `printf "import { NebulaError } from '../scene-data/nebulae';\nexport const x = NebulaError;\n" | pnpm exec eslint --stdin --stdin-filename src/render/nebula-volumes.ts`
      reports no error. The `nebulaImportGroups` half of the rename stays in task 6.2, because
      it names the module the renderer may not reach and nothing reaches it until task 6.3.
- [x] 3.1 Write `src/render/nebula-volumes.ts` with a `BC4_UNORM` and a `BC1_UNORM` decoder.
      Verify unit tests decode a hand-built block of each format against expected texels,
      including the `c0 > c1` and `c0 <= c1` branches of BC1 and both interpolation modes
      of BC4.
- [x] 3.1a Give the assets their URLs. Add one
      `import.meta.glob('./nebula-art/*', { query: '?url&no-inline', eager: true })` in
      `src/render/nebula-volumes.ts`, which yields a URL for each of the 66 volume files and
      the transfer file and the index. That module holds the fetch and the decode and is reachable from
      `src/nebulae/` alone, so the ESLint boundary rule of task 6.2 covers the glob. `no-inline` goes on **all 68**, not only on the small ones: the
      library build, `vite.config.lib.ts`, inlines every asset as a data URI whatever its
      size, which is why `nebula-atlas.ts` line 12, `scene-data/nebulae.ts`,
      `galaxy-model/detail.ts` and `hud/styles.ts` all carry the flag today with the same
      comment. Without it about 2.64 MiB, or 3.6 MiB as base64, lands in
      `dist/nebulae.js`, which no test bounds; it does not reach `dist/index.js`, which holds
      no nebula module, so task 6.8's bound would not react to a missing flag. The demo build's 4,096-byte default would also inline the 28
      colour volumes of 404 and 2,196 bytes. Pass `import: 'default'` to the glob, or unwrap
      it: with `eager: true` each entry is a module namespace of `{ default: url }`, not a
      URL. Verify here that a unit test reads 68 entries from the glob. The
      `dist/` check waits for task 6.3: Vite emits an asset from the transform hook of a module
      the build **reaches**, and nothing imports `nebula-volumes.ts` until the subpath is
      repointed, so at this point the build emits none of the 68. Use `grep`, not `git grep`: `dist/` is ignored, so
      `git grep` would search none of it and pass in silence.
      It lands **here, in group 3**, and not beside the package work: the module that fetches
      the assets is written in this group and cannot be written against URLs it does not have.
      The atlas and the volume set coexist in a build until task 6.7, so nothing forces it to
      wait.

- [x] 3.2 Add the fetch, decode and upload path: one `R8` and one `RGBA8` 3D texture per
      asset, plus one `RGBA32F` transfer table of 256 entries sliced from the single binary
      transfer file at `asset * 4096` bytes, all sides read from the index. Verify the unit test covering **The sides come from the file and not from the
      code** passes with a 16 cubed density and a 4 cubed colour.
- [x] 3.3 Add a unit test summing the three totals of the 33 assets against their separate
      bounds: 1.3 MiB **brotli at the default quality**, 3.0 MiB on disk read from the files
      themselves, and
      6.5 MiB decoded computed from the sides. Covering **The set holds its budget**. The
      committed readings are 1.10, **2.78** and 6.03 MiB. The on-disk reading counts every
      file the set serves: the 66 `.dds` volumes are 2.64 MiB, and the transfer file and the
      index carry the rest. The decoded total counts the 33 transfer tables (132 KiB) as well
      as the volumes.
- [x] 3.4 Add the typed error and the console report for a failed fetch or an unparsable
      asset. Verify a unit test makes a fetch fail and a frame drawn after it holds no
      nebula and draws every other pass.

## 4. The marched box pass

- [x] 4.0 Rewrite `src/render/nebula-pass.test.ts`, 623 lines that import `nebula-atlas`
      and `NEBULA_MAX_DRAWN`. Write it **first**, so the pass is built against a live test
      rather than a dead one. It does not compile until task 4.4 lands the new signature, so
      verify there and not here.
      The unit tests that tasks 4.1, 4.2 and 4.3 verify live in **their own new files** beside
      the shaders they check, not in `nebula-pass.test.ts`, which does not compile until 4.4.
- [x] 4.1 Replace the nebula vertex shader: emit a cube of **12 wound triangles** at twice
      the record's radius, and pass the object-space position and the camera's object-space
      position to the fragment stage. Verify a unit test asserts the buffer holds 36
      vertices and that every face's winding is counter-clockwise seen from outside.
      **Name the varying `vMarchObject`, and name the transfer sampler `uNebulaTransfer`.**
      Two things read those names and neither may collide with the spike, which is still in the
      tree until task 6.3a: `tests/main-bundle.test.ts`'s `NEBULA_SHADER_TERM` needle, which
      task 6.7a repoints, and `scenePassOf` in `renderer.test.ts`, which task 4.4a repoints.
      `src/render/shaders/spike-nebula.frag` already declares `vObject`, `vEyeObject`,
      `uDensity`, `uColour`, `uTransfer`, `uSteps`, `uLight` and `uRotation`, and the spike's
      text sits in `dist/index.js` until 6.3a, so a needle taken from that list would match the
      spike and fail the bundle scenarios for a leak that is not there.
- [x] 4.2 Write the fragment march: slab test against the unit cube with the near end
      clamped at 0, the volume integral, early exit below 0.01 transmittance, at most 256
      steps, premultiplied output. Verify a unit test drives the integral on a known density
      and transfer pair and matches a hand-computed result.
- [x] 4.3 Add the `Rx(a) · Ry(b) · Rz(c)` matrix build with the world-z flip, behind one
      named exported constant. Verify unit tests covering **A record with no rotation draws
      the flip alone** and **The rotation reaches the march** pass.
- [x] 4.4 Land the new pass signature and set the pass state. `createNebulaPass` at
      `src/render/nebula-pass.ts` line 113 takes `(gl, program, set, atlasTexture)`; it takes a
      volume set instead, and `src/nebulae/index.ts` line 46 follows. Delete
      `writeNebulaInstances` and `NEBULA_INSTANCE_FLOATS`, which one draw call per record
      kills. Set front-face culling, `ONE, ONE_MINUS_SRC_ALPHA`, and draw from the furthest to
      the nearest. Verify the whole of task 4.0's rewritten `src/render/nebula-pass.test.ts`
      compiles and passes here — that is the verification 4.0 defers — including the unit test
      covering **The order runs from the furthest to the nearest**.
- [x] 4.4a Rewrite the atlas scaffolding of `src/render/renderer.test.ts`, which imports
      `NebulaAtlasImage` at line 3 and `createNebulaAtlasTexture` at line 11 and builds an
      atlas at lines 433, 434 and 462, and builds a 34-name `tiles:` array in `oneNebula()` at
      lines 425 to 429. Repoint `scenePassOf` at lines 466 to 473 as well: it
      names the nebula pass by `uAtlasSide`, which tasks 4.1 and 4.2 delete, and the nebula
      program keeps `uAbsorption`, so the classifier would answer `volume` for it. Pick a
      uniform the new nebula program alone carries — the transfer sampler or the step rate —
      and test it **before** the `uAbsorption` branch. Use the name task 4.1 fixes, not one the
      spike shaders already carry. Verify with a positive control:
      `expect(order).toEqual(['volume', 'clouds', 'nebulae'])` on a frame that draws all
      three. That control already exists at line 510 — repoint it, do not add a second — and it is
      what stops the **three** `not.toContain('nebulae')` assertions at lines 545, 563 and 578
      passing for the wrong reason. Only task 6.7's grep would otherwise catch it, at the
      end of section 6. Verify the test builds a volume set instead and passes.
- [x] 4.5 Widen the one brightness dial to a light gain of three values and add the step
      rate. Both are `LookSettings` fields in `src/render/renderer.ts`, seeded there and read
      into the frame there, with their defaults on `nebula-slot.ts`; the defaults are
      `8.66, 8.44, 8.07` and `32`, the first fitted on the spike against the sprite it
      replaces. Update `src/render/renderer.test.ts`, which asserts `nebulaBrightness`.
      Verify the unit test covering **Brightness scales the colour alone** passes. Use the
      name "light gain" throughout and do not carry both names.
- [x] 4.6 Keep the per-record extinction march in the vertex stage, reading the shared rule.
      Verify the unit tests covering **The extinction rule is written once**, **Every vertex
      of a record reaches the same transmittance** and **No volume gives no attenuation**
      pass, and that **The vertex stage carries the volume sampler** still links.
- [x] 4.6a Measure the vertex stage's share of the pass cost, at a frame of many small
      records and at a frame of one large one. If it is above a tenth of the pass, add the
      one-vertex pre-pass the design describes and re-measure. Record the reading either
      way. **Recorded, and the tenth is not answerable with this instrument.** Chrome
      clamps `performance.now()` to 100 microseconds and the march is about 40 of them on a
      0.64 ms frame, so the pooled share over 540 frames of each condition still moves from
      -1.5 to +6.8 percent run to run. `e2e/nebula-cost.spec.ts` gates at a quarter instead
      and `design.md` names the three ways to close the question.
- [x] 4.7 Confirm the march applies **no upper clamp** to the transmittance. Add the unit
      test covering **The output alpha stays in range on every asset**: march all 33 assets
      at 25, 32 and 64 steps per unit and assert every output alpha is from 0 to 1. Five
      assets raise the transmittance above 1 by design, reaching 6.0 on `cats-eye`.

## 5. Selection, budget and fades

- [x] 5.0 Add `canvasWidthCss` to `NebulaViewInput` in `src/scene-data/nebulae.ts`, beside
      the `canvasHeightCss` it carries today. One screen area is the product of the two. The
      field crosses two hops, not one: `selectNebulae` is called from
      `src/render/nebula-pass.ts` lines 172 to 173, which reads `frame.canvasHeightCss`, so
      `NebulaFrame` in `src/render/nebula-slot.ts` gains the width beside its height, and
      `src/render/renderer.ts` line 632 seeds it. That number is read against the tree with the
      spike in it, which is the tree this task runs on, so it holds; task 6.3a shifts it up 19
      lines afterwards. Do not read `targetSize`: it is the
      half-resolution target and the size rules are in CSS pixels. Verify `pnpm lint`,
      `src/scene-data/nebulae.test.ts` and `src/render/nebula-slot.test.ts` pass.
- [x] 5.1 Replace `NEBULA_MAX_DRAWN` with the covered-area accumulation: sort by apparent
      size, accumulate **the lesser of each record's disc and one screen area** in CSS
      pixels, stop at 4 screen areas. The cap is the point: `nebulae.ts` divides by
      `NEBULA_MIN_RANGE_LY` of 1, so a camera at a record's centre gives an apparent radius
      of about 187,000 CSS pixels at the project's 60 degree field of view, and an uncapped disc
      would be about 53,000 screen areas
      and would drop every other record. Do **not** project the record or intersect with the
      viewport: the selection holds no view direction and no projection, and the figure is a
      bound over every direction the camera could face. Verify the unit tests covering
      **The budget cuts a file that reaches it** and **A near view holds the budget** pass,
      the second with a dropped-record count of 0.
- [x] 5.1a Repoint the asset-finding machinery of `e2e/nebulae.spec.ts`, which no other task
      names and which fails silently rather than loudly. Line 628 holds
      `const NEBULA_FILES = /nebula[\w-]*\.(json|webp)/i;`, the filter behind
      `watchNebulaFiles()`; it still matches the built record file, so the record half of every
      `expect(asked).toEqual([])` keeps working, but the assets become hashed `.dds` files
      that it never sees, so the art half guards nothing. Line 459
      holds `page.route('**/nebula-art*', …)`, which would then intercept no request, so
      **A held fetch does not hold the map** would hold no fetch. Lines 30 to 37 hold
      `atlasPath`, `ATLAS_COLUMNS`, `ATLAS_TILE_SIDE` and `TILE_COUNT`, which task 2.0b has already
      deleted — confirm rather than repeat. Repoint the regex at
      the index, the transfer file and the `.dds` set, repoint the route glob at a volume asset,
      and delete the four constants. **Exclude `/spike/` from the new pattern.**
      `src/render/renderer.ts` line 899 runs `loadSpikeVolume` at every renderer creation, with
      no switch, and fetches `/spike/barnards.json` and two `.dds` files. Any pattern that
      matches `.dds` matches those too, and `a map with no nebula option downloads neither
file` builds a second map after installing the watcher, so its `expect(asked).toEqual([])`
      would fail. Today's pattern misses them only because it needs the `nebula` prefix. Drop
      the exclusion once task 6.3a has run, or leave it — it costs nothing. Verify with a **positive control**: the same watcher on a map that does
      ask for the nebulae reports the index, the transfer file and the volume requests, so the negative
      assertions of **A map with no nebula option fetches nothing** and **The host and the
      user turn the nebulae off and on** are known to be able to fail.
- [x] 5.1b Delete `e2e/nebulae.spec.ts`'s `a view inside the band draws every record above
the floor in one call`, which the one-call-per-record change makes false, and
      `the brightness constant stays where it was set`, which names the dial that becomes
      the three-value light gain. Also rewrite the comment at `e2e/frame-budget.spec.ts` lines 68
      to 74: line 72 names `NEBULA_MAX_DRAWN` and line 71 says the size floor admits at most
      184 records, which points at the doc block this change deletes. Re-measure the drawn-count floor of 178 at line 75,
      which the scenario **The march holds the frame budget** says this change writes into the
      test. The committed record file reads 179 records above the 1.5-pixel floor at Sol for
      0.042 screen areas covered, and a worst of 2.03 screen areas over every record centre as
      a camera, so the budget of 4 holds with about twice the headroom and 178 should survive.
      Write what you measure. Verify `git grep -n NEBULA_MAX_DRAWN -- e2e src` returns
      nothing.
- [x] 5.2 Keep the size floor at 1.5 CSS pixels, the floor fade and the budget fade. Verify
      the two 360-degree turn tests covering **No nebula pops in or out at the budget's
      cut** and **No nebula goes out at a reported view** pass.
- [x] 5.3 Delete `e2e/nebulae.spec.ts`'s `CLOSING_VIEWS` at line 92, `INSIDE_VIEW` at 67 and
      `OUTSIDE_VIEW` at 76 with the **two** tests that alone use them: `a nebula thins out as the
    camera closes on it` at line 376, which reads `CLOSING_VIEWS` at 388 to 390, and `the
    camera inside a nebula sees none of it` at line 400, which reads both views at 401 and 407. Tasks 7.5 and 7.6 write their replacements two groups later and choose their own
      views; leaving these behind is an unused-variable error and tasks 6.1 and 6.2 both verify
      `pnpm lint`. Delete the inside fade and the size fade with their constants, and delete the
      tests that assert them: `the size fade` and `the camera-inside fade` in
      `src/scene-data/nebulae.test.ts`, and `a nebula thins out as the camera closes on it`
      and `the camera inside a nebula sees none of it` in `e2e/nebulae.spec.ts`. Verify the
      unit test asserts a record's weight is a function of the zoom weight, the floor fade
      and the budget fade alone.
- [x] 5.4 Delete the drawn-radius cap and the `caps one sprite` test in
      `src/scene-data/nebulae.test.ts`. Verify the unit test covering **A near nebula keeps
      growing** passes with no clamp at either 400 or 2,000 CSS pixels.
- [x] 5.4a Verify the scenario **Size follows the record** still holds: a record of radius 200
      draws 400 light years across at every distance in the band. The size rule does not change,
      but the requirement that carries it is new, so it needs a named check rather than the
      assumption that an old test covers it.
- [x] 5.5 Keep the zoom band unchanged: 1 to 12,000 light years, 0 at and above 20,000.
      Verify the tests covering **A close view draws the nebulae**, **The nebulae appear in
      the band** and **The far end holds the far view** pass.

## 6. The seam and the package

- [x] 6.1 Update `src/render/nebula-slot.ts`: the types and look defaults the renderer
      reaches the nebulae through. Verify `src/render/renderer.ts` imports nothing else from
      the nebula set and `pnpm lint` passes.
- [x] 6.2 Rename `./nebula-atlas` to `./nebula-volumes` in **both** lists in
      `eslint.config.js`: the `nebulaImportGroups` entries with every path variant. Task 3.0
      already moved the `ignores` entry. Verify `pnpm lint` fails on a
      deliberate value import of `nebula-volumes` from `src/render/renderer.ts` and passes
      once it is removed.
- [x] 6.3 Update `src/nebulae/index.ts` so the subpath still exports one value carrying the
      whole set. It imports `../render/nebula-atlas` at lines 11 and 12 today; repoint it at
      `nebula-volumes.ts`. This is the task that puts the volume module in a build graph, so
      verify task 3.1a's deferred check here: each of the 68 named files is emitted separately
      into `dist/assets/` — not that `dist/assets/` holds 68 files, because it already holds
      nine others, the atlas among them until task 6.7 — and `grep -o "data:[a-z/+.-]*" dist/*.js | sort -u` lists no
      `data:application/octet-stream`. Verify `pnpm lint` passes here too, which task 3.0 is
      what makes possible. **The two bundle scenarios wait for task 6.3a**, so they are
      read once, on the final build. They would in fact pass here: `dist/index.js` carries the
      spike's `vObject`, `vEyeObject` and `uTransfer`, but no `.dds` name — the spike reads its
      file names from `barnards.json` at run time — and task 4.1 picks `vMarchObject` and
      `uNebulaTransfer`, which the spike does not carry, so none of task 6.7a's needles can
      match it. Rename the two exported type names that go with the module: `NebulaAtlasImage`
      and `NebulaAtlasTexture`, used at lines 11, 12, 25, 31, 41 and
      44 of the file this task rewrites. They may also survive in
      `src/render/renderer.test.ts` if task 4.4a left them. `src/render/nebula-pass.test.ts`
      needs no sweep: task 4.0 rewrites it whole and writes the final names. Task 6.7's grep
      matches the module path and would not catch a type name. Verify the bundle tests covering **A host bundle that does not ask carries
      nothing** and **A host bundle that asks carries all of it** pass.
- [x] 6.3a Now delete the spike, with the new pass green against it: `public/spike/`,
      `spike/shots/`, `src/render/spike-blocks.ts`, `src/render/spike-nebula-pass.ts`, the two
      `spike-nebula` shaders and the `SPIKE` block in `src/render/renderer.ts`. Delete `spike/` whole,
      including `march-check.mjs` and `block-decode.mjs`. They are not the generator task 7.1
      needs and must not be committed: `march-check.mjs` reads a reference file another tool
      produced, carries no exposure and no tone map, hard-codes a scratchpad path and a
      `node_modules` path, and names assets by names from another source. It goes after task 6.3 and not at the end of the change for two reasons. It verifies
      `pnpm build`, which starts with `tsc --noEmit`, and tasks 6.1 to 6.3 are what make the
      tree typecheck again after group 4 rewrites the pass. And `src/render/renderer.ts` imports `spike-nebula-pass`, so every
      spike file sits in the main entry graph and would inflate the chunk readings of tasks 6.7a and 6.8 and the whole-suite run of group 8. Verify
      `grep -rn "spike-nebula\|spike-blocks\|SPIKE_POSITION\|SPIKE_RADIUS\|__spikeNebula" src public`
      returns nothing, that `public/spike` and `spike` are gone, that the bundle tests covering
      **A host bundle that does not ask carries nothing** and **A host bundle that asks carries
      all of it** now pass — task 6.3 defers them here — and that `pnpm build`
      succeeds. Grep for the spike's own names, not for "spike": the word is also this
      project's name for the star glints in `src/render/system-pass.ts`. Use `grep`, not
      `git grep`: every spike file is untracked, so `git grep` would not see one that survived
      the delete.

- [x] 6.3b Add the browser test that starts the map with `WEBGL_compressed_texture_s3tc`,
      `EXT_texture_compression_rgtc` and `EXT_texture_compression_bptc` all refused, and
      asserts the nebulae load and draw, covering **The map needs no compressed-texture
      extension**.
      It sits here and not in group 3: it starts the whole map and asserts the nebulae load and
      draw, which needs the pass of group 4 and the subpath wiring of task 6.3.

- [x] 6.4 Rename the source member from `loadAtlas` to `loadVolumes` in
      `src/app/create-map.ts`: the readability check at the `typeof source.loadAtlas` guard,
      the `Promise.allSettled` load, the `createDraw` call and the option documentation that
      says "draws no sprite". Sweep the word "sprite" out of the **public** documentation as
      well, which ships in `index.d.ts` and is what a host reads: `areNebulaeVisible` and
      `setNebulaeVisible` (lines 634 and 641), `closeAtlas`, whose doc comment opens at line 337,
      `nebulaOcclusion` (line 387) and lines 1025, 1028 and 1548, and in `src/render/renderer.ts` lines 173,
      204, 228, 231, 356, 618, 625 and 634, whose `LookSettings` and debug handle ship in
      `dist/types`. Line 634 is the `spriteScale` on the nebula frame; 583, 601 and 608 are
      the cloud pass's and stay. More places say "atlas" or "one, or none" and carry no
      "sprite", so no other grep in this task list reaches them: `src/render/renderer.ts` lines
      237 and 957, and `src/render/global.ts` lines 48 and 50 — `renderer.ts` line 237 and
      `global.ts` line 48 say the pass issues "one, or none" draw calls, which one call per record makes false;
      `src/app/create-map.ts` line 408 and its `atlas` and `pendingAtlas` locals at 1030, 1426,
      1434 to 1450, 1553 to 1568 and 1867 to 1869; the `loadAtlas` spies of
      `src/app/create-map.test.ts` at 481, 486, 550, 551, 563, 582 and 597; and `e2e/helpers.ts` lines
      85 to 92 and 111 to 113, the doc comments of `waitForNebulae` and `settleNebulae`, which
      run in every browser test. Add `e2e/helpers.ts` and `e2e/nebulae.spec.ts` to the sprite grep
      as well as the atlas one; line 53 of `global.ts` says "sprite" and the sprite grep already
      covers it. `e2e/nebulae.spec.ts` still calls them sprites and tiles at about a dozen places the
      deletions of tasks 2.0, 5.1b and 5.3 do not reach — lines 57 to 59, 441, 483 to 488, 499,
      570, 600, 619, 622, 627, 639, 667, 688 and 723. Line 627 is the comment over the
      `NEBULA_FILES` regex that task 5.1a repoints, so the two go together. `e2e/helpers.ts` says
      "sprites" at 87, 91, 111 and 114 as well as "the sprite atlas" at 113, and
      `e2e/frame-budget.spec.ts` at 30, 37 and 38. The grep below is the
      gate, not this list. Verify
      `git grep -in "atlas\|one, or none" -- src/app src/render/renderer.ts src/render/global.ts e2e/helpers.ts`
      returns nothing. Do not widen it to `src/render/`: `cloud-shapes.ts` and `buffers.ts`
      say "atlas" about the cloud shape atlas and stay. Every `renderer.ts` line number here is read against the tree
      **with the spike in it**. Task 6.3a deletes the spike earlier in this same group, which
      moves each of them up by 10, 19, 35 or 66 lines depending on the band — line 957 moves by 66,
      to 891 — so re-find them by text and not by number. Rename `closeAtlas` as well
      (`src/app/create-map.ts` line 344, called at 1439, 1445, 1564 and 1868): its name carries
      neither "sprite" nor "nebula-atlas", so no grep in this task list catches it. Rename `src/render/nebula-slot.ts`'s
      `Atlas` type parameter and its `spriteScale` member on `NebulaFrame` in the same sweep,
      under task 4.5's rule that the tree does not carry both names. Verify
      `src/app/create-map.test.ts` passes, including the positive control that a readable
      source calls both loaders, and
      `git grep -in sprite -- src/app/create-map.ts src/render/nebula-slot.ts src/render/global.ts src/render/nebula-pass.ts src/render/shaders/nebulae.vert src/render/shaders/nebulae.frag src/scene-data/nebulae.ts src/nebulae/ e2e/helpers.ts e2e/nebulae.spec.ts`
      returns nothing **but line 647 of `e2e/nebulae.spec.ts`**, which names the kept scenario
      `The switch removes the sprites and gives them back`. The spec delta keeps that name on
      purpose, so the name stays and the prose around it does not. (`e2e/hud.spec.ts` line 2051
      mirrors the same name and is out of this grep's scope for that reason.) Every path in that
      list is nebula-only.

      `e2e/frame-budget.spec.ts` needs the **nebula form** instead, as `renderer.ts` does:
          `git grep -in "nebula.*sprite\|sprite.*nebula\|nebula sprites" -- e2e/frame-budget.spec.ts`
          must return nothing. Lines 30, 37 and 38 are the nebula ones and line 70 belongs to task
          5.1b; lines 12, 16, 202, 221, 224 and 244 are the cloud pass, the star field and the marker
          glow, which the Non-Goals leave alone.

          Verify also that and that
          `git grep -in "nebula.*sprite\|sprite.*nebula\|no sprite draws\|the sprites draw into" -- src/render/renderer.ts`
          returns nothing. The two extra forms are needed: lines 228 and 625 are nebula prose the
          two-word pattern does not match. `renderer.ts` needs the second form because lines 583, 601 and 608
          say "sprite" about the **cloud** pass, which the Non-Goals leave alone; only the
          nebula lines change. "Sprite" is this project's word for the cloud, star and system
          sprites in about 30 other files, so do not widen the check to `src/`.

- [x] 6.5 Rewrite `src/render/nebula-slot.test.ts`. It pins the module's exact built output
      to `DEFAULT_NEBULA_BRIGHTNESS = 8` and `DEFAULT_NEBULA_OCCLUSION = 1`; the light gain
      is three values, so the slot gains an array literal. Keep the test exact rather than
      relaxing it, and verify the entry-chunk bound still holds.
- [x] 6.6 Update `THIRD_PARTY_NOTICES.md`. Its nebula section describes
      `src/render/nebula-art.webp` as 34 tiles of 256 by 256 texels and the records as
      holding a tile index. Rewrite it for the volume set and the asset index. Update
      `tests/third-party-notices.test.ts`, which asserts the notices name
      `nebula-art.webp`. This is the attribution for Frontier's art, so correct it rather
      than renaming it.
- [x] 6.6a Rewrite the comments that name `nebula-atlas.ts` and `nebula-art.webp`:
      the whole paragraph at `src/render/buffers.ts` lines 3 to 6, which also says "put the
      sprite atlas in the build of every host" and which task 6.7's grep does not reach, and
      `src/render/buffers.test.ts` lines 6 and 11. The
      guard itself asserts no imported path contains `nebula` or `scene-data/nebulae`
      (`buffers.test.ts` lines 40 to 45), so it already covers `./nebula-art/*` and
      `./nebula-volumes` and needs no edit. **Do not narrow it to a file name** — the
      substring check is the stronger guard. The comments matter because task 6.7's grep
      reads them.

      Rewrite the same prose in the three modules the spec's kept scenario **The extinction rule
              is written once** points a reader at, which no other task and no other grep reaches:
              `src/render/shader-include.ts` line 29, `src/render/volume-density.ts` line 2 and
              `src/render/shaders/volume-density.glsl` line 6, each of which says the nebula pass "dims a
              sprite" by the dust in front of it. Gate them with
              `git grep -in "nebula.*sprite\|sprite.*nebula" -- src/render/shader-include.ts src/render/volume-density.ts src/render/shaders/volume-density.glsl`,
              which returns nothing when they are done. Do not widen that to `src/render/`: about 30
              files there say "sprite" about the clouds and the stars. Verify `buffers.test.ts` passes unchanged in its assertions.

- [x] 6.7 Delete `src/render/nebula-art.webp` and `src/render/nebula-atlas.ts`. Verify
      `git grep -in "nebula-art\.webp\|nebula-atlas" -- src e2e tests eslint.config.js`
      returns nothing and `pnpm build` succeeds. Scope it to those paths: the archived
      changes, `publish-library-package` and, until task 8.5 runs, `AGENTS.md` and
      `README.md` all still name the atlas and are meant to.
- [x] 6.7a Rewrite `tests/main-bundle.test.ts` for a set of 68 files. Its file-count check reads the build **task 6.3**
      produces; task 3.1a adds the glob, but nothing imports the module until 6.3, so no asset is
      emitted before then. It is atlas-shaped in
      **16 places**: an `atlasFileName()` helper, a `/nebula-art-[\w-]+\.webp/` pattern, an
      assertion that exactly one `.webp` exists, a check that no `data:image/webp` reaches the
      bundle, and line 920's comment naming `NebulaSource<NebulaSet, NebulaAtlasImage>`. A **seventeenth** place is record-shaped: lines 545 and 547 type a record as
      `[number, number, number, number, number, string?]` and read the name from index 5.
      Task 2.1 joins an asset index and three angles, so the name moves and
      `recordName.length` throws. Repoint it.

      An **eighteenth** place is tile-shaped and no other task names it:
                                  `NEBULA_SHADER_TERM = 'vTileUv'` at line 162, its doc comment at lines 157 to 161 that
                                  explains the name, and the `nebula shaders` entry of `NEBULA_NEEDLES` at line 400 that
                                  reads it. `vTileUv` dies with the atlas shaders in tasks 4.1 and 4.2, so line 638's
                                  `expect(secondText.includes(NEBULA_SHADER_TERM)).toBe(true)` would fail with no task
                                  saying why. Repoint it at **`vMarchObject`**, the varying task 4.1 fixes, and rewrite the
                                  comment. Replace them with the volume set: the assets are separate files, none is a
                                  data URI, and the count is 68. Task 6.3a verifies the two bundle scenarios, once the
                                  spike's shader text has left `dist/index.js`.

- [x] 6.8 Read **both** entry chunk figures and record both: `library-package` states a pair,
      `index.js` alone and `index.js` with every chunk it imports. The assertion in
      `tests/main-bundle.test.ts` is on `index.js` alone, against `ENTRY_CHUNK_LIMIT` of
      260,000; the pair figure is logged and lives in prose. The tree reads 254,076 alone and
      259,599 as a pair, so the headroom is about 5.9 kB. Write both new readings into
      `tests/main-bundle.test.ts` **and** into `openspec/specs/library-package/spec.md`,
      whose **The library build emits a package and no page** requirement carries the entry
      chunk bound in its prose and says the implementation writes the reading there. This
      change also carries a MODIFIED delta for that requirement, because its scenario **The
      entry chunk holds no nebula code** asserts on "the sprite atlas file name", which this
      change deletes. Apply the delta's wording — the volume index name and the volume asset
      names — in the same edit. **Write both new readings into the delta copy as well as the
      base spec**, in the same words. Archive replaces a MODIFIED requirement's text wholesale,
      so a delta still carrying 254,076 and 259,599 would revert the figures this task writes
      and leave the spec stating a number no build produces. `publish-library-package` carries its
      own full copy of the **same** requirement, whose nebula scenario still says "the sprite
      atlas file name". Whichever change archives second reverts the other's edits with no
      error, so put this change's scenario wording **and** both readings into that change's
      delta copy too, before either is archived. design.md's Migration Plan states the
      collision. Verify the test covering **The entry chunk does not carry the records** passes.

## 7. Fidelity and cost readings

- [x] 7.1 Build the CPU fixtures for `barnards-loop` and `cats-eye`: march each with
      the volume integral through the map's exposure and tone map, and commit both.
      `cats-eye` is the worst case for the transmittance recurrence: it carries by far the
      largest negative extinction in the set, -193.5, so `T` rises above 1 along a ray. Verify the browser test covering **The march reproduces the
      reference integral** reads the drawn pixels back and is within 0.02 RMSE in display
      units on `barnards-loop`, whose spike reading is 0.0105. `cats-eye` has **no reading
      yet**: measure it, write the figure into the test, and set its bound at that figure
      rounded up to the next hundredth. Above 0.05 the march is wrong, not the bound. Do not
      assume 0.02 for it — it is the extreme case and that is why the spec picks it. March the
      fixture at the **same step rate as the frame under test**, or the reading measures the
      quadrature and not the implementation. Build the fixture from the `.dds` bytes and the record's rotation alone,
      so a wrong decode, a wrong selection or a wrong integral shows in the RMSE. **The
      sampling convention is out of its reach**: the generator reads `(u, 1 - v, w)`
      because the shader does, so a wrong flip on the v axis moves both sides together.
      `design.md` records that, and the baseline screenshot is what holds it. Task 2.0 deletes the e2e test that checked the sprite's handedness
      and this reading is what replaces it. **The owner supplies both fixtures**, as task 1.2
      says, together with the `cats-eye` reading this task writes into the test. Do not build
      them from the spike: `spike/march-check.mjs` reads a reference another tool produced,
      holds no exposure and no tone map, and carries names from another source and absolute
      paths. The
      unit-test march of tasks 4.2 and 4.7 is a **different**, deliberately simple one that
      lives beside those tests; the spec's shared extinction rule is the only thing the two
      must agree on.
- [x] 7.2 Add the browser test covering **The step rate trades cost for nothing visible**:
      read `dark-02` at 32 and at 64 steps per unit, write the measured
      difference into the test, and assert it is under 5 percent of the block mean. If it
      exceeds 5 percent, raise the default step rate above 32 rather than the bound, and
      correct the figure in the spec and `design.md`.
- [x] 7.2a Measure the decode. Time the fetch, the block decode and the upload of all 33
      assets on the main thread, in the browser, on the hardware renderer, and write the
      reading into the test as a comment. 2.64 MiB of blocks expand to 6.03 MiB once, after the
      first frame. **If any single frame during the decode exceeds 16.7 ms, the decode moves to
      a worker**; the loader waits on nothing, so that move needs no other change. This is the
      third of design.md's Open Questions and the only one with no reading yet.
- [x] 7.3 Measure the worst covered area — **the lesser of the disc and one screen** summed
      over the drawn records — over every camera the browser suite visits, at
      1,920 by 1,080 and on a 64-texel asset, and re-measure the per-record cost there. Write
      the readings into the test covering **A near view holds the budget**, whose assertions
      are the frame interval and a dropped-record count of 0. If the covered area exceeds 4
      screen areas, raise the budget to the reading plus a quarter and correct the figure in
      `design.md` and the spec.
- [x] 7.4 Add the browser test covering **The box costs the same from inside as from
      outside**: read the pass cost for a record whose footprint covers the whole frame,
      with the camera just outside the box and just inside it, and assert the two differ by
      under 20 percent. Cost, not a fragment count: WebGL2 has no fragment counter. The
      failure this guards is the back faces drawing as well as the front.
- [x] 7.5 Add the browser test covering **A camera inside a nebula sees the part in front of
      it** and **The camera inside a nebula is surrounded by it**.
- [x] 7.6 Add the browser test covering **A nebula grows as the camera closes on it**: read
      the contribution at three, two and 1.2 times the radius and assert it rises.
- [x] 7.7 Add the unit test covering **Two records that share an asset can differ**, using
      two records over `bright-02`.

## 8. Whole-suite checks

- [x] 8.1 Run `pnpm test` and confirm every unit test passes. This is the **first** whole-suite
      run of the change: task 1.1c records why the bundle test is red until task 6.3a deletes the
      spike, and tasks 2.0 to 5.5 verify with targeted runs for that reason. Do not run the browser suite
      at the same time: a second Playwright run kills the first one's preview server.
- [x] 8.2 Run the browser suite with `GALAXY_MAP_E2E_BUILT=1` and confirm every test passes.
      This is the **first** whole browser-suite run: the watcher repoint of task 5.1a and the
      deletions of 5.1b land in group 5, and the spike's own fetches stand until task 6.3a, so
      before that point verify with the named spec files alone. Confirm every test passes
      on the hardware renderer, with `WEBGL_debug_renderer_info` asserting no software
      fallback.
- [x] 8.3 Confirm the pinned far-view baseline image is unchanged, covering **The baseline
      holds** and **The switch keeps the far view**.
- [x] 8.4 Run `e2e/frame-budget.spec.ts` and confirm every returned mean is under 16.7 ms
      with the nebula pass on and the occlusion constant at 1, covering **The march holds the
      frame budget** and **The frame budget holds with the nebulae on**.
- [x] 8.5 Update `AGENTS.md` where it names the sprite atlas and the 811,762 bytes of art,
      and `README.md`, which names them at lines 93, 260, 261, 273, 277, 279, 284 and 706
      and carries the 811,762 byte figure. Line 260 also carries the record file's 14,626
      bytes, which the three joined angles move and which the `atlas|sprite` grep does not
      reach. Line 284 names `loadAtlas`, which task 6.4 renames. Rewrite `vite.config.lib.ts` line 42 as well, which says the main entry's build
      carries "no sprite art"; no other grep in this task list reaches that file. Verify `git grep -in "atlas\|sprite" -- README.md AGENTS.md THIRD_PARTY_NOTICES.md`
      returns nothing. Scope it to those three files: the archives,
      `publish-library-package`, this change's own artifacts and `openspec/specs/nebulae/spec.md`
      all name the atlas and are meant to. The last of those is the `## Purpose` rewrite that
      design.md's Migration Plan defers to archive time.
- [x] 8.6 Run `pnpm lint` and `openspec validate replace-nebula-sprites-with-volumes` and
      confirm both pass.
