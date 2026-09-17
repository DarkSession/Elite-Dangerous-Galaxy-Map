## MODIFIED Requirements

### Requirement: The HUD names its elements and carries its own style

Every element the HUD builds SHALL carry a class whose name starts with `gm-hud`. The root
SHALL be `gm-hud`, and each part SHALL take a name of the form `gm-hud__<part>`, for
example `gm-hud__category-row` and `gm-hud__info-name`. A row that stands for one thing
SHALL carry that thing's name in a `data-name` attribute.

The HUD SHALL add its style as one `<style>` element in the document head, with the id
`gm-hud-styles`, and SHALL add it once per document however many maps the page builds.
Every style rule SHALL be under the `.gm-hud` class, so the HUD changes no element of the
host page.

**No element of the HUD SHALL carry `backdrop-filter`.** An element that carries it draws
over the canvas, the canvas draws a new frame every frame, and the browser therefore blurs
the backdrop again in every frame. Firefox does that on the CPU.

Five rules carry the property, on six elements. Two are on the screen while the camera
moves:
the category panel and the map options panel, both `gm-hud__panel`, at 316 by 807 and 316
by 169 CSS pixels. Those two alone cost **3.5 ms** a frame, measured at 1920x1080 with
10,000 systems and the camera moving, of a frame that cost 12.1 ms with the frame rate
uncapped. The information panel carries the property too and is on the screen whenever a
system is selected.

The other three, the dataset dialog's scrim, its frame and the lightbox, cost nothing in
that reading because none was open. They SHALL lose the property all the same: the map
keeps drawing behind an open dialog, so each one re-blurs in every frame for as long as it
is open. That is the same fault at a different moment, and it carries no measurement of
its own.

**The elements that draw over the moving map SHALL carry a flat background of at least
0.92 alpha**, so the text holds its contrast over the bright core as the blurred panel did.
Those are `gm-hud__panel` and the information panel, which draw at 0.86 and 0.9 today. The
dialog's scrim, its frame and the lightbox SHALL keep the alpha they hold, which is 0.78,
0.97 and 0.88: they cover the map rather than sit beside it, and their alpha is a look
decision this change does not make.

The mockup in `.design/` draws the panels with `backdrop-filter`, and this rule departs
from the mockup on purpose.

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

#### Scenario: No panel blurs its backdrop

- **WHEN** the browser test opens the page with the HUD on, opens the information panel and
  the dataset dialog, and reads the computed `backdrop-filter` of every element under the
  HUD root
- **THEN** every one reads `none`

#### Scenario: The panels over the map hold their contrast

- **WHEN** the browser test reads the computed background colour of the category panel,
  the map options panel and the information panel
- **THEN** each alpha is 0.92 or above

#### Scenario: The covering elements keep the alpha they had

- **WHEN** the browser test opens the dataset dialog and the lightbox and reads the
  computed background colour of the scrim, the dialog frame and the lightbox
- **THEN** the alphas are 0.78, 0.97 and 0.88, each within 0.01


### Requirement: The information panel shows the selected system

The information panel SHALL be hidden while nothing is selected, and SHALL open on the
selection. It SHALL hold, in this order:

1. A header with the system's name, a copy button beside the name, and a close button.
2. A grid of fields: the position in game coordinates with a copy button, the distance
   from Sol, the range from the camera, the **galactic region**, and then `primaryStar`,
   `allegiance`, `government`, `primaryEconomy`, `security`, `population` and `bodyCount`. A
   field the record does not carry SHALL be left out, not shown empty. The first four
   fields are worked out from the position and are always shown.
3. The categories, as one chip per category in the record's colour, the primary first and
   then the secondary ones in the order the record gave them.
4. The description, when the record carries one.
5. The images, when the record carries any.
6. A footer with a **centre view** button and one button per entry of the `actions` option.

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

The first four fields therefore fill exactly **six cells**, whatever the record holds. Every
field after them SHALL fill the grid in the order this requirement states, two to a row, so
an **odd** count of those later fields leaves the last one alone on its row, and it SHALL
take both columns.

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

The **range from the camera** follows the view, so the panel SHALL rewrite it at most 10
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

  The record sits 103 light years from Sol and the selection holds the camera within 500,
  so neither field passes 1,000 and neither shows a thousands separator. The separator is
  what the scenario "The position keeps its fraction" reads, in `-9,530.9375`

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
  each, so the four always-shown fields fill **six** cells and leave the grid full. A record
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
