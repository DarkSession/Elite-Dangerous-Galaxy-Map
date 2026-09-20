## MODIFIED Requirements

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
