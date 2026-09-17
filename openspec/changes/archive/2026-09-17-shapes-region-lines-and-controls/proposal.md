## Why

Five faults and gaps sit in the map at once, and each one is small on its own.

1. **A far region boundary draws as wide as a near one.** The band takes a fixed share of
   the viewport height, 34.6 CSS pixels at 1,080 rows, whatever its range. A region at the
   far side of the galaxy is a few hundred pixels across on the screen, so a band of 34.6
   pixels reads as a thick stripe over it, while the same band over a near region reads as
   a line. The overlay also draws nothing below 10,000 light years, which takes the lines
   away further out than the user wants.
2. **The `simplified` region mode carries no reading.** No point of either drawn set sits
   more than 15.7 light years from the other, which the current spec states. That is 1.5 CSS
   pixels at a range of 10,000 light years and 0.7 at 20,000, against a band 34.6 CSS pixels
   wide. The mode costs a second boundary set in the worker, a second upload, three HUD
   buttons and a three-value type on the public surface, and it moves the line by a twentieth
   of the band.
3. **A marker keeps the colour of a category the user turned off.** A system that names
   two categories draws in its primary category's colour. Turn that category off and the
   marker stays on the map, because a second category it names is still on, but it keeps
   the colour of the row the user just switched off. The demo Guardian set holds 166 such
   systems.
4. **The keyboard cannot turn the camera.** `W`, `A`, `S`, `D`, `R` and `F` move the
   cursor. Only the pointer and two fingers turn the view, so a keyboard user cannot.
5. **The map draws no sphere and no line of its own.** A permit-locked sector, a
   hyperdiction zone and a recorded route are all shapes the Elite Dangerous community
   records and maps. The map has no way to draw one.

The selection flight also runs at 350 ms, which the owner reads as too quick to follow.

## What Changes

### The region boundary band follows its range

- The band's half width becomes `clamp(base * 12000 / range, 2, base)` CSS pixels, where
  `base` is the width rule the map has today, `clamp(0.016 * viewportHeightCss, 8, 24)`,
  and `range` is the distance from the camera to that point of the line. The band
  therefore keeps today's width at 12,000 light years and narrows as `1 / range` beyond
  it: 20.7 CSS pixels wide at 20,000, 10.4 at 40,000 and 6.9 at 60,000. It never grows
  above today's width, and a floor of 2 CSS pixels of half width keeps the far line
  drawn.
- The edge and the core of the band become shares of the half width in place of fixed CSS
  pixel widths, so the band keeps one profile as it narrows.
- The range fade moves in: a line draws nothing at **8,000** light years and in full at
  **12,000**, in place of 10,000 and 20,000. The region labels read the same two figures,
  so a name and the line under it still fade together.

### The region overlay becomes one switch

- **BREAKING.** `RegionMode`, the `regionMode` option, `getRegionMode` and
  `setRegionMode` go. `GalaxyMapOptions` takes `regions`, a boolean that starts `true`,
  and the handle carries `setRegionsVisible(on)` and `areRegionsVisible()`, which follow
  the naming of the grid switch. The package is at version 0.1.0 and the surface is not
  yet frozen.
- The worker builds one boundary set, the traced one, in place of two. It stops building
  and transferring the smoothed set of 68,672 vertices, against the traced set's 5,727,
  which is 805 KiB of `float32` positions no longer packed, transferred or uploaded.
- The HUD's three **NONE** / **SIMPLIFIED** / **ACCURATE** buttons become one **Galactic
  regions** switch beside **System names** and **Coordinate grid**.

### A marker takes the colour of the first category that is on

- A marker's colour, its style and its draw range come from the first category the record
  names that is on: the primary category first, then the secondary categories in the
  order the record gave them. Today all three come from the primary category alone, even
  when the user has turned it off.
- The sweep that already rebuilds which markers draw writes the drawn category as well,
  so the change costs no new pass over the set and keeps its 2 millisecond bound for
  10,000 systems that name 4 categories each.

### `Q` and `E` turn the camera

- `Q` decreases the yaw and `E` increases it, at **60 degrees per second**, so a full turn
  takes 6 seconds. The two keys follow every rule the six movement keys follow: the
  form-field guard, the release outside the field, and the end of a running selection
  flight.

### The selection flight runs 600 ms

- `FLIGHT_MS` goes from 350 to 600. The ease-out curve, the reduced-motion rule and every
  way the flight gives way to the user do not change.

### The map draws spheres and lines

- A new capability, `map-shapes`. A **sphere** is a position, a radius in light years, a
  colour and an opacity. A **line** is a list of points and a colour, and a point is
  either a game coordinate or the identity of a system in the set, so a line connects
  systems.
- The handle carries `addSpheres`, `addLines`, `clearShapes`, `sphereCount`, `lineCount`,
  `getSphere`, `getLine`, `setShapesVisible` and `areShapesVisible`. A shape carries its
  own colour and is not in the category table, so the category browser does not list one
  and `setCategoryVisible` does not reach one.
- A shape is drawn and is not picked. `systemAt` reads no shape, no shape hovers and no
  shape is selected.
- The renderer gains a `shapes` switch beside `regions`, `systems` and `grid`. The HUD's
  map options panel gains a **Shapes** switch.
- The demo site gains two data sets from the Canonn Research Group's ED3D map project:
  **UIA** with 54 spheres, and **Adamastor** with 8 lines through 38 points that name
  systems.

## Assumption to check

