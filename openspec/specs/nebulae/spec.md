# nebulae Specification

## Purpose
Draws the 358 authored and procedurally generated nebulae that give the mid-zoom view its
structure, each as a marched volume with its own art, its own size and its own rotation.

## Requirements

### Requirement: The map holds 358 nebulae

The map SHALL hold a fixed set of 358 nebula records **when the host asks for them, and
none otherwise**. 190 are authored and 168 are procedurally generated. The counts, the
radii, the asset indexes and the rotations come from the packing step that builds the
data files; no source in this repository derives them. The galaxy holds about 400 billion
systems, so the set is small beside them.

**The host asks through one option.** `GalaxyMapOptions` SHALL carry a `nebulae` field
whose value is the nebula source, which is the single export of the package's `./nebulae`
subpath. With that value the map SHALL load the records and the volume assets and draw
the nebulae as the rest of this capability states. With no value, with `undefined`, and
with a value the map cannot read, the map SHALL:

- fetch neither the record file nor any volume asset
- compile no nebula program
- draw nothing, report 0 drawn instances and 0 draw calls
- report no error, because asking for no nebulae is not a fault

**Nothing reaches a build that does not ask.** No module the package's main entry point
reaches, directly or through an import chain, SHALL import the record file, a volume
asset, the asset index, the nebula shaders, the nebula pass or the record set as a
**value**. A type-only import is allowed, because the build erases it. A host that bundles
the main entry point alone SHALL therefore carry none of them.

Each record SHALL carry a position in game coordinates, a radius in light years, an asset
index and a rotation of three angles in radians. The index SHALL resolve by position
against the **asset name list in the index file**, which is the one place a name is written
and the same list the loader reads the sides and the errors from. The record file SHALL
carry no name list of its own, so the two files cannot fall out of step. A record MAY carry a
name, and a record without one SHALL omit the field rather than hold an empty value. A
record SHALL carry no colour and no per-record brightness. A record SHALL NOT carry a tile
index, because the map holds no atlas.

**What refuses a wrong file.** The tile-name list did that job, and it is gone. The loader
SHALL instead refuse a file that is not an object holding a `records` array whose every
entry is an array of the record's field count, and whose every asset index is a non-negative
whole number. That check needs no list of its own and no version string.

**The loader SHALL NOT bound the asset index against the set's size.** It SHALL hold no asset
count, SHALL take none from a caller and SHALL NOT read the volume index. A count in
`src/scene-data/` would be a second source of truth for the art and would break "a repacked
set is a drop-in", and a count passed in at load would put the record parse behind the index
fetch, which the loader shape does not allow. **A unit test** holds the pairing instead: it
reads both files from disk and asserts every record names an asset the set holds and every
asset is named, which is the scenario **Every record names an asset the set holds**. That is a
build-time check on committed data, so it catches the only fault this bound could catch — a
record file and a volume set that do not match — before either ships.

The file SHALL hold no field a reader can derive: no record count, no field-name list and
no units note. The positions SHALL be stored to 0.1 light year and the radii to 0.01, which
is finer than one screen pixel at every zoom distance in the band.

The records SHALL load as a fetched asset, not as a bundled module, so no chunk carries
the set. The set SHALL build in one sweep when the asset arrives and SHALL NOT be rebuilt
in any frame. Before the asset arrives the pass SHALL draw nothing, and no frame SHALL
fail because of it.

If the fetch fails, or the asset does not parse, the loader SHALL throw a typed error, as
the galaxy detail image already does. The application SHALL report it to the browser
console and SHALL keep the map running. The pass SHALL then draw nothing and every other
pass SHALL keep drawing.

The nebulae are not part of the first frame, so this failure SHALL NOT reach the error
message the application shows for a failed start. That path stops the map, which would
take every other pass down with the nebulae.

The start SHALL NOT wait for any of these assets. The first frame, the frame loop and the
removal of the loading picture SHALL all happen whether or not they have arrived, and the
records and the volumes SHALL reach the renderer after the loop runs. A request that never
answers therefore leaves the map drawing every other pass.

The largest radius in the set is 200 light years and the smallest is above 0.

#### Scenario: A held fetch does not hold the map

- **WHEN** the browser test holds the request for a volume asset open and never
  answers it, then opens the map with the nebula source
- **THEN** the map starts, the frame loop runs, the nebula pass reports 0 drawn
  instances and 0 draw calls, and the records and the volumes are not attached

#### Scenario: The loader refuses a file that is not a record set

- **WHEN** a unit test builds a set from `{}`, from a file whose `records` is not an array,
  from one with an entry of the wrong field count, and from one whose asset index is -1 and
  one whose asset index is 2.5
- **THEN** the loader throws the typed error on each. An asset index of 33, past the end of
  the committed set, is **not** refused here and SHALL NOT be: the loader holds no asset
  count. The scenario **Every record names an asset the set holds** is what pairs the record
  file with the volume set, over the committed data at build time

#### Scenario: The set loads whole

- **WHEN** a unit test loads the nebula set
- **THEN** it holds 358 records, every radius is above 0 and at most 200, every asset
  index is from 0 to 32, every rotation is three finite numbers, and every position is
  finite

#### Scenario: A map with no nebula option fetches nothing

- **WHEN** the browser test opens a map with no `nebulae` option, inside the zoom band
  that would draw nebulae, and records every request the page makes
- **THEN** no request names the record file, the asset index or any volume asset, the pass
  reports 0 drawn instances and 0 draw calls, and the page shows no error

#### Scenario: A value the map cannot read turns the nebulae off

- **WHEN** a unit test builds a map with `nebulae` set to `true`, to `null` and to an
  object that carries none of the source's members, and builds a fourth with a **readable**
  source of spies through the same harness
- **THEN** each of the first three loads nothing, draws nothing and reports no error,
  **and the fourth calls `loadSet` and `loadVolumes`**.

  The fourth reading is the positive control and the scenario is not satisfied without it.
  Vitest runs in the `node` environment and the existing map tests build on a canvas that
  returns no context, so `start()` throws before it reaches the loaders: the first three
  readings pass whether or not the readability check exists.

#### Scenario: A host bundle that does not ask carries nothing

- **WHEN** the bundle test builds a host entry that imports `createGalaxyMap` from the
  package's main entry point and nothing else
- **THEN** the output holds no record file, no volume asset, no asset index and none of
  the nebula shader text

#### Scenario: A host bundle that asks carries all of it

- **WHEN** the bundle test builds a host entry that imports `createGalaxyMap` and the
  `./nebulae` subpath, and passes the source to the map
- **THEN** the output holds the record file, the asset index, the volume assets and the
  nebula shader text

#### Scenario: The entry chunk does not carry the records

- **WHEN** the library bundle test reads the entry chunk
- **THEN** the chunk holds no nebula record, no nebula code, and its size is under the
  recorded bound

#### Scenario: A frame before the records arrive

- **WHEN** the unit test renders a frame before the record asset has loaded
- **THEN** the frame draws, holds no nebula, and reports no error

#### Scenario: A failed fetch reports and does not stop the frame

