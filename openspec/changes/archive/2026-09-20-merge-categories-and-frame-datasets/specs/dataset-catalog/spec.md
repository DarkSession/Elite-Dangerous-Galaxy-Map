## MODIFIED Requirements

### Requirement: A host gives the map a dataset catalog

`GalaxyMapOptions` SHALL take an optional `datasets`, an array of catalog entries, and an
optional `dataset`, the id of the entry to load when the map starts.

A catalog entry SHALL carry:

| Field         | Type                             | Required |
| ------------- | -------------------------------- | -------- |
| `id`          | string of at least one character | yes      |
| `label`       | string of at least one character | yes      |
| `collection`  | string                           | no       |
| `region`      | string                           | no       |
| `description` | string                           | no       |
| `systemCount` | finite number, 0 or above        | no       |
| `bounds`      | a `BrowseBounds`, which `map-navigation` defines | no |
| `view`        | a dataset view, read below       | no       |
| `load`        | function                         | yes      |

`load()` SHALL return, or return a promise of, an object with `categories` and `systems`,
which are the arrays `addCategories` and `addSystems` take. The library SHALL NOT fetch,
parse or cache anything on the host's behalf: it calls `load()` and reads what comes back.

**`bounds` says where the set lives.** It is the same value `GalaxyMapOptions.bounds` and
`setBounds` take, in the same three modes. The map SHALL apply it on every load of that
entry. An entry that names **no** `bounds` SHALL restore the `bounds` the options named,
so one restricted set in a catalog does not restrict the next. A `bounds` the map cannot
read SHALL be treated as though the entry named none, which is the rule every other option
of this library follows.

**The restore reaches for the option and not for a later `setBounds`.** The value it puts
back is the one the host passed to `createMap`. A host's own `setBounds` therefore stands
until the next load and is then replaced. Two writers of one setting need one rule, and
the option is the value a host can always name. A host that wants its own bound back after
a load writes it in `onDatasetChange`, which fires after both steps.

**`view` says where the camera opens.** It SHALL carry the fields of `StartView` —
`cursor`, `system`, `distance`, `yaw` and `pitch` — and one more:

| Field | Type             | What it does                                            |
| ----- | ---------------- | -------------------------------------------------------- |
| `fit` | `'systems'`      | Centres on the box of the set and frames the whole of it |

`fit: 'systems'` SHALL set the `cursor` to the centre of the smallest axis-aligned box
that holds every system the load wrote, and the `distance` to `2 * R`, where `R` is half
the diagonal of that box. That is the distance at which the box just fills the height of
the frame, by the rule `map-navigation` states for the far zoom limit, so the user opens on
the whole set and no more. A field the entry names beside `fit` SHALL win over what `fit`
worked out, so `{ fit: 'systems', pitch: 60 }` frames the set from a higher angle.

`fit: 'systems'` on a load that wrote **no** system SHALL leave the view where it is, for
the same reason an `auto` bound of an empty set acts as `unrestricted`: an empty box would
pin the camera to a point. A `view` the map cannot read SHALL be ignored in whole.

The reader SHALL drop an entry with no `id`, no `label` or no `load`, and SHALL drop an
entry whose `id` repeats one already read. The catalog SHALL hold at most **256** entries,
which is the bound the category table already carries, and the reader SHALL drop the rest.
The library SHALL report what it dropped the way `addCategories` does, with an index and a
reason. An unreadable `bounds` or `view` SHALL NOT drop an entry: the set still loads.

With no `datasets` option the catalog SHALL be empty, the map SHALL load nothing by
itself, and the HUD SHALL show no dataset field. This is the map every host gets today.

#### Scenario: The catalog reads the entries in order

- **WHEN** a unit test builds a map with three entries and reads `getDatasets()`
- **THEN** the reading holds three entries in the order given, each carrying its `id`,
  `label`, `collection`, `region`, `description`, `systemCount`, `bounds` and `view`, and
  none carrying `load`

#### Scenario: A bad entry is dropped and reported

- **WHEN** a unit test builds a map with five entries, of which one has no `id`, one has no
  `load` and one repeats the `id` of the first
- **THEN** `getDatasets()` holds two entries, and the report names the three dropped ones
  with the reasons `no-id`, `no-load` and `duplicate-id`

#### Scenario: An unreadable bounds is dropped and the entry stays

