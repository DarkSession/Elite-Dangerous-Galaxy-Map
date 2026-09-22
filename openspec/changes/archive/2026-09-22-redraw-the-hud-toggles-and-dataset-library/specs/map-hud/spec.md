## ADDED Requirements

### Requirement: The category panel's tabs join and its row icon turns

The **SYSTEMS** and **SHAPES** tabs SHALL draw as one joined control: the two buttons sit
side by side with no gap and share the border between them, so the pair reads as one
control with two states rather than as two buttons. The tab text SHALL be 11.5 px, weight
600, with 2.5 px of letter spacing, in the **display face** the panel headings read in,
which is what the mockup draws. That is larger than the 9 px the tabs carry today and a
different face: the tabs read in the monospace face now.

The icon at the end of a category row SHALL be a **chevron** that points down while the
row's list is folded and turns 180 degrees while it is open. The three-line list icon is
gone. The turn SHALL take the same 140 ms the list itself takes to open, so the icon and
the list move together.

The chevron SHALL carry `aria-hidden`, because the row already states the same thing
through `aria-expanded`, and a reader that read both would say it twice.

#### Scenario: The two tabs share one border

- **WHEN** the browser test reads the bounding box of the **SYSTEMS** tab and of the
  **SHAPES** tab
- **THEN** the right edge of the first and the left edge of the second are within 1 CSS
  pixel of each other

#### Scenario: The row icon turns when the list opens

- **WHEN** the browser test reads the computed `transform` of a folded category row's
  icon, clicks the row away from its dot, waits 200 ms and reads the `transform` again
- **THEN** the first reading is the identity and the second is a 180 degree rotation

### Requirement: The map options panel carries the switches the map can act on

The map options panel SHALL hold one switch for each map option the host leaves open **and
the map can act on**, and no segmented control. The options are **Galactic regions**,
**System names**, **System icons**, **Coordinate grid**, **Shapes** and **Nebulae**.
`lockedOptions` below is what takes one out by the host's choice; three of the six are also
taken out by what the map holds. Each one SHALL be a switch of the shape the panel already
uses, with its label and its track.

**Galactic regions** SHALL call `setRegionsVisible`, which `galactic-regions` defines. It
SHALL open on the state the map is in, which is on unless the options named `regions:
false`.

**System names** SHALL call `setSystemNamesVisible`, which `system-selection` defines. It
SHALL open on the state the map is in, which is off unless the options named
`systemNames: true`.

**System icons** SHALL call `setSystemIconsVisible`, which `system-icons` defines. It
SHALL open on the state the map is in, which is on unless the options named
`systemIcons: false`. The panel SHALL draw this switch only while `hasSystemIcons()`
returns true. On a map where no record names an icon the switch moves nothing the user can
see.

**`hasSystemIcons()` may read true after the last icon goes.** `system-icons` states the
rule it follows: the reading rises when a record names an icon and falls only when the set
is cleared, because a correction would need a sweep of the set. A record that is replaced by
one with no icon therefore leaves the switch on the panel until the next dataset load. The
panel SHALL NOT sweep the set to correct it: a switch that is there and moves nothing costs
the user one reading, and a sweep of 50,000 records 10 times a second costs every user a
frame.

**Coordinate grid** SHALL call `setGridVisible`, which `coordinate-grid` defines. It SHALL
open on the state the map is in, which is off unless the options named `grid`. The demo
site names it, so the switch opens on there, and a map built with no options opens it off.

**Shapes** SHALL call `setShapesVisible`, which `map-shapes` defines. It SHALL open on the
state the map is in, which is on unless the options named `shapes: false`. The panel SHALL
draw this switch only while `sphereCount() + lineCount()` is above 0. On a map that holds no
sphere and no line the switch moves nothing the user can see.

**Nebulae** SHALL call `setNebulaeVisible`, which `nebulae` defines. The panel SHALL draw
this switch only where `hasNebulae()` returns true. The switch SHALL open on the state the
map is in, which is on.

