## ADDED Requirements

### Requirement: The handle reports the region at a plane point

The handle SHALL carry `regionNameAt(point)`, which takes a position in game coordinates
and returns the name of the codex region that holds it, or null.

The lookup SHALL read the `x` and `z` of the point and SHALL ignore its `y`, because the
region grid is a map of the galactic plane and a region has no upper or lower bound. A
point outside the grid SHALL give null, and so SHALL a point inside it that the grid marks
as no region.

The call SHALL give null before the scene data has loaded, rather than throw, because the
handle answers in the same tick the map is created and the grid arrives later.

The HUD names the region under the cursor in its top bar, which `map-hud` states. Before
this requirement the only way to ask was `debug.regionNameAtScreen`, and `debug` is not
part of the supported surface.

#### Scenario: The call names the region at a point

- **WHEN** a browser test waits for `ready` and calls `regionNameAt` with Sol
  (0, 0, 0), with the galactic centre (15, -35, 25895), and with a point far outside the
  grid at (400000, 0, 0)
- **THEN** the first gives `Inner Orion Spur`, the second gives `Galactic Centre`, and the
  third gives null

#### Scenario: The height of the point does not change the answer

- **WHEN** a browser test calls `regionNameAt` with (0, 0, 0) and with (0, 20000, 0)
- **THEN** the two readings are equal

#### Scenario: The call answers before the data loads

- **WHEN** a browser test builds a second map through `window.galaxyMapFactory` and calls
  `regionNameAt` with Sol before `ready` settles
- **THEN** the call returns null and does not throw
