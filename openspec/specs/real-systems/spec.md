## Purpose

Lets a host application put real star systems on the map. The host creates the map with
one call, gives it a table of categories with a second, and adds records with a third.
The map validates each record, draws a marker for each system it keeps in the colour of
that system's primary category, and removes the invented star that stands for the same
system.

## Requirements

### Requirement: The map is created through a library entry point

The map SHALL expose `createGalaxyMap(canvas, options)`. The call SHALL return a handle
in the same tick, before the scene data is ready. `options` SHALL be optional, and SHALL
carry an optional `labelHost` element for the region label overlay, an optional
`regionMode`, which `galactic-regions` defines, an optional `grid`, which
`coordinate-grid` defines, an optional `hud`, which `map-hud` defines, an optional
`datasets` and an optional `dataset`, which `dataset-catalog` defines, and an optional
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
| `getRegionMode()`             | Reads the region overlay mode                                 |
| `setRegionMode(mode)`         | Replaces the region overlay mode                              |
| `getSystem(index)`            | Reads one system of the set, or null outside it               |
| `categoryCount()`             | How many categories the table holds                           |
| `getCategory(index)`          | Reads one category of the table, or null outside it           |
| `setCategoryVisible(name, on)`| Turns the markers of a category on or off                     |
| `isCategoryVisible(name)`     | Reads whether the markers of a category draw                  |
| `setNameFilter(text)`         | Keeps the markers whose name holds the text                   |
| `getNameFilter()`             | Reads the filter text                                         |
| `getSelection()`              | Reads the selected system, or null                            |
| `setSelection(identity)`      | Selects a system by its identity, or clears the selection     |
| `onSelectionChange(fn)`       | Calls `fn` after the selection changes, returns an unsubscribe |
| `getHover()`                  | Reads the hovered system, or null                             |
| `systemAt(x, y)`              | The system under a canvas pixel, or null                      |
| `setSystemNamesVisible(on)`   | Turns the marker name labels on or off                        |
| `areSystemNamesVisible()`     | Reads whether the marker name labels draw                     |
| `setGridVisible(on)`          | Turns the coordinate grid on or off                           |
| `isGridVisible()`             | Reads whether the coordinate grid draws                       |
| `onGridChange(fn)`            | Calls `fn` after the grid switch moves, returns an unsubscribe |
| `regionNameAt(point)`         | The region name at a point on the galactic plane, or null     |
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
source file outside `src/app/main.ts`. A lint rule is what holds the boundary, because
the production build puts the page and the library in one bundle, where a search of the
served source cannot tell them apart. The project already holds its scene-data import
rule this way.

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

`getRegionMode` and `setRegionMode` are on the handle and not on `debug`, because the
region mode is a setting a host chooses and not a renderer probe. The `regions` pass
switch stays on `debug`.

#### Scenario: The region mode is on the handle and not on debug

- **WHEN** a browser test reads `getRegionMode` and `setRegionMode` on the handle and on
  `debug`
- **THEN** both are functions on the handle, and neither is on `debug`

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
  `src/app/create-map.ts` reads `window.location.hash`
- **THEN** the first run is clean and the second fails on that line

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

### Requirement: The entry point reports a start-up failure through `ready`

When the canvas gives no WebGL2 context, or the card reports a software renderer,
`createGalaxyMap` SHALL still return a handle. `ready` SHALL then reject with the named
error, and the frame loop SHALL NOT start. `addSystems` SHALL keep reading records, and
nothing SHALL draw.

The demo page SHALL catch that rejection, SHALL put the text on
`window.__galaxyMap.error` and SHALL show it in the page's message box. The requirements
"Hardware rendering is asserted" and "WebGL2 is required" of `far-view-rendering` are
then met as they were before the split.

#### Scenario: No WebGL2 context rejects ready

- **WHEN** a unit test calls the entry point with a canvas whose `getContext` returns
  `null`, and waits on `ready`
- **THEN** the handle exists, `ready` rejects with the message the context reports, and
  no animation frame is requested

#### Scenario: The page shows the failure

- **WHEN** the browser test opens the page with WebGL2 refused
- **THEN** `window.__galaxyMap.error` holds the message and the page's message box shows
  it



### Requirement: The handle releases what it holds on dispose

`dispose` SHALL stop the frame loop, SHALL remove the event listeners the map added,
SHALL delete the GPU objects the passes hold, and SHALL terminate any scene-data worker
that is still running. A second call SHALL do nothing and SHALL NOT throw.

`loadSceneData` starts three workers and terminates each one when its own promise
settles, so there is no way to stop a load that is still running. It SHALL take a cancel
signal, and SHALL terminate every worker it started when the signal fires.

#### Scenario: Dispose stops the map and repeats safely

- **WHEN** the browser test waits for `ready`, reads `debug.frameStats().frames`, calls
  `dispose`, waits 10 animation frames, reads it again, and calls `dispose` a second time
- **THEN** the two readings are equal and the second call throws nothing



### Requirement: A category carries a name, a colour and a description

The handle SHALL expose `addCategories(categories)`. A category SHALL carry a `name` that
is a string of at least one character, and a `color` of three finite numbers from 0 to
255, in the order red, green, blue. A category MAY carry a `description`, which is a
string the phase 4 HUD shows. A category MAY carry a `markerStyle` and a `maxDrawRange`,
which the two requirements below define. The reader SHALL drop every other field.

A `markerStyle` that is present SHALL be the string `glow` or the string `disc`. Any
other value SHALL reject the category with the reason `bad-style`. The reader SHALL NOT
silently drop a `markerStyle` it does not know, because a host that misspells a style
would otherwise get the default and no report of it.

A `maxDrawRange` that is present SHALL be a finite number above 0. Any other value SHALL
reject the category with the reason `bad-range`.

The identity of a category is its `name`. A category whose name is already in the table
SHALL replace the one that holds it, and every system that names it SHALL take the new
colour, the new style and the new range in the next frame. A replace SHALL replace the
whole category, so a description, a style or a range the old one carried and the new one
does not is gone and the default takes its place.

No call SHALL remove one category. `clearSystemsAndCategories` SHALL empty the table, and
it SHALL empty the system set in the same call. A system in the set can then never name a
category the table does not hold: a category leaves only with every system that could name
it. A host that loads a new data set calls `clearSystemsAndCategories` and then its two
add calls, in that order.

A replaced category SHALL keep the index it already holds in the table. The system set
holds one category index per system, so an index that moved would point every system that
names the category at another category's colour.

A `description` that is present and is not a string SHALL be dropped, as an optional
field of the wrong type is dropped from a record. `markerStyle` and `maxDrawRange` are the
exception: a wrong value rejects the category rather than being dropped, because each one
changes what the user sees and a silent drop would hide the fault in a frame that still
draws.