- **WHEN** a unit test makes the record fetch fail
- **THEN** the loader throws a typed error, and a frame drawn after it holds no nebula and
  draws every other pass

#### Scenario: The records do not drift

- **WHEN** a unit test hashes the record file with SHA-256
- **THEN** the digest equals the digest in the fixture

### Requirement: The host and the user turn the nebulae off and on

The map handle SHALL carry three members for the nebulae.

- `hasNebulae()` SHALL return whether the map was built with a nebula source it can read.
- `setNebulaeVisible(on)` SHALL turn the nebulae off and on. On a map that holds no
  source it SHALL do nothing and SHALL NOT throw.
- `areNebulaeVisible()` SHALL return the state the map is in. On a map that holds no
  source it SHALL return `false`.

The nebulae SHALL open visible on a map that holds a source. Turning them off SHALL leave
the records and the volume set loaded, so turning them on again draws in the next frame and
fetches nothing.

The switch SHALL change what draws and SHALL NOT change the selection, the zoom band or
the budget. With the nebulae off the pass SHALL report 0 drawn instances and 0 draw calls.

**The two switches are not the same switch.** The renderer's `nebulae` pass switch is a
probe the browser tests read, and the host switch is on the handle. The pass switch off
and the host switch off SHALL draw the same frame, and neither SHALL move the other's
reading: `areNebulaeVisible()` SHALL read what the host set, whatever the pass switch is,
and a host switch write SHALL NOT turn a pass switch back on. The regions, the shapes, the
grid and the icons hold this rule already, and the nebulae wrote one field for both.

#### Scenario: The switch removes the sprites and gives them back

- **WHEN** the browser test opens a map with the nebula source inside the zoom band,
  reads the drawn count, calls `setNebulaeVisible(false)` and reads it again, then calls
  `setNebulaeVisible(true)` and reads it a third time
- **THEN** the readings are above 0, exactly 0, and above 0, and the third frame issues
  no new request.

  The scenario keeps its name from the sprite pass so the delta drops nothing. What it
  reads is the nebula pass, whatever that pass draws with.

#### Scenario: A map with no source reports no nebulae

- **WHEN** a unit test builds a map with no `nebulae` option and calls `hasNebulae`,
  `areNebulaeVisible` and `setNebulaeVisible(true)`
- **THEN** the first two return `false`, the third throws nothing, and
  `areNebulaeVisible` still returns `false`

#### Scenario: The pass switch and the host switch stay apart

- **WHEN** the browser test opens a map with the nebula source inside the zoom band,
  calls `debug.setPasses({ nebulae: false })`, reads `areNebulaeVisible()` and the drawn
  count, then calls `setNebulaeVisible(true)` and reads the drawn count again
- **THEN** the reading is true and both counts are 0

### Requirement: A record carries an asset and a rotation

Each record SHALL carry an **asset index** into the volume set and a **rotation**.

The rotation SHALL be the three angles the art template carries, in radians, shipped
verbatim. The record file SHALL NOT hold a matrix and SHALL NOT hold a pre-multiplied
form.

The renderer SHALL build the object-to-volume matrix as `Rx(a) · Ry(b) · Rz(c)`, composed
with the flip that carries the renderer's world frame to the game frame, whose z runs the
other way. **One named constant SHALL state that convention**, so a correction is one
edit and needs no data regeneration.

**5 records of 358 carry a rotation.** The other 353 SHALL carry three zeros, and a
record of three zeros SHALL draw its asset with the flip alone.

A record SHALL carry no per-record colour, no per-record brightness and no second axis.
The box is a cube of twice the record's radius on every side.

#### Scenario: The rotation reaches the march

- **WHEN** a unit test draws a record whose rotation is `[1.5707963, 0, 0]` and a record
  whose rotation is three zeros, from the same camera, over the same asset
- **THEN** the two frames differ

#### Scenario: A record with no rotation draws the flip alone

- **WHEN** a unit test reads the matrix the pass builds for a record of three zeros
- **THEN** it is the identity with the z column negated

#### Scenario: The record file holds the raw angles

- **WHEN** a unit test reads the rotation of the five records that carry one
- **THEN** each is three finite numbers in radians, and the file holds no matrix

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
ordered list of assets. Each entry SHALL hold a name, a density side and a colour side, and
nothing else. Each side SHALL be a plain number and SHALL NOT be wrapped in an object: a
wrapper of one key states the key 66 times over the set for no reader.

**It SHALL NOT carry a figure that only a test reads.** Every host that asks for the
nebulae downloads the index, so a figure no run-time code reads is bytes on the wire for a
check that runs on disk. Two figures meet that description. The 67 digests cost 5,778 bytes
and the 99 per-axis compaction errors cost 4,244. Both SHALL sit in
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

The on-disk reading SHALL count **every file the set serves**: the 66 `.ktx2` volumes,
which are 2,774,432 bytes, the 132 KiB transfer file and the index, for 2,912,225 bytes in
all. It is the bound a reader can check without trusting the index, because the files are
served as they are stored and a serving path may or may not compress them.

**The rule on bundling SHALL read in bytes and not in files.** An asset above the inline
threshold a bundler applies SHALL load as a fetched asset and SHALL NOT be a bundled
module, so no chunk carries it. An asset under that threshold MAY ride in a chunk as a
`data:` URI. The loader SHALL read both forms the same way, because `fetch` reads a
`data:` URI.

Against the 4,096-byte threshold a bundler applies by default, **39 files of the set are
above it and 29 are under**: the index at 2,625 bytes, 16 colour volumes at 464 and 12
at 2,256. Those 29 are **37,121 bytes**, which is 1.27 percent of the set, so the 2.742
MiB a chunk must not carry stays out of every chunk. The rule holds a host to not parsing
the art to start the map, and 37 KiB does not reach that.

The package SHALL NOT be able to set the threshold for a host. `src/render/nebula-volumes.ts`
asks for `?url&no-inline`, which keeps every file a file in this package's own build, but
the library build writes a plain `new URL(...)` and the marker does not reach a host that
re-bundles it. A host that wants every asset as a file SHALL set its own threshold to 0.

Each asset's compaction error SHALL be at most **0.03 emission RMSE over peak** against
its full-resolution original, measured on the **worst of its three axes**.
`tests/fixtures/nebulae.json` SHALL carry the per-axis figures, and a reader SHALL be able
to check the bound without the originals.

The figures sit in the fixture and not in the index because no run-time code reads them.
The packing step is the only writer, so a repack SHALL write the fixture as well as the
art.

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

- **WHEN** a unit test reads the per-axis error of all 33 assets from
  `tests/fixtures/nebulae.json`
- **THEN** every figure on every axis is at most 0.03, and the fixture names exactly the 33
  assets the index holds, so a repack cannot drop an asset's error unseen

#### Scenario: The index carries no field the map does not read

- **WHEN** a unit test reads the index
- **THEN** its one key is the asset list, every entry holds exactly a name, a density side
  and a colour side, each side is a plain number rather than an object, and no entry and no
  top level key names a digest, a compaction error, a path, a name from another source or a
  total

#### Scenario: Every asset name is the library's own

