## MODIFIED Requirements

### Requirement: The art comes from 33 volume assets

The renderer SHALL read **33 volume assets** and SHALL hold no sprite atlas.

The 358 records name 34 art templates, two of which draw the same art, so the records
resolve to 33 distinct assets. The map SHALL ship those 33 and SHALL NOT ship an asset no
record names.

**The library SHALL name its own assets.** An asset's name SHALL be kebab-case and SHALL
be the library's own, not a name the art carried under any other source. The 20 one-off
records take the nebula's own name — `barnards-loop`, `cats-eye`, `orion` and so on — and
the 13 the procedural pool draws from take `bright-01` to `bright-04`, `dark-01` to
`dark-05` and `planetary-01` to `planetary-04`.

**The index SHALL carry what the map reads and nothing else.** It SHALL hold one key: an
ordered list of assets. Each entry SHALL hold a name, a density side, a colour side and the
per-axis compaction error. It SHALL NOT carry a digest: every host that asks for the nebulae
downloads the index, no code reads a digest at run time, and 67 of them cost 5,778 bytes on
the wire for a check that runs in a unit test. The digests SHALL sit in
`tests/fixtures/nebulae.json` instead, which ships in no build. It SHALL NOT carry a path, a
name from another source, a note about where the art came from, or a figure the packing
step produced for itself. It SHALL NOT carry a field a reader can derive: no asset
count, no totals, no byte counts a side already gives, and no format name the spec fixes.
This is the same rule the record file follows, for the same reason.

The map SHALL hold no mapping from a library name back to any name the art arrived under,
and no file in the repository SHALL carry such a name. The names are the library's own
because the names it arrived under are not ours to publish and because two of them name the
wrong nebula, so carrying them over would make the set harder to read, not easier.

Each asset SHALL be a pair of volumes and an entry in one index file:

- a **density** volume in `BC4_UNORM`, one channel, which is the only channel the
  transmittance recurrence reads
- a **colour** volume in `BC1_UNORM`, three channels, which is the emission
- a **transfer function** of 256 entries of four floating-point values, which is an
  extinction coefficient the density indexes

**Each volume SHALL ship as one KTX2 file holding an array of 2D slices**, one slice a
texel of the third axis, in the order the march reads them. A BC4 or BC1 block is 4 by 4 by
**1** texels, so a volume in either format is already stored slice by slice and the array
form carries the same bytes in the same order.

Each file SHALL hold `levelCount` 1, `faceCount` 1, `supercompressionScheme` 0,
`layerCount` equal to the index's side for that volume, and a `vkFormat` of
`VK_FORMAT_BC4_UNORM_BLOCK` for a density volume or `VK_FORMAT_BC1_RGB_UNORM_BLOCK` for a
colour one. Its header SHALL be exactly **208 bytes**, which fixes the on-disk total.

The files SHALL NOT use supercompression. Zstandard at level 19 over the block payloads
gives 1,168,326 bytes where brotli at its defaults over the same payloads gives 1,105,946,
and a supercompressed payload gains nothing from the brotli the serving path applies on
top.

The 33 transfer tables SHALL ship as **one binary file** of 33 by 256 by 4 `float32`, in the
index's asset order, which is exactly 135,168 bytes. They SHALL NOT be written as numbers in
the index, because 33,792 JSON floats would make the index the largest file in the set and
would put the on-disk total at risk of its own bound. The set is therefore **68 files**: 33
density volumes, 33 colour volumes, the transfer file and the index.

The two volumes of one asset SHALL be able to differ in size. The density sizes in the
committed set are 32, 48 and 64 to a side and the colour sides are 8, 16 and 32. The
renderer SHALL take every side **from the index file** and SHALL hold none of them as a
constant, so a repacked set is a drop-in. It SHALL check each file's own layer count and
dimensions against the index and SHALL throw where they disagree.

**Both volumes SHALL upload to a `TEXTURE_2D_ARRAY`, on both paths below.** The march
therefore reads one sampler type and the renderer compiles one program, whichever path the
context takes.

**Where the context carries both `EXT_texture_compression_rgtc` and
`WEBGL_compressed_texture_s3tc`, the renderer SHALL upload the blocks with no decode.**
This is the fast path: the load does no block decode at all and the GPU holds the volumes
compressed.

**Where the context carries either one but not both, or neither, the renderer SHALL decode
on the CPU and upload plain `R8` and `RGBA8`.** The map SHALL NOT require any
compressed-texture extension, because a WebGL2 context is not guaranteed to carry them, and
the decode is a one-time cost on load. The two paths SHALL draw the same frame within the
fixture bound this capability already states.

Both volumes SHALL be stored upside down against object space, and the march SHALL
sample at `(u, 1 - v, w)`.

The transfer function SHALL upload as an `RGBA32F` 2D texture of 256 by 1 and SHALL be read
with `texelFetch` and `NEAREST` filtering. Both are core WebGL2. A `LINEAR` filter on a
floating-point texture needs `OES_texture_float_linear`, which WebGL2 does not guarantee,
so the march SHALL NOT filter the table.

