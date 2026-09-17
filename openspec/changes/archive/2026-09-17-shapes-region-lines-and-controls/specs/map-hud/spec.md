## REMOVED Requirements

### Requirement: The map options panel carries the region mode, the names and the grid

**Reason**: The panel's segmented region mode control is gone with the three region modes,
which `galactic-regions` states, so the two scenarios that read it go with it: "The region
buttons change the mode" and "The panel opens on the mode the options named". A MODIFIED
block replaces a requirement but cannot drop one of its scenarios, so the rewrite is written
as a removal and an addition. The replacement is the added requirement "The map options
panel carries four switches", which carries every other rule of this one.

**Migration**: A user who chose **NONE** now turns the **Galactic regions** switch off. A
host that read the panel through `getRegionMode` reads `areRegionsVisible` instead, which
`galactic-regions` states.

## ADDED Requirements

### Requirement: The map options panel carries four switches

The map options panel SHALL hold four switches and no segmented control. Each one SHALL be
a switch of the shape the panel already uses, with its label and its track.

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

## MODIFIED Requirements

### Requirement: Every HUD control works from the keyboard

Every control the user can click SHALL be a `button` or an `input` element, not a `div`
with a click listener. The mockup builds each one as a `div`, which takes no focus and
answers no key.

Each control SHALL therefore be reachable by `Tab`, in the order the panels read on the
screen, and SHALL act on `Enter` and on `Space` as it does on a click. Each SHALL carry a
name a screen reader can read: its own text, or an `aria-label` where the control shows an
icon alone.

A control that holds a state the user can see SHALL report that state: a category row and
the four switches of the map options panel SHALL carry `aria-pressed`.

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

- **WHEN** the browser test opens the map with the HUD on, focuses the search box, and
  presses `Tab` through the panels, reading the focused element at each step
- **THEN** every category row, the ALL and NONE buttons, the four switches, the two copy
  buttons, the dataset field and the reset view button are each focused once

#### Scenario: Enter and Space work a control

- **WHEN** the browser test focuses a category row, presses `Enter`, reads
  `isCategoryVisible`, presses `Space` and reads it again
- **THEN** the readings are `false` and `true`

#### Scenario: The controls carry their state and their names

- **WHEN** the browser test reads the four switches and a category row with the HUD on
- **THEN** each switch reports its state in `aria-pressed`, and every control has a
  readable name

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
