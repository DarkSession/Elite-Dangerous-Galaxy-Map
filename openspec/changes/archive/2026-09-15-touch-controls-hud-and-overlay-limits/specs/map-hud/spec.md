## MODIFIED Requirements

### Requirement: The search box filters the systems by name

The category panel SHALL hold a text box. Its text SHALL go to `setNameFilter`, which
`real-systems` defines, at most once per **150 ms** while the user types, and once more
after the user stops.

The filter reaches the markers as well as the lists: the user is asking the map to show
the system they are looking for, and a list that narrows over a map that does not would
leave the marker they want among thousands they do not.

Clearing the box SHALL clear the filter and bring every marker back.

The movement keys SHALL NOT reach the camera while the user types in the box, which
`map-navigation` holds with its form-field guard.

**A filter opens every category that holds a match.** **Each time the filter text changes**
to a text that is not empty, the open set SHALL become exactly the categories that hold at
least one system the filter keeps. A category the user turned off SHALL open as well, because
a click on one of its rows turns it back on.

Without this the user types a name, the panel narrows every list it is not showing, and the
one match sits inside a folded row. The panel would answer a search by hiding the answer.

**The open set is state, not a reading of the filter text.** A change of the text writes it;
nothing else does, and a redraw of the panel does not. Between two changes of the text the
expand button SHALL fold and open one category in that set, so a user who does not want a
list can close it, and the fold SHALL hold until the text changes again. The panel is rebuilt
on every move of the camera, so a set worked out from the text on each rebuild would undo the
user's fold on the next frame.

**Clearing the box gives the panel back to the user's own row.** Where the filter text
becomes empty, the open categories SHALL be the one category the user last expanded by
hand, and none where the user expanded none. The panel therefore holds one open list before
a search and one after it.

#### Scenario: A list folded during a search stays folded

- **WHEN** the browser test adds 3 categories whose names all hold `a`, types `a` in the box,
  waits 300 ms, folds one open list with its expand button, moves the camera to force a
  rebuild of the panel, and counts the open lists
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

- **WHEN** the browser test expands `C` by hand, types `alpha`, waits 300 ms, reads which
  categories are open, clears the box, waits 300 ms and reads again
- **THEN** the first reading holds `A` and `B` and the second holds `C` alone


### Requirement: A category expands into a list of its systems

A category row SHALL carry a button that expands the row into a list of that category's
systems, and folds it again. At most one category SHALL be expanded at a time while the
search box is empty. While the search box holds text, every category that holds a match
SHALL be open, which the requirement "The search box filters the systems by name" states.

A row of the list SHALL show the system's name alone.

**REMOVED from this requirement**: the distance from Sol on the row, and the
`data-distance` attribute that drew it. The information panel states the distance from Sol
of the system the user selects, and the row is a way to reach a system by name. The number
beside every name is a second reading of the same thing in the place the user is reading
names.

The list SHALL hold the systems that belong to the row's category, by their primary
category **or** any secondary category, and whose name the filter keeps, in order of name.

**The row cap is shared over the open lists.** The lists together SHALL show at most
**200** rows, and each open list SHALL show at most `floor(200 / open)` rows, where `open`
is the count of open lists. A list that was cut SHALL say so, with the number shown and the
number held. The cap is what keeps the DOM bounded: one category may hold all 10,000 systems
of a full set, and a search may open every category at once.

One open list therefore keeps the 200 rows it holds today, and twenty open lists hold ten
rows each.

**Where more than 200 lists are open**, `floor(200 / open)` is 0. The **first 200 open lists
in the panel's own order** SHALL show one row each and every open list past the 200th SHALL
show none. The panel holds up to 256 category rows, so a filter that matches in every
category reaches this. A list that shows no row is still marked open and still states the
count it holds, so the user sees that the category matched and narrows the filter to read
it. Without this rule 256 open lists would draw 256 rows, which breaks the budget the cap is
there to hold.

The list read the primary category alone before, so a system that belonged to several
categories appeared under one of them and the user could not find it under the others. The
list is now what the row's count says it is.

