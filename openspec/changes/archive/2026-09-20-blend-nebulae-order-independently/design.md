## Context

See [proposal.md](proposal.md) for the motivation and the measured step at a flip.

Three facts of the tree shape the design.

**The pass writes into a target that already holds the scene.** The volume and the cloud
sprites draw into the half-resolution target, and the nebula pass blends over what they
left. The emission and the background are mixed in the same three channels from the first
record onward, so nothing downstream of that first blend can separate them.

**The shader already computes both terms the new blend needs.** The march accumulates a
per-channel transmittance and an emission, and writes
`vec4(emission * vTransmittance * vWeight, (1.0 - transmittance.a) * mean * vWeight)`,
where `vTransmittance` is the occlusion from the galaxy dust and `vWeight` the fade. The
alpha it writes is one minus a transmittance, so the transmittance is the same expression
without the subtraction. The colour channels already carry the march's own transmittance,
applied per step inside the sum, and nothing multiplies them by it again.

**Source-over with the right order is already exact for the background.** Drawing A then
B gives `Eb + Tb * Ea + Ta * Tb * Bg`. The background term `Ta * Tb * Bg` does not depend
on the order at all. Only the emission terms do. The flip is therefore a change in how
much one nebula dims another, and never a change in how much the pair dims the sky.

## Goals / Non-Goals

**Goals:**

- A frame that does not change when two records change rank.
- One composite draw a frame, whatever the count of records.
- The same blend on a card with a floating point target and on one without.

**Non-Goals:**

- An exact composite of two overlapping nebulae. No per-record order gives one, and this
  design does not try. See the spec.
- A second pass over the records, a depth pre-pass, or per-fragment sorting.
- Any change to the march, the transfer tables, the selection floor or the budget.

## Decisions

### Accumulate emission and transmittance separately, then composite once

**Chosen:** the pass draws into an accumulation target cleared to `(0, 0, 0, 1)`, with
`blendFuncSeparate(ONE, ONE, ZERO, SRC_ALPHA)`. The colour channels sum the emissions and
the alpha channel takes the product of the transmittances, because
`dst.a = 0 * src.a + src.a * dst.a`. One full-screen draw then applies
`scene = accumulated.rgb + accumulated.a * scene`.

- _Why:_ it is the exact answer for records that do not overlap, it is one draw call more
  than today, and it needs no sort. The whole ordering question leaves the pass.
- _Why a separate target is unavoidable:_ the sum of the emissions and the product of the
  transmittances have to stay apart until the last step, and the half-resolution target
  has the background in the same channels from the first record onward. There is no blend
  equation over one target that keeps them apart.
- _Rejected:_ weighted blended order-independent transparency. It weights each fragment by
  its depth, so a nearer record dominates and the overlap error shrinks. It costs a second
  accumulation target, it needs a weight function tuned against this art, and the weight is
  a new look control with no reading behind it. The error it would reduce is one this
  change measures first. If task 4.2 says the overlap error is what blocks the change, this
  is where to look next.
- _Rejected:_ keeping source-over and stabilising the sort. Hysteresis delays a flip and
  does not remove it, and a delayed flip is the same step at a different camera angle.

### Group 1 keeps the frame by changing the alpha factor, not the clear

**Chosen:** the accumulation target clears to `(0, 0, 0, 1)` and the composite writes
`vec4(accumulated.rgb, 1 - accumulated.a)` from the first task onward, and neither changes
again. Group 1 draws the records with
`blendFuncSeparate(ONE, ONE_MINUS_SRC_ALPHA, ZERO, ONE_MINUS_SRC_ALPHA)`, which is
source-over in the colour channels and `dst.a = (1 - src.a) * dst.a` in the alpha channel.
The alpha channel therefore holds the product of one minus the alphas, the composite turns
it into the same attenuation source-over would have applied, and the frame is unchanged.

- _Why:_ the clear and the composite are the two pieces the whole scheme rests on, and a
  group that changed them and then changed them back would make the group 1 commit a
  different shape from the group 3 commit. With this split, group 3 changes one blend call
  and one shader line and nothing else.
