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
**This requirement is a rule for a pointer that is not a touch pointer.** A touch pointer
follows the requirement "Touch gestures move, zoom and orbit the map", where one finger does
this job.

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
**This requirement is a rule for a pointer that is not a touch pointer.** A touch pointer
reports button 0, so without this sentence a finger would orbit. A touch pointer follows the
requirement "Touch gestures move, zoom and orbit the map", where one finger moves the cursor,
two fingers orbit, and a tap takes a move limit of 10 CSS pixels in place of the 4 below.

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
context menu. **Touch input SHALL NOT scroll, pan or zoom the page either**, which the map
holds by setting `touch-action: none` on the canvas, as the requirement "Touch gestures move,
zoom and orbit the map" states.

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

### Requirement: Touch gestures move, zoom and orbit the map

The map SHALL take three gestures from a touch screen. The map SHALL set
`touch-action: none` on the canvas element itself, as an inline style, when it attaches the
controls, and SHALL put back the value that was there when it disposes. The browser then
gives every touch to the map and scrolls, pans and zooms nothing of its own. The style is
inline and not a rule in a style sheet, because the host owns the canvas and may load a
reset sheet that sets `touch-action: auto`.

A pointer whose `pointerType` is `touch` SHALL follow the rules below. A pointer of any
other type SHALL follow the mouse rules this capability already states, which are
unchanged.

**One finger moves the cursor in the galactic plane.** The gesture SHALL be the rule the
right button already holds: the plane point under the finger at the start of the drag
SHALL stay under the finger, at the cursor's own height. One finger SHALL NOT orbit.

**Two fingers zoom and orbit together.** While two touch pointers are down:

- The **gap** is the distance in CSS pixels between the two pointers. The view's distance
  SHALL be `startDistance * startGap / gap`, where `startDistance` and `startGap` are the
  readings at the moment the gesture started. Fingers that move apart therefore zoom in.
  The distance SHALL be clamped to the 10 to 120,000 light year limits the requirement
  "Zoom with limits" states.
- The **middle** is the point half way between the two pointers. Its movement SHALL turn
  the camera by `ORBIT_DEGREES_PER_PIXEL`, which is 0.3 degrees a pixel, on both axes, by
  the rule "Camera orbits the cursor" states, with the same pitch clamp and yaw wrap.
- The distance SHALL be taken from the gap the gesture started with, and not from the gap
  of the frame before, so a pinch out and back leaves the distance where it began.

**A pinch does not glide.** A pinch SHALL write the distance in the event it arrives and
SHALL end a running wheel glide, as `setView` does. A pinch is the user's own hand on the
distance, so a filter between the hand and the camera would lag it.

**A tap selects.** One touch pointer that goes down and comes up within **10 CSS pixels**
of its first pixel and within `CLICK_HOLD_MS`, which is 400 milliseconds, SHALL select. A
tap that becomes a second finger SHALL NOT select. A pointer the browser cancels SHALL NOT
select either: it ends the gesture as a come-up does, but the user never lifted a finger.

The move limit is 10 CSS pixels and not the mouse's `CLICK_MOVE_CSS` of 4. A finger covers a
contact patch several millimetres wide and the browser reports its middle, which moves by
more than 4 CSS pixels in a tap the user means to hold still. A mouse does not move at all
unless the hand moves it. The hold limit is the same 400 milliseconds, because a slow tap is
slow for the same reason on both.

**More than two fingers act as two.** While three or more touch pointers are down, the
gesture SHALL read the **two that went down first** and SHALL ignore the rest. A pointer
that goes down third changes the count, so it restarts the gesture by the rule below, and the
two it restarts from are the two that are still the earliest. A palm or a resting finger
therefore does not stop the map, and no reading is taken from a pointer the user is not
gesturing with.

**The gesture rule SHALL be readable without a browser.** The rule that turns a reading of
a pointer into a change of the view SHALL be a pure function of the gesture's state and one
reading. A reading holds the pointer's id, its type, its position in CSS pixels and a time
in milliseconds. The DOM handlers SHALL do nothing but make that reading, call the rule and
apply what it returns. Every scenario below that names "a unit test" reads the rule alone.

**A change in the count of fingers restarts the gesture.** Where a finger goes down or
comes up, every gesture SHALL start again from the pointers that are down: the one-finger
drag reads its plane point again, and the two-finger gesture reads its gap and its middle
again. Without this a second finger landing, or one of two lifting, moves the view by the
whole difference between the old reading and the new one in one event, which reads as a
jump.

**The gestures raise the same hooks the mouse raises.** A touch that acts on the view
SHALL call the input hook, so a running selection flight ends and the gesture acts on the
view the flight had reached.

#### Scenario: One finger moves the cursor

- **WHEN** the browser test puts one finger on a pixel, moves it 200 pixels right and
  lifts it
- **THEN** the plane point that was under the first pixel projects to the release pixel
  within 1 pixel, and the yaw and the pitch are unchanged

