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
be the number of **things of the shown tab** that belong to that category. A thing that
belongs to three categories is counted in all three rows.

**The count reads the search box.** While the filter of the shown tab is **empty**, the
count SHALL be the total. While it holds text, the count SHALL read
`<matches> of <total>`, where `<matches>` is the number of things of that row the filter
keeps and `<total>` is the number it holds in all. Both numbers SHALL be written in the
whole-number format the HUD already uses, so a row of 1,116 systems with three matches
reads `3 of 1,116`. A row whose things the filter all drop SHALL read `0 of <total>` and
SHALL keep its row, because a row that vanished on a search would tell the user the
category is gone rather than that it holds no match.

The match count SHALL be worked out with the same comparison the map makes: the text is
not trimmed and the match is not case sensitive.

**A tab that holds no row shows a flat list.** Where the shown tab holds **no** category
row while the map holds at least one thing of that tab's kind, the panel SHALL show one
list of those things in place of the rows. This is the panel of an uncategorised system
set, which `real-systems` allows, and of a shape set every shape of which names no
category.

**A mixed set is not a flat list.** Where one shape of the set names a category and another
names none, the tab holds a row and the flat list SHALL NOT appear. The shape that names
none keeps no row, which is what it has today, and the rule "A shape draws when a category
it names is on" already keeps it drawn. The all-or-nothing rule `real-systems` states binds
the systems alone, so the shapes of a set such as the demo's `adamastor` can be mixed and
this change does not reach them.

The flat list SHALL:

- hold no dot, no colour swatch, no category name and no count;
- carry a row per thing, which reads and acts exactly as a row of an open category list
  does, by the requirement "A category expands into a list of its systems";
- take that requirement's row budget and its `<shown> of <total>` cut line;
- be filtered by the search box, by the same comparison a category list is filtered by;
- show the **ALL** and **NONE** buttons **disabled**, because no switch reaches a thing
  that names no category.

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

The pass that counts the matches SHALL run when the filter text changes and SHALL NOT run
per frame. It SHALL read each thing of the shown tab **once per category that thing names**,
because it runs the row filter per row: 10,000 systems over 8 categories with 4 names each
is **40,000** reads, and 5,120 shapes over the same table is 20,480. Each read is one
case-insensitive compare against a filter of a few characters. The pass SHALL cost less
than **2 milliseconds** on the main thread. The box gives its text to the filter at most
once per 150 ms, so the pass runs at most that often.

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

- **WHEN** the browser test adds the categories `A` and `B`, then two records whose
  `categories` both begin with `A`, one of which also holds `B`
- **THEN** the row for `A` reads `2`

#### Scenario: The counts read the secondary categories as well

- **WHEN** the browser test reads the row for `B` in the frame the scenario above set up
- **THEN** the row for `B` reads `1`, because one of the two records names `B` after `A`

#### Scenario: The counts hold with the demo set

- **WHEN** the browser test opens the demo site with the Guardian Ruins set and reads the
  three category rows and `systemCount`
- **THEN** the three counts add up to more than `systemCount`, because 166 of the 212
  systems hold more than one ruin layout

#### Scenario: A search rewrites the counts

- **WHEN** the browser test adds the category `A` holding the systems `Sol`, `Solati` and
  `Achenar` and the category `B` holding `Beta`, types `sol` in the box, waits 300 ms and
  reads both rows, then clears the box, waits 300 ms and reads them again
- **THEN** the first reading is `2 of 3` for `A` and `0 of 1` for `B`, and the second is
  `3` and `1`

#### Scenario: A row with no match keeps its row

- **WHEN** the browser test reads the row for `B` in the frame the scenario above set up
  while the box holds `sol`
- **THEN** the row is in the panel, it reads `0 of 1`, and its dot still switches the
  category

#### Scenario: An uncategorised set shows a flat list

- **WHEN** the browser test builds a map with the HUD on, no category and the systems
  `Sol`, `Solati` and `Achenar`, and reads the **SYSTEMS** tab
- **THEN** the tab holds no category row, it holds one list of the three names in order of
  name, and **ALL** and **NONE** are disabled

#### Scenario: The flat list selects and filters

- **WHEN** the browser test types `sol` in the box, waits 300 ms, reads the list, then
  clicks the row named `Sol` and reads `getSelection()`
- **THEN** the list holds `Sol` and `Solati`, and the reading names `Sol`

