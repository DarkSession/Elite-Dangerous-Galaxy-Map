## Purpose

Lets a host say what a system **is** — a Titan, a fleet carrier, a community goal — by
naming icons on the system's record. The map stacks them over the system's marker, in the
game's own artwork or in the host's, and points the lowest one at the marker with a small
arrow.

## ADDED Requirements

### Requirement: The library ships the game's galaxy-map icons

The library SHALL hold a catalogue of built-in icons. The symbols of the catalogue SHALL
be exactly the symbols of `GALAXY_MAP_MARKERS` of
`@elite-dangerous-almanac/core/galaxy-map/markers`, which holds 16 at version 0.2.14: `bookmark`,
`community-goal`, `conflict-zone`, `destination`, `engineer`, `fleet-carrier`,
`front-line`, `mission`, `squadron-carrier`, `starter-zone`, `station-abandoned`,
`station-damaged`, `station-repairing`, `station-under-attack`, `titan` and `waypoint`.

Each symbol SHALL carry a vector the package ships and the **glyph colour** the catalogue
record reports as `color`. The glyph colour is what the arrow of the requirement below
draws in. `front-line` is the one record whose `frameColor` differs from its `color`, and
the arrow SHALL take `color` there as it does everywhere else.

**The vectors ship with the package**, because the almanac's published package carries
`assets/ships/` and not `assets/galaxy-map/`. A repository test SHALL compare the shipped
set against the catalogue and SHALL fail where the two disagree: a symbol with no vector, a
vector with no symbol, or a vector whose root `color` is not the catalogue's `color`. That
test is what keeps a copied vector and its catalogue record together.

The built-in vectors SHALL be emitted as **files of the package build** rather than inlined
into the JavaScript, so a host that names no icon downloads none of them. The library SHALL
therefore reference a built-in vector by a URL relative to its own module and SHALL NOT
name a third-party address.

#### Scenario: Every catalogue symbol has a vector and every vector a symbol

- **WHEN** a repository test reads `GALAXY_MAP_MARKERS` and the shipped vector directory
- **THEN** the two symbol sets are equal, and the set is not empty

#### Scenario: A vector carries the colour its record reports

- **WHEN** the repository test reads the root `color` attribute of each shipped vector and
  compares it to the `color` of that symbol's catalogue record, without case
- **THEN** every pair is equal

#### Scenario: The vectors are files of the build

- **WHEN** the package is built and a test reads the emitted output
- **THEN** one file per built-in symbol is present in the output, and no built-in vector's
  markup is inside an emitted JavaScript file

#### Scenario: A built-in URL names no third-party address

- **WHEN** a unit test reads the resolved URL of every built-in symbol
- **THEN** each one is non-empty and none names a scheme and a host the package does not
  serve itself

### Requirement: A record names its icons

`SystemRecordInput` SHALL carry an optional `icons`, an array of at most **4** entries. An
entry SHALL be one of two forms:

| Form              | What it is                                                              |
| ----------------- | ----------------------------------------------------------------------- |
| A string          | The symbol of a built-in icon, compared without case and without the surrounding spaces |
| An object         | `{ url, color }` — the host's own vector, and the colour of its arrow    |

`url` SHALL be a string that the same rule the record images hold passes: a relative URL,
or one whose scheme is `http` or `https`. `color` SHALL be three finite numbers from 0 to
255 and SHALL be **required** on an object entry, because the arrow of the lowest icon
takes it and the library cannot read a colour out of a file it does not parse.

`RealSystem` SHALL carry `icons`, the entries the reader kept, each resolved to the same
shape: a `url` string the map draws and a `color` of three numbers from 0 to 255 that the
arrow takes. The catalogue reports its colours as `#RRGGBB` strings, and the reader SHALL
convert one to the three numbers, so a resolved icon has **one** colour shape whichever
form the entry came in. The order SHALL be the record's
own order, lowest icon first. A record with no `icons`, or with an empty `icons`, SHALL
carry no icons and SHALL NOT be rejected for it.

The library SHALL export the icon input type and the resolved icon type, so a host that
builds records in TypeScript compiles against the contract.

#### Scenario: A record takes a built-in symbol and a host icon together

- **WHEN** a unit test adds a record whose `icons` is `['titan', { url: '/my.svg', color: [0, 205, 247] }]`
- **THEN** the record is added, and its resolved icons hold two entries in that order, the
  first carrying the shipped `titan` vector's URL and the colour `[255, 0, 0]`, which is the
  catalogue's `#FF0000`

#### Scenario: A symbol is read without case and without spaces

