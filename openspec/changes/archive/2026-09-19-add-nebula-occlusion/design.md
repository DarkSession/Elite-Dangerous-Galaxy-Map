## Context

See proposal.md — Why.

Four facts of the tree shape this design.

1. `src/render/shaders/volume.frag` marches 96 steps through a `sampler3D` and keeps a
   `vec3 transmittance`. It writes `vec4(colour, 1.0 - mean(transmittance))`. The
   optical depth per step is `DUST * compressed * uAbsorption * step`.
2. `createVolumePass` calls `createVolumeTexture` and owns the result. No other pass can
   reach it.
3. `src/render/shaders/nebulae.vert` already computes one value per instance — the
   clip-space centre and the apparent radius — and writes one varying, `vWeight`, that
   the fragment shader multiplies into both the colour and the alpha.
4. `src/render/shader-include.ts` already holds a marker include: a fragment shader
   carries `// @marker-alpha` and the pass replaces it with the text of
   `shaders/marker-alpha.glsl` before it compiles. A browser test reads the files from
   the tree and composes the same source, so no second copy of the rule exists.

## Goals / Non-Goals

**Goals:**

- The extinction a nebula takes is the extinction the volume pass would have taken over
  the same segment, from one written rule.
- The cost per frame is below one percent of the volume pass. The measured ratio is about
  a seven-hundredth: 65,536 samples against the volume pass's 49,766,400 at 1080p.
- The look before this change stays reachable through one constant, so a browser test
  can compare two frames in one run.

**Non-Goals:**

- Correct order-dependent compositing of the nebula inside the volume integral. The
  volume pass draws the whole ray before the nebula pass runs. See **Risks**.
- A second density source for the extinction. The march reads the same texture the
  volume pass draws.

## Decisions

### The march runs in the vertex shader, not on the CPU and not per fragment

**Chosen**: `nebulae.vert` marches the volume texture over the segment from the camera
to the record's centre and writes a `vec3 vTransmittance`.

The vertex stage is the only stage where the cost follows the record count rather than
the fill. At the budget of 256 drawn records the march runs 256 × 4 × 64 = 65,536 times.
The volume pass runs its own 96-step march over every fragment of the half-resolution
target — about 50 million steps at 1080p, because that target is half resolution — so the
addition does not show.

*Alternative: the CPU computes one transmittance per selected record in
`selectNebulae`.* Rejected. It would put a 256 × 64 trilinear sample loop on the main
thread every frame the camera moves, inside the same frame budget the paint tests
measure, and `src/scene-data/` would have to take the `DensityVolume` down a path it
does not take today. The GPU does the same work at no measurable cost.

*Alternative: the fragment shader marches per fragment.* Rejected. A sprite may cover a
quarter of the canvas height in radius, and 256 of them may draw. The march would cost
the same order as the volume pass itself, for a gradient the tone map does not resolve.

### The four corners of a quad march the same segment

Each instance draws four vertices and all four reach the same transmittance, so
three quarters of the work is redundant. It is kept.

*Alternative: compute it once per instance and carry it into the quad.* WebGL2 has no
per-instance stage. The two ways to remove the redundancy are a transform-feedback pass
over the instance buffer before the draw, or a texture written by a pre-pass. Both add a
pass, a buffer and a synchronisation point to save 49,000 texture fetches, which is
below the noise of one frame. The redundancy is cheaper than the machinery that removes
it.

### The rule moves into one GLSL file with the marker include the tree already has

**Chosen**: a new `src/render/shaders/volume-density.glsl` holds a function that takes a
point in the world frame and gives back the compressed density at it, with the rim fade
and the height fade applied. The function returns a **scalar**, and the file also holds
`const vec3 DUST` for both shaders to read. `volume.frag` needs the scalar for its three
colour-ramp keys and its emission term and applies `DUST` only to the extinction;
`nebulae.vert` applies `DUST` to build its own. One copy of the weights, applied twice. `volume.frag` and `nebulae.vert` both carry a marker line
that the pass replaces with that text. `shader-include.ts` gains the second marker and
its put call, beside `MARKER_ALPHA_MARKER`.

The rule is about 25 lines of constants and 10 of arithmetic. Two copies would drift the
first time the ramp or a fade key is tuned, and the drift would show as a nebula lit
against a rim the volume no longer draws.

*Alternative: leave the rule in `volume.frag` and write a looser one in the nebula
shader* — for instance the raw decoded density with no compression. Rejected: the
absorption constant is stated per unit of **compressed** density, so a looser rule needs
a second constant tuned by eye, and the two would disagree at the rim and above the
plane, which is exactly where a nebula sits.

*Alternative: a real `#include` through a Vite GLSL plugin.* Rejected: a new build
dependency, and the 7-day release hold makes a new dependency a decision of its own. The
marker include is in the tree, is tested, and costs nothing.

Only the constants the shared rule needs move into the file. The colour ramp
(`HAZE`, `ARMS`, `LANE`, `BAND`, `CORE` and their keys) stays in `volume.frag`: the
nebula march needs the density and not the tint, and `clouds.frag` and `points.frag`
hold their own copies of the ramp for the reason their comments state.

### The renderer owns the volume texture

`createVolumePass` stops calling `createVolumeTexture` and takes a `VolumeTexture`
instead. The renderer creates it when the volume arrives, gives it to the volume pass
and holds it for the nebula draw, and disposes it in `dispose`. This is the smallest
move that lets two passes read one upload; the alternative, a second upload for the
nebula pass, would double a 4 MB texture for no gain.

The nebula pass takes the texture per frame rather than at construction, because the
nebulae may attach before the volume does, and the volume may be replaced. A frame with
no texture binds none and sends a transmittance of 1.