- **WHEN** a unit test reads the 33 asset names from the index
- **THEN** every one is kebab-case, every one is distinct, and none matches a
  `Word_Word_NN` shape

#### Scenario: The assets do not drift

- **WHEN** a unit test hashes each asset file, the transfer file and the index with SHA-256
- **THEN** every digest equals the digest `tests/fixtures/nebulae.json` records

### Requirement: A nebula marches a volume integral

A nebula SHALL draw by marching its volume front to back. Each step SHALL:

1. read the density and the colour at the sample point
2. read the four-channel extinction coefficient the density indexes in the transfer
   function
3. multiply the running transmittance by one minus the extinction times the density times
   the step length, held at or above zero
4. add the colour times the light gain times the transmittance **after** the step, times
   the density, times the step length

The output colour SHALL be the accumulated emission, which the composite adds to the
frame directly. The march applies its own transmittance inside the sum, at step 4 above,
so the finished sum SHALL NOT be scaled by it again.

The output alpha SHALL be the record's transmittance, which is the factor the pass
multiplies the scene behind the record by, and not one minus it.

The **light gain** SHALL be three independent values, one per colour channel, that every
record shares. It is the one brightness dial the sprite pass held, widened from one value
to three. The prose calls it the light gain throughout. The scenario below keeps the name
**Brightness scales the colour alone** from the sprite pass, as **The switch removes the
sprites** does, so the delta drops nothing; the dial in the code is the light gain. It SHALL scale the emission alone and SHALL NOT change the alpha or the
shape. The default SHALL be `8.66, 8.44, 8.07`.

The **step rate** SHALL be a count of steps over one object-space unit, and the box spans
two of them. It SHALL be one value for every record. A ray SHALL take at most 256 steps.
The default SHALL be **32**. The largest asset is 64 texels a side, so 32 steps over one
unit is one step per texel across the box.

A ray SHALL stop early when every channel of the transmittance falls below 0.01.

**The transmittance SHALL have no upper clamp.** Five of the 33 assets carry a negative
extinction channel, so a step can raise the transmittance rather than lower it. This is what
the transfer tables ask for and it is what gives those five their look: clamping at 1 changes
`cats-eye` by 70 percent of peak emission and `planetary-01` by 39
percent. The transmittance reaches 6.0 on `cats-eye` at 32 steps per unit.

The output alpha SHALL stay from 0 to 1 for every record in the set, at every step rate the
map offers. The pass multiplies one accumulated transmittance by the alpha of every record
it draws, so a value above 1 would raise the light of the scene behind a nebula and a value
below 0 would turn it around. The set meets this today; the requirement is what stops a
repack from breaking it.

A camera **inside** the box SHALL start its march at the camera and not at the box's face,
so a nebula the camera has entered draws the part of itself that is still in front.

#### Scenario: The march reproduces the reference integral

- **WHEN** a browser test marches `barnards-loop` and `cats-eye`, reads the drawn
  pixels back, and compares each against a fixture rendered by the same integral on the CPU,
  through the map's own exposure and tone map
- **THEN** each difference is at most the bound below.

  The CPU fixture SHALL march at **the same step rate as the frame under test**, so the
  reading measures the implementation and not the quadrature. A 32-step GPU march against a
  256-step CPU reference measures how coarsely the frame samples, which is what the step
  rate scenario below is for.

  The two assets are named here and not left to the implementer. `cats-eye` carries by far the
  largest **negative** extinction in the set, at -193.5, so it is where an error in the
  transmittance recurrence shows first. It is not the largest extinction overall; the dark
  assets are. `barnards-loop` is the
  mildest, and its bound is **0.02**. The implementation reads **0.0083** for it.

  `cats-eye` had no reading when this change was written. The implementation measures it and
  writes the figure into the test, and the bound is that figure rounded up to the next
  hundredth. If the figure exceeds 0.05 the march is wrong and the bound does not move to
  fit it. The implementation reads **0.0058**, so its bound is **0.01**.

#### Scenario: The output alpha stays in range on every asset

- **WHEN** a unit test marches all 33 assets at 25, 32 and 64 steps per unit and reads the
  output alpha
- **THEN** every value is from 0 to 1, on every asset at every rate

#### Scenario: A camera inside a nebula sees the part in front of it

- **WHEN** the browser test places the camera at the centre of a nebula, at a zoom
  distance inside the band
- **THEN** that nebula contributes light to the frame

#### Scenario: The step rate trades cost for nothing visible

- **WHEN** the browser test reads **the asset whose transfer table reaches the set's largest
  extinction, 3,066**, which is `dark-02`, at 32 steps per unit and at 64, and
  writes the reading into the test
- **THEN** the two readings differ by under the bound **the implementation measures**, and
  that bound is at most 5 percent of the block mean.

  The asset is named and it is a dark one on purpose. The transmittance recurrence is
  linear, not exponential, so the quadrature error grows with the extinction, and the dark
  asset named above reaches 3,066. `barnards-loop` reaches 192 in the alpha channel and 11 in
  the colour channels, so a bound read off it would pass almost everywhere and guard almost
  nothing. The scenario names the property and not the name alone, because the name is
  assigned in this change and a reader cannot otherwise check the argument. If the measured figure exceeds 5
  percent, the default step rate rises instead of the bound.

### Requirement: A nebula draws as a marched box one diameter across

A nebula SHALL draw as a **box** of twice the record's radius on every side, marched in
object space. The box SHALL be axis-aligned in the **renderer's world frame**, and the
record's rotation SHALL turn the volume the march samples inside it, not the box itself.

A rotated volume therefore SHALL lose the corners that fall outside the box. A unit test
SHALL read that loss over every record that carries a rotation, and it SHALL stay under
**1 percent of the volume's density mass**. Five records of 358 carry a rotation. The
worst is the Horsehead Nebula at 0.99 percent, then the Orion Nebula at 0.30 and Barnard's
Loop at 0.11; the Flame Nebula and Messier 78 lose nothing. A box turned with the volume
would hold all of it and cost one matrix multiply in the vertex stage. It is not worth
regenerating the reference frames for under 1 percent, and the constant the renderer holds
makes it a one-line change later.

A nebula therefore SHALL hold the shape of its art, and two records that share an asset
SHALL be able to differ by their rotation alone.

The apparent size in pixels SHALL follow the world radius divided by the range from the
camera, so a nebula holds its size against the scene as the camera moves.

A nebula SHALL keep that apparent size the whole way in, and SHALL grow without a cap as
the camera comes toward it, because the camera can enter it. The fill cost is held by the
covered-area budget and not by a size cap.

The pass SHALL draw one fragment per covered pixel, whether the camera is outside the box
or inside it.

#### Scenario: A turned volume keeps its mass

- **WHEN** a unit test reads, for each of the five records that carry a rotation, the
  density mass of the texels whose pre-image under the rotation falls outside the box
- **THEN** the share is under 1 percent of that volume's density mass, for every one

#### Scenario: Size follows the record

- **WHEN** a unit test places a nebula of radius 200 light years at 10,000 light years
  from the camera, and a nebula of radius 100 light years at 5,000 light years
- **THEN** both take the same apparent size, within one part in 1,000

#### Scenario: A near nebula keeps growing

