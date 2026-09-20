## 0. Before anything

- [x] 0.1 Confirm `add-nebulae` and `make-nebulae-optional` have landed. This change
      writes the `exports` map that carries the `./nebulae` subpath

      Both are archived: `openspec/changes/archive/2026-09-19-add-nebulae` and
      `openspec/changes/archive/2026-09-19-make-nebulae-optional`.
- [x] 0.2 Run `pnpm lint`, `pnpm test` and `pnpm test:e2e` on the tree as it stands and
      record the results here, with the test file count and the pass and fail counts.
      They are the **before** reading. A restructure is only correct if the after reading
      matches it

      **Before reading, 2026-09-20.** `pnpm lint`: clean, no output. `pnpm test`: 82 test
      files, 1193 tests, 82 passed and 0 failed, 1193 passed and 0 failed.
      `pnpm test:e2e`: the parallel pass 556 passed and 0 failed, the timed pass 66 passed
      and 0 failed.
- [x] 0.3 Record the entry chunk reading from the `the entry chunk holds N bytes` line.
      **Expect the after reading to differ.** Task 1.2 exports `createFragmentWriter` from
      the barrel, and that function is tree-shaken out of the library entry chunk today —
      `dist/index.js` holds none of its body, while the demo bundle does, because only the
      demo page imports it. Exporting it puts the function and `FRAGMENT_THROTTLE_MS` in.
      Task 1.3 also adds `./testing` as a third `lib.entry`, and `src/render/global.ts` is
      reached from both the main graph and that entry, so Rollup may re-partition it into a
      shared chunk. The bound is not at risk — the writer is a few hundred bytes — but the
      reading is

      **Before reading.** The entry chunk holds **245,616** bytes. The entry chunk and the
      chunks it loads with hold 260,724 bytes. The HUD chunk holds 62,293 bytes. The bound
      `ENTRY_CHUNK_LIMIT` is 260,000 and reads `index.js` alone.

## 1. The public surface widens, before any file moves

The demo reaches five library members the entry point does not carry. Settle all five
first, so the move is a move and not a move plus a redesign.

- [x] 1.1 Change `src/app/main.ts` to import `MapView` from `./create-map` in place of
      `View` from `../camera/view`. The two are structurally identical, so no other line
      changes; verify `pnpm exec tsc --noEmit` is clean
- [x] 1.2 Change `createFragmentWriter` in `src/app/url-view.ts` to take `MapView`, and
      export `createFragmentWriter`, `FragmentWriter` and `FragmentWriterOptions` from
      `src/index.ts`
- [x] 1.2a Change `encodeView` and `decodeView` in `src/app/url-view.ts` to name `MapView`
      as well, importing it type-only from `./create-map` — `create-map.ts` does not import
      `url-view`, so there is no cycle. `decodeView` returns `View`, which `src/index.ts` does not export, so the
      built declaration references a name a host cannot import. The two types are
      structurally identical, so no caller breaks. **Verify against the built
      `dist/types/app/url-view.d.ts`**, which is the file that carries the defect: it holds
      `import type { View } from '../camera/view'` and names `View` in both signatures.
      Assert that no signature in that file names `View`. Do not assert against
      `dist/types/index.d.ts`: that file is eight re-export lines and names no type at all,
      so a check on it passes today, before the fix. Compiling
      `const v: MapView = decodeView(fragment)` is not a check either: it passes today,
      because TypeScript matches the two by shape
- [x] 1.3 Add `src/testing.ts`, which re-exports `galaxyMapGlobal`, `GalaxyMapGlobal` and
      `TestView` from `src/render/global.ts`, and add `./testing` to `exports` and a third
      entry to the library build pointing at it.
      Add the comment that says it is not the supported surface and why: `context.ts`
      writes the renderer string there, and that write is what makes a software fallback
      fail the browser suite
- [x] 1.3a Update `src/index.test.ts`, which task 1.2 breaks. Task 1.3 does not: that
      file imports `./index` and reads `./index.ts` alone, and task 1.3 adds a separate
      `src/testing.ts` it never looks at. That file is the
      guard that holds the barrel to the export list this capability states, and it asserts
      the list **exactly**, twice: `Object.keys(library).sort()` against `PUBLIC_CALLS`, and
      the declaration's names against `PUBLIC_CALLS` plus `PUBLIC_TYPES`. Task 1.2 adds
      `createFragmentWriter`, which is a **value**, so the first assertion fails; it adds
      `FragmentWriter` and `FragmentWriterOptions`, so the second fails. Add the three. Rename the
      test `exports the four calls and no other value` to name five. **Keep both assertions exact** — do not loosen either to `toContain`, because the
      exactness is what stops the surface growing without a reviewer seeing it.
      `make-nebulae-optional` task 4.4a-i owns adding `NebulaSource` to `PUBLIC_TYPES` in
      this same file and lands first, so **check it is there rather than adding it twice**,
      the same split as task 5.4c
- [x] 1.4 Verify the `./testing` entry point **both** ways, which is the scenario "The
      testing entry point carries the probe object". The negative half: the main entry point
      does not re-export `galaxyMapGlobal`, by a test that imports it from the built main
      declaration and expects the compile to fail. The positive half: the built `./testing`
      declaration does carry `galaxyMapGlobal`, `GalaxyMapGlobal` and `TestView`. A negative
      test alone passes on an entry point that exports nothing at all. The scenario asks for
      more than the declaration: it imports the built entry point at run time, calls
      `galaxyMapGlobal` **with a stub window** — the function takes
      `scope: Window = window`, so it accepts one — and reads back `renderer`, `ready` and
      `error`. Write that call, not only the type check
- [x] 1.5 `git mv src/app/demo-systems.test.ts tests/demo-systems.test.ts` and fix its
      **seven** distinct relative paths, over ten import lines: five `demo-data/*.json`
      files and two `scene-data/` modules, one of which is imported on three lines and the
      other on two; verify it passes. Its two `scene-data/` reaches then need no
      export, because `tests/` reaches package source by relative path
- [x] 1.6 Run `pnpm test` and `pnpm lint`; verify both pass with no file moved yet. This
      is the checkpoint that separates the surface change from the restructure

      Clean: `pnpm lint` no output, `pnpm exec tsc --noEmit` no output, `pnpm test`
      82 files and **1196** tests passed. The three added tests are the fragment writer
      compile, the `./testing` entry point and the `url-view` declaration reading. The
      entry chunk reads **245,833** bytes after group 1, 217 bytes over the before
      reading, which is the fragment writer entering the chunk.

## 2. The workspace, before any file moves

- [x] 2.1 Change `pnpm-workspace.yaml` to name `packages/*` and `apps/*`, keeping
      `minimumReleaseAge: 10080` and its comment block unchanged

      The file also gains a `minimumReleaseAgeExclude` naming
      `@elite-dangerous-almanac/core`, which the maintainer asked for during this change.
      The hold guards against a hijacked **third-party** maintainer account, and that
      package is the project's own, so the week of distance buys nothing and costs a week
      on every fix. `AGENTS.md` asks for the reason to sit in the change proposal rather
      than for the hold to be lowered for everything, and proposal.md now carries it. The
      hold stays at 10080 minutes for every other package.
- [x] 2.2a Name which root scripts delegate and which stay, because "every script
      delegates" is wrong for four of the nine. The five that delegate with `pnpm --filter`
      are `dev`, `build`, `build:demo-site`, `build:demo-data` and `preview`. The four that
      **stay at the root** are `test`, `test:e2e`, `lint` and `format`: `tests/` and `e2e/`
      belong to no package, so a delegated `pnpm test` drops every root test file — nine on
      `main`, more after task 1.5 moves `demo-systems.test.ts` in and tasks 2.5a and 7.2
      add their own — and the 8 fixture tests, and `test:e2e` runs `node scripts/e2e.mjs` at the root. This matches
      design.md's "One root Vitest run, one root tsconfig, one root ESLint" and task 4.8's
      `vitest.config.ts` include list

      Decided as written. Five delegate: `dev`, `build`, `build:demo-site`,
      `build:demo-data` and `preview`. Four stay at the root: `test`, `test:e2e`, `lint`
      and `format`. Two more are new and stay at the root: `test:package` (task 7.1) and
      `audit` (task 9.6).
- [x] 2.2 Make the root `package.json` private, keep `packageManager`, and delegate **the
      five scripts task 2.2a names** with `pnpm --filter`. The other four stay at the root,
      for the reason 2.2a gives: `tests/` and `e2e/` belong to no package. Keep the names `dev`, `build`, `build:demo-site`,
      `build:demo-data`, `preview`, `test`, `test:e2e`, `lint` and `format`, because the
      README, `AGENTS.md`, the CI workflow and four specs name those strings
