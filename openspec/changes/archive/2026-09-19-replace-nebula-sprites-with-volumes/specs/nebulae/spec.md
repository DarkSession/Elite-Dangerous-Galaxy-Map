## ADDED Requirements

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

Each asset SHALL be a pair of 3D textures and an entry in one index file:

- a **density** volume in `BC4_UNORM`, one channel, which is the only channel the
  transmittance recurrence reads
- a **colour** volume in `BC1_UNORM`, three channels, which is the emission
- a **transfer function** of 256 entries of four floating-point values, which is an
  extinction coefficient the density indexes

The 33 transfer tables SHALL ship as **one binary file** of 33 by 256 by 4 `float32`, in the
index's asset order, which is exactly 135,168 bytes. They SHALL NOT be written as numbers in
the index, because 33,792 JSON floats would make the index the largest file in the set and
would put the on-disk total at risk of its own bound. The set is therefore **68 files**: 33
density volumes, 33 colour volumes, the transfer file and the index.

The two volumes of one asset SHALL be able to differ in size. The density sizes in the
committed set are 32, 48 and 64 to a side and the colour sides are 8, 16 and 32. The
renderer SHALL take every side **from the index file** and SHALL hold none of them as a
constant, so a repacked set is a drop-in.

The renderer SHALL decode both block formats on load and SHALL upload plain `R8` and
`RGBA8` 3D textures. It SHALL NOT require `WEBGL_compressed_texture_s3tc`,
`EXT_texture_compression_rgtc` or `EXT_texture_compression_bptc`, because a WebGL2
context is not guaranteed to carry them and the decode is a one-time cost on load.

Both volumes SHALL be stored upside down against object space, and the march SHALL
sample at `(u, 1 - v, w)`.

The transfer function SHALL upload as an `RGBA32F` 2D texture of 256 by 1 and SHALL be read
with `texelFetch` and `NEAREST` filtering. Both are core WebGL2. A `LINEAR` filter on a
floating-point texture needs `OES_texture_float_linear`, which WebGL2 does not guarantee,
so the march SHALL NOT filter the table.

The set has three different sizes and the spec bounds each one. Decoding turns half a byte
a texel into one byte for the density and four for the colour, so the video memory figure
is neither of the other two.

|                          | bound   | the committed set |
| ------------------------ | ------- | ----------------- |
| over the wire, brotli    | 1.3 MiB | 1.10 MiB          |
| on disk, as served       | 3.0 MiB | 2.78 MiB          |
| in video memory, decoded | 6.5 MiB | 6.03 MiB          |

The video memory figure SHALL count the transfer tables as well as the volumes: 33 tables
of 256 entries of four 32-bit values is 132 KiB, which is small but is not nothing.

The on-disk reading SHALL count **every file the set serves**: the 66 `.dds` volumes, which
are 2.64 MiB, the 132 KiB transfer file and the index. It is the bound a reader can check
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

- **WHEN** a unit test sums the three totals of the 33 assets
- **THEN** the total under **brotli at its default quality**, which is the compressor the
  bound is stated against, is at most 1.3 MiB, the on-disk total read from the files
  themselves is at most 3.0 MiB, **counting the transfer file and the index**, and the
  decoded total — the volumes computed from their
  sides, plus the transfer tables — is at most 6.5 MiB

#### Scenario: The sides come from the file and not from the code

- **WHEN** a unit test loads an index whose density side is 16 and whose colour side is 4,
  with block payloads to match
- **THEN** the loader uploads a 16 cubed density texture and a 4 cubed colour texture, and
  throws nothing

#### Scenario: The map needs no compressed-texture extension

- **WHEN** the browser test starts the map on a context with
  `WEBGL_compressed_texture_s3tc`, `EXT_texture_compression_rgtc` and
  `EXT_texture_compression_bptc` all refused
- **THEN** the nebulae load, the pass draws, and the page shows no error

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

### Requirement: A nebula marches a volume integral

A nebula SHALL draw by marching its volume front to back. Each step SHALL:

1. read the density and the colour at the sample point
2. read the four-channel extinction coefficient the density indexes in the transfer
   function
3. multiply the running transmittance by one minus the extinction times the density times
   the step length, held at or above zero
4. add the colour times the light gain times the transmittance **after** the step, times
   the density, times the step length

