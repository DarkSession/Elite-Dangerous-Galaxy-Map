# library-package Specification

## Purpose

States what the repository builds: a library package another project can install and
import, and a demo site built apart from it that carries the page and the demo data. It
also states the types the library puts on its public calls.

## Requirements

### Requirement: The library build emits a package and no page

`pnpm build` SHALL run the TypeScript check and then build the library. It SHALL write to
**`dist/`**. The output SHALL hold an ES module entry point, a type declaration for the
public surface, and the worker and asset chunks the library loads at run time. It SHALL
hold no HTML file, no demo page module and no demo data.

**It SHALL copy no file of `public/`.** Vite copies the public directory into the output by
default, and `public/` holds the demo site's pictures: the two demo thumbnails and
`EDLoader1.svg`, which ED Assets states no licence on. Serving that file on the owner's own
demo site is the owner's decision; putting it inside a package another project installs is a
different act, and the library needs none of the three files. The library configuration
SHALL therefore turn the copy off.

The two builds SHALL write to two directories, because the check job runs them one after
the other and the Pages job uploads one of them. A shared directory would leave the second
build's output where the first one's is looked for.

The entry point SHALL export `createGalaxyMap` and the types the public surface names:
`GalaxyMapOptions`, `GalaxyMap`, `MapView`, `Category`, `RealSystem`, `SystemImage`,
`RegionMode`, `CategoryInput`, `SystemRecordInput`, `HudOptions`, `HudAction`,
`HudHandle`, `AddReport`, `CategoryReport`, `Reject`, `CategoryReject`, and the four
dataset types the catalog names: `DatasetEntry`, `DatasetContent`, `DatasetInfo` and
`DatasetLoadResult`. A host writes the catalog itself, so it needs `DatasetEntry` in a
type position; a list that left the four out would make the `datasets` option unwritable
in typed code. It SHALL NOT
export the `debug` hook type as part of the supported surface.

`package.json` SHALL name the entry point in `exports` and `types`, SHALL name the built
files in `files`, and SHALL stop being `private`.

The library SHALL NOT read `window.location`, which `real-systems` already holds with a
lint rule, and SHALL NOT read an element by id.

The HUD SHALL stay a chunk of its own, loaded on demand, so a host that does not ask for
the HUD downloads none of it.

The library's own entry chunk SHALL stay under **200,000 bytes**. The bound is the guard
`tests/main-bundle.test.ts` already holds, and it is a guard against one fault: a
main-thread import of the region cell lookup adds about 199 KiB and takes the chunk over
370,000 bytes.

The bound was 170,000 while the page build was the only build. That number came from the
page chunk's 152,506 bytes and gave it about 17,000 bytes of room. The library entry chunk
is about 10,000 bytes larger than the page chunk for the same code, because Vite keeps the
line breaks in a library build, and the dataset catalog and the dataset dialog add more. At
169,700 bytes, with the catalog in and the grid still to come, the old bound left 300
bytes, which fails on the next comment and guards nothing. The finished chunk measures
170,932 bytes, which is over the old bound. 200,000 keeps the guard well under the reading a
leaked lookup gives.

**The library build is now measured.** At commit `7cd18d7` the page build's entry chunk
measured 152,506 bytes and its HUD chunk 27,419. The first library build measured 162,593
bytes for the entry chunk and 31,201 for the HUD chunk, before the dataset catalog and the
dataset dialog. With the whole change in, the library build measures **170,932** bytes for
the entry chunk and **47,271** bytes for the HUD chunk. A reading SHALL come from a fresh
build and not from a `dist/` left in the tree.

The library entry chunk is larger than the page chunk although it holds less code. Vite's
library mode compresses and mangles the output but keeps the line breaks, while the page
build removes them as well. Gzipped, the library entry chunk is 51.1 kB against the page
chunk's 54.8 kB, so the library is the smaller of the two over the wire. The page build's
152,506 bytes is therefore not a bound on the library.

#### Scenario: The library build carries no page and no demo data

- **WHEN** a test runs the library build into a temporary directory and reads every file
  it emitted
- **THEN** no file ends in `.html`, no file holds the text of a demo system name, no file
  holds the demo page's `galaxy-map-ready` event name, and no file of `public/` is there:
  neither `EDLoader1.svg` nor either demo thumbnail

#### Scenario: The built module loads and creates a map

- **WHEN** a test imports the built ES module by its path and reads the exported names
- **THEN** `createGalaxyMap` is a function, and the module imports with no error under
  Node with no DOM

#### Scenario: The declaration names the public surface

- **WHEN** a test compiles a file that imports every type the requirement lists from the
  built declaration and uses each one in a type position
- **THEN** the compile is clean, and a file that imports `GalaxyMapDebug` from it fails to
  compile

#### Scenario: The entry chunk stays under the bound

- **WHEN** a test runs the library build and reads the size of the entry chunk
- **THEN** the size is under 200,000 bytes, and the region cell lookup is in the region
  worker chunk alone

### Requirement: The demo site builds apart from the library

`pnpm build:demo-site` SHALL build the demo page as a web application: the HTML file, the
page module, the HUD, the demo data sets and the assets. It SHALL write to **`dist-demo/`**.
It SHALL set the base path to `/Elite-Dangerous-Galaxy-Map/`, which is where the
repository's GitHub Pages site serves from, so every asset URL in the built HTML starts
with that path.

