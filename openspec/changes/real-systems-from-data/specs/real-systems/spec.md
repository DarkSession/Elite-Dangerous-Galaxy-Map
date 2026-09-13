## Purpose

Lets a host application put real star systems on the map. The host creates the map with
one call and adds records with another. The map validates each record, draws a marker
for each system it keeps, and removes the invented star that stands for the same system.

## ADDED Requirements

### Requirement: The map is created through a library entry point

The map SHALL expose `createGalaxyMap(canvas, options)`. The call SHALL return a handle
in the same tick, before the scene data is ready. `options` SHALL be optional, and SHALL
carry an optional `labelHost` element for the region label overlay. With no `labelHost`
the library SHALL create its own overlay element in the canvas's parent, so a host that
gives a canvas alone gets a working map. The library SHALL NOT read an element by id.

The handle SHALL carry these members:

| Member                 | What it does                                              |
| ---------------------- | --------------------------------------------------------- |
| `addSystems(records)`  | Reads records into the set and returns the report          |
| `clearSystems()`       | Empties the set                                            |
| `systemCount()`        | How many systems the set holds                             |
| `ready`                | A promise that settles when the map starts, or fails       |
| `dispose()`            | Stops the map and releases what it holds                   |
| `getView()`            | Reads the current view                                     |
| `setView(view)`        | Replaces part or all of the current view                   |
| `onViewChange(fn)`     | Calls `fn` after the view changes, and returns an unsubscribe |
| `debug`                | The renderer hooks the browser tests read                  |

`ready` SHALL resolve after the map draws its first frame. `addSystems` and
`clearSystems` SHALL work before and after that frame, and a system added before the
first frame SHALL draw in it.

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

`debug` SHALL carry `frameStats()`, which returns the number of frames the loop drew
since the last reset with their mean and worst draw time in milliseconds, and
`resetFrameStats()`, which starts the count again. The existing `measureFrames` redraws
one fixed view and returns a mean, so it cannot measure a pan, a zoom or a worst frame;
`frameStats` measures the frames the loop itself draws, as `labelSampling` already does
for the label sweep.

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

### Requirement: A record follows the shape of an EDSM or a Spansh dump

A record SHALL carry a `name` that is a string of at least one character, and a `coords`
object whose `x`, `y` and `z` are finite numbers. The position is in game coordinates in
light years.

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

- **WHEN** a unit test adds one EDSM record, which carries `id64`, `name`, `coords` and
  `date`, and one Spansh record, which carries those fields and `allegiance`,
  `government`, `primaryEconomy`, `security`, `population`, `bodyCount`, `bodies` and
  `stations`
- **THEN** both are accepted, the kept fields hold the values the records gave, and
  neither `date` nor `bodies` nor `stations` is held

#### Scenario: A large id64 keeps every digit

- **WHEN** a unit test adds a record whose `id64` is the string `2871051900826` and one
  whose `id64` is the bigint `18262930337633`
- **THEN** the reader holds `"2871051900826"` and `"18262930337633"`

### Requirement: The reader reports every record it rejects

`addSystems` SHALL return a report of `added`, `replaced` and `rejected`. Each rejected
entry SHALL carry the index of the record in the call and one reason from this set:
`no-name`, `no-coords`, `out-of-bounds`, `over-capacity`.

A record whose position lies outside the galaxy model bounds SHALL be rejected as
`out-of-bounds`. The bounds are the volume the map draws, so a record outside them could
never show. The reader SHALL reject a bad record and SHALL keep reading the rest of the
call.

#### Scenario: Each fault gets its own reason

- **WHEN** a unit test adds five records: one valid, one with an empty name, one with no
  `coords`, one whose `coords.x` is `NaN`, and one at (0, 0, 900,000)
- **THEN** `added` is 1, and `rejected` holds `no-name` at index 1, `no-coords` at
  index 2, `no-coords` at index 3 and `out-of-bounds` at index 4

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

#### Scenario: The bound rejects the excess

- **WHEN** a unit test adds 9,998 systems, then adds 5 more with new identities, then
  calls `clearSystems` and adds 10,000
- **THEN** the second call reports `added` 2 and 3 entries of `over-capacity`, and the
  third call reports `added` 10,000 and no rejection

### Requirement: The set holds positions in float64

The system set SHALL hold positions as one `Float64Array` of three game coordinates per
system, in the order the records were added, and the record fields as plain objects and
strings.

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
the core colour. The core colour SHALL be (0.60, 0.90, 1.00) and the ring colour SHALL be
(0.02, 0.04, 0.10). The disc SHALL be opaque inside its edge, with an antialiasing ramp
in the outer 1 device pixel alone, so at a device pixel ratio of 1 the inner CSS pixel of
the ring is opaque and a test can read the ring colour as it is. A ring of a fixed pixel
width rather than a fixed fraction of the disc keeps the dark edge readable at the floor
size. A light core with a dark ring reads over the cream core of the galaxy and over dark
space alike.

The colour SHALL NOT follow the population zone ramp that the decoration stars and the
point cloud use, so a real system reads as different from an invented star.

The page SHALL expose the number of markers the last frame drew.

#### Scenario: A marker shows at every zoom distance

- **WHEN** the browser test adds one system at (0, 0, 6,000), then opens the view
  `#c=0,0,6000&d=500&p=35&y=0` and the same cursor at 4,000, 20,000 and 120,000 light
  years, and reads the pixel at the projection of the system with the pass on and with
  it off
- **THEN** the two readings differ at every one of the four distances

#### Scenario: The marker colours reach the frame over both grounds

- **WHEN** the browser test adds one system at the galactic centre, which is the
  brightest ground, and one 3,000 light years above the plane at the rim, which is the
  darkest, opens a view that shows each at a range above 3,000 light years, and reads the
  middle pixel of each marker and the pixel 2 CSS pixels inside each marker's edge on the
  row through its centre, at a device pixel ratio of 1
- **THEN** every middle pixel is (153, 230, 255) within 2 per channel, and every ring
  pixel is (5, 10, 26) within 2 per channel

#### Scenario: The size falls to the floor and rises to the cap

- **WHEN** the browser test adds one system, opens a view at 120,000 light years and
  counts the pixels of the row through the marker's centre that differ from the frame
  drawn with the pass off, then opens a view that puts the system 1,000 light years from
  the camera and counts again
- **THEN** the first count is 7 within 1 and the second is 12 within 1, at a device pixel
  ratio of 1. The tolerance is one pixel, because a disc that does not sit on a pixel
  centre covers one more or one fewer pixel on its row

#### Scenario: The page reports the marker count

- **WHEN** the browser test reads the marker count with an empty set, adds 100 systems
  around Sol at a view that shows them all, draws a frame and reads the count again, then
  switches the systems pass off, draws again and reads it a third time
- **THEN** the readings are 0, 100 and 0

#### Scenario: The marker colour is not the zone ramp

- **WHEN** the browser test adds one system at Sol and one at the galactic centre, whose
  population zones differ, and reads the middle pixel of each marker at the same range
- **THEN** the two pixels hold the same colour

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
