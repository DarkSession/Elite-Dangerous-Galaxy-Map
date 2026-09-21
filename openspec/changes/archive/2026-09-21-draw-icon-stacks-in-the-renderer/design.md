## Context

See proposal.md — Why.

Four facts of the tree shape this design.

1. **The marker range buffer already exists.** `marker-range.frag` writes the camera range
   of every marker **body** into an `R32F` target with the `MIN` blend equation, so a pixel
   holds the range of the nearest body that covers it. `shape-pass.ts` reads it today. The
   renderer allocates it only in a frame that draws a sphere or a line, and only where
   `readsFloatTargets(gl)` is true.
2. **The context takes no depth buffer.** `context.ts` asks for `depth: false`, and the
   marker pass draws over the finished frame with the depth test off.
3. **The marker pass already walks every system on the CPU each frame.**
   `rebasePositions` subtracts the camera in `float64` and writes a `float32` offset. The
   marker's own range is `length(aOffset)` of that `float32` offset, worked out on the card.
4. **The overlay runs after the draw.** `create-map.ts` calls `renderer.render(view)` and
   then `markers.update(...)`. The renderer cannot take a selection the overlay made in the
   same frame, so the icon pass makes its own.

## Goals / Non-Goals

**Goals**

- One rule orders an icon and a marker: the range of the system, per pixel.
- The icon reads as crisply as the DOM bitmap it replaces.
- The per-frame cost follows the records that carry icons, not the 10,000 the set holds.
- The name labels get an occlusion rule without leaving the DOM.

**Non-Goals**

- No depth buffer, and no change to the order of any other pass.
- No move of the ring, the pin, the name labels or the plane elements to the canvas.
- No per-pixel rule for the name labels. Text is read from end to end, so the whole element
  hides.
- No glyph atlas and no text on the canvas.
- No change to the icon catalogue, the record format, the demo data or the marker look.

## Decisions

### The occlusion test reads the range buffer, not a depth buffer

The icon pass samples the range buffer at its own fragment and discards where the buffer
holds a range nearer than the icon's own system.

```
  marker pass ---> range buffer (R32F, MIN)   nearest marker BODY range per pixel
                          |
  shape pass  <-----------+   (reads it today)
  icon pass   <-----------+   (reads it now)

  icon fragment:
      near = texelFetch(uRange, ivec2(gl_FragCoord.xy), 0).r
      if (near < vRange * (1.0 - BIAS)) discard;
```

*Why not a depth buffer.* A depth buffer would order icons and markers per pixel too, and
it would order the markers among themselves as a bonus. It costs more: `depth: false`
becomes `depth: true`, every pass that draws to the default framebuffer has to state its
depth write, and the marker pass needs a body-only depth prepass — otherwise the invisible
corners of a 100 pixel `glow` sprite occlude everything behind them. That prepass is the
range draw again, in another form. The range buffer is already written, already proved and
already understood in this tree.

*What the test buys and what it costs.* The buffer holds the **body**, which is what the
map already treats as the mark the user reads. A `glow` halo outside the body therefore
draws under an icon. That is a deliberate limit, stated in the spec, and it matches the
sphere wash, which reads the same buffer for the same reason.

### The renderer allocates the range buffer for a stack as well as for a shape

`renderer.ts` sets `rangeTarget` from the shape counts today. It gains the stack count:

```
  rangeTarget = (spheres > 0 || segments > 0 || stacks > 0) ? rangeBuffer : null
```

The stack count must therefore be known **before** the marker pass draws, as the shape
counts already are. The icon pass gets a `prepare(frame)` that selects and places the
stacks and returns the count, and a `draw(frame)` that runs after the shapes. This is the
shape pass's own `prepare` / `draw` split, for the same reason.

The buffer holds one 32-bit float per **device** pixel. At 1920x1080 and a ratio of 1 that
is 8.3 MB, and at a ratio of 2 it is 33 MB. The icon switch defaults on, so a map with one
icon record and no shape now pays it. A map with neither still pays nothing, and the buffer
is allocated in the first frame that needs it and not at the resize, which
`renderer.ts` already does for the shapes.

### The own system never hides its own stack, by a relative bias

The stack's own marker is at the stack's own range, so a strict `<` would already leave it
alone if the two numbers were the same bits. They are not: the marker's range comes from
`length(aOffset)` on the card, and the icon's comes from `Math.hypot` on the CPU. The two
differ by an ulp or two.

The pass computes its offset with `Math.fround(position - camera)` per axis, which
reproduces the `float32` the marker buffer holds, and then compares with a relative bias of
**1e-5**. That is about 80 times the `float32` rounding and far below any separation the
eye reads: at 120,000 light years it is 1.2 light years, and at 50 light years it is
0.0005. A relative bias scales with the range, which a fixed one would not.

