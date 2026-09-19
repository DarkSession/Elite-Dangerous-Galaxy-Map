## 0. Before anything

- [ ] 0.1 Confirm `pnpm test` passes on the tree. `add-nebulae` has landed: it is commit
      `63184db`, archived as `2026-09-19-add-nebulae`. Every file this change edits is a file
      that change wrote
- [ ] 0.2 Read the current reading of the entry chunk from `pnpm test`, from the
      `the entry chunk holds N bytes` line, and write N here. **Measure it; do not trust a
      recorded figure.** The comment in `tests/main-bundle.test.ts` records **266,996**, and
      a build taken while drafting this change measured the same. `add-nebulae` is now
      committed as `63184db`, so the figure is stable — measure it anyway. Task 7.1 measures
      the fall against what **you** read, not against the figure above
- [ ] 0.3 If `add-nebula-occlusion` has landed, note it here. Its volume texture, its
      volume uniforms and its `nebulaOcclusion` constant become fields of `NebulaFrame`
      in task 2.1 rather than staying on the pass's own frame type

## 1. `buffers.ts` gives up its nebula half

This group comes first. While `src/render/buffers.ts` names the atlas URL, the two asset
files stay in the main entry's chunk graph and every later group delivers nothing. **Eleven
modules of `src/` import `buffers.ts`, nine of them as values** — `cloud-pass` and
`reduce` take types alone — so the main entry reaches it at load whatever the renderer
does about the nebulae.

- [ ] 1.1 Add `src/render/nebula-atlas.ts` and move into it from `src/render/buffers.ts`:
      the `./nebula-art.webp?url&no-inline` import, `loadNebulaAtlas`,
      `createNebulaAtlasTexture`, `NEBULA_ATLAS_COLUMNS`, `NebulaAtlasImage` and
      `NebulaAtlasTexture`. The `.webp` file does not move on disk, so the SHA-256 fixture
      and the third-party notices stay true
- [ ] 1.2 Remove the `NebulaError` value import from `buffers.ts`. The throws that used it
      move with the loader, so the class stays in `src/scene-data/nebulae.ts`
- [ ] 1.3 Update the importers of the moved members: `src/render/renderer.ts`,
      `src/render/nebula-pass.ts`, `src/app/create-map.ts`,
      `src/render/nebula-pass.test.ts` and `src/render/renderer.test.ts`; verify
      `pnpm test` passes before any other group starts
- [ ] 1.4 Add the guard test: read `src/render/buffers.ts` from the tree and assert no
      import in it names `nebula` or `scene-data/nebulae`. This is the guard for the whole
      change. An edit that puts an asset import back would otherwise pass every other test

## 2. The types the renderer holds the sprites through

- [ ] 2.1 Add `src/render/nebula-slot.ts` with `NebulaFrame`, `NebulaDraw`,
      `NebulaSource` and **one value export, `DEFAULT_NEBULA_BRIGHTNESS`, and no other**.
      The design says why that one constant lives here rather than in the renderer. `NebulaFrame` carries what the renderer
      knows and the draw needs: the view projection, the chunk offset, the camera, the
      zoom distance, the half-target size, the canvas height in CSS pixels, the sprite
      scale, the brightness, and — where `add-nebula-occlusion` has landed — the volume
      texture, its uniforms and the occlusion constant
- [ ] 2.2 Verify by unit test that `nebula-slot.ts` compiles to **the one constant and
      nothing else**: build it alone and check the output holds no statement but that
      export, and above all no import. Any further value export, or any import, reaches the
      entry chunk through the renderer's import, which is the whole thing this change
      undoes

## 3. The nebula pass takes the selection over

- [ ] 3.1 Move the `selectNebulae` and `nebulaFocalPixels` calls out of
      `src/render/renderer.ts` and into `src/render/nebula-pass.ts`, so one `draw(frame)`
      selects, writes the instances and issues the call; verify the existing nebula pass
      unit tests pass against the new signature
