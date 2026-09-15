## Purpose

Gives the map an optional heads-up display in plain DOM over the canvas: a top bar, a
category browser with a search box, a map options panel, an information panel for the
selected system and an image lightbox. A host that wants its own chrome turns it off and
gets the map it has today.

## Requirements

### Requirement: The HUD is opt-in and the library owns it

`GalaxyMapOptions` SHALL carry an optional `hud`. `hud` SHALL be absent or `false` by
default, and the map SHALL then build no HUD and add no element to the page. `hud: true`
SHALL build the HUD with its defaults. `hud` MAY instead be an object of these fields,
each optional:

| Field     | Type                      | What it does                                      |
| --------- | ------------------------- | ------------------------------------------------- |
| `title`   | string                    | The name in the top bar                           |
| `host`    | element                   | Where the HUD is built                            |
| `actions` | array of `{label, onSelect}` | Buttons in the information panel footer        |

With no `host` the library SHALL build its own element in the canvas's parent, as it does
for the label overlay, so a host that gives a canvas alone gets a working HUD. The library
SHALL NOT read an element by id.

The handle SHALL carry `hud`, which is the HUD handle or null when the option is off. The
HUD handle SHALL carry `element`, the root element, and `refresh()`, which rebuilds the
panels from the map's current state.

The HUD SHALL reach the map through the handle alone. It SHALL NOT import `src/render/`,
`src/scene-data/` or `src/camera/`, and SHALL NOT read the handle's `debug` member. The HUD
is therefore replaceable: a host can build the same panels from the same public members.

An ESLint rule SHALL fail the lint on each of those three imports inside `src/hud/`, by the
same `no-restricted-imports` mechanism that already holds the data layers away from the
renderer. A second rule SHALL fail the lint on a read of a `debug` property inside
`src/hud/`. A lint rule is what holds the boundary, because the production build puts the
HUD and the library in one bundle.

`dispose()` on the map handle SHALL remove the HUD element the library built, remove every
listener the HUD added, and leave a `host` the caller gave in the page.

#### Scenario: The default map builds no HUD

- **WHEN** a browser test builds a map with no `options` and reads `hud` and the canvas's
  parent
- **THEN** `hud` is null and the parent holds no element of the HUD's class

#### Scenario: The option builds the HUD in the canvas's parent

- **WHEN** a browser test builds a map with `hud: true` and waits for `ready`
- **THEN** `hud` is not null, `hud.element` is in the canvas's parent, and the top bar, the
  category panel, the map options panel and the information panel are all present

#### Scenario: The HUD goes on dispose

- **WHEN** a browser test builds a map with `hud: true`, waits for `ready`, calls
  `dispose`, and reads the canvas's parent
- **THEN** the parent holds no element of the HUD's class

#### Scenario: The HUD touches no private member

- **WHEN** `pnpm lint` runs over the tree, and again over a tree where a file under
  `src/hud/` imports `../render/renderer`, again with an import of `../scene-data/regions`,
  again with an import of `../camera/view`, and again with a read of `map.debug.look`
- **THEN** the first run is clean and each of the other four fails on that line


### Requirement: The HUD names its elements and carries its own style

Every element the HUD builds SHALL carry a class whose name starts with `gm-hud`. The root
SHALL be `gm-hud`, and each part SHALL take a name of the form `gm-hud__<part>`, for
example `gm-hud__category-row` and `gm-hud__info-name`. A row that stands for one thing
SHALL carry that thing's name in a `data-name` attribute.

The HUD SHALL add its style as one `<style>` element in the document head, with the id
`gm-hud-styles`, and SHALL add it once per document however many maps the page builds.
Every style rule SHALL be under the `.gm-hud` class, so the HUD changes no element of the
host page.

The `@font-face` at-rules are the one exception, and they cannot be under a class: an
at-rule takes no selector. They register the two bundled family names in the document and
change no element, so a host element keeps the font it had.

