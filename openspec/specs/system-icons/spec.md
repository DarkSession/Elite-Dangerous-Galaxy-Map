# system-icons Specification

## Purpose
Lets a host say what a system **is** — a Titan, a fleet carrier, a community goal — by
naming icons on the system's record. The map stacks them over the system's marker, in the
game's own artwork or in the host's, and points the lowest one at the marker with a small
arrow.

## Requirements

### Requirement: The library ships the game's galaxy-map icons

The library SHALL hold a catalogue of built-in icons. The symbols of the catalogue SHALL
be exactly the symbols of `GALAXY_MAP_MARKERS` of
`@elite-dangerous-almanac/core/galaxy-map/markers`, which holds 16 at version 0.2.16: `bookmark`,
`community-goal`, `conflict-zone`, `destination`, `engineer`, `fleet-carrier`,
`front-line`, `mission`, `squadron-carrier`, `starter-zone`, `station-abandoned`,
`station-damaged`, `station-repairing`, `station-under-attack`, `titan` and `waypoint`.

Each symbol SHALL carry a vector the package ships and the **glyph colour** the catalogue
record reports as `color`. The colours this specification writes out, and the list of 16
symbols above, are a **deliberate pin** of the dependency at the version the package
depends on. A browser test MAY assert them as literals. The day the almanac changes one,
that test is meant to fail, and the catalogue test of this requirement names the source of
truth. The glyph colour is what the arrow of the requirement below
draws in. `front-line` is the one record whose `frameColor` differs from its `color`, and
the arrow SHALL take `color` there as it does everywhere else.

**The vectors come from the dependency.** The library SHALL read each vector from
`@elite-dangerous-almanac/core/assets/galaxy-map/<symbol>.svg` and SHALL NOT hold a copy of
one. The catalogue and the artwork then have one source, so neither can drift from the
other. A repository test SHALL compare the symbols the library resolves against the symbols
of `GALAXY_MAP_MARKERS` and SHALL fail where the two disagree, which is what catches a
catalogue that grows a symbol the library does not read.

That test SHALL also compare each vector's root `color` attribute against its record's
`color`. The glyph's colour is baked into the vector and the arrow's colour is read from the
catalogue, so the two are separate values of one dependency and nothing outside this test
makes them agree. Where they disagree, an arrow and the glyph above it draw in two
colours.

The built-in vectors SHALL be emitted as **files of the package build** rather than inlined
into the JavaScript, so a host that names no icon downloads none of them. The library SHALL
therefore reference a built-in vector by a URL relative to its own module and SHALL NOT
name a third-party address.

#### Scenario: Every catalogue symbol resolves to a vector

- **WHEN** a repository test reads `GALAXY_MAP_MARKERS` and the library's symbol table
- **THEN** the two symbol sets are equal, the set is not empty, and every symbol resolves to
  a non-empty URL

#### Scenario: A vector carries the colour its record reports

- **WHEN** the repository test resolves each vector out of the installed dependency, reads
  its root `color` attribute, and compares it to the `color` of that symbol's catalogue
  record, without case
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

**The size.** An icon SHALL be **28 CSS pixels** square at every zoom distance, as the pin
holds a fixed size. The marker under it grows as the camera comes in and the icon does
not, so the icon reads smaller against a near marker than against a far one. That is the
fixed size and not a change in the icon. Two icons of one stack SHALL sit **2 CSS pixels**
apart.

**The plate.** An icon SHALL draw on an opaque **black** box of its own size. A vector of
the catalogue is a thin light line on nothing, and the galaxy behind a marker is neither
dark nor one colour, so without the plate the line reads against whatever the camera puts
there.

**The depth order.** Where two stacks cross on the screen, the stack of the system nearer
the camera SHALL draw over the stack of the one further away. The overlay hands an element
of its pool to a system by its place in the frame and not by its depth, so the tree order
cannot carry the rule and each stack SHALL take a stacking level from its depth.

The library SHALL hold every stack in a **layer of its own**, which carries a stacking
level and is therefore a stacking context. No stack level then reaches the page. The layer
SHALL sit over the plane elements, which sit at 0, and over the ring, the pin and the name
labels, which sit at 1. The layer SHALL sit **under the HUD**, which sits at 10 in the same
parent as the overlay host. The overlay host is often one the caller gave and the library
cannot rely on its style, so the bound belongs to the layer and not to the host.

**Whole pixels.** The map SHALL place an icon and an arrow at whole CSS pixels. An icon is
a bitmap the browser makes from a vector: at a fraction of a pixel the browser samples it
at a new phase in every frame, and the glyph shakes while the camera moves. The rounding
moves a stack by less than half a pixel, which is inside the tolerance the offset
scenarios below give.

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
- **THEN** three icons are present, the lowest is the record's first, each icon is
  28 CSS pixels square, and each one has an opaque black background

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

#### Scenario: The HUD draws over an icon stack

- **WHEN** the browser test opens a map with the HUD, adds a system with two icons, draws
  a frame and reads the stacking level of the icon, of the stack layer and of the HUD root
