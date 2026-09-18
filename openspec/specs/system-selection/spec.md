## Purpose

Lets the user point at a real system and choose it. The map finds the marker under the
pointer on the processor, holds one hovered system and one selected system, marks each on
the screen, and reports both through the handle so a HUD or a host can follow them.

## Requirements

### Requirement: The pick finds the nearest marker under a pixel

The handle SHALL carry `systemAt(x, y)`, which takes a pixel in canvas CSS coordinates
and returns the system under it or null.

A system SHALL be a candidate when all of these hold:

1. Its marker draws in the current frame. That means its primary category is on, the name
   filter keeps it, and the **cursor** is inside its category's `maxDrawRange`, which
   `real-systems` states.
2. It lies in front of the near plane, so a system behind the camera is never picked.
3. The distance from the pixel to its projected centre is at or below the **pick radius**.

The pick radius SHALL be `markerCssSize / 2 + 4` CSS pixels, where `markerCssSize` is the
disc diameter of `real-systems`, which runs from 7 to 16. The radius therefore runs from
7.5 to 12 CSS pixels. The radius SHALL read the **disc** diameter for both marker styles,
so a `glow` and a `disc` of the same range are equally easy to hit. A glow's sprite is 2.5
times the disc, and a pick radius that followed the sprite would make a glow a target 2.5
times as wide for no reason the user can see.

**Two ranges, and they are not the same range.** The draw gate reads the **cursor**-to-system
distance, and the disc diameter, and so the pick radius, read the **camera**-to-system
distance. `real-systems` states both. The pick and the marker pass read one rule for each,
so a pixel that looks like a hit is a hit at every viewport height and at every camera
position.

**Everything that follows a drawn marker SHALL read the same gate.** The pick, the hover
ring, the selection pin, the marker name labels and the drawn count the page reports all
follow a marker the pass draws. The rule is written out four times: the vertex shader cut,
the CPU count loop beside it, the pick, and the overlay. All four SHALL gate on the cursor
range. A marker the user can see and cannot click is the fault this rule exists to stop.

The candidate with the smallest distance to the pixel SHALL win. When two candidates are
within 1e-6 CSS pixels of each other, the one nearer the camera SHALL win. When those are
equal as well, the one added to the set first SHALL win. The rule is total, so the same
frame and the same pixel always give the same system.

`systemAt` SHALL sweep the set once. The set holds at most 10,000 systems, so one call
projects at most 10,000 positions and allocates nothing per system. No identity buffer is
read back from the card, because a read back would stall the frame and 10,000 projections
do not.

#### Scenario: The pick returns the system under the pixel

- **WHEN** the browser test adds one category and three systems 200 light years apart at a
  view that shows them all, draws a frame, and calls `systemAt` at the projected centre of
  each
- **THEN** each call names the system at that pixel

#### Scenario: The pick radius holds at the floor and the cap

- **WHEN** the browser test puts one system at a range where its disc is at the floor of 7
  CSS pixels and calls `systemAt` at 7 and at 8 CSS pixels from its centre, then puts it at
  a range where its disc is at the cap of 16 and calls at 12 and at 13 CSS pixels from its
  centre
- **THEN** the first call names the system and the second is null, and the third names it
  and the fourth is null

#### Scenario: The pick radius does not follow the viewport

- **WHEN** the browser test puts one system 4,000 light years from the camera at 1,080 CSS
  rows, finds the largest whole pixel offset at which `systemAt` still names it, then sets
  the viewport to 400 CSS rows and finds it again
- **THEN** the two offsets are the same

#### Scenario: The nearer of two overlapping markers wins

- **WHEN** the browser test adds two systems that project to the same pixel within 1 CSS
  pixel, one 400 light years from the camera and one 900, and calls `systemAt` at that
  pixel
- **THEN** the call names the nearer system

#### Scenario: A system behind the camera is not picked

- **WHEN** the browser test adds one system, opens a view that looks away from it, draws a
  frame, and calls `systemAt` at every corner and at the centre of the canvas
- **THEN** every call is null

#### Scenario: The pick holds its time bound at a full set

- **WHEN** the browser test adds 10,000 systems inside the frame, draws a frame, and times
  200 calls to `systemAt`
- **THEN** the mean call takes 1 ms or less

#### Scenario: A drawn marker is pickable however far the camera stands off