- **WHEN** a unit test builds a map with one entry whose `bounds` is the string `auto` and
  whose `view` is the number 4, loads it, and reads `getDatasets()`, `getBounds()` and the
  view
- **THEN** the entry is in the catalog, it carries neither field, `getBounds()` reads the
  map's own option, and the view did not move

#### Scenario: No option means no catalog

- **WHEN** a browser test builds a map with no `datasets` option and reads `getDatasets()`
  and the HUD
- **THEN** the reading is empty and the HUD holds no dataset field

### Requirement: The handle loads one dataset at a time

The handle SHALL carry these members:

| Member                    | What it does                                                    |
| ------------------------- | --------------------------------------------------------------- |
| `getDatasets()`           | The catalog, without the `load` functions                        |
| `getLoadedDataset()`      | The entry now on the map, or null                                |
| `loadDataset(id)`         | Loads one entry and returns a promise of its report              |
| `onDatasetChange(fn)`     | Calls `fn` after the loaded dataset changes, returns unsubscribe |

`loadDataset(id)` SHALL call that entry's `load()`, then
`clearSystemsAndCategories()`, then `addCategories` and `addSystems` with what came back,
in that order, so a failed load leaves the map with the set it already had.

It SHALL then apply the entry's `bounds` and its `view`, in that order, and SHALL do both
**before** it calls the `onDatasetChange` listeners. A listener that adds the shapes of the
entry therefore sees the bounds the entry asked for. It SHALL return a promise of
`{ categories, systems }`, the two reports the reader gives.

`loadDataset` SHALL clear the selection and SHALL clear the name filter, because both name
records of the set being replaced.

**The view moves only where the entry asks.** An entry that names no `view` SHALL leave the
view where it is, which is what every load did before: a host that wants to fly to the new
set does it when the promise settles. An entry that names one SHALL take it in the next
frame, without a flight, as the `startView` option does.

**A deep link wins at start.** On the **start** load an entry's `view` SHALL apply only
where the options name no `startView`. On every later `loadDataset` the entry's `view`
SHALL apply. Without this rule a host that opens the map at a camera the URL named would
have that camera overwritten when the start load settled, which happens after the page has
already drawn.

A call naming an id the catalog does not hold SHALL reject with an error and SHALL change
nothing.

When `load()` throws or its promise rejects, `loadDataset` SHALL reject with that error,
SHALL leave the loaded dataset, the system set, the bounds and the view as they were, and
SHALL NOT stop the frame loop.

When a second `loadDataset` starts while a first is still loading, the second SHALL win:
the first SHALL NOT write the set, the bounds or the view when it settles, and its promise
SHALL reject with a cancelled error. Without this the slower of two clicks decides what the
map shows.

When the options carry `datasets`, the map SHALL load one at start: the entry named by
`dataset`, or the first entry when `dataset` names none or names an id the catalog does
not hold.

`ready` SHALL settle after the first frame **and** after the start load settles, whichever
is later, and SHALL settle whether or not that load succeeded, so a failed dataset still
leaves a drawing map. Without the second half a host that waits for `ready` and then reads
`systemCount` races the load. `library-package` holds that the browser suite clears the set
after `ready`, and about 188 of its tests depend on that clear reaching a set that is
already there.

The set the library loads SHALL hold at most 10,000 systems and 256 categories, which
`real-systems` already bounds. A `load()` that returns more SHALL be rejected by the same
reader with the same `over-capacity` reason.

**What a switch costs.** The library's own part of a switch is the clear, the two reads and
the two settings, which it does on the main thread. With a full set of 10,000 systems and
256 categories that part SHALL take under **40 milliseconds**, which is between two and
three dropped frames. The `load()` itself is the host's, and it may take as long as its
network does; the frame loop SHALL keep drawing throughout, because the library waits on
the promise and does not block. The dataset field shows that a load is running, so the user
sees why the map has not changed yet.

#### Scenario: Loading replaces the set

- **WHEN** a browser test builds a map with two entries, waits for `ready`, reads
  `systemCount` and `getLoadedDataset()`, calls `loadDataset` with the second id, awaits it
  and reads both again
- **THEN** the first reading is the first entry's system count and its id, and the second
  reading is the second entry's count and its id

#### Scenario: The start load reads the named entry

- **WHEN** a browser test builds a map with three entries and `dataset` naming the third,
  waits for `ready` and reads `getLoadedDataset()`
- **THEN** the reading is the third entry

