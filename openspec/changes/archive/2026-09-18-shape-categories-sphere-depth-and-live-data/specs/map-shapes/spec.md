## MODIFIED Requirements

### Requirement: A host adds spheres and lines through the handle

The handle SHALL carry these members:

| Member                      | What it does                                            |
| --------------------------- | ------------------------------------------------------- |
| `addSpheres(spheres)`       | Reads spheres into the shape set, returns a report      |
| `addLines(lines)`           | Reads lines into the shape set, returns a report        |
| `clearShapes()`             | Empties the shape set                                   |
| `sphereCount()`             | How many spheres the set holds                          |
| `lineCount()`               | How many lines the set holds                            |
| `getSphere(index)`          | One sphere as a copy, or null outside the set           |
| `getLine(index)`            | One line as a copy, or null outside the set             |
| `getShapeInfo(kind, index)` | One shape without its geometry, or null outside the set |

A shape MAY carry **categories**, which name entries of the table `addCategories` fills.
One table holds the categories of the systems and of the shapes, so a category may hold
systems, shapes or both, and `setCategoryVisible` reaches every one of them. A shape that
names no category draws always and is in no row of the category browser, which is the map
every host has today.

**A sphere** SHALL carry:

| Field                 | Type                                       | Required | Default |
| --------------------- | ------------------------------------------ | -------- | ------- |
| `position`            | three finite numbers, game coordinates     | yes      |         |
| `radius`              | finite number above 0, in light years      | yes      |         |
| `color`               | three finite numbers from 0 to 255, as RGB | see below |        |
| `opacity`             | finite number above 0 and at most 1        | no       | `0.18`  |
| `name`                | string of at least one character           | no       |         |
| `primaryCategory`     | name of a category the table holds         | no       |         |
| `secondaryCategories` | array of names of categories the table holds | no     |         |

**A line** SHALL carry:

| Field                 | Type                                       | Required | Default |
| --------------------- | ------------------------------------------ | -------- | ------- |
| `points`              | array of at least 2 points, see below      | yes      |         |
| `color`               | three finite numbers from 0 to 255, as RGB | see below |        |
| `width`               | finite number above 0 and at most 16, in CSS pixels | no | `2` |
| `closed`              | boolean; true joins the last point to the first | no  | `false` |
| `name`                | string of at least one character           | no       |         |
| `primaryCategory`     | name of a category the table holds         | no       |         |
| `secondaryCategories` | array of names of categories the table holds | no     |         |

**`color` is required for a shape that names no category.** A shape that names a category
MAY leave it out, and SHALL then draw in the colour of the first category it names that is
on, by the order and the rule the requirement "A shape draws when a category it names is
on" states. A shape that carries a `color` SHALL draw in that colour whatever its
categories hold, because the colour of a shape is a look decision of the host's data and
the colour of a category is a look decision of the host's table.

`secondaryCategories` SHALL follow the rule a record follows: the reader SHALL drop a name
that repeats and a name equal to the primary category, and SHALL keep the rest in the
order the shape gave them. A `secondaryCategories` that is present and is not an array
SHALL be dropped. A shape that carries `secondaryCategories` and no `primaryCategory`
SHALL be rejected with `no-category`.

The reader SHALL drop every other field, as the record reader of `real-systems` does. A
`name` that is present and is not a string of at least one character SHALL be dropped, and
the shape SHALL still be read.

The set SHALL hold at most **1,024 spheres** and **4,096 lines**, and the points of every
line together SHALL come to at most **65,536**.

**Why 4,096 lines and not 1,024.** The UIA demo set draws one line for each hyperdiction
pair the Canonn report file holds, and that came to **983 lines** when the set was built.
A cap of 1,024 leaves 4 per cent of room over a file that grows with every report, so the
next build would drop lines. The cost of the higher cap is the segment buffer, which holds
`MAX_LINE_POINTS + MAX_LINES` segments: it grows by 3,072 segments, which is 4.6 per cent.
The point cap stays at 65,536 and is the one that binds.

`addSpheres` and `addLines` SHALL each return a report of `added` and `rejected`, the way
`addCategories` does. Each rejected entry SHALL carry the index of the shape in the call
and one reason from this set: `bad-position`, `bad-radius`, `bad-color`, `bad-opacity`,
`bad-width`, `bad-points`, `bad-point`, `bad-category`, `no-category`, `unknown-system`,
`unknown-category`, `over-capacity`, `over-point-capacity`. A reject SHALL NOT stop the
call: the reader reads every entry and reports the ones it dropped.

