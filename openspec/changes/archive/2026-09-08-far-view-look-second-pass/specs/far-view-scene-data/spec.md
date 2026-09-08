## ADDED Requirements

### Requirement: Scene data carries the surface detail
Scene data SHALL include a surface detail grid of 1024 x 1024 `uint8` cells over the
model bounds in `x` and `z`, with cell (0, 0) at the low corner and `x` fastest. Each
cell SHALL encode the ratio of the detailed to the corrected surface density at the
cell's centre as `round(127 * clamp(ln(ratio), -3, 3) / 3) + 128`. The grid SHALL
report its origin, its extent and the scale 3. The grid SHALL be transferable like
the other scene data.

#### Scenario: Ratio at Sol
- **WHEN** a test decodes the cell that contains Sol as `exp((value - 128) * 3 / 127)`
- **THEN** the result is within a factor of 1.03 of the model's detailed surface
  density divided by its corrected surface density at that cell's centre

#### Scenario: Transferable
- **WHEN** a test posts a scene-data object with the detail grid's buffer in the
  transfer list
- **THEN** the receiver gets equal contents and the sender's buffer has length 0

## MODIFIED Requirements

### Requirement: Point cloud samples the model
The point cloud SHALL hold a requested number of samples, default 2,000,000. Each sample
SHALL hold a position in game coordinates in light years as three `float32` values, and
one `uint8` tint equal to the population zone at the sample's `(x, z)` scaled to 0 to
255. Sample positions SHALL lie inside the model bounds. The sample density SHALL
follow the detailed volume density of the model: the detailed surface density times
the vertical profile.

#### Scenario: Count and bounds
- **WHEN** a test requests 100,000 samples
- **THEN** it receives exactly 100,000 positions, all inside the model bounds

#### Scenario: Radial distribution
- **WHEN** a test requests 200,000 samples and counts those within 10,000 light years
  of the galactic centre in the plane
- **THEN** the fraction is within 0.03 absolute of the model's mass fraction inside
  that radius, computed by numeric integration of the detailed surface density

#### Scenario: Vertical distribution
- **WHEN** a test requests 200,000 samples and counts those within 210 light years of
  the mid-plane among samples 19,000 to 21,000 light years from the centre in the plane
- **THEN** the fraction is within 0.03 absolute of the model's column mass fraction
  within that height at 20,000 light years

#### Scenario: Deterministic
- **WHEN** a test generates the point cloud twice with seed 7
- **THEN** the two position arrays are byte-identical
