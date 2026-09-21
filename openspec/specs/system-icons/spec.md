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

The renderer SHALL draw each kept icon as a pass on the canvas, after the markers and after
the shapes, over the finished frame. The pass SHALL rasterise each vector once for the
device pixel ratio in force and SHALL draw it at that same size, so the icon stays as crisp
as the vector the browser draws.

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
the camera SHALL draw over the stack of the one further away. The pass SHALL draw the
stacks back to front, furthest first, which gives that order without a depth buffer.

**A stack is its arrow and its icons together.** The arrow SHALL take the same order as the
icons of its own stack: an arrow SHALL draw over a further stack and under a nearer one. The
pass therefore SHALL put the arrows and the icons in **one** instance stream, in that one
back-to-front order. Two draw calls cannot state this order, because a second call draws
every arrow over every icon of the first whatever the range.

**What draws over a stack.** The stacks are on the canvas, so every element of the DOM
overlay draws over them. That is the HUD, which the scenario below reads, and it is also
the plane elements, the ring, the pin and the name labels. **This reverses the old order
for those four**, which sat under the stack layer. The reversal is accepted rather than
repaired: the name labels sit below a marker and a stack sits above it, the pin and the
stack hold apart by the lift the rule below gives, and the ring and the plane line are
thin marks a 28 pixel glyph reads under.

**Whole pixels.** The pass SHALL place an icon and an arrow on whole **device** pixels, and
SHALL draw each icon quad at the same size in device pixels as its texture. The texture
then copies to the frame one texel to one pixel, which is what keeps the glyph from
shaking as the camera moves. The rounding moves a stack by less than half a device pixel.

*The way up.* The pass SHALL draw the glyph the way the browser draws the vector. The
rasteriser writes the vector into a 2D canvas whose first row is the top one, and the upload
leaves `UNPACK_FLIP_Y_WEBGL` at its default of false, so the first row lands at the texture
coordinate 0. The top of the quad SHALL therefore read the texture coordinate 0 and not 1.

#### Scenario: The glyph draws the way the browser draws the vector

- **WHEN** the browser test draws a stack holding one icon of an asymmetric vector, reads the
  icon's box off the canvas, draws the same vector into a 2D canvas of the same side, and
  counts the pixels that differ between the two as they are and with one turned over
- **THEN** the count as they are is the lower of the two

*Where the two sizes part.* The texture side SHALL hold the device pixel ratio at **1 or
above** and SHALL cap at **128** texels. The quad side follows the true ratio, so one texel
meets one pixel at every ratio from 1 to about 4.57 and not outside that band. Below a ratio
of 1 the texture holds more texels than the quad has pixels, and above 4.57 the cap holds it
under. The size rule wins in both cases, because a 28 CSS pixel icon at every ratio is what
a reader sees; a quad that followed the texture instead would draw a 56 CSS pixel icon at a
ratio of 0.5, over a stack step of 15 device pixels.

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

An icon SHALL take no pointer event. The pick reads the systems of the set on the CPU and
reads no drawn pixel, so a stack on the canvas cannot take the hover or the click from the
marker under it.

#### Scenario: A stack draws in the record's order

- **WHEN** the browser test adds a system whose `icons` names three symbols, draws a frame
  and reads the icon placements of that system, top to bottom on the screen
- **THEN** three icons are present, the lowest is the record's first, each icon is
  28 CSS pixels square, and the canvas pixel **4 CSS pixels in from each corner** reads
  opaque black.

  **Not the corner itself.** Every vector of the catalogue draws a frame around its box —
  `titan.svg` is a 60 unit rect with a 4 unit stroke in a 64 unit view box — so the
  outermost pixels of the box hold the glyph colour and not the plate. 4 CSS pixels in
  clears that frame at a box of 28.

#### Scenario: The stack sits at the stated offset

- **WHEN** the browser test adds one unselected system with one icon at a known projection,
  draws a frame and reads the icon's placement and the marker's projected centre
- **THEN** the icon's horizontal centre is within 1 CSS pixel of the marker's, and its
  bottom is within 1 CSS pixel of `markerCssSize / 2 + 7` above the marker's centre

#### Scenario: Two icons sit two pixels apart

- **WHEN** the browser test adds a system with two icons, draws a frame and reads both
  placements
- **THEN** the gap between the top of the lower icon and the bottom of the upper one is
  within 1 CSS pixel of 2

#### Scenario: A selection lifts the stack over the pin

