## MODIFIED Requirements

### Requirement: A selection centres the camera and caps the distance at 500 light years

A selection that names a system SHALL bring the view to an end state, and the camera SHALL
**fly** to it rather than arrive in one frame.

**The end state** is what the map writes today. The cursor is the system's position, so
the system is at the centre of the screen. The distance is `min(distance, 500)` light
years: a view further out than 500 comes in to 500, and a view already at 500 or closer
keeps the distance it has, because the user has chosen how close to look and the selection
does not take that back. The yaw and the pitch do not change.

**The flight** SHALL start in the frame the selection is made, with no wait, and SHALL run
for **600 ms**. Let `u` be the milliseconds since the start over 600, held at 1, and let
`e` be `1 - (1 - u)^3`, which is an ease-out. Then in each frame of the flight:

- The cursor SHALL be the start cursor plus `e` times the move to the end cursor.
- The distance SHALL be `startDistance * (endDistance / startDistance)^e`, so the zoom
  moves by a constant factor for each unit of `e`. A distance that moved by a constant
  number of light years would spend most of the flight in the far part of the move, where
  a light year covers no pixels, and would then cross the near part in two frames.
- The yaw and the pitch SHALL NOT change.

At `u` of 1 the view SHALL be the end state exactly, and the flight SHALL end.

**The flight ran for 350 ms.** The owner read that as too quick to follow: the view was at
the system before the eye found what had moved. 600 ms is the same curve over a longer
time. It still ends well inside a second, and every rule that gives the flight back to the
user is unchanged, so the wait is never forced on anyone who wants to act.

**The flight gives way to the user.** A pointer press on the canvas, a wheel notch, a
movement key press, or a call to `setView` SHALL end the flight in the frame it happens.
The movement keys are the eight `map-navigation` names, so `Q` and `E` end a flight as `W`
does.
The view SHALL stay where the flight had reached, and the input SHALL then act on that
view. The user is never held for 600 ms.

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
  `setSelection`, reads the view in the next frame, and reads it again after 800 ms
- **THEN** the first reading is neither the start view nor the end view, and the second
  reading has the cursor at the system's position, the distance at 500, the yaw at 40 and
  the pitch at 60

#### Scenario: A click at a far view centres and comes in

- **WHEN** the browser test opens a view at 20,000 light years, clicks a marker, reads the
  view in the very next frame, then waits 800 ms and reads the view and the selection
- **THEN** the first reading already has a smaller distance and a moved cursor, and after
  the wait the selection names that system, the distance is 500 and the cursor is the
  system's position

#### Scenario: The flight holds its curve

- **WHEN** a unit test reads the flight rule from a start of (0, 0, 0) at 20,000 light
  years to an end of (400, 0, 0) at 500 light years, at 0, 150, 300, 450 and 600 ms
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
  ms, sends one wheel notch, reads the view, waits 800 ms and reads it again
- **THEN** the first reading is between the start and the end, the second is the first with
  the wheel's own zoom step applied, and `selectionFlightMs` is 0 at both readings

#### Scenario: A drag ends the flight

- **WHEN** the browser test selects a system from a view at 20,000 light years, waits 100
  ms, presses the left button and orbits 60 pixels, then waits 800 ms and reads the view
- **THEN** the cursor is where the flight had reached and not the system's position, and
  the yaw has changed by the orbit

#### Scenario: A second selection flies from where the first reached

- **WHEN** the browser test selects one system from a view at 20,000 light years, waits
  100 ms, selects a second system, and waits 800 ms
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
