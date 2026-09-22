## Purpose

Puts the data of the Canonn ED3D map on one page of the Pages site, as one data set per
Canonn map, grouped by subject, so a reader can see the whole of that project's map data
on this map.

## Requirements

### Requirement: The page holds one entry per Canonn map

The demo site SHALL publish a page at `<base>canonn/` that gives the map a dataset
catalog. The catalog SHALL hold one entry for each Canonn ED3D map the build converted to
**one record or more**. A map the build converted to no record SHALL NOT be an entry.

Each entry SHALL carry:

| Field         | What it holds                                                             |
| ------------- | ------------------------------------------------------------------------- |
| `id`          | The name of the Canonn source file, without `MapData-` and `.js`          |
| `label`       | The name the Canonn map carries                                           |
| `collection`  | The subject group of the map                                              |
| `description` | What the map records, and where the data comes from                       |
| `systemCount` | The number of records the entry's files hold together                     |
| `files`       | What the entry reads: a path and a key-to-name-and-colour table, in order |

The categories of an entry SHALL be the categories the Canonn **map** names, with the name
and the colour that map gives. The page SHALL NOT invent a category, and SHALL NOT merge
the categories of two maps.

**A committed file holds what its source states, and the manifest holds what the map names.**
A record SHALL carry the system, its coordinates, **the keys its map's reader gives** and
**the source descriptions that are not one of those keys**, and nothing a map composed. The line is not per file
against per record: it is the source against the map.

- **The key stays in the record**, one key or more a record. A dump of Guardian ruins keys on
  the site type, which is Alpha, Beta and Gamma; a `literal` map carries `cat` on each system;
  the Clouds map draws **35 distinct keys**, 1.882 a record. A rule of one category per file
  would show the Clouds entry as one category instead of 35, and would take Alpha, Beta and
  Gamma off the Guardian ruins, which the demo page draws today from the same reader.
- **The key is the map's reader, not a column**, so the build SHALL take it from the map's own
  reader and the map table SHALL carry what that reader does. `MapData-Cloud.js` reads the
  `description` column, not the `category` column: it renames `Storm Cloud` to
  `Lagrange Cloud`, and for every row outside `Lagrange Cloud` and `FSS Signals` it puts the
  `category` value in the key and collapses the group to `Contents`. 24 values in a column
  become 35 keys. A build that read the column would draw a map Canonn does not draw.
- **A shared source SHALL be keyed once.** The build SHALL record which map's reader gave a
  file its keys, and SHALL fail, naming both maps and the file, where a second map names that
  source and keys it differently. Today only `MapData-Cloud.js` reads that dump, so nothing
  fails; without the rule a later map would take another map's keys in silence.
- **The display name and the colour are the map's**, so they are in the manifest.
  `dumpr/Biology/2100201.csv` is category 201 in `MapData-BT.js` and 701 in
  `MapData-Aliens.js`, and `MapData-BT.js` gives every colour of its table a random one.
- **Text a map composes is dropped.** `MapData-BT.js` writes `infos: signalLink(name,
englishName)` into each record it makes, and `MapData-Cloud.js` writes
  `infos: description + '<br>'`. That is the map's, it differs per map, and the page does not
  show it. The source's own description column is kept, because it varies per record and holds
  what the key does not.
- **A record SHALL NOT repeat one of its own keys as its description.** The Clouds map keys on
  the description column, so 36,137 records of the committed tree would carry one string
  twice, 21,604 of them in `clouds-life-cloud.json`. This is
  the rule the codex sets already follow, applied a record at a time instead of a file at a
  time: a codex file is one key, so every record of it would repeat that one string, and none
  of them carries a description at all.

**The colour is naming, not invention.** `MapData-Cloud.js` takes its colours from a 316-entry
palette **in the order the keys first appear** in the source, and 17 of the 49 map files build
theirs with `randomColor()`, which is a different value on each page load. The build SHALL
write a **stable** colour: the map's own palette, read in source order, where the map has one,
and a colour of the build's own where the map randomises. A second run SHALL write the same
colour for the same key. The rule "the page SHALL NOT invent a category" binds the keys and
the records, not the colour of a map that fixes none.

Each row of an entry's `files` SHALL therefore give the path and a table from the **keys of
that file** to the category name and the colour that entry's map gives each key. A codex file
holds one key or none, so its table holds one row.

