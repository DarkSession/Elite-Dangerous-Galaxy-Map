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
carry an optional `labelHost` element for the region label overlay. With no `labelHost`
the library SHALL create its own overlay element in the canvas's parent, so a host that
gives a canvas alone gets a working map. The library SHALL NOT read an element by id.

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
| `debug`                       | The renderer hooks the browser tests read                     |

`ready` SHALL resolve after the map draws its first frame. `addCategories`, `addSystems`,
`clearSystems` and `clearSystemsAndCategories` SHALL work before and after that frame, and
a system added before the first frame SHALL draw in it.

The library SHALL own the render context, the scene data, the view state, the controls,
the label overlay and the frame loop. The library SHALL NOT read or write
`window.location`, and an ESLint rule SHALL fail the lint on `window.location` in every
source file outside `src/app/main.ts`. A lint rule is what holds the boundary, because
the production build puts the page and the library in one bundle, where a search of the
served source cannot tell them apart. The project already holds its scene-data import
rule this way.

The page owns the URL fragment: it parses the fragment, gives the view to `setView`, and
writes the fragment back from `onViewChange`. The requirement "View state in the URL
fragment" of `map-navigation` is then the page's to meet, and it is unchanged.

`debug` is not part of the supported surface. It carries the pass switches, the pixel
readers, the frame measurement, the counts and the program probe. Phase 4 may change it.

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

The demo page SHALL call the entry point, SHALL put the handle on `window.galaxyMap`,
and SHALL keep every `window.__galaxyMap` hook the browser tests read today, including
`renderer`, which carries the hardware assertion.

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
string the phase 4 HUD shows. The reader SHALL drop every other field.

The identity of a category is its `name`. A category whose name is already in the table
SHALL replace the one that holds it, and every system that names it SHALL take the new
colour in the next frame. A replace SHALL replace the whole category, so a description
the old one carried and the new one does not is gone.

No call SHALL remove one category. `clearSystemsAndCategories` SHALL empty the table, and
it SHALL empty the system set in the same call. A system in the set can then never name a
category the table does not hold: a category leaves only with every system that could name
it. A host that loads a new data set calls `clearSystemsAndCategories` and then its two
add calls, in that order.

A replaced category SHALL keep the index it already holds in the table. The system set
holds one category index per system, so an index that moved would point every system that
names the category at another category's colour.

A `description` that is present and is not a string SHALL be dropped, as an optional
field of the wrong type is dropped from a record.

A replacement SHALL work on a full table, because it adds no category. The capacity bound
rejects a category that would grow the table, and never one that replaces a category
already in it.

The table SHALL hold at most 256 categories. `addCategories` SHALL return a report of
`added`, `replaced` and `rejected`. Each rejected entry SHALL carry the index of the
category in the call and one reason from this set: `no-name`, `bad-color`,
`over-capacity`. A `color` that is not three finite numbers from 0 to 255 SHALL be
rejected as `bad-color`.

The host names its categories. The map reads a name, a colour and a description, and it
gives no category of its own, so a host that groups its systems by allegiance and a host
that groups them by star class both fit the same call.

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

- **WHEN** a unit test adds four categories: one valid, one with an empty name, one whose
  `color` holds two numbers, and one whose `color` holds a `NaN`
- **THEN** `added` is 1, and `rejected` holds `no-name` at index 1 and `bad-color` at
  index 2 and at index 3

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
not a string. A secondary category does not change how a marker draws; phase 4 reads it
in the HUD.

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

The reader SHALL store `id64` as a decimal string. A Spansh `id64` is a 64-bit integer,
and `JSON.parse` loses digits above 2^53, so a host that needs every digit passes a
string or a `bigint`.

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

### Requirement: A marker draws for every system at every zoom distance

The renderer SHALL draw one marker per system in the set, in one draw call, at every
zoom distance from 500 to 120,000 light years. There SHALL be no level of detail: the
pass draws the whole set in every frame.

