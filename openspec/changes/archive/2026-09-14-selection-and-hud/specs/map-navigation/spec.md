## MODIFIED Requirements

### Requirement: Cursor moves in the galactic plane
A right-button drag SHALL move the cursor in the plane at the cursor's height. The
plane point under the pointer at the start of the drag SHALL stay under the pointer. The
keys `W`, `A`, `S` and `D` SHALL move the cursor in the plane relative to the camera's
yaw at a speed of one quarter of the distance per second. The keys `R` and `F` SHALL
move the cursor up and down at the same speed.

The movement keys come from a listener on the window, so a key pressed anywhere on the
page reaches them. The controls SHALL therefore ignore a key event whose target is an
`input`, a `textarea`, a `select` or an element whose `isContentEditable` is true. Without
that guard the HUD's search box moves the camera as the user types `A`, `S` or `D`.

A key the guard ignores SHALL NOT be held: a key that goes down in a form field and comes
up outside it SHALL leave the cursor still.

#### Scenario: Drag keeps the plane point under the pointer
- **WHEN** the browser test presses the right button at a pixel, moves 200 pixels right
  and releases
- **THEN** the plane point that was under the first pixel projects to the release pixel
  within 1 pixel

#### Scenario: Key movement
- **WHEN** the browser test holds `W` for 1 second at distance 20,000 with pitch 89
- **THEN** the cursor has moved 5,000 light years, within 10 percent, in the screen-up
  direction

#### Scenario: Typing in the search box does not move the cursor
- **WHEN** the browser test opens the map with the HUD on, reads the cursor, clicks the
  HUD's search box, types `wasd`, waits 1 second and reads the cursor again
- **THEN** the two readings are equal, and the search box holds `wasd`

#### Scenario: A key released outside the field is not held
- **WHEN** a unit test sends a `keydown` for `KeyW` whose target is an input element, then
  a `keyup` for `KeyW` whose target is the window, then advances the controls by 1 second
- **THEN** the cursor has not moved


### Requirement: Camera orbits the cursor
A left-button drag SHALL change yaw by 0.3 degrees per pixel of horizontal movement
and pitch by 0.3 degrees per pixel of vertical movement. Pointer movement to the right
SHALL increase yaw. Pointer movement down SHALL increase pitch. A left-button drag
SHALL NOT move the cursor. Pitch SHALL be clamped to 5 to
89 degrees above the plane. Yaw SHALL wrap into 0 to 360 degrees. The camera SHALL
always look at the cursor.

A left press that never moves the pointer more than **4 CSS pixels** from where it went
down, and that releases within **400 ms**, SHALL be a click and SHALL NOT be an orbit. A
click selects, which `system-selection` defines. A press that passes either limit SHALL be
an orbit, and it SHALL NOT select on release however far the pointer comes back.

The two limits exist because the same button does both jobs, as it does in the game. The
pixel limit is what separates a click from a drag on a hand that is not perfectly still.
The time limit is what stops a slow press-and-hold with no movement from selecting when
the user meant to stop and look.

A click SHALL still apply the orbit of the pixels it moved, which is at most 1.2 degrees.
The orbit is applied as the pointer moves, so the click does not undo it.

#### Scenario: Pitch clamp
- **WHEN** a unit test applies a left drag of 1,000 pixels downward
- **THEN** pitch equals 89 degrees

#### Scenario: Left drag turns the camera
- **WHEN** the browser test presses the left button, moves 60 pixels right and 30
  pixels down from the default view, and releases
- **THEN** yaw is 18 degrees, pitch is 44 degrees and the cursor is still at Sol

#### Scenario: Camera looks at the cursor
- **WHEN** a unit test sets any view
- **THEN** the cursor projects to the centre of the screen within 1 pixel

#### Scenario: A short still press is a click
- **WHEN** a unit test presses the left button, moves the pointer 3 pixels, and releases
  120 ms later
- **THEN** the controls report a click at the release pixel

#### Scenario: A press that moves far is not a click
- **WHEN** a unit test presses the left button, moves the pointer 40 pixels right, moves
  it back to the press pixel, and releases 120 ms later
- **THEN** the controls report no click, and yaw has changed by 0 degrees, because the
  pointer came back

#### Scenario: A long press is not a click
- **WHEN** a unit test presses the left button, does not move the pointer, and releases
  600 ms later
- **THEN** the controls report no click