A replacement SHALL work on a full table, because it adds no category. The capacity bound
rejects a category that would grow the table, and never one that replaces a category
already in it.

The table SHALL hold at most 256 categories. `addCategories` SHALL return a report of
`added`, `replaced` and `rejected`. Each rejected entry SHALL carry the index of the
category in the call and one reason from this set: `no-name`, `bad-color`, `bad-style`,
`bad-range`, `over-capacity`. A `color` that is not three finite numbers from 0 to 255
SHALL be rejected as `bad-color`.

The host names its categories. The map reads a name, a colour, a description, a style and
a range, and it gives no category of its own, so a host that groups its systems by
allegiance and a host that groups them by star class both fit the same call.

#### Scenario: A category is read and kept

- **WHEN** a unit test adds one category of the name `Empire`, the colour (0, 180, 255)
  and a description, and one of the name `Alliance`, the colour (0, 255, 120) and no
  description, and reads the table
- **THEN** both are accepted, each holds the name and the colour the call gave, the first
  holds its description and the second holds none

#### Scenario: Adding the same name replaces the colour

- **WHEN** a unit test adds a category of the name `Empire` and the colour (0, 180, 255),
  then adds a category of the same name and the colour (255, 40, 40), and reads the table
- **THEN** the table holds one category, `replaced` is 1, and its colour is the second one

#### Scenario: Each category fault gets its own reason

- **WHEN** a unit test adds six categories: one valid, one with an empty name, one whose
  `color` holds two numbers, one whose `color` holds a `NaN`, one whose `markerStyle` is
  `sparkle`, and one whose `maxDrawRange` is `-5`
- **THEN** `added` is 1, and `rejected` holds `no-name` at index 1, `bad-color` at index 2
  and at index 3, `bad-style` at index 4 and `bad-range` at index 5

#### Scenario: A style and a range are read and kept

- **WHEN** a unit test adds one category with `markerStyle` `disc` and `maxDrawRange`
  5,000, and one with neither, and reads the table
- **THEN** the first holds `disc` and 5,000, and the second holds `glow` and 120,000

#### Scenario: A replacement drops the style and the range the old one carried

- **WHEN** a unit test adds a category with `markerStyle` `disc` and `maxDrawRange` 5,000,
  then adds a category of the same name with neither field, and reads the table
- **THEN** the category holds `glow` and 120,000, because a replace replaces the whole
  category

#### Scenario: The table bound rejects the excess

- **WHEN** a unit test adds 256 categories, then adds 2 more with new names and 1 with a
  name the table already holds, then calls `clearSystemsAndCategories` and adds 256
  categories again
- **THEN** the second call reports `replaced` 1 and 2 entries of `over-capacity`, and the
  third reports `added` 256 and no rejection

#### Scenario: A replaced category keeps its index

- **WHEN** a unit test adds three categories, adds one system that names the second, then
  adds a category of the second name and a new colour, and reads the table index of that
  category and the colour the marker draws
- **THEN** the index is the one the category held before, and the marker draws the new
  colour

#### Scenario: A wrongly typed description is dropped

- **WHEN** a unit test adds one category whose `description` is the number 7
- **THEN** the category is accepted, its name and colour hold, and it carries no
  description



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

The reader SHALL store `id64` as a decimal string. A Spansh `id64` is a 64-bit integer,
and `JSON.parse` loses digits above 2^53, so a host that needs every digit passes a
string or a `bigint`.

`description` is a paragraph about the system and `primaryStar` is the class of its
primary star, for example `K5 V`. Neither changes how a marker draws. The HUD shows each
one and hides its section when the record carries none.

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

### Requirement: The reader reports every record it rejects

`addSystems` SHALL return a report of `added`, `replaced` and `rejected`. Each rejected
entry SHALL carry the index of the record in the call and one reason from this set:
`no-name`, `no-coords`, `no-category`, `unknown-category`, `out-of-bounds`,
`over-capacity`.

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

#### Scenario: Each fault gets its own reason

- **WHEN** a unit test adds one category, then seven records: one valid, one with an
  empty name, one with no `coords`, one whose `coords.x` is `NaN`, one at
  (0, 0, 900,000), one with no `primaryCategory`, and one whose `primaryCategory` names a
  category the table does not hold
- **THEN** `added` is 1, and `rejected` holds `no-name` at index 1, `no-coords` at
  index 2, `no-coords` at index 3, `out-of-bounds` at index 4, `no-category` at index 5
  and `unknown-category` at index 6



### Requirement: A system's identity is its id64, or its name

The identity of a record SHALL be its `id64` when it has one, and its `name` when it has
none. A record whose identity is already in the set SHALL replace the record that holds
it. The set SHALL then not grow, and the call SHALL report the record under `replaced`.

A replacement SHALL work on a full set, because it adds no system. The capacity bound
rejects a record that would grow the set, and never one that replaces a system already
in it.

#### Scenario: The same system twice replaces rather than adds

- **WHEN** a unit test adds a record with `id64` 10477373803, then adds the same `id64`
  at a different position, and reads the count and the stored position
- **THEN** the count is 1, `replaced` is 1, and the stored position is the second one

#### Scenario: A full set still takes a replacement

- **WHEN** a unit test fills the set to 10,000 systems, then adds one record whose
  `id64` is already in the set at a new position, and one record with a new `id64`
- **THEN** the first is reported under `replaced` and holds the new position, the second
  is rejected as `over-capacity`, and the count stays 10,000



### Requirement: The set holds up to 10,000 systems

The set SHALL hold at most 10,000 systems. `addSystems` SHALL accept records up to that
bound and SHALL reject every record that would grow the set past it with the reason
`over-capacity`. `clearSystems` SHALL empty the set, and the next call SHALL then accept
10,000 records again.

`clearSystemsAndCategories`, which the requirement "A category carries a name, a colour
and a description" defines, SHALL free both bounds: after it the next calls SHALL accept
256 categories and 10,000 records.

#### Scenario: The bound rejects the excess

- **WHEN** a unit test adds 9,998 systems, then adds 5 more with new identities, then
  calls `clearSystems` and adds 10,000
- **THEN** the second call reports `added` 2 and 3 entries of `over-capacity`, and the
  third call reports `added` 10,000 and no rejection



### Requirement: The set holds positions in float64

Every change to the set SHALL raise the set version, and every change to the category
table SHALL raise the table version. An add, a replace, a clear and a paired clear all
count as a change. The marker pass rebuilds its colour buffer from those two numbers and
the star field drops the suppressed sets it kept, so a change that did not raise them
would leave both stale.

The system set SHALL hold positions as one `Float64Array` of three game coordinates per
system, in the order the records were added, the index of each system's primary category
in the table as one `Uint16Array` in the same order, and the record fields as plain
objects and strings.