A marker SHALL be a disc whose diameter in CSS pixels is `focalCss * 20 / range`, held
between a floor of 7 and a cap of 12, where `range` is the distance from the camera in
light years and `focalCss` is the CSS pixels per light year at one light year of range.
The renderer's own `focal` is in device pixels, because it comes from the drawing buffer
height, so `focalCss` is `focal` over the device pixel ratio and `gl_PointSize` is the
CSS diameter times that ratio. The floor is what makes a marker findable in the far view,
where the perspective size falls below one pixel. The cap stops a near marker from
covering the frame.

The outer 2 CSS pixels of the disc SHALL carry the ring colour and the rest SHALL carry
the core colour. The core colour SHALL be the `color` of the system's primary category,
divided by 255, and the ring colour SHALL be (0.02, 0.04, 0.10). The disc SHALL be opaque
inside its edge, with an antialiasing ramp in the outer 1 device pixel alone, so at a
device pixel ratio of 1 the inner CSS pixel of the ring is opaque and a test can read the
ring colour as it is. A ring of a fixed pixel width rather than a fixed fraction of the
disc keeps the dark edge readable at the floor size. The ring is fixed and dark, so the
disc holds a readable edge over the cream core of the galaxy and over dark space alike,
whatever colour a category gives its core.

A marker SHALL take the colour of its category as the category stands when the frame
draws. A category replaced under the same name SHALL therefore recolour every marker that
names it, and the set SHALL NOT copy the colour into the record.

The core colour SHALL NOT follow the population zone ramp that the decoration stars and
the point cloud use. Two systems of one primary category SHALL draw one core colour,
wherever they lie, and two systems of different categories SHALL draw the two colours the
categories give. The category colour is the first of the two things that separate a real
system from an invented star. The second is the close fade of `close-view-stars`, which
holds the invented field at no light below a zoom distance of 640 light years while a
marker draws at every zoom distance.

The page SHALL expose the number of markers the last frame drew.

#### Scenario: A marker shows at every zoom distance

- **WHEN** the browser test adds one system at (0, 0, 6,000), then opens the view
  `#c=0,0,6000&d=500&p=35&y=0` and the same cursor at 4,000, 20,000 and 120,000 light
  years, and reads the pixel at the projection of the system with the pass on and with
  it off
- **THEN** the two readings differ at every one of the four distances

#### Scenario: The marker colours reach the frame over both grounds

- **WHEN** the browser test adds one category of the colour (153, 230, 255), then one
  system at the galactic centre, which is the brightest ground, and one 3,000 light years
  above the plane at the rim, which is the darkest, opens a view that shows each at a
  range above 3,000 light years, and reads the middle pixel of each marker and, on the
  row through its centre, the ring pixel whose own centre lies between 1 and 2 CSS pixels
  inside the edge of the disc, at a device pixel ratio of 1
- **THEN** every middle pixel is (153, 230, 255) within 2 per channel, and every ring
  pixel is (5, 10, 26) within 2 per channel

#### Scenario: The size falls to the floor and rises to the cap

- **WHEN** the browser test adds one system, opens a view at 120,000 light years and
  counts the pixels of the row through the marker's centre that differ from the frame
  drawn with the pass off, then opens a view that puts the system 500 light years from
  the camera and counts again
- **THEN** the first count is 7 within 1 and the second is 12 within 1, at a device pixel
  ratio of 1. The tolerance is one pixel, because a disc that does not sit on a pixel
  centre covers one more or one fewer pixel on its row

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

- **WHEN** the browser test adds two systems 1 light year apart at a range that makes
  their discs overlap, reads the frame, then calls `clearSystems` and adds the same two
  records in the other order and reads the frame again
- **THEN** the overlap holds the second record's marker on top in each frame, so the two
  frames differ

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
time over 300 consecutive frames SHALL stay under 16.7 ms at zoom distances of 500,
4,000, 20,000 and 120,000 light years, with the cursor at Sol and at the galactic centre.

The pass rebases 10,000 positions every frame, which is 30,000 `float64` subtractions and
one buffer write of 120 KB. The measurement SHALL use the same function the far view's
frame budget uses, so it holds that CPU work and the GPU work together.

#### Scenario: Eight views under budget with 10,000 systems

- **WHEN** the browser test adds 10,000 systems spread over the model bounds, sets each
  of the eight views, and calls the measurement function for 300 frames
- **THEN** each returned mean is under 16.7 ms
