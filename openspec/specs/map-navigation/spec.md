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
be `#c=<x>,<y>,<z>&d=<distance>&p=<pitch>&y=<yaw>&g=<grid>` with numbers in light years and
degrees.

**The `g` field** SHALL carry the coordinate grid switch: `g=1` for on and `g=0` for off.
The field SHALL be optional in both directions. A fragment that names no readable `g` SHALL
leave the switch at the page's own default, which `coordinate-grid` holds is off for a map
built with no `grid` option and on for the demo site. The page SHALL write the field only
when it has a switch to write, so a page that does not use the grid still writes the four
view fields alone and no reader of the old format breaks.

The page SHALL write the field when the switch moves, whatever moved it: the HUD's
coordinate grid switch, or a call on the handle. The grid switch is not view state, so the
page SHALL read it from the handle's grid change notification, which `real-systems` states.
The write SHALL share the 500 ms limit the view fields hold, so one scheduled write carries
the view and the switch together.

A fragment that arrives after load, which the page already reads for the view, SHALL move
the switch as well when it names a readable `g`, and SHALL leave the switch alone when it
does not.

#### Scenario: Load from fragment
- **WHEN** the page loads with `#c=-9530,-910,19808&d=8000&p=50&y=120`
- **THEN** the view has that cursor, distance, pitch and yaw

#### Scenario: Write to fragment
- **WHEN** the user zooms to a distance of 30,000 light years
- **THEN** within 1 second the fragment contains `d=30000`

#### Scenario: Load the grid from the fragment
- **WHEN** the browser test opens the demo site with `g=0` in the fragment and reads the
  grid switch, and opens it again with `g=1` and reads the switch
- **THEN** the first reading is off and the second is on

#### Scenario: Write the grid to the fragment
- **WHEN** the browser test opens the demo site, turns the coordinate grid switch off in
  the HUD's options panel and waits 1 second, then turns it on and waits again
- **THEN** the fragment holds `g=0` after the first wait and `g=1` after the second

#### Scenario: A fragment with no grid field leaves the switch
- **WHEN** a unit test reads the grid field of `c=0,0,0&d=8000&p=50&y=0`, of the same
  fragment with `g=x`, and of the same fragment with `g=0`
- **THEN** the first two readings say the fragment names no switch, and the third says off

#### Scenario: A later fragment moves the switch
- **WHEN** the browser test opens the demo site with the grid on, then puts
  `#c=0,0,0&d=8000&p=50&y=0&g=0` in the address bar, and last puts the same fragment with
  no `g` and a different distance
- **THEN** the grid goes off at the first change, and stays off at the second

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
Each wheel notch SHALL divide the **target distance** by 1.15 (toward the cursor for a
forward notch). The target SHALL be clamped to 10 to 120,000 light years. The camera
SHALL reach the target under the glide rule below, and the view's own distance SHALL
therefore stay inside the same limits.

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

### Requirement: The wheel zoom glides to its target

A wheel notch SHALL NOT write the view's distance in the frame it arrives. The map SHALL
hold the target the notch gave and SHALL move the camera toward it in each frame it draws,
until the camera reaches it.

**The step is taken in log distance.** Let `gap` be `ln(target) - ln(distance)` and let
`seconds` be the time the frame covers. In each frame:

- `fall` SHALL be `1 - 0.5^(seconds * 1000 / 50)`, so the gap falls by half every **50
  milliseconds**.
- `least` SHALL be `2 * ln(1.15) * seconds`, so the camera always moves by at least **two
  wheel notches a second**.
- The step SHALL be `max(abs(gap) * fall, least)`.
- Where the step is `abs(gap)` or more, the camera SHALL take the target exactly and the
  glide SHALL end. Otherwise the distance SHALL be multiplied by `exp(step)` toward the
  target.

The zoom therefore moves by a constant factor for each unit of time, which is the rule
`system-selection` already holds for the selection flight. A zoom that moved by a constant
number of light years would spend most of the move in the far part, where a light year
covers no pixels.

**`least` is what makes the glide land.** The halving alone never reaches the target, so
the distance would creep for as long as the map drew, the URL fragment would never carry a
round number, and a test could not wait for the camera to settle.

**There SHALL be no cap on the step.** The target is what the user's own wheel asked for,
so a larger gap is a larger move they asked for.

**The glide is a function of elapsed time and not of a count of frames.** Both terms read
`seconds`, so a slow frame carries the move a slow frame's worth. One forward notch from
20,000 light years lands on 17,391.30 after **217 milliseconds** at 60 frames a second,
after 233 at 30 and after 215 at 144.

**217 milliseconds is the speed of a region label.** `galactic-regions` records that a
label pushed 128 CSS pixels from the middle of its region "is within 8 CSS pixels of that
middle at frame 13, which is 217 milliseconds". The zoom lands on its target in the same
time, so the two moves on the screen read as one speed.

The full sweep from 120,000 to 10 light years, which is 68 notches, SHALL land in **517
milliseconds** at 60 frames a second. The sweep is 68 times the move of one notch and
takes under 2.4 times its time, because the halving carries a large gap quickly and only
the last part of any move runs at `least`.

**The picture moves less in one frame.** At 60 frames a second the first frame of a single
backward notch raises the distance by **2.93 percent** and of a forward notch lowers it by
**2.84 percent**, against the 15 and 13.04 percent the wheel wrote in one frame before this
change.

