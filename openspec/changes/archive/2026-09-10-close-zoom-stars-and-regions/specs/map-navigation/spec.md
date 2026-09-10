## MODIFIED Requirements

### Requirement: Zoom with limits
Each wheel notch SHALL multiply the distance by 1.15 (toward the cursor for a forward
notch). Distance SHALL be clamped to 500 to 120,000 light years.

#### Scenario: Zoom in
- **WHEN** a unit test applies one forward notch at distance 20,000
- **THEN** the distance is 17,391 within 1 light year

#### Scenario: Limits
- **WHEN** a unit test applies 100 forward notches
- **THEN** the distance is 500

#### Scenario: A stored fragment still loads
- **WHEN** the page loads with `#c=0,0,0&d=2000&p=35&y=0`, a view written before the
  limit moved
- **THEN** the distance is 2,000, because the limit only widened the range
