## MODIFIED Requirements

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

#### Scenario: The option starts the labels on

- **WHEN** a browser test builds a map with `systemNames: true`, adds 10 systems in view,
  draws a frame and counts the name labels, and a second builds one with no `systemNames`
  option and does the same
- **THEN** the first count is 10 and the second is 0

#### Scenario: An unreadable option keeps the labels off

- **WHEN** a browser test builds a map whose `systemNames` is the string `yes`, adds 10
  systems in view, draws a frame and reads `areSystemNamesVisible` and the label count
- **THEN** the reading is false and the count is 0
