## ADDED Requirements

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
