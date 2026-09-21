## 1. Prove the two mechanisms before building on them

- [x] 1.1 Confirm `git clone https://github.com/Elite-Dangerous-Almanac/Galaxy-Map.wiki.git`
      into a scratch directory succeeds and holds `Home.md`. The wiki is already on, so this
      is a check and not a request to the owner; stop and ask only if the clone fails.
- [x] 1.2 Push a scratch tree to that clone — `Home.md`, `_Sidebar.md` with two `details`
      blocks, `A/Page-A.md` with `A/_Sidebar.md` that opens block A, and `B/Page-B.md`
      with `B/_Sidebar.md` that opens block B — then open both pages in a browser and
      confirm each shows its own block open and the other closed. Record the result in
      `design.md` under Risks, where the per-folder-sidebar risk is stated.
- [x] 1.3 On the same scratch tree, confirm the page URLs are flat (`/wiki/Page-A`, with
      no folder) and that a link written as `[Page-B](Page-B)` from `Page-A` resolves.
      This is what Decision 3 rests on.
- [x] 1.4 **Stop and report if 1.2 fails.** The "the section stays open" requirement has no
      second mechanism, so a failure goes back to the reader before any more work. Reset
      the wiki to one empty `Home` page when the checks are done.

## 2. Dependencies and the build skeleton

- [x] 2.1 `pnpm add -Dw typedoc typedoc-plugin-markdown` at the workspace root, and
      verify `pnpm-lock.yaml` records `typedoc@0.28.x` and a plugin version at or before
      `4.13.0` — the 7-day hold holds `4.13.1` back, and that resolution is correct.
- [x] 2.2 Add `typedoc.json` naming **two** entry modules — `src/index.ts` and
      `src/nebulae/index.ts` of `packages/galaxy-map`, and **not** `src/testing.ts`, whose
      exports the spec keeps out of the five sections — with the markdown plugin,
      breadcrumbs and page header off, **`disableSources: true`** — the "Defined in" link
      carries the commit the build ran on, which would rewrite every page on every push and
      make the "no commit, no change" rule of the publish job dead text — and the
      not-exported validation warning off, which `NebulaSet` and `NebulaVolumeSet` would
      otherwise raise. Verify with
      `pnpm exec typedoc --validation` that the configuration parses and names two entry
      points.
- [x] 2.3 Run `pnpm exec typedoc` and **record the directory listing it writes** in
      `design.md` under Decision 2: two entry points make a project of modules, and the
      plugin may nest the output per module rather than write one flat set of group
      directories. Verify the tree holds a page for `createGalaxyMap`, for `GalaxyMap` and
      for `nebulae`, and no `classes/` directory. The arrange pass of task 3.2 is written
      against this listing, not against a guess.
- [x] 2.4 Add `wiki-build/` to `.gitignore` with a comment saying what writes it, and add
      the root script `"docs:wiki": "node scripts/build-wiki.mjs"`. Verify
      `git check-ignore wiki-build` reports the path.

## 3. The build script

- [x] 3.1 Write the generate pass of `scripts/build-wiki.mjs`: run TypeDoc into a scratch
      directory under the system temp directory, and fail non-zero with the TypeDoc output
      where it fails. Verify `pnpm docs:wiki` reaches the end of the pass on a clean tree.
- [x] 3.2 Write the arrange pass against the listing of 2.3: merge the two modules into one
      set of sections, map each group to its wiki name (`interfaces/` to `Interfaces/`,
      `type-aliases/` to `Type-Aliases/`, `variables/` to `Variables/`, `functions/` to
      `Functions/`, `classes/` to `Classes/`), sort each section by name, drop a group with
      no page, **fail on a group directory the map does not name**, and **fail on a page
      name it has already written**, naming both sources. Verify with a unit test over a
      fixture tree that holds both modules, one unknown directory and one name exported by
      both modules: the members merge into one section, and each of the two faults fails the
      pass with its own message.
- [x] 3.3 Write the link rewrite: every link to another generated page becomes the bare
      page name. Verify with a unit test over a fixture page holding
      `../interfaces/GalaxyMap.md`, `./GalaxyMapOptions.md` and an external `https://` link
      — the first two become `GalaxyMap` and `GalaxyMapOptions`, the third is untouched.
- [x] 3.4 Copy the prose pages from `docs/wiki/` into the tree, and fail naming the file
      where one the sidebar expects is missing. Verify with a unit test that removes a
      fixture prose page and reads the message and the exit code.
- [x] 3.5 Write the sidebar pass: build **one** entry list — Overview, Getting started, The
      testing subpath, then the Examples block and each section block that holds a page —
      then write the root `_Sidebar.md` with every block closed and one `_Sidebar.md` per
      section folder with that block alone carrying `open`. Verify with a unit test that
      asserts exactly one `<details open>` per section file, none at the root, and that
      stripping the `open` attributes leaves every sidebar byte for byte the same.
- [x] 3.6 Make the script write nothing on a failure: build into a temporary directory and
      move it into place at the end. Verify with a unit test that forces 3.4's failure and
      asserts `wiki-build/` is unchanged.
- [x] 3.7 Add `scripts/build-wiki.d.mts` beside the script, as `scripts/ktx2.mjs` and
      `scripts/build-nebula-fixture.mjs` each have one, because `tests/wiki-pages.test.ts`
      imports the passes and `scripts/` is outside the `include` list of `tsconfig.json`.
      Verify with `pnpm exec tsc --noEmit`. Drop the file if the test ends up spawning the
      script instead of importing it, as `tests/next-version.test.ts` does.

