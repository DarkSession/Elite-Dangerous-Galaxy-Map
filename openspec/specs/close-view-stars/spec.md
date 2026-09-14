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
`clamp(ceil(log2(distance / 320)), 0, 4)` and the field SHALL draw the base class and
the three above it. The rule SHALL use `ceil`, so the covered radius never falls below
0.75 of the zoom distance while the base class is below its clamp.

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
between 0.75 and 1.5 times the zoom distance while the clamp does not bite, that is at
every zoom distance up to 5,120 light years.

#### Scenario: Base class follows the zoom distance

- **WHEN** a unit test reads the base size class at zoom distances 500, 1,000, 2,000,
  4,000 and 8,000 light years
- **THEN** the classes are 1, 2, 3, 4 and 4, whose edges are 20, 40, 80, 160 and 160
  light years

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
  the logarithm from 500 to 5,120 light years
- **THEN** the covered radius is at least 0.75 times the zoom distance at every one

### Requirement: A boxel's stars come from its address

A star's position SHALL come from a hash of the boxel's grid index, its size class and
the star's index inside the boxel, and SHALL lie inside the boxel. Neither the hash nor
the position SHALL depend on the camera, so a boxel always shows the same stars.

#### Scenario: The same view gives the same frame by any route

- **WHEN** the browser test opens `#c=0,0,0&d=500&p=35&y=0` directly, and then reaches
  the same view from `#c=4000,0,4000&d=8000&p=35&y=0` by setting the view, and takes a
  screenshot of each
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

The boxel SHALL draw `min(256, round(count))` stars. A boxel whose count rounds to zero
SHALL draw no star.

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

- **WHEN** a unit test reads the drawn count of a boxel of each size class centred
  20,000 light years above the mid-plane, where the model holds no density
- **THEN** every drawn count is 0

### Requirement: The drawn count is bounded

The star pass SHALL draw at most 475,136 point sprites in any frame, at any view and at
any density under the camera. The page SHALL expose two numbers: the vertex count the
pass issues, which is the bound, and the sum of the drawn counts over the drawn boxels,
which is how many stars have a size above zero.

#### Scenario: The bound holds at every view

- **WHEN** the browser test opens each of `#c=0,0,0&d=500&p=35&y=0`,
  `#c=0,0,0&d=1000&p=35&y=0`, `#c=0,0,0&d=4000&p=35&y=0`,
  `#c=15,0,25895&d=500&p=35&y=0`, `#c=15,0,25895&d=1000&p=35&y=0` and
  `#c=15,0,25895&d=4000&p=35&y=0`, and reads both numbers
- **THEN** the vertex count is 475,136 at every view; the sum of the drawn counts is at
  most 475,136 at every view; the sum at the galactic centre at 500 and at 1,000 light
  years is exactly 475,136, because every boxel there is capped; the sum at the galactic
  centre at 4,000 light years is at least 300,000, and below the bound because the
  coarsest class then reaches above the disc, where the model holds no density and a
  boxel draws no star; and the sum at `#c=0,0,0&d=500&p=35&y=0` is between 200,000 and
  400,000

### Requirement: The star field carries the point cloud's light

The light of a boxel SHALL be `STAR_LIGHT` times the **detailed** mass-code-0 budget at
its centre times the cube of its edge, where

`STAR_LIGHT = pointBrightness * pointRadiusLy^2 * pointCount / massIntegral`

and `massIntegral` is the integral of the detailed mass-code-0 budget over the model
bounds. Each drawn star SHALL carry that light divided by the drawn count. The light of
a boxel SHALL NOT depend on the calibration, so the count and the light are set by
separate rules.

The point cloud places its samples in proportion to the same detailed density, so the
light per unit volume of the two sources SHALL be equal wherever the field draws stars,
not only at the density the constant was fitted at. The equality is of the light the
boxel carries. The per-star spread then scatters a boxel's drawn light about that value,
and the point cloud's own sample count scatters its light the same way, so neither
source deposits its exact expected light in any one volume. A boxel whose count rounds to zero
draws none, and the light it would carry is under 3e-5 of one point cloud sample's, so
it cannot show.

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

### Requirement: A star's radius follows the spacing of the stars drawn with it

A star's radius in light years SHALL be a fixed fraction of `edge / n^(1/3)`, the mean
spacing of the `n` stars its boxel draws, so a boxel that draws every system it holds
gives sharp points and a boxel at the cap gives wider, softer ones that read as a wash.
The on-screen size SHALL be held between 1 and 16 pixels.

A star's brightness SHALL be `lightPerStar * focal^2 / (range * size)^2`, times the
handover factor, times a per-star spread, where `focal` is the pixels per light year at
one light year of range and `size` is the on-screen size after the clamp. Without the
spread the light the sprite deposits is `lightPerStar / range^2` times a constant,
whatever the star's radius and whatever the size clamp does. The radius therefore sets
only how concentrated a star's light is, never how much of it there is.

