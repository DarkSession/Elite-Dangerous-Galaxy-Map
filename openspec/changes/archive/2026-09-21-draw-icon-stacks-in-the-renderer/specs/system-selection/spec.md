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

**A nearer marker hides a name label.** A label is a DOM element over the canvas, so it
draws over every pixel the canvas drew at that place, whatever the depth. Without a rule
the name of a system 4,000 light years away covers a star 40 light years from the camera.

- A name label SHALL be **hidden** in a frame where the drawn centre of the marker of a
  system nearer to the camera than the label's own system lies inside the label's box.
- **The hovered system's label and the selected system's label SHALL NOT hide.** The user
  asked for those two names, and a label that answers a hover must answer it.
- **A system does not hide its own label**, and the test SHALL skip its own index.
- The test SHALL read the **66** markers nearest the camera, which is the keeper the pass
  already fills, and SHALL stop at the first candidate no nearer than the label's own
  system, because that keeper is held in ascending range.
- **A hidden label SHALL draw nothing and SHALL take no pointer event.** It SHALL keep its
  place, its pool slot and its count, so a frame that shows it again allocates nothing and
  every count below reads the same with this rule as without it.
- **The test is the whole element and not a part of it.** A name carries text a reader must
  read from end to end, so a name half covered by a marker is a name the reader cannot
  trust. This is the opposite call to the one `system-icons` makes for a 28 pixel glyph,
  and it is made on that difference.
- **The rule reads the markers of the set alone.** It SHALL NOT test the icon stacks, which
  draw on the canvas, so a name label still draws over a stack it crosses. A label sits
  below its own marker and a stack sits above its own, so the two cross only for two
  different systems.

The placement SHALL hold to these bounds:

- A candidate whose projected centre lies outside the viewport SHALL be dropped before any
  other work.
- The **66** candidates nearest the camera SHALL be kept, and the placement SHALL hold the
  time bound the budget requirement below gives.

  **The keeper SHALL hold every drawn marker while the name switch is on**, including the
  hovered one and the selected one. It is no longer the label pass's own list: the occlusion
  rule above reads it to find the marker that hides a label, and each of those two is a
  marker that can hide one.

  **The sweep SHALL not run while the name switch is off.** The only labels of such a frame
  are the hover label and the selection label, both pinned, and the rule above never hides a
  pinned label. A sweep of 10,000 candidates for a reader that cannot use the answer is work
  the frame does not owe.

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

#### Scenario: A nearer marker hides the label under it

- **WHEN** the browser test turns the name switch on, places one system 4,000 light years
  away and a second system 40 light years away whose marker projects inside the first
  label's box, draws a frame and reads the visibility of that label
- **THEN** the label is hidden, and the canvas pixel at the nearer marker's centre reads the
  marker

#### Scenario: A further marker hides no label

- **WHEN** the browser test moves that second system behind the first, draws a frame and
  reads the same label
- **THEN** the label is shown

#### Scenario: A system does not hide its own label

- **WHEN** the browser test adds one system on its own with a wide `glow` marker whose
  sprite reaches its own label box, draws a frame and reads that label
- **THEN** the label is shown

#### Scenario: The hovered and the selected label do not hide

- **WHEN** the browser test builds the covered frame above, then hovers the covered system,
  draws a frame and reads its label, then selects it, draws and reads again
- **THEN** the label is shown in both readings

#### Scenario: A hidden label still holds its count

- **WHEN** the browser test builds the covered frame above and counts the name labels
- **THEN** the count is the same as it is in the frame where the nearer system sits behind

#### Scenario: The label comes back when the marker moves away

- **WHEN** the browser test orbits the camera until the nearer marker leaves the label's
  box, draws a frame and reads the label
- **THEN** the label is shown

### Requirement: Selection holds the frame budget

The hover pick, the pin, the ring and the name label placement together SHALL add at most
**2 ms** to the mean frame with a set of 10,000 systems, the name switch on, the icon
switch on, every record carrying 4 icons, and the pointer over the canvas, at 1920x1080 on
the project's test card.

The budget is unchanged at 2 ms. **The icon stack placement has left this reading.** The
stacks draw on the canvas, so the pass selects and places them inside `render`, which
`system-icons` states. `frameStats` times `render` alone, so that work now falls inside the
draw-time budget of `far-view-rendering`, and `system-icons` carries the requirement that
holds it there. This reading therefore covers the overlay work alone, and it SHALL NOT be
raised to make room for work that left it.

The page SHALL expose the mean and the worst time of that work since the last reset, as
`labelSampling` already does for the region label sweep. The work runs in the frame loop
around the draw call, so `frameStats` does not see it: `frameStats` times `render` alone,
which the `real-systems` spec already states. A budget read from `frameStats` would
therefore pass whatever this work cost, and it is not the instrument for it.

The page SHALL also expose the mean and the worst interval between animation frames since
the last reset. That reading covers everything the browser does per frame, the draw, this
work and the paint of the overlay elements together, and it is what shows a dropped frame.
With the set, the switches, the icons and the pointer above, at 1920x1080, the mean
interval SHALL stay at or below **18 ms**. A display at 60 Hz gives 16.7 ms when the page
keeps up and about 33.3 ms when it misses a frame, so 18 ms is the reading that separates
the two.

**The interval reading is the one that still covers both halves.** It sees the draw and the
overlay work together, so a cost that moved from one to the other cannot hide from it.

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

#### Scenario: The icon placement holds the budget at a full set

- **WHEN** the browser test adds 10,000 systems inside the frame, each carrying 4 icons,
  turns the name switch and the icon switch on, puts the pointer over a marker and reads
  the frame interval statistics over 120 frames
- **THEN** the mean interval is 18 ms or less.

  **The reading is the interval and not the selection work.** The placement runs inside
  `render` now, so the selection work statistics no longer see it and a reading of them
  would pass by measuring nothing. `system-icons` holds the draw-time reading of the same
  work.

#### Scenario: The label occlusion test does not raise the selection work

- **WHEN** the browser test repeats the label bound reading above with 10,000 systems, the
  name switch on and every label tested against the keeper
- **THEN** the mean is 2 ms or less, so the per-label walk of the keeper stays inside the
  budget the placement already held
