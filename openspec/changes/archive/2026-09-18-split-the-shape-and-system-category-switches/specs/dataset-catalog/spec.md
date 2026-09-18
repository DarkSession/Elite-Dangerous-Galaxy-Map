## MODIFIED Requirements

### Requirement: The demo site carries six data sets

The demo site SHALL give the map a catalog of six entries. Five of them are built by the
repository's own scripts from the Canonn Research Group's `CanonnED3D-Map` sources, and the
sixth fetches its records when the user loads it, which the requirement "The multifaction
set fetches its records when the user loads it" states. Each entry SHALL carry a
`collection` of `Canonn Research Group`, a `label` and a `region`. The first five SHALL
carry a `systemCount` and their `load` SHALL import one JSON file the build wrote.

| Entry                 | Source                     | What it holds                                      |
| --------------------- | -------------------------- | -------------------------------------------------- |
| `guardian-ruins`      | `guardian_ruins.json`      | 600 sites in 212 systems, 3 categories by layout    |
| `guardian-structures` | `guardian_structures.json` | 209 sites in 163 systems, 10 categories by site type |
| `notable-systems`     | `notable_systems.json`     | 16 systems, 4 categories by subject                 |
| `uia`                 | `MapData-UIA.js` and two more | 1,116 systems, 19 categories, **54 spheres**, **983 lines** of 2,214 points |
| `adamastor`           | `MapData-Adamastor.js`     | 8 systems, 10 categories, **8 lines** of 38 points |
| `multifaction`        | the Spansh factions dump and `MapData-multifaction.js` | fetched live, 6 categories, **48 spheres** |

**The counts describe the committed files** and not the live dumps, by the same rule
`real-systems` states for the Guardian Ruins set. The first three were read from the dumps
on 2026-09-14 and the next two on 2026-09-17, at `https://api.canonn.tech` and
`https://raw.githubusercontent.com/canonn-science/CanonnED3D-Map` through the
CanonnED3D-Map sources. A dump gains records over time, so a later run of a converter may
write another count, and the counts in the tests move with the committed files.

Each converter SHALL be an exported function the unit tests run over a committed fixture,
with no network and no file write, as the Guardian Ruins converter already is. The entry
part SHALL fetch the dump into the ignored `data/` directory. The repository SHALL commit
no dump.

A record SHALL be one system and not one site. A system that holds several site types
SHALL carry the first as `primaryCategory` and the rest as `secondaryCategories`, which is
what the Guardian Ruins converter does today.

The Notable Systems source carries an `html` field. The converter SHALL turn it into plain
text for `description`: it SHALL remove the tags, decode the character references, join the
paragraphs with a blank line, and keep no markup. A `description` SHALL NOT hold `<` or
`>`.

The Notable Systems records carry no `id64`, so their identity is the system name, which
`real-systems` already states.

**A set's `categories` SHALL hold every category of its source table that a record or a
shape names**, in the source table's order. `map-shapes` rejects a shape that names a
category the set does not hold, so a converter that wrote only the record categories would
lose every shape that names a route category. The Adamastor set shows it: its 8 routes name
7 categories, 6 of which no record names, so the set reads **10** categories where it read
4. Its SYSTEMS tab still lists 4, because the other 6 hold no record, and its SHAPES tab
lists 7. The UIA set reads **19** categories where it read 18. Every category its shapes
name is one its records name, except the one the converter adds for the `g_soi` sphere,
which no record names.

**Every shape SHALL name the category its source gives it**, so the **SHAPES** tab of the
category browser switches it, which `map-hud` states. The rules are:

- A **sphere** SHALL take the marker category of its own list, which `formatHDs` gives the
  record it pushes at the centre of the sphere: `Permit Locked Centers` for `pls`,
  `Permit Unlocked Centers` for `puls` and `Thargoid Systems` for `hd_soi`. A sphere SHALL
  keep its own `color`, which is its material's
  colour, so the shell keeps the reading the source gives it and the row's dot keeps the
  marker colour of that category.
