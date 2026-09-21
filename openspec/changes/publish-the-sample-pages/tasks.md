## 1. The multi-page demo build

- [x] 1.1 Confirm `publish-the-api-wiki` is archived, and that `openspec validate publish-the-sample-pages` no longer reports the INFO on the `api-wiki` delta. Stop and say so if it is not archived: this change edits `docs/wiki/` and `scripts/build-wiki.mjs`
- [x] 1.2 Give `apps/demo/vite.config.ts` a `build.rollupOptions.input` that reads the demo page, every `examples/*/index.html` and `cycles/index.html` from the directory. Verify `pnpm build:demo-site` writes each page under its own path in `apps/demo/dist/`
- [x] 1.3 Widen the `no-restricted-imports` scope of [eslint.config.js](../../../eslint.config.js) from `apps/demo/src/**/*.ts` to `apps/demo/examples/**` and `apps/demo/cycles/**`. Add the case to `tests/lint-config.test.ts` that lints a synthetic file in the new scope, as the file already does for `apps/demo/src/probe.ts`. Verify `pnpm test tests/lint-config.test.ts` passes and fails without the rule
- [x] 1.4 Add `apps/demo/examples` and `apps/demo/cycles` to the `include` list of [tsconfig.json](../../../tsconfig.json), which names `apps/*/src` today and therefore type checks no page of either directory. Verify `pnpm exec tsc --noEmit` reports an error when a sample calls an exported member with a wrong argument, and passes when it does not
- [x] 1.5 Extend `tests/demo-site-build.test.ts`: the build writes the eleven pages, each page's asset URLs carry the base path, and the demo page keeps the address it has today. Verify `pnpm test tests/demo-site-build.test.ts` passes

## 2. The nine samples

- [x] 2.1 Write `apps/demo/examples/example.css` and the `index.html` of `the-hud`, with a canvas, the stylesheet and one module script. Verify `pnpm dev --host 0.0.0.0` serves `/Galaxy-Map/examples/the-hud/` and the map draws
- [x] 2.2 Write `apps/demo/examples/the-hud/main.ts` from the code block of [docs/wiki/Examples/The-HUD.md](../../../docs/wiki/Examples/The-HUD.md), with its own records, 60 lines or fewer, importing by the package name alone, and mark with `wiki:start` and `wiki:end` the part the wiki shows. Verify the page draws and `pnpm lint` passes
- [x] 2.3 Write `systems-on-the-map` and `a-record-with-details` the same way. Verify each page draws on the dev server
- [x] 2.4 Write `the-system-icons` and `spheres-and-lines`. Verify each page draws on the dev server
- [x] 2.5 Write `the-camera` and `the-view-in-a-url`, which are the two blocks of the camera page. Verify each page draws, and that the URL sample writes the fragment it reads back
- [x] 2.6 Write `a-dataset-catalog`, with the two small sets it holds itself, and `the-nebulae`. Verify each page draws, and that the nebula sample's marked region is the four lines the wiki page holds today
- [x] 2.7 Add `tests/sample-pages.test.ts`: the nine sample directories and the nine markers hold the same identifiers, each sample is 60 lines or fewer, each sample imports the package name or `./nebulae` alone, each sample holds at most one closed `wiki:start`/`wiki:end` pair, and no sample reads `demo-data/`, `./testing` or `map.debug`. Verify `pnpm test tests/sample-pages.test.ts` passes
- [x] 2.8 Add `e2e/samples.spec.ts`: open each of the nine pages against the built site, poll the centre of the canvas until it is not the background, and fail on a page error. Verify with `GALAXY_MAP_E2E_BUILT=1 pnpm exec playwright test e2e/samples.spec.ts`, with no other Playwright run going

## 3. The wiki reads the sample source

- [x] 3.1 Replace each code block of the example pages of `docs/wiki/Examples/` with one marker line, `<!-- sample: <id> -->`, and keep the prose and the headings around it. Verify every marker names a directory of `apps/demo/examples/`, and that the camera page carries two markers
- [x] 3.2 In `scripts/build-wiki.mjs`, make `copyProse` replace each marker with the sample's marked region, or its whole file, as a TypeScript block, and with the link to the published sample page, from one address constant. Verify `pnpm docs:wiki` writes the block and the link into `wiki-build/Examples/The-HUD.md` and two of each into `The-camera.md`
- [x] 3.3 Make the same pass fail, and name the page and the marker, on a marker that names no directory, on an example page with no marker, on two markers that name one sample, and on a sample with an unclosed marked region. Verify each of the four with a fixture, as `tests/wiki-pages.test.ts` does today for a missing prose page
- [x] 3.4 Repoint the "import exported members alone" case of `tests/wiki-pages.test.ts` at the built tree, which is where the generated block now sits, and add the cases that the block is the bytes of the sample's region and that each block carries its live address. Verify `pnpm test tests/wiki-pages.test.ts` passes, and that it fails when a sample imports a name the package does not export