- **WHEN** a unit test sets a canvas of 720 CSS pixels in height and places a nebula whose
  apparent radius is 400 CSS pixels, and then one of 2,000 CSS pixels
- **THEN** the second draws larger than the first, and neither is clamped

#### Scenario: The box costs the same from inside as from outside

- **WHEN** the browser test reads the pass's cost for one record whose footprint covers the
  whole frame, with the camera just outside the box and then just inside it
- **THEN** the two costs differ by under 20 percent.

  The reading is cost and not a fragment count because WebGL2 has no fragment counter:
  occlusion queries are boolean and there are no atomics. Cost is the quantity that matters
  anyway — the failure this guards against is the back faces drawing as well as the front,
  which doubles the fragments and shows plainly as a doubled cost.

#### Scenario: Two records that share an asset can differ

- **WHEN** a unit test draws two records over the same asset, from the same camera, whose
  rotations differ
- **THEN** the two frames differ

### Requirement: The material in front of a nebula attenuates it

The pass SHALL scale each nebula by the transmittance of the density volume between the
camera and the record's centre. A nebula the camera sees through the bulge SHALL
contribute less light to the frame than the same nebula with nothing in front of it.

**One transmittance per record.** The transmittance SHALL be taken at the record's
centre and applied to the whole volume. It SHALL NOT vary across the volume.

The march SHALL stay in the **vertex stage** of the nebula program, where it is today, and
SHALL keep reading the shared extinction rule from the one source that states it.

A box has 36 vertices where a quad had 4, so the march runs nine times more often per
record. It is kept there anyway. Every vertex of one record marches the identical segment
and issues the identical fetches, so they hit the same cache lines, and the work is small
beside the fragment march that is the pass's real cost. The implementation SHALL **measure**
the vertex stage's share of the pass. Only if that reading shows it matters SHALL the march
move to a per-record pre-pass, and the decision is the design's, not this requirement's:
what this requirement fixes is that the value is one per record and comes from the shared
rule.

**The same rule as the volume.** The transmittance SHALL come from the **same rule** the
volume pass accumulates its optical depth with, over the camera-to-centre segment: the
decoded density, the surface detail grid, the two-slope compression, the fade at the galactic rim, the fade
by height above the mid-plane and the dust weights. The absorption is a uniform both
passes are given rather than a constant the rule states. One source
SHALL state that rule and both the volume pass and the nebula pass SHALL read it. Neither
SHALL hold a second copy of it. The two passes take a **different number of steps** over
a different segment, so the two optical depths are not the same number. What this
requirement fixes is the rule, not the quadrature; the design owns the step count.

**Colour and alpha both.** The transmittance SHALL scale the nebula's colour channels
and its alpha. An occluded nebula therefore stops adding light and stops attenuating
what is behind it in the same measure.

**Wavelength dependent.** The transmittance SHALL carry the volume's three dust weights,
so occluded light turns warm. The colour channels SHALL take the three values and the
alpha SHALL take their mean, which is what the volume pass writes into its own alpha.

**The look constant is no longer capped at 1.** A look constant SHALL scale the optical
depth, and it SHALL take any finite value of **0 or above**. At `0` the pass draws what it
drew before the march; at `1` it draws the volume's own extinction; above `1` it draws more
extinction than the volume carries over the same segment. A value the reader cannot read,
which is a value that is not finite or is below 0, SHALL take the default.

The cap of 1 is what this change removes. The frame this map draws is tone mapped, and a
nebula seen through a very bright mass still reads as a source at the volume's own
extinction. The constant is the one knob that answers that, and the cap held it at the
value that is already too weak.

**The default SHALL be exactly 2.0.** `DEFAULT_NEBULA_OCCLUSION` SHALL read `2`, so the
pass draws twice the optical depth the volume carries over the same segment.

The figure is a decision and not a measurement this change defers. 2.0 is the first value
above the old cap that is a whole multiple of the volume's own extinction, and it is what
the scenarios below and the reworked tolerance are computed from. A later change that
wants another look changes one number and the two figures that follow from it: the
tolerance of "A nebula with little in front of it barely changes" and the range at which
the cull floor takes a record. The constant is already the debug handle's, so a reader can
try another value in the page without a build.

**A record under the cull floor SHALL march no fragment.** Where the mean of a record's
three transmittance channels falls below a **cull floor**, the pass SHALL draw no fragment
of that record. The floor SHALL be **0.02**.

The floor is what reduces a nebula's drawn range through bright mass: the more illuminated
the material between the camera and a record, the nearer the camera must come before that
record draws at all. Below the floor the record contributes under 2 per cent of its own
light and under 2 per cent of its own alpha, which the tone map cannot show against the
mass in front of it, so the cull removes the fragment cost and not a visible record.

The cull SHALL NOT change `drawnCount`, `drawCalls`, `aboveFloorCount` or `coveredArea`.
Those four are readings of the **selection**, which knows no transmittance, and the
requirement "The frame holds a covered-area budget" states them. The cull happens after the
selection, in the draw.

**The volume alone occludes.** The march reads the density volume texture and nothing
else. The cloud sprites do not attenuate a nebula, and a nebula does not attenuate
another nebula.

**No volume, no attenuation.** Where the density volume has not arrived, or the volume
switch is off, the transmittance SHALL be `1` for every nebula and the cull SHALL drop
none.

#### Scenario: A nebula behind the core dims

- **WHEN** the browser test opens a view inside the zoom band with the core between the
  camera and a named nebula, and reads the same block three times: with the nebula pass
  off, and with the pass on at the occlusion constant 1 and at 0
- **THEN** the nebula's own contribution — the block with the pass on, less the block
  with the pass off — is smaller in magnitude at 1 than at 0.

  **The reading is the nebula's contribution and not the block itself**, because through
  the core the block cannot fall. A pixel holds `C + (1 - a)B` at 0 and
  `T*C + (1 - a*mean(T))B` at 1, where `C` is the nebula's light, `a` its alpha and `B`
  the background. The block falls only where `C > a*B`. Through the core `B` sits near
  the top of the tone map, so every nebula there reads as a hole and not as a source, and
  the "Colour and alpha both" clause above makes that hole shallower as the transmittance
  falls. A block reading would therefore **rise**. The contribution states the attenuation
  for a source and a hole alike, and it falls to 0 as the transmittance does.

#### Scenario: A higher constant dims it further

- **WHEN** the browser test reads the same block at the occlusion constant 1 and at the
  new default
- **THEN** the nebula's contribution at the default is smaller in magnitude than at 1

#### Scenario: A nebula with little in front of it barely changes

- **WHEN** the browser test opens `BRIGHT_VIEW`, the camera
  `#c=624.4,-425.9,-1229.5&d=6000&p=35&y=0` that `e2e/nebulae.spec.ts` already names, and
  reads the nebula with the occlusion constant at the default and at 0
