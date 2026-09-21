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
because it runs the row filter per row: **50,000** systems over 8 categories with 4 names
each is **200,000** reads, and 5,120 shapes over the same table is 20,480. Each read is one
byte of a match flag, which the pass writes once per change of the filter text. The pass SHALL cost less
than **2 milliseconds** on the main thread.

**The budget does not move with the set bound.** The count pass read **1 ms** with 10,000
systems over 8 categories on 2026-09-21 (`e2e/count-cost.spec.ts`, "the count pass holds its
budget"), against this 2 ms budget. Five times the reads does not fit it. Where the reading fails, the
implementation SHALL make the pass cheaper, or the set bound SHALL land lower, which the
requirement "The set holds up to 50,000 systems" states. The box gives its text to the filter at most
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

#### Scenario: The counts read the first category

- **WHEN** the browser test adds the categories `A` and `B`, then two records whose
  `categories` both begin with `A`, one of which also holds `B`
- **THEN** the row for `A` reads `2`

#### Scenario: The counts read the later categories as well

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

- **WHEN** the browser test adds 50,000 systems over 8 categories, each naming 4 of them,
  types one character in the box, waits 300 ms and reads the measurement the page exposes
  for the count pass
- **THEN** the reading is under 2 milliseconds

### Requirement: The HUD holds the frame budget

The HUD SHALL do no work in a frame where nothing it shows has changed. It SHALL follow
the view through `onViewChange` and the selection through `onSelectionChange`, and SHALL
rewrite the view-driven readouts at most 10 times a second.

The HUD's cost is a DOM write and the layout and paint that follow it, which no timer in
the render loop can see. The two readings that measure it are therefore the count of DOM
writes in a still frame, which SHALL be 0, and the interval between animation frames, which
`system-selection` defines. With the HUD on, **a full set of 50,000 systems**, one category
expanded and a system selected, at 1920x1080, the mean interval SHALL stay at or below
**18 ms**.

**The budget does not move with the set bound.** `system-selection`, `map-shapes` and this
requirement read the same interval at the same set, so the three name one number. The HUD's
own cost does not follow the set: it writes at most 200 system rows whatever the set holds,
and the interval it shares is the render loop's. What follows the set is the frame the HUD
sits on, which the requirements of `real-systems` and `system-selection` bound. Where the
reading fails, the implementation SHALL make the frame cheaper, or the set bound SHALL land
lower. It SHALL NOT raise this number.

The HUD SHALL hold at most 256 category rows, 200 system or shape rows, 8 thumbnails, 120
dataset rows and one information panel, so its DOM node count does not follow the size of
the set, the size of the shape set or the size of the catalog. The dataset rows SHALL only
be there while the dialog is open. One tab shows at a time, so the rows of the other tab
SHALL NOT be in the document.

A system that belongs to several categories now shows in the list of each one, and a search
opens every category that holds a match, so **200 rows is the count over every open list
together** and not the count of one. The requirement "A category expands into a list of its
systems" shares the 200 out over the open lists. The cap is what bounds the
count, not the number of systems, not the number of shapes and not the number of open
lists.

The panel reads the shape set through `getShapeInfo`, which `map-shapes` defines and which
copies no line point, so a rebuild with 4,096 lines of 65,536 points costs no copy of the
geometry.

#### Scenario: The page keeps its frame rate with the HUD on

- **WHEN** the browser test adds 50,000 systems, turns the HUD on, expands a category,
  selects a system, draws 120 frames at 1920x1080 and reads the animation frame interval
  statistics
- **THEN** the mean interval is 18 ms or less

#### Scenario: The HUD adds no work to a still frame

- **WHEN** the browser test holds the view and the selection still, waits 200 ms, and then
  counts the HUD's DOM writes over 120 frames
- **THEN** the count is 0

#### Scenario: The HUD's node count does not follow the set

- **WHEN** the browser test adds 50,000 systems in one category, expands it, and counts the
  elements under the HUD root
- **THEN** the count is under 600

#### Scenario: The node count does not follow the count of open lists

- **WHEN** the browser test adds 10,000 systems spread over 40 categories, every name
  holding `a`, counts the elements under the HUD root with every list closed, types `a` in
  the search box, waits 300 ms and counts again
- **THEN** the second count is under 600 more than the first, at least two categories are
  open, and the count of system rows is 200

  This scenario reads the **growth** and not the total. A category row costs about 13
  elements, so 40 closed categories cost 539 by themselves, before one system row draws.
  A total under 600 is therefore unreachable at 40 categories, and it would measure the
  count of categories rather than the count of open lists. The growth is what the shared
  budget bounds: the 200 rows are shared out however many lists open, so the growth does
  not follow the count of open lists. The run reads 539 closed and 979 open, a growth of
  440

#### Scenario: A full shape set does not grow the panel

- **WHEN** the browser test adds 1,024 spheres and 4,096 lines in 20 categories, clicks
  **SHAPES**, opens one category, counts the elements under the HUD root and measures the
  main thread over the rebuild
- **THEN** the count is under 900, the rebuild is under 40 ms, and the open list holds 200
  rows

#### Scenario: The dialog's rows go when it closes

- **WHEN** the browser test builds a map with 130 catalog entries, counts the elements
  under the HUD root, opens the dataset dialog, counts again, closes it and counts once
  more
- **THEN** the second count is under 600 more than the first, and the third is the first
