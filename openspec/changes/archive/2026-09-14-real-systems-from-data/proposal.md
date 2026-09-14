## Why

The map draws no real system. Everything in the frame is invented: the point cloud, the
cloud sprites and the decoration star field all come from the density model. A host
application that knows real systems, from an EDSM or a Spansh dump, has no way to put
them on the map.

This change makes the map a library. The host creates the map with one call, gives it the
categories it groups its systems by with a second, and adds real systems with a third.
The map draws a marker for each system in the colour of that system's primary category.
It removes the invented star that stands for the same system, and it fades the invented
field out as the camera comes in, so the close view holds the host's data alone.

Phase 4 then selects a real system and shows its record in a HUD. This change places
the systems and holds their records; it does not select and it draws no HUD.

## What Changes

- The page gets a public entry point, `createGalaxyMap(canvas, options)`. It returns a
  handle in the same tick with `addCategories`, `addSystems`, `clearSystems`,
  `clearSystemsAndCategories`, `systemCount`, `ready`, `dispose`, `getView`, `setView`,
  `onViewChange` and `debug`.
  The library owns the render context, the scene data, the view, the controls and the
  frame loop; the page keeps the URL fragment, the message box and the
  `window.__galaxyMap` test hooks, and puts the handle on `window.galaxyMap` and the
  entry point itself on `window.galaxyMapFactory`, which is what lets a browser test
  build a second map. The handle
  is larger than the `createGalaxyMap` plus add and clear the scope settled on, because
  the page cannot keep the URL fragment or the browser tests without the view members and
  `debug`.
- `ready` rejects when the canvas gives no WebGL2 context or the card reports a software
  renderer, and `dispose` stops the frame loop and releases what the map holds.
- `addSystems` reads records in the shape an EDSM or a Spansh dump gives: a `name`, a
  `coords` object of `x`, `y` and `z`, and the name of a primary category. It keeps the
  optional fields the phase 4 HUD needs and drops the rest. It reports every record it
  rejects, with the reason.
- `addCategories` takes the categories the host groups its systems by. A category carries
  a name, an RGB colour and an optional description the phase 4 HUD shows. The name is the
  identity: a category added twice replaces the first and recolours its markers. The table
  holds at most 256. No call removes one category; `clearSystemsAndCategories` empties the
  table and the system set together, so a system in the set can never name a category the
  table does not hold. A record names one primary category and any number of secondary
  ones, and the reader rejects a record whose category the table does not hold.
- A new render pass draws one marker per real system. A marker is a disc of
  `focalCss * 20 / range` CSS pixels, held between a floor of 7 and a cap of 12. The floor
  keeps a marker findable in the far view. The core colour is the colour of the system's
  primary category and the ring is a fixed dark edge, so a real system reads as different
  from an invented star and the host owns what the difference says. The pass draws at
  every zoom distance, from 500 to 120,000 light years.
- The pass draws after the tone map and after the region overlay, so no other pass can
  cover a marker and the scene light of the far view does not change.
- The decoration star field fades out as the camera comes in. It draws in full at a zoom
  distance of 2,560 light years and adds no light at 640 and below. The light it gives up
  leaves the frame: the point cloud does not take it back, because the handover already
  suppresses the point cloud near the camera and a near point sample draws as a saturated
  block, not as a star. Both invented sources therefore stand down and the near field
  empties, so inside the covered sphere the close view shows the host's systems and
  nothing the map invented. Outside it the galaxy draws as it did. A marker does not
  fade.
- The decoration star field also removes the invented stars within 3 light years of a
  real system, in the finest drawn size class. That rule keeps an invented star away from
  a real one in the band where the two draw together. The boxel spreads its light over
  the stars that remain, so the galaxy keeps the same brightness when a host loads data.
- The renderer gets a `systems` pass switch, beside the switches for the volume, the
  clouds, the points, the stars, the glow and the regions.
- The page exposes the suppressed star count and the drawn marker count, so a browser
  test can read them.

Non-goals: selection, a HUD, picking, names for decoration stars, a level of detail for
the markers, and a bundled or fetched data file. The host supplies every record.

The demo page carries a demo data set, which the owner asked for outside this change. It
is a host data set, not a library one: the page reads it with the same `addCategories`
and `addSystems` calls any host uses, and the production build drops both the file and
the code that reads it, so the bundle holds no data and the browser tests open an empty
set. `THIRD_PARTY_NOTICES.md` names its source and its terms.

