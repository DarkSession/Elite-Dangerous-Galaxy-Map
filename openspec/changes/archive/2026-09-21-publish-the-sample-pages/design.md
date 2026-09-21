## Context

See proposal.md — Why.

What the tree holds today, and what shapes the approach:

- `apps/demo/` is a **one-page Vite app**. `vite.config.ts` names no input, so the build
  takes `index.html` alone. The base path is `/Galaxy-Map/`, and `vite preview` serves the
  build under that path, which is what the browser suite reads.
- `apps/demo/scripts/build-demo-systems.mjs` is 1834 lines. It **exports every converter**
  and runs its entry part only when node starts it, so a test and another script can
  import from it. `convertOverwatch` is already there and `tests/demo-systems.test.ts`
  already covers it over a committed fixture.
- `apps/demo/demo-data/` holds seven committed sets, 980 KB. `apps/demo/data/` holds the
  raw dumps and git ignores them.
- The dataset catalog is a library capability. A host passes `datasets` and `dataset` to
  `createGalaxyMap` and the HUD draws the picker. The cycles page is a host.
- `scripts/build-wiki.mjs` copies `docs/wiki/` into the tree, then arranges the TypeDoc
  output. `copyProse` is the pass that fails on a missing file, and it runs first.
- `tests/lint-config.test.ts` lints a synthetic file through the config, and it already
  holds a probe for `apps/demo/src/`. A new lint scope is proved there, not by hand.
- **This change applies after `publish-the-api-wiki` archives.** `openspec validate`
  reports an INFO on the `api-wiki` delta until then, because the target spec is still
  inside that change.

Measurements taken on 2026-09-21:

| What                                  | Reading                                                              |
| ------------------------------------- | -------------------------------------------------------------------- |
| `EDOverwatch.Archive/By Cycle`        | 110 files, 1.09 GB, the largest 15.5 MB                              |
| `25 - 2023-05-18.json`, the largest by records | 12.4 MB in, 1,269 records, 216 KB of minified JSON out      |
| `109 - 2024-12-26.json`, the smallest  | 7 KB in, 1 record out                                                |
| `docs/wiki/Examples/`                 | 8 pages, 9 code blocks. The camera page holds two                    |
| `docs/wiki/Examples/The-nebulae.md`   | Its block is 4 lines                                                 |

## Goals / Non-Goals

**Goals:**

- One Vite app, one build and one publish for all eleven pages.
- One file per sample, which is both the page and the wiki block.
- Committed cycle data, so the site builds and the tests run with no network.

**Non-Goals:**

- No second demo app, no second Pages site and no second workflow job.
- No change to the library. Every new page is a host that uses the public surface.
- No Canonn ED3D page. It is `publish-the-canonn-data-page`, which comes after this one.

## Decisions

### The demo app becomes a multi-page build

`apps/demo/vite.config.ts` gains `build.rollupOptions.input`: the demo page, each
`examples/<id>/index.html` and `cycles/index.html`. The list is read from the directory
rather than written out, so a new sample directory needs no config edit. Vite writes each
page under its own path, and the base path already applies.

_Alternative rejected:_ a second Vite app under `apps/samples/`. It would need a second
build script, a second publish step and a second alias table, and the Pages job uploads
one directory.

### A sample is one `main.ts` and one small `index.html`

Each sample directory holds `index.html` — a canvas, one stylesheet link and one module
script — and `main.ts`, which is the code the wiki shows. The nine pages share
`apps/demo/examples/example.css`.

**The `wiki:start` and `wiki:end` pair is what keeps the blocks short.** A runnable page
has to find its canvas and narrow its type, which the hand-written blocks skip. The pair
lets the file carry that setup and the wiki carry the four lines the nebula example is
today. A sample that needs no such setup marks nothing and shows the whole file.

The 60-line ceiling is read by a unit test, and it holds the whole file, not the marked
region.

**The samples have to be inside `tsconfig.json`.** Its `include` names `apps/*/src`, so a
file under `apps/demo/examples/` is transpiled by Vite and type checked by nothing. The two
new page directories join the list, and `pnpm exec tsc --noEmit` then reads every sample.
The unit test reads the import names and the browser suite reads the pixels; the type check
is what reads the calls.

The sample writes no test hook. The browser suite asserts what the page draws: it polls
the centre pixel of the canvas until it is not the background. `e2e/00-renderer.spec.ts`
already fails a run on a software renderer, so the new spec adds the pixel check alone.

_Alternative rejected:_ each sample sets `window.galaxyMap`. It would put a line in the
copied block that a reader does not need, to serve the test rather than the reader.

### The two surfaces a sample must not reach are held by two different checks

