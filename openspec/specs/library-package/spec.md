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

**The package moves to version 0.4.0.** `setCategoryVisible` and `isCategoryVisible` change
what they reach. They moved the markers **and** the shapes of a category, and they now move
its markers alone. A host that called `setCategoryVisible(name, false)` to clear both keeps
its shapes on the screen, and it calls `setShapeCategoryVisible` as well to get the frame it
had. The call still compiles, so the break is in what the map draws and not in the
declaration, which is why it takes a minor version of its own.

The surface keeps the two breaks 0.3.0 carried. `Sphere.color` and `Line.color` are
optional, because a shape that names a category takes that category's colour, which
`map-shapes` states. A sphere washes the markers inside it and behind it rather than every
marker it covers.

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
capability already holds says. The chunk read 252,975 bytes before this change, against
the 236,815 of the change before it. **The chunk reads 253,520 bytes with this change
in**, which leaves **480 bytes** of room under the bound. The two shape category members,
the shape visibility map and the shape visibility version are the parts of this change
that reach the library; the HUD is a chunk of its own and the demo data is the demo
site's.

The bound stays at **254,000**, because the reading is under it. The room under it is now
thin. It still catches the one fault it is for, because the region cell lookup is 199 KiB
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

#### Scenario: The declaration names the two shape category members

- **WHEN** a test type-checks a host module that calls `setShapeCategoryVisible('A', false)`
  and reads `isShapeCategoryVisible('A')` into a boolean, against the built type declaration
- **THEN** the check passes with no error

#### Scenario: The shape types are declared

- **WHEN** a test type-checks a host module that reads `getShapeInfo('sphere', 0)` into a
  `ShapeInfo` and writes a `ShapeKind` against the built type declaration
- **THEN** the check passes with no error

#### Scenario: The package names its version

- **WHEN** a test reads `version` from `package.json`
- **THEN** it is `0.4.0`

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

### Requirement: The host sets the camera the map starts at

`GalaxyMapOptions` SHALL carry `startView`. The map SHALL take it in the frame it draws
first, SHALL NOT fly to it, and SHALL apply every limit to it as `setView` does.

`startView` SHALL carry an optional `cursor` of three game coordinates, an optional
`system` identity, and optional `distance`, `yaw` and `pitch`. A field the host leaves out
SHALL take the value of the default view, which is the cursor at Sol, a distance of 60,000
light years, a yaw of 0 and a pitch of 35 degrees. With no `startView` at all the map opens
the default view, which is what it did before.

**`cursor` and `system` SHALL NOT both be read.** Where the host gives both, `cursor` SHALL
win and the map SHALL ignore `system`.

**A `system` identity is resolved late.** The host adds its systems after the map is built,
so the identity is usually unknown in the first frame. The map SHALL hold the identity as a
**pending start** and SHALL apply it in the first frame the set holds it. Until then the map
SHALL show the rest of the `startView`, with the cursor of the default view.

The pending start SHALL be dropped, and SHALL never be applied, as soon as any of these
happens: the host calls `setView`, `flyTo` or `setSelection`; the user moves the camera with
any input; or the map has drawn **600** frames since it was built. The user's own view is
never taken from them by a record that arrives late, and a map whose host never adds that
system does not hold the pending start for the life of the page.

Applying a pending start SHALL move the view and SHALL raise the view change listeners. It
SHALL NOT select the system: a host that wants the panel open calls `setSelection`.

A `startView` the map cannot read SHALL be ignored in whole, and the map SHALL open the
default view. A `cursor` that is not three finite numbers, and a `distance`, a `yaw` or a
`pitch` that is not a finite number, make it unreadable.

#### Scenario: A start view at coordinates opens there

- **WHEN** the browser test builds a map with a `startView` of the cursor (1,000, 0, 2,000),
  a distance of 400, a yaw of 90 and a pitch of -20, waits for `ready` and reads the view
