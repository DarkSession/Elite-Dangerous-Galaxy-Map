## MODIFIED Requirements

### Requirement: The category browser lists the categories and turns them off

The category panel SHALL hold two tabs, **SYSTEMS** and **SHAPES**, and SHALL show the
list of one of them at a time. The panel SHALL open on **SYSTEMS**.

The **SHAPES** tab SHALL be disabled while the map holds no shape, and the panel SHALL
fall back to **SYSTEMS** where the shown tab is **SHAPES** and the last shape goes, which
a dataset switch does.

One table holds the categories of the systems and of the shapes, which `map-shapes`
states, so the two tabs are two readings of one table and not two tables. The **SYSTEMS**
tab SHALL hold one row per category that holds at least one system, and the **SHAPES** tab
one row per category that holds at least one shape, each in the order the table holds them.
A category that holds neither SHALL have no row in either tab: a row that counts nothing
switches nothing the user can see.

A row SHALL show the category's colour as a dot, its name and its count. The count SHALL
be the number of **things of the shown tab** that belong to that category, by their primary
category **or** any secondary category. A system or a shape that belongs to three
categories is counted in all three rows.

**The dot switches the category and the rest of the row opens the list.** A click on the
dot SHALL call `setCategoryVisible` with the opposite of what the row holds. A click
anywhere else on the row SHALL open the row's list, or fold it when it is open. The two
jobs took one button and a second small button before, and a user who wanted the list
switched the category off instead.

A row of a category that is off SHALL show it: its dot is hollow and its name is dimmed.

The panel SHALL hold an **ALL** button and a **NONE** button, which turn every category
**the shown tab lists** on and off together. A category the tab does not list SHALL NOT
move: the buttons act on what the user can see.

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

### Requirement: The search box filters the systems by name

The category panel SHALL hold a text box. In the **SYSTEMS** tab its text SHALL go to
`setNameFilter`, which `real-systems` defines, and in the **SHAPES** tab to
`setShapeNameFilter`, which `map-shapes` defines. Either call SHALL be made at most once
per **150 ms** while the user types, and once more after the user stops.

The filter reaches the map as well as the lists: the user is asking the map to show the
thing they are looking for, and a list that narrows over a map that does not would leave
the marker or the shape they want among thousands they do not.

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

A click on a **system** row SHALL select that system and turn the row's category on if it
is off. The selection centres the camera on it and caps the distance at 500 light years,
which `system-selection` states, so the row needs no move of its own.

A click on a **shape** row SHALL turn the row's category on if it is off and SHALL fly the
camera to the shape: the cursor to the shape's `centre` and the distance to **twice its
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

- **WHEN** the browser test clicks the dot of a shape category, reads
  `isCategoryVisible`, clicks the row to open the list, clicks the first shape row and
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

### Requirement: Every HUD control works from the keyboard

Every control the user can click SHALL be a `button` or an `input` element, not a `div`
with a click listener. The mockup builds each one as a `div`, which takes no focus and
answers no key.

Each control SHALL therefore be reachable by `Tab`, in the order the panels read on the
screen, and SHALL act on `Enter` and on `Space` as it does on a click. Each SHALL carry a
name a screen reader can read: its own text, or an `aria-label` where the control shows an
icon alone.

A control that holds a state the user can see SHALL report that state: the **colour dot**
of a category row, the two tabs of the category panel and the four switches of the map
options panel SHALL carry `aria-pressed`, and the rest of a category row SHALL carry
`aria-expanded`. The dot SHALL carry an `aria-label` that names its category, because it
shows a colour alone.

The lightbox SHALL take the focus when it opens and SHALL give it back to the thumbnail
that opened it when it closes, so a keyboard user is not left at the top of the page.

**The dataset dialog SHALL follow the same rule as the lightbox.** It SHALL take the focus
when it opens, SHALL hold the focus while it is open, and SHALL give it back to the dataset
field when it closes. Its filter box is a text field, so the movement keys SHALL NOT reach
the camera while it holds the focus, which is the guard `map-navigation` already states.

The movement keys SHALL keep working while a HUD control holds the focus. The guard of
`map-navigation` stops a key aimed at a text field, and a `button` is not one: a user who
has tabbed to a category row and presses `S` moves the cursor, as they would with the focus
on the canvas. Only a field the user types into takes the keys away from the camera. `Q`
and `E` are movement keys, so the same rule turns the camera from a focused button.

#### Scenario: The movement keys work with a button focused

- **WHEN** the browser test focuses a category row, holds `W` for 1 second, and reads the
  cursor
- **THEN** the cursor has moved, by the rule `map-navigation` gives

#### Scenario: A turn key works with a button focused

- **WHEN** the browser test focuses a category row, holds `E` for 1 second, and reads the
  yaw
- **THEN** the yaw has moved, by the rule `map-navigation` gives

#### Scenario: Tab reaches every control

- **WHEN** the browser test opens the map with the HUD on and a set that holds a shape, so
  the shapes tab is not disabled, focuses the search box, and presses `Tab` through the
  panels, reading the focused element at each step
- **THEN** the two tabs, every category dot, every category row, the ALL and NONE buttons,
  the four switches, the two copy buttons, the dataset field and the reset view button are
  each focused once

#### Scenario: Enter and Space work a control

- **WHEN** the browser test focuses the colour dot of a category row, presses `Enter`, reads
  `isCategoryVisible`, presses `Space` and reads it again
- **THEN** the readings are `false` and `true`

#### Scenario: The controls carry their state and their names

- **WHEN** the browser test reads the four switches, the two tabs and a category row with
  the HUD on
- **THEN** each switch and each tab reports its state in `aria-pressed`, the row's dot
  reports its state in `aria-pressed` and names its category, the rest of the row reports
  `aria-expanded`, and every control has a readable name

#### Scenario: The lightbox holds and returns the focus

- **WHEN** the browser test selects a record with images, focuses the first thumbnail,
  presses `Enter`, reads the focused element, presses `Escape` and reads it again
- **THEN** the focus is inside the lightbox after the first press and back on the thumbnail
  after the second

#### Scenario: The dataset dialog holds and returns the focus

- **WHEN** the browser test focuses the dataset field, presses `Enter`, presses `Tab` to
  the last control of the dialog and once more, reads the focused element, presses
  `Escape` and reads it again
- **THEN** the focus stays inside the dialog while it is open and is back on the dataset
  field after the `Escape`

### Requirement: The HUD holds the frame budget

The HUD SHALL do no work in a frame where nothing it shows has changed. It SHALL follow
the view through `onViewChange` and the selection through `onSelectionChange`, and SHALL
rewrite the view-driven readouts at most 10 times a second.

The HUD's cost is a DOM write and the layout and paint that follow it, which no timer in
the render loop can see. The two readings that measure it are therefore the count of DOM
writes in a still frame, which SHALL be 0, and the interval between animation frames, which
`system-selection` defines. With the HUD on, a set of 10,000 systems, one category expanded
and a system selected, at 1920x1080, the mean interval SHALL stay at or below **18 ms**.

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

- **WHEN** the browser test adds 10,000 systems, turns the HUD on, expands a category,
  selects a system, draws 120 frames at 1920x1080 and reads the animation frame interval
  statistics
- **THEN** the mean interval is 18 ms or less

#### Scenario: The HUD adds no work to a still frame

- **WHEN** the browser test holds the view and the selection still, waits 200 ms, and then
  counts the HUD's DOM writes over 120 frames
- **THEN** the count is 0

#### Scenario: The HUD's node count does not follow the set

- **WHEN** the browser test adds 10,000 systems in one category, expands it, and counts the
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
