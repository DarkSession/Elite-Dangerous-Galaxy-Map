## Purpose

Lets the user move across the galaxy the way the game's galaxy map does: a cursor on
the galactic plane, a camera that orbits the cursor, and a zoom with limits.

## ADDED Requirements

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
A left-button drag SHALL move the cursor in the plane at the cursor's height so that the
plane point under the pointer at the start of the drag stays under the pointer. The
keys `W`, `A`, `S` and `D` SHALL move the cursor in the plane relative to the camera's
yaw at a speed of one quarter of the distance per second. The keys `R` and `F` SHALL
move the cursor up and down at the same speed.

#### Scenario: Drag keeps the plane point under the pointer
- **WHEN** the browser test presses the left button at a pixel, moves 200 pixels right
  and releases
- **THEN** the plane point that was under the first pixel projects to the release pixel
  within 1 pixel

#### Scenario: Key movement
- **WHEN** the browser test holds `W` for 1 second at distance 20,000 with pitch 89
- **THEN** the cursor has moved 5,000 light years, within 10 percent, in the screen-up
  direction

### Requirement: Cursor stays inside the galaxy
The cursor SHALL be clamped on every axis to the `x`, `y` and `z` bounds in the model
parameter file.

#### Scenario: Clamp
- **WHEN** a unit test moves the cursor to (60,000, 0, 0)
- **THEN** the cursor's `x` equals the model's upper `x` bound

### Requirement: Camera orbits the cursor
A right-button drag SHALL change yaw by 0.3 degrees per pixel of horizontal movement
and pitch by 0.3 degrees per pixel of vertical movement. Pitch SHALL be clamped to 5 to
89 degrees above the plane. Yaw SHALL wrap into 0 to 360 degrees. The camera SHALL
always look at the cursor.

#### Scenario: Pitch clamp
- **WHEN** a unit test applies a right drag of 1,000 pixels downward
- **THEN** pitch equals 89 degrees

#### Scenario: Camera looks at the cursor
- **WHEN** a unit test sets any view
- **THEN** the cursor projects to the centre of the screen within 1 pixel

### Requirement: Zoom with limits
Each wheel notch SHALL multiply the distance by 1.15 (toward the cursor for a forward
notch). Distance SHALL be clamped to 2,000 to 120,000 light years.

#### Scenario: Zoom in
- **WHEN** a unit test applies one forward notch at distance 20,000
- **THEN** the distance is 17,391 within 1 light year

#### Scenario: Limits
- **WHEN** a unit test applies 100 forward notches
- **THEN** the distance is 2,000

### Requirement: Input does not scroll or select the page
Wheel and drag input on the canvas SHALL NOT scroll the page, select text or open the
context menu.

#### Scenario: Right drag
- **WHEN** the browser test right-drags on the canvas
- **THEN** no context menu event reaches the document's default handler