- [ ] 3.2 Make `createNebulaPass` return a value that satisfies `NebulaDraw`, with
      `drawnCount`, `drawCalls` and `dispose`; verify by unit test that the drawn count
      and the draw call count read the same figures they read before this change, at the
      same views
- [ ] 3.3 Verify by unit test that a frame drawn through the new path matches a frame
      drawn through the old one at three views inside the band: the same instance count,
      the same order, and the same instance data

## 4. The subpath entry

- [ ] 4.1 Add `src/nebulae/index.ts` exporting one value, `nebulae`, that satisfies
      `NebulaSource`: `loadSet` and `loadAtlas` call the loaders that exist today, and
      `createDraw(gl, set, atlas)` compiles the program, makes the atlas texture and
      returns the pass
- [ ] 4.2 Add the `src/nebulae/` row to the directory table in `AGENTS.md`, and record
      that this directory may import both `src/render/` and `src/scene-data/` because it
      is the seam between them
- [ ] 4.3 Add an ESLint rule so nothing **except** `src/nebulae/`, the nebula modules
      themselves and the tests imports `src/render/nebula-pass`, `src/render/nebula-atlas`
      or `src/scene-data/nebulae` as a value. **Exempt three files by name, or the rule can
      never pass**: `src/render/nebula-pass.ts` value-imports `NEBULA_CAP_FRACTION` and
      `NEBULA_MAX_DRAWN` from `../scene-data/nebulae` at line 3 and `NEBULA_ATLAS_COLUMNS`
      at line 5, which task 1.1 moves to `nebula-atlas.ts`; and `src/render/nebula-atlas.ts`
      takes `NebulaError` from `scene-data/nebulae`, which `src/render/buffers.ts:11` holds
      today and task 1.2 moves with the throws. All three keep those imports by design. A
      block keyed on `src/render/**` alone would fail the lint for good, and task 9.1 with
      it. The boundary the rule is for is "the modules the main entry reaches", and the
      nebula modules are not among them, so give the new block an `ignores` list naming
      `src/nebulae/**`, `src/render/nebula-pass.ts` and `src/render/nebula-atlas.ts`. The base `no-restricted-imports` rule cannot tell a type import from a value
      import, so use `@typescript-eslint/no-restricted-imports` with
      `allowTypeImports: true`, or ban the path outright and let the renderer reach the
      types through `nebula-slot.ts` alone. Record which you chose and why. The rule names
      `nebula-pass`, `nebula-atlas` and `scene-data/nebulae`; it does **not** name
      `nebula-slot.ts`, which the renderer imports both ways after task 5.2a. **Add a block;
      do not convert the existing ones.** `src/hud/hud-boundary.test.ts` line 11 holds
      `const IMPORT_RULE = 'no-restricted-imports'` and asserts that rule id literally, so
      converting the whole configuration to the typescript-eslint rule breaks it. The
      configuration already keys its rules per file group, so a new block for
      `src/render/**` leaves the HUD block alone
- [ ] 4.4 Verify the rule: the lint fails on a value import added to
      `src/render/renderer.ts`, and passes on the type import the renderer keeps.
      **The tree does not satisfy this rule yet, and that is expected.** At the end of
      group 4 the renderer still value-imports `selectNebulae`, `nebulaFocalPixels`,
      `createNebulaPass`, `createNebulaProgram` and `DEFAULT_NEBULA_BRIGHTNESS`, which
      task 5.2 removes, and `src/app/create-map.ts` still value-imports `loadNebulaSet`
      and `loadNebulaAtlas`, which task 5.4 removes. So `pnpm lint` over the whole tree
      fails between here and task 5.4. Verify the rule here against a scratch file or a
      single-file lint run, and check the **whole tree** lints clean at task 5.6, not
      here. The same hand-off as task 4.4a-i, said out loud
- [ ] 4.4a Export `NebulaSource` from `src/index.ts`, with the type sourced from
      `src/render/nebula-slot.ts`. The proposal's changed-code table and the
      `library-package` delta both name this and no other task does it; without it the
      `nebulae` option cannot be written in typed code
