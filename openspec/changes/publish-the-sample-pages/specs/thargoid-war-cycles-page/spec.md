## Purpose

Puts every cycle of the Thargoid war on one page of the Pages site, as one data set per
cycle, so a reader can step through the war week by week on this map.

## ADDED Requirements

### Requirement: The page holds one entry per cycle of the war

The demo site SHALL publish a page at `<base>cycles/` that gives the map a dataset
catalog. The catalog SHALL hold one entry for each cycle file of the DCoH Overwatch
archive that the build converted to **one record or more**, and SHALL hold them in cycle
order, from the first cycle to the last.

Each entry SHALL carry:

| Field         | What it holds                                                 |
| ------------- | ------------------------------------------------------------- |
| `id`          | `cycle-<number>`, where the number is the cycle's own number  |
| `label`       | The cycle number and the week the cycle starts                |
| `collection`  | The year of that week                                         |
| `description` | What the cycle holds, and the state of the war in that week   |
| `systemCount` | The number of records the committed file holds                |
| `bounds`      | `auto`, because a cycle holds the bubble alone                |
| `view`        | `fit: 'systems'`, so the camera opens on the whole cycle      |

The categories SHALL be the war states the archive names, which is the table the demo
page's Thargoid war set already uses: Titan, Invasion, Alert and Controlled.

The page SHALL load one cycle at a time. A switch from one cycle to the next SHALL
replace the records of the first with the records of the second, which is what
`dataset-catalog` states for a load.

#### Scenario: The catalog is the manifest, in cycle order

- **WHEN** a unit test reads the page's manifest and the committed data directory
- **THEN** every entry has a file, every file has an entry, the entries are in cycle
  order, each entry's `systemCount` is the number of records its file holds, and the
  entry count is inside the 256 the catalog reads

#### Scenario: The user steps to the next cycle

- **WHEN** the browser suite loads one cycle and then the next
- **THEN** the map holds the records of the second cycle alone, and the camera opens on
  the box of those records

### Requirement: The build converts every cycle of the archive

The build SHALL read the file list of the archive's cycle directory, SHALL fetch each
cycle file into the ignored data directory, and SHALL convert each one with the same
conversion the demo page's Thargoid war set uses.

**A cycle that converts to no record SHALL be left out of the manifest and SHALL be named
in the build output**, with its file name and the number of raw records the file held. The
last cycles of the archive hold no system, and an entry per empty week would fill the
dialog with nothing. A file that holds records the conversion drops in whole is a signal
that the archive's record shape changed, which is why the output names the count.

The converted sets SHALL be committed. The raw cycle files, which are 1.09 GB in all,
SHALL NOT be committed. **A build of the site and a run of the tests SHALL need no
network.**

The build SHALL be repeatable: a second run over the same archive SHALL write the same
bytes.

#### Scenario: A cycle that holds no record

- **WHEN** the build converts a cycle file that gives no record
- **THEN** the build names the file and its raw record count, writes no set for it,
  leaves it out of the manifest, and finishes with the other cycles written

#### Scenario: The archive cannot be read

- **WHEN** the file list of the archive cannot be fetched
- **THEN** the build fails, names the address, and leaves the committed sets as they were

#### Scenario: The site builds with no network

- **WHEN** a developer builds the demo site and runs the unit tests with no network
- **THEN** both finish, and the page holds every cycle the committed data directory holds

### Requirement: The page states where the cycles come from

Each committed cycle SHALL carry the address of the archive and its licence line, as the
demo page's Thargoid war set does. `THIRD_PARTY_NOTICES.md` SHALL name the archive, SHALL
say that the source repository declares no licence, and SHALL say what the conversion
takes from each cycle file.

**The archive is the project owner's own repository.** The committed copy is therefore the
owner's to publish, and the entry in the notices file records the source rather than a
permission the project does not hold.

#### Scenario: Every cycle names its source

- **WHEN** a unit test reads every committed cycle of the page
- **THEN** each one carries the address of the archive and the licence line the notices
  file holds

### Requirement: The page holds the cycles inside the bounds the library states

The catalog SHALL hold at most **256** entries, which is the bound `dataset-catalog`
states. A build that reads more cycle files than that SHALL fail rather than write a set
the page drops in silence. The archive holds **110** cycle files today, which is a reading
of the archive and not a bound of this page.

A set SHALL hold at most **10,000** systems, which `real-systems` states. The largest cycle
measured gives **943** records, so every cycle is inside the bound. A cycle that converts
to more than 10,000 records SHALL fail the build and SHALL be named, because the map would
reject the records over the bound and the page would draw a part of that week in silence.

The committed data of the page, with its manifest, SHALL stay under **25 MB**, and one
cycle SHALL stay under **1 MB**. The largest cycle measured converts a 10.7 MB source file
to 943 records and 163 KB of JSON, so the ceiling holds the archive with room over it.

A unit test SHALL read the two sizes and SHALL fail above either one.

#### Scenario: The committed data passes its ceiling

- **WHEN** a build writes cycles whose total passes 25 MB, or one cycle that passes 1 MB,
  and a developer runs the unit tests
- **THEN** the test fails and names the directory, the size and the bound

#### Scenario: The archive grows past the catalog

- **WHEN** the archive holds more cycle files than the 256 entries the catalog reads
- **THEN** the build fails and names the count and the bound

#### Scenario: A cycle passes the set bound

- **WHEN** a cycle file converts to more than 10,000 records
- **THEN** the build fails, names the cycle and the count, and writes no set for it
