## Purpose

Fills the near field with decoration stars when the camera comes close, so the galaxy is
made of single lights rather than a cloud. The stars are invented: their count in a
volume follows the density model, and their positions come from the address of the boxel
that holds them. They stand in for systems the map holds no record of, so they give way
to the host's real systems as the camera comes closer still: the field draws in full at a
zoom distance of 2,560 light years and adds no light at 640 and below.

## Requirements


### Requirement: The star field uses the game's mass-code octree

The star field SHALL place its stars in boxels of the mass-code grid: the grid origin
is (-49,985, -40,985, -24,105) in game coordinates, size class 0 has an edge of 10
light years, and each higher class doubles the edge to 1,280 light years at class 7.

Four size classes SHALL draw at once. The base class SHALL be
`clamp(ceil(log2(distance / 320)), 0, 4)`, where `distance` is the **effective zoom
distance** the requirement "The star field and the point cloud hand over without a change
in light" defines, and the field SHALL draw the base class and the three above it. The rule
SHALL use `ceil`, so the covered radius never falls below 0.75 of the zoom distance while
the base class is below its clamp.

The effective zoom distance is `max(distance, 640)` light years, so the base class never
falls below 1 and the 320 light year boundary of the rule is never crossed, however close
the camera comes. Every figure below therefore holds at every zoom distance the map
reaches, including the ones under 320 that `map-navigation` opened. Without the hold the
base class would reach 0 below 320 light years, the covered radius would halve and the
point cloud would fill the band the halving vacated, in a frame where the field itself
carries no light.

The blocks SHALL be built from the coarsest class down. On each axis, with `c(s)` the
index of the boxel of class `s` that holds the camera:

1. The coarsest class SHALL draw the 8 boxels with indices `c(s0+3) - 4` to
   `c(s0+3) + 3`.
2. Each class above the base SHALL drop the 4 boxels with indices `c(s) - 2` to
   `c(s) + 1`.
3. The class below SHALL draw exactly the refinement of the 4 boxels the class above
   dropped, which is the 8 boxels with indices `2 * (c(s+1) - 2)` to
   `2 * (c(s+1) + 1) + 1`.
4. The base class SHALL drop nothing.

The drawn set SHALL therefore hold `512 + 3 * 448 = 1,856` boxels at every view, with
no gap and no overlap, and the camera SHALL lie inside the block of every class. The
field SHALL cover a sphere of radius `3 * edge(s0+3)` around the camera, which is
between 0.75 and 1.5 times the effective zoom distance while the clamp does not bite, that
is at every effective zoom distance up to 5,120 light years. Below 640 light years the
sphere holds at 480 light years, which is more than 1.5 times the zoom distance and never
less, so the field still covers everything the handover asks of it.

#### Scenario: Base class follows the zoom distance

- **WHEN** a unit test reads the base size class at zoom distances 500, 1,000, 2,000,
  4,000 and 8,000 light years
- **THEN** the classes are 1, 2, 3, 4 and 4, whose edges are 20, 40, 80, 160 and 160
  light years

#### Scenario: Base class does not fall below 1

- **WHEN** a unit test reads the base size class at zoom distances 10, 100, 320 and 640
  light years
- **THEN** every one is 1, whose edge is 20 light years, because the effective zoom
  distance holds at 640. The pure rule on the view's own distance would give 0 at 10, 100
  and 320, and would step to 1 only at 640

#### Scenario: The drawn set holds 1,856 boxels

- **WHEN** a unit test builds the drawn set at the cursor at Sol, at the galactic
  centre and at the far corner of the model bounds, at zoom distances 500 and 4,000
  light years
- **THEN** each set holds exactly 1,856 boxels and no two of them overlap

#### Scenario: The classes nest at every camera position

- **WHEN** a unit test builds the drawn set at 20,000 camera positions drawn at random
  over the model bounds, at every base class the rule can select, 1 to 4
- **THEN** at every position the boxels a class drops are exactly the block of the
  class below, every block holds 8 boxels per axis, and the camera lies inside every
  block

