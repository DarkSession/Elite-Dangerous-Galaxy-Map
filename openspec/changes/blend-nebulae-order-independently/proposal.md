## Why

The nebula pass composites with premultiplied source-over, which depends on the draw
order, so the selection sorts the records furthest first. The sort key is the range to
the record's centre. Two records swap rank when the camera crosses the plane halfway
between their centres, and the frame changes in one step at that crossing.

The step is measured. A probe took 6,480 camera windows over 9 viewpoints, each window
0.004 degrees wide. The camera orbits the cursor, so a window turns it and also carries
it sideways: at 3,000 light years the translation is 0.21 light years, and a record at
range `r` moves by `turn * (1 - 3000 / r)`. That is nothing at the cursor's own range, a
twentieth of a pixel far beyond it and about a third of a pixel at 400 light years. A
window therefore reads the motion plus any step, and the worst pair of a sweep is a step
only where it stands above what the motion alone gives. Five of the nine are below. **Every figure in
this section is a probe reading and none of it is in the tree**; the probe was a throwaway
spec file. Task 2.1 puts the Orion sweep in the suite and task 2.1a re-takes its two
figures. The other four rows are not reproduced, and the argument does not need them:

| viewpoint | windows with a step above 8 | worst step | pixels it moved |
| --- | --- | --- | --- |
| Barnard's Loop, d=120 | 96 of 720 | 23 | 287 |
| Barnard's Loop, d=600 | 227 of 720 | 35 | 136 |
| Barnard's Loop, d=2000 | 242 of 720 | 35 | 185 |
| the core, d=600 | 263 of 720 | 27 | 336 |
| Orion, d=3000 | 167 of 720 | **71** | 159 |

The step is the sum of the three channel differences of one pixel, out of 765. The floor
with no flip read 3 to 7 over the nine viewpoints, which is the camera move and the
half-resolution upsample. **That figure is a typical window and not a bound on the worst
pixel**: the same sweep with no order dependence at all reads a worst pair of 26 at the
Orion viewpoint, against a mean window of 6.93. So the
worst flip in the set changes a pixel by about 9 percent of one channel, over 159 pixels
of a 921,600-pixel frame, and the usual flip changes it by 3 to 5 percent.

The artefact is therefore frequent and small. This change is worth making only if the
blend that removes it costs less than the flip it removes, and the proposal is built
around measuring that rather than assuming it.

The sort has a second cost that no camera shows. It is an ordering constraint on the draw
loop, and it is the reason each record is its own draw call cannot later become one
instanced call. Order independence is a precondition for that change, not part of it.

## What Changes

- The nebula pass draws into **an accumulation target of its own**, not into the
  half-resolution target the volume and the clouds already wrote.
- The blend becomes **additive in colour and multiplicative in alpha**:
  `blendFuncSeparate(ONE, ONE, ZERO, SRC_ALPHA)`. The colour channels accumulate the sum
  of the emissions and the alpha channel accumulates the product of the transmittances.
  The shader writes the transmittance where it writes one minus the transmittance today.
- **One composite draw** then reads the accumulation target and applies it to the
  half-resolution target with the source-over blend the renderer already uses. The result
  is the emission sum plus the transmittance product times what the scene held.
- **The furthest-first sort goes.** `selectNebulae` keeps the largest-first sort the
  covered-area budget needs and drops the second sort by range. The draw order stops
  changing the frame.
- The spec's requirement that the pass draws from the furthest to the nearest is replaced
  by a requirement that the frame does not depend on the order. Two scenarios read it: one
  draws the same camera with the record order reversed and holds the two frames together,
  which is the statement of the requirement; and one sweeps the camera and holds a
  **measured continuity bound**, which reads the motion as well as the step.
- The renderer gains a **probe that reverses the draw order**, off in the map and out of
  the supported surface, so the first of those two scenarios can be written at all.
- The spec gains a second bound, on the artefact this change **introduces**: the light at
  three named cameras, which rises where records overlap. Task 4.2 measures the rise and
  writes the figure into the test, so the overlap cannot grow later without a reading
  saying so.
- **The change does not land** if that rise is above a tenth of the light the camera drew
  before, or if any committed reading of `e2e/nebulae.spec.ts` breaks its bound. The tenth
  is a stated judgement about how much brightening the look can take. It is not a
  measurement, and the proposal does not pretend the step it removes and the rise it adds
  are the same quantity — they are not, and only the second of the two is static.

### What the new blend gets wrong

Source-over drawn in the right order attenuates a nebula by every nebula in front of it.
The new blend does not: each record's emission reaches the frame unattenuated by the
others, and only the background is attenuated by all of them. Two overlapping records are
therefore brighter than they are today.

That error is not small in principle. The probe read **1.84 screen areas** of coverage
over 124 records at Barnard's Loop at 120 light years, so the records do overlap there.
That is a probe reading and task 2.4 re-takes it beside the before-frames. The error is
bounded by the light one record removes from another, and no task assumes its size.

Source-over is not right for overlap either. Two boxes that interpenetrate have no correct
per-record order, and the spec already states that the pass does not resolve the overlap.
The trade is a static error that does not move against a moving error that does. Which of
the two is worse is a judgement and not a reading, and the change states the two numbers
side by side so a reader makes it rather than takes it.

### Non-Goals

- The march, the transfer tables, the art, the record file and the selection floor.
- The covered-area budget, the zoom band and the fades.
- Instanced drawing of the records. This change removes the constraint that blocks it and
  stops there.
