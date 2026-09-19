## MODIFIED Requirements

### Requirement: The HUD is opt-in and the library owns it

`GalaxyMapOptions` SHALL carry an optional `hud`. `hud` SHALL be absent or `false` by
default, and the map SHALL then build no HUD and add no element to the page. `hud: true`
SHALL build the HUD with its defaults. `hud` MAY instead be an object of these fields,
each optional:

| Field           | Type                         | What it does                                        |
| --------------- | ---------------------------- | --------------------------------------------------- |
| `title`         | string                       | The name in the top bar                             |
| `host`          | element                      | Where the HUD is built                              |
| `details`       | function                     | Loads a system's description, values and actions    |
| `infoFields`    | object of three booleans     | Which worked-out fields the information panel shows |
| `lockedOptions` | array of option names        | Map options the user may not change                 |

`details` is stated by `system-details`. `infoFields` is stated by the requirement "The
information panel shows the selected system" and `lockedOptions` by the requirement "The
map options panel carries the map switches", both of this capability. A field the host leaves
out takes its default, and a value the HUD cannot read takes the default as well.

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

### Requirement: The map options panel carries the map switches

The map options panel SHALL hold one switch for each map option the host leaves open, and
no segmented control. The options are **Galactic regions**, **System names**, **Coordinate
grid** and **Shapes**, and a fifth, **Nebulae**, where the map holds nebulae.
`lockedOptions` below is what takes one out. Each one SHALL be a switch of the shape the
panel already uses, with its label and its track.

**Galactic regions** SHALL call `setRegionsVisible`, which `galactic-regions` defines. It
SHALL open on the state the map is in, which is on unless the options named `regions:
false`.

**System names** SHALL call `setSystemNamesVisible`, which `system-selection` defines. It
SHALL open on the state the map is in, which is off unless the options named
`systemNames: true`.

**Coordinate grid** SHALL call `setGridVisible`, which `coordinate-grid` defines. It SHALL
open on the state the map is in, which is off unless the options named `grid`. The demo
site names it, so the switch opens on there, and a map built with no options opens it off.

**Shapes** SHALL call `setShapesVisible`, which `map-shapes` defines. It SHALL open on the
state the map is in, which is on unless the options named `shapes: false`. It SHALL draw
whether or not the map holds a shape, because a host can add one at any time.

**Nebulae** SHALL call `setNebulaeVisible`, which `nebulae` defines. The panel SHALL build
this switch only where `hasNebulae()` returns true, and SHALL build the open switches of
the other four otherwise. A switch that turned on a feature the map cannot draw would be a control that
does nothing, and the other four are not in that position: each of them moves a feature
every map holds. The switch SHALL open on the state the map is in, which is on.

The HUD SHALL reach all five through the public handle and through nothing else, which is
the boundary `AGENTS.md` holds and the lint rules enforce.

**The host locks an option.** `HudOptions` SHALL carry `lockedOptions`, an array of the
names `regions`, `systemNames`, `grid`, `shapes` and `nebulae`. A locked option SHALL draw
**no switch**. The user is never shown a control that does nothing, and a switch that reads
disabled states a rule the user cannot act on. The panel SHALL leave out that switch and
nothing else, so the switches that stay keep the order above.

**`nebulae` is lockable because it is a switch.** The lock list names every switch the
panel can hold, and not only the four that every map holds. A host that locks `nebulae` on
a map that holds no nebula source loses nothing, because that switch was never built.

When **every switch the panel would hold** is locked, the HUD SHALL build **no map options
panel**, and the left column SHALL hold the category browser alone. On a map with no nebula
source that is the four; on a map with one it is the five. The rule is the switches the
panel would hold and not a fixed count, because the count is not fixed.

A name the five above do not hold SHALL be ignored, and a `lockedOptions` that is not an
array SHALL be ignored, because a setting the HUD cannot read takes the default.

**A lock holds the user, not the host.** `setRegionsVisible`, `setSystemNamesVisible`,
`setGridVisible`, `setShapesVisible` and `setNebulaeVisible` SHALL work on a locked option
as they do on an open one, so the host changes it in code at any time. A locked option
SHALL start at the value its `GalaxyMapOptions` field gives, which is `regions`,
`systemNames`, `grid` and `shapes`; the nebulae start visible on a map that holds a source,
which `nebulae` states. The library SHALL NOT read `lockedOptions` anywhere but the HUD.

The three buttons **NONE**, **SIMPLIFIED** and **ACCURATE** are gone with the region mode
they set. The overlay now has one state the user chooses, so it takes the control every
other overlay of this panel takes.

Each control SHALL show the state the map is in, so a host that changes a setting through
the handle moves the control with it.

#### Scenario: The regions switch changes the overlay

- **WHEN** the browser test reads `areRegionsVisible`, clicks the **Galactic regions**
  switch and reads it again
- **THEN** the readings are `true` and `false`, and the switch follows

#### Scenario: The panel opens on the state the options named

- **WHEN** a browser test builds a map with `hud: true` and `regions: false` and reads the
  **Galactic regions** switch, and a second builds one with `hud: true` and no `regions`
  option and reads the same switch
- **THEN** the first reads off and the second reads on

