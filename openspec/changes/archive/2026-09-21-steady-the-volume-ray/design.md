## Context

See `proposal.md` for the fault and the readings. What matters here is the shape of the
code around it.

Three places in the renderer take a pixel back to a ray with the inverse of the view and
projection matrix, and they do it in two different ways.

| Where                   | How it builds the ray                              | Steady? |
| ----------------------- | -------------------------------------------------- | ------- |
| `grid.frag`             | the near point alone, per fragment                  | yes     |
| `region-composite.frag` | far minus near, per fragment                        | yes     |
| `volume.vert`           | far minus near, per **vertex**, then interpolated   | **no**  |

The grid pass already carries the comment this change follows: "The camera is the origin
of this frame, so the point on the near plane is the direction of the ray through this
pixel."

`region-composite.frag` uses the far-minus-near form and is safe, which was measured
rather than assumed: a `float32` emulation of its plane-range calculation over near
planes from 1.80 to 2.00 light years holds the range to 1e-10 relative of the `float64`
answer. Its far point and its near point are two points on one line through the origin,
so the error in the far point's `w` is a scale on the whole vector and it cancels out of
the plane intersection. Nothing in it is interpolated. This change leaves it alone.

The CPU path, `rayDirectionFrom` in `src/camera/projection.ts`, also uses far minus near.
It is safe too, and again measured: the matrix is `float32`, because gl-matrix builds
`Float32Array`, but the arithmetic on top of it runs in `float64`, and the direction
holds to 2e-6 degrees. This change leaves it alone.

So the fault has one site.

## Goals / Non-Goals

**Goals:**

- The drawn volume depends on the camera and on nothing else that the camera does not
  move.
- The fix uses a rule and a file this codebase already has, so the change removes code
  rather than adding it.
- The measurement that found the fault becomes the test that holds it shut.

**Non-Goals:**

- No change to the near plane rule, the far plane, the sample count, or any look
  constant.
- No change to `region-composite.frag` or to `rayDirectionFrom`. Both were measured and
  both are steady. Changing a correct thing to match the fixed thing is a second change
  and it carries its own risk of moving the picture.

## Decisions

### The ray comes from the near point, unprojected per fragment

Why the near point and not far minus near: the far point's `w` is a cancellation. The
`w` row of the inverse matrix reads about `(-5.1e-9, 3.7e-9, -0.2631574, +0.2631584)`
where the first two entries should be zero, and at the far plane the last two cancel
down to `1/f`, which is 1e-6. At a corner the normalised device coordinate reaches 3, so
the rounding noise is about 1.5e-8 against that 1e-6, and each corner's far point
carries a scale error of 1 to 3 per cent, and a different one at each corner. At near
plane 1.88 the three corners measure -0.33, -1.27 and +1.10 per cent, so they differ by
2.4 points. The near point's `w` is the **sum** of the same two large entries, about
0.526, so the same noise is 3e-8 relative to it. Measured against the `float64` answer
over near planes from 1.80 to 2.04 light years, the near point form holds every
direction to **3e-6 degrees**, while the present form reaches **2.6 degrees**. Zeroing the two noise
entries in the emulation takes the present form to 2e-6 degrees at every near plane,
which is what identifies them as the fault.

Why per fragment and not per vertex: not because interpolation is unsafe in itself. A
per-vertex near point would be equally steady, because the scale error the interpolation
mixes is the far point's and the near point does not carry it. The per-fragment form is
chosen because it is the idiom already in this tree, `grid.frag` holds it, it lets the
volume pass share the full-screen vertex shader below, and it costs nothing that can be
measured.

### The pass takes the shared full-screen vertex shader, and `volume.vert` is deleted

`shaders/fullscreen.vert` already exists and seven passes already share it. It emits
`vTexture` over 0 to 2 for the same three corners, and `vTexture * 2.0 - 1.0` is the
pixel's normalised device coordinate. The multiply and the subtract are each correct to
one unit in the last place, which no measurement here can see. The volume pass therefore needs no vertex shader of its own, and
`volume.vert` goes away.

Sharing the shader couples the volume pass to seven others. The requirement is written
around that: it binds what the **pass reads**, not what the shared shader emits, so a
later pass may add a varying of its own there without breaching it.

Alternatives considered:

- **Copy the shape of `grid.vert`**, which emits `vNdc` directly. Rejected: it would
  leave a third near-duplicate full-screen vertex shader in the tree when a shared one
  already covers the job. The result is the same picture and one more file.
