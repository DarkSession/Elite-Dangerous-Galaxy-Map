## MODIFIED Requirements

### Requirement: The library build emits a package and no page

**The repository is a pnpm workspace.** The library is the package
**`packages/galaxy-map/`** and the demo site is the private package **`apps/demo/`**. Each
holds its own `package.json` and its own Vite configuration. The root `package.json` is
private, publishes nothing, and carries the scripts a developer runs.

**How every spec's paths are read after the move.** This capability states the rule once,
and no other spec is rewritten for the move.

| A spec writes | It names |
| ------------- | -------- |
| `src/...` | a file of the library package, at `packages/galaxy-map/src/...` |
| `src/app/main.ts`, `src/app/multifaction*.ts` | a file of the demo app, at `apps/demo/src/...` |
| `demo-data/...` | `apps/demo/demo-data/...` |
| `public/...` | `apps/demo/public/...` |
| `index.html` | `apps/demo/index.html` |
| `dist/` as the library build | `packages/galaxy-map/dist/` |
| `dist-demo/` | `apps/demo/dist/` |
| `THIRD_PARTY_NOTICES.md` | the file that carries that source, which is `packages/galaxy-map/THIRD_PARTY_NOTICES.md` for a source the package ships and the root file for every other one |

Specs written before the move are read through this table and are not rewritten for it.
The exceptions are a scenario that **asserts on** a moved path rather than mentioning it,
and the requirement that reads the notices as one file: `real-systems` holds one such
scenario and `galactic-regions` holds that requirement, and this change carries a delta
for each.

The library build SHALL emit **three** ES module entry points: the main one, `./nebulae`
which `make-nebulae-optional` adds, and `./testing`.

**`./testing` is not the supported surface.** It exports `galaxyMapGlobal`,
`GalaxyMapGlobal` and `TestView`: the object `src/render/context.ts` writes the unmasked
renderer string and the error text into, and which the browser tests read. It carries no
compatibility promise and the main entry point SHALL NOT re-export it. It is an entry
point rather than a demo module because `src/render/context.ts` writes it, and that write
is what makes a software-renderer fallback fail the browser suite.

`pnpm build` SHALL run the TypeScript check and then build the library. It SHALL write to
**`packages/galaxy-map/dist/`**. The output SHALL hold the **three ES module entry points**
named above, a type declaration for each, and the worker and asset chunks the library
loads at run time. It SHALL hold no HTML file, no demo page module and no demo data.

**It SHALL copy no file of `public/`.** Vite copies the public directory into the output by
default, and `public/` holds the demo site's pictures: the two demo thumbnails and
`EDLoader1.svg`, which ED Assets states no licence on. Serving that file on the owner's own
demo site is the owner's decision; putting it inside a package another project installs is a
different act, and the library needs none of the three files. The library configuration
SHALL therefore turn the copy off.

The two builds SHALL write inside their own packages: the library to
`packages/galaxy-map/dist/` and the demo site to `apps/demo/dist/`. Neither can land where
the other is looked for, so the check job may run them in either order and the Pages job
uploads one directory that no other build writes. The single-package layout needed a
`dist-demo/` for this reason; the workspace does not.

**The main entry point** SHALL export `createGalaxyMap`, the three view calls `encodeView`,
`decodeView` and `decodeGrid`, **`createFragmentWriter`** with its types
**`FragmentWriter`** and **`FragmentWriterOptions`**, and the types the public surface
names:
`GalaxyMapOptions`, `GalaxyMap`, `MapView`, `Category`, `RealSystem`, `SystemImage`,
`CategoryInput`, `SystemRecordInput`, `HudOptions`, `HudAction`,
`HudHandle`, `AddReport`, `CategoryReport`, `Reject`, `CategoryReject`, the four
dataset types the catalog names: `DatasetEntry`, `DatasetContent`, `DatasetInfo` and
`DatasetLoadResult`, the **nine** shape types `map-shapes` names: `SphereInput`,
`LineInput`, `LinePoint`, `Sphere`, `Line`, `ShapeReport`, `ShapeReject`, `ShapeInfo` and
`ShapeKind`, the six
camera types: `StartView`, `FlyToTarget`, `FlyToOptions`,
`FlightOutcome`, `BrowseBounds` and `InteractionSwitches`, and **`NebulaSource`**, which
`make-nebulae-optional` names. A host writes
the catalog itself, so it needs `DatasetEntry` in a
type position; a list that left the four out would make the `datasets` option unwritable
in typed code. The same holds for `SphereInput` and `LineInput`, which a host needs to
write the argument of `addSpheres` and `addLines`, and for the six camera types, which a
host needs to write `startView`, `bounds`, `interaction`, the argument of `flyTo` and the
parameter of an `onFlightEnd` listener. It
SHALL NOT export the `debug` hook type as part of the supported surface.

