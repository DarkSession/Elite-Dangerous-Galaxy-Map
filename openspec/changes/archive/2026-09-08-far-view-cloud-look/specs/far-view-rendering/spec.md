## ADDED Requirements

### Requirement: Cloud shapes come from a generated set
The renderer SHALL build a set of 16 cloud shapes of 64 x 64 texels each, once, from a
fixed seed, in one task on the main thread. Each shape SHALL be a soft fall-off from
its centre multiplied by a noise field, stored as one `uint8` per texel and scaled so
its peak is 255. Each shape SHALL be zero outside its inscribed disc, so a rotated
lookup never leaves the sprite's quad.
The outline SHALL be irregular, so a sprite does not read as a disc. The shapes SHALL
differ from one another, so neighbouring sprites do not repeat.

#### Scenario: Zero outside the disc
- **WHEN** a unit test builds the set and reads every texel whose centre lies outside
  the inscribed disc of its shape
- **THEN** every such texel is 0

#### Scenario: Outline is irregular
- **WHEN** a unit test builds the set and, for each shape, finds along 32 directions
  from the centre the largest radius at which the value is at least a quarter of the
  peak
- **THEN** for each shape the standard deviation of those 32 radii is at least 0.15
  of their mean

#### Scenario: Shapes differ
- **WHEN** a unit test builds the set and computes, for every pair of shapes, the mean
  absolute difference of their values over the inscribed disc
- **THEN** every pair differs by at least 0.05 of the peak

#### Scenario: Shapes are soft and hold light
- **WHEN** a unit test builds the set and reads each shape's mean value over its
  inscribed disc
- **THEN** each mean is between 0.10 and 0.35 of the peak

#### Scenario: Deterministic
- **WHEN** a unit test builds the set twice
- **THEN** the two arrays are byte-identical

## MODIFIED Requirements

### Requirement: Three scene passes and a tone map compose the far view
Each frame SHALL draw the density volume by raymarching, then the cloud sprites, then
the point cloud as additive point sprites over them. The volume SHALL store density on
a logarithmic scale and decode it to linear density. At each step the decoded density
SHALL be multiplied by the surface detail ratio at the step's plane position. The
emission SHALL follow the density divided by the peak density of the volume through a
curve with two slopes on a logarithmic scale: a fixed power above a knee at the density
of the disc at Sol, and a larger power below it, continuous at the knee, so the bulge
and the disc share one display range and the patches of the outer disc keep their
contrast. A fade by galactocentric radius SHALL remove the density beyond the painted
rim: full inside 47,000 light years and zero at 51,000. A fade by height SHALL remove
the density toward the top and the bottom of the volume, full inside 1,800 light years
of the mid-plane and zero at 2,880, so the bulge has no hard top. Neither fade SHALL
depend on density, so the space between the arms keeps its light. The extinction
SHALL absorb blue more than red, so dust lanes are brown. The ramp by emission SHALL
run through four colours: a greyed blue-violet haze, dusty pink-brown arms, a soft
salmon band at the edge of the bulge, and a cream-white core. A final pass SHALL tone-map the sum with
a curve that reaches a white level below 1 and does not clip the bulge, so the bulge
falls off from the centre, and SHALL blend the result over a constant dark grey
background as `grey + (1 - grey) * colour`, so faint light stays above the
background. The powers, the knee, the ramp, the extinction colour, the white level
and the grey are look constants in the shaders, and the baseline image pins them.
The galactic centre, the disc at Sol and the space between the arms are then visible
in the same frame, and the disc shows grain from the point cloud, which the cloud
sprites soften.

#### Scenario: Both structures visible at the default view
- **WHEN** the browser test renders the default view and samples the frame
- **THEN** the pixel at the galactic centre has luminance above 0.8 and below 0.97,
  its red channel exceeds its blue channel by at least 0.08 and its green channel
  exceeds its blue channel by at least 0.06 on a 0 to 1 scale; the pixel at Sol has
  luminance above 0.2; and the pixel at (-45,000, 0, 0), which is outside the disc
  and inside the default view, has luminance below 0.12

#### Scenario: Colours follow the reference
- **WHEN** the browser test renders the default view and samples the pixels at
  (9,015, 0, 25,895), at Sol, and at 72 points spaced evenly on the circle of radius
  38,000 light years around the galactic centre in the plane