#### Scenario: The field covers a sphere of the stated radius

- **WHEN** a unit test measures, over the same 20,000 camera positions, the shortest
  distance from the camera to a face of the coarsest class's block
- **THEN** every distance is at least `3 * edge(s0+3)`

#### Scenario: The reach never falls below three quarters of the zoom distance

- **WHEN** a unit test reads the covered radius at 200 zoom distances spaced evenly in
  the logarithm from 10 to 5,120 light years
- **THEN** the covered radius is at least 0.75 times the zoom distance at every one. Below
  640 light years it holds at 480, so the ratio only grows as the camera comes in

### Requirement: A boxel's stars come from its address

A star's position SHALL come from a hash of the boxel's grid index, its size class and
the star's index inside the boxel, and SHALL lie inside the boxel. Neither the hash nor
the position SHALL depend on the camera, so a boxel always shows the same stars.

The field SHALL NOT draw a star that a real system suppresses. The suppressed set depends
on the boxel's address and on the real-system set alone, so it does not break the rule
above: with the same set of real systems, a boxel always shows the same stars.

#### Scenario: The same view gives the same frame by any route

- **WHEN** the browser test holds the close fade at 1, opens `#c=0,0,0&d=500&p=35&y=0`
  directly, and then reaches the same view from `#c=4000,0,4000&d=8000&p=35&y=0` by
  setting the view, and takes a screenshot of each
- **THEN** the two image files are byte-identical

  The close fade is held at 1 because at 500 light years of zoom distance the field adds
  no light, and a frame with no star in it cannot show that a boxel's stars come from its
  address.

#### Scenario: The same view gives the same frame with systems loaded

- **WHEN** the browser test adds 500 systems around the camera of the view both routes
  end at, and repeats the two routes above, with the close fade held at 1
- **THEN** the two image files are byte-identical

#### Scenario: A star lies inside its boxel

- **WHEN** a unit test generates the stars of 200 boxels of each size class with the
  same hash the shader uses
- **THEN** every position lies inside its own boxel

### Requirement: The count in a boxel follows the density model

A boxel's system count SHALL be the **detailed** mass-code-0 budget at its centre,
times the cube of its edge, times a calibration in systems per solar mass of budget.
The detailed budget is the detailed volume density, which carries the correction grid
and the detail grid, times the model's budget constant; it is the density the point
cloud is placed by. The calibration SHALL be a ramp on the logarithm of that density:
4.8 systems per solar mass at the density of the disc at Sol, falling linearly in the
logarithm to 1 at the model's peak density, and held flat outside that range.

The boxel SHALL place `min(256, round(count))` stars. That number is the boxel's
**placed count**, and it does not depend on the real systems. The boxel's **drawn count**
SHALL be the placed count less the stars a real system suppresses. A boxel whose count
rounds to zero SHALL place no star.

#### Scenario: The count at Sol matches the neighbourhood measurement

- **WHEN** a unit test reads the system count per 1,000 cubic light years at Sol, the
  count of the 20 light year boxel that holds Sol, and the count within 100 light years
  of Sol by numeric integration
- **THEN** the first is 3.80 within 0.05, against the roadmap's measured 3.8; the
  second is 30 within 1; and the third is within 5 percent of 15,650, against the
  roadmap's measured 16,000

#### Scenario: The calibration falls with the density

- **WHEN** a unit test reads the calibration at the density of the disc at Sol, at the
  model's peak density, and at 40 densities spaced evenly in the logarithm between them
- **THEN** the first is 4.8 systems per solar mass, the second is 1, and the
  calibration never rises with the density

#### Scenario: Empty space draws no star

- **WHEN** a unit test reads the placed count of a boxel of each size class centred
  20,000 light years above the mid-plane, where the model holds no density
- **THEN** every placed count is 0

### Requirement: The drawn count is bounded

