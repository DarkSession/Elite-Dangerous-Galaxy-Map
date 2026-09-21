# api-wiki Specification

## Purpose

States what the repository's GitHub wiki holds: a reference page for every member the
library exports, the hand-written prose pages beside it, and a sidebar whose collapsible
sections follow the page the reader is on. It also states what builds the wiki and what
publishes it.

## Requirements

### Requirement: The wiki holds a page for every exported member

The wiki SHALL hold one page for each member the library exports from its main entry point
and from the `./nebulae` subpath. `library-package` states that surface, and this
requirement takes it from the source rather than from a list written by hand: the pages are
generated from the entry modules, so a member added to an entry point without a page is a
failure, and a page for a member no entry point exports is a failure too.

Each page SHALL carry the member's name, the kind it belongs to, its signature or its
shape, and the documentation comment the source holds. A page for a member that names other
exported members — a parameter type, a return type, a property type — SHALL link to the page
of each one.

The pages SHALL be grouped into these sections, and the wiki SHALL use these names:

| Section      | What it holds                             |
| ------------ | ----------------------------------------- |
| Classes      | an exported class                         |
| Interfaces   | an exported interface                     |
| Type Aliases | an exported type alias                    |
| Variables    | an exported `const` or `let`              |
| Functions    | an exported function                      |

**The two entry points share one set of sections.** A section holds the members of the main
entry point and of `./nebulae` together, in one list, sorted by name. The wiki SHALL NOT
split the sections by entry point: a reader looks a member up by its name, and which module
exports it is on the member's own page.

**A section with no member SHALL NOT appear**, in the tree or in the sidebar. The library
exports no class today, so the wiki holds no Classes section until it does.

**`./testing` is not the supported surface, and it is not generated.** The wiki SHALL hold
one page for that subpath, written by hand, which states that the subpath carries no
compatibility promise and names its exports. Those exports SHALL NOT appear in the five
sections above, so the generator SHALL read the main entry point and `./nebulae` alone.
`GalaxyMapDebug` is not exported from any entry point and SHALL NOT appear.

Every link the wiki holds to another wiki page SHALL resolve to a page the wiki holds.

**A page name SHALL be used once in the whole wiki.** A wiki serves every page from one
flat set of names, whatever folder holds the file, so two files of one name are one page
and the second silently replaces the first. The two entry points are separate modules and
each may export a name the other does, so the build SHALL fail, naming both sources, rather
than write a name it has already written.

#### Scenario: Every exported member has a page

- **WHEN** a unit test reads the export lists of the main entry point and of `./nebulae`,
  and reads the page tree the wiki build wrote
- **THEN** every exported name has exactly one page, and every page in the five sections
  names an exported member

#### Scenario: An empty section is left out

- **WHEN** a unit test reads the page tree and the library exports no class
- **THEN** the tree holds no Classes directory and the sidebar holds no Classes section

#### Scenario: A new export with no page fails the build

- **WHEN** a developer adds an export to the main entry point and runs the unit tests
  without rebuilding the wiki
- **THEN** the test that compares the export list with the page tree fails and names the
  member

#### Scenario: A name written twice fails the build

- **WHEN** the two entry points each export a member of one name and the build runs
- **THEN** it exits non-zero, names the member and both entry points, and writes no tree

#### Scenario: Every link resolves

- **WHEN** a unit test reads every link between the pages of the built wiki tree
- **THEN** each target is a page of the tree

#### Scenario: The renderer probe stays out

- **WHEN** a unit test reads the page tree
- **THEN** it holds no page for `GalaxyMapDebug`, and the `./testing` page states that the
  subpath carries no compatibility promise

### Requirement: The sidebar collapses by section and stays open on the section in use

The wiki SHALL carry a navigation sidebar on every page. The sidebar SHALL hold, in this
order: **Overview**, **Getting started**, **The testing subpath**, then a collapsible block
for **Examples** and one for each section of the previous requirement that holds a member.
The first three are single pages and carry no block.

Each collapsible block SHALL be an HTML `details` element with a `summary` that names the
section, and SHALL list one link per page of that section.

**Every sidebar of the wiki SHALL name every page of the wiki.** The sidebars differ in one
thing alone: which block is open. A reader therefore reaches any page from any page.

**The open block SHALL follow the page the reader is on.** When a reader opens a page of a
section, the sidebar shown beside that page SHALL have that section's block open and every
other block closed. A reader who moves from one page of a section to another page of the
same section SHALL still see the section open. On a page that is in no section — the
Overview page, the Getting started page and the testing subpath page — every block SHALL
be closed.

#### Scenario: A section stays open while the reader moves inside it

- **WHEN** a reader opens an Interfaces page from the sidebar and then a second Interfaces
  page
- **THEN** the sidebar beside both pages shows the Interfaces block open, and the other
  blocks closed

#### Scenario: The landing page opens nothing

- **WHEN** a reader opens the Overview page
- **THEN** every collapsible block of the sidebar is closed

#### Scenario: Each section carries its own sidebar

