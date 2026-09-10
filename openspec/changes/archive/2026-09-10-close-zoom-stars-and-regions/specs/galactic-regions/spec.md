## Purpose

Names the part of the galaxy the view sits in. The 42 galactic codex regions draw
their boundaries on the galactic plane and carry a text label each, so the user can
tell the Inner Orion Spur from the Galactic Centre without leaving the map.

## ADDED Requirements

### Requirement: The region data comes from the almanac

The map SHALL read the 42 galactic codex regions from
`@elite-dangerous-almanac/core`, pinned to an exact version. Each region SHALL carry an
id from 1 to 42, a name, a footprint area, axis-aligned bounds on the galactic plane
and a centroid on the galactic plane. A plane position SHALL resolve to one region or
to none, on the grid of 4,096/83 light years the game uses.

The map SHALL depend on two constants of the package: the galaxy origin
(-49,985, -40,985, -24,105) and the sector edge of 1,280 light years. A unit test SHALL
assert both, so a release of the package that changes them fails the suite rather than
the map.

#### Scenario: The region list

- **WHEN** a unit test reads the region list
- **THEN** it holds 42 regions, their ids run from 1 to 42 without a gap, and every
  name is a non-empty string

#### Scenario: Known positions resolve

- **WHEN** a unit test resolves the regions at (0, 0, 0) and at (15, -35, 25,895)
- **THEN** the first is `Inner Orion Spur` and the second is `Galactic Centre`

#### Scenario: The package constants hold

- **WHEN** a unit test reads the galaxy origin and the sector edge from the package
- **THEN** the origin is (-49,985, -40,985, -24,105) and the edge is 1,280 light years

### Requirement: The boundary set is traced from the region grid

The map SHALL build the region boundary set off the main thread. The build SHALL
resolve the region at the centre of every cell of the 49.3494 light year grid over the
model bounds in `x` and `z`, which is 2,027 by 2,027 cells, and SHALL emit a line
segment on the edge between two neighbouring cells that hold different region ids. A
cell that resolves to no region SHALL count as an id of its own, so the rim of the
mapped grid draws; 1,159,000 of the 4,108,729 cells lie outside the map, and dropping
that edge would lose the outline. Collinear neighbouring segments SHALL be merged into
one run.

The set SHALL be typed arrays only, transferable without copying, and SHALL hold
between 20,000 and 26,000 runs.

#### Scenario: The set is the boundary

- **WHEN** a unit test builds the boundary set
- **THEN** it holds between 20,000 and 26,000 runs, and every endpoint is the `float32`
  nearest a cell edge of the grid, which is within 1e-2 light years of that edge over
  the model bounds. The set is `float32`, and the `float32` spacing at the 76,000 light
  year corner of the bounds is 7.8e-3, so a rounding of half a spacing is the whole of
  the deviation and a tighter bound is not reachable

#### Scenario: The set is deterministic

- **WHEN** a unit test builds the boundary set twice
- **THEN** the two arrays are byte-identical

#### Scenario: The set is transferable

- **WHEN** a test posts the boundary set through a `MessageChannel` with its buffers in
  the transfer list
- **THEN** the receiver gets equal contents and the sender's buffers have length 0

### Requirement: The boundaries draw on the galactic plane in a zoom band

The boundary runs SHALL draw as lines on the plane `y = 0`, after the tone map, with
alpha blending, so no look constant of the far view changes them and none of them
changes the far view. They SHALL be drawn camera-relative, as every other pass is.

The lines SHALL fade in as the zoom distance falls: nothing at 30,000 light years and
above, full at 20,000 and below. They SHALL fade out again below 3,000 light years and
draw nothing at 2,000 and below, because one grid cell then covers more than 15 pixels
and the boundary reads as a staircase rather than a line.

#### Scenario: Nothing at the far view

- **WHEN** the browser test renders the default view at 1280x720 with the region
  overlay on, and again with it switched off
- **THEN** the two image files are byte-identical

#### Scenario: A boundary is visible at medium zoom

- **WHEN** the browser test opens a view at 10,000 light years centred on a plane point
  that a unit test has found within 25 light years of a boundary run, and reads the
  luminance at the projection of that point and at the projection of a plane point
  1,000 light years away from any run
- **THEN** the first reading is at least 0.05 above the second, and with the overlay
  switched off the two readings differ by less than a fifth of the difference with it
  on. The two points are more than 1,000 light years apart, so the galaxy's own light
  differs between them; the test shows that the overlay causes the reading, not that the
  background under the two points is equal

#### Scenario: Nothing at the closest zoom

- **WHEN** the browser test opens the same centre at 1,500 light years with the overlay
  on, and again with it off
