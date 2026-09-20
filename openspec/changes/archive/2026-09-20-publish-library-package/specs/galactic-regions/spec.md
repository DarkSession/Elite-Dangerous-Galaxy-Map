## MODIFIED Requirements

### Requirement: The region data carries its attribution

The repository SHALL hold **two** `THIRD_PARTY_NOTICES.md` files, and each source SHALL
be in one of them alone.

**`packages/galaxy-map/THIRD_PARTY_NOTICES.md`** SHALL name what the package ships: the
almanac package and klightspeed's EliteDangerousRegionMap under MIT for the region
tables, Frontier Developments' media-usage rules, which are non-commercial, for the game
data and the art, the two bundled font families, and the selection pin. It SHALL NOT name
a data set the tarball does not carry. It ships in the tarball, so a source it names that
the tarball leaves out tells a host it installed something it did not.

**`THIRD_PARTY_NOTICES.md` at the repository root** SHALL name the sources of everything
beside the package: the demo site's data sets, which `dataset-catalog` lists, the loading
image the demo site serves from `public/`, the committed test extracts and the design
mockup. It SHALL point at the package file for the library's own sources.

The Frontier terms are the one statement in both files, because the package ships game
art and the demo site draws game data.

**The notices SHALL NOT give one kind of game content a section of its own.** The galaxy
data, the object records and the art are one source under one set of terms, and a section
for each invites a reader to think the terms differ. A part of the map that is this
project's own work SHALL carry no section at all, because a notices file lists what the
project does not own.

If **either build** carries the package's procedural naming tables, the package file SHALL
also hold the BSD 3-Clause text those tables require.

The repository emits two builds, the library and the demo site, so the search reads both.
The demo site is the one the public loads, and the library is the one another project
installs, so a table that reaches either one reaches a user.

**The root file SHALL also name `EDSM`**, the name lookup the Adamastor converter reads to
turn a route point into a position. The lookup runs in the converter, at build time, and
its answers are committed in the JSON, so the map makes no call to it. A source the
repository reads is a source the notices name, whether the map reads it or the build does.

#### Scenario: The notice names every source

- **WHEN** a unit test reads both notices files
- **THEN** the package file names `EliteDangerousRegionMap`, `MIT`, `Frontier` and
  `@elite-dangerous-almanac/core`, and the root file names `EDLoader1.svg`,
  `Guardian Structures`, `Notable Systems`, `UIA`, `Adamastor` and `EDSM`

#### Scenario: The package notices name nothing the tarball leaves out

- **WHEN** a unit test reads the package's notices file
- **THEN** it names no demo data set, no file under `apps/demo/` and no file under
  `.design/`, and the two files share one heading, which is the Frontier one

#### Scenario: The bundle carries no unlicensed table

- **WHEN** a test runs `pnpm build` and `pnpm build:demo-site` and searches both outputs
  for the package's procedural naming tables
- **THEN** either the tables are absent from both, or the package's
  `THIRD_PARTY_NOTICES.md` holds the BSD 3-Clause text in full
