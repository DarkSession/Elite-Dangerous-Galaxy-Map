# galaxy-density-model Specification

## Purpose
Gives the map the stellar-mass density of the game's galaxy at any point, from a small
parameter file, so that the far view can draw the galaxy's shape without a star catalogue.

## Requirements

### Requirement: Parameter file holds only what the map reads
The repository SHALL hold one JSON parameter file for the galaxy model. The file SHALL
contain exactly these top-level keys: `format`, `units`, `centre`, `bounds`,
`reference_radius_ly`, `epsilon`, `surface`, `vertical`, `zone`, `calibration` and
`correction`. `format` SHALL be `galaxy-density-model-v1`. `zone` SHALL contain only
the `log_density` and `zone` arrays. `calibration` SHALL contain only
`mc0_budget_msun_per_ly3_per_unit`. The file SHALL NOT contain a description, a fit
report, calibration samples, region parameters or attribution text. The file SHALL be
smaller than 16 KB.

#### Scenario: Key set is exact
- **WHEN** a test reads the committed parameter file
- **THEN** its top-level key set equals the list above, `format` is
  `galaxy-density-model-v1`, `zone` has exactly two keys, and `calibration` has
  exactly one key

#### Scenario: Size limit
- **WHEN** a test measures the committed parameter file
- **THEN** it is smaller than 16,384 bytes

### Requirement: Model loading validates the document
The model SHALL load from the parameter file. Loading SHALL fail with an error when the
`format` differs from `galaxy-density-model-v1`, when the number of arms is not 4, when
the correction grid length differs from `size * size`, or when a correction value lies
outside -127 to 127.

#### Scenario: Wrong format
- **WHEN** a document with `format: "x"` is loaded
- **THEN** loading throws an error that names the format

#### Scenario: Correction grid length mismatch
- **WHEN** a document declares correction `size: 64` and holds 4,095 values
- **THEN** loading throws an error

### Requirement: Surface density matches the fixture
For any point `(x, z)` in light years, the model SHALL return the planar stellar-mass
surface density in map units, with and without the correction grid, by the formulas in
`docs/galaxy-density-model.md`. Map units are the units of the game's density map:
about 2.5e4 at Sol and 1.2e7 at the galactic centre. Values SHALL match the committed
fixture to a relative error under 1e-6 at every fixture point.

#### Scenario: Fixture agreement, uncorrected
- **WHEN** the test evaluates the uncorrected surface density at each fixture point
- **THEN** each value is within 1e-6 relative of the fixture value

#### Scenario: Fixture agreement, corrected
- **WHEN** the test evaluates the corrected surface density at each fixture point
- **THEN** each value is within 1e-6 relative of the fixture value

#### Scenario: Centre and edge
- **WHEN** the test evaluates the uncorrected surface density at the galactic centre
  and at the centre plus 48,000 light years along `+z`
- **THEN** the edge value is below 1e-4 of the centre value, and the centre value is
  above 100 times the value at Sol

### Requirement: Vertical profile matches the fixture
For any height above the mid-plane and any galactocentric radius, the model SHALL return
the fraction of a column's mass per light year. The profile SHALL be 0 beyond the
maximum height. The profile SHALL integrate to 1 over all heights within 2 percent at
radii of 0, 10,400 and 30,000 light years. Values SHALL match the fixture's
`vertical_profile` entries to a relative error under 1e-6, and the half-mass height
SHALL match the fixture's `half_mass_height` entries within 0.01 light year.

#### Scenario: Fixture agreement
- **WHEN** the test evaluates the profile at each fixture `(dy, radius)` and the
  half-mass height at each fixture radius
- **THEN** each value is within the stated tolerance of the fixture value

#### Scenario: Normalised
- **WHEN** the test integrates the profile numerically over -3,000 to 3,000 light years
  at each of the three radii
- **THEN** each integral is within 0.02 of 1

#### Scenario: Cut at the maximum height
- **WHEN** the test evaluates the profile 1 light year beyond the maximum height
- **THEN** the value is 0

### Requirement: Volume and mass density match the fixture
For any point `(x, y, z)` the model SHALL return the volume density in map units per
light year and the mass-code-0 budget in solar masses per cubic light year. Both SHALL
match the fixture to a relative error under 1e-6 at every fixture point.

#### Scenario: Fixture agreement
- **WHEN** the test evaluates both densities at each fixture point
- **THEN** each value is within 1e-6 relative of the fixture value

### Requirement: Population zone matches the fixture
For any point `(x, z)` the model SHALL return the population zone value in 0 to 1. It
SHALL match the fixture to an absolute error under 1e-6 at every fixture point.