**The three conditional switches follow the map, not the moment the HUD was built.** The
panel SHALL read `hasSystemIcons()`, the two shape counts and `hasNebulae()` on its tick,
which runs 10 times a second. A switch SHALL appear within one tick of its reading turning
true, and SHALL go within one tick of its reading turning false, so a host that adds the
first shape or a dataset load that clears the shapes moves the panel with it. Each of the
four readings SHALL be a call that costs no walk of the set, so the tick's cost does not
follow the size of the set: a map of 50,000 systems and 4,096 shapes costs the same four
reads as an empty one.

**A switch that goes SHALL keep its state.** The map option itself does not move when its
switch goes: a map whose shapes were switched off and then cleared still reads
`areShapesVisible()` as false, and the switch reads off when it comes back.

The HUD SHALL reach all six through the public handle and through nothing else, which is
the boundary `AGENTS.md` holds and the lint rules enforce.

**The host locks an option.** `HudOptions` SHALL carry `lockedOptions`, an array of the
names `regions`, `systemNames`, `systemIcons`, `grid`, `shapes` and `nebulae`. A locked
option SHALL draw **no switch**. The user is never shown a control that does nothing, and a
switch that reads disabled states a rule the user cannot act on. The panel SHALL leave out
that switch and nothing else, so the switches that stay keep the order above.

When **no switch the panel holds is shown**, whether because the host locked it or because
the map holds nothing it moves, the HUD SHALL **show** no map options panel, and the left
column SHALL hold the category browser alone. The panel SHALL come back within one tick of
one switch being shown again. The rule is the switches the panel would show and not a fixed
count, because the count is not fixed: it is three on a bare map, four with a shape, and six
with a shape, an icon record and a nebula source.

**"Shows no panel" is a reading of the screen and not a count of elements.** A panel that
every lock took SHALL NOT be built at all, because that reading cannot change while the map
runs. A panel the map emptied MAY stay in the document carrying `hidden`, because the map
can fill it again on the next tick. A test of this rule SHALL read whether the panel is
shown — `hidden`, or a box of no height — and SHALL NOT count elements, because the two
cases differ there and the user cannot tell them apart.

A name the six above do not hold SHALL be ignored, and a `lockedOptions` that is not an
array SHALL be ignored, because a setting the HUD cannot read takes the default.

**A lock holds the user, not the host.** `setRegionsVisible`, `setSystemNamesVisible`,
`setSystemIconsVisible`, `setGridVisible`, `setShapesVisible` and `setNebulaeVisible` SHALL
work on a locked option as they do on an open one, so the host changes it in code at any
time. The same holds for an option whose switch the map dropped. A locked option SHALL start
at the value its `GalaxyMapOptions` field gives, which is `regions`, `systemNames`,
`systemIcons`, `grid` and `shapes`; the nebulae start visible on a map that holds a source,
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

- **WHEN** the browser test adds one sphere, calls `setGridVisible(true)` and
  `setShapesVisible(false)` on the handle, waits 200 ms and reads the two switches
- **THEN** the grid switch reads on and the shapes switch reads off

#### Scenario: The grid switch opens on the state the options named

- **WHEN** a browser test builds a map with `hud: true` and `grid: true` and reads the
  coordinate grid switch, and a second builds one with `hud: true` and no `grid` option
  and reads the same switch
- **THEN** the first reads on and the second reads off

#### Scenario: The shapes switch follows the shape set

- **WHEN** a browser test builds a map with `hud: true` and no shape and reads the map
  options panel, adds one sphere, waits 200 ms and reads it again, then clears the shapes,
  waits 200 ms and reads it a third time
- **THEN** the panel shows no **Shapes** switch, then shows one that reads on, then shows
  none again

#### Scenario: The system icons switch follows the records

- **WHEN** a browser test builds a map with `hud: true`, adds one system that names no
  icon and reads the map options panel, then adds a system that names two icons, waits
  200 ms and reads it again, then clears the systems, waits 200 ms and reads it a third
  time
- **THEN** the first reading shows no **System icons** switch, the second shows one that
  reads on, and the third shows none again