- **THEN** the two readings differ by under **4 per cent**, and the test names that figure
  and the 2.2 per cent estimate it comes from beside the view.

  The view and the tolerance are one decision. The tolerance is a measured figure and not
  "the dither", because there is no view inside this galaxy with **nothing** in front of a
  nebula. `BRIGHT_VIEW` is the view the design costed: its segment to Barnard's Loop is
  5,912 light years and its estimated transmittance at the constant 1 is 0.997, 0.994 and
  0.989 by channel. The transmittance at a constant `k` is that value raised to `k`, so at
  the default of 2.0 the worst channel changes by `1 - 0.989^2`, which is 2.2 per cent, and
  the tolerance is **4 per cent**: that estimate plus the same margin the 2 per cent
  tolerance carried at 1. A band several times the signal would pass a frame that dimmed
  several times more than the model allows. A tolerance the implementer picks after reading
  the frame is a tolerance that always passes, which is why both numbers are stated here
  and not left to the run.

#### Scenario: Occluded light turns warm

- **WHEN** the browser test reads a nebula through the bulge with the occlusion constant
  at the default and at 0, and takes the ratio of the blue channel to the red channel for
  each
- **THEN** the ratio at the default is below the ratio at 0

#### Scenario: A dark nebula behind the core stops cutting a hole

- **WHEN** the browser test reads the pixels of a dark nebula that sits behind the core,
  with the occlusion constant at the default and at 0
- **THEN** the reading at the default is above the reading at 0, because the nebula's alpha
  is scaled by the same transmittance

#### Scenario: The default is 2

- **WHEN** a unit test reads `DEFAULT_NEBULA_OCCLUSION`, and a browser test reads the
  occlusion the renderer sends with the host naming no value
- **THEN** both read `2`

#### Scenario: The constant takes a value above 1

- **WHEN** a unit test reads the occlusion the renderer sends at the values 0, 1, 2.5, -1
  and `NaN`
- **THEN** the first three read 0, 1 and 2.5, and the last two read the default

#### Scenario: A culled record contributes nothing

- **WHEN** the browser test opens a view whose segment to a named nebula runs through the
  core, raises the occlusion constant until that record's estimated mean transmittance
  falls below 0.02, and reads the block with the nebula pass on and with it off
- **THEN** the two blocks are identical, and the frame drew the record's draw call all the
  same, because the cull sits after the selection

#### Scenario: The cull leaves the selection readings alone

- **WHEN** the browser test reads `drawnCount`, `drawCalls`, `aboveFloorCount` and
  `coveredArea` at the occlusion constant 0 and at a constant high enough to cull a record
- **THEN** the four readings are equal at both

#### Scenario: The extinction rule is written once

- **WHEN** a unit test reads the source the volume program compiles and the source the
  nebula program compiles
- **THEN** both hold the shared rule, neither holds the marker the rule replaces, and the
  rule text in both is the text of the one file that states it

#### Scenario: Every vertex of a record reaches the same transmittance

- **WHEN** a unit test marches the extinction rule at all 36 vertices of one record's box
- **THEN** all 36 results are equal, so the value is one per record however many vertices
  compute it, and the cull takes every vertex of a record or none

#### Scenario: No volume gives no attenuation

- **WHEN** a unit test draws the nebula pass with no volume texture attached
- **THEN** the pass sends a transmittance of 1 for every instance, and the uniforms it
  sends are the uniforms it sends with the occlusion constant at 0. A stub-context unit test
  reads uniform values, not frames

#### Scenario: The switch keeps the far view

- **WHEN** the browser test renders the default view at 60,000 light years
- **THEN** the frame matches the pinned baseline image, because the zoom band already
  draws no nebula there

#### Scenario: The march holds the frame budget

- **WHEN** `e2e/frame-budget.spec.ts` runs inside the zoom band, with the nebula pass on,
  the occlusion constant at the default, and a drawn count at or above the floor the change
  that added the march measured. The near end of the zoom band is open, so a near view
  draws a record that fills the frame, and the floor is set there
- **THEN** the frame interval holds the budget `far-view-rendering` states

#### Scenario: The vertex stage carries the volume sampler

- **WHEN** the browser test starts the map on the hardware renderer, logs
  `MAX_VERTEX_TEXTURE_IMAGE_UNITS` as a diagnostic, and compiles the nebula program from
  the composed sources
- **THEN** the program links without an error. The assertion is the link, not the count:
  WebGL2 guarantees at least 16 vertex texture units, so a count check cannot fail on any
  conforming implementation

### Requirement: A nebula blocks by its range

A nebula that sits far from the camera SHALL hide what is behind it more than the same
nebula close to the camera. Today it hides less, because the only quantity that follows
the range is the dust in front of the record, and that dust lifts the record's alpha
toward 1. This requirement adds a second quantity that runs the other way.

**The gain.** The pass SHALL raise the record's own transmittance along the ray to a
**gain** before it writes the alpha. Where `T` is that transmittance and `g` the gain, the
record's opacity SHALL be `1 - pow(T, g)` in place of `1 - T`. A gain above 1 blocks more,
a gain below 1 blocks less, and a gain of exactly 1 is the value the pass writes today.

**The gain follows the range.** `g` SHALL run smoothly from a **near gain** at or below a
**near range** to a **far gain** at or above a **far range**, where the range is the
distance from the camera to the record's centre, in light years. The step SHALL be smooth,
so no record's blocking steps as the camera moves.

**The four defaults.** The near range SHALL be **500** light years, the far range
**6,000**, the near gain **0.7** and the far gain **2.0**.

The four are look decisions and not measurements. 500 and 6,000 bracket the ranges a
record is read at inside the zoom band, which ends at 20,000 light years: a record the
camera is beside sits under 500, and a record on the other side of the local arm sits over
6,000. 0.7 and 2.0 are the first values either side of 1 that read as a clear softening and
a clear hardening at those two ends. All four SHALL be reachable from the debug handle, in
the manner of the occlusion constant, so a reader tries another set in the page without a
build.

**The gain changes the alpha alone.** It SHALL NOT change the emission a record adds, so
the light the pass adds to the frame at a camera is the light it adds today.

**The gain is not the dust.** The requirement "The material in front of a nebula attenuates
it" stands unchanged: the mean of the three transmittance channels still scales the alpha,
and an occluded nebula still stops attenuating what is behind it. The gain applies to the
record's own extinction, before that scaling.

**A value the reader cannot read takes the default.** That is a value that is not finite.
A gain below 0 and a range below 0 are values the reader cannot read.

**Cost.** The gain costs one power per fragment and the range costs one length per record.
The pass SHALL stay inside the three bounds this capability already states — 0.78 ms at 60
light years, 0.76 ms at 120 and 0.72 ms at 260 — read under the same rule, and the whole
frame at the near view SHALL stay inside the 16.7 ms `far-view-rendering` states. The set
holds 358 records and the covered-area budget allows 4 screen areas, at 1920 by 1080.

#### Scenario: A gain of 1 is the rule the pass writes today

- **WHEN** a unit test reads the alpha the shader's rule gives for a record transmittance
  of 0.5, a mean of 1 and a weight of 1, at a gain of 1
- **THEN** it reads 0.5, which is the value the rule without the gain gives for the same
  three inputs

  There is no frame reading beside this one. Both gains at 1 make the shader take the path
  it takes today, so a frame drawn that way can only be compared with itself. The rule is
  an identity in one number, and the unit test is what states it.

