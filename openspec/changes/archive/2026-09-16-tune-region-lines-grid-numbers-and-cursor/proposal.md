## Why

Four marks on the plane read wrong against the look reference the owner keeps beside the
tree.

1. **The region boundary is a pale wash.** It draws as one cream band of a single tone.
   The reference draws a boundary as two parts: a wide deeper band with a lighter core
   line down its middle. Sampled over two backgrounds, the reference's band resolves to a
   tone of `(0.74, 0.55, 0.43)` with a core of `(0.74, 0.60, 0.42)` at an opacity near
   0.6, against the `(0.86, 0.74, 0.60)` at 0.55 this map draws. The reference band also
   holds a flat top with a short edge, where this one ramps across its whole half width.
2. **A coordinate number stands on the two lines it names**, because its anchor is the
   crossing and the anchor sits at the middle of the element. The number is hardest to
   read where it matters most.
3. **A number goes out too near the cursor.** The reach is 1.2 spacings, so a cursor near
   a crossing loses the crossings of its own cell on the far side, which sit 1.41
   spacings away. A user then sees a cell with numbers on one side only.
4. **The fine levels draw in a disc about the cursor**, because a level that carries no
   number is cut to `0.4 * d`. The lattice marks a neighbourhood and the rest of the
   frame carries the numbered level alone, which reads as a hole in the grid rather than
   as a grid.
5. **The cursor marker holds 96 CSS pixels at every zoom.** At the widest view the marker
   covers a large part of the galaxy, and it is a control, not a place.

## What Changes

- **The boundary band draws in two tones.** A deeper outer band of `(0.74, 0.55, 0.43)`
  carries a lighter core of `(0.90, 0.79, 0.52)` over the middle **0.25** of its width.
  The opacity rises from 0.55 to **0.62**, and the alpha profile becomes a flat top with a
  **4 CSS pixel** edge, or a quarter of the half width where that is less, in place of the
  ramp across the whole half width. The band's half width rule does not change.
- **A coordinate number leaves its crossing.** The crossing becomes the number's **bottom
  right** corner on the plane, with a gap of **0.04** of a level spacing on each axis, so
  the number lies in the cell above and left of the crossing and no line runs under it.
  The number's reported anchor stays the crossing.
- **A number reaches further.** The label reach rises from **1.2** to **2.0** spacings, so
  every corner of the cell the cursor sits in carries a number: the furthest corner of
  that cell is 1.41 spacings away.
- **The zoom reach goes.** `GRID_REACH_ZOOM` and the exemption of the numbered level are
  removed. Every level keeps its own reach of 100 of its own lines, so the whole subgrid
  draws and no level is cut to a disc about the cursor.
- **The cursor marker follows the zoom.** Its box is 96 CSS pixels at a camera distance of
  **12,000** light years and nearer, and falls on a smooth step to **40** CSS pixels at
  **60,000** and further.

Non-goals. The grid line's own colour, width, alpha and merge rule do not change; the
owner reads them as right. The region overlay's two fades, its modes, its half width and
its labels do not change. The marker's shape, its colour and its switch do not change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `galactic-regions`: the boundary band draws as a deeper band with a lighter core, at a
  higher opacity and with a flat top. Two more requirements move with it: the region label
  requirement, one of whose scenarios divides a band reading by the opacity of 0.55 and
  reads the ridge profile, and the region mode requirement, which names the band
  requirement the change replaces.
- `coordinate-grid`: the zoom reach of a level that carries no number is removed; a
  coordinate number sits off its crossing and reaches 2.0 spacings. The blend requirement
  moves with the band as well: it states that the boundary keeps `1 - 0.55` of the grid
  under it.
- `map-navigation`: the cursor marker's size falls with the camera's distance to the
  cursor.

## Impact

Code:

- `src/render/region-pass.ts` and `src/render/shaders/region-composite.frag`: a second
  tone, the core share, the edge width and the new opacity.
- `src/render/grid-pass.ts`: `GRID_REACH_ZOOM`, `gridZoomReach` and the exemption inside
  `gridReachPerLevel` go. The function keeps its name and drops its `focalCss` and
  `distance` parameters, and the shader's `uReach` uniform does not change.
- `src/app/grid-labels.ts`: the reach constant, the anchor offset and the placement.
- `src/app/cursor-marker.ts`: the size rule reads the camera distance.

Tests:

- `src/render/region-pass.test.ts` and `src/render/grid-pass.test.ts`: the tone, the
  opacity and the reach readings.
- `src/app/grid-labels.test.ts` and `src/app/cursor-marker.ts`'s unit coverage: the reach,
  the offset and the size.
- `e2e/regions.spec.ts`, `e2e/grid.spec.ts` and `e2e/cursor-marker.spec.ts`: the band's
  two tones, the label offset, the lattice reach and the marker size.
- `e2e/regions.spec.ts`'s own band harness holds the tone and the opacity as literals and
  turns a pixel into an alpha through them, so five readings of the band move with the look
  as well as the three scenarios that state a profile.
- `src/app/cursor-marker.test.ts`: the module has no unit test, and the size rule needs
  one.
- `e2e/look.spec.ts` baseline: the default view draws neither the grid nor the boundary
  overlay, and the cursor marker in it falls from 96 to 40 CSS pixels, so the image needs
  a fresh run.

Scale. Nothing here follows the size of the host's data set, which may hold 10,000
systems, or the galaxy's ~400 billion. The band stays one full-screen composite over a
one-channel coverage buffer; the grid stays one call of 3 vertices with six levels tested
for each fragment; the label sweep stays at most 25 crossings a frame; the marker stays
one plane placement. The zoom reach removal lights more pixels of the frame but reads the
same six levels at each of them, which the frame budget requirement already states.

The bound the frame budget holds is measured against hardware rendering. The suite fails
on SwiftShader and llvmpipe, which `e2e/00-renderer.spec.ts` checks, so a run that reaches
the grid measurement is on a real card. Removing the zoom reach lights more pixels of the
frame, so the change re-measures that reading and states it.

The removal reverses a decision of change `smooth-traced-boundary-and-limit-grid-reach`,
made on 2026-09-16. `docs/roadmap.md` records that decision and needs the reversal and its
reason.
