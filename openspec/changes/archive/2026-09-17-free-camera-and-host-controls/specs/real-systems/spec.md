## MODIFIED Requirements

### Requirement: A category limits the range its markers draw at

A category SHALL carry a `maxDrawRange` in light years. A marker SHALL draw only while
the distance from the **cursor** to **its own system** is at or below that range, and SHALL
draw nothing above it. The range is the cursor-to-system distance, and it is neither the
camera-to-system distance nor the zoom distance, so one frame can hold the near markers of
a category and drop its far ones.

**The range was measured from the camera.** An orbit moves the camera and leaves the
cursor where it is, so a marker at the edge of a category's range appeared and vanished
although the user asked for nothing but a turn. The cursor is the point the user aims at
and the point the map centres, so "within 1,000 light years" now means within 1,000 light
years of the place the user is looking at. The reading no longer follows the zoom either:
pulling back does not drop a marker.

A category that names no `maxDrawRange` SHALL take **120,000** light years.

**The default now cuts nothing at the default view.** The cursor is held inside the model
bounds, and no point of the model is more than the bounds diagonal of 163,430 light years
from another, so a host that wants no cut at all sets `maxDrawRange` to `163,500`, which is
above that diagonal. The default stays 120,000. At the default view the cursor is at Sol
and the furthest star of the disk is about 73,000 light years from it, well inside the
120,000 default, so every marker of the set draws. Under the old camera rule the same view
cut a band of the outer disk. A host that wants a cut in a far view sets a smaller
`maxDrawRange` on its categories.

The cut SHALL NOT change the colour, the size or the style of a marker that draws, and
SHALL NOT fade a marker as it nears the range: a marker draws in full or not at all. A
fade would make a category look dimmer with depth, which is what the category colour is
there to avoid.

**Every reader of "does this marker draw" SHALL use the cursor range.** The rule is written
out four times in the tree: the vertex shader cut, the CPU count loop beside it that reports
the drawn count, the pick, and the overlay that places the hover ring, the selection pin and
the marker name labels. All four SHALL gate on the cursor range, so a marker the frame draws
is a marker the page counts and the user can pick, hover, pin and name. One of the four left
on the camera range makes a drawn marker refuse a click, or makes the reported count
disagree with the pixels.

**The drawn size still follows the camera.** The disc diameter is a curve of the
camera-to-system range, which the requirement "A marker draws for every system at every
zoom distance" states, and this rule does not touch it. Perspective is a fact about the
eye: a marker that held one size while the camera moved would stop reading as near or far.

The count the page reports SHALL be the number of markers the frame drew, so a view that
cuts markers reports fewer than the set holds.

#### Scenario: The default range is 120,000

- **WHEN** a unit test adds one category with no `maxDrawRange` and reads the range the
  table holds
- **THEN** it is 120,000

#### Scenario: A marker outside its range does not draw

- **WHEN** the browser test adds one category with `maxDrawRange` 2,000, adds one system
  at Sol, opens a view whose cursor is 1,500 light years from Sol and reads the pixel at
  the system's projection, then opens a view whose cursor is 2,500 light years from Sol
  and reads it again
- **THEN** the first pixel differs from the frame drawn with the pass off and the second
  is the same as it

#### Scenario: The range follows each system and not the zoom

- **WHEN** the browser test adds one category with `maxDrawRange` 3,000 and two systems of
  it, one 1,000 light years from the cursor and one 5,000, in one frame, and reads the
  pixel at each projection
- **THEN** the near marker draws and the far one does not, and the reported marker count
  is 1

#### Scenario: An orbit does not change what draws

- **WHEN** the browser test adds one category with `maxDrawRange` 2,000 and 200 systems
  spread from 500 to 5,000 light years from the cursor, reads the marker count, orbits the
  camera by 120 degrees of yaw and 40 degrees of pitch, and reads the count again
- **THEN** the two counts are equal

#### Scenario: A zoom does not change what draws

- **WHEN** the browser test adds one category with `maxDrawRange` 2,000 and 200 systems
  spread from 500 to 5,000 light years from the cursor, reads the marker count at a
  distance of 100 light years, zooms to 20,000 light years and reads the count again
- **THEN** the two counts are equal

#### Scenario: The default view draws every marker

- **WHEN** the browser test adds 1,000 systems spread across the disk in a category with
  no `maxDrawRange`, opens the default view and reads the marker count
- **THEN** the count is 1,000

#### Scenario: Two categories cut at their own ranges in one frame

- **WHEN** the browser test adds a category with `maxDrawRange` 1,000 and one with
  120,000, adds one system of each 2,000 light years from the cursor, and reads the pixel
  at each projection
- **THEN** the first system's marker does not draw and the second's does

#### Scenario: The cut does not fade

- **WHEN** the browser test adds one category with `maxDrawRange` 5,000 and one system,
  and reads the middle pixel of its marker at cursor ranges of 1,000, 3,000 and 4,900
  light years, each at a view that puts the marker at the same place on the screen
- **THEN** the three readings hold the same colour within 2 per channel

#### Scenario: A changed range changes what draws

- **WHEN** the browser test adds one category with `maxDrawRange` 1,000 and 100 systems
  spread from 500 to 5,000 light years from the cursor, reads the marker count, then adds
  a category of the same name with `maxDrawRange` 120,000 and reads the count again
- **THEN** the first count is below 100 and the second is 100

#### Scenario: The cull holds the frame budget with a full set

- **WHEN** the browser test adds 10,000 systems, resets the frame statistics, draws 60
  frames at 1920x1080 at the default view, where the new rule cuts nothing, and reads the
  statistics
- **THEN** the mean frame time holds the bound the requirement "Frame budget with a full
  set" already states