- [ ] 4.4a-i Add `NebulaSource` to `PUBLIC_TYPES` in `src/index.test.ts`, which task 4.4a
      breaks. That file is the guard that holds the barrel to the export list this
      capability states, and it asserts the list **exactly**:
      `expect(names.sort()).toEqual([...PUBLIC_CALLS, ...PUBLIC_TYPES].sort())`. A new
      export with no entry there fails it. **Keep the assertion exact** — do not loosen it
      to `toContain`, because the exactness is what stops the surface growing without a
      reviewer seeing it
- [ ] 4.4b Verify the built main declaration names `NebulaSource`, which is the scenario
      "The nebula option is writable in typed code". The mechanism already exists: add the
      name to `PUBLIC_TYPES` in `tests/main-bundle.test.ts`, which a `toContain` and the
      generated compile against the built declaration both read. A name left out of that
      list **fails nothing** — it only means the type is never compiled against the built
      declaration, so adding it is the whole of the check
- [ ] 4.5 Add `./nebulae` to `exports` in `package.json`, with its `types` and `import`
      paths, and give `lib.entry` in `vite.config.lib.ts` two keyed entries
- [ ] 4.5a Widen the test `package.json names paths the build emits` in
      `tests/main-bundle.test.ts`, at lines 445-460. It reads `manifest.types`,
      `exports['.'].types` and `exports['.'].import` **by hand**, so the `./nebulae` entry
      task 4.5 adds goes unchecked and nothing fails. Walk every entry of `exports` rather
      than the `.` entry alone. This is not what task 4.6 checks: 4.6 reads the emitted file
      names, and this reads whether the manifest points at them
- [ ] 4.6 Fix `lib.fileName` in the same file. Vite's `resolveLibFilename` returns
      `` `${fileName}.js` `` for a string whatever the entry is, so two entries would both
      resolve to `index.js`. Drop `fileName` and let the entry keys name the files, or
      give a function of the entry name. Verify `pnpm build` emits **both** `dist/index.js`
      and `dist/nebulae.js`, and a declaration for each, by reading the emitted names
      rather than assuming them

## 5. The renderer and the map stop asking for the nebulae

- [ ] 5.1 Change `src/render/renderer.ts` to take `NebulaFrame`, `NebulaDraw` and
      `NebulaSource` from `nebula-slot` with `import type`, hold a `NebulaDraw | null`, and
      call `draw(frame)` where it calls the pass today. The renderer also takes
      `DEFAULT_NEBULA_BRIGHTNESS` from the same module as a **value** import, per task 5.2a,
      so this is not an `import type` line on its own. That value import is allowed and the
      rule of task 4.3 does not cover `nebula-slot.ts`, which is the point of the module
- [ ] 5.2 Remove from `src/render/renderer.ts` the value imports of `selectNebulae`,
      `nebulaFocalPixels`, `createNebulaPass`, `createNebulaProgram`,
      `createNebulaAtlasTexture` and `DEFAULT_NEBULA_BRIGHTNESS`, and remove the eager
      `createNebulaProgram` call at renderer creation; update `src/render/renderer.test.ts`
      for the new shape
- [ ] 5.2a Move `DEFAULT_NEBULA_BRIGHTNESS` out of `src/render/nebula-pass.ts`, where it is
      defined at line 17 and never used, and into `src/render/nebula-slot.ts`, per task 2.1.
      Move its comment with it. Repoint the three readers: `renderer.ts:442`, which seeds
      `look.nebulaBrightness`, and the two tests that assert the default,
      `src/render/renderer.test.ts` lines 10 and 466 and `src/render/nebula-pass.test.ts`
      lines 13 and 104. **Do not leave a re-export behind** in `nebula-pass.ts`: two paths
      to one value let the renderer take the wrong one, and the ESLint rule of task 4.3
      would then be the only thing that catches it.
      **Where `add-nebula-occlusion` has landed first**, which is the order that change
      asks for, `DEFAULT_NEBULA_OCCLUSION` sits beside the brightness in `nebula-pass.ts`
      and the renderer imports it the same way. Move both constants, not one, and repoint
      its readers as well. Task 2.1 already says `NebulaFrame` carries the occlusion
      constant in that case