**The two shape category members add no type.** `setShapeCategoryVisible(name, visible)`
and `isShapeCategoryVisible(name)` take a string and a boolean, so the declaration carries
them on `GalaxyMap` and the export list does not move.

**`ShapeInfo` and `ShapeKind` join the list** because `getShapeInfo(kind, index)` is a
handle member, which `map-shapes` states. A host that reads a shape needs the return type
in a type position, and it cannot name the `kind` argument without `ShapeKind`. The HUD
reads a shape row through the same two types and through no other path, which is what keeps
the HUD boundary rule that `AGENTS.md` holds.

**`RegionMode` is gone from the list.** The region overlay took three modes and now takes
one switch, which `galactic-regions` states, so the type it named no longer exists.

**The fragment writer joins the list** because the demo page reaches it today by a deep
import, and the move gives it no such reach. It is already written as a host helper: it
takes a `write` callback so that the library never touches `window.location`, which is
what the `real-systems` lint rule requires of every library module. Its `view` parameter
SHALL take `MapView` rather than the internal `View`.

**The three view calls SHALL name `MapView` too.** `encodeView(view: View)` and
`decodeView(): View` name `src/camera/view.ts`'s `View`, which the entry point does not
export, so the built declaration today returns a type a host cannot name. `View` and
`MapView` are structurally identical, so the change is to the signatures alone and no
caller breaks. The declaration then carries **one** view type rather than two, and the
package stops publishing a reference to an unexported name. This is a defect the tree
already has; it is fixed here because a published declaration is what this change is for.

**`NebulaSource` joins the list** because `nebulae` is an option a host writes. Its value
is the single export of the second entry point, and a host that names the option in a
typed configuration object needs the type. The members of `NebulaSource` are not part of
the supported surface: a host passes the value it imported and writes no source of its
own.

**The second entry point** SHALL be the nebula source, reached at the subpath
**`./nebulae`**. It SHALL export one value and nothing else. It SHALL be a chunk of its
own, and the main entry chunk SHALL NOT import it, at load or on demand. `nebulae` states
what it carries.

**The three nebula members add no type.** `hasNebulae()`, `areNebulaeVisible()` and
`setNebulaeVisible(on)` take and give a boolean, so the declaration carries them on
`GalaxyMap` and the export list does not move for them.

**The package stays at version 0.6.0.** This change moves no file a host imports and
changes no call. It renames the package, which is not a version step: nothing was
published under the old name. The publish workflow reads `major.minor` from
`package.json` and picks one above the highest patch published on that line. The registry
holds no version of this name, so the first release is `0.6.0`.

The surface keeps the breaks 0.3.0 and 0.4.0 carried. `Sphere.color` and `Line.color` are
optional, because a shape that names a category takes that category's colour, which
`map-shapes` states. A sphere washes the markers inside it and behind it rather than every
marker it covers. `setCategoryVisible` moves a category's markers alone, and
`setShapeCategoryVisible` moves its shapes.

**The package's published identity.** `packages/galaxy-map/package.json` SHALL name the
package **`@elite-dangerous-almanac/galaxy-map`**. It SHALL carry a one-line
`description`, an `author`, a `repository` that names this repository, a `homepage`, a
`bugs` address and a `keywords` list. It SHALL carry
`"publishConfig": { "access": "public" }`, because a scoped package is private by default
and a first publish without it fails. It SHALL NOT be `private`.