#### Scenario: A change through the handle moves the control

- **WHEN** the browser test calls `setGridVisible(true)` and `setShapesVisible(false)` on
  the handle and reads the two switches
- **THEN** the grid switch reads on and the shapes switch reads off

#### Scenario: The grid switch opens on the state the options named

- **WHEN** a browser test builds a map with `hud: true` and `grid: true` and reads the
  coordinate grid switch, and a second builds one with `hud: true` and no `grid` option
  and reads the same switch
- **THEN** the first reads on and the second reads off

#### Scenario: The shapes switch draws with no shape on the map

- **WHEN** a browser test builds a map with `hud: true` and adds no shape, and reads the
  map options panel
- **THEN** the panel holds a **Shapes** switch and it reads on

#### Scenario: The nebulae switch appears only where the map holds them

- **WHEN** a browser test builds a map with `hud: true` and the nebula source and counts
  the switches, and a second builds one with `hud: true` and no `nebulae` option and
  counts them
- **THEN** the first holds five switches with a **Nebulae** switch that reads on, and the
  second holds four and no switch labelled **Nebulae**

#### Scenario: The nebulae switch removes the sprites

- **WHEN** the browser test opens a map with the HUD and the nebula source inside the zoom
  band, reads the drawn count, clicks the **Nebulae** switch and reads it again
- **THEN** the first reading is above 0, the second is 0, and the switch reads off

#### Scenario: The names switch opens on the state the options named

- **WHEN** a browser test builds a map with `hud: true` and `systemNames: true` and reads
  the **System names** switch, and a second builds one with `hud: true` and no
  `systemNames` option and reads the same switch
- **THEN** the first reads on and the second reads off

#### Scenario: A locked option draws no switch

- **WHEN** a browser test builds a map with `hud: { lockedOptions: ['grid', 'shapes'] }`
  and reads the map options panel
- **THEN** the panel holds the **Galactic regions** switch and the **System names** switch
  in that order, and holds no coordinate grid switch and no shapes switch

#### Scenario: Every switch locked drops the panel

- **WHEN** a browser test builds a map with no nebula source and
  `hud: { lockedOptions: ['regions', 'systemNames', 'grid', 'shapes'] }` and reads the HUD,
  and a second builds one **with** the source and the same four names
- **THEN** the first holds no map options panel and the category browser is there, and the
  second holds a panel with the **Nebulae** switch alone

#### Scenario: The nebulae switch locks with the rest

- **WHEN** a browser test builds a map with the nebula source and
  `hud: { lockedOptions: ['regions', 'systemNames', 'grid', 'shapes', 'nebulae'] }` and
  reads the HUD
- **THEN** the HUD holds no map options panel, and the sprites still draw

#### Scenario: A locked option still moves through the handle

- **WHEN** a browser test builds a map with `grid: true` and
  `hud: { lockedOptions: ['grid'] }`, reads `isGridVisible`, calls `setGridVisible(false)`,
  draws a frame and reads `isGridVisible` and the panel again
- **THEN** the readings are `true` and `false`, the grid stops drawing, and the panel holds
  no grid switch at either reading

#### Scenario: A lock list the HUD cannot read is ignored

- **WHEN** a browser test builds a map with no nebula source whose `lockedOptions` hold the
  name `datasets` and the number 7, and a second whose `lockedOptions` is the string
  `grid`, and reads the map options panel of each
- **THEN** both panels hold all four switches

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
3. The categories, as one chip per category in the record's colour, the primary first and
   then the secondary ones in the order the record gave them.
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

### Requirement: Every HUD control works from the keyboard

Every control the user can click SHALL be a `button` or an `input` element, not a `div`
with a click listener. The mockup builds each one as a `div`, which takes no focus and
answers no key.

Each control SHALL therefore be reachable by `Tab`, in the order the panels read on the
screen, and SHALL act on `Enter` and on `Space` as it does on a click. Each SHALL carry a
name a screen reader can read: its own text, or an `aria-label` where the control shows an
icon alone.

A control that holds a state the user can see SHALL report that state: the **colour dot**
of a category row, the two tabs of the category panel and **every switch the map options
panel holds** SHALL carry `aria-pressed`, and the rest of a category row SHALL carry
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
  every switch the panel holds, the two copy buttons, the dataset field and the reset
  view button are each focused once. Where the map holds nebulae the panel holds five
  switches and the **Nebulae** switch is one of them; where it does not, the panel holds
  four and no focus step lands on a nebulae switch

#### Scenario: Enter and Space work a control

- **WHEN** the browser test focuses the colour dot of a category row, presses `Enter`, reads
  `isCategoryVisible`, presses `Space` and reads it again
- **THEN** the readings are `false` and `true`

#### Scenario: The controls carry their state and their names

- **WHEN** the browser test reads every switch the panel holds, the two tabs and a
  category row with the HUD on
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

#### Scenario: A panel of fewer switches still reports each state

- **WHEN** a browser test builds a map with `hud: { lockedOptions: ['grid', 'shapes'] }`,
  tabs through the map options panel and reads each control it reaches
- **THEN** it reaches two switches, each carries `aria-pressed` and a name a screen reader
  can read, and each acts on `Enter` and on `Space`