#### Scenario: A dropped switch keeps its state

- **WHEN** a browser test adds one sphere, clicks the **Shapes** switch off, clears the
  shapes, waits 200 ms, reads `areShapesVisible`, adds a sphere again, waits 200 ms and
  reads the switch
- **THEN** the reading is false at both points and the switch reads off when it comes back

#### Scenario: The nebulae switch appears only where the map holds them

- **WHEN** a browser test builds a map with `hud: true`, the nebula source, one sphere and
  one system that names an icon, and counts the switches, and a second builds one with the
  same shape and record but no `nebulae` option and counts them
- **THEN** the first holds six switches with a **Nebulae** switch that reads on, and the
  second holds five and no switch labelled **Nebulae**

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

- **WHEN** a browser test builds a map with `hud: { lockedOptions: ['grid', 'shapes'] }`,
  adds one sphere and one system that names an icon, waits 200 ms and reads the map
  options panel
- **THEN** the panel shows the **Galactic regions**, **System names** and **System icons**
  switches in that order, and shows no coordinate grid switch and no shapes switch

#### Scenario: Every switch locked drops the panel

- **WHEN** a browser test builds a map with no nebula source, one sphere, one system that
  names an icon and
  `hud: { lockedOptions: ['regions', 'systemNames', 'systemIcons', 'grid', 'shapes'] }` and
  reads the HUD, and a second builds one **with** the source and the same five names
- **THEN** the first shows no map options panel and the category browser is there, and the
  second shows a panel with the **Nebulae** switch alone

#### Scenario: A map that moves nothing holds no panel

- **WHEN** a browser test builds a map with no nebula source, no shape, no icon record and
  `hud: { lockedOptions: ['regions', 'systemNames', 'grid'] }`, reads the HUD, adds one
  sphere, waits 200 ms and reads it again
- **THEN** the first reading shows no map options panel and the second shows one with the
  **Shapes** switch alone

#### Scenario: The nebulae switch locks with the rest

- **WHEN** a browser test builds a map with the nebula source and
  `hud: { lockedOptions: ['regions', 'systemNames', 'systemIcons', 'grid', 'shapes', 'nebulae'] }`
  and reads the HUD
- **THEN** the HUD holds no map options panel, and the sprites still draw

#### Scenario: A locked option still moves through the handle

- **WHEN** a browser test builds a map with `grid: true` and
  `hud: { lockedOptions: ['grid'] }`, reads `isGridVisible`, calls `setGridVisible(false)`,
  draws a frame and reads `isGridVisible` and the panel again
- **THEN** the readings are `true` and `false`, the grid stops drawing, and the panel holds
  no grid switch at either reading

#### Scenario: A lock list the HUD cannot read is ignored

- **WHEN** a browser test builds a map with no nebula source, one sphere and one system
  that names an icon, whose `lockedOptions` hold the name `datasets` and the number 7, and
  a second whose `lockedOptions` is the string `grid`, waits 200 ms and reads the map
  options panel of each
- **THEN** both panels show all five switches

#### Scenario: The system icons switch moves the stacks

- **WHEN** a browser test builds a map with the HUD, adds one system with two icons in
  view, waits 200 ms, clicks the **System icons** switch, draws a frame and counts the icon
  placements the handle reports, then clicks it again, draws and counts
- **THEN** the counts are 0 and 2, and the switch reads off and then on

  The stacks draw on the canvas and not in the overlay, which `system-icons` states, so
  the count is of the placements the handle reports and not of DOM elements. A count of
  elements would read 0 at both readings and the scenario would pass on nothing.

#### Scenario: The system icons switch opens on the option

- **WHEN** a browser test builds a map with `systemIcons: false` and the HUD, adds one
  system that names an icon, waits 200 ms and reads the **System icons** switch, and a
  second builds one with no `systemIcons` option and does the same
- **THEN** the first reads off and the second reads on

## MODIFIED Requirements

### Requirement: The top bar names the map, the region and the zoom

