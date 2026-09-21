## Context

See proposal.md — Why.

What the tree holds, and what shapes the approach:

- `apps/demo/scripts/build-demo-systems.mjs` already converts six Canonn maps. It
  **exports** `parseEd3dData`, `ed3dCategories`, `ed3dRecords`, the sphere and line readers
  and the HTML-to-text reader, and `tests/demo-systems.test.ts` covers them over committed
  fixtures. `parseEd3dData` is a **parser and not an evaluator**: it reads the literal and
  cannot run a statement of the source.
- The dataset catalog is a library capability. The page is a host that passes `datasets`
  and `dataset`.
- **This change waits for the multi-page demo build** of `publish-the-sample-pages`, and
  for `raise-the-system-set-bound`, which takes the 10,000 system bound of `real-systems`
  to 100,000 and measures the renderer, the pick and the switch at it.

Measurements taken on 2026-09-21, which decide the approach. **None of this data is in the
tree**, so the right-hand column below cannot be checked by reading the repository. The
commands that give each reading are under the table.

| What                                                 | Reading                                                   |
| ---------------------------------------------------- | --------------------------------------------------------- |
| The 49 `MapData-*.js` files                          | 0.5 MB, 45 static records in all, 5 files with any record |
| Files that fetch at run time                         | 31 of 49                                                  |
| Files that do not parse as a literal                 | 22 of 49, because they compute colours with calls         |
| The sources those maps fetch                         | 74 distinct files, 63.2 MB, named 115 times               |
| Sources more than one map names                      | 16                                                        |
| `clouds.json`                                        | 32.5 MB, 202,087 rows, 71,142 systems                     |
| `dumpr/Geology/1400102.csv`                          | 2.4 MB, 30,694 rows, 30,668 systems                       |
| `api.canonn.tech`                                    | Does not answer                                           |
| `cloudfunctions.net/query/fleetCarriers`             | Does not answer                                           |
| `cloudfunctions.net/query/thargoid/nhss/systems`     | Answers, 478 KB                                           |
| Clouds converted, minified JSON                      | 14.03 MB, **1.70 MB gzipped**, 1.882 keys a record        |
| `1400102.csv` converted, no category, no description | **2.57 MB**, ratio 1.05, 84 B a record                    |
| `1400102.csv` converted, with a record description   | 5.03 MB, ratio 2.06, which the spec rules out             |

How to take the readings again:

```bash
# The 49 map files and their static records
git clone --depth 1 https://github.com/canonn-science/CanonnED3D-Map /tmp/ed3d
ls /tmp/ed3d/Source/data/MapData-*.js | wc -l
du -cb /tmp/ed3d/Source/data/MapData-*.js | tail -1   # 520,432 bytes, the 49 map files

# What each map fetches, and what more than one map fetches
grep -oh "dumpr/[A-Za-z]*/[0-9]*\.csv" /tmp/ed3d/Source/data/MapData-*.js | sort -u | wc -l

# The largest source, and what it converts to
curl -sL https://storage.googleapis.com/canonn-downloads/clouds.json -o /tmp/clouds.json
# 202,087 rows, 71,142 unique `system` values; one record per unique system,
# with the categories and the descriptions of its rows joined, is 14.03 MB minified
# and 1.70 MB under gzip -9.

# One codex dump
curl -sL https://storage.googleapis.com/canonn-downloads/dumpr/Geology/1400102.csv \
  -o /tmp/geo.csv
# 30,694 rows, 30,668 unique system names. Converted with no category and no description it is
# 2.57 MB, a ratio of 1.05; with both it is 5.03 MB, a ratio of 2.06.
```

The bucket is `storage.googleapis.com/canonn-downloads`, which is the host
`build-demo-systems.mjs` already reads; the `s3.eu-west-2.amazonaws.com` name of the same
bucket answers 404. **The bucket cannot be listed without credentials**, so the map table is
the only way in, and the build fails on a map whose address it cannot read. 10 of the 11 JSON
dumps are under that bucket and measure 39.52 MB; the 11th is about 1.9 MB from another host,
and task 2.1 writes its address into the table with the rest. The address of each dump is the one the matching `MapData-*.js` file
names, and the table row carries it.
The row counts and the byte counts above came from those two files on 2026-09-21. A second
run of the Clouds conversion the same day read 14.84 MB and 1.74 MB, a difference under one
per cent: the sources are live and Canonn adds records to them, so the build reports what it
wrote rather than a number this change fixed.

