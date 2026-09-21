## MODIFIED Requirements

### Requirement: The near plane follows the zoom distance

The near plane of the perspective projection SHALL be `min(10, distance / 10)` light
years, where `distance` is the zoom distance. It SHALL therefore be 10 light years at
every zoom distance of 100 light years and above, which is every zoom distance the map
could reach before this change, and no view that draws today SHALL draw differently.

The rule exists because the cursor sits exactly `distance` light years from the camera. A
fixed near plane of 10 light years puts the cursor on the near plane at a zoom distance
of 10 and in front of it below that, so the point the user is looking at would be clipped
away. With the rule the cursor sits at ten times the near plane at every zoom distance.

No pass reads the depth buffer, so the near plane changes clipping alone and no depth
resolution figure depends on it. A pass that reconstructs a ray from the inverse of the
view and projection matrix SHALL do so by a rule that holds its answer as the near plane
moves; `far-view-rendering` states that rule for the volume march. The near plane still
sets clipping, so geometry that lies between two near planes is clipped by one and not
by the other; that is the rule working and not a breach of this one.

#### Scenario: The near plane at each zoom distance

- **WHEN** a unit test reads the near plane at zoom distances 10, 50, 100, 500, 20,000 and
  120,000 light years
- **THEN** the readings are 1, 5, 10, 10, 10 and 10 light years

#### Scenario: The cursor is never clipped

- **WHEN** a unit test projects the cursor at every zoom distance from 10 to 120,000 light
  years, stepping by the wheel's 1.15 factor, at a pitch of 5 and of 89 degrees
- **THEN** the cursor projects in front of the near plane at every step, and to the centre
  of the screen within 1 pixel

#### Scenario: A marker at the cursor draws at the closest zoom

- **WHEN** the browser test adds one category and one system at Sol, opens
  `#c=0,0,0&d=10&p=35&y=0`, and reads the middle pixel of the marker
- **THEN** the pixel holds the marker's colour, so the near plane did not clip it

#### Scenario: The near plane changes no view that draws today

- **WHEN** the browser test renders the default view and the view
  `#c=0,0,0&d=500&p=35&y=0` with the new near plane rule
- **THEN** each image file is byte-identical to the same view rendered with a fixed near
  plane of 10 light years

#### Scenario: The near plane alone changes no light

- **WHEN** the browser test opens
  `#c=-4.15271,-50.71937,-152.73213&d=19.4&p=34.56875&y=19.66992`, draws with the volume
  pass alone on a 1600 x 1000 canvas, and reads the mean luminance of the top 30 rows
  once for each held near plane from 1.0 to 10.0 light years in steps of 0.1, with the
  camera left where it is
- **THEN** every reading is within **0.002** of the first one. Mean luminance is the
  measure `far-view-rendering` defines
