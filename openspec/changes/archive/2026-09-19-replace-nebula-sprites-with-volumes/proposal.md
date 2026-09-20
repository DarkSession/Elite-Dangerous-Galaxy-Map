## Why

A nebula draws as a flat, round billboard from a 34-tile atlas. Three faults follow from
that. The sprite holds no shape, so Barnard's Loop draws as a disc and not as an arch.
One tile serves several records, and nothing can tell two such records
apart. The sprite
fades to nothing inside one radius, because a billboard cannot be entered, so a camera
that flies into a 200 light year nebula sees nothing at all.

A nebula is not a flat card. It is a cloud with depth, and a ray march through a 3D
volume is what gives it that depth at any range. A spike on branch
`spike-nebula-volumes` marched one volume in this renderer and measured the result, so
the cost and the fidelity are readings and not estimates.

## What Changes

- **BREAKING** The sprite atlas and the sprite pass go. The 1,536 by 1,536 texel WebP of
  34 tiles, the atlas loader and the instanced quad pass are all removed.
- A nebula draws as a ray-marched volume inside a box of twice the record's radius. The
  march is a volume integral: the transfer function is a four-channel extinction
  coefficient that the density indexes, and the output is premultiplied.
- The record file gains an asset index and a rotation. It loses the tile index.
- The published types move with the art: `NebulaSource.loadAtlas` becomes `loadVolumes`, the
  `Atlas` type parameter and `NebulaFrame.spriteScale` are renamed, `NebulaFrame` gains the
  canvas width, and `LookSettings.nebulaBrightness` becomes a three-value light gain. A host passes the value it imported and writes no source of its own, so
  no host code changes, but the `.d.ts` does.
- The map fetches **33 volume assets**, each a density volume and a colour volume in block
  format, with one index file and one binary file of the 33 transfer tables — 68 files.
- **BREAKING** The fade inside one radius goes. A camera flies into a nebula and the
  volume fills the view.
- Five records of 358 carry a rotation. The other 353 carry the identity. That rotation is the
  whole of what tells two records apart when they share an asset, so the second fault above is
  answered as a **capability** and not yet in the data: 358 records still resolve to 33 assets,
  much as they resolved to 34 tiles. What this change ships in the data is the shape and the
  entry.

**The three sizes, which are three different numbers.**

|                       | atlas today            | volume set |
| --------------------- | ---------------------- | ---------- |
| over the wire, brotli | not measured           | 1.10 MiB   |
| on disk, as served    | 0.77 MiB               | 2.78 MiB   |
| in video memory       | 9.00 MiB (1536² RGBA8) | 6.03 MiB   |

The volume set's on-disk figure counts every file it serves: 2.64 MiB of `.dds` volumes,
the 132 KiB transfer file and the index.

The set decodes from `BC4_UNORM` and `BC1_UNORM` on load and uploads plain `R8` and
`RGBA8`, so the video memory figure is neither the wire figure nor the on-disk figure.
Video memory falls although the set holds **more** texels than the atlas: the density volume
uploads as `R8`, one byte a texel, where the atlas is `RGBA8` at four.

**Why 33.** The 358 records name 34 art templates. Two of those templates draw the same
art, so the records resolve to 33 distinct assets. The art set holds 39 at this level of
detail; six are reached by no record. This change ships the 33 the records reach.

**The library names its own assets.** The art arrives under names that are neither ours
to use nor reliable: two of them name the wrong nebula outright. The map names each asset itself, in kebab-case — the nebula's own name for the
20 one-off records (`barnards-loop`, `cats-eye`, `orion`, …) and `bright-01` to
`bright-04`, `dark-01` to `dark-05` and `planetary-01` to `planetary-04` for the 13 the
procedural pool draws from.

Non-goals:

- The high level of detail. This change ships the 33 low assets alone. The high set is a
  later change and needs no data regeneration to add.
- Per-sample occlusion. The galaxy's dust still attenuates a whole record by one
  transmittance taken at its centre, as it does today.
- A new look beyond what the art itself brings. The zoom band, the far fade, the size floor
  and the draw order keep the behaviour they have. The one brightness dial does change: it
  becomes three values, one per colour channel, fitted on the spike so the marched volume
  matches the sprite it replaces.

## Capabilities

### New Capabilities

None. The change replaces how an existing capability draws.

### Modified Capabilities

- `library-package`: one scenario of **The library build emits a package and no page** names
  the sprite atlas file; it names the volume index and the volume assets instead.
- `nebulae`: the art becomes a volume set instead of a sprite atlas; a record gains an
  asset index and a rotation and loses its tile index; a nebula draws as a marched box
  instead of a screen-aligned quad; the fade inside one radius is removed; the drawn
  budget becomes a covered-area budget rather than a count of 256.

## Impact