- [x] 2.2a-i Verify the delegating scripts still **forward arguments**. Three places pass
      an argument through one: `.vscode/launch.json` line 14 (`pnpm dev --strictPort`) and
      line 24 (`pnpm build:demo-site && pnpm preview --strictPort`), and `AGENTS.md`'s
      working agreement `pnpm dev --host 0.0.0.0`. A `pnpm --filter` script has one more
      hop for the argument to cross, and a flag pnpm reads itself never reaches Vite. Run
      all three and check the flag takes effect — a dev server on a busy port must fail
      rather than pick the next one. If a flag does not cross, set the option in the
      demo's `vite.config.ts` and repoint the three callers. Task 10.3 calls `.vscode/`
      clean, which is true of its paths but not of this

      **All three flags cross both hops.** With port 5173 held, `pnpm dev --strictPort`
      runs `vite --strictPort` and fails with `Port 5173 is already in use`. With port 4173
      held, `pnpm preview --strictPort` fails the same way. `pnpm dev --host 0.0.0.0` prints
      the `Network:` line. No option moves into the demo's `vite.config.ts`, and the three
      callers stay as they are.

- [x] 2.3 Add `packages/galaxy-map/package.json`, named
      `@elite-dangerous-almanac/galaxy-map` at version `0.5.0`, with `type`, `exports`
      carrying all three entry points, `types`, `files`, `sideEffects`, `publishConfig`,
      `description`, `author`, `license`, `repository`, `homepage`, `bugs` and `keywords`

      **The version is 0.6.0, not the 0.5.0 this line names.** The tree carried 0.6.0
      before this change started and the maintainer chose to keep it. The spec delta and
      `design.md` are corrected; this line is left as it was written.

- [x] 2.4 Put `gl-matrix` and `@elite-dangerous-almanac/core` in the library's
      `dependencies` and the **two** `@fontsource` packages — `chakra-petch` and
      `ibm-plex-mono` — in its `devDependencies`. They are two packages, and
      `src/hud/styles.ts` imports three `.woff2` files from them. Verify by test that
      `dependencies` holds those two and nothing else
- [x] 2.4a Decide and record where the tooling `devDependencies` live — `vite`, `vitest`,
      `typescript`, `eslint`, `prettier` and `@playwright/test`. They can stay in the root
      manifest, because pnpm puts the workspace root's `node_modules/.bin` on the PATH of a
      package script, and the library package's own `build` script calls `vite`. Task 2.4
      settles only the four run-time packages, so say the decision was made rather than
      leaving it to whoever runs the install

      **Decided: the tooling stays in the root manifest.** `vite`, `vitest`,
      `typescript`, `eslint`, `prettier`, `@playwright/test` and the ESLint plugins are
      root `devDependencies`. pnpm puts the workspace root's `node_modules/.bin` on the
      PATH of a package script, so the library package's `build` calls `vite` and `tsc`
      with no manifest of its own for them. One copy, one version, one place to move it.
- [x] 2.5 Add `apps/demo/package.json`, private, named
      `@elite-dangerous-almanac/galaxy-map-demo`, depending on the library with
      `workspace:*`, and holding the `build:demo-data` script
- [x] 2.5a Write the tests for the three package-identity scenarios this change adds. In
      `tests/` (beside the other manifest tests): one reads
      `packages/galaxy-map/package.json` and asserts the published identity fields of task
      2.3, and one asserts the demo's manifest depends on the library at `workspace:*` and
      is `private`. The third scenario, "The entry point exports the fragment writer", is
      **not** a manifest test: it reads "compiles a host module that imports
      `createFragmentWriter`, `FragmentWriter` and `FragmentWriterOptions` from the built
      main declaration", which is the generated-compile pattern of
      `tests/main-bundle.test.ts` at lines 488-510. Task 5.4c puts the three names into
      `PUBLIC_TYPES` there, which is what makes that compile cover them. Each scenario of
      the delta gets a test, which is what `rules.tasks` in `openspec/config.yaml` asks for
- [x] 2.6 Run `pnpm install` and commit the regenerated `pnpm-lock.yaml`; verify no
      dependency version moved, by comparing the resolved versions with the ones before
      the change. A version that moved means the 7-day hold resolved something new, and
      that is a separate decision

      `pnpm install` reported "Already up to date" over 3 workspace projects. The
      lockfile diff is 22 added and 13 removed lines, all of them in `importers`: the
      four run-time packages move off the root importer and on to `packages/galaxy-map`,
      split between `dependencies` and `devDependencies`, and `apps/demo` gains the
      `workspace:*` link. **No resolved version moved**: the sorted list of every
      `resolution: {integrity: ...}` line is identical before and after.

## 3. The move, with no content change

- [x] 3.1 `git mv` the library tree to `packages/galaxy-map/src/`: `src/` less the five
      demo files. Use `git mv` so the rename stays detectable in the history
- [x] 3.2 `git mv` the five demo files to `apps/demo/src/`: `app/main.ts`,
      `app/multifaction.ts`, `app/multifaction-message.ts`, `app/multifaction.worker.ts`
      and `app/multifaction.test.ts`
- [x] 3.3 `git mv src/render/global.ts packages/galaxy-map/src/render/global.ts` with the
      rest of the library tree. It stays library-side; task 1.3 gave it its entry point.
      Record here that the decision is made and why, so no reader thinks it is open

      **Decided and done.** The file is at
      `packages/galaxy-map/src/render/global.ts`. `src/render/context.ts` writes the
      unmasked renderer string and the error text into that object, so moving it to the
      demo would make `context.ts` stop writing it, or write it through a callback the
      demo supplies. Either puts the software-fallback assertion on a path a mistake can
      quietly remove. Task 1.3 gave the object the `./testing` entry point instead.
- [x] 3.4 `git mv` `index.html`, `demo-data/`, `public/` and
      `scripts/build-demo-systems.mjs` with its `.d.mts` into `apps/demo/`
- [x] 3.5 `git mv vite.config.lib.ts packages/galaxy-map/vite.config.ts`,
      `git mv vite.config.ts apps/demo/vite.config.ts` and
      `git mv tsconfig.build.json packages/galaxy-map/tsconfig.build.json`
- [x] 3.6 `git mv THIRD_PARTY_NOTICES.md packages/galaxy-map/THIRD_PARTY_NOTICES.md`.
      One copy, not two. Update `tests/third-party-notices.test.ts` for the new path
- [x] 3.6a Repoint the paths **inside** the notices file. It names 17 of them in its prose:
      `src/scene-data/nebulae.json`, `src/render/nebula-art.webp`, `src/galaxy-model/`,
      `src/app/multifaction.ts`, `src/app/markers.ts`, six `demo-data/*.json` files, four
      reaches to `scripts/build-demo-systems.mjs`, `public/EDLoader1.svg` at line 293 and a
      bare `public/` at line 310. After the move
      the file sits in `packages/galaxy-map/` while about half the paths it names are in
      `apps/demo/`. The test asserts with `toContain` on source names, so **nothing fails**
      — this is the quiet kind, like `.prettierignore` in task 4.3b, and it is the file the
      list is otherwise most careful about

      All **19** path mentions are repointed, and a grep finds no bare `src/`,
      `demo-data/`, `public/` or `scripts/` path left. They stay
      **repository-root-relative**, so the file reads the same from the repository as it
      does inside the tarball. Task 6.6 records for the maintainer that the tarball then
      documents sources the package does not carry.
- [x] 3.7 Commit the moves alone, with no edit in the same commit, so a reviewer reads the
      move and the edits apart

      Commit `066c230`, **265 renames and 0 content change**. The branch is
      `publish-library-package`; the maintainer chose a branch over `main`. Commit
      `9aba742` before it holds groups 1 and 2, so the surface change and the workspace
      manifests are read apart from the move as well.

## 4. The configurations

- [x] 4.1 Fix the relative paths inside the two Vite configurations. The library config
      keeps `publicDir: false`, the external rule, the worker settings and now three
      entries; the demo config keeps the base path, the two ports and the worker format
- [x] 4.2 Add the **three** `resolve.alias` entries to `apps/demo/vite.config.ts`, with
      the `./nebulae` and `./testing` subpaths **before** the bare name, because a string
      alias matches an importee that starts with the alias plus `/` — the bare name first
      would resolve `.../testing` to `packages/galaxy-map/src/index.ts/testing`. Verify by
      test that the demo build resolves all three to the library source