- **WHEN** a unit test adds a record whose `icons` is `[' Titan ']`
- **THEN** the record is added and its one resolved icon is the same as for `'titan'`

#### Scenario: A record with no icons is added

- **WHEN** a unit test adds one record with no `icons` field and one with `icons: []`
- **THEN** both are added, both report no rejection, and both carry no icons

### Requirement: The reader rejects a record whose icons it cannot read

The reader SHALL reject the whole record, and report it with the index and the reason the
report already carries, where:

| Reason         | What it covers                                                          |
| -------------- | ----------------------------------------------------------------------- |
| `unknown-icon` | A string entry naming a symbol the built-in catalogue does not hold      |
| `bad-icon`     | `icons` is not an array; more than 4 entries; an entry that is neither a string nor an object; an object with no `url`, or whose `url` the URL rule refuses; an object with no `color`, or whose `color` is not three finite numbers from 0 to 255 |

A rejected record SHALL NOT enter the set, SHALL NOT widen the system box, and SHALL NOT
suppress an invented star. An icon is not decoration the reader drops quietly, unlike a
record image: a host that misspells a symbol or leaves out a colour gets a report rather
than a system that silently lost its icon.

#### Scenario: An unknown symbol rejects the record

- **WHEN** a unit test adds a record whose `icons` is `['no-such-icon']`
- **THEN** the report holds one rejection at that index with the reason `unknown-icon`, and
  the system count does not rise

#### Scenario: A host icon with no colour rejects the record

- **WHEN** a unit test adds a record whose `icons` is `[{ url: '/my.svg' }]`
- **THEN** the report holds one rejection with the reason `bad-icon`

#### Scenario: An unsafe URL rejects the record

- **WHEN** a unit test adds a record whose `icons` is
  `[{ url: 'javascript:alert(1)', color: [255, 0, 0] }]`, and a second whose `url` is
  `'\tjavascript:alert(1)'`
- **THEN** both reports hold one rejection with the reason `bad-icon`

#### Scenario: A fifth icon rejects the record

- **WHEN** a unit test adds a record whose `icons` holds five built-in symbols
- **THEN** the report holds one rejection with the reason `bad-icon`

#### Scenario: A rejected record leaves the set alone

- **WHEN** a unit test adds two records, the second of which carries a bad icon, and reads
  the system count and the system box
- **THEN** the count is 1 and the box holds the first record's position alone

### Requirement: The icons of a system draw as a stack over its marker

The map SHALL draw each kept icon as an element in the overlay the library owns for the
region labels, the pin, the ring and the name labels — not as a pass on the canvas — so it
stays a crisp vector at every device pixel ratio.

**The size.** An icon SHALL be **16 CSS pixels** square at every zoom distance, as the pin
holds a fixed size. Two icons of one stack SHALL sit **2 CSS pixels** apart.

**The place.** A stack SHALL be centred on the marker's projected centre on the horizontal
axis. The first icon of the record SHALL be the **lowest** of the stack, and each later
icon SHALL sit above the one before it. The bottom of the lowest icon SHALL sit
`markerCssSize / 2 + 2 + 5` CSS pixels above the marker's projected centre, which is the
tip offset the pin takes plus the height of the arrow the requirement below gives.

**The pin keeps its place.** Where the system is the selected one, the whole stack and its
arrow SHALL move up by a further **28 CSS pixels**, which is the height of the pin, so the
pin and the stack do not draw over each other. The pin's own placement is unchanged.

**When it draws.** An icon SHALL draw only while its system's marker draws. A system whose
category is off, whose name the filter drops, or which the camera has left the draw range
of, SHALL show no icon. The stack SHALL move with the marker in the same frame the marker
moves, so the two never separate on the screen.

An icon SHALL take no pointer event, so it never covers the marker under it for the hover
pick or the click.

#### Scenario: A stack draws in the record's order

- **WHEN** the browser test adds a system whose `icons` names three symbols, draws a frame
  and reads the icon elements of that system, top to bottom on the screen
- **THEN** three icons are present, the lowest is the record's first, and each icon is
  16 CSS pixels square

#### Scenario: The stack sits at the stated offset

- **WHEN** the browser test adds one unselected system with one icon at a known projection,
  draws a frame and reads the icon's box and the marker's projected centre
- **THEN** the icon's horizontal centre is within 1 CSS pixel of the marker's, and its
  bottom is within 1 CSS pixel of `markerCssSize / 2 + 7` above the marker's centre

#### Scenario: Two icons sit two pixels apart

- **WHEN** the browser test adds a system with two icons, draws a frame and reads both
  boxes