- **WHEN** the browser test adds one category with `maxDrawRange` 2,000 and one system
  1,500 light years from the cursor, zooms out to a camera distance of 20,000 light
  years, draws a frame, and calls `systemAt` at the system's projection
- **THEN** the marker draws, the reported marker count is 1, and the call names the system

#### Scenario: The ring, the pin and the name follow the same gate

- **WHEN** the browser test adds one category with `maxDrawRange` 2,000 and one system
  1,500 light years from the cursor, turns the names on, selects the system, zooms out to
  a camera distance of 20,000 light years, moves the pointer onto the marker's projection,
  draws a frame and reads the pin, the hover ring and the name label
- **THEN** all three are present. The pointer move is needed because the ring follows the
  hover and not the selection

### Requirement: The map holds one hovered system and one selected system

The handle SHALL carry `getHover()`, `getSelection()`, `setSelection(identity)` and
`onSelectionChange(listener)`. `getHover` and `getSelection` SHALL each return a system or
null. `onSelectionChange` SHALL return an unsubscribe, as `onViewChange` does.

**The hover follows the pointer.** The map SHALL remember the last pointer position over
the canvas and SHALL run the pick **once per frame**, not once per pointer event. A
pointer event can arrive at 120 Hz or faster, and one sweep of the set per event would
spend the frame budget on a reading no frame shows. The hover SHALL also be worked out
again when the view changes with the pointer still, because the marker under a still
pointer moves when the camera does. The hover SHALL clear when the pointer leaves the
canvas.

**The selection follows a click.** A left click, which `map-navigation` defines as a press
that stays within 4 CSS pixels and releases within 400 ms, SHALL select the system under
the release pixel. **A tap** SHALL select in the same way. `map-navigation` defines a tap as
a touch that stays within **10 CSS pixels** and releases within 400 ms, and states why the
move limit is wider for a finger than for a mouse. A click that finds no system SHALL
leave the selection as it is. The user orbits with the same button, so a click that lands
between markers is far more often
a missed grab than a request to close the panel. The panel's close button and the `Escape`
key clear the selection, and `map-hud` states both.

**`setSelection` takes an identity.** The identity is the `id64` when the record carries
one, and the name when it does not, which is the identity rule of `real-systems`.
`setSelection(null)` SHALL clear the selection. An identity the set does not hold SHALL
clear the selection.

**The selection survives what it can.** A record replaced under the same identity SHALL
keep the selection, and `getSelection` SHALL then return the new record. A selected system
whose category is turned off, or which the name filter drops, SHALL stay selected: its
marker and its pin stop drawing, and the information panel stays open. `clearSystems` and
`clearSystemsAndCategories` SHALL clear the selection.

`onSelectionChange` SHALL fire when the selection becomes a different system, and when it
becomes null from a system or a system from null. It SHALL NOT fire when a call sets the
selection to the system already selected.

#### Scenario: A click selects and the listener hears it

- **WHEN** the browser test adds one system, subscribes to `onSelectionChange`, presses
  the left button at the system's projected centre, releases 100 ms later at the same
  pixel, then reads `getSelection`
- **THEN** the listener fired once with that system and `getSelection` names it

#### Scenario: A drag does not select

- **WHEN** the browser test presses the left button at a system's projected centre, moves
  40 pixels, moves back, and releases 100 ms later
- **THEN** `getSelection` is null and the listener did not fire

#### Scenario: A click on empty space keeps the selection

- **WHEN** the browser test selects a system, then clicks a pixel 200 CSS pixels away from
  every marker
- **THEN** `getSelection` still names the first system

#### Scenario: The hover follows the pointer and clears on leave

- **WHEN** the browser test moves the pointer onto a system's projected centre, waits one
  frame and reads `getHover`, then moves the pointer off the canvas, waits one frame and
  reads again
- **THEN** the first reading names the system and the second is null

#### Scenario: The hover follows a camera move with the pointer still

- **WHEN** the browser test puts the pointer on a pixel that holds no marker, then calls
  `setView` so that a system projects to that pixel, waits one frame and reads `getHover`
- **THEN** the reading names the system

#### Scenario: A replaced record keeps the selection

- **WHEN** a browser test adds a record with the `id64` `1000`, selects it, adds a record
  with the same `id64` and another name, and reads `getSelection`