- [x] 4.2a Add `compilerOptions.paths` to the root `tsconfig.json`, mapping all three
      package specifiers to the library's source. Without it `moduleResolution: "bundler"`
      resolves the demo's package-name imports through `exports` to `dist/types/`, which
      does not exist on a fresh checkout — and the check job runs the type check two steps
      before the library build. Verify `pnpm exec tsc --noEmit` is clean on a tree with no
      `dist/`
- [x] 4.2b Write the test for "The dev server resolves the map from source". It is the
      scenario that proves task 4.2's alias table is **complete**, and it is the one a
      manual check silently skips. Without it, an alias table missing one of the three
      entry points passes every other test in the list.
      **Do not delete `packages/galaxy-map/dist/` to force the case.** `vitest.config.ts`
      sets no pool or isolation option, so Vitest runs test files in parallel workers, and
      `tests/demo-site-build.test.ts` runs `pnpm run build` and then asserts `dist/index.js`
      and `dist/types/index.d.ts` exist at its lines 44-47. A test that removes that
      directory races it. The tree already avoids this: `tests/main-bundle.test.ts` and
      `tests/naming-tables.test.ts` both build into `mkdtempSync` directories.
      Assert the same guarantee without deleting anything: start the dev server with Vite's
      `createServer`, resolve each of the three specifiers through it, and check each one
      lands under `packages/galaxy-map/src/` and none under `dist/`. A missing alias falls
      through to node resolution and lands in `dist/`, which is the failure this catches.
      This runs under Vitest with no browser and no GPU, which the earlier wording of the
      scenario ("the map draws") did not
- [x] 4.3 Point the demo build at `dist` rather than `dist-demo`, and give the `ignores`
      list of `eslint.config.js` the two new globs. That list holds `dist/**` and
      `dist-demo/**`, which are anchored and stop matching. `.gitignore` (`dist/`,
      `dist-demo/`) and `.prettierignore` (`dist`, `dist-demo`) need **no new pattern**:
      neither entry holds an internal slash, so under gitignore semantics both already
      match `packages/galaxy-map/dist/` and `apps/demo/dist/` at any depth. Delete the
      stale `dist-demo` entry from all three, and verify no `dist-demo` string is left in
      the tree outside archived OpenSpec artifacts
- [x] 4.3a Fix the `data/**` ignore glob in `eslint.config.js`.
      `scripts/build-demo-systems.mjs` computes its root as its own parent directory, so
      once it sits at `apps/demo/scripts/` it fetches into `apps/demo/data/`, which
      `data/**` no longer matches. Two of those fetched sources are another project's
      JavaScript, which `AGENTS.md` says this project does not own and must not lint.
      Verify by dropping a file with a lint error into the new path and checking the lint
      stays clean
- [x] 4.3b Repoint the eight root-anchored entries of `.prettierignore` that stop matching
      after the move: `src/galaxy-model/galaxy-model.json`, `src/scene-data/nebulae.json`
      and the six `demo-data/*.json` files. This is the quiet one. The first two are pinned
      **by the SHA-256 of their bytes** — `tests/fixtures/galaxy-model.test.ts` and
      `src/scene-data/nebulae.test.ts` — so one `pnpm format` run after the restructure
      reformats them and fails those hashes. The `demo-data/` six make the tree dirty on
      the next `pnpm build:demo-data`, which is what the comments in `.prettierignore`
      already warn about
- [x] 4.4 Update the root `tsconfig.json` include list, which names `*.config.ts` at the
      root and so stops covering the two Vite configurations once task 3.5 moves them; and
      `packages/galaxy-map/tsconfig.build.json`, which needs exactly **two** edits: its
      `"extends": "./tsconfig.json"` must climb to the root configuration once task 3.5
      moves the file, and its `exclude` names `src/app/main.ts`, which has left the package
      — drop that entry. `rootDir`, `outDir` and `include` resolve relative to the
      configuration file, so they are already right after the move; editing them is the
      wrong edit.
      Verify `pnpm exec tsc --noEmit` is clean and that the declaration build writes a
      declaration for each of the three entry points
- [x] 4.5 Update `eslint.config.js`: the **three** blocks that carry rules — holding four
      restricted rules between them — take the new globs, and the
      `window.location` block loses its `ignores`. Verify the lint fails on a
      `window.location` read added to `packages/galaxy-map/src/app/create-map.ts` and
      passes on the demo page

      The tree holds **four** rule-carrying blocks, not three: the nebula block landed with
      `make-nebulae-optional` after this task was written. All four take the new globs.

- [x] 4.6 Add the rule that no file under `apps/demo/src/` imports the library by a
      relative path. Scope it to `apps/demo/src/` alone: `e2e/` and `tests/` reach package
      source by relative path on purpose, and that stays legal. **This lint rule is the
      test** for the two demo-boundary scenarios of the delta — "The demo page reaches no
      library internal" and "the demo imports by package name" — so no separate test file
      is written for them. Verify the rule fails on a relative reach added to
      `apps/demo/src/main.ts`, rather than only that the lint passes
- [x] 4.7 Add a unit test that the `window.location` rule ignores no file and that its
      pattern covers every source file of `packages/galaxy-map/src/`
- [x] 4.8 Update `vitest.config.ts` to include `packages/*/src`, `apps/*/src` and
      `tests/`; verify `pnpm test` runs the same number of test files it ran before the
      move, and write the two figures here

      **Before:** 82 test files, 1193 tests. **After:** 85 test files, 1206 tests. The three
      added files are `tests/demo-resolution.test.ts` (task 4.2b),
      `tests/lint-config.test.ts` (task 4.7) and `tests/package-identity.test.ts` (task
      2.5a). No test file is lost: `src/app/demo-systems.test.ts` moves to `tests/` and
      `src/app/multifaction.test.ts` moves to `apps/demo/src/`.

- [x] 4.9 Check `playwright.config.ts`, which probably needs no edit: its `webServer.command`
      calls the root scripts `pnpm build:demo-site && pnpm preview`, whose names task 2.2
      keeps, and the file holds no `dist` path of its own. Verify the suite still builds and
      serves the demo on 4173 under the Pages base path rather than assuming either way. The
      old task text named a demo build command and a new output
      path; verify the suite still builds, serves on 4173 under
      `/Elite-Dangerous-Galaxy-Map/` and finds the page

      **No edit needed, and verified rather than assumed.** `pnpm build:demo-site` writes
      `apps/demo/dist/`, and `pnpm preview` serves it: `GET
      http://localhost:4173/Elite-Dangerous-Galaxy-Map/` answers 200 and `GET
      http://localhost:4173/` answers 302 to the base path.


## 5. The paths inside `index.html`, `e2e/` and `tests/`

Neither `e2e/` nor `tests/` moves. Both hold paths that do, and so does the page.

- [x] 5.0 Fix `apps/demo/index.html` line 74:
      `<script type="module" src="/src/app/main.ts">`. Group 3 moves the file and changes
      no content, so this is the first content edit the page needs. Verify the demo dev
      server and `pnpm build:demo-site` both find the entry
- [x] 5.1 Repoint the **22** relative reaches into `../src/` across `e2e/`. The figure is
      22 and not 20 because `e2e/nebulae.spec.ts`, which `add-nebulae` writes, holds two.
      Verify by a grep that no `../src/` string is left in `e2e/`, and that
      `pnpm exec tsc --noEmit` is clean

      The tree holds **24** reaches and not 22: `e2e/regions.spec.ts` and
      `e2e/shapes.spec.ts` each hold one the figure did not count. All 24 are repointed,
      `grep -rn "\.\./src/" e2e` finds nothing, and `pnpm exec tsc --noEmit` is clean.

- [x] 5.1a Repoint the six `../src/` reaches of `tests/region-views.ts`. It is a helper
      and not a `*.test.ts`, so neither the grep of 5.1 nor the file list of 5.5 reaches
      it
- [x] 5.1b Repoint the **seven** `../src/` reaches of `tests/region-views.test.ts`. It is
      the sibling of the helper 5.1a names and holds reaches of its own
- [x] 5.1c Repoint the eight `tests/fixtures/*.test.ts` files. Two kinds of path break in
      them. Seven hold **19** reaches into `../../src/scene-data/` and
      `../../src/galaxy-model/`, and six import `../../scripts/build-demo-systems.mjs`,
      which task 3.4 moves to `apps/demo/scripts/`. `galaxy-model.test.ts` and
      `galaxy-detail.test.ts` read `galaxy-model.json` and `galaxy-detail.png` **by URL**,
      so `pnpm exec tsc --noEmit` does not catch those two; check them by running the tests