The output SHALL be the accumulated emission with `1 - transmittance.a` as its alpha,
which is premultiplied.

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
map offers, because a premultiplied source-over blend has no meaning outside that range.
The set meets this today; the requirement is what stops a repack from breaking it.

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

## MODIFIED Requirements

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

### Requirement: A nebula composites over the scene

The pass SHALL composite each nebula with **premultiplied source-over** blending: the
drawn colour is the nebula's emission plus the target's colour times one minus the
nebula's alpha.

One blend SHALL serve both a bright nebula and a dark one. A dark nebula attenuates
because its transfer function holds a high extinction against a low emission; the pass
SHALL NOT branch on the kind of a record and SHALL NOT use a second blend state.

Because source-over depends on the order, the pass SHALL draw the selected nebulae from
the furthest to the nearest.

Two boxes MAY overlap in the frame. The pass SHALL NOT resolve the overlap and SHALL
composite the nearer over the further, which is what the draw order gives.

#### Scenario: A dark nebula attenuates

- **WHEN** the browser test draws a dark nebula over a lit background and reads the mean
  luminance of a block at its centre
- **THEN** the mean is below the mean of the same block with the nebula pass switched off

#### Scenario: A bright nebula adds light

- **WHEN** the browser test draws a bright nebula over the background and reads the mean
  luminance of a block at its centre
- **THEN** the mean is above the mean of the same block with the nebula pass switched off

#### Scenario: The order runs from the furthest to the nearest

- **WHEN** a unit test selects two records at different ranges
- **THEN** the pass draws the further one first

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

**The default is on.** A look constant SHALL scale the optical depth. At `0` the pass
draws what it drew before this change; at `1` it draws the volume's own extinction. The
default SHALL be `1`.

**The volume alone occludes.** The march reads the density volume texture and nothing
else. The cloud sprites do not attenuate a nebula, and a nebula does not attenuate
another nebula.

**No volume, no attenuation.** Where the density volume has not arrived, or the volume
switch is off, the transmittance SHALL be `1` for every nebula.

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

#### Scenario: A nebula with little in front of it barely changes

- **WHEN** the browser test opens `BRIGHT_VIEW`, the camera
  `#c=624.4,-425.9,-1229.5&d=6000&p=35&y=0` that `e2e/nebulae.spec.ts` already names, and
  reads the nebula with the occlusion constant at 1 and at 0
- **THEN** the two readings differ by **under 2 percent of the block mean**, which is the
  band the change measures and writes into the test beside the view.

  The view and the tolerance are one decision, and this requirement settles it. The
  tolerance is a measured figure and not "the dither", because there is no view inside
  this galaxy with **nothing** in front of a nebula. `BRIGHT_VIEW` is the view the design
  costed: its segment to Barnard's Loop is 5,912 light years and its estimated
  transmittance is 0.997, 0.994 and 0.989 by channel, so the worst channel changes by
  1.1 percent, and 2 percent is that estimate plus a margin. A nearer camera carries a
  smaller signal and would need a tighter band; taking the costed view keeps the
  assertion and the estimate on one segment. A band several times the signal is the
  failure the paragraph below names: it would pass a frame that dimmed several times more
  than the model allows. A tolerance the implementer picks after reading the frame is a tolerance
  that always passes.

#### Scenario: Occluded light turns warm

- **WHEN** the browser test reads a nebula through the bulge with the occlusion constant
  at 1 and at 0, and takes the ratio of the blue channel to the red channel for each
- **THEN** the ratio at 1 is below the ratio at 0

#### Scenario: A dark nebula behind the core stops cutting a hole

- **WHEN** the browser test reads the pixels of a dark nebula that sits behind the core,
  with the occlusion constant at 1 and at 0
- **THEN** the reading at 1 is above the reading at 0, because the nebula's alpha is
  scaled by the same transmittance

#### Scenario: The extinction rule is written once

- **WHEN** a unit test reads the source the volume program compiles and the source the
  nebula program compiles
- **THEN** both hold the shared rule, neither holds the marker the rule replaces, and the
  rule text in both is the text of the one file that states it

#### Scenario: Every vertex of a record reaches the same transmittance