The check is a unit test, not a GLSL run: it asserts that the pass's offset is bit for bit
the value `rebasePositions` writes for the same position and camera, and that the bias of
1e-5 is above the `float32` relative step of 1.2e-7 and below the smallest separation any
scenario relies on. A browser test holds the other half, because a unit test cannot see what
the card compares.

*The sampler states its precision.* GLSL ES 3.00 gives `sampler2D` a default of `lowp` in
the fragment language, so `uniform sampler2D uRange` reads a range rounded to about a
two-thousandth of itself: 0.3 light years at 600 and 59 at 120,000. The bias of 1e-5 means
nothing under that rounding, and the cut then turns on somewhere between 1e-4 and 1e-3 of
relative range. `icons.frag` therefore declares `uniform highp sampler2D uRange`, which
moves the threshold back to one `float32` step. `nebulae.frag` already carries the same note
for `sampler2DArray`. **The bias holds only while the sampler is `highp`.**

*Why not read the offsets the marker pass already wrote.* They live inside the marker
pass's closure. Handing them out means a refactor of `system-pass.ts` for 32 systems' worth
of arithmetic. `Math.fround` is three calls per kept stack.

### The vectors rasterise through an image element and a 2D canvas

For each distinct URL:

```
  img = new Image(); img.crossOrigin = 'anonymous'; img.src = url; await img.decode();
  ctx.clearRect(0, 0, side, side); ctx.drawImage(img, 0, 0, side, side);
  gl.texSubImage3D(TEXTURE_2D_ARRAY, 0, 0, 0, layer, side, side, 1, RGBA, UNSIGNED_BYTE, canvas);
```

*Why not `createImageBitmap`.* Firefox cannot decode an SVG through `createImageBitmap`,
and Firefox is a project of this suite and carries a budget requirement of its own. An
image element draws an SVG at an explicit size in every browser the suite runs.

*The side.* `side = min(128, round(28 * devicePixelRatio))`. At a ratio of 3 that is 84,
which is the size the quad draws at, so the copy is one texel to one pixel and the glyph
stays crisp. The cap holds the storage at 64 layers times 128 square times 4 bytes, which
is 4.2 MB in the worst case and 1.8 MB at a ratio of 3. A ratio above 4.57 draws from a 128
texel layer, slightly soft.

*A ratio change* frees the array and rasterises again. The library already watches the
ratio for the marker sizes.

### `crossOrigin` is `anonymous`, and that is the breaking change

A texture upload from a canvas tainted by a cross-origin image throws `SecurityError`. The
loader therefore asks for CORS on every image. A host URL on another origin needs
`Access-Control-Allow-Origin`, and so do the 16 built-in vectors when the host serves the
library from a CDN.

*Why not skip `crossOrigin` and catch the throw.* Without the attribute the browser caches
the response without CORS, and a later request with the attribute can be answered from that
same cache entry and fail again. Asking once, always, is the rule that holds.

*What a refusal does.* The loader marks the URL failed, warns once, and never asks again.
The icon does not draw; the rest of the stack does. The spec states this.

### The pass places on the CPU and draws one instanced quad stream

Placement is screen work: the CPU already projects the candidates to pick the nearest 32, so
it also works out each box in device pixels and rounds it to whole ones. The vertex shader
then takes a unit quad corner and a per-instance box, and does no projection.

```
  per instance:  box (left, top, width, height, device px)
                 layer (icon)  |  colour (arrow)
                 range (light years)
  uniforms:      uViewportPx, uRange, uHasRange
```

One program and one draw call. The instance carries a `kind` field: an icon samples the
texture array, and an arrow works out its own triangle coverage from the quad's local
coordinates with a one-pixel ramp. There is no multisample buffer, so the arrow's slanted
edges need that ramp.

*Why one call and not two.* An arrow and an icon of two different stacks must order by
range, the same as two icons do. Two calls cannot state that: the second call draws every
one of its quads over every quad of the first. With the arrows last, a far arrow draws over
a near icon plate; with the arrows first, a near arrow goes under a far plate. Both are
wrong. One stream in one back-to-front order is right, and it is right whether or not the
context gives a range buffer, because it is draw order and not a range test.

*Why not a third pass that writes the plate ranges.* The icons could write their own range
into the range buffer and the arrows could then test it. That needs a float target, so it
would do nothing on a context that cannot blend into one, and it costs a call rather than
saving one.