- _Why not the obvious form:_ clearing to `(0, 0, 0, 0)` and drawing with plain
  `blendFunc(ONE, ONE_MINUS_SRC_ALPHA)` looks simpler, but `blendFunc` sets all four
  channels, so from a clear of 1 the alpha channel reads
  `src.a + (1 - src.a) * 1 = 1` after every record. The composite would then write an alpha
  of 0, the scene would never be attenuated, and a dark nebula would stop dimming. The
  alpha factor has to be separated in group 1 as well; only the colour factor waits for
  group 3.

### The pass saves and restores the framebuffer binding

**Chosen:** the draw reads `FRAMEBUFFER_BINDING`, binds its own target, and binds the
saved value back before the composite.

- _Why:_ `NebulaDraw.draw` takes a frame and no framebuffer. The renderer leaves the
  half-resolution target bound and calls the draw, which is a contract this change should
  not widen. Reading the binding keeps the pass self-contained and keeps `NebulaFrame` to
  one new member, the number format.
- _Rejected:_ a framebuffer on `NebulaFrame`. It puts a WebGL handle in a published type
  for no gain, and the renderer would then have to pass what it had already bound.
- **The read comes before the target is built, and the order is not free.**
  `createRenderTarget` binds the new framebuffer to attach its texture and then binds
  **null**, so a draw that built its target first and read the binding second would read
  null on the frame that built it. The composite of that frame would then go to the
  canvas and not to the half-resolution target. The pass reads the binding as its first
  act, and two unit tests hold the order: one over the pass's fake context, and one over
  the renderer's, whose fake answers `getParameter(FRAMEBUFFER_BINDING)` with the
  framebuffer it holds rather than with a number.

### The CPU reference composites the way the pass does

**Chosen:** `scripts/build-nebula-fixture.mjs` drops its own range sort and composites
additively, and both `.bin` fixtures are rebuilt in the same commit as the shader.

- _Why:_ the fixture frames draw 105 and 109 records, not one. The reference composites
  them source-over by hand, so an unchanged reference read against the new pass would
  report the blend change as a march error. The test exists to catch a march error, and a
  reference that moved for another reason makes it useless in both directions.
- _On what the reading then proves:_ less than it did, for one run. The rebuilt reference
  and the new pass change together, so the comparison cannot say the frame is unchanged. It
  says the march still agrees with an independent statement of the same integral and the
  same composite, which is what the requirement asks of it. The check that the frame did
  not change elsewhere is task 4.3, over the readings of `e2e/nebulae.spec.ts`.
- _On what the two RMSE bounds do not guard, which is sharper than the paragraph above:_
  the rebuilt reference sums the emissions over black and drops the transmittance it
  carried, and the browser frame the fixture is read against also draws on black. The
  accumulated transmittance therefore multiplies zero on both sides. The comparison is
  blind to the output alpha — the one expression this change moves — and that, and not the
  composite in general, is why both readings fell: 0.0083255 to 0.0018745 for
  `barnards-loop` and 0.0058001 to 0.0036028 for `cats-eye`. The bounds guard the march
  and the emission sum. They do not guard the transmittance.

  The transmittance keeps its coverage in two other places. The 33-asset range test in
  `src/render/nebula-march.test.ts` reads the output alpha of every asset against a
  hand-computed pair of constants, which is why those two constants became their
  complements. And the browser test **a dark nebula behind the core stops cutting a hole**
  draws a record of negative extinction over the lit core, where the transmittance is the
  only thing the frame shows.
- _Rejected:_ keeping the old reference and widening the bound. That hides the size of the
  change in the bound and leaves the next reader unable to tell a march error from this
  one.

### The shader writes the transmittance, not one minus it

**Chosen:** the fragment shader's alpha becomes
`1 - (1 - transmittance.a) * mean * fade`, which is the transmittance of the record.

- _Why:_ the blend multiplies by `SRC_ALPHA`, so the alpha channel has to carry the factor
  the background is multiplied by. Writing it in the shader keeps the one expression in one
  place, and the composite then reads a number that means what its name says.
- _On the range:_ a unit test already holds the current alpha inside 0 to 1 for every
  asset, which puts the new alpha in 0 to 1 as well. Five assets carry a negative
  extinction channel and the march has no upper clamp, so that test is what the range rests
  on. It stays, and it is the reason the product of the transmittances cannot run away.
