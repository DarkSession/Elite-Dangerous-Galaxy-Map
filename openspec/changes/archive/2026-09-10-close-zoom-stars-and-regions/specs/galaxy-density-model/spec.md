## ADDED Requirements

### Requirement: Detailed mass density is available
For any point `(x, y, z)` the model SHALL return the detailed mass-code-0 budget in
solar masses per cubic light year: the detailed volume density, which carries the
correction grid and the detail grid, times the same budget constant the corrected mass
density uses. Without a detail grid it SHALL equal the corrected mass density.

#### Scenario: Detailed and corrected agree without a grid
- **WHEN** a unit test builds the model with no detail grid and reads both mass
  densities at each fixture point
- **THEN** the two are equal within 1e-12 relative

#### Scenario: The detail grid moves the budget
- **WHEN** a unit test builds the model with the committed detail grid and reads the
  detailed mass density at Sol and the corrected one
- **THEN** the detailed value is 7.9125e-4 within 1e-3 relative, the corrected value is
  7.5600e-4 within 1e-3 relative, and the detailed value equals the detailed volume
  density times the model's budget constant within 1e-12 relative