*The blend.* The one call blends with `SRC_ALPHA, ONE_MINUS_SRC_ALPHA`. The icon plate is
opaque, so a blended plate writes the same pixels a plate with the blend off writes. The
arrow keeps its one-pixel ramp.

*Why whole device pixels rather than whole CSS pixels.* The old rule rounded CSS pixels
because the browser resampled a bitmap. The pass now controls the sampling, so the rule that
matters is texel-to-pixel alignment, which is a device pixel rule.

### The stack selection reads an index list the set keeps

`RealSystemSet` gains `iconIndices` and `iconIndexCount`: the indices of the systems whose
record named at least one icon. `iconSystemCount` becomes the length of that list, so it now
counts the **distinct** records that ever held an icon rather than the times a record with
icons was added. The new reading is the tighter one and still holds the old rule — it may
read high and never low — and the overlay fast path that was its only production reader is
gone with the overlay, so the field is left for a host to read. The pass walks that list, not the set. The list follows the
rule `iconSystemCount` already states — it may be high and never low — and the pass checks
`set.system(index)?.icons` per entry, so a stale entry costs one read and draws nothing.

The pass applies the same cut the marker vertex shader applies: `markerFlags[index] === 1`,
and the range from the **cursor** within the category's `maxDrawRange`. The size still comes
from the range to the **camera**. Both readings already exist in `system-pass.ts` and the
comments there say why the two differ.

### The stack geometry moves to `src/scene-data/icon-stack.ts`

`ICON_CSS_SIZE`, `ICON_GAP_CSS`, `ARROW_WIDTH_CSS`, `ARROW_HEIGHT_CSS`, `MAX_ICON_STACKS`,
the lift for a selection, `arrowApexCss` and `iconBottomCss` move out of `src/app/markers.ts`.
The renderer and the overlay then read one rule, which is what `marker-size.ts` already does
for the marker size. `scene-data` must not import `render`, and it does not: `render` imports
`scene-data`.

### The pass draws last

Order in the frame: composite, regions, markers, shapes, **icons**. The stacks sat over the
shapes as DOM elements, so drawing them after the shapes keeps that. The DOM overlay then
draws over the icons, which reverses the old order against the ring, the pin, the name labels
and the plane elements. The spec states that reversal and why it is accepted.

### The name labels keep the element hide, and reuse the code the icons drop

`covered()` in `src/app/markers.ts` walks the 66 keeper in ascending range and stops at the
first candidate no nearer. It moves from the icon loop to the label loop. The hovered and the
selected label skip the test.

*Why not a per-pixel rule here too.* A label is text a reader reads from end to end. Half a
name is worse than no name, and the label is a DOM element, which cannot read a texture.

### The browser tests read placements and pixels

`iconPlacements()` on the handle reports what the frame placed — box, kind, system, colour
and URL — which covers every placement scenario. The occlusion scenarios read canvas pixels,
because the test is per pixel and no element is wholly hidden. `iconDrawCalls()` joins
`markerDrawCalls()` and `shapeDrawCalls()`.

## Risks / Trade-offs

- **A host's cross-origin icons stop drawing.** → Stated as breaking in the proposal and in
  the spec. The map warns once per URL with the URL in the message. The README gains the
  rule. A host can serve the file itself or inline it as a `data:` URL.
- **The library on a CDN loses its built-in icons.** → The same CORS rule reaches them. The
  common CDNs send `Access-Control-Allow-Origin: *`. The warning names the URL, so the cause
  is readable from the console.
- **A card without `EXT_float_blend` draws no range buffer.** → The icons draw with no
  occlusion test, which is the frame the map drew before any such rule existed. The spec
  states the fallback. The dev container has the extension, so the suite measures the real
  path.
- **The load is asynchronous, so the first frames after a record arrives may draw fewer
  icons.** → The spec states it. The browser tests wait for the placements to settle rather
  than draw one frame and read.
- **A host with more than 64 distinct icon vectors loses the ones past the cap.** → The map
  warns once. 64 covers the 16 built-in symbols and a large host set. Raising the cap is a
  constant and a bigger texture array.
- **An SVG rasterises a little differently between browsers.** → The plate and the glyph are
  a black box and a single-colour line, and the existing screenshot baseline covers the look.
- **Two sweeps of candidates now run per frame**, one in the renderer for the stacks and one
  in the overlay for the labels. → The renderer's reads the icon index list and not the set,
  so it is bounded by the records that carry icons. The overlay's sweep is unchanged, and it
  no longer fills a second keeper for the stacks.
- **The plane line, the ring and the pin now draw over a stack.** → Accepted and stated. The
  pin and the stack hold apart by the 28 pixel lift; the other two are thin marks.
