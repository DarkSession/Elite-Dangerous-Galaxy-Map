# far-view-rendering Specification

## Purpose
Draws the far view of the galaxy from scene data with hardware-accelerated WebGL2, with
the look of the game's galaxy map, exact positions at every distance, and a frame budget.

## Requirements

### Requirement: Hardware rendering is asserted
At startup the renderer SHALL read the unmasked renderer string through
`WEBGL_debug_renderer_info`, or `RENDERER` when that extension is absent, and expose it
on the page. If the string contains `SwiftShader`, `llvmpipe` or `Software`, the page
SHALL show an error message that names the renderer and SHALL NOT start the render
loop. The browser test suite SHALL fail when the exposed string is missing, empty, or
names a software renderer.

#### Scenario: Software renderer detected
- **WHEN** the page starts and the renderer string contains `SwiftShader`
- **THEN** the page shows an error that contains `SwiftShader` and no frame is drawn

#### Scenario: Suite asserts the renderer
- **WHEN** the browser test suite runs
- **THEN** its first test reads the exposed renderer string and fails if it is missing,
  empty, or names a software renderer

#### Scenario: No GPU means a software string or no string
- **WHEN** the suite runs with Chromium started with `--disable-gpu`
- **THEN** the first test fails, because the exposed string names `SwiftShader`, which
  is what current Chromium falls back to, or because the string is missing


### Requirement: WebGL2 is required
If the browser gives no WebGL2 context, the page SHALL show a message that says WebGL2
is required and SHALL NOT throw.

#### Scenario: No WebGL2
- **WHEN** the page starts in a browser that returns null for a `webgl2` context
- **THEN** the page shows the message and the console has no uncaught error


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
  the points, the clouds, the glow and the region overlay off, and reads the luminance
  of every pixel row on the vertical line through the projection of the galactic centre
  from the plane up to 4,000 light years above it
- **THEN** no two adjacent rows differ by more than 0.05

  The reading is about the top of the bulge, so it switches off every pass that is not
  the volume. The view sits at 25,000 light years, which is inside the band where the
  region overlay fades in, and the camera looks along the plane, so a boundary line
  crosses the column the test reads. A 4 CSS pixel line makes a step of 0.14 there
  against the limit of 0.05, and a half CSS pixel line made one of 0.04. The overlay is
  not part of the bulge, so it goes off with the other passes rather than the limit
  going up.

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


### Requirement: Orientation matches the game
The map SHALL show the galaxy with `+y` up and with the galactic centre toward the top
of the screen at the default view. `+x` in game coordinates SHALL project to the right
of Sol when the camera looks from Sol toward the centre.

#### Scenario: Centre is up
- **WHEN** a unit test projects Sol and the galactic centre with the default view
- **THEN** the centre's screen `y` is above Sol's screen `y`

#### Scenario: Plus x is right
- **WHEN** a unit test projects Sol and (10,000, 0, 0) with the default view
- **THEN** the second point's screen `x` is greater than Sol's


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


### Requirement: Canvas follows the window
The canvas SHALL fill the viewport and SHALL resize its drawing buffer to the viewport
size times the device pixel ratio, capped at 2, when the window resizes.

#### Scenario: Resize
- **WHEN** the browser test resizes the viewport to 800x600 at device pixel ratio 2
- **THEN** the drawing buffer is 1600x1200


### Requirement: Glow surrounds the disc
A blurred copy of the volume and cloud passes SHALL be added to the scene before the
tone map, scaled by a weight and tinted toward the haze colour. The copy SHALL be
downsampled with a box filter before the blur, so no source pixel is skipped. The
downsample SHALL hold the source luminance down to a clamp, so the brightest pixels do
not spread over the whole frame. The blur radius SHALL be a fixed fraction of the
frame height, so the halo has the same width at every viewport size. The glow SHALL stay a halo: the sky above the disc at a side
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


### Requirement: Cloud sprites give the haze its chunks

The renderer SHALL draw the cloud sample set, at most 40,000 samples, as large soft
additive sprites before the point pass, so the haze is made of overlapping puffs in
three dimensions. Each sprite SHALL take a shape from the shape set, with the shape and
a rotation chosen by a hash of the sample index, and SHALL have the on-screen radius its
sample's radius gives at its range. The brightness of a sprite SHALL be a look constant
times its sample's density ratio, held between a floor and a ceiling and divided by the
ceiling, raised to one power, times its radius over a reference radius raised to a
second power, so that the light per unit area follows the density between the two holds.
Below the floor the brightness SHALL keep falling, with a third and gentler power on the
ratio over the floor, so a sprite where the arms end is brighter than one in empty space
and the sprites past the model's truncation go faint. The floor SHALL set the level the
outer disc falls from, and the two holds SHALL carry a known share of the set. With the
shipped constants the floor lies near the 20th percentile of the density ratios on the
ring at 32,000 light years, so most of the outer disc still follows the density there,
and the ceiling is reached by 96 percent of the ring at 20,000 light years, so the bulge
does not take the light of the whole set. Each sprite SHALL also carry a brightness
spread: a factor with mean 1 over a fixed ground that stays out of the spread, from a
hash of the sample index, applied in full where the held ratio is at the floor and not
at all at or above three times the floor, so the puffs of the outer disc differ from one
another, the faint sprites still lay the ground of the haze, and the inner disc keeps
its smooth sum. The spread SHALL NOT lift a sprite above the brightness of a sprite at
the ceiling ratio, so the spread modulates the density and is never the source of a
puff. The colour of a sprite SHALL follow the volume's two ramps, blended by the same
two galactocentric radii. Over the inner disc it SHALL run from the lane colour to the
band colour with the sample's zone, so the sprites carry the lanes rather than one flat
colour over them. Over the outer disc it SHALL run from the haze colour to the arm
colour with the zone, and where the spread applies from the haze colour to the patch
colour with the light the sprite carries, relative to a fixed level at which it takes
the whole patch colour, the same key as the spread blending the two, so the puffs where
the arms end are pink on a blue ground. The colour SHALL then move toward the core
colour by zone. The brightness SHALL fade by galactocentric radius, full at 44,000 light
years and zero at 48,000, so no sprite carries light outside the painted rim. A sprite
SHALL fade out as its wanted radius rises from half the pixel cap to the cap, and SHALL
NOT be drawn at or beyond the cap, so no sprite is drawn larger than the cap and none is
brightened. The pass SHALL fade out as the camera comes closer than a fixed distance to
the cursor, and SHALL draw nothing at 2,000 light years. The renderer SHALL expose a
`clouds` switch beside the switches for the volume, the points and the glow. The three
powers, the two holds, the spread power, the spread ground, the spread colour level, the
ramp stops and their keys, the blend radii, the reference radius, the cap, the fade
distances, the rim fade radii and the brightness are look constants, and the baseline
image pins them.

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
  galactic centre in the plane and takes the median and the 90th percentile, then
  switches the clouds off and reads both again
- **THEN** the 90th percentile with the clouds on is at least 0.02 above the 90th
  percentile with them off, and the median with the clouds on is at least 0.005
  above the median with them off

#### Scenario: Puffs at the rim stand apart

- **WHEN** the browser test renders the default view, reads the 5 x 5 mean luminance
  at 72 points spaced evenly on the circle of radius 44,000 light years around the
  galactic centre in the plane, and subtracts the mean of the four corner pixels from
  each reading
- **THEN** the 10th percentile is above 0 and the 90th percentile is at least 1.6
  times the 10th percentile

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