#### Scenario: The shapes tab shows a flat list for uncategorised shapes

- **WHEN** the browser test adds one category, one system in it, and two spheres named
  `Alpha Zone` and `Beta Zone` that name no category, clicks **SHAPES** and reads the tab
- **THEN** the tab holds no category row and holds one list of the two shape names

#### Scenario: One categorised thing removes the flat list

- **WHEN** the browser test adds a category and one system in it to the uncategorised map
  of the scenario above, waits for the panel to rebuild and reads the **SYSTEMS** tab
- **THEN** the tab holds one category row and no flat list

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

#### Scenario: The count pass holds its budget

- **WHEN** the browser test adds 10,000 systems over 8 categories, each naming 4 of them,
  types one character in the box, waits 300 ms and reads the measurement the page exposes
  for the count pass
- **THEN** the reading is under 2 milliseconds

### Requirement: The search box filters the systems by name

The category panel SHALL hold a text box. In the **SYSTEMS** tab its text SHALL go to
`setNameFilter`, which `real-systems` defines, and in the **SHAPES** tab to
`setShapeNameFilter`, which `map-shapes` defines. Either call SHALL be made at most once
per **150 ms** while the user types, and once more after the user stops.

The filter reaches the map as well as the lists: the user is asking the map to show the
thing they are looking for, and a list that narrows over a map that does not would leave
the marker or the shape they want among thousands they do not.

**The filter also rewrites the counts beside the rows**, by the rule the requirement "The
category browser lists the categories and turns them off" states, so the count agrees with
the list the row opens into.

Clearing the box SHALL clear the filter and bring everything back.

**A change of tab SHALL clear the filter of the tab it leaves** and SHALL empty the box.
Only one filter is therefore ever in force, and no filter is held on a kind whose box the
user cannot see.

The movement keys SHALL NOT reach the camera while the user types in the box, which
`map-navigation` holds with its form-field guard.

**A filter opens every category that holds a match.** **Each time the filter text changes**
to a text that is not empty, the open set SHALL become exactly the categories that hold at
least one thing the filter keeps. A category the user turned off SHALL open as well, because
a click on the dot of one of its rows turns it back on.

Without this the user types a name, the panel narrows every list it is not showing, and the
one match sits inside a folded row. The panel would answer a search by hiding the answer.

**The open set is state, not a reading of the filter text.** A change of the text writes it;
nothing else does, and a redraw of the panel does not. Between two changes of the text a
click on a row SHALL fold and open one category in that set, so a user who does not want a
list can close it, and the fold SHALL hold until the text changes again. The panel is rebuilt
on every move of the camera, so a set worked out from the text on each rebuild would undo the
user's fold on the next frame.

**Clearing the box gives the panel back to the user's own row.** Where the filter text
becomes empty, the open categories SHALL be the one category the user last opened by hand,
and none where the user opened none. The panel therefore holds one open list before a
search and one after it.

Each tab SHALL hold an open set of its own, so a tab the user comes back to reads as they
left it.

**A flat list has no open set.** Where the tab shows the flat list the requirement above
states, the box filters that one list and opens and folds nothing.

#### Scenario: A list folded during a search stays folded

- **WHEN** the browser test adds 3 categories whose names all hold `a`, each holding
  systems, types `a` in the box, waits 300 ms, folds one open list with a click on its row,
  moves the camera to force a rebuild of the panel, and counts the open lists
- **THEN** two lists are open after the fold and still two after the rebuild, and typing one
  more letter that keeps all three categories opens all three again

#### Scenario: Typing narrows the markers and the lists

- **WHEN** the browser test adds systems named `Sol`, `Solati` and `Achenar`, types `sol`
  in the box, waits 300 ms, draws a frame, and reads the marker count and the expanded
  system list
- **THEN** the count is 2 and the list holds `Sol` and `Solati`

#### Scenario: The box does not call the filter on every key

- **WHEN** the browser test types 10 characters into the box within 200 ms and counts the
  calls to `setNameFilter`
- **THEN** the count is 3 or fewer

#### Scenario: A search opens every category that holds a match

- **WHEN** the browser test adds the categories `A`, `B` and `C`, puts `Alpha` and `Beta` in
  `A`, `Alpha Two` in `B` and `Gamma` in `C`, folds every row, types `alpha` in the box,
  waits 300 ms and reads which categories are open