#### Scenario: An entry's bounds take effect on its load

- **WHEN** a browser test builds a map with two entries, the first naming
  `bounds: { mode: 'auto' }` and the second naming none, and options naming
  `bounds: { mode: 'unrestricted' }`, waits for `ready`, reads `getBounds()`, loads the
  second and reads it again
- **THEN** the first reading is the `auto` mode and the second is `unrestricted`

#### Scenario: A restricted set holds the camera

- **WHEN** the browser test loads an entry naming `bounds: { mode: 'auto' }` whose systems
  all lie within 200 light years of (0, 0, 0), then calls `setView` with a cursor 30,000
  light years away and a distance of 100,000, draws a frame and reads `getView()`
- **THEN** the cursor lies inside the set's box grown by 1,000 light years on each axis,
  and the distance is at or under the far zoom limit of that box

#### Scenario: `fit` frames the set

- **WHEN** a browser test loads an entry naming `view: { fit: 'systems' }` whose systems
  span a box from (-100, -50, -100) to (100, 50, 100), and reads `getView()`
- **THEN** the cursor is (0, 0, 0) and the distance is twice half the diagonal of that box,
  within the tolerance `map-navigation` states for that value in doubles

#### Scenario: A named field wins over `fit`

- **WHEN** the same test loads an entry naming `view: { fit: 'systems', pitch: 60 }`
- **THEN** the cursor and the distance are the ones `fit` worked out and the pitch is 60

#### Scenario: A deep link beats the entry at start

- **WHEN** a browser test builds a map naming `startView` with a cursor of (500, 0, 500)
  and a first entry naming `view: { fit: 'systems' }`, waits for `ready` and reads
  `getView()`, then calls `loadDataset` with that same entry's id and reads it again
- **THEN** the first reading is the `startView` cursor and the second is the cursor `fit`
  worked out

#### Scenario: An entry with no view leaves the camera

- **WHEN** a browser test reads `getView()`, loads an entry that names no `view`, and reads
  it again
- **THEN** the two readings are the same

#### Scenario: The bounds reach a listener

- **WHEN** a browser test registers an `onDatasetChange` listener that reads `getBounds()`,
  then loads an entry naming `bounds: { mode: 'auto' }`
- **THEN** the listener read the `auto` mode

#### Scenario: The next load replaces a host's own setBounds

- **WHEN** a browser test builds a map whose options name an `unrestricted` bounds, calls
  `setBounds` with a `sphere`, then loads an entry that names no `bounds` and reads
  `getBounds()`
- **THEN** the reading is `unrestricted`, which is the option and not the sphere

#### Scenario: A failed load leaves the map as it was

- **WHEN** a browser test loads the first entry, then calls `loadDataset` for an entry
  whose `load` rejects, catches the rejection, and reads `systemCount`,
  `getLoadedDataset()`, `getBounds()` and the view
- **THEN** the promise rejected, the count, the loaded entry, the bounds and the view are
  the first entry's, and the map draws 10 more frames

#### Scenario: The later load wins

- **WHEN** a browser test calls `loadDataset` for an entry whose `load` settles after 300
  ms and names a `bounds`, then at once calls it for an entry whose `load` settles at once
  and names none, awaits both and reads `getLoadedDataset()`, `systemCount` and
  `getBounds()` after 500 ms
- **THEN** the second promise resolved, the first rejected as cancelled, and every reading
  is the second entry's throughout

#### Scenario: Loading clears the selection and the filter

- **WHEN** a browser test selects a system, sets the name filter to `sol`, loads another
  dataset, and reads `getSelection()` and `getNameFilter()`
- **THEN** both are empty

#### Scenario: A full set switches inside the budget

- **WHEN** a browser test loads a set of 10,000 systems and 256 categories, then calls
  `loadDataset` for a second set of the same size whose `load` returns at once and which
  names a `bounds` and a `view`, and measures the main thread from the call until the
  promise settles
- **THEN** the measurement is under 40 milliseconds and the frame loop drew throughout

#### Scenario: An unknown id changes nothing

- **WHEN** a unit test calls `loadDataset('nothing')` and reads `getLoadedDataset()`
- **THEN** the promise rejected and the reading is unchanged

### Requirement: The demo site carries seven data sets

