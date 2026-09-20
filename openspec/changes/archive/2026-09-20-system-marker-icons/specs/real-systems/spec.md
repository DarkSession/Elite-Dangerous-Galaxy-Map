## MODIFIED Requirements

### Requirement: The map is created through a library entry point that returns a handle

The map SHALL expose `createGalaxyMap(canvas, options)`. The call SHALL return a handle
in the same tick, before the scene data is ready. `options` SHALL be optional, and SHALL
carry an optional `labelHost` element for the region label overlay, an optional
`regions`, which `galactic-regions` defines, an optional `shapes`, which `map-shapes`
defines, an optional `grid`, which
`coordinate-grid` defines, an optional `hud`, which `map-hud` defines, an optional
`datasets` and an optional `dataset`, which `dataset-catalog` defines, an optional
`systemIcons`, which `system-icons` defines, and an optional
`loadingImage`, which the requirement below defines. With no `labelHost`
the library SHALL create its own overlay element in the canvas's parent, so a host that
gives a canvas alone gets a working map. The library SHALL NOT read an element by id.

`addCategories` and `addSystems` SHALL take `readonly CategoryInput[]` and
`readonly SystemRecordInput[]`, which `library-package` defines, and not
`readonly unknown[]`. The run-time reader is unchanged: every field is still validated and
every rejection is still reported.

The handle SHALL carry these members:

| Member                        | What it does                                                  |
| ----------------------------- | ------------------------------------------------------------- |
| `addCategories(categories)`   | Reads categories into the table and returns the report        |
| `addSystems(records)`         | Reads records into the set and returns the report             |
| `clearSystems()`              | Empties the set                                               |
| `clearSystemsAndCategories()` | Empties the set and the category table                        |
| `systemCount()`               | How many systems the set holds                                |
| `ready`                       | A promise that settles when the map starts, or fails          |
| `dispose()`                   | Stops the map and releases what it holds                      |
| `getView()`                   | Reads the current view                                        |
| `setView(view)`               | Replaces part or all of the current view                      |
| `onViewChange(fn)`            | Calls `fn` after the view changes, and returns an unsubscribe |
| `areRegionsVisible()`         | Reads whether the region overlay draws                        |
| `setRegionsVisible(on)`       | Turns the region overlay on or off                            |
| `getSystem(index)`            | Reads one system of the set, or null outside it               |
| `categoryCount()`             | How many categories the table holds                           |
| `getCategory(index)`          | Reads one category of the table, or null outside it           |
| `setCategoryVisible(name, on)`| Turns the markers of a category on or off                     |
| `isCategoryVisible(name)`     | Reads whether the markers of a category draw                  |
| `setShapeCategoryVisible(name, on)` | Turns the shapes of a category on or off                |
| `isShapeCategoryVisible(name)`| Reads whether the shapes of a category draw                   |
| `setNameFilter(text)`         | Keeps the markers whose name holds the text                   |
| `getNameFilter()`             | Reads the filter text                                         |
| `getSelection()`              | Reads the selected system, or null                            |
| `setSelection(identity)`      | Selects a system by its identity, or clears the selection     |
| `onSelectionChange(fn)`       | Calls `fn` after the selection changes, returns an unsubscribe |
| `getHover()`                  | Reads the hovered system, or null                             |
| `systemAt(x, y)`              | The system under a canvas pixel, or null                      |
| `setSystemNamesVisible(on)`   | Turns the marker name labels on or off                        |
| `areSystemNamesVisible()`     | Reads whether the marker name labels draw                     |
| `setSystemIconsVisible(on)`   | Turns the system icon stacks on or off                        |
| `areSystemIconsVisible()`     | Reads whether the system icon stacks draw                     |
| `setGridVisible(on)`          | Turns the coordinate grid on or off                           |
| `isGridVisible()`             | Reads whether the coordinate grid draws                       |
| `onGridChange(fn)`            | Calls `fn` after the grid switch moves, returns an unsubscribe |
| `regionNameAt(point)`         | The region name at a point on the galactic plane, or null     |
| `addSpheres(spheres)`         | Reads spheres into the shape set and returns the report       |
| `addLines(lines)`             | Reads lines into the shape set and returns the report         |
| `clearShapes()`               | Empties the shape set                                         |
| `sphereCount()`               | How many spheres the shape set holds                          |
| `lineCount()`                 | How many lines the shape set holds                            |
| `getSphere(index)`            | Reads one sphere of the set, or null outside it               |
| `getLine(index)`              | Reads one line of the set, or null outside it                 |
| `getShapeInfo(kind, index)`   | Reads one shape without its geometry, or null outside the set |
| `setShapeNameFilter(text)`    | Keeps the shapes whose name holds the text                    |
| `getShapeNameFilter()`        | Reads the shape filter text                                   |
| `setShapesVisible(on)`        | Turns the spheres and the lines on or off                     |
| `areShapesVisible()`          | Reads whether the spheres and the lines draw                  |
| `getDatasets()`               | The dataset catalog, which `dataset-catalog` defines          |
| `getLoadedDataset()`          | The dataset now on the map, or null                           |
| `loadDataset(id)`             | Loads one dataset and returns a promise of its reports        |
| `onDatasetChange(fn)`         | Calls `fn` after the loaded dataset changes, returns an unsubscribe |
| `hud`                         | The HUD handle, null when the option is off or before `ready` |
| `debug`                       | The renderer hooks the browser tests read                     |