- [ ] 5.3 Change `renderer.setNebulae` to take the draw the source built, rather than the
      set and the atlas; verify the renderer disposes the old draw when a new one arrives
      and on `dispose`
- [ ] 5.4 Add the `nebulae` option to `GalaxyMapOptions` in `src/app/create-map.ts`.
      Remove the unconditional `loadNebulaSet` and `loadNebulaAtlas` calls and run them
      only where the option holds a source the map can read
- [ ] 5.5 Add the run-time check: an option that is not an object, or that does not carry
      `loadSet`, `loadAtlas` and `createDraw` as functions, turns the nebulae off and
      reports nothing; verify by unit test with `true`, `null`, `{}` and an object with
      two of the three
- [ ] 5.5a Give that test a **positive control**, or it passes without testing anything.
      Vitest runs in the `node` environment and `create-map.test.ts` builds maps on a
      canvas that returns no context, so `start()` throws before it reaches the loaders and
      nothing loads whatever the option says. Test the readability predicate directly, or
      pass a source of spies through the same harness and assert a **readable** source does
      call `loadSet` and `loadAtlas` where the unreadable ones do not
- [ ] 5.5b Rename the `nebulae` flag of `OpenOptions` in `e2e/helpers.ts` to
      `waitForNebulae`, and update its three uses at lines 85, 90 and 103 and the call in
      `e2e/nebulae.spec.ts`. Today the word means "do not wait for the sprites"; after this
      change the same word is a map option meaning "load the sprites". Two opposite meanings
      under one name in one suite is a reading trap
- [ ] 5.6 Update `e2e/helpers.ts` where it starts a map or counts the nebulae, so a page
      with no source is a supported state rather than a failure; verify the helpers give
      the same readings on the demo page, which keeps the source
- [ ] 5.7 Verify by browser test that a map with no `nebulae` option makes no request that
      names the record file or the sprite atlas, draws no sprite, and shows no error

## 6. The switch

- [ ] 6.1 Add `hasNebulae()`, `setNebulaeVisible(on)` and `areNebulaeVisible()` to
      `GalaxyMap` in `src/app/create-map.ts`; verify by unit test that a map with no
      source reads `false` from the first two and that the third throws nothing
- [ ] 6.2 Verify by browser test that the switch removes the sprites and gives them back,
      and that turning them on again issues no new request
- [ ] 6.2a Update the header comment of `src/hud/options-panel.ts`, lines 1-3, which names
      the four switches one by one. Task 6.3 edits this file without naming the comment, so
      it would be left describing four switches beside code that builds five
- [ ] 6.3 Add the **Nebulae** switch to `src/hud/options-panel.ts`, built only where
      `hasNebulae()` is true; verify the HUD boundary lint passes, because the panel
      reaches all three members through the handle
- [ ] 6.3a Verify by browser test that **clicking the HUD switch** removes the sprites,
      which is the `map-hud` scenario "The nebulae switch removes the sprites": open a map
      with the HUD and the source inside the zoom band, read the drawn count, click the
      **Nebulae** switch and read it again; the first reading is above 0, the second is 0,
      and the switch reads off. Task 6.2 is the handle path, not this one — it calls
      `setNebulaeVisible` and satisfies the `nebulae` scenario "The switch removes the
      sprites and gives them back". Two scenarios, two tests
- [ ] 6.4 Verify by browser test that a map with the source shows five switches and one
      with no source shows four and none labelled **Nebulae**
- [ ] 6.5 Update the HUD keyboard test so the fifth switch is in the tab order where it is
      built, and out of it where it is not

## 7. The build, the bundle and the package