A `primaryCategory` that is present and is not a string of at least one character SHALL
reject the shape with `bad-category`. A `primaryCategory`, or an entry of
`secondaryCategories`, that names a category the table does not hold SHALL reject the
shape with `unknown-category`, which covers an entry that is not a string. The host
therefore adds its categories before its shapes, as it does before its systems.

`getShapeInfo(kind, index)` SHALL take `'sphere'` or `'line'` as the kind, and SHALL give
back an object of these fields, or null outside that list:

| Field                 | What it holds                                                |
| --------------------- | ------------------------------------------------------------ |
| `name`                | the shape's `name`, absent where it carries none              |
| `primaryCategory`     | the name, absent where the shape names none                   |
| `secondaryCategories` | the names the reader kept, in order                           |
| `centre`              | the sphere's centre, or the middle of the line's bounding box |
| `reach`               | the sphere's radius, or half the diagonal of that box         |
| `drawn`               | whether the shape draws in the next frame                     |

The member reads no point of a line, so a caller that lists the set costs no copy of
65,536 points. `getLine` still gives the points, for a caller that wants them.

`clearShapes()` SHALL empty both lists. `clearSystems()` and `clearSystemsAndCategories()`
SHALL empty them as well, because a line may name a system of the set being cleared.
`dispose()` SHALL release what the shape set holds.

A shape SHALL reach the next frame with no rebuild of the scene data.

#### Scenario: A sphere and a line are read and kept

- **WHEN** a unit test adds one sphere at (100, 0, 200) of radius 50 in (255, 0, 0), and
  one line through (0, 0, 0) and (100, 0, 0) in (0, 255, 0), then reads `sphereCount`,
  `lineCount`, `getSphere(0)` and `getLine(0)`
- **THEN** both counts are 1, the sphere holds its position, radius and colour and an
  opacity of 0.18, and the line holds its two points, its colour, a width of 2 and
  `closed` false

#### Scenario: Each shape fault gets its own reason

- **WHEN** a unit test adds four spheres, of which one is valid, one has a `position` of
  two numbers, one has a `radius` of 0 and one has an `opacity` of 2, and four lines, of
  which one is valid, one has one point, one has a `width` of 40 and one has a `color`
  holding a `NaN`
- **THEN** the sphere report is `added` 1 with `bad-position` at index 1, `bad-radius` at
  index 2 and `bad-opacity` at index 3, and the line report is `added` 1 with `bad-points`
  at index 1, `bad-width` at index 2 and `bad-color` at index 3

#### Scenario: Each category fault gets its own reason

- **WHEN** a unit test adds the category `A`, then five spheres: one naming `A`, one
  naming `B` which the table does not hold, one whose `primaryCategory` is the number 7,
  one whose `secondaryCategories` hold `B`, and one whose `secondaryCategories` hold `A`
  and carry no `primaryCategory`
- **THEN** `added` is 1, and `rejected` holds `unknown-category` at index 1,
  `bad-category` at index 2, `unknown-category` at index 3 and `no-category` at index 4

#### Scenario: A shape with no colour and no category is rejected

- **WHEN** a unit test adds the category `A`, then one sphere naming `A` and carrying no
  `color`, and one sphere naming no category and carrying no `color`
- **THEN** `added` is 1 and the report holds `bad-color` at index 1

#### Scenario: The capacity bounds reject the excess

- **WHEN** a unit test adds 1,024 spheres, then 2 more, and adds lines whose points come to
  65,536, then one more line of 2 points
- **THEN** the second sphere call reports 2 entries of `over-capacity`, and the last line
  call reports `over-point-capacity`

#### Scenario: A shape reads without its points

- **WHEN** a unit test adds the category `A`, one sphere of radius 50 at (100, 0, 200)
  naming `A`, and one line through (0, 0, 0) and (100, 0, 0), then reads
  `getShapeInfo('sphere', 0)`, `getShapeInfo('line', 0)` and `getShapeInfo('line', 7)`
- **THEN** the first holds the centre (100, 0, 200), a reach of 50 and the primary
  category `A`, the second holds the centre (50, 0, 0) and a reach of 50, neither holds a
  point list, and the third is null

#### Scenario: A shape is not a category

