# map-navigation Specification

## Purpose
Lets the user move across the galaxy the way the game's galaxy map does: a cursor on
the galactic plane, a camera that orbits the cursor, and a zoom with limits.

## Requirements

### Requirement: View state
The view SHALL consist of a cursor position in game coordinates, a distance from the
cursor, a yaw and a pitch, all in `float64`. Yaw 0 SHALL place the camera on the `-z`
side of the cursor, looking toward `+z`, which puts the galactic centre at the top of
the screen from Sol. Yaw SHALL increase clockwise when seen from `+y`. Pitch SHALL be
the camera's elevation above the plane. The vertical field of view SHALL be 60 degrees.
The default view SHALL have the cursor at Sol (0, 0, 0), distance 60,000 light years,
pitch 35 degrees and yaw 0.

#### Scenario: Default view
- **WHEN** the page loads without a URL fragment
- **THEN** the view equals the default view


### Requirement: View state in the URL fragment
The page SHALL read the view from the URL fragment at load and SHALL write it back to
the fragment when the view changes, at most once per 500 ms. The fragment format SHALL
be `#c=<x>,<y>,<z>&d=<distance>&p=<pitch>&y=<yaw>` with numbers in light years and
degrees.

#### Scenario: Load from fragment
- **WHEN** the page loads with `#c=-9530,-910,19808&d=8000&p=50&y=120`
- **THEN** the view has that cursor, distance, pitch and yaw

#### Scenario: Write to fragment
- **WHEN** the user zooms to a distance of 30,000 light years
- **THEN** within 1 second the fragment contains `d=30000`


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


### Requirement: Cursor stays inside the galaxy
The cursor SHALL be clamped on every axis to the `x`, `y` and `z` bounds in the model
parameter file.

#### Scenario: Clamp
- **WHEN** a unit test moves the cursor to (60,000, 0, 0)
- **THEN** the cursor's `x` equals the model's upper `x` bound


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


### Requirement: Zoom with limits
Each wheel notch SHALL multiply the distance by 1.15 (toward the cursor for a forward
notch). Distance SHALL be clamped to 10 to 120,000 light years.

The close limit is 10 light years because that is the edge of a mass-code `a` boxel, the
finest cell the game's own hierarchy holds, and because a marker's drawn size caps at 12
CSS pixels. Below 10 light years no marker grows, no line gains detail and no new source
of light appears, so a closer limit only spreads the same markers further apart.

#### Scenario: Zoom in
- **WHEN** a unit test applies one forward notch at distance 20,000
- **THEN** the distance is 17,391 within 1 light year

#### Scenario: Limits
- **WHEN** a unit test applies 100 forward notches from 20,000 light years and 100
  backward notches from 20,000 light years
- **THEN** the first gives 10 and the second gives 120,000

#### Scenario: The close limit takes more notches than the old one
- **WHEN** a unit test applies forward notches from 120,000 light years one at a time and
  counts how many it takes to reach the limit
- **THEN** the count is 68, which is 28 more than the 40 notches that reached 500 light
  years, so the wheel keeps its 1.15 step and the range alone is wider

#### Scenario: A stored fragment still loads
- **WHEN** the page loads with `#c=0,0,0&d=2000&p=35&y=0`, a view written before the
  limit moved
- **THEN** the distance is 2,000, because the limit only widened the range

#### Scenario: A fragment below the old limit now loads
- **WHEN** the page loads with `#c=0,0,0&d=50&p=35&y=0`
- **THEN** the distance is 50, and with `d=1` it is 10

### Requirement: Input does not scroll or select the page
Wheel and drag input on the canvas SHALL NOT scroll the page, select text or open the
context menu.

#### Scenario: Right drag
- **WHEN** the browser test right-drags on the canvas
- **THEN** no context menu event reaches the document's default handler
### Requirement: The near plane follows the zoom distance

The near plane of the perspective projection SHALL be `min(10, distance / 10)` light
years, where `distance` is the zoom distance. It SHALL therefore be 10 light years at
every zoom distance of 100 light years and above, which is every zoom distance the map
could reach before this change, and no view that draws today SHALL draw differently.

The rule exists because the cursor sits exactly `distance` light years from the camera. A
fixed near plane of 10 light years puts the cursor on the near plane at a zoom distance
of 10 and in front of it below that, so the point the user is looking at would be clipped
away. With the rule the cursor sits at ten times the near plane at every zoom distance.

No pass reads the depth buffer, so the near plane changes clipping alone and no depth
resolution figure depends on it.

#### Scenario: The near plane at each zoom distance

- **WHEN** a unit test reads the near plane at zoom distances 10, 50, 100, 500, 20,000 and
  120,000 light years
- **THEN** the readings are 1, 5, 10, 10, 10 and 10 light years

#### Scenario: The cursor is never clipped

- **WHEN** a unit test projects the cursor at every zoom distance from 10 to 120,000 light
  years, stepping by the wheel's 1.15 factor, at a pitch of 5 and of 89 degrees
- **THEN** the cursor projects in front of the near plane at every step, and to the centre
  of the screen within 1 pixel

#### Scenario: A marker at the cursor draws at the closest zoom

- **WHEN** the browser test adds one category and one system at Sol, opens
  `#c=0,0,0&d=10&p=35&y=0`, and reads the middle pixel of the marker
- **THEN** the pixel holds the marker's colour, so the near plane did not clip it

#### Scenario: The near plane changes no view that draws today

- **WHEN** the browser test renders the default view and the view
  `#c=0,0,0&d=500&p=35&y=0` with the new near plane rule
- **THEN** each image file is byte-identical to the same view rendered with a fixed near
  plane of 10 light years