- _Rejected:_ writing one minus the transmittance and using `ONE_MINUS_SRC_ALPHA` in the
  alpha factor. That gives `dst.a = (1 - src.a) * dst.a`, which is the same product written
  the other way round, but the composite then needs the subtraction instead, and the value
  in the target means neither one thing nor the other while it accumulates.

### The accumulation target follows the half-resolution target

**Chosen:** the same size and the same `float` flag, through the existing
`createRenderTarget`.

- _Why:_ the pass is written against the half-resolution target's size today, and the
  boxes it marches are projected into it. A different size would move every reading the
  cost tests hold. The `float` flag keeps the card without floating point targets on one
  code path.
- _The cost on the non-floating path:_ `RGBA8` quantises the transmittance product to 8
  bits, and a frame drawing 124 records multiplies 124 such numbers. The error compounds.
  The argument that this change does not make it worse is that source-over writes the same
  quantised product into the same 8 bits step by step today. **That is an argument and not
  a reading.** No committed test exercises it: `e2e/00-renderer.spec.ts` asserts
  `EXT_color_buffer_float` on every run, so every target in the suite is `RGBA16F`, and the
  browser test that refuses the compressed-texture extensions changes the format of the
  **art** and not of the target. Reading it would need a test that stubs
  `EXT_color_buffer_float` to null, which this change does not add.

### The order probe reverses the draw and nothing else

**Chosen:** `NebulaFrame` gains `reverseOrder`, the pass draws `selection.instances`
backwards when it is set, and the switch runs from `src/render/global.ts` through
`src/app/main.ts`, `src/app/create-map.ts` and `src/render/renderer.ts`, in the manner of
`setNebulaOcclusion`. The map draws with it false.

- _Why:_ the requirement is that the frame does not depend on the order. A test can only
  state that by drawing the same frame under two orders, and nothing else in the map can
  change the order of a selection.
- _Why the frame and not a global:_ the pass reaches the map through `NebulaFrame` alone.
  A module-level switch would need a setter on the `./nebulae` subpath, which is the
  published surface, and a read of `window` inside the draw loop would put an untyped
  back door in the render path.
- _The cost:_ `NebulaFrame` is reachable from `NebulaSource`, so this second member is in
  `dist/types` beside the first. No host writes a `NebulaFrame` — the renderer builds it —
  so nothing outside the package breaks, but the member is a probe sitting in a published
  type and it is named and documented as one.
- _What the probe cannot reach:_ the bound is one step of the display range and not zero,
  because `RGBA16F` addition is not associative. The reading is in the spec's scenario.

### The composite is its own fragment shader, over the shared vertex stage

**Chosen:** a two-line fragment shader in `src/render/shaders/`, over the
`fullscreen.vert` the other full-screen passes use, and the draw in
`src/render/nebula-pass.ts`.

- _Why:_ the pass owns its target and its composite, so the renderer keeps one call and
  the whole graph stays behind `src/nebulae/`. The import rule that keeps the nebula art
  out of a host that asks for no nebulae is what decides this: a composite shader in the
  renderer would be in the main chunk.
- _Why the vertex stage is shared:_ the first draft copied `fullscreen.vert` to a
  `nebula-composite.vert` that differed in its comment alone. Sharing it costs the entry
  chunk nothing, because six core passes already import that file: the string moves into
  the chunk both entries load, and `dist/index.js` falls by 310 bytes and `dist/nebulae.js`
  by 296 while the shared chunk gains 339.
- _Rejected:_ reusing `src/render/composite-pass.ts`. It reads the scene target and tone
  maps it, which is a different draw at a different place in the frame.

## Risks / Trade-offs

- **The overlap error may be larger than the step it removes.** → This is the risk that
  decides the change. The probe read 1.84 screen areas over 124 records at the near view, so
  the records do overlap there; task 2.4 re-takes it, and no task assumes it. Task 2.4 captures the frames before and task 4.2 reads the rise against
  them, per camera. The gate has two halves. The committed readings of `e2e/nebulae.spec.ts`
  either hold or they do not, which is task 4.3; and the rise itself must stay under a
  tenth of the light the camera drew before, which is task 4.2 and which the spec states as
  a scenario. That tenth is a judgement, written down as one. Task 4.5 is the abort branch.
  The committed readings are a weak proxy on their own — most of them assert that light
  rose, so a blend that adds light passes them harder — which is why the rise has a bound of
  its own.
