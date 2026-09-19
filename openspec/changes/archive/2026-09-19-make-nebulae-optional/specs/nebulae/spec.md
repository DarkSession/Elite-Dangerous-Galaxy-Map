## MODIFIED Requirements

### Requirement: The map holds 358 nebulae

The map SHALL hold a fixed set of 358 nebula records **when the host asks for them, and
none otherwise**. 190 are authored and 168 are procedurally generated. The counts, the
radii and the tile indices come from the packing step that builds the two data files; no
source in this repository derives them. The galaxy holds about 400 billion systems, so
the set is small beside them.

**The host asks through one option.** `GalaxyMapOptions` SHALL carry a `nebulae` field
whose value is the nebula source, which is the single export of the package's `./nebulae`
subpath. With that value the map SHALL load the records and the atlas and draw the
sprites as the rest of this capability states. With no value, with `undefined`, and with
a value the map cannot read, the map SHALL:

- fetch neither the record file nor the sprite atlas
- compile no nebula program
- draw no sprite, report 0 drawn instances and 0 draw calls
- report no error, because asking for no nebulae is not a fault

**Nothing reaches a build that does not ask.** No module the package's main entry point
reaches, directly or through an import chain, SHALL import the record file, the sprite
atlas, the nebula shaders, the nebula pass or the record set as a **value**. A type-only
import is allowed, because the build erases it. A host that bundles the main entry point
alone SHALL therefore carry none of the five in its output.

Each record SHALL carry a position in game coordinates, a radius in light years and a tile
index into the sprite atlas. A record MAY carry a name, and a record without one SHALL
omit the field rather than hold an empty value. A record SHALL carry no colour and no
per-record brightness.

The file SHALL hold no field a reader can derive: no record count, no field-name list and
no units note. The positions SHALL be stored to 0.1 light year and the radii to 0.01, which
is finer than one screen pixel at every zoom distance in the band.

The records SHALL load as a fetched asset, not as a bundled module, so no chunk carries
the set. The set SHALL build in one sweep when the asset arrives and SHALL NOT be rebuilt
in any frame. Before the asset arrives the pass SHALL draw nothing, and no frame SHALL
fail because of it.

If the fetch fails, or the asset does not parse, the loader SHALL throw a typed error, as
the galaxy detail image already does. The application SHALL report it to the browser
console and SHALL keep the map running. The pass SHALL then draw nothing and every other
pass SHALL keep drawing.

The nebulae are not part of the first frame, so this failure SHALL NOT reach the error
message the application shows for a failed start. That path stops the map, which would
take every other pass down with the nebulae.

The start SHALL NOT wait for either asset. The first frame, the frame loop and the
removal of the loading picture SHALL all happen whether or not the pair has arrived, and
the records and the atlas SHALL reach the renderer after the loop runs. A request that
never answers therefore leaves the map drawing every other pass.

The largest radius in the set is 200 light years and the smallest is above 0.

#### Scenario: A held fetch does not hold the map

- **WHEN** the browser test holds the request for the sprite atlas open and never
  answers it, then opens the map with the nebula source
- **THEN** the map starts, the frame loop runs, the nebula pass reports 0 drawn
  instances and 0 draw calls, and the records and the atlas are not attached

#### Scenario: The set loads whole

- **WHEN** a unit test loads the nebula set
- **THEN** it holds 358 records, every radius is above 0 and at most 200, every tile index
  is from 0 to 33, and every position is finite

#### Scenario: A map with no nebula option fetches nothing

- **WHEN** the browser test opens a map with no `nebulae` option, inside the zoom band
  that would draw sprites, and records every request the page makes
- **THEN** no request names the record file and none names the sprite atlas, the pass
  reports 0 drawn instances and 0 draw calls, and the page shows no error

#### Scenario: A value the map cannot read turns the nebulae off

- **WHEN** a unit test builds a map with `nebulae` set to `true`, to `null` and to an
  object that carries none of the source's members, and builds a fourth with a **readable**
  source of spies through the same harness
- **THEN** each of the first three loads nothing, draws no sprite and reports no error,
  **and the fourth calls `loadSet` and `loadAtlas`**.

  The fourth reading is the positive control and the scenario is not satisfied without it.
  Vitest runs in the `node` environment and the existing map tests build on a canvas that
  returns no context, so `start()` throws before it reaches the loaders: the first three
  readings pass whether or not the readability check exists.

#### Scenario: A host bundle that does not ask carries nothing

- **WHEN** the bundle test builds a host entry that imports `createGalaxyMap` from the
  package's main entry point and nothing else
- **THEN** the output holds no record file, no `.webp` asset and none of the nebula
  shader text

#### Scenario: A host bundle that asks carries all of it

- **WHEN** the bundle test builds a host entry that imports `createGalaxyMap` and the
  `./nebulae` subpath, and passes the source to the map
- **THEN** the output holds the record file, the sprite atlas and the nebula shader text

#### Scenario: The entry chunk does not carry the records

- **WHEN** the library bundle test reads the entry chunk
- **THEN** the chunk holds no nebula record, no nebula code, and its size is under the
  recorded bound.

  The scenario is kept from `add-nebulae` and strengthened. The three scenarios above
  read a **host's** build; this one reads the library's own entry chunk, which is what
  the bound of `library-package` is measured on.

#### Scenario: A frame before the records arrive

- **WHEN** the unit test renders a frame before the record asset has loaded
- **THEN** the frame draws, holds no nebula, and reports no error

#### Scenario: A failed fetch reports and does not stop the frame

- **WHEN** a unit test makes the record fetch fail
- **THEN** the loader throws a typed error, and a frame drawn after it holds no nebula and
  draws every other pass

#### Scenario: The records do not drift

- **WHEN** a unit test hashes the record file with SHA-256
- **THEN** the digest equals the digest in the fixture

## ADDED Requirements

### Requirement: The host and the user turn the nebulae off and on

The map handle SHALL carry three members for the nebulae.

- `hasNebulae()` SHALL return whether the map was built with a nebula source it can read.
- `setNebulaeVisible(on)` SHALL turn the sprites off and on. On a map that holds no
  source it SHALL do nothing and SHALL NOT throw.
- `areNebulaeVisible()` SHALL return the state the map is in. On a map that holds no
  source it SHALL return `false`.

The sprites SHALL open visible on a map that holds a source. Turning them off SHALL leave
the records and the atlas loaded, so turning them on again draws in the next frame and
fetches nothing.

The switch SHALL change what draws and SHALL NOT change the selection, the zoom band or
the budget. With the sprites off the pass SHALL report 0 drawn instances and 0 draw calls.

#### Scenario: The switch removes the sprites and gives them back

- **WHEN** the browser test opens a map with the nebula source inside the zoom band,
  reads the drawn count, calls `setNebulaeVisible(false)` and reads it again, then calls
  `setNebulaeVisible(true)` and reads it a third time
- **THEN** the readings are above 0, exactly 0, and above 0, and the third frame issues
  no new request

#### Scenario: A map with no source reports no nebulae

- **WHEN** a unit test builds a map with no `nebulae` option and calls `hasNebulae`,
  `areNebulaeVisible` and `setNebulaeVisible(true)`
- **THEN** the first two return `false`, the third throws nothing, and
  `areNebulaeVisible` still returns `false`
