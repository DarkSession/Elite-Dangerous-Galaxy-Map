## Context

Three parts that share no code. See `proposal.md` for why.

What shapes each one:

- **The HUD style sheet** sets `user-select: none` on `.gm-hud`, and every rule is under
  that class. The information panel builds its readouts through `make()` with fixed class
  names, so a rule per class is enough and no element needs a new attribute.
- **The lightbox frame** is a fixed box: `width: min(86%, 1180px)`, `aspect-ratio: 4 / 3`,
  `max-height: 82%`. The image is `position: absolute; inset: 0` with `object-fit: contain`,
  so it fills the frame whatever its own size is. The placeholder is absolute over the same
  box and holds the caption while the image loads. The natural size of an image is known
  only after `load`, and CSS cannot state "at most the natural size times the device pixel
  ratio", so the cap is set from script.
- **The nebula pass** draws every record into an accumulation target whose alpha holds the
  product of the record transmittances, then composites that target into the
  half-resolution target with `ONE, ONE_MINUS_SRC_ALPHA`. The point cloud and the star
  field draw later, into the full-resolution scene target, with additive blending. The
  march already computes the range from the camera to the record's centre in the vertex
  stage, and the selection already carries `range` per instance.
- **The import rule.** The renderer must not import a nebula module as a value.
  `src/render/nebula-slot.ts` is the one seam, and it holds types and number literals only.
  Anything the renderer needs to learn from the pass goes through that file.

## Goals / Non-Goals

**Goals:**

- Put both lightbox caps in one place, so the lesser of them can actually win.
- Keep the nebula change inside the nebula pass and the two sprite passes, with the
  renderer as the only thing that joins them.
- Make every no-nebula frame byte-identical to the frame the tree draws today.

**Non-Goals:**

- No per-pixel depth for the sprite attenuation. The spec states the ceiling.
- No change to the emission of a record, so the light readings this capability already
  bounds are not disturbed.
- No new named setter on the debug handle. `debug.look` is a mutable handle and the four
  new constants go on it.
- No attenuation of the coordinate grid, the region overlay, the system markers or the
  icons. Those four draw after the tone map, on the default framebuffer, so the nebula
  transmittance cannot reach them.

## Decisions

### The selection rules are three CSS declarations, not a class the panel adds

`.gm-hud` keeps `user-select: none`. Five selectors under it set `user-select: text`:
`.gm-hud__info-name`, `.gm-hud__field-value`, `.gm-hud__description`, `.gm-hud__chip` and
the elements the Markdown draw builds inside a description, which are already inside
`.gm-hud__description` and inherit it.

**Why not a modifier class the panel adds to each readout?** The panel builds the readouts
in one place and they already carry names that mean "this is a value". A class would be a
second name for the same thing, and it would have to be added at four build sites.

**Why not make the whole panel selectable?** A drag that starts on a label then runs over
the values copies the labels with them, which is the thing that makes a copied readout
useless. The owner chose the readouts.

`-webkit-user-select` goes beside `user-select` in each rule, as the root rule already
carries both.

### One place computes the lightbox size, and it is script

Two caps apply and the lesser wins: the room the map gives, and the image's own pixels
times the device pixel ratio. **Both are computed in script**, and one inline
`width`/`height` pair carries the result.

```
const box = element;                       // .gm-hud__lightbox, inset: 0
const ratio = doc.defaultView?.devicePixelRatio ?? 1;
// A natural size of 0 is a picture with no size to hold to, so it gets no size.
if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return null;
const roomW = Math.min(box.clientWidth * 0.86, 1180);
const roomH = box.clientHeight * 0.82;
// One scale under both caps, so the picture keeps its aspect ratio.
const scale = Math.min(roomW / image.naturalWidth, roomH / image.naturalHeight, ratio);
image.style.width = `${image.naturalWidth * scale}px`;
image.style.height = `${image.naturalHeight * scale}px`;
```

**Why not the map's cap in CSS and the pixel cap in script?** Because it does not work,
for two reasons.

- An inline `max-width` beats a rule in the style element, whatever the two values are. A
  4,000 pixel image would write `max-width: 4000px` inline and run straight off the map,
  which is the scenario "A large image still fits the map".
- A percentage `max-height` on the image resolves against the frame, and the frame is
  shrink-to-fit, so its height is indefinite and the percentage computes to `none`. The
  82 percent works today because it sits on the frame, whose containing block is
  `.gm-hud__lightbox`, which is `position: absolute; inset: 0` and has a definite height.
  Moving it to the image would take the height cap away without an error.

