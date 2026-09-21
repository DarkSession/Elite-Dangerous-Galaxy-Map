## MODIFIED Requirements

### Requirement: The pick finds the nearest marker under a pixel

The handle SHALL carry `systemAt(x, y)`, which takes a pixel in canvas CSS coordinates
and returns the system under it or null.

A system SHALL be a candidate when all of these hold:

1. Its marker draws in the current frame. That means one of its categories is on **or it
   names none**, the name filter keeps it, and the **cursor** is inside the `maxDrawRange`
   of the category it draws in, which `real-systems` states. A system that names no
   category draws in the library default, so its range is the default draw range.
2. It lies in front of the near plane, so a system behind the camera is never picked.
3. The distance from the pixel to its projected centre is at or below the **pick radius**.

The pick radius SHALL be `markerCssSize / 2 + 4` CSS pixels, where `markerCssSize` is the
disc diameter of `real-systems`, which runs from 7 to 16. The radius therefore runs from
7.5 to 12 CSS pixels. The radius SHALL read the **disc** diameter for both marker styles,
so a `glow` and a `disc` of the same range are equally easy to hit. A glow's sprite is 2.5
times the disc, and a pick radius that followed the sprite would make a glow a target 2.5
times as wide for no reason the user can see.

**Two ranges, and they are not the same range.** The draw gate reads the **cursor**-to-system
distance, and the disc diameter, and so the pick radius, read the **camera**-to-system
distance. `real-systems` states both. The pick and the marker pass read one rule for each,
so a pixel that looks like a hit is a hit at every viewport height and at every camera
position.

**Everything that follows a drawn marker SHALL read the same gate.** The pick, the hover
ring, the selection pin, the marker name labels and the drawn count the page reports all
follow a marker the pass draws. The rule is written out four times: the vertex shader cut,
the CPU count loop beside it, the pick, and the overlay. All four SHALL gate on the cursor
range. A marker the user can see and cannot click is the fault this rule exists to stop.

The candidate with the smallest distance to the pixel SHALL win. When two candidates are
within 1e-6 CSS pixels of each other, the one nearer the camera SHALL win. When those are
equal as well, the one added to the set first SHALL win. The rule is total, so the same
frame and the same pixel always give the same system.

`systemAt` SHALL sweep the set once and SHALL allocate nothing per system. The set holds
at most 50,000 systems, so one call reads at most 50,000 positions. No identity buffer is
read back from the card, because a read back would stall the frame and the sweep does not.

**The sweep SHALL reject a system before it projects it.** The marker flag and the
category's `maxDrawRange` against the distance to the cursor are both read before the matrix
is applied today, and they SHALL stay before it. A system the gate rejects SHALL cost a flag
read and a squared range test, and no projection. The sweep is linear in the set either way:
the gate takes the projection out of the inner loop, not the loop.

**The cost of the call SHALL be read at two set sizes before it is made cheaper.**
`systemAt` cost **0.477 ms** over a set of 10,000 on 2026-09-21, against this 1 ms bound.
That is one reading of a whole call, and a whole call holds a fixed part — the camera, the
matrix and the handle hop — as well as the part that follows the set. The implementation
SHALL read the call at two set sizes, SHALL state the fixed part and the part per system,
and SHALL make cheaper whichever one the reading names. A remedy chosen from one point is a
remedy chosen from a guess.

**The reading that fails is the accept path.** The scenario below puts every system inside
its category range, so the gate rejects nothing and every system is projected and divided.
A cheaper reject path does not touch that reading. Where the per-system part governs, the
implementation SHALL look at the accept path first: the range square root that runs before
the gate, the category lookup per system, and the two divides per system that a clip-space
reject could come before.

Neither the rule that decides the winner nor the rule that gates a marker changes here.

#### Scenario: The pick returns the system under the pixel

- **WHEN** the browser test adds one category and three systems 200 light years apart at a
  view that shows them all, draws a frame, and calls `systemAt` at the projected centre of
  each
- **THEN** each call names the system at that pixel

#### Scenario: The pick radius holds at the floor and the cap

- **WHEN** the browser test puts one system at a range where its disc is at the floor of 7
  CSS pixels and calls `systemAt` at 7 and at 8 CSS pixels from its centre, then puts it at
  a range where its disc is at the cap of 16 and calls at 12 and at 13 CSS pixels from its
  centre
- **THEN** the first call names the system and the second is null, and the third names it
  and the fourth is null

#### Scenario: The pick radius does not follow the viewport

- **WHEN** the browser test puts one system 4,000 light years from the camera at 1,080 CSS
  rows, finds the largest whole pixel offset at which `systemAt` still names it, then sets
  the viewport to 400 CSS rows and finds it again
- **THEN** the two offsets are the same

#### Scenario: The nearer of two overlapping markers wins

- **WHEN** the browser test adds two systems that project to the same pixel within 1 CSS
  pixel, one 400 light years from the camera and one 900, and calls `systemAt` at that
  pixel
- **THEN** the call names the nearer system

#### Scenario: A system behind the camera is not picked

- **WHEN** the browser test adds one system, opens a view that looks away from it, draws a
  frame, and calls `systemAt` at every corner and at the centre of the canvas