- **THEN** the reading names the new record and the listener did not fire

#### Scenario: Clearing the set clears the selection

- **WHEN** the browser test selects a system, calls `clearSystems` and reads
  `getSelection`
- **THEN** the reading is null and the listener fired once with null

#### Scenario: An unknown identity clears the selection

- **WHEN** the browser test selects a system, then calls `setSelection('nothing')` and
  reads `getSelection`
- **THEN** the reading is null

#### Scenario: A hidden selected system stays selected

- **WHEN** the browser test selects a system, turns its category off, draws a frame and
  reads `getSelection` and the marker count
- **THEN** the selection still names the system and the marker count does not hold it

### Requirement: A selection centres the camera and caps the distance at 500 light years

A selection that names a system SHALL bring the view to an end state, and the camera SHALL
**fly** to it rather than arrive in one frame.

**The end state** is what the map writes today. The cursor is the system's position, so
the system is at the centre of the screen. The distance is `min(distance, 500)` light
years: a view further out than 500 comes in to 500, and a view already at 500 or closer
keeps the distance it has, because the user has chosen how close to look and the selection
does not take that back. The yaw and the pitch do not change.

**An end state outside the browsable bounds SHALL be clamped.** The bounds hide nothing,
so a system outside them still draws and still selects, which `map-navigation` states. The
end cursor SHALL be the system's position put through the same cursor clamp every other
view change takes, and the end distance SHALL take the same far zoom limit. The flight then
lands on the nearest cursor the bounds allow, the selected system sits **off** the centre of
the screen, and the HUD's range field reads the distance that is left. The selection is
still made and the listeners still fire: a host that restricts the space has restricted
where the camera may go, not what the user may pick.

The map SHALL NOT refuse the selection and SHALL NOT move the camera outside the bounds.
Refusing would make a marker the user can see and click do nothing, and leaving the bounds
would make the restriction a suggestion.

**The path.** The flight SHALL follow the smooth zoom-and-pan path of Van Wijk and Nuij
(2003). Let `k` be `2 * tan(30 degrees)`, which is 1.154701, so the width the frame covers
at the cursor is `w = k * distance`. Let `w0` and `w1` be the start and the end width, and
let `D` be the straight distance between the start and the end cursor. Let `rho` be
**1.42**. Then, with `i` of 0 and 1:

```
b(i) = (w1^2 - w0^2 + (-1)^i * rho^4 * D^2) / (2 * w(i) * rho^2 * D)
r(i) = ln(-b(i) + sqrt(b(i)^2 + 1))
S    = (r1 - r0) / rho
```

`S` is the length of the path. At a point `s` from 0 to `S`, with `theta = rho * s + r0`:

```
u(s) = (w0 / rho^2) * cosh(r0) * (tanh(theta) - tanh(r0))
w(s) = w0 * cosh(r0) / cosh(theta)
```

The cursor SHALL be the start cursor plus `u(s) / D` of the move to the end cursor, and
the distance SHALL be `w(s) / k`. `D` and the end cursor are the **clamped** ones, so the
path is worked out against where the flight may land and not against where the system is. The yaw and the pitch SHALL NOT change.

**Why this path.** It holds the perceived speed of the picture even along the whole
flight. The old rule moved the cursor by a constant number of light years for each unit of
eased time and the distance by a constant factor, and screen speed is world speed over
distance, so the two did not cancel: a flight from 50,000 light years to a system 20,000
light years away ran at about 1.7 screen heights a second at its start, about 24 in its
middle, and 0 at its end. The new path also **pulls the camera back** over the middle of a
long move and brings it in again, so the user sees the ground the flight crosses. This is
what the old rule could never do, because the end distance is never further out than the
start.

**Two special cases.** Where `D` is below 1e-6 light years the path SHALL be a pure zoom:
`S = abs(ln(w1 / w0)) / rho` and `w(s) = w0 * exp(sign(ln(w1 / w0)) * rho * s)`. Where `D`
is below 1e-6 light years **and** `abs(ln(w1 / w0))` is below 1e-6, `S` SHALL be 0, the
map SHALL take the end state in the frame of the selection, and no flight SHALL run.

**The time.** The flight SHALL run for `clamp(1000 * S / V, 400, 2000)` milliseconds, with
`V` of **1.6** per second. `s` SHALL be `S * t / T`, where `t` is the milliseconds since
the start and `T` is that time. The map SHALL apply **no ease**. An ease puts back exactly
the change of speed this path removes, and the start and the stop of the motion are the
two moments the user asked for.