The top bar SHALL hold three groups: on the left the title and the name of the region under
the cursor, in the **centre** the dataset field when the catalog holds an entry, and on the
right the zoom distance and a **reset view** button.

The title SHALL be the `title` of the options, and `GALACTIC CARTOGRAPHICS` when the
options name none.

**The dataset field sits at the centre of the bar.** The left group and the right group
SHALL take an even share of the space the centre group leaves, so the field is centred on
the bar's own width and not merely placed between the two groups. Where the text of the
left or the right group is too long for its share, that group SHALL clip its text with an
ellipsis rather than push the field off centre. The divider that sat beside the field is
gone with the field's old place beside the region name.

With `datasetArrows` on, the **centre group** SHALL hold that place: the arrows and the
counter sit inside it, so the group is centred on the bar and the field sits a little left
of the middle. The counter follows the next arrow and has no counterpart before the
previous arrow, which is what the mockup draws, so the field moves left by about half the
counter's width. The arrows are off by default, which `dataset-catalog` states, so the
field itself is centred on every map that asks for none.

The dataset field is what `dataset-catalog` states. It SHALL NOT replace the region name:
the region name answers where the camera is looking and the dataset field answers what the
map is showing, and the two are not the same question. With an empty catalog the bar SHALL
hold the left group and the right group and nothing between them, with no gap where the
field would sit.

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
- **THEN** the first bar holds the dataset field between the region name and the zoom, and
  the second holds the title, the region name, the zoom and the reset button and nothing
  else

#### Scenario: The dataset field is centred on the bar

- **WHEN** the browser test opens a map with the HUD and a catalog at 1280 by 720, and
  reads the horizontal centre of the dataset field and of the top bar
- **THEN** the two are within 2 CSS pixels of each other

#### Scenario: The centre group is centred while the arrows are on

- **WHEN** the browser test opens a map with the HUD, a catalog and `datasetArrows` true at
  1280 by 720, and reads the horizontal centre of the centre group and of the top bar
- **THEN** the two are within 2 CSS pixels of each other

#### Scenario: A long title does not push the field off centre

- **WHEN** the browser test builds a map with a catalog and a title of 60 characters, reads
  the horizontal centre of the dataset field and of the top bar, and reads whether the
  title element's scroll width passes its client width
- **THEN** the two centres are within 2 CSS pixels of each other and the title is clipped

### Requirement: The HUD is opt-in and the library owns it

`GalaxyMapOptions` SHALL carry an optional `hud`. `hud` SHALL be absent or `false` by
default, and the map SHALL then build no HUD and add no element to the page. `hud: true`
SHALL build the HUD with its defaults. `hud` MAY instead be an object of these fields,
each optional:

| Field            | Type                         | What it does                                        |
| ---------------- | ---------------------------- | --------------------------------------------------- |
| `title`          | string                       | The name in the top bar                             |
| `host`           | element                      | Where the HUD is built                              |
| `details`        | function                     | Loads a system's description, values and actions    |
| `infoFields`     | object of three booleans     | Which worked-out fields the information panel shows |
| `lockedOptions`  | array of option names        | Map options the user may not change                 |
| `datasetArrows`  | boolean                      | Draws the step arrows beside the dataset field      |

`details` is stated by `system-details`. `infoFields` is stated by the requirement "The
information panel shows the selected system" of this capability, `lockedOptions` by the
requirement "The map options panel carries the switches the map can act on" of this
capability, and `datasetArrows` by the requirement "The host turns on the dataset step
arrows" of `dataset-catalog`. A field the host leaves out takes its default, and a value the
HUD cannot read takes the default as well.

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

The HUD SHALL hold at most 256 category rows, 200 system or shape rows, 8 thumbnails, 256
dataset cards and one information panel, so its DOM node count does not follow the size of
the set or the size of the shape set. The cards follow the catalog, which the catalog reader
caps at **256 entries**: the dialog holds one card per entry it keeps and needs no cap of its
own, where the old grouped list held 120 rows and said when it cut the list. A card SHALL
cost at most **5** elements, so a full catalog is at most 1,280 elements. The cards SHALL
only be there while the dialog is open, and the dialog SHALL clear them when it closes. One
tab shows at a time, so the rows of the other tab SHALL NOT be in the document.

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
  elements under the HUD root with the dataset dialog closed
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

