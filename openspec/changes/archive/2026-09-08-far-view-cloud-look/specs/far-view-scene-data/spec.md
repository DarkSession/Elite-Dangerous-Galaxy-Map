## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Generation runs off the main thread within budget
Point cloud, cloud set and volume generation SHALL run in Web Workers. Generation of
2,000,000 point samples, 40,000 cloud samples and the full volume SHALL complete
within 5 seconds on the dev container.

#### Scenario: Time budget
- **WHEN** the browser test loads the page and waits for the scene-data ready event
- **THEN** the event arrives within 5 seconds of page load

#### Scenario: Main thread stays responsive
- **WHEN** the browser test measures the longest task on the main thread from
  navigation start to the first drawn frame, a window that includes the buffer and
  texture uploads, the shape set build and the shader compilation
- **THEN** no single task exceeds 100 ms