**One file may appear twice in one entry.** The file is fetched once and its records are
added under both categories. "A source is converted once" binds the **committed tree**: no two
paths hold one source. It does not bind the manifest.

No entry names one path twice today. `MapData-All.js` named `dumpr/Thargoid/2100101.csv` as
both `bmsites` and `tbsites1`, and the Bark Mounds correction below points `bmsites` at the
Biology file the BM map reads, which removed the case. The rule stays because the manifest
allows it and the page SHALL hold to "each one once" whether or not a row uses it.

**A source is converted once into one file, and an entry names the files it reads.** 49 maps
name their sources many times over, and a source can feed more than one map: `MapData-All.js`
alone names most of the codex files, and `Aliens`, `BT`, `Guardians`, `TB` and `Thargoids`
repeat many of them. The delivered table reads **101 distinct sources**, measured on
2026-09-21: 11 bucket dumps, 64 codex CSV files, 22 files of the source tree, 1 query
endpoint, 2 selections of the Spansh faction dump and 1 edastro listing. A codex file is a
four-column CSV at `dumpr/<Subject>/<entry id>.csv`; `dumpr/hyperdictions.json` sits under
`dumpr/` and is a bucket dump, which is the one path the two counts turn on. The estimate that
set the ceiling counted the bucket sources alone, which is 74. A set file per map would write the codex corpus twice, which is about 6 MB
and a seventh of the tree, and would put the tree on its ceiling. The build SHALL therefore write **one file per converted source**, and
an entry SHALL name the files its map reads. Two maps that read one source read one file.

The page SHALL load one set at a time. It SHALL fetch the files the entry names, each one
once, and no other file, and SHALL join their records into one set.

**The join SHALL NOT merge records across files.** A Canonn map's own reader gives one record
per system **per file**, so a system that holds a find in eight of an entry's files gives
eight records at one coordinate, each under its own category. `systemCount` and the record
bound therefore count **records** and not distinct systems. Merging would drop the category of
every record but one, which is what the map draws.

**The map holds one record per system name, so an entry draws fewer systems than its
`systemCount`.** `addSystems` replaces a record whose name repeats rather than merging it,
so `Aliens` loads 27,639 records as 21,593 systems and `All-fm-fumaroles-2` loads 47,331 as
43,674. The dialog shows `systemCount`, which is the larger number, because that is the
record count the manifest states. A system named by two files of one entry keeps the
categories of the last file read.

#### Scenario: A shared source is one file

- **WHEN** a unit test reads the manifest for two entries whose maps name the same Canonn
  source
- **THEN** the two entries name the same file, and the committed directory holds one copy
  of it

#### Scenario: Two entries name one file differently

- **WHEN** the browser suite loads each of those two entries in turn and reads the categories
  the map holds
- **THEN** each reading is the category name and the colour that entry's own map gives, and
  the records of the file are the same records under both

#### Scenario: A file of several categories keeps them all

- **WHEN** the build converts the Clouds dump and splits it into its parts
- **THEN** the 25 Clouds entries together hold the 35 keys the Clouds map's own reader gives,
  not one and not the 24 values of the source's `category` column, and each key carries the
  name and the colour that map gives it

#### Scenario: A colour is the same on a second run

- **WHEN** the build runs twice over one map fixture whose colours the map randomises, and a
  unit test reads the colour of each key from both manifests
- **THEN** the two readings are the same

#### Scenario: Two maps that key one source differently fail the build

- **WHEN** the build reads a second map that names a source another map already keyed, with a
  different keying
- **THEN** the build fails and names both maps and the file

#### Scenario: The catalog is the manifest

- **WHEN** a unit test reads the page's manifest and the committed data directory
- **THEN** every entry of the manifest names files that exist, every file is named by an
  entry, and each entry's `systemCount` is the number of records its files hold together

#### Scenario: A set keeps the categories of its source

- **WHEN** the browser suite loads one set on the page
- **THEN** the map holds the categories that entry's manifest row names, and no category of
  another set

#### Scenario: The page loads one set

- **WHEN** the browser suite opens the page and reads the requests it made
- **THEN** the page fetched the files the start entry names and no other data file

### Requirement: A map over the set bound splits, and nothing is dropped for size