`package.json` SHALL name **all three** entry points in `exports` — the main one,
`./nebulae` and `./testing` — SHALL name the main one in `types`, and SHALL name in
`files` what the tarball carries. A subpath left out of `exports` does not resolve for a
host at all.

**`dependencies` SHALL hold what a host installs, and nothing else.** The library build
marks `gl-matrix` and `@elite-dangerous-almanac/core` external, so those two SHALL be
`dependencies`. The **two** `@fontsource` packages — `chakra-petch` and
`ibm-plex-mono`, from which `src/hud/styles.ts` imports **three** `.woff2` files — are
read at build time and emitted into the output as font files, so they SHALL be
`devDependencies`. A host that installs the package SHALL therefore pull two packages,
not four.

`package.json` SHALL carry **`"sideEffects": false`**, so a host's bundler may drop a
module the host does not reach. The claim SHALL be true: no module of the library SHALL
import a stylesheet or rely on being evaluated for its effect. The library injects its
HUD style from a module the HUD calls, and imports its fonts as URLs, so no module needs
evaluating for its effect today.

The library SHALL NOT read `window.location`, which `real-systems` already holds with a
lint rule, and SHALL NOT read an element by id.

The HUD SHALL stay a chunk of its own, loaded on demand, so a host that does not ask for
the HUD downloads none of it.

**The entry chunk bound.** The bound sits in `tests/main-bundle.test.ts` as
`ENTRY_CHUNK_LIMIT`. It is a guard against one fault: a main-thread import of the region
cell lookup adds about 199 KiB and takes the chunk over 370,000 bytes.

**The implementation SHALL read the built size and write it here**, as the rule this
capability already holds says. The reading history, up to the change before this one, is
236,815, then 252,975, then 253,520, then **266,996** when `add-nebulae` put the nebula
pass, the record set and a shader pair into the chunk, which is when the bound moved from
254,000 to **270,000**. `make-nebulae-optional` then took the nebula code back out of the
chunk, into the second entry point, and wrote its own reading and its own lower bound into
this requirement. Those two figures are the current state; every figure named above them
is history.

This change moves the file the test builds from and the directory the test reads, so the
test's paths change and its bound does not. It **does** move the reading, for two reasons:
it exports the fragment writer from the entry point, and that function is tree-shaken out of
the entry chunk today, so it enters; and it adds a third entry point that also reaches
`src/render/global.ts`, which the bundler may re-partition.

**The readings this change leaves are 245,833 bytes for the entry chunk alone and
261,172 bytes for the entry chunk and the chunks it loads with**, against the bound of
**260,000**, which `make-nebulae-optional` set and this change carries forward. The bound
reads `index.js` alone, so the pair above it is a reading and not a failure. The entry
chunk keeps 14,167 bytes of room under the bound.

The reading before this change was 245,616 bytes for the entry chunk and 260,724 for the
pair, so the entry chunk grew by **217 bytes** and the pair by 448. The fragment writer
and `FRAGMENT_THROTTLE_MS` are that size, which is the first of the two causes above.
The third entry point moved no module out of the entry chunk: `src/render/global.ts`
stays in a chunk the entry loads with, as it was.

The bound still catches the one fault it is for at any figure in this range, because the
region cell table is 199 KiB.

**The HUD chunk has a bound of its own**, `HUD_CHUNK_LIMIT` in the same file. It stays
at **70,000**, which `map-hud` set. **The reading this change leaves is 62,299 bytes**,
against 62,293 before it, so 7,701 bytes of room remain. **No HUD source file changed in
this change**, so the six bytes are a difference in the emitted chunk and not in the
code. A move of this bound would be for the HUD pulling in a data layer, and the region
cell table alone is 199 KiB, which no room under 70,000 absorbs.

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

#### Scenario: The second entry point exports the source alone

- **WHEN** a test imports the built `./nebulae` entry point and reads its exported names
- **THEN** it holds exactly one export, and the main entry chunk names that chunk in no
  static and no dynamic import

#### Scenario: The declaration names the public surface

- **WHEN** a test compiles a file that imports every type the requirement lists from the
  built declaration and uses each one in a type position
