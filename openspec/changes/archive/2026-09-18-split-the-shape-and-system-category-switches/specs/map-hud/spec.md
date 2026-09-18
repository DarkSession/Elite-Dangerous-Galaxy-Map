## MODIFIED Requirements

### Requirement: The category browser lists the categories and turns them off

The category panel SHALL hold two tabs, **SYSTEMS** and **SHAPES**, and SHALL show the
list of one of them at a time. The panel SHALL open on **SYSTEMS**.

The **SHAPES** tab SHALL be disabled while the map holds no shape, and the panel SHALL
fall back to **SYSTEMS** where the shown tab is **SHAPES** and the last shape goes, which
a dataset switch does.

One table holds the categories of the systems and of the shapes, which `map-shapes`
states, so the two tabs are two readings of one table and not two tables. A category holds
**two** visibility flags, one for its systems and one for its shapes, which `map-shapes`
also states. **Each tab reads and writes the flag of its own kind alone.** The same
category can therefore read on in one tab and off in the other, and a user who clears the
shapes of a category keeps its markers. The **SYSTEMS**
tab SHALL hold one row per category that holds at least one system, and the **SHAPES** tab
one row per category that holds at least one shape, each in the order the table holds them.
A category that holds neither SHALL have no row in either tab: a row that counts nothing
switches nothing the user can see.

A row SHALL show the category's colour as a dot, its name and its count. The count SHALL
be the number of **things of the shown tab** that belong to that category, by their primary
category **or** any secondary category. A system or a shape that belongs to three
categories is counted in all three rows.

**The dot switches the category and the rest of the row opens the list.** A click on the
dot SHALL call the setter of the shown tab's kind with the opposite of what the row holds:
`setCategoryVisible` in the **SYSTEMS** tab and `setShapeCategoryVisible` in the **SHAPES**
tab. A click
anywhere else on the row SHALL open the row's list, or fold it when it is open. The two
jobs took one button and a second small button before, and a user who wanted the list
switched the category off instead.

A row of a category that is off **for the kind of the shown tab** SHALL show it: its dot is
hollow and its name is dimmed. A row reads the flag of its own tab, so the row of a
category in the other tab is unmoved.

The panel SHALL hold an **ALL** button and a **NONE** button, which turn every category
**the shown tab lists** on and off together, **for the kind of that tab alone**. A category
the tab does not list SHALL NOT move: the buttons act on what the user can see. A category
that holds both kinds SHALL keep the flag of the kind the tab does not show, so **NONE** in
the **SHAPES** tab leaves every marker on the screen.

A category's `description`, which `real-systems` already carries, SHALL be the row's
`title`, so the browser shows it as a tooltip.

The panel SHALL rebuild its rows when the category table changes, when the system set
changes and when the shape set changes, and not on a frame where none of the three
changed. The table holds at most 256 categories, so the panel holds at most 256 rows.

#### Scenario: A row toggles its category

- **WHEN** the browser test adds two categories and one system in each, clicks the dot of
  the first row, draws a frame, and reads the marker count and `isCategoryVisible` of that
  category
- **THEN** the count is 1 and the reading is `false`

#### Scenario: The rest of the row opens the list

- **WHEN** the browser test clicks the name of the first row, reads the lists and
  `isCategoryVisible` of that category, and clicks the name again
- **THEN** the first click opens one list and leaves the category on, and the second click
  folds it

#### Scenario: The counts read the primary category

- **WHEN** the browser test adds the categories `A` and `B`, then two records whose primary
  category is `A` and one of them names `B` as a secondary category
- **THEN** the row for `A` reads 2

#### Scenario: The counts read the secondary categories as well

- **WHEN** the browser test reads the row for `B` in the frame the scenario above set up
- **THEN** the row for `B` reads 1, because one of the two records names `B`

#### Scenario: The counts hold with the demo set

- **WHEN** the browser test opens the demo site with the Guardian Ruins set and reads the
  three category rows and `systemCount`
- **THEN** the three counts add up to more than `systemCount`, because 166 of the 212
  systems hold more than one ruin layout

#### Scenario: ALL and NONE move every row

- **WHEN** the browser test adds three categories, each holding one system, clicks
  **NONE**, reads the marker count, clicks **ALL** and reads it again
- **THEN** the first reading is 0 and the second is the whole set

#### Scenario: Each tab lists the categories that hold its own kind

- **WHEN** the browser test adds the categories `A`, `B` and `C`, one system in `A`, one
  sphere in `B`, one line in `A`, and nothing in `C`, then reads the rows of the
  **SYSTEMS** tab, clicks **SHAPES** and reads the rows again
- **THEN** the first reading holds `A` alone, the second holds `A` and `B`, `A` reads a
  count of 1 and then 1, `B` reads 1, and `C` has no row in either tab

#### Scenario: The shapes tab is disabled with no shape