The positions stay in `float64`, because the marker pass subtracts the camera position
from them every frame and phase 4 projects them for picking. The requirement
"Scene data carries no rendering types" of `far-view-scene-data` already holds the
import direction for every module under the scene-data directory, and this set is one of
them.

#### Scenario: Positions are float64 game coordinates

- **WHEN** a unit test adds three records and reads the set's position array
- **THEN** the array is a `Float64Array` of length 9 and holds the three positions in
  the order the records were added



### Requirement: The demo page loads the Guardian Ruins data set

The demo page SHALL load the data sets `dataset-catalog` names, of which the Guardian
Ruins set is the one it loads at start. The library itself SHALL still bundle no data and
fetch none: the page is a host application and adds the records through `addCategories`
and `addSystems`, as any other host does.

**The library build SHALL hold no record of any set.** The demo site build SHALL carry
them, because the demo site is what GitHub Pages serves and a site with no data shows an
empty sky. This reverses the rule the change `flight-markers-and-grid` wrote, that the
production build drops the set so the browser suite reads an empty set. The suite now
serves the demo site, so a scenario that measures an empty set SHALL call
`clearSystemsAndCategories()` first, which `library-package` states.

**The source** is `Source/data/MapData-GR.js` of CanonnED3D-Map and the
`guardian_ruins.json` dump that file fetches. A build script SHALL make the committed set
from the dump, so the conversion is repeatable and the rules below are read from the
script and not from a hand edit. The script SHALL fetch the dump into a directory the
repository ignores, because the project does not commit data dumps.

**The committed set moves to `demo-data/`.** It sat in `src/app/`, which is library code,
and the library build must hold no data. `demo-data/guardian-ruins.json` is the file, and
`dataset-catalog` names the two beside it.

**The counts below describe the committed file** and not the live dump. The dump gains
records over time, so a later run of the script may write another count. The committed file
is what the tests read, and the counts in the tests move with it when someone runs the
script again.

**A fixture holds the conversion rules.** The repository SHALL commit a small extract of
the dump, of about 20 sites over 8 systems, beside the expected output of the script over
that extract. The rule test reads the fixture and not the live dump, so it runs on a clean
checkout with no network. The extract is a fixture and not a data dump, by the size the
project's other fixtures hold.

**The categories** SHALL be `Ruins Alpha`, `Ruins Beta` and `Ruins Gamma`, each with the
colour and the description the project gives it. The source names a fourth category,
`Unknown`, which no record of the dump uses. The conversion SHALL drop a category that
holds no record, so the HUD's category browser shows no empty row.

**A record** SHALL be one system and not one site. The dump holds 600 sites in 212
systems, and a system holds up to three site types. The primary category SHALL be the type
of the system's first site in the dump, and the other types the system holds SHALL be its
secondary categories. 166 of the 212 systems hold more than one type.

**The images.** A record SHALL carry one image for each site type the system holds, in
the same order as its categories. An image's `url` SHALL be the thumbnail of that type at
`https://ruins.canonn.tech/images/maps/<type>-thumbnail.png`, and its `caption` SHALL name
the type. The project therefore redistributes no picture: the browser loads each one from
Canonn, and the library never fetches an image itself.

**The browser suite SHALL still reach no network.** A browser test MAY now put the set on
the map, because the demo site it serves loads the set itself and a marker fetches nothing.
No browser test SHALL open the information panel on a record of the set, because the panel
draws the record's thumbnails and every one of them is on another host. The browser test
that reads a thumbnail from the built page SHALL keep using a record of its own that names
a picture the build serves from `public/`.

The rule the old browser test held, that a typo in a demo record's picture path ships
unseen, is now held by a unit test instead: the scenario "Every record carries an image for
each type it holds" reads every URL of the committed set.

`THIRD_PARTY_NOTICES.md` SHALL name the source of the records and of the thumbnail URLs,
and SHALL keep the Canonn MIT licence text it holds today.

#### Scenario: The committed set holds the converted records

- **WHEN** a unit test reads `demo-data/guardian-ruins.json`
- **THEN** it holds 3 categories named `Ruins Alpha`, `Ruins Beta` and `Ruins Gamma`, and
  212 systems

#### Scenario: Every record carries an image for each type it holds

- **WHEN** a unit test reads every record of the committed set and compares the number of
  images with the number of categories the record names
- **THEN** the two numbers are equal for every record, every image URL starts with
  `https://ruins.canonn.tech/images/maps/`, and 166 records name more than one category

#### Scenario: The reader accepts the whole set

- **WHEN** a unit test adds the committed categories and then the committed records to a
  real system set
- **THEN** the category report adds 3, the record report adds 212, and it rejects none

#### Scenario: The script holds its conversion rules

- **WHEN** a unit test runs the script's conversion over the committed fixture extract and
  compares the result with the committed expected output
- **THEN** the two are the same, and the test reaches no network

#### Scenario: The committed set is what the conversion gives

- **WHEN** a unit test checks the committed set against the conversion's own rules: every
  record names 1 to 3 categories, its images match its categories one for one and in order,
  no two records share a name, and every position is finite
- **THEN** every check passes, whatever count the file holds

#### Scenario: No browser test loads a remote picture

- **WHEN** a search of `e2e/` looks for `ruins.canonn.tech` and for a browser test that
  selects a record of the Guardian Ruins set
- **THEN** it finds neither, and the browser test that reads a thumbnail from the built page
  names a picture the build serves from `public/`

#### Scenario: The production build carries no data set

- **WHEN** a test reads every file of the library build and searches it for a record of the
  Guardian Ruins set, and a browser test opens the demo site, waits for `ready`, reads
  `systemCount`, calls `clearSystemsAndCategories()` and reads it again
- **THEN** no file of the library build holds a record, the first reading is 212 and the
  second is 0

### Requirement: A marker draws for every system at every zoom distance

The renderer SHALL draw one marker per system in the set, in one draw call, at every
zoom distance from 10 to 120,000 light years, for every system the range rule below keeps,
whose primary category is on, and whose name the filter keeps. There SHALL be no level of
detail: the pass draws the whole set in every frame.

A marker's size SHALL follow one rule for both styles, and that rule SHALL read the
camera **range** alone. The **disc diameter** in CSS pixels is a curve of `range`, the
distance from the camera to the system in light years:

| Range                 | Disc diameter in CSS pixels                        |
| --------------------- | -------------------------------------------------- |
| 10 and below          | 16                                                 |
| 10 to 50              | 16 down to 12, even in the logarithm of the range  |
| 50 to 1,000           | 12                                                 |
| 1,000 to 10,000       | 12 down to 7, even in the logarithm of the range   |
| 10,000 and above      | 7                                                  |

