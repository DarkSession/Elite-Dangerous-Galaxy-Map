## MODIFIED Requirements

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

## ADDED Requirements

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
