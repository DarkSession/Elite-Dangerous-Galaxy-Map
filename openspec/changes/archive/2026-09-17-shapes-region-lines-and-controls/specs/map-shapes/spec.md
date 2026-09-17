## Purpose

Draws the shapes the Elite Dangerous community records beside its systems: a sphere for a
permit-locked sector or a hyperdiction zone, and a line for a recorded route between
systems. A shape is drawn and is never picked, so it carries a picture and never competes
with a marker for a click.

## ADDED Requirements

### Requirement: A host adds spheres and lines through the handle

The handle SHALL carry these members:

| Member                   | What it does                                            |
| ------------------------ | ------------------------------------------------------- |
| `addSpheres(spheres)`    | Reads spheres into the shape set, returns a report      |
| `addLines(lines)`        | Reads lines into the shape set, returns a report        |
| `clearShapes()`          | Empties the shape set                                   |
| `sphereCount()`          | How many spheres the set holds                          |
| `lineCount()`            | How many lines the set holds                            |
| `getSphere(index)`       | One sphere as a copy, or null outside the set           |
| `getLine(index)`         | One line as a copy, or null outside the set             |

A shape carries its **own colour** and is **not** in the category table. The category
browser SHALL NOT list a shape, `setCategoryVisible` SHALL NOT reach one, and
`addCategories` SHALL NOT be needed before a shape is added. A host that wants a shape and
a marker in one colour writes that colour twice.

**A sphere** SHALL carry:

| Field      | Type                                       | Required | Default |
| ---------- | ------------------------------------------ | -------- | ------- |
| `position` | three finite numbers, game coordinates     | yes      |         |
| `radius`   | finite number above 0, in light years      | yes      |         |
| `color`    | three finite numbers from 0 to 255, as RGB | yes      |         |
| `opacity`  | finite number above 0 and at most 1        | no       | `0.18`  |
| `name`     | string of at least one character           | no       |         |

**A line** SHALL carry:

| Field    | Type                                       | Required | Default |
| -------- | ------------------------------------------ | -------- | ------- |
| `points` | array of at least 2 points, see below      | yes      |         |
| `color`  | three finite numbers from 0 to 255, as RGB | yes      |         |
| `width`  | finite number above 0 and at most 16, in CSS pixels | no | `2` |
| `closed` | boolean; true joins the last point to the first | no  | `false` |
| `name`   | string of at least one character           | no       |         |

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
`bad-width`, `bad-points`, `bad-point`, `unknown-system`, `over-capacity`,
`over-point-capacity`. A reject SHALL NOT stop the call: the reader reads every entry and
reports the ones it dropped.

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

#### Scenario: The capacity bounds reject the excess

- **WHEN** a unit test adds 1,024 spheres, then 2 more, and adds lines whose points come to
  65,536, then one more line of 2 points
- **THEN** the second sphere call reports 2 entries of `over-capacity`, and the last line
  call reports `over-point-capacity`

#### Scenario: A shape is not a category

- **WHEN** a unit test adds one sphere in (255, 0, 0) on a map whose category table is
  empty, then reads `categoryCount` and `sphereCount`
- **THEN** the category count is 0 and the sphere count is 1

#### Scenario: Clearing the systems clears the shapes

- **WHEN** a unit test adds one category, one system, one sphere and one line, calls
  `clearSystems()`, and reads `sphereCount` and `lineCount`
- **THEN** both are 0

### Requirement: A line point is a coordinate or a system

Each entry of a line's `points` SHALL be one of two forms:

- **a coordinate**, three finite numbers in game coordinates; or
- **a system reference**, an object carrying `system`, a string that is the identity
  `real-systems` defines: the `id64` as a string, or the system name compared without
  case.

The map SHALL resolve a system reference **when the line is added**, against the system set
as it stands in that call. The line SHALL then hold the resolved position, so a later
change to the set SHALL NOT move a line that is already in.

A line holding a reference the set does not resolve SHALL be rejected whole, with the
reason `unknown-system`. A route that has lost a waypoint is wrong, not shorter, so the
reader drops the line rather than the point. An entry that is neither a coordinate nor an
object carrying a string `system` SHALL reject the line with `bad-point`.

A host that wants a line to name systems therefore adds the systems first and the line
after. `dataset-catalog` states the order a dataset load follows.

Two points at the same position SHALL be read and kept. They draw nothing and cost one
degenerate segment, and dropping them would change a point count the host can read back.

#### Scenario: A line connects two systems by name

- **WHEN** the browser test adds one category and two systems named `Sol` and `Alioth`,
  then adds one line whose points are `{ system: 'Sol' }` and `{ system: 'alioth' }`, and
  reads `getLine(0)`
- **THEN** the line is added, and its two points are the positions of those two systems

#### Scenario: A line mixes the two forms

- **WHEN** a unit test adds one system named `Sol` and one line whose points are
  `{ system: 'Sol' }`, `[100, 0, 0]` and `{ system: 'Sol' }`
- **THEN** the line is added and holds three points

#### Scenario: A reference the set does not hold rejects the line

- **WHEN** a unit test adds one line whose points are `{ system: 'Sol' }` and
  `{ system: 'Nowhere' }` on a map whose set holds `Sol` alone
- **THEN** `added` is 0 and the report holds `unknown-system` at index 0