#### Scenario: A higher gain blocks more at one camera

- **WHEN** the browser test holds one camera inside the band on the sight line of a record,
  with the occlusion constant at 0 and the light gain at 0, draws a known background behind
  the record, and reads the mean luminance of a block at the record's centre with both gains
  at 1 and then with both gains at 2
- **THEN** the block at the gain of 2 is darker than the block at the gain of 1

#### Scenario: A far nebula blocks more than a near one

- **WHEN** the browser test places the camera on the sight line of one record at a range
  under the near range and again at a range over the far range, with the occlusion constant
  at 0 so the dust plays no part and the light gain at 0 so the record adds no emission,
  draws a known background behind the record, and reads the mean luminance of a block at
  the record's centre
- **THEN** the block at the far camera is darker than the block at the near camera

#### Scenario: The blocking does not step as the camera moves

- **WHEN** the browser test holds one camera on the sight line of one record, with the
  occlusion constant at 0, and reads 200 pairs of frames through the near range and the far
  range, each pair 1 percent of the range apart, by scaling both ranges by 1 over 1.01
  instead of moving the camera
- **THEN** no pair differs at any pixel by more than 12, summed over the three channels on
  a 0 to 255 scale

  `smoothstep(near / s, far / s, r)` equals `smoothstep(near, far, r * s)`, so a range
  scaled by 1 over 1.01 gives every record the gain of a camera 1 percent further out. The
  camera stays still, so the reading holds the frame's own noise out of the pair.

  **Why not move the camera.** The moved form was read and cannot answer this requirement
  at any bound a step would fail. A 1 percent move of a camera inside the band redraws the
  whole frame: the volume alone gives a worst pair of 6, the volume with the nebulae gives
  410, and **the gains held at 1 — the shader this change starts from — gives 378**. The
  same sweep at a 0.1 percent step gives 167, at 0.01 percent 22 and at 0 percent 0. The
  sprite grid and the volume's ray steps move with the camera, and they, not the gain,
  carry those numbers. The held camera is what isolates the gain.

#### Scenario: The gain leaves the emission alone

- **WHEN** a unit test reads the emission the pass sends for one record at the near gain
  and at the far gain
- **THEN** the two are equal

#### Scenario: A gain the reader cannot read takes the default

- **WHEN** a unit test sets each of the four constants to a value that is not finite, and
  then to a value below 0
- **THEN** each reads back the default the requirement states

### Requirement: A nebula attenuates the point cloud and the star field

A nebula SHALL dim the stars behind it. Today it dims nothing but the density volume and
the cloud sprites, because the point cloud and the star field draw after the nebula
composite and add their light over it.

**The transmittance reaches the two sprite passes.** The pass SHALL make the accumulated
nebula transmittance of the frame available to the point cloud and the star field. Each
sprite's colour SHALL be multiplied by that transmittance at the sprite's place on the
screen. The two passes SHALL stay additive: the multiply happens to the sprite's colour,
before the add, so the requirement "Three scene passes and a tone map compose the far view"
stands.

**The depth gate.** A sprite in front of every nebula SHALL NOT be dimmed. The pass SHALL
report two ranges over the records it drew: the **front range**, which is the least of
`range - radius` over those records and never below 0, and the **centre range**, which is
the range of that same record's centre. A sprite at or nearer than the front range SHALL
take none of the attenuation. A sprite at or beyond the centre range SHALL take all of it.
Between the two the share SHALL run smoothly, so no sprite steps as the camera moves.

**The stated ceiling.** The gate reads two ranges for the whole frame and no depth per
pixel. A sprite beyond the nearest record's centre that sits in front of a second, further
record is therefore dimmed as if it were behind that second record. This is accepted: the
case needs two records at very different ranges on one sight line with sprites between
them, and the nearer record is the one the gate is right about, which is the record a
camera flying through the set is closest to.

**No nebula, no change.** A frame in which the nebula pass drew no record SHALL draw the
point cloud and the star field exactly as it draws them today, and SHALL make no texture
fetch for this rule. That covers a frame above the zoom band, a frame with the nebula
switch off, a frame before the records or the art arrive, and a frame whose selection kept
nothing.

**A stale frame SHALL NOT leak.** The transmittance a sprite pass reads SHALL be the one
the nebula pass wrote in the same frame. A frame that drew no record SHALL NOT read the
transmittance of the frame before it.

**Cost.** The rule adds at most one texture fetch per sprite fragment, and none at all
where no nebula drew. The mean render time SHALL stay under 16.7 ms at the six views
`far-view-rendering` states and the six views `close-view-stars` states, at 1920 by 1080 on
the dev container's GPU, over 300 frames, measured with the function those two capabilities
already name. The set holds 358 records and the covered-area budget allows 4 screen areas.

#### Scenario: A star behind a nebula dims

- **WHEN** the browser test opens a view inside the band with a dense record between the
  camera and a block of the point cloud, with the volume and the cloud switches off and the
  nebula light gain at 0 so the record adds no light of its own, and reads the mean
  luminance of that block with the nebula switch on and with it off
- **THEN** the reading with the switch on is lower than the reading with it off

#### Scenario: A star in front of the nearest nebula keeps its light

- **WHEN** the browser test opens the same view and reads the mean luminance of a block of
  the point cloud whose samples all sit nearer than the front range the pass reports
- **THEN** the two readings agree to six places

#### Scenario: The star field dims with the point cloud

- **WHEN** the browser test opens a view at a zoom distance inside both the nebula band and
  the star field's range, with a dense record in front of a block the field draws, and reads
  the mean luminance of that block with the nebula switch on and with it off
- **THEN** the reading with the switch on is lower than the reading with it off

#### Scenario: A frame with no nebula is unchanged

- **WHEN** the browser test renders the default view at 60,000 light years, which is above
  the zoom band, with the nebula switch on
- **THEN** the frame matches the baseline image the capability `far-view-rendering` pins,
  and a unit test reads that the point pass and the star pass were sent no transmittance
  texture for that frame

#### Scenario: The frame before does not leak into a frame with no nebula

- **WHEN** the browser test draws a frame inside the band that blocks a block of the point
  cloud, then moves the camera above the band and draws again, and reads the same block
- **THEN** the second reading matches the reading of the same view drawn without the first
  frame, to six places

#### Scenario: The twelve budget views stay under budget

- **WHEN** the browser test sets each of the six views `far-view-rendering` states and each
  of the six views `close-view-stars` states, with the nebulae on, and calls the measurement
  function for 300 frames
- **THEN** each returned mean is under 16.7 ms

### Requirement: The frame holds a covered-area budget

The set SHALL select the nebulae to draw by apparent size, largest first, and SHALL hold
the frame's **covered area** rather than a count.

**Covered area is defined here**, because the quantity is new and the wrong reading of it
makes the budget useless. A record's covered area SHALL be

> the lesser of the disc of its apparent radius and **one screen area**,

in CSS pixels. A record the camera sits inside therefore contributes at most one screen
area. Without that limit the first such record exhausts any budget on its own and drops the
other 357: the selection divides by a minimum range of one light year, so a camera at a
record's centre gives an apparent radius of about 187,000 CSS pixels and a disc of about
53,000 screen areas, at the project's 60 degree field of view and a canvas of 1,080.

