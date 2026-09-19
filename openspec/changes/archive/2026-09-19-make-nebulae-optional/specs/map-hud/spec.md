## RENAMED Requirements

- FROM: `### Requirement: The map options panel carries four switches`
- TO: `### Requirement: The map options panel carries the map switches`

## MODIFIED Requirements

### Requirement: The map options panel carries the map switches

The map options panel SHALL hold four switches and no segmented control, **and a fifth
switch where the map holds nebulae**. Each one SHALL be a switch of the shape the panel
already uses, with its label and its track.

**Galactic regions** SHALL call `setRegionsVisible`, which `galactic-regions` defines. It
SHALL open on the state the map is in, which is on unless the options named `regions:
false`.

**System names** SHALL call `setSystemNamesVisible`, which `system-selection` defines. It
SHALL open off.

**Coordinate grid** SHALL call `setGridVisible`, which `coordinate-grid` defines. It SHALL
open on the state the map is in, which is off unless the options named `grid`. The demo
site names it, so the switch opens on there, and a map built with no options opens it off.

**Shapes** SHALL call `setShapesVisible`, which `map-shapes` defines. It SHALL open on the
state the map is in, which is on unless the options named `shapes: false`. It SHALL draw
whether or not the map holds a shape, because a host can add one at any time.

**Nebulae** SHALL call `setNebulaeVisible`, which `nebulae` defines. The panel SHALL build
this switch only where `hasNebulae()` returns true, and SHALL build four switches
otherwise. A switch that turned on a feature the map cannot draw would be a control that
does nothing, and the other four are not in that position: each of them moves a feature
every map holds. The switch SHALL open on the state the map is in, which is on.

The HUD SHALL reach all five through the public handle and through nothing else, which is
the boundary `AGENTS.md` holds and the lint rules enforce.

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
