## ADDED Requirements

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

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: A nebula composites over the scene

**Reason**: The draw order stops being part of the contract. The requirement fixed the
blend as premultiplied source-over and the order as furthest first, and both are what the
new blend removes. Its scenario **The order runs from the furthest to the nearest** goes
with it, because the selection no longer orders by range.

**Migration**: The requirement **The nebulae composite without an order** replaces it. It
keeps the two light scenarios word for word, so no browser test moves with the rename. It
replaces the order scenario with two of its own: one that reads the selection order and
one that reads the frame across an order flip.