- [x] 5.1c-i Repoint the demo build script's own reach into the library. Line 12 of
      `scripts/build-demo-systems.mjs` holds
      `import galaxyModel from '../src/galaxy-model/galaxy-model.json' with { type: 'json' }`.
      Task 3.4 moves the script to `apps/demo/scripts/` and group 3 moves the JSON to
      `packages/galaxy-map/src/galaxy-model/`, so the relative path points at nothing. It
      becomes `../../../packages/galaxy-map/src/galaxy-model/galaxy-model.json`. This is
      not only a broken script: the six fixture tests of task 5.1c import the script as a
      module, so a failed static import fails those six files at import time and
      `pnpm test` breaks. Verify by running `pnpm build:demo-data --help` or the six tests,
      not by reading the path
- [x] 5.1d Fix `tests/naming-tables.test.ts`, which runs `pnpm exec vite build` with its
      `cwd` at the repository root. After the move the root holds no Vite configuration and
      no page, so the build must run in `apps/demo`
- [x] 5.2 Repoint the `tests/fixtures/` JSON fixtures read by `src/galaxy-model/model.test.ts`,
      `src/galaxy-model/detail.test.ts` and `src/scene-data/nebulae.test.ts`. The three
      files move and the fixtures do not, so each relative path changes depth
- [x] 5.2a Repoint `tests/demo-systems.test.ts`, which task 1.5 created. All seven of its
      distinct paths — the five `demo-data/*.json` files and the two `scene-data/` modules
      — move again in group 3
- [x] 5.3 Rewrite the assertion of `tests/workflow.test.ts` that reads
      `scripts.build` for `vite.config.lib.ts` and `scripts['build:demo-site']` as exactly
      `vite build`. Both are false after the move. Assert instead that the root script
      delegates with `--filter` and that the library package's own `build` names its Vite
      configuration. Do not delete the guard

      The guard stays and grows. `tests/workflow.test.ts` now reads both halves of the
      delegation: the root `build` is exactly
      `pnpm --filter @elite-dangerous-almanac/galaxy-map build`, the root `build:demo-site`
      is the matching `--filter` line, the library's own `build` names
      `vite build --config vite.config.ts`, and the demo's own `build:demo-site` is exactly
      `vite build`.

- [x] 5.4 Rewrite the assertions of `tests/main-bundle.test.ts` that read
      `manifest.files` as `['dist']` and the version as `0.4.0`. They now read the library
      package's manifest, `files` holds four entries, and the version is `0.5.0`. The
      packed-tarball test of group 7 is the stronger guard for `files`

      The version is **0.6.0**, not the 0.5.0 the task text names. The tree carried 0.6.0
      before this change started and the maintainer chose to keep it.

- [x] 5.4a Repoint the other **six** paths of `tests/main-bundle.test.ts`, which task 5.4
      does not touch: the build command that names `vite.config.lib.ts`, the
      `tsc -p tsconfig.build.json` command at line 250, the read of
      `demo-data/guardian-ruins.json`, the read of `src/scene-data/nebulae.json`, the read
      of `src/scene-data/region-lines.ts`, and the read of the root `package.json`, which
      is now the library package's. Both `execFileSync` calls also pass `cwd: root`, which
      after task 3.5 is a directory holding neither configuration
- [x] 5.4a-i Move the harness's temporary build directory into the library package.
      `tests/main-bundle.test.ts` line 231 calls `mkdtempSync(join(root, '.library-build-'))`
      and the comment above it says why: one test **imports the built module**, and Node
      resolves `gl-matrix` and `@elite-dangerous-almanac/core` by walking up to the root
      `node_modules/`. Task 2.4 moves both packages into the library's own manifest, so
      after `pnpm install` they are linked at `packages/galaxy-map/node_modules/` and are
      **gone from the root** — this repository has no `.npmrc`, pnpm uses the isolated
      linker, and the root `node_modules/` holds the root manifest's direct dependencies
      alone. The built entry keeps both as bare imports, so the test then fails with
      `ERR_MODULE_NOT_FOUND: gl-matrix`, which names a package rather than a layout and
      sends the reader to the wrong place. Build into
      `mkdtempSync(join(root, 'packages', 'galaxy-map', '.library-build-'))` and rewrite the
      comment to say why the directory now sits in the package. `.gitignore`
      (`.library-build-*/`) and `.prettierignore` (`.library-build-*`) hold no internal
      slash, so they still match at that depth. **The ESLint `ignores` entry does not**: it
      is `'.library-build-*/**'`, which carries an internal slash and is anchored to the
      repository root exactly as `dist/**` is, so the new path lints. Add
      `packages/galaxy-map/.library-build-*/**` to that list, or widen the entry to
      `**/.library-build-*/**`. Verify the ignore with `ESLint.isPathIgnored` against the new
      path, and verify the move by **running** the test rather than reading the path
- [x] 5.4c Fix the export-list assertions of `tests/main-bundle.test.ts`, which is
      `src/index.test.ts`'s defect in a second file. Line 470, in the test
      `the built module loads and creates a map`, asserts the **built** module's runtime
      names exactly against the four calls. Task 1.2 adds `createFragmentWriter`, a value,
      so the built `index.js` carries five and the assertion fails; the comment above it,
      "The barrel exports four values and the rest are types", goes false with it. Add the
      fifth name, fix the comment, and keep the assertion exact for the reason task 1.3a
      gives. Then add `FragmentWriter` and `FragmentWriterOptions` to `PUBLIC_TYPES` at
      line 114. That list is read by a `toContain` and by the generated compile at lines
      490-499, so a missing name **fails nothing** — it only means the two new types are
      never compiled against the built declaration, which is the quiet kind.
      `make-nebulae-optional` task 4.4b adds `NebulaSource` to the same list and lands
      first; check it is there rather than adding it twice
- [x] 5.4b Repoint `tests/demo-site-build.test.ts` on its own. It holds **eleven** `dist`,
      `dist-demo` and `demo-data` paths, at lines 21, 46, 47, 50, 51, 52, 72, 73, 74, 77 and
      83, and a header comment at lines 4-5 describing the old two-outputs-one-root
      arrangement, which this change removes. Line 77 is inside a `path.endsWith()` string
      rather than a `join()`, which is why a count of the `join` calls alone gives eight.
      Say what the rewritten test is **for**. Its "does not overwrite the library build"
      assertion goes hollow: after this change the two outputs sit inside their own packages
      and cannot collide, which is the design's stated reason `dist-demo/` disappears, so
      `demoFiles.some(p => p.endsWith('/dist/index.js'))` guards nothing. Either replace it
      with an assertion that carries weight or delete it and say why — do not leave a green
      assertion that cannot fail, which is the fault tasks 5.5a and 8.3 exist to fix
- [x] 5.5 Repoint the one `demo-data/` read of `tests/e2e-navigation.test.ts`, at line 89,
      to the demo app's directory. `tests/browser-suite.test.ts` and
      `tests/devcontainer.test.ts` hold no moved path at all, and
      `tests/third-party-notices.test.ts` is task 3.6's; verify all four pass
- [x] 5.5a Delete the vacuous case in `src/app/create-map.test.ts`. It calls
      `lintText(source, { filePath: 'src/app/main.ts' })` and asserts zero errors, with
      the comment "The page is the one file the rule leaves alone". After the move that
      path matches no config block, so the assertion passes and asserts nothing — a
      silent failure, not a loud one. Task 4.7 is its replacement. The same file holds two
      more `filePath` strings, at lines 398 and 403, both `'src/app/create-map.ts'`; repoint
      both to `packages/galaxy-map/src/app/create-map.ts`. Those two fail loudly
- [x] 5.5b Fix `HUD_FILE` in `src/hud/hud-boundary.test.ts`, which reads
      `'src/hud/scratch.ts'`. The same mechanism as 5.5a, but this one fails loudly