- **THEN** the two image files are byte-identical

### Requirement: A region in view carries a label

The page SHALL draw region labels as text over the canvas. A region SHALL be a
candidate for a label when its bounds meet the visible plane area, which is the
axis-aligned box of the plane points under the four viewport corners and the viewport
centre, with each ray's plane point held to at most 8 times the zoom distance from the
cursor.

A label's anchor SHALL be the projection of the region's centroid at `y = 0`. When the
centroid lies behind the camera, the anchor SHALL be taken on the side of the frame the
region lies on, not the opposite one. The anchor SHALL then be held inside the viewport
with an inset of 48 pixels, so the region the camera sits inside keeps a label at the
frame edge.

The candidate whose centroid is nearest the cursor SHALL be placed first. The remaining
candidates SHALL then be placed largest footprint first. A label whose box would overlap
a label already placed SHALL be dropped, and at most 12 labels SHALL be placed.

The first rule is what names the region the view is centred on. A pure largest-first
order does not: at a view of the galactic centre 33 regions are candidates and the
`Galactic Centre` is the smallest of them at 28 million square light years, against 443
million for the largest, so the cap of 12 is reached long before it. The nearest
centroid is the cheapest rule that names it, because the region records already carry a
centroid and the main thread holds no position-to-region lookup. The 199 KiB cell grid
of `astro/codex-region-lookup` stays in the worker.

Labels SHALL follow the same zoom fade in as the boundaries: none at 30,000 light years
and above, full at 20,000 and below. Labels SHALL NOT fade out at close zoom.

#### Scenario: No label at the far view

- **WHEN** the browser test opens the default view
- **THEN** the page holds no region label

#### Scenario: The core is named

- **WHEN** the browser test opens `#c=15,0,25895&d=20000&p=35&y=0`
- **THEN** a label reading `Galactic Centre` is on the page, and its box lies inside
  the viewport

#### Scenario: The region under the cursor keeps its label at the closest zoom

- **WHEN** the browser test opens `#c=0,0,0&d=500&p=35&y=0`, where the Inner Orion
  Spur's centroid at (-2,451, 3,802) lies in front of the camera and far above the
  frame
- **THEN** a label reading `Inner Orion Spur` is on the page, its box lies inside the
  viewport, and its centre is in the upper half of the frame

#### Scenario: A centroid behind the camera labels the right edge

- **WHEN** the browser test opens `#c=0,0,0&d=500&p=35&y=180`, where the camera looks
  away from the Inner Orion Spur's centroid, so the centroid lies behind it
- **THEN** the `Inner Orion Spur` label's box lies inside the viewport and its centre
  is in the lower half of the frame

#### Scenario: Labels neither crowd nor overlap

- **WHEN** the browser test opens `#c=15,0,25895&d=20000&p=35&y=0` and reads the box of
  every label
- **THEN** there are at most 12 labels and no two boxes overlap

### Requirement: The region overlay has a switch

The renderer SHALL expose a `regions` switch beside the switches for the volume, the
clouds, the points, the glow and the stars. The switch SHALL remove both the boundary
lines and the labels.

#### Scenario: The switch removes both parts

- **WHEN** the browser test opens `#c=15,0,25895&d=20000&p=35&y=0`, takes a screenshot,
  switches the regions off and takes a second screenshot
- **THEN** the page holds no region label after the switch, and the second screenshot
  differs from the first, because the first draws boundary lines

#### Scenario: The switch is inert where nothing draws

- **WHEN** the browser test opens `#c=15,0,25895&d=60000&p=35&y=0`, which is above the
  fade in distance, and takes a screenshot with the regions on and one with them off
- **THEN** the two image files are byte-identical

### Requirement: The region data carries its attribution

The repository SHALL hold a `THIRD_PARTY_NOTICES.md` file that names the source of the
region data and its terms: klightspeed's EliteDangerousRegionMap under MIT for the
region tables, and Frontier Developments' media-usage rules, which are non-commercial,
for the game data behind them. If the built bundle carries the package's procedural
naming tables, the file SHALL also hold the BSD 3-Clause text those tables require.

#### Scenario: The notice names every source

- **WHEN** a unit test reads `THIRD_PARTY_NOTICES.md`
- **THEN** it names `EliteDangerousRegionMap`, `MIT`, `Frontier` and
  `@elite-dangerous-almanac/core`

#### Scenario: The bundle carries no unlicensed table

- **WHEN** a test runs `pnpm build` and searches the built bundle for the package's
  procedural naming tables
- **THEN** either the tables are absent, or `THIRD_PARTY_NOTICES.md` holds the BSD
  3-Clause text in full