#### Scenario: A pinch zooms

- **WHEN** a unit test starts a two-finger gesture with the pointers 200 CSS pixels apart
  at a distance of 20,000 light years, then moves them to 400 CSS pixels apart, and then
  to 100
- **THEN** the distance reads 10,000 light years after the first move and 40,000 after the
  second, each within 1 light year

#### Scenario: A pinch holds the zoom limits

- **WHEN** a unit test starts a two-finger gesture at a distance of **20 light years** with
  the pointers 200 CSS pixels apart and moves them to **800** apart, and then starts a second
  gesture at a distance of **60,000 light years** with the pointers 200 CSS pixels apart and
  moves them to **1** apart
- **THEN** the distance is 10 light years after the first move and 120,000 after the second.

  The rule gives 5 light years for the first move and 12,000,000 for the second, so each
  reading is the clamp and not the rule. The two gestures start at different distances
  because one gesture cannot reach both clamps: from 20,000 light years the near clamp needs
  a gap of 400,000 CSS pixels, which no screen holds

#### Scenario: Two fingers turn the camera

- **WHEN** the browser test puts two fingers on the canvas from the default view and moves
  both by 60 pixels right and 30 pixels down, holding their gap
- **THEN** yaw is 18 degrees, pitch is 44 degrees, the distance is 60,000 light years
  within 1, and the cursor is still at Sol

#### Scenario: A pinch ends the wheel glide

- **WHEN** the browser test sends one forward wheel notch at 20,000 light years, draws one
  frame of the glide, then starts a two-finger gesture and moves the pointers from 200 to
  400 CSS pixels apart
- **THEN** the zoom target reads null and the distance is the distance the glide had
  reached divided by 2, within 1 light year.

  This is a browser test and not a unit test because the glide runs on the attached
  controls, and the reading is of the view the map holds

#### Scenario: A tap selects and a drag does not

- **WHEN** the browser test adds one system, taps its marker, reads the selection, clears
  it, then puts a finger on the marker, moves it 40 pixels and lifts it, and reads the
  selection again
- **THEN** the first reading names the system and the second is null

#### Scenario: A cancelled touch does not select

- **WHEN** the browser test puts one finger on a system marker and the browser cancels the
  pointer inside the tap limits, rather than lifting it
- **THEN** no system is selected, and the map holds the selection it had

#### Scenario: A second finger does not move the view

- **WHEN** a unit test drives the gesture rule with one finger over 50 CSS pixels, then with
  a second finger going down 200 CSS pixels away, with no further movement
- **THEN** the reading of the second finger going down asks for no change of the view, and
  the state it returns carries the gap and the middle of the two fingers that are down

#### Scenario: Lifting one of two fingers does not move the view

- **WHEN** a unit test drives the gesture rule through a two-finger gesture, moves the
  pointers to change the distance, then lifts one finger with no further movement
- **THEN** the reading of the finger going up asks for no change of the view, and the state
  it returns is a one-finger drag that asks for its plane point again

#### Scenario: A third finger does not change the gesture

- **WHEN** a unit test drives the gesture rule through a two-finger gesture, puts a third
  finger down 300 CSS pixels away, and then moves the first two fingers to double their gap
- **THEN** the reading of the third finger going down asks for no change of the view, and the
  distance after the move is half the distance the view held at the moment the third finger
  went down

#### Scenario: A gesture ends a running selection flight

- **WHEN** the browser test adds one system, selects it so the flight starts, and puts one
  finger down and moves it 50 CSS pixels while the flight runs
- **THEN** the flight ends, and the cursor is the plane point the drag asks for from the view
  the flight had reached and not from the view it was flying to

#### Scenario: The canvas takes the touches

- **WHEN** the browser test reads the computed `touch-action` of the map's canvas in a page
  whose own style sheet states no `touch-action` for it, and reads it again after the map is
  disposed
- **THEN** the first reading is `none` and the second is `auto`, which is the value the page
  gave the canvas before the map took it

### Requirement: The cursor carries a marker on its own plane

The map SHALL draw a marker at the cursor, as a plane-overlay element on the plane of
constant `y` the cursor sits on. The marker SHALL be an element in the overlay the library
owns for the region labels, not a pass on the canvas, so it stays a crisp vector at every
device pixel ratio and needs no shader. The capability `plane-overlay` states the transform
and the culling.

Nothing on the screen says where the cursor is. The cursor is the point the camera orbits,
the point the zoom moves toward and the plane the grid draws on, and it may sit anywhere in
the model bounds, which reach 40,985 light years in `y`. A user who takes the cursor far off
the galactic disc sees an empty frame and cannot tell why, or where to go back to.

**The marker lies on the plane and does not face the screen.** It is a mark on the map at a
place of the map, so it SHALL take the perspective of the plane it sits on: a circle on the
plane reads as an ellipse on the screen, squashed by the pitch, and the arrows lean with it.
A mark that faced the screen would say where the cursor projects and not where it is.