- **Shrink the far plane.** Rejected. A far plane of 200,000 light years still leaves
  the reconstructed direction moving over a 0.14 degree range in the same emulation, so
  it hides the fault rather than removing it. It would also change clipping.
- **Keep far minus near and only move it to the fragment shader.** It measures clean,
  because one pixel's far point carries the scale error as a pure scale and a scale does
  not turn a ray; only mixing three differently scaled corners does. Rejected: it keeps a form that is one refactor
  away from breaking again, and the tree holds the better idiom.
- **Hold the near plane fixed at 10 light years.** Rejected. It hides the zoom symptom
  and leaves the orbit symptom, and it reopens the clipping problem the near plane rule
  was written to solve.

### The cost is one matrix product per fragment

The pass draws at half resolution and marches 96 samples per fragment. At 1920 x 1080
that is 518,400 fragments, about 50 million volume samples and about 500,000 new matrix
products a frame. The **Frame budget** requirement of `far-view-rendering` is what says
the pass still fits, and its test runs unchanged.

### Two tests, because they fail for different reasons

The unit test is a `float32` emulation of the reconstruction, in the shape
`src/camera/precision.test.ts` already uses for the vertex transform. It is fast,
deterministic, and it says which rule is in use. The browser test reads the drawn frame
on the card, and it is the one that says the user sees no flicker. A unit test alone
could pass against a shader that does something else, so both are needed.

### Where the 0.002 bound comes from, scenario by scenario

| Sweep                      | Worst step today | Bound | Margin under today | Honest signal per step |
| -------------------------- | ---------------- | ----- | ------------------ | ---------------------- |
| Zoom, 0.005 ly             | 0.0648           | 0.002 | 32x                | 0.000007, measured     |
| Pitch, 0.005 degrees       | 0.0101           | 0.002 | 5.0x               | ~0.0003, estimated     |
| Yaw, 0.005 degrees         | 0.0077           | 0.002 | 3.9x               | ~0.00006, estimated    |
| Held near plane, 0.1 ly    | 0.0943 of range  | 0.002 | 47x                | 0, by construction     |

The zoom row has a control: the same sweep with the near plane held reads a worst step
of 0.000007, so the legitimate signal there is measured, not guessed.

The two orbit rows have no such control, because holding the near plane does not
neutralise a rotation of the view matrix. Their honest signal is estimated instead: a
0.005 degree step of a 60 degree field over 1000 rows moves the picture 0.083 of a row,
and the band the measure reads falls about 0.003 of luminance per row at the top of the
frame, so a legitimate step is about 0.00025. The yaw figure is smaller because a yaw
step moves the picture sideways and the band is a horizontal gradient: the measure
averages a whole 1600 pixel row, so a sideways move of a fraction of a pixel nearly
cancels. The bound therefore sits about 8 times
over the honest signal and about 4 to 5 times under the present failure. That is
narrower than the zoom row and it is stated here rather than implied. Task 2.4 records
the measured post-fix worst step of all three sweeps, so the margin that actually
results is on the record.

## Risks / Trade-offs

- **The corrected ray moves the picture, so `e2e/look.spec.ts` will fail somewhere.**
  Mitigation: read every failure before touching anything, against the right yardstick.
  The yardstick is **not** the 2.6 degrees of the reported view. Every view that suite
  reads sits at 100 light years or more, where the near plane is pinned at 10 and the
  present error is 0.002 to 0.16 degrees, which is 0.02 to 1.9 pixels of 720 rows and is
  a position-dependent warp rather than a rigid shift. A reading that moves by the size
  of a one to two pixel warp is the change working. A reading that moves more is a
  second fault and it stops the work. The proposal names the three scenarios at risk.
- **Re-recording the baseline image hides a second fault if it is done first.**
  Mitigation: the numeric readings are read and answered before the image is touched,
  and the task list puts them in that order.
- **The emulation in the unit test can drift from the GLSL.** Mitigation: the browser
  test reads the real shader on the real card, and it is the scenario that states the
  user-visible bound.
- **The bound is read at 1600 x 1000.** A different canvas gives a different mean. The
  scenarios state the canvas size for that reason.

## Migration Plan

None. The change is one shader file changed, one deleted, one import moved, and their
tests, inside one package. There is no data, no stored state and no host-visible
surface. Rollback is a revert.