- **WHEN** the browser test builds a map with the HUD on and one category and one system,
  reads the **SHAPES** tab, adds one sphere in that category, waits for the panel to
  rebuild and reads the tab again
- **THEN** the first reading is disabled and the second is not

#### Scenario: The panel falls back when the shapes go

- **WHEN** the browser test adds one category, one system and one sphere, clicks
  **SHAPES**, calls `clearShapes()`, waits for the panel to rebuild and reads which tab is
  shown
- **THEN** the panel shows **SYSTEMS**

#### Scenario: NONE does not move a category the tab hides

- **WHEN** the browser test adds the categories `A` and `B`, one system in `A` and one
  sphere in `B`, clicks **NONE** in the **SYSTEMS** tab, and reads `isCategoryVisible` of
  both
- **THEN** `A` reads `false` and `B` reads `true`

#### Scenario: NONE in the shapes tab leaves the systems

- **WHEN** the browser test adds one category holding one system and one sphere, clicks
  **SHAPES**, clicks **NONE**, draws a frame, and reads the marker count,
  `isCategoryVisible` and `isShapeCategoryVisible` of that category
- **THEN** the marker count is 1, `isCategoryVisible` is `true` and
  `isShapeCategoryVisible` is `false`

#### Scenario: A row reads the flag of its own tab

- **WHEN** the browser test adds one category holding one system and one sphere, clicks the
  dot of its row in the **SYSTEMS** tab, clicks **SHAPES** and reads the row, then clicks
  the dot there, clicks **SYSTEMS** and reads the row again
- **THEN** the **SHAPES** row reads on while the **SYSTEMS** row is off, and the
  **SYSTEMS** row still reads off after the shape dot moved

### Requirement: A category expands into a list of its systems

A click on a category row, away from its colour dot, SHALL open the row into a list and
fold it again. At most one category SHALL be open at a time while the search box is empty.
While the search box holds text, every category that holds a match SHALL be open, which the
requirement "The search box filters the systems by name" states.

A row of the list SHALL show the name alone. In the **SYSTEMS** tab that is the system's
name. In the **SHAPES** tab it is the shape's `name`, and a shape that carries none SHALL
read its kind and its place in the set, for example `SPHERE 12` or `LINE 7`.

**The row SHALL NOT show the distance from Sol.** The information panel states the
distance from Sol of the system the user selects, and the row is a way to reach a thing by
name. A number beside every name is a second reading of the same thing in the place the
user is reading names.

The list SHALL hold the systems, or the shapes, that belong to the row's category, by their
primary category **or** any secondary category, and whose name the filter of that tab
keeps, in order of name.

**The row cap is shared over the open lists.** The lists together SHALL show at most
**200** rows, and each open list SHALL show at most `floor(200 / open)` rows, where `open`
is the count of open lists. A list that was cut SHALL say so, with the number shown and the
number held. The cap is what keeps the DOM bounded: one category may hold all 10,000 systems
of a full set, or all 4,096 lines of a full shape set, and a search may open every category
at once.

One open list therefore keeps the 200 rows it holds today, and twenty open lists hold ten
rows each.

**Where more than 200 lists are open**, `floor(200 / open)` is 0. The **first 200 open lists
in the panel's own order** SHALL show one row each and every open list past the 200th SHALL
show none. The panel holds up to 256 category rows, so a filter that matches in every
category reaches this. A list that shows no row is still marked open and still states the
count it holds, so the user sees that the category matched and narrows the filter to read
it. Without this rule 256 open lists would draw 256 rows, which breaks the budget the cap is
there to hold.

**The open lists take the height the rows leave, and at least half the panel.** The panel's
list area is the box under the tabs and the search box. The open lists together SHALL take
every pixel of that area the category rows leave, and SHALL take at least **50 per cent** of
it where the rows leave less. A list with fewer rows than that height holds SHALL take the
height of its rows alone and no more, so a category of two systems does not stretch over
half the panel. Where the rows and the open lists together pass the area, the rows SHALL
scroll.

The height of one open list is therefore `min(the height of its rows, its share of the
space)`, where the share is the space the rule above gives the open lists divided evenly by
the number of them. A list that needs less than its share SHALL NOT pass its remainder to
another open list: a search that opens twelve categories then moves no list when the user
folds one of them. A list whose share holds less than one row SHALL scroll inside that
share, which is what 256 open lists give: the share is then about 3 CSS pixels against a
row of about 18, and the panel is telling the user to narrow the filter. The panel SHALL work the share out again when it rebuilds, when a list
opens or folds, and when the list area changes size.

The list was capped at 210 CSS pixels, which is a quarter of the 807 pixel panel. A list of
200 rows scrolled inside that quarter while the rest of the panel stood empty.

