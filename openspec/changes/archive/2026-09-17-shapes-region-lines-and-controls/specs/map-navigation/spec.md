## ADDED Requirements

### Requirement: The keys `Q` and `E` turn the camera

The key `Q` SHALL decrease the yaw and the key `E` SHALL increase it, at **60 degrees per
second**, so a full turn takes 6 seconds. The direction follows the pointer rule
"Camera orbits the cursor", where pointer movement to the right increases the yaw: `E`
turns the camera the way a drag to the right turns it.

Neither key SHALL change the pitch, the distance or the cursor. The camera SHALL keep
looking at the cursor. The yaw SHALL wrap into 0 to 360 degrees, as every other yaw change
does. Both keys held together SHALL turn the camera by 0 degrees, because the two rates
cancel.

`Q` and `E` SHALL be **movement keys**. Every rule this capability states for a movement
key SHALL therefore hold for them:

- the listener sits on the window, and a key event whose target is an `input`, a
  `textarea`, a `select` or an element whose `isContentEditable` is true SHALL be ignored,
  which the requirement "Cursor moves in the galactic plane" states;
- a key the guard ignored SHALL NOT be held;
- a press SHALL end a running selection flight in the frame it moves the view, which
  `system-selection` states.

The turn SHALL be applied once per frame from the seconds that frame covers, as the cursor
movement is, so the rate does not follow the frame rate.

#### Scenario: `E` turns the camera right

- **WHEN** the browser test opens the default view, holds `E` for 1 second and reads the
  yaw
- **THEN** the yaw has increased by 60 degrees, within 10 per cent, and the cursor, the
  pitch and the distance are unchanged

#### Scenario: `Q` turns the camera the other way

- **WHEN** a unit test sets the yaw to 100, holds `Q` and advances the controls by 0.5
  seconds
- **THEN** the yaw is 70

#### Scenario: The yaw wraps

- **WHEN** a unit test sets the yaw to 10, holds `Q` and advances the controls by 1 second
- **THEN** the yaw is 310, and not -50

#### Scenario: A release outside the page stops the turn

- **WHEN** a unit test presses `E`, then sends a `keyup` for `KeyE` whose target is the
  window, then advances the controls by 1 second and reads the yaw twice
- **THEN** the two readings are equal, so the turn stopped at the release

#### Scenario: Both keys cancel

- **WHEN** a unit test sets the yaw to 45, holds `Q` and `E` together and advances the
  controls by 2 seconds
- **THEN** the yaw is 45

#### Scenario: Typing in the search box does not turn the camera

- **WHEN** the browser test opens the map with the HUD on, reads the yaw, clicks the HUD's
  search box, types `qe`, waits 1 second and reads the yaw again
- **THEN** the two readings are equal, and the search box holds `qe`

#### Scenario: A turn key ends a selection flight

- **WHEN** the browser test selects a system from a view at 20,000 light years, waits 100
  ms, holds `E` for one frame, then waits 800 ms and reads the view
- **THEN** the cursor is where the flight had reached and not the system's position, and
  the yaw has changed

#### Scenario: The turn rate does not follow the frame rate

- **WHEN** a unit test holds `E` and advances the controls by 1 second in one step, then
  resets and advances it by 1 second in 100 steps of 10 milliseconds
- **THEN** the two yaw readings are equal within 0.001 degrees