A set holds at most the number of systems `real-systems` states, which
`raise-the-system-set-bound` landed at **50,000**. The Clouds map holds 71,142 systems, so
it passes the bound and splits; one Geology codex file holds 30,668, so it is one entry.
At 50,000 the splits give 114 entries over 40 maps, and five maps split: Clouds into 25,
Geology into 23, All Sites into 17, Fumaroles into 10 and Gas Vents into 4. This requirement is what holds a map that passes the bound
later, and what holds every map if the bound lands lower than 100,000.

**A map splits where it passes either bound: the records a set holds, or the bytes a set
holds.** The Clouds map converts to 10.20 MB over 71,142 records, which is 143 bytes a record,
so the 16,000,000 byte per-set ceiling of the requirement "The committed data of the page
holds a stated ceiling" is reached at about **81,200 records**, under the record bound. A map
between those two numbers would otherwise be legal by one rule and illegal by the other.
**The byte bound binds the dump shape and not the codex shape**: a codex record is 84 bytes,
which reaches the same ceiling at about 190,000 records, above the record bound. The rule
holds both shapes with one sentence and does not have to know which it is reading. **Both
bounds run the same split**, and the rule below reads "over a bound" as over either one.

The build SHALL read the record bound from the library's public export rather than hold a
copy of it. `raise-the-system-set-bound` exports `MAX_SYSTEMS`, which the build reads from the library
**source**, because `packages/galaxy-map/dist/` is git-ignored and a read of it would make
the data build depend on `pnpm build` running first. The build SHALL fail where it cannot
read the declaration rather than fall back to a number of its own, and a test SHALL assert
the value it reads equals the library export. It SHALL read the byte ceiling from the same place the ceiling
requirement states it. Where a map converts to more records than the record bound, **or to
more bytes than the per-set ceiling**:

1. The build SHALL split that map by its own categories, one entry per category. Where the
   map reads several sources, a category names one file or more, and the split gives each
   part the file rows it needs. A file two parts need is named by both and written once.
2. Where one category is still over a bound, the build SHALL split it into numbered
   parts, in the order the records were read, each part inside **both** bounds.
3. The build SHALL apply rule 2 to a single source over a bound as well, because a source
   that no map splits is still one file the page has to load.

A split entry SHALL carry the map's own `collection`, so every part of one map stays
together in the dialog, and its label SHALL name the map, the category and the part. **Its
`id` SHALL be the map's id, the category and the part number, joined by hyphens**, because
`dataset-catalog` drops an entry whose `id` repeats one it has already read, and the
unsplit rule gives every part of one map the same id. **No
record SHALL be dropped for size.** The build SHALL print what it split and into how many
entries.

#### Scenario: A map over the bound splits by category

- **WHEN** the build converts a map whose record count passes the bound
- **THEN** it writes one entry per category of that map, each inside the bound, each under
  the map's own group, and prints the split

#### Scenario: One category over the bound splits into parts

- **WHEN** one category of such a map is itself over the bound
- **THEN** the build writes numbered parts of that category, each inside the bound, and no
  record is left out

#### Scenario: A map inside the record bound and over the byte ceiling splits

- **WHEN** the build converts a map whose record count is inside the record bound and whose
  bytes pass the per-set ceiling
- **THEN** it splits that map the same way it splits one over the record bound, every part
  is inside both bounds, and no record is left out

#### Scenario: The map rejects no record of a set

- **WHEN** the browser suite loads the largest set of the page and reads the add report
- **THEN** the report holds no rejection with the reason `over-capacity`

### Requirement: Every map belongs to one subject group

The build SHALL hold a table that names the subject group of every Canonn map it reads. A
map SHALL belong to exactly one group, and the group SHALL be the entry's `collection`,
which is what the dataset library draws a chip for.

**The build SHALL list the Canonn source tree at run time** and SHALL fail, naming the
file, where that listing holds a `MapData-*.js` file the table does not name. The listing
comes from the GitHub contents API of the Canonn repository, as the cycle build reads its
own archive. A new map in the Canonn source tree therefore stops the build rather than
reaching the page with no group, and a committed fixture of the listing cannot give that,
because a fixture is a snapshot of the day it was taken.

The build SHALL fail, and SHALL name the file, where the listing cannot be read. A run that
cannot see the source tree cannot say that the table is complete.

#### Scenario: A map the table does not name

- **WHEN** the build lists the Canonn source tree and the listing holds a `MapData-*.js`
  file the group table does not name
- **THEN** the build fails, names the file, and writes no partial set

#### Scenario: The listing cannot be read

