## MODIFIED Requirements

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

## ADDED Requirements

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