- **The `g_soi` sphere SHALL name the category `Gamma Velorum Zone`**, which the converter
  adds to the table it writes, in the colour `000099` of that list's material. The source
  pushes no marker record for `g_soi`, so its list has no marker category to take, and a
  sphere that names no category always draws and has no row, which `map-shapes` states. The
  converter therefore adds one category the source table does not hold, as it already adds
  the eight `UIA#N` categories. The category holds one shape and no record, so it has a row
  in the **SHAPES** tab and none in the **SYSTEMS** tab, and the user can turn the shell
  off. The name is the label the source gives the list. The sphere keeps the name
  `Gamma Velorum`, which is the name of the star and not of the zone.
- A **line** SHALL take the category its `routes` entry names as its `primaryCategory` and
  the rest of that entry's categories as its `secondaryCategories`. A line SHALL then
  carry **no `color`**, because the colour it took was that category's colour and
  `map-shapes` gives it that colour from the category. A route naming a category the table
  does not hold SHALL keep the fallback colour of (160, 160, 160) and name no category;
  the Adamastor source holds one such route, which names the category `50`.
- A **line SHALL carry a `name` that names the line and not its category**. A hyperdiction
  line SHALL read `<system> to <destination>`, a waypoint line SHALL read the category name
  and the number of the table, for example `UIA#3 Recorded Route`, and an Adamastor route
  SHALL read the name its source gives it. The shape list of the HUD shows that name, and
  983 rows all reading `All Hyperdictions` would name nothing.

**The two shape sets.** The ED3D sources hold their shapes in lists of their own, beside
the `systems` list:

- A **sphere** comes from a list whose entries carry `radius`, `coords` and `name`. The
  UIA source holds four such lists, which come to 54 spheres. The list entry carries no
  colour, and the source's own category table is **not** where the colour comes from: that
  table colours the markers. The source draws each list with a material of its own, in
  `finishMap`, and **the converter SHALL take the colour of that material**:

  | List     | What it holds           | Count | Material                  | Colour        |
  | -------- | ----------------------- | ----- | ------------------------- | ------------- |
  | `pls`    | Permit-locked sectors   | 28    | shader tint (0.2,0.7,1.0) | (51,179,255)  |
  | `puls`   | Permit-unlocked sectors | 20    | shader tint (1.0,0.75,0.1)| (255,191,26)  |
  | `hd_soi` | Hyperdiction zones      | 5     | `0x336600`                | (51,102,0)    |
  | `g_soi`  | The Gamma Velorum zone  | 1     | `0x000099`                | (0,0,153)     |

  The `g_soi` row is the only list whose colour reaches a category as well as a sphere,
  because it is the only one whose category the converter writes itself.

  **The opacity does not come across.** The source draws a lit surface at an opacity of
  0.75, 0.75, 0.3 and 0.15. This map draws a limb-brightened shell, whose alpha is the
  opacity at the middle and 1 near the rim, so the same figure reads far more solid: at
  0.75 the alpha reaches 1 at 0.66 of the radius and the sphere hides what is behind it.
  Every sphere SHALL therefore take the map's own default opacity of 0.18, which
  `map-shapes` states.
- A **line** takes its colour from the category its `routes` entry names, read from the
  source's own category table. A route naming a category the table does not hold SHALL take
  a fallback of (160, 160, 160); the Adamastor source holds one such route, which names the
  category `50`.
- A **line** comes from a `routes` entry, whose `points` name systems. The converter SHALL
  resolve each name to a position: first against the source's own `systems` list, then
  against the EDSM name lookup, comparing without case. A point that resolves nowhere SHALL
  be dropped, and a route left with fewer than two points SHALL be dropped whole. The
  converter SHALL report every drop. On the Adamastor source read on 2026-09-17, 3 of 41
  points resolve nowhere — `Extention1`, `Extention2` and `Route Intersection`, which are
  the original map's own waypoint placeholders — and all 8 routes survive with 38 points.
- A route point whose system is in the entry's own record set SHALL be written as a
  **system reference**, and one that is not SHALL be written as a **coordinate**. The demo
  therefore exercises both point forms `map-shapes` defines, and a line that connects two
  markers on the screen says so in the data.