- **THEN** the gap between the top of the lower icon and the bottom of the upper one is
  within 1 CSS pixel of 2

#### Scenario: A selection lifts the stack over the pin

- **WHEN** the browser test adds a system with one icon, reads the icon's bottom, selects
  that system, draws a frame and reads the icon's bottom and the pin's box again
- **THEN** the icon moved up by 28 CSS pixels within a tolerance of 1, and the icon's box
  and the pin's box do not overlap

#### Scenario: The icons go when the marker goes

- **WHEN** the browser test adds a system with two icons, turns its category off, draws a
  frame and counts the icons, then turns the category on, draws and counts again
- **THEN** the counts are 0 and 2

#### Scenario: The stack follows the marker through a camera move

- **WHEN** the browser test adds a system with one icon and orbits 60 pixels, reading the
  icon's bottom and the marker's projected centre in the same frame at the start and at the
  end
- **THEN** the offset between them is the same at both readings, within 1 CSS pixel

#### Scenario: An icon does not take the pick

- **WHEN** the browser test adds one system with four icons and moves the pointer onto the
  middle of the stack, then onto the marker itself
- **THEN** the first move hovers no system and the second hovers that system

### Requirement: The lowest icon of a stack carries an arrow

The map SHALL draw one arrow under the **lowest** icon of a stack and under no other icon.
The arrow SHALL be a triangle **8 CSS pixels** wide and **5 CSS pixels** high, with its apex
down, centred on the marker's projected centre on the horizontal axis, filled in the
**lowest icon's colour**: the catalogue's `color` for a built-in symbol, and the entry's
`color` for a host icon.

The arrow's apex SHALL sit `markerCssSize / 2 + 2` CSS pixels above the marker's projected
centre, plus the 28 CSS pixels the requirement above adds for a selected system. Its top
SHALL meet the bottom of the lowest icon.

A system with no icon SHALL carry no arrow. A system with four icons SHALL carry one arrow.

#### Scenario: One arrow draws under a stack of four

- **WHEN** the browser test adds a system with four icons, draws a frame and counts the
  arrows of that system
- **THEN** the count is 1, and its horizontal centre is within 1 CSS pixel of the marker's

#### Scenario: The arrow takes the lowest icon's colour

- **WHEN** the browser test adds two systems, the first with `icons: ['titan', 'mission']`
  and the second with `icons: ['mission', 'titan']`, draws a frame and reads the fill of
  each arrow
- **THEN** the first reads within 2 on each channel of `#FF0000` and the second of
  `#005DFF`

#### Scenario: The arrow takes a host icon's colour

- **WHEN** the browser test adds a system whose one icon is
  `{ url: '/demo-images/ruins-site.svg', color: [0, 205, 247] }`, draws a frame and reads
  the arrow's fill
- **THEN** it reads within 2 on each channel of `rgb(0, 205, 247)`

#### Scenario: The apex points at the marker

- **WHEN** the browser test adds one unselected system with one icon at a known projection,
  draws a frame and reads the arrow's box and the marker's projected centre
- **THEN** the arrow's bottom is within 1 CSS pixel of `markerCssSize / 2 + 2` above the
  marker's centre, and its height is 5 CSS pixels

#### Scenario: A system with no icon carries no arrow

- **WHEN** the browser test adds one system with no `icons`, draws a frame and counts the
  arrows
- **THEN** the count is 0

### Requirement: The icon stack has a switch

The handle SHALL carry `setSystemIconsVisible(on)` and `areSystemIconsVisible()`. While the
switch is off, no icon and no arrow SHALL be in the overlay, whatever the hover and the
selection are. Unlike the name labels, the hovered and the selected system SHALL carry no
exception: the switch is the whole rule.

**The host sets the state the map starts in.** `GalaxyMapOptions` SHALL carry `systemIcons`.
The switch SHALL be **on** when the options leave it out, when it is true, and when it holds
a value that is not a boolean, and **off** only where it is false. On is the default because
an icon draws only for a record that names one, so a set that names none opens on nothing
new — which is not the position the name labels are in.

#### Scenario: The switch turns the icons off and on

- **WHEN** the browser test adds 5 systems in view, each with two icons, counts the icons,
  calls `setSystemIconsVisible(false)`, draws a frame and counts again, then turns it on,
  draws and counts a third time
- **THEN** the counts are 10, 0 and 10

#### Scenario: The switch holds over the hover and the selection

- **WHEN** the browser test turns the switch off, selects one system with icons and hovers
  another, draws a frame and counts the icons and the arrows
- **THEN** both counts are 0

#### Scenario: The option starts the icons off