The selection SHALL compute this **without the view direction**, from the apparent radius
and the canvas size alone. It therefore bounds the worst case over every direction the
camera could face, and not the area this frame actually covers: a record behind the camera
still counts. That is the same trade the count budget made, it is conservative in the
direction that matters, and it keeps the selection free of the projection.

The selection input SHALL carry the canvas **width** in CSS pixels as well as its height,
because one screen area is the product of the two and the input carries the height alone
today.

The budget SHALL be a number of screen areas, and a record SHALL enter the frame only while
the running total is below it. The budget SHALL be **4 screen areas**, which the committed
record file does not reach at any camera the browser suite visits.

Covered area and apparent size are **two quantities**. The budget accumulates covered area,
and the budget fade below is defined on that same accumulated total. An earlier draft
defined the fade on apparent size, on the reasoning that size is what moves smoothly as the
camera turns. The implementation measured that rule and it does not hold for an area
budget. A size-based cut works for a count budget, where dropping one record moves the cut
by one record. Under an area budget the sizes at the cut are widely spaced, so one large
record entering the frame moves a size-based cut in a jump and takes a whole group out at
full weight. The 360 degree turn test read a worst entry weight of 1 against a bound of
0.05 under that rule.

The accumulated total is continuous where apparent size is not: every record's own covered
area is continuous in the camera position, a sum of continuous terms is continuous, and two
records swapping places in the sort changes no sum. The fade therefore reaches 0 exactly
where the scan breaks, so the record the scan stops on is already at weight 0.

The count is the wrong guard because a marched box costs in proportion to the pixels it
covers times the steps per ray. One record that fills the frame costs more than a hundred
that cover a few pixels each.

A nebula SHALL draw only when its apparent radius is at least **1.5 CSS pixels**, so a
nebula too small to read costs no fragments.

Both cuts SHALL fade, so no nebula can enter or leave the frame with weight:

- the **floor fade** SHALL be 0 at 1.5 CSS pixels and 1 at 3 CSS pixels
- the **budget fade** of one kept record SHALL read the covered area of every record at
  least as large as it, its own included. It SHALL be 1 at and below **0.8 of the budget**
  and 0 at the budget, so a record reaching the cut draws at weight 0 and every record
  admitted while the running total is under 0.8 of the budget draws at full weight

The budget keeps the largest first, so its cut is not a property of one record: it moves
with everything else the camera holds. A record of a steady apparent size therefore
crosses the cut as the camera turns, and without the budget fade it would appear and
disappear in one frame.

The pass SHALL make no view break the **Frame budget** requirement of
`far-view-rendering`, which measures 2,000, 12,000, 20,000, 30,000 and 120,000 light years
at 1920 by 1080.

The pass MAY issue one draw call per record. The count of calls is not what the budget
holds; the covered area is.

#### Scenario: A near view holds the budget

- **WHEN** the browser test opens a view with the camera inside a 200 light year record,
  reads the frame interval, and reads how many records the budget dropped
- **THEN** the interval holds the budget `far-view-rendering` states, and the count of
  dropped records is 0.

  The covered area cannot be the assertion: the selection stops at the budget by
  construction, so reading it back can never exceed it. What the reading has to show is
  that the committed record file does not reach the budget at a camera the suite visits,
  which is the dropped count, and that the frame holds regardless, which is the interval.

#### Scenario: The budget cuts a file that reaches it

- **WHEN** the unit test selects over a set whose records cover more than the budget
- **THEN** the selection stops at the budget, and every record it dropped is smaller than
  every record it kept

#### Scenario: No nebula pops in or out at the budget's cut

- **WHEN** the unit test turns the camera through 360 degrees, one degree at a time, at
  6,000 light years over a set that covers more than the budget
- **THEN** every record the budget adds or drops between two angles carries a fade under
  0.05, and no record's fade changes by more than 0.2 across one degree

#### Scenario: No nebula goes out at a reported view

- **WHEN** the unit test turns the camera through 360 degrees, one degree at a time, at
  6,000 light years over the committed record file, at the two views a reader reported a
  nebula going out at
- **THEN** every record that enters or leaves the frame carries a fade under 0.05, and
  no record's fade changes by more than 0.2 across one degree

#### Scenario: The frame budget holds with the nebulae on

- **WHEN** `far-view-rendering`'s frame budget test runs with the nebula pass on
- **THEN** every returned mean is under 16.7 ms

### Requirement: The nebulae draw in a zoom band with no near end

A weight on the zoom distance SHALL make the nebulae a close-range and mid-range feature.
The weight SHALL be:

- **1** from the closest zoom distance up to **12,000** light years
- **0** at and above **20,000** light years
- moving smoothly across 12,000 to 20,000

The weight SHALL scale the emission and the alpha of every nebula together. When the
weight is 0 the pass SHALL draw nothing and SHALL issue no draw call.

The far end holds the far view unchanged. The default view opens at **60,000 light
years**, so no nebula draws there and the pinned baseline image of the far view SHALL NOT
change.

The band has **no near end**, and **no fade holds the camera out of a nebula**. A camera
that flies into a record SHALL see the volume fill the view, and a camera at a record's
centre SHALL see the part of the volume that is still in front of it. This is what the
volume replaces the sprite for: a flat billboard could not be entered, so it had to fade,
and a marched box does not.

There SHALL be no fade on the range from the record's centre and no fade on the apparent
size. A record's weight SHALL depend on the zoom distance, the size floor and the budget
alone.

#### Scenario: The baseline holds

- **WHEN** the browser test renders the default view at 60,000 light years with the
  nebula pass on
- **THEN** the frame matches the pinned baseline image

#### Scenario: The far end holds the far view

- **WHEN** a unit test selects at a zoom distance of 60,000 light years, with a canvas
  1280 by 720 CSS pixels at device pixel ratio 1
- **THEN** the zoom weight is 0, and the pass draws nothing and issues no draw call

#### Scenario: A close view draws the nebulae

- **WHEN** a unit test selects at a zoom distance of 2,000 light years
- **THEN** the zoom weight is 1 and at least one record draws

#### Scenario: The nebulae appear in the band

- **WHEN** a unit test selects at zoom distances of 10 and 12,000 light years
- **THEN** at least one record draws at each, and the zoom weight is 1 at each

#### Scenario: A nebula grows as the camera closes on it

- **WHEN** the browser test reads the light one record contributes with its centre ahead
  of the camera at three, two and 1.2 times its radius, at a zoom distance inside the band
- **THEN** the contribution rises at each step

#### Scenario: The camera inside a nebula is surrounded by it

- **WHEN** the browser test places the camera at the centre of a nebula, at a zoom
  distance inside the band
- **THEN** that nebula covers the whole frame and contributes light to it

### Requirement: The nebulae join the half-resolution target

The pass SHALL draw into an accumulation target at the size of the half-resolution
target. The composite SHALL apply that target to the half-resolution target after the
cloud sprites and before the target is read out. The glow therefore reads the nebulae
with the volume and the clouds, and the tone map reads them with the rest of the scene.

