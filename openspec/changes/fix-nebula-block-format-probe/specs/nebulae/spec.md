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

**The renderer SHALL prove each block format on a `TEXTURE_2D_ARRAY` before it uses it,
and SHALL NOT read the extension list as proof.** A context can carry an extension and
still refuse its format on that target. On **2026-09-20**, on one RTX 4080, Firefox
carried `EXT_texture_compression_rgtc` and refused `COMPRESSED_RED_RGTC1` on a
`TEXTURE_2D_ARRAY` with `INVALID_OPERATION`, while it accepted the same format on a
`TEXTURE_2D` and accepted `COMPRESSED_RGB_S3TC_DXT1` on both. Chromium accepted all four.

That reading is **one browser, one driver, one day**, and this requirement does not depend
on it staying true. The rule is the probe. A browser that later accepts the format takes
the fast path with no change here, and the requirement still holds. The Firefox spec
SHALL therefore log which path the browser took, as a diagnostic and not an assertion, so
a reader of the run learns the answer for the browser in front of them rather than trusting
the date above.

The proof SHALL be a real allocation the driver answers, and not a version test, a browser
test or a table of known drivers.

**Where the context carries both `EXT_texture_compression_rgtc` and
`WEBGL_compressed_texture_s3tc` and proves both formats, the renderer SHALL upload the
blocks with no decode.** This is the fast path: the load does no block decode at all and
the GPU holds the volumes compressed.

**Where the context lacks either extension, or refuses either format, the renderer SHALL
decode on the CPU and upload plain `R8` and `RGBA8`.** A refusal of one format SHALL take
both volumes to the decode path. Mixing the two paths per format would work and would keep
the compressed colour in Firefox, but it makes four states to hold instead of two for a
gain the owner has weighed against the cost and declined. The map SHALL NOT require any
compressed-texture extension, because a WebGL2 context is not guaranteed to carry them, and
the decode is a one-time cost on load. The two paths SHALL draw the same frame within the
fixture bound this capability already states.

**The fallback decode is one synchronous task, and that is a stated property.** All 33
assets decode inside one call, because the choice between the paths needs a context and the
loader has none. It is paid once, at load, after the first frame. Nothing waits on the set,
so it shows as one long frame and in no other way. A GPU that carries ETC or ASTC rather
than S3TC and RGTC takes this path, and so does Firefox on a card that carries both.

**The two browsers read different sums, and neither reading is the bound.** Chromium reads
**14.2 to 19.2 ms** over twenty-eight readings on the development card. Firefox on the same
card reads **13 to 23 ms** over nine, and every one of its figures is a whole number because
Firefox rounds `performance.now()` to 1 ms, which quantises all 33 marks the sum is built
from. A browser reading therefore belongs **beside** the other and not inside it, and
neither is a promise.

**The bound is the ratchet, and it SHALL be one figure both readings hold.** It is 24 ms
today. The renderer SHALL hold the sum under it, so the cost cannot grow unseen, and the
ratchet and not a browser's own range is what a test asserts. The one task straddles the
16.7 ms frame budget on both browsers, which is the property this paragraph states.

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
  `EXT_texture_compression_rgtc` and `WEBGL_compressed_texture_s3tc` **and proves both
  formats on a `TEXTURE_2D_ARRAY`**
- **THEN** the load records no block decode at all, and the frame it draws differs from the
  frame the decoding path draws by at most 0.01 RMSE in display units.

  The name of this scenario is older than its condition. Carrying the two extensions is
  **necessary and not sufficient**, which is what this change adds: the context must also
  accept each format on the target the renderer uses. The test SHALL therefore read the
  path the renderer took and SHALL NOT read the extension list as a stand-in for it

#### Scenario: A refused format takes both volumes to the decode path

- **WHEN** a unit test gives the renderer a context that reports both extensions and fails
  the allocation of one of the two formats on a `TEXTURE_2D_ARRAY`
- **THEN** the renderer reports no block format, both volumes decode, and the probe leaves
  no texture bound and none allocated

  **An error the context raised before the probe SHALL NOT read as the probe's own.** The
  reading of an error clears it and reports one error at a time, so a probe that does not
  clear the queue first reports a refusal for a fault that came from elsewhere. A context
  that raises an error before the probe and then accepts both allocations SHALL report both
  formats.

  The test SHALL cover the refusal of **each** format on its own, not one of the two. The
  fault this scenario answers refused one format and accepted the other, so a test that
  refuses only the first would pass against a renderer that reads the first and trusts the
  second.

#### Scenario: The nebulae draw where the target refuses a block format

- **WHEN** the browser test starts the map on a context whose `texStorage3D` refuses
  `COMPRESSED_RED_RGTC1` on a `TEXTURE_2D_ARRAY` and accepts every other call, and reads the
  frame with the nebulae on and again with them off
- **THEN** the two frames differ, and the load records a block decode.

  This scenario states the rule that the Firefox fault broke, in a form that does not need
  Firefox to keep the fault. It SHALL run in the project that runs the whole suite, so the
  guard holds on every run and on every machine. A browser that fixes its driver SHALL NOT
  make this scenario vacuous, because the test refuses the format itself rather than asking
  the driver to

#### Scenario: The nebulae draw in Firefox

- **WHEN** the browser test opens a close view of a bright nebula in Firefox, reads the
  frame with the nebulae on and again with them off, and compares the two
- **THEN** the two frames differ.

  This scenario SHALL read **pixels** and SHALL NOT assert on a draw count alone. In the
  fault it answers the records passed the selection and the draw calls ran, so every count
  read correctly while the frame carried no nebula. Only the drawn frame shows it.

  This scenario SHALL NOT compare against a committed baseline image, because the
  `browser-suite` capability holds the one baseline to Chromium

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