The HUD SHALL NOT fetch a font, a stylesheet, an icon or any other file from a third-party
host. A HUD that reached a font CDN would make every host page send a request the host did
not ask for, and would make the browser test suite depend on the network. A font the HUD
wants SHALL be bundled with the build, and the HUD SHALL name a fallback stack that keeps
every panel readable when the font does not load.

#### Scenario: The style is added once

- **WHEN** a browser test builds two maps with `hud: true` in one page and counts the
  elements with the id `gm-hud-styles`
- **THEN** the count is 1

#### Scenario: The HUD makes no third-party request

- **WHEN** the browser test opens the built preview with the HUD on, with every request to
  a host other than the page's own origin blocked and recorded
- **THEN** no request was blocked and the panels are laid out


### Requirement: The HUD does not take the map's input

The HUD root SHALL take no pointer events. Each panel SHALL take them. A pixel of the
canvas that no panel covers SHALL reach the map's controls unchanged.

A wheel over a panel SHALL scroll the panel and SHALL NOT zoom the map. A drag that starts
on a panel SHALL NOT orbit the map and SHALL NOT move the cursor.

#### Scenario: A drag between the panels still orbits

- **WHEN** the browser test with the HUD on presses the left button in the middle of the
  canvas, moves 60 pixels right and 30 down, and releases
- **THEN** yaw and pitch change by the amounts `map-navigation` states

#### Scenario: A wheel over a panel does not zoom

- **WHEN** the browser test reads the zoom distance, turns the wheel 5 notches with the
  pointer over the category panel, and reads the distance again
- **THEN** the two readings are equal

#### Scenario: A drag on a panel does not orbit

- **WHEN** the browser test presses the left button on the map options panel, moves 100
  pixels, and releases
- **THEN** yaw and pitch have not changed


### Requirement: The top bar names the map, the region and the zoom

The top bar SHALL hold, from the left: the title, the name of the region under the cursor,
the dataset field when the catalog holds an entry, and, on the right, the zoom distance
and a **reset view** button.

The title SHALL be the `title` of the options, and `GALACTIC CARTOGRAPHICS` when the
options name none.

The dataset field is what `dataset-catalog` states. It SHALL NOT replace the region name:
the region name answers where the camera is looking and the dataset field answers what the
map is showing, and the two are not the same question. With an empty catalog the bar SHALL
be the bar it is today, with no gap where the field would sit.

The region name SHALL be `regionNameAt` of the view's cursor, which `galactic-regions`
defines. The cursor is the point the camera looks at, so the name answers "where am I
looking". A cursor the region grid does not cover SHALL show an empty name and no
placeholder text.

The zoom SHALL be the view's distance in whole light years, with a thousands separator and
the unit `LY`, for example `1,500 LY`.

The reset view button SHALL set the default view, which `map-navigation` gives as the
cursor at Sol, a distance of 60,000 light years, a pitch of 35 degrees and a yaw of 0.

The region name and the zoom follow the view, which changes every frame while the user
moves. The HUD SHALL rewrite them at most **10 times a second**, and SHALL NOT write the
DOM in a tick where the formatted text has not changed.

#### Scenario: The bar reads the view

- **WHEN** the browser test with the HUD on sets the view to the cursor Sol at a distance
  of 1,500 light years, and waits 200 ms
- **THEN** the zoom reads `1,500 LY` and the region reads `Inner Orion Spur`

#### Scenario: Reset returns the default view

- **WHEN** the browser test sets a view far from the default, clicks **reset view**, and
  reads the view
- **THEN** the view is the cursor (0, 0, 0), the distance 60,000, the pitch 35 and the yaw 0

#### Scenario: The bar does not rewrite itself every frame

- **WHEN** the browser test holds the view still with the HUD on, waits 200 ms for the
  first write to settle, and then counts the writes to the zoom element over 120 frames
- **THEN** the count is 0

#### Scenario: The bar carries the dataset field only with a catalog

- **WHEN** the browser test builds one map with a catalog of two entries and one with no
  `datasets` option, and reads each bar