**Why not `vw` and `vh`?** The HUD does not have to fill the viewport. A host can put the
map in any element, and the 86 percent and the 82 percent are of the HUD. `clientWidth`
and `clientHeight` of the lightbox element are what those two percentages mean.

**Why a stated size and not two maxima?** `max-width` and `max-height` cannot enlarge. At
a device pixel ratio of 2 a 400 by 300 picture must draw at 800 by 600, and a maximum of
800 leaves it at 400. One scale on the natural size gives the aspect ratio back, which is
the only thing the two maxima were doing for us.

**When the size is written.** On `open`, on `load`, and again on the window's `resize`,
which is the event a monitor change, a browser zoom and a window resize all raise, and
which is therefore the one event that covers both a change in the device pixel ratio and a
change in the room. The listener is added on `open` and removed on `close`, so a closed box
costs nothing.

The call on `open` runs **after** the box is shown, because a hidden element reads a room
of 0 by 0. It is there because a picture the box already holds keeps its `src`, and an
unchanged `src` raises no `load`: without it, a second open of the same picture would
carry the size of whatever the box drew last. A new `src` leaves the natural size at 0, so
the same call writes no size and the `load` that follows writes the true one.

A natural size of 0 — an SVG that declares neither a size nor a `viewBox` — gets no size
at all, and the frame stays at its smallest size.

The frame stops being a sized box. `.gm-hud__lightbox-frame` becomes `display: flex` with
no `width` and no `aspect-ratio`, with `min-width: 260px` and `min-height: 160px` so a
frame with no image still reads as a frame. `.gm-hud__lightbox-image` becomes a normal flow
child: `display: block`, `width: auto`, `height: auto`. The placeholder stays
`position: absolute; inset: 0`, so it centres its caption over whatever size the frame took
and adds nothing to the layout. The footer is `position: absolute; bottom: -30px` and the
close control `top: -1px; right: -1px`, so neither is inside the frame's box and neither
adds to its size; the frame is the image plus its one-pixel border.

### The range gain sits in the vertex stage, the power in the fragment stage

The vertex shader already has `centre`, the record's position relative to the camera, so
the range is `length(centre)` and costs nothing new. It computes the gain there and passes
it as a varying. Every vertex of one record computes the same number, which is how
`vTransmittance` already works.

The fragment shader raises the record's own transmittance to that gain:

```
fragColour.a = 1.0 - (1.0 - pow(transmittance.a, gain)) * mean * vWeight;
```

`pow` runs once per fragment, after the march loop, so it does not multiply the march's
cost. At `gain == 1` the expression is the one the shader writes today, bit for bit on any
implementation that is exact for `pow(x, 1.0)`. The unit test on the alpha rule is what
holds that; if an implementation is not exact there, the shader takes the branch
`gain == 1.0` and skips the call. There is no frame comparison against "the tree before
this change": with the branch in place, a frame at both gains 1 is the frame the tree draws
today, so such a comparison would only compare a frame with itself.

**Why a power and not a multiply on the optical depth?** A power on the transmittance is a
multiply on the optical depth, which is the physical form: `T^g == exp(-g * tau)`. The
march writes `T` and not `tau`, so the power is the cheap way to say it, and it keeps `T`
inside 0 to 1 for any gain at or above 0.

**Why the range to the centre and not the apparent size?** The owner asked for range. The
apparent size would make a small record block hard from close by, which is not what was
asked for.

**Why is this not the occlusion constant?** The occlusion constant scales the dust in
front of the record. It already grows with range, and it grows the record's alpha toward
transparent, which is the opposite of the ask. The gain is a second, independent quantity
and the spec keeps them apart.

### The sprite passes read the accumulation target, gated by one uniform and two ranges

The nebula pass already owns an accumulation target whose alpha is the transmittance
product. It keeps it for the frame; nothing is copied and no second target is built.

Three new readings on `NebulaDraw`, which are the seam the renderer reads:

| Reading | What it is |
| --- | --- |
| `transmittance` | The accumulation texture, or `null` for a frame that drew no record |
| `frontRange` | The least `range - radius` over the drawn records, never below 0 |
| `centreRange` | The centre range of that same record |

All three are types on `nebula-slot.ts`, so the entry chunk does not grow and the import
rule holds. The pass sets `transmittance` to `null` at the top of every `draw`, and to the
texture only after it has drawn a record, so a frame that returns early cannot hand back
the frame before it.

The renderer sends the texture, the two ranges and the target size to the point pass and
the star pass. Both fragment shaders do:

