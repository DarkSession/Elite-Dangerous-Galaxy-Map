## MODIFIED Requirements

### Requirement: The pick finds the nearest marker under a pixel

The handle SHALL carry `systemAt(x, y)`, which takes a pixel in canvas CSS coordinates
and returns the system under it or null.

A system SHALL be a candidate when all of these hold:

1. Its marker draws in the current frame. That means its primary category is on, the name
   filter keeps it, and the camera is inside its category's `maxDrawRange`.
2. It lies in front of the near plane, so a system behind the camera is never picked.
3. The distance from the pixel to its projected centre is at or below the **pick radius**.

The pick radius SHALL be `markerCssSize / 2 + 4` CSS pixels, where `markerCssSize` is the
disc diameter of `real-systems`, which runs from 7 to 16. The radius therefore runs from
7.5 to 12 CSS pixels. The radius SHALL read the **disc** diameter for both marker styles,
so a `glow` and a `disc` of the same range are equally easy to hit. A glow's sprite is 2.5
times the disc, and a pick radius that followed the sprite would make a glow a target 2.5
times as wide for no reason the user can see.

The disc diameter reads the camera range alone, so the pick radius does too. The pick and
the marker pass read one rule, so a pixel that looks like a hit is a hit at every viewport
height.

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


### Requirement: A selection centres the camera and caps the distance at 500 light years

A selection that names a system SHALL bring the view to an end state, and the camera SHALL
**fly** to it rather than arrive in one frame.

**The end state** is what the map writes today. The cursor is the system's position, so
the system is at the centre of the screen. The distance is `min(distance, 500)` light
years: a view further out than 500 comes in to 500, and a view already at 500 or closer
keeps the distance it has, because the user has chosen how close to look and the selection
does not take that back. The yaw and the pitch do not change.

**The flight** SHALL start in the frame the selection is made, with no wait, and SHALL run
for **350 ms**. Let `u` be the milliseconds since the start over 350, held at 1, and let
`e` be `1 - (1 - u)^3`, which is an ease-out. Then in each frame of the flight:

- The cursor SHALL be the start cursor plus `e` times the move to the end cursor.
- The distance SHALL be `startDistance * (endDistance / startDistance)^e`, so the zoom
  moves by a constant factor for each unit of `e`. A distance that moved by a constant
  number of light years would spend most of the flight in the far part of the move, where
  a light year covers no pixels, and would then cross the near part in two frames.
- The yaw and the pitch SHALL NOT change.

At `u` of 1 the view SHALL be the end state exactly, and the flight SHALL end.

**The flight gives way to the user.** A pointer press on the canvas, a wheel notch, a
movement key press, or a call to `setView` SHALL end the flight in the frame it happens.
The view SHALL stay where the flight had reached, and the input SHALL then act on that
view. The user is never held for 350 ms.

**A selection during a flight** SHALL start a new flight, from the view as it stands to the
new end state.

**Reduced motion.** Where the browser reports `prefers-reduced-motion: reduce`, the view
SHALL take the end state in the frame of the selection and no flight SHALL run. A user who
has asked for less movement gets the map's old behaviour.

**The listeners.** The view change listeners SHALL be raised in each frame the flight
moves the view, as any other view change raises them. The page's fragment writer already
holds a write rate, so a flight writes the fragment a few times and not 21 times.

The rule SHALL hold for every way a selection is made: a click on a marker, a row of the
HUD's category list, and a host's own call to `setSelection`.

Clearing the selection SHALL NOT move the view and SHALL NOT start a flight. A user who
closes the panel has not asked to go back.

`debug` SHALL carry `selectionFlightMs()`, which is the number of milliseconds left in the
running flight and 0 when none runs.

#### Scenario: A far selection comes in to 500 light years

- **WHEN** the browser test opens a view at a distance of 20,000 light years with a yaw of
  40 and a pitch of 60, adds a system 400 light years from the cursor, selects it through
  `setSelection`, reads the view in the next frame, and reads it again after 500 ms
- **THEN** the first reading is neither the start view nor the end view, and the second
  reading has the cursor at the system's position, the distance at 500, the yaw at 40 and
  the pitch at 60

#### Scenario: A click at a far view centres and comes in

- **WHEN** the browser test opens a view at 20,000 light years, clicks a marker, reads the
  view in the very next frame, then waits 500 ms and reads the view and the selection
- **THEN** the first reading already has a smaller distance and a moved cursor, and after
  the wait the selection names that system, the distance is 500 and the cursor is the
  system's position

#### Scenario: The flight holds its curve

- **WHEN** a unit test reads the flight rule from a start of (0, 0, 0) at 20,000 light
  years to an end of (400, 0, 0) at 500 light years, at 0, 87.5, 175, 262.5 and 350 ms
- **THEN** the first reading is the start, the last is the end exactly, the cursor moves
  by 0, 0.578, 0.875, 0.984 and 1 of the way, and each distance is
  `20000 * (500 / 20000)^e` for the same five values of `e`

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
  view at 100 light years, waits for each flight to end, draws a frame after each, and
  projects the system's position to the screen
- **THEN** each projection is the centre of the canvas within 1 CSS pixel

#### Scenario: A wheel notch ends the flight

- **WHEN** the browser test selects a system from a view at 20,000 light years, waits 100
  ms, sends one wheel notch, reads the view, waits 500 ms and reads it again
- **THEN** the first reading is between the start and the end, the second is the first with
  the wheel's own zoom step applied, and `selectionFlightMs` is 0 at both readings

#### Scenario: A drag ends the flight

- **WHEN** the browser test selects a system from a view at 20,000 light years, waits 100
  ms, presses the left button and orbits 60 pixels, then waits 500 ms and reads the view
- **THEN** the cursor is where the flight had reached and not the system's position, and
  the yaw has changed by the orbit

#### Scenario: A second selection flies from where the first reached

- **WHEN** the browser test selects one system from a view at 20,000 light years, waits
  100 ms, selects a second system, and waits 500 ms
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

#### Scenario: The flight holds the frame rate

- **WHEN** the browser test adds 10,000 systems, resets the animation frame interval
  statistics, selects a system from a view at 20,000 light years at 1920x1080, waits for
  the flight to end and reads the statistics
- **THEN** the mean interval is 18 ms or less, which is the bound this capability already
  holds for the frame loop