The readings the curve gives are therefore 16 at 10, 14.28 at 20, 12 from 50 to 1,000,
10.49 at 2,000, 8.99 at 4,000 and 7 from 10,000 out.

**The size does not read the viewport.** The old rule was `focalCss * 20 / range`, held
between 7 and 12, and `focalCss` is the CSS pixels per light year at one light year of
range, which follows the viewport height. A system 2,000 light years from the camera
therefore drew 9.35 CSS pixels in a 1,080 row canvas and 7 in a 400 row one, and the range
at which the size stopped changing moved with the window: about 1,560 light years at 1,080
rows and about 580 at 400. The curve above gives one size for one range at every
viewport.

**The plateau from 50 to 1,000 light years** is the band the user reads a neighbourhood
in. A marker is a mark on a system and not a picture of a star, so it should not grow as
the camera comes in over that whole band.

**The rise from 50 to 10 light years** is the last two wheel notches, where the camera is
inside one mass-code `a` boxel. A marker that grows there separates the system the user
flew to from the ones behind it.

**The floor of 7** is what makes a marker findable in the far view, where a true
perspective size falls below one pixel. **The cap of 16** stops a near marker from
covering the frame.

The renderer's own `focal` is in device pixels, because it comes from the drawing buffer
height, so `gl_PointSize` is the CSS diameter times the device pixel ratio. A `glow`
marker's sprite SHALL be **2.5 times the disc diameter**, so the two styles grow together
and stop together and one curve sets both. A glow's sprite therefore runs from 17.5 to 40
CSS pixels.

The pass SHALL hold the size it asks for at or below the card's maximum point size, which
`ALIASED_POINT_SIZE_RANGE` reports. A 40 CSS pixel glow at a device pixel ratio of 3 asks
for 120 device pixels, which is the largest sprite the map draws, so a card that reports
less must cap rather than let the driver decide.

A marker SHALL take the colour of its category as the category stands when the frame
draws. A category replaced under the same name SHALL therefore recolour every marker that
names it, and the set SHALL NOT copy the colour into the record.

The core colour SHALL NOT follow the population zone ramp that the decoration stars and
the point cloud use. Two systems of one primary category SHALL draw one colour, wherever
they lie, and two systems of different categories SHALL draw the two colours the
categories give. The category colour is the first of the two things that separate a real
system from an invented star. The second is the close fade of `close-view-stars`, which
holds the invented field at no light below a zoom distance of 640 light years while a
marker draws at every zoom distance.

The page SHALL expose the number of markers the last frame drew, which is the number the
range rule, the category visibility and the name filter kept together, and not the number
the set holds.

#### Scenario: A marker shows at every zoom distance

- **WHEN** the browser test adds one category with `maxDrawRange` 200,000, adds one system
  at (0, 0, 6,000), then opens the view `#c=0,0,6000&d=10&p=35&y=0` and the same cursor at
  500, 4,000, 20,000 and 120,000 light years, and reads the pixel at the projection of the
  system with the pass on and with it off
- **THEN** the two readings differ at every one of the five distances. The category takes a
  range above the default so that the 120,000 light year view reads the zoom limit and not
  the range limit

#### Scenario: The marker colours reach the frame over both grounds

- **WHEN** the browser test adds one category of the colour (153, 230, 255) and the
  `markerStyle` `disc`, then one system at the galactic centre, which is the brightest
  ground, and one 3,000 light years above the plane at the rim, which is the darkest,
  opens a view that shows each at a range above 3,000 light years, and reads the middle
  pixel of each marker and, on the row through its centre, the ring pixel whose own centre
  lies between 1 and 2 CSS pixels inside the edge of the disc, at a device pixel ratio of 1
- **THEN** every middle pixel is (153, 230, 255) within 2 per channel, and every ring
  pixel is (5, 10, 26) within 2 per channel

#### Scenario: The size falls to the floor and rises to the cap

- **WHEN** the browser test adds one category of the `markerStyle` `disc` and the
  `maxDrawRange` 200,000 and one system, opens a view at 120,000 light years and counts
  the pixels of the row through the marker's centre that differ from the frame drawn with
  the pass off, then opens a view that puts the system 500 light years from the camera and
  counts again, then a view that puts it 10 light years from the camera and counts a third
  time
- **THEN** the counts are 7, 12 and 16, each within 1, at a device pixel ratio of 1. The
  tolerance is one pixel, because a disc that does not sit on a pixel centre covers one
  more or one fewer pixel on its row. The category takes a range above the default because
  the system sits at the cursor, so at a zoom of 120,000 light years its camera range is
  120,000 exactly, on the boundary of the default cut

#### Scenario: The size does not follow the viewport height

- **WHEN** the browser test adds one system, opens a view that puts it 4,000 light years
  from the camera at a viewport of 1,080 CSS rows and counts the pixels of the row through
  its centre, then sets the viewport to 400 CSS rows and counts again
- **THEN** the two counts are the same within 1, and each is 9 within 1

#### Scenario: The size curve is continuous

- **WHEN** a unit test reads the size rule at 1,000 ranges spaced evenly in the logarithm
  from 1 to 200,000 light years
- **THEN** no two neighbouring readings differ by more than 0.05 CSS pixels, the reading
  never rises as the range grows, the largest reading is 16 and the smallest is 7

#### Scenario: The page reports the marker count

- **WHEN** the browser test reads the marker count with an empty set, adds 100 systems
  around Sol at a view that shows them all, draws a frame and reads the count again, then
  switches the systems pass off, draws again and reads it a third time
- **THEN** the readings are 0, 100 and 0

#### Scenario: The colour follows the category and not the position

- **WHEN** the browser test adds one category, then one system at Sol and one at the
  galactic centre, whose population zones differ, and reads the middle pixel of each
  marker at the same range; then adds a second category of another colour, replaces the
  record at Sol with one that names it, and reads the two pixels again
- **THEN** the first two pixels hold the same colour, and the second two hold the colour
  of each system's own category

#### Scenario: A recoloured category recolours its markers

- **WHEN** the browser test adds one category of the colour (153, 230, 255) and one
  system, reads the middle pixel of the marker, then adds a category of the same name and
  the colour (255, 40, 40), draws a frame and reads the pixel again
- **THEN** the first reading is (153, 230, 255) and the second is (255, 40, 40), each
  within 2 per channel, and the system count does not change


### Requirement: The marker pass draws over the finished frame

The marker pass SHALL draw after the tone map and after the region boundary overlay, and
SHALL blend over the frame with alpha. It SHALL use no depth test. No other pass can
then cover a marker, and a marker adds no light the tone map reads.

The pass SHALL draw the markers in the order the set holds them, so two markers that
overlap blend in a fixed order.