- **THEN** every call is null

#### Scenario: The pick holds its time bound at a full set

- **WHEN** the browser test adds 50,000 systems inside the frame, draws a frame, and times
  200 calls to `systemAt`
- **THEN** the mean call takes 1 ms or less

#### Scenario: The pick holds its time bound with the set out of range

- **WHEN** the browser test adds 50,000 systems of one category whose `maxDrawRange` is
  100 light years, puts the cursor 5,000 light years away from all of them, draws a frame
  and times 200 calls to `systemAt`
- **THEN** the mean call takes 1 ms or less and every call is null, so the range test runs
  before the projection and not after it

#### Scenario: A drawn marker is pickable however far the camera stands off

- **WHEN** the browser test adds one category with `maxDrawRange` 2,000 and one system
  1,500 light years from the cursor, zooms out to a camera distance of 20,000 light
  years, draws a frame, and calls `systemAt` at the system's projection
- **THEN** the marker draws, the reported marker count is 1, and the call names the system

#### Scenario: The ring, the pin and the name follow the same gate

- **WHEN** the browser test adds one category with `maxDrawRange` 2,000 and one system
  1,500 light years from the cursor, turns the names on, selects the system, zooms out to
  a camera distance of 20,000 light years, moves the pointer onto the marker's projection,
  draws a frame and reads the pin, the hover ring and the name label
- **THEN** all three are present. The pointer move is needed because the ring follows the
  hover and not the selection

### Requirement: Selection holds the frame budget

The hover pick, the pin, the ring and the name label placement together SHALL add at most
**2 ms** to the mean frame with a set of 50,000 systems, the name switch on, the icon
switch on, every record carrying 4 icons, and the pointer over the canvas, at 1920x1080 on
the project's test card.

The budget is unchanged at 2 ms, and the set it is read at is now five times the size.
**The budget SHALL NOT be raised to hold the larger set.** Where a reading fails, the
implementation SHALL make the work cheaper, or SHALL lower the set bound, and the
requirement "The set holds up to 50,000 systems" states which.

**The icon stack placement has left this reading.** The
stacks draw on the canvas, so the pass selects and places them inside `render`, which
`system-icons` states. `frameStats` times `render` alone, so that work now falls inside the
draw-time budget of `far-view-rendering`, and `system-icons` carries the requirement that
holds it there. This reading therefore covers the overlay work alone, and it SHALL NOT be
raised to make room for work that left it.

The page SHALL expose the mean and the worst time of that work since the last reset, as
`labelSampling` already does for the region label sweep. The work runs in the frame loop
around the draw call, so `frameStats` does not see it: `frameStats` times `render` alone,
which the `real-systems` spec already states. A budget read from `frameStats` would
therefore pass whatever this work cost, and it is not the instrument for it.

The page SHALL also expose the mean and the worst interval between animation frames since
the last reset. That reading covers everything the browser does per frame, the draw, this
work and the paint of the overlay elements together, and it is what shows a dropped frame.
With the set, the switches, the icons and the pointer above, at 1920x1080, the mean
interval SHALL stay at or below **18 ms**. A display at 60 Hz gives 16.7 ms when the page
keeps up and about 33.3 ms when it misses a frame, so 18 ms is the reading that separates
the two.

**The interval reading is the one that still covers both halves.** It sees the draw and the
overlay work together, so a cost that moved from one to the other cannot hide from it.

The draw-time budget of `far-view-rendering` is unchanged and is measured as it always was.
This requirement adds the two readings the new work needs and does not restate that one.

#### Scenario: The selection work fits its own budget

- **WHEN** the browser test adds 50,000 systems in view, turns the name switch on, puts
  the pointer over a marker, draws 120 frames at 1920x1080 and reads the selection work
  statistics
- **THEN** the mean is 2 ms or less

#### Scenario: The page keeps its frame rate with the selection work running

- **WHEN** the browser test repeats the reading above and reads the animation frame
  interval statistics
- **THEN** the mean interval is 18 ms or less

#### Scenario: The label placement holds its bound at a full set

- **WHEN** the browser test adds 50,000 systems inside the frame, turns the name switch on
  and reads the selection work statistics over 120 frames
- **THEN** the mean is 2 ms or less, which a sort of the whole candidate list every frame
  would not hold

#### Scenario: The icon placement holds the budget at a full set

- **WHEN** the browser test adds 50,000 systems inside the frame, each carrying 4 icons,
  turns the name switch and the icon switch on, puts the pointer over a marker and reads
  the frame interval statistics over 120 frames
- **THEN** the mean interval is 18 ms or less.

  **The reading is the interval and not the selection work.** The placement runs inside
  `render` now, so the selection work statistics no longer see it and a reading of them
  would pass by measuring nothing. `system-icons` holds the draw-time reading of the same
  work.

#### Scenario: The label occlusion test does not raise the selection work

- **WHEN** the browser test repeats the label bound reading above with 50,000 systems, the
  name switch on and every label tested against the keeper
- **THEN** the mean is 2 ms or less, so the per-label walk of the keeper stays inside the
  budget the placement already held