A click on a row SHALL select that system and turn the row's category on if it is off. The
selection centres the camera on it and caps the distance at 500 light years, which
`system-selection` states, so the row needs no move of its own.

#### Scenario: The list opens, closes and holds one category at a time

- **WHEN** the browser test expands the first category with the search box empty, reads the
  lists, expands the second, and reads again
- **THEN** the first reading holds one list and the second holds one list, under the
  second category

#### Scenario: The list is capped and says so

- **WHEN** the browser test adds one category with 1,000 systems and expands it
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

- **WHEN** the browser test expands a category and reads the text and the attributes of one
  system row
- **THEN** the row's text is the system's name, the row carries no `data-distance`
  attribute, and the row's own box holds no second reading

#### Scenario: A row selects and centres

- **WHEN** the browser test opens a view at 20,000 light years with a yaw of 40, expands a
  category, clicks the third row, and reads the selection and the view
- **THEN** the selection names that system, the cursor is that system's position, the
  distance is 500 and the yaw is 40

#### Scenario: One system shows in every list it belongs to

- **WHEN** the browser test adds the categories `A` and `B` and one system whose primary
  category is `A` and whose secondary categories hold `B`, expands `A`, reads the list,
  expands `B` and reads it again
- **THEN** both lists hold that system

### Requirement: The information panel shows the selected system

The information panel SHALL be hidden while nothing is selected, and SHALL open on the
selection. It SHALL hold, in this order:

1. A header with the system's name, a copy button beside the name, and a close button.
2. A grid of fields: the position in game coordinates with a copy button, the distance
   from Sol, the range
   from the camera, and then `primaryStar`, `allegiance`, `government`, `primaryEconomy`,
   `security`, `population` and `bodyCount`. A field the record does not carry SHALL be
   left out, not shown empty.
3. The categories, as one chip per category in the record's colour, the primary first and
   then the secondary ones in the order the record gave them.
4. The description, when the record carries one.
5. The images, when the record carries any.
6. A footer with a **centre view** button and one button per entry of the `actions` option.

The field grid SHALL hold **two columns**, as the mockup draws it, and the position field
SHALL carry the mockup's label `POSITION`. An **even** count of fields leaves the last field
alone on its row, and that field SHALL take both columns, so the grid shows no empty cell.

**MODIFIED**: the parity. `POSITION` now spans two cells, so a grid of `n` fields fills
`n + 1` cells and the last field is alone when `n` is even. The rule read an odd count before
this change.

**`POSITION` SHALL take both columns.** It holds the longest value of the panel, three
coordinates of up to three decimal places each, and one column of two is too narrow for it:
the value wraps onto a second line, and the copy button beside the label crowds the label.

`DISTANCE FROM SOL` and `RANGE` SHALL then share the row under it, one column each. Both
hold a whole number of light years and a unit, which is the shortest value the panel shows,
so the pair fits one row with room to spare.

Every field after those three SHALL fill the grid in the order this requirement states, two
to a row, and the last field alone on its row SHALL take both columns as before.

**The position SHALL NOT be rounded to a whole light year.** Each of the three game
coordinates SHALL be shown to at most **3 decimal places**, with the trailing zeros dropped
and a thousands separator on the whole part. A coordinate that is a whole number SHALL show
no decimal point.

The game resolves a position to 1/32 of a light year, which is 0.03125. Three decimal places
do not reproduce that value, which needs five, but they **separate** every position the game
can give: the step is 0.03125 and the rounding is 0.001, so no two game positions round to
the same three decimal places. The record carries the value the host's dump gave, in
`float64`, and the panel SHALL show that value and not the whole number it rounds to.

`DISTANCE FROM SOL` and `RANGE` SHALL NOT change. They are distances the user reads to judge
a journey, not the identity of a place, and a whole light year is the right resolution for
them.

The **range from the camera** follows the view, so the panel SHALL rewrite it at most 10
times a second, by the same rule as the top bar. Every other field changes only with the
selection.

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

An `actions` entry SHALL draw as a button with its `label`, and a click SHALL call its
`onSelect` with the selected system. The library SHALL NOT read what `onSelect` returns and
SHALL NOT let a failure in it stop the frame loop.

#### Scenario: The panel opens on a selection and shows the record

