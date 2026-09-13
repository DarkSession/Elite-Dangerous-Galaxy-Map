## ADDED Requirements

### Requirement: A real system suppresses the invented stars near it

A decoration star SHALL NOT be drawn when it lies within 3 light years of a real system
in the set. The rule SHALL apply in the base size class only, which is the finest of the
classes the field draws.

The radius is about half the mean spacing of systems at Sol, which is 6.4 light years at
the measured 3.8 systems per 1,000 cubic light years. An invented star that close to a
real system stands for that same system, so the real record replaces it.

The base class block spans 8 base boxels on each axis around the camera. At or below
5,120 light years of zoom distance the base class rule does not hit its clamp, so the
base edge is more than one thirty-second of the zoom distance and the block reaches more
than one eighth of that distance in every direction. Above 5,120 light years the base
class holds at 4, its edge holds at 160 light years, and the block reaches 640 light
years whatever the distance; the field itself fades out between 4,000 and 8,000 light
years, so what the block leaves out sits in a field that is already fading.

Beyond that block a boxel is coarser and draws stars further apart, so an invented star
there is not a twin of a real one.

The suppressed set of a boxel SHALL depend on the boxel's grid index, its size class and
the real-system set alone. It SHALL NOT depend on the camera or on the zoom distance.

The field SHALL keep the suppressed sets of the boxels it drew in the last frame. It
SHALL compute a set only for a boxel it did not draw in the last frame, and it SHALL
drop every kept set when the real-system set changes.

A change of the base size class replaces the whole base class block, so one frame
computes every suppressed set of that block. That frame MAY exceed the frame budget. The
worst frame of a zoom that crosses a base class boundary SHALL stay under 50 ms, so the
change reads as one slow frame and not as a stall.

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

- **WHEN** the browser test adds 10,000 systems within 600 light years of Sol at
  `#c=0,0,0&d=500&p=35&y=0`, pans the camera 200 light years at a fixed zoom distance,
  and reads the longest frame of the pan
- **THEN** the longest frame is under 20 ms

#### Scenario: A base class change costs one slow frame at most

- **WHEN** the browser test adds 10,000 systems within 600 light years of Sol, then zooms
  from 300 to 1,400 light years of zoom distance, which crosses the base class boundaries
  at 320 and at 640, and reads the longest frame of the zoom
- **THEN** the longest frame is under 50 ms

#### Scenario: A frame reports the suppressed count

- **WHEN** the browser test opens `#c=0,0,0&d=500&p=35&y=0` with an empty set and reads
  the suppressed count, then adds 2,000 systems within 80 light years of Sol and reads
  it again
- **THEN** the first reading is 0 and the second is above 0

## MODIFIED Requirements

### Requirement: A boxel's stars come from its address

A star's position SHALL come from a hash of the boxel's grid index, its size class and
the star's index inside the boxel, and SHALL lie inside the boxel. Neither the hash nor
the position SHALL depend on the camera, so a boxel always shows the same stars.

The field SHALL NOT draw a star that a real system suppresses. The suppressed set depends
on the boxel's address and on the real-system set alone, so it does not break the rule
above: with the same set of real systems, a boxel always shows the same stars.

#### Scenario: The same view gives the same frame by any route

- **WHEN** the browser test opens `#c=0,0,0&d=500&p=35&y=0` directly, and then reaches
  the same view from `#c=4000,0,4000&d=8000&p=35&y=0` by setting the view, and takes a
  screenshot of each
- **THEN** the two image files are byte-identical

#### Scenario: The same view gives the same frame with systems loaded

- **WHEN** the browser test adds 500 systems around Sol and repeats the two routes above
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
  empty set, then adds 2,000 systems within 80 light years of Sol and reads them again
- **THEN** the vertex count is 475,136 in both readings, and the second sum is below the
  first

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

- **WHEN** the browser test opens `#c=0,0,0&d=500&p=35&y=0` with the marker pass off,
  reads the mean luminance of the whole frame with an empty set, then adds 2,000 systems
  within 80 light years of Sol and reads it again
- **THEN** the two readings differ by at most 0.002

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