- Weighted blended order-independent transparency. See design.md.

## Capabilities

### Modified Capabilities

- `nebulae`: the pass composites through an accumulation target with an order-independent
  blend, the draw order stops being part of the contract, and the spec gains a measured
  bound on the step at a flip. **A nebula composites over the scene** is removed and **The
  nebulae composite without an order** takes its place, because the old name states the
  order the change removes and its order scenario goes with it. **The nebulae join the
  half-resolution target** is modified to say where the accumulation target sits in the
  pass order.

## Impact

**Scale.** The set is 33 assets and 358 records, and the covered-area budget lets the
selection reach 4 screen areas. The committed reading in `e2e/nebula-cost.spec.ts` is 120
records drawn at 1.56 covered areas. The probe read 137 records at the core at 600 light
years and 124 at Barnard's Loop at 120, which is a probe reading like the rest of this
section; task 2.4 re-takes the second one.

**Cost.** One more half-resolution `RGBA16F` target: 640 by 360 at 1280 by 720, which is
1,843,200 bytes of video memory. One clear and one full-screen draw of 230,400 fragments
a frame. Neither is predicted here. Task 2.2 reads the pass cost before the change and task 4.4
reads it after, at the cameras `e2e/nebula-cost.spec.ts` already uses, on the hardware
renderer the suite asserts.

**Code.** `src/render/nebula-pass.ts` (the accumulation target, the clear, the blend state,
the draw loop and the composite draw), `src/render/shaders/nebulae.frag` (the alpha it
writes), `src/render/nebula-slot.ts` (`NebulaFrame` gains the number format of the target
and the order probe), `src/scene-data/nebulae.ts` (the range sort goes),
`scripts/build-nebula-fixture.mjs` (its copy of the sort and its hand-written composite),
`e2e/fixtures/` (the two `.bin` files it rebuilds), and the unit and browser tests that
read any of them, named in the tasks. A composite fragment shader joins
`src/render/shaders/`; its vertex stage is `fullscreen.vert`, which the other full-screen
passes already use. The order probe runs from `src/render/global.ts` through
`src/app/main.ts`, `src/app/create-map.ts` and `src/render/renderer.ts` to the frame, in
the manner of `setNebulaOcclusion`.

**Three tests the task list does not name, which the change moves as well.**
`src/render/renderer.test.ts` reads the framebuffer the nebulae draw into, and that is the
composite's framebuffer now and not the first record's, so the test names the composite
and its fake context answers `getParameter(FRAMEBUFFER_BINDING)` with the framebuffer it
holds. `src/render/nebula-pass.test.ts` holds a two-record set of one radius at 400 and
200 light years and reads them furthest first, which the largest-first sort reverses.
`src/render/nebula-march.test.ts` reads the output alpha, so it reads the transmittance
now, and its two hand-computed constants become their complements: 0.43896963 becomes
0.56103037 and 0.22833131 becomes 0.77166869.

`src/render/renderer.ts` gains the order probe named above: `nebulaOrderReversed`,
`setNebulaOrderReversed` and the `floatTarget` it puts in the frame. It gains no drawing:
the target, the clear and the composite all live in the pass, because the import rule of `src/nebulae/` keeps the nebula graph out
of the build of a host that asks for no nebulae, and a composite shader in the renderer
would sit in the main chunk. `src/render/buffers.ts` needs nothing new: `createRenderTarget`
already makes what the pass wants.

**Published surface.** `NebulaFrame` gains two members: the number format the renderer
built its own target with, so the pass can match it, and the order probe, which the map
leaves false and one browser test sets. The type is reachable from
`NebulaSource` and therefore from `dist/types`. No host writes a `NebulaFrame` — the
renderer builds it — so nothing outside the package breaks. `NebulaSource`, the `./nebulae`
subpath and every other published type keep their shape.

**What cannot move.** The committed baseline image of `e2e/look.spec.ts` is taken at
60,000 light years, where the zoom band gives every record weight 0 and no nebula draws.
It does not move.

A frame that draws **one** record is also identical under either blend, because the sum of
one emission and the product of one transmittance are that record's own two terms. That
identity holds on the floating point target; on the `RGBA8` fallback the two terms are
quantised in a target of their own first. **No committed reading uses it.** The two CPU
fixture comparisons centre one asset but draw 105 and 109 records, which
`e2e/fixtures/nebula-fixtures.json` states and the browser test asserts, so they are not
single-record frames.

**What can move.** Every reading that draws a view inside the band. The light there can
rise and cannot fall, because each record's alpha is held from 0 to 1, so every
attenuation the old blend applied was at most 1.

**The CPU reference moves with it.** `scripts/build-nebula-fixture.mjs` holds a second
copy of the selection and composites the records source-over by hand, and the two
committed `.bin` files are that composite. They are rebuilt in group 3, at the same time
as the pass, or the fixture comparison reads the blend change as a march error, which is
the one thing that test exists to rule out. Task 4.6 then reads the rebuilt comparison
against the same 0.02 and 0.01 bounds.

**Sequencing.** This change builds on `replace-nebula-sprites-with-volumes`, which is
archived, so `openspec/specs/nebulae/spec.md` already carries the requirements this delta
modifies. It does not depend on `store-nebula-volumes-as-slice-arrays` and does not
conflict with it: that change moves the texture target and this one moves the blend.
Whichever lands second rebases onto the other in `src/render/nebula-pass.ts`.
