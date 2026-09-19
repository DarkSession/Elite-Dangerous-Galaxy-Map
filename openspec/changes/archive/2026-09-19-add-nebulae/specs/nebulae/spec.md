## Purpose

Draws the 358 authored and procedurally generated nebulae that give the mid-zoom view its
structure, each as a sprite with its own art and its own size.

## ADDED Requirements

### Requirement: The map holds 358 nebulae

The map SHALL hold a fixed set of 358 nebula records. 190 are authored and 168 are
procedurally generated. The counts, the radii and the tile indices come from the packing
step that builds the two data files; no source in this repository derives them. The galaxy
holds about 400 billion systems, so the set is small beside them.

Each record SHALL carry a position in game coordinates, a radius in light years and a tile
index into the sprite atlas. A record MAY carry a name, and a record without one SHALL
omit the field rather than hold an empty value. A record SHALL carry no colour and no
per-record brightness.

The file SHALL hold no field a reader can derive: no record count, no field-name list and
no units note. The positions SHALL be stored to 0.1 light year and the radii to 0.01, which
is finer than one screen pixel at every zoom distance in the band.

The records SHALL load as a fetched asset, not as a bundled module, so the entry chunk
does not carry the set. The set SHALL build in one sweep when the asset arrives and SHALL
NOT be rebuilt in any frame. Before the asset arrives the pass SHALL draw nothing, and no
frame SHALL fail because of it.

If the fetch fails, or the asset does not parse, the loader SHALL throw a typed error, as
the galaxy detail image already does. The application SHALL report it to the browser
console and SHALL keep the map running. The pass SHALL then draw nothing and every other
pass SHALL keep drawing.

The nebulae are not part of the first frame, so this failure SHALL NOT reach the error
message the application shows for a failed start. That path stops the map, which would
take every other pass down with the nebulae.

The start SHALL NOT wait for either asset. The first frame, the frame loop and the
removal of the loading picture SHALL all happen whether or not the pair has arrived, and
the records and the atlas SHALL reach the renderer after the loop runs. A request that
never answers therefore leaves the map drawing every other pass.

The largest radius in the set is 200 light years and the smallest is above 0.

#### Scenario: A held fetch does not hold the map

- **WHEN** the browser test holds the request for the sprite atlas open and never
  answers it, then opens the map
- **THEN** the map starts, the frame loop runs, the nebula pass reports 0 drawn
  instances and 0 draw calls, and the records and the atlas are not attached

#### Scenario: The set loads whole

- **WHEN** a unit test loads the nebula set
- **THEN** it holds 358 records, every radius is above 0 and at most 200, every tile index
  is from 0 to 33, and every position is finite

#### Scenario: The entry chunk does not carry the records

- **WHEN** the library bundle test reads the entry chunk
- **THEN** the chunk holds no nebula record, and its size is under the recorded bound

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

### Requirement: A nebula draws one diameter across

A nebula SHALL draw as a screen-aligned sprite whose world width is **twice** the
record's radius. The sprite SHALL be round: no record's shape SHALL depend on a second
axis or on a rotation.

The apparent radius in pixels SHALL follow the world radius divided by the range from the
camera, so a nebula holds its size against the scene as the camera moves.

A sprite SHALL keep that apparent radius the whole way in. A drawn radius cap SHALL hold
the fill cost, so one instance close to the camera cannot lay fragments over an unbounded
area, and the cap SHALL sit at **three quarters of the canvas height in CSS pixels**,
which is the size at which the size fade below has already reached 0. A sprite the viewer
can see SHALL therefore never stop growing as the camera comes toward it. The floor
below and the cap here are both measured in CSS pixels, whatever the resolution of the
target the pass draws into.

#### Scenario: Size follows the record

- **WHEN** a unit test places a nebula of radius 200 light years at 10,000 light years
  from the camera, and a nebula of radius 100 light years at 5,000 light years
- **THEN** both sprites take the same apparent radius, within one part in 1,000

#### Scenario: A near nebula keeps its size until the cap, which it cannot be seen at

- **WHEN** a unit test sets a canvas of 720 CSS pixels in height and places a nebula whose
  uncapped apparent radius is 400 CSS pixels, and then one of 2,000 CSS pixels
- **THEN** the first draws at 400 CSS pixels, the second draws at the cap of 540, and the
  size fade at the cap is 0

### Requirement: The sprite art comes from one atlas of 34 tiles

The renderer SHALL read one sprite atlas of **34 tiles of 256 by 256 texels**, in RGBA,
laid out in a 6 by 6 grid, which is 1536 by 1536 texels. Several records SHALL be able to
name one tile.

The renderer SHALL take the atlas side and the tile side **from the file** and SHALL NOT
hold either as a constant. The grid is 6 tiles a row, the tile side is the file's side
over 6, and a file that is not square or that 6 does not divide SHALL be refused. A pack
at a different tile size is therefore a drop-in.