The star pass SHALL draw at most 475,136 point sprites in any frame, at any view and at
any density under the camera. The page SHALL expose two numbers: the vertex count the
pass issues, which is the bound, and the sum of the **drawn counts** over the drawn
boxels, which is how many stars have a size above zero. The drawn count already excludes
the stars a real system suppresses, so the sum never rises when a host adds systems.

#### Scenario: The bound holds at every view

- **WHEN** the browser test opens each of `#c=0,0,0&d=500&p=35&y=0`,
  `#c=0,0,0&d=1000&p=35&y=0`, `#c=0,0,0&d=4000&p=35&y=0`,
  `#c=15,0,25895&d=500&p=35&y=0`, `#c=15,0,25895&d=1000&p=35&y=0` and
  `#c=15,0,25895&d=4000&p=35&y=0` with an empty system set, and reads both numbers
- **THEN** the vertex count is 475,136 at every view; the sum of the drawn counts is at
  most 475,136 at every view; the sum at the galactic centre at 500 and at 1,000 light
  years is exactly 475,136, because every boxel there is capped; the sum at the galactic
  centre at 4,000 light years is at least 300,000, and below the bound because the
  coarsest class then reaches above the disc, where the model holds no density and a
  boxel places no star; and the sum at `#c=0,0,0&d=500&p=35&y=0` is between 200,000 and
  400,000

#### Scenario: Systems lower the sum and not the bound

- **WHEN** the browser test opens `#c=0,0,0&d=500&p=35&y=0`, reads both numbers with an
  empty set, then adds 2,000 systems within 80 light years of the camera and reads them
  again
- **THEN** the vertex count is 475,136 in both readings, and the second sum is below the
  first

  The systems stand around the camera and not around the cursor, for the reason the
  scenario "A frame reports the suppressed count" gives.

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

- **WHEN** a unit test adds 10,000 systems spread evenly over the base class block,
  builds the suppressed sets of a drawn set, then moves the camera by one base boxel on
  one axis, builds again, and counts the boxels the second build computed a set for
- **THEN** the first build computes 512 base class boxels and the second computes at most
  64, which are the boxels the move brought in

#### Scenario: A camera move stays inside the frame budget

- **WHEN** the browser test adds 10,000 systems within 600 light years of the camera at
  `#c=0,0,0&d=1000&p=35&y=0`, resets `frameStats`, pans the camera 200 light years at a
  fixed zoom distance, and reads `frameStats`
- **THEN** the worst time is under 20 ms

  The view sits at 1,000 light years and not at 500, so the base class is 2 and a base
  boxel at Sol places 243 stars rather than 30. The sweep then tests eight times as many
  stars per boxel, which is the worse case for the bound.

  The systems stand around the camera and not around the cursor, for the reason the
  scenario "A frame reports the suppressed count" gives.

#### Scenario: A base class change costs one slow frame at most

- **WHEN** the browser test adds 10,000 systems within 600 light years of the camera,
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

### Requirement: The star field carries the point cloud's light

The light of a boxel SHALL be `STAR_LIGHT` times the **detailed** mass-code-0 budget at
its centre times the cube of its edge, where

`STAR_LIGHT = pointBrightness * pointRadiusLy^2 * pointCount / massIntegral`

and `massIntegral` is the integral of the detailed mass-code-0 budget over the model
bounds. Each drawn star SHALL carry that light divided by the boxel's **drawn count**,
which is the placed count less the suppressed stars. The light of a boxel SHALL NOT
depend on the calibration, and SHALL NOT depend on the real systems inside it, so the
count, the light and the real data are set by separate rules. A boxel that holds a real
system therefore keeps the same light over fewer stars, and the galaxy holds its brightness when a host loads data.

A boxel whose drawn count is zero SHALL carry no light. That needs a real system within
3 light years of every placed star of the boxel, which the placed spacing allows only
where the boxel places one or two stars, so the light lost cannot show.

The close fade of the handover multiplies the light a star deposits in the frame. It
SHALL NOT enter the light of a boxel or the light per star, so this rule and the close
fade are separate: one says how the boxel divides its light, the other says how much of
that light reaches the frame at the current zoom distance.