`onGridChange` SHALL call its listener after the coordinate grid switch moves, whatever
moved it: a `setGridVisible` call, or the HUD switch, which calls that same member. The HUD owns the switch
and the demo page writes the switch into the URL fragment, so the page needs a
notification to read. `onViewChange` does not carry the switch, because the grid is not
part of the view state.

`ready` SHALL resolve after the map draws its first frame, and, when the options carry a
`datasets` catalog, after the start load settles as well, whichever is later. It SHALL
resolve even when that load failed, so a bad dataset still leaves a drawing map, which
`dataset-catalog` states. A host that waits for `ready` and then reads `systemCount`
therefore reads the set the start load gave it, and does not race it.
`addCategories`, `addSystems`, `clearSystems` and `clearSystemsAndCategories` SHALL work
before and after that frame, and a system added before the first frame SHALL draw in it.

The library SHALL own the render context, the scene data, the view state, the controls,
the label overlay, the selection state, the HUD when the option asks for it, and the
frame loop. The library SHALL NOT read or write
`window.location`, and an ESLint rule SHALL fail the lint on `window.location` in every
source file of the library package, **with no exception**.

The rule held one exception, `src/app/main.ts`, because the demo page and the library sat
in one `src/` tree and one bundle, where a search of the served source could not tell them
apart. The demo page is now a module of a different package, `apps/demo/`, so the rule
over the library package needs no hole in it. The demo page still owns the URL and still
reads `window.location`; the rule simply does not reach it.

The lint rule stays, rather than being dropped as unnecessary, because a library module
that read the location would still compile and still bundle. The rule is what fails it.

The page owns the URL fragment: it parses the fragment, gives the view to `setView`, and
writes the fragment back from `onViewChange`. The requirement "View state in the URL
fragment" of `map-navigation` is then the page's to meet, and it is unchanged.

`debug` is not part of the supported surface. It carries the pass switches, the pixel
readers, the frame measurement, the counts and the program probe.

`getSystem` and `getCategory` read the set one entry at a time and return a copy. The set
holds at most 10,000 systems, so a host that lists them walks the indices, and the handle
never builds an array of 10,000 records for one call.

`debug` SHALL carry `setCloseFade(value)`, which holds the close fade of
`close-view-stars` at the given number from 0 to 1, and `setCloseFade(null)`, which gives
it back to the zoom distance. The close fade empties the invented field at the zoom
distances where the field's own look constants were measured, so the browser tests that
pin the field's light and its grain hold the fade at 1 and read the frame the constants
were fitted to. The override is a test hook and nothing in the page or the controls
reaches it.

`debug` SHALL carry `frameStats()`, which returns the number of frames the loop drew
since the last reset with their mean and worst draw time in milliseconds, and
`resetFrameStats()`, which starts the count again. The existing `measureFrames` redraws
one fixed view and returns a mean, so it cannot measure a pan, a zoom or a worst frame;
`frameStats` measures the frames the loop itself draws, as `labelSampling` already does
for the label sweep. `frameStats` times the draw call alone, because the frame budget
requirement of `far-view-rendering` forbids a wait for the card in the normal loop, so
its numbers are not on the same scale as `measureFrames`.

`debug` SHALL carry `setNearPlane(value)`, which holds the near plane at the given number
of light years, and `setNearPlane(null)`, which gives it back to the zoom distance rule.
The scenario "The near plane changes no view that draws today" of `map-navigation` reads a
frame drawn against the fixed near plane of 10 light years the map used before the rule
existed, and no frame the map draws by itself can give that reading. The override is a
test hook, as `setCloseFade` is, and nothing in the page or the controls reaches it.