#### Scenario: A region boundary does not cover a marker

- **WHEN** the browser test places one system on a region boundary, opens a view at
  20,000 light years where the overlay draws in full, and reads the middle pixel of the
  marker
- **THEN** the pixel holds the marker's core colour, not the boundary's colour

#### Scenario: Two markers overlap in the order the set holds them

- **WHEN** the browser test adds two categories, each with the `markerStyle` `disc`, adds
  two systems 1 light year apart at a range that makes their discs overlap, reads the
  frame, then calls `clearSystems` and adds the same two records in the other order and
  reads the frame again
- **THEN** the overlap holds the second record's marker on top in each frame, so the two
  frames differ

  Both categories take the `disc` style, because the test reads a pixel 1.25 CSS pixels
  from a marker centre and asserts one category colour there. A `disc` is opaque that far
  inside its edge; a `glow` is not, so under the default style the pixel would hold a
  blend of the two colours and the reading would have no single right answer

#### Scenario: The far view does not change

- **WHEN** the browser test renders the default view at 1280x720 with no system in the
  set, and again with the marker pass switched off
- **THEN** the two image files are byte-identical, and the frame still matches the
  committed baseline image with at most 2 percent of pixels differing



### Requirement: A marker's drawn position is exact

The renderer SHALL subtract the camera position from each system position in `float64`
on the CPU each frame, and SHALL give the shader the offset as a `float32`. The drawn
position of a marker SHALL be within 0.01 light years of the position the same
subtraction gives in `float64`, at every cursor inside the model bounds and every zoom
distance.

The galaxy spans under 125,000 light years, and a `float32` holds a number of that size
to better than 0.008 light years, so the bound holds for every system in the set and not
only for the near ones.

#### Scenario: Position error at the far corner

- **WHEN** a unit test places the cursor at (50,000, 0, 75,000) and at Sol, at zoom
  distances 500, 20,000 and 120,000 light years, and pushes 1,000 system positions
  spread over the model bounds through a `float32` emulation of the vertex transform
- **THEN** every drawn position is within 0.01 light years of the `float64` result



### Requirement: The marker pass has a switch

The renderer SHALL expose a `systems` switch beside the switches for the volume, the
clouds, the points, the stars, the glow and the regions. With the switch off the pass
SHALL draw nothing.

#### Scenario: The switch removes the markers

- **WHEN** the browser test adds 100 systems around Sol, opens `#c=0,0,0&d=4000&p=35&y=0`
  and reads the frame, then switches the systems off and reads it again
- **THEN** the two frames differ with the switch on, and the frame with the switch off is
  byte-identical to the frame the page draws with an empty set



### Requirement: Frame budget with a full set

At 1920x1080 on the dev container's GPU, with 10,000 systems in the set, the mean render
time over 300 consecutive frames SHALL stay under 16.7 ms at zoom distances of 10, 500,
4,000, 20,000 and 120,000 light years, with the cursor at Sol and at the galactic centre.

The 10 light year view is the closest zoom. It is the most costly of the five for the
marker pass, because at that zoom a marker at the cursor is at its 40 CSS pixel glow cap
and every marker inside its category's range fills the sprite the size curve gives it, so
the pass writes the largest number of fragments it ever writes.

The cap moves from 30 to 40 CSS pixels with this change, which is 1.78 times the fragments
of the worst case the budget held before. That is the reading this requirement exists to
take again.

The pass rebases 10,000 positions every frame, which is 30,000 `float64` subtractions and
one buffer write of 120 KB. The measurement SHALL use the same function the far view's
frame budget uses, so it holds that CPU work and the GPU work together.

#### Scenario: Eight views under budget with 10,000 systems

- **WHEN** the browser test adds 10,000 systems spread over the model bounds, sets each
  of the eight views at 500, 4,000, 20,000 and 120,000 light years, and calls the
  measurement function for 300 frames
- **THEN** each returned mean is under 16.7 ms

#### Scenario: The closest zoom is under budget with 10,000 systems

- **WHEN** the browser test adds 10,000 systems spread over the model bounds, sets the two
  views at 10 light years, one with the cursor at Sol and one at the galactic centre, and
  calls the measurement function for 300 frames
- **THEN** each returned mean is under 16.7 ms

#### Scenario: The closest zoom is under budget with every marker in range

- **WHEN** the browser test adds 10,000 systems of one category whose `maxDrawRange` is
  300,000 light years, all within 10 light years of Sol, sets the view at 10 light years
  with the cursor at Sol, and calls the measurement function for 300 frames
- **THEN** the returned mean is under 16.7 ms. The camera sits 10 light years from the
  cursor and the set lies inside a ball of 10 light years, so a range runs from 0 to 20 and
  a sprite runs from the 40 CSS pixel cap down to 35.7. Part of the set falls outside the
  frustum at that zoom, so this scenario measures the largest sprites and not the largest
  number of them. The other half, all 10,000 sprites forced to the cap together, which
  writes 16 million fragments over a frame of 2 million pixels, was measured once before
  the curve was written, to decide whether the cap of 16 could stand. That reading is in
  `docs/roadmap.md` and no test holds it. The old rule reached its 30 CSS pixel cap at a range of
  about 1,560 light years, so the old worst case put the systems within 10,000 light years
  of Sol


### Requirement: A marker draws in one of two styles

A category SHALL choose the style its markers draw in, through its `markerStyle` field.
There SHALL be exactly two styles, `glow` and `disc`. A category that names no style
SHALL draw `glow`.

**`glow`** SHALL draw a soft halo with four spikes and no ring. Over the sprite, with `r`
the distance from the centre in CSS pixels and `R` the sprite radius in CSS pixels:

- The colour SHALL be the category colour at every point of the sprite. The shape comes
  from the alpha alone, so a category colour reaches the frame unmixed at the centre.
- The halo term SHALL be `0.85 * (1 - r / R)^3`.
- The core term SHALL be `clamp((2.5 - r) / 1.5, 0, 1)`, which is 1 for `r` at or below
  1.0 CSS pixels and 0 from 2.5 outward. The opaque middle is what lets a test read the
  category colour as it is. The plateau is 1.0 CSS pixel because a sprite centre does not
  sit on a pixel centre: at a device pixel ratio of 1 the nearest pixel centre can lie
  0.71 CSS pixels from it, and the plateau has to cover that.
- Four spikes SHALL add, one along each of the sprite's two axes in each direction. The
  spike along an axis SHALL add
  `0.55 * max(0, 1 - p / 1.0) * max(0, 1 - a / R)^2`, where `a` is the distance from the
  centre along that axis and `p` is the distance from the axis, both in CSS pixels.
- The alpha SHALL be `min(1, spikes + max(core, halo))`.