- **THEN** the first bar holds the dataset field beside the region name, and the second
  holds the title, the region name, the zoom and the reset button and nothing else

### Requirement: The category browser lists the categories and turns them off

The category panel SHALL hold one row per category in the table, in the order the table
holds them. A row SHALL show the category's colour, its name and its count.

The count SHALL be the number of systems that belong to that category, by their primary
category **or** any secondary category. A system that belongs to three categories is
counted in all three rows.

The count read the primary category alone before. That did not match what the row's
switch does: `real-systems` now draws a marker when any of its categories is on, so a row
whose switch brings a system back has to count that system.

A click on a row SHALL call `setCategoryVisible` with the opposite of what the row holds. A
row of a category that is off SHALL show it: its colour swatch is hollow and its name is
dimmed.

The panel SHALL hold an **ALL** button and a **NONE** button, which turn every category in
the table on and off together.

A category's `description`, which `real-systems` already carries, SHALL be the row's
`title`, so the browser shows it as a tooltip.

The panel SHALL rebuild its rows when the category table changes and when the system set
changes, and not on a frame where neither changed. The table holds at most 256 categories,
so the panel holds at most 256 rows.

#### Scenario: A row toggles its category

- **WHEN** the browser test adds two categories and one system in each, clicks the first
  row, draws a frame, and reads the marker count and `isCategoryVisible` of that category
- **THEN** the count is 1 and the reading is `false`

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

- **WHEN** the browser test adds three categories, clicks **NONE**, reads the marker count,
  clicks **ALL** and reads it again
- **THEN** the first reading is 0 and the second is the whole set

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

#### Scenario: Typing narrows the markers and the lists

- **WHEN** the browser test adds systems named `Sol`, `Solati` and `Achenar`, types `sol`
  in the box, waits 300 ms, draws a frame, and reads the marker count and the expanded
  system list
- **THEN** the count is 2 and the list holds `Sol` and `Solati`

#### Scenario: The box does not call the filter on every key

- **WHEN** the browser test types 10 characters into the box within 200 ms and counts the
  calls to `setNameFilter`
- **THEN** the count is 3 or fewer


### Requirement: A category expands into a list of its systems

A category row SHALL carry a button that expands the row into a list of that category's
systems, and folds it again. At most one category SHALL be expanded at a time.

A row of the list SHALL show the system's name and its distance from Sol in whole light
years. The distance from Sol does not change as the user flies, so the list does not
renumber itself while the user reads it.

The distance SHALL be a `data-distance` attribute the style sheet draws, and not an
element, and it SHALL carry no unit, which is what the mockup draws. The list holds 200
rows, and a third element in each one puts 200 more nodes in the count the HUD is bounded
at. The consequence to know: the number is a style and a screen reader does not read it.
The row's accessible name is the system's name, which is what the row does when the user
works it.

The list SHALL hold the systems that belong to the row's category, by their primary
category **or** any secondary category, and whose name the filter keeps, in order of name,
and SHALL show at most **200** rows. A list that was cut SHALL say so, with the number
shown and the number held. The cap is what keeps the DOM bounded: one category may hold
all 10,000 systems of a full set.

The list read the primary category alone before, so a system that belonged to several
categories appeared under one of them and the user could not find it under the others. The
list is now what the row's count says it is.

A click on a row SHALL select that system and turn the row's category on if it is off. The
selection centres the camera on it and caps the distance at 500 light years, which
`system-selection` states, so the row needs no move of its own.

#### Scenario: The list opens, closes and holds one category at a time

- **WHEN** the browser test expands the first category, reads the lists, expands the
  second, and reads again
- **THEN** the first reading holds one list and the second holds one list, under the
  second category

#### Scenario: The list is capped and says so

- **WHEN** the browser test adds one category with 1,000 systems and expands it
- **THEN** the list holds 200 rows and the panel says 200 of 1,000

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

### Requirement: The map options panel carries the region mode, the names and the grid