The relative-path reach is a lint rule the repository already holds; task 1.3 widens its
scope and `tests/lint-config.test.ts` proves the new scope. The `./testing` import, the
`map.debug` read and a reach into `demo-data/` are held by `tests/sample-pages.test.ts`,
which reads the sample sources.

_Alternative rejected:_ two more ESLint rules, one for the subpath and one for the
property. The property rule exists for `src/hud/` and is scoped there on purpose. A unit
test over nine small files is smaller than a config the next reader has to hold in mind.

### The wiki build reads the sample source

`docs/wiki/Examples/<Page>.md` carries one marker line per block,
`<!-- sample: the-hud -->`. `copyProse` replaces each marker with the fenced TypeScript
block and the link, and fails where a marker names no directory, where a page has no
marker, where two markers name one sample, or where a sample has an unclosed marked
region.

The link is built from one constant in the build script, the published base address, so
the address sits in one place.

**The test that reads the example blocks has to move.** `tests/wiki-pages.test.ts` reads
`docs/wiki/Examples/` — the **source** pages — for its "import exported members alone"
case. Once the blocks become markers that case reads no import and trips its own guard, so
task 3.4 repoints it at the built tree, where the generated block now sits.

_Alternative rejected:_ the sample imports the block from the markdown. A markdown file
cannot be a module, and the page would need a build step to unwrap it.

### The cycles build converts with the converter that is already tested

`apps/demo/scripts/build-cycle-sets.mjs` reads the file list of `By Cycle` from the GitHub
contents API, fetches each file into the ignored `apps/demo/data/cycles/`, and calls
`convertOverwatch`, which `build-demo-systems.mjs` exports.

It writes `apps/demo/demo-data/cycles/<nnn>.json`, minified, and
`apps/demo/demo-data/cycles/index.json`, the manifest. The number is zero-padded to three
digits so the file order is the cycle order.

**Minified, not pretty-printed.** The seven sets of the demo page are pretty-printed,
which a reader can read in a diff. 110 cycles are not read in a diff, and the pretty form
is about twice the bytes. `.prettierignore` names each committed set today, for the reason
its own comment gives: a file the formatter and the script shape differently makes the tree
dirty at the next data build. The cycles directory therefore joins that list, or `pnpm
format` would expand every one of the 110 files.

The demo page keeps its own `thargoid-war.json` for cycle 2. That file is what
`e2e/datasets.spec.ts` and `tests/demo-site-build.test.ts` read, and the cycles page is a
page of its own.

_Alternative rejected:_ fetch the raw cycle in the browser. One pick would cost up to
15.5 MB and would need github.com to answer.

### The page reads a manifest and imports by identifier

`apps/demo/cycles/main.ts` imports `index.json`, maps each row to a catalog entry, and
loads with a dynamic import of a fixed directory:
`import(\`../demo-data/cycles/${id}.json\`)`. Vite turns that into a glob of that
directory, so each set is a chunk of its own and the page fetches one.

The manifest carries the count, the label, the group and the description, so `main.ts`
stays short and the page cannot state a count the file does not hold.

### The new data script delegates, as the other data script does

`apps/demo/package.json` holds `build:cycle-data`, and the root `package.json` holds the
entry that delegates to it with `pnpm --filter`. `tests/workflow.test.ts` reads both
halves. AGENTS.md states the counts of the two kinds of script, so it moves from five and
seven to six and seven.

## Risks / Trade-offs

- **The committed cycle data grows the repository from 980 KB to 11.5 MB** → The
  ceiling is 25 MB, read by a test. The sets are converted extracts and not dumps, which is
  the line AGENTS.md and `dataset-catalog` draw, and the raw 1.09 GB stays ignored.
- **The archive's record shape changed part of the way through the war** → A cycle that
  gives no record from a large file is the signal. The build prints the raw record count
  beside the file name, and task 4.5 says to read that list before the data is committed.
- **The wiki block becomes a generated block** → A reader of `docs/wiki/` no longer sees
  the code in the markdown. The page holds the marker and the prose, and the code sits one
  file away, in a directory the same commit changes.
- **A sample page is a page a reader can link to, and its address is now a promise** → The
  addresses are written from one constant, and a unit test reads that every marker resolves
  to a built page, so a renamed sample cannot leave a dead link in the wiki.
- **Eleven pages in one browser suite** → The new specs open nine small pages and one data
  page. Each sample draws a handful of records, so the cost is the browser context, not the
  data. The suite runs one Playwright run at a time, as it does today.

## Migration Plan

1. `publish-the-api-wiki` archives first. Its `docs/wiki/` and `scripts/build-wiki.mjs`
   are what this change edits.
2. The multi-page build, the samples and the wiki build change together, in one commit, so
   no push leaves the wiki with a marker it cannot fill.
3. The cycles page follows: the build script, the data, the page and its tests.
4. Rollback is a revert. No published address that exists today changes, and the library
   is not touched.
