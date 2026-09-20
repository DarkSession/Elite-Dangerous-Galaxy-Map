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
systems, shapes or both. A category holds **two** visibility flags, one for its systems and
one for its shapes. `setCategoryVisible` reaches the systems of a category and
`setShapeCategoryVisible` reaches its shapes. A shape that names no category draws always
and is in no row of the category browser, which is the map every host has today.

**A sphere** SHALL carry:

| Field        | Type                                       | Required | Default |
| ------------ | ------------------------------------------ | -------- | ------- |
| `position`   | three finite numbers, game coordinates     | yes      |         |
| `radius`     | finite number above 0, in light years      | yes      |         |
| `color`      | three finite numbers from 0 to 255, as RGB | see below |        |
| `opacity`    | finite number above 0 and at most 1        | no       | `0.18`  |
| `name`       | string of at least one character           | no       |         |
| `categories` | array of names of categories the table holds | no     |         |

**A line** SHALL carry:

| Field        | Type                                       | Required | Default |
| ------------ | ------------------------------------------ | -------- | ------- |
| `points`     | array of at least 2 points, see below      | yes      |         |
| `color`      | three finite numbers from 0 to 255, as RGB | see below |        |
| `width`      | finite number above 0 and at most 16, in CSS pixels | no | `2` |
| `closed`     | boolean; true joins the last point to the first | no  | `false` |
| `name`       | string of at least one character           | no       |         |
| `categories` | array of names of categories the table holds | no     |         |

**The shape reader keeps its own reason set.** A `categories` entry that is not a string
rejects a shape as `bad-category`, where the same entry rejects a **record** as
`unknown-category`, which `real-systems` states. The two readers carry the reason sets they
already had, and neither grows one to match the other: a host reads the report of the call
it made, and a reason that named a fault of the other reader would be the surprise. The
merge does not change either set.

**A shape carries one category list and not two.** `primaryCategory` and
`secondaryCategories` are gone, and the reader SHALL drop either name with every other
field it does not know, so a shape written to the old shape reads as a shape that names no
category.

**`color` is required for a shape that names no category.** A shape that names a category
MAY leave it out, and SHALL then draw in the colour of the first category it names that is
on **for shapes**, by the order and the rule the requirement "A shape draws when a category
it names is on" states. A shape that carries a `color` SHALL draw in that colour whatever
its categories hold, because the colour of a shape is a look decision of the host's data and
the colour of a category is a look decision of the host's table.

`categories` SHALL follow the rule a record follows: the reader SHALL drop a name that
repeats and SHALL keep the rest in the order the shape gave them. A `categories` that is
present and is not an array SHALL be read as an empty list.

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
`bad-width`, `bad-points`, `bad-point`, `bad-category`, `unknown-system`,
`unknown-category`, `over-capacity`, `over-point-capacity`. A reject SHALL NOT stop the
call: the reader reads every entry and reports the ones it dropped.

**`no-category` leaves the set of shape reasons.** It reported a shape that carried
`secondaryCategories` and no `primaryCategory`, and one list cannot hold that fault.

An entry of `categories` that is not a string of at least one character SHALL reject the
shape with `bad-category`. An entry that names a category the table does not hold SHALL
reject the shape with `unknown-category`. The host therefore adds its categories before its
shapes, as it does before its systems.

`getShapeInfo(kind, index)` SHALL take `'sphere'` or `'line'` as the kind, and SHALL give
back an object of these fields, or null outside that list:

| Field        | What it holds                                                 |
| ------------ | ------------------------------------------------------------- |
| `name`       | the shape's `name`, absent where it carries none              |
| `categories` | the names the reader kept, in order, and empty where it names none |
| `centre`     | the sphere's centre, or the middle of the line's bounding box |
| `reach`      | the sphere's radius, or half the diagonal of that box         |
| `drawn`      | whether the shape draws in the next frame                     |

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

- **WHEN** a unit test adds the category `A`, then four spheres: one whose `categories`
  are `['A']`, one whose `categories` are `['B']` which the table does not hold, one whose
  `categories` are `['A', 7]`, and one whose `categories` is the string `A` and carries a
  `color`
- **THEN** `added` is 2, and `rejected` holds `unknown-category` at index 1 and
  `bad-category` at index 2, and the fourth is added as a shape that names no category