The map options panel SHALL hold three controls.

**Galaxy regions** SHALL be three buttons, **NONE**, **SIMPLIFIED** and **ACCURATE**, of
which exactly one is marked as chosen. A click SHALL call `setRegionMode` with `off`,
`simplified` or `accurate`. The panel SHALL open on the mode the map is in, which
`simplified` is unless the options named another.

**System names** SHALL be a switch that calls `setSystemNamesVisible`, which
`system-selection` defines. It SHALL open off.

**Coordinate grid** SHALL be a switch that calls `setGridVisible`, which
`coordinate-grid` defines. It SHALL open on the state the map is in, which is off unless
the options named `grid`. The demo site names it, so the switch opens on there, and a map
built with no options opens it off.

Each control SHALL show the state the map is in, so a host that changes a setting through
the handle moves the control with it.

#### Scenario: The region buttons change the mode

- **WHEN** the browser test clicks **ACCURATE**, reads `getRegionMode`, clicks **NONE** and
  reads again
- **THEN** the readings are `accurate` and `off`, and the marked button follows

#### Scenario: The panel opens on the mode the options named

- **WHEN** a browser test builds a map with `hud: true` and `regionMode: 'accurate'`
- **THEN** **ACCURATE** is the marked button

#### Scenario: A change through the handle moves the control

- **WHEN** the browser test calls `setGridVisible(true)` on the handle and reads the grid
  switch
- **THEN** the switch reads on

#### Scenario: The grid switch opens on the state the options named

- **WHEN** a browser test builds a map with `hud: true` and `grid: true` and reads the
  coordinate grid switch, and a second builds one with `hud: true` and no `grid` option
  and reads the same switch
- **THEN** the first reads on and the second reads off

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
SHALL carry the mockup's label `POSITION`. An odd count of fields leaves the last field
alone on its row, and that field SHALL take both columns, so the grid shows no empty cell.

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

#### Scenario: An odd count of fields leaves no empty cell

- **WHEN** the browser test selects a record that gives three fields and reads the box of
  the last field and the box of the grid
- **THEN** the last field is as wide as the grid, and the earlier two are each about half
  of it

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
### Requirement: The images open in a lightbox

The panel SHALL show each image of the record as a thumbnail in a grid of two columns,
with its caption over it. The record holds at most 8 images, which `real-systems` caps.

An image SHALL load lazily and SHALL send no referrer, so the host's page does not leak
its address to the server the image comes from. An image that fails to load SHALL leave the
thumbnail's placeholder in view with the caption still readable, and SHALL NOT leave a
broken image icon.

A click on a thumbnail SHALL open a lightbox over the whole map, which shows the image
large with its caption and the system's name. A click anywhere in the lightbox, and the
`Escape` key, SHALL close it.

#### Scenario: A thumbnail opens the lightbox

- **WHEN** the browser test selects a record with two images, clicks the first thumbnail,
  and reads the lightbox
- **THEN** the lightbox is shown and holds the first image's URL, its caption and the
  system's name

#### Scenario: A broken image keeps its caption

- **WHEN** the browser test selects a record whose image URL cannot be loaded and reads the
  thumbnail
- **THEN** the thumbnail is present, the caption is readable, and no broken image icon is
  in the panel

#### Scenario: The images are lazy and send no referrer

- **WHEN** the browser test selects a record with images and reads the image elements
- **THEN** each carries `loading="lazy"` and `referrerpolicy="no-referrer"`


### Requirement: Every HUD control works from the keyboard

Every control the user can click SHALL be a `button` or an `input` element, not a `div`
with a click listener. The mockup builds each one as a `div`, which takes no focus and
answers no key.

Each control SHALL therefore be reachable by `Tab`, in the order the panels read on the
screen, and SHALL act on `Enter` and on `Space` as it does on a click. Each SHALL carry a
name a screen reader can read: its own text, or an `aria-label` where the control shows an
icon alone.