- **THEN** the view holds those four values

#### Scenario: A start view fills its gaps from the default

- **WHEN** the browser test builds a map with a `startView` that names a distance of 400
  alone, waits for `ready` and reads the view
- **THEN** the distance is 400, the cursor is (0, 0, 0), the yaw is 0 and the pitch is 35

#### Scenario: A start view does not fly

- **WHEN** the browser test builds a map with a `startView` of a distance of 400, waits for
  `ready`, and reads the view and `selectionFlightMs` in the first frame
- **THEN** the distance is already 400 and `selectionFlightMs` is 0

#### Scenario: A start view on a system waits for the record

- **WHEN** the browser test builds a map with a `startView` naming the system `Target` and
  a distance of 400, waits for `ready`, reads the view, then adds a record for `Target` at
  (1,000, 0, 0) and reads the view in the next frame
- **THEN** the first reading has the default cursor of (0, 0, 0) and a distance of 400, and
  the second has the cursor at (1,000, 0, 0)

  The record is away from the origin because the default cursor is the origin. A record at
  (0, 0, 0) would read the same whether the map applied the pending start or dropped it.

#### Scenario: A start view on a system does not select it

- **WHEN** the browser test builds a map with a `startView` naming `Target`, adds the
  record at (1,000, 0, 0), waits a frame and reads `getSelection` and the view
- **THEN** the selection is null and the cursor is (1,000, 0, 0)

#### Scenario: The user's input drops a pending start

- **WHEN** the browser test builds a map with a `startView` naming `Target`, sends a wheel
  notch, then adds the record for `Target` at (1,000, 0, 0) and reads the view in the next
  frame
- **THEN** the cursor is (0, 0, 0), which is the default the map opened at, and not
  (1,000, 0, 0)

#### Scenario: A pending start expires

- **WHEN** the browser test builds a map with a `startView` naming `Target`, waits for 600
  drawn frames, adds the record for `Target` at (1,000, 0, 0) and reads the view
- **THEN** the cursor is the default view's (0, 0, 0) and not (1,000, 0, 0)

#### Scenario: A cursor beats a system

- **WHEN** the browser test builds a map with a `startView` that names both a `cursor` of
  (500, 0, 0) and the system `Target`, adds the record for `Target` at (1,000, 0, 0), and
  reads the view
- **THEN** the cursor stays (500, 0, 0)

#### Scenario: An unreadable start view opens the default

- **WHEN** the browser test builds a map with a `startView` whose `distance` is `NaN`, waits
  for `ready` and reads the view
- **THEN** the view is the default view

### Requirement: The host flies the camera through the handle

`GalaxyMap` SHALL carry `flyTo`, `isFlying` and `onFlightEnd`.

`flyTo(target, options)` SHALL fly the camera to a target with the same path, the same time
rule and the same interruptions as a selection flight, which `system-selection` states. The
target SHALL carry an optional `cursor` of three game coordinates, an optional `system`
identity, and optional `distance`, `yaw` and `pitch`. A field the host leaves out SHALL keep
the value the view holds, so `flyTo({ distance: 100 })` is a zoom in place.

**`flyTo` SHALL NOT change the selection**, and a `system` in the target names only a place.
A host that wants both calls `setSelection`, which flies as well.

A target outside the active browsable bounds SHALL be clamped, by the same rule a selection
takes, which `system-selection` states. The promise SHALL still settle with `'landed'`: the
flight reached the target it was allowed to reach.

Where `options.animate` is false, the view SHALL take the target in that frame and no flight
SHALL run. Where the browser asks for less movement the map SHALL do the same, as a
selection does.

A `system` identity the set does not hold SHALL leave the view where it is and SHALL run no
flight. It SHALL still drop a pending start, and SHALL still end a flight already running,
because it is the host taking the camera like any other `flyTo`: `isFlying` SHALL be false
after it, and the flight it ended SHALL settle with `'interrupted'`. `flyTo` has no pending
state: unlike `startView` it is a call the host makes when it is ready.

