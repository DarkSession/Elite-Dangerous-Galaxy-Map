## Context

See [proposal.md](proposal.md) for the motivation and the measured sizes.

Three facts shape everything below.

**WebGL exposes no compressed format for `TEXTURE_3D`.** Measured on the development GPU:
`texStorage3D` with `COMPRESSED_RED_RGTC1_EXT` on `TEXTURE_3D` returns `INVALID_OPERATION`
(1282); the same call on `TEXTURE_2D_ARRAY` returns no error. `WEBGL_compressed_texture_s3tc`
and `WEBGL_compressed_texture_astc` both list `TEXTURE_2D` and `TEXTURE_2D_ARRAY` as their
targets and neither lists `TEXTURE_3D`.

**A BC4 or BC1 volume is already an array of slices.** A block covers 4 by 4 by **1** texels,
so the file holds `side/4 * side/4` blocks for slice 0, then slice 1, and so on. Reading the
same bytes as `layerCount = side` 2D images is a relabelling, not a conversion.

**An array texture does not filter across layers.** `sampler2DArray` takes the layer as an
un-normalised third coordinate and rounds it. Bilinear filtering inside a layer is free; the
third axis is the shader's job.

## Goals / Non-Goals

**Goals:**

- One upload path and one shader program, whichever texture format the context accepts.
- The block bytes provably unchanged, so the art cannot drift through the conversion.
- A measured decision on the fetch cost, not an assumed one.

**Non-Goals:**

- A KTX2 reader for files this repository did not write. The parser handles the one shape
  the conversion script emits and throws on anything else.
- Supercompression, mip levels, cube maps, sRGB formats, or `layerCount = 0`.
- Any change to the art, the record file, the selection or the look. See the proposal's
  Non-Goals.

## Decisions

### Convert in the repository, not outside it

**Chosen:** a Node script with no dependencies reads each committed `.dds`, takes the bytes
after the 148-byte DX10 header, and writes a `.ktx2` around them.

- _Why:_ the payload is byte-identical, so the conversion is provable. A unit test hashes the
  block payload of every `.ktx2` and compares it against the digest already committed in
  `tests/fixtures/nebulae.json` for the `.dds` file. Nothing outside the repository has to be
  trusted, and the owner supplies no new input.
- _Rejected:_ files converted outside and handed over, as the `.dds` set was. It needs a
  second round trip whenever the art changes and nothing in the tree can check it.
- _Rejected:_ `toktx` or `ktx` from the KTX-Software toolchain. They are not in the dev
  container, they re-encode rather than relabel, and a re-encode is exactly what must not
  happen here.

### Write and read the container by hand, with no library

**Chosen:** about 40 lines each way. The header is 12 identifier bytes, 68 fixed bytes, then a
level index of 24 bytes per level. The reader checks the identifier, reads `vkFormat`,
`pixelWidth`, `pixelHeight`, `layerCount`, `levelCount` and `supercompressionScheme`, then
reads the one level's byte offset and length from the level index and takes that slice.

- _Why:_ the files are ones this repository writes, and the shape is fixed: one level, one
  face, no supercompression, a 208-byte header, and `vkFormat` either
  `VK_FORMAT_BC4_UNORM_BLOCK` (139) or `VK_FORMAT_BC1_RGB_UNORM_BLOCK` (131). The reader
  refuses everything else, which is a smaller contract than a general parser and a stricter
  one.
- _The 208 bytes:_ 12 identifier, 68 header, 24 for a one-entry level index, 44 for a basic
  descriptor block of a single-sample compressed format, 56 for one key/value entry holding a
  pinned writer string, and 4 of padding, because a BC1 or BC4 level must start at a multiple
  of 8. The 56 is 4 for the length, 10 for `KTXwriter` and its zero, 39 for the value and its
  zero, and 3 of padding to the next multiple of 4. Pinning that string is what makes the
  on-disk total reproducible, because its length is the only free number in the header. The
  value carries its terminating zero, as the format requires, so a general reader can take it
  as a C string.
- _Rejected:_ `ktx-parse` from npm. A dependency and its 7-day release hold, for a
  fixed-shape file we emit ourselves. It also reads far more of the format than this needs,
  which widens what can go wrong rather than narrowing it.

### One target on both paths

**Chosen:** `TEXTURE_2D_ARRAY` whether the blocks upload compressed or decoded.

- _Why:_ `sampler3D` and `sampler2DArray` are different types, so two targets means two shader
  programs, two sets of uniforms and two sets of readings. The fallback pays the extra fetch
  for nothing, but it also stops being a second code path that only some machines ever run.
  The browser suite's "no compressed-texture extension" scenario covers it either way.
- _Rejected:_ 3D texture on the fallback, array on the fast path. It halves the fallback's
  fetch count and doubles everything that has to be written, reviewed and measured.

### Both extensions or neither

**Chosen:** the fast path needs `EXT_texture_compression_rgtc` **and**
`WEBGL_compressed_texture_s3tc`. With one but not the other, both volumes decode.

- _Why:_ rgtc carries the density (BC4) and s3tc the colour (BC1). Mixing them per volume
  would work, but it makes four states to test instead of two, for a combination no GPU in
  practice has: both extensions have shipped together on every desktop driver for years.
- _Left open:_ per-volume selection, if a context turns up with one and not the other.

### The shader reads its own layer count

