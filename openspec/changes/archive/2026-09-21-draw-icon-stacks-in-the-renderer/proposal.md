## Why

An icon stack is a DOM element over the canvas, so it draws over every pixel the canvas
drew at that place. The map holds it back with a hide rule: the whole 28 pixel element
disappears while the drawn centre of a nearer marker lies inside its box. A 4 pixel marker
therefore deletes a 784 pixel icon, and the icon blinks in and out as the camera moves
through a cluster.

The rule is not a missing reading. The map already knows the range of every system, and
the test already runs on the CPU. The DOM is the limit: a canvas pixel cannot draw over a
DOM element, whatever range the map works out. The only way to order an icon and a marker
by range is to draw both on the canvas.

## What Changes

- The renderer draws the icon stacks and their arrows as a pass on the canvas. They leave
  the DOM overlay. The ring, the pin and the name labels stay in the overlay.
- The icon pass reads the **marker range buffer** the marker pass already writes. An icon
  fragment draws where no marker body in front of its own system covers that pixel, and
  discards where one does. The test is per pixel, so a near marker cuts its own shape out
  of the icon and takes nothing else.
- The map allocates the range buffer in a frame that draws a stack, not in a frame that
  draws a shape alone.
- The map rasterises each icon vector once per device pixel ratio into a texture array.
- **BREAKING**: a host icon URL from another origin SHALL carry
  `Access-Control-Allow-Origin`. The library loads every icon with `crossOrigin` set to
  `anonymous`, because a texture upload from a tainted canvas fails. This also covers the
  16 built-in vectors when the host serves the library from a second origin, such as a CDN.
  An icon the browser refuses does not draw, and the map reports it.
- A name label takes an occlusion rule of its own. The label stays in the DOM, so it keeps
  the element hide the icons give up: a name label is hidden while the drawn centre of a
  nearer marker lies inside its box.
- The browser tests for the stack placement read the renderer's own placement list. The
  tests for the occlusion read canvas pixels. Neither reads a DOM element any more.

## Capabilities

### New Capabilities

None. Both capabilities exist.

### Modified Capabilities

- `system-icons`: the stacks draw on the canvas and not in the overlay; the hide rule
  becomes a per-pixel range test; the bounds count draw calls and texture layers and not
  DOM nodes; the paint budget requirement reads a frame with no icon element in it; a new
  requirement states the cross-origin rule and what the map does with an icon it cannot
  load.
- `system-selection`: the requirement "The marker name labels are bounded" takes the
  occlusion rule the icons give up, and states that the hovered and the selected label
  never hide. "Selection holds the frame budget" loses the icon stack placement from its
  2 ms overlay reading, because that work moves inside `render`.
- `map-hud`: the scenario "The system icons switch moves the stacks" counts icon elements,
  and there are none after this change. It counts the placements the handle reports.

## Impact

**Scale.** The map holds at most 10,000 systems. The pass draws at most 32 stacks, 128
icons and 32 arrows in a frame, which the current bounds already give. It adds at most 1
draw call. It holds at most 64 distinct icon images, which is 1.8 MB of texture at a
device pixel ratio of 3. The per-frame walk reads the systems that carry an icon and not
the whole set.

**New code.**

- `packages/galaxy-map/src/render/icon-pass.ts`, with `shaders/icons.vert` and
  `shaders/icons.frag`. One program draws the icons and the arrows, because the order
  between an arrow and another stack's icon is a range order that two draw calls cannot
  state.
- `packages/galaxy-map/src/render/icon-textures.ts`, which loads and rasterises the vectors.
- `packages/galaxy-map/src/scene-data/icon-stack.ts`, which holds the stack geometry that
  `src/app/markers.ts` holds today. The renderer and the overlay then read one rule, as
  they do for `marker-size.ts`.
- `packages/galaxy-map/src/scene-data/nearest-keep.ts`, which holds the nearest-N keeper
  that `src/app/markers.ts` holds today. The pass and the overlay both need it, and
  `src/app/labels.ts` imports `src/render/region-pass`, so a reach from the renderer into
  `src/app/` would tangle the two layers. `scene-data` is the layer both may read.

**Changed code.**

- `src/app/markers.ts` loses the icon pool, the arrow pool and the `covered` call for
  them, and gains the `covered` call for the name labels.
- `src/render/renderer.ts` gains the pass, and widens the condition that allocates the
  range buffer.
- `src/scene-data/real-systems.ts` gains an index list of the systems that carry an icon,
  so the renderer walks those and not the set.
- `src/app/create-map.ts` gains the placement reading the browser tests need.

**Tests.** Four browser suites read `.gm-system-icon` or `.gm-system-arrow` today and all
four change: `e2e/system-icons.spec.ts` throughout, `e2e/hud.spec.ts` at the icon switch and
the HUD stacking test, `e2e/frame-budget.spec.ts` at the icon reading of the selection
budget, and `e2e/paint-cost.spec.ts`. The Firefox budget reading changes too, because 160
elements leave the overlay.

**The entry chunk grows by about 14,500 bytes.** `renderer.ts` imports the pass without a
condition, so the bytes reach every host, including one whose records name no icon. The
guard in `tests/main-bundle.test.ts` rises from 260,000 to 275,000 and the measured reading
beside it is refreshed. **The `src/nebulae/` subpath seam is not used for this.** That seam
exists to hold 2,912,225 bytes of nebula art out of a build that asks for no nebulae; the
icon pass is 0.5% of that, the icon switch defaults **on**, and a second entry point would
make the icons an opt-in feature, which no requirement asks for.

**Storage.** The range buffer holds one 32-bit float per device pixel, which is 8.3 MB at
1920x1080 and 33 MB at a device pixel ratio of 2. A map with one icon record now allocates
it, where before a shape had to draw first. The texture array adds 1.8 MB at a ratio of 3.

**Risk.** A context without `EXT_color_buffer_float` and `EXT_float_blend` holds no range
buffer. The icons then draw with no occlusion test, which is the frame the map drew before
the hide rule existed. The design states this fallback.