- [ ] 7.1 Run `pnpm test` and read the `the entry chunk holds N bytes` line. **Record two
      figures, not one**: `index.js` alone, and the sum of the entry chunk and every chunk it
      imports at load, which `chunksAtLoad` in `tests/main-bundle.test.ts` already computes.
      With a second entry point, `index.js` stops being the whole of what the main entry
      loads: a module both entries reach can move into a shared chunk that `index.js` imports
      at load, so `index.js` can fall by more than the code this change removes. After this
      change only `src/render/program.ts` is reached from both, so expect about a kilobyte of
      that effect — but record both figures so a fall larger than 13,476 reads as the split
      it is rather than as a contradiction. Read the HUD chunk figure at the same time; it
      sits near its own bound and this change adds a switch. It measured **52,776 bytes**
      against `HUD_CHUNK_LIMIT = 56_000`, which is 3,224 bytes of room. Two things follow.
      The comment block above that limit still records **47,360** as the last reading, which
      is stale in the tree; add the new reading to it whether or not the bound moves. And if
      the fifth switch takes the figure past 56,000, move `HUD_CHUNK_LIMIT` and extend the
      comment with the reading and the reason, exactly as this task already requires for the
      entry chunk. Do not raise it further than the next round figure above the reading. Move
      `ENTRY_CHUNK_LIMIT` **down** to the next round figure above the reading, and add an
      entry to the comment block with the reading and the reason. Write **both** figures
      into the `library-package` delta spec: the measured reading and the new bound. The
      scenario reads "under the bound this requirement records", so a requirement that
      records only the reading cannot be failed from the spec alone
- [ ] 7.2 Build the host-bundle harness, before either assertion. This is new work and not
      a line of an existing test. `tests/main-bundle.test.ts` today runs **one Vite
      build** in `beforeAll`, followed by a `tsc -p tsconfig.build.json` in the same hook: `pnpm exec vite build --config vite.config.lib.ts` into a
      `.library-build-*` directory made with `mkdtempSync` **inside the repository**,
      because Node must resolve `gl-matrix` and `@elite-dangerous-almanac/core` from the
      repository's `node_modules`. The harness adds two more builds of a generated host
      entry, in the same place and for the same reason. **Resolve the package name to the fresh temp
      output, not to `dist/`.** Neither a self-reference through `exports` nor a relative
      path into `dist/` works: `exports` points at `./dist/index.js`, `dist/` is git-ignored,
      and the pipeline runs `pnpm test` **before** `pnpm build`, so on CI there is no
      `dist/` when this test runs — and locally it would bundle whatever an earlier build
      left there, which is not the build under test. Tasks 7.4 and 7.5 are the whole proof of
      this change, so a harness reading a stale build reports on the wrong bytes and passes.
      Use a `resolve.alias` in the host build config mapping the package name and its
      `/nebulae` subpath to the two files in the temp directory, or write a small
      `package.json` into that directory and point the host entry at it. Task 4.5a already
      checks the real `exports` map, so the harness gives nothing up
- [ ] 7.3 Measure what the harness costs. Three Vite builds run under one 300 second hook
      timeout where one runs today. Record the before and after times of the file here. If
      the three do not fit, build the two host entries once each in one `beforeAll` rather
      than per test, and say so
- [ ] 7.4 Add the tree-shaking assertion: the host entry that imports `createGalaxyMap`
      alone produces output holding no record file, no `.webp` and none of the nebula
      shader text
- [ ] 7.5 Add the companion assertion: the host entry that imports `createGalaxyMap`
      **and** the `./nebulae` subpath produces output holding all three. Verify that
      deleting it would let 7.4 pass on a broken build, which is why both exist
- [ ] 7.6 Add a test that the second entry chunk exists, exports exactly one name, and is
      named in no static and no dynamic import of the entry chunk
- [ ] 7.6a Assert the **library's own** entry chunk carries no nebula code. Two scenarios
      say this and no task writes it: "The entry chunk holds no nebula code" in the
      `library-package` delta and "The entry chunk does not carry the records" in the
      `nebulae` delta, which `add-nebulae` strengthened to "no nebula record, **no nebula
      code**". Group 7 covers the host bundles at 7.4 and 7.5 and the second chunk at 7.6;
      this one reads the library build, not a host's. Read `index.js` and every chunk it
      imports at load, through `chunksAtLoad` at `tests/main-bundle.test.ts:207`, and assert
      none holds nebula shader text, the record file name or the atlas file name. The
      nearest existing test, "emits the nebula records and the atlas as files, not as chunk
      text", is **not** this one: it reads record text alone and passes today with the
      shaders in the entry chunk.