- **THEN** at (9,015, 0, 25,895) red exceeds green by at least 0.05; at Sol red
  exceeds blue by at least 0.01 and red exceeds green by at least 0.02; and the
  median over the circle of blue minus red is at least 0

#### Scenario: Bulge falls off from the centre
- **WHEN** the browser test renders the default view and samples the pixels at the
  galactic centre, at (5,015, 0, 25,895) and at (9,015, 0, 25,895)
- **THEN** the luminance at the centre exceeds the luminance at 5,000 light years by
  at least 0.03, and the luminance at 5,000 light years exceeds the luminance at
  9,000 light years by at least 0.05

#### Scenario: Space between the arms keeps its light
- **WHEN** the browser test samples the pixel at (13,736, 0, 2,116), where the game's
  map holds 8 percent of the density at Sol
- **THEN** its luminance is above 0.10 and below the luminance at Sol

#### Scenario: Patches of the outer disc keep their contrast
- **WHEN** the browser test renders the default view, reads the 5 x 5 mean luminance
  at 72 points spaced evenly on each of the circles of radius 32,000 and 38,000 light
  years around the galactic centre in the plane, and subtracts the mean of the four
  corner pixels from each reading
- **THEN** on each circle the 90th percentile is at least 2.5 times the 10th
  percentile

#### Scenario: Bulge has a soft top
- **WHEN** the browser test opens the view `#c=15,0,25895&d=25000&p=5&y=0`, switches
  the points, the clouds and the glow off, and reads the luminance of every pixel row
  on the vertical line through the projection of the galactic centre from the plane
  up to 4,000 light years above it
- **THEN** no two adjacent rows differ by more than 0.05

#### Scenario: Background is dark grey
- **WHEN** the browser test samples the four pixels 2 pixels inside the corners of the
  frame at the default view
- **THEN** each has luminance between 0.02 and 0.06

#### Scenario: Points alone rise above the background
- **WHEN** the browser test renders the default view with the volume, the clouds and
  the glow switched off and the points on
- **THEN** the pixel at the galactic centre and the brightest pixel of the frame each
  have luminance at least 0.3 above the mean luminance of the four corner pixels; and
  with the points also switched off, both differences are below 0.3

#### Scenario: Grain
- **WHEN** the browser test reads the 26 x 26 pixel block centred on Sol's pixel,
  subtracts from the luminance of each pixel of the inner 24 x 24 block the mean of
  its 3 x 3 neighbourhood, and divides the standard deviation of that residual by
  the mean luminance of the inner block
- **THEN** the result is above 0.04

#### Scenario: Look matches the baseline
- **WHEN** the browser test renders the default view at 1280x720
- **THEN** the frame matches the committed baseline image with at most 2 percent of
  pixels differing

### Requirement: Cloud sprites give the haze its chunks
The renderer SHALL draw the cloud sample set, at most 40,000 samples, as large soft
additive sprites before the point pass, so the haze is made of overlapping puffs in
three dimensions. Each sprite SHALL take a shape from the shape set, with the shape and
a rotation chosen by a hash of the sample index, and SHALL have the on-screen radius
its sample's radius gives at its range. The brightness of a sprite SHALL be a look
constant times its sample's density ratio, held between a floor and a ceiling and
divided by the ceiling, raised to one power, times its radius over a reference radius
raised to a second power, so that the light per unit area follows the density between
the two holds. The floor SHALL give the rim its light where the model truncates, and
the two holds SHALL carry a known share of the set. With the shipped constants the
floor lies near the 20th percentile of the density ratios on the ring at 32,000 light
years, so most of the outer disc still follows the density there, and the ceiling is
reached by 96 percent of the ring at 20,000 light years, so the bulge does not take
the light of the whole set. A sprite SHALL fade out as its wanted radius rises from
half the pixel cap to the cap, and SHALL NOT be drawn at or beyond the cap, so no
sprite is drawn larger than the cap and none is brightened. The pass SHALL fade out
as the camera comes closer than a fixed distance to the cursor, and SHALL draw
nothing at 2,000 light years. The renderer SHALL expose a `clouds` switch beside the
switches for the volume, the points and the glow. The two powers, the two holds, the
reference radius, the cap, the fade distances and the brightness are look constants,
and the baseline image pins them.