The accumulation target SHALL hold the same number format as the half-resolution target,
so a card that gives no floating point target draws the nebulae as it draws the rest of
the scene.

The renderer SHALL expose a switch that turns the nebulae off, a light gain that scales
the emission of every nebula, and a step rate. Each SHALL be one value for every record
and every asset. The switch SHALL skip the accumulation target and the composite
together, so a frame with the nebulae off pays for neither.

#### Scenario: The switch removes the nebulae

- **WHEN** the browser test opens a view inside the band that draws nebulae, reads the
  frame with the nebula switch on, then reads it again with the switch off
- **THEN** the two frames differ, and the frame with the switch off matches, to ten
  places, a capture the same run took with the switch off before it turned the switch on.

  The map draws a frame as soon as the records and the volumes attach, so no capture of a
  run can precede every frame the pass drew. The reading that matters is that the switch
  leaves nothing of the pass behind, which the first and the last capture state.

#### Scenario: Brightness scales the colour alone

- **WHEN** a unit test doubles the light gain
- **THEN** the emission the pass sends per record doubles and the alpha does not change

#### Scenario: The glow reads the nebulae

- **WHEN** the browser test renders a view inside the band drawing a bright nebula, with
  the volume and the cloud switches off, the nebula switch on and the glow on
- **THEN** a halo surrounds the nebula that the same view with the glow off does not hold

#### Scenario: The composite runs once whatever the count

- **WHEN** a unit test draws a frame that selects 1 record, a frame that selects 100 and a
  frame that selects none
- **THEN** the composite draws once in the first two and the accumulation target is
  cleared once in each of them, and the third draws no composite and clears nothing

### Requirement: The nebulae composite without an order

The pass SHALL composite the nebulae through an accumulation target of its own, and the
frame SHALL NOT depend on the order the records draw in.

Each record SHALL contribute its emission to the accumulation target by addition, and its
transmittance by multiplication. The accumulated colour is therefore the sum of the
emissions of the drawn records, and the accumulated alpha is the product of their
transmittances. The target SHALL start each frame at an emission of zero and a
transmittance of one.

One composite draw SHALL then apply the accumulation target to the scene: the scene
colour becomes the accumulated emission plus the accumulated transmittance times the
colour the scene held. The composite SHALL run once in a frame that draws a record, and
once only, whatever the number of records.

A frame that draws no record SHALL skip the target, the clear and the composite with the
record draws. At a zoom weight of 0 the pass already issues no draw call, and the
composite is a draw call like the others.

One blend SHALL serve both a bright nebula and a dark one. A dark nebula attenuates
because its transfer function holds a high extinction against a low emission; the pass
SHALL NOT branch on the kind of a record and SHALL NOT use a second blend state.

A dark nebula SHALL attenuate the scene behind the whole selection. It SHALL NOT
attenuate another nebula of the same frame. Two records that overlap on the screen
therefore both contribute their full emission, and the pass SHALL NOT resolve the
overlap. This is the stated cost of the order independence above: the error it leaves is
the light one record would take from another, and it does not change as the camera moves.

The selection SHALL NOT order the records by range. It orders them by apparent size,
which the covered-area budget needs, and the draw follows that order.

The renderer SHALL carry a probe that draws the selected records in the reverse order, so
a test can state the order independence rather than argue it. The probe SHALL NOT reach
the supported surface, and the map SHALL draw with it off.

#### Scenario: A dark nebula attenuates

- **WHEN** the browser test draws a dark nebula over a lit background and reads the mean
  luminance of a block at its centre
- **THEN** the mean is below the mean of the same block with the nebula pass switched off

#### Scenario: A bright nebula adds light

- **WHEN** the browser test draws a bright nebula over the background and reads the mean
  luminance of a block at its centre
- **THEN** the mean is above the mean of the same block with the nebula pass switched off

#### Scenario: The selection does not order by range

- **WHEN** a unit test selects two records of the same apparent size at different ranges
- **THEN** the order they come back in does not change when their ranges are exchanged

#### Scenario: The overlap stays inside the light it was measured at

- **WHEN** the browser test reads the mean frame luminance at Barnard's Loop at 120 light
  years and at the Orion viewpoint at 800 and at 3,000, with every pass but the nebulae
  off and the occlusion at 0
- **THEN** each reading is at or below the bound written into the test

  The light at a camera that draws overlapping records is higher under this blend than
  under one that orders the records, because a record takes no light from another. The
  bound at each camera is the figure the implementation measures, rounded up to the next
  thousandth, in the manner of the march's own fixture bounds. The place is named so a
  later reader can tell a near miss from the rounding.

  A change that raises the light at any of the three cameras by more than **a tenth** is
  outside what this capability accepts, and the bound does not move to fit it. That tenth
  is a judgement about how much brightening the look can take. It is not a reading, and it
  is the one figure here a reader is meant to argue with.

#### Scenario: The frame does not change when the order is reversed

- **WHEN** the browser test draws one camera twice, once with the selected records in the
  order the selection gives them and once with that order reversed, at three cameras
  inside the band, with every pass but the nebulae off and the occlusion at 0
- **THEN** the two frames are one frame: no pixel differs by more than **1** of 255,
  summed over the three channels, and the mean frame luminance agrees to seven places

  This is the scenario that states the requirement. The two frames differ in the draw
  order and in nothing else, so nothing but the order can move them.

  The bound is not 0 because the accumulation target is `RGBA16F` and addition in it is
  not associative: a sum of 120 emissions can land one step of the format either side of
  the same sum added backwards. The implementation reads a frame of 87 records that is
  byte for byte identical, a frame of 110 records that differs at 7 pixels of 921,600 and
  a frame of 120 records that differs at 40, each by 1 of 255 in one channel. The means
  differ by 6.1e-9 in 0.1933 at the worst of the three.

#### Scenario: The frame does not step when two records change rank

- **WHEN** the browser test orbits the camera about the Orion viewpoint at 3,000 light
  years, with every pass but the nebulae switched off, and reads 720 pairs of frames, each
  pair 0.004 degrees apart
- **THEN** no pair differs at any pixel by more than **30**, summed over the three
  channels on a 0 to 255 scale

  This is the continuity reading beside the scenario above, and it measures more than a
  step. The camera **orbits** the cursor, so 0.004 degrees turns it and also carries it
  0.21 light years sideways at this radius. A record at range `r` therefore moves by
  `turn * (1 - 3000 / r)` on the screen: nothing at the cursor's own range, a twentieth
  of a pixel far beyond it, and about a third of a pixel at 400 light years, which is
  well inside the orbit. The records nearest the camera move most and cover the most
  pixels. The sweep therefore reads the motion plus any step, and never a step alone.

  What the bound falsifies is the reading the ordered blend gives at the same sweep: a
  worst pair of **71**. The implementation reads **26**, and 30 is that figure rounded up.
  The count of pairs above the bound is not part of the assertion, because the motion puts
  many pairs above any floor near the motion's own size: 163 of the 720 pairs sit above 8
  under this blend and 167 sit above it under the ordered one.

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