## 4. The cycles data build

- [x] 4.1 Write `apps/demo/scripts/build-cycle-sets.mjs`: read the file list of `By Cycle` from the GitHub contents API, fetch each file into the ignored `apps/demo/data/cycles/`, and convert each one with `convertOverwatch`. Verify it fails and names the address when the file list cannot be read
- [x] 4.2 Write the output pass: one minified `<nnn>.json` per cycle with records, `index.json` with the cycle number, the week, the label, the group and the count, and a printed line for each cycle that gave no record, with its raw record count. Verify a second run over the same files writes the same bytes
- [x] 4.3 Make the build fail, and name the count and the bound, where the archive holds more cycle files than the 256 entries the catalog reads, and where one cycle converts to more systems than the `MAX_SYSTEMS` the package exports. Verify both with fixtures
- [x] 4.4 Add `build:cycle-data` to `apps/demo/package.json` and the root entry that delegates to it with `pnpm --filter`. Verify `pnpm test tests/workflow.test.ts` passes, which reads both halves
- [x] 4.5 Add `apps/demo/demo-data/cycles/` to [.prettierignore](../../../.prettierignore), beside the committed sets it already names, so `pnpm format` does not expand the minified files and make the tree dirty at the next data build. Verify `pnpm format` leaves the directory alone
- [x] 4.6 Run the build over the whole archive. Read the list of cycles that gave no record and check each large one by hand for a changed record shape. Report to the project owner what you found, the number of cycles written and the total size, and wait for the answer before you commit the data
- [x] 4.6a Add `Recovery` to `CATEGORY_OF_STATE` of `apps/demo/scripts/build-demo-systems.mjs`, with its own colour and its own description sentence, because the project owner answered the 4.6 gate that way. The archive names the state for a system the Thargoids leave, and the conversion dropped 1,825 of 66,687 records without it. Verify that `apps/demo/demo-data/thargoid-war.json` comes out of a rebuild unchanged at 189 systems and 4 categories, which is what `openspec/specs/dataset-catalog/spec.md` states for the demo page
- [x] 4.7 Commit the sets and the manifest. Verify the committed total is under 25 MB and each cycle under 1 MB

## 5. The cycles page

- [x] 5.1 Write `apps/demo/cycles/index.html` and `main.ts`: read `index.json`, build one entry per cycle in cycle order, each with `bounds: { mode: 'auto' }` and `view: { fit: 'systems' }`, and load with a dynamic import. Verify the dev server draws the page and the picker lists the cycles in order
- [x] 5.2 Add `tests/cycles-page.test.ts`: the manifest and the files agree, the entries are in cycle order, each `systemCount` is the record count of its file, each set carries the archive address and the licence line, the catalog holds at most the 256 entries the library reads, no set holds more records than `MAX_SYSTEMS`, and the two size ceilings hold. Verify `pnpm test tests/cycles-page.test.ts` passes
- [x] 5.3 Add `e2e/cycles-page.spec.ts`: the page opens on the first cycle, a switch to the next cycle leaves the records of the second alone, the camera opens on the box of those records, and the page fetched one data file. Verify with a targeted Playwright run

## 6. Notices, documentation and the whole check

- [x] 6.1 Widen the DCoH Overwatch archive section of [THIRD_PARTY_NOTICES.md](../../../THIRD_PARTY_NOTICES.md) from the one committed cycle to every cycle the build writes, and say that the archive is the project owner's own repository. Verify `pnpm test tests/third-party-notices.test.ts` passes
- [x] 6.2 Name the sample pages and the cycles page in [README.md](../../../README.md) and in the wiki Overview page, and correct the script counts from five and seven to six and seven in both [AGENTS.md](../../../AGENTS.md) and [openspec/config.yaml](../../config.yaml), which carries the same sentence as the project context. Verify the links open on the built site
- [x] 6.3 Edit the five places in [openspec/specs/dataset-catalog/spec.md](../../specs/dataset-catalog/spec.md) that read "the demo site" and now mean the demo page: the renamed requirement's first sentence, the `multifaction` start-entry sentence, the scenario that opens the demo site, the shape-map sentence and the one beside it. Verify `pnpm test` passes and that no other requirement of that spec names the site where it means one page
- [x] 6.4 Run `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build`, `pnpm build:demo-site` and `pnpm test:package`. Verify each one passes and fix what it names
- [x] 6.5 Run the whole browser suite once with `pnpm test:e2e`, with no other Playwright run going, and read the renderer line to confirm the run used the GPU. Verify the suite passes
- [x] 6.6 Run the implementation review gate: the `openspec-implementation-reviewer` subagent, with the change id. Fix what it blocks on and re-run it. Report the verdict and every finding
