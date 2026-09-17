## MODIFIED Requirements

### Requirement: A category can be turned off

The handle SHALL carry `setCategoryVisible(name, visible)` and `isCategoryVisible(name)`.
A category SHALL be on when the table takes it, so a host that never calls the setter sees
the map it sees today.

A marker SHALL draw and SHALL be picked when **any** category the system belongs to is
on, and SHALL NOT draw and SHALL NOT be picked when every one of them is off. The rule
reads the primary category and every secondary category together.

**The marker SHALL take its colour, its style and its draw range from the first category
the record names that is on.** The order SHALL be the primary category first, then the
secondary categories in the order the record gave them, without a repeat. The reading is
therefore one category, and it is the first one of that order that the user has left on.

The rule changed here. The marker took all three from the primary category alone, even
when the user had turned the primary category off. A system that draws through a secondary
category then kept the colour of the row the user had just switched off, which says the
opposite of what the row says. The demo Guardian Ruins set holds **166** systems that name
two categories or more, so the fault is on the screen in the map the demo site opens with.

The drawn category SHALL follow the visibility in the next frame, with no rebuild of the
scene data and no reupload of the system positions. A system whose categories are all off
draws no marker, so it has no drawn category and the colour it would have taken never
reaches the frame.

A call that names a category the table does not hold SHALL change nothing and SHALL NOT
throw. `isCategoryVisible` SHALL return `false` for such a name.

The sweep that rebuilds which markers draw SHALL run when the set, the category table,
the visibility or the filter changes, and SHALL NOT run per frame. It SHALL read each
system's categories once, and it SHALL write the drawn category in that same read. With
10,000 systems each naming 4 categories, and every category turned off in one call, the
sweep SHALL cost less than **2 milliseconds** on the main thread, and the page SHALL expose
the reading so a test can read it.

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

#### Scenario: The colour follows the first category that is on

- **WHEN** the browser test adds a red category `A` and a blue category `B`, one system
  whose primary category is `B` and whose secondary categories hold `A`, reads the marker's
  pixel, then turns `B` off so the marker draws through `A` alone, draws a frame and reads
  the pixel again
- **THEN** the first reading is the blue of `B` and the second is the red of `A`

#### Scenario: The colour goes back when the category comes back on

- **WHEN** the browser test builds the same two categories and system, turns `B` off, draws
  and reads the pixel, turns `B` on again, draws and reads the pixel
- **THEN** the second reading is the blue of `B` again

#### Scenario: The order is the record's order

- **WHEN** the browser test adds the categories `A`, `B` and `C` in three colours and one
  system whose primary category is `A` and whose secondary categories are `C` then `B`,
  turns `A` off, draws and reads the marker's pixel, then turns `C` off as well, draws and
  reads it again
- **THEN** the first reading is the colour of `C` and the second is the colour of `B`,
  because the order is the record's order and not the table's

#### Scenario: The style and the range follow the drawn category

- **WHEN** the browser test adds a `glow` category `A` with a `maxDrawRange` of 200 and a
  `disc` category `B` with a `maxDrawRange` of 20,000, one system whose primary category is
  `A` and whose secondary categories hold `B`, opens a view 1,000 light years from the
  system, draws a frame and reads the marker count, then turns `A` off, draws and reads the
  count and the marker's pixel
- **THEN** the first count is 0, because `A` cuts the marker at 200 light years, and after
  the switch the count is 1 and the pixel reads the `disc` style of `B`

#### Scenario: The colour still follows the primary category

- **WHEN** the browser test adds a red category `A` and a blue category `B`, one system
  whose primary category is `B` and whose secondary categories hold `A`, keeps both
  categories on, draws a frame and reads the marker's pixel
- **THEN** the pixel is the blue of `B`, because the primary category is the first the
  record names and it is on

  The scenario asserted the pixel stayed blue **after `B` was turned off**. That is the
  behaviour this change replaces, so the scenario now reads the case the new rule leaves
  alone: with every category on, the first category the record names is the primary one and
  the colour is unchanged.

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

## REMOVED Requirements

### Requirement: The map is created through a library entry point

**Reason**: The handle table and the options list name the region mode, which this change
replaces with one switch, and the requirement's scenario "The region mode is on the handle
and not on `debug`" reads two members that no longer exist. A MODIFIED block replaces a
requirement but cannot drop one of its scenarios, so the rewrite is written as a removal and
an addition. The addition below, "The map is created through a library entry point that returns
a handle", carries every other rule of this one, with the two mode rows replaced and the nine
`map-shapes` rows added. The name changes because a removal and an addition cannot carry one
name, and the new name says what the requirement covers.

**Migration**: The same as `galactic-regions` states. `getRegionMode()` becomes
`areRegionsVisible()`, `setRegionMode(mode)` becomes `setRegionsVisible(mode !== 'off')`, and
the `regionMode` option becomes `regions`.

## ADDED Requirements

### Requirement: The map is created through a library entry point that returns a handle

The map SHALL expose `createGalaxyMap(canvas, options)`. The call SHALL return a handle
in the same tick, before the scene data is ready. `options` SHALL be optional, and SHALL
carry an optional `labelHost` element for the region label overlay, an optional
`regions`, which `galactic-regions` defines, an optional `shapes`, which `map-shapes`
defines, an optional `grid`, which
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
| `areRegionsVisible()`         | Reads whether the region overlay draws                        |
| `setRegionsVisible(on)`       | Turns the region overlay on or off                            |
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
| `addSpheres(spheres)`         | Reads spheres into the shape set and returns the report       |
| `addLines(lines)`             | Reads lines into the shape set and returns the report         |
| `clearShapes()`               | Empties the shape set                                         |
| `sphereCount()`               | How many spheres the shape set holds                          |
| `lineCount()`                 | How many lines the shape set holds                            |
| `getSphere(index)`            | Reads one sphere of the set, or null outside it               |
| `getLine(index)`              | Reads one line of the set, or null outside it                 |
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

`areRegionsVisible`, `setRegionsVisible`, `areShapesVisible` and `setShapesVisible` are on
the handle and not on `debug`, because each one is a setting a host chooses and not a
renderer probe. The `regions` pass switch and the `shapes` pass switch stay on `debug`.

The nine shape members are the whole shape surface, which `map-shapes` defines. A shape is
not in the category table, so no member of the category rows reaches one.

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