`flyTo` SHALL return a promise that settles with `'landed'` where the flight reached the
target and `'interrupted'` where anything ended it early, including a second `flyTo`, a
selection and the user's own input. It SHALL NOT reject. A `flyTo` whose target equals the
view SHALL settle with `'landed'` and run no flight.

`flyTo` SHALL work while the interaction switches are off, which `map-navigation` states.

**A flight SHALL turn the camera as well as move it.** `flyTo` carries a `yaw` and a
`pitch`, which a selection flight never changes, so the path rule of `system-selection`
needs one more term. The two angles SHALL follow the **time** of the flight and not the
position path, so the camera turns at an even rate, and the yaw SHALL take the **short way
round**: a flight from 350 to 10 degrees turns 20 degrees forward and not 340 back. An
exact half turn SHALL turn forward.

**A flight that only turns SHALL still run.** The length of the position path is 0 where
the cursor and the distance do not change, so the time rule SHALL read the longer of the
position path and the turn. A turn through the field of view moves the picture by about its
own width, and a pan of one screen width is a path length of about 1, so a turn SHALL be
worth `turn / 60` of path. A turn of 180 degrees is therefore a path length of 3, which the
time rule gives 1,875 milliseconds, and a turn of 30 degrees reaches the 400 millisecond
floor. A `durationMs` of 0 is the only reading that means "the two views are the same".

`isFlying()` SHALL be true while a flight runs, whether a selection or a `flyTo` started it.

`onFlightEnd(listener)` SHALL call the listener once each time a flight ends, with
`'landed'` or `'interrupted'`, and SHALL return an unsubscribe. It SHALL NOT fire where no
flight ran.

#### Scenario: A host flies to coordinates

- **WHEN** the browser test calls `flyTo` with a cursor of (2,000, 0, 0) and a distance of
  300, reads the view in the next frame, and awaits the promise
- **THEN** the first reading is neither the start nor the target, the promise settles with
  `'landed'`, and the view then holds that cursor and distance

#### Scenario: A partial target keeps the rest of the view

- **WHEN** the browser test opens a view with a yaw of 40 and a pitch of 60, calls
  `flyTo({ distance: 100 })` and awaits it
- **THEN** the distance is 100 and the cursor, the yaw and the pitch are unchanged

#### Scenario: A flight does not select

- **WHEN** the browser test adds a system, calls `flyTo` naming it, awaits the promise and
  reads `getSelection`
- **THEN** the view is at the system and the selection is null

#### Scenario: An interrupted flight settles as interrupted

- **WHEN** the browser test calls `flyTo` across 20,000 light years, waits 100 ms, sends a
  wheel notch, and awaits the promise
- **THEN** it settles with `'interrupted'` and `isFlying` is false

#### Scenario: A second flight interrupts the first

- **WHEN** the browser test calls `flyTo` to one place, waits 100 ms, calls `flyTo` to
  another, and awaits both promises
- **THEN** the first settles with `'interrupted'`, the second with `'landed'`, and the view
  is at the second target

#### Scenario: An unknown system flies nowhere

- **WHEN** the browser test calls `flyTo({ system: 'nothing' })` and awaits the promise
- **THEN** the promise settles with `'landed'`, the view is unchanged, and `isFlying` is
  false

#### Scenario: An unknown system ends a running flight

- **WHEN** the browser test starts a flight, waits 100 milliseconds, then calls
  `flyTo({ system: 'nothing' })` and awaits both promises
- **THEN** the first settles with `'interrupted'`, the second with `'landed'`, `isFlying` is
  false, and the view stays where the flight had reached

#### Scenario: A flight with animate false arrives at once

- **WHEN** the browser test calls `flyTo` with `animate` false and reads the view in the
  next frame
- **THEN** the view is the target and `isFlying` is false

