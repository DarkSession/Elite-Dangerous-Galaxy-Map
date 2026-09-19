## Why

The nebula pass draws its sprites over the half-resolution target with source-over
blending and no depth. A nebula therefore draws at full strength wherever it sits: one
on the far side of the bar reads as clearly as one between the camera and the core, and
a dark nebula behind 20,000 light years of bulge still cuts a hole in the light in front
of it. The volume pass right below it already attenuates its own light by the dust it
marches through, so the frame contradicts itself in one target.

The fix is to give each sprite the transmittance the volume pass would have carried to
that point, and to scale the sprite by it.

## What Changes

- The nebula vertex shader **marches the density volume from the camera to the record's
  centre** and gives the fragment shader the transmittance of that segment. The sprite's
  colour and its alpha are both scaled by it, so an occluded nebula both stops adding
  light and stops hiding what is behind it.
- The extinction rule — decode, compress, fade at the rim and by height, then the dust
  tint — moves into **one GLSL file that `volume.frag` and `nebulae.vert` both read**
  through the marker include `shader-include.ts` already holds for the marker shaders.
  Neither shader keeps a copy, so the two cannot drift.
- The extinction is **wavelength dependent**, with the same `DUST` weights the volume
  uses, so a nebula behind the bulge dims and turns warm rather than only dimming.
- The renderer holds the **volume texture** and gives it to both passes. Today
  `createVolumePass` creates and owns it. Nothing else changes about it: one texture is
  uploaded, as now.
- One new look constant, **`nebulaOcclusion`**, scales the optical depth. `0` is the
  look before this change and `1` is the volume's own extinction. It is what a browser
  test switches to compare two frames.
- Before the volume arrives, and with the volume switch off, the transmittance is `1`,
  so the pass draws what it draws today.

### Non-goals

- **No per-fragment occlusion.** One transmittance serves a whole sprite, taken at the
  record's centre. A sprite is at most 400 light years across and the density field
  turns over kiloparsecs, so a gradient across one sprite is below what the tone map
  resolves. A per-fragment march would cost the fill of every sprite times the step
  count.
- **No occlusion of the point cloud, the star field or the markers.** Those passes draw
  into the scene target after the half-resolution target is read out, so they still draw
  over a nebula whatever their depth. That is a separate change.
- **No occlusion of the cloud sprites.** They keep the fade they have.
- **No nebula shadowing.** A nebula does not dim the volume, the clouds or another
  nebula. Sprite over sprite keeps the back-to-front source-over order the pass already
  holds.
- **No new asset and no new fetch.** The march reads the volume texture the renderer
  already uploads.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `nebulae`: one added requirement — the material between the camera and a nebula
  attenuates it. The capability is live in `openspec/specs/nebulae/spec.md` with seven
  requirements, since `add-nebulae` landed as commit `63184db` and archived as
  `2026-09-19-add-nebulae`. This change adds one requirement and modifies none of the
  seven.

## Order with `make-nebulae-optional`

`make-nebulae-optional` is in flight and says to take **this change first**
(`proposal.md` lines 119-120, `design.md` line 215). Its reason: it moves the nebula
shaders, the pass and the atlas out of `src/render/renderer.ts` and `src/render/buffers.ts`,
which is the same renderer wiring tasks 2.2 and 3.4 here add to. If this change lands
first, that one moves the finished march once. If it lands first, this change writes the
march into a pass that has just moved, and the shared include is written twice. The two
are independent at the spec level — that change only ADDs a requirement to `nebulae` — so
either order works, and the ordering is a cost decision, not a correctness one.

## Impact

**Depends on `add-nebulae`.** That change is committed as `63184db` and archived as
`2026-09-19-add-nebulae`, so the `nebulae` capability is live in `openspec/specs/`. This change builds on it.

**Changed code**

