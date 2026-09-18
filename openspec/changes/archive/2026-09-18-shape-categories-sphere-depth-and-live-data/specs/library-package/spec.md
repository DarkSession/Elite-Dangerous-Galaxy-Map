## MODIFIED Requirements

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

The entry point SHALL export `createGalaxyMap`, the three view calls `encodeView`,
`decodeView` and `decodeGrid`, and the types the public surface names:
`GalaxyMapOptions`, `GalaxyMap`, `MapView`, `Category`, `RealSystem`, `SystemImage`,
`CategoryInput`, `SystemRecordInput`, `HudOptions`, `HudAction`,
`HudHandle`, `AddReport`, `CategoryReport`, `Reject`, `CategoryReject`, the four
dataset types the catalog names: `DatasetEntry`, `DatasetContent`, `DatasetInfo` and
`DatasetLoadResult`, the **nine** shape types `map-shapes` names: `SphereInput`,
`LineInput`, `LinePoint`, `Sphere`, `Line`, `ShapeReport`, `ShapeReject`, `ShapeInfo` and
`ShapeKind`, and the six
camera types this change names: `StartView`, `FlyToTarget`, `FlyToOptions`,
`FlightOutcome`, `BrowseBounds` and `InteractionSwitches`. A host writes
the catalog itself, so it needs `DatasetEntry` in a
type position; a list that left the four out would make the `datasets` option unwritable
in typed code. The same holds for `SphereInput` and `LineInput`, which a host needs to
write the argument of `addSpheres` and `addLines`, and for the six camera types, which a
host needs to write `startView`, `bounds`, `interaction`, the argument of `flyTo` and the
parameter of an `onFlightEnd` listener. It
SHALL NOT export the `debug` hook type as part of the supported surface.

**`ShapeInfo` and `ShapeKind` join the list** because `getShapeInfo(kind, index)` is a
handle member, which `map-shapes` states. A host that reads a shape needs the return type
in a type position, and it cannot name the `kind` argument without `ShapeKind`. The HUD
reads a shape row through the same two types and through no other path, which is what keeps
the HUD boundary rule that `AGENTS.md` holds.

**`RegionMode` is gone from the list.** The region overlay took three modes and now takes
one switch, which `galactic-regions` states, so the type it named no longer exists.

**The package moves to version 0.3.0.** Two parts of the surface change what they mean.
`Sphere.color` and `Line.color` are optional, because a shape that names a category takes
that category's colour, which `map-shapes` states: a host that reads `sphere.color[0]` off
`getSphere` no longer compiles against the declaration. A sphere also changes what it does
to a marker: it washes the markers inside it and behind it rather than washing every marker
it covers. A host that drew a sphere over a marker gets a different frame with no change of
its own.

`package.json` SHALL name the entry point in `exports` and `types`, SHALL name the built
files in `files`, and SHALL stop being `private`.

The library SHALL NOT read `window.location`, which `real-systems` already holds with a
lint rule, and SHALL NOT read an element by id.

The HUD SHALL stay a chunk of its own, loaded on demand, so a host that does not ask for
the HUD downloads none of it.

The library's own entry chunk SHALL stay under **254,000 bytes**. The bound is the guard
`tests/main-bundle.test.ts` already holds, and it is a guard against one fault: a
main-thread import of the region cell lookup adds about 199 KiB and takes the chunk over
370,000 bytes.

**The implementation SHALL read the built size and write it here**, as the rule this
capability already holds says. **The built chunk reads 252,975 bytes**, against the
236,815 of the last change, which leaves **1,025 bytes** of room under the bound. The
shape categories, the shape name filter, `getShapeInfo` and the range buffer are the parts
of this change that reach the library; the HUD is a chunk of its own and the live data set
is the demo site's. The bound stays at **254,000**, and the room under it is now thin. It still catches the one fault it is for, because the region cell lookup is 199 KiB
and no amount of room under 254,000 absorbs that. A later change that needs the room SHALL
move the bound and say so, and the next one to touch this chunk will be that change.

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
- **THEN** the size is under 254,000 bytes, and the region cell lookup is in **no entry
  chunk** and in **no chunk the entry chunk imports at load**.

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

#### Scenario: The entry point exports the camera surface

- **WHEN** a test imports the built entry point and reads its named exports
- **THEN** `createGalaxyMap`, `encodeView`, `decodeView` and `decodeGrid` are all present

#### Scenario: The camera types are declared

- **WHEN** a test type-checks a host module that writes a `startView`, a `bounds`, an
  `interaction` and a `flyTo` target against the built type declaration
- **THEN** the check passes with no error

#### Scenario: The shape types are declared

- **WHEN** a test type-checks a host module that reads `getShapeInfo('sphere', 0)` into a
  `ShapeInfo` and writes a `ShapeKind` against the built type declaration
- **THEN** the check passes with no error

#### Scenario: The package names its version

- **WHEN** a test reads `version` from `package.json`
- **THEN** it is `0.3.0`
