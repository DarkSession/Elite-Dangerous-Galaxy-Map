## ADDED Requirements

### Requirement: Cloud sprites give the haze its chunks
The renderer SHALL draw a random subset of the point cloud, at most 10,000 samples, as
large soft additive sprites before the point pass, so the haze is made of chunks in
three dimensions. The sprites are part of the far view: the pass SHALL fade out as the
camera comes closer than a fixed distance to the cursor, and SHALL draw nothing at
2,000 light years. The renderer SHALL expose a `clouds` switch beside the switches for
the volume, the points and the glow.

#### Scenario: Chunks from above
- **WHEN** the browser test renders the default view and, in the 120 x 120 pixel
  blocks centred on the projections of (-20,000, 0, 20,000), (25,000, 0, 40,000) and
  (8,000, 0, -4,000), subtracts from the 5 x 5 mean luminance at every second pixel
  the 41 x 41 mean at the same pixel, and divides the standard deviation of that
  residual by the block's 5 x 5 mean luminance less the mean of the four corner
  pixels
- **THEN** each result is above 0.10

#### Scenario: Chunks from the side
- **WHEN** the browser test opens the view `#c=15,0,25895&d=40000&p=5&y=0` and
  applies the same measure to the blocks centred on the projections of
  (12,015, 565, 25,895) and (-19,985, 365, 25,895)
- **THEN** each result is above 0.10

#### Scenario: Clouds carry light
- **WHEN** the browser test renders the default view, reads the mean luminance of the
  120 x 120 block centred on the projection of (-20,000, 0, 20,000) with the clouds
  on, then switches the clouds off and reads it again
- **THEN** the reading with the clouds on is at least 0.03 above the reading with
  them off

#### Scenario: Clouds fade at close range
- **WHEN** the browser test opens the view `#c=-20000,0,20000&d=2000&p=35&y=0`,
  reads the mean luminance of the 120 x 120 block at the centre of the frame with
  the clouds on, then switches the clouds off and reads it again
- **THEN** the two readings differ by less than 0.005

### Requirement: The tone map dithers
The tone map SHALL add a dither of one 8-bit step, triangular, from a hash of the
pixel position, before the frame is quantised, so smooth gradients do not show bands.
The dither SHALL NOT depend on time, so the baseline image is stable.

#### Scenario: Flat colour is dithered
- **WHEN** the browser test switches every pass off, renders the default view and
  reads the green channel of the 200 pixels from (2, 2) down to (2, 201)
- **THEN** the mean absolute difference between adjacent pixels is at least 0.25 of
  one 8-bit step, the values take at most three distinct 8-bit levels, and the mean
  is within one step of the background

#### Scenario: Dither is stable
- **WHEN** the browser test takes two screenshots of the default view, one frame apart
- **THEN** the two image files are byte-identical

## RENAMED Requirements

- FROM: `### Requirement: Two scene passes and a tone map compose the far view`
- TO: `### Requirement: Three scene passes and a tone map compose the far view`

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
run through four colours: a blue-violet haze, tan arms, an orange-red band at the
edge of the bulge, and a cream-yellow core. A final pass SHALL tone-map the sum with
a curve that reaches a white level below 1 and does not clip the bulge, so the bulge
falls off from the centre, and SHALL blend the result over a constant dark grey
background as `grey + (1 - grey) * colour`, so faint light stays above the
background. The powers, the knee, the ramp, the extinction colour, the white level
and the grey are look constants in the shaders, and the baseline image pins them.
The galactic centre, the disc at Sol and the space between the arms are then visible
in the same frame, and the disc shows grain from the point cloud.

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
- **THEN** at (9,015, 0, 25,895) red exceeds green by at least 0.12; at Sol red
  exceeds blue by at least 0.12 and green exceeds blue by at least 0.02; and the
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
- **THEN** the result is above 0.06

#### Scenario: Look matches the baseline
- **WHEN** the browser test renders the default view at 1280x720
- **THEN** the frame matches the committed baseline image with at most 2 percent of
  pixels differing

### Requirement: Glow surrounds the disc
A blurred copy of the volume and cloud passes SHALL be added to the scene before the
tone map, scaled by a weight and tinted toward the haze colour. The copy SHALL be
downsampled with a box filter before the blur, so no source pixel is skipped. The blur
radius SHALL be a fixed fraction of the frame height, so the halo has the same width
at every viewport size. The glow SHALL stay a halo: the sky above the disc at a side
view stays near the background. The renderer SHALL expose a switch that turns the glow
off, beside the switches for the volume, the clouds and the points.

#### Scenario: Halo past the rim
- **WHEN** the browser test renders the default view and samples the pixel at
  (-48,985, 0, 25,895), which lies 49,000 light years from the galactic centre, past
  the painted rim
- **THEN** its luminance with the glow is at least 0.02 and at most 0.05 above its
  luminance with the glow switched off, and below the luminance at Sol

#### Scenario: Sky stays dark from the side
- **WHEN** the browser test opens the view `#c=15,0,25895&d=70000&p=5&y=0` and
  samples the pixels at (15, 5,965, 25,895) and (15, 11,965, 25,895), which lie
  6,000 and 12,000 light years above the galactic centre
- **THEN** the first has luminance at most 0.20 and the second at most 0.08

### Requirement: Frame budget
At 1920x1080 on the dev container's GPU, the mean render time over 300 consecutive
frames SHALL stay under 16.7 ms at zoom distances of 2,000, 12,000, 20,000 and
120,000 light years from the cursor, with the cursor at Sol and at the galactic
centre. The cloud pass is fully on from 12,000 light years and its sprites are at their
size cap below 22,000, so the distances of 12,000 and 20,000 bracket its peak fill.
Render time is measured
from the first draw call of a frame to the return of `gl.finish()` and a one-pixel
`readPixels` that follows it, because `gl.finish()` alone returns before the card is
done in Chromium; so it includes GPU work and excludes display refresh waits, and the
readback makes it a superset of the draw time. The page SHALL expose a measurement
function that renders a given number of frames this way and returns their mean; the
normal render loop SHALL NOT call `gl.finish()`.

#### Scenario: Six views under budget
- **WHEN** the browser test sets each of the six views at 2,000, 20,000 and 120,000
  light years and calls the measurement function for 300 frames
- **THEN** each returned mean is under 16.7 ms

#### Scenario: Cloud views under budget
- **WHEN** the browser test sets the two views at 12,000 light years and calls the
  measurement function for 300 frames
- **THEN** each returned mean is under 16.7 ms
