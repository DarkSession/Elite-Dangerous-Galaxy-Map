## MODIFIED Requirements

### Requirement: Every map belongs to one subject group

The build SHALL hold a table that names the subject group of every Canonn map it reads. A
map SHALL belong to exactly one group, and the group SHALL be the entry's `collection`,
which is what the dataset library draws a chip for.

**The build SHALL list the Canonn source tree at run time** and SHALL fail, naming the
file, where that listing holds a `MapData-*.js` file the table does not name. The listing
comes from the GitHub contents API of the Canonn repository, as the cycle build reads its
own archive. A new map in the Canonn source tree therefore stops the build rather than
reaching the page with no group, and a committed fixture of the listing cannot give that,
because a fixture is a snapshot of the day it was taken.

The build SHALL fail, and SHALL name the file, where the listing cannot be read. A run that
cannot see the source tree cannot say that the table is complete.

#### Scenario: A map the table does not name

- **WHEN** the build lists the Canonn source tree and the listing holds a `MapData-*.js`
  file the group table does not name
- **THEN** the build fails, names the file, and writes no partial set

#### Scenario: The listing cannot be read

- **WHEN** the build cannot read the listing of the Canonn source tree
- **THEN** the build fails and names the address it could not read

#### Scenario: The failure path has a unit test

- **WHEN** a unit test runs the table check over a committed listing fixture that holds one
  file the table does not name
- **THEN** the check fails and names that file. The fixture tests the failure path; the
  run-time listing is what sees a new map

#### Scenario: The dialog groups the maps

- **WHEN** the browser suite opens the dataset library of the page and reads the chip row
- **THEN** there is one chip per group the table names, each chip's count is the number of
  entries of that group, and every entry of the catalog is under one of them
