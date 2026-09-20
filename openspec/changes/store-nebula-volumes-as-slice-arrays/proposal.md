## Why

The nebula volumes arrive as BC4 and BC1 blocks and the loader decodes every one of them
on the CPU before upload. That costs **16.9 ms of main-thread work** on load and
**6.03 MiB of video memory**, against 2.64 MiB of blocks on disk. The decode exists for one
reason: the volumes are `TEXTURE_3D`, and WebGL exposes no compressed format for that
target.

A measurement on the development GPU gives the way out:

```
BC4 -> TEXTURE_3D        texStorage3D = 1282 (INVALID_OPERATION)
BC4 -> TEXTURE_2D_ARRAY  texStorage3D = 0    (accepted)
BC1 -> TEXTURE_2D_ARRAY  texStorage3D = 0    (accepted)
```

A BC4 or BC1 volume is already stored slice by slice, because a block is 4 by 4 by **1**
texels. The same bytes read as an array of 2D images upload with no decode at all. The art
does not change; only the target and the container do.

## What Changes

- Each volume ships as one **KTX2** file holding an array of 2D slices, in place of the
  `.dds` file holding a 3D texture. The block payload is byte-for-byte the same.
- A script in the repository rewrites the container. It reads the committed `.dds` blocks
  and writes the `.ktx2` files, and a unit test asserts the blocks did not change.
- The renderer uploads the blocks to a `TEXTURE_2D_ARRAY` with `compressedTexSubImage3D`
  where `EXT_texture_compression_rgtc` and `WEBGL_compressed_texture_s3tc` are both
  present. Video memory falls from 6.03 MiB to 2.76 MiB and the load decode falls to zero.
- **The CPU decode stays as the fallback.** A context that refuses either extension decodes
  as it does today and uploads plain `R8` and `RGBA8` to the same array target. The
  existing requirement that the map needs no compressed-texture extension is unchanged.
- The march reads a `sampler2DArray`. An array filters inside a layer but not across
  layers, so the shader fetches two layers and interpolates the third axis itself: **four
  texture fetches a step instead of two**, in the fragment stage.
- The spec gains a **measured cost bound** on that fetch count, taken at the camera where
  the fragment march costs most, and the change does not land if the bound fails.

### Non-Goals

- The art itself. The 33 assets, their sides, their compaction error and the transfer
  tables are untouched.
- The record file, the selection, the covered-area budget, the zoom band and the fades.
- The integral the march computes, the tone map and the look. A frame drawn after this
  change is meant to be the same frame, within the fixture RMSE bounds the suite already
  holds.
- Any other block format. BC7 and ASTC were measured and rejected in the change this one
  builds on.

## Capabilities

### Modified Capabilities

- `nebulae`: the storage, the container and the upload path of the volume set change, and
  the march gains a stated bound on its texture-fetch cost. The requirement that fixes the
  files as `.dds` 3D textures decoded on load is replaced.

## Impact

**Scale.** The set is 33 assets and 358 records, and the covered-area budget lets a frame
draw up to 4 screen areas of nebula.

**Which camera.** A sweep of nine distances from Barnard's Loop, pass alone, gives the cost
ranking below. The worst is **120 light years**, inside a record of radius 200: far enough in
that the box fills the frame, far enough back that a ray crosses most of it.

| distance | 20 | 60 | 120 | 180 | 200 | 230 | 260 | 320 | 500 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pass, ms | 0.416 | 0.437 | **0.445** | 0.412 | 0.431 | 0.422 | 0.383 | 0.366 | 0.320 |
| covered | 1.56 | 2.04 | 1.18 | 1.07 | 1.06 | 1.04 | 0.82 | 0.54 | 0.23 |

Those nine readings are a standalone run and they rank the cameras; they are not the level
the bound is stated at, because a standalone run is not the condition the suite measures in.

**The baseline.** `e2e/nebula-cost.spec.ts` already reads the pass alone at two of those
cameras, in the timed pass of `scripts/e2e.mjs` on one worker, and records **0.655 ms at 120
light years** and **0.614 ms at 260**. Those two are means of one run, so the implementation
re-took all three cameras as medians of five runs before it changed the shader, which is what
the spec asks for. The medians read **0.523 ms at 60 light years, 0.512 at 120 and 0.485 at
260**, and the spec states the bounds against those three. The whole frame at the near view,
every pass on, reads 1.17 ms against the 16.7 ms budget. The bound is on the pass, not the
frame.

**Sizes**, over the committed 66 volume files:

| | today | after |
| --- | --- | --- |
| block payload | 2,760,704 | 2,760,704 |
| art directory, on disk | 2,914,225 | 2,918,185 |
| over the wire, brotli | 1,155,727 | 1,160,103 |
| video memory, block path | 6.03 MiB | **2.76 MiB** |
| video memory, decoding path | 6.03 MiB | 6.03 MiB |
| load decode, block path | 16.9 ms | **0** |

The wire figure is `brotliCompressSync` at its defaults, which is the compressor the
capability's budget is already stated against. The after figure was not predicted here,
because it depends on the exact header bytes; task 5.3 read it from the real files and it
came out 4,376 bytes above the `.dds` set. Both sit far under the 1.3 MiB bound the
capability states.

KTX2 costs 60 bytes a file more on disk than DDS for the identical payload: a 208-byte
header against DDS's fixed 148, so 3,960 bytes over 66 files. The 208 is 12 identifier
bytes, 68 header bytes, a 24-byte level index, a 44-byte descriptor block, a 56-byte
key/value block holding one pinned writer string, and 4 bytes of padding, because a BC1 or
BC4 level must start at a multiple of 8. Fixing that string is what makes the total
reproducible.

**Code.** `src/render/nebula-volumes.ts` (the loader, the container parser and the upload),
`src/render/shaders/nebulae.frag` (the sampler type and the z interpolation),
`src/render/nebula-pass.ts` (the texture binds), `src/render/nebula-art/` (66 files
replaced), `scripts/` (the new conversion script), and the unit and browser tests that read
any of them.

**Published surface.** None. `NebulaSource`, the `./nebulae` subpath and every published
type keep their shape. A host sees a smaller video-memory footprint and nothing else.

**Sequencing.** This change builds on `replace-nebula-sprites-with-volumes`, which is
implemented but not archived. It must not start until that one lands.