- **WHEN** a unit test adds one sphere in (255, 0, 0) on a map whose category table is
  empty, then reads `categoryCount` and `sphereCount`
- **THEN** the category count is 0 and the sphere count is 1

#### Scenario: Clearing the systems clears the shapes

- **WHEN** a unit test adds one category, one system, one sphere and one line, calls
  `clearSystems()`, and reads `sphereCount` and `lineCount`
- **THEN** both are 0

### Requirement: A sphere draws as a limb-brightened shell

A sphere SHALL draw over the finished frame, as the region overlay and the markers do, and
SHALL NOT change any look constant of the scene passes.

The sphere's centre SHALL project as the map projects any game position, camera-relative in
`float64`. Its drawn radius `R` in CSS pixels SHALL be `f * radius / range`, with `f` the
focal length of the frame in CSS pixels and `range` the distance to the centre.

**This is the radius at the range of the centre and not the silhouette.** A sphere of radius
`radius` at `range` subtends `f * radius / sqrt(range² - radius²)`, which is larger. The rule
above is **0.8 per cent** short at eight radii, **3.2 per cent** at four and **44.7 per cent**
at 1.2. The largest sphere of the UIA set has a radius of 514 light years, so the reading is
within 1 per cent past about 4,100 light years from its centre and short of it inside that.
The map draws nothing once the range reaches the radius, which the cull below states, so the
error never grows past that point.

A sphere is a background mark of a region and not a body, and the sprite is one quad: the
exact silhouette costs a square root per sphere per frame for a reading no user reads off
the screen. A later change that needs the exact shape SHALL use the silhouette formula
above.

Over the sprite, with `r` the distance from its centre in CSS pixels:

- The colour SHALL be the sphere's colour at every point, so the colour reaches the frame
  unmixed.
- The **shell alpha** SHALL be `min(1, opacity / sqrt(1 - (r / R)^2))` for `r` below `R`,
  and 0 at `R` and beyond.
- The alpha the frame takes SHALL be the shell alpha times the **depth share** the
  requirement "A sphere washes what lies inside it and behind it" states.
- The blend SHALL be source alpha over the frame, so two shells that overlap add up.

The shell alpha rule is the path length through a thin shell at an impact parameter: it
rises from `opacity` at the middle to 1 at the limb. At the default opacity of 0.18 it
reaches 1 at `r / R` of **0.9838**, so a sphere reads as a bright rim with a faint wash
inside it and never as a flat disc.

The renderer SHALL expose the shell alpha rule and the depth share rule as functions the
unit tests read, as it exposes the marker glow rule of `real-systems`, so each rule is
measured at its own resolution.

**A sphere SHALL draw nothing when:**

- its drawn radius `R` is under **1 CSS pixel**, because a shell smaller than a pixel
  carries no reading and costs a sprite;
- its centre lies at or behind the near plane;
- the range from the camera to its centre is at or below its own radius, because the camera
  is then inside the shell and the impostor is not the shape the user would see.

A sphere SHALL carry **no label**.

#### Scenario: The alpha rises to the limb

- **WHEN** a unit test reads the sphere alpha rule at `r / R` of 0, 0.5, 0.9 and 0.9838,
  with an opacity of 0.18
- **THEN** the readings are 0.18, 0.2078, 0.4129 and 1, each within 0.001

#### Scenario: The rim draws brighter than the middle

- **WHEN** the browser test adds one sphere of radius 500 light years in (0, 255, 255) at
  the cursor, opens a view 5,000 light years out, draws a frame, and reads the pixel at the
  middle of the sphere and the pixel just inside its rim
- **THEN** the rim pixel is nearer to (0, 255, 255) than the middle pixel is

#### Scenario: A small sphere draws nothing

- **WHEN** the browser test adds one sphere of radius 1 light year at the cursor, opens a
  view 100,000 light years out at 1920x1080, draws a frame, and compares it with the frame
  the same view draws with the shapes switch off
- **THEN** the two frames are byte-identical

#### Scenario: A sphere at the near plane draws nothing

- **WHEN** the browser test holds the near plane at 1,000 light years through
  `debug.setNearPlane`, adds one sphere of radius 10 light years whose centre sits exactly at
  the near plane and one of the same radius whose centre sits behind it, draws a frame, and
  compares it with the frame the same view draws with the shapes switch off