The demo site SHALL be the build the browser suite serves. `pnpm preview` SHALL serve the
demo site build on port 4173, under that base path, and the Playwright configuration SHALL
build the demo site before it starts. The suite's base URL SHALL therefore be
`http://localhost:4173/Elite-Dangerous-Galaxy-Map/`, and every navigation in `e2e/` SHALL
be **relative** to it. A path that starts with `/` resolves against the origin and misses
the base path.

**The suite's helper SHALL clear the demo set by default.** The demo site loads the
Guardian Ruins set at start, and about 188 of the suite's tests read a marker count, a
category count or a frame that the set would change. `openMap` in `e2e/helpers.ts` SHALL
therefore call `clearSystemsAndCategories()` after `ready` settles, so every test that does
not ask for the set opens the map it opened before, and the far-view baseline image does
not change. `openMap` SHALL take an option that keeps the set, and only a test that reads
the demo data SHALL pass it.

The rule is in the helper and not in each test because the change would otherwise reach
every one of those tests, and a test written later would read a set it did not ask for.

**The demo site SHALL start with the coordinate grid on**, so a visitor who opens the
published page sees it without finding the HUD's options panel first. The site SHALL read
the switch from the URL fragment and write it back, so a reload and a shared link keep it;
`map-navigation` states the field and `coordinate-grid` states that the library default
stays off.

`openMap` SHALL turn the grid off beside the set clear, so a test that asks for neither
reads the library default. The option that keeps the demo set SHALL keep the grid on as
well: it is one option and it gives the demo site's own start state, which is what a test
of the demo site asks for. A test that wants the data and no grid calls `setGridVisible`
itself. The four files of `e2e/` that navigate by themselves and reach no helper SHALL take
the same start state, which task 3.8 states.

What the grid then draws is `coordinate-grid`'s to state, not this capability's.

The demo data SHALL reach the page through the same `addCategories` and `addSystems`
calls any host uses. The page SHALL hold the data and the library SHALL NOT.

The demo site SHALL run the map against the same library source the library build emits.
There SHALL be one copy of the map's code in the repository, not a page copy and a
library copy.

#### Scenario: The demo site carries the base path

- **WHEN** a test runs the demo site build and reads the emitted `index.html`
- **THEN** every `src` and `href` of a built asset starts with `/Elite-Dangerous-Galaxy-Map/`

#### Scenario: The browser suite serves the demo site

- **WHEN** the browser suite starts
- **THEN** it builds the demo site and serves it on port 4173, and the first test reads
  the map from `window.galaxyMap` as it does today

#### Scenario: Every navigation reaches the base path

- **WHEN** a unit test reads every `page.goto` call in `e2e/`, and a browser test opens a
  view fragment and reads the view
- **THEN** no call starts with `/`, and the view is the one the fragment named

#### Scenario: The suite opens an empty map by default

- **WHEN** a browser test opens the demo site through `openMap` with no option and reads
  `systemCount`, `categoryCount()` and `isGridVisible()`, and a second opens it with the
  option that keeps the set and reads all three again
- **THEN** the first readings are 0, 0 and false, and the second are 212, 3 and true

#### Scenario: The demo site starts with the grid on

- **WHEN** a browser test opens the demo site with no fragment and reads `isGridVisible()`,
  and a second opens it with `g=0` in the fragment and reads the same
- **THEN** the first reading is true and the second is false

#### Scenario: The two builds do not overwrite each other

- **WHEN** a test runs the library build, then the demo site build, and reads both
  directories
- **THEN** `dist/` holds the library entry chunk and `dist-demo/` holds `index.html`

#### Scenario: The demo data is the page's

- **WHEN** a test reads the demo site's page module and the library's entry chunk
- **THEN** the page module holds the calls that add the demo sets, and the library's entry
  chunk holds no demo record

### Requirement: The record input is typed

The library SHALL export `CategoryInput` and `SystemRecordInput`, and `addCategories` and
`addSystems` SHALL take `readonly CategoryInput[]` and `readonly SystemRecordInput[]`
rather than `readonly unknown[]`.

`CategoryInput` SHALL carry a required `name` string and a required `color` of three
numbers, and optional `description`, `markerStyle` and `maxDrawRange`.
`SystemRecordInput` SHALL carry a required `name` string, a required `coords` with `x`,
`y` and `z` numbers, a required `primaryCategory` string, and the optional fields the
requirement "A record follows the shape of an EDSM or a Spansh dump" of `real-systems`
lists, each with the type that requirement states. `id64` SHALL accept a number, a string
or a `bigint`. Both types SHALL allow unknown extra fields, because a Spansh or an EDSM
record carries fields the reader drops, and a caller SHALL NOT have to strip them first.

The run-time reader SHALL NOT change. It still validates every field and still returns the
rejection report, because the data comes from a file or a network call the compiler does
not see. The type states the contract and the reader holds it.

**BREAKING**: a caller that passes an array the type rejects no longer compiles. A caller
that reads JSON into `unknown` casts it at the call, which is the point at which the
unchecked data enters.

#### Scenario: A well-formed record compiles

- **WHEN** a type test passes an array holding a record with a name, `coords`, a
  `primaryCategory`, an `id64` as a string and two extra fields the reader drops
- **THEN** the compile is clean

#### Scenario: A malformed record does not compile

- **WHEN** a type test passes a record with no `primaryCategory`, and a second with
  `coords` holding strings rather than numbers
- **THEN** both fail to compile

#### Scenario: The reader still rejects at run time

- **WHEN** a unit test casts an array holding a record with no name to
  `readonly SystemRecordInput[]` and calls `addSystems`
- **THEN** the report holds one rejection with the reason `no-name`, as it does today