- **THEN** `A` and `B` are open, `C` is folded, and each open list holds only the names the
  filter keeps

#### Scenario: A search opens a category that is switched off

- **WHEN** the browser test turns category `B` off, types `alpha` in the box and waits 300
  ms
- **THEN** `B` is open and its list holds `Alpha Two`

#### Scenario: Clearing the box leaves one open list

- **WHEN** the browser test opens `C` by hand, types `alpha`, waits 300 ms, reads which
  categories are open, clears the box, waits 300 ms and reads again
- **THEN** the first reading holds `A` and `B` and the second holds `C` alone

#### Scenario: The box filters the shapes in the shapes tab

- **WHEN** the browser test adds one category, three spheres named `Sol Zone`,
  `Solati Zone` and `Achenar Zone`, clicks **SHAPES**, types `sol`, waits 300 ms, draws a
  frame and reads `getShapeNameFilter()`, `getNameFilter()` and the open list
- **THEN** the shape filter reads `sol`, the system filter is empty, and the list holds
  `Sol Zone` and `Solati Zone`

#### Scenario: A change of tab clears the filter it leaves

- **WHEN** the browser test types `sol` in the **SYSTEMS** tab, waits 300 ms, clicks
  **SHAPES**, and reads `getNameFilter()`, the box and the marker count
- **THEN** the filter is empty, the box is empty, and every marker is back

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

The list SHALL hold the systems, or the shapes, that belong to the row's category, by
**any** of the names in their `categories`, and whose name the filter of that tab keeps, in
order of name.

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

- **WHEN** the browser test adds the categories `A` and `B` and one system whose
  `categories` reads `['A', 'B']`, opens `A`, reads the list, opens `B` and reads it again
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

### Requirement: The information panel shows the selected system

The information panel SHALL be hidden while nothing is selected, and SHALL open on the
selection. It SHALL hold, in this order:

1. A header with the system's name, a copy button beside the name, and a close button.
2. A grid of fields: the position in game coordinates with a copy button, the distance
   from Sol, the range from the cursor, the **galactic region**, then `primaryStar`,
   `allegiance`, `government`, `primaryEconomy`, `security`, `population` and `bodyCount`,
   and last the host's **grid values**, which `system-details` defines, in the order the
   answer gave them. A field the record does not carry SHALL be left out, not shown empty.
   The position is always shown. The distance from Sol, the range and the region are
   worked out from the position and are shown unless `infoFields` turns them off.
3. The categories, as one chip per name in the record's `categories`, in the record's own
   order, each in that category's colour. A system that names **no** category SHALL carry
   no chip and no empty chip row in place of one, which the `real-systems` requirement
   "A set holds categories or holds none" allows.
4. The description, drawn as **Markdown**, which `system-details` defines. It is the loaded
   description when `details` gave one, and the record's `description` otherwise. The
   section is left out when there is neither.
5. The host's **section values**, which `system-details` defines, each drawn as its own
   section with the entry's `label` as the title and its `markdown` as the body, in the
   order the answer gave them.
6. The images, when the record carries any.
7. A footer with a **centre view** button, and one button per `actions` entry of the answer
   the `details` loader gave. The centre view button moves the cursor to the system and
   takes the same bounds clamp a selection takes, which `system-selection` states, so it
   lands on the nearest allowed cursor where the system lies outside the browsable bounds.

The field grid SHALL hold **two columns**, as the mockup draws it, and the position field
SHALL carry the mockup's label `POSITION`. A field alone on its row SHALL take both columns,
so the grid shows no empty cell.

**`POSITION` SHALL take both columns.** It holds the longest value of the panel, three
coordinates of up to five decimal places each, and one column of two is too narrow for it:
the value wraps onto a second line, and the copy button beside the label crowds the label.

`DISTANCE FROM SOL` and `RANGE` SHALL then share the row under it, one column each. Both
hold a whole number of light years and a unit, which is the shortest value the panel shows,
so the pair fits one row with room to spare.

**`REGION` SHALL take both columns**, on the row under those two. A region name runs to 26
characters, as `Outer Scutum-Centaurus Arm` does, and one column of two is too narrow for
it, by the same reading `POSITION` takes.