### 64 steps, and a fixed segment

The segment runs from the camera to the record's centre, clipped to the volume box the
same way `volume.frag` clips its ray. 64 steps over a segment that is at most the box
diagonal — about 105,000 light years — gives a step of 1,600 light years at worst, which
is coarse. It is enough because the value wanted is a column depth and not a picture:
the compression is monotone in the density, the error of a midpoint rule over a smooth
field falls as the square of the step, and the result is multiplied into a sprite whose
own art carries far more structure than the error. The volume pass's 96 steps serve a
picture; this one serves one number.

The step count is a named constant so a later change can measure and move it.

### The constant is a look value, not a pass switch

`nebulaOcclusion` joins the look constants beside `nebulaBrightness`, in the range 0 to
1, and multiplies the optical depth. A switch would give on and off; a scale gives the
browser test its two frames **and** gives the maintainer a way to tune the strength if
the full volume extinction reads too heavy at the tuned emission. The default is 1.

**How large a change the default of 1 makes.** The figures below are a design-time
estimate, computed from the project's own model — `generateVolume()`, the compression,
the rim fade and the height fade of `volume.frag`, `DUST = (0.55, 1.00, 1.70)` and
`DEFAULT_ABSORPTION = 2.0e-4`, over 64 midpoint steps. They are an estimate, not a
measurement of a drawn frame; task 5.1 reads the real frame.

`cameraPosition` in `src/camera/projection.ts` puts the camera exactly `distance` from
the cursor, so a view that names a record as its cursor at `d = 6000` marches 6,000 light
years, less whatever the volume box clips.

| Segment | Marched (ly) | Transmittance (r, g, b) |
| ------- | ------------ | ----------------------- |
| `BRIGHT_VIEW` camera to Barnard's Loop | 5,912 | 0.997, 0.994, 0.989 |
| `DARK_VIEW` camera to record 199 | 4,072 | 0.973, 0.951, 0.919 |
| Sol to Eta Carina | 9,000 | 0.944, 0.901, 0.837 |
| Sol to a record beyond the core | 38,725 | 0.162, 0.036, 0.004 |
| Far side of the core to Barnard's Loop | 33,238 | 0.182, 0.045, 0.005 |

Read plainly: **a near nebula loses a few percent of its light** — about 5 percent of the
mean and up to 8 percent of its blue at `DARK_VIEW`, and under 1 percent at
`BRIGHT_VIEW` — so the tuned close look moves a little and does not change character.
**A nebula across the galaxy is nearly extinguished** — about a sixth of its red, a
twenty-fifth of its green and almost none of its blue, so it reads close to pure red
rather than "warm". That is a look decision the default of 1 makes for every distant
sprite, and it is stated here so the owner can accept it or tune it before meeting it in
a frame. The constant is the knob: a default of 0.5 would roughly halve the optical depth
and leave a far nebula at about a third of its light.

**Two independent computations of the first two rows disagreed** by about half a percent
per channel, on the same model but different assumed camera positions. The three lower
rows reproduced to three decimals. The near rows here are the ones derived from the
camera rule above. Nothing in the plan rests on the difference: task 5.1 reads the drawn
frame, and that reading is what the tests assert on.

## Risks / Trade-offs

**The nebula's alpha attenuates light that sits in front of it** → The frame buffer
holds `front + T·behind` when the nebula pass runs. Scaling the whole buffer by
`1 - alpha·mean(T)` removes `alpha·mean(T)·front` as well, which should not be removed.
The error is bounded by `alpha·mean(T)·front` and falls to zero as `T` falls, which is
the case where `front` is large. It is the same approximation every sprite pass over a
volume makes without a depth buffer. Removing it needs the volume split into a
near and a far march around each sprite, which is a different design and a much larger
one.

**A tuned look shifts** → Every nebula that is not in the foreground gets darker, so the
frame's mean light inside the band falls. `e2e/look.spec.ts` holds a bounded-sum test at
12,000 light years and the pinned baseline sits at 60,000 where no nebula draws. The
bounded-sum test may need its bound re-read. It must be re-read against a measurement,
and not widened to whatever the new frame gives.

**The vertex stage refuses the sampler on some driver** → WebGL2 guarantees
`MAX_VERTEX_TEXTURE_IMAGE_UNITS` of at least 16, so this is a driver fault and not a
portability question. The spec holds a scenario that reads the value and checks the
program links. The browser suite runs Chromium and Firefox on the host GPU and fails on
a software fallback, so a fault shows in the gate. The link check runs on Chromium alone,
because `tests/browser-suite.test.ts` pins Firefox to `00-renderer.spec.ts` and
`paint-cost.spec.ts`; on Firefox the fault would show as frame cost rather than as a link
failure. The proposal says why that is accepted.

**The entry chunk passes its bound** → The guard sits at 270,000 with 3,004 bytes free
after `add-nebulae`. The task list measures the built chunk. If the reading passes the
bound, the bound moves to the next round figure above the reading and the reading and
the reason go into the guard's comment, which is what that comment asks of the next
change. The bound is not removed and the march is not cut to fit it.

**This change cannot land before `add-nebulae`** → `add-nebulae` is in the working tree,
committed as `63184db` and archived as `2026-09-19-add-nebulae`. Every file
this change edits is a file that change
writes. Implementation waits for it.

## Migration Plan

None. No stored data, no public type and no host-visible call changes. `nebulaOcclusion`
is an internal look constant, as `nebulaBrightness` is.

Rollback is one value: `nebulaOcclusion` at 0 gives the look before this change, with
the march still running.
