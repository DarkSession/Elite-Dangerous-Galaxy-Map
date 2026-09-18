## MODIFIED Requirements

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

**`2 * R` is the exact value and not the value in doubles.** `sin(30 degrees)` reads
0.49999999999999994 in a double, so `R / sin(30 degrees)` lands a few parts in 10^16 above
`2 * R`: a radius of 1,000 gives 2000.0000000000002 and a radius of 3,000 gives
6000.000000000001. A test SHALL read the limit with a tolerance, or against a value it
worked out the same way. An exclusive bound on the round number fails on a value the limit
is meant to reach.

**A change of the bounds SHALL re-clamp the view in the frame it happens**, so a host that
narrows the space while the camera is outside it does not leave the camera there. The view
change listeners SHALL be raised where the clamp moves the view.

**A change of the bounds SHALL also end a running wheel zoom glide whose target is outside
the new far limit.** The glide holds a target the wheel clamped against the space of its
own moment, and it writes the distance with no clamp of its own, so a space that narrows
under it must drop it. The live distance is often still inside the new limit when the call
lands, so the re-clamp above does not catch this on its own.

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

#### Scenario: Narrowing the bounds drops a running zoom glide

- **WHEN** the browser test opens a view at 1,000 light years, sends ten backward wheel
  notches, lets one frame of the glide run, and then reads the live distance and the glide
  target and sets a sphere bound whose far zoom limit falls between the two, all in one
  task
- **THEN** the distance in that task is still the one the test read, because the re-clamp
  had nothing to do, the glide target reads null, and one second later the distance is
  still that one

  The bound is worked out from the two readings rather than fixed, so the re-clamp cannot
  be the rule that holds the camera. A test that fixed the bound would race the glide: on
  a run where the glide passed the new limit first, the clamp pulls the camera back and
  the reading says nothing about the target.

#### Scenario: An unreadable bound changes nothing

- **WHEN** the browser test sets a sphere bound of radius 3,000, then calls `setBounds`
  with a radius of 0, and reads `getBounds`
- **THEN** the reading is still the sphere of radius 3,000

#### Scenario: The bounds do not hide anything

- **WHEN** the browser test sets a sphere bound of radius 100 light years at the origin,
  adds a system at (5,000, 0, 0), opens a view that holds both on the screen and reads the
  marker count
- **THEN** the count holds the far system

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

**A change of the browsable bounds SHALL also end the glide** where the target falls
outside the new far limit, which the requirement "The host limits the browsable space"
states. That case is not like the three above: it writes no distance of its own. It drops
the target and leaves the camera where the glide had reached.

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
