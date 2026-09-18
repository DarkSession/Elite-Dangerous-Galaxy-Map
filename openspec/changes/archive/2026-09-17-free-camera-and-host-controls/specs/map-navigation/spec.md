## MODIFIED Requirements

### Requirement: Camera orbits the cursor
**This requirement is a rule for a pointer that is not a touch pointer.** A touch pointer
reports button 0, so without this sentence a finger would orbit. A touch pointer follows the
requirement "Touch gestures move, zoom and orbit the map", where one finger moves the cursor,
two fingers orbit, and a tap takes a move limit of 10 CSS pixels in place of the 4 below.

A left-button drag SHALL change yaw by 0.3 degrees per pixel of horizontal movement
and pitch by 0.3 degrees per pixel of vertical movement. Pointer movement to the right
SHALL increase yaw. Pointer movement down SHALL increase pitch. A left-button drag
SHALL NOT move the cursor. Pitch SHALL be clamped to **-89 to 89 degrees**, where a
negative pitch puts the camera **under** the galactic plane. Yaw SHALL wrap into 0 to 360
degrees. The camera SHALL always look at the cursor.

**The range was 5 to 89 degrees.** The map showed the disk from above alone, and a reader
who wants to see which side of the plane a system sits on had no view that answers. The
range now runs through **0**, where the camera lies in the plane the cursor sits on. The
map SHALL NOT hold a dead band around 0: a drag SHALL cross the plane without a step.

**Everything the map draws on the plane SHALL draw from under it.** The coordinate grid,
its labels and the cursor marker SHALL draw at a negative pitch as they do at the mirrored
positive one, which `coordinate-grid` states for the grid and its labels. At a pitch of
exactly 0 the plane is edge-on: every ray meets it at the camera itself, so the grid covers
no pixel, and a plane element whose projected area is 0 is left out. That is the projection
and not a rule of its own.

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

#### Scenario: Pitch clamp at the bottom
- **WHEN** a unit test applies a left drag of 1,000 pixels upward from the default view
- **THEN** pitch equals -89 degrees

#### Scenario: A drag crosses the plane with no step
- **WHEN** a unit test starts at a pitch of 3 degrees and applies a left drag of 20 pixels
  upward, one pixel at a time, reading the pitch after each
- **THEN** the 20 readings fall by 0.3 degrees each, from 2.7 to -3.0, and none is skipped

#### Scenario: The camera under the plane looks at the cursor
- **WHEN** a unit test sets a view at a pitch of -45 degrees and projects the cursor
- **THEN** the camera's `y` is below the cursor's `y`, and the cursor projects to the
  centre of the screen within 1 pixel

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

### Requirement: Cursor stays inside the galaxy
The cursor SHALL be clamped to the **active browsable bounds**, which the requirement "The
host limits the browsable space" states. Where the host names no bounds, the active bounds
are the `x`, `y` and `z` bounds in the model parameter file, clamped on every axis, which
is what the map did before.

#### Scenario: Clamp
- **WHEN** a unit test moves the cursor to (60,000, 0, 0)
- **THEN** the cursor's `x` equals the model's upper `x` bound

#### Scenario: A sphere bound clamps the cursor to its surface
- **WHEN** a unit test sets a sphere bound of radius 1,000 light years at the origin and
  moves the cursor to (3,000, 0, 0)
- **THEN** the cursor is (1,000, 0, 0)

### Requirement: Zoom with limits
Each wheel notch SHALL divide the **target distance** by 1.15 (toward the cursor for a
forward notch). The target SHALL be clamped to 10 light years and the **far zoom limit of
the active browsable bounds**, which the requirement "The host limits the browsable space"
states. Where the host names no bounds, that limit is **120,000** light years, which is
what the map did before. The camera SHALL reach the target under the glide rule below, and
the view's own distance SHALL therefore stay inside the same limits.

The notch SHALL divide the target the map already holds, and not the distance the camera
has reached. A held wheel that sends a notch in each frame would otherwise lose part of
each step to the camera's own lag, and the wheel would give less than 1.15 a notch.

The close limit is 10 light years because that is the edge of a mass-code `a` boxel, the
finest cell the game's own hierarchy holds, and because a marker's drawn size caps at 12
CSS pixels. Below 10 light years no marker grows, no line gains detail and no new source
of light appears, so a closer limit only spreads the same markers further apart.

#### Scenario: Zoom in
- **WHEN** a unit test reads the target for one forward notch at distance 20,000
- **THEN** the target is 17,391 within 1 light year