- **THEN** the compile is clean, and a file that imports `GalaxyMapDebug` from it fails to
  compile

#### Scenario: The entry point exports the fragment writer

- **WHEN** a test compiles a host module that imports `createFragmentWriter`,
  `FragmentWriter` and `FragmentWriterOptions` from the built main declaration, and calls
  the writer with a `MapView` and a `write` callback
- **THEN** the compile is clean, and no deep import of `app/url-view` appears in it

#### Scenario: The testing entry point carries the probe object

- **WHEN** a test imports `galaxyMapGlobal` from the built `./testing` entry point and
  calls it with a stub window
- **THEN** it returns the object with `renderer`, `ready` and `error`, and the same call
  against the **main** entry point fails to resolve

#### Scenario: The demo page reaches no library internal

- **WHEN** a test reads every module under `apps/demo/src/` and lists its imports
- **THEN** every import of the library is by the package name or one of its subpaths, and
  no import is a relative path that leaves `apps/demo/`

#### Scenario: The nebula option is writable in typed code

- **WHEN** a test type-checks a host module that imports the source from the built
  `./nebulae` declaration, imports `NebulaSource` from the main declaration, and writes
  `createGalaxyMap(canvas, { nebulae: source })`
- **THEN** the check passes with no error

#### Scenario: The entry chunk stays under the bound

- **WHEN** a test runs the library build and reads the size of the entry chunk
- **THEN** the size is under the bound this requirement records, and the region cell
  lookup is in **no entry chunk** and in **no chunk the entry chunk imports at load**.

  **How many chunks carry it follows the build, and the scenario SHALL NOT assert a fixed
  count.** The library's `vite.config.ts` marks `@elite-dangerous-almanac/core` and its
  subpaths
  **external**, so a host holds one copy of the package. `regionNameAtExact` imports the
  lookup by a bare specifier, and in the library build that specifier stays a bare specifier
  in the output: no chunk of `dist/` carries the table except the region worker's, which
  bundles it because the worker build sets `rollupOptions: { external: [] }`.

  A build that **bundles** the package instead carries it in two chunks, the worker's and
  one lazily loaded chunk that `regionNameAtExact` fetches on its first call. Both shapes
  hold the two rules above, which are what the bound is for, and neither is a fault.

  The rule was that the lookup sat in the region worker chunk alone. The handle now answers
  an exact region for one plane point, which the information panel of `map-hud` states, and
  that answer needs the 199 KiB cell table on the main thread. A dynamic import keeps it out
  of the entry chunk, which is what the bound is for: a host that never asks for an exact
  region never fetches it, and the entry chunk is the same size it was.

#### Scenario: The entry chunk holds no nebula code

- **WHEN** a test runs the library build and reads the entry chunk and every chunk the
  entry chunk imports at load
- **THEN** none of them holds the nebula shader text, the record file name, the volume index
  name or any volume asset name

#### Scenario: The entry point exports the camera surface

- **WHEN** a test imports the built entry point and reads its named exports
- **THEN** `createGalaxyMap`, `encodeView`, `decodeView` and `decodeGrid` are all present

#### Scenario: The camera types are declared

- **WHEN** a test type-checks a host module that writes a `startView`, a `bounds`, an
  `interaction` and a `flyTo` target against the built type declaration
- **THEN** the check passes with no error

#### Scenario: The declaration names the two shape category members

- **WHEN** a test type-checks a host module that calls `setShapeCategoryVisible('A', false)`
  and reads `isShapeCategoryVisible('A')` into a boolean, against the built type declaration
- **THEN** the check passes with no error

#### Scenario: The declaration names the three nebula members

- **WHEN** a test type-checks a host module that calls `setNebulaeVisible(false)` and reads
  `areNebulaeVisible()` and `hasNebulae()` into booleans, against the built type
  declaration
- **THEN** the check passes with no error

#### Scenario: The shape types are declared

- **WHEN** a test type-checks a host module that reads `getShapeInfo('sphere', 0)` into a
  `ShapeInfo` and writes a `ShapeKind` against the built type declaration
- **THEN** the check passes with no error