**The grid SHALL hold no empty cell.** The library SHALL place the fields in the order this
requirement states. `POSITION` and `REGION` take two cells each and every other field takes
one. A one-cell field that would leave the other cell of its row empty SHALL take both
columns instead. That rule covers the last field of the grid, and a one-cell field that a
two-cell field follows.

With the position and the three worked-out fields shown they fill exactly **six cells**, whatever the record
holds, so the fields after them start on a fresh row and an **odd** count of those later
fields leaves the last one alone on its row.

**`infoFields` turns the three worked-out fields off.** `HudOptions` SHALL carry
`infoFields`, an object with the boolean fields `distanceFromSol`, `range` and `region`.
Each one is true unless the host names it false, and a value that is not a boolean takes
the default. The setting covers **every** system, not one record. A field the host turned
off SHALL NOT be built, and the rule above still fills the grid: with the distance off and
the region on, `RANGE` is alone on the row under `POSITION` and takes both columns.

With `region` false the panel SHALL NOT call `regionNameAtExact` for any system, so a host
that turned the field off never fetches the 199 KiB region cell chunk that call loads,
which `real-systems` states. A host that turns a field off pays nothing for it.

**The position SHALL NOT be rounded to a whole light year.** Each of the three game
coordinates SHALL be shown to at most **5 decimal places**, with the trailing zeros dropped
and a thousands separator on the whole part. A coordinate that is a whole number SHALL show
no decimal point.

The game resolves a position to 1/32 of a light year, which is 0.03125. Five decimal places
**reproduce** every such value exactly, because 1/32 is 5 places in base ten and every
multiple of it is 5 places or fewer. The field was 3 places, which separated every game
position but showed none of the odd steps as the game holds it: `-9530.9375` read
`-9,530.938`. The record carries the value the host's dump gave, in `float64`, and the panel
SHALL show that value and not the whole number it rounds to.

`DISTANCE FROM SOL` and `RANGE` SHALL NOT change. They are distances the user reads to judge
a journey, not the identity of a place, and a whole light year is the right resolution for
them.

**`RANGE` SHALL be the distance from the cursor to the system**, and not the distance from
the camera. The cursor is the point the user aims at; the camera is a point behind them that
an orbit moves. Under the camera rule the field changed while the user turned the view and
moved nothing, which read as the system drifting.

**A landed selection therefore reads `0 LY`**, unless browsable bounds hold the cursor
short of the system. A selection puts the cursor on the system, which `system-selection`
states, so once the flight ends the range is 0 until the user pans away. Where the system
lies outside the active bounds the flight lands on the nearest allowed cursor, and the field
reads what is left of the distance. The field then reports how far the user has moved from the system they selected. The
owner chose this reading over the camera one with that consequence in front of them.

The **range from the cursor** follows the view, so the panel SHALL rewrite it at most 10
times a second, by the same rule as the top bar. Every other field changes only with the
selection.

**`REGION` SHALL name the codex region the system sits in, resolved exactly.** The panel
SHALL read it through the handle's `regionNameAtExact`, which resolves on the game's own
49.3494 light year grid, and SHALL NOT read `regionNameAt`, whose coarse grid has cells of
197.3976 light years. The panel states one system's region as a fact, and a user cannot tell
a wrong one from a right one, so a system within about 100 light years of a boundary must
not be given its neighbour's name. `galactic-regions` states both calls.

The lookup is a promise, because the region table loads on its first use. The field SHALL
therefore:

- be placed as soon as the panel opens, with an **empty value**, so the grid does not reflow
  when the answer arrives;
- take the name when the promise resolves;
- read **`Unknown`** where the promise resolves to null, which is a position the region map
  does not cover, and where the promise rejects.

A lookup whose selection has changed before it resolves SHALL be dropped, so a slow first
load cannot write the region of a system the user has left.

The first lookup of a page fetches the region table; every one after it answers from the
table already loaded. Only the first selection therefore shows an empty region field for
more than a frame.

**Centre view** SHALL move the view's cursor to the system and SHALL keep the distance,
the yaw and the pitch. The selection itself already centres the system and caps the
distance at 500 light years, which `system-selection` states, so this button is what brings
a system back after the user has flown away from it, and it keeps the zoom they moved to,
however far out that is.

The close button SHALL clear the selection.

**The copy buttons.** The name's button SHALL write the system's name to the clipboard.
The position's button SHALL write the three game coordinates as
`x / y / z`, each with the same digits the field shows and no thousands separator, so what
is copied can be pasted into a field that takes a number. The panel keeps showing the
position with its thousands separators: the separator is for reading and the copy is for
pasting.