#### Scenario: Fixture agreement
- **WHEN** the test evaluates the zone at each fixture point
- **THEN** each value is within 1e-6 of the fixture value

### Requirement: Arm centre lines are available
For each arm index 0 to 3 and any radius, the model SHALL return the arm's azimuth, the
galactic `(x, z)` of its centre line, and the local pitch angle in degrees. The four
arms SHALL have distinct phases, and the pitch angle SHALL decrease with radius.

#### Scenario: Fixture agreement
- **WHEN** the test evaluates each arm's azimuth, point and pitch angle at each fixture
  radius
- **THEN** each value is within 1e-6 relative of the fixture value

#### Scenario: Arm geometry
- **WHEN** the test reads the four arm phases and the pitch angle at 9,000, 15,000,
  26,000 and 40,000 light years
- **THEN** the four phases differ pairwise by more than 1 degree, and the pitch angles
  decrease with radius

### Requirement: Fixture pins the parameter file
The committed fixture SHALL hold at least 200 points spread over the model bounds,
including Sol, the galactic centre, Colonia and points beyond the maximum height, and
SHALL carry `parameters_sha256`, the SHA-256 of the committed parameter file's bytes.
The fixture and the parameter file are committed data; the repository SHALL NOT hold a
script that regenerates them.

#### Scenario: Fixture matches the parameter file
- **WHEN** a test hashes the committed parameter file
- **THEN** the hash equals the fixture's `parameters_sha256`

#### Scenario: Required points are present
- **WHEN** a test reads the fixture's points
- **THEN** there are at least 200, and they include (0, 0, 0), the model centre,
  (-9530, -910, 19808) and at least one point with `|y - centre_y|` above the maximum
  height

### Requirement: Detail grid refines the corrected surface density
The repository SHALL hold one greyscale PNG of 1024 x 1024 pixels, 8 bits per pixel,
non-interlaced, that stores the detail grid over the model bounds in `x` and `z`. Each
pixel SHALL hold `round(127 * clamp(d, -3, 3) / 3) + 128`, where `d` is
`ln((map + epsilon) / (model + epsilon))` over the pixel's cell, `map` is the game's
density map averaged over the cell, `model` is the corrected surface density of this
model averaged over the cell, and `epsilon` is the model's epsilon of 300. Pixel column
0 SHALL lie at the low `x` bound and pixel row 0 at the low `z` bound. The model SHALL
decode the PNG without a library dependency and SHALL throw a named error for any file
that is not 1024 x 1024, 8-bit greyscale and non-interlaced. The detail at a plane
point SHALL be the bilinear sample of the decoded values between cell centres, with
the edge cells clamped, as for the correction grid, times `3 / 127`. The detailed
surface density SHALL be `(corrected + epsilon) * exp(detail) - epsilon`, floored at
0. It SHALL match the committed detail fixture at every fixture point within 1e-6
relative, or within 1e-6 absolute where the fixture value is below 1.

#### Scenario: Decode
- **WHEN** a test decodes the committed PNG
- **THEN** it gets 1,048,576 bytes whose SHA-256 equals the fixture's `detail_sha256`

#### Scenario: Wrong image
- **WHEN** a test decodes a 2 x 2 greyscale PNG
- **THEN** decoding throws an error that names the expected size

#### Scenario: Fixture agreement
- **WHEN** a test evaluates the detail and the detailed surface density at each
  fixture point
- **THEN** each value is within the stated tolerance of the fixture value

#### Scenario: Texture is present
- **WHEN** a test evaluates the detailed and the corrected surface density along the
  first arm's centre line from 24,000 to 27,000 light years in steps of 100
- **THEN** the ratio of the largest to the smallest detailed value is above 3, and the
  same ratio of the corrected values is below 2.5

### Requirement: Fixture pins the detail grid
The committed detail fixture SHALL hold at least 200 plane points, including Sol, the
galactic centre, Colonia and at least one point outside the model bounds. It SHALL
carry `png_sha256`, the SHA-256 of the committed PNG's bytes, and `detail_sha256`, the
SHA-256 of the decoded grid. The PNG and the fixture are committed data; the
repository SHALL NOT hold a script that regenerates them.

#### Scenario: Fixture matches the PNG
- **WHEN** a test hashes the committed PNG
- **THEN** the hash equals the fixture's `png_sha256`

#### Scenario: Required points are present
- **WHEN** a test reads the fixture's points
- **THEN** there are at least 200, and they include (0, 0), (15, 25895), (-9530, 19808)
  and at least one point with `x` or `z` outside the bounds