#### Scenario: The package declares no side effect

- **WHEN** a test reads `sideEffects` from `package.json`, and searches every source file
  of `src/` for an import of a `.css` file
- **THEN** `sideEffects` is `false` and the search finds none

#### Scenario: The package names its published identity

- **WHEN** a test reads `packages/galaxy-map/package.json`
- **THEN** `name` is `@elite-dangerous-almanac/galaxy-map`, `private` is absent,
  `publishConfig.access` is `public`, and `description`, `author`, `license`,
  `repository`, `homepage`, `bugs` and `keywords` are all present and not empty

#### Scenario: A host installs two packages

- **WHEN** a test reads `dependencies` and `devDependencies` of the library package
- **THEN** `dependencies` holds `gl-matrix` and `@elite-dangerous-almanac/core` and
  nothing else, and each `@fontsource` package is in `devDependencies`

#### Scenario: The package names its version

- **WHEN** a test reads `version` from `package.json`
- **THEN** it is `0.6.0`

#### Scenario: The declaration names the panel types

- **WHEN** a test compiles a file that imports `SystemDetails`, `SystemDetailValue`,
  `HudInfoFields`, `HudMapOption` and `HudAction` from the built declaration, writes a
  `details` loader whose `SystemDetails` carries a `values` entry and an `actions` entry,
  and writes an `infoFields` object and a `lockedOptions` array
- **THEN** the compile is clean

#### Scenario: The HUD chunk stays under its bound

- **WHEN** the bundle test reads the built HUD chunk, which carries the Markdown parser,
  the details reader and the new panel code
- **THEN** its size is under the HUD bound this requirement states, and the requirement
  holds the reading the build gave

### Requirement: The demo site builds apart from the library

`pnpm build:demo-site` SHALL build the demo page as a web application: the HTML file, the
page module, the HUD, the demo data sets and the assets. It SHALL write to
**`apps/demo/dist/`**. It SHALL set the base path to `/Elite-Dangerous-Galaxy-Map/`, which is where the
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

**The demo is a package of the workspace and depends on the library from inside it.**
`apps/demo/package.json` SHALL be `private`, and SHALL name
`@elite-dangerous-almanac/galaxy-map` as a dependency with the **`workspace:*`** range.
The demo SHALL import the map **by the package name**, at all three entry points — the
main one, `./nebulae` and `./testing` — and SHALL NOT reach the library by a relative
path. A demo module that reached a library internal
would then fail to resolve, which is the boundary this layout is for. The demo SHALL
never install the published package from the registry.

`apps/demo/vite.config.ts` SHALL resolve **all three** entry points of that package to the
library's **source**, with the two subpath aliases ordered **before** the bare name,
because a string alias matches an importee that starts with the alias plus `/`. The dev
server then needs no library build, and hot reload reaches a change in either package. The demo site build SHALL therefore build the library's source
with the page, which is the one copy of the map's code the paragraph above states.

Resolving to the source means the demo does not exercise the package's `exports` map. The
bundle tests of the requirement above do exercise it: they build a host entry against the
**built** package. Both checks are needed, and neither replaces the other.

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
- **THEN** `packages/galaxy-map/dist/` holds the library entry chunk, `apps/demo/dist/`
  holds `index.html`, and neither directory holds a file the other build wrote

#### Scenario: The demo depends on the library through the workspace

- **WHEN** a test reads `apps/demo/package.json`
- **THEN** `private` is true, and `@elite-dangerous-almanac/galaxy-map` is a dependency
  with the range `workspace:*`

#### Scenario: The demo imports the map by its package name

- **WHEN** a test reads every import of every source file under `apps/demo/src/`
- **THEN** no import reaches `packages/galaxy-map/` by a relative path, and every import
  of the map names `@elite-dangerous-almanac/galaxy-map` or one of its `./nebulae` and
  `./testing` subpaths. `src/app/main.ts` uses all three

#### Scenario: The dev server resolves the map from source

- **WHEN** a test starts the demo's Vite dev server and asks it to resolve each of the
  three package specifiers