**Chosen:** `textureSize(uDensity, 0).z` in the fragment shader, rather than a uniform the
pass sets per draw.

- _Why:_ the sides already come from the index and flow into the texture. Reading them back
  from the texture removes a uniform pair, removes the chance of the pass sending a side that
  does not match the texture it bound, and is core GLSL ES 3.00.
- _Rejected:_ `uDensityLayers` and `uColourLayers` uniforms. Two more per-draw uniforms for a
  number the texture already knows.

### Match the 3D filter exactly

**Chosen:** the shader reproduces what `LINEAR` on a 3D texture does on the third axis:
`t = clamp(w * layers - 0.5, 0, layers - 1)`, sample layers `floor(t)` and
`min(floor(t) + 1, layers - 1)`, mix by `fract(t)`.

- _Why:_ the half-texel offset and the edge clamp are what make a sample at the volume's face
  read that face and not a blend with nothing. Getting either wrong shifts the whole volume by
  half a texel, which the fixture RMSE test would catch but would not explain.
- _How it is checked, in two parts:_ a unit test runs a TypeScript statement of the
  arithmetic against a trilinear filter of the same data, at points between layer centres, at
  both faces and past both ends. That test is **not** an oracle for the shader, because
  Vitest cannot run GLSL; it catches a wrong offset or a wrong clamp in the arithmetic. What
  holds the shader to the arithmetic is the CPU fixture comparison the capability already
  commits, which marches the real shader on the GPU against a reference that filters
  trilinearly, at 0.02 and 0.01 RMSE. The two together are the check; neither alone is.

## Risks / Trade-offs

- **The fragment march pays four volume fetches a step instead of two, and the fragment stage
  is where the pass spends its time.** → This risk is the one that decides the change. The
  spec bounds three cameras at 1.5 times their own baselines. Two have indicative readings in
  the suite already, 0.655 ms at 120 light years and 0.614 ms at 260; the third, at 60, has
  none, and the implementation takes all three under the spec's own rule before it changes the
  shader. The browser test is written first, so the readings exist either way. If the bound
  fails, the change does not land and the 3D textures stay. Two things argue it will hold: the
  two extra fetches hit the neighbouring layer, which is already in cache from the block the
  first fetch read, and the block path halves the bytes the texture unit moves, which works
  the other way from the fetch count.
- **The fast path and the fallback could drift.** → They share the shader, the target and the
  layer interpolation, so the only difference is the format of the uploaded bytes. The browser
  test reads both on the same machine and holds them to 0.01 RMSE in display units against
  each other, not just each against a fixture.
- **A GPU's block decode need not match `decodeBC4` and `decodeBC1` bit for bit.** → The
  fallback decodes in TypeScript; the fast path hands the blocks to the texture unit, and no
  specification makes the two identical. The CPU fixture tests are where that would show, and
  `cats-eye` reads 0.0058 against a 0.01 bound, which is little headroom. The response, if a
  fixture breaches: regenerate that fixture from the block path and record why, rather than
  raise the bound. Raising a bound hides the size of the difference; regenerating states it.
  A breach large enough to move the eye would fail the baseline screenshot as well, which is
  the check that decides whether the look changed.
- **BC1 has no alpha channel and the fallback upload does.** → The fast path uploads
  `COMPRESSED_RGB_S3TC_DXT1_EXT` and the fallback `RGBA8` with alpha 255. The march reads
  `.rgb` and never the alpha, so the two agree. A test reads the shader source for the swizzle.
- **A side that is not a multiple of 4 cannot be a block texture at all.** → The committed
  sides are 8, 16, 32, 48 and 64. The loader throws where a side is not a multiple of 4 on the
  fast path, which is the same refusal the block count already implies.
- **KTX2 costs 3,960 bytes more on disk than DDS.** → 60 bytes a file, 0.14 percent of the
  art directory, against a disk bound with 0.2 MiB of headroom. The container is the one the
  rest of the ecosystem reads, which is what the extra header pays for.

## Migration Plan

1. Add the conversion script and the container reader, with their unit tests. Nothing in the
   renderer changes yet and the tree still draws from `.dds`.
2. Run the script, commit the 66 `.ktx2` files, and keep the 66 `.dds` files in the tree.
   The digest fixture now covers both, and the block-equality test is what makes the swap
   safe.
3. Add the browser test that reads the near-view cost, against the `.dds` build. That reading
   is the baseline the spec's 1.5 bound is stated against, and it has to be taken before the
   shader changes.
4. Swap the loader, the upload and the shader. Re-run the cost test.
5. If the bound holds, delete the 66 `.dds` files and their digests, and update the disk,
   wire and video-memory figures in the spec, `AGENTS.md`, `README.md` and
   `THIRD_PARTY_NOTICES.md`. The unit test that pins the documented total covers the last
   three.
6. If the bound fails, delete the 66 `.ktx2` files instead and stop. Steps 1 to 3 are additive
   and leave a working tree either way.

**Rollback** after step 5 is a revert: the `.dds` files and the 3D upload come back together,
and no published type or record file moved, so nothing outside the package notices.

## Open Questions

- Whether the fast path wants `TEXTURE_MIN_FILTER` of `LINEAR` or `NEAREST` on the layer
  axis. It cannot matter — the shader picks the layer with an integer coordinate and does its
  own mixing — but the two are worth reading against each other once, in case a driver
  disagrees. It changes no requirement and no task.