- The **UIA source's `routes` list is empty**: every entry in it is commented out at the
  source. The converter SHALL read the `routes` list as it does for any source, so a
  restored route reaches the map with no code change. The UIA lines come from two more
  files, which the next requirement states.

**The UIA map builds itself from two more files, and the converter SHALL read them.**
`MapData-UIA.js` holds 16 systems and no route of its own. Every other marker and every
line the map draws is built at run time, in `formatWaypoints` and `formatHDs`, from two
static files beside it in the same repository. A converter that reads only the literal
therefore writes a set the map never shows. The two files are:

| File                                     | What it holds                               |
| ---------------------------------------- | ------------------------------------------- |
| `csvCache/uia_waypoints_1.json` … `_9.json` | One waypoint table per UIA                |
| `csvCache/route_UIA_Hyperdictions.csv`   | One row per reported hyperdiction            |

The entry part SHALL fetch the two into `data/csvCache/`, which is ignored, by the same
rule the dumps hold. The report file is 432 kB and the repository SHALL commit no copy of
it. The unit tests SHALL read committed fixtures of this project's own writing and not the
files themselves, so no commander name reaches a fixture.

**The waypoint tables.** Each file is an array whose first row is the headers and whose
other rows are waypoints. The converter SHALL read `System`, `X`, `Y`, `Z` and `Estimate`,
and SHALL skip a table whose second row names no system or names `Placeholder`; UIA#9 is
such a table, so 8 of the 9 hold data. Each row SHALL become one record. The `Estimate`
letter SHALL give the record its category and the line it belongs to:

| Letter | Category        | Id    | Colour     |
| ------ | --------------- | ----- | ---------- |
| `N`    | Recorded Route  | `101` | `66FF66`   |
| `Y`    | Estimated Route | `102` | `334400`   |
| `F`    | Lost Section    | `103` | `4F0000`   |

A run of rows carrying one letter SHALL become one line, and a change of letter SHALL end
that line and start another, by the join rules the source holds: a run of `F` SHALL take
the row before it as its first point, a run of `Y` SHALL take the row before it unless that
row is `F`, and a run of `N` SHALL NOT take the row before it but SHALL be added to the
open `F` or `Y` line as its last point. A line of fewer than two points SHALL be dropped.

**The direction line.** Each waypoint table SHALL also give one line of category `100`,
**Estimated Direction**, colour `004F4F`. It SHALL run from the table's first waypoint
**against** the mean step of the table, which is back the way the anomaly came, and its far
point SHALL be written as a record of the same category named
`extended mean direction of UIA#N`. The source scales the mean step by **-65,000**, so the
line points at where the anomaly came from and not at where it goes.

**The sum of the steps lags by one row, and the converter SHALL keep the lag.** The source
holds the row before the last one and adds `row - that row` at each row, so each step
reaches over two rows and the first two rows add nothing. The sum comes to
`(c_n + c_n-1) - (c_1 + c_2)` and not to `c_n - c_1`. The two directions differ by
**0.011 to 0.245 degrees** over the eight tables of the source. The rule here is the source's line and
not a better one, so the converter copies the lag and a test holds it.

The source draws this line only for a table that holds two parseable times, because the
whole block sits behind the test that also gives the clock marker. The converter draws it
for every table of three or more waypoints. All eight tables meet both tests today, so the
committed file is the same either way.

**That far point SHALL stop at the model bounds.** The source runs the line 65,000 light
years out, which is past the edge of the model on every axis, and `real-systems` rejects a
record outside the bounds. The converter SHALL therefore cut the ray where it leaves the
bounds, and SHALL run it no farther than the 65,000 light years the source names. The
line still points where the source points it, and it stops where the map stops. The
converter SHALL read the bounds from `src/galaxy-model/galaxy-model.json`, so the two
cannot drift.

**The estimated current position SHALL NOT be written.** The source also places one marker
per UIA at the point the anomaly has reached, worked out from the clock at the moment the
page opens. A committed file cannot hold a value that follows the clock, so the converter
SHALL leave it out. The demo set therefore holds 8 markers of category `100` and not the
16 the live map shows.

