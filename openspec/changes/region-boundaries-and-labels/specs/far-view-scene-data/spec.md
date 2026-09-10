## MODIFIED Requirements

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