**Reduced motion.** Where the browser reports `prefers-reduced-motion: reduce`, a notch
SHALL write the distance in the frame it arrives and no glide SHALL run. This is the rule
`system-selection` already holds for the selection flight.

**Only the wheel glides.** A call to `setView`, a view read from the URL fragment and a
running selection flight each write the distance themselves. Each SHALL end the glide and
SHALL keep its own value, so a deep link, a host's call and a flight all land where they
say and not where a stale target says.

**A notch during a flight** SHALL end the flight, which `system-selection` states, and
SHALL take its target from the distance the flight had reached. `system-selection`'s scenario
"A wheel notch ends the flight" reads the view at the notch and again after 500 ms, and its
text fits both the old behaviour and this one. The browser test behind it carries the
reading that tells them apart: the second reading is the reading at the notch divided by
1.15, which holds only where the target came from the distance the flight had reached. No
scenario here repeats it.

**The listeners.** The wheel event SHALL NOT raise the view change listeners on its own,
because it moves nothing. Each frame that moves the distance SHALL raise them, as any
other view change does. The page's fragment writer already holds its own write rate, so a
glide writes the fragment once or twice and not once a frame.

`debug` SHALL carry `zoomTargetLy()`, which is the target in light years while a glide
runs and null when none runs. A browser test uses it to wait for the camera to settle
instead of waiting a fixed time.

#### Scenario: A notch moves nothing in its own frame

- **WHEN** the browser test opens a view at 20,000 light years, sends one forward wheel
  notch to the canvas and reads the view and `debug.zoomTargetLy()` in the same task, with
  no frame between
- **THEN** the distance is still 20,000 and the target is 17,391.30 within 0.01

#### Scenario: The glide lands on the target

- **WHEN** the browser test opens a view at 20,000 light years, sends one forward wheel
  notch, waits 500 ms, and reads the view and `debug.zoomTargetLy()`
- **THEN** the distance is 17,391.30 within 0.01 and the target reads null

#### Scenario: One notch lands in 217 milliseconds

- **WHEN** a unit test steps the glide from 20,000 light years toward a target of
  17,391.30, one step of 1/60 of a second at a time
- **THEN** step 12 gives 17,450.12 within 0.01, step 13 gives the target exactly, and 13
  steps of 1/60 of a second are 217 milliseconds

#### Scenario: The glide reads the time and not the frame count

- **WHEN** a unit test steps the same glide at 1/30 of a second and at 1/144 of a second
  a step
- **THEN** the first lands after 7 steps, which is 233 milliseconds, and the second after
  31 steps, which is 215 milliseconds, and both are within 20 milliseconds of the 217 the
  60 frame run gives

#### Scenario: The gap halves every 50 milliseconds

- **WHEN** a unit test takes one step of 50 milliseconds from 20,000 light years toward a
  target of 17,391.30
- **THEN** the distance is 18,650.10 within 0.01, which is `sqrt(20000 * 17391.30)`, the
  middle of the move in log distance

#### Scenario: The whole sweep lands in half a second

- **WHEN** a unit test steps the glide from 120,000 light years toward a target of 10, at
  1/60 of a second a step
- **THEN** it reaches 10 exactly after 31 steps, which is 517 milliseconds

#### Scenario: One frame of a notch moves the picture by under 3 percent

- **WHEN** a unit test takes one step of 1/60 of a second from 20,000 light years toward
  the target of one forward notch, and one step from 20,000 toward the target of one
  backward notch
- **THEN** the first lowers the distance by 2.84 percent and the second raises it by 2.93
  percent, and neither passes 3 percent

#### Scenario: Reduced motion takes the notch at once

- **WHEN** the browser test opens a view at 20,000 light years with
  `prefers-reduced-motion: reduce`, sends one forward wheel notch, and reads the view and
  `debug.zoomTargetLy()` in the same task
- **THEN** the distance is already 17,391.30 within 0.01 and the target reads null

#### Scenario: A host that writes the view ends the glide

- **WHEN** the browser test opens a view at 20,000 light years, sends one forward wheel
  notch, calls `setView` with a distance of 8,000 in the next frame, then waits 500 ms and
  reads the view
- **THEN** the distance is 8,000 and not 17,391.30

#### Scenario: The wheel event raises no view change listener

- **WHEN** the browser test opens a view at 20,000 light years, adds an `onViewChange`
  listener that counts its calls, sends one forward wheel notch and reads the count in the
  same task, then waits 500 ms and reads it, then waits 500 ms more and reads it again
- **THEN** the first reading is 0, the second is more than 5, and the third equals the
  second, because the glide raised the listeners while it moved and nothing raises them
  after it landed

#### Scenario: The glide writes the landed distance to the fragment

- **WHEN** the browser test opens a view at 34,500 light years and sends one forward wheel
  notch
- **THEN** within 1 second the fragment holds `d=30000` exactly, because the glide landed
  on 30,000 before the first write the 500 ms limit allowed

  The requirement "View state in the URL fragment" already holds the scenario "Write to
  fragment", which pins the write rate. This scenario pins the landing. The write that
  carries the landing is the second one after the notch, about 517 ms after it, because the
  fragment writer sends at once when its last write is more than 500 ms old and then holds
  the next one back. Without `least` the camera would still be about 3 light years short at
  that write, and the fragment would hold a `d` near 30003 and not `d=30000`

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
