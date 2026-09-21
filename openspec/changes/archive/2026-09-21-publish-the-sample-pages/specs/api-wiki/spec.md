## MODIFIED Requirements

### Requirement: The prose pages are written in the repository

The Overview page, the Getting started page and every example page SHALL be markdown files
in the repository, under `docs/wiki/`. The wiki SHALL be a mirror of what the build writes:
a person edits the repository and the pipeline rewrites the wiki, so an edit made in the
wiki itself is overwritten by the next push to `main`.

The Overview page SHALL be the wiki's landing page. It SHALL say what the package is, what
it needs to run, and SHALL link to Getting started, to the Examples section and to the
repository.

The Getting started page SHALL carry the install command, the run-time requirements and the
smallest map that draws.

The Examples section SHALL hold one page per example. **An example page SHALL hold no
hand-written code block.** It SHALL carry one marker for each block it shows, and each
marker SHALL name one sample. A page MAY carry more than one marker: the camera page shows
two blocks and names two samples. In the place of each marker the build SHALL write:

- the code of that sample, as a TypeScript block — the lines between the sample's
  `wiki:start` and `wiki:end` where it holds that pair, and the whole file where it does
  not; and
- the address of the live sample page on the Pages site, as a link a reader can follow.

The sample source is the one copy of the example code. **Every member an example imports
from the package SHALL be a member the package exports**, so an example cannot name a call
that was renamed or removed. The rule is read from the sample source, which is the code the
page runs.

The build SHALL fail, and SHALL name the page and the marker, where a marker names a sample
that does not exist, where an example page carries no marker, or where two markers on any
page name one sample. It SHALL fail, and name the sample, where a sample holds a
`wiki:start` with no `wiki:end`.

#### Scenario: A prose page exists for every sidebar entry

- **WHEN** a unit test reads `docs/wiki/` and the sidebar the build writes
- **THEN** the Overview page, the Getting started page and each file under
  `docs/wiki/Examples/` has an entry, and every entry has a file

#### Scenario: The block is the sample code

- **WHEN** a unit test reads each built example page and the sample each marker names
- **THEN** each block is the bytes of that sample's marked region, or of the whole sample
  file where it holds no marked region

#### Scenario: A page that shows two blocks

- **WHEN** the build reads the camera page, which carries two markers
- **THEN** the built page holds two TypeScript blocks, each one under the heading it sits
  under today, and each one links its own sample page

#### Scenario: The page links the live sample

- **WHEN** a unit test reads the built example pages
- **THEN** each block is followed by the address of its sample on the Pages site, under the
  site's own base path

#### Scenario: A marker names a sample that is not there

- **WHEN** an example page names a sample directory the repository does not hold, and a
  developer runs `pnpm docs:wiki`
- **THEN** the build fails, names the page and the marker, and leaves the last tree where
  it was

#### Scenario: An example names a member that was removed

- **WHEN** a sample imports a name from the package that the entry points no longer export,
  and a developer runs the unit tests
- **THEN** the test fails and names the sample and the member

#### Scenario: The wiki is a mirror

- **WHEN** a person edits a page in the wiki interface and a later push to `main` runs the
  pipeline
- **THEN** the published page holds what the repository holds, and the hand edit is gone