## Goals / Non-Goals

**Goals:**

- A reader per source **shape**, not per Canonn map.
- Committed data, so the site builds and the tests run with no network.
- No record dropped for size: a map over the set bound splits.

**Non-Goals:**

- No change to the library. The page is a host.
- No run-time fetch of a Canonn endpoint from the published page. The Canonn Factions set
  of the demo page already covers a host that fetches, and this page reads files.
- No rewrite of `build-demo-systems.mjs`. The new script imports from it.

## Decisions

### Six maps are converted twice, on purpose

`build-demo-systems.mjs` already converts and commits six of the 49 maps for the demo page:
the Guardian ruins, the Guardian structures, the notable systems, the UIA, the Adamastor and
the multifaction spheres. This page holds one entry per Canonn map, so it holds its own set
for each of those six as well. A gap would be six maps a reader of this page cannot find.

The two builds read the same exported readers, so a reader that changes changes both trees.
Neither page reads the other's files, and the demo page keeps the sets its tests already
read.

_Alternative rejected:_ the Canonn page links to the demo page for those six. It would make
one page of 49 maps into one page of 43 and a footnote.

### One script, one table row per map, four readers

`apps/demo/scripts/build-canonn-sets.mjs` holds one row per Canonn map: the identifier, the
label, the subject group, the shape of its source and the addresses that shape needs. Four
readers cover every row:

| Shape      | What it reads                                                     | Maps it covers                                                                                         |
| ---------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `literal`  | The `systemsData` literal in the `MapData-*.js` file              | The 5 maps with static records                                                                         |
| `dump`     | One JSON file of the `canonn-downloads` bucket                    | Ruins, structures, beacons, clouds, landscape, megaships, generation ships, IDA, galnet, hyperdictions |
| `codexCsv` | One CSV per codex entry under `canonn-downloads/dumpr/<subject>/` | The codex maps, the largest group                                                                      |
| `query`    | One endpoint of the Canonn cloud functions                        | NHSS, and the other query maps                                                                         |

_Alternative rejected:_ one converter per map, 49 of them. The maps repeat four shapes, and
the difference between two codex maps is a list of codex ids and a colour table, which is
data.

### The build reads the map file for its plan, and fetches the data itself

22 of the 49 files do not parse as a literal, because the category colours come from calls
such as `randomColor()` and `getColour(n)`. The build therefore does not need the whole
file to parse: it needs the addresses, the codex ids and the category names. The row in the
table carries what the parser cannot give, and the parser gives the rest.

This keeps the rule `parseEd3dData` already holds: the build never runs a Canonn source
file.

_Alternative rejected:_ run each `MapData-*.js` in a sandbox with a fake ED3D and a fake
`fetch`, and record what it asks for. It would read every map with no table, and it would
run code from a source tree this project does not control, in the build that writes the
committed data.

### A source is converted once, and an entry names the files it reads

The 49 maps name **115 sources**, and 16 of those sources feed more than one map.
`MapData-All.js` is the union map: it names 60 of the 63 codex files by itself, and 50 of
them appear in no other map. `Aliens` repeats 13, `BT` 8, `Guardians` 8, `TB` 5 and
`Thargoids` 5.

One set file per map would therefore write the codex corpus about twice: 27.71 MB of CSV
over the references against 21.78 MB distinct, which at the 1.05 ratio is 29.1 MB of codex
sets instead of 22.9 MB, and a tree of about 47 MB against 41 MB. That is 6 MB, a seventh of
the tree, for bytes the page already holds, and it puts the tree on its ceiling.

So the build writes **one file per converted source**, and a manifest entry names the files
its map reads. The page fetches them and joins the records in the worker. Two maps that read
one source read one file, and the tree is the union, which is the number the ceiling is
derived from.

