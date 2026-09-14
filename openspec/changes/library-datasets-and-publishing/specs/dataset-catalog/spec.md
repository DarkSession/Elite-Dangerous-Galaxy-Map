## Purpose

Lets a host give the map several named data sets and lets the user switch between them
from the HUD, without the library holding any data of its own.

## ADDED Requirements

### Requirement: A host gives the map a dataset catalog

`GalaxyMapOptions` SHALL take an optional `datasets`, an array of catalog entries, and an
optional `dataset`, the id of the entry to load when the map starts.

A catalog entry SHALL carry:

| Field         | Type                          | Required |
| ------------- | ----------------------------- | -------- |
| `id`          | string of at least one character | yes   |
| `label`       | string of at least one character | yes   |
| `collection`  | string                        | no       |
| `region`      | string                        | no       |
| `description` | string                        | no       |
| `systemCount` | finite number, 0 or above     | no       |
| `load`        | function                      | yes      |

`load()` SHALL return, or return a promise of, an object with `categories` and `systems`,
which are the arrays `addCategories` and `addSystems` take. The library SHALL NOT fetch,
parse or cache anything on the host's behalf: it calls `load()` and reads what comes back.

The reader SHALL drop an entry with no `id`, no `label` or no `load`, and SHALL drop an
entry whose `id` repeats one already read. The catalog SHALL hold at most **256** entries,
which is the bound the category table already carries, and the reader SHALL drop the rest.
The library SHALL report what it dropped the way `addCategories` does, with an index and a
reason.

With no `datasets` option the catalog SHALL be empty, the map SHALL load nothing by
itself, and the HUD SHALL show no dataset field. This is the map every host gets today.

#### Scenario: The catalog reads the entries in order

- **WHEN** a unit test builds a map with three entries and reads `getDatasets()`
- **THEN** the reading holds three entries in the order given, each carrying its `id`,
  `label`, `collection`, `region`, `description` and `systemCount`, and none carrying
  `load`

#### Scenario: A bad entry is dropped and reported

- **WHEN** a unit test builds a map with five entries, of which one has no `id`, one has no
  `load` and one repeats the `id` of the first
- **THEN** `getDatasets()` holds two entries, and the report names the three dropped ones
  with the reasons `no-id`, `no-load` and `duplicate-id`

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
in that order, so a failed load leaves the map with the set it already had. It SHALL
return a promise of `{ categories, systems }`, the two reports the reader gives.

`loadDataset` SHALL clear the selection and SHALL clear the name filter, because both name
records of the set being replaced. It SHALL NOT move the view: a host that wants to fly to
the new set does it when the promise settles.

A call naming an id the catalog does not hold SHALL reject with an error and SHALL change
nothing.

When `load()` throws or its promise rejects, `loadDataset` SHALL reject with that error,
SHALL leave the loaded dataset and the system set as they were, and SHALL NOT stop the
frame loop.

When a second `loadDataset` starts while a first is still loading, the second SHALL win:
the first SHALL NOT write the set when it settles, and its promise SHALL reject with a
cancelled error. Without this the slower of two clicks decides what the map shows.

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

**What a switch costs.** The library's own part of a switch is the clear and the two reads,
which it does on the main thread. With a full set of 10,000 systems and 256 categories that
part SHALL take under **40 milliseconds**, which is between two and three dropped frames.
The `load()` itself is the host's, and it may take as long as its network does; the frame
loop SHALL keep drawing throughout, because the library waits on the promise and does not
block. The dataset field shows that a load is running, so the user sees why the map has not
changed yet.

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

#### Scenario: A failed load leaves the map as it was

- **WHEN** a browser test loads the first entry, then calls `loadDataset` for an entry
  whose `load` rejects, catches the rejection, and reads `systemCount`,
  `getLoadedDataset()` and the view
- **THEN** the promise rejected, the count and the loaded entry are the first entry's, and
  the map draws 10 more frames

#### Scenario: The later load wins

- **WHEN** a browser test calls `loadDataset` for an entry whose `load` settles after 300
  ms, then at once calls it for an entry whose `load` settles at once, awaits both and
  reads `getLoadedDataset()` and `systemCount` after 500 ms
- **THEN** the second promise resolved, the first rejected as cancelled, and the reading is
  the second entry's throughout

#### Scenario: Loading clears the selection and the filter

- **WHEN** a browser test selects a system, sets the name filter to `sol`, loads another
  dataset, and reads `getSelection()` and `getNameFilter()`
- **THEN** both are empty

#### Scenario: A full set switches inside the budget

- **WHEN** a browser test loads a set of 10,000 systems and 256 categories, then calls
  `loadDataset` for a second set of the same size whose `load` returns at once, and
  measures the main thread from the call until the promise settles
- **THEN** the measurement is under 40 milliseconds and the frame loop drew throughout

#### Scenario: An unknown id changes nothing

- **WHEN** a unit test calls `loadDataset('nothing')` and reads `getLoadedDataset()`
- **THEN** the promise rejected and the reading is unchanged

### Requirement: The HUD carries a dataset field and a dataset dialog

When the catalog holds at least one entry, the HUD's top bar SHALL hold a dataset field.
`map-hud` states where it sits, as it states the order of every other part of the bar. It
SHALL show the loaded entry's `label`. The line the top bar shows the region name in SHALL
NOT be replaced: the region under the cursor stays what that line reads, because it answers
"where am I looking".