- **WHEN** the build cannot read the listing of the Canonn source tree
- **THEN** the build fails and names the address it could not read

#### Scenario: The failure path has a unit test

- **WHEN** a unit test runs the table check over a committed listing fixture that holds one
  file the table does not name
- **THEN** the check fails and names that file. The fixture tests the failure path; the
  run-time listing is what sees a new map

#### Scenario: The dialog groups the maps

- **WHEN** the browser suite opens the dataset library of the page and reads the chip row
- **THEN** there is one chip per group the table names, each chip's count is the number of
  entries of that group, and every entry of the catalog is under one of them

### Requirement: The build reads each map from the source that map uses

The 49 `MapData-*.js` files of the Canonn source tree hold 45 records between them. Each
map fetches its own data when a browser opens it. The build SHALL therefore read, for each
map, the source that map itself reads:

- the object literal inside the `MapData-*.js` file,
- the JSON dumps of the Canonn downloads bucket,
- the codex CSV dumps of that bucket, one file per codex entry,
- the data files of the Canonn source tree, read from `raw.githubusercontent.com`,
- the query endpoints of the Canonn cloud functions.

Two maps read a dump of another project, which the notices name: the Spansh faction dump and
the edastro GEC listing.

The build SHALL NOT run the JavaScript of a Canonn source file. It reads the file to learn
what that map draws, and fetches the data itself.

**The build SHALL correct one fault of the Canonn source, and SHALL say so.**
`MapData-All.js` points its Bark Mounds slot at `dumpr/Thargoid/2100101.csv`, which the
live codex index names as a Thargoid Barnacle entry, and labels it "(BM) Bark Mounds". The
build SHALL read the Biology dump the BM map itself reads, so the category holds 3,440
correctly named systems and not 140 mislabelled ones. The map table and
`THIRD_PARTY_NOTICES.md` SHALL both record what the source does and what the build does
instead, so a reader sees a deliberate deviation and not a mistake. This is the one place
the build does not mirror the source.

**A source that does not answer SHALL NOT fail the build, unless the committed tree already
holds that map.** The build SHALL leave a map with no live source out, SHALL name the map
and the address in its output, and SHALL finish. The reason SHALL come from a fixed
vocabulary, so a reader can tell a retired endpoint from a broken one: `unreachable host`,
`404 gone`, `410 gone`, `500 server error`, `no coordinates of its own`, `converts to no
record`, and `live but larger than the ceiling`. A test SHALL hold every named drop to that
vocabulary.

`no coordinates of its own` names a source that answers and carries no position, which no
other word covers. `query/get_compres` is the case: it returns rows of `interesting` and
`system` and no coordinate. Today no map prints it, because the three maps that carry it
hold it on their second address behind a `500 server error` first address, and the build
prints the first reason it finds. It is in the vocabulary because the day that endpoint
recovers it becomes a printed reason.

**40 of the 49 maps convert**, measured on 2026-09-21. The nine that do not:

| Map | Reason | Address |
| --- | --- | --- |
| Biology | `404 gone` | `/unknown_biosignals` |
| Route | `404 gone` | `/get_codex_route` |
| Carriers | `500 server error` | `/query/fleetCarriers` |
| DCOH | `410 gone` | `dcoh.watch/api/v1/overwatch/systems` |
| Faction, FactionRes, Colonisation | `500 server error` | `elitebgs.app/api/ebgs/v5/factions` |
| Codex, Cmdr | `live but larger than the ceiling` | `/query/codex` |

`api.canonn.tech` resolves but never completes a TCP connection, and the 14 maps that once
read it now resolve their categories through the live codex index instead. **Codex and Cmdr
are the one drop that is not a failure.** Their index names 1,072 dump files, a sampled mean
of 398 KB each, so the whole codex is about 426 MB against a 50 MB ceiling. The project
owner chose to leave them out rather than raise the ceiling or ship an invented slice of a
map under that map's whole name. Ten maps already carry the codex dumps for their own
subjects, which is 60 of the 1,072 files. A page is then built from what the sources
still hold.

**A run SHALL NOT quietly take records out of the committed tree.** Where a map the
committed tree holds gives no record, or gives **10 percent fewer records or worse** than
the committed set holds, the build SHALL fail and SHALL name the map, the address, the count
it read and the count the committed set holds. A truncated answer, a partial CSV and a
paginated endpoint that stops early all look like a clean build otherwise. A run on a broken network, or on the day one endpoint is
down, would otherwise write a smaller tree that looks like a clean build, and the check
"a second run writes the same bytes" cannot see it, because both runs would be the short
one.

