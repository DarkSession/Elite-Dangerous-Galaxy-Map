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
the region boundary overlay and then the real-system markers after the tone map. Each
overlay draws over the finished frame, so neither adds light the tone map reads and
neither changes a look constant of the far view. Each point cloud sample SHALL carry the
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

- **WHEN** the browser test renders the default view at 1280x720 with the star pass, the
  region overlay and the marker pass switched on and no system in the set, and again with
  all three switched off
- **THEN** the two image files are byte-identical

### Requirement: Rendering is camera-relative
The renderer SHALL subtract the camera position from world positions before any
`float32` matrix multiplication, with the subtraction done in `float64` on the CPU per
chunk. The error that remains is that of `float32` arithmetic on the camera-relative
position, and it grows in proportion to the zoom distance. For any cursor inside the
model bounds, any yaw and any pitch, two points 1/32 light year apart SHALL map to clip
positions whose separation is within `1e-2 * distance / 2,000` relative of the exact
transform, so within 5e-5 at the closest zoom distance of 10 light years. The figure
is the `float32` limit: at 2,000 light years the separation is 1/64,000 of the
coordinate, about 2^-16, which leaves 8 of the 24 mantissa bits, so one rounding is
about 4e-3 of the separation and the measured worst case is 4.5e-3.

The rule holds to the new closest zoom without a change to it. At 10 light years the
separation of 1/32 is 1/320 of the coordinate, which leaves about 16 mantissa bits, and
the measured worst case is 2.8e-5 against the bound's 5e-5. The constant the test carries
is the bound **at the closest zoom distance**, so moving the closest zoom from 500 to 10
moves that constant from 2.5e-3 to 5e-5; the rule `1e-2 * distance / 2,000` is what both
express and it does not move.

The reading at 10 light years SHALL be taken with the near plane the view gives it, which
`map-navigation` puts at a tenth of the zoom distance. The near plane sets the projection
matrix, so it moves this measurement: the same sweep against a near plane fixed at 10 light
years reads 2.6e-5, and against the rule's 1 light year it reads 2.8e-5. Only the second is
the figure the map will produce.

A transform that keeps the camera translation in the `float32` matrix SHALL be more than 10
times worse at the far corner; that difference is what the subtraction buys.

#### Scenario: Precision at the far corner
- **WHEN** a unit test places the cursor at (50,000, 0, 75,000), sets the distance to
  2,000 light years, and pushes two points 1/32 light year apart through a `float32`
  emulation of the vertex transform
- **THEN** the separation in clip space is within 1e-2 relative of the `float64` result

#### Scenario: Bound scales with the distance
- **WHEN** the unit test repeats the emulation at Sol, the galactic centre, the far
  corner and the bounds corners, at distances 10, 500, 2,000, 20,000 and 120,000, over a
  sweep of yaws and pitches
- **THEN** every relative error is below `1e-2 * distance / 2,000`. The measured worst
  cases are 2.8e-5 at 10, 9.6e-4 at 500, 4.5e-3 at 2,000, 5.3e-2 at 20,000 and 0.195 at
  120,000, each below 0.6 of the bound

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

### Requirement: A still map draws at an idle rate
No shader reads a clock, so a map nobody touches draws the picture it drew before. The
frame loop SHALL run at the rate of the display for 1200 ms after a change, and it SHALL
then stop. A change SHALL wake the loop, and a loop that woke SHALL draw the next animation
frame. A change is a write of the view, a
resize, a draw asked for from outside the loop, a call of any member of the handle that
changes what the map draws (the record and shape members,
the category and name filters, the visibility switches and the selection), an input on
the canvas that moves the view only when the loop turns (a wheel notch or a key press),
and the arrival of a thing the map fetched after it started: the scene data, the nebulae
and an icon texture. A flight in progress and a pending start SHALL hold the loop awake.
A drag, a glide and a held key hold it awake by the view writes they make each turn.

The name of this requirement is historical: the idle rate is now zero.

The loop drew one frame each 200 ms while nothing changed, because the icon texture
landed without a wake. Every path that changes the picture now wakes the loop, so the
idle draw has nothing left to cover, and a map nobody touches costs no frame.

The 1200 ms holds the label ease. The region label anchors and targets approach their
place by half-life, and a measurement of a 22,000 light year jump has a label move more
than a twentieth of a CSS pixel until 886 ms after the jump. The stopped map therefore
draws no frame in which a label moves where the user can see it.

**A turn renders the canvas only after a change.** The loop SHALL run the overlay work on
every turn while it runs, because the labels ease. It SHALL render the canvas on a turn
only where one of these changed since the last render:

- a change woke the loop;
- the view;
- the size of the drawing buffer;
- the read-back switch of the background pass;
- the version of the system set, of its categories or of the shape set;
- a value that a renderer setter took.

