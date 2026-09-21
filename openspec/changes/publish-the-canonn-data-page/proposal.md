## Why

The Canonn Research Group's ED3D map holds 49 maps of the galaxy: the Guardian sites, the
codex biology and geology finds, the Thargoid structures, the factions, the listening
posts and the rest. The demo page of this project draws six of them. The other 43 are
data this map can draw and does not.

The data is not in the map's source tree. The 49 `MapData-*.js` files hold **45 records
between them**: each map fetches its own data when a browser opens it. A page that draws
the whole of it therefore has to read what each map reads, and convert it once.

**Non-goals.** This change adds no member to the library and changes no rendering code. It
does not draw the Canonn data that no longer has a live source. It does not put the
Canonn map's own page, styling or interface on this site: it takes the records.

**The two changes this one waited for are archived.**

1. `publish-the-sample-pages` added the multi-page demo build this page is built on.
2. **`raise-the-system-set-bound`** raised the system set bound to **50,000** and exports
   it as `MAX_SYSTEMS`. It did not reach 100,000: the dataset switch read 46.7 ms of a
   40 ms budget there, and 60,000 failed the flag sweep once in three runs. The Canonn
   data sits across that bound. The Clouds map holds **71,142 systems**, so it splits;
   one Geology codex file holds **30,668**, so it is one entry. At the old bound of 10,000
   the Clouds map alone was eight entries or more. Task 1.2 reads the landed bound and
   writes the entry count the split rule gives at it, so the bound makes a longer list and
   not a blocked page.

## What Changes

- **A new page at `<base>canonn/`** holds one catalog entry per Canonn ED3D map. The
  entry's `collection` groups the maps by subject, which is what splits them: Guardians,
  codex biology, codex geology, Thargoids, factions, navigation and the rest. The user
  picks one map at a time, and the categories of that map are the categories the source
  names.
- **A new build script fetches and converts the data.** It reads each map's own source to
  learn what that map draws, then fetches what that map fetches. Five source shapes cover
  the 49: the object literal in the file, the JSON dumps of the `canonn-downloads` bucket,
  the codex CSV dumps of that bucket, the data files of the Canonn source tree, and the
  query endpoints of the Canonn cloud
  functions.
- **A map whose source no longer answers is left out and reported.** `api.canonn.tech`
  does not answer, and one cloud function does not answer. The script names each map it
  drops, and the page lists what the script wrote.
- **A map over the set bound splits by its own categories**, and a category still over the
  bound splits into numbered parts. Nothing is dropped for size. At the 100,000 bound no
  measured map splits, and the rule is what holds a map that grows past it later.
- **The converted sets are committed**, as the seven sets of the demo page are, under
  `apps/demo/demo-data/canonn/`. The raw dumps go to the ignored `apps/demo/data/canonn/`.
- **A source is converted once.** The 49 maps name 115 sources between them and 16 of those
  are shared: `MapData-All.js` alone names 60 of the 63 codex files. The build writes one file
  per source and each entry names the files its map reads, so the tree holds the union. A file
  per map would cost about 6 MB of repeated records, a seventh of the tree, and would put the
  tree on its ceiling.
- **The page holds its own set for the five maps the demo page already commits**, because it
  holds one entry per Canonn map and a gap would be five maps a reader cannot find. The demo
  page's sixth set, `notable-systems.json`, comes from a file no `MapData-*.js` reads, so it
  is not one of the 49 maps. Both
  builds read the same exported readers, so a reader that changes changes both trees.
- **The sets are committed as minified JSON**, one file per converted source. That is a new
  convention: the seven sets of the demo page are pretty-printed, and minifying is worth about
  35 per cent of the tree, which `uia.json` reads as 724,106 bytes against 459,923. Git
  deflates a blob already, so the 17.3 MB of JSON the two largest sources convert to costs
  about 2.4 MB in the repository; a committed `.gz` would save about a fifth of that and
  would cost every later rebuild its delta compression.
- **The page reads a set in a worker.** `apps/demo/src/multifaction.ts` and its worker are
  the precedent: the page fetches, the worker parses, and the frame loop never holds a
  multi-megabyte `JSON.parse`. The largest entry fetches 3,954,837 bytes. The page opens on a
  small entry, so nothing large is fetched until the user asks for it.

## Capabilities

### New Capabilities

- `canonn-data-page`: the Canonn ED3D page, how the build reads each map, how the maps are
  grouped, what happens to a map whose source is gone, and what happens to a map over the
  set bound.

### Modified Capabilities

None. The page is a host that uses `dataset-catalog` as written, and
`publish-the-sample-pages` already scopes the demo page's own catalog requirement.

## Impact

