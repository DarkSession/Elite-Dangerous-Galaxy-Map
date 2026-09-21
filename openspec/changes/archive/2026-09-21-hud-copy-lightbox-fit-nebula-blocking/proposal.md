## Why

Three faults came out of use. The reader cannot copy a value out of the information
panel, because the HUD root sets `user-select: none` on every element it builds and the
copy buttons cover the system name and the position alone. The lightbox draws a 400 by 300 record picture at
1180 by 885, because its frame is a fixed 4 by 3 box and the picture stretches to fill it.
A nebula stops hiding what is behind it the further it sits from the camera, which is the
opposite of what the eye expects, and no nebula hides a star at all, because the point
cloud and the star field draw after the nebula composite.

## What Changes

**The information panel's readouts become selectable.**

- The values of the field grid, the system name, the description, the host's section text
  and the category chips take `user-select: text`. The reader can drag over a value and
  copy it with the keyboard.
- The labels, the buttons, the thumbnails and the rest of the HUD keep `user-select: none`,
  so a drag near a panel edge does not highlight a heading.
- The copy buttons stay. They are the one-click route, and a selection is the route for a
  value that carries no button.

**The lightbox fits the picture instead of stretching it.**

- The drawn picture SHALL NOT exceed its own pixel size times the device pixel ratio. A
  400 by 300 picture draws 400 by 300 on a 1x screen and at most 800 by 600 on a 2x one.
- The frame sizes to the drawn picture, with a stated smallest box so a picture that has
  not loaded and a picture that failed still read.
- The frame keeps the caps it has for a large picture, so a 4,000 pixel picture still fits
  the map.
- **The demo's own two pictures shrink.** `ruins-site.svg` and `structure-site.svg` are
  400 by 300 and draw at 1180 by 885 today. After this change they draw at 400 by 300 on a
  1x screen, which is about a third of the drawn size they have now. They are vector art
  and lose no detail at either size. The owner asked for the cap as stated, so this is the
  result and not a fault, and it is the first thing a reader will see.

**A nebula blocks light by its range, and it blocks the stars.**

- The record's own extinction takes a gain that follows the range from the camera to the
  record's centre: softer near, stronger far. The two gains and the two range edges are
  look constants with a debug handle, so the owner tunes them without a build.
- The nebula transmittance multiplies the point cloud and the star field, so a star behind
  a nebula dims. A sprite nearer than the nearest drawn record takes none of it, which is
  what keeps a star in front of a nebula bright.
- A frame that draws no nebula pays for none of this and draws what it draws today.

**Non-goals.**

- The lightbox caption and the system name under the frame stay unselectable. The ask
  names the panel's values.
- The other HUD panels — the top bar, the category browser, the map options panel and the
  dataset dialog — keep `user-select: none`.
- The dust in front of a nebula keeps scaling the record's alpha. This change adds a gain
  to the record's own extinction and does not remove the rule that an occluded nebula
  stops attenuating.
- The attenuation of the sprite passes carries no per-pixel depth. The ceiling is stated
  in the design and in the spec.
- The coordinate grid, the region overlay, the system markers and the icons take no
  attenuation. They draw after the tone map, on the default framebuffer, so a nebula
  cannot reach them. "A nebula blocks the stars" means the point cloud and the star field.
- No new look setting for the strength of the sprite attenuation. The two range gains are
  the one control for how solid a nebula reads.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `map-hud`: a new requirement that the information panel's readouts are selectable; the
  requirement "The images open in a lightbox" gains the rule that the lightbox never
  enlarges a picture past its pixel size times the device pixel ratio, and that the frame
  sizes to the picture.
- `nebulae`: a new requirement that a nebula blocks by its range, which puts a gain on the
  record's own extinction and leaves the requirement "The material in front of a nebula
  attenuates it" as it stands; a new requirement that the nebula transmittance attenuates
  the point cloud and the star field, with the depth gate, the no-nebula case and the
  measured cost bound.

## Impact

**Code.**

- `packages/galaxy-map/src/hud/styles.ts`: the selection rules and the lightbox frame
  rules.
- `packages/galaxy-map/src/hud/lightbox.ts`: the drawn size, which needs the picture's
  natural size and the device pixel ratio, so it is set on `open`, on `load` and again on a
  resize.
- `packages/galaxy-map/src/hud/index.ts`: `dispose` closes the box, which drops the resize
  listener.
- `packages/galaxy-map/src/render/shaders/nebulae.vert` and `nebulae.frag`: the range gain.
- `packages/galaxy-map/src/render/nebula-pass.ts`: the gain uniforms, the transmittance
  texture it now keeps for the frame, and the nearest record's front and centre ranges.
- `packages/galaxy-map/src/render/nebula-slot.ts`: three new frame members and three new
  readings on `NebulaDraw`, all types and number literals, so the entry chunk is unchanged.
- `packages/galaxy-map/src/render/renderer.ts`: it hands the transmittance and the two
  ranges to the point pass and the star pass.
- `packages/galaxy-map/src/render/point-pass.ts`, `star-pass.ts` and their four shaders:
  the sampled transmittance and the range gate.
- `packages/galaxy-map/src/app/create-map.ts`, `render/global.ts` and `apps/demo/src/main.ts`:
  one reader, `debug.nebulaSpriteRange()`, which reports the range pair the two sprite
  passes were sent for the frame. The scenario "A star in front of the nearest nebula keeps
  its light" reads that pair, so the test cannot be written without it. It is a reader and
  not a setter.

**Tests.** `e2e/hud.spec.ts` for the selection and the lightbox size, `e2e/nebulae.spec.ts`
for the blocking, `e2e/nebula-cost.spec.ts`, `e2e/frame-budget.spec.ts` and
`e2e/stars.spec.ts` for the cost, `e2e/look.spec.ts` for the baseline image, and unit tests
beside `lightbox.ts`, `nebula-pass.ts` and `renderer.ts`.

**Scale.** The panel holds a bounded field grid and at most 8 images, so the selection
rules cost one style declaration and no work per frame. The nebula change runs over the
358 records the set holds and the 4 screen areas the covered-area budget allows, at 1920
by 1080. The two sprite passes gain one texture fetch per fragment, and the frame SHALL
stay inside the 16.7 ms `far-view-rendering` and `close-view-stars` state at all twelve
budget views. The default view at 60,000 light years draws no nebula, so its baseline
image does not move.

**Compatibility.** No public member is removed. The renderer gains look constants for the
range gains, in the manner of `nebulaOcclusion`. The `@elite-dangerous-almanac/galaxy-map`
entry chunk keeps the nebula code out, because `nebula-slot.ts` still imports nothing.
