## ADDED Requirements

### Requirement: The material in front of a nebula attenuates it

The pass SHALL scale each sprite by the transmittance of the density volume between the
camera and the record's centre. A nebula the camera sees through the bulge SHALL
contribute less light to the frame than the same nebula with nothing in front of it.

**One transmittance per sprite.** The transmittance SHALL be taken at the record's
centre and applied to the whole sprite. It SHALL NOT vary across the sprite.

**The same rule as the volume.** The transmittance SHALL come from the **same rule** the
volume pass accumulates its optical depth with, over the camera-to-centre segment: the
decoded density, the surface detail grid, the two-slope compression, the fade at the galactic rim, the fade
by height above the mid-plane and the dust weights. The absorption is a uniform both
passes are given rather than a constant the rule states. One source
SHALL state that rule and both the volume pass and the nebula pass SHALL read it. Neither
SHALL hold a second copy of it. The two passes take a **different number of steps** over
a different segment, so the two optical depths are not the same number. What this
requirement fixes is the rule, not the quadrature; the design owns the step count.

**Colour and alpha both.** The transmittance SHALL scale the sprite's colour channels
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
switch is off, the transmittance SHALL be `1` for every sprite.

#### Scenario: A nebula behind the core dims

- **WHEN** the browser test opens a view inside the zoom band with the core between the
  camera and a named nebula, and reads the same block three times: with the nebula pass
  off, and with the pass on at the occlusion constant 1 and at 0
- **THEN** the sprite's own contribution — the block with the pass on, less the block
  with the pass off — is smaller in magnitude at 1 than at 0.

  **The reading is the sprite's contribution and not the block itself**, because through
  the core the block cannot fall. A pixel holds `C + (1 - a)B` at 0 and
  `T*C + (1 - a*mean(T))B` at 1, where `C` is the sprite's light, `a` its alpha and `B`
  the background. The block falls only where `C > a*B`. Through the core `B` sits near
  the top of the tone map, so every sprite there reads as a hole and not as a source, and
  the "Colour and alpha both" clause above makes that hole shallower as the transmittance
  falls. A block reading would therefore **rise**, and the first draft of this scenario
  asserted that it falls. The contribution states the attenuation for a source and a hole
  alike, and it falls to 0 as the transmittance does.

#### Scenario: A nebula with little in front of it barely changes

- **WHEN** the browser test opens `BRIGHT_VIEW`, the camera
  `#c=624.4,-425.9,-1229.5&d=6000&p=35&y=0` that `e2e/nebulae.spec.ts` already names, and
  reads the sprite with the occlusion constant at 1 and at 0
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

- **WHEN** the browser test reads a sprite through the bulge with the occlusion constant
  at 1 and at 0, and takes the ratio of the blue channel to the red channel for each
- **THEN** the ratio at 1 is below the ratio at 0

#### Scenario: A dark nebula behind the core stops cutting a hole

- **WHEN** the browser test reads the pixels of a dark nebula that sits behind the core,
  with the occlusion constant at 1 and at 0
- **THEN** the reading at 1 is above the reading at 0, because the sprite's alpha is
  scaled by the same transmittance

#### Scenario: The extinction rule is written once

- **WHEN** a unit test reads the source the volume program compiles and the source the
  nebula program compiles
- **THEN** both hold the shared rule, neither holds the marker the rule replaces, and the
  rule text in both is the text of the one file that states it

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
  the occlusion constant at 1, and a drawn-sprite count at or above the floor **this change
  measures and writes into the test**. That file tracks `mostNebulae` today and asserts only
  that it is above 0, so it takes the stronger assertion as part of this change. The floor
  is a measured reading, not an estimate. The near end of the zoom band is open, so the
  near distances draw at full weight and the floor is set by a near view; the count stays
  below `NEBULA_MAX_DRAWN` because the size floor admits at most 184 records
- **THEN** the frame interval holds the budget `far-view-rendering` states

#### Scenario: The vertex stage carries the volume sampler

- **WHEN** the browser test starts the map on the hardware renderer, logs
  `MAX_VERTEX_TEXTURE_IMAGE_UNITS` as a diagnostic, and compiles the nebula program from
  the composed sources
- **THEN** the program links without an error. The assertion is the link, not the count:
  WebGL2 guarantees at least 16 vertex texture units, so a count check cannot fail on any
  conforming implementation