- **THEN** the two frames are byte-identical.

  Each radius is far under the range from the camera, so neither sphere trips the cull for a
  camera inside the shell. The near-plane cull is the only one that can take them away

#### Scenario: A sphere the camera sits inside draws nothing

- **WHEN** the browser test adds one sphere of radius 1,000 light years at the cursor,
  opens a view 500 light years out, draws a frame, and compares it with the frame the same
  view draws with the shapes switch off
- **THEN** the two frames are byte-identical

#### Scenario: A sphere draws no label

- **WHEN** the browser test adds one sphere with a `name`, draws a frame and reads the
  label overlay
- **THEN** the overlay holds no element carrying that name

### Requirement: The shapes have a switch and are not picked

`GalaxyMapOptions` SHALL take an optional `shapes`, a boolean that starts **`true`**. The
handle SHALL carry `setShapesVisible(on)` and `areShapesVisible()`. The switch SHALL remove
both the spheres and the lines, and SHALL take effect in the next frame with no rebuild of
the scene data.

The renderer SHALL expose a `shapes` pass switch beside the switches for the volume, the
clouds, the points, the glow, the stars, the regions, the systems and the grid. The pass
switch off and `setShapesVisible(false)` SHALL draw the same frame.

**A shape is drawn and is never picked.** `systemAt` SHALL read no shape. No shape SHALL
hover, no shape SHALL be selected, and no shape SHALL carry a name label. A shape SHALL
NOT change which marker a pixel picks: the reading at a pixel SHALL be the same with the
shapes on and with them off.

**The overlay order** SHALL be: the region boundaries, then the **markers** and their
labels, then the spheres, then the lines.

The markers moved ahead of the spheres. A sphere is a space that holds systems, and it can
only read as one if it washes the markers that sit inside it and behind it. The wash is
bounded so it never takes a marker off the screen, which the requirement "A sphere washes
what lies inside it and behind it" states. The lines stay last: a route line is a symbol of
a path between two places, it carries no range reading of its own, and a sphere that washed
it would erase it where the limb is brightest.

**A line SHALL NOT take a marker off the screen either.** The lines draw over the markers,
which they did not do before this change, and a line is 2 CSS pixels wide over a marker
sprite that is a few pixels across. The step that writes the lines over the frame SHALL
therefore read the same range buffer and SHALL cap its alpha at **0.5** at a pixel where a
marker drew. The rule is the cap the spheres take, and it holds for the same reason: a
marker is what the user clicks and reads, and a decoration SHALL NOT hide one. A line over a
pixel with no marker is unchanged.

A line takes no range reading of its own, so the cap does not depend on which of the two is
nearer. A line that runs behind a marker and a line that runs in front of it read the same.

#### Scenario: The switch removes both parts

- **WHEN** the browser test adds one sphere and one line at a view that draws both, takes a
  screenshot, calls `setShapesVisible(false)`, draws a frame and takes a second screenshot
- **THEN** the two screenshots differ, and the second is byte-identical to the frame the
  same view draws with the `shapes` pass switch off

#### Scenario: A shape does not take a pick

- **WHEN** the browser test adds one system, adds a sphere of radius 500 light years
  centred on it and a line through it, draws a frame, and calls `systemAt` at the pixel the
  system projects to and at a pixel inside the sphere but away from the system
- **THEN** the first reading names the system and the second is null, and both readings are
  the same as the readings with the shapes off

#### Scenario: A marker draws over a shape

- **WHEN** the browser test adds one system in a bright colour, adds a sphere of the same
  radius centred on it and a line through it, draws a frame, and reads the pixel at the
  middle of the marker
- **THEN** the pixel holds at least a quarter of the marker's own colour, which is the two
  caps compounded, and the marker is still the reading at that pixel

#### Scenario: One decoration leaves a marker half its colour

- **WHEN** the browser test adds one system in a bright colour, adds a sphere of the same
  radius centred on it and **no line**, draws a frame, reads the pixel at the middle of the
  marker, and reads the same pixel with the shapes switch off
- **THEN** the first reading holds at least half of the second

#### Scenario: A line does not take a marker off the screen

- **WHEN** the browser test adds one system in a bright colour, adds a line that runs
  through the middle of its marker, draws a frame, reads the pixel at the middle of the
  marker, and reads the same pixel with the shapes switch off
- **THEN** the first reading holds at least half of the second

#### Scenario: The four overlays draw in their order