**Scale.** The galaxy holds about 400 billion systems. The nebula set is 358 records and
does not grow with it. The cost that matters is fill, not count: a marched box costs in
proportion to the pixels it covers times the steps per ray. The spike measured, at 1,280
by 720 and 32 steps over one object-space unit, 4.8 µs for a box covering a small patch,
37.7 µs for one covering much of the frame and 97.9 µs for one filling the frame with the
camera inside it. `e2e/frame-budget.spec.ts` runs at **1,920 by 1,080**, which is 2.25
times the pixels, so the same readings there are about 11, 85 and **220 µs**. One record
filling the frame is 1.3 percent of the 16.7 ms budget and the whole covered-area budget
is about 5 percent. The count of 256 is therefore the wrong guard and a covered-area guard
replaces it.

Those readings come from one asset, `barnards-loop`, whose density volume is 32 texels
a side. Fifteen of the 33 are 64 a side. The implementation re-measures on a 64 asset
before the budget figure is fixed.

**Fidelity.** The spike's GLSL march was read back and compared against a CPU march of
the same data through the map's own tone map. The difference is 0.0105 RMSE in display
units, about 2.7 levels of 255, and the residual is the half-resolution edge and the
dither. The art's own compaction error is at most 0.03 emission RMSE over peak against the
full-resolution original, on the worst of three axes — which is the budget the pack was
made to, so it is a stated budget rather than an independent check.

**Code.**

- `src/scene-data/nebulae.ts`, `nebulae.json` and `nebulae.test.ts`: the record format and
  the selection rule.
- `src/render/nebula-pass.ts`, `nebula-pass.test.ts`, `src/render/nebula-atlas.ts` and the
  two nebula shaders: replaced by a volume pass, a block decoder and a marching shader pair.
- `src/render/renderer.ts` and `renderer.test.ts`: `LookSettings` holds the brightness dial
  that becomes a three-value light gain, plus the new step rate.
- `src/render/buffers.ts` and `buffers.test.ts`: the chunk guard names the atlas file.
- `src/render/nebula-slot.ts` and `nebula-slot.test.ts`: the seam the renderer reaches the
  nebulae through. The test pins the module's exact built output, so it changes with the
  new look settings.
- `src/app/create-map.ts` and `create-map.test.ts`: the readability check names `loadAtlas`
  and the option documentation says "draws no sprite".
- `src/nebulae/`: the second entry point, whose import graph carries the whole nebula set.
  In `eslint.config.js` both the `nebulaImportGroups` list and the `ignores` list name the
  atlas module by path, and both follow the rename.
- `openspec/specs/library-package/spec.md`: that capability requires the implementation to
  write the built entry-chunk reading into it. The reading moves, so the number is updated.
  Its requirement **The library build emits a package and no page** changes too: the scenario
  **The entry chunk holds no nebula code** asserts the chunk holds no "sprite atlas file name",
  and this change deletes that file. The delta replaces it with the volume index name and the
  volume asset names. No other requirement of that capability changes.
- `THIRD_PARTY_NOTICES.md` and `tests/third-party-notices.test.ts`: the notice describes
  the atlas by name and the test asserts that name. This is the attribution for Frontier's
  art, so it is not a formality.
- `e2e/nebulae.spec.ts` and `e2e/frame-budget.spec.ts`: the readings that name the sprite,
  the atlas tiles and the two near fades.
- `tests/main-bundle.test.ts`: it names the atlas file, counts exactly one `.webp` and
  checks that no `data:image/webp` reaches the bundle, in sixteen places, with a
  seventeenth that is record-shaped and an eighteenth that names the atlas shaders' varying. A set of 66 asset
  files, the transfer file and the index — 68 in all — needs all sixteen rewritten. The library build,
  `vite.config.lib.ts`, inlines every asset as a data URI whatever its size, so all 68 files
  are imported with `?url&no-inline`. Without it about 2.64 MiB, or 3.6 MiB as base64, lands
  in the `nebulae` entry chunk, which no test bounds. It does not reach the main entry chunk,
  which holds no nebula module, so that chunk's bound would not react.

- `README.md`, `AGENTS.md`, `vite.config.lib.ts` and `e2e/helpers.ts`: prose that names the
  sprite atlas, the 811,762 bytes of art or the record file's 14,626 bytes.

**Data.** The 33 assets and their index are copied in and treated as project-owned, as the
galaxy model is. The record file is regenerated once, with the asset index and the rotation
joined on to each record.

**Risk.** Five of the 33 assets carry a **negative** extinction channel in their transfer
table, so the transmittance can rise above 1 along a ray — up to 6.0 on `cats-eye`, which
carries the largest negative extinction of the set at -193.5.
That is what the transfer tables ask for. Measured over the 33 assets at 25, 32 and 64
steps per unit, the output alpha never leaves 0 to 1, so the blend is safe. Clamping the
transmittance at 1 would be physically tidier but changes `cats-eye` by 70 percent of
peak emission, so this change does not clamp and tests the alpha range instead.

**Risk.** The rotation convention is settled to `Rx(a)·Ry(b)·Rz(c)` composed with the
world-z flip, by matching Barnard's Loop and the Horsehead against in-game references.
Whether the matrix or its transpose applies is not settled. The change ships the direct
reading behind a named constant, so a correction is one line and touches no data.