The demo site SHALL give the map a catalog of seven entries. Five of them are built by the
repository's own scripts from the Canonn Research Group's `CanonnED3D-Map` sources, one is
built from a cycle file of the DCoH Overwatch archive, and `multifaction` fetches its
records when the user loads it, which the requirement "The multifaction set fetches its
records when the user loads it" states. Each entry SHALL carry a `collection`, a `label`
and a `region`. The six Canonn entries SHALL carry the `collection` `Canonn Research
Group` and the Thargoid war entry SHALL carry `DCoH Overwatch archive`. Every entry but
`multifaction` SHALL carry a `systemCount` and its `load` SHALL import one JSON file the
build wrote.

| Entry                 | Source                     | What it holds                                      |
| --------------------- | -------------------------- | -------------------------------------------------- |
| `guardian-ruins`      | `guardian_ruins.json`      | 600 sites in 212 systems, 3 categories by layout    |
| `guardian-structures` | `guardian_structures.json` | 209 sites in 163 systems, 10 categories by site type |
| `notable-systems`     | `notable_systems.json`     | 16 systems, 4 categories by subject                 |
| `uia`                 | `MapData-UIA.js` and two more | 1,116 systems, 19 categories, **54 spheres**, **983 lines** of 2,214 points |
| `adamastor`           | `MapData-Adamastor.js`     | 8 systems, 10 categories, **8 lines** of 38 points |
| `multifaction`        | the Spansh factions dump and `MapData-multifaction.js` | fetched live, 6 categories, **48 spheres** |
| `thargoid-war`        | `2 - 2022-12-08.json` of the DCoH Overwatch archive | 189 systems, 4 categories by war state |

**The Thargoid war entry SHALL frame itself.** It SHALL carry
`bounds: { mode: 'auto' }`, which is the box of its own 189 systems grown by the default
1,000 light year margin, and `view: { fit: 'systems' }`, so the map opens on the war and
the user cannot fly to the rim of a galaxy the set says nothing about. No other entry of
the catalog SHALL carry either field, so a switch away from the war set opens the whole
galaxy again.

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
SHALL carry every one of them in `categories`, the first site type first, which is the
order the Guardian Ruins converter already writes them in.

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
- A **line** SHALL take the categories its `routes` entry names as its `categories`, the
  entry's own first category first. A line SHALL then
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
the **first** entry of a name, SHALL append the categories of a later entry to that
record's `categories`, and SHALL take a later entry's description only where the first entry
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

#### Scenario: The catalog holds the seven sets

- **WHEN** the browser test opens the demo site, waits for `ready` and reads
  `getDatasets()` and `getLoadedDataset()`
- **THEN** the reading holds the seven ids above and the loaded one is `guardian-ruins`

#### Scenario: Each committed set loads and draws

- **WHEN** the browser test loads each of the six committed entries in turn and reads
  `systemCount`, `categoryCount()`, `sphereCount()` and `lineCount()` after each
- **THEN** the readings are 212, 3, 0, 0; then 163, 10, 0, 0; then 16, 4, 0, 0; then
  1,116, 19, 54, 983; then 8, 10, 0, 8; then 189, 4, 0, 0

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
- **THEN** every one of the 54 spheres holds at least one name in `categories`, the
  `Gamma Velorum` sphere names `Gamma Velorum Zone`, every line holds at least one name in
  `categories`, and no line carries a colour of its own

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

### Requirement: The multifaction set fetches its records when the user loads it

The sixth catalog entry SHALL be `multifaction`, labelled `Canonn Factions`. Its `load()`
SHALL fetch the records from the network when the user loads it, and SHALL carry no
committed record file. It is the entry that shows a host fetching its own data, which
`dataset-catalog` allows and which no other entry does.

The library SHALL still fetch nothing. The fetch is the demo host's, inside the `load()`
the catalog already defines.

**Where the records come from.** `load()` SHALL read
`https://downloads.spansh.co.uk/factions.json.gz`, which the Canonn `MapData-multifaction.js`
map reads. The file is gzip, and the reader SHALL decompress it with the browser's own
`DecompressionStream`.

**The reader SHALL read the dump as a stream and SHALL NOT hold it whole.** The file is
**16.9 MB** compressed and **101 MB** of JSON, in **77,677 lines**: one line for the
opening bracket, one per faction and one for the closing bracket. The reader SHALL:

1. read the decompressed bytes in chunks and cut them into lines, holding at most one line
   at a time. The longest line of the dump read on 2026-09-17 is **2.33 MB**;
