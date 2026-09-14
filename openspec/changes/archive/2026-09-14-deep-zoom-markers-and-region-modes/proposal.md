## Why

The map stops at a zoom distance of 500 light years. In the populated bubble the systems
sit 3 to 10 light years apart, so at 500 light years their markers overlap and the user
cannot read one system from the next. The user asked to go closer.

Two look problems come with that. The marker is one style, a bold disc with a dark ring,
which reads as a highlight rather than as a star; it should be one choice of two and not
the default. And the region boundary is drawn as a smoothed line that is allowed to sit
up to 49.35 light years from the true boundary, which is 92 CSS pixels at a zoom of 500
light years and about 4,600 at a zoom of 10, both at 1,080 rows, so the line stops telling
the user where a region really ends.

A finding that shapes this change: the "accurate" region data the request names,
klightspeed's `RegionMapData.json`, is **the data the map already reads**. A comparison of
20,000 random plane positions between that file and
`@elite-dangerous-almanac/core/astro/codex-region-lookup` gives zero mismatches; both are
the same 2,048 row run-length raster at 4,096/83 light years per cell from the origin
(-49,985, -24,105). So the accurate mode is not a new source. It is the same source drawn
without the smoothing.

## What Changes

**The zoom reaches 10 light years.**

- The closest zoom distance moves from 500 to 10 light years. 10 light years is one
  mass-code `a` boxel, and the marker size caps at 12 CSS pixels, so a closer limit
  spreads markers apart and shows nothing new.
- The near plane stops being the fixed 10 light years and becomes `min(10, distance/10)`,
  so the cursor is never on or in front of it. The rule changes nothing at or above a
  zoom distance of 100 light years, so no view reachable today draws differently.
- The star field's handover radii freeze at the value they take at 640 light years, so
  the point cloud's near void does not halve when the base size class steps at 320 light
  years. Without this a new pop appears inside the newly reachable band.

**A category chooses a marker style and a draw range.**

- A category carries an optional `markerStyle` of `glow` or `disc`. `glow` is the
  default: a soft radial halo with four spikes, in the category colour, with no ring.
  `disc` is today's marker, the opaque disc with the fixed dark ring, kept for a category
  the host wants to pick out.
- A category carries an optional `maxDrawRange` in light years, default **120,000**. A
  marker draws only while the camera is within that range of its own system. **BREAKING**
  for the look of a far view: a marker today draws at every range, and at the default view
  the cut falls at 39,915 light years of galactocentric radius, inside a disc that carries
  stars to about 47,000, so the outer band of the drawn disc loses its markers until the
  host raises the number.
- A category added twice replaces the first, as it does now, so a replacement changes the
  style and the range of every marker that names it.

**The region overlay has three modes.**

- `off` draws no boundary and no label. It is what the `regions` pass switch does today,
  raised to a host-facing setting.
- `simplified` is today's smoothed line, and stays the default.
- `accurate` draws the traced cell boundary with no averaging, no vertex reduction and no
  corner rounding: the 49.3494 light year staircase, exactly where the region data puts
  each edge. Its departure from the traced boundary is 0.
- The handle carries `setRegionMode` and `getRegionMode`, and `GalaxyMapOptions` carries
  an optional `regionMode`. The `regions` pass switch stays as the renderer probe it is.

## Non-goals

- No new region data source, because the source the request names is the one in the tree.
- No filled region areas, no region colour wash.
- No new star sprite for the invented decoration field. Its light is already 0 below 640
  light years, so the close view holds the host's systems alone and the field's look does
  not reach the newly reachable band.
- No bodies, no station markers, no picking. Picking is phase 4.
- No change to the level-of-detail step of phase 2.1.

## Capabilities

### New Capabilities

None. Every part of this change modifies a capability that already exists.

### Modified Capabilities

- `map-navigation`: the zoom limit moves from 500 to 10 light years, and the near plane
  follows the zoom distance below 100.
- `real-systems`: a category carries a marker style and a maximum draw range; the marker
  draws in one of two styles; the `glow` style is new and is the default; the handle
  carries the two region mode members and the options carry `regionMode`.
- `galactic-regions`: the overlay takes three modes, and the accurate mode draws the
  unsmoothed traced boundary.
- `close-view-stars`: the handover radii hold below 640 light years, the close zoom frame
  budget adds the 10 light year view, and the note that named 500 as the closest zoom is
  corrected.
- `far-view-rendering`: the camera-relative precision bound is restated at the new closest
  zoom and its sweep adds 10 light years. The rule `1e-2 * distance / 2,000` does not
  move: measured worst case at 10 light years is 2.8e-5 against a bound of 5e-5, taken with
  the near plane this change gives that view.

## Impact

**Code.**

- `src/camera/view.ts`: `MIN_DISTANCE`.
- `src/camera/projection.ts`: `NEAR_PLANE` becomes a function of the zoom distance, and
  `projectionMatrix` takes the view. `viewProjectionMatrix` already takes it.
- `src/camera/precision.test.ts`: `PRECISION_LIMIT_AT_MIN_DISTANCE` moves from 2.5e-3 to
  5e-5, because it is the bound at the closest zoom and the closest zoom moved.
- `src/scene-data/real-systems.ts`: `Category` gains `markerStyle` and `maxDrawRange`;
  the reader validates both.
- `src/render/system-pass.ts`, `src/render/shaders/systems.vert`,
  `src/render/shaders/systems.frag`: two styles, a per-marker style and range attribute,
  and the range cut.
- `src/scene-data/region-lines.ts`, `src/scene-data/region-lines.worker.ts`,
  `src/scene-data/messages.ts`, `src/scene-data/types.ts`: a second chain set, built
  unsmoothed, carried beside the smoothed one.
- `src/render/region-pass.ts`: two vertex arrays, one per set, picked by the mode.
- `src/render/renderer.ts`: the region mode picks which set the region pass draws; the
  handover radii hold.
- `src/render/star-pass.ts`: `handoverRadii` holds below 640.
- `src/app/create-map.ts`: `regionMode` in the options, `setRegionMode` and
  `getRegionMode` on the handle.

**Scale.** The marker set is capped at 10,000 systems and the pass still draws it in one
call at every frame, so the range cut costs one comparison per marker in the vertex
shader and no CPU work. The unsmoothed chain set is the traced raster, which holds more
vertices than the smoothed one; the design states the bound and the spec tests it, and
both sets live in the worker's one transfer. The frame budget of 16.7 ms at 1920x1080
holds at the new zoom distances as well as the old ones.

**Data and licences.** No new dependency and no new data file. `THIRD_PARTY_NOTICES.md`
already names EliteDangerousRegionMap, MIT, so the accurate mode adds no notice.

**Tests.** Unit tests for the view limits, the near plane, the category fields, the
unsmoothed trace and the held handover radii. Browser tests for the two marker styles,
the range cut, the three region modes and the frame budget at 10 light years. The
committed baseline image of the far view must not move.