- **WHEN** a unit test reads the built wiki tree
- **THEN** each section directory holds a sidebar file of its own, that file opens that
  section alone, and the sidebar at the root of the tree opens none

#### Scenario: Every page is in the sidebar

- **WHEN** a unit test reads every page of the built tree and every link of every sidebar
- **THEN** each page is linked from every sidebar, and the sidebars differ in the open
  block alone

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

### Requirement: One command builds the whole wiki tree

The repository SHALL hold one root script, **`pnpm docs:wiki`**, that builds the complete
wiki tree — the generated pages, the prose pages and every sidebar — into a directory at
the repository root that git ignores. A developer SHALL run the same script the pipeline
runs, and SHALL read the result before pushing.

**The unit suite runs the build.** `pnpm test` builds the tree, because the tests of this
capability read it, so a build that fails already fails the third command of the pipeline's
check job. The pipeline SHALL NOT run the build a second time in that job.

The build SHALL be **deterministic**: two runs over the same source SHALL write the same
bytes. A run that reads a clock, a random value or the working directory into a page makes
every publish a change and fills the wiki history with noise.

**A page SHALL carry no commit identifier.** A generator that writes a source link for each
member writes the commit it ran on into that link, which changes on every push and defeats
the rule above without failing a determinism check — two builds in one run sit on one
commit. The build SHALL write no such link.

The build SHALL fail, and SHALL NOT write a partial tree, where a source file it reads does
not parse or a prose page it expects is missing.

**Scale.** The wiki is text: the tree SHALL be under 100 pages and under 2 MB, it carries
no galaxy data, no image of the map and no record set, and the build runs no renderer. The
script SHALL finish in under 2 minutes on a GitHub-hosted runner. The two sizes are read by
a test rather than assumed; the time bound is read from the job's own log.

#### Scenario: The tree stays inside its stated size

- **WHEN** a unit test counts the pages of the built tree and adds up their bytes
- **THEN** the count is under 100 and the total is under 2 MB

#### Scenario: The build is deterministic

- **WHEN** a unit test runs the build twice over the same source and compares the two trees
- **THEN** every file is byte for byte the same

#### Scenario: A missing prose page fails the build

- **WHEN** the build runs and a page the sidebar names is not in `docs/wiki/`
- **THEN** the build exits non-zero, names the missing file, and writes no tree

#### Scenario: The output directory is ignored

- **WHEN** a unit test reads `.gitignore` and runs `git status --porcelain` after a build
- **THEN** the directory the build writes is ignored, and the status names no path inside
  it. The status itself is not asserted to be empty: a developer's tree holds their own
  work, and the property wanted is that the build adds nothing to it.

#### Scenario: No page carries a commit identifier

- **WHEN** a unit test reads every generated page of the built tree
- **THEN** none holds a 40 character hexadecimal string

### Requirement: A push to main publishes the wiki

After the checks pass on a push to `main`, the pipeline SHALL push the built tree to the
repository's own wiki. It SHALL publish nothing from a pull request.

The job SHALL authenticate with the workflow's own `GITHUB_TOKEN` and SHALL hold
`contents: write`, which is the permission that writes the wiki's git repository. It SHALL
carry no personal access token and no other write permission. It SHALL hold a concurrency
group of its own, so two pushes in a row do not race and the later one wins.

**The published wiki SHALL hold what the build wrote and nothing else.** A page that the
build no longer writes SHALL be removed from the wiki.

**A publish that changes nothing SHALL write no commit.** Where the built tree matches what
the wiki already holds, the job SHALL report that and exit without a commit, so the wiki
history holds one entry per real change.

**The wiki must already exist, and no step of the pipeline can create it.** A repository
whose wiki was never started has no git repository to clone. A person turns the wiki on and
saves one page, once, in the repository settings. `README.md` SHALL record this, as it
records the prerequisites of the npm publish. The job SHALL fail with a message that says
so where the clone finds no wiki.

#### Scenario: A pull request publishes nothing

- **WHEN** a unit test reads the wiki job's condition
- **THEN** it runs only on a push to `main`, and it needs the check job

#### Scenario: The job holds one write permission

- **WHEN** a unit test reads the wiki job
- **THEN** it holds `contents: write`, holds no other write permission, and no step reads a
  personal access token from the secrets

#### Scenario: An unchanged tree writes no commit

- **WHEN** a push to `main` changes no file the wiki build reads
- **THEN** the wiki job finds the tree unchanged and adds no commit to the wiki

#### Scenario: A removed page leaves the wiki

- **WHEN** an export is removed, the build writes no page for it, and the job runs
- **THEN** the page is gone from the published wiki

#### Scenario: The wiki was never started

- **WHEN** the job runs against a repository whose wiki holds no page
- **THEN** it fails with a message naming the setting a person must turn on

#### Scenario: The published wiki reads correctly

This scenario is read **after the merge**, because no run of the pipeline on `main` can
happen before it. It is the one check of this change that the implementation cannot close
by itself.

- **WHEN** a person opens the repository's wiki after a run of the pipeline on `main`
- **THEN** the Overview page shows, the sidebar holds the collapsible sections, and opening
  a page of a section leaves that section open