**The hyperdiction reports.** The CSV carries `Timestamp`, `Commander`, `System`, `Sx`,
`Sy`, `Sz`, `Destination`, `Dx`, `Dy`, `Dz` and `Hostile`. A coordinate field is quoted and
uses a **comma** as its decimal separator, so the reader SHALL parse the quoted fields and
SHALL read `"-1238,53125"` as -1238.53125.

The source reads the same field with `parseFloat`, which stops at the comma and gives
-1238, so it drops the whole fraction of each of the three axes. A hyperdiction marker of
the demo set therefore sits up to **0.96875 light years** from the live one on one axis, and
up to **1.607 light years** from it in space. Both figures come from the report file, and the
worst pair is `Oochorrs RE-O d7-4` to `Oochorrs SZ-N d7-5`. The demo marker is
the one the report put there. The converter SHALL:

1. Keep one row for each `System` + `Destination` pair, the first one read, and SHALL mark
   the pair hostile if **any** row of the pair reads `Hostile` of `Y`.

   This is one rule the converter does **not** take from the source. The source holds the
   first row of a pair and then reads `hostile` of it, which no row carries: the column is
   `Hostile`. Only a repeated row therefore sets the flag, and a pair reported once is
   never hostile on the live map. The converter reads the flag of every row of the pair.
2. Drop a pair unless one of its two ends is a waypoint of some table, or lies within **24
   light years** of a waypoint whose `Estimate` is not `F`. The report file covers the whole
   galaxy and the map is about the anomalies.
3. Write both ends as records and the pair as one two-point line.

A hyperdiction record SHALL carry the category `UIA#N` of the table it was matched against,
then `All Hyperdictions`, and then `Hostile` where the pair is hostile. The `UIA#N`
categories are not in the source's table either: `init()` adds `301` to `308`, named
`UIA#1 Taranis`, `UIA#2 Leigong`, `UIA#3 Indra`, `UIA#4 Oya`, `UIA#5 Cocijo`, `UIA#6 Thor`,
`UIA#7 Raijin` and `UIA#8 Hadad`, each in `999900`. The converter SHALL add them the same
way.

**A hyperdiction record SHALL name the commander and the date of the report** in its
`description`, as the Notable Systems records carry Canonn's own text. The names are
already published in the Canonn repository under the MIT licence, and
`THIRD_PARTY_NOTICES.md` SHALL say that the demo set carries them.

**The spheres SHALL also be records.** `formatHDs` pushes each entry of `pls`, `puls` and
`hd_soi` into the systems list, in the categories `Permit Locked Centers`,
`Permit Unlocked Centers` and `Thargoid Systems`. The converter SHALL do the same, so a
sphere carries a marker at its centre as the live map does. `g_soi` gets no record, as the
source gives it none. Its category therefore holds one shape and no system.

**One name SHALL give one record.** A waypoint is also an end of a hyperdiction, two
hyperdictions share an end, and a sphere sits on a waypoint, so the same name reaches the
list several times. `real-systems` holds one record per name, so the converter SHALL keep
the **first** entry of a name, SHALL add the categories of a later entry to that record as
secondary ones, and SHALL take a later entry's description only where the first entry
carries none. The position of the first entry SHALL stand.

**Every UIA line point SHALL be a system reference.** Each end of every line is a record of
the same set, so no UIA line holds a coordinate and the EDSM lookup is never asked for one.

#### Scenario: The waypoint letters cut the lines

- **WHEN** a unit test runs the waypoint conversion over a fixture table whose `Estimate`
  column reads `N N Y Y F N`
- **THEN** it writes one `101` line of the two `N` rows, one `102` line holding the last
  `N` row and the two `Y` rows, one `103` line holding the last `Y` row and the `F` row and
  the `N` row after it, and one `101` line of that last `N` row alone is dropped for
  holding one point

#### Scenario: A hyperdiction pair far from every waypoint is dropped