The core is the larger of two terms and not a separate opaque disc, so the alpha falls
from 1 to the halo without a step. An opaque disc joined to a halo of `0.85 * (1 - r/R)^3`
would drop from 1.00 to 0.65 at the cap size and to 0.54 at the floor size in one device
pixel, which draws a hard-edged 2.5 CSS pixel disc inside the glow. The scenario "The glow
alpha has no step" is what holds this, because a test that only reads the frame outward
cannot tell a step from a steep fall.

The renderer SHALL expose the alpha rule as a function the unit tests read, as it exposes
the star brightness rule of `close-view-stars` today, so the rule is measured at its own
resolution and not at the resolution of a screenshot.

**`disc`** SHALL draw the marker the map draws today: a disc opaque inside its edge, with
the category colour in the core and the fixed ring colour (0.02, 0.04, 0.10) over the
outer 2 CSS pixels, and an antialiasing ramp in the outer 1 device pixel alone. A ring of
a fixed pixel width rather than a fixed fraction of the disc keeps the dark edge readable
at the floor size. The ring is fixed and dark, so the disc holds a readable edge over the
cream core of the galaxy and over dark space alike, whatever colour a category gives its
core.

`glow` is the default because it reads as a star. `disc` reads as a highlight, and a host
uses it for the one category it wants the user to pick out of the rest.

Both styles SHALL draw in the same pass and in the same draw call, so a set that mixes
the two costs no more calls than a set that uses one.

#### Scenario: The default style is the glow

- **WHEN** a unit test adds one category with no `markerStyle` and reads the style the
  table holds
- **THEN** it is `glow`

#### Scenario: The glow holds the category colour at its centre

- **WHEN** the browser test adds one category of the colour (153, 230, 255) with no
  `markerStyle`, adds one system at a view over dark space, and reads the middle pixel of
  the marker at a device pixel ratio of 1
- **THEN** the pixel is (153, 230, 255) within 2 per channel

A reading of the glow SHALL be the luminance the marker pass adds, which is the frame
drawn with the pass on less the frame drawn with it off. The composite writes about 9 of
255 over empty space, so a reading of the frame itself is the alpha of the glow over that
floor and not the alpha. A reading of the difference is the alpha times the colour of the
category, which is what the rule predicts.

A reading SHALL take a pixel by its index and not by the projection of the system. The
sprite centre has to sit on a pixel centre, or every sample lies half a pixel off the
spike it reads, so the browser tests of the glow take a viewport of an odd width and an
odd height: the middle of the screen is then the centre of one pixel.

#### Scenario: The glow has spikes

- **WHEN** the browser test draws one glow marker of the category colour (255, 255, 255)
  over dark space at the cap size, and reads the luminance the pass adds 8 pixels along the
  sprite's horizontal axis, 8 pixels along its vertical axis, 6 pixels along each axis,
  which is the same radius on the 45 degree diagonal, and 50 pixels out, which is past the
  sprite
- **THEN** the horizontal reading and the vertical reading are each at least 0.1 above the
  diagonal reading, and the reading past the sprite is 0. A white category makes the added
  luminance the alpha, so the rule predicts the readings: at 8 of the 20 pixel radius the
  spike adds `0.55 * (1 - 8/20)^2`, which is 0.198, over a halo of `0.85 * (1 - 8/20)^3`,
  which is 0.184, while the diagonal at 8.49 pixels is past the spike's 1.0 CSS pixel
  half-width and holds the halo alone, which is 0.162

#### Scenario: The glow has no ring

- **WHEN** the browser test draws one glow marker over dark space and reads the luminance
  the pass adds along the 45 degree diagonal at every device pixel from the centre to the
  sprite edge
- **THEN** the readings never rise as the distance grows, and the last reading inside the
  sprite is below 0.02

#### Scenario: The glow alpha has no step

- **WHEN** a unit test reads the glow alpha rule off the spike axes at 1,000 equal steps
  from the centre to the sprite edge, at the floor radius and at the cap radius
- **THEN** the alpha is 1 at the centre, it never rises as the distance grows, and no two
  neighbouring readings differ by more than 0.05. The core term falls at 1/1.5 per CSS
  pixel, so a step of a thousandth of the radius moves the alpha by at most 0.006. An
  opaque core joined straight to the halo fails this: its one step is 0.35 at the cap
  radius and 0.46 at the floor radius

#### Scenario: The glow fits the card's point size

- **WHEN** a unit test reads the sprite size the pass asks for at a device pixel ratio of
  1, 2 and 3 at the cap, and compares each with the maximum of
  `ALIASED_POINT_SIZE_RANGE`
- **THEN** every size the pass asks for is at or below that maximum, and where the card's
  maximum is smaller the pass asks for the card's maximum instead. At a device pixel ratio
  of 3 a 40 CSS pixel glow asks for 120 device pixels, which is the largest sprite the map
  draws

#### Scenario: The glow sprite is 2.5 times the disc

- **WHEN** the browser test adds two categories of the colour (255, 255, 255), one `glow`
  and one `disc`, adds one system of each at a range that puts both at the cap size, and
  counts the pixels of the row through each marker's centre that differ from the frame
  drawn with the pass off, at a device pixel ratio of 1
- **THEN** the glow count is between 2.0 and 2.7 times the disc count.

  The count is not the sprite diameter, because a glow has no edge. The row through the
  centre is a spike axis, where the alpha is
  `0.55 * (1 - a/R)^2 + 0.85 * (1 - a/R)^3`, and over dark space a channel of 255 changes
  by one 8-bit step only while that alpha is above 1/510. It falls under that at 0.94 of
  the radius, so a 40 CSS pixel glow counts about 38 pixels against a 16 pixel disc, which
  is 2.35. The bounds are wider than that figure because each of the two counts carries
  one pixel of rasterisation either way, and 39/15 is 2.60 while 37/17 is 2.18. The colour
  is pinned because a category whose brightest channel is well below 255 crosses the 8-bit
  floor sooner and counts fewer pixels.

  The cap size is now a range of 10 light years or less, so the test puts the camera on
  the two systems at the closest zoom. The old cap held from a range of about 1,560 light
  years inward at 1,080 CSS rows

#### Scenario: The two styles draw in one call

- **WHEN** a unit test draws the marker pass on a recording context with 100 systems of a
  `glow` category and 100 of a `disc` category in the set
- **THEN** the context recorded exactly one `drawArrays` call, and its count is 200

#### Scenario: A restyled category restyles its markers

- **WHEN** the browser test adds one `disc` category of the colour (255, 255, 255) and one
  system at a range that puts the marker at the cap size, reads the middle pixel and the
  row width of the marker, then adds a category of the same name with the `markerStyle`
  `glow`, draws a frame and reads both again