**The key stays in the record; the name and the colour move to the manifest.** A Guardian
ruins dump keys on the site type, which is Alpha, Beta and Gamma, and the Clouds map draws 35
keys, 1.882 a record. A rule of one category per file would flatten both. What differs between
two maps is not the key, it is what the map calls it.

**The key comes from the map's reader and not from a column.** `MapData-Cloud.js:380-407`
reads the `description` column, renames `Storm Cloud` to `Lagrange Cloud`, and for every row
outside `Lagrange Cloud` and `FSS Signals` puts the `category` value in the key and collapses
the group to `Contents`. The source's `category` column holds 24 values; the map draws 35
keys. The map table therefore carries the fold, and the build records which map keyed a file
and fails where a second map keys it differently. Only `MapData-Cloud.js` reads that dump
today, so the rule costs nothing now and is what stops a later map taking another map's keys.
`dumpr/Biology/2100201.csv` is category 201 in `MapData-BT.js` and 701 in
`MapData-Aliens.js`, and `MapData-BT.js` colours its whole table with `randomColor()`. A
shared file therefore holds the system, the coordinates, its keys and the source descriptions
that are not one of those keys, and each row of an entry's `files` gives the path and a table
from the keys of that file to the category name and the colour that map gives each key. Text
a map composes, such as `MapData-BT.js`'s `infos: signalLink(...)`, is dropped: it differs per
map and the page does not show it. `MapData-All.js` even names
`dumpr/Thargoid/2100101.csv` twice, as `bmsites` and `tbsites1`, so one path appears twice in
one entry under two categories and is fetched once.

**The join does not merge across files**, because Canonn's own readers give one record per
system per file: `MapData-BT.js` holds a `seen` table inside a file and not over its eight.
A system with a find in eight of an entry's files is eight records at one coordinate, each
under its own category, which is what the map draws. `systemCount` and the record bound count
records.

_Alternative rejected:_ drop `MapData-All.js`, since the page as a whole is the union map. It
holds 50 codex files no other map names, so dropping it would take 50 codex entries off the
page, which is most of the data the user asked for.

_Alternative rejected:_ one file per map with the duplicates written out. It costs about 6 MB
of repeated records, a seventh of the tree, and puts the tree on its ceiling, to save the page
a second fetch.

### A map over the set bound splits by category, then into parts

The split is data-driven and reported, and the page is built from the manifest, so a
splitting rule that changes later changes the manifest and not `main.ts`.

The bound is read from the library rather than copied, so the page follows the change that
raises it. Where the bound lands high enough, a map stops splitting by itself.
`raise-the-system-set-bound` makes `MAX_SYSTEMS` a public export for this. A relative read
into `packages/galaxy-map/src/` would be a second path into library source from a build
script, and the demo reaches the library by package name everywhere else.

_Alternative rejected:_ cap a map at the bound and drop the rest. The user asked for the
whole of the data, and a map that says "Clouds" and holds a seventh of them is worse than
several entries that say which part they hold.

### The sets are plain minified JSON, and the page parses them in a worker

The first draft of this design committed the sets gzipped. Three measurements killed it:

- **The dev and the preview server inflate a `.gz` before the page sees it.** Vite serves
  static files through `sirv`, which sets `Content-Encoding: gzip` on any name ending in
  `.gz`. The browser then inflates it, and a second inflate in the page throws. The demo's
  own `factions.json.gz` does not hit this, because it comes from `downloads.spansh.co.uk`
  and not from this site.
- **Git already deflates every blob.** The repository's own sets measure 459,923 bytes of
  JSON against a 72,988 byte git object. A committed `.gz` saves about a fifth of the
  repository cost, not the 6.7 times the plain file sizes suggest.
- **A committed `.gz` defeats delta compression.** Three revisions of one set pack to 59,390
  bytes as JSON and 113,676 bytes as `.json.gz`. The data is regenerated, so there will be
  revisions.

So the sets are minified JSON, which is a new convention for this repository — the seven
sets of the demo page are pretty-printed — and the ceiling is 50 MB.