- **WHEN** the browser test adds a system with one icon, reads the icon's bottom, selects
  that system, draws a frame and reads the icon's bottom and the pin's box again
- **THEN** the icon moved up by 28 CSS pixels within a tolerance of 1, and the icon's box
  and the pin's box do not overlap

#### Scenario: The icons go when the marker goes

- **WHEN** the browser test adds a system with two icons, turns its category off, draws a
  frame and counts the icon placements, then turns the category on, draws and counts again
- **THEN** the counts are 0 and 2

#### Scenario: The stack follows the marker through a camera move

- **WHEN** the browser test adds a system with one icon and orbits 60 pixels, reading the
  icon's bottom and the marker's projected centre in the same frame at the start and at the
  end
- **THEN** the offset between them is the same at both readings, within 1 CSS pixel

#### Scenario: The HUD draws over an icon stack

- **WHEN** the browser test opens a map with the HUD, places a system with two icons so its
  stack lies under a HUD panel, draws a frame and reads the page at the middle of the icon
- **THEN** the element at that point is the HUD panel and not the canvas

#### Scenario: The nearer stack draws over the further one

- **WHEN** the browser test adds two systems on one line of sight, each with one icon whose
  glyph colour differs, so their stacks cover each other on the screen, draws a frame and
  reads the canvas pixel where the two icons cross
- **THEN** the pixel reads the nearer system's icon

#### Scenario: A nearer stack's icon draws over a further stack's arrow

- **WHEN** the browser test adds two systems on one line of sight, each with one icon, and
  places them so the further system's arrow falls on the nearer system's icon plate, then
  draws a frame and reads the canvas pixel where the two cross
- **THEN** the pixel reads the nearer system's icon and not the further system's arrow fill

#### Scenario: The icon holds its size as the camera comes in

- **WHEN** the browser test adds one system with one icon and reads the icon's placement at
  the camera distances 1,000, 200, 40 and 10 light years
- **THEN** the icon is 28 CSS pixels square at each of the four

#### Scenario: A camera move leaves the icon on whole pixels

- **WHEN** the browser test adds a system with one icon, orbits it through 30 small steps
  and reads the icon's `left` and `top` in device pixels after each step
- **THEN** every reading is a whole number of device pixels

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
switch is off, the pass SHALL draw no icon and no arrow, whatever the hover and the
selection are. Unlike the name labels, the hovered and the selected system SHALL carry no
exception: the switch is the whole rule.

**The host sets the state the map starts in.** `GalaxyMapOptions` SHALL carry `systemIcons`.
The switch SHALL be **on** when the options leave it out, when it is true, and when it holds
a value that is not a boolean, and **off** only where it is false. On is the default because
an icon draws only for a record that names one, so a set that names none opens on nothing
new — which is not the position the name labels are in.

#### Scenario: The switch turns the icons off and on

- **WHEN** the browser test adds 5 systems in view, each with two icons, counts the icon
  placements, calls `setSystemIconsVisible(false)`, draws a frame and counts again, then
  turns it on, draws and counts a third time
- **THEN** the counts are 10, 0 and 10

#### Scenario: The switch holds over the hover and the selection

- **WHEN** the browser test turns the switch off, selects one system with icons and hovers
  another, draws a frame and counts the icon and the arrow placements
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

The placement SHALL hold to these bounds, so neither the draw work nor the texture storage
follows the size of the set:

- A candidate whose projected centre lies outside the viewport SHALL be dropped before any
  other work.
- The **32** stacks nearest the camera SHALL be kept, by the same rule the name labels keep
  their **66**: a sort of the whole candidate list every frame is what that rules out,
  because the list can hold 10,000 entries.
- At most **32** arrows and **128** icons SHALL be drawn in any frame, because a record
  holds at most 4 icons.
- The pass SHALL issue at most **1** draw call in a frame, whatever the stack count. The
  arrows and the icons share one instance stream and one program, which is what the depth
  order above asks for.
- The pass SHALL hold at most **64** distinct icon vectors as textures. A 65th distinct URL
  SHALL NOT draw, and the map SHALL report it once through `console.warn`. 64 covers the
  16 built-in symbols and a host's own set.
- The pass SHALL allocate no buffer a frame before it needs it, and SHALL reuse its buffers
  from frame to frame.
- A set in which **no record holds an icon** SHALL cost no per-frame placement work,
  whatever the state of the switch. The switch defaults on, so without this a host that
  names no icon would begin paying for a sweep of its whole set.
