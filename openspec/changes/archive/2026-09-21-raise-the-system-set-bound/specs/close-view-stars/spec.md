## MODIFIED Requirements

### Requirement: A real system suppresses the invented stars near it

A decoration star SHALL NOT be drawn when it lies within 3 light years of a real system
in the set. The rule SHALL apply in the base size class only, which is the finest of the
classes the field draws.

The radius is about half the mean spacing of systems at Sol, which is 6.4 light years at
the measured 3.8 systems per 1,000 cubic light years. An invented star that close to a
real system stands for that same system, so the real record replaces it.

The base class block spans 8 base boxels on each axis, but it is not centred on the
camera. `buildBoxelBlocks` takes the base low from the four boxels the class above drops,
so the block runs from `2 * C - 4` to `2 * C + 3`, where `C` is the camera's index in the
class above. The camera's own base index is `2 * C` or `2 * C + 1`, so on the worse of
the two the block reaches 2 base edges past the camera. That is the bound the rule holds
to: 2 base edges, which is at least one sixteenth of the zoom distance while the base
class rule does not hit its clamp, and 320 light years above 5,120 light years of zoom
distance, where the base edge holds at 160.

A twin therefore survives outside the block. A boxel of the class above the base places
its stars at the same spacing while its count stays under the cap, so it is not true that
a coarser boxel always draws stars further apart. Near Sol at a zoom distance of 500
light years the base class is 1 and the class above places about 243 stars in a 40 light
year boxel, which is the same 6.4 light year spacing. A real system between 40 and 160
light years from the camera can then keep an invented star about 3 light years from it,
which the frame shows as a second point beside the marker.

The change accepts that. The rule covers the systems near the camera, where a host looks,
and suppression in every drawn class is a separate piece of work: it turns a sweep of 512
boxels into one of 1,856.

**Where the rule can show.** The close fade of the requirement "The star field and the
point cloud hand over without a change in light" holds the field at no light below a zoom
distance of 640 light years, so nothing is drawn there for the rule to remove. Above it
the base size class coarsens, and the spacing of the placed stars with it: 6.4 light years
in a 40 light year boxel, 12.6 in an 80 and 25.2 in a 160. A real system therefore removes
0.43 placed stars on average between 640 and 1,280 light years of zoom distance, 0.057
between 1,280 and 2,560, and 0.0071 above 2,560. The rule holds an invented star away from
a real one wherever the two sources draw together. It is not what empties the close view;
the close fade is.

The sweep SHALL run wherever the field builds its table, whatever the close fade is. The
two counts the page reports then do not depend on the zoom distance, and the field needs
no second rule for the frames in which it adds no light.

The suppressed set of a boxel SHALL depend on the boxel's grid index, its size class and
the real-system set alone. It SHALL NOT depend on the camera or on the zoom distance.

The field SHALL keep the suppressed sets of the boxels it drew in the last frame. It
SHALL compute a set only for a boxel it did not draw in the last frame, and it SHALL
drop every kept set when the real-system set changes.

A change of the base size class replaces the whole base class block, so one frame
computes every suppressed set of that block. That frame MAY exceed the frame budget. The
worst frame of a zoom that crosses a base class boundary SHALL stay under 50 ms, so the
change reads as one slow frame and not as a stall. A pan inside one base class brings in
at most 64 boxels per step, and its worst frame SHALL stay under 20 ms. Both bounds sit
above the 16.7 ms mean the frame budget holds, because each one covers the single frame
that pays for a new set of boxels, not the steady state.

Both bounds SHALL be read from `frameStats` on the handle's `debug` member, which reports
the frames the loop drew with their mean and worst time. The far view's `measureFrames`
redraws one fixed view and returns a mean, so it cannot measure either one.