The tile side is 256 because the near end of the zoom band is open. A sprite draws up to
three quarters of the canvas height in radius, which is 1080 CSS pixels across on a canvas
720 CSS pixels high, so a 64 texel tile is magnified 17 times and reads as a blur.

The atlas SHALL be uploaded as an sRGB texture, so the hardware decodes the colour
channels to linear on sample and leaves the alpha channel linear. The colour channels
hold radiance and the alpha channel holds opacity, so the two SHALL NOT share one
transfer curve.

The **outermost one-texel ring inside each tile** SHALL be alpha 0, and the shader SHALL
inset its lookup by half a texel, so linear filtering cannot carry one tile's colour into
its neighbour.

The atlas SHALL be at most **2 MiB** on disk and SHALL load as a fetched asset. It is one
fetch beside the map and never part of the entry chunk, so the bound is what a first paint
can carry.

A tile SHALL draw **the same way up as the file**. The upload does not flip the rows, so
texture row 0 holds the top row of the file, and the lookup SHALL negate y to put that row
at the top of the sprite. The art of a nebula is not symmetric, so a sprite that drew its
tile upside down would draw a shape the record does not have.

#### Scenario: The atlas covers every record

- **WHEN** a unit test reads the tile index of all 358 records
- **THEN** every index names a tile the atlas holds, and every one of the 34 tiles is
  named by at least one record

#### Scenario: No tile bleeds into its neighbour

- **WHEN** a browser test decodes the atlas and reads the outermost one-texel ring inside
  each of the 34 tiles
- **THEN** every alpha it reads is 0

The check runs in the browser because Node 22 decodes no WebP: `createImageBitmap` and
`ImageDecoder` are both absent there. The test reads the bytes of the committed file, so
it checks the same file the map ships.

#### Scenario: A sprite draws its tile the same way up as the file

- **WHEN** a browser test puts record 187 at the middle of the frame, where its sprite
  covers 97.7 CSS pixels across the radius, and reads the light a 64 pixel block loses
  above the middle and below it
- **THEN** the block above the middle loses more than 1.5 times the light the block below
  it loses, because the tile holds 66 percent of its alpha in the top half of the file

The record is a dark one, so the sprite takes light away where its alpha is high. Every
other reading of the suite is a mean over a block, which cannot tell the two orientations
apart.

### Requirement: A nebula composites over the scene

The pass SHALL composite each sprite with **premultiplied source-over** blending: the
drawn colour is the sprite's colour plus the target's colour times one minus the sprite's
alpha.

One blend SHALL serve both a bright nebula and a dark one. A dark nebula attenuates
because its art holds low colour and high alpha; the pass SHALL NOT branch on the kind of
a record and SHALL NOT use a second blend state.

Because source-over depends on the order, the pass SHALL draw the selected sprites from
the furthest to the nearest.

#### Scenario: A dark nebula attenuates

- **WHEN** the browser test draws a dark nebula over a lit background and reads the mean
  luminance of a block at the centre of the sprite
- **THEN** the mean is below the mean of the same block with the nebula pass switched off

#### Scenario: A bright nebula adds light

- **WHEN** the browser test draws a bright nebula over the background and reads the mean
  luminance of a block at the centre of the sprite
- **THEN** the mean is above the mean of the same block with the nebula pass switched off

### Requirement: At most 256 nebulae draw in one frame

The set SHALL select the nebulae to draw by apparent size, largest first, and SHALL draw
at most **256** in one frame. The whole frame's nebulae SHALL draw in **one** draw call.

A nebula SHALL draw only when its apparent radius is at least **1.5 CSS pixels**, so a
nebula too small to read costs no fragments.

Both cuts SHALL fade, so no nebula can enter or leave the frame with weight:

- the **floor fade** SHALL be 0 at 1.5 CSS pixels and 1 at 3 CSS pixels
- the **budget fade** SHALL be 0 at the apparent size of the largest record the budget
  dropped, and 1 at 1.25 times that size; where the budget dropped no record it SHALL
  be 1

The size floor is the bound the committed record file meets, and the budget is the guard
for a larger one. Over every camera position of the file, at most 184 records reach the
floor on a canvas 1,080 CSS pixels tall, and at most 225 on one of 2,160, so the budget
cuts no frame of this file.

The budget keeps the largest 256, so its cut is not a property of one record: it moves
with everything else the camera holds. A record of a steady apparent size therefore
crosses the cut as the camera turns. Without the budget fade that record appears and
disappears in one frame, which reads as a nebula that flashes on and off.

The budget was 32. That put the cut among the records the eye reads: at one view near
the core the cut sat between 6.5 and 9.6 CSS pixels and moved through that band as the
camera turned, so a nebula of 8 pixels went out and came back. The records the higher
budget adds are the small ones, which add 0.005 of a screen of fill in the worst view
measured.

The pass SHALL make no view break the **Frame budget** requirement of `far-view-rendering`,
which measures 2,000, 12,000, 20,000, 30,000 and 120,000 light years at 1920 by 1080. The
nebulae draw in full up to 12,000 light years and stop at 20,000, and the drawn radius is
capped, so the fill of one sprite is bounded and the sprite layers per target pixel peak
inside that band.