- **THEN** the icon sits inside the layer, the layer carries a level of its own, and that
  level is below the HUD's

#### Scenario: The nearer stack draws over the further one

- **WHEN** the browser test adds two systems on one line of sight, each with one icon, so
  their stacks cover each other on the screen, draws a frame and reads the stacking level
  of each icon
- **THEN** the level of the nearer system's icon is the higher of the two, and both are
  over 0

#### Scenario: The icon holds its size as the camera comes in

- **WHEN** the browser test adds one system with one icon and reads the icon's box at the
  camera distances 1,000, 200, 40 and 10 light years
- **THEN** the icon is 28 CSS pixels square at each of the four

#### Scenario: A camera move leaves the icon on whole pixels

- **WHEN** the browser test adds a system with one icon, orbits it through 30 small steps
  and reads the icon's `left` and `top` after each step
- **THEN** every reading is a whole number of CSS pixels

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
  `{ url: 'demo-images/ruins-site.svg', color: [0, 205, 247] }`, draws a frame and reads
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
  their **66**: a sort of the whole candidate list every frame is what that rules out,
  because the list can hold 10,000 entries.

  The label keeper is no longer the label pass's own list. It holds 66 entries and every
  drawn marker, which `system-selection` states, and the requirement "A nearer marker hides
  an icon" reads it to find the marker that hides an element. The stack keeper is unchanged
  at 32.
- At most **32** arrows and **128** icons SHALL be in the overlay in any frame, because a
  record holds at most 4 icons.
- The placement SHALL allocate no element a frame before it did not need. The elements SHALL
  be held in a pool and reused.
- A set in which **no record holds an icon** SHALL cost no per-frame placement work, whatever
  the state of the switch. The switch defaults on, so without this a host that names no icon
  would begin paying for a sweep of its whole set. The measure is the **reads the overlay
  makes of the set** in a frame, not the element count: a set with no icon draws no icon
  either way, so an element count cannot tell the fast path from its absence.

#### Scenario: A set with no icon reads nothing

- **WHEN** a map holds 10,000 systems, no record names an icon, the icon switch is on, the
  name switch is off, and there is no hover and no selection
- **THEN** the overlay reads no position and no system of the set, counted over a frame

The hover and the selection place themselves before the sweep and read a position of their
own, so the scenario excludes them. That is what lets the count be plainly zero rather than
a count an implementer has to separate icon reads out of.

#### Scenario: One icon turns the placement back on

- **WHEN** one record of that same set is given an icon
- **THEN** the overlay's reads of the set rise above zero, and the stack draws

The second scenario is the control for the first. Without it, the first also passes on the
day the overlay stops sweeping at all.

There SHALL be **no overlap test** between two stacks, unlike the name labels. Two markers
a few pixels apart hold their own icons, and dropping one of the two stacks on an overlap
would make an icon blink in and out as the camera moves through a cluster. A name label
carries text a reader must be able to read; an icon is a 28 pixel glyph that reads under a
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

### Requirement: The demo site shows the icon stack

One committed demo set SHALL carry icons, so the demo page shows the feature and the
browser tests read a real record rather than one a test built. Every icon of that set SHALL
be a **built-in symbol**. The set SHALL carry no host icon: a host icon is a drawing the
demo site has to serve itself, and a drawing made for a 28 pixel box reads worse beside the
game's own symbols. The requirement "A record names its icons" states the host form, and
`e2e/system-icons.spec.ts` covers it with a file the demo site already serves.

The icons SHALL come from a table in the converter script, as every other field of a
committed set does, and SHALL NOT be a hand edit of the JSON. `dataset-catalog` states that
rule for the sets as a whole and this holds to it.

The map SHALL reject no record of any committed set, which the demo set test already checks
by feeding each set to the reader.

#### Scenario: The committed set carries built-in symbols only

- **WHEN** a unit test reads the committed demo set that carries icons
- **THEN** at least one record carries an icon, and every icon of the set is a name the
  built-in catalogue holds

#### Scenario: The converter writes the icons

- **WHEN** a unit test runs the converter over its committed fixture and compares the
  `icons` of its output to the committed file
- **THEN** they are equal, so the field survives the next converter run

#### Scenario: No committed record is rejected

- **WHEN** the demo set test feeds each committed set to the reader
- **THEN** every set reports no rejection

### Requirement: A nearer marker hides an icon

An icon stack is a DOM element over the canvas, so it draws over every pixel the canvas
drew at that place, whatever the depth. Without a rule the icons of a system 4,000 light
years away cover a star 40 light years from the camera, and the frame reads back to front.

**Each icon of a stack, and the arrow under it, SHALL be hidden in a frame where the marker
of a system nearer to the camera than the stack's own system projects inside that element's
box on the screen.** The element's box is the square the icon occupies, or the triangle's
bounding box for the arrow, in CSS pixels. "Projects inside" means the marker's drawn centre
lies in that box.