A flight whose `S` is 0.96 runs for 600 milliseconds, which is the fixed time the map used
before, so a selection of the middling size feels as it did.

At `t` of `T` or more the view SHALL be the end state exactly, and the flight SHALL end.

**The zoom limits hold.** The distance the flight writes SHALL be held inside the zoom
limits of the active browsable bounds, which `map-navigation` states. Where that cap binds,
the flight SHALL hold the cap over the part of the path that asks for more, and the even
speed SHALL NOT hold over that part. Where the start and the end distances are both small
next to `D`, the path peaks at about `0.873 * D` light years, so the cap binds on a move
above about 137,000 light years at the 120,000 light year limit. Where they are not small
the peak is higher against `D`, and the rule of thumb needs both end distances: from a start
distance of `D` to an end distance of 500 the peak is about `1.16 * D`, and from `D` to `D`
it is about `1.33 * D`.
The widest move the model bounds allow is their diagonal of 163,430 light years, whose path
asks for about 142,700 and takes 120,000.

**The flight gives way to the user.** A pointer press on the canvas, a wheel notch, a
movement key press, or a call to `setView` SHALL end the flight in the frame it happens.
The movement keys are the eight `map-navigation` names, so `Q` and `E` end a flight as `W`
does.
The view SHALL stay where the flight had reached, and the input SHALL then act on that
view. The user is never held for the length of the flight.

**A selection during a flight** SHALL start a new flight, from the view as it stands to the
new end state.

**Reduced motion.** Where the browser reports `prefers-reduced-motion: reduce`, the view
SHALL take the end state in the frame of the selection and no flight SHALL run. A user who
has asked for less movement gets the map's old behaviour.

**The listeners.** The view change listeners SHALL be raised in each frame the flight
moves the view, as any other view change raises them. The page's fragment writer already
holds a write rate, so a flight writes the fragment a few times and not once a frame.

The rule SHALL hold for every way a selection is made: a click on a marker, a row of the
HUD's category list, and a host's own call to `setSelection`.

Clearing the selection SHALL NOT move the view and SHALL NOT start a flight. A user who
closes the panel has not asked to go back.

`debug` SHALL carry `selectionFlightMs()`, which is the number of milliseconds left in the
running flight and 0 when none runs.

#### Scenario: The flight holds its curve

- **WHEN** a unit test reads the flight path from a start of (0, 0, 0) at 20,000 light
  years to an end of (400, 0, 0) at 500 light years, at 40 even steps of `s`, and for each
  step works out `rho^2 * (du / (w * ds))^2 + (d ln w / (rho * ds))^2`
- **THEN** every one of the 40 readings is 1 within 2 per cent, which is the even perceived
  speed the path is chosen for, and the reading at `s` of 0 is the start view and the
  reading at `s` of `S` is the end view exactly

#### Scenario: A long move at a close view pulls the camera back

- **WHEN** a unit test reads the flight path from a start at a distance of 100 light years
  to an end 20,000 light years away, also at 100 light years, and reads the largest
  distance the path reaches
- **THEN** it is about 17,460 light years, within 2 per cent, and the start and the end
  distances are both 100

#### Scenario: A move of 100,000 light years stays inside the zoom limit

- **WHEN** a unit test reads the flight path for a move of 100,000 light years with a
  start and an end distance of 10 light years, and reads the largest distance it reaches
- **THEN** it is about 87,300 light years, within 2 per cent, and below the 120,000 light
  year zoom limit

#### Scenario: The widest move of all takes the zoom limit

- **WHEN** a unit test reads the flight path for a move of 163,430 light years, the
  diagonal of the model bounds, with a start and an end distance of 10 light years
- **THEN** the path asks for about 142,700 light years, within 2 per cent, and the
  distance the flight writes never passes 120,000

#### Scenario: The flight time follows the length of the path

- **WHEN** a unit test reads the flight time for a path whose `S` is 0.96, for one whose
  `S` is 0.1 and for one whose `S` is 8.25
- **THEN** the three times are 600, 400 and 2,000 milliseconds

#### Scenario: A same-place selection runs no flight

- **WHEN** a unit test reads the flight for a start and an end that hold the same cursor
  and the same distance