#### Scenario: A shape with no colour and no category is rejected

- **WHEN** a unit test adds the category `A`, then one sphere whose `categories` are
  `['A']` and that carries no `color`, and one sphere naming no category and carrying no
  `color`
- **THEN** `added` is 1 and the report holds `bad-color` at index 1

#### Scenario: The capacity bounds reject the excess

- **WHEN** a unit test adds 1,024 spheres, then 2 more, and adds lines whose points come to
  65,536, then one more line of 2 points
- **THEN** the second sphere call reports 2 entries of `over-capacity`, and the last line
  call reports `over-point-capacity`

#### Scenario: A shape reads without its points

- **WHEN** a unit test adds the category `A`, one sphere of radius 50 at (100, 0, 200)
  whose `categories` are `['A']`, and one line through (0, 0, 0) and (100, 0, 0), then
  reads `getShapeInfo('sphere', 0)`, `getShapeInfo('line', 0)` and `getShapeInfo('line', 7)`
- **THEN** the first holds the centre (100, 0, 200), a reach of 50 and the categories
  `['A']`, the second holds the centre (50, 0, 0), a reach of 50 and an empty category
  list, neither holds a point list, and the third is null

#### Scenario: A shape is not a category

- **WHEN** a unit test adds one sphere in (255, 0, 0) on a map whose category table is
  empty, then reads `categoryCount` and `sphereCount`
- **THEN** the category count is 0 and the sphere count is 1

#### Scenario: Clearing the systems clears the shapes

- **WHEN** a unit test adds one category, one system, one sphere and one line, calls
  `clearSystems()`, and reads `sphereCount` and `lineCount`
- **THEN** both are 0

### Requirement: A shape draws when a category it names is on

A shape SHALL draw when **any** category it names is on **for shapes**, and SHALL NOT draw
when every one of them is off for shapes. The rule reads the whole of the shape's
`categories` list.

**A category holds two visibility flags.** One flag holds the markers of its systems and
one holds its shapes. Both SHALL be on when the table takes the category. The shape rule
reads the shape flag alone, and the marker rule `real-systems` states reads the system flag
alone. A category that is off for its shapes SHALL keep drawing its markers, and a category
that is off for its systems SHALL keep drawing its shapes.

The handle SHALL carry `setShapeCategoryVisible(name, visible)`, which writes the shape
flag, and `isShapeCategoryVisible(name)`, which reads it. `setCategoryVisible` and
`isCategoryVisible` do the same for the system flag and SHALL reach no shape. A call that
names a category the table does not hold SHALL change nothing and SHALL NOT throw, and
`isShapeCategoryVisible` SHALL return `false` for such a name, which is the rule the system
pair already follows.

The two kinds have one table, one set of names and one colour for each name. Only the flag
splits. `addCategories` SHALL NOT change, but for the rejection the requirement "A set
holds categories or holds none" of `real-systems` adds, so a host fills one table as it
does today.

**The shape flags clear with the shapes.** `clearShapes` SHALL turn every shape flag back
on, as it already clears the shape name filter, and `clearSystems` and
`clearSystemsAndCategories` SHALL do the same, because each of them clears the shapes as
well. A dataset load therefore opens its set with every category on for both kinds. A flag
held over a clear would hide the shapes of a name the next set also holds, while the row's
dot reads on, and `real-systems` already holds the same rule for the system flag.

A shape that names **no** category SHALL always draw. Such a shape is in no row of the
category browser and no switch reaches it. The **SHAPES** tab of the HUD still reaches it
through the flat list `map-hud` states, where the tab holds no row at all.

**A shape that carries no `color` SHALL take the colour of the first category it names that
is on for shapes.** The order SHALL be the order of the shape's `categories` list. A shape
that carries a `color` SHALL keep that colour whatever its categories hold.

The map SHALL work out which shapes draw when the shape set, the category table, the
**shape** category visibility or the shape name filter changes, and SHALL NOT work it out
per frame. A change of the **system** flag alone SHALL NOT sweep the shapes, because no
shape reads that flag. With 1,024 spheres and 4,096 lines each naming 4 categories, and
every category turned off for shapes in one call, that work SHALL cost less than **2
milliseconds** on the main thread for the first switch that follows the arrival of the set,
and less than **1 millisecond** for every switch after it. The page SHALL expose the
reading so a test can read it.