The demo page SHALL call the entry point, SHALL put the handle on `window.galaxyMap`,
and SHALL keep every `window.__galaxyMap` hook the browser tests read today, including
`renderer`, which carries the hardware assertion.

`areRegionsVisible`, `setRegionsVisible`, `areShapesVisible` and `setShapesVisible` are on
the handle and not on `debug`, because each one is a setting a host chooses and not a
renderer probe. The `regions` pass switch and the `shapes` pass switch stay on `debug`.

The **twelve** shape members are the whole shape surface, which `map-shapes` defines. The
table held nine and named nine. `getShapeInfo`, `setShapeNameFilter` and
`getShapeNameFilter` are on the handle and `map-shapes` states each one, so the table gains
the three rows it lost. A shape is
not an entry of the category table, but it may name one. A category therefore holds two
visibility flags, one for its markers and one for its shapes, which `map-shapes` states:
`setCategoryVisible` and `isCategoryVisible` reach the markers alone, and
`setShapeCategoryVisible` and `isShapeCategoryVisible` reach the shapes alone. No other
member of the category rows reaches a shape.

**The handle carried `getRegionMode` and `setRegionMode`.** The region overlay now takes one
switch, which `galactic-regions` states, so the two members and the `regionMode` option are
gone and the two rows above replace them.

#### Scenario: The overlay switches are on the handle and not on debug

- **WHEN** a browser test reads `areRegionsVisible`, `setRegionsVisible`, `areShapesVisible`
  and `setShapesVisible` on the handle and on `debug`, and reads `getRegionMode` and
  `setRegionMode` on both
- **THEN** the first four are functions on the handle and none of them is on `debug`, and
  `getRegionMode` and `setRegionMode` are on neither

#### Scenario: The handle carries the shape members

- **WHEN** a browser test builds a map, adds one sphere and one line, and reads
  `addSpheres`, `addLines`, `clearShapes`, `sphereCount`, `lineCount`, `getSphere` and
  `getLine` on the handle and on `debug`
- **THEN** all seven are on the handle, none is on `debug`, and `sphereCount` and
  `lineCount` each read 1

#### Scenario: The handle works before the first frame

- **WHEN** the browser test opens the page, reads `window.galaxyMap` before `ready`
  resolves, adds one system at Sol, then waits for `ready`
- **THEN** `systemCount` is 1 before the wait, and the first frame the page draws holds
  a marker at Sol's pixel

#### Scenario: The handle empties the set

- **WHEN** a browser test adds 100 systems, reads `systemCount`, calls `clearSystems`
  and reads it again
- **THEN** the first reading is 100 and the second is 0

#### Scenario: The handle empties the set and the table together

- **WHEN** a browser test adds 2 categories and 100 systems, calls
  `clearSystemsAndCategories`, reads `systemCount`, then adds one record that names a
  category of the table it just emptied, and then adds that category and the same record
  again
- **THEN** the reading is 0, the first record is rejected as `unknown-category`, and the
  second is added

#### Scenario: The page writes the fragment from the handle

- **WHEN** the browser test calls `setView` on the handle with a new cursor and waits for
  the page to write the fragment
- **THEN** the fragment holds the new cursor

#### Scenario: The handle reports the grid switch

- **WHEN** a browser test subscribes with `onGridChange`, turns the HUD's coordinate grid
  switch on, then calls `setGridVisible(false)` on the handle, then unsubscribes and calls
  `setGridVisible(true)`
- **THEN** the listener runs twice, with `true` and then `false`, and does not run a third
  time

#### Scenario: The lint holds the library away from the location

- **WHEN** `pnpm lint` runs over the tree, and again over a tree where
  `packages/galaxy-map/src/app/create-map.ts` reads `window.location.hash`
- **THEN** the first run is clean and the second fails on that line

#### Scenario: The rule holds no exception inside the library package

- **WHEN** a unit test reads the ESLint configuration and lists the files the
  `window.location` rule ignores
- **THEN** the list is empty, and the rule's file pattern covers every source file of
  `packages/galaxy-map/src/`

#### Scenario: The library makes its own label host

- **WHEN** a browser test calls the entry point with a canvas whose parent holds no
  element with the id `labels`, and with no `options`, and waits for `ready`
- **THEN** the map draws and the region labels show

  The test reaches the entry point through `window.galaxyMapFactory`, which the demo page
  sets beside `window.galaxyMap`. The browser suite runs against the built preview, which
  serves no source path the test could import.

#### Scenario: The handle reads the set one entry at a time

- **WHEN** a unit test adds two categories and three systems, then reads `systemCount`,
  `getSystem(0)`, `getSystem(2)`, `getSystem(3)`, `categoryCount()`, `getCategory(0)` and
  `getCategory(2)`
