## MODIFIED Requirements

### Requirement: Three scene passes and a tone map compose the far view

Each frame SHALL draw the density volume by raymarching, then the cloud sprites, then
the star field and the point cloud as additive point sprites over them, and SHALL draw
the region boundary overlay after the tone map. Each point cloud sample SHALL carry the
handover factor the star field defines, which is 1 at every range when the zoom distance
is 8,000 light years or more, so the far view draws as it did before the star field
existed. The volume SHALL store density on
a logarithmic scale and decode it to linear density. At each step the decoded density
SHALL be multiplied by the surface detail ratio at the step's plane position. The
emission SHALL follow the density divided by the peak density of the volume through a
curve with two slopes on a logarithmic scale: a fixed power above a knee, and a larger
power below it, continuous at the knee. The knee SHALL sit at a density between the
density of the disc at Sol and the density of the disc at 14,000 light years from the
galactic centre, so the bulge and the disc share one display range, the inner disc
holds its light, and the patches of the outer disc keep their contrast. A fade by
galactocentric radius SHALL remove the density beyond the painted rim: full inside
47,000 light years and zero at 51,000. A fade by height SHALL remove the density
toward the top and the bottom of the volume, full inside 1,800 light years of the
mid-plane and zero at 2,880, so the bulge has no hard top. Neither fade SHALL depend
on density, so the space between the arms keeps its light. The extinction SHALL
absorb blue more than red. The ramp by emission SHALL have
two axes: the compressed density and the galactocentric radius. In the inner disc the
ramp SHALL run from a red-brown dust colour through a pale pink band to a near-white
core, so the lanes are red-brown and the bulge is white. In the outer disc the ramp
SHALL run from a blue haze to a dusty pink patch colour, so the space
between the patches is blue and the patches are pink. The radius SHALL blend the inner
ramp into the outer one; the blend SHALL NOT begin inside 14,000 light years and
SHALL be complete at 32,000. A final pass SHALL tone-map the sum with a curve that
reaches a white level below 1 and does not clip the bulge, so the bulge falls off
from the centre, and SHALL blend the result over a constant dark grey background as
`grey + (1 - grey) * colour`, so faint light stays above the background. The powers,
the knee, the two ramps, the blend radii, the extinction colour, the white level and
the grey are look constants in the shaders, and the baseline image pins them. The
galactic centre, the disc at Sol and the space between the arms are then visible in
the same frame, and the disc shows grain from the point cloud, which the cloud
sprites soften.

#### Scenario: Both structures visible at the default view

- **WHEN** the browser test renders the default view and samples the frame
- **THEN** the pixel at the galactic centre has luminance above 0.8 and below 0.97,
  its red channel exceeds its blue channel by at least 0.03 and at most 0.10, and its
  green channel exceeds its blue channel by at least 0.02 and at most 0.07 on a 0 to
  1 scale; the pixel at Sol has luminance above 0.2; and the pixel at (-45,000, 0, 0),
  which is outside the disc and inside the default view, has luminance below 0.12

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
  at 72 points spaced evenly on each of the circles of radius 20,000, 32,000 and
  38,000 light years around the galactic centre in the plane, and subtracts the mean
  of the four corner pixels from each reading
- **THEN** on the circles at 32,000 and 38,000 the 90th percentile is at least 2.5
  times the 10th percentile, and on the circle at 20,000 the 90th percentile is at
  least 1.2 times the 10th percentile

#### Scenario: The inner disc holds its light

- **WHEN** the browser test renders the default view, reads the 5 x 5 mean luminance
  at 72 points spaced evenly on each of the circles of radius 14,000, 20,000 and
  32,000 light years around the galactic centre in the plane, subtracts the mean of
  the four corner pixels from each reading, and takes the median of each circle
- **THEN** the median at 14,000 is at least 0.56, the median at 20,000 is at least
  0.42, and the median at 32,000 is at least 0.12 and at most 0.22

#### Scenario: Dust lanes are red-brown

- **WHEN** the browser test renders the default view, reads the 5 x 5 mean colour at
  72 points spaced evenly on each of the circles of radius 14,000 and 20,000 light
  years around the galactic centre in the plane, subtracts the mean colour of the
  four corner pixels from each reading, computes for each point red less green over
  the sum of the three channels, and splits each circle into the 18 points with the
  lowest luminance and the 18 points with the highest
- **THEN** at 14,000 the median of the dark 18 is at least 0.08 and the median of the
  bright 18 is at most 0.045, and at 20,000 the median of the dark 18 is at least
  0.065

#### Scenario: The outer haze is blue and its patches are pink

- **WHEN** the browser test renders the default view, reads the 5 x 5 mean colour at
  72 points spaced evenly on each of the circles of radius 38,000 and 44,000 light
  years around the galactic centre in the plane, subtracts the mean colour of the
  four corner pixels from each reading, computes for each point blue less red over
  the sum of the three channels, and splits each circle into the 18 points with the
  lowest luminance and the 18 points with the highest
- **THEN** on each circle the median of the dark 18 is at least 0.10, and on the
  circle at 38,000 the median of the bright 18 is at most 0.02

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

#### Scenario: The added passes leave the far view alone

- **WHEN** the browser test renders the default view at 1280x720 with the star pass and
  the region overlay switched on, and again with both switched off
- **THEN** the two image files are byte-identical

### Requirement: Rendering is camera-relative
The renderer SHALL subtract the camera position from world positions before any
`float32` matrix multiplication, with the subtraction done in `float64` on the CPU per
chunk. The error that remains is that of `float32` arithmetic on the camera-relative
position, and it grows in proportion to the zoom distance. For any cursor inside the
model bounds, any yaw and any pitch, two points 1/32 light year apart SHALL map to clip
positions whose separation is within `1e-2 * distance / 2,000` relative of the exact
transform, so within 2.5e-3 at the closest zoom distance of 500 light years. The figure
is the `float32` limit: at 2,000 light years the separation is 1/64,000 of the
coordinate, about 2^-16, which leaves 8 of the 24 mantissa bits, so one rounding is
about 4e-3 of the separation and the measured worst case is 4.6e-3. A transform that
keeps the camera translation in the `float32` matrix SHALL be more than 10 times worse
at the far corner; that difference is what the subtraction buys.

#### Scenario: Precision at the far corner
- **WHEN** a unit test places the cursor at (50,000, 0, 75,000), sets the distance to
  2,000 light years, and pushes two points 1/32 light year apart through a `float32`
  emulation of the vertex transform
- **THEN** the separation in clip space is within 1e-2 relative of the `float64` result

#### Scenario: Bound scales with the distance
- **WHEN** the unit test repeats the emulation at Sol, the galactic centre, the far
  corner and the bounds corners, at distances 500, 2,000, 20,000 and 120,000, over a
  sweep of yaws and pitches
- **THEN** every relative error is below `1e-2 * distance / 2,000`

#### Scenario: Camera in the matrix is worse
- **WHEN** the unit test keeps the camera translation inside the `float32` matrix at
  the far corner and distance 2,000
- **THEN** that error is more than 10 times the camera-relative error