The point cloud places its samples in proportion to the same detailed density, so the
light per unit volume of the two sources SHALL be equal wherever the field draws stars,
not only at the density the constant was fitted at. The equality is of the light the
boxel carries. The per-star spread then scatters a boxel's drawn light about that value,
and the point cloud's own sample count scatters its light the same way, so neither
source deposits its exact expected light in any one volume. A boxel whose count rounds to
zero places none, and the light it would carry is under 3e-5 of one point cloud sample's,
so it cannot show.

#### Scenario: The two sources carry the same light per unit volume

- **WHEN** a unit test computes the light per cubic light year of the star field and
  the expected light per cubic light year of the point cloud at Sol, at the galactic
  centre, and at 16 azimuths spaced evenly on each of the circles of radius 2,000 and
  20,000 light years around the galactic centre in the plane
- **THEN** the two agree within 1 percent at every one of the 34 places

#### Scenario: The cap does not change a boxel's light

- **WHEN** a unit test reads the light of a boxel whose count is below the cap and of
  one whose count is 100 times the cap, and multiplies each boxel's light per star by
  its drawn count
- **THEN** each product equals that boxel's light within 1e-6 relative

#### Scenario: Suppression does not change a boxel's light

- **WHEN** a unit test reads a boxel's light per star and its drawn count with an empty
  system set, then places real systems on 3 of its stars and reads both again, and
  multiplies each reading's light per star by its drawn count
- **THEN** the drawn count falls by 3 and the two products are equal within 1e-6
  relative

#### Scenario: Loading systems does not change the galaxy's brightness

- **WHEN** the browser test opens `#c=0,0,0&d=2000&p=35&y=0` with the marker pass off,
  reads the mean luminance of the whole frame with an empty set, then adds 2,000 systems
  within 160 light years of the camera and reads it again
- **THEN** the two readings differ by at most 0.002

  The view sits at 2,000 light years, where the close fade is 0.79 and the field carries
  most of its light. At 500 light years the close fade is 0 and the reading would hold
  whether or not the light was conserved.

  This reading is a regression guard and not a measurement. A boxel of 80 light years
  caps at 256 stars, so 2,000 systems suppress about 114 stars of the 475,136 the pass
  draws, and a failure to divide by the drawn count would move the mean luminance by far
  less than the limit. The unit scenario "Suppression does not change a boxel's light" is
  what holds the rule; this one catches a change that makes the frame visibly darker.

### Requirement: A star's radius follows the spacing of the stars drawn with it

A star's radius in light years SHALL be a fixed fraction of `edge / n^(1/3)`, the mean
spacing of the `n` stars its boxel places, so a boxel that places every system it holds
gives sharp points and a boxel at the cap gives wider, softer ones that read as a wash.
The count `n` SHALL be the boxel's **placed count**, not its drawn count, so the field's
look does not shift when a host loads data near the camera. The on-screen size SHALL be
held between 1 and 16 pixels.

A star's brightness SHALL be `lightPerStar * focal^2 / (range * size)^2`, times the
handover factor, times a per-star spread, where `focal` is the pixels per light year at
one light year of range and `size` is the on-screen size after the clamp. Without the
spread the light the sprite deposits is `lightPerStar / range^2` times a constant,
whatever the star's radius and whatever the size clamp does. The radius therefore sets
only how concentrated a star's light is, never how much of it there is.

The spread SHALL come from the same hash the star's position comes from, and its mean
over the stars of the drawn set SHALL be 1, so the field's light does not depend on it.
One boxel places at most 256 stars, so its own mean departs from 1 by a sampling error,
and the shape SHALL be chosen to hold that departure small. The spread is what gives the field its grain: a real population of stars
covers many magnitudes, and the point pass already spreads its own samples the same way.
A shape whose scatter is too large makes neighbouring boxels read as blocks.

#### Scenario: A capped boxel draws wider stars

