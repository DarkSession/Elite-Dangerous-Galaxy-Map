## ADDED Requirements

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

## MODIFIED Requirements

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

### Requirement: Input does not scroll or select the page
Wheel and drag input on the canvas SHALL NOT scroll the page, select text or open the
context menu. **Touch input SHALL NOT scroll, pan or zoom the page either**, which the map
holds by setting `touch-action: none` on the canvas, as the requirement "Touch gestures move,
zoom and orbit the map" states.

#### Scenario: Right drag
- **WHEN** the browser test right-drags on the canvas
- **THEN** no context menu event reaches the document's default handler