- **THEN** each one resolves to a file under `packages/galaxy-map/src/`, and none
  resolves under `packages/galaxy-map/dist/`, so the demo runs with no library build

#### Scenario: The demo data is the page's

- **WHEN** a test reads the demo site's page module and the library's entry chunk
- **THEN** the page module holds the calls that add the demo sets, and the library's entry
  chunk holds no demo record

## ADDED Requirements

### Requirement: The package states its terms and ships them

**`LICENSE.md` at the repository root** SHALL state **non-commercial** terms, which is the
maintainer's choice and follows from the map's data: `THIRD_PARTY_NOTICES.md` records that
several of the map's sources are non-commercial, and the code and that data ship in one
tarball.

**The licence file SHALL say what those terms cover and what they do not.** The terms are
this project's own work, and the project cannot license the data and the art of other
holders. The file SHALL name `THIRD_PARTY_NOTICES.md` and the holder of the game data, so
a reader who opens the licence alone does not read it as terms over the art. A test SHALL
read both.

The **tarball SHALL also carry `LICENSE.md`**, copied from the root by the packaging step
rather than committed a second time, so that npm and GitHub each read a file where each
looks. The copy SHALL NOT be committed, so a test SHALL read it from the packed file list
and SHALL NOT expect it in the package directory of a fresh checkout. `pnpm test` runs
before anything is packed or built. The repository holds `e2e/`, `tests/`, `scripts/` and the demo app
beside the package, and a root with no licence states no terms for any of them.

`package.json` SHALL name those terms in `license`. Where the terms are a published
licence with an SPDX identifier, `license` SHALL be that identifier; otherwise it SHALL be
`SEE LICENSE IN LICENSE.md`, which npm accepts for terms that are not on the SPDX list.

The tarball SHALL carry `LICENSE.md`, `THIRD_PARTY_NOTICES.md` and the package's own
`README.md` beside the built output. A user who installs the package SHALL be able to read
the terms of the code **and** of the data without opening the repository.

The package's `README.md` SHALL be the package's own, not the repository's. It SHALL state
what the package is, how it is installed, what it needs beside itself, a smallest working
example, the `nebulae` option and what asking for it downloads, and the terms. The
repository's `README.md` stays the repository's and is not shipped.

**The tarball SHALL carry nothing else.** No source file, no test, no OpenSpec artifact,
no demo data, no configuration and no image outside the build output. A test SHALL read
what `npm pack` would ship and SHALL fail on a file that is not in the list above or under
the build output.

The test SHALL read the file list from `npm pack --dry-run --json`, which reports what
would ship without writing a tarball, so the check costs no publish and can run on every
push.

#### Scenario: The tarball carries the terms

- **WHEN** a test reads the file list `npm pack --dry-run` reports for the library package
- **THEN** it holds `LICENSE.md`, `THIRD_PARTY_NOTICES.md` and `README.md`

#### Scenario: The licence names what it does not cover

- **WHEN** a test reads `LICENSE.md`
- **THEN** it holds the licence text, names `THIRD_PARTY_NOTICES.md` and names Frontier
  Developments as the holder of the game data and the visuals

#### Scenario: The tarball carries no source and no artifact

- **WHEN** a test reads the same file list
- **THEN** no entry is under `src/`, none ends in `.test.ts`, none is under `openspec/`,
  none is under `demo-data/`, and every other entry is under the build output directory

#### Scenario: The tarball carries the built code

- **WHEN** a test reads the same file list
- **THEN** it holds the entry chunk and the entry declaration, both under the build
  output directory, so a list of the three text files and `package.json` alone fails

#### Scenario: The licence is named and present

- **WHEN** a test reads `license` from the library package's `package.json`, reads
  `LICENSE.md` at the repository root, and reads the `npm pack --dry-run` file list
- **THEN** `license` is not empty, `LICENSE.md` is at the repository root, the packed file
  list holds `LICENSE.md`, and the root file holds
  non-commercial terms

#### Scenario: The package README is the package's own

- **WHEN** a test reads the `README.md` the tarball carries
- **THEN** it holds the installed package name, an import of the entry point, and a link
  to the repository, and it is not the repository's `README.md`
