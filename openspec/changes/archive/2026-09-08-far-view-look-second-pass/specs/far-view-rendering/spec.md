## ADDED Requirements

### Requirement: Glow surrounds the disc
A blurred copy of the volume pass SHALL be added to the scene before the tone map,
scaled by a weight and tinted toward the haze colour. The blur radius SHALL be a fixed
fraction of the frame height, so the halo has the same width at every viewport size.
The renderer SHALL expose a switch that turns the glow off, beside the switches for
the volume and the points.

#### Scenario: Halo past the rim
- **WHEN** the browser test renders the default view and samples the pixel at
  (-48,985, 0, 25,895), which lies 49,000 light years from the galactic centre, past
  the painted rim
- **THEN** its luminance with the glow is at least 0.05 above its luminance with the
  glow switched off, and below the luminance at Sol

## MODIFIED Requirements

### Requirement: Two scene passes and a tone map compose the far view
Each frame SHALL draw the density volume by raymarching, then the point cloud as additive
point sprites over it. The volume SHALL store density on a logarithmic scale and decode
it to linear density. At each step the decoded density SHALL be multiplied by the
surface detail ratio at the step's plane position. The emission SHALL be a fixed power
of that density divided by the peak density of the volume. A fade by galactocentric
radius SHALL remove the density beyond the painted rim: full inside 47,000 light years
and zero at 51,000. The fade SHALL NOT depend on density, so the space between the
arms keeps its light. The extinction SHALL absorb blue more than red, so dust lanes
are brown. A final pass SHALL tone-map the sum with a curve that reaches a white level
below 1, so the bulge stays cream, and SHALL blend the result over a constant dark
grey background as `grey + (1 - grey) * colour`, so faint light stays above the
background. The power, the ramp, the extinction colour, the white level and the grey are look
constants in the shaders, and the baseline image pins them. The galactic centre, the
disc at Sol and the space between the arms are then visible in the same frame, and
the disc shows grain from the point cloud.

#### Scenario: Both structures visible at the default view
- **WHEN** the browser test renders the default view and samples the frame
- **THEN** the pixel at the galactic centre has luminance above 0.8 and below 0.97,
  and its red channel exceeds its blue channel by at least 0.08 on a 0 to 1 scale; the
  pixel at Sol has luminance above 0.2; and the pixel at (-45,000, 0, 0), which is
  outside the disc and inside the default view, has luminance below 0.12

#### Scenario: Space between the arms keeps its light
- **WHEN** the browser test samples the pixel at (13,736, 0, 2,116), where the game's
  map holds 8 percent of the density at Sol
- **THEN** its luminance is above 0.10 and below the luminance at Sol

#### Scenario: Background is dark grey
- **WHEN** the browser test samples the four pixels 2 pixels inside the corners of the
  frame at the default view
- **THEN** each has luminance between 0.02 and 0.06

#### Scenario: Points alone rise above the background
- **WHEN** the browser test renders the default view with the volume and the glow
  switched off and the points on
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
