## MODIFIED Requirements

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