2. read the faction's name from the head of each line and parse the whole line only where
   the name is one it wants;
3. stop reading, and cancel the stream, once it has every faction it wants. The two lines
   it wants sat at **12.8 per cent** of the file on 2026-09-17, so the reader read 13.7 MB
   of the 101 MB. The order of the dump is not stated anywhere, so a run that finds them at
   the end SHALL read the whole file and still work.

A reader that parsed the whole array would hold about 101 MB of text and several hundred
megabytes of objects for two factions of 77,675.

**Which factions.** The entry SHALL name **Canonn** and **Canonn Deep Space Research**, in
that order. There is no faction picker: the names are in the entry.

**The categories.** The set SHALL carry six categories, four for the records and two for
the shapes:

| Name                                    | Colour          | What it holds                         |
| --------------------------------------- | --------------- | ------------------------------------- |
| `Canonn Controlled`                     | (255, 36, 0)    | A system Canonn controls               |
| `Canonn Present`                        | (255, 157, 128) | A system Canonn is present in          |
| `Canonn Deep Space Research Controlled` | (21, 105, 199)  | A system that faction controls         |
| `Canonn Deep Space Research Present`    | (126, 200, 227) | A system that faction is present in    |
| `Permit Locked Sector`                  | (51, 179, 255)  | A permit-locked sphere                 |
| `Permit Unlocked Sector`                | (255, 191, 26)  | A permit-unlocked sphere               |

The four faction colours are the first two colour pairs of the source's own
`factionColorPairs`. The two sphere colours are the material tints the source draws the
shells with, which the requirement above states for the UIA set.

**One record per system.** A faction lists a system once for each of its states, and two
factions may name one system, so the reader SHALL hold one record per `systemId64`. The
record SHALL carry the `name`, the `coords` and the `id64` of the system, and a
`categories` holding every category it earns. The first entry SHALL be the one from the
first faction of the entry's order that names the system, which is what carries the
marker's colour. Within one faction a row that controls SHALL win over a row that does
not.

The dump read on **2026-09-17** gives **4,231 systems**: 3,683 for Canonn, of which 1,864
controlled and 1,819 present, and 1,254 for Canonn Deep Space Research, of which 310
controlled and 944 present. **706** of the 4,231 name more than one category, and every one
lies inside the model bounds. The set is well under the 10,000 systems `real-systems`
holds. These numbers describe that dump and no other: a later dump gives other numbers, so
no test SHALL assert them against the live file.

**The spheres.** The entry SHALL carry the **48** permit spheres of
`MapData-multifaction.js`, which are 28 in `pls` and 20 in `puls`. The build script SHALL
write them into a committed file, as it writes the other sets, because they are a static
list in the source and not a live dump. Each sphere SHALL name `Permit Locked Sector` or
`Permit Unlocked Sector` and SHALL carry no colour of its own, so it takes its category's
colour.

**What a failure does.** `load()` SHALL reject where the fetch fails, where the browser
gives no `DecompressionStream`, where the worker stops, or where the dump names neither
faction. `loadDataset`
then rejects, the map keeps the set it had and the dataset field goes back to the loaded
entry's label, which `dataset-catalog` already states. The page SHALL NOT stop the frame
loop and SHALL NOT leave a half-written set.

**The budget.** The frame loop SHALL keep drawing while the fetch and the read run: with
the HUD on and a set of 10,000 systems at 1920x1080, the read SHALL NOT cost the map a
frame. The time the fetch itself takes is the network's and is the host's to bear, which
`dataset-catalog` already states.

**The inflate SHALL run off the main thread.** The page SHALL fetch the dump on the
thread that holds the page, and SHALL move the body of the answer to a worker, which
inflates it and reads it. The fetch stays on the page so that the request comes from the
page and a browser test intercepts it as it intercepts every other request; the inflate
leaves the page because Chromium inflates a body the browser already holds in one burst
and takes no back-pressure from the reader. Measured on the 62 MB fixture at 1920x1080: a
drain that only counts bytes costs the map one gap of **70 milliseconds** with the gzip
step and **21** without it, and the same read in a worker costs **no frame**.

**Where the browser does not move a stream** the page SHALL read the dump on its own
thread, with the same reader. That reader SHALL count its own time
and SHALL wait for the next task once the count passes a slice of a few milliseconds,
because a read of a body the browser already holds answers from a queue and a queued
answer is a microtask. It SHALL NOT wait on a timer: a timer a timer callback starts is
nested, and the browser holds a nested timer for 4 milliseconds, which the read would pay
on every turn.

