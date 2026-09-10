## MODIFIED Requirements

### Requirement: Generation runs off the main thread within budget
Point cloud, cloud set, volume and region boundary generation SHALL run in Web Workers.
Generation of 2,000,000 point samples, 40,000 cloud samples, the full volume and the
region boundary set SHALL complete within 5 seconds on the dev container.

#### Scenario: Time budget
- **WHEN** the browser test loads the page and waits for the scene-data ready event
- **THEN** the event arrives within 5 seconds of page load

#### Scenario: Main thread stays responsive
- **WHEN** the browser test measures the longest task on the main thread from
  navigation start to the first drawn frame, a window that includes the buffer and
  texture uploads, the shape set build and the shader compilation
- **THEN** no single task exceeds 100 ms