- **WHEN** a unit test reads the star radius of a 20 light year boxel at Sol, which
  places every system it holds, and of a 1,280 light year boxel 2,000 light years from
  the galactic centre, which is capped
- **THEN** the second radius is at least 20 times the first

#### Scenario: Suppression does not change the star radius

- **WHEN** a unit test reads the star radius of a 20 light year boxel at Sol with an
  empty system set, and again with real systems on 3 of its stars
- **THEN** the two radii are equal

#### Scenario: The spread does not change the field's light

- **WHEN** a unit test takes the mean of the spread over every star of the drawn set,
  the largest departure from 1 of any one boxel's own mean, and the ratio of the
  faintest to the brightest value the spread gives
- **THEN** the mean over the drawn set is 1 within 1 percent, no one boxel's mean is
  more than 0.3 from 1, and the ratio spans at least a factor of 10

#### Scenario: The deposited light does not follow the radius

- **WHEN** a unit test computes the brightness times the square of the on-screen size
  for one star of a fixed light per star, at radii spanning a factor of 100 and at
  ranges from 10 to 8,000 light years, including radii that clamp at 1 pixel and at 16
- **THEN** the product is `lightPerStar / range^2` times one constant at every radius
  and every range, within 1e-6 relative

### Requirement: The star field and the point cloud hand over without a change in light

The star field and the handover SHALL read an **effective zoom distance** of
`max(distance, 640)` light years, where `distance` is the view's own zoom distance. The
close fade below SHALL read the view's own zoom distance and not the effective one.

The effective distance exists because the zoom reaches 10 light years. The base size class
rule steps at 320 light years, so without the hold the boxel set, the covered radius and
the handover radii would all change there, and the point cloud's near void would halve
from 480 light years to 240 in one wheel notch. The field carries no light below 640 light
years, so nothing the user sees would move with it, but the point cloud would: a band from
240 to 480 light years of range would fill with sprites the frame before did not hold. The
hold keeps every one of those values at the value it takes at 640 light years, which is the
value the map draws at 500 light years today, so no frame that draws today changes and no
new step appears below it.

Holding the distance SHALL change no drawn light. The field's light is the close fade times
the weight, and the close fade is 0 at every distance the hold covers.

The renderer SHALL compute, each frame, an inner radius of `3 * edge(s0+2)` and an
outer radius of `3 * edge(s0+3)`, where `s0` is the base size class of the effective zoom
distance, and a weight that is 1 at a zoom distance of 4,000 light years and below, 0 at
8,000 and above, and smooth between.

The weight SHALL follow the zoom distance alone. The `stars` switch SHALL NOT change it,
so a frame drawn with the star pass off holds the same point cloud as the frame drawn
with it on. A field that has not loaded yet is the one case that gives the point cloud
its near field back, so the first frames of a close view are not empty. The scenario "The
invented field goes as the camera comes in" reads that rule: at a zoom distance of 640
light years the close fade is 0, so the star pass adds no light and the frame with the
pass on is the frame with it off, byte for byte.

The renderer SHALL also compute a **close fade**, which is 0 at a zoom distance of 640
light years and below, 1 at 2,560 and above, and a smoothstep between. The invented field
stands in for systems the map holds no record of, so it gives way as the camera comes
close enough to read one system from the next. A real system does not fade: the
requirement "A marker draws for every system at every zoom distance" of `real-systems`
draws a marker at every zoom distance from 10 to 120,000 light years, for every system its
category's draw range keeps. Inside the covered sphere the close view then shows the
host's systems and nothing the map invented. Outside it the point cloud, the volume and
the cloud sprites draw the galaxy as they did before, so the frame is not empty.

A star's brightness SHALL carry `close * weight * (1 - smoothstep(inner, outer, range))`
and a point cloud sample's brightness SHALL carry
`1 - weight * (1 - smoothstep(inner, outer, range))`, where `range` is the distance from
the camera and `close` is the close fade. The point cloud's factor SHALL NOT read the
close fade. The two factors SHALL sum to exactly 1 at every range where the close fade is
1, and the outer radius SHALL NOT exceed the radius the field is proved to cover, so no
band of the disc brightens or dims at the handover. The name of this requirement is about
that handover, which is between the two sources; the close fade is a third thing and it
does change the light.