**The shape.** In a box **160 by 160** units, with the origin at the top left and the centre
at (80, 80):

- a **ring**, centred on the box, of outer radius **48** and stroke **4**, so its inner
  radius is 44;
- **four arrows**, each the outline through (80, 5), (93, 16), (90, 16), (90, 24),
  (70, 24), (70, 16) and (67, 16), closed back to the tip. That arrow points toward
  **negative `z`** in the game frame. The other three SHALL be the same outline turned about
  the centre of the box by 90, 180 and 270 degrees, so one points along each of the game
  `x` and `z` axes.

The arrow's tip therefore sits 75 units from the centre and its base 56, which clears the
ring's outer radius of 48 by 8 units. The arrows say which way the cursor moves, and the
ring says where it is.

**The look.** The fill of both the ring and the arrows SHALL be **`#3EF8FB`**, the same cyan
family the coordinate grid draws in. The marker carries no outline: by the Rec.709 weights
the map uses everywhere its luminance is **0.818**, above every part of the frame but the
core itself.

**The size.** The box SHALL be square on the plane, and its side SHALL be the light years
that **96 CSS pixels** cover along the screen's horizontal at the cursor. The ring is
therefore about 58 CSS pixels across and the arrow tips about 90 CSS pixels apart at every
zoom, so the marker holds its size on the screen while the map moves under it.

The size is read on the screen and not fixed in light years because the marker is a control
and not a place: a fixed size in light years would fill the frame at a close zoom and vanish
at a wide one.

**When it draws.** The marker SHALL draw in every frame the map draws, and SHALL be dropped
only by the rules `plane-overlay` states, which is a cursor behind the near plane or off the
frame.

**The switch SHALL be on the supported surface and not on `debug`.** `GalaxyMapOptions` SHALL
carry an optional `cursorMarker`, and the handle SHALL carry `setCursorMarkerVisible(on)` and
`getCursorMarkerVisible()`. The default SHALL be **on**. The grid is the precedent: it holds
a `grid` option and `setGridVisible`, and its pass switch on `debug` is a probe for the
browser tests and not the way a host turns it off. A host that draws its own cursor needs a
supported way to turn this one off, and `debug` is stated as no part of the supported
surface.

**The marker draws under the upright overlay elements.** A selection pin, a hover ring, a
marker name label or a region label at the same place SHALL draw over it, because each of
those names one thing and the cursor names a place.

#### Scenario: The marker sits at the cursor

- **WHEN** the browser test opens a view at a pitch of 45 degrees, draws a frame, and
  compares the centre of the marker's ring on the screen with the projection of the cursor
- **THEN** the two agree within **1** CSS pixel

#### Scenario: The marker lies on the plane

- **WHEN** the browser test reads the ring's screen bounding box at a pitch of **30
  degrees** and at a pitch of **89 degrees**
- **THEN** at 89 degrees the box's height is within 5 per cent of its width, and at 30
  degrees the height is between **0.40** and **0.60** of the width, so the ring is squashed
  by the pitch

#### Scenario: The marker holds its size on the screen

- **WHEN** the browser test reads the width of the ring's screen bounding box at a pitch of
  89 degrees at zooms of 100, 1,000 and 10,000 light years
- **THEN** each reading is **58** CSS pixels within 3, so the marker does not follow the
  zoom

#### Scenario: The marker follows the cursor off the plane

- **WHEN** the browser test opens
  `#c=1840.85884,-15539.75557,16507.94703&d=20016.72348&p=58.57998&y=24.66002`, where the
  cursor sits 15,540 light years below the galactic plane, draws a frame and reads the
  marker
- **THEN** the marker is in the overlay, and its ring's centre is within 1 CSS pixel of the
  projection of the cursor. Before this requirement nothing in that frame said where the
  cursor was

#### Scenario: The switch removes the marker

- **WHEN** the browser test reads the overlay for the marker, calls
  `setCursorMarkerVisible(false)`, draws a frame and reads again, then calls it with true and
  reads once more
- **THEN** the readings hold one marker, none, and one

#### Scenario: The option chooses the marker at start-up

- **WHEN** the browser test builds a map with `cursorMarker: false`, reads
  `getCursorMarkerVisible()` and the overlay, then builds one with no `cursorMarker` and
  reads both again
- **THEN** the first gives false and no marker, and the second gives true and one marker

#### Scenario: The marker carries four arrows and one ring

- **WHEN** the browser test reads the marker's own contents
- **THEN** it holds one ring and four arrows, each arrow's fill is `#3EF8FB`, and the four
  arrows point along the game `x` and `z` axes, one each way

#### Scenario: A selection pin draws over the marker

- **WHEN** the browser test selects a system at the cursor and reads the stacking of the pin
  and the marker in the overlay
- **THEN** the pin draws over the marker