- **WHEN** the browser test opens a view that holds a region boundary, a marker over that
  boundary, a sphere whose centre lies beyond that marker, and a line over that sphere, draws
  a frame, and reads one pixel where each pair overlaps
- **THEN** the marker covers the boundary, the sphere washes the marker, and the line covers
  the sphere

#### Scenario: The option starts the map with the shapes on

- **WHEN** a browser test builds one map with no `shapes` option and one with
  `shapes: false`, and reads `areShapesVisible()` on each
- **THEN** the readings are `true` and `false`

### Requirement: The shape set holds the frame budget

With **1,024 spheres** and **4,096 lines** whose points come to **65,536**, at
**1920x1080**, with 10,000 systems, the HUD on and the shapes on, the mean interval between
animation frames SHALL be **18 milliseconds or less** over a camera move. That is the bound
`system-selection` and `map-hud` already hold for the same view.

Reading a full shape set on the main thread — 1,024 spheres and 4,096 lines of 65,536
points, with every line point a coordinate — SHALL take under **40 milliseconds**, which is
the bound `dataset-catalog` holds for a dataset switch.

The pass SHALL cost a **fixed** number of draw calls, whatever the shape count, so the set
size changes the vertex work and not the call count. The count is **three**: one for the
spheres, one for the line segments, and one full-screen pass that writes the lines over the
frame. `design.md` states why the lines take the second step.

**The marker pass costs one draw call more**, which writes the range buffer the spheres
read. It is a second `POINTS` draw over the same marker buffer, with a shader that writes
one value and no colour, so it costs at most 10,000 points whatever the shape set holds. The map SHALL make that
draw only while the shape set holds a **shape** that draws, so a map with no shape costs
what it costs today.

**A line needs the range buffer as much as a sphere does.** The line step caps its alpha
over a marker body, which the requirement "The shapes have a switch and are not picked"
states, and it has no other way of finding a marker. A map of lines and no spheres
therefore pays the extra marker draw as well: the Adamastor demo set is such a map, with 8
lines and no sphere, and without the buffer each of its routes could take a marker off the
screen.

The range buffer SHALL be one 32-bit float per pixel of the drawing buffer. At 1920x1080
with a device pixel ratio of 1 that is **8.3 MB**. `design.md` states why the value is a
32-bit float and not a 16-bit one.

**The buffer SHALL take its size on the first frame that draws a shape**, and not on the
resize of the canvas. A host that draws no shape SHALL carry no buffer of the drawing
buffer's size: 8.3 MB of texture that nothing reads costs every such host the allocation
and costs it again on every resize. Two things follow. The debug read of the buffer SHALL
answer `null` until that frame, because a read at a canvas coordinate would fall outside
the buffer the map still holds. A context that gives neither float extension SHALL compile
no range shader, because no frame of that context can draw one.

#### Scenario: A full shape set holds the frame rate

- **WHEN** the browser test adds 10,000 systems, 1,024 spheres and 4,096 lines of 65,536
  points at 1920x1080, resets the animation frame interval statistics, pans the camera
  1,000 light years and zooms from 20,000 light years to 2,000 over two seconds, and reads
  the statistics
- **THEN** the mean interval is 18 milliseconds or less

#### Scenario: A full shape set is read inside its budget

- **WHEN** the browser test measures the main thread from the call to `addSpheres` and
  `addLines` with a full set until both return
- **THEN** the measurement is under 40 milliseconds

#### Scenario: The set size does not change the call count

- **WHEN** the browser test reads the draw call count of the shape pass with 1 sphere and
  1 line, and again with 1,024 spheres and 4,096 lines
- **THEN** both readings are 3

#### Scenario: A map with no shape makes no range draw

- **WHEN** the browser test reads the draw call count of the marker pass with 10,000
  systems and no shape, then adds one sphere that draws and reads it again
- **THEN** the first reading is 1 and the second is 2

#### Scenario: A map of lines and no spheres makes the range draw

- **WHEN** the browser test reads the draw call count of the marker pass with 10,000
  systems and one line that draws and no sphere
- **THEN** the reading is 2, so the line step can find a marker body and cap itself

## ADDED Requirements

### Requirement: A shape draws when a category it names is on

A shape SHALL draw when **any** category it names is on, and SHALL NOT draw when every one
of them is off. The rule reads the primary category and every secondary category together,
and it is the rule a marker follows, which `real-systems` states.

