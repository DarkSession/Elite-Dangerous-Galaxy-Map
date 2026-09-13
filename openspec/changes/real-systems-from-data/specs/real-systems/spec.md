## Purpose

Lets a host application put real star systems on the map. The host creates the map with
one call and adds records with another. The map validates each record, draws a marker
for each system it keeps, and removes the invented star that stands for the same system.

## ADDED Requirements

### Requirement: The map is created through a library entry point

The map SHALL expose `createGalaxyMap(canvas)`. The call SHALL return a handle at once,
before the scene data is ready. The handle SHALL carry `addSystems`, `clearSystems`,
`systemCount`, `ready` and `dispose`.

`ready` is a promise that resolves after the map draws its first frame. `addSystems` and
`clearSystems` SHALL work before and after that frame, and a system added before the
first frame SHALL draw in it.

The demo page SHALL call the entry point and SHALL put the handle on `window.galaxyMap`.
A page that supplies no system SHALL draw the frame it drew before this change.

#### Scenario: The handle works before the first frame

- **WHEN** the browser test opens the page, reads `window.galaxyMap` before `ready`
  resolves, adds one system at Sol, then waits for `ready`
- **THEN** `systemCount` is 1 before the wait, and the first frame the page draws holds
  a marker at Sol's pixel

#### Scenario: The handle empties the set

- **WHEN** a browser test adds 100 systems, reads `systemCount`, calls `clearSystems`
  and reads it again
- **THEN** the first reading is 100 and the second is 0

### Requirement: A record follows the shape of an EDSM or a Spansh dump

A record SHALL carry a `name` that is a string of at least one character, and a `coords`
object whose `x`, `y` and `z` are finite numbers. The position is in game coordinates in
light years.

The reader SHALL keep these optional fields when they are present and of the stated
type, and SHALL drop every other field of the record:

| Field             | Type                       |
| ----------------- | -------------------------- |
| `id64`            | number, string or `bigint` |
| `allegiance`      | string                     |
| `government`      | string                     |
| `primaryEconomy`  | string                     |
| `security`        | string                     |
| `population`      | finite number              |
| `bodyCount`       | finite number              |

The reader SHALL store `id64` as a decimal string. A Spansh `id64` is a 64-bit integer,
and `JSON.parse` loses digits above 2^53, so a host that needs every digit passes a
string or a `bigint`.

#### Scenario: An EDSM record and a Spansh record are both read

- **WHEN** a unit test adds one EDSM record, which carries `id64`, `name`, `coords` and
  `date`, and one Spansh record, which carries those fields and `allegiance`,
  `government`, `primaryEconomy`, `security`, `population`, `bodyCount`, `bodies` and
  `stations`
- **THEN** both are accepted, the kept fields hold the values the records gave, and
  neither `date` nor `bodies` nor `stations` is held

#### Scenario: A large id64 keeps every digit

- **WHEN** a unit test adds a record whose `id64` is the string `2871051900826` and one
  whose `id64` is the bigint `18262930337633`
- **THEN** the reader holds `"2871051900826"` and `"18262930337633"`

### Requirement: The reader reports every record it rejects

`addSystems` SHALL return a report of `added`, `replaced` and `rejected`. Each rejected
entry SHALL carry the index of the record in the call and one reason from this set:
`no-name`, `no-coords`, `out-of-bounds`, `over-capacity`.

A record whose position lies outside the galaxy model bounds SHALL be rejected as
`out-of-bounds`. The reader SHALL reject a bad record and SHALL keep reading the rest of
the call.

#### Scenario: Each fault gets its own reason

- **WHEN** a unit test adds five records: one valid, one with an empty name, one with no
  `coords`, one whose `coords.x` is `NaN`, and one at (0, 0, 900,000)
- **THEN** `added` is 1, and `rejected` holds `no-name` at index 1, `no-coords` at
  index 2, `no-coords` at index 3 and `out-of-bounds` at index 4

### Requirement: A system's identity is its id64, or its name

The identity of a record SHALL be its `id64` when it has one, and its `name` when it has
none. A record whose identity is already in the set SHALL replace the record that holds
it. The set SHALL then not grow, and the call SHALL report the record under `replaced`.

#### Scenario: The same system twice replaces rather than adds

- **WHEN** a unit test adds a record with `id64` 10477373803, then adds the same `id64`
  at a different position, and reads the count and the stored position
- **THEN** the count is 1, `replaced` is 1, and the stored position is the second one

### Requirement: The set holds up to 10,000 systems

The set SHALL hold at most 10,000 systems. `addSystems` SHALL accept records up to that
bound and SHALL reject every record past it with the reason `over-capacity`.
`clearSystems` SHALL empty the set, and the next call SHALL then accept 10,000 records
again.

#### Scenario: The bound rejects the excess

- **WHEN** a unit test adds 9,998 systems, then adds 5 more, then calls `clearSystems`
  and adds 10,000
- **THEN** the second call reports `added` 2 and 3 entries of `over-capacity`, and the
  third call reports `added` 10,000 and no rejection

### Requirement: The system set carries no rendering types

The system set SHALL hold positions as one `Float64Array` of three game coordinates per
system, and the record fields as plain objects and strings. No module under the
scene-data directory SHALL import a rendering module.