- [x] 5.5c Repoint the imports of the three demo modules. Group 3 moves them with "no
      content change", which leaves every import they hold either broken or pointing into
      the library. **Read the counts from the tree as it stands after
      `make-nebulae-optional` lands**, not from `main` — that change's task 8.1 adds an
      import of the nebula source to `src/app/main.ts`, and its task 8.2 writes the source
      on to the page. `apps/demo/src/main.ts` then holds **fifteen**: nine static imports
      at the top of the file, of which **eight** become package-name imports and **one**,
      `./multifaction`, stays relative because that file moves with the page. Those eight
      lines carry **seven** distinct specifiers, because `./create-map` is imported twice,
      once for the value and once for the types. The nebula import is the ninth line and the
      eighth package-name import, and it goes to
      `@elite-dangerous-almanac/galaxy-map/nebulae`; the list below names the six
      remaining specifiers. The scenario "The demo imports the map by its package name"
      says `src/app/main.ts` uses all three subpaths, and this is the
      one that makes that true. Of the eight, `./create-map` and `./url-view` **break
      outright** rather than merely
      pointing inward, because those two files stay in the library while `main.ts` leaves;
      `../render/global` goes to `@elite-dangerous-almanac/galaxy-map/testing`;
      `../camera/view` becomes `MapView` from the main entry, per task 1.1; and the two
      `../scene-data/` type imports go to the main entry. It also holds six dynamic
      `'../../demo-data/*.json'` imports, at lines 123, 135, 147, 160, 174 and 192 on
      `main` and one line lower after `make-nebulae-optional` lands; both ends move, so
      each becomes `'../demo-data/...'`. Match on the import text, not the line number.
      `apps/demo/src/multifaction.ts` line 15 and `apps/demo/src/multifaction-message.ts`
      line 3 each hold one `../scene-data/real-systems` type import, which becomes a
      package-name import as well. Verify with `pnpm exec tsc --noEmit` and
      `pnpm build:demo-site`, and check that task 4.6's rule passes rather than that it
      merely does not run
- [x] 5.6 Run `pnpm test`; verify the file count matches task 4.8 and that every test
      passes before the metadata work starts

      **After reading, 2026-09-20.** `pnpm test`: 85 test files, 1206 tests, 85 passed and
      0 failed, 1206 passed and 0 failed. The count matches task 4.8. `pnpm lint` is clean
      and `pnpm exec tsc --noEmit` is clean.


## 6. The terms and the package README

- [x] 6.1 Choose the non-commercial licence. Use a published one, not text written for
      this project. PolyForm Noncommercial 1.0.0 is the candidate design names. Put the
      text in **`LICENSE.md` at the repository root**, which is what GitHub reads

      **PolyForm Noncommercial License 1.0.0**, at `LICENSE.md` in the repository root. The
      text is the published one, taken from the SPDX license list data
      (`text/PolyForm-Noncommercial-1.0.0.txt`), and no word of it is changed. One line is
      added above the title, which the licence itself asks for:
      `Required Notice: Copyright 2026 Dark Session (...)`. It names the licensor, which the
      text does not otherwise carry.

      **The file says what the terms cover**, in a section below the published text. It
      names `THIRD_PARTY_NOTICES.md` and Frontier Developments, and says that a commercial
      use of the game data and the visuals needs new permission from Frontier. The
      published text is about the licensor's own software, so a reader of the licence
      alone would otherwise take it for the terms of everything the tarball carries. The
      section adds no condition. `tests/packed-tarball.test.ts` reads both names.

      **MIT was tried and reverted on 2026-09-20.** The maintainer asked for MIT, read
      what it grants, and put PolyForm back the same day. The reason is the one that chose
      PolyForm first: MIT permits commercial use of this project's code, the tarball also
      carries Frontier Developments' game data and art under media-usage rules that permit
      non-commercial use only, and this project cannot widen those rules. A licence file
      that reads as MIT alone over-states what ships, and a host who takes that grant at
      face value breaches Frontier's rules rather than this licence. PolyForm says the
      same thing as the data it ships beside. Do not change this without reading
      `THIRD_PARTY_NOTICES.md` first.

- [x] 6.1a Add a **`prepack`** script to `packages/galaxy-map/package.json` that copies the
      root `LICENSE.md` into the package. `prepack` and not `pnpm build`: `npm pack
      --dry-run` runs `prepack`, so the copy exists whenever the tarball is read, while a
      copy made by the build would not exist during `pnpm test`, which runs first. Copy it
      into `packages/galaxy-map/` so the tarball states terms too, and add the copy's path to
      `.gitignore`, `.prettierignore` and the ESLint ignores so there is one committed
      source. The test SHALL read the copy from the `npm pack --dry-run` file list and
      **not** from the package directory: `pnpm test` runs before anything is packed or
      built, so a directory read fails on a fresh checkout and in the check job

      `prepack` is `cp ../../LICENSE.md LICENSE.md`. The copy's path is in `.gitignore`,
      `.prettierignore` and the ESLint ignores. `tests/packed-tarball.test.ts` reads the copy
      from the pack of a temporary package directory, never from
      `packages/galaxy-map/LICENSE.md`.

- [ ] 6.2 **The maintainer approves the licence text before the first publish.** Record
      the approval here with the date. This is not the implementation's call

      **Open, and the maintainer's to close.** The text is in place at `LICENSE.md` and the
      identifier is in `package.json`. The implementation does not tick this box. Read the
      file and write the approval and the date here before the first publish.

- [x] 6.3 Set `license` in `package.json`: the SPDX identifier where npm accepts it, and
      `SEE LICENSE IN LICENSE.md` otherwise. Check which, rather than assuming, by running
      the packed-tarball check and reading npm's warning output

      **npm accepts the SPDX identifier.** `license` is `PolyForm-Noncommercial-1.0.0`, and
      `npm pack --dry-run` prints no licence warning, so `SEE LICENSE IN LICENSE.md` is not
      needed. Checked by running the pack and reading the whole output.

- [x] 6.4 Write `packages/galaxy-map/README.md`: what the package is, how it is installed,
      what it needs beside itself, a smallest working example, the `nebulae` option and
      the 811,762 bytes asking for it downloads, a line saying `./testing` is not the
      supported surface, the terms, and a link to the repository. It is not the
      repository's README

      **The nebula figure in this task is stale.** It reads 811,762 bytes; the art is
      **2,912,225** bytes, which is what `README.md` and `AGENTS.md` state and what
      `packages/galaxy-map/src/render/nebula-volumes.test.ts` asserts. `ceb2167` shrank the
      index after this task was written. The package README states 2,912,225.

- [x] 6.4a Write the test for "The package README is the package's own": it asserts the
      README **the tarball carries** exists, names the published package name, shows an
      import of the entry point and links to the repository, and is not a copy of the
      repository README. The scenario reads the packed file, not the one on disk, so read it
      the way task 7.2 reads the tarball
- [x] 6.5 Add `files` to the package: the build output, `README.md`, `LICENSE.md` and
      `THIRD_PARTY_NOTICES.md`
- [x] 6.6 Record here, for the maintainer to read: `THIRD_PARTY_NOTICES.md` holds 17
      sections, about eight of which cover demo-page data and three more demo-site assets.
      Moving the one copy into the package means the tarball documents sources the package
      does not carry, and the repository root loses the notices for the site it publishes
      to Pages. The decision stands as design.md states it. Say here whether the
      maintainer accepts it or wants the file split

      **The record, for the maintainer.** `packages/galaxy-map/THIRD_PARTY_NOTICES.md`
      holds 17 sections. Six cover demo-page data (the Guardian sites, the Guardian
      structures, the Notable Systems, the UIA map, the Adamastor routes and the Canonn
      factions), one covers the committed extracts of three of those sources, and three
      cover demo-site assets (the selection pin, the loading picture and the HUD mockup).
      Ten of the 17 therefore describe files the tarball does not carry, and the repository
      root now states nothing about the site it publishes to Pages.

      **The maintainer closed this on 2026-09-20: split the file.** The package's file
      keeps what the tarball carries, which is the almanac package, EliteDangerousRegionMap,
      the Frontier terms, the two font families, the selection pin and the naming tables.
      A new `THIRD_PARTY_NOTICES.md` at the repository root takes the six demo data sets,
      the committed extracts, the loading picture and the design mockup. Each source is in
      one file alone. The Frontier terms are the one statement in both, because the package
      ships game art and the demo site draws game data.

      The split also fixes a link the README already carried: `README.md` points at
      `THIRD_PARTY_NOTICES.md` beside it, which after the move was no file.

      Two sections went rather than moved, on the same instruction. The nebula records and
      the volume art fold into the game data section, which is now **Elite Dangerous game
      data and visuals (Frontier Developments)**: one source, one set of terms, and no
      section that gives one kind of game content a treatment of its own. The galaxy
      density model section went altogether, because it recorded that the model is this
      project's own work, and a notices file lists what the project does not own.

      `galactic-regions` read the notices as one file, so this change now carries a delta
      for it. `tests/third-party-notices.test.ts` reads both files, and it fails on a demo
      data set in the package file.

      **The gate read the split and returned APPROVE WITH NOTES.** Two notes were the
      implementation's, and both are acted on. Nothing read the "and the art" half of the
      new requirement: `Frontier` is in the section heading, so deleting the whole
      statement about the art passed every test. `tests/third-party-notices.test.ts` now
      reads the body of the Frontier section and requires the word `art` and the holder's
      name in it, and requires that the file names no nebula. The package file's one
      source path lost the repository-root-relative form task 3.6a set; it is back.

      **The maintainer then cut the format from that section.** It read that the art ships
      as KTX2 arrays of BC4 and BC1 blocks beside a transfer function and an index. A
      notice states who owns the work and on what terms; the container it ships in is no
      part of that. The section now says the data and the art are Frontier's property, and
      the test also requires that `KTX2` is absent. Checked by deleting `and the art it
      draws` from the section and watching the reading fail.

      **The third note is the maintainer's.** The nebula section ended with "This notice
      records what the files are; it does not settle whether they may ship", and the
      folded section does not carry it. The folded section says the opposite: the terms
      are Frontier's non-commercial media-usage rules, and `LICENSE.md` states the same
      terms for the package. Task 6.2 still holds the licence approval in front of the
      first publish, so a human gate remains. Say here if the caution is to come back in
      the Frontier section, which needs no mention of nebulae.


