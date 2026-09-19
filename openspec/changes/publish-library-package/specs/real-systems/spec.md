## MODIFIED Requirements

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
  settles, and a unit test reads the built `apps/demo/dist/` for the file
- **THEN** the resolved `src` starts with `/Elite-Dangerous-Galaxy-Map/`, the file is in the
  demo site build, and no request was blocked.

  The reading is of the resolved `src` and not of the page source, because the page builds
  the URL from `import.meta.env.BASE_URL` and the base path is only there after the build

#### Scenario: No option adds no element

- **WHEN** a browser test builds a map with no `loadingImage` and reads the canvas's
  parent before `ready` settles
- **THEN** the parent holds no image element