#### Scenario: Every record above the floor draws in one call

- **WHEN** the browser test opens a view inside the zoom band
- **THEN** the pass reports one draw call, and a drawn count above 60 and at most 256

#### Scenario: The budget cuts a file that reaches it

- **WHEN** the unit test selects over a set that holds more records above the floor than
  the budget draws
- **THEN** the selection holds 256 instances, and every record it dropped is smaller
  than every record it kept

#### Scenario: No nebula pops in or out at the budget's cut

- **WHEN** the unit test turns the camera through 360 degrees, one degree at a time, at
  6,000 light years over a set that holds more records above the floor than the budget
  draws
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

### Requirement: The nebulae draw in a zoom band

A weight on the zoom distance SHALL make the nebulae a close-range and mid-range feature.
The weight SHALL be:

- **1** from the closest zoom distance up to **12,000** light years
- **0** at and above **20,000** light years
- moving smoothly across 12,000 to 20,000

The weight SHALL scale the colour and the alpha of every sprite together. When the weight
is 0 the pass SHALL draw nothing and SHALL issue no draw call.

The far end holds the far view unchanged. The default view opens at **60,000 light
years**, so no nebula draws there and the pinned baseline image of the far view SHALL NOT
change. The far end is needed on its own and is not a result of the size floor: at 60,000
light years the floor still admits one record, whose radius is 200 light years.

The band has **no near end**. A close view is where a record is large enough to read as
more than a dot, so the nebulae draw at every zoom distance below the far end. What a flat
sprite cannot do close up is held by two fades on the record rather than on the zoom
distance.

A nebula SHALL fade out as the camera comes inside it. This fade SHALL be full at three
times the record's radius and zero at one times, measured from the record's centre.

A nebula SHALL also fade out as its sprite grows large in the frame. This **size fade**
SHALL be full at and below **a quarter of the canvas height** of apparent radius and zero
at and above **three times** that, and SHALL read the uncapped apparent radius. It SHALL
take the weight of the sprite and never its size. The two fades SHALL multiply.

#### Scenario: The baseline holds

- **WHEN** the browser test renders the default view at 60,000 light years with the
  nebula pass on
- **THEN** the frame matches the pinned baseline image

#### Scenario: The far end, not the floor, holds the far view

- **WHEN** a unit test selects at a zoom distance of 60,000 light years, with a canvas
  1280 by 720 CSS pixels at device pixel ratio 1
- **THEN** one record passes the size floor, the zoom weight is 0, and the pass draws no
  instance and issues no draw call

#### Scenario: A close view draws the nebulae

- **WHEN** a unit test selects at a zoom distance of 2,000 light years
- **THEN** the zoom weight is 1 and at least one record draws

#### Scenario: The nebulae appear in the band

- **WHEN** a unit test selects at zoom distances of 10 and 12,000 light years
- **THEN** at least one record draws at each, and the zoom weight is 1 at each

#### Scenario: A sprite thins out as the camera closes on it

- **WHEN** the browser test reads the light one record contributes with its centre ahead
  of the camera at three, two and 1.2 times its radius, at a zoom distance inside the band
- **THEN** the contribution falls at each step and is under 0.02 of the block's mean
  luminance at the last

#### Scenario: The camera inside a nebula sees none of it

- **WHEN** the browser test places the camera at the centre of a nebula, at a zoom
  distance inside the band
- **THEN** that nebula contributes no light to the frame, and the same record ahead of
  the camera at three times its radius does contribute

### Requirement: The nebulae join the half-resolution target

The pass SHALL draw into the half-resolution target, after the cloud sprites and before
the target is read out. The glow therefore reads the nebulae with the volume and the
clouds, and the tone map reads them with the rest of the scene.

The renderer SHALL expose a switch that turns the nebulae off, and a brightness constant
that scales the colour channels of every sprite by one factor. The constant SHALL be one
value for every record and every tile.

#### Scenario: The switch removes the nebulae

- **WHEN** the browser test opens a view inside the band that draws nebulae, reads the
  frame with the nebula switch on, then reads it again with the switch off
- **THEN** the two frames differ, and the frame with the switch off matches, to ten
  places, a capture the same run took with the switch off before it turned the switch on

The map draws a frame as soon as the records and the atlas attach, so no capture of a run
can precede every frame the pass drew. The reading that matters is that the switch leaves
nothing of the pass behind, which the first and the last capture state.

#### Scenario: Brightness scales the colour alone

- **WHEN** a unit test doubles the nebula brightness constant
- **THEN** the colour the pass sends per sprite doubles and the alpha does not change

#### Scenario: The glow reads the nebulae

- **WHEN** the browser test renders a view inside the band drawing a bright nebula, with
  the volume and the cloud switches off, the nebula switch on and the glow on
- **THEN** a halo surrounds the nebula that the same view with the glow off does not hold