## 7. The packed-tarball check

- [x] 7.1 Add the `test:package` script, running `npm pack --dry-run --json` in the
      library package. It is a **root** script, because tasks 8.2, 9.5 and 12.1 all call
      `pnpm test:package` from the root. Task 2.2a's table is the nine scripts that exist
      today; this one and the `audit` of task 9.6 are the two new ones, and neither is in
      that table

      `test:package` is a root script: `vitest run tests/packed-tarball.test.ts`. It is one
      of the two scripts task 2.2a's table of nine does not hold.

- [x] 7.2 Add the test: the list holds `README.md`, `LICENSE.md`,
      `THIRD_PARTY_NOTICES.md` and `package.json`, no entry is under `src/`, none ends in
      `.test.ts`, none is under `openspec/` or `demo-data/`, and every other entry is
      under the build output
- [x] 7.2a Assert the **positive** half as well, which is the scenario "The tarball
      carries the built code": the list holds the entry chunk and the entry declaration
      under the build output. Every clause of task 7.2 is a negative or is conditional on
      "every other entry", so with `files: ["dist"]` and no `dist/` present the whole test
      passes on a tarball of four text files and no code. That is not a corner case: it is
      the state of the tree during `pnpm test`, and this test is the last guard before an
      irreversible publish. Task 7.3's mutation check does not cover it, because widening
      `files` to include `src` fails with or without `dist/`
- [x] 7.2b Say where the test file lives and whether `pnpm test` runs it. Task 2.5a puts
      the sibling manifest tests in `tests/`, which `vitest.config.ts` includes, and
      `pnpm test` runs **before** `pnpm build` in both the developer's run and the check
      job — `.github/workflows/ci.yml` line 65 against line 68. Choose one: build the
      library into a temporary directory inside the test, as `tests/main-bundle.test.ts`
      and `tests/naming-tables.test.ts` already do, or skip with a stated reason when no
      build output is present. Do not leave it silently green

      **The file is `tests/packed-tarball.test.ts`, and `pnpm test` runs it.** It needs no
      skip and no build order, because it **packs a copy**: it copies the package into a
      temporary directory under `packages/`, builds the library into that copy, and runs
      `npm pack --dry-run --json` there. That answers both hazards the task names. The build
      output of the tree may be missing, and it is not read. `tests/demo-site-build.test.ts`
      rewrites `packages/galaxy-map/dist/` in a worker of its own, and this test never reads
      that directory.

      The copy is of the **whole** package and not of the manifest alone. `files` is an
      include list, so a directory holding no `src/` packs no source however wide the list
      grows, and task 7.3's mutation would pass against a manifest-only copy.

      The temporary directory sits at `packages/.library-build-pack-*`, one level under
      `packages/`, because `prepack` copies `../../LICENSE.md` and that reaches the
      repository root from that depth alone. The name matches the `.library-build-*` entries
      of `.gitignore`, `.prettierignore` and the ESLint ignores.

- [x] 7.3 Verify the test fails when `files` is widened to include `src`, and passes when
      it is put back. A guard that has never failed is a guard nobody has checked

      **Both halves checked by mutation.** With `src` added to `files`, the test fails with
      `src/.gitkeep is a source file: expected 'src/.gitkeep' not to match /^src\//` and the
      manifest reading fails beside it. With `dist` taken out of `files`, `carries the built
      code` fails. With the manifest back as it is, all six tests pass.


## 8. The check workflow

- [x] 8.1 Update `.github/workflows/ci.yml`: the install runs at the workspace root, the
      build steps name the new output paths, and the Pages job uploads `apps/demo/dist`
- [x] 8.2 Add `pnpm test:package` as the sixth step of the check job
- [x] 8.3 Update `tests/workflow.test.ts` for the new step list and the new upload path;
      verify it passes and that it still checks every `uses:` line is a 40 character SHA.
      Two places break, and they break differently. Line 207 reads
      `join(root, 'vite.config.ts')`, which task 3.5 moves, so the test **throws ENOENT**
      rather than failing an assertion; the comparison under it also breaks, because
      `uploaded` becomes `apps/demo/dist` while the config's `outDir` becomes `dist`. Lines
      214-215 are the quiet one: the guard "does not upload the library build" matches
      `/path: dist\s*$/m` and `/path: dist\//`, and after the move the library build is
      `packages/galaxy-map/dist`, so both patterns pass **whatever the workflow says**. That
      is the same vacuous-assertion fault task 5.5a exists to fix

      Both places are fixed. The `vite.config.ts` read now names `apps/demo/vite.config.ts`
      and compares the upload path with `apps/demo/` plus the config's `outDir`. The quiet
      guard is gone: `does not upload the library build` now reads **every** `path:` of the
      publish job and fails on one that does not start with `apps/demo/`. The 40 character
      SHA reading is untouched and still passes.


## 9. The publish workflow

- [x] 9.1 Add `scripts/next-version.mjs`: it takes the `major.minor` of the package and
      the published version list and prints the lowest unused patch. The rule leaves the
      YAML so a test can reach it

      `scripts/next-version.mjs` exports `nextVersion(manifestVersion, published)` and runs
      as a script with two arguments: the manifest version and the JSON the registry
      answered. It prints the version on stdout, or writes the reason on stderr and exits
      non-zero, and it never does both.

      **One reading of the spec had to be settled.** The spec says "the lowest unused
      patch", and the same requirement says the script fails where the version "would move
      the `latest` tag behind a higher published version". The two cannot both hold over a
      gap: with 0.6.0 and 0.6.2 published, the lowest unused patch is 0.6.1, and that is
      exactly what the second rule refuses. The script therefore takes the lowest patch
      **above every published patch of the line**, which is 0.6.3, and the test says so in
      its name: `passes a gap rather than filling it`. npm refuses a version that was
      published and unpublished, so a hole cannot be filled in any case.

- [x] 9.2 Add its unit test, covering the **five** cases the spec names: no published
      version, a gap in the patch series, a published patch above every local one of the
      same `major.minor`, a `major.minor` with no release yet, and the regression case —
      local `0.4` while the registry holds `0.5.3`. Verify the first four print a version
      and the fifth fails with a message and prints none

      `tests/next-version.test.ts` runs the script as the workflow runs it and reads stdout,
      stderr and the exit status. Eight cases: the five the spec names, the registry's
      one-version answer (a bare string and not an array), a patch a pre-release used, and a
      manifest version the script cannot read.

- [x] 9.2a Replace the assertion of `tests/workflow.test.ts` at lines 70-72,
      `test('is the one workflow of the repository', () => expect(names).toHaveLength(1))`,
      which task 9.3 deliberately falsifies by adding a second workflow. **Do not delete the
      guard**: assert the repository holds exactly the two named workflows, `ci.yml` and
      `publish-npm.yml`, so a third still has to be argued for. The file reads `names[0]`
      below, which stays correct only because `ci.yml` sorts first — assert that rather than
      leave it to luck. This is a third assertion in the class design.md calls "Two existing
      assertions change, and that is the point"; add it to that section
- [x] 9.3 Add `.github/workflows/publish-npm.yml` on the shape of
      `DarkSession/Elite-Dangerous-Almanac/.github/workflows/publish-npm.yml`: dispatch
      only, a concurrency group that does not cancel, the default-branch check, the
      version step that calls the script, the registry and tag checks, the checks and the
      build, `npm pack`, the recorded digest, the artifact, the OIDC publish job with
      `--provenance`, and the tag and release job