The request names the UIA file as the source of the lines, and asks that the UIA set
connect systems with lines. **Every `routes` entry in that file is commented out**, so it
carries 54 spheres and no line. No other ED3D file carries a route with coordinates in it;
each one names systems that the original map resolves through EDSM as it runs. The lines
therefore come from `MapData-Adamastor.js`, whose 8 routes name systems, and the converter
resolves those names through the EDSM name lookup. The UIA entry carries the spheres. If
Canonn restores the UIA routes, the converter reads them with no change to the code.

## Figures this change leaves open

Five figures in the specs are not yet facts, and the implementation writes them in.

- The **four region-view search counts** of `galactic-regions` read `to be measured`. Three
  things move under them at once, so a count carried over from the reading before would be
  worse than none. Task 2.10 measures them, and `tests/region-views.test.ts` asserts each one,
  so a stale count fails a test.
- The **library entry chunk bound** of `library-package` is planned at 230,000 bytes. Task
  12.1 reads the built size and sets the bound about 30 kB above it.
- The **band readings** of the moved profile: the three band-share readings, the two-tone
  gaps, the corner radius and the two sweep errors. Each one is derived here and not yet
  measured against the built pass. Task 1.9 reads them and writes in each one that differs.
- The **recorded region views** of `e2e/region-views.ts`. Three things move under every
  search at once, so each view is searched again. Tasks 2.6 to 2.9 do that work.

Tasks 1.9, 2.6 to 2.10 and 12.1 therefore edit the specs and the recorded views during the
implementation. A reviewer of this proposal is approving the rules, not those figures.

**Written in so far.** Tasks 2.6 to 2.10 recorded the four views and their search counts, and
task 1.9 measured the band readings against the built pass. The library entry chunk bound of
task 12.1 is the one figure still open.

## Non-goals

- **The zoom fade of the region overlay does not move.** The overlay still draws nothing
  above 30,000 light years of zoom and in full at 20,000 and below. Only the per-pixel
  range fade moves.
- **A shape is not a data set entry.** `DatasetContent` keeps its two arrays. A host adds
  shapes through the handle, and the demo site does it when a load settles.
- **A shape line keeps a fixed width in CSS pixels.** Only the region boundary band
  follows its range. A route line is a symbol between two systems. A region boundary
  bounds an area of the plane, and reads as part of the picture, so its width follows the
  picture.
- **The smoothed boundary set is gone, not parked.** The helpers that only it used go with
  it.

## Capabilities

### New Capabilities

- `map-shapes`: the spheres and the lines the map draws, how a host adds them, what they
  are made of, how they draw, what they cost and what they do not do.

### Modified Capabilities

- `galactic-regions`: the band's width follows its range; the range fade moves to 8,000
  and 12,000; the three modes become one switch; the worker builds one set.
- `real-systems`: a marker's colour, style and draw range follow the first category that
  is on, not the primary category.
- `map-navigation`: `Q` and `E` turn the camera.
- `system-selection`: the selection flight runs 600 ms.
- `map-hud`: the map options panel carries a regions switch in place of three buttons, and
  a shapes switch.
- `dataset-catalog`: a load clears the shapes; a dataset listener runs after the set is
  written; the demo site carries five sets.
- `library-package`: the export list drops `RegionMode` and takes the shape types.

## Impact

Code:

- `src/render/region-pass.ts`, `src/render/shaders/regions.vert` and
  `region-composite.frag` — the per-range half width, the shares and the two fade figures.
- `src/app/labels.ts` — the label fade reads the two moved figures.
- `tests/region-views.ts` and `e2e/region-views.ts` — the four searches read the half width
  at the reading range and the traced set, and every recorded view is searched again.
- `src/scene-data/region-lines.ts`, `region-lines.worker.ts`, `messages.ts`, `types.ts` —
  one boundary set in place of two.
- `src/app/create-map.ts` — the regions switch, the shape members, the shape state.
- `src/scene-data/real-systems.ts` and `src/render/system-pass.ts` — the drawn category.
- `src/camera/controls.ts` — `Q` and `E`.
- `src/camera/flight.ts` — 600 ms.
- `src/render/shape-pass.ts` and its shaders — new.
- `src/scene-data/shapes.ts` — new, the shape set and its reader.
- `src/hud/options-panel.ts` and `src/hud/styles.ts` — the two switches.
- `src/index.ts` — the exported types.
- `scripts/build-demo-systems.mjs` — the UIA and Adamastor conversions.
- `demo-data/uia.json` and `demo-data/adamastor.json` — new, committed.
- `src/app/main.ts` — the two catalog entries and the shape adds.
- `THIRD_PARTY_NOTICES.md` — the ED3D map data and EDSM.
- `docs/roadmap.md` — the phase and its decisions.

Scale:

- The region overlay draws the traced set of 5,727 vertices, which is what it draws today
  in `accurate`. The width change adds one divide and one clamp per vertex and one mix per
  fragment. It adds no vertex and no draw call.
- The shape set holds at most **1,024 spheres** and **4,096 lines** whose points come to at
  most **65,536** in total. At that size, at 1920x1080, with 10,000 systems and the HUD on,
  the mean frame interval SHALL stay at or under 18 milliseconds, which is the bound
  `system-selection` and `map-hud` already hold.
- The marker colour sweep keeps the 2 millisecond bound `real-systems` holds for 10,000
  systems over 8 categories with 4 each.

Look:

- A far region boundary becomes a thin line in place of a thick stripe. The near end of the
  band is unchanged.
- The region lines reach about 2,000 light years closer to the camera than they do today.
- A marker can change colour when the user turns a category off. That is the point of the
  change, and it is a visible departure from what the map does today.