Where the close fade is below 1 the light the field gives up SHALL leave the frame, and
the point cloud SHALL NOT take it back. The point cloud places 2,000,000 samples over the
whole galaxy, so one sample near the camera stands for about 98,000 systems and the pass
draws it as a saturated sprite of up to 4 pixels. Suppressing those samples inside the
covered sphere is why the close view is a field of stars and not a field of blocks, and at
the galactic centre there are about 90 of them within 240 light years of the camera. The
close view therefore empties, which is the intent: close in, the map draws what the host
gave it and the invented sources both stand down.

At a zoom distance of 640 light years and below the close fade is 0 and the field adds no
light to the frame. Above a zoom distance of 8,000 light years the weight is 0, the point
pass draws as it did before the field existed, and the field adds no light either.

The close fade SHALL change the light a star deposits. It SHALL NOT change a boxel's
placed count, its drawn count or its star radius, so the two counts the page reports do
not depend on the zoom distance and the field holds its grain while it fades.

#### Scenario: The effective distance holds below 640

- **WHEN** a unit test reads the effective zoom distance at 10, 100, 320, 500, 640, 2,000
  and 120,000 light years
- **THEN** the readings are 640, 640, 640, 640, 640, 2,000 and 120,000

#### Scenario: The handover radii do not step below 640

- **WHEN** a unit test reads the inner and the outer handover radius at every zoom distance
  from 10 to 640 light years, stepping by the wheel's 1.15 factor
- **THEN** every reading is 240 and 480 light years, which is the pair the map reads at 500
  light years today

#### Scenario: The boxel set does not change below 640

- **WHEN** a unit test lists the drawn boxels at a fixed camera position at zoom distances
  10, 100, 320 and 500 light years
- **THEN** the four lists are equal, and each holds the 1,856 boxels the list holds at 640
  light years

#### Scenario: The drawn field does not change below 640

- **WHEN** the browser test opens the map, moves the cursor back along the camera
  direction by the zoom distance so the camera holds one position at Sol, and reads the
  star vertex count and the star drawn count at zoom distances 10, 100, 320 and 640 light
  years
- **THEN** the four readings are equal, and the drawn count is above 0 and below the
  vertex count.

  The camera has to hold one position, because the drawn boxel list is camera-relative.
  The drawn count is the reading that moves: it is the sum over the drawn boxels, so it
  changes as soon as the base size class steps and the field draws another list. Measured
  on the pinned model the four readings are 340,529 of 475,136, and with the hold removed
  from the render loop the reading at 10 light years falls to 225,870

The four scenarios above are what hold this rule. The three unit scenarios read the three
values the hold protects directly: the base class, the handover radii and the drawn boxel
list. The browser scenario reads the rule where it is applied, which is the render loop,
because a unit test on a pure function cannot fail when the loop stops calling it.

A browser scenario over the mean luminance of the frame was tried and dropped. The frame
mean cannot see the difference the hold makes: the point cloud samples it governs cover
about 0.15 percent of the frame, so removing the hold moves the reading at 320 light years
by 0.0007 at the galactic centre and by less than 1e-5 at Sol, which is under the frame's
own change from one wheel notch. The counts the page reports carry the difference the
frame mean hides. A test that cannot fail when the rule is broken is not a test of the
rule.

#### Scenario: The two fades sum to one

- **WHEN** a unit test sweeps the range from 0 to 20,000 light years at zoom distances
  2,560, 4,000, 6,000 and 8,000 light years, which are the distances where the close fade
  is 1
- **THEN** the star factor plus the point factor is 1 within 1e-6 at every sample

#### Scenario: The close fade takes light out of the frame

- **WHEN** a unit test sweeps the range from 0 to 20,000 light years at zoom distances
  10, 500, 640, 1,000 and 2,000 light years, and reads both factors at each sample