- [x] 9.4 Adapt it for the workspace: install at the root, and run the steps that read the
      package or pack it with their working directory at `packages/galaxy-map`

      The install runs at the workspace root. Three steps take
      `working-directory: packages/galaxy-map`: the version step, which reads the manifest
      and asks the registry, and the pack step, which stamps and packs. The upload path is
      `packages/galaxy-map/${{ steps.pack.outputs.tarball }}`.

- [x] 9.5 Replace the reference's `pnpm run check` with this repository's root scripts, in
      the same order: lint, type check, unit tests, audit — and then the library build and
      `pnpm test:package`. The `continuous-integration` delta requires the workflow to run
      "the library build **and the packed-tarball check**" before it publishes, and task 8.2
      adds `test:package` to `ci.yml` alone

      The order is lint, type check, unit tests, audit, library build, packed-tarball
      check, and then `npm pack`. Each is a step of its own, so a failure names itself.

- [x] 9.6 Add the `audit` script and decide its level; record here what level and why. An
      audit that fails on every low advisory blocks every release

      **`audit` is `pnpm audit --audit-level high`.** High and critical are the levels that
      justify holding a release; a moderate or low advisory in a build-time dependency would
      otherwise block every publish and teach the maintainer to skip the step. The workflow
      runs `pnpm run audit` and not `pnpm audit --audit-level high`, so the level lives in
      one place. It passes today: `No known vulnerabilities found`.

- [x] 9.7 Add the digest step in the publish job: compute the SHA-256 of the downloaded
      tarball and compare it with the digest the pack job recorded, **before** the publish
      step
- [x] 9.8 Pin every action to a 40 character commit SHA with the version in a comment, and
      pin the npm client versions the pack and publish steps use; record both versions and
      the reason in a comment

      **The two npm clients are pinned as well.** The pack job installs **npm 11.19.0** and
      checks the version it got, because that client writes the tarball. The publish job
      takes **Node 24.19.0**, which carries **npm 11.17.0**, and checks that version:
      naming the Node release installs no new code in the job that holds `id-token: write`,
      and 11.17.0 is the client that supports Trusted Publishing. The reason is in the
      comment beside each step.

- [x] 9.9 Add the comment saying why the browser suite is not in this workflow, and that
      the maintainer runs `pnpm test:e2e` locally before dispatching
- [x] 9.10 Extend `tests/workflow.test.ts` with the ten scenarios the
      `continuous-integration` delta names: the trigger, the branch check, the tokenless
      publish job, the job graph, the version step, the version script, the digest check,
      the concurrency group, the step order and the pinned actions. Add an eleventh: the
      `describe('the Playwright suite')` guard reads `names[0]`, so it covers `ci.yml` alone
      and never reaches the new workflow — while task 9.9 makes the same promise about
      `publish-npm.yml` in a **comment**, which `withoutComments` strips, so nothing tests
      it. Assert the new workflow runs no Playwright command either

      `tests/workflow.test.ts` grew a `describe('the publish workflow')` block with 16
      readings, which covers the ten scenarios and the eleventh the task asks for: the new
      workflow runs no Playwright command, read with the comments stripped.

      **Two of the new readings were vacuous when first written and were fixed.** The job's
      comments name every flag the publish step passes, so `toContain('--provenance')` over
      the whole job passed with the flag deleted. The reading is now of the commands alone,
      and deleting the flag fails it.


## 10. The documentation

- [x] 10.1 Update `AGENTS.md`: the directory table takes the two package roots, the import
      rules take the new paths, the new `apps/demo/src/` rule, and the "Working
      agreements" name the new script paths
- [x] 10.1a Repoint the three links of `docs/galaxy-density-model.md`, at lines 4, 127 and
      141, which reach `../src/galaxy-model/galaxy-model.json`, `../galaxy-detail.png` and
      `../png.ts`. `docs/` stays at the repository root, which is a non-goal of this
      change, so nothing else in the directory moves — but the files those three links
      point at do
- [x] 10.2 Update `README.md`: **every `src/...`, `demo-data/` and `dist-demo/` reference in
      the prose**, not the dozen an earlier reading of this task claimed — they run to
      dozens across the file, and `make-nebulae-optional` tasks 8.4 and 8.4a edit the same
      file first, so any count taken now is wrong by the time this change starts. Sweep by
      grep until none is left, rather than to a number. That covers the directory table at
      lines 544-558, and then the layout, the scripts, the two build outputs, where
      `THIRD_PARTY_NOTICES.md` now lives, how to release, and the three things the
      maintainer must set up outside the repository — the npm Trusted Publisher, the
      GitHub environment named in the publish job, and the package's place in the
      `@elite-dangerous-almanac` organisation

      Swept by grep, not to a count. `README.md` now holds no `dist-demo`, and every
      `src/...` and `demo-data/` link names its package. The scripts table takes the two
      build outputs, `pnpm test:package` and `pnpm audit`. A new section, **The release**,
      gives the two steps of a release, says the workflow chooses the version, and names the
      three things the maintainer sets up outside the repository.

- [x] 10.2a Update the `context` block of `openspec/config.yaml` for the workspace layout.
      Line 9 says "src/ holds app/, galaxy-model/, scene-data/, render/ and camera/" and
      line 22 says "Application code lives in src/." Both are false after this change, and
      this block is what OpenSpec injects into **every future proposal, spec and design**,
      so a wrong layout there misleads every change that comes after. The non-goal "No
      change to the OpenSpec layout" is about where `openspec/` sits, not about what its
      context says. Follow the `AGENTS.md` caveat when editing this file: a list entry with
      a colon followed by a space parses as a YAML map and OpenSpec drops the block with no
      error, so check with `openspec instructions tasks --change <id>` that the text comes
      out

      Checked with `openspec instructions tasks --change publish-library-package`: the new
      lines come out, so no entry parsed as a YAML map.

