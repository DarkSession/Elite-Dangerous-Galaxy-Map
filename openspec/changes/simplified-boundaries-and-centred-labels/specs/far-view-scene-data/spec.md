## MODIFIED Requirements

### Requirement: Generation runs off the main thread within budget

Point cloud, cloud set, volume and region boundary generation SHALL run in Web Workers.
Generation of 2,000,000 point samples, 40,000 cloud samples, the full volume, the region
boundary set, the coarse region grid and the region clearance field SHALL complete within
5 seconds on the dev container.

The region worker SHALL also return a coarse grid of region ids over the model bounds,
one byte per cell, for the tests and the label work to resolve a plane point on the main
thread. The grid SHALL be built by taking the id of one cell of the trace grid per coarse
cell, so it costs no further region lookups. It SHALL be at most 512 by 512 cells, which
is about 197 light years per cell and at most 256 KiB.

The grid is not smaller than the 199 KiB lookup table it stands in for. It is sent
because it is a transferable typed array the main thread indexes directly, while the
lookup table is code and data together that answers one position at a time. The lookup
table SHALL stay in the worker.

The region worker SHALL also build a **clearance field**: for every cell of the trace
grid, the distance to the nearest cell that has a 4-neighbour of another region id. A
cell that resolves to no region SHALL count as an id of its own here, exactly as it does
for the boundary trace, so the rim of the mapped area seeds the field and a label near
the rim keeps its distance from the drawn rim line. It is one exact Euclidean distance
transform over the 2,027 by 2,027 grid, run as two separable passes, and it costs no
further region lookups because it reads the ids the trace grid already holds. It SHALL
be held in the worker as one `Uint16` per cell, **in light years, rounded down**, which
is 8.2 MB. The largest value over the field is 21,635 light years, so a `Uint16` holds
it. Rounding down keeps the field a lower bound on the true clearance, which is what
every reader of it assumes.

The worker SHALL return that field **downsampled by 8**, as 254 by 254 cells of `Uint16`,
which is 126 KiB. Each downsampled cell SHALL carry the **smallest** clearance of the cells
it covers, and its value SHALL be anchored at the centre of the block it covers, so a reader
knows where to interpolate from. A reader that takes a cell's own value never believes it
has more room than it has. A reader that interpolates between cells can exceed the exact
field at the sampled point. Measured over every cell of the trace grid, the largest such
overshoot is 0.1213 of a block width, which is 47.89 light years. Readers SHALL allow for
that, and `galactic-regions` does, with margin. A read outside the field SHALL return no
clearance.

**The field is 1-Lipschitz.** It is a distance, so between two points it changes by no
more than the distance between them. A reader that holds the exact value at one point
can therefore lower-bound the field anywhere else by subtracting the distance, and
`galactic-regions` does that with each region's own centre, to recover at the centre
what the downsample loses. The block minimum can lose much more than it gains: at the 42
region centres it reads a median of 367.5 light years low, which is enough to drop a label
the exact field keeps.

The worker SHALL also return, for each of the 42 regions, the **centre** — the plane point
of largest exact clearance inside that region — and the clearance there, and SHALL return
the boundary departure bound with the boundary set. None of these can be worked out on the
main thread: they need the region lookup, which stays in the worker, and the module that
declares the departure bound imports it.

#### Scenario: Time budget

- **WHEN** the browser test loads the page and waits for the scene-data ready event
- **THEN** the event arrives within 5 seconds of page load, with the clearance field built

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

#### Scenario: The clearance field is exact and its downsample is safe

- **WHEN** a unit test builds the clearance field over a hand-built grid and compares
  every cell with the distance found by searching every seeded cell, and then compares
  every cell of the downsample with the smallest exact value of the cells it covers
- **THEN** the field is never above the search and never more than one light year below it,
  which is what rounding down to whole light years allows, and no downsampled cell reports
  more clearance than the smallest stored value under it

#### Scenario: The field is 1-Lipschitz

- **WHEN** a unit test reads pairs of cells at arbitrary separation, not only pairs that
  touch, over at least a million pairs spread across the whole field
- **THEN** no pair differs by more than the distance between the two cell centres plus the
  one light year the rounding allows. Pairs that touch are not enough: a chained path between
  two distant cells is longer than the straight line between them, so a chamfer or an
  approximate transform passes a touching-pair check and still breaks the reader that
  subtracts a straight-line distance

#### Scenario: The rim seeds the clearance field

- **WHEN** a unit test reads the clearance of the cell of largest clearance inside a region
  that touches the edge of the mapped area, and of the trace cell next to the outermost cell
  that resolves to a region there
- **THEN** the second is one cell or less, and the first is smaller than the distance to the
  nearest cell of another named region, so the rim bounds the field

#### Scenario: The worker returns the label geometry

- **WHEN** a unit test reads the message the region worker posts
- **THEN** it carries a centre and a clearance for each of the 42 regions, and the boundary
  departure bound, and each centre resolves to its own region on the coarse grid

#### Scenario: The clearance field is transferable

- **WHEN** a test posts the downsampled clearance field through a `MessageChannel` with
  its buffer in the transfer list
- **THEN** the receiver gets equal contents, the buffer is 254 by 254 `Uint16`, and the
  sender's buffer has length 0