| What                                            | Change                                                         |
| ----------------------------------------------- | -------------------------------------------------------------- |
| `apps/demo/canonn/`                             | New. One page                                                  |
| `apps/demo/scripts/build-canonn-sets.mjs`       | New. It imports the ED3D readers from the demo data script     |
| `apps/demo/demo-data/canonn/`                   | New. The committed sets and the manifest                       |
| `apps/demo/vite.config.ts`                      | One more build input                                           |
| `apps/demo/package.json`, `package.json`        | A new data script, and the root entry that delegates to it     |
| `tsconfig.json`                                 | `apps/demo/canonn` joins `include`, or the page is unchecked   |
| `.prettierignore`                               | The committed sets and the manifest, which the build minifies  |
| `eslint.config.js`, `tests/lint-config.test.ts` | The package-name import rule covers the new page directory     |
| `AGENTS.md`, `openspec/config.yaml`             | The script counts, six and seven, which become seven and seven |
| `tests/`, `e2e/`                                | New tests for the page, the manifest and each source reader    |
| `THIRD_PARTY_NOTICES.md`                        | One entry per new Canonn source                                |
| `.github/workflows/ci.yml`                      | No change. The Pages job already uploads the demo build        |
| Dependencies                                    | None added                                                     |

The library package is not touched, so the published tarball does not change. The build
reads the `MAX_SYSTEMS` export that `raise-the-system-set-bound` adds, and adds nothing of
its own to the library.

### Scale, measured on 2026-09-21

Every reading below was taken from the live source. The address and the command that gives
each one are in design.md, so a reader can take the reading again.

| What                                  | Reading                                                                |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `Source/data`, the 49 map files       | 0.5 MB, **45 static records in all**                                   |
| The sources those maps fetch          | **74 distinct files, 63.2 MB**, named 115 times                        |
| The largest, `clouds.json`            | 32.5 MB, 202,087 rows, **71,142 systems**                              |
| Clouds converted, measured            | **10.20 MB** of minified JSON, ratio 0.314, 143 B a record             |
| One Geology codex file, `1400102.csv` | 2.45 MB, 30,694 rows, **30,668 systems**                               |
| That file converted                   | **2.57 MB**, ratio 1.05, 84 B a record, no category and no description |
| The 74 sources by shape               | 11 JSON dumps, 41.43 MB; 63 codex CSV files, 21.78 MB                  |

**A conversion is not always smaller than its source**, so the tree is estimated by source
shape and not by one ratio. The table counts each source **once**, which the rule "a source
is converted once" is what makes true: over the 115 references the codex sources measure
27.71 MB instead of 21.78 MB, and the tree would be about 62 MB. The 74 distinct sources are
**11 JSON dumps of 41.43 MB** and **63 codex CSV files of 21.78 MB**, measured file by file
on 2026-09-21. The estimate reads a dump at 0.432 of its source, because one row per signal becomes one record per
system of that file, carrying the source's own category and description. A codex CSV grows a
little: a record repeats the field names that a CSV row states once, and it carries no
category and no description, because the file is one codex entry that the manifest names.

| Shape      | Source   | Ratio | Converted       |
| ---------- | -------- | ----- | --------------- |
| JSON dumps | 41.43 MB | 0.432 | **17.9 MB**     |
| Codex CSV  | 21.78 MB | 1.05  | **22.9 MB**     |
| The tree   | 63.21 MB |       | **about 41 MB** |

The build measured 0.314 for a dump and wrote **38,865,218 bytes**, under the estimate and
inside its band.

**A codex record carries no category and no description of its own**, which is what holds the
CSV ratio at 1.05 instead of 2.06. The category of a codex set is the codex entry, which the
manifest names, so either field would repeat one string on every line and add about 22 MB to
the tree.

- **The committed tree stays under 50 MB, and one set under 16 MB.** A megabyte is 1,000,000
  bytes. The estimate is 41 MB, from the shape table above. One ratio per shape is measured on
  one file of that shape, so the tree lands between about 37 MB and 50 MB. 16 MB covers the
  largest single set, and the split holds the largest committed set to 2,837,346 bytes. Task
  3.3 reports the measured total against the ceiling before the data is committed.
- **41 MB is a large thing to commit, and the decision is the project owner's.** Task 1.3
  puts it in front of them before any reader is written, with the alternative: hold the
  codex maps back, which are 22.9 MB of the 41 MB and 63 of the 74 sources.
  `publish-the-sample-pages` holds a 25 MB ceiling of its own, so the two changes together can
  take the repository to 75 MB. Task 1.3 states the two ceilings and not the two estimates,
  and carries the per-map table so the answer can be a map and not only a yes or a no: Cloud
  fetches 32.49 MB, All 21.73 MB and landscape 6.66 MB, which is 61 MB of the 67.5 MB the
  build reads.
- **The page draws up to one set bound of markers**, which is the bound
  `raise-the-system-set-bound` lands and measures, 100,000 or the highest number its
  readings hold. The frame budget, the pick bound and the
  switch budget at that size are that change's requirements, and this page holds no budget
  of its own.
- **One set transfers at a time.** The largest entry transfers 3,954,837 bytes over five
  files, which GitHub Pages serves gzipped. The parse runs in a worker, so the frame loop
  keeps drawing while the set arrives.
- **The committed sets are not dumps.** They are the converted extract the page draws, one
  record per system, which is the line AGENTS.md draws. The 63.2 MB of raw sources stays in
  the ignored data directory.