- [x] 10.2b Repoint the `src/` line in the two review gate files:
      `.claude/agents/openspec-proposal-reviewer.md` line 58 ("Application code goes in
      `src/`.") and `.claude/agents/openspec-implementation-reviewer.md` line 61
      ("Application code lives in `src/`."). These two are what both mandatory gates read,
      so a stale layout there weakens every later review. They carry no generated-file
      marker and the `AGENTS.md` warning names the skill and command files, not the agents,
      so edit them directly
- [x] 10.2c Repoint three comments that describe the old layout and that no test reads.
      The proposal's Why names a comment in `src/index.ts` as one of the four things
      holding the library and demo boundary; it reads "`src/app/main.ts`, `index.html` and
      the demo data reach this module from nowhere", and all three of those move. Second,
      `vite.config.ts` and `vite.config.lib.ts` cross-reference each other by file name,
      and after the move both are named `vite.config.ts` in different packages — task 4.1
      covers the relative paths inside those two files, not the prose. Third,
      `.github/workflows/ci.yml` line 34 names the check job "Lint, types, unit tests and
      both builds", which task 8.2 makes wrong by adding a sixth step. None of the three
      fails a test, which is why they are listed: they are the same quiet class that tasks
      3.6a, 4.3b, 5.4b, 5.5a and 8.3 already cover

      All three. The barrel comment now says the page and the demo data are in the other
      package and reach the module by its name. The two Vite configurations name each other
      by their package path. `ci.yml`'s job name reads
      `Lint, types, unit tests, both builds and the packed tarball`.

- [x] 10.3 Update `.devcontainer/README.md` line 58, which reads "`vite.config.ts` sets
      `server.host: true`, so VS Code's port forwarding sees the server". Task 3.5 moves that
      file to `apps/demo/vite.config.ts`. A grep for `src/`, `demo-data/`, `dist/` and
      `dist-demo` misses it, which is why an earlier reading of this task called the file
      clean. `.vscode/` is genuinely clean. Verify `tests/devcontainer.test.ts` passes

      `tests/devcontainer.test.ts` passes, 7 tests.


## 11. The maintainer's setup, which no task can close

- [ ] 11.1 Create the npm Trusted Publisher for `@elite-dangerous-almanac/galaxy-map`,
      pointing at this repository and at `publish-npm.yml`
- [ ] 11.2 Create the GitHub environment the publish job names, and decide whether it
      requires a review
- [ ] 11.3 Confirm the `@elite-dangerous-almanac` organisation allows this package
- [ ] 11.4 Record here that all three are done, before the first dispatch

      **Open, and the maintainer's to close.** No step of this change can create the three.
      `README.md` records all three in its new **The release** section, and the publish
      workflow's header comment names them again. The first dispatch fails at its last step
      without them.


## 12. Before review

- [x] 12.1 Run `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm build:demo-site` and
      `pnpm test:package`; verify all five pass and paste the failing output here if any
      does not

      **All five pass, 2026-09-20.** `pnpm lint`: clean. `pnpm exec tsc --noEmit`: clean.
      `pnpm test`: 87 test files, 1236 tests, all passed. `pnpm build` and
      `pnpm build:demo-site`: both wrote their own package's `dist/`. `pnpm test:package`: 1
      file, 6 tests, all passed.

      **Run again after the first gate**, whose fixes added three tests: `pnpm lint` clean,
      `pnpm exec tsc --noEmit` clean, `pnpm test` 87 files and **1239** tests all passed,
      `pnpm test:package` 6 tests all passed.

      **Run again after the second gate**, whose fixes added one test: `pnpm lint` clean,
      `pnpm exec tsc --noEmit` clean, `pnpm test` 87 files and **1240** tests all passed,
      `pnpm test:package` 6 tests all passed, and `pnpm format` changed nothing.

- [x] 12.1a Run `pnpm format`, then `git status`. Verify the tree is clean. This is the
      check that shows the `.prettierignore` repointing of 4.3b actually holds: a missed
      entry reformats a byte-pinned data file and the next `pnpm test` fails on its
      SHA-256

      `pnpm format` changed the two documents this change rewrote and nothing else. No
      byte-pinned file moved: `git status` shows no change to
      `packages/galaxy-map/src/galaxy-model/galaxy-model.json`,
      `packages/galaxy-map/src/scene-data/nebulae.json` or the six `apps/demo/demo-data/`
      files, and `pnpm test` passes after the format run with the same 1236 tests. The
      remaining dirty files are this change's own work.

- [x] 12.2 Run `pnpm test:e2e` and compare it with the **before** reading of task 0.2.
      Verify the pinned baseline image is unchanged and that the pass and fail counts
      match. Run one Playwright suite at a time

      **The after reading matches the before reading exactly.** `pnpm test:e2e`: the
      parallel pass 556 passed and 0 failed, the timed pass 66 passed and 0 failed. The
      pinned baseline image is unchanged — `git status` reports no change under `e2e/`
      except the specs this change repointed.

- [x] 12.3 Measure the entry chunk reading and write it here beside the figure of task
      0.3. **The two are not expected to be equal**, for the two reasons task 0.3 gives: the
      fragment writer enters the chunk, and the third entry point may re-partition around
      `src/render/global.ts`. Check the direction and size of the difference against those
      two causes, and check the reading is under the bound. A difference neither cause
      explains is the signal to look for a restructure fault. Then **write the measured
      reading and the carried-forward bound into this change's `library-package` spec
      delta**, replacing the "carry forward" instruction with the two figures. Carry the
      bound forward from `make-nebulae-optional`; do not restate 266,996 or 270,000. The
      scenario below that requirement reads "under the bound this requirement records", so a
      requirement archived with no figure in it points at a bound that is not there

      **Before 245,616, after 245,833: 217 bytes more.** The entry chunk and the chunks it
      loads with read 261,172, against 260,724 before. The HUD chunk reads 62,299, against
      62,293.

      The 217 bytes are the first of the two causes task 0.3 names: `createFragmentWriter`
      and `FRAGMENT_THROTTLE_MS` now leave the barrel, so the build cannot shake them out.
      The second cause moved nothing: `src/render/global.ts` is in a chunk the entry loads
      with, as it was before the third entry point existed. Nothing else changed size, so
      there is no reading a restructure fault would explain.

      The bound is 260,000, carried forward from `make-nebulae-optional`, and it reads
      `index.js` alone. 245,833 leaves 14,167 bytes of room. Both readings and the bound are
      now in the `library-package` spec delta, which also states the 70,000 HUD bound the
      `The HUD chunk stays under its bound` scenario reads.

- [x] 12.4 Run the implementation review gate with the `openspec-implementation-reviewer`
      subagent and act on its verdict; verify the verdict is recorded before any human
      sees the work

      **First run: BLOCK.** Five findings. What changed for each:

      1. The `continuous-integration` delta said "the next unused patch", which reads as
         the lowest free number, while the same requirement forbids moving `latest`
         backwards. The two cannot both hold. The delta now states the rule the script
         follows: one above the highest published patch of the line, and a hole is not
         filled. The scenario says the gap case prints `0.6.3`.
      2. `packages/galaxy-map/THIRD_PARTY_NOTICES.md` named
         `packages/galaxy-map/src/app/multifaction.ts`. The file is
         `apps/demo/src/multifaction.ts`. The repoint of task 3.6a put the library prefix
         on a demo file.
      3. `no-restricted-imports` reads static imports alone, so a dynamic reach out of
         `apps/demo/src/` passed. Two `no-restricted-syntax` selectors over
         `ImportExpression > Literal.source` now fail one, and three cases in
         `tests/lint-config.test.ts` read them: the demo's own `../demo-data/` load passes,
         a dynamic `../../../packages/` reach errors twice, a static one errors once. The
         dynamic case was checked by deleting the rule and watching it fail.
      4. `packages/galaxy-map/src/app/create-map.test.ts` named
         `tests/location-rule.test.ts`, which does not exist. It is
         `tests/lint-config.test.ts`.
      5. `proposal.md` gave the nebula art as 811,762 bytes, which `ceb2167` made stale.
         It reads 2,912,225 now, and says which commit changed it. The two tautologies at
         `tests/demo-site-build.test.ts` compared walked paths with the directory they
         were walked from; they now read the two configured output directories and check
         neither sits inside the other. `prepack` called `cp`, which Windows has no copy
         of; it calls `node -e` with `copyFileSync` now, and a run of it writes the file.

      **Answered rather than changed:**

      - The `minimumReleaseAgeExclude` entry for `@elite-dangerous-almanac/core` is what
        the maintainer asked for in this session, and `proposal.md` records why.
      - `packages/galaxy-map/src/.gitkeep` is not this change's file. It is in the base
        commit `ceb2167` as `src/.gitkeep`, and the move carried it.
      - The three Prettier reflow hunks in `packages/galaxy-map/src/camera/view.ts` stay.
        They are what `pnpm format` produces, and reverting them makes the tree dirty
        again at task 12.1a.

      **Second run: BLOCK on one finding, with four notes.** The gate verified all five
      first-round fixes against the tree. What changed:

      1. The blocker: `AGENTS.md` and the `context` block of `openspec/config.yaml` both
         said "Every root script delegates with `pnpm --filter`". Five do — `dev`,
         `build`, `build:demo-site`, `build:demo-data` and `preview`. Six do not, for the
         reason task 2.2a records. The `context` block is injected into every later
         proposal, so the wrong sentence would teach the next change to delegate
         `pnpm test` and drop the 20 root test files. Both sentences now name the five
         and the six. `openspec instructions tasks` prints the new text, so the YAML
         colon caveat did not eat it.
      2. `README.md`, `proposal.md`, `design.md` and the `library-package` delta still
         read "the next free patch", which is the wording the first gate found
         contradictory. All four now state one above the highest published patch of the
         line. The scenario title in the `continuous-integration` delta changed with
         them; it is an ADDED requirement, so the rename is not a dropped scenario, and
         `openspec validate` passes.
      3. The scenario clause "`src/app/main.ts` uses all three" had no test. A second
         reading in `tests/demo-resolution.test.ts` lists the specifiers of
         `apps/demo/src/main.ts` and requires all three. It prints the five it found.
      4. The replacement for the vacuous assertion in `tests/demo-site-build.test.ts` was
         still constant-valued. It is removed rather than rewritten: no reading of two
         module constants can fail on a build fault, and the `.html` and `.d.ts` readings
         beside it are what a shared configuration breaks. A comment says so.
      5. The `camera/view.ts` reflow hunks: the gate confirmed the base commit carried
         lines of 89 and 90 characters against a `printWidth` of 88, so these are
         `pnpm format` output. No change.

      **Third run: APPROVE.** No new finding. The gate re-ran `pnpm lint`,
      `pnpm exec tsc --noEmit`, `pnpm test` (87 files, 1240 tests), `pnpm test:package`,
      `prettier --check .` and `openspec validate` itself, and read the seven files the
      second round of fixes touched. It records that six tasks stay open for the
      maintainer: 6.2, 6.6, 11.1 to 11.4 and 12.5. It also records that no test can run
      the publish workflow, so the first dispatch is where its guards run for the first
      time.
- [ ] 12.5 The first `workflow_dispatch` of the publish workflow is read **after the
      merge**, as the Pages scenario already is. No run before the merge can prove it