#### Scenario: The flight-end listener reports both endings

- **WHEN** the browser test registers `onFlightEnd`, lets one `flyTo` land, then interrupts
  a second one with a drag
- **THEN** the listener fired twice, with `'landed'` and then `'interrupted'`

#### Scenario: A flight that only turns still runs

- **WHEN** a unit test plans a flight that changes the yaw by 180 degrees and nothing else,
  and the browser test calls `flyTo({ yaw: 180 })` and reads the yaw one frame in
- **THEN** the plan's position path is 0, its duration is 1,875 milliseconds and its yaw at
  half the time is 90 degrees; and the browser reading is between 0 and 180, `isFlying` is
  true while it runs, and the flight settles with `'landed'` at a yaw of 180

#### Scenario: A flight works with the inputs off

- **WHEN** the browser test turns every interaction switch off, calls `flyTo` and awaits it
- **THEN** the view is the target

### Requirement: The library encodes and decodes a view

The entry point SHALL export `encodeView`, `decodeView` and `decodeGrid`. They are the
fragment format the demo page already uses, moved onto the public surface, so a host gets a
deep link without writing a parser.

`encodeView(view, grid)` SHALL return the text of a fragment without a leading `#`, as
`c=<x>,<y>,<z>&d=<distance>&p=<pitch>&y=<yaw>`, with each number rounded to **5** decimal
places. Where `grid` is a boolean it SHALL append `&g=1` or `&g=0`, and where it is left out
it SHALL append nothing, so a host that does not use the grid writes the four view fields
alone.

`decodeView(text)` SHALL read that text, with or without a leading `#`, and SHALL return a
view. A missing or unreadable field SHALL take the default view's value, and the **model**
limits SHALL be applied: the model bounds on the cursor, 10 to 120,000 light years on the
distance, -89 to 89 degrees on the pitch and a wrap on the yaw. A pitch below 0 SHALL be
read, because the pitch range now runs to -89 degrees, which `map-navigation` states.

**It SHALL NOT apply a map's browsable bounds**, because it is a pure function and holds no
map. A host that has restricted the space passes the decoded view to `setView`, which
applies the bounds as every other view change does.

`decodeGrid(text)` SHALL return true for `g=1`, false for `g=0` and null for a text that
names no readable `g`, so a host can tell "off" from "not stated".

The three calls SHALL be pure functions of their arguments. They SHALL NOT read
`window.location`, which this capability already forbids the library, and they SHALL NOT
touch a map.

The demo page SHALL use these exports and SHALL hold no parser of its own, so the format has
one home.

A fragment written before this change SHALL decode to the same view it decoded to before.

#### Scenario: A view round trips

- **WHEN** a unit test encodes the view (1,000.5, -600.25, 2,000) at a distance of 432.125,
  a yaw of 91.5 and a pitch of -20.75, and decodes the text
- **THEN** the decoded view equals the one encoded, within 1e-5 on each number

#### Scenario: The grid flag is optional

- **WHEN** a unit test encodes a view with no `grid` argument, and again with `grid` true
- **THEN** the first text holds no `g` field and the second ends with `&g=1`

#### Scenario: A negative pitch encodes and decodes

- **WHEN** a unit test encodes a view at a pitch of -89 and decodes it
- **THEN** the pitch reads -89

#### Scenario: An old fragment still decodes

- **WHEN** a unit test decodes `#c=0,0,0&d=2000&p=35&y=0`
- **THEN** the view has that cursor, a distance of 2,000, a pitch of 35 and a yaw of 0

#### Scenario: An unreadable field takes the default

- **WHEN** a unit test decodes `c=nonsense&d=abc`
- **THEN** the view is the default view

#### Scenario: The grid flag reads three ways

- **WHEN** a unit test calls `decodeGrid` on `g=1`, on `g=0` and on `c=0,0,0`
- **THEN** it returns true, false and null