## 4. The prose pages

- [x] 4.1 Write `docs/wiki/Home.md`: what the package is, what it needs, that the wiki is
      built from `main`, and links to Getting started, the Examples and the repository.
      Verify the links resolve to pages of the built tree, which the test of 5.4 asserts.
- [x] 4.2 Write `docs/wiki/Getting-started.md` from the package README's Install, What it
      needs and The smallest map sections. Verify the code block imports only exported
      members, which the test of 5.3 asserts.
- [x] 4.3 Write `docs/wiki/Testing-subpath.md` by hand — TypeDoc does not read that entry
      point — which states that `@elite-dangerous-almanac/galaxy-map/testing` carries no
      compatibility promise and names `galaxyMapGlobal`, `GalaxyMapGlobal` and `TestView`.
      Verify no page for those three names is in the five sections, which the test of 5.2
      asserts.
- [x] 4.4 Write the eight example pages under `docs/wiki/Examples/`: systems on the map, a
      record with details, the system icons, the HUD, the camera, spheres and lines, a
      dataset catalog, and the nebulae. Each carries one TypeScript block. Verify each page
      name collides with no exported member, which the test of 5.2 asserts.

## 5. The tests

- [x] 5.1 Add `tests/wiki-pages.test.ts`, which builds the tree once into a temporary
      directory and shares it across the cases rather than building per case. Verify the
      suite runs under `pnpm test`, and that the build runs exactly twice in the whole
      suite — once here and once for 5.5.
- [x] 5.2 Assert the page set: every name the main entry point and `./nebulae` export has
      exactly one page, every page in a section names an exported member, no page is named
      `GalaxyMapDebug`, no page name is used twice in the tree, and an empty section has no
      directory. Assert the stated scale in the same walk: under 100 pages and under 2 MB in
      total. Verify the case fails when an export is added by hand to the fixture list.
- [x] 5.3 Assert the prose: every page of the tree is named by **every** sidebar, every
      sidebar entry has a page, and every name imported from the package in an example code
      block is exported. Verify the case fails on an example that imports a name that does
      not exist.
- [x] 5.4 Assert every link of the built tree resolves to a page of the tree, sidebars
      included. Verify the case fails on a fixture page with a link to a page that is not
      there.
- [x] 5.5 Assert the build is deterministic: build once more into a second temporary
      directory and compare it with the tree of 5.1, byte for byte. Two builds in the suite,
      not three.
- [x] 5.6 Assert no generated page holds a 40 character hexadecimal string. Two builds in
      one run sit on one commit, so 5.5 cannot catch a commit SHA written into a page, and
      that is the fault that would add a wiki commit to every push. Verify the case fails on
      a fixture page holding a SHA.
- [x] 5.7 Assert `.gitignore` holds the build directory, and that `git status --porcelain`
      after a build names no path inside it. Do not assert the status is empty: a
      developer's tree holds their own work, and what matters is that the build adds nothing
      to it.

## 6. The pipeline

- [x] 6.1 Leave the check job of `.github/workflows/ci.yml` alone, and add a comment beside
      its `pnpm test` step saying the wiki build runs there. Verify `tests/workflow.test.ts`
      still asserts six commands and passes unchanged.
- [x] 6.2 Add the `publish-wiki` job: `needs: check`, the push-to-`main` condition,
      `permissions: contents: write` on the job alone, its own concurrency group, the build,
      the clone with `GITHUB_TOKEN` in the remote URL, the empty-and-copy, and a commit only
      where `git diff --cached --quiet` reports a change. Verify by reading the job back
      against `specs/api-wiki/spec.md`.
- [x] 6.3 Make the clone failure readable: where the wiki holds no page, the step exits
      non-zero with a message naming the repository setting to turn on. Verify by running
      the step's script locally against a wiki URL that does not exist, which needs no
      throwaway repository.
- [x] 6.4 Extend `tests/workflow.test.ts`: the `publish-wiki` job needs `check` and runs on a push to `main` alone, it holds
      `contents: write` and no other write permission, no step reads a personal access
      token, it holds a concurrency group of its own, and the Pages job's permissions are
      unchanged. Verify with `pnpm test`.

## 7. Documentation and the close

- [x] 7.1 Add the wiki to `README.md` and to `AGENTS.md`: the address, `docs:wiki` beside
      the other root scripts — `AGENTS.md` says six run at the root and it becomes seven —
      and the wiki setting in the list of things that live outside the repository, beside
      the three npm prerequisites. Update the same sentence in the project context of
      `openspec/config.yaml`, which is injected into every later proposal and would carry
      the stale count forward. Verify by reading all three files back.
- [x] 7.2 Link the wiki from `packages/galaxy-map/README.md`, in the opening section that
      already links to the repository. Verify the link resolves after the first publish.
- [x] 7.3 Run `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test` and `pnpm docs:wiki`, and
      report the output as it is. A failing suite is reported as failing.
- [x] 7.4 Read the built `wiki-build/` by eye: open the root sidebar, one section sidebar
      and three generated pages, and confirm the blocks, the order and the links read as
      the spec states.
- [x] 7.5 **GATE — implementation review, mandatory.** Launch the
      `openspec-implementation-reviewer` subagent with this change id, wait for the verdict,
      and fix what it blocks on. State the verdict and every finding when presenting,
      including the ones not acted on, and why.
- [ ] 7.6 After the merge and the first run on `main`, open the wiki: the Overview shows,
      the sidebar holds the collapsible sections, and opening a page of a section leaves
      that section open. This closes the one scenario the implementation cannot close by
      itself.