- **THEN** the row width grows by a factor between 2.0 and 2.7, and the system count does
  not change. The bounds are the ones the scenario above gives, and for the same reason


### Requirement: A category limits the range its markers draw at

A category SHALL carry a `maxDrawRange` in light years. A marker SHALL draw only while
the distance from the camera to **its own system** is at or below that range, and SHALL
draw nothing above it. The range is the camera-to-system distance and not the zoom
distance, so one frame can hold the near markers of a category and drop its far ones.

A category that names no `maxDrawRange` SHALL take **120,000** light years.

The default cuts markers in a far view, and it cuts them inside the drawn disc and not
only past its rim. The galaxy spans about 125,000 light years and the camera sits up to
120,000 light years from the cursor, so the camera-to-system range reaches 283,429 light
years: the bounds diagonal of 163,429 plus the 120,000 the camera can stand off. At the
default view, which puts the camera at (0, 34,415, -49,149), the 120,000 light year cut
falls at 39,915 light years of galactocentric radius on the far side of the centre. The
disc carries stars out to about 47,000, and its far rim sits about 126,800 light years from
that camera, so the default removes the markers of a band of the outer disc that the frame
still draws. A host that wants every marker in every view sets a larger `maxDrawRange` on
each of its categories; 283,500 cuts nothing anywhere.

The cut SHALL NOT change the colour, the size or the style of a marker that draws, and
SHALL NOT fade a marker as it nears the range: a marker draws in full or not at all. A
fade would make a category look dimmer with depth, which is what the category colour is
there to avoid.

The count the page reports SHALL be the number of markers the frame drew, so a view that
cuts markers reports fewer than the set holds.

#### Scenario: The default range is 120,000

- **WHEN** a unit test adds one category with no `maxDrawRange` and reads the range the
  table holds
- **THEN** it is 120,000

#### Scenario: A marker outside its range does not draw

- **WHEN** the browser test adds one category with `maxDrawRange` 2,000, adds one system
  at Sol, opens a view whose camera is 1,500 light years from Sol and reads the pixel at
  the system's projection, then opens a view whose camera is 2,500 light years from Sol
  and reads it again
- **THEN** the first pixel differs from the frame drawn with the pass off and the second
  is the same as it

#### Scenario: The range follows each system and not the zoom

- **WHEN** the browser test adds one category with `maxDrawRange` 3,000 and two systems of
  it, one 1,000 light years from the camera and one 5,000, in one frame, and reads the
  pixel at each projection
- **THEN** the near marker draws and the far one does not, and the reported marker count
  is 1

#### Scenario: The cut does not fade

- **WHEN** the browser test adds one category with `maxDrawRange` 5,000 and one system,
  and reads the middle pixel of its marker at camera ranges of 1,000, 3,000 and 4,900
  light years, each at a view that puts the marker at the same place on the screen
- **THEN** the three readings hold the same colour within 2 per channel

#### Scenario: A changed range changes what draws

- **WHEN** the browser test adds one category with `maxDrawRange` 1,000 and 100 systems
  spread from 500 to 5,000 light years from the camera, reads the marker count, then adds
  a category of the same name with `maxDrawRange` 120,000 and reads the count again
- **THEN** the first count is below 100 and the second is 100

#### Scenario: Two categories cut at their own ranges in one frame

- **WHEN** the browser test adds a category with `maxDrawRange` 1,000 and one with
  120,000, adds one system of each 2,000 light years from the camera, and reads the pixel
  at each projection
- **THEN** the first system's marker does not draw and the second's does



### Requirement: A category can be turned off

The handle SHALL carry `setCategoryVisible(name, visible)` and `isCategoryVisible(name)`.
A category SHALL be on when the table takes it, so a host that never calls the setter sees
the map it sees today.

A marker SHALL draw and SHALL be picked when **any** category the system belongs to is
on, and SHALL NOT draw and SHALL NOT be picked when every one of them is off. The rule
reads the primary category and every secondary category together. The marker still takes
its colour and its style from the primary category alone.

The rule changed here. It read the primary category alone before, so turning one category
off hid a system that also belonged to a category the user had left on. A Guardian system
holding an Alpha ruin and a Beta ruin is one such system, and the demo set holds 166 of
them.

A call that names a category the table does not hold SHALL change nothing and SHALL NOT
throw. `isCategoryVisible` SHALL return `false` for such a name.

The sweep that rebuilds which markers draw SHALL run when the set, the category table,
the visibility or the filter changes, and SHALL NOT run per frame. It SHALL read each
system's categories once. With 10,000 systems each naming 4 categories, and every category
turned off in one call, the sweep SHALL cost less than **2 milliseconds** on the main
thread, and the page SHALL expose the reading so a test can read it.

A category replaced under the same name SHALL keep the visibility it had, because the
replacement changes the table entry and not what the user chose to look at.
`clearSystemsAndCategories` SHALL clear the visibility with the table.

The change SHALL reach the next frame with no rebuild of the scene data and no reupload of
the system positions.

#### Scenario: A category that is off draws no marker

- **WHEN** the browser test adds two categories and one system in each, at a view that
  shows both, reads the marker count, calls `setCategoryVisible` with the first category
  and `false`, draws a frame and reads the count and the pixel at each marker again
- **THEN** the first count is 2 and the second is 1, the pixel of the first marker matches
  the frame drawn with the systems pass off, and the pixel of the second does not

#### Scenario: A secondary category keeps a marker on the screen

- **WHEN** the browser test adds the categories `A` and `B` and one system whose primary
  category is `A` and whose secondary categories hold `B`, turns `A` off, draws a frame and
  reads the marker count and `systemAt` at the pixel it projects to, then turns `B` off as
  well, draws and reads both again
- **THEN** the first reading is 1 and names the system, and the second reading is 0 and
  null

#### Scenario: A hidden category is not picked

- **WHEN** the browser test adds one category and one system in it alone, turns the
  category off, draws a frame, and calls `systemAt` at the pixel the system projects to
- **THEN** the reading is null

#### Scenario: The colour still follows the primary category

- **WHEN** the browser test adds a red category `A` and a blue category `B`, one system
  whose primary category is `B` and whose secondary categories hold `A`, turns `B` off so
  the marker draws through `A` alone, draws a frame and reads the marker's pixel
- **THEN** the pixel is the blue of `B`

#### Scenario: The sweep holds its budget

- **WHEN** the browser test adds 10,000 systems over 8 categories, each system naming 4 of
  them, then calls `setCategoryVisible` with `false` for every category in turn and reads
  the sweep time
- **THEN** no sweep took more than 2 milliseconds

#### Scenario: A replaced category keeps its visibility

- **WHEN** a unit test adds a category, turns it off, adds a category of the same name
  and another colour, and reads `isCategoryVisible`
