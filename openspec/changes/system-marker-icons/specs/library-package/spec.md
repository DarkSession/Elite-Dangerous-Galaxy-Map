## MODIFIED Requirements

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

`SystemRecordInput` SHALL carry an optional `icons`, an array of at most 4 entries, each
either a string or an object with a `url` string and a `color` of three numbers. The
library SHALL export the icon entry type and the resolved icon type `system-icons` states,
so a host that builds records in TypeScript compiles against the contract and reads what
`getSystem` gives back.

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

#### Scenario: An icon list compiles in both forms

- **WHEN** a type test passes a record whose `icons` is
  `['titan', { url: '/a.svg', color: [1, 2, 3] }]`, and a second whose one entry is an
  object with a `url` and no `color`
- **THEN** the first compile is clean and the second fails

## ADDED Requirements

### Requirement: The package pins the almanac version that carries the marker catalogue

`packages/galaxy-map/package.json` SHALL depend on `@elite-dangerous-almanac/core` at
**exactly 0.2.16**, as the manifest already pins an exact version. 0.2.15 is the first
version to publish the marker vectors at `assets/galaxy-map/`, and 0.2.16 is the first to
name them in its `exports` map, which is what makes a vector reachable. The map reads
`galaxy-map/markers` for the built-in icon colours and `assets/galaxy-map/` for the
vectors, beside the four `astro` leaves it already reads.

0.2.15 renames codex region 31 from `Formidine Rift` to `The Formidine Rift`. The map draws
that name as a region label, so the label reads the new name after the bump. The four
`astro` leaves keep their paths and their shapes.

The package's **JavaScript** SHALL stay external to the library build, as it is today, so a
host that already installs it holds one copy. The `assets/` subpath SHALL NOT be external:
a vector is a file the library's own build emits, and a bare `.svg` specifier resolves in
no browser.

`pnpm-workspace.yaml` already names `@elite-dangerous-almanac/core` in
`minimumReleaseAgeExclude`, because the package is the project's own and the 7-day hold
guards against a hijacked third-party maintainer. This change SHALL NOT widen that list and
SHALL NOT lower `minimumReleaseAge`.

`packages/galaxy-map/THIRD_PARTY_NOTICES.md` SHALL name the fifth leaf the map reads,
`galaxy-map/markers`, and SHALL state that the build emits the 16 galaxy-map marker
vectors, redrawn in the almanac project from the game's own interface artwork, under the
Frontier terms the file already carries. It SHALL name **where the vectors came from**: the
package `@elite-dangerous-almanac/core`, its pinned version, and the path
`assets/galaxy-map/` inside it. The package redistributes another project's artwork, so the
notices state which published version the bytes came from.

#### Scenario: The manifest names the version and the hold is unchanged

- **WHEN** a repository test reads `packages/galaxy-map/package.json` and
  `pnpm-workspace.yaml`
- **THEN** the `@elite-dangerous-almanac/core` dependency is exactly `0.2.16`,
  `minimumReleaseAge` is 10080, and `minimumReleaseAgeExclude` holds
  `@elite-dangerous-almanac/core` and nothing else

#### Scenario: The notices name the marker leaf, the vectors and their source

- **WHEN** a repository test reads `packages/galaxy-map/THIRD_PARTY_NOTICES.md`
- **THEN** it names `galaxy-map/markers`, states that the build emits the marker vectors,
  and names `@elite-dangerous-almanac/core`, the pinned version and the path
  `assets/galaxy-map/`

#### Scenario: The JavaScript stays external and the vectors do not

- **WHEN** the package is built and a test reads the emitted JavaScript
- **THEN** the four `astro` leaves and `galaxy-map/markers` are bare imports of
  `@elite-dangerous-almanac/core`, and no specifier under
  `@elite-dangerous-almanac/core/assets/` is left in an emitted file