A button that has just written SHALL show a tick for **1.4 seconds** and then show its
copy mark again. Only one button SHALL show a tick at a time. A click on one while the
other shows a tick SHALL move the tick.

Each button SHALL carry an accessible name: `Copy system name` and `Copy position` while
idle, and `Copied` while the tick shows.

The clipboard is not always there: a browser may refuse the write, and a page served over
plain HTTP has no `navigator.clipboard`. A refused write SHALL NOT throw out of the HUD and
SHALL NOT stop the frame loop. The button SHALL show no tick when the write failed.

A click on a copy button SHALL NOT clear or change the selection.

**A host's grid value carries a copy button where its entry gives a `copy`.** The button
SHALL write that text, and its accessible name SHALL be `Copy ` and the entry's label, so
a panel with two host buttons names each one. The tick rule above covers it: one tick at a
time, and a click on a second button moves the tick. Each button therefore SHALL carry a
key of its own, which is the entry's label, so a host button and the position button do
not share one.

An `actions` entry of the loader's answer SHALL draw as a button with its `label`, and a
click SHALL call its `onSelect` with the selected system. The library SHALL NOT read what
`onSelect` returns and SHALL NOT let a failure in it stop the frame loop.

**The host buttons arrive with the answer.** The panel SHALL draw the footer and its centre
view button before it calls the loader, so the footer is never missing, and SHALL add the
host buttons when the answer arrives. Where the host gives no loader, where the answer
carries no `actions`, where the load fails and where it never settles, the footer SHALL
hold the centre view button alone. A host that wants the same buttons on every system
returns them from the loader for every system.

#### Scenario: The panel opens on a selection and shows the record

- **WHEN** the browser test adds a record with a name, coordinates, an allegiance, a
  population and a description but no `primaryStar`, selects it, and reads the panel
- **THEN** the panel is shown, the header holds the name, the grid holds the position, the
  distance from Sol, the range from the cursor, the allegiance and the population, there
  is no primary star field, and the description is shown

#### Scenario: The position keeps its fraction

- **WHEN** the browser test selects a record at `x = -9530.9375`, `y = -910.28125` and
  `z = 19808.125`, and reads the position field
- **THEN** it reads `-9,530.9375 / -910.28125 / 19,808.125`, which is each value exactly

#### Scenario: A whole coordinate shows no decimal point

- **WHEN** the browser test selects a record at `x = 100`, `y = 0` and `z = -25.5`, and
  reads the position field
- **THEN** it reads `100 / 0 / -25.5`

#### Scenario: The distance fields stay whole

- **WHEN** the browser test selects the record of the scenario above and reads
  `DISTANCE FROM SOL` and `RANGE`
- **THEN** both hold a whole number of light years and the unit `LY`, and neither holds a
  decimal point.

  The record sits 103 light years from Sol, and the flight has not run, so `RANGE` holds the
  distance from the cursor as it stands. Neither field passes 1,000 and neither shows a
  thousands separator. The separator is what the scenario "The position keeps its fraction"
  reads, in `-9,530.9375`

#### Scenario: A landed selection reads a range of zero

- **WHEN** the browser test selects a system, with no browsable bounds set, waits for the
  selection flight to end, and reads `RANGE`
- **THEN** it reads `0 LY`

#### Scenario: An orbit does not change the range

- **WHEN** the browser test selects a system, waits for the flight to end, pans the cursor
  400 light years away, reads `RANGE`, then orbits the camera by 120 degrees of yaw and 40
  degrees of pitch and reads `RANGE` again
- **THEN** both readings are `400 LY` within 1 light year

#### Scenario: A zoom does not change the range

- **WHEN** the browser test selects a system, waits for the flight to end, pans the cursor
  400 light years away, reads `RANGE`, then zooms from 500 to 20,000 light years and reads
  it again
- **THEN** both readings are `400 LY` within 1 light year

#### Scenario: The position takes both columns and the two distances share a row

- **WHEN** the browser test selects a record that gives the three fields alone, and reads
  the box of `POSITION`, of `DISTANCE FROM SOL`, of `RANGE` and of the grid
- **THEN** `POSITION` is as wide as the grid, `DISTANCE FROM SOL` and `RANGE` are each
  about half of it, the two sit on one row with the same top edge, and that row is below
  `POSITION`

