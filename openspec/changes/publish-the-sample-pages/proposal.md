## Why

The wiki holds eight example pages, and each one carries a TypeScript block a person
wrote by hand. Nothing runs that code. A reader cannot see what the example draws, and no
test proves the block still works: `tests/wiki-pages.test.ts` reads the names the block
imports and nothing more. The block can drift from the library while every check passes.

The demo site is one page. It shows the whole library at once — seven data sets, the HUD,
the nebulae, the grid — so a reader who wants one feature has to find it inside all of the
rest.

The demo site shows one cycle of the Thargoid war, cycle 2 of 110 in the DCoH Overwatch
archive. The archive holds the whole war, week by week, and the map can show it.

**Non-goals.** This change adds no member to the library and changes no rendering code.
It adds no workflow job: the Pages publish already uploads `apps/demo/dist/`, so a new
page in the demo build reaches the site with no change to `ci.yml`.

**This change follows `publish-the-api-wiki`.** That change writes `docs/wiki/`,
`scripts/build-wiki.mjs` and the `publish-wiki` job. This one changes what the example
pages of that tree hold, so it applies after that change archives.

**The Canonn ED3D page is a change of its own, `publish-the-canonn-data-page`.** That page
needs sets far above the 10,000 systems `real-systems` states, so it waits for the change
that raises that bound. The multi-page build this change adds is what that page is built
on.

## What Changes

### The samples run on the Pages site

- **A new `apps/demo/examples/` directory** holds one directory per sample. A sample is
  one `main.ts` and one small `index.html`, and the pages share one stylesheet. There are
  **nine**: the eight wiki example pages give eight, and the camera page gives a second
  one, because that page carries two code blocks.
- **The demo build becomes a multi-page build.** `apps/demo/vite.config.ts` reads every
  page of `apps/demo/examples/`, and the cycles page below, as a build input. The build
  writes them under `apps/demo/dist/`, and the Pages publish carries them. A sample is
  then at `https://elite-dangerous-almanac.github.io/Galaxy-Map/examples/the-hud/`.
- **The sample source is the code the wiki shows.** Each block of an example page becomes
  a marker. `pnpm docs:wiki` reads the sample source, writes it into the page as a
  TypeScript block, and writes the address of the live page under it. One file is then the
  sample, the block and the thing the reader opens.
- **A sample may mark the part of itself the wiki shows.** A `// wiki:start` and
  `// wiki:end` pair keeps the block as short as the hand-written one is today, while the
  file around it stays a page that runs. The nebula example is four lines and stays four
  lines.
- **A sample imports the library by its package name**, as the demo page does, so the
  block a reader copies is the code that runs.

### One page for the Thargoid war cycles

- **A new page at `/cycles/`** holds one catalog entry per cycle of the war, in cycle
  order, with the week of the cycle in the label. The archive holds 110 cycle files.
- **A new build script converts every cycle.** It reads the file list of `By Cycle` from
  the GitHub contents API, fetches each file into the ignored `apps/demo/data/cycles/`,
  and converts it with `convertOverwatch`, which the demo data script already exports and
  which `tests/demo-systems.test.ts` already covers.
- **The converted sets are committed**, as the seven sets of the demo page are. The raw
  cycle files, 1.09 GB in all, are not. **The archive is the project owner's own
  repository**, so the committed copy raises no licence question that the notices file
  does not already answer.
- **A cycle that converts to no record is left out of the catalog and named in the build
  output.** The last cycles of the archive hold no system, and one empty entry per week
  would fill the dialog with nothing.

### What the tests check

- **New unit tests** in `tests/` read the cycles manifest against the files beside it,
  assert the committed size of the data directory, and assert the wiki contract: one
  marker per block, one sample per marker, and a built block that is the bytes of the
  sample source or of its marked region.
- **A new lint case.** The rule that holds the demo to package-name imports covers the new
  page directories, and `tests/lint-config.test.ts` gains a case for it, as it already
  holds one for `apps/demo/src/`.
- **The new pages are type checked.** `tsconfig.json` includes `apps/*/src` and no more, so
  a sample would go unchecked today. The two new page directories join the `include` list,
  and `pnpm exec tsc --noEmit` then reads every sample. That is the check that proves a
  block still works, which is the problem this change opens with.