- **WHEN** a unit test marches the extinction rule at all 36 vertices of one record's box
- **THEN** all 36 results are equal, so the value is one per record however many vertices
  compute it

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
  the occlusion constant at 1, and a drawn count at or above the floor **this change
  measures and writes into the test**. The near end of the zoom band is open, so a near
  view draws a record that fills the frame, and the floor is set there
- **THEN** the frame interval holds the budget `far-view-rendering` states

#### Scenario: The vertex stage carries the volume sampler

- **WHEN** the browser test starts the map on the hardware renderer, logs
  `MAX_VERTEX_TEXTURE_IMAGE_UNITS` as a diagnostic, and compiles the nebula program from
  the composed sources
- **THEN** the program links without an error. The assertion is the link, not the count:
  WebGL2 guarantees at least 16 vertex texture units, so a count check cannot fail on any
  conforming implementation

### Requirement: The nebulae join the half-resolution target

The pass SHALL draw into the half-resolution target, after the cloud sprites and before
the target is read out. The glow therefore reads the nebulae with the volume and the
clouds, and the tone map reads them with the rest of the scene.

The renderer SHALL expose a switch that turns the nebulae off, a light gain that scales
the emission of every nebula, and a step rate. Each SHALL be one value for every record
and every asset.

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

## REMOVED Requirements

### Requirement: The sprite art comes from one atlas of 34 tiles

**Reason**: The map no longer draws sprites, so it holds no atlas. Every clause of this
requirement is about a 2D tile set: the 6 by 6 grid, the tile side taken from the file,
the sRGB upload, the one-texel alpha-0 ring against bleed, the 2 MiB bound and the
right-way-up lookup. None of them has a meaning for a 3D volume.

**Migration**: `src/render/nebula-art.webp` is deleted. The art is the 33 volume assets
that **The art comes from 33 volume assets** states, and the record's tile index becomes
an asset index. The concerns this requirement held carry over as follows:

- the size bound becomes the wire and texture bounds of the volume set
- the sides taken from the file become the per-asset density and colour sides taken from
  the index
- the right-way-up rule becomes the `(u, 1 - v, w)` sample the volumes are stored for
- the bleed ring has no successor: a 3D texture with `CLAMP_TO_EDGE` on all three axes
  holds one asset per texture, so no neighbour exists to bleed into

### Requirement: A nebula draws one diameter across

**Reason**: Replaced by **A nebula draws as a marched box one diameter across**. The world
size rule survives, but the screen-aligned quad, the roundness clause and the drawn-radius
cap do not. The cap existed to bound a billboard's fill; a marched box is bounded by the
covered-area budget instead, and it must be able to grow without limit because the camera
can enter it.

**Migration**: The size rule is unchanged, so a record of radius 200 still draws 400 light
years across. Drop the cap constant and the roundness assumption. A test that asserts a
clamp at three quarters of the canvas height now asserts that no clamp applies.

### Requirement: At most 256 nebulae draw in one frame

**Reason**: Replaced by **The frame holds a covered-area budget**. A count guards the wrong
thing. A marched box costs in proportion to the pixels it covers times the steps per ray,
so one record filling the frame costs more than a hundred covering a few pixels each. The
measured figures are 97.9 µs for a record that fills a 1,280 by 720 frame and 4.8 µs for
one that covers a small patch, at 32 steps over one object-space unit.

**Migration**: `NEBULA_MAX_DRAWN` and the one-draw-call rule go. The size floor, the floor
fade and the budget fade all carry over unchanged; only the quantity the budget counts
changes, from instances to screen areas of coverage.

### Requirement: The nebulae draw in a zoom band

**Reason**: Replaced by **The nebulae draw in a zoom band with no near end**. The zoom band
itself is unchanged. What goes is the pair of near fades: the fade from three radii to one
radius, and the size fade on the apparent radius. Both existed because a flat billboard
cannot be entered, and both make the volume's one real advantage unreachable.

**Migration**: Delete both fades and their constants. A camera at a record's centre now
sees the volume rather than nothing, so the scenario **The camera inside a nebula sees
none of it** is replaced by **The camera inside a nebula is surrounded by it**, and **A
sprite thins out as the camera closes on it** by **A nebula grows as the camera closes on
it**. **The far end, not the floor, holds the far view** carries over under the shorter name
**The far end holds the far view**, because there is no longer a near floor to contrast it
against. Hosts that relied on flying through a nebula unobstructed will see it fill the view.