#### Scenario: The position value does not wrap

- **WHEN** the browser test selects the record at `x = -9,530.9375`, `y = -910.28125` and
  `z = 19,808.125`, whose position is the longest value the panel shows, and reads the box
  of the position value
- **THEN** the value's box is one line high, by the line height its own style gives

#### Scenario: An odd count of fields leaves no empty cell

- **WHEN** the browser test selects a record that gives **five** fields, the four above and a
  primary star, and again a record that gives **six**, and reads the box of the last field
  and the box of the grid in each
- **THEN** with five fields the last field is as wide as the grid, because it is alone on its
  row; with six fields the last field is one column wide and the grid holds no empty cell.

  `POSITION` and `REGION` each take two cells, and `DISTANCE FROM SOL` and `RANGE` take one
  each, so those four fields fill **six** cells and leave the grid full. A record
  that gives `n` later fields therefore fills `6 + n` cells, and the last of them is alone on
  its row when `n` is **odd**. Five fields in total is one later field, which is odd; six is
  two, which is even.

  The heading counts the whole grid and the rule counts the later fields, which is why the
  two parities read the other way round from each other

#### Scenario: A record with no description hides that section

- **WHEN** the browser test selects a record that carries no `description` and no `images`
- **THEN** the panel holds no description section and no images section

#### Scenario: Centre view moves the cursor alone

- **WHEN** the browser test selects a system 400 light years from the cursor, reads the
  view, clicks **centre view** and reads the view again
- **THEN** the cursor is the system's position and the distance, the yaw and the pitch are
  unchanged

#### Scenario: Centre view keeps the distance at a close zoom

- **WHEN** the browser test selects a system, zooms out to 4,000 light years, moves the
  cursor 800 light years away, clicks **centre view** and reads the view
- **THEN** the cursor is the system's position and the distance is still 4,000

#### Scenario: The close button clears the selection

- **WHEN** the browser test selects a system, clicks the close button, and reads
  `getSelection`
- **THEN** the reading is null and the panel is hidden

#### Scenario: A host action gets the selected system

- **WHEN** a browser test builds a map whose `details` loader returns one `actions` entry,
  selects a system and clicks that button
- **THEN** `onSelect` was called once with the selected system

#### Scenario: A failing host action does not stop the map

- **WHEN** a browser test builds a map whose `details` loader returns an `actions` entry
  whose `onSelect` throws, selects a system, clicks the button, and then draws 10 frames
- **THEN** the frames draw and the map still answers `getView`

#### Scenario: The footer holds the centre view button before the answer

- **WHEN** a browser test builds a map whose `details` loader never settles, selects a
  system and reads the footer buttons, and reads them again on a map whose loader rejects
- **THEN** each reading holds the centre view button and no host button

#### Scenario: The name button copies the name

- **WHEN** the browser test selects a system, grants the clipboard permission, clicks the
  copy button beside the name, and reads the clipboard
- **THEN** the clipboard holds the system's name and the selection is unchanged

#### Scenario: The position button copies three whole numbers

- **WHEN** the browser test selects a system at (1235, -20, 25895), clicks the copy button
  in the position field, and reads the clipboard
- **THEN** the clipboard reads `1235 / -20 / 25895`, and the field beside it reads
  `1,235 / -20 / 25,895`

#### Scenario: The position button copies a fraction

- **WHEN** the browser test selects a system at (1234.5, -20, 25895), clicks the copy button
  in the position field, and reads the clipboard
- **THEN** the clipboard reads `1234.5 / -20 / 25895`

#### Scenario: The tick shows and goes

- **WHEN** the browser test clicks the name's copy button, reads the button at once, waits
  1.6 seconds and reads it again
- **THEN** the first reading shows the tick and an accessible name of `Copied`, and the
  second shows the copy mark and an accessible name of `Copy system name`

#### Scenario: Only one tick at a time

- **WHEN** the browser test clicks the name's copy button and then the position's within
  1.4 seconds, and reads both
- **THEN** only the position's button shows a tick

#### Scenario: The panel names the system's region

- **WHEN** the browser test selects a system at Sol (0, 0, 0) and waits for the region field
  to fill, then selects one at the galactic centre (15, -35, 25895) and waits again
- **THEN** the readings are `Inner Orion Spur` and `Galactic Centre`