A map that is gone for good SHALL be taken out of the group table by hand, in the commit
that takes its data out. That is what makes the removal a line a reviewer reads.

**Five of the 49 maps are already committed for the demo page**, converted by
`build-demo-systems.mjs`: the Guardian ruins, the Guardian structures, the UIA, the
Adamastor and the multifaction spheres. The demo page's sixth set, the notable systems,
comes from `data/csvCache/notable_systems.json`, which no `MapData-*.js` reads, so it is
not a Canonn map and this page holds no entry for it. This page SHALL hold its own set for
each of them, because it holds one entry per Canonn map and a gap would be a map the reader
cannot find. Both builds SHALL read the same exported readers, so a reader that changes
changes both trees, and neither tree SHALL read the other's files.

The converted sets SHALL be committed, and the page SHALL read the committed files alone.
The raw dumps SHALL be fetched into the ignored data directory and SHALL NOT be committed.
**A build of the site and a run of the tests SHALL need no network.**

#### Scenario: A source that no longer answers

- **WHEN** the build asks a source that answers with an error or does not answer at all,
  and the committed tree holds no set for that map
- **THEN** the build names the map and the address, writes no set for that map, leaves the
  map out of the manifest, and finishes with the other maps written

#### Scenario: A source that answered before and does not now

- **WHEN** the build asks a source that does not answer, and the committed tree holds a set
  for that map
- **THEN** the build fails, names the map, the address and the record count the committed
  set holds, and writes no tree

#### Scenario: A source that answers with less than it held

- **WHEN** a map the committed tree holds converts to 10 percent fewer records or worse
- **THEN** the build fails and names both counts, and a person decides whether the source
  shrank or the run did

#### Scenario: The site builds with no network

- **WHEN** a developer builds the demo site and runs the unit tests with no network
- **THEN** both finish, and the page holds every set the committed data directory holds

#### Scenario: A reader reads its fixture

- **WHEN** a unit test runs each of the five source shapes over a committed fixture of that
  shape
- **THEN** the reader gives the records and the category keys the fixture states, and no
  category name, colour or map-composed text, and fetches nothing

### Requirement: The page states where each set comes from and under what licence

Each committed set SHALL carry the address of its source and the licence line of that
source, as the seven sets of the demo page do. `THIRD_PARTY_NOTICES.md` SHALL name the
Canonn ED3D map, the downloads bucket and the query endpoints, and SHALL say what the
conversion takes from each one.

#### Scenario: Every set names its source

- **WHEN** a unit test reads every committed set of the page
- **THEN** each one carries a source address and a licence line, and each address is one
  the notices file names

### Requirement: The committed data of the page holds a stated ceiling

The committed tree `apps/demo/demo-data/canonn/` SHALL stay under **50 MB**, and one set
SHALL stay under **16 MB**. **A megabyte here is 1,000,000 bytes**, so the two bounds are
50,000,000 and 16,000,000 bytes. The split of task 2.11 and the test of task 4.5 read one
number, and a reader who took MB as 2^20 would give the split 5 per cent more room than the
test allows. A unit test SHALL read both and SHALL fail above either one.
A set SHALL be committed as **minified** JSON. **This is a new convention for this
repository.** The seven sets of the demo page are pretty-printed, because
`build-demo-systems.mjs` writes them with `JSON.stringify(set, null, 2)`, and
`.prettierignore` names them so `pnpm format` leaves them alone. Minifying is worth about 35
per cent of the tree, which `apps/demo/demo-data/uia.json` reads as 724,106 bytes
pretty-printed against 459,923 minified. The sets of this page are 50 times that size, so
this page minifies and the demo page is not changed.