- **THEN** `S` is 0 and the flight time is 0

#### Scenario: A far selection comes in to 500 light years

- **WHEN** the browser test opens a view at a distance of 20,000 light years with a yaw of
  40 and a pitch of 60, adds a system 400 light years from the cursor, selects it through
  `setSelection`, reads the view in the next frame, and reads it again after 2,500 ms
- **THEN** the first reading is neither the start view nor the end view, and the second
  reading has the cursor at the system's position, the distance at 500, the yaw at 40 and
  the pitch at 60

#### Scenario: A click at a far view centres and comes in

- **WHEN** the browser test opens a view at 20,000 light years, clicks a marker, reads the
  view in the very next frame, then waits 2,500 ms and reads the view and the selection
- **THEN** the first reading already has a moved cursor, and after the wait the selection
  names that system, the distance is 500 and the cursor is the system's position

#### Scenario: A close view keeps its distance

- **WHEN** the browser test opens a view at a distance of 100 light years, selects a system
  that draws in it, waits for the flight to end, and reads the view
- **THEN** the cursor is the system's position and the distance is still 100

#### Scenario: A selection at exactly 500 light years keeps its distance

- **WHEN** the browser test opens a view at a distance of 500 light years, selects a system
  and waits for the flight to end
- **THEN** the cursor is the system's position and the distance is 500

#### Scenario: The selected system sits at the centre of the screen

- **WHEN** the browser test selects a system from a view at 20,000 light years and from a
  view at 100 light years, with no browsable bounds set, waits for each flight to end, draws
  a frame after each, and projects the system's position to the screen
- **THEN** each projection is the centre of the canvas within 1 CSS pixel

#### Scenario: A selection outside the bounds lands on the nearest allowed cursor

- **WHEN** the browser test sets a sphere bound of radius 100 light years at the origin,
  adds a system at (5,000, 0, 0), selects it, waits for the flight to end, and reads the
  view and the selection
- **THEN** the selection names the system, the cursor is (100, 0, 0) on the sphere's
  surface, and the system's projection is not the centre of the canvas

#### Scenario: A wheel notch ends the flight

- **WHEN** the browser test selects a system from a view at 20,000 light years, waits 100
  ms, sends one wheel notch, reads the view, waits 2,500 ms and reads it again
- **THEN** the first reading is between the start and the end, the second is the first with
  the wheel's own zoom step applied, and `selectionFlightMs` is 0 at both readings

#### Scenario: A drag ends the flight

- **WHEN** the browser test selects a system from a view at 20,000 light years, waits 100
  ms, presses the left button and orbits 60 pixels, then waits 2,500 ms and reads the view
- **THEN** the cursor is where the flight had reached and not the system's position, and
  the yaw has changed by the orbit

#### Scenario: A second selection flies from where the first reached

- **WHEN** the browser test selects one system from a view at 20,000 light years, waits
  100 ms, selects a second system, and waits 2,500 ms
- **THEN** the view ends at the second system with a distance of 500, and the cursor never
  returned to the first reading

#### Scenario: Reduced motion arrives at once

- **WHEN** the browser test runs with `prefers-reduced-motion` set to `reduce`, opens a
  view at 20,000 light years, selects a system and reads the view in the next frame
- **THEN** the cursor is the system's position, the distance is 500, and
  `selectionFlightMs` is 0

#### Scenario: Clearing the selection leaves the view

- **WHEN** the browser test selects a system, waits for the flight to end, reads the view,
  calls `setSelection(null)` and reads the view again
- **THEN** the two readings are equal and no flight ran

#### Scenario: A restricted zoom limit caps the path

- **WHEN** the browser test sets a sphere bound of radius 2,000 light years at the origin,
  opens a view with the cursor at (-2,000, 0, 0) at the 4,000 light year cap that bound
  gives, selects a system at (2,000, 0, 0), and reads the largest distance the flight
  reaches
- **THEN** the path asks for about 4,647 light years and the flight never writes a distance
  above 4,000

#### Scenario: The flight holds the frame rate

- **WHEN** the browser test adds 10,000 systems, resets the animation frame interval
  statistics, selects a system from a view at 20,000 light years at 1920x1080, waits for
  the flight to end and reads the statistics
- **THEN** the mean interval is 18 ms or less, which is the bound this capability already
  holds for the frame loop