#### Scenario: The region field is exact

- **WHEN** the browser test selects a system at a position a unit test has found whose
  coarse region cell holds one region and whose own 49.3494 light year cell holds another,
  and reads the panel's region field and the handle's `regionNameAt` for the same position
- **THEN** the panel shows the region of the 49.3494 light year cell, and the two readings
  differ

#### Scenario: The grid does not reflow when the region arrives

- **WHEN** the browser test selects a system, reads the screen box of every field before the
  region field fills, and reads them again after it fills
- **THEN** every box is unchanged, and the region field held an empty value in the first
  reading

#### Scenario: A position off the region map reads Unknown

- **WHEN** the browser test selects a system at **(-49900, 0, 75800)**, which lies inside
  the model bounds and outside the region map, and waits for the region field
- **THEN** the field reads `Unknown`.

  The point has to be inside the model bounds. `src/scene-data/real-systems.ts` rejects a
  record outside them with `out-of-bounds`, so a system at (400000, 0, 0) never exists, no
  panel opens and there is no field to read. The model bounds run -49,985 to 50,015 in `x`
  and -24,105 to 75,895 in `z`, and this point sits in the far corner of them, well outside
  the region map

#### Scenario: A stale lookup does not write

- **WHEN** the browser test selects one system, selects a second before the first lookup
  resolves, and reads the region field after both have resolved
- **THEN** the field names the second system's region

#### Scenario: A refused write does not break the panel

- **WHEN** the browser test replaces the clipboard write with one that rejects, selects a
  system, clicks both copy buttons, and then draws 10 frames
- **THEN** neither button shows a tick, the panel still shows the record, and the frames
  draw

#### Scenario: The host turns the three worked-out fields off

- **WHEN** a browser test builds a map with
  `hud: { infoFields: { distanceFromSol: false, range: false, region: false } }`, selects a
  record that carries an allegiance and a population, and reads the field grid
- **THEN** the grid holds `POSITION`, `ALLEGIANCE` and `POPULATION`, and holds no
  `DISTANCE FROM SOL`, no `RANGE` and no `REGION`

#### Scenario: One field off still leaves no empty cell

- **WHEN** a browser test builds a map with
  `hud: { infoFields: { distanceFromSol: false } }`, selects a record that carries no
  optional field, and reads the box of `RANGE` and the box of the grid
- **THEN** `RANGE` is as wide as the grid, and the grid holds no empty cell

#### Scenario: The region field off fetches no region table

- **WHEN** a browser test records every URL the page requests, builds a map with
  `hud: { infoFields: { region: false } }`, selects three systems, waits 2 seconds and
  reads the list, then builds a second map with the field on and does the same
- **THEN** the first list holds no request for the region cell lookup chunk and the second
  holds one

#### Scenario: A host value joins the grid and a host body draws a section

- **WHEN** a browser test builds a map whose `details` returns one entry with the label
  `FACTION` and the value `Pilots Federation`, and one with the label `HISTORY` and a
  `markdown` body of two paragraphs, selects a record that carries a description, and reads
  the panel
- **THEN** the last field of the grid reads `FACTION` and `Pilots Federation`, and a
  section under the description carries the title `HISTORY` and two paragraphs

#### Scenario: A host value carries a copy button

- **WHEN** a browser test builds a map whose `details` returns one entry with the label
  `SYSTEM ADDRESS`, the value `2871051900826` and the same text as its `copy`, selects a
  system, reads that button's accessible name, clicks it, reads the clipboard, then clicks
  the position button
- **THEN** the name reads `Copy SYSTEM ADDRESS`, the clipboard holds `2871051900826`, the
  button shows its tick, and the click on the position button moves the tick to it

#### Scenario: The description draws as Markdown

- **WHEN** a browser test selects a record whose `description` holds a paragraph with a
  strong mark around `hub`, then a blank line, then two bullet items, the second holding a
  link to `https://edsm.net`, and reads the description section
- **THEN** the section holds one paragraph with a bold `hub`, one bullet list of two items,
  and one anchor whose `href` is `https://edsm.net`

#### Scenario: A system with no category shows no chip row

- **WHEN** the browser test builds a map with no category and three systems, selects one
  and reads the information panel
- **THEN** the panel opens, it holds the header, the fields and the description, and it
  holds no chip and no empty row where the chips sit
