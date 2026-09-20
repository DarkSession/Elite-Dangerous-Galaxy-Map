## MODIFIED Requirements

### Requirement: The pick finds the nearest marker under a pixel

The handle SHALL carry `systemAt(x, y)`, which takes a pixel in canvas CSS coordinates
and returns the system under it or null.

A system SHALL be a candidate when all of these hold:

1. Its marker draws in the current frame. That means one of its categories is on **or it
   names none**, the name filter keeps it, and the **cursor** is inside the `maxDrawRange`
   of the category it draws in, which `real-systems` states. A system that names no
   category draws in the library default, so its range is the default draw range.
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

### Requirement: The marker name labels are bounded

The map SHALL place a name label under a marker as an element in the same overlay. A label
SHALL sit `markerCssSize / 2 + 6` CSS pixels below the marker's projected centre, centred
on it.

The hovered system and the selected system SHALL always carry a label, whatever the
switch below says.

The handle SHALL carry `setSystemNamesVisible(on)` and `areSystemNamesVisible()`. While it
is on, every drawn marker SHALL be a label candidate.

**The host sets the state the map starts in.** `GalaxyMapOptions` SHALL carry
`systemNames`. True starts the map with the labels on, and the switch SHALL be **off**
when the options leave it out, when it is false, and when it holds a value that is not a
boolean. Off stays the default because a set of 10,000 systems opens on a screen of
labels otherwise, and the other three map options already carry a default of their own.

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
- The **66** candidates nearest the camera SHALL be kept, and the placement SHALL hold the
  time bound the budget requirement below gives.

  **The keeper SHALL hold every drawn marker**, including the hovered one, the selected one
  and every one drawn while the name switch is off. It is no longer the label pass's own
  list: `system-icons` reads the same keeper to find the marker that hides an icon, and
  each of those three is a marker that can hide one.

  **66 and not 64**, because the label pass now skips the hovered and the selected index as
  it walks the keeper, where the sweep once left them out before they reached it. Two more
  entries hold the label count where it was in a frame that carries both. A sort of the whole candidate list is what
  that bound rules out in practice: the list can hold 10,000 entries.
- A candidate whose label box overlaps a box already placed SHALL be skipped, by the same
  box test the region labels use.
- At most **64** name labels, plus the hover label and the selection label, SHALL be in
  the overlay in any frame. **The pass SHALL stop after 64 name labels are placed**, and
  not after 64 entries are walked: it walks 66 and a label it drops on an overlap does not
  count against the 64. Counting walked entries would place 62 in a frame that carries a
  hover and a selection, which is the loss the keeper grew to prevent. The DOM node count therefore does not follow the size of the
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

#### Scenario: The option starts the labels on

- **WHEN** a browser test builds a map with `systemNames: true`, adds 10 systems in view,
  draws a frame and counts the name labels, and a second builds one with no `systemNames`
  option and does the same
- **THEN** the first count is 10 and the second is 0

#### Scenario: An unreadable option keeps the labels off

- **WHEN** a browser test builds a map whose `systemNames` is the string `yes`, adds 10
  systems in view, draws a frame and reads `areSystemNamesVisible` and the label count
- **THEN** the reading is false and the count is 0

#### Scenario: The label count holds with no hover and no selection

- **WHEN** the browser test fills the viewport with more than 66 systems, spaced so that no
  two label boxes overlap, none hovered and none selected, draws a frame and counts the name
  labels in the overlay
- **THEN** the count is 64, which is the keeper's 66 less the two the placement cap drops.

  **The spacing is part of the test.** A label the overlap rule drops does not spend one of
  the 64, so a crowded frame places fewer and the reading would be under 64 for a reason
  this scenario is not about. The answer is to space the systems, not to loosen the
  assertion to "64 or fewer", which would pass the 62 the placement cap exists to
  prevent.

#### Scenario: The label count holds with a hover and a selection

- **WHEN** the browser test hovers one system and selects another in the frame above, both
  inside the 64 nearest, and counts the name labels
- **THEN** the count is 64 name labels beside the hover label and the selection label. The
  hover label and the selection label are placed first and go in the same box list, so the
  spacing of the frame above SHALL hold them clear of every name label too