#### Scenario: A later change to the set does not move the line

- **WHEN** the browser test adds `Sol`, adds a line naming it, calls `clearSystems()`,
  re-adds `Sol` at another position, then adds a second line naming it, and reads both
  lines
- **THEN** the first line is gone, because `clearSystems` clears the shapes, and the second
  line holds the new position

#### Scenario: An id64 resolves

- **WHEN** a unit test adds one system whose `id64` is 10477373803 and one line whose
  points are `{ system: '10477373803' }` and `[0, 0, 0]`
- **THEN** the line is added and its first point is that system's position

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
- The alpha SHALL be `min(1, opacity / sqrt(1 - (r / R)^2))` for `r` below `R`, and 0 at
  `R` and beyond.
- The blend SHALL be source alpha over the frame, so two shells that overlap add up.

The alpha rule is the path length through a thin shell at an impact parameter: it rises
from `opacity` at the middle to 1 at the limb. At the default opacity of 0.18 it reaches 1
at `r / R` of **0.9838**, so a sphere reads as a bright rim with a faint wash inside it and
never as a flat disc.

The renderer SHALL expose the alpha rule as a function the unit tests read, as it exposes
the marker glow rule of `real-systems`, so the rule is measured at its own resolution.

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

### Requirement: A line draws as a ribbon of a fixed width

A line SHALL draw over the finished frame, after the spheres and before the markers.

Each segment SHALL draw as a ribbon whose width is the line's `width` in **CSS pixels**,
the same at every range. A route line is a symbol between two places, not an object with a
size, so its width does not follow its range. The region boundary band does follow its
range, which `galactic-regions` states, because it bounds an area of the plane and reads as
part of the picture.

The ribbon SHALL be antialiased over the outer **1 device pixel** of its width.

The pass SHALL blend a join of one line **once**. A corner of a line SHALL therefore read
at the same strength as the straight run each side of it, and SHALL NOT carry a brighter
dot.

**Where two lines cross, the pixel SHALL NOT add the two.** The pass keeps one value per
pixel under a `MAX` blend, so the crossing takes the **larger of the two in each channel**
and no channel of it is brighter than the brighter line's channel. Two lines of one colour
therefore read at the strength of one, and a red line over a green one reads yellow where
they meet. The lines carry no depth order, so no rule says which one wins.

A segment that crosses the near plane SHALL be clipped at it, and a segment wholly at or
behind the near plane SHALL draw nothing.

`closed` true SHALL draw one more segment, from the last point to the first.

A line SHALL carry **no label** and **no arrow head**.

#### Scenario: A line draws between two systems

- **WHEN** the browser test adds two systems 200 light years apart, adds a line naming
  both in (255, 0, 255), opens a view that holds both, draws a frame, and reads the pixel
  at the middle of the two projected positions
- **THEN** the pixel is (255, 0, 255) within 8 of each channel

#### Scenario: A width is a width in CSS pixels

- **WHEN** the browser test adds one line of `width` 8 across the middle of a 1920x1080
  canvas at a device pixel ratio of 1, draws a frame, and counts the rows the line covers
  in one column
- **THEN** the count is 8, within 1

#### Scenario: The width does not follow the range

- **WHEN** the browser test adds one line and reads its drawn width at a view 1,000 light
  years out and at a view 40,000 light years out, with both ends of the line in the frame
- **THEN** the two readings are equal within 1 row

#### Scenario: A crossing takes the larger channel and adds nothing

- **WHEN** the browser test draws a red line and a green line that cross at the middle of
  the frame, and reads the pixel at the crossing and a pixel on the red line alone
- **THEN** the crossing carries both channels over 128, and neither channel of it is
  brighter than the red line's own red channel

#### Scenario: A corner carries no bright dot

- **WHEN** the browser test adds one line of three points that turns by 90 degrees at the
  middle one, draws a frame, and reads the brightest pixel within 3 CSS pixels of the
  corner and the brightest pixel on the straight run
- **THEN** the two readings are equal within 4 of each channel

#### Scenario: A closed line joins its ends

- **WHEN** the browser test adds one line of three points with `closed` true and one with
  `closed` false, each in its own frame, and compares the two frames
- **THEN** the two frames differ, and the `closed` frame draws a line between the last
  point and the first

#### Scenario: A line behind the camera draws nothing

- **WHEN** the browser test adds one line whose two points both sit behind the camera,
  draws a frame, and compares it with the frame the same view draws with the shapes switch
  off
- **THEN** the two frames are byte-identical

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

**The overlay order** SHALL be: the region boundaries, then the spheres, then the lines,
then the markers and their labels. A marker is what the user clicks, so nothing draws over
one.

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

#### Scenario: The four overlays draw in their order

- **WHEN** the browser test opens a view that holds a region boundary, a sphere over that
  boundary, a line over that sphere and a marker over that line, draws a frame, and reads one
  pixel where each pair overlaps
- **THEN** the sphere covers the boundary, the line covers the sphere, and the marker covers
  the line

#### Scenario: A marker draws over a shape

- **WHEN** the browser test adds one system in a bright colour, adds a sphere of the same
  radius centred on it, draws a frame, and reads the pixel at the middle of the marker
- **THEN** the pixel is the marker's colour, and not the sphere's

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