- **New Playwright tests** open each new page, assert the map draws, and assert the
  catalog holds the entries the manifest names. They run on the GPU, as the rest of the
  browser suite does.

### Scale

- The catalog reads at most **256** entries, which `dataset-catalog` states, and the build
  fails rather than write a set the page would drop. The archive holds **110** cycle files
  today, which is a reading and not a bound.
- A set holds at most **10,000** systems, which `real-systems` states. The largest cycle
  measured gives **943** records, so every cycle is inside the bound with room over it.
- **One set loads at a time.** The page fetches the file of the entry the user picks and
  no other, so the first paint costs one small file, not the whole tree.
- **The committed data has a stated ceiling.** `apps/demo/demo-data/cycles/` stays under
  **25 MB** and one cycle under **1 MB**. The measurement behind it: the largest cycle
  source file, 10.7 MB, converts to 163 KB of JSON, so 110 cycles are about 18 MB. A test
  reads both sizes.
- **The committed sets are not dumps.** AGENTS.md says to commit no galaxy data dump, and
  `dataset-catalog` states the same. A cycle set is the converted extract the page draws,
  which is the rule the seven committed sets already follow. The dumps stay in the ignored
  data directory.

## Capabilities

### New Capabilities

- `sample-pages`: the samples, where each one is published, what each one shows, and the
  rule that the sample source and the wiki block are one file.
- `thargoid-war-cycles-page`: the cycles page, one entry per cycle, and how the build
  reads the archive.

### Modified Capabilities

- `api-wiki`: an example page no longer holds a hand-written code block. The build writes
  each block from the sample source it names and adds the address of the live page. The
  size bound of the tree does not change.
- `dataset-catalog`: the requirement "The demo site carries seven data sets" states that
  the **site** carries one catalog of seven entries, and that no entry but the war set
  carries `bounds` or `view`. The site now carries a second catalog, on the cycles page, in
  which every entry carries both. The requirement is scoped to the demo page.

  **The delta renames the requirement and adds a scoping requirement beside it.** A
  MODIFIED delta must carry the whole requirement, and this one is 359 lines; a copy that
  long is a diff no reviewer reads, and every line of it is a line that can be
  mistranscribed. Five words inside that spec still read "the demo site" where they now mean
  the demo page, so the change edits those five words in
  `openspec/specs/dataset-catalog/spec.md` directly, the way the archived change
  `2026-09-20-rename-category-scenario-headings` edited a heading.

## Impact

| What                                     | Change                                                         |
| ---------------------------------------- | -------------------------------------------------------------- |
| `apps/demo/vite.config.ts`               | The build takes many inputs, not one                           |
| `apps/demo/examples/`                    | New. Nine samples and one stylesheet                           |
| `apps/demo/cycles/`                      | New. One page                                                  |
| `apps/demo/scripts/build-cycle-sets.mjs` | New. It imports the converter from the demo data script        |
| `apps/demo/demo-data/cycles/`            | New. The committed sets and the manifest                       |
| `apps/demo/package.json`, `package.json` | A new data script, and the root entry that delegates to it     |
| `eslint.config.js`                       | The package-name rule covers the new page directories          |
| `tsconfig.json`                          | The two new page directories join `include`                    |
| `.prettierignore`                        | The committed cycle sets, which the build writes minified      |
| `openspec/specs/dataset-catalog/spec.md` | Five words, "site" to "page", edited directly                  |
| `docs/wiki/Examples/*.md`                | Each hand-written block becomes a marker                       |
| `scripts/build-wiki.mjs`                 | Reads the sample source into the page and writes the live link |
| `tests/`, `e2e/`                         | New tests for the pages, the manifest and the wiki contract    |
| `THIRD_PARTY_NOTICES.md`                 | The archive entry covers every cycle, not one                  |
| `README.md`, `AGENTS.md`                 | The new pages, and the script counts, which move to 6 and 7    |
| `openspec/config.yaml`                   | The same script counts, which the project context carries      |
| `.github/workflows/ci.yml`               | No change                                                      |
| Dependencies                             | None added                                                     |

The library package is not touched, so the published tarball does not change.