- [ ] 7.6b Give task 7.6a its positive control, the way tasks 4.4b, 5.5a and 7.5 each give
      one. Assert the same shader needle **is** present in the nebula entry chunk. Without
      it, a needle that appears nowhere — a renamed uniform, a minified identifier — makes
      the absence test pass for the wrong reason, which is the quiet failure this change is
      otherwise careful about
- [ ] 7.7 Set `"sideEffects": false` in `package.json` and move the version to `0.5.0`.
      Then **edit** `tests/main-bundle.test.ts`, `expect(manifest.version).toBe('0.4.0')`,
      to read `0.5.0`. It is at line 446 on `main`, but task 4.5a widens the same file
      first, so match on the text rather than the line. Then extend the comment above it
      the way the 0.4.0 entry extended it. That assertion is exact, so it fails rather
      than drifts
- [ ] 7.7a Write the side-effect test, which does not exist: no test in `tests/`, `src/` or
      `e2e/` reads `sideEffects` today, so this is new work and not a verification. It
      asserts that no module of `src/` imports a `.css` file, which is what makes
      `"sideEffects": false` true. It holds today — the HUD fonts arrive through
      `?url&no-inline` in `src/hud/styles.ts` rather than a stylesheet import — so the test
      passes when written and guards the claim from then on
- [ ] 7.8 Add the declaration test for the three nebula members and for
      `createGalaxyMap(canvas, { nebulae: source })` against the built declarations

## 8. The demo and the documentation

- [ ] 8.1 Import the source in `src/app/main.ts` and pass it in the options; verify the
      demo site draws the nebulae as it did before this change, by the browser tests that
      read the drawn count inside the band
- [ ] 8.2 Put the source on the page for the browser suite: `src/app/main.ts` writes it
      beside `window.galaxyMapFactory`, as `window.galaxyMapNebulae`, and `e2e/global.d.ts`
      types it. Without this the tests of tasks 5.7, 6.2 and 6.4 cannot build a map with a
      source and a map without one on the same page
- [ ] 8.3 Run `e2e/look.spec.ts`; verify the pinned baseline at 60,000 light years is
      unchanged and that every nebula test still passes on the demo page
- [ ] 8.4 Update `README.md`: the `nebulae` option, the subpath import, the three handle
      members, and the 811,762 bytes of art a host that asks for them downloads. This is
      **first text, not an amendment** — the README holds no mention of the nebulae at all
      today, although `add-nebulae` has landed. Update the **"The entry point"** section at
      lines 81-88 as well: it says the package entry is `src/index.ts`, that `package.json`
      names it in `exports`, and that `pnpm build` writes `dist/index.js`. After this change
      there are two entry points, a host reaches the nebulae at a subpath, and the build
      writes `dist/nebulae.js` too
- [ ] 8.4a Update the README's **own copies** of the layout and the boundary rules, at
      lines 544-558. The file repeats the `src/` directory table and the ESLint boundary
      paragraph that `AGENTS.md` holds, and task 4.2 updates only `AGENTS.md`. Add the
      `src/nebulae/` row to the table, and add the rule task 4.3 adds to the paragraph.
      Both sections are wrong after this change, and nothing fails on either
- [ ] 8.5 Update `THIRD_PARTY_NOTICES.md` if the art's entry names a path that moved. The
      `.webp` file does not move in this change; confirm and say so here

## 9. Before review

- [ ] 9.1 Run `pnpm lint`, `pnpm test` and `pnpm test:e2e`; verify all three pass, and
      paste the failing output here if any does not. Run one Playwright suite at a time
- [ ] 9.2 Run the implementation review gate with the `openspec-implementation-reviewer`
      subagent and act on its verdict; verify the verdict is recorded before any human
      sees the work
