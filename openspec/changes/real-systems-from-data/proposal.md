## Why

The map draws no real system. Everything in the frame is invented: the point cloud, the
cloud sprites and the decoration star field all come from the density model. A host
application that knows real systems, from an EDSM or a Spansh dump, has no way to put
them on the map.

This change makes the map a library. The host creates the map with one call and adds
real systems with another. The map draws them, and it removes the invented star that
stands for the same system.

Phase 4 then selects a real system and shows its record in a HUD. This change places
the systems and holds their records; it does not select and it draws no HUD.

## What Changes

- The page gets a public entry point, `createGalaxyMap(canvas)`. It returns a handle
  with `addSystems`, `clearSystems` and `systemCount`. The demo page calls the entry
  point and puts the handle on `window.galaxyMap`.
- `addSystems` reads records in the shape an EDSM or a Spansh dump gives: a `name` and
  a `coords` object of `x`, `y` and `z`. It keeps the optional fields the phase 4 HUD
  needs and drops the rest. It reports every record it rejects, with the reason.
- A new render pass draws one marker per real system. The marker has a fixed colour and
  a fixed brightness, not the population zone ramp, so a real system reads as different
  from an invented star. The pass draws at every zoom distance, from 500 to 120,000
  light years, and a size floor keeps a marker findable in the far view.
- The pass draws after the tone map and after the region overlay, so no other pass can
  cover a marker and the scene light of the far view does not change.
- The decoration star field removes the invented stars within 3 light years of a real
  system, in the finest drawn size class. The boxel spreads its light over the stars
  that remain, so the galaxy keeps the same brightness when a host loads data.
- The renderer gets a `systems` pass switch, beside the switches for the volume, the
  clouds, the points, the stars, the glow and the regions.
- The page exposes the suppressed star count and the drawn marker count, so a browser
  test can read them.

Non-goals: selection, a HUD, picking, names for decoration stars, a level of detail for
the markers, and a bundled or fetched data file. The host supplies every record.

**Scale.** The pass holds up to 10,000 systems. The map rejects the records past that
bound and reports them. There is no level of detail: one instanced draw covers the
whole set at every zoom distance.

## Capabilities

### New Capabilities

- `real-systems`: the library entry point, the record reader and its validation, the
  set the reader produces, the marker pass, and the bound of 10,000 systems.

### Modified Capabilities

- `close-view-stars`: a real system suppresses the invented stars near it in the base
  size class. The boxel's light spreads over the stars that remain, so a boxel's light
  does not change. The drawn count the page reports excludes the suppressed stars.
- `far-view-rendering`: the draw order gains the marker pass, after the tone map and
  after the region boundary overlay.

## Impact

- `src/app/main.ts`: splits into a library entry point and a demo page that calls it.
- `src/scene-data/`: a new `real-systems.ts` for the reader and the set, and a new
  `star-suppression.ts` for the sweep that finds the stars a real system removes.
- `src/scene-data/star-field.ts`: the boxel table carries a suppression mask, and the
  light per star divides by the count that remains.
- `src/render/`: a new `system-pass.ts` with its own shaders, and a mask texture in
  `star-pass.ts`. `stars.vert` reads the mask. `renderer.ts` gains the pass and the
  switch.
- `src/render/global.ts`: new test hooks for the marker count and the suppressed count.
- `e2e/`: a new `systems.spec.ts`. The existing baseline image does not change, because
  the demo page loads no system.
- No new dependency. The record shape is an external format, so the reader owns it and
  nothing else reads a raw record.
