## MODIFIED Requirements

### Requirement: The library build emits a package and no page

`pnpm build` SHALL run the TypeScript check and then build the library. It SHALL write to
**`dist/`**. The output SHALL hold **two ES module entry points**, a type declaration for
the public surface, and the worker and asset chunks the library loads at run time. It
SHALL hold no HTML file, no demo page module and no demo data.

**It SHALL copy no file of `public/`.** Vite copies the public directory into the output by
default, and `public/` holds the demo site's pictures: the two demo thumbnails and
`EDLoader1.svg`, which ED Assets states no licence on. Serving that file on the owner's own
demo site is the owner's decision; putting it inside a package another project installs is a
different act, and the library needs none of the three files. The library configuration
SHALL therefore turn the copy off.

The two builds SHALL write to two directories, because the check job runs them one after
the other and the Pages job uploads one of them. A shared directory would leave the second
build's output where the first one's is looked for.

**The main entry point** SHALL export `createGalaxyMap`, the three view calls `encodeView`,
`decodeView` and `decodeGrid`, and the types the public surface names:
`GalaxyMapOptions`, `GalaxyMap`, `MapView`, `Category`, `RealSystem`, `SystemImage`,
`CategoryInput`, `SystemRecordInput`, `HudOptions`, `HudAction`,
`HudHandle`, `AddReport`, `CategoryReport`, `Reject`, `CategoryReject`, the four
dataset types the catalog names: `DatasetEntry`, `DatasetContent`, `DatasetInfo` and
`DatasetLoadResult`, the **nine** shape types `map-shapes` names: `SphereInput`,
`LineInput`, `LinePoint`, `Sphere`, `Line`, `ShapeReport`, `ShapeReject`, `ShapeInfo` and
`ShapeKind`, the six
camera types: `StartView`, `FlyToTarget`, `FlyToOptions`,
`FlightOutcome`, `BrowseBounds` and `InteractionSwitches`, and **`NebulaSource`**, which
this change names. A host writes
the catalog itself, so it needs `DatasetEntry` in a
type position; a list that left the four out would make the `datasets` option unwritable
in typed code. The same holds for `SphereInput` and `LineInput`, which a host needs to
write the argument of `addSpheres` and `addLines`, and for the six camera types, which a
host needs to write `startView`, `bounds`, `interaction`, the argument of `flyTo` and the
parameter of an `onFlightEnd` listener. It
SHALL NOT export the `debug` hook type as part of the supported surface.

**`NebulaSource` joins the list** because `nebulae` is an option a host writes. Its value
is the single export of the second entry point, and a host that names the option in a
typed configuration object needs the type. The members of `NebulaSource` are not part of
the supported surface: a host passes the value it imported and writes no source of its
own.

**The second entry point** SHALL be the nebula source, reached at the subpath
**`./nebulae`**. It SHALL export one value and nothing else. It SHALL be a chunk of its
own, and the main entry chunk SHALL NOT import it, at load or on demand. `nebulae` states
what it carries.

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

**The three nebula members add no type.** `hasNebulae()`, `areNebulaeVisible()` and
`setNebulaeVisible(on)` take and give a boolean, so the declaration carries them on
`GalaxyMap` and the export list does not move for them.

**The package moves to version 0.5.0.** The nebulae drew with no option and now need one.
A host that built a map with no options saw them and now does not, and the call still
compiles, so the break is in what the map draws and not in the declaration.

The surface keeps the breaks 0.3.0 and 0.4.0 carried. `Sphere.color` and `Line.color` are
optional, because a shape that names a category takes that category's colour, which
`map-shapes` states. A sphere washes the markers inside it and behind it rather than every
marker it covers. `setCategoryVisible` moves a category's markers alone, and
`setShapeCategoryVisible` moves its shapes.

`package.json` SHALL name **both** entry points in `exports`, SHALL name the main one in
`types`, SHALL name the built files in `files`, and SHALL stop being `private`.

`package.json` SHALL carry **`"sideEffects": false`**, so a host's bundler may drop a
module the host does not reach. The claim SHALL be true: no module of the library SHALL
import a stylesheet. No module should rely on being evaluated for its effect either, but
that half is guidance, not a SHALL: no test can fail it, and the scenario below covers the
stylesheet half alone. The library injects its
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
capability already holds says. The readings so far are 236,815, then 252,975, then
253,520, then **266,996** when `add-nebulae` put the nebula pass, the record set and a
shader pair into the chunk, which is when the bound moved from 254,000 to **270,000**.

This change takes the nebula code back out of the chunk, into the second entry point. The
expected fall is **up to 13,476 bytes** — the whole of what `add-nebulae` added, 266,996
less the 253,520 before it — and in practice smaller, because that difference also holds
the wiring this change keeps, and the change adds an option check, three handle members
and a null slot. The `index.js` reading alone can fall further than that, because a module
both entry points reach may move into a shared chunk; that is why the implementation
records two figures. The implementation SHALL measure the chunk, write **both the
reading and the new bound** here, and move the bound **down** to the next round figure
above the reading. Recording only the reading would leave the scenario below with no
number to read. A bound
that only ever rises guards less each time, and a reading that falls is the one moment
the bound can be tightened without guessing.

The bound still catches the one fault it is for at any figure in this range, because the
region cell table is 199 KiB.

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
  count.** `vite.config.lib.ts` marks `@elite-dangerous-almanac/core` and its subpaths
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
- **THEN** none of them holds the nebula shader text, the record file name or the sprite
  atlas file name

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

#### Scenario: The package names its version

- **WHEN** a test reads `version` from `package.json`
- **THEN** it is `0.5.0`