#### Scenario: Limits
- **WHEN** a unit test reads the target for 100 forward notches from 20,000 light years
  and for 100 backward notches from 20,000 light years
- **THEN** the first gives 10 and the second gives 120,000

#### Scenario: A bound lowers the far zoom limit
- **WHEN** a unit test sets a sphere bound of radius 2,000 light years and reads the
  target for 100 backward notches from 1,000 light years
- **THEN** the target is 4,000, which is twice the radius

#### Scenario: The close limit takes more notches than the old one
- **WHEN** a unit test takes forward notches from 120,000 light years one at a time, each
  from the target the one before gave, and counts how many it takes to reach the limit
- **THEN** the count is 68, which is 28 more than the 40 notches that reached 500 light
  years, so the wheel keeps its 1.15 step and the range alone is wider

#### Scenario: A held wheel keeps the 1.15 step
- **WHEN** a unit test sends five forward notches from 20,000 light years with one frame
  of the glide between each, and then lets the glide land
- **THEN** each notch gives a target of the one before divided by 1.15, and the camera
  lands on 9,943.53 within 0.01, which is `20000 / 1.15^5`

#### Scenario: A stored fragment still loads
- **WHEN** the page loads with `#c=0,0,0&d=2000&p=35&y=0`, a view written before the
  limit moved
- **THEN** the distance is 2,000, because the limit only widened the range

#### Scenario: A fragment below the old limit now loads
- **WHEN** the page loads with `#c=0,0,0&d=50&p=35&y=0`
- **THEN** the distance is 50, and with `d=1` it is 10

## ADDED Requirements

### Requirement: The host limits the browsable space

The map SHALL take a **browsable bounds** setting in one of three modes, and SHALL clamp
both the cursor and the far zoom limit to it. A host names it in the options as `bounds`
and changes it with `setBounds`. `getBounds` SHALL read back the setting as the host gave
it, and not the shape the map worked out from it.

**`unrestricted`** is the default and is what the map did before: the cursor clamps to the
model bounds on each axis and the far zoom limit is 120,000 light years.

**`auto`** takes the smallest axis-aligned box that holds every system of the set, grown
by a margin on every axis. The margin SHALL be `marginLy`, and **1,000** light years where
the host names none. The map SHALL keep the box as records arrive and SHALL NOT sweep the
set: `addSystems` widens it and `clearSystems`, `clearSystemsAndCategories` and a dataset
load reset it. With **no system in the set** the mode SHALL act as `unrestricted`, because
an empty box would pin the camera to a point.

**`sphere`** takes a `centre` in game coordinates and a `radiusLy`. A cursor outside the
sphere SHALL be moved to the nearest point on its surface, so a drag along the edge slides
rather than stops.

**The far zoom limit** SHALL be `min(120000, max(10, R / sin(30 degrees)))`, which is
`2 * R`, where `R` is the radius of the sphere, or half the diagonal of the box for
`auto`. At that distance the bound just fills the height of the frame, so the user can see
the whole of the space they may browse and no more. The floor of 10 light years holds the
limit at or above the close limit for a very small space.

**A change of the bounds SHALL re-clamp the view in the frame it happens**, so a host that
narrows the space while the camera is outside it does not leave the camera there. The view
change listeners SHALL be raised where the clamp moves the view.

A bounds setting the map cannot read SHALL leave the setting as it was. A `radiusLy` of 0
or less, a `centre` that is not three finite numbers, and a `marginLy` below 0 are all
unreadable.

The bounds SHALL NOT change what the map draws. A system, a shape or a region line outside
the bounds still draws where the frame holds it.

#### Scenario: Auto bounds follow the systems

- **WHEN** the browser test sets `auto` bounds with no margin named, adds systems spanning
  (-500, 0, -500) to (500, 0, 500), and moves the cursor to (5,000, 0, 0)
- **THEN** the cursor's `x` is 1,500, which is the box edge plus the 1,000 light year
  default margin

#### Scenario: Auto bounds widen as records arrive

- **WHEN** the browser test sets `auto` bounds, adds one system at the origin, reads the
  far zoom limit, adds a second system at (10,000, 0, 0) and reads it again
- **THEN** the second reading is larger than the first

#### Scenario: Auto bounds with an empty set do not restrict

- **WHEN** the browser test sets `auto` bounds with no system in the set and moves the
  cursor to (40,000, 0, 0)