- **THEN** the point factor equals `1 - weight * (1 - smoothstep(inner, outer, range))` at
  every sample, which is the value it holds when the close fade is 1, and the star factor
  is the close fade times `weight * (1 - smoothstep(inner, outer, range))`

#### Scenario: The point cloud does not take the faded light back

- **WHEN** the browser test opens `#c=15,0,25895&d=500&p=35&y=0`, which is the densest
  close view, with an empty system set, with the volume, the clouds and the glow switched
  off, the points on and the stars off, and takes a screenshot; then holds the close fade
  at 1 and takes another
- **THEN** the two image files are byte-identical

#### Scenario: The close fade follows the zoom distance

- **WHEN** a unit test reads the close fade at zoom distances 10, 500, 640, 1,000, 1,280,
  2,560 and 4,000 light years
- **THEN** the readings are 0, 0, 0, 0.092, 0.259, 1 and 1 within 1e-3, and the fade never
  falls as the zoom distance rises

#### Scenario: The fade band lies inside the covered sphere

- **WHEN** a unit test reads the inner and the outer radius at every base class the
  rule can select from an effective zoom distance, 1 to 4
- **THEN** the outer radius equals `3 * edge(s0+3)`, the radius the field covers, and
  the inner radius is half of it

#### Scenario: The far view is unchanged

- **WHEN** the browser test renders the default view at 1280x720 with the star pass on,
  and again with the star pass switched off
- **THEN** the two image files are byte-identical, and the frame still matches the
  committed baseline image with at most 2 percent of pixels differing

#### Scenario: The handover keeps the light

- **WHEN** the browser test opens `#c=0,0,0&d=4000&p=35&y=0` and reads the mean
  luminance of the whole frame, then switches the star pass off and reads it again
- **THEN** the two readings differ by at most 0.02

  The switch does not move the weight, so the second reading is the first less the
  field's own light. The reading holds that light small against the frame; the unit
  scenario "The two fades sum to one" is what holds the handover itself.

#### Scenario: The invented field goes as the camera comes in

- **WHEN** the browser test opens `#c=0,0,0&d=2560&p=35&y=0`,
  `#c=0,0,0&d=1280&p=35&y=0`, `#c=0,0,0&d=640&p=35&y=0` and `#c=0,0,0&d=10&p=35&y=0` with
  an empty system set, and renders each with the star pass on and with it off
- **THEN** the mean absolute pixel difference falls from the first view to the third, and
  at 640 and at 10 light years the two image files are byte-identical

#### Scenario: A real system stays when the invented field goes

- **WHEN** the browser test adds one category and one system at Sol, opens
  `#c=0,0,0&d=640&p=35&y=0` and `#c=0,0,0&d=10&p=35&y=0`, and reads the middle pixel of the
  marker in each
- **THEN** each pixel holds the category's colour, and each frame drawn with the star pass
  off is byte-identical to the frame drawn with it on

### Requirement: A star is drawn as a point sprite of the disc

A star SHALL be drawn as an additive point sprite whose colour follows the population
zone of its boxel through the same ramp the point cloud uses.

The two readings below hold the close fade at 1. They pin what one star deposits and how
the field grains, which the base class of 1 at 500 light years of zoom distance shows
best: the boxel places every system it holds, so the stars are single points and not a
wash. At a zoom distance the close fade lets through, the base class is 3 or coarser, the
boxels cap, and the same two numbers would read against a softer field. Holding the fade
is what keeps the calibration of these constants where it was measured.

#### Scenario: The field alone rises above the background

- **WHEN** the browser test holds the close fade at 1, opens `#c=0,0,0&d=500&p=35&y=0`
  with the volume, the clouds, the glow and the points switched off and the stars on
- **THEN** the brightest pixel of the frame has luminance at least 0.05 above the mean
  luminance of the four corner pixels, and with the stars also switched off that
  difference is below 0.01

#### Scenario: The field has grain

