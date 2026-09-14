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
   filter keeps it, and the camera is inside its category's `maxDrawRange`.
2. It lies in front of the near plane, so a system behind the camera is never picked.
3. The distance from the pixel to its projected centre is at or below the **pick radius**.

The pick radius SHALL be `markerCssSize / 2 + 4` CSS pixels, where `markerCssSize` is the
disc diameter of `real-systems`, which runs from 7 to 12. The radius therefore runs from
7.5 to 10 CSS pixels. The radius SHALL read the **disc** diameter for both marker styles,
so a `glow` and a `disc` of the same range are equally easy to hit. A glow's sprite is 2.5
times the disc, and a pick radius that followed the sprite would make a glow a target 2.5
times as wide for no reason the user can see.

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
  a range where its disc is at the cap of 12 and calls at 10 and at 11 CSS pixels from its
  centre
- **THEN** the first call names the system and the second is null, and the third names it
  and the fourth is null

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
the release pixel. A click that finds no system SHALL leave the selection as it is. The
user orbits with the same button, so a click that lands between markers is far more often
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

A selection that names a system SHALL set the view's cursor to that system's position, so
the system is at the centre of the screen. The cursor SHALL move for every selection,
whatever the distance was.

The view's distance SHALL become `min(distance, 500)` light years. A view further out than
500 comes in to 500. A view already at 500 or closer SHALL keep the distance it has: the
user has chosen how close to look, and the selection does not take that back.

The yaw and the pitch SHALL NOT change.

The rule SHALL hold for every way a selection is made: a click on a marker, a row of the
HUD's category list, and a host's own call to `setSelection`.

Clearing the selection SHALL NOT move the view. A user who closes the panel has not asked
to go back.

The movement SHALL raise the view change listeners once, as any other view change does, so
the page writes one fragment for it.

#### Scenario: A far selection comes in to 500 light years

- **WHEN** the browser test opens a view at a distance of 20,000 light years with a yaw of
  40 and a pitch of 60, adds a system 400 light years from the cursor, selects it through
  `setSelection`, and reads the view
- **THEN** the cursor is the system's position, the distance is 500, the yaw is 40 and the
  pitch is 60

#### Scenario: A close view keeps its distance

- **WHEN** the browser test opens a view at a distance of 100 light years, selects a system
  that draws in it, and reads the view
- **THEN** the cursor is the system's position and the distance is still 100

#### Scenario: A selection at exactly 500 light years keeps its distance

- **WHEN** the browser test opens a view at a distance of 500 light years and selects a
  system
- **THEN** the cursor is the system's position and the distance is 500

#### Scenario: A click at a far view centres and comes in

- **WHEN** the browser test opens a view at 20,000 light years, clicks a marker, and reads
  the view and the selection
- **THEN** the selection names that system, the distance is 500 and the cursor is the
  system's position

#### Scenario: The selected system sits at the centre of the screen

- **WHEN** the browser test selects a system from a view at 20,000 light years and from a
  view at 100 light years, drawing a frame after each, and projects the system's position
  to the screen
- **THEN** each projection is the centre of the canvas within 1 CSS pixel

#### Scenario: Clearing the selection leaves the view

- **WHEN** the browser test selects a system, reads the view, calls `setSelection(null)`
  and reads the view again
- **THEN** the two readings are equal

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