- **The sweep SHALL read the systems that carry an icon and not the whole set.** The set
  SHALL be able to name those systems, so the per-frame cost follows the number of records
  with icons and not the 10,000 the set can hold.

#### Scenario: A set with no icon reads nothing

- **WHEN** a map holds 10,000 systems, no record names an icon, the icon switch is on, the
  name switch is off, and there is no hover and no selection
- **THEN** the pass places no stack and reads no system of the set, counted over a frame

#### Scenario: One icon turns the placement back on

- **WHEN** one record of that same set is given an icon
- **THEN** the pass's reads of the set rise above zero, and the stack draws

The second scenario is the control for the first. Without it, the first also passes on the
day the pass stops sweeping at all.

There SHALL be **no overlap test** between two stacks, unlike the name labels. Two markers
a few pixels apart hold their own icons, and dropping one of the two stacks on an overlap
would make an icon blink in and out as the camera moves through a cluster. A name label
carries text a reader must be able to read; an icon is a 28 pixel glyph that reads under a
partial cover.

#### Scenario: The stack count is capped at a full set

- **WHEN** the browser test adds 10,000 systems inside the frame, each carrying 4 icons,
  draws a frame and counts the icon and the arrow placements
- **THEN** the icon count is 128 or fewer and the arrow count is 32 or fewer

#### Scenario: The draw calls are capped at a full set

- **WHEN** the browser test reads the icon pass's draw call count in that same frame
- **THEN** the count is 1 or fewer

#### Scenario: The nearest stacks are the ones kept

- **WHEN** the browser test adds 40 systems with icons along the view axis, draws a frame
  and reads which systems carry a stack
- **THEN** the 32 nearest the camera carry one and the 8 furthest carry none

#### Scenario: An off-screen system carries no stack

- **WHEN** the browser test adds one system with icons and orbits until its marker leaves
  the viewport, then draws a frame and counts the icons
- **THEN** the count is 0

#### Scenario: A 65th distinct vector does not draw

- **WHEN** the browser test adds 65 systems, each with one icon naming a distinct host URL,
  waits for the loads to settle, draws a frame and reads the placements and the console
- **THEN** 64 of the systems carry an icon, one carries none, and the console holds one
  warning about the cap

### Requirement: The icon stack holds the Firefox paint budget

Firefox rasterises overlay work on the CPU, which is why `browser-suite` measures a camera
move there at all: the blurred label shadow alone read 4.2 ms of a 12.1 ms frame. The
stacks no longer add to that overlay, because they draw on the canvas. The budget stays as
the guard that the move to the card did not trade paint time for frame time somewhere else.

With the icon switch on and every record carrying 4 icons, at the view and the move
"A camera move holds the paint budget in Firefox" states, the mean frame interval SHALL stay
at or below the **7 ms** that requirement already gives. The budget is not raised for the
icons: the icons fit inside it or they are cut.

**The overlay SHALL hold no icon element and no arrow element in any frame.** This is what
the reading above is a budget for, and a count is the cheaper guard.

The measured table of `browser-suite` is a reading of a frame that carries **no** icon, and
this requirement SHALL NOT change it. This is a second reading at the same view, not a
restatement of that one.

#### Scenario: A camera move with icons holds the Firefox budget

- **WHEN** the Firefox project runs the camera move of `browser-suite` with 10,000 systems
  that each carry 4 icons, the icon switch on, the name labels on, the grid on and the HUD
  on, and reads the mean frame interval over 180 frames
- **THEN** the mean is 7 ms or less, and the frame drew at least one icon, so a frame that
  drew none cannot pass the reading by measuring nothing

#### Scenario: No icon reaches the DOM

- **WHEN** the browser test adds 10,000 systems that each carry 4 icons, draws a frame and
  counts the elements of the overlay
- **THEN** the overlay holds no icon element and no arrow element

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

### Requirement: The library loads an icon vector as a cross-origin image

The renderer draws an icon from a texture, and a texture upload from a tainted canvas
fails. The library SHALL therefore load every icon vector as an image whose `crossOrigin`
is `anonymous`.

**A vector served from a second origin SHALL carry `Access-Control-Allow-Origin`.** This
is a **breaking change** for a host whose `icons` entries name a URL on another origin
with no such header. It also reaches the 16 built-in vectors, because a host that serves
the library from a second origin, such as a CDN, loads them from that origin as well.

A `data:` URL and a URL on the page's own origin need no header.