- **THEN** the count is 3, the first two reads give the first and the third record,
  `getSystem(3)` gives null, the category count is 2, `getCategory(0)` gives the first
  category and `getCategory(2)` gives null

#### Scenario: A handle built with no HUD option carries no HUD

- **WHEN** a browser test calls the entry point with no `options`, waits for `ready`, and
  reads `hud`
- **THEN** the reading is null and the canvas's parent holds no HUD element

#### Scenario: The handle carries the dataset members

- **WHEN** a browser test builds a map with a catalog of two entries and reads
  `getDatasets`, `getLoadedDataset`, `loadDataset` and `onDatasetChange` on the handle and
  on `debug`
- **THEN** all four are on the handle and none is on `debug`

### Requirement: A record follows the shape of an EDSM or a Spansh dump

A record SHALL carry a `name` that is a string of at least one character, a `coords`
object whose `x`, `y` and `z` are finite numbers, and a `primaryCategory` that is the name
of a category the table holds. The position is in game coordinates in light years.

A record MAY carry `secondaryCategories`, an array of names of categories the table
holds. The array MAY hold any number of names. The reader SHALL drop a name that repeats
and a name equal to the primary category, and SHALL keep the rest in the order the record
gave them. A `secondaryCategories` that is present and is not an array SHALL be dropped,
as an optional field of the wrong type is dropped. An entry of the array that is not the
name of a category the table holds SHALL reject the record, which covers an entry that is
not a string. A secondary category does not change the **colour** or the **style** a
marker draws in, which the primary category alone gives. It does decide whether the marker
draws at all: the requirement "A category can be turned off" states that rule.

The reader SHALL keep these optional fields when they are present and of the stated
type, and SHALL drop every other field of the record:

| Field             | Type                       |
| ----------------- | -------------------------- |
| `id64`            | number, string or `bigint` |
| `allegiance`      | string                     |
| `government`      | string                     |
| `primaryEconomy`  | string                     |
| `security`        | string                     |
| `population`      | finite number              |
| `bodyCount`       | finite number              |
| `description`     | string                     |
| `primaryStar`     | string                     |
| `images`          | array, read as below       |
| `icons`           | array, which `system-icons` defines |

The reader SHALL store `id64` as a decimal string. A Spansh `id64` is a 64-bit integer,
and `JSON.parse` loses digits above 2^53, so a host that needs every digit passes a
string or a `bigint`.

`description` is text about the system, written in the **Markdown subset** that
`system-details` states. The reader SHALL keep the string as the record gave it: it SHALL
NOT strip a character, SHALL NOT escape one, and SHALL NOT parse the text. The HUD parses
it when it draws it, and it draws no HTML from it, so a description from an untrusted dump
carries no markup into the page.

`primaryStar` is the class of the system's primary star, for example `K5 V`. Neither field
changes how a marker draws. The HUD shows each one, and it hides the description section
when the record carries none and the `details` loader of `system-details` gives none.

`images` is an array of entries, each an object with a `url` string and an optional
`caption` string. The reader SHALL keep at most **8** entries, in the order the record
gave them, and SHALL drop the rest. The reader SHALL drop an entry that is not an object,
an entry whose `url` is not a string, an entry whose `url` is empty, and an entry whose
`url` names a scheme that is not `http` or `https`. A `url` with no scheme is a relative URL and SHALL be kept. A bad entry
SHALL NOT reject the record, because an image is decoration and the rest of the record
still draws and still reads.

The scheme rule is a safety rule, not a formatting one. The HUD puts the `url` in an image
element, so a `javascript:` or a `data:` URL from an untrusted dump would run or embed
content the host did not mean to serve. The library SHALL NOT fetch an image itself: the
browser loads it from the element.

`icons` is an array of at most **4** entries, which `system-icons` states the shape of and
the map draws over the system's marker. It is the one optional field a bad value **rejects**
the record for, rather than drops: `system-icons` states why, and the two reasons the
requirement below names are what the report carries. The same URL rule the images hold
covers a host icon's `url`.

#### Scenario: An EDSM record and a Spansh record are both read

- **WHEN** a unit test adds two categories, then one EDSM record, which carries `id64`,
  `name`, `coords`, `primaryCategory` and `date`, and one Spansh record, which carries
  those fields and `allegiance`, `government`, `primaryEconomy`, `security`,
  `population`, `bodyCount`, `bodies` and `stations`
- **THEN** both are accepted, the kept fields hold the values the records gave, and
  neither `date` nor `bodies` nor `stations` is held