- **WHEN** a browser test builds a map with `systemIcons: false`, adds 5 systems with icons
  in view, draws a frame and reads `areSystemIconsVisible` and the icon count, and a second
  builds one with no `systemIcons` option and does the same
- **THEN** the first reads false and 0, and the second reads true and 10

#### Scenario: An unreadable option keeps the icons on

- **WHEN** a browser test builds a map whose `systemIcons` is the string `no`, adds 5
  systems with icons in view, draws a frame and reads `areSystemIconsVisible` and the count
- **THEN** the reading is true and the count is 10

### Requirement: The icon placement is bounded

The placement SHALL hold to these bounds, so the DOM node count does not follow the size of
the set:

- A candidate whose projected centre lies outside the viewport SHALL be dropped before any
  other work.
- The **32** stacks nearest the camera SHALL be kept, by the same rule the name labels keep
  their 64: a sort of the whole candidate list every frame is what that rules out, because
  the list can hold 10,000 entries.
- At most **32** arrows and **128** icons SHALL be in the overlay in any frame, because a
  record holds at most 4 icons.
- The placement SHALL allocate no element a frame before it did not need. The elements SHALL
  be held in a pool and reused.

There SHALL be **no overlap test** between two stacks, unlike the name labels. Two markers
a few pixels apart hold their own icons, and dropping one of the two stacks on an overlap
would make an icon blink in and out as the camera moves through a cluster. A name label
carries text a reader must be able to read; an icon is a 16 pixel glyph that reads under a
partial cover.

#### Scenario: The stack count is capped at a full set

- **WHEN** the browser test adds 10,000 systems inside the frame, each carrying 4 icons,
  draws a frame and counts the icon elements and the arrow elements
- **THEN** the icon count is 128 or fewer and the arrow count is 32 or fewer

#### Scenario: The nearest stacks are the ones kept

- **WHEN** the browser test adds 40 systems with icons along the view axis, draws a frame
  and reads which systems carry a stack
- **THEN** the 32 nearest the camera carry one and the 8 furthest carry none

#### Scenario: An off-screen system carries no stack

- **WHEN** the browser test adds one system with icons and orbits until its marker leaves
  the viewport, then draws a frame and counts the icons
- **THEN** the count is 0

### Requirement: The icon stack holds the Firefox paint budget

Firefox rasterises overlay work on the CPU, which is why `browser-suite` measures a camera
move there at all: the blurred label shadow alone read 4.2 ms of a 12.1 ms frame. A stack
adds up to 128 vector rasterisations and 32 triangles to that same overlay, so "it is only
DOM" is not a reading.

With the icon switch on and every record carrying 4 icons, at the view and the move
"A camera move holds the paint budget in Firefox" states, the mean frame interval SHALL stay
at or below the **7 ms** that requirement already gives. The budget is not raised for the
icons: the icons fit inside it or they are cut.

The measured table of `browser-suite` is a reading of a frame that carries **no** icon, and
this requirement SHALL NOT change it. This is a second reading at the same view, not a
restatement of that one.

#### Scenario: A camera move with icons holds the Firefox budget

- **WHEN** the Firefox project runs the camera move of `browser-suite` with 10,000 systems
  that each carry 4 icons, the icon switch on, the name labels on, the grid on and the HUD
  on, and reads the mean frame interval over 180 frames
- **THEN** the mean is 7 ms or less, and the frame drew at least one icon, so a frame that
  drew none cannot pass the reading by measuring nothing

### Requirement: The demo site shows both icon forms

One committed demo set SHALL carry icons, so the demo page shows the feature and the
browser tests read a real record rather than one a test built. That set SHALL carry **both**
entry forms: at least one record with a built-in symbol, and at least one with a host icon
whose `url` names a file the demo site serves from its own `public/` directory.

The icons SHALL come from a table in the converter script, as every other field of a
committed set does, and SHALL NOT be a hand edit of the JSON. `dataset-catalog` states that
rule for the sets as a whole and this holds to it.

The map SHALL reject no record of any committed set, which the demo set test already checks
by feeding each set to the reader.

#### Scenario: The committed set carries both forms

- **WHEN** a unit test reads the committed demo set that carries icons
- **THEN** at least one record carries a built-in symbol, at least one carries a host icon,
  and every host icon's `url` names a file under the demo site's `public/` directory

#### Scenario: The converter writes the icons

- **WHEN** a unit test runs the converter over its committed fixture and compares the
  `icons` of its output to the committed file
- **THEN** they are equal, so the field survives the next converter run

#### Scenario: No committed record is rejected

- **WHEN** the demo set test feeds each committed set to the reader
- **THEN** every set reports no rejection
