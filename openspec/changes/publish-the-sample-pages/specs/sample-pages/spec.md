## Purpose

Gives each code block of the wiki examples a page on the Pages site that runs it, and
makes that page's source the one copy of the code, so a reader can open what the block
shows and a test can prove the block still runs.

## ADDED Requirements

### Requirement: Each example block has a sample page on the Pages site

The demo site SHALL publish one sample page for each code block of the example pages of
the wiki. The set SHALL be these nine, and the identifier of each one SHALL be the name of
its directory:

| Identifier              | The example page and block it belongs to |
| ----------------------- | ---------------------------------------- |
| `systems-on-the-map`    | Systems on the map                       |
| `a-record-with-details` | A record with details                    |
| `the-system-icons`      | The system icons                         |
| `the-hud`               | The HUD                                  |
| `the-camera`            | The camera, the first block              |
| `the-view-in-a-url`     | The camera, the block "The view in a URL" |
| `spheres-and-lines`     | Spheres and lines                        |
| `a-dataset-catalog`     | A dataset catalog                        |
| `the-nebulae`           | The nebulae                              |

A sample page SHALL be served at `<base>examples/<identifier>/`, where `<base>` is the
base path of the site. The published address of a sample is therefore
`https://elite-dangerous-almanac.github.io/Galaxy-Map/examples/the-hud/`, and the same
page on the development server is `http://localhost:5173/Galaxy-Map/examples/the-hud/`.

The demo page SHALL stay at the base path itself, and its published files SHALL keep the
addresses they have today. A reader of a link to the demo site reaches the same page after
this change as before it.

The sample pages SHALL be built by the demo site build. No second build, no second command
and no second workflow job SHALL be needed to publish them.

#### Scenario: Every block has a sample, and every sample has a block

- **WHEN** a unit test reads the sample directories and the markers of the example pages of
  `docs/wiki/`
- **THEN** the two sets hold the same nine identifiers, and the test names any identifier
  that is in one set alone

#### Scenario: The build writes every sample page

- **WHEN** a developer runs the demo site build
- **THEN** the output holds `examples/<identifier>/index.html` for each of the nine
  identifiers, and each one names its scripts and its styles under the site's base path

#### Scenario: The demo page keeps its address

- **WHEN** a unit test reads the demo site build
- **THEN** the demo page is still at the root of the output, and the loading picture is
  still under the base path

### Requirement: A sample is the code the wiki shows

The source file of a sample, `main.ts`, SHALL be the code the wiki shows as that block. It
SHALL be readable as a copyable block:

- It SHALL import the library by its package name, and by no relative path.
- It SHALL import from the package's public entry points alone, which are the package name
  and `./nebulae`. It SHALL NOT import `./testing`, and SHALL NOT read the `debug` property
  of the map.
- It SHALL hold the records, the categories and the shapes it draws, and SHALL NOT read a
  file of the demo page's data sets.
- It SHALL hold **60 lines or fewer**, so the whole file stays readable.
- Every member it imports from the package SHALL be a member the package exports.

**A sample MAY mark the part of itself that the wiki shows.** A `// wiki:start` line and a
`// wiki:end` line SHALL bound that part. Where a sample holds the pair, the block is the
lines between them; where it holds neither, the block is the whole file. A sample SHALL
hold at most one pair, and a `wiki:start` with no `wiki:end` SHALL fail the wiki build.
The marked region keeps a block as short as the hand-written one it replaces: the nebula
example is four lines today and stays four lines, while the file around it acquires the
canvas and runs.

A sample SHALL NOT write a test hook on `window`. The browser suite reads what the page
draws, not a handle the page hands it.

#### Scenario: A sample reaches the library by a relative path

- **WHEN** a sample imports the library by a relative path, and a developer runs the lint
- **THEN** the lint fails and names the file and the import, and `tests/lint-config.test.ts`
  holds the case that proves the rule covers the sample directories

#### Scenario: A sample reaches past the public surface

- **WHEN** a sample imports `@elite-dangerous-almanac/galaxy-map/testing`, reads
  `map.debug`, or reads a file of `apps/demo/demo-data/`, and a developer runs the unit
  tests
- **THEN** the test fails and names the sample and what it reached for

#### Scenario: A sample grows past the block size

- **WHEN** a sample source holds more than 60 lines and a developer runs the unit tests
- **THEN** the test fails and names the sample and its line count

#### Scenario: A sample names a member that was removed

- **WHEN** a sample imports a name the entry points no longer export, and a developer runs
  the unit tests
- **THEN** the test fails and names the sample and the member

### Requirement: Every sample draws on the GPU

Each sample page SHALL draw the map it describes. The browser suite SHALL open each of the
nine pages and SHALL assert that the page draws.

The suite SHALL read the renderer string, as the rest of the browser suite does, and SHALL
fail the run where the browser falls back to a software renderer. A page that raises an
error in the browser console, or that draws nothing inside the suite's timeout, SHALL fail
the run and SHALL be named.

#### Scenario: Each sample page draws

- **WHEN** the browser suite opens each of the nine sample pages against the built site
- **THEN** each page draws a frame that is not the empty background, and no page raises an
  error

#### Scenario: A sample runs on a software renderer

- **WHEN** the browser reports SwiftShader or llvmpipe as the renderer
- **THEN** the suite fails and names the renderer, and does not report a pass