| Path                                  | What changes                                            |
| ------------------------------------- | ------------------------------------------------------- |
| `src/render/shaders/volume-density.glsl` | New. The shared rule: decode, compress, rim, height     |
| `src/render/shaders/volume.frag`      | Reads the shared rule in place of its own lines          |
| `src/render/shaders/nebulae.vert`      | Marches the volume and writes the transmittance          |
| `src/render/shaders/nebulae.frag`      | Takes the transmittance as a `vec3` varying              |
| `src/render/shader-include.ts`        | A second marker and its put call                         |
| `src/render/volume-pass.ts`           | Takes a `VolumeTexture` rather than a `DensityVolume`    |
| `src/render/nebula-pass.ts`           | Binds the volume texture, holds the new uniforms         |
| `src/render/renderer.ts`              | Owns the volume texture and gives it to both passes      |
| `src/app/create-map.ts`               | The `nebulaOcclusion` look constant                      |
| `e2e/nebulae.spec.ts` | The four occlusion readings, and the existing compile test, which must compose the shared rule |
| `e2e/frame-budget.spec.ts` | The drawn-sprite floor the change measures |
| `src/app/main.ts` | Exposes the occlusion hook on `window.__galaxyMap` |
| `src/render/global.ts` | Types that hook |
| `src/render/nebula-pass.test.ts` | The uniforms, the no-volume case, the shared rule, and the `putVolumeDensity` include test |
| `e2e/paint-cost.spec.ts` | Reads the frame cost; the one frame-cost spec Firefox runs |
| `src/render/renderer.test.ts` | The texture move and the two passes' uniforms |
| `tests/main-bundle.test.ts` | The entry chunk bound and its comment entry |
| `e2e/look.spec.ts` | The bounded-sum reading, if it moves |

**Scale.** The march runs in the vertex shader, so it costs the instance count times
four vertices times the step count. At the budget of 256 drawn nebulae and 64 steps that
is 65,536 samples of the 3D texture and 65,536 of the 2D detail grid per frame, against
the volume pass's own 96 steps over every fragment of a half-resolution target, which is
about 50 million at 1080p: the pass draws into the half-resolution target, so 1080p is
960 x 540 fragments at 96 steps. The march is therefore about a seven-hundredth of the volume
pass, and the frame budget the `far-view-rendering` spec states is unchanged.

The 4-times redundancy — the four corners of one quad march the same segment and reach
the same answer — is accepted rather than removed. Design records why.

**The entry chunk.** `tests/main-bundle.test.ts` guards the library's entry chunk at
270,000 bytes and the reading after `add-nebulae` is 266,996, so 3,004 bytes are free.
Shader text reaches that chunk verbatim, comments and all. **Expect the bound to move.**
The shared include does not net out: the lines it takes from `volume.frag` reappear in
`volume-density.glsl`, and the pair pays a function signature, a doc comment and two marker
lines on top. A design-time estimate puts the whole change near 4,000 bytes, in a range of
about 2,500 to 5,500, against 3,004 bytes of room. The task list measures the built chunk
and, where the reading passes the bound, moves the bound to the next round figure above it
and records the reading. The standing line in the guard's comment block is that the next
change touching this chunk must read the bound again.

**Runtime dependencies**: none.

**Risk.** `MAX_VERTEX_TEXTURE_IMAGE_UNITS` is at least 16 in every WebGL2
implementation, so a vertex-stage `sampler3D` is guaranteed by the specification rather
than by a vendor. The browser suite runs Chromium and Firefox on the host GPU and fails
a run that falls back to software, so a stage that a driver refuses shows there and not
in production. **The link check itself runs on Chromium alone.** It lives in
`e2e/nebulae.spec.ts`, and `tests/browser-suite.test.ts` pins Firefox to
`00-renderer.spec.ts` and `paint-cost.spec.ts`. A Firefox driver that refused the
vertex-stage sampler would show indirectly, through the frame cost `paint-cost.spec.ts`
reads, rather than through the link check. That is accepted rather than fixed: widening
the Firefox list is a change to the suite's shape and belongs to its own proposal.