#### Scenario: The two holds carry a known share of the set
- **WHEN** a unit test builds the cloud set with the default count and seed 7 and
  counts the samples whose stored density ratio lies below the floor constant and the
  samples whose ratio lies above the ceiling constant
- **THEN** the fraction below the floor is at least 0.20 and at most 0.32, and the
  fraction above the ceiling is at least 0.45 and at most 0.58

#### Scenario: Chunks from above
- **WHEN** the browser test renders the default view and, in the 120 x 120 pixel
  blocks centred on the projections of (-20,000, 0, 20,000), (25,000, 0, 40,000) and
  (8,000, 0, -4,000), subtracts from the 5 x 5 mean luminance at every second pixel
  the 41 x 41 mean at the same pixel, and divides the standard deviation of that
  residual by the block's 5 x 5 mean luminance less the mean of the four corner
  pixels
- **THEN** each result is at least 0.05 and at most 0.13

#### Scenario: Chunks from the side
- **WHEN** the browser test opens the view `#c=15,0,25895&d=40000&p=5&y=0` and
  applies the same measure to the blocks centred on the projections of
  (12,015, 565, 25,895) and (-19,985, 365, 25,895)
- **THEN** each result is at least 0.05

#### Scenario: Clouds carry light
- **WHEN** the browser test renders the default view, reads the mean luminance of the
  120 x 120 block centred on the projection of (-20,000, 0, 20,000) with the clouds
  on, then switches the clouds off and reads it again
- **THEN** the reading with the clouds on is at least 0.03 above the reading with
  them off

#### Scenario: Clouds reach the rim
- **WHEN** the browser test renders the default view, reads the 5 x 5 mean luminance
  at 72 points spaced evenly on the circle of radius 44,000 light years around the
  galactic centre in the plane and takes the median, then switches the clouds off and
  reads the median again
- **THEN** the median with the clouds on is at least 0.01 above the median with them
  off

#### Scenario: Clouds fade at close range
- **WHEN** the browser test opens the view `#c=-20000,0,20000&d=2000&p=35&y=0`,
  reads the mean luminance of the 120 x 120 block at the centre of the frame with
  the clouds on, then switches the clouds off and reads it again
- **THEN** the two readings differ by less than 0.005

#### Scenario: The sum of the sprites stays bounded
- **WHEN** the browser test opens the view `#c=-20000,0,20000&d=12000&p=35&y=0`,
  reads the mean luminance of the whole frame with the clouds on, then switches the
  clouds off and reads it again
- **THEN** the reading with the clouds on is at most 0.10 above the reading with them
  off

### Requirement: Frame budget
At 1920x1080 on the dev container's GPU, the mean render time over 300 consecutive
frames SHALL stay under 16.7 ms at zoom distances of 2,000, 12,000, 20,000, 30,000
and 120,000 light years from the cursor, with the cursor at Sol and at the galactic
centre. The cloud pass fades out below 12,000 light years, so it draws in full from
12,000. Each sprite fades out as its wanted radius passes half the pixel cap and is
not drawn at the cap, so the fill of one sprite is bounded by the cap's disc, and the
sprite layers per target pixel, measured on the cloud set's placement, peak between
12,000 and 30,000 light years. Render time is measured from the first draw call of a
frame to the return of `gl.finish()` and a one-pixel `readPixels` that follows it,
because `gl.finish()` alone returns before the card is done in Chromium; so it
includes GPU work and excludes display refresh waits, and the readback makes it a
superset of the draw time. The page SHALL expose a measurement function that renders
a given number of frames this way and returns their mean; the normal render loop
SHALL NOT call `gl.finish()`.

#### Scenario: Six views under budget
- **WHEN** the browser test sets each of the six views at 2,000, 20,000 and 120,000
  light years and calls the measurement function for 300 frames
- **THEN** each returned mean is under 16.7 ms

#### Scenario: Cloud views under budget
- **WHEN** the browser test sets the four views at 12,000 and 30,000 light years and
  calls the measurement function for 300 frames
- **THEN** each returned mean is under 16.7 ms