A shape that names **no** category SHALL always draw. Such a shape is in no row of the
category browser and no switch reaches it.

**A shape that carries no `color` SHALL take the colour of the first category it names that
is on.** The order SHALL be the primary category first, then the secondary categories in
the order the shape gave them, without a repeat. A shape that carries a `color` SHALL keep
that colour whatever its categories hold.

The map SHALL work out which shapes draw when the shape set, the category table, the
category visibility or the shape name filter changes, and SHALL NOT work it out per frame.
With 1,024 spheres and 4,096 lines each naming 4 categories, and every category turned off
in one call, that work SHALL cost less than **2 milliseconds** on the main thread for the
first switch that follows the arrival of the set, and less than **1 millisecond** for every
switch after it. The page SHALL expose the reading so a test can read it.

The two bounds are one measurement and not two budgets. The set arrives with a sweep of its
own, and the switch that follows it still runs code the engine has not compiled, so it
reads 0.4 to 1.1 milliseconds in the browser gate. Every switch after that one reads 0.0 to
0.2. Both are far under the 16.7 milliseconds of a frame at 60 Hz, so neither drops a
frame; the bounds hold the sweep to the shape of a linear pass over the set and catch a
rule that reads the table per shape.

The change SHALL reach the next frame with no rebuild of the scene data.

A category replaced under the same name SHALL keep the visibility it had, and every shape
that names it SHALL take the new colour in the next frame, by the rule a marker follows.

#### Scenario: A category that is off removes its shapes

- **WHEN** the browser test adds the categories `A` and `B`, one sphere in `A` and one in
  `B` at a view that draws both, takes a screenshot, calls `setCategoryVisible('A', false)`,
  draws a frame and takes a second screenshot
- **THEN** the two screenshots differ, and the second is byte-identical to the frame the
  same view draws with the sphere of `A` never added

#### Scenario: A secondary category keeps a shape on the screen

- **WHEN** a unit test adds the categories `A` and `B`, one line whose primary category is
  `A` and whose secondary categories hold `B`, turns `A` off and reads
  `getShapeInfo('line', 0)`, then turns `B` off as well and reads it again
- **THEN** the first reading is drawn and the second is not

#### Scenario: A shape with no category is not reached by a switch

- **WHEN** a unit test adds one category, one sphere naming it and one sphere naming none,
  calls `setCategoryVisible` with `false` for that category, and reads both shapes
- **THEN** the first is not drawn and the second is drawn

#### Scenario: A shape with no colour follows the first category that is on

- **WHEN** the browser test adds the categories `A` in (255, 0, 0) and `B` in (0, 255, 0),
  one line carrying no `color` whose primary category is `A` and whose secondary categories
  hold `B`, draws a frame and reads a pixel on the line, turns `A` off, draws and reads
  again
- **THEN** the first reading is red and the second is green, each within 8 of each channel

#### Scenario: A shape with a colour keeps it

- **WHEN** the browser test adds the category `A` in (255, 0, 0), one line in (0, 0, 255)
  naming `A`, draws a frame and reads a pixel on the line
- **THEN** the reading is (0, 0, 255) within 8 of each channel

#### Scenario: The sweep holds its budget

- **WHEN** the browser test adds 256 categories, 1,024 spheres and 4,096 lines each naming
  4 of them, calls **NONE** on every category in one call, reads the sweep measurement the
  page exposes, then switches every category on and off three more times and reads it again
- **THEN** the first reading is under 2 milliseconds and the last reading is under 1
  millisecond

### Requirement: A shape name filter hides the shapes it does not keep

The handle SHALL carry `setShapeNameFilter(text)` and `getShapeNameFilter()`. The filter
SHALL keep a shape whose `name` holds the text, compared without case, and SHALL hide every
other shape, including a shape that carries no `name`. An empty text SHALL keep every
shape.

The filter is a second cut over the categories: a shape draws when a category it names is
on **and** the filter keeps it.

The filter SHALL NOT be the system name filter. `setNameFilter` reaches the markers and the
system lists alone, and `setShapeNameFilter` reaches the shapes and the shape lists alone,
so a user searching in one tab of the category browser does not empty the other.

`clearShapes()`, `clearSystems()` and `clearSystemsAndCategories()` SHALL clear the shape
filter, as `loadDataset` clears the system filter, because the text names shapes of the set
being cleared.