**Scale.** The pass holds up to 10,000 systems. The map rejects the records past that
bound and reports them. There is no level of detail: one draw call covers the whole set
at every zoom distance.

**Known limit.** Suppression runs in the base size class alone, which reaches 2 base
boxel edges past the camera. Further out, a boxel of the class above places its stars at
the same spacing while its count stays under the cap, so a real system there can keep an
invented star about 3 light years from it. Near Sol at a zoom distance of 500 light
years that is beyond 40 light years from the camera. The specs state the distances, and
suppression in every drawn class is a separate piece of work.

The close fade sets a second limit on that rule. Below 640 light years of zoom distance
the field adds no light, so there is nothing to suppress; above it the base class
coarsens, and a real system removes 0.43 placed stars between 640 and 1,280 light years,
0.057 between 1,280 and 2,560, and 0.0071 above 2,560. The two rules answer two
questions: suppression keeps an invented star away from a real one where both draw, and
the close fade empties the close view.

## Capabilities

### New Capabilities

- `real-systems`: the library entry point, the category table, the record reader and its
  validation, the set the reader produces, the marker pass with the category colour, and
  the bound of 10,000 systems.

### Modified Capabilities

- `close-view-stars`: the field fades out as the camera comes in, with a close fade that
  is 0 at 640 light years of zoom distance and 1 at 2,560. It multiplies the handover
  weight the star pass reads and not the one the point pass reads, so the faded light
  leaves the frame rather than moving to the point cloud. A real system suppresses the
  invented stars near it in the base size class. The boxel's light spreads over the stars
  that remain, so a boxel's light does not change. The delta names two counts: the placed
  count, which does not depend on the system set and sets the star radius, and the drawn
  count, which is the placed count less the suppressed stars and carries the light.
- `far-view-rendering`: the draw order gains the marker pass, after the tone map and
  after the region boundary overlay.

## Impact

- `src/app/main.ts`: splits into a library entry point and a demo page that calls it.
- `src/scene-data/`: a new `real-systems.ts` for the category table, the reader and the
  set, and a new `star-suppression.ts` for the sweep that finds the stars a real system
  removes.
- `src/scene-data/load.ts`: `loadSceneData` takes a cancel signal, so `dispose` can stop
  a load that is still running.
- `src/scene-data/star-field.ts`: the boxel table carries a suppression mask, and the
  light per star divides by the count that remains. `drawnStarCount` becomes
  `placedStarCount` and `systemCount(density, volume)` becomes `systemsInVolume`, because
  the handle's `systemCount()` returns a different quantity.
- `src/render/`: a new `system-pass.ts` with its own shaders, a per-system colour buffer
  built from the category table, and a mask texture in `star-pass.ts`. `stars.vert` reads
  the mask. `renderer.ts` gains the pass and the switch.
- `src/render/renderer.ts`: the marker pass and its switch; a frame time accumulator with
  a mean, a worst and a frame count, built like the label sweep's, because `measureFrames`
  redraws one fixed view and cannot measure a pan or a zoom; and the close fade, which
  multiplies the handover weight the renderer already gives to `star-pass.ts` and to
  `point-pass.ts`. The star pass receives the product and the point pass the handover
  weight unchanged, so neither shader changes and the faded light leaves the frame. The
  draw guard keeps testing the handover weight alone, so the field still builds its table
  and reports its two counts below 640 light years of zoom distance. The handover weight
  stops reading the `stars` switch and reads the zoom distance alone while the field
  stands, so the point cloud draws the same way with the star pass on and with it off and
  the close view is byte-identical either way.
- `src/render/global.ts`: new test hooks for the marker count, the suppressed count, the
  frame statistics and the close fade override, and a `systems` field in the `setPasses`
  parameter type.
- `eslint.config.js`: a rule that fails the lint on `window.location` outside
  `src/app/main.ts`, so the library cannot reach the URL.
- `e2e/global.d.ts`: declares `window.galaxyMap` and `window.galaxyMapFactory` beside
  `window.__galaxyMap`.
- `e2e/`: a new `systems.spec.ts`. Three readings in `e2e/stars.spec.ts` pin the field's
  light, its grain and its switch at 500 light years of zoom distance, where the close
  fade now empties the field; each gains the close fade override, so the field's look
  constants stay measured where they were fitted. The existing baseline image does not
  change, because the demo page loads no system and the default view is a far one.
- No new dependency. The record shape is an external format, so the reader owns it and
  nothing else reads a raw record.