**The parse moves off the main thread instead.** `dataset-catalog` already requires that,
with the reading behind it: an on-page read of the demo's largest set cost the map a 70 ms
gap, and the same read in a worker cost no frame. That reading is an inflate and not a parse,
so it does not say what a parse alone costs. It does say where the work belongs.
`apps/demo/src/multifaction.ts` and its worker are the pattern to copy, minus the inflate.

**The hand-back is the part the pattern does not solve.** `addSystems` takes record objects,
so the worker posts up to 71,142 of them and the main thread pays a structured clone it did
not pay for the parse. The implementation measures the clone beside the parse, and where the
clone is the larger of the two, the worker posts packed typed arrays as transferables and
the page builds the records in slices. Task 4.2 holds that measurement.

**Vite inlines an asset under 4,096 bytes as a data URL**, and several of the five
static-record maps are that small. An inlined set is not a fetch, which breaks the "one
fetch per pick" reading. The build sets `assetsInlineLimit` to 0, or the sets sit in a
directory Vite copies as it stands.

### The largest set is a real transfer, and the manifest says so

The dialog shows the record count of each entry, which is what `systemCount` in the
manifest is for, so a user picks with that in front of them. The page loads one set at a
time, so no other pick pays for it.

The page opens on a small entry, not the largest one, as the demo page opens on a set that
is not `multifaction`. The parse of a 14.03 MB set runs in the worker. The page's `load()`
awaits the worker,
`dataset-catalog` holds that the frame loop keeps drawing while a `load()` runs, and the
dataset field shows that one is running, so the map does not appear frozen.

## Risks / Trade-offs

- **The committed data is about 41 MB, against 980 KB today and about 25 MB once
  `publish-the-sample-pages` lands its cycle sets at its own ceiling** → The ceiling is 50 MB,
  read by a test. The estimate comes from the measured shape of all 74 sources, one file per
  shape, so it spans about 37 MB to 50 MB. It is the largest single addition the repository has taken, so
  task 1.3 puts the number and its range in front of the project owner before any reader is
  written, and task 3.3 asks again where the measured total passes the estimate.
- **A Canonn endpoint dies between the build and the review** → The sets are committed, so
  the page keeps working. The build names what it dropped, and the task list says to read
  that output and record it.
- **The codex CSV shape differs per subject** → The `codexCsv` reader is written against
  the columns of two subjects first, Biology and Thargoid, and each further subject is
  added with a fixture. A subject whose columns do not match is named and left out, as a
  dead source is.
- **The map draws up to 71,142 markers in one set** → `raise-the-system-set-bound` holds
  the frame budget, the pick bound and the switch budget at 100,000, and lands the bound at
  the number those readings hold. This change reads that bound, stays inside it and holds
  no budget of its own. Task 4.7 reads the frame statistics on the largest set and reports
  them against that change's budget, so a page that is inside the bound and outside the
  budget is still caught.
- **The group table needs 49 rows of judgment** → A map the table does not name fails the
  build, so the table cannot fall behind the source tree in silence.

## Migration Plan

1. `publish-the-sample-pages` archives, which gives the multi-page build.
2. The change that raises the set bound archives, and this change reads the new bound.
3. The build script and its readers land with their fixtures, one shape at a time.
4. The data is generated, the sizes are read against the 50 MB ceiling the spec already
   holds, and the sets are committed.
5. The page and its tests land last.
6. Rollback is a revert. No published address that exists today changes.

## Open Questions

- **Which maps the `query` shape covers in the end** depends on which cloud function
  endpoints still answer on the day the build runs. The build names each one it drops, so
  the answer is read from the output. This changes no requirement.
- **Whether the project owner accepts about 41 MB of committed Canonn data**, on top of the
  25 MB ceiling the cycle sets hold. The ceiling is 50 MB and the estimate spans 37 MB to
  50 MB, both stated. Task 1.3 asks before the work starts. A no means holding the largest maps
  back, which is a smaller page and not a different design, and the group table is where a
  held-back map is marked.