The field SHALL be a button. A click SHALL open the dataset dialog, and `Escape` SHALL
close it.

The dialog SHALL hold:

1. A filter box. Its text SHALL keep an entry whose `label`, `collection` or any of its
   loaded category names holds the text, compared without case.
2. A list of the kept entries, grouped by `collection`, with the group name and its count
   on a sticky header. An entry with no `collection` SHALL sit in a group named `OTHER`.
   The list SHALL show at most **120** entries and SHALL say so when it cut the list.
3. A detail pane for the entry the user last clicked in the list, which starts as the
   loaded one. It SHALL show the entry's `label`, its `collection`, its `region`, its
   `description` and its `systemCount`.
4. A **cancel** button, which closes the dialog and loads nothing, and a **load dataset**
   button, which calls `loadDataset` for the detail pane's entry and closes the dialog.

The **load dataset** button SHALL read `CURRENTLY LOADED` and SHALL do nothing when the
detail pane holds the loaded entry.

While a load runs, the dataset field SHALL show that it is loading, and a second click on
**load dataset** SHALL NOT start a third load.

The dialog SHALL NOT call `load()` to fill the list or the detail pane. It shows what the
catalog entry carries, so opening the dialog fetches nothing.

Every control of the dialog SHALL be a button or an input in the tab order, and the dialog
SHALL hold the focus while it is open, by the rule `map-hud` already states for the
lightbox.

#### Scenario: The field opens the dialog and the dialog loads

- **WHEN** the browser test with two entries clicks the dataset field, clicks the second
  entry in the list, clicks **load dataset**, and reads the dialog, the field and
  `getLoadedDataset()`
- **THEN** the dialog is closed, the field reads the second entry's label, and the reading
  is the second entry

#### Scenario: Cancel loads nothing

- **WHEN** the browser test opens the dialog, clicks another entry, clicks **cancel**, and
  reads `getLoadedDataset()`
- **THEN** the reading is the entry that was loaded before

#### Scenario: The filter narrows the list

- **WHEN** the browser test builds a map with entries labelled `Guardian Ruins`,
  `Guardian Structures` and `Notable Systems`, opens the dialog and types `notable`
- **THEN** the list holds one entry

#### Scenario: The list is grouped and capped

- **WHEN** the browser test builds a map with 130 entries over 3 collections and opens the
  dialog
- **THEN** the list holds 3 group headers, 120 entry rows, and a line saying 120 of 130

#### Scenario: The dialog fetches nothing

- **WHEN** the browser test builds a map with three entries whose `load` counts its calls,
  waits for `ready`, opens the dialog, types in the filter and clicks each entry
- **THEN** `load` was called once in total, for the entry loaded at start

#### Scenario: Escape closes the dialog

- **WHEN** the browser test opens the dialog and presses `Escape`
- **THEN** the dialog is closed and the selection is unchanged

### Requirement: The demo site carries three data sets

The demo site SHALL give the map a catalog of three entries, built by the repository's own
scripts from the Canonn Research Group's `CanonnED3D-Map` sources. Each entry SHALL carry
a `collection` of `Canonn Research Group`, a `label`, a `region` and a `systemCount`, and
its `load` SHALL import one JSON file the build wrote.

| Entry                 | Source                     | What it holds                                      |
| --------------------- | -------------------------- | -------------------------------------------------- |
| `guardian-ruins`      | `guardian_ruins.json`      | 600 sites in 212 systems, 3 categories by layout    |
| `guardian-structures` | `guardian_structures.json` | 209 sites in 163 systems, 10 categories by site type |
| `notable-systems`     | `notable_systems.json`     | 16 systems, 4 categories by subject                 |

**The counts describe the committed files** and not the live dumps, by the same rule
`real-systems` states for the Guardian Ruins set. They were read from the dumps on
2026-09-14, at `https://api.canonn.tech` through the CanonnED3D-Map sources. A dump gains
records over time, so a later run of a converter may write another count, and the counts in
the tests move with the committed files.

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

#### Scenario: The catalog holds the three sets

- **WHEN** the browser test opens the demo site, waits for `ready` and reads
  `getDatasets()` and `getLoadedDataset()`
- **THEN** the reading holds the three ids above and the loaded one is `guardian-ruins`

#### Scenario: Each set loads and draws

- **WHEN** the browser test loads each of the three entries in turn and reads
  `systemCount` and `categoryCount()` after each
- **THEN** the readings are 212 and 3, then 163 and 10, then 16 and 4

#### Scenario: The converters run over fixtures

- **WHEN** a unit test runs each converter over its committed fixture extract and compares
  the result with the committed expected output beside it
- **THEN** the two are the same for each converter, and every record it emits passes
  `addSystems` with no rejection.

  The counts in the table above describe the committed `demo-data/` file of each set and not
  the fixture. A fixture holds about 20 records, and its own expected counts are in the file
  beside it

#### Scenario: The html becomes plain text

- **WHEN** a unit test runs the Notable Systems converter over a fixture record whose
  `html` holds two paragraphs, a link and the entity `&amp;`
- **THEN** the `description` holds the two paragraph texts separated by a blank line, the
  link's text but not its tag, an `&`, and no `<` or `>`
