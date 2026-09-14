## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: The entry point shows a loading image while the map starts

`GalaxyMapOptions` SHALL take an optional `loadingImage`, the URL of a picture the map
shows while it starts.

The library SHALL create the element in the canvas's parent, as it creates the label
overlay when the options name no `labelHost`. It SHALL place the picture at the **centre
of the canvas's box**, within 1 CSS pixel on each axis, and SHALL keep it there when the
canvas resizes. It SHALL sit above the canvas and below the HUD, and SHALL take no
pointer input, so a drag that starts on it still orbits the camera.

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

`THIRD_PARTY_NOTICES.md` SHALL record the file, its source and its terms. ED Assets states
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