- **THEN** the cursor is (40,000, 0, 0) and the far zoom limit is 120,000

#### Scenario: Clearing the systems resets auto bounds

- **WHEN** the browser test sets `auto` bounds, adds systems spanning 1,000 light years,
  calls `clearSystems` and moves the cursor to (40,000, 0, 0)
- **THEN** the cursor is (40,000, 0, 0)

#### Scenario: A sphere bound caps the zoom

- **WHEN** the browser test sets a sphere bound of radius 3,000 light years, sends 100
  backward wheel notches and reads the view
- **THEN** the distance is 6,000 light years

#### Scenario: Narrowing the bounds moves the camera in

- **WHEN** the browser test opens a view at (40,000, 0, 0) at a distance of 100,000 light
  years, then sets a sphere bound of radius 1,000 light years at the origin, and reads the
  view in the next frame
- **THEN** the cursor is on the sphere's surface, the distance is 2,000, and the view
  change listener fired

#### Scenario: An unreadable bound changes nothing

- **WHEN** the browser test sets a sphere bound of radius 3,000, then calls `setBounds`
  with a radius of 0, and reads `getBounds`
- **THEN** the reading is still the sphere of radius 3,000

#### Scenario: The bounds do not hide anything

- **WHEN** the browser test sets a sphere bound of radius 100 light years at the origin,
  adds a system at (5,000, 0, 0), opens a view that holds both on the screen and reads the
  marker count
- **THEN** the count holds the far system

### Requirement: The host turns individual inputs off

The map SHALL take an **interaction** setting that turns each input on or off on its own. A
host names it in the options as `interaction` and changes it with `setInteraction`, which
takes a partial setting and leaves the switches it does not name. `getInteraction` SHALL
read every switch back.

The switches SHALL be `zoom` (the wheel and the pinch), `orbit` (the left drag and the two
finger turn), `pan` (the right drag and the one finger drag), `keys` (the eight movement
keys) and `select` (the click and the tap that select a system). Each SHALL default to
**true**.

A switch that is off SHALL stop that input from changing the view or the selection. It
SHALL NOT stop the map from drawing, from reporting a hover, or from answering
`systemAt`. A host that wants a still picture turns every switch off and the map still
draws and still answers.

A switch that is off SHALL NOT stop the browser's own default action from being held off:
the canvas SHALL still refuse the context menu and SHALL still refuse to scroll the page
on a wheel, which the requirement "Input does not scroll or select the page" states. A
canvas that let the page scroll under a disabled wheel would be worse than one that zooms.

The switches SHALL take effect in the frame they change. A drag that is in progress when
its switch goes off SHALL stop moving the view.

A `setView`, a `setSelection` and a `flyTo` from the host SHALL work whatever the switches
say. The switches are for the **user's** input.

#### Scenario: The zoom switch stops the wheel

- **WHEN** the browser test turns `zoom` off, sends five wheel notches and reads the view
- **THEN** the distance is unchanged

#### Scenario: The orbit switch stops the left drag but not the click

- **WHEN** the browser test turns `orbit` off, presses the left button on a marker, moves
  40 pixels, and releases
- **THEN** the yaw and the pitch are unchanged, and no system is selected, because the
  press passed the 4 pixel limit and is not a click

#### Scenario: The select switch stops the click

- **WHEN** the browser test turns `select` off and clicks a marker
- **THEN** no system is selected, and the hover still reports that system

#### Scenario: Every switch off still draws and still answers

- **WHEN** the browser test turns all five switches off, adds a system, draws a frame and
  calls `systemAt` at the system's projection
- **THEN** the call names the system and the marker count is 1

#### Scenario: The host can still move the camera

- **WHEN** the browser test turns all five switches off and calls `setView` with a new
  distance
- **THEN** the view takes it

#### Scenario: The keys switch stops the movement keys

- **WHEN** the browser test turns `keys` off, holds `W` for 400 milliseconds and reads the
  view
- **THEN** the cursor is unchanged.

  A held key with the switch off is not movement, so the map does not read it as movement
  either: a key that cannot move the camera does not end a flight

#### Scenario: A switch takes effect during a drag

- **WHEN** the browser test presses the left button, moves 20 pixels, turns `orbit` off,
  moves 20 pixels more, and releases
- **THEN** the yaw changed by the first 20 pixels alone

#### Scenario: A disabled wheel does not scroll the page

- **WHEN** the browser test turns `zoom` off and sends a wheel event over the canvas
- **THEN** the page does not scroll
