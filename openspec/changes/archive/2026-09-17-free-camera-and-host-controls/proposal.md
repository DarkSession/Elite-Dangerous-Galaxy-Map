## Why

The camera and the host surface both hold the map back.

**The camera.** A selection flies to a system with one eased value that drives the cursor
and the distance together. Screen speed is world speed over distance, so the two do not
cancel. A flight from 50,000 light years to a system 20,000 light years away starts at
about 1.7 screen heights a second, reaches about 24 in the middle, and stops. From a close
view the flight never pulls back at all, because the end distance is
`min(distance, 500)`: a 20,000 light year move at a 100 light year distance crosses 174
screen heights in 600 milliseconds and shows the user nothing. The pitch also stops at 5
degrees, so the map has no view from under the disk.

**The host surface.** A host cannot say where the camera starts, cannot hold the user
inside a part of the galaxy, cannot turn one input off, and cannot save a view without
writing its own parser. The demo page holds the only view parser in the tree.

**Two readings are taken from the wrong point.** The HUD range field and the category
draw-range cull both measure from the camera. An orbit moves the camera and not the
cursor, so the range readout swings and markers appear and vanish although the user moved
nothing. Grid labels also take a size from each label's own text, so two neighbouring
coordinate labels differ in height by up to 1.6 times.

## What Changes

1. **The selection flight follows a Van Wijk arc.** The cursor and the distance move on
   one path that holds the perceived speed even, so a long move pulls the camera back over
   its middle and brings it in again at the end. The flight time follows the length of the
   path rather than a fixed 600 milliseconds.
2. **The pitch runs from -89 to 89 degrees**, through 0. The camera looks at the disk from
   under it. **BREAKING**: `MIN_PITCH` changes from 5 to -89.
3. **The browsable space takes three modes**: `unrestricted` (the default), `auto` (the
   box of the loaded systems plus a margin, 1,000 light years by default) and `sphere` (a
   centre and a radius the host gives). A mode holds the cursor inside its shape **and**
   caps the zoom distance, so the user cannot pull back and look at the whole galaxy from
   the middle of a restricted space.
   A selection, the HUD's centre view button and `flyTo` all take that clamp, so a system
   outside a restricted space still selects and the camera lands on the nearest cursor the
   bounds allow.
4. **The host sets the start camera**: coordinates or a system identity, with a distance,
   a yaw and a pitch. The map takes the start view in its first frame and does not fly to
   it.
5. **The category draw-range cull and the HUD range field measure from the cursor.** The
   cull rule is written out four times: in the vertex shader, in the CPU count loop beside
   it that the page reports, in the pick, and in the overlay that places the hover ring,
   the pin and the name labels. All four move together, so a marker the frame draws is one
   the page counts and the user can pick. The marker's drawn size still follows the camera,
   because perspective is a fact about the eye.
   **BREAKING**: a category with a `maxDrawRange` now keeps a different set of markers, and
   the default 120,000 cuts nothing at the default view.
6. **Every coordinate label of a level takes one size**, worked out from the widest text
   the browsable bounds allow. Each label's own box still follows its own text.
7. **Three additions for a host**: `flyTo` and `onFlightEnd` on the handle; an
   `interaction` block that turns the wheel, the orbit, the pan, the keys, the touch
   gestures and the click-to-select off one by one; and `encodeView` / `decodeView` /
   `decodeGrid`, moved out of the demo page onto the public surface.

**Non-goals.** No theme or colour options. No unit or language options. No change to what
the map hides outside a restricted space: the systems, the shapes and the region lines
outside the bounds still draw. No change to the marker size rule. No change to the
picking ray, which stays the camera ray because a pick is a screen act.

## Capabilities

### New Capabilities

None. Every change lands on a capability the repository already holds.

### Modified Capabilities

- `map-navigation`: the pitch clamp runs -89 to 89 through 0; a browsable-bounds rule
  clamps the cursor and the zoom; an interaction switch gates each input; the view
  encoder and decoder move onto the public surface.
- `system-selection`: the flight takes a Van Wijk path and a time worked out from the
  path length, in place of the linear cursor, the geometric distance and the fixed 600
  milliseconds.
- `real-systems`: the category draw-range cull measures from the cursor and not the
  camera.
- `library-package`: `GalaxyMapOptions` gains `startView`, `bounds` and `interaction`;
  `GalaxyMap` gains `flyTo`, `isFlying`, `onFlightEnd`, `getBounds`, `setBounds`,
  `getInteraction` and `setInteraction`; the entry point exports `encodeView`,
  `decodeView`, `decodeGrid` and the four new option types.
- `map-hud`: the information panel's `RANGE` field measures from the cursor.
- `coordinate-grid`: every label of a level takes one cap height, from the widest text the
  bounds allow; the grid and its labels draw from under the plane, so the plane rule that
  said the camera is always above it changes with them.
- `plane-overlay`: the cull test compares a quad's signed screen area against the side of
  the plane the camera is on, in place of a fixed sign, so an element seen from under the
  plane is kept.
- `galactic-regions`: the region label sweep gate reads the greatest plane range from all
  four corners of the frame and not from the top two, because the far row of the frame is
  the bottom row under the plane.

## Impact

**Code.** `src/camera/flight.ts` (rewritten), `src/camera/view.ts` (pitch clamp, bounds
clamp, zoom cap), `src/camera/controls.ts` (interaction switches),
`src/app/create-map.ts` (options, handle members, the bounds state, the start view),
`src/app/plane-overlay.ts` (the winding test takes the camera's side of the plane),
`src/app/grid-labels.ts` (one cap height per level),
`src/app/labels.ts` (the label sweep gate reads four corners), `src/app/url-view.ts` (moves to the
public surface), `src/render/shaders/grid.frag` (the plane ray takes both directions),
`src/render/shaders/systems.vert` (the cull reads a cursor offset),
`src/render/system-pass.ts` (one new frame field, one new uniform, and the cursor
offset into `rebasePositions` for the count loop),
`src/render/renderer.ts` (passes the cursor offset to that pass),
`src/scene-data/picking.ts` and `src/app/markers.ts` (the other two copies of the draw
gate), `src/hud/geometry.ts` (`rangeFromCursor` replaces `rangeFromCamera`, and
`cameraPosition` goes), `src/hud/info-panel.ts`.

**Public surface.** The package is at 0.1.0 and this raises it to 0.2.0. Item 2 and item 5
change what an existing call does.

**Scale.** The system set holds at most 10,000 records, which `real-systems` states.
- The cull change adds one `vec3` subtract for each marker vertex, so at most 10,000
  subtracts a frame. It moves no data and rebuilds nothing.
- Measuring from the cursor makes the default view draw every marker of the set rather
  than cutting the far outer disk. The draw stays one call of at most 10,000 point
  sprites.
- `auto` bounds keep a running minimum and maximum on each axis as records arrive, so a
  record costs six comparisons and the map never sweeps the set. `clearSystems` resets
  the box.
- The flight is arithmetic on eight numbers a frame and allocates nothing.
- The one-size rule measures one extra string for each font, kept in the measurement
  cache the overlay already holds, so a frame measures no more than it does now.
- Below the plane the label sweep costs what it costs at the mirrored pitch above it, so
  the pitch change adds no frame work.