The two bounds are one measurement and not two budgets. The set arrives with a sweep of its
own, and the switch that follows it still runs code the engine has not compiled, so it
reads 0.4 to 1.1 milliseconds in the browser gate. Every switch after that one reads 0.0 to
0.2. Both are far under the 16.7 milliseconds of a frame at 60 Hz, so neither drops a
frame; the bounds hold the sweep to the shape of a linear pass over the set and catch a
rule that reads the table per shape.

The split adds one map read for each category in the sweep and not one for each shape, so
the sweep keeps the shape of a linear pass and the bounds do not move.

The change SHALL reach the next frame with no rebuild of the scene data.

A category replaced under the same name SHALL keep **both** the flags it had, and every
shape that names it SHALL take the new colour in the next frame, by the rule a marker
follows.

#### Scenario: A category that is off removes its shapes

- **WHEN** the browser test adds the categories `A` and `B`, one sphere in `A` and one in
  `B` at a view that draws both, takes a screenshot, calls
  `setShapeCategoryVisible('A', false)`, draws a frame and takes a second screenshot
- **THEN** the two screenshots differ, and the second is byte-identical to the frame the
  same view draws with the sphere of `A` never added

#### Scenario: A shape switch leaves the markers of its category

- **WHEN** a unit test adds the category `A`, one system naming `A` and one sphere naming
  `A`, calls `setShapeCategoryVisible('A', false)` and reads the marker count and the
  sphere, then calls `setShapeCategoryVisible('A', true)` and `setCategoryVisible('A',
  false)` and reads both again
- **THEN** the first reading holds the marker and no drawn sphere, and the second holds the
  sphere and no drawn marker

#### Scenario: Clearing the shapes turns the shape flags back on

- **WHEN** a unit test adds one category and one sphere naming it, calls
  `setShapeCategoryVisible` with `false`, calls `clearShapes()`, adds the same sphere
  again, and reads `isShapeCategoryVisible` of that category and the sphere
- **THEN** the reading is `true` and the sphere is drawn

#### Scenario: An unknown name moves no shape

- **WHEN** a unit test calls `setShapeCategoryVisible('nothing', false)` on a map whose
  table holds one other category and one sphere naming it, then reads
  `isShapeCategoryVisible('nothing')`, `isShapeCategoryVisible` of the category it does
  hold, and the sphere
- **THEN** the first is `false`, the second is `true`, the sphere is drawn, and no call
  threw

#### Scenario: A secondary category keeps a shape on the screen

- **WHEN** a unit test adds the categories `A` and `B`, one line whose `categories` are `A`
  then `B`, turns `A` off for shapes and reads `getShapeInfo('line', 0)`, then turns `B`
  off for shapes as well and reads it again
- **THEN** the first reading is drawn and the second is not

#### Scenario: A shape with no category is not reached by a switch

- **WHEN** a unit test adds one category, one sphere naming it and one sphere naming none,
  calls `setShapeCategoryVisible` with `false` for that category, and reads both shapes
- **THEN** the first is not drawn and the second is drawn

#### Scenario: A shape with no colour follows the first category that is on

- **WHEN** the browser test adds the categories `A` in (255, 0, 0) and `B` in (0, 255, 0),
  one line carrying no `color` whose `categories` are `A` then `B`, draws a frame and reads
  a pixel on the line, turns `A` off for shapes, draws and reads again
- **THEN** the first reading is red and the second is green, each within 8 of each channel

#### Scenario: A shape with a colour keeps it

- **WHEN** the browser test adds the category `A` in (255, 0, 0), one line in (0, 0, 255)
  naming `A`, draws a frame and reads a pixel on the line
- **THEN** the reading is (0, 0, 255) within 8 of each channel

#### Scenario: The sweep holds its budget

- **WHEN** the browser test adds 256 categories, 1,024 spheres and 4,096 lines each naming
  4 of them, turns every category off for shapes in one call, reads the sweep measurement
  the page exposes, then switches every category on and off for shapes three more times and
  reads it again
- **THEN** the first reading is under 2 milliseconds and the last reading is under 1
  millisecond
