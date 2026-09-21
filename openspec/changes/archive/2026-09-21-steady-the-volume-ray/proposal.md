## Why

At a close view inside the disc the galaxy core flickers while the user zooms. The whole
volume picture jumps across the screen and then jumps back. A reader reported it at
`#c=-4.15271,-50.71937,-152.73213&d=146.35196&p=34.56875&y=19.66992&g=1`. The jump is
the ray error below, which reaches 2.6 degrees at that view, so at a 60 degree field
over 1,000 rows it moves the picture about 43 pixels.

The cause is measured, not guessed. `src/render/shaders/volume.vert` reconstructs the
ray of each pixel at the three corners of the full-screen triangle, as the difference
between the unprojected far point and the unprojected near point, and writes it to a
`vec3` varying for the rasteriser to interpolate.

The fault is a cancellation in the far point's `w`. The `w` row of the inverse matrix
should be exactly `(0, 0, 1/B, A/B)`, but gl-matrix's `invert` leaves noise of about
5e-9 in the first two entries. The third and fourth entries are +/-0.2631, and at the
far plane they cancel down to `1/f`, which is 1e-6. At a triangle corner the normalised
device coordinate reaches 3, so the noise contributes about 1.5e-8 against that 1e-6:
a scale error on the corner's whole ray of **1 to 3 per cent, different at each
corner**. Measured at the reported view and near plane 1.88: -0.33, -1.27 and +1.10 per
cent, so the three corners differ by 2.4 points.

At one pixel that error is a pure scale and the direction survives it. The interpolation
is what turns it into a direction error, because the rasteriser then mixes three vectors
of unequal scale. The angle between the result and the `float64` direction is **up to
2.6 degrees** over near planes 1.80 to 2.04 light years at that view. At the one pixel
the unit test reads it is **2.1 degrees**. The error moves whenever the projection
matrix moves.

Zeroing those two entries of the inverse drops the interpolated error to 2e-6 degrees at
every near plane, which is what identifies them. The same reconstruction evaluated at
the pixel, with the noise left in, is accurate to 3e-6 degrees for the same reason.

The near point escapes both ways. Its `w` is the **sum** of the same two entries, about
0.526, so no cancellation happens and the same noise is 3e-8 relative.

Two things move the projection matrix while the user works the map. The near plane is
`min(10, distance / 10)`, so every zoom step below 100 light years moves it. Every orbit
step moves the view matrix. Both re-roll the error, and the volume picture jumps with it.

Measured at the reported view, 1600 x 1000, volume pass alone, the mean luminance of the
top 30 rows:

| Step                                          | Value moves     | Largest single step |
| --------------------------------------------- | --------------- | ------------------- |
| Zoom, 0.005 light years, over 19.0 to 20.0 ly | 0.4379 - 0.5028 | 0.0648 (13 %)       |
| Yaw, 0.005 degrees, at distance 146.35 ly     | 0.5180 - 0.5299 | 0.0077              |
| Pitch, 0.005 degrees, at distance 146.35 ly   | 0.4912 - 0.5481 | 0.0101              |
| Zoom, 0.005 light years, near plane held      | 0.5026 - 0.5028 | 0.000007            |

The last row is the control: hold the near plane and the same zoom sweep is smooth to
seven decimal places. The camera is not the problem, the reconstructed ray is.

Non-goals. The near plane rule does not change. The far plane does not change. The
sample count of the march does not change. No look constant changes.

## What Changes

- The volume pass reconstructs the ray of a pixel from the unprojected **near** point
  alone. The camera sits at the origin of the camera-relative frame, so that point is
  already the direction. This is the rule `src/render/shaders/grid.frag` states and uses
  today.
- The unprojection moves from the vertex shader to the fragment shader, so nothing
  reconstructed crosses the triangle as a varying.
- `volume.vert` is deleted. The pass takes the shared `shaders/fullscreen.vert`, which
  seven passes already use, and the fragment shader reads the pixel's normalised device
  coordinate from its `vTexture`.
- A unit test and a browser test hold the two sides of the fix: the reconstruction rule
  and the drawn picture.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `far-view-rendering`: adds a requirement that states how the volume pass builds the
  ray of a pixel, and bounds how much the drawn volume may change over one small step of
  the view.
- `map-navigation`: the near plane requirement claims that the near plane changes
  clipping alone. The claim is false today. The delta keeps the claim and adds the
  scenario that tests it.

## Impact

- `packages/galaxy-map/src/render/shaders/volume.frag`.
- `packages/galaxy-map/src/render/shaders/volume.vert`, deleted.
- `packages/galaxy-map/src/render/volume-pass.ts`, which imports the vertex source.
- A new unit test and a new browser test.

### The drawn picture moves, and three stated scenarios are at risk

The corrected ray is a different ray, so the volume picture moves. It will move by less
than the reported view shows, because every view the look suite reads sits at 100 light
years or more, where the near plane is pinned at 10 and the error is smaller. Measured
at near plane 10, over a 21 x 21 grid of pixels:

| View                                    | Worst error of the present ray                |
| --------------------------------------- | --------------------------------------------- |
| The default view's yaw 0, pitch 35       | 0.109 degrees, about 1.3 pixels of 720 rows   |
| Yaw 0, pitch 5, which the side views use | 0.018 degrees, about 0.2 pixels of 720 rows   |
| Yaw 30, pitch 60                         | 0.002 degrees                                 |

The move is a small, position-dependent warp of the ray field, not a rigid shift. It
touches no density, no ramp and no colour constant, so no look constant is implicated.
Three scenarios of `far-view-rendering` read numbers that a one to two pixel warp can
move, and each has to be read rather than re-recorded:

- **Look matches the baseline**, which allows at most 2 percent of pixels to differ from
  the committed image `e2e/look.spec.ts-snapshots/default-view-chromium-gpu-linux.png`.
  A one to two pixel warp of the disc is expected to exceed that, so the baseline is
  expected to need re-recording.
- **Bulge has a soft top**, which reads the volume alone up a vertical line and allows no
  two adjacent rows to differ by more than 0.05. This is the reading most sensitive to a
  warp.
- **Background is dark grey**, which holds the four corner pixels between 0.02 and 0.06.

If one of the two numeric scenarios moves out of its bounds, this change needs a delta
for it, which it does not carry today. That is a stop, not a widening.

### Scale

The volume pass marches 96 samples per fragment at half resolution. At 1920 x 1080 that
is 518,400 fragments and about 50 million samples a frame. The change moves one 4 x 4
matrix product from 3 vertices to each fragment, which is about 500,000 products a frame
against 50 million volume samples. The **Frame budget** requirement of
`far-view-rendering` holds the figure and its test runs unchanged.