The positions stay in `float64`, because the pass subtracts the camera position from
them every frame and phase 4 projects them for picking.

#### Scenario: Positions are float64 game coordinates

- **WHEN** a unit test adds three records and reads the set's position array
- **THEN** the array is a `Float64Array` of length 9 and holds the three positions in
  the order the records were added

#### Scenario: No rendering import

- **WHEN** the lint rule checks imports under the scene-data directory
- **THEN** no import resolves into the render directory

### Requirement: A marker draws for every system at every zoom distance

The renderer SHALL draw one marker per system in the set, in one instanced pass, at
every zoom distance from 500 to 120,000 light years. There SHALL be no level of detail:
the pass draws the whole set in every frame.

A marker SHALL be a disc of a fixed size of 7 CSS pixels at every range and every zoom
distance. Its middle 5 CSS pixels SHALL carry a fixed light colour and the 1 CSS pixel
each side SHALL carry a fixed dark colour, so a marker reads over the bright core of the
galaxy and over dark space alike. The colour SHALL NOT follow the population zone ramp
that the decoration stars and the point cloud use, so a real system reads as different
from an invented star.

A marker's size carries no distance information, because a marker is an annotation and
not a body. The page SHALL expose the number of markers the last frame drew.

#### Scenario: A marker shows at every zoom distance

- **WHEN** the browser test adds one system at (0, 0, 6,000), then opens the view
  `#c=0,0,6000&d=500&p=35&y=0` and the same cursor at 4,000, 20,000 and 120,000 light
  years, and reads the pixel at the projection of the system with the pass on and with
  it off
- **THEN** the two readings differ at every one of the four distances

#### Scenario: A marker is 7 pixels wide

- **WHEN** the browser test adds one system at the cursor's plane point, opens the view
  at 20,000 light years, and counts the pixels of the row through the marker's centre
  that differ from the frame drawn with the pass off
- **THEN** the count is 7 at a device pixel ratio of 1

#### Scenario: The marker colour is not the zone ramp

- **WHEN** the browser test adds one system at Sol and one at the galactic centre, whose
  population zones differ, and reads the middle pixel of each marker at the same zoom
  distance
- **THEN** the two pixels hold the same colour

### Requirement: The marker pass draws over the finished frame

The marker pass SHALL draw after the tone map and after the region boundary overlay, and
SHALL blend over the frame with alpha. It SHALL use no depth test. No other pass can
then cover a marker, and a marker adds no light the tone map reads.

The pass SHALL draw the markers in the order the set holds them, so two markers that
overlap blend in a fixed order.

#### Scenario: A region boundary does not cover a marker

- **WHEN** the browser test places one system on a region boundary, opens a view at
  20,000 light years where the overlay draws in full, and reads the middle pixel of the
  marker
- **THEN** the pixel holds the marker's light colour, not the boundary's colour

#### Scenario: The far view does not change

- **WHEN** the browser test renders the default view at 1280x720 with no system in the
  set, and again with the marker pass switched off
- **THEN** the two image files are byte-identical, and the frame still matches the
  committed baseline image with at most 2 percent of pixels differing

### Requirement: A marker's drawn position is exact

The renderer SHALL subtract the camera position from each system position in `float64`
on the CPU each frame, and SHALL give the shader the offset as a `float32`. The drawn
position of a marker SHALL be within 0.01 light years of the position the same
subtraction gives in `float64`, at every cursor inside the model bounds and every zoom
distance.

The galaxy spans under 125,000 light years, and a `float32` holds a number of that size
to better than 0.008 light years, so the bound holds for every system in the set and not
only for the near ones.

#### Scenario: Position error at the far corner

- **WHEN** a unit test places the cursor at (50,000, 0, 75,000) and at Sol, at zoom
  distances 500, 20,000 and 120,000 light years, and pushes 1,000 system positions
  spread over the model bounds through a `float32` emulation of the vertex transform
- **THEN** every drawn position is within 0.01 light years of the `float64` result

### Requirement: The marker pass has a switch

The renderer SHALL expose a `systems` switch beside the switches for the volume, the
clouds, the points, the stars, the glow and the regions. With the switch off the pass
SHALL draw nothing.

#### Scenario: The switch removes the markers

- **WHEN** the browser test adds 100 systems around Sol, opens `#c=0,0,0&d=4000&p=35&y=0`
  and reads the frame, then switches the systems off and reads it again
- **THEN** the two frames differ with the switch on, and the frame with the switch off is
  byte-identical to the frame the page draws with an empty set

### Requirement: Frame budget with a full set

At 1920x1080 on the dev container's GPU, with 10,000 systems in the set, the mean render
time over 300 consecutive frames SHALL stay under 16.7 ms at zoom distances of 500,
4,000, 20,000 and 120,000 light years, with the cursor at Sol and at the galactic centre.

The pass rebases 10,000 positions every frame, which is 30,000 `float64` subtractions and
one buffer write of 120 KB. The measurement SHALL use the same function the far view's
frame budget uses, so it holds that CPU work and the GPU work together.

#### Scenario: Eight views under budget with 10,000 systems

- **WHEN** the browser test adds 10,000 systems spread over the model bounds, sets each
  of the eight views, and calls the measurement function for 300 frames
- **THEN** each returned mean is under 16.7 ms