- **THEN** the reading is `false`

#### Scenario: An unknown name changes nothing

- **WHEN** a unit test calls `setCategoryVisible('nothing', false)` on a map whose table
  holds one other category, then reads `isCategoryVisible('nothing')` and
  `isCategoryVisible` of the category it does hold
- **THEN** the call does not throw, the first reading is `false` and the second is `true`

### Requirement: A name filter hides the markers that do not match

The handle SHALL carry `setNameFilter(text)` and `getNameFilter()`. The filter SHALL be
empty when the map starts, and an empty filter SHALL keep every marker.

A marker SHALL draw only when its system's name holds the filter text, compared without
case. The comparison SHALL fold case with the same rule in every browser, which is a lower
case fold of both strings. A marker the filter drops SHALL NOT be picked.

`setNameFilter` SHALL walk the set once and SHALL NOT rebuild the scene data. The set
holds at most 10,000 names, so one call is one pass over at most 10,000 strings. The HUD
calls it at most once per 150 ms while the user types, which `map-hud` states.

`clearSystems` SHALL NOT clear the filter, because the filter is what the user asked to
see and not part of the data.

#### Scenario: The filter cuts the markers and the count

- **WHEN** the browser test adds one category and three systems named `Sol`, `Solati` and
  `Achenar` at a view that shows all three, reads the marker count, calls
  `setNameFilter('sol')`, draws a frame and reads the count, then calls
  `setNameFilter('')`, draws and reads again
- **THEN** the three readings are 3, 2 and 3

#### Scenario: The filter folds case

- **WHEN** a unit test adds a system named `Achenar` and calls `setNameFilter` with
  `ACHE`, then `ache`, then `AcHe`
- **THEN** the system is kept by all three

#### Scenario: A filtered marker is not picked

- **WHEN** the browser test adds one system named `Sol`, draws a frame, calls `systemAt`
  at the pixel it projects to, sets the filter to `zzz`, draws again and calls `systemAt`
  at the same pixel
- **THEN** the first reading names `Sol` and the second is null

### Requirement: The entry point shows a loading image while the map starts

`GalaxyMapOptions` SHALL take an optional `loadingImage`, the URL of a picture the map
shows while it starts.

The library SHALL create the element in the canvas's parent, as it creates the label
overlay when the options name no `labelHost`. It SHALL place the picture at the **centre
of the canvas's box**, within 1 CSS pixel on each axis, and SHALL keep it there when the
canvas resizes. It SHALL sit above the canvas and below the HUD, and SHALL take no
pointer input, so a drag that starts on it still orbits the camera.

The library SHALL set no width, no height and no fit on the element, so the picture
SHALL keep **the size its own file names** and SHALL NOT follow the canvas or the window.
The host chooses the size in the file it names.

The file SHALL name that size in a form an `<img>` element reads, which for an SVG is the
`width` and the `height` attribute of the root element. A size in the file's own CSS is
not read: a file that names one has no size of its own, and the browser then grows the
picture with the box that holds it.

The picture SHALL show from the call until `ready` settles, and the library SHALL remove
the element then, whether `ready` resolved or failed. A map built with no `loadingImage`
SHALL add no such element.

The URL SHALL be read by the rule the record images already use: a relative URL passes,
`http` and `https` pass, and every other scheme is refused and adds no element. The
library SHALL NOT fetch the picture; the browser loads it from the element. A picture that
does not load SHALL leave no broken image icon and SHALL NOT stop the map.

`dispose()` SHALL remove the element when it is still on the page.

The picture covers the map's start alone. A later `loadDataset` SHALL NOT bring it back:
`dataset-catalog` states that the dataset field shows a load in progress.

**The demo site SHALL serve the loader from its own origin.** The repository holds
`public/EDLoader1.svg`, which is the ED Assets loader
`https://edassets.org/static/img/svg/EDLoader1.svg`, and the demo page SHALL name that
file. The build serves `public/` at the site's own base path, so the page fetches the
picture from itself.

The picture SHALL NOT be fetched from another host. `map-hud` holds that the browser suite
reaches no host but the page's own, and the suite now serves the demo site, so a remote
loader would break that rule on every page load and would put the suite behind another
project's uptime.

The repository's copy SHALL carry `width="170"` and `height="170"` on its root element.
The file from ED Assets names its size as `style="height:170px"` alone, which gives the
picture no size of its own. `THIRD_PARTY_NOTICES.md` SHALL record this one change with the
file, its source and its terms. ED Assets states
no licence on the file, which the notice already records for the selection pin; for the
loader the project holds a copy, and the notice SHALL say so plainly rather than leave the
reader to find it.

#### Scenario: The picture shows and then goes

- **WHEN** a browser test builds a map with a `loadingImage`, reads the canvas's parent
  before `ready` settles, waits for `ready`, and reads it again
- **THEN** the first reading holds an image element whose source is that URL, and the
  second holds none

#### Scenario: The picture sits in the centre

- **WHEN** a browser test builds a map with a `loadingImage` in a canvas of 1280 by 720,
  and reads the picture's box and the canvas's box before `ready` settles
- **THEN** the two centres are within 1 CSS pixel on each axis

#### Scenario: The picture keeps the size its file names

- **WHEN** a browser test builds a map with the demo loader as its `loadingImage` in a
  window of 1280 by 720, reads the picture's box before `ready` settles, makes the window
  700 by 500, and reads a second map's picture
- **THEN** both boxes measure 170 by 170 CSS pixels, which is the size `EDLoader1.svg`
  names

#### Scenario: A failed start still removes the picture

- **WHEN** a browser test builds a map with a `loadingImage` on a canvas whose context
  cannot be made, catches the `ready` failure, and reads the canvas's parent
- **THEN** the parent holds no image element and the failure is the one `ready` reports

#### Scenario: An unsafe URL adds no element

- **WHEN** a browser test builds a map with a `loadingImage` of
  `javascript:alert(1)` and reads the canvas's parent
- **THEN** the parent holds no image element

#### Scenario: The demo site's loader is on its own origin

- **WHEN** a browser test opens the built demo site with every request to another host
  blocked and recorded, reads the `src` the image element resolved to before `ready`
  settles, and a unit test reads the built `dist-demo/` for the file
- **THEN** the resolved `src` starts with `/Elite-Dangerous-Galaxy-Map/`, the file is in the
  demo site build, and no request was blocked.

  The reading is of the resolved `src` and not of the page source, because the page builds
  the URL from `import.meta.env.BASE_URL` and the base path is only there after the build

#### Scenario: No option adds no element

- **WHEN** a browser test builds a map with no `loadingImage` and reads the canvas's
  parent before `ready` settles
- **THEN** the parent holds no image element