**A list SHALL open and close over 140 milliseconds.** The movement is a height change on
the list alone. Where the reader asks for reduced motion, through `prefers-reduced-motion`,
the list SHALL take its open state and its folded state at once, with no movement.

A click on a **system** row SHALL select that system and turn the row's category on **for
systems** if it is off. The selection centres the camera on it and caps the distance at
500 light years, which `system-selection` states, so the row needs no move of its own.

A click on a **shape** row SHALL turn the row's category on **for shapes** if it is off,
and SHALL leave the systems of that category where they are. It SHALL fly the camera to
the shape: the cursor to the shape's `centre` and the distance to **twice its
`reach`**, which `map-shapes` defines, with the yaw and the pitch unchanged. Half the field
of view is 30 degrees, so twice the reach is the distance at which the shape fills the
frame. The distance SHALL take the zoom limits and the browsable bounds a flight already
takes. A shape row SHALL NOT change the selection, because a shape is never picked and
never selected.

#### Scenario: The list opens, closes and holds one category at a time

- **WHEN** the browser test opens the first category with the search box empty, reads the
  lists, opens the second, and reads again
- **THEN** the first reading holds one list and the second holds one list, under the
  second category

#### Scenario: The list is capped and says so

- **WHEN** the browser test adds one category with 1,000 systems and opens it
- **THEN** the list holds 200 rows and the panel says 200 of 1,000

#### Scenario: The rows are shared over the open lists

- **WHEN** the browser test adds 4 categories of 300 systems each, every name holding `a`,
  types `a` in the box, waits 300 ms, and counts the rows of each open list and of all of
  them together
- **THEN** each list holds 50 rows, each says 50 of 300, and the total is 200

#### Scenario: More open lists than rows

- **WHEN** the browser test adds 256 categories of 3 systems each, every name holding `a`,
  types `a` in the box, waits 300 ms, and counts the open lists, the rows of all of them
  together, and the lists that hold no row
- **THEN** 256 lists are open, the rows together number 200, and 56 lists hold no row while
  still stating the count they hold

#### Scenario: A row holds the name alone

- **WHEN** the browser test opens a category and reads the text and the attributes of one
  system row
- **THEN** the row's text is the system's name, the row carries no `data-distance`
  attribute, and the row's own box holds no second reading

#### Scenario: A row selects and centres

- **WHEN** the browser test opens a view at 20,000 light years with a yaw of 40, opens a
  category, clicks the third row, and reads the selection and the view
- **THEN** the selection names that system, the cursor is that system's position, the
  distance is 500 and the yaw is 40

#### Scenario: One system shows in every list it belongs to

- **WHEN** the browser test adds the categories `A` and `B` and one system whose primary
  category is `A` and whose secondary categories hold `B`, opens `A`, reads the list,
  opens `B` and reads it again
- **THEN** both lists hold that system

#### Scenario: A shape row names the shape

- **WHEN** the browser test adds one category, one sphere named `Col 70 Sector` and one
  line with no name, clicks **SHAPES**, opens the category and reads the two rows
- **THEN** the rows read `Col 70 Sector` and `LINE 0`

#### Scenario: A shape row flies the camera and selects nothing

- **WHEN** the browser test adds one category, one system, one sphere of radius 500 light
  years at (1000, 0, 2000) in that category, selects the system, opens a view at 20,000
  light years with a yaw of 40, clicks **SHAPES**, opens the category, clicks the row and
  waits for the flight to end
- **THEN** the cursor is (1000, 0, 2000), the distance is 1,000, the yaw is 40 and the
  selection is still the system

#### Scenario: A shape row turns its category back on

- **WHEN** the browser test clicks the dot of a shape category in the **SHAPES** tab, reads
  `isShapeCategoryVisible`, clicks the row to open the list, clicks the first shape row and
  reads it again
- **THEN** the readings are `false` and `true`

#### Scenario: The open list takes the space the rows leave

- **WHEN** the browser test adds 3 categories of 1,000 systems each, opens one, and reads
  the box of the open list, the box of the list area and the boxes of the three rows
- **THEN** the open list's height is the list area's height less the height of the three
  rows, within 2 pixels

#### Scenario: The open list keeps half the panel

- **WHEN** the browser test adds 40 categories of 1,000 systems each, opens one, and reads
  the box of the open list and the box of the list area
- **THEN** the open list's height is at least half the list area's height

#### Scenario: A short list takes the height of its rows

- **WHEN** the browser test adds 3 categories, one of them holding 2 systems, opens that
  one, and reads the box of the open list and the box of one of its rows
- **THEN** the open list's height is about twice the row height and far under half the
  list area

#### Scenario: The list moves when it opens

- **WHEN** the browser test reads the computed transition duration of a system list, then
  emulates `prefers-reduced-motion: reduce`, rebuilds the HUD and reads it again
- **THEN** the first reading is 140 ms and the second is 0