- **WHEN** a unit test runs the hyperdiction conversion over a fixture holding one pair
  whose system is a waypoint, one pair 10 light years from a waypoint, and one pair 3,000
  light years from every waypoint
- **THEN** the first two are written and the third is dropped, and the report names the
  drop

#### Scenario: A repeated pair is read once and keeps its hostile flag

- **WHEN** a unit test runs the hyperdiction conversion over a fixture holding the same
  system and destination three times, of which the last reads `Hostile` of `Y`
- **THEN** one line is written, and its two records carry the `Hostile` category

**The demo site adds the shapes itself.** `DatasetContent` carries `categories` and
`systems` and no shape, so the demo site SHALL add the shapes of an entry through
`addSpheres` and `addLines` from its `onDatasetChange` listener. `loadDataset` clears the
shapes, so an entry that carries none leaves the map with none.

#### Scenario: The catalog holds the six sets

- **WHEN** the browser test opens the demo site, waits for `ready` and reads
  `getDatasets()` and `getLoadedDataset()`
- **THEN** the reading holds the six ids above and the loaded one is `guardian-ruins`

#### Scenario: Each committed set loads and draws

- **WHEN** the browser test loads each of the five committed entries in turn and reads
  `systemCount`, `categoryCount()`, `sphereCount()` and `lineCount()` after each
- **THEN** the readings are 212, 3, 0, 0; then 163, 10, 0, 0; then 16, 4, 0, 0; then
  1,116, 19, 54, 983; then 8, 10, 0, 8

#### Scenario: A switch away from a shape set clears the shapes

- **WHEN** the browser test loads `uia`, reads `sphereCount()`, loads `guardian-ruins` and
  reads it again
- **THEN** the first reading is 54 and the second is 0

#### Scenario: The Adamastor lines connect the markers

- **WHEN** the browser test loads `adamastor`, reads `getLine(0)`, and reads the position
  of every system of the set
- **THEN** at least one point of one line is the position of a system in the set, and no
  line was rejected

#### Scenario: The converters run over fixtures

- **WHEN** a unit test runs each converter over its committed fixture extract and compares
  the result with the committed expected output beside it
- **THEN** the two are the same for each converter, and every record it emits passes
  `addSystems` with no rejection, and every shape it emits passes `addSpheres` or
  `addLines` with no rejection.

  The counts in the table above describe the committed `demo-data/` file of each set and not
  the fixture. A fixture holds about 20 records, and its own expected counts are in the file
  beside it

#### Scenario: The route resolver drops what it cannot resolve

- **WHEN** a unit test runs the route converter over a fixture holding one route of three
  points, of which the middle one names no system the fixture or the stub lookup holds, and
  one route of two points of which one is unresolvable
- **THEN** the first route is written with two points, the second is dropped, and the
  report names both drops

#### Scenario: The html becomes plain text

- **WHEN** a unit test runs the Notable Systems converter over a fixture record whose
  `html` holds two paragraphs, a link and the entity `&amp;`
- **THEN** the `description` holds the two paragraph texts separated by a blank line, the
  link's text but not its tag, an `&`, and no `<` or `>`

#### Scenario: Every shape of the two shape sets names a category

- **WHEN** the browser test loads `uia` and reads `getShapeInfo` for every sphere and every
  line
- **THEN** every one of the 54 spheres names a primary category, the `Gamma Velorum` sphere
  names `Gamma Velorum Zone`, every line names a primary category, and no line carries a
  colour of its own

#### Scenario: A line names itself and not its category

- **WHEN** a unit test runs the UIA converter over its fixture and reads the `name` of one
  hyperdiction line and one waypoint line
- **THEN** the first reads `<system> to <destination>` and the second names the category
  and the table, and neither is the bare category name

#### Scenario: The Gamma Velorum category holds a shape and no system

- **WHEN** the browser test loads `uia`, reads the rows of the **SYSTEMS** tab and the rows
  of the **SHAPES** tab, and reads the count of the `Gamma Velorum Zone` row
- **THEN** the **SYSTEMS** tab has no row for that category, the **SHAPES** tab has one,
  and the count is 1