The spread SHALL come from the same hash the star's position comes from, and its mean
over the stars of the drawn set SHALL be 1, so the field's light does not depend on it.
One boxel draws at most 256 stars, so its own mean departs from 1 by a sampling error,
and the shape SHALL be chosen to hold that departure small. The spread is what gives the field its grain: a real population of stars
covers many magnitudes, and the point pass already spreads its own samples the same way.
A shape whose scatter is too large makes neighbouring boxels read as blocks.

#### Scenario: A capped boxel draws wider stars

- **WHEN** a unit test reads the star radius of a 20 light year boxel at Sol, which
  draws every system it holds, and of a 1,280 light year boxel 2,000 light years from
  the galactic centre, which is capped
- **THEN** the second radius is at least 20 times the first

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

The renderer SHALL compute, each frame, an inner radius of `3 * edge(s0+2)` and an
outer radius of `3 * edge(s0+3)`, and a weight that is 1 at a zoom distance of 4,000
light years and below, 0 at 8,000 and above, and smooth between.

A star's brightness SHALL carry `weight * (1 - smoothstep(inner, outer, range))` and a
point cloud sample's brightness SHALL carry
`1 - weight * (1 - smoothstep(inner, outer, range))`, where `range` is the distance from
the camera. The two factors SHALL sum to exactly 1 at every range, and the outer radius
SHALL NOT exceed the radius the field is proved to cover, so no band of the disc
brightens or dims at the handover.

Above a zoom distance of 8,000 light years the weight is 0, the point pass draws as it
did before this change, and the star pass draws nothing.

#### Scenario: The two fades sum to one

- **WHEN** a unit test sweeps the range from 0 to 20,000 light years at zoom distances
  500, 2,000, 4,000, 6,000 and 8,000 light years
- **THEN** the star factor plus the point factor is 1 within 1e-6 at every sample

#### Scenario: The fade band lies inside the covered sphere

- **WHEN** a unit test reads the inner and the outer radius at every base class the
  rule can select, 1 to 4
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

### Requirement: A star is drawn as a point sprite of the disc

A star SHALL be drawn as an additive point sprite whose colour follows the population
zone of its boxel through the same ramp the point cloud uses.

#### Scenario: The field alone rises above the background

- **WHEN** the browser test opens `#c=0,0,0&d=500&p=35&y=0` with the volume, the
  clouds, the glow and the points switched off and the stars on
- **THEN** the brightest pixel of the frame has luminance at least 0.05 above the mean
  luminance of the four corner pixels, and with the stars also switched off that
  difference is below 0.01

#### Scenario: The field has grain

- **WHEN** the browser test opens `#c=0,0,0&d=500&p=35&y=0`, reads the 120 x 120 pixel
  block at the centre of the frame, subtracts from the luminance of each pixel the mean
  of its 3 x 3 neighbourhood, and divides the standard deviation of that residual by
  the mean luminance of the block
- **THEN** the result is above 0.04

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
larger without giving up the grain. The handover pins the linear light the field carries, and the tone map is
concave, so the displayed sum of a fixed light is largest when the light is spread
evenly over the pixels and smallest when it sits on few. Grain is the opposite
arrangement of the same light. A wider star therefore raises the mean and lowers the
grain, and a per-star brightness spread only moves along that same curve. The threshold
below is what the light budget gives with the grain held above its own threshold, not a
target the pass can be tuned toward.

#### Scenario: The switch removes the field

- **WHEN** the browser test opens `#c=0,0,0&d=500&p=35&y=0` with every other pass
  switched off, reads the mean luminance of the frame, then switches the stars off and
  reads it again
- **THEN** the reading with the stars on is at least 0.002 above the reading with them
  off, and the reading with them off is within 0.005 of the background

### Requirement: Frame budget at close zoom

At 1920x1080 on the dev container's GPU, the mean render time over 300 consecutive
frames SHALL stay under 16.7 ms at zoom distances of 500, 1,000 and 4,000 light years
from the cursor, with the cursor at Sol and at the galactic centre. The list holds
4,000 light years because that is the worst fill of the star field: the weight is still
1, the coarsest class is the 1,280 light year sector, nearly every boxel is capped and
most sprites sit at the 16 pixel size clamp. The measurement SHALL use the same function
the far view's frame budget uses, so it holds the GPU work and the CPU work of the boxel
table.

#### Scenario: Six close views under budget

- **WHEN** the browser test sets each of the six views at 500, 1,000 and 4,000 light
  years and calls the measurement function for 300 frames
- **THEN** each returned mean is under 16.7 ms