The set has four different sizes and the spec bounds each one. The two video-memory figures
differ because the fast path holds half a byte a texel where the fallback holds one byte for
the density and four for the colour.

|                                  | bound   | the committed set |
| -------------------------------- | ------- | ----------------- |
| over the wire, brotli            | 1.3 MiB | 1.11 MiB          |
| on disk, as served               | 3.0 MiB | 2.78 MiB          |
| in video memory, blocks uploaded | 3.0 MiB | 2.76 MiB          |
| in video memory, decoded         | 6.5 MiB | 6.03 MiB          |

The video memory figures SHALL count the transfer tables as well as the volumes: 33 tables
of 256 entries of four 32-bit values is 132 KiB, which is small but is not nothing.

The on-disk reading SHALL count **every file the set serves**: the 66 `.ktx2` volumes, which
are 2,774,432 bytes, the 132 KiB transfer file and the index, for 2,918,185 bytes in
all. It is the bound a reader can check
without trusting the index, because the files are served as they are stored and a serving
path may or may not compress them. The assets SHALL
load as fetched assets and SHALL NOT be bundled modules, so no chunk carries them.

Each asset's compaction error SHALL be at most **0.03 emission RMSE over peak** against
its full-resolution original, measured on the **worst of its three axes**. The index SHALL
carry the per-axis figures, and a reader SHALL be able to check the bound without the
originals.

0.03 is the budget the pack was made to, and the worst asset in the set sits at exactly
0.03. The test is therefore a guard against a later pack that loosens the budget, not an
independent measurement of the art.

If a fetch fails, or an asset does not parse, the loader SHALL throw a typed error, the
application SHALL report it to the browser console and SHALL keep the map running, and
the pass SHALL then draw nothing. This is the same handling the record file already has.

#### Scenario: Every record names an asset the set holds

- **WHEN** a unit test reads the asset index of all 358 records
- **THEN** every index names an asset the set holds, and every one of the 33 assets is
  named by at least one record

#### Scenario: The set holds its budget

- **WHEN** a unit test sums the four totals of the 33 assets
- **THEN** the total under **brotli at its default quality**, which is the compressor the
  bound is stated against, is at most 1.3 MiB; the on-disk total read from the files
  themselves is at most 3.0 MiB, **counting the transfer file and the index**; the
  block-uploaded total — the block payload of every volume, plus the transfer tables — is at
  most 3.0 MiB; and the decoded total — the volumes computed from their sides, plus the
  transfer tables — is at most 6.5 MiB

#### Scenario: Every shipped file holds the shape the spec fixes

- **WHEN** a unit test reads the header of all 66 committed `.ktx2` files
- **THEN** each holds `levelCount` 1, `faceCount` 1, `supercompressionScheme` 0, a header of
  exactly 208 bytes, a `vkFormat` that matches the volume's channel count, and a
  `layerCount`, `pixelWidth` and `pixelHeight` all equal to the side the index gives

#### Scenario: The blocks are the blocks that were packed

- **WHEN** a unit test reads the block payload of every `.ktx2` volume and compares it
  against the digest `tests/fixtures/nebulae.json` records for that asset
- **THEN** every payload matches, so the container changed and the art did not

#### Scenario: The sides come from the file and not from the code

- **WHEN** a unit test loads an index whose density side is 16 and whose colour side is 4,
  with block payloads to match
- **THEN** the loader uploads a 16-layer density array of 16 by 16 and a 4-layer colour
  array of 4 by 4, and throws nothing

#### Scenario: A file that disagrees with the index is refused

- **WHEN** a unit test loads a volume whose container states a layer count or a dimension
  that the index does not
- **THEN** the loader throws its typed error, the map keeps running and the pass draws
  nothing

#### Scenario: The map needs no compressed-texture extension

- **WHEN** the browser test starts the map on a context with
  `WEBGL_compressed_texture_s3tc`, `EXT_texture_compression_rgtc` and
  `EXT_texture_compression_bptc` all refused
- **THEN** the nebulae load, the pass draws, and the page shows no error

#### Scenario: The blocks upload with no decode where the extensions are there

- **WHEN** the browser test starts the map on a context that carries both
  `EXT_texture_compression_rgtc` and `WEBGL_compressed_texture_s3tc`
- **THEN** the load records no block decode at all, and the frame it draws differs from the
  frame the decoding path draws by at most 0.01 RMSE in display units

#### Scenario: The compaction error holds on every axis

- **WHEN** a unit test reads the per-axis error of all 33 assets from the index
- **THEN** every figure on every axis is at most 0.03

#### Scenario: The index carries no field the map does not read

- **WHEN** a unit test reads the index
- **THEN** its one key is the asset list, every entry holds exactly a name, a density side, a
  colour side and the per-axis error, and no entry and no top level key names a digest, a
  path, a name from another source or a total

#### Scenario: Every asset name is the library's own