The arithmetic behind the ceiling, **as it was estimated** before the build ran. **It counts
each source once, which is what the rule "a source is converted once" makes true**: it read
74 distinct bucket sources as 11 JSON dumps of 41.43 MB and 63 codex CSV files of 21.78 MB,
and a file per map would write about 47 MB. The delivered table reads 101 distinct sources,
which the requirement above states, because the estimate left out the 22 files of the source
tree and the three dumps of other projects. Those 25 are small, so the estimate holds. A dump converts at **0.314** of its source, read from the Clouds map:
32.49 MB in, 10.20 MB out, 143 bytes a record, which carries the keys its map's reader gives
and the source descriptions that are not one of those keys. A codex CSV converts at **1.05**, read from `dumpr/Geology/1400102.csv`:
2.45 MB in, 2.57 MB out, 84 bytes a record, which carries neither, because the file is one
codex entry and the manifest names it. That gives 17.9 MB of dumps and 22.9 MB of codex sets, so
**about 41 MB**, and 37 MB to 50 MB once the one file per shape is allowed to be
unrepresentative. **The top of that band is the ceiling**, on purpose: a tree that lands there
is a tree the project owner is asked about again, which task 3.3 does.

The estimate the project owner answered on read the dump ratio as 0.432, from a probe that
joined the descriptions of a system's rows. The build keeps the first description instead, so
the measured ratio is 0.314 and the tree is **38,865,218 bytes**. That is inside the 37 MB to
50 MB band, and under the 41 MB the owner was given, so the answer holds on a smaller tree
than the one it was asked about.

**A codex record SHALL carry no description and no category of its own.** The category of a
codex set is the codex entry, which the manifest names, so either field repeats one string on
every line. Both take the codex ratio from 1.05 to 2.06, which is about 22 MB over the tree.

**The ceiling SHALL NOT rise.** A tree that does not fit holds maps the project has not
agreed to commit, which is the project owner's decision and not the build's. Where the
measured total is far under the ceiling, the build output says so and a later change may
bring the number down; this requirement is not edited during its own implementation.

The catalog SHALL stay inside the 256 entries `dataset-catalog` reads, after the splits the
requirement "A map over the set bound splits" makes. The build SHALL fail, and SHALL name
the count, where the splits take it past that bound.

#### Scenario: The committed data passes its ceiling

- **WHEN** a build writes a tree over 50 MB, or one set over 16 MB, and a developer runs the
  unit tests
- **THEN** the test fails and names the directory, the size and the bound

#### Scenario: The splits pass the catalog bound

- **WHEN** the splits would make more entries than the catalog reads
- **THEN** the build fails and names the count and the bound

### Requirement: The page reads a set off the main thread

The page SHALL fetch the files of the picked entry and SHALL parse them in a worker.
`apps/demo/src/multifaction.worker.ts` is the precedent: it reads the demo page's largest
set off the main thread, and `dataset-catalog` states that rule for that entry. The largest entry of this page fetches 3,954,837 bytes over five files, so a `JSON.parse` on the main thread would hold the frame loop
for a gap a user sees.

**The worker hands the records back over `postMessage`**, which the main thread pays for as
a structured clone, because `addSystems` takes record objects. The implementation SHALL
measure that hand-back beside the parse. Where the clone is the larger cost, the worker
SHALL post packed arrays as transferables and the page SHALL build the records in slices.

**The library's own part of a switch is not this requirement's cost.** `dataset-catalog`
gives the clear, the two reads and the two settings **40 milliseconds**, which is two to
three dropped frames by its own words. The reading below therefore covers the fetch and the
parse, and not the `loadDataset` call that follows them.

**The page SHALL open on a small entry.** `dataset-catalog` holds that `multifaction` is not
the entry the demo site loads at start, for the same reason: a page that opens on the
largest entry fetches 3,954,837 bytes before the user asks for anything.

**The set files SHALL be served as files, not inlined.** Vite turns an asset under 4,096
bytes into a data URL inside a chunk, and several of the five static-record maps are that
small. The page SHALL therefore take the sets from a directory Vite copies as it stands, or
the build SHALL set `assetsInlineLimit` to 0, so that every entry fetches the files it names and nothing else.

#### Scenario: The fetch and the parse leave the frame loop alone

- **WHEN** the browser suite picks the largest entry and reads the frame intervals from the
  fetch to the moment the records reach `loadDataset`
- **THEN** the page fetched the files that entry names and no others, the records reach the
  map, and the mean interval over that window is 18 ms or less

#### Scenario: The page opens on a small set

- **WHEN** the browser suite opens the page and reads the requests it made
- **THEN** the start entry is one of the sets under 1 MB, and no larger set was fetched

#### Scenario: The smallest set is a file of its own

- **WHEN** the site is built and a test reads the built tree for the smallest committed set
- **THEN** that set is a file under `dist/`, and no chunk of the page holds its records as a
  data URL