```
float share = smoothstep(uNebulaRange.x, uNebulaRange.y, vRange);
float block = mix(1.0, texture(uNebulaTransmittance, gl_FragCoord.xy * uInverseTarget).a, share);
fragColour = vec4(colour * (falloff * vBrightness) * block, 1.0);
```

`vRange` is a new varying; both vertex shaders already compute `range`. Where the renderer
sends no texture, it sends `uNebulaRange` as `vec2(1e30, 2e30)`. The two edges are **not
equal**: `smoothstep` is undefined in GLSL ES 3.00 for `edge0 >= edge1`, its natural
expansion divides by zero there, and a NaN would pass the `share > 0.0` guard as false but
make `mix(1.0, ..., NaN)` return NaN and turn every sprite in the frame black. With
unequal edges and a range that never exceeds the volume box, `share` is exactly 0. The
shader then guards the fetch with `if (share > 0.0)`, so a frame with no nebula issues no
texture read, and the unit test reads the pair the renderer sends and not only that no
texture went with it.

**Why sample at half resolution?** The accumulation target is the size of the
half-resolution target, and the sprites draw at full resolution. The transmittance field
of a marched volume is smooth over a few pixels, so a linear fetch at half resolution is
enough, and the alternative is a full-resolution nebula pass, which the capability's cost
bounds do not allow.

**Why the front range and the centre range and not a depth buffer?** The passes draw with
no depth test at all, into targets with no depth attachment. Adding one would change the
blending of every pass. The two ranges are one uniform and give the right answer for the
record the camera is nearest to, which is the record whose error would be visible.

**The rejected alternative: a min-blended range target.** A second target holding the
nearest front range per pixel, drawn with `blendEquation(MIN)`, would remove the ceiling.
WebGL2 has no per-attachment blend state without `OES_draw_buffers_indexed`, so the target
needs a second full pass over the records — a second 36-vertex draw per record and a second
fill of up to 4 screen areas. That is a real cost for a case the spec's ceiling paragraph
bounds. It is the upgrade path if the artifact is ever reported.

### The four gains go on `look`, with the reader at the uniform site

`LookSettings` gains `nebulaBlockNear`, `nebulaBlockFar`, `nebulaBlockGainNear` and
`nebulaBlockGainFar`, with the defaults exported from `nebula-slot.ts` beside
`DEFAULT_NEBULA_OCCLUSION`. The reader that drops a value it cannot read runs where the
uniform is set, each frame, exactly as `nebulaOcclusionOf` does and for the same reason:
`look` is a handle the caller writes in place, so a clamp in a setter alone is gone around.

No new named setter on `GalaxyMapDebug`. `debug.look` is already reachable from
`window.__galaxyMap` and the browser tests write it. `setNebulaOcclusion` exists because it
predates that, not because a setter is needed.

## Risks / Trade-offs

**A selectable value makes a drag on the panel select text instead of doing nothing** →
The panel already takes the pointer events, so the map never saw that drag. The spec has a
scenario that reads the view before and after a drag across the description.

**The lightbox's shrink-to-fit frame can collapse if the image has no size** → The frame
carries `min-width` and `min-height`, and the spec has a scenario that opens the box on a
URL that cannot load and reads the frame's size.

**An SVG record image has no raster size to cap** → The two demo images declare `width` and
`height`, so `naturalWidth` reads 400. An SVG that declares only a `viewBox` reads the
viewBox size in Chromium and Firefox; one that declares neither reads 0, and a natural
size of 0 gets no size written at all, because there is no aspect ratio to hold it to. The
picture then draws at the replaced element's own default inside a frame that holds its
smallest size, which is the one case that has no size to hold to.

**The far gain of 2.0 could punch a dark hole in the bulge** → The dust in front still
scales the alpha, so a record behind bright mass still stops attenuating. The four
constants are on `debug.look`, so the owner tunes them in the page.

**The sprite fetch costs time in the two passes that draw the most fragments** → The fetch
is guarded by `share > 0.0`, so it is paid only where a nebula is in front of the sprite,
and not at all in a frame with no nebula. The spec holds the twelve budget views.

**The default view's baseline image could move** → It cannot: 60,000 light years is above
the nebula band, the pass returns before it draws, `transmittance` is null and the guard
takes the fetch out. The spec makes that a scenario rather than an argument.

**A stale accumulation target could leak into a later frame** → The pass nulls
`transmittance` at the top of `draw` and sets it only after a record has drawn. The spec has
the scenario that moves the camera out of the band and reads the same block.