The two numbers are not on one scale. `measureFrames` waits for the card before it stops
the clock, so its mean holds the GPU work; `frameStats` times the loop's own draw call,
because the frame budget requirement forbids a wait for the card in the normal loop. The
20 ms and the 50 ms bound the CPU work the sweep adds, which is what this rule is about.

The page SHALL expose the number of stars the last frame suppressed.

**The bound of the set moves under these two readings.** The index is built over the whole
set and is built again on a set version change, so it is linear in the record count. A zoom
that crosses a base class boundary was measured with 10,000 systems at a worst frame of
13 ms against the 50 ms bound on 2026-09-21. Five times the set fits that bound: the same
reading is 33.1 ms at the bound this change lands. Where the reading fails, the implementation SHALL make
the build cheaper, or SHALL build it in parts over frames, or the set bound SHALL land
lower. Neither bound SHALL be raised.

#### Scenario: A star inside the radius goes and one outside stays

- **WHEN** a unit test reads the stars of a 20 light year boxel, places one real system
  on the position of one of them, and reads the suppressed set; then moves the system to
  4 light years from that star and reads it again
- **THEN** the first reading holds that star, and the second reading is empty

#### Scenario: The suppressed set does not depend on the camera

- **WHEN** a unit test adds 200 systems around Sol and reads the suppressed set of one
  boxel from 20 camera positions that all draw that boxel in the base class
- **THEN** the 20 readings are equal

#### Scenario: Only the base class suppresses

- **WHEN** a unit test places one real system at the centre of a boxel of every drawn
  size class, at a view whose base class is 2, and reads the suppressed count of each
- **THEN** the boxel of class 2 suppresses at least one star and the boxels of classes
  3, 4 and 5 suppress none

#### Scenario: A camera move computes only the boxels the move brought in

- **WHEN** a unit test adds 50,000 systems spread evenly over the base class block,
  builds the suppressed sets of a drawn set, then moves the camera by one base boxel on
  one axis, builds again, and counts the boxels the second build computed a set for
- **THEN** the first build computes 512 base class boxels and the second computes at most
  64, which are the boxels the move brought in

#### Scenario: A camera move stays inside the frame budget

- **WHEN** the browser test adds 50,000 systems within 600 light years of the camera at
  `#c=0,0,0&d=1000&p=35&y=0`, resets `frameStats`, pans the camera 200 light years at a
  fixed zoom distance, and reads `frameStats`
- **THEN** the worst time is under 20 ms

  The view sits at 1,000 light years and not at 500, so the base class is 2 and a base
  boxel at Sol places 243 stars rather than 30. The sweep then tests eight times as many
  stars per boxel, which is the worse case for the bound.

  The systems stand around the camera and not around the cursor, for the reason the
  scenario "A frame reports the suppressed count" gives.

#### Scenario: A base class change costs one slow frame at most

- **WHEN** the browser test adds 50,000 systems within 600 light years of the camera,
  resets `frameStats`, zooms from 500 to 3,000 light years of zoom distance, which
  crosses the base class boundaries at 640, at 1,280 and at 2,560, and reads
  `frameStats`
- **THEN** the worst time is under 50 ms

  The zoom starts at 500 and not at 300, because the field reads the effective zoom
  distance, which holds at 640 light years below that. The boundary at 320 is inside the
  reachable range now that the zoom goes to 10, but the field does not cross it: the
  requirement "The star field and the point cloud hand over without a change in light" is
  what stops the base class from stepping there.

#### Scenario: A frame reports the suppressed count

- **WHEN** the browser test opens `#c=0,0,0&d=1000&p=35&y=0` with an empty set and reads
  the suppressed count, then adds 2,000 systems within 80 light years of the camera and
  reads it again
- **THEN** the first reading is 0 and the second is above 0

  The systems stand around the camera and not around the cursor. The base class block
  stands around the camera and reaches at most 2 base edges past it, which is 80 light
  years at this view, while the cursor is a whole zoom distance away. A system at the
  cursor therefore lies outside the base class block and suppresses nothing.
