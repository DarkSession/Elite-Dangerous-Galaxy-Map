# far-view-scene-data Specification

## Purpose
Turns the galaxy density model into the two data sets the far view draws, a point cloud
and a density volume, as plain typed arrays that carry no rendering types.

## Requirements

### Requirement: Scene data carries no rendering types
Scene data SHALL consist of typed arrays and plain numbers only. It SHALL be
transferable between a worker and the main thread without copying. No scene-data module
SHALL import a rendering module.

#### Scenario: Transferable
- **WHEN** a test posts a scene-data object through a `MessageChannel` with its buffers
  in the transfer list
- **THEN** the receiver gets equal contents and the sender's buffers have length 0

#### Scenario: No rendering import
- **WHEN** a lint rule checks imports under the scene-data directory
- **THEN** no import resolves into the render directory

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

### Requirement: Density volume encodes the model
The density volume SHALL be a `uint8` grid of 256 x 64 x 256 texels over the model
bounds in `x`, the vertical range -3,000 to 3,000 light years around the mid-plane,
and the model bounds in `z`. The vertical range exceeds the model's maximum height of
2,867 light years so that the outermost layers lie beyond it. Each texel SHALL encode
the corrected volume density `rho` at the texel centre as
`round(255 * clamp((ln(rho + epsilon) - lo) / (hi - lo), 0, 1))`. `epsilon` is the
encoding floor of 1 map unit per light year. `lo` equals `ln(epsilon)`, so zero density
encodes as 0. The volume reports `lo`, `hi` and `epsilon`. The floor sits below the
model's epsilon of 300. The outer disc near Sol is about 30 map units per light year,
and the lower floor gives it byte values of its own instead of the lowest few.

#### Scenario: Dimensions
- **WHEN** a test generates the volume
- **THEN** its array length is 4,194,304 and its reported dimensions are 256, 64, 256

#### Scenario: Value at Sol
- **WHEN** a test decodes the texel that contains Sol
- **THEN** the decoded density is within a factor of 1.5 of the model's corrected volume
  density at that texel's centre

#### Scenario: Above the disc
- **WHEN** a test reads every texel in the top and bottom layers (`y` index 0 and 63),
  whose centres lie about 2,953 light years from the mid-plane
- **THEN** every value is 0

### Requirement: Generation runs off the main thread within budget
Point cloud and volume generation SHALL run in Web Workers. Generation of 2,000,000
samples and the full volume SHALL complete within 5 seconds on the dev container.

#### Scenario: Time budget
- **WHEN** the browser test loads the page and waits for the scene-data ready event
- **THEN** the event arrives within 5 seconds of page load

#### Scenario: Main thread stays responsive
- **WHEN** the browser test measures the longest task on the main thread from
  navigation start to the first drawn frame, a window that includes the buffer and
  texture uploads and the shader compilation
- **THEN** no single task exceeds 100 ms

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