- **WHEN** the browser test builds a map with a full catalog of 256 entries, counts the
  elements under the HUD root, opens the dataset dialog, counts again, closes it and counts
  once more
- **THEN** the second count is at most 1,280 more than the first, and the third is back
  within 20 of the first

  The bound is the card bound of this requirement: 256 cards of at most 5 elements each. The
  reading was 130 entries and 600 elements while the dialog held a grouped list of 120 rows.
  The close reading is "within 20" and not "the same", because the dialog keeps its frame,
  its search box and its chips.

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
panel shows** SHALL carry `aria-pressed`, and the rest of a category row SHALL carry
`aria-expanded`. A switch the panel hides SHALL take no focus, because a hidden control is
not a control the user can reach. The dot SHALL carry an `aria-label` that names its category, because it
shows a colour alone.

The lightbox SHALL take the focus when it opens and SHALL give it back to the thumbnail
that opened it when it closes, so a keyboard user is not left at the top of the page.

**The dataset dialog SHALL follow the same rule as the lightbox.** It SHALL take the focus
when it opens, SHALL hold the focus while it is open, and SHALL give it back to the dataset
field when it closes. Its search box is a text field, so the movement keys SHALL NOT reach
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

- **WHEN** the browser test opens the map with the HUD on, `datasetArrows` on and a set that
  holds a shape and a system that names an icon, so the shapes tab is not disabled and every
  conditional switch is shown, focuses the search box, and presses `Tab` through the
  panels, reading the focused element at each step
- **THEN** the two tabs, every category dot, every category row, the ALL and NONE buttons,
  every switch the panel shows, the two copy buttons, the two dataset step arrows, the
  dataset field and the reset view button are each focused once. Where the map holds nebulae
  the panel shows six switches and the **Nebulae** switch is one of them; where it does not,
  the panel shows five and no focus step lands on a nebulae switch

#### Scenario: Tab reaches every control of the dataset library

- **WHEN** the browser test opens the dataset dialog on a catalog of two collections and
  presses `Tab` through it, reading the focused element at each step
- **THEN** the search box, every chip, every card and the close button are each focused
  once, and the focus does not leave the dialog

#### Scenario: Enter and Space work a control

- **WHEN** the browser test focuses the colour dot of a category row, presses `Enter`, reads
  `isCategoryVisible`, presses `Space` and reads it again
- **THEN** the readings are `false` and `true`

#### Scenario: The controls carry their state and their names

- **WHEN** the browser test reads every switch the panel shows, the two tabs and a
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
  adds one system that names an icon, waits 200 ms, tabs through the map options panel and
  reads each control it reaches
- **THEN** it reaches three switches — **Galactic regions**, **System names** and **System
  icons** — each carries `aria-pressed` and a name a screen reader can read, and each acts
  on `Enter` and on `Space`

#### Scenario: A hidden switch takes no focus

- **WHEN** a browser test builds a map with no shape, no icon record and no nebula source,
  tabs through the map options panel and reads each control it reaches
- **THEN** it reaches the **Galactic regions**, **System names** and **Coordinate grid**
  switches alone, and no focus step lands on a shapes switch or a system icons switch

## REMOVED Requirements

### Requirement: The map options panel carries the map switches

**Reason**: The panel now drops a switch the map cannot act on, so the requirement's rule
that the **Shapes** and **System icons** switches draw whatever the map holds is gone with
its scenario "The shapes switch draws with no shape on the map". The rest of the
requirement carries over unchanged under the new name.

**Migration**: Read "The map options panel carries the switches the map can act on" above.
Every other rule of the old requirement — the six labels, their setters, their start
states, `lockedOptions`, the lock that holds the user and not the host, and the panel that
goes when nothing is shown — is in it word for word or with the conditional switches folded
in. A host that locks options needs no change.