**The reader SHALL work on the bytes and not on text.** It SHALL find the end of a line
by its byte, which no other byte of UTF-8 carries. It SHALL decode the head of a line to
read the name, and SHALL decode the whole of a line only where the name is one it wants.
A reader that decoded the file and cut the text held a growing string and searched it
again for every chunk, which cost **884 milliseconds** of thread time over the 62 MB
fixture against **13** for this one. A line the reader does not want SHALL keep no more
than the head: the longest line of the dump is 2.33 MB, and keeping it would hold the
chunks of the stream as well.

**No test SHALL reach the network.** The browser test SHALL serve the dump from a fixture,
through the test runner's own request interception, and SHALL assert the counts of that
fixture. The sphere file is imported and not fetched, as the other five entries import
theirs, so it needs no interception: the bundler gives it a same-origin URL of its own
naming. `multifaction` SHALL NOT be the entry the demo site
loads at start, so the page fetches nothing until the user asks for it, and the scenario
"The HUD makes no third-party request" holds unchanged.

`THIRD_PARTY_NOTICES.md` SHALL name the Spansh dump and the terms it carries.

#### Scenario: The entry is in the catalog and fetches nothing at start

- **WHEN** the browser test opens the demo site with every request to a host other than the
  page's own origin blocked and recorded, waits for `ready`, and reads `getDatasets()`
- **THEN** the catalog holds `multifaction` and no request was blocked

#### Scenario: The set loads from a fixture

- **WHEN** the browser test serves the dump URL with a gzip fixture holding 4 factions, of
  which `Canonn` names 3 systems and `Canonn Deep Space Research` names 2, one of them
  shared, loads `multifaction`, and reads `systemCount`, `categoryCount()` and
  `sphereCount()`
- **THEN** the readings are 4, 6 and 48

#### Scenario: A system that two factions name holds two categories

- **WHEN** the browser test reads the record of the shared system of the fixture above
- **THEN** its `categories` holds two names, the Canonn one first and the Canonn Deep Space
  Research one after it

#### Scenario: The reader stops at the last faction it wants

- **WHEN** a unit test runs the line reader over a fixture of 6 faction lines, of which the
  2 it wants are the second and the third, and counts the lines it read
- **THEN** it read 3 lines and stopped

#### Scenario: A line that crosses two chunks is read whole

- **WHEN** a unit test feeds the reader the same fixture in chunks of 7 bytes
- **THEN** it reads the same two factions it reads from one chunk

#### Scenario: A failed fetch leaves the map as it was

- **WHEN** the browser test loads `guardian-ruins`, serves the dump URL with a 500, calls
  `loadDataset('multifaction')`, catches the rejection, and reads `systemCount`,
  `getLoadedDataset()` and the frame loop
- **THEN** the promise rejected, the count and the loaded entry are the Guardian Ruins
  ones, and the map draws 10 more frames

#### Scenario: A dump that names neither faction rejects

- **WHEN** the browser test serves the dump URL with a fixture of 3 factions that are
  neither wanted one, loads `multifaction` and catches the rejection
- **THEN** the promise rejected and the map holds the set it had

#### Scenario: The map keeps drawing while the dump is read

- **WHEN** the browser test serves the dump URL with a fixture of 60 MB, resets the
  animation frame interval statistics, loads `multifaction`, and reads the statistics when
  the load settles
- **THEN** the longest interval is under 25 milliseconds, which is one frame at 60 Hz and
  less than the 33.3 a dropped frame gives

#### Scenario: The reader gives the event loop a turn

- **WHEN** a unit test counts the tasks the event loop runs while the reader reads a
  fixture in chunks of 7 bytes, with every chunk ready before the read starts and a slice
  of 0
- **THEN** the count is above zero

#### Scenario: A faction whose name is longer than the head window reads as one the reader does not want

- **WHEN** a unit test puts a faction whose name is 4,000 characters before the two the
  reader wants, and reads the fixture
- **THEN** the reader gives the two factions it wants

#### Scenario: A faction name with a multi-byte character reads whole

- **WHEN** a unit test asks the reader for a faction whose name carries characters outside
  ASCII, in chunks of 7 bytes
- **THEN** the reader gives that faction and its systems