A turn that renders nothing SHALL keep the pixels of the last render, and SHALL still take
a background reading that is ready. Such a turn SHALL NOT count as a drawn frame in
`frameStats`. The context preserves its drawing buffer, so the pixels stay on the screen.

The pending start of `library-package` expires after the map "has drawn 600 frames". That
count SHALL be the turns that ran the frame work, whether or not they rendered. A pending
start holds the loop awake with nothing to render, so a count of renders would never
reach 600.

The settle window after an interaction held about 71 renders of a picture that did not
change. At 50,000 systems with 4 icons each, the review of 2026-09-22 measured the settle
turn at 2.34 ms with the render and at 0.25 ms without it.

**A draw asked for from outside the loop SHALL always render.** A browser test that
writes a look setting in place and then asks for a draw reads the new picture. A read of
the `look` probe on `debug` SHALL count as a change, because a test writes the look
through the object that the probe gives back. The `wake` probe on `debug` SHALL count as a
change as well, so a test that calls it on each frame reads a render on each frame.

**A pointer move alone renders no canvas.** A pointer move is not a change: it SHALL
restart a stopped loop for one overlay frame and SHALL NOT move the settle window. The
renderer reads no hover: the hover ring and the hovered name label are overlay elements.
A frame in which nothing but the pointer changed since the last drawn frame SHALL run the
pick and the marker overlay, and SHALL NOT render the canvas. Such a frame SHALL NOT count as a
drawn frame in `frameStats`.

**The hover pick SHALL run only where its inputs changed.** Its inputs are the view, the
pointer, the system set with its categories and filters, and the canvas size. A turn in
which none of them changed SHALL keep the hover of the turn before.

#### Scenario: A still map drops to the idle rate
- **WHEN** the browser test opens the map, waits out the settle window and reads the
  drawn frames and the loop turns over two seconds
- **THEN** the map draws no frame and the loop does not turn

  The scenario keeps its name so the delta drops nothing. The idle rate is now zero.

#### Scenario: A view change wakes the loop
- **WHEN** the browser test waits out the settle window, writes the view once, and reads
  the loop turns and the drawn frames over the next 300 milliseconds
- **THEN** the loop turns more than 10 times, and the map draws at least 1 and at most 3
  frames

  At the rate of the display 300 ms is 18 turns. Before this change the map drew each of
  them. The read-back switch can change once after a jump, so the bound is 3 and not 1.

#### Scenario: A turn with no change keeps the picture
- **WHEN** the browser test writes a view with the grid off, waits 500 milliseconds, reads
  the sum of the pixels of the frame, then asks for a draw from outside the loop and reads
  the sum again
- **THEN** the two sums are equal

#### Scenario: The wake probe renders on each frame
- **WHEN** the browser test waits out the settle window and calls the `wake` probe on each
  of 20 animation frames, and reads the drawn frames
- **THEN** the map draws at least 18 frames

#### Scenario: A look write through the probe reaches the screen
- **WHEN** the browser test waits out the settle window, sets the look's nebula light gain
  to zero through the `look` probe, waits three animation frames and reads the sum of the
  pixels of a nebula
- **THEN** the sum equals the sum a draw from outside the loop gives for the same look

#### Scenario: No label moves after the settle window
- **WHEN** the browser test jumps the camera 22,000 light years, reads the box of every
  region label 1300 ms later, and reads them again 1200 ms after that
- **THEN** no label moved by a tenth of a CSS pixel

#### Scenario: A switch on the handle wakes the loop
- **WHEN** the browser test waits out the settle window, turns the grid off and reads
  the drawn frames over the next three animation frames
- **THEN** the map drew at least one of them

#### Scenario: A wheel notch wakes the loop
- **WHEN** the browser test waits out the settle window, sends one wheel notch to the
  canvas and reads the drawn frames over the next 300 milliseconds
- **THEN** the map draws more than 10 frames

#### Scenario: A held key holds the loop
- **WHEN** the browser test waits out the settle window, presses `W` and holds it for
  three seconds, and reads the drawn frames
- **THEN** the map draws more than 100 frames

#### Scenario: An icon texture wakes the loop
- **WHEN** the browser test waits out the settle window, adds one system with an icon
  that names a host URL the map has not loaded, waits for the load to settle and reads
  the drawn frames since the texture landed
- **THEN** the map drew at least one of them, and the icon is in the placements

#### Scenario: A pointer move over a still camera renders no canvas
- **WHEN** the browser test waits out the settle window, moves the pointer across the
  canvas for three seconds over a set of 1,000 systems, and reads the drawn frames and
  the hover ring
- **THEN** the drawn frames are 0, and the hover ring sits under the pointer

#### Scenario: A still pointer runs no pick
- **WHEN** a unit test asks the kept hover pick three times: twice with the same view
  epoch, pointer, set versions and canvas size, and once with the pointer one pixel away
- **THEN** the pick runs twice, and the second answer is the first one

### Requirement: Canvas follows the window
The canvas SHALL fill the viewport and SHALL resize its drawing buffer to the viewport
size times the device pixel ratio, capped at 2, when the window resizes.