- **The step may not fall to the floor.** → The spec bounds it at 30, which is the worst
  pair the sweep reads with no order dependence left in the blend. Task 4.1 reads the same
  sweep the probe ran.

  **The first draft of this design bounded it at 8, and that was wrong twice over.** The
  probe reported a no-flip floor of "3 to 7", and that figure is a **median of the worst
  pixel of each window**, not a floor on the worst pixel of 720 windows; a median of maxima
  bounds nothing. And the sweep's premise, that 0.004 degrees moves the image about a
  twentieth of a pixel, holds only for a record far beyond the cursor: the camera
  **orbits**, so it translates as well as turns, and a record at range `r` moves by
  `turn * (1 - d / r)` for an orbit radius `d`. At 400 light years inside a 3,000 light
  year orbit that is about a third of a pixel, seven times the figure the premise used. The
  implementation reads a worst pair of 26 with the blend order independent, against a mean
  window of 6.93 — the 6.93 is the "3 to 7" the probe meant.

  The lesson for the next reader: a sweep of a moving camera cannot state order
  independence, because it always carries the motion. The scenario **The frame does not
  change when the order is reversed** states it instead, by drawing one camera twice and
  reversing the record order between the two. The sweep stays beside it as the continuity
  reading, with a bound that falsifies the 71 the ordered blend gives.
- **One more full-screen draw and one more target.** → 230,400 fragments and 1,843,200
  bytes at 1280 by 720. The pass already reads far more than that per frame in the march,
  so the composite should not show. Task 2.2 takes the cost before and task 4.4 after, at the cameras
  the cost spec already uses, each against the bound that spec states for it.
- **Every reading of a view inside the band moves.** → The committed baseline image is
  safe, because it draws no nebula at 60,000 light years. Nothing else is: the two CPU
  fixture frames draw 105 and 109 records, so the one-record identity covers no committed
  reading. The light can rise and cannot fall, because each record's alpha is held from 0
  to 1. Task 2.3 enumerates the readings, task 4.3 reads them again, and **no bound moves
  to make a test pass** — a broken bound is the abort signal of task 4.5.
- **The one-record identity is a floating point claim.** → On the `RGBA8` fallback the
  emission and the alpha are quantised into a separate target before the composite, so
  "identical" becomes "identical to the precision of that target". Nothing rests on it: no
  committed reading draws one record, and the suite runs on the floating point path.
- **The glow reads a different image.** → The glow reads the half-resolution target after
  the composite, so it reads the same kind of image it reads today. Brighter overlaps make
  a brighter halo, which is the overlap error again and not a second effect.

## Migration Plan

1. Add the accumulation target, the composite shader and the composite draw, with the pass
   still blending source-over into the accumulation target and the sort still in place.
   The frame is unchanged, which is what makes this step safe to check on its own.
2. Add the sweep test of the spec's continuity scenario and run it against that tree. It
   fails, and the reading it fails with is the before figure the proposal states.
3. Change the blend and the shader's alpha, and remove the range sort. The sweep passes.
4. Read the overlap difference and the pass cost. Either the change lands or step 5 runs.
5. The abort branch: revert the commits of steps 1 and 3 together, which takes the
   accumulation target, the composite and the blend out in one move. The target is one
   extra draw for no gain once the blend goes back, so it does not stay. Keep the sweep
   test of step 2, marked as expected to fail with the reading that stopped the change,
   because that is the measurement a later attempt starts from.

**Rollback** after the change lands is the same revert. No published type, record file or
asset moves, and `NebulaFrame` loses the member it gained, so nothing outside the package
notices.

## Open Questions

- Whether the accumulation target wants `NEAREST` filtering. The composite reads it at
  one texel per fragment, so the filter cannot matter, but the existing helper sets
  `LINEAR` and this design does not change the helper. It changes no requirement and no
  task.