- **WHEN** the browser test adds a record with a name, coordinates, an allegiance, a
  population and a description but no `primaryStar`, selects it, and reads the panel
- **THEN** the panel is shown, the header holds the name, the grid holds the position, the
  distance from Sol, the range from the camera, the allegiance and the population, there
  is no primary star field, and the description is shown

#### Scenario: The position keeps its fraction

- **WHEN** the browser test selects a record at `x = -9530.9375`, `y = -910.28125` and
  `z = 19808.125`, and reads the position field
- **THEN** it reads `-9,530.938 / -910.281 / 19,808.125`

#### Scenario: A whole coordinate shows no decimal point

- **WHEN** the browser test selects a record at `x = 100`, `y = 0` and `z = -25.5`, and
  reads the position field
- **THEN** it reads `100 / 0 / -25.5`

#### Scenario: The distance fields stay whole

- **WHEN** the browser test selects the record of the scenario above and reads
  `DISTANCE FROM SOL` and `RANGE`
- **THEN** both hold a whole number of light years and the unit `LY`, and neither holds a
  decimal point.

  The record sits 103 light years from Sol and the selection holds the camera within 500,
  so neither field passes 1,000 and neither shows a thousands separator. The separator is
  what the scenario "The position keeps its fraction" reads, in `-9,530.938`

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

- **WHEN** the browser test selects a record that gives **four** fields, the three above and
  a primary star, and again a record that gives **five**, and reads the box of the last field
  and the box of the grid in each
- **THEN** with four fields the last field is as wide as the grid, because it is alone on its
  row; with five fields the last field is one column wide and the grid holds no empty cell.

  **MODIFIED in this scenario**: the parity. `POSITION` takes two cells, so a grid of `n`
  fields fills `n + 1` cells. The last field is alone on its row when `n` is **even**, and an
  **odd** count fills the grid with no empty cell, which is what this scenario's heading says.
  The rule that widens a field alone on its row therefore reads an even count after this
  change and an odd count before it

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

- **WHEN** a browser test builds a map with one `actions` entry, selects a system and
  clicks that button
- **THEN** `onSelect` was called once with the selected system

#### Scenario: A failing host action does not stop the map

- **WHEN** a browser test builds a map with an `actions` entry whose `onSelect` throws,
  selects a system, clicks the button, and then draws 10 frames
- **THEN** the frames draw and the map still answers `getView`

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

#### Scenario: A refused write does not break the panel

- **WHEN** the browser test replaces the clipboard write with one that rejects, selects a
  system, clicks both copy buttons, and then draws 10 frames
- **THEN** neither button shows a tick, the panel still shows the record, and the frames
  draw
### Requirement: The HUD holds the frame budget

The HUD SHALL do no work in a frame where nothing it shows has changed. It SHALL follow
the view through `onViewChange` and the selection through `onSelectionChange`, and SHALL
rewrite the view-driven readouts at most 10 times a second.

The HUD's cost is a DOM write and the layout and paint that follow it, which no timer in
the render loop can see. The two readings that measure it are therefore the count of DOM
writes in a still frame, which SHALL be 0, and the interval between animation frames, which
`system-selection` defines. With the HUD on, a set of 10,000 systems, one category expanded
and a system selected, at 1920x1080, the mean interval SHALL stay at or below **18 ms**.

The HUD SHALL hold at most 256 category rows, 200 system rows, 8 thumbnails, 120 dataset
rows and one information panel, so its DOM node count does not follow the size of the set
or the size of the catalog. The dataset rows SHALL only be there while the dialog is open.

A system that belongs to several categories now shows in the list of each one, and a search
opens every category that holds a match, so **200 system rows is the count over every open
list together** and not the count of one. The requirement "A category expands into a list of
its systems" shares the 200 out over the open lists. The cap is what bounds the count, not
the number of systems and not the number of open lists.

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

#### Scenario: The dialog's rows go when it closes

- **WHEN** the browser test builds a map with 130 catalog entries, counts the elements
  under the HUD root, opens the dataset dialog, counts again, closes it and counts once
  more
- **THEN** the second count is under 600 more than the first, and the third is the first