#### Scenario: The filter hides the shapes it does not keep

- **WHEN** a unit test adds three spheres named `Sol Zone`, `Solati Zone` and `Achenar
  Zone`, calls `setShapeNameFilter('sol')`, and reads the three shapes
- **THEN** the first two are drawn and the third is not

#### Scenario: A shape with no name is hidden by a filter

- **WHEN** a unit test adds one sphere named `Sol Zone` and one with no `name`, calls
  `setShapeNameFilter('zone')`, reads both, then calls `setShapeNameFilter('')` and reads
  both again
- **THEN** the first reading draws the named shape alone, and the second draws both

#### Scenario: The two filters are separate

- **WHEN** the browser test adds one category, one system named `Sol` and one sphere named
  `Sol Zone`, calls `setNameFilter('achenar')`, draws a frame, and reads the marker count
  and the sphere
- **THEN** the marker count is 0 and the sphere still draws

#### Scenario: Clearing the shapes clears the filter

- **WHEN** a unit test calls `setShapeNameFilter('sol')`, calls `clearShapes()` and reads
  `getShapeNameFilter()`
- **THEN** the reading is empty

### Requirement: A sphere washes what lies inside it and behind it

The map SHALL hold a **range buffer** at the size of the drawing buffer. It SHALL carry,
per pixel, the distance from the camera to the nearest marker **body** that drew at that
pixel, in light years, and a value above every drawable range at a pixel where no marker
body drew. The marker pass SHALL write it and the sphere step SHALL read it.

**A marker body is the part of the sprite whose own alpha is 0.5 or more.** A marker
fragment SHALL write range where the alpha the marker pass gives it is at or above **0.5**,
and SHALL write nothing below that. `real-systems` states the alpha rule of both marker
styles and exposes it as a function, so the range shader computes the same alpha the colour
shader computes and discards the rest.

The threshold is what keeps the reading honest. A `glow` sprite is up to 40 CSS pixels
across and its halo falls to 0 at the rim, so a range written over the whole sprite would
punch a square of unwashed sphere up to 40 pixels wide around every marker. At an alpha of
0.5 the protected part of a 40 pixel `glow` sprite is about **3 CSS pixels** of radius, plus
the four spikes where they are that strong, which is the part of the marker the user reads
as the marker. The faint halo takes the wash like the rest of the frame.

For a pixel of a sphere's sprite, let `r` be the distance from the middle of the sprite as
a share of the drawn radius, `c` the range from the camera to the sphere's centre, and
`d = radius * sqrt(1 - r²)` the half chord the ray cuts through the shell, in light years.
The ray enters the shell at `c - d` and leaves it at `c + d`. With `t` the range the buffer
holds at that pixel, the **depth share** SHALL be:

`share = clamp((t - (c - d)) / (2 * d), 0, 1)`

and, where `d` is 0, `share` SHALL be 1 for `t` at or beyond `c` and 0 below it.

The alpha the frame takes SHALL be the shell alpha times the share. The reading therefore
runs:

| Where the marker is       | `share` | What the user sees                       |
| ------------------------- | ------- | ---------------------------------------- |
| In front of the shell     | 0       | The marker's own colour, unchanged        |
| At the centre of the sphere | 0.5   | Half the wash                             |
| Behind the shell          | 1       | The whole wash, which is the frame today   |

A pixel where no marker body drew SHALL take a share of 1, so the galaxy, the coordinate grid
and the region boundaries take the wash they take today.

**The wash over a marker body SHALL be capped at an alpha of 0.5**, so one step leaves a
marker at least half of the colour that step found. Without the cap the limb, whose shell
alpha reaches 1, would take a marker off the screen, and a marker is what the user clicks.

**The cap is per step, and the steps compound.** The sphere step caps the wash it adds and
the line step caps the wash it adds, and neither reads what the other wrote. A marker under
a sphere **and** a line therefore keeps a quarter of its own colour, and a marker under two
overlapping spheres keeps a quarter in the same way, because the two spheres blend inside
one draw. The floor a marker holds is **0.5 to the power of the number of decorations over
it**, and not a flat half.

The map does not bound the total. Bounding it would need the spheres to blend into a target
of their own with a `MAX` blend, which would change how two overlapping spheres read, and
the proposal holds that as a non-goal. One decoration over a marker is the common frame and
it keeps its half; three decorations over one marker is a crowded view the user can thin
with the category switches.