**The test is per element and not per stack.** A stack whose top icon alone is covered
SHALL keep its other icons and its arrow. That is what an occlusion looks like: the nearer
star draws in the gap the hidden icon leaves, and the stack still says what the system is.
A stack that hid in whole on one covered pixel would blink as the camera moves through a
cluster, which is the fault the requirement "The icon placement is bounded" already names
for a stack-against-stack test.

**A hidden element SHALL draw nothing and SHALL take no pointer event.** It SHALL stay in
the pool and SHALL keep its place, so a frame that shows it again allocates nothing. Every
element of the stack is placed by `position: absolute`, so a hidden one holds no other
element out of its own place.

**The rule reads the systems of the set alone.** The invented decoration stars of
`close-view-stars` SHALL NOT be tested: the map holds no list of them on the main thread,
and a real system already suppresses the invented stars near it. The rule SHALL NOT read
the frame buffer.

**A system does not hide its own stack.** The stack's own marker sits under the arrow by
construction, and the test SHALL skip it.

**This narrows two requirements above and replaces neither.** "The icons of a system draw
as a stack over its marker" and "The lowest icon of a stack carries an arrow" say what is
drawn and where; this requirement says when one of those elements is hidden. A hidden
element is still placed, still in the pool and still counted, because `visibility: hidden`
leaves it in the layout. Every count the bound requirement states therefore reads the same
with this rule as without it.

**The candidates are bounded.** The test SHALL read the **66** markers nearest the camera,
which is the keeper the name labels already fill, and SHALL stop at the first candidate no
nearer than the stack's own system, because that keeper is held in ascending range.

**That keeper SHALL hold every marker on the screen and not the subset the labels want.**
It is filled today only where the name switch is on and only for a system that is neither
hovered nor selected. Each of the three is a marker that can cover an icon, so the sweep
SHALL offer every system on the screen to it. The two exceptions move to the label pass,
which SHALL skip the hovered and the selected index as it reads the keeper, and which
reads nothing while the switch is off. The reason the labels hold those two out does not
change: each places its own label first. One keeper, two readers, one rule each.

**The keeper SHALL grow from 64 entries to 66**, and the label pass SHALL stop after 64
labels are placed. `system-selection` "The marker name labels are bounded" owns both rules
and states why. The work bound of this requirement reads 66 because that is what the keeper
now holds. The
work is therefore at most 32 stacks by 5 elements by 66 candidates in a frame, and it SHALL
run inside the per-frame budget the requirement "The icon stack holds the Firefox paint
budget" states. A marker further from the camera than all 66 SHALL NOT hide anything, which
is a marker the frame draws small and behind a crowd.

#### Scenario: The keeper holds the hovered and the selected marker

- **WHEN** the browser test turns the name switch off, hovers a system nearer the camera
  than a stack it covers, draws a frame and reads the covered element, then selects that
  same system and reads it again
- **THEN** the element is hidden in both readings, and no system carries two name labels

#### Scenario: A nearer marker hides the icon over it

- **WHEN** the browser test places a system with one icon 4,000 light years from the
  camera, a second system with no icon 400 light years from the camera, and moves the
  second until its marker projects inside the first's icon box, then draws a frame and
  reads the icon element
- **THEN** the icon is hidden, and the pixel at the second system's marker centre reads the
  marker and not the icon

#### Scenario: A further marker hides nothing

- **WHEN** the browser test swaps the two ranges, so the marker with no icon is 8,000 light
  years away and projects inside the same box, draws a frame and reads the icon
- **THEN** the icon is shown

#### Scenario: Only the covered icon of a stack hides

- **WHEN** the browser test places a system with four icons, and a nearer system whose
  marker projects inside the box of the third icon alone, draws a frame and reads the four
  icons and the arrow
- **THEN** the third icon is hidden and the other three and the arrow are shown

#### Scenario: The arrow follows the same rule

- **WHEN** the browser test moves the nearer marker so it projects inside the arrow's box
  and inside no icon's box, draws a frame and reads the arrow and the icons
- **THEN** the arrow is hidden and every icon is shown

#### Scenario: A system does not hide its own stack

- **WHEN** the browser test places one system with four icons and no other system, draws a
  frame and reads the icons and the arrow
- **THEN** every element is shown

#### Scenario: The element comes back when the marker moves away

- **WHEN** the browser test orbits the camera until the nearer marker leaves the icon's
  box, draws a frame and reads the icon and the element count
- **THEN** the icon is shown and the count did not rise, because the element stayed in the
  pool

#### Scenario: The test holds the frame budget

- **WHEN** the browser test adds 10,000 systems inside the frame, each carrying 4 icons,
  measures the mean frame interval over 120 frames, and compares it with the same view and
  the icon switch off
- **THEN** the exposed selection-work statistic reads a mean of **2 milliseconds** or less
  and the frame interval holds **18 milliseconds**, which are the two numbers
  `system-selection` "Selection holds the frame budget" states. That requirement's 2 ms
  covers the name label placement and the icon stack placement by name, and this test is
  the first work added to it since the number was set
