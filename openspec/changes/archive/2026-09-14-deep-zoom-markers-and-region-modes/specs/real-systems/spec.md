## MODIFIED Requirements

### Requirement: The map is created through a library entry point

The map SHALL expose `createGalaxyMap(canvas, options)`. The call SHALL return a handle
in the same tick, before the scene data is ready. `options` SHALL be optional, and SHALL
carry an optional `labelHost` element for the region label overlay and an optional
`regionMode`, which `galactic-regions` defines. With no `labelHost`
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
| `getRegionMode()`             | Reads the region overlay mode                                 |
| `setRegionMode(mode)`         | Replaces the region overlay mode                              |
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

### Requirement: A marker draws for every system at every zoom distance

The renderer SHALL draw one marker per system in the set, in one draw call, at every
zoom distance from 10 to 120,000 light years, for every system the range rule below keeps.
There SHALL be no level of detail: the pass draws the whole set in every frame.

A marker's size SHALL follow one rule for both styles. The **disc diameter** in CSS pixels
is `focalCss * 20 / range`, held between a floor of 7 and a cap of 12, where `range` is
the distance from the camera in light years and `focalCss` is the CSS pixels per light
year at one light year of range. The renderer's own `focal` is in device pixels, because
it comes from the drawing buffer height, so `focalCss` is `focal` over the device pixel
ratio and `gl_PointSize` is the CSS diameter times that ratio. The floor is what makes a
marker findable in the far view, where the perspective size falls below one pixel. The cap
stops a near marker from covering the frame. A `glow` marker's sprite SHALL be **2.5 times
the disc diameter**, so the two styles grow together and stop together and one set of
constants sets both.

The pass SHALL hold the size it asks for at or below the card's maximum point size, which
`ALIASED_POINT_SIZE_RANGE` reports. A 30 CSS pixel glow at a device pixel ratio of 3 asks
for 90 device pixels, which is the largest sprite the map draws, so a card that reports
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
range rule kept and not the number the set holds.

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
  counts again
- **THEN** the first count is 7 within 1 and the second is 12 within 1, at a device pixel
  ratio of 1. The tolerance is one pixel, because a disc that does not sit on a pixel
  centre covers one more or one fewer pixel on its row. The category takes a range above
  the default because the system sits at the cursor, so at a zoom of 120,000 light years
  its camera range is 120,000 exactly, on the boundary of the default cut

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

### Requirement: Frame budget with a full set

At 1920x1080 on the dev container's GPU, with 10,000 systems in the set, the mean render
time over 300 consecutive frames SHALL stay under 16.7 ms at zoom distances of 10, 500,
4,000, 20,000 and 120,000 light years, with the cursor at Sol and at the galactic centre.

The 10 light year view is the new closest zoom. It is the most costly of the five for the
marker pass, because at that zoom the glow sprite is at its 30 CSS pixel cap and every
marker inside its category's range fills the cap, so the pass writes the largest number of
fragments it ever writes.

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
  300,000 light years, all within 10,000 light years of Sol so that every marker draws,
  sets the view at 10 light years with the cursor at Sol, and calls the measurement
  function for 300 frames
- **THEN** the returned mean is under 16.7 ms. This is the worst case for the marker pass,
  because every one of the 10,000 glow sprites is at its 30 CSS pixel cap

## ADDED Requirements

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
  which is the same radius on the 45 degree diagonal, and 40 pixels out, which is past the
  sprite
- **THEN** the horizontal reading and the vertical reading are each at least 0.1 above the
  diagonal reading, and the reading past the sprite is 0. A white category makes the added
  luminance the alpha, so the rule predicts the readings: at 8 of the 15 pixel radius the
  spike adds `0.55 * (1 - 8/15)^2`, which is 0.121, over a halo of `0.85 * (1 - 8/15)^3`,
  which is 0.087, while the diagonal at 8.49 pixels is past the spike's 1.0 CSS pixel
  half-width and holds the halo alone, which is 0.070

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
  of 3 a 30 CSS pixel glow asks for 90 device pixels, which is the largest sprite the map
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
  the radius, so a 30 CSS pixel glow counts about 28 pixels against a 12 pixel disc, which
  is 2.35. The bounds are wider than that figure because each of the two counts carries
  one pixel of rasterisation either way, and 29/11 is 2.64 while 27/13 is 2.08. The colour
  is pinned because a category whose brightest channel is well below 255 crosses the 8-bit
  floor sooner and counts fewer pixels

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