#### Scenario: An unknown secondary category rejects the record

- **WHEN** a unit test adds the category `A`, then two records that name `A` as the
  primary category: one whose `secondaryCategories` hold `B`, which the table does not
  hold, and one whose `secondaryCategories` is the string `A` and not an array
- **THEN** the first is rejected as `unknown-category`, and the second is accepted with
  no secondary category

#### Scenario: The secondary categories are kept in order, without a repeat

- **WHEN** a unit test adds the categories `A`, `B` and `C`, then one record whose
  primary category is `A` and whose `secondaryCategories` are `C`, `B`, `C` and `A`
- **THEN** the record is accepted and holds the secondary categories `C` and `B`, in that
  order

#### Scenario: A large id64 keeps every digit

- **WHEN** a unit test adds a record whose `id64` is the string `2871051900826` and one
  whose `id64` is the bigint `18262930337633`
- **THEN** the reader holds `"2871051900826"` and `"18262930337633"`

#### Scenario: The three HUD fields are kept when they are strings

- **WHEN** a unit test adds one category, then one record that carries `description`,
  `primaryStar` and `images` of one entry, and one record whose `description` is the
  number 4 and whose `primaryStar` is null
- **THEN** both records are accepted, the first holds all three, and the second holds
  neither string

#### Scenario: The image list drops a bad entry and caps at eight

- **WHEN** a unit test adds one record whose `images` hold, in order, an entry with the
  `url` `https://example.test/a.png` and the caption `A`, an entry with the `url`
  `javascript:alert(1)`, an entry with the `url` `/local/b.png`, an entry that is the
  string `c.png`, and then 10 more entries with valid `https` URLs
- **THEN** the record is accepted and holds 8 images: the `https` entry with its caption,
  the relative entry, and the first 6 of the 10, and neither the `javascript` entry nor
  the string entry is held

#### Scenario: An images field that is not an array is dropped

- **WHEN** a unit test adds one record whose `images` is the string `a.png` and one whose
  `images` is an empty array
- **THEN** both records are accepted and neither holds an image

#### Scenario: A description keeps its Markdown characters

- **WHEN** a unit test adds one record whose `description` holds a star, a backtick, a
  bracket and a backslash, and reads the record back from the handle
- **THEN** the string reads exactly as the record gave it, character for character

#### Scenario: An icon list is kept and a bad one rejects the record

- **WHEN** a unit test adds one record whose `icons` is `['titan']` and one whose `icons`
  is the string `titan`
- **THEN** the first is accepted and holds one icon, and the second is rejected as
  `bad-icon`

### Requirement: The reader reports every record it rejects

`addSystems` SHALL return a report of `added`, `replaced` and `rejected`. Each rejected
entry SHALL carry the index of the record in the call and one reason from this set:
`no-name`, `no-coords`, `no-category`, `unknown-category`, `out-of-bounds`,
`over-capacity`, `bad-icon`, `unknown-icon`.

A record whose position lies outside the galaxy model bounds SHALL be rejected as
`out-of-bounds`. The bounds are the volume the map draws, so a record outside them could
never show. The reader SHALL reject a bad record and SHALL keep reading the rest of the
call.

A record with no `primaryCategory`, or whose `primaryCategory` is not a string of at
least one character, SHALL be rejected as `no-category`. A record whose primary category,
or one of whose secondary categories, names a category the table does not hold SHALL be
rejected as `unknown-category`. A category is what colours a marker, so a system without
one has no colour to draw in. The host therefore adds its categories before its systems,
and the report names every record that arrived too early.

`bad-icon` and `unknown-icon` are what an unreadable `icons` field gives, and `system-icons`
states which fault gives which. They are the last two reasons the reader tests, so a record
that is faulty in an earlier field reports that earlier reason.

#### Scenario: Each fault gets its own reason

- **WHEN** a unit test adds one category, then seven records: one valid, one with an
  empty name, one with no `coords`, one whose `coords.x` is `NaN`, one at
  (0, 0, 900,000), one with no `primaryCategory`, and one whose `primaryCategory` names a
  category the table does not hold
- **THEN** `added` is 1, and `rejected` holds `no-name` at index 1, `no-coords` at
  index 2, `no-coords` at index 3, `out-of-bounds` at index 4, `no-category` at index 5
  and `unknown-category` at index 6

#### Scenario: An icon fault reports after an earlier fault

- **WHEN** a unit test adds one record with an empty name and an `icons` of
  `['no-such-icon']`, and one valid record whose `icons` is `['no-such-icon']`
- **THEN** the first is rejected as `no-name` and the second as `unknown-icon`