**An icon the browser refuses SHALL NOT draw, and SHALL NOT stop the stack.** The other
icons of that stack, and the arrow, SHALL draw as they would. The map SHALL report the
refusal once per URL through `console.warn`, and SHALL NOT try that URL again while the
map lives. A refusal SHALL NOT throw out of the frame.

**An icon SHALL NOT draw before its vector is ready.** Loading is asynchronous, so the
first frames after a record arrives may draw fewer icons than the record names. The stack
SHALL draw the icons it holds and SHALL add each later one in the frame it becomes ready.

#### Scenario: A cross-origin icon with the header draws

- **WHEN** the browser test adds a system whose one icon names an SVG on a second origin
  that sends `Access-Control-Allow-Origin: *`, waits for the icon, draws a frame and reads
  the icon placements
- **THEN** the stack holds one icon

#### Scenario: A cross-origin icon with no header does not draw

- **WHEN** the browser test adds a system with two icons, the first a built-in symbol and
  the second an SVG on a second origin that sends no `Access-Control-Allow-Origin`, waits
  for the load to settle, draws a frame and reads the placements and the console
- **THEN** the stack holds the built-in icon and its arrow, holds no second icon, and the
  console carries one warning that names that URL

#### Scenario: A refused URL is tried once

- **WHEN** the browser test counts the network requests for that same URL over 30 frames
- **THEN** the count is 1

### Requirement: The handle reports the icon placements

The browser tests can no longer read an icon as a DOM element, so the handle SHALL report
what the last frame placed. `iconPlacements()` SHALL return one entry per icon and one per
arrow, and an empty list in a frame that drew no stack.

Each entry SHALL carry:

- `kind`, which is `icon` or `arrow`;
- `systemIndex`, the index of the system the stack belongs to;
- `stackIndex`, the place of the icon in the record's own order, and 0 for an arrow;
- `left`, `top`, `width` and `height`, the element's box in **CSS pixels** from the top
  left of the canvas;
- `color`, the arrow's fill as three numbers 0 to 255, and the icon's own colour for an
  icon;
- `url`, the vector the icon draws, and an empty string for an arrow.

The list SHALL be in draw order, which is the furthest stack first. The reading SHALL say
what the frame **placed**, and SHALL NOT say what the range test then discarded: the test
runs per pixel on the card, so an element is never wholly hidden or wholly shown. A test
of the occlusion reads canvas pixels.

#### Scenario: The placements name the boxes of a stack

- **WHEN** the browser test adds one system with three icons, draws a frame and reads
  `iconPlacements()`
- **THEN** the list holds four entries, three of kind `icon` and one of kind `arrow`, each
  with the box the placement requirements give

#### Scenario: A frame with no stack reports nothing

- **WHEN** the browser test turns the icon switch off, draws a frame and reads
  `iconPlacements()`
- **THEN** the list is empty

### Requirement: A nearer marker draws over an icon

Without a rule the icons of a system 4,000 light years away cover a star 40 light years
from the camera, and the frame reads back to front.

**An icon and its arrow SHALL draw at a pixel only where no marker body nearer the camera
than the stack's own system covers that pixel.** The test SHALL run per pixel. A nearer
marker therefore cuts its own shape out of the icon and takes nothing else: the rest of the
icon draws, and the stack still says what the system is.

**"Marker body" is the part of a marker sprite the map already names as its body**, which
is the part a sphere and a line do not wash. The soft halo of a `glow` sprite outside that
body SHALL NOT hide an icon. The halo is light and not a mark, and an icon over it reads as
an icon in front of a glow.

**The rule reads the systems of the set alone.** The invented decoration stars of
`close-view-stars` SHALL NOT be tested: a real system already suppresses the invented stars
near it.

**A system does not hide its own stack.** The test compares ranges from the same reading of
the same position, so a marker at the stack's own range never counts as nearer. A `glow`
sprite whose body reaches up into its own arrow therefore leaves the arrow alone.

**Where the card cannot carry the test, the icons SHALL draw with no test.** The map needs
a 32-bit float colour target it can blend into, which `EXT_color_buffer_float` and
`EXT_float_blend` give together. A context that holds less than both draws every icon over
every marker, which is the frame the map drew before any such rule existed. This is the fallback the
spheres already take, and the map SHALL NOT refuse to draw over it.

**This narrows two requirements above and replaces neither.** "The icons of a system draw
as a stack over its marker" and "The lowest icon of a stack carries an arrow" say what is
drawn and where; this requirement says which of its pixels reach the frame. Every count the
bound requirement states therefore reads the same with this rule as without it, because the
element is placed either way.

