## ADDED Requirements

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
