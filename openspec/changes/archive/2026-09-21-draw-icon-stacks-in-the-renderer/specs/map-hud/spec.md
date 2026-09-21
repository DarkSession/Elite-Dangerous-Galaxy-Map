## MODIFIED Requirements

### Requirement: The map options panel carries the map switches

The map options panel SHALL hold one switch for each map option the host leaves open, and
no segmented control. The options are **Galactic regions**, **System names**, **System
icons**, **Coordinate grid** and **Shapes**, and a sixth, **Nebulae**, where the map holds
nebulae. `lockedOptions` below is what takes one out. Each one SHALL be a switch of the shape the
panel already uses, with its label and its track.

**Galactic regions** SHALL call `setRegionsVisible`, which `galactic-regions` defines. It
SHALL open on the state the map is in, which is on unless the options named `regions:
false`.

**System names** SHALL call `setSystemNamesVisible`, which `system-selection` defines. It
SHALL open on the state the map is in, which is off unless the options named
`systemNames: true`.

**System icons** SHALL call `setSystemIconsVisible`, which `system-icons` defines. It
SHALL open on the state the map is in, which is on unless the options named
`systemIcons: false`. It SHALL draw whether or not a record on the map names an icon,
because a host can add one at any time.

**Coordinate grid** SHALL call `setGridVisible`, which `coordinate-grid` defines. It SHALL
open on the state the map is in, which is off unless the options named `grid`. The demo
site names it, so the switch opens on there, and a map built with no options opens it off.

**Shapes** SHALL call `setShapesVisible`, which `map-shapes` defines. It SHALL open on the
state the map is in, which is on unless the options named `shapes: false`. It SHALL draw
whether or not the map holds a shape, because a host can add one at any time.

**Nebulae** SHALL call `setNebulaeVisible`, which `nebulae` defines. The panel SHALL build
this switch only where `hasNebulae()` returns true, and SHALL build the open switches of
the other five otherwise. A switch that turned on a feature the map cannot draw would be a control that
does nothing, and the other five are not in that position: each of them moves a feature
every map holds. The switch SHALL open on the state the map is in, which is on.

The HUD SHALL reach all six through the public handle and through nothing else, which is
the boundary `AGENTS.md` holds and the lint rules enforce.

**The host locks an option.** `HudOptions` SHALL carry `lockedOptions`, an array of the
names `regions`, `systemNames`, `systemIcons`, `grid`, `shapes` and `nebulae`. A locked option SHALL draw
**no switch**. The user is never shown a control that does nothing, and a switch that reads
disabled states a rule the user cannot act on. The panel SHALL leave out that switch and
nothing else, so the switches that stay keep the order above.

**`nebulae` is lockable because it is a switch.** The lock list names every switch the
panel can hold, and not only the five that every map holds. A host that locks `nebulae` on
a map that holds no nebula source loses nothing, because that switch was never built.

When **every switch the panel would hold** is locked, the HUD SHALL build **no map options
panel**, and the left column SHALL hold the category browser alone. On a map with no nebula
source that is the five; on a map with one it is the six. The rule is the switches the
panel would hold and not a fixed count, because the count is not fixed.

A name the six above do not hold SHALL be ignored, and a `lockedOptions` that is not an
array SHALL be ignored, because a setting the HUD cannot read takes the default.

**A lock holds the user, not the host.** `setRegionsVisible`, `setSystemNamesVisible`,
`setSystemIconsVisible`, `setGridVisible`, `setShapesVisible` and `setNebulaeVisible` SHALL
work on a locked option as they do on an open one, so the host changes it in code at any
time. A locked option SHALL start at the value its `GalaxyMapOptions` field gives, which is
`regions`, `systemNames`, `systemIcons`, `grid` and `shapes`; the nebulae start visible on a map that holds a source,
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

- **WHEN** a browser test builds a map with `hud: { lockedOptions: ['grid', 'shapes'] }`
  and reads the map options panel
- **THEN** the panel holds the **Galactic regions**, **System names** and **System icons**
  switches in that order, and holds no coordinate grid switch and no shapes switch

#### Scenario: Every switch locked drops the panel

- **WHEN** a browser test builds a map with no nebula source and
  `hud: { lockedOptions: ['regions', 'systemNames', 'systemIcons', 'grid', 'shapes'] }` and
  reads the HUD, and a second builds one **with** the source and the same five names
- **THEN** the first holds no map options panel and the category browser is there, and the
  second holds a panel with the **Nebulae** switch alone

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

- **WHEN** a browser test builds a map with no nebula source whose `lockedOptions` hold the
  name `datasets` and the number 7, and a second whose `lockedOptions` is the string
  `grid`, and reads the map options panel of each
- **THEN** both panels hold all five switches

#### Scenario: The system icons switch moves the stacks

- **WHEN** a browser test builds a map with the HUD, adds one system with two icons in
  view, clicks the **System icons** switch, draws a frame and counts the icon placements
  the handle reports, then clicks it again, draws and counts
- **THEN** the counts are 0 and 2, and the switch reads off and then on

  The stacks draw on the canvas and not in the overlay, which `system-icons` states, so
  the count is of the placements the handle reports and not of DOM elements. A count of
  elements would read 0 at both readings and the scenario would pass on nothing.

#### Scenario: The system icons switch opens on the option

- **WHEN** a browser test builds a map with `systemIcons: false` and the HUD and reads the
  **System icons** switch, and a second builds one with no `systemIcons` option and reads
  the same switch
- **THEN** the first reads off and the second reads on