#### Scenario: A nearer marker cuts through the icon over it

- **WHEN** the browser test places one system 4,000 light years away carrying the `titan`
  icon, and a second system with no icon 40 light years away, in a category of a colour that
  no icon uses, whose marker projects inside that icon's box, draws a frame, reads the canvas
  pixel at the nearer marker's centre and counts the pixels of the icon's glyph colour inside
  the icon's box
- **THEN** the centre pixel reads the nearer marker's category colour, and the glyph pixel
  count is above zero.

  **The count is part of the test.** The plate is black and the sky behind a marker
  4,000 light years out is near black, so a reading of "the corner is dark" also passes with
  no icon drawn at all. The glyph colour is the only reading that separates the two.

#### Scenario: A further marker hides nothing

- **WHEN** the browser test moves that second system behind the first, draws a frame and
  takes the same two readings
- **THEN** the pixel at the further marker's centre does not read that marker's category
  colour, and the glyph pixel count is above zero

#### Scenario: Only the covered part of a stack goes

- **WHEN** the browser test places a system with four icons of four different glyph colours,
  and a nearer system whose marker projects inside the third icon's box, draws a frame,
  counts the glyph pixels inside each of the four icon boxes and reads the pixel at the
  arrow's middle and at the nearer marker's centre
- **THEN** each of the four counts is above zero, the arrow pixel reads the lowest icon's
  colour, and the pixel at the nearer marker's centre reads that marker's category colour

#### Scenario: The arrow follows the same rule

- **WHEN** the browser test moves the nearer marker so it projects inside the arrow's box,
  draws a frame and reads the pixel at that marker's centre
- **THEN** the pixel reads that marker's category colour and not the arrow's fill

#### Scenario: A marker at the stack's own range cuts nothing

- **WHEN** the browser test adds two systems at the **same** range from the camera, the
  first carrying an icon and the second, in a category of a colour no icon uses, projecting
  inside that icon's box, draws a frame and counts the glyph pixels inside the icon's box
- **THEN** the count is above zero, and no pixel of the box reads the second system's
  category colour.

  **The stack's own marker cannot reach its own stack, so this is the reading that holds
  the rule.** The body of a `glow` sprite reaches at most about `0.41 * markerCssSize`
  from the marker's centre, and the arrow apex stands `markerCssSize / 2 + 2` above it, so
  no marker of any size touches the stack above it. A scenario written on a system's own
  marker would pass with the range comparison removed. Two systems at one range exercise
  the same comparison and can fail. A unit test of the pass holds the own-index case.

#### Scenario: The cut goes when the marker moves away

- **WHEN** the browser test orbits the camera until the nearer marker leaves the icon's box,
  draws a frame and takes the two readings of the first scenario again
- **THEN** no pixel of the icon's box reads the nearer marker's category colour, and the
  glyph pixel count is above zero

#### Scenario: A card with no float blend draws every icon

- **WHEN** a unit test builds a renderer over a context that reports `EXT_color_buffer_float`
  alone, and a second over one that reports `EXT_float_blend` alone, draws a frame with a
  stack in each and reads `rangeBufferSize()`
- **THEN** both read null, both draw the icon, and neither throws

#### Scenario: The test holds the frame budget

- **WHEN** the browser test runs the camera move of `browser-suite` with 10,000 systems that
  each carry 4 icons and the icon switch on
- **THEN** the mean frame interval holds the budget that requirement gives

### Requirement: The icon pass holds the draw budget

The pass selects, places and draws the stacks inside `render`, so its cost falls in the
**draw-time** budget of `far-view-rendering` and no longer in the 2 ms overlay budget of
`system-selection`. Both of those requirements state the move.

With 10,000 systems, every record carrying 4 icons, and the icon switch on, the mean render
time over 300 frames SHALL stay under the **16.7 ms** that `far-view-rendering` gives, at
the views it names, measured by the measurement function it already states.

**The reading SHALL show that the frame drew a stack.** A frame that placed none holds the
budget by doing nothing, which is not the reading this requirement asks for.

#### Scenario: A full set of icons holds the draw budget

- **WHEN** the browser test adds 10,000 systems inside the frame, each carrying 4 icons,
  turns the icon switch on, and calls the render measurement function for 300 frames at
  1920x1080 at the zoom distances 2,000 and 20,000 light years
- **THEN** each mean is under 16.7 ms, and `iconPlacements()` holds at least one entry in
  the same frame