- **WHEN** a unit test reads the 33 asset names from the index
- **THEN** every one is kebab-case, every one is distinct, and none matches a
  `Word_Word_NN` shape

#### Scenario: The assets do not drift

- **WHEN** a unit test hashes each asset file, the transfer file and the index with SHA-256
- **THEN** every digest equals the digest `tests/fixtures/nebulae.json` records

## ADDED Requirements

### Requirement: The march filters the third axis itself

A `TEXTURE_2D_ARRAY` filters inside a layer and SHALL NOT be relied on to filter across
layers. The march SHALL therefore read **two layers** at each sample point and interpolate
between them, so the volume it samples is trilinear, as it is when the same data sits in a
3D texture.

The interpolation SHALL place layer centres at half-texel offsets, matching the convention
a 3D texture uses, and SHALL clamp at both ends of the axis, so a sample past the last layer
reads that layer and not a wrap.

This doubles the volume fetches of one step, from two to four, in the fragment stage, which
is where the pass spends most of its time. **The pass SHALL hold a measured cost bound.**

The reading is the **nebula pass alone**, not the whole frame: every other pass off, the
nebula occlusion at 0, at 1,280 by 720, in the timed pass of `scripts/e2e.mjs` on one worker,
on the hardware renderer, as the median of five runs of 120 frames.

**The camera SHALL be the worst of the set, not a convenient one.** A sweep of nine distances
from Barnard's Loop — 20, 60, 120, 180, 200, 230, 260, 320 and 500 light years — ranks
120 the
most expensive, then 60. At 120 the camera is inside a record of radius 200, far enough in
that the box fills the frame and far enough back that a ray crosses most of it. A camera
deeper in is cheaper, because the segment from the eye to the far face is shorter.

`e2e/nebula-cost.spec.ts` read the pass alone at 120 and at 260 light years before this
change and recorded **0.655 ms** and **0.614 ms**. Those two are **means of one run** of 120
frames, which is what `measureFrames` returns, and not medians of five. They are indicative
and they are not the baseline.

**The baselines are the three readings taken under the rule above**, on the tree that still
drew from the 3D textures: **0.523 ms** at 60 light years, **0.512 ms** at 120 and
**0.485 ms** at 260. The bounds are 1.5 times those three, rounded down to two places:
**0.78 ms** at 60 light years, **0.76 ms** at 120 and **0.72 ms** at 260.

Both indicative figures moved by more than a tenth against the baseline of the same camera,
so all three baselines and all three bounds are stated from the readings in hand.

The whole frame at the near view SHALL stay inside the 16.7 ms budget `far-view-rendering`
states; it reads 1.17 ms today.

The bound is 1.5 and not 2 because only the two volume fetches double: the transfer fetch,
the recurrence, the emission and the early exit are unchanged. A pass that measured worse
than 1.5 would mean the two extra fetches cost more than the rest of the step put together,
which is a reason to keep the 3D textures and their decode.

The 1.5 is measurable against the noise. Five runs at one camera spread by 5 to 15 percent of
the reading, and the gap between 1.0 and 1.5 is 50 percent, so a run cannot cross the bound by
drift alone.

The figures above are absolutes taken on one card, and a slower card reads higher on both
sides of the comparison. The suite is a local gate and not a continuous-integration one, so
the rule is: **whenever a recorded baseline differs at all from the reading in hand, restate
it and its bound here.** A tolerance would let the effective ratio drift away from 1.5, which
is the one number this requirement exists to hold. The bound is a ratio against a recorded
baseline; the absolute figure is only what the test asserts on the card that recorded it.

#### Scenario: The layer interpolation matches a trilinear filter

- **WHEN** a unit test runs the layer interpolation over a known volume at points between
  layer centres, at both faces and past both ends
- **THEN** every value equals the value a trilinear filter of the same data gives, within
  one part in 10,000

  The unit test runs a TypeScript statement of the arithmetic and **is not an oracle for the
  shader**, because Vitest cannot run GLSL. It catches a wrong half-texel offset or a wrong
  clamp in the arithmetic itself. What holds the shader to that arithmetic is the CPU fixture
  comparison below, which marches the real shader on the GPU against a reference that
  filters trilinearly.

#### Scenario: The layer interpolation changes no frame

- **WHEN** the browser test marches `barnards-loop` and `cats-eye` against the CPU fixtures
  this capability already commits, under the requirement **A nebula marches a volume
  integral**
- **THEN** each reads within the bound that requirement already states, so the move from a
  3D texture to a filtered array changed no frame

#### Scenario: The worst camera holds the cost bound

- **WHEN** the browser test measures the nebula pass alone at 60, 120 and 260 light years
  from Barnard's Loop, under the conditions above
- **THEN** the median of five runs is at most 0.78 ms at 60 light years, at most 0.76 ms at
  120 and at most 0.72 ms at 260, which are 1.5 times the recorded baselines, and the whole
  frame at the near view, every pass on, is inside 16.7 ms