### Requirement: The selected system carries the game's system marker

The map SHALL draw a pin over the selected system: the shape the game's own galaxy map
uses for a chosen system. The pin SHALL be an element in the overlay the library owns for
the region labels, not a pass on the canvas, so it stays a crisp vector at every device
pixel ratio and needs no shader.

**The shape.** In a box 476.25 wide and 806.06 high, with the origin at the top left, the
outline SHALL run through (238.13, 0), (0, 211.44), (238.12, 806.06) and (476.25, 211.44),
and a diamond SHALL be cut from it through (238, 353.89), (73, 206.89), (238, 59.89) and
(403.17, 206.89). The shape is a four-point pin with its tip at the bottom and a diamond
hole near its head.

**The look.** The fill SHALL be `#00CDF7`. The outline SHALL be `rgba(2, 10, 26, 0.9)` at
1 CSS pixel, so the pin reads over the cream core of the galaxy as well as over dark
space.

**The size and the place.** The pin SHALL be 28 CSS pixels high and 16.5 wide, at every
zoom distance. Its tip SHALL sit `markerCssSize / 2 + 2` CSS pixels above the centre of
the selected marker, so the marker itself stays visible under it.

**When it draws.** The pin SHALL draw only while the selected system's marker draws. A
selection whose category is off, whose name the filter drops, or which the camera has left
the draw range of, SHALL show no pin. The pin SHALL move with the marker in the same frame
the marker moves, so the two never separate on the screen.

#### Scenario: The pin draws over the selected marker

- **WHEN** the browser test selects a system at a known projection, draws a frame, and
  reads the overlay for the pin element
- **THEN** one pin is present, its fill is `#00CDF7`, and its tip lies within 1 CSS pixel
  of `markerCssSize / 2 + 2` above the marker's projected centre

#### Scenario: Only the selected system carries a pin

- **WHEN** the browser test adds three systems, selects the second, and counts the pins
- **THEN** the count is 1

#### Scenario: The pin goes when the marker goes

- **WHEN** the browser test selects a system, turns its category off, draws a frame and
  counts the pins, then turns the category on, draws and counts again
- **THEN** the counts are 0 and 1

#### Scenario: The pin follows the marker through a camera move

- **WHEN** the browser test selects a system and then orbits 60 pixels, reading the pin's
  tip and the marker's projected centre in the same frame at the start and at the end
- **THEN** the offset between them is the same at both readings, within 1 CSS pixel

### Requirement: The hovered marker carries a ring

The map SHALL draw a ring around the hovered marker, as an element in the same overlay.
The ring SHALL be a circle of `markerCssSize * 3.2` CSS pixels across, with a floor of 24,
centred on the marker, drawn as a 1 CSS pixel stroke in white at an alpha of 0.5.

At most one ring SHALL draw, because the map holds at most one hovered system. A system
that is both hovered and selected SHALL carry the ring and the pin together.

#### Scenario: The ring appears and goes with the hover

- **WHEN** the browser test moves the pointer onto a marker, waits one frame and counts
  the rings, then moves the pointer 200 CSS pixels away, waits one frame and counts again
- **THEN** the counts are 1 and 0

#### Scenario: A hovered and selected system carries both marks

- **WHEN** the browser test selects a system and leaves the pointer on it
- **THEN** the overlay holds one ring and one pin, both centred on that marker

### Requirement: The marker name labels are bounded

The map SHALL place a name label under a marker as an element in the same overlay. A label
SHALL sit `markerCssSize / 2 + 6` CSS pixels below the marker's projected centre, centred
on it.

The hovered system and the selected system SHALL always carry a label, whatever the
switch below says.

The handle SHALL carry `setSystemNamesVisible(on)` and `areSystemNamesVisible()`. The
switch SHALL be off when the map starts. While it is on, every drawn marker SHALL be a
label candidate.

**A name label SHALL carry a stroke and SHALL NOT carry a blurred shadow.** The stroke
SHALL be **2 CSS pixels** in `rgba(0, 0, 0, 0.9)`, drawn under the glyph. The label was
`0 0 8px` and `0 1px 3px` of black. Firefox rasterises a blurred text shadow on the CPU,
and the two blurred shadows of the overlay together cost 4.2 ms of a frame that cost
12.1 ms, which `browser-suite` states with the reading it comes from. The coordinate
labels take the same treatment, which `coordinate-grid` states. The stroke here is
2 pixels rather than 2.5 because a name label draws at a smaller size than a coordinate
label.

