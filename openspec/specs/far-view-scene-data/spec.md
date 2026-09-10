# far-view-scene-data Specification

## Purpose
Turns the galaxy density model into the data sets the far view draws: a point cloud, a
surface detail grid, a cloud sample set and a density volume, as plain typed arrays
that carry no rendering types.

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


### Requirement: Cloud samples flatten the density
Scene data SHALL include a cloud sample set of a requested number of samples, default
40,000. Each sample SHALL hold a position in game coordinates in light years as three
`float32` values, one `uint8` tint equal to the population zone at the sample's
`(x, z)` scaled to 0 to 255, one `float32` radius in light years, and one `float32`
density ratio. The plane position SHALL follow the placement mass of the surface table
cells raised to the power 0.5, so the outer disc and the rim get samples the density
alone does not give them. The placement mass SHALL be the cell mass held at a floor of
0.005 of the largest cell mass, and the floor SHALL fade to zero from 38,000 to 50,000
light years from the galactic centre in the plane, so the sprite count is near level
from the outer arms to the rim and the placement has no edge. The height SHALL follow
the vertical profile as the point cloud's height does. The radius SHALL be log-uniform
between 500 and 4,000 light years. The density ratio SHALL equal the smooth surface
density, without the correction grid and the detail grid, at the centre of the surface
table cell that holds the sample, divided by the largest such density over the table.
The set SHALL be transferable like the other scene data, and two builds with the same
seed SHALL give the same arrays.

#### Scenario: Count and bounds
- **WHEN** a test requests 10,000 cloud samples
- **THEN** it receives exactly 10,000 positions, all inside the model bounds, and
  10,000 tints, radii and density ratios

#### Scenario: Placement reaches the outer disc
- **WHEN** a test requests 40,000 cloud samples and counts those beyond 30,000 light
  years from the galactic centre in the plane, and makes the same count over the first
  40,000 samples of the point cloud
- **THEN** the cloud set's fraction is at least 0.25 and the point cloud's is below 0.02

#### Scenario: Placement follows the flattened density
- **WHEN** a test requests 40,000 cloud samples and counts those within 10,000 light
  years of the galactic centre in the plane
- **THEN** the fraction is within 0.03 absolute of the fraction that the square root of
  the placement mass gives, summed over the surface table's cells inside that radius
  and divided by the sum over every cell

#### Scenario: Density ratio matches the model
- **WHEN** a test reads 100 cloud samples and, for each, divides the smooth surface
  density at the centre of the cell that holds it by the largest cell-centre smooth
  density of the table
- **THEN** each stored ratio is within 1e-5 relative of the computed value

#### Scenario: Radii are log-uniform
- **WHEN** a test requests 40,000 cloud samples and counts the radii in 500 to 1,000,
  1,000 to 2,000 and 2,000 to 4,000 light years
- **THEN** each count is within 0.02 absolute of one third of the total, and no radius
  lies below 500 or above 4,000

#### Scenario: Deterministic
- **WHEN** a test generates the cloud set twice with seed 7
- **THEN** the four arrays are byte-identical

#### Scenario: Transferable
- **WHEN** a test posts a scene-data object with the cloud set's buffers in the
  transfer list
- **THEN** the receiver gets equal contents and the sender's buffers have length 0


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

Point cloud, cloud set, volume and region boundary generation SHALL run in Web Workers.
Generation of 2,000,000 point samples, 40,000 cloud samples, the full volume, the region
boundary set and the coarse region grid SHALL complete within 5 seconds on the dev
container.

The region worker SHALL also return a coarse grid of region ids over the model bounds,
one byte per cell, for the label placement to sample on the main thread. The grid SHALL
be built by taking the id of one cell of the trace grid per coarse cell, so it costs no
further region lookups. It SHALL be at most 512 by 512 cells, which is about 197 light
years per cell and at most 256 KiB.

The grid is not smaller than the 199 KiB lookup table it stands in for. It is sent
because it is a transferable typed array the main thread indexes directly, about 2,000
times a frame, while the lookup table is code and data together that answers one position
at a time. The lookup table SHALL stay in the worker.

#### Scenario: Time budget

- **WHEN** the browser test loads the page and waits for the scene-data ready event
- **THEN** the event arrives within 5 seconds of page load

#### Scenario: Main thread stays responsive

- **WHEN** the browser test measures the longest task on the main thread from
  navigation start to the first drawn frame, a window that includes the buffer and
  texture uploads, the shape set build and the shader compilation
- **THEN** no single task exceeds 100 ms

#### Scenario: The coarse region grid resolves known positions

- **WHEN** a unit test builds the coarse region grid and reads the region at (0, 0) and
  at (15, 25,895) on the plane
- **THEN** the first is `Inner Orion Spur` and the second is `Galactic Centre`, and the
  grid holds at most 512 by 512 cells


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