A control that holds a state the user can see SHALL report that state: a category row and
the two switches SHALL carry `aria-pressed`, and the three region mode buttons SHALL carry
`aria-pressed` on the one that is chosen.

The lightbox SHALL take the focus when it opens and SHALL give it back to the thumbnail
that opened it when it closes, so a keyboard user is not left at the top of the page.

**The dataset dialog SHALL follow the same rule as the lightbox.** It SHALL take the focus
when it opens, SHALL hold the focus while it is open, and SHALL give it back to the dataset
field when it closes. Its filter box is a text field, so the movement keys SHALL NOT reach
the camera while it holds the focus, which is the guard `map-navigation` already states.

The movement keys SHALL keep working while a HUD control holds the focus. The guard of
`map-navigation` stops a key aimed at a text field, and a `button` is not one: a user who
has tabbed to a category row and presses `S` moves the cursor, as they would with the focus
on the canvas. Only a field the user types into takes the keys away from the camera.

#### Scenario: The movement keys work with a button focused

- **WHEN** the browser test focuses a category row, holds `W` for 1 second, and reads the
  cursor
- **THEN** the cursor has moved, by the rule `map-navigation` gives

#### Scenario: Tab reaches every control

- **WHEN** the browser test opens the map with the HUD on, focuses the search box, and
  presses `Tab` through the panels, reading the focused element at each step
- **THEN** every category row, the ALL and NONE buttons, the three region mode buttons, the
  two switches, the two copy buttons, the dataset field and the reset view button are each
  focused once

#### Scenario: Enter and Space work a control

- **WHEN** the browser test focuses a category row, presses `Enter`, reads
  `isCategoryVisible`, presses `Space` and reads it again
- **THEN** the readings are `false` and `true`

#### Scenario: The controls carry their state and their names

- **WHEN** the browser test reads the region mode buttons, the two switches and a category
  row with the HUD on
- **THEN** exactly one region mode button has `aria-pressed` true, each switch reports its
  state in `aria-pressed`, and every control has a readable name

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

### Requirement: Escape closes the lightbox, then the panel

The HUD SHALL listen for `Escape` on the document. The key SHALL unwind one step at a
time, in this order:

1. It SHALL close the dataset dialog when one is open, and change nothing else.
2. It SHALL close the lightbox when no dialog is open and a lightbox is open.
3. It SHALL clear the selection when neither is open and a system is selected.
4. It SHALL do nothing when none of the three is there.

The dataset dialog comes first because it is the last thing the user opened and it covers
the panel under it. `dataset-catalog` states what the dialog is; this requirement states
where the key reaches it, so the order lives in one place and not in two.

The key SHALL NOT be taken from a form field the host owns: the HUD SHALL act on `Escape`
only, and SHALL let every other key through.

#### Scenario: Escape unwinds one step at a time

- **WHEN** the browser test selects a system, opens a lightbox, presses `Escape`, reads the
  lightbox and the selection, presses `Escape` again and reads both again
- **THEN** the first press closes the lightbox and keeps the selection, and the second
  clears the selection

#### Scenario: Escape with nothing open does nothing

- **WHEN** the browser test presses `Escape` with no selection and no lightbox, and reads
  the view and the selection
- **THEN** neither changed

#### Scenario: Escape closes the dataset dialog first

- **WHEN** the browser test selects a system, opens the dataset dialog, presses `Escape`,
  reads the dialog and the selection, presses `Escape` again and reads both again
- **THEN** the first press closes the dialog and keeps the selection, and the second clears
  the selection

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

A system that belongs to several categories now shows in the list of each one, so the 200
row cap is read per list and the set can put a system in more than one list. The cap is
what bounds the count, not the number of systems.

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

#### Scenario: The dialog's rows go when it closes

- **WHEN** the browser test builds a map with 130 catalog entries, counts the elements
  under the HUD root, opens the dataset dialog, counts again, closes it and counts once
  more
- **THEN** the second count is under 600 more than the first, and the third is the first