The placement SHALL hold to these bounds:

- A candidate whose projected centre lies outside the viewport SHALL be dropped before any
  other work.
- The **64** candidates nearest the camera SHALL be kept, and the placement SHALL hold the
  time bound the budget requirement below gives. A sort of the whole candidate list is what
  that bound rules out in practice: the list can hold 10,000 entries.
- A candidate whose label box overlaps a box already placed SHALL be skipped, by the same
  box test the region labels use.
- At most **64** name labels, plus the hover label and the selection label, SHALL be in
  the overlay in any frame. The DOM node count therefore does not follow the size of the
  set.

#### Scenario: The switch turns the labels on and off

- **WHEN** the browser test adds 10 systems in view, counts the name labels, calls
  `setSystemNamesVisible(true)`, draws a frame and counts again, then turns it off, draws
  and counts a third time
- **THEN** the counts are 0, 10 and 0

#### Scenario: The hovered and the selected system are labelled with the switch off

- **WHEN** the browser test leaves the switch off, selects one system and hovers another,
  draws a frame and reads the labels
- **THEN** exactly two labels are present and they name those two systems

#### Scenario: The label count is capped at a full set

- **WHEN** the browser test adds 10,000 systems inside the frame, turns the switch on,
  draws a frame and counts the name labels
- **THEN** the count is 64 or fewer

#### Scenario: Two labels do not overlap

- **WHEN** the browser test adds two systems whose markers project 4 CSS pixels apart,
  turns the switch on, draws a frame and reads the label boxes
- **THEN** one label is placed and the other is not

#### Scenario: A name label carries a stroke and no shadow

- **WHEN** the browser test adds 10 systems in view, turns the name switch on, draws a
  frame and reads the computed `text-shadow`, `-webkit-text-stroke-width`,
  `-webkit-text-stroke-color` and `paint-order` of every name label
- **THEN** every label reads `none` for the shadow, `2px` for the stroke width, a stroke
  colour within 2 on each channel of `rgba(0, 0, 0, 0.9)`, and `stroke` or `stroke fill`
  for the paint order, which is what puts the stroke under the glyph. `coordinate-grid`
  states why the paint order has two strings

### Requirement: Selection holds the frame budget

The hover pick, the pin, the ring and the name label placement together SHALL add at most
**2 ms** to the mean frame with a set of 10,000 systems, the name switch on and the pointer
over the canvas, at 1920x1080 on the project's test card.

The page SHALL expose the mean and the worst time of that work since the last reset, as
`labelSampling` already does for the region label sweep. The work runs in the frame loop
around the draw call, so `frameStats` does not see it: `frameStats` times `render` alone,
which the `real-systems` spec already states. A budget read from `frameStats` would
therefore pass whatever this work cost, and it is not the instrument for it.

The page SHALL also expose the mean and the worst interval between animation frames since
the last reset. That reading covers everything the browser does per frame, the draw, this
work and the paint of the overlay elements together, and it is what shows a dropped frame.
With the set, the switch and the pointer above, at 1920x1080, the mean interval SHALL stay
at or below **18 ms**. A display at 60 Hz gives 16.7 ms when the page keeps up and about
33.3 ms when it misses a frame, so 18 ms is the reading that separates the two.

The draw-time budget of `far-view-rendering` is unchanged and is measured as it always was.
This requirement adds the two readings the new work needs and does not restate that one.

#### Scenario: The selection work fits its own budget

- **WHEN** the browser test adds 10,000 systems in view, turns the name switch on, puts
  the pointer over a marker, draws 120 frames at 1920x1080 and reads the selection work
  statistics
- **THEN** the mean is 2 ms or less

#### Scenario: The page keeps its frame rate with the selection work running

- **WHEN** the browser test repeats the reading above and reads the animation frame
  interval statistics
- **THEN** the mean interval is 18 ms or less

#### Scenario: The label placement holds its bound at a full set

- **WHEN** the browser test adds 10,000 systems inside the frame, turns the name switch on
  and reads the selection work statistics over 120 frames
- **THEN** the mean is 2 ms or less, which a sort of the whole candidate list every frame
  would not hold