**Where the context cannot blend into a float colour target** the map SHALL hold no range
buffer, SHALL draw every sphere at a share of 1 and SHALL cap no line, which is the frame
this change replaces. The map SHALL read **both** `EXT_color_buffer_float`, which lets it
draw to the target, and `EXT_float_blend`, which lets it blend into a 32-bit float target.
WebGL2 refuses the blend without the second one, so a map that read only the first would
draw a range buffer that holds the last marker rather than the nearest. The browser gate
asserts hardware rendering, and both browsers of the gate give both extensions; the gate
SHALL assert that the map took the range buffer path and not this fallback, so a silent
fallback cannot pass as a measured frame.

The scene passes — the volume, the clouds, the point cloud and the star field — write no
range. A sphere therefore washes them whole, whether they lie in front of it or behind it,
as it does today. A line writes no range either, and the lines draw after the spheres.

#### Scenario: Both browsers of the gate blend into a float target

- **WHEN** the renderer gate reads `EXT_color_buffer_float` and `EXT_float_blend` from a
  WebGL2 context, in every project of the browser suite
- **THEN** both extensions are present, so no project measured the fallback

#### Scenario: The share runs from the near crossing to the far one

- **WHEN** a unit test reads the depth share rule for a sphere of radius 100 light years
  whose centre is 1,000 light years away, at `r` of 0, with the range readings 850, 900,
  1,000, 1,100 and 1,150
- **THEN** the readings are 0, 0, 0.5, 1 and 1, each within 0.001

#### Scenario: A marker in front of a sphere is unchanged

- **WHEN** the browser test adds one system in a bright colour, adds a sphere of radius 500
  light years whose centre sits 2,000 light years beyond it on the view axis, draws a
  frame, and reads the pixel at the middle of the marker, then draws the same view with the
  shapes switch off and reads it again
- **THEN** the two readings are the same

#### Scenario: A marker's halo takes the wash

- **WHEN** the browser test adds one system of a `glow` category at a sprite radius of 40
  CSS pixels, adds a sphere of radius 500 light years whose centre sits 2,000 light years
  beyond it, draws a frame, and reads a pixel 10 CSS pixels from the middle of the marker,
  where the marker's own alpha is under 0.5, and reads the same pixel with the shapes
  switch off
- **THEN** the two readings differ by the whole wash, which is the reading a pixel with no
  marker takes

#### Scenario: The range draw writes the body alone

- **WHEN** a unit test reads the range shader's alpha rule at 0, 1, 3 and 10 CSS pixels
  from the middle of a `glow` sprite of radius 40, and at the same distances for a `disc`
  sprite
- **THEN** the shader writes range where the alpha is 0.5 or more and discards below it,
  and the readings match the alpha function `real-systems` exposes

#### Scenario: A marker at the centre takes half the wash

- **WHEN** the browser test adds one system, adds a sphere of radius 500 light years
  centred on it, draws a frame and reads the pixel at the middle of the marker, then moves
  the system 400 light years further from the camera along the view axis, draws and reads
  again
- **THEN** the first reading has moved from the marker's own colour toward the sphere's,
  and the second has moved further

#### Scenario: A marker behind a sphere takes the whole wash

- **WHEN** the browser test adds one system, adds a sphere of radius 100 light years whose
  centre sits 500 light years nearer the camera on the view axis, draws a frame, and reads
  the pixel at the middle of the marker and a pixel of the sphere beside it
- **THEN** the marker pixel carries the sphere's colour at the shell alpha of that pixel,
  within 8 of each channel

#### Scenario: A sphere does not take a marker off the screen

- **WHEN** the browser test adds one system in (255, 255, 255), adds a sphere whose limb
  falls over that marker and whose centre is nearer the camera than the system, draws a
  frame, and reads the pixel at the middle of the marker
- **THEN** the pixel holds at least half of the marker's own colour in each channel

#### Scenario: The galaxy behind a sphere takes the whole wash

- **WHEN** the browser test opens a view over the galaxy with no system in the set, reads
  the pixel at the middle of where a sphere will sit with the shapes switch off, adds one
  sphere there, draws a frame and reads that pixel again
- **THEN** the second reading is the first mixed with the sphere's colour at the sphere's
  own opacity, within 8 of each channel, which is the reading the map gave before the range
  buffer existed