The canvas SHALL also follow its own box. A host can change the size of the canvas box
with no resize of the window, for example when it opens a side panel. The map SHALL treat
a change of the canvas box as a resize, and a stopped loop SHALL wake for it.

A change of the drawing buffer size clears the buffer. The map SHALL NOT paint a frame in
which the buffer was cleared and not drawn again.

#### Scenario: Resize
- **WHEN** the browser test resizes the viewport to 800x600 at device pixel ratio 2
- **THEN** the drawing buffer is 1600x1200

#### Scenario: A host resizes the canvas box
- **WHEN** the browser test waits out the settle window at device pixel ratio 1, sets the
  width of the canvas to 600 CSS pixels with no resize of the window, and waits three
  animation frames
- **THEN** the drawing buffer is 600 pixels wide, and in the first animation frame after
  the change the sum of the canvas pixels is above 0

### Requirement: Glow surrounds the disc
A blurred copy of the volume, cloud and nebula passes SHALL be added to the scene before
the tone map, scaled by a weight and tinted toward the haze colour. The copy SHALL be
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

#### Scenario: No nebula reaches the glow at the default view
- **WHEN** the browser test renders the default view at 60,000 light years with the
  nebula pass on and then with it off
- **THEN** the two frames are the same, because the nebula fade by zoom distance gives
  every record weight 0 at and above 20,000 light years

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

### Requirement: The volume march builds its ray from the near plane point

The camera sits at the origin of the camera-relative world frame, so the unprojected
near plane point of a pixel is already the direction of that pixel's ray. The volume
pass SHALL build the ray of a pixel from that one point. It SHALL NOT build the ray as
the difference between the unprojected far point and the unprojected near point.

The pass SHALL NOT read an unprojected point, or any value of the far plane's
magnitude, as an interpolated value. It SHALL read the pixel's position on the screen,
which stays inside -1 to 3 on both axes however it is written, and it SHALL unproject
for each fragment. The rule binds what the pass reads and not what the vertex shader
emits, because that shader is shared and another pass may need a value of its own.

The rule exists because the far point's `w` is formed by a cancellation. The far plane
is 1,000,000 light years, so at the far plane the two large entries of the inverse
matrix's `w` row cancel down to 1e-6, and the rounding the inverse leaves in that row's
first two entries is about 1.5e-8 at a corner of the triangle. The far point of each
corner therefore carries a scale error of 1 to 3 per cent, and a different one at each
corner. One pixel survives that, because a scale does not turn a ray; interpolation does
not, because it mixes three vectors of unequal scale. A direction carried that way sits
up to 2.6 degrees from the `float64` direction over near planes 1.80 to 2.04 light
years at the view the scenarios below use. At the one pixel the unit test scenario
reads it is 2.1 degrees. The error moves whenever the projection matrix moves.

The near plane point escapes the cancellation: its `w` is the sum of the same two
entries rather than their difference, so the same rounding is 3e-8 relative to it.

This is the rule the coordinate grid pass already states and uses for the same frame.

**Mean luminance**, wherever the scenarios below use it, is
`0.2126 red + 0.7152 green + 0.0722 blue` over 255, averaged over the pixels named, so
it runs from 0 to 1. It is the measure the look suite already reads.

#### Scenario: The reconstruction holds its direction against the near plane

- **WHEN** a unit test pushes one pixel near the top of the screen through a `float32`
  emulation of the volume pass's ray reconstruction, at the view
  `#c=-4.15271,-50.71937,-152.73213&d=146.35196&p=34.56875&y=19.66992` on a 1600 x 1000
  frame, over near planes from 1.80 to 2.04 light years in steps of 0.02
- **THEN** the angle between every reconstructed direction and the `float64` direction
  for the same matrix is below **1e-3 degrees**
- **AND** the same emulation of a difference of the far and the near points, carried
  across the triangle, is more than 0.1 degrees from the `float64` direction at one or
  more of those near planes, so the test fails on the reconstruction this requirement
  replaces

#### Scenario: Zooming does not step the volume picture

- **WHEN** the browser test opens
  `#c=-4.15271,-50.71937,-152.73213&d=146.35196&p=34.56875&y=19.66992`, draws with the
  volume pass alone on a 1600 x 1000 canvas, and reads the mean luminance of the top 30
  rows at each zoom distance from 19.0 to 20.0 light years in steps of 0.005
- **THEN** no step between two neighbouring readings is larger than **0.002**

#### Scenario: Orbiting does not step the volume picture

- **WHEN** the same test reads the same measure over yaw from 19.0 to 20.0 degrees in
  steps of 0.005 degrees, and again over pitch from 34.0 to 35.0 degrees in steps of
  0.005 degrees, both at a zoom distance of 146.35196 light years
- **THEN** no step between two neighbouring readings is larger than **0.002** in either
  sweep