- **WHEN** the browser test holds the close fade at 1, opens `#c=0,0,0&d=500&p=35&y=0`,
  reads the 120 x 120 pixel block at the centre of the frame, subtracts from the
  luminance of each pixel the mean of its 3 x 3 neighbourhood, and divides the standard
  deviation of that residual by the mean luminance of the block
- **THEN** the result is above 0.04

#### Scenario: The field adds no light at the close zoom distances

- **WHEN** the browser test opens `#c=0,0,0&d=500&p=35&y=0` with the volume, the clouds,
  the glow and the points switched off and the stars on, and does not hold the close fade
- **THEN** the brightest pixel of the frame is within 0.01 of the mean luminance of the
  four corner pixels

### Requirement: A star's drawn position is exact

The renderer SHALL subtract the camera position from each boxel origin in `float64` on
the CPU, and the shader SHALL place the star relative to that origin, so every number
in the shader is an offset of at most 8,000 light years. The drawn position of a star
SHALL be within 0.01 light years of the position the same hash gives in `float64`, at
every cursor inside the model bounds and every zoom distance.

#### Scenario: Position error at the far corner

- **WHEN** a unit test places the cursor at (50,000, 0, 75,000) and at the galactic
  centre, at zoom distances 500, 2,000 and 8,000 light years, and pushes the stars of
  the outermost boxels through a `float32` emulation of the vertex transform
- **THEN** every drawn position is within 0.01 light years of the `float64` result

### Requirement: The star pass has a switch

The renderer SHALL expose a `stars` switch beside the switches for the volume, the
clouds, the points and the glow.

The mean luminance the field adds over the whole frame is small, and it cannot be made
larger without giving up the grain. The handover pins the linear light the field carries,
and the tone map is concave, so the displayed sum of a fixed light is largest when the
light is spread evenly over the pixels and smallest when it sits on few. Grain is the
opposite arrangement of the same light. A wider star therefore raises the mean and lowers
the grain, and a per-star brightness spread only moves along that same curve. The
threshold below is what the light budget gives with the grain held above its own
threshold, not a target the pass can be tuned toward.

The reading holds the close fade at 1, for the reason the sprite requirement gives. The
switch and the close fade are separate controls: the switch says whether the pass draws,
and the close fade says how much of its light reaches the frame.

#### Scenario: The switch removes the field

- **WHEN** the browser test holds the close fade at 1, opens `#c=0,0,0&d=500&p=35&y=0`
  with every other pass switched off, reads the mean luminance of the frame, then
  switches the stars off and reads it again
- **THEN** the reading with the stars on is at least 0.002 above the reading with them
  off, and the reading with them off is within 0.005 of the background

### Requirement: Frame budget at close zoom

At 1920x1080 on the dev container's GPU, the mean render time over 300 consecutive
frames SHALL stay under 16.7 ms at zoom distances of 10, 500, 1,000 and 4,000 light years
from the cursor, with the cursor at Sol and at the galactic centre.

The 10 light year view is the new closest zoom. The field adds no light there, but it
still builds its boxel table and runs its suppression sweep, because the effective zoom
distance holds at 640 light years. The view is in the list so that cost is measured where
it is paid and not assumed from the 500 light year reading. The list holds
4,000 light years because that is the worst fill of the star field: the weight is still
1, the coarsest class is the 1,280 light year sector, nearly every boxel is capped and
most sprites sit at the 16 pixel size clamp. The measurement SHALL use the same function
the far view's frame budget uses, so it holds the GPU work and the CPU work of the boxel
table.

#### Scenario: Six close views under budget

- **WHEN** the browser test sets each of the six views at 500, 1,000 and 4,000 light
  years and calls the measurement function for 300 frames
- **THEN** each returned mean is under 16.7 ms

#### Scenario: The closest zoom is under budget

- **WHEN** the browser test sets the two views at 10 light years, one with the cursor at
  Sol and one at the galactic centre, and calls the measurement function for 300 frames
- **THEN** each returned mean is under 16.7 ms
