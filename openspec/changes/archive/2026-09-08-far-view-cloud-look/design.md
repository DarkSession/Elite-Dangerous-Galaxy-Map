## Context

See proposal.md for the gaps and the measurements behind them. The renderer after
`far-view-look-third-pass` draws the volume at half resolution, then the cloud pass
over it: the first 10,000 samples of the point cloud as instanced quads over a second
vertex array on the point buffers, with a fall-off `(1 - r^2)^2`, a radius of 1,000
light years capped at 64 target pixels, a gain of up to 4 for a capped sprite, and a
fade by zoom distance from 6,000 to 12,000 light years. The look constants live in the
shaders and in `src/render/cloud-pass.ts`; the third pass's design lists them.

Facts that shape this pass, measured on the current tree:

- The reference is sampled at 12.65 image pixels per 1,000 light years with the minor
  axis at 0.42 of the major one. The default view at 1280x720 projects the ring at
  20,000 light years at 7.84 pixels per 1,000 light years with the minor axis at 0.43.
  The two are the same view at two scales, so every measure below is in light years.
- The spec's chunk measure, computed offline on the frame with the same arithmetic as
  the test helper, reads 0.150, 0.220 and 0.206 at the three cloud blocks. The blocks
  lie 20,900, 28,700 and 30,900 light years from the centre. The same measure on the
  reference, at rings of 20,000 to 32,000 light years, reads 0.066 to 0.093. Its
  minimum over the rings from 14,000 to 44,000 is 0.045 and its maximum 0.112.
- The same measure with the clouds off reads 0.102, 0.177 and 0.157 at the three
  blocks, and with the volume alone 0.097, 0.192 and 0.164. The grain of the volume
  sits above the ceiling of 0.13 at the second and the third block. The measure is
  relative, so a cloud layer with a low residual of its own lowers it: if the cloud
  residual is 0.08 of the cloud mean and independent of the volume's, the ceiling
  needs a cloud mean of at least 0.06 at the second block and 0.04 at the third. The
  clouds add 0.043, 0.013 and 0.012 there today.
- The band-passed power of the annulus from 28,000 to 44,000 light years, by
  half-octave from 250 to 8,000 light years, is close to flat on the reference: every
  band holds 0.06 to 0.14 of the total. On the frame the bands from 1,000 to 2,000
  light years hold 0.02 to 0.04 each and the bands from 2,000 to 8,000 hold 0.14 to
  0.20 each. The clouds alone put 0.94 of their power above 2,000 light years.
- Box-filter octave bands do not separate the two frames: the ratio of the 1,000 to
  2,000 band to the 2,000 to 4,000 band reads 0.71 on the reference and 0.62 on the
  frame. The box filter leaks across octaves, and the point grain fills its finest
  band. A spectrum by FFT separates them but needs a transform in the helper. The
  chunk measure with a ceiling separates them with the helper that exists.
- Sprite layers per target pixel at 1920x1080, from the cloud's first 10,000 samples
  with today's radius and cap: 1.97 at the default view, 15.7 at 30,000 light years
  over the centre, 9.0 at the side view at 40,000, 10.9 to 89.4 at 12,000. The cloud
  pass costs 0.4 ms of a 1.47 ms frame at 12,000 light years over the centre.
- With the proposed placement, radii and fade at the cap, at 40,000 samples: 31 at
  the default view, 181 at 30,000 over the centre, 131 at the side view, 149 to 188
  at 12,000, and 10 at 120,000. At 20,000 samples, half of each. The fade holds the
  count from 12,000 to 30,000 nearly level, where today it grows 8 times.
- With the placement by the density to the power 0.5, 10.4 percent of the samples lie
  beyond 30,000 light years and 0.9 percent beyond 40,000. The point cloud's first
  10,000 give 0.8 and 0.1 percent.
- The clouds add 0.044 to the mean luminance of the first cloud block at the default
  view, and 0.042 to the mean of the whole frame at 12,000 light years over the outer
  disc.
- The point cloud's samples are in random order, and the point pass hashes
  `gl_VertexID` for its brightness spread. `gl_InstanceID` is available in GLSL ES
  3.00 vertex shaders for the same use per sprite.
- The worker builds the surface table once and draws the point cloud from it. The
  table exposes its cumulative mass per cell, so a second cumulative over any function
  of the cell mass costs one pass over 1,048,576 cells.
- The main-thread task bound is 100 ms, and the ready event must arrive within 5
  seconds of page load. The point cloud's 2,000,000 draws take under 3 seconds.
- Every scenario reads the 8-bit frame, which is the tone-mapped value through the
  display gamma of 1/2.2 and the background blend.
- The two new helpers, read once on the tree before this change at 1280x720. The ring
  median at 44,000 light years reads 0.0702 with the clouds on and 0.0702 with them
  off, a difference of -0.00002. The mean frame luminance at
  `#c=-20000,0,20000&d=12000&p=35&y=0` reads 0.3484 with the clouds on and 0.3064
  with them off, a difference of 0.0421.
- The new scenarios read these values on the tree before this change. Chunks from
  above: 0.151, 0.220 and 0.207, so the ceiling of 0.13 fails at all three blocks and
  the floor of 0.05 passes. Clouds reach the rim: -0.00002, so the floor of 0.01
  fails. Chunks from the side: 0.117 and 0.128, so the floor of 0.05 passes. Clouds
  carry light: 0.0434, so the floor of 0.03 passes. The sum stays bounded: 0.0421, so
  the ceiling of 0.10 passes.

## Goals / Non-Goals

**Goals:**

- The five gaps of the proposal's table closed. Each has a scenario except the size
  range: no helper measures the on-screen spectrum, so the data scenario on the radii
  and the radius rule of the cloud requirement pin it together. Two browser scenarios
  fail today: chunks from above with its new ceiling, and clouds reach the rim. The
  unit scenarios of the cloud set and the shape set cannot run today, because neither
  exists. Four browser scenarios guard a property the tree already has: chunks from
  the side, clouds carry light, clouds fade at close range, and the bounded sum.
- The same pass structure. The cloud pass keeps its place between the volume and the
  glow, so the glow reads the same source.
- The frame budget measured where the proposed set puts the most layers on a pixel.

**Non-Goals:**

- A change to the volume, the glow, the points, the tone map or the camera. Every
  constant of those passes stays unless a scenario of this change cannot be met
  without it, and then the design's open questions say which and why.
- A painted cloud texture as an asset. The shapes are generated.
- Noise in the volume. The noise lives in the shape set only.
- Speckle inside the shapes. The point pass gives the grain, and the proposal measures
  it as matched.

## Decisions

### A cloud sample set in the scene data

The worker draws a second set of samples from the same surface table, with the
plane position drawn from a cumulative over the square root of each cell's mass, the
height from the vertical profile, the tint from the zone, a radius drawn log-uniform
from 500 to 4,000 light years, and the density ratio of the cell. The set is
`CloudSet { count, positions, tints, radii, ratios }` in `src/scene-data/types.ts`,
built by `generateCloudSet(model, { count, seed, table })` in a new
`src/scene-data/cloud-set.ts`, posted from the point cloud worker beside the point
cloud, and uploaded by the renderer into buffers of its own. The height draw moves out
of `generatePointCloud` into a helper both generators call, so the two sets share one
vertical distribution.

The placement power is a constant of the generator. The spec pins its effect: at least
8 percent of the samples beyond 30,000 light years, against the point cloud's 0.8
percent, and the mass fraction inside 10,000 light years against the flattened table.

The radius is data rather than a hash in the shader, because the spec pins its
distribution and a unit test in Node can read a `Float32Array` but not a shader. The
cost is 160 KB.

The density ratio is the cell's, not the sample's exact position's, so the scenario
that checks it is exact. The cell is 98 light years, below one pixel at every far view.
The generator evaluates the detailed surface density at the cell centre for the ratio,
as the table build does, and does not difference two cumulative values, because the
difference of two large sums loses precision at the rim cells this set exists to fill.
For the placement cumulative, the generator clamps the differenced cell mass at 0
before the square root.

Alternative considered: the first 40,000 samples of the point cloud, as today. They
follow the density, so the rim gets 40 sprites over 1,900 million square light years
and the reference's rim of puffs cannot appear. The third pass chose the shared
samples because they served then; the rim is why they do not serve now.

Alternative considered: a flattening in the renderer by dropping samples with a
probability from the density ratio. The point cloud holds too few outer samples to
thin toward: 0.1 percent of 2,000,000 beyond 40,000 light years is 2,000, most of
them needed as points.

### A generated shape set

`src/render/cloud-shapes.ts` builds 16 shapes of 64 x 64 texels into one 256 x 256
`Uint8Array`, from a seed, as a pure function with a unit test beside it. Each texel
is `falloff(r) * max(0, (noise - t) / (1 - t))`, with `falloff = (1 - r^2)^2` on the
inscribed disc and 0 outside it, `noise` a value-noise field of three octaves at 2, 4
and 8 cycles across the shape with amplitudes 1, 0.5 and 0.25 normalised to 0 to 1,
and `t` a threshold that starts at 0.3. The threshold cuts the outline where the noise
is low, so the outline is ragged, and the octaves mottle the interior. Each shape is
scaled so its peak is 255. The lattice values come from a seeded generator, so the
build is deterministic and two shapes differ.

The build is 65,536 texels with three bilinear reads each, well under 10 ms in
JavaScript, so it runs in `createRenderer` before the scene data arrives and stays
inside the 100 ms task bound. `src/render/buffers.ts` uploads it as an R8 texture with
linear filtering and clamp to edge, beside the detail texture.

The vertex shader hashes `gl_InstanceID` with the shift-and-xor hash of `points.vert`
to pick a shape, 0 to 15, and a rotation, 0 to 2 pi. It rotates the corner attribute
before the lookup, so the quad stays axis-aligned and the texture turns inside it. The
shape is zero outside its inscribed disc, so the rotated lookup never reaches a
neighbouring cell of the atlas; a half-texel inset keeps the linear filter inside the
cell as well. The fragment shader reads one texel and multiplies by the brightness.

Alternative considered: noise in the fragment shader. Three octaves per fragment over
180 layers of 518,000 target pixels is 280 million noise evaluations per frame, cheap
on this card and dear on a laptop, and the shape cannot be tested in Node.

Alternative considered: a painted texture. The game's own sprite is not the project's
to copy, and a drawn one puts the tuning loop through an image editor.

### Brightness by density and radius

The sprite's peak value is `uBrightness * pow(ratio, DENSITY_POWER) * pow(radius /
1000, SIZE_POWER)`, with the ratio and the radius from the attributes.

The size power starts at -1. With equal counts of sprites per octave of radius, a
sprite of radius `R` and peak `b` adds a variance proportional to `b^2 R^2` to the sum,
so equal variance per octave, the flat spectrum of the reference, needs `b`
proportional to `1 / R`. The total light per octave then grows in proportion to `R`:
the large puffs carry the haze and the small ones the chunks. This is why no size
band dominates the sum. The spec does not measure it on screen, so the size range
rests on the data scenario on the radii and the radius rule of the cloud requirement.

The density power starts at 0.25. The placement goes as the density to the power 0.5,
so the light per unit area goes as the density to the power 0.75, between the volume's
two slopes of 0.35 and 0.70. A higher power puts the light back into the inner disc
and leaves the rim dark, which is the gap the rim scenario measures; a lower one
flattens the disc against the bulge fall-off scenario.

Both powers and the brightness are tunables; the scenarios and the ring table bound
them.

### A fade at the cap in place of the gain bound

The vertex shader computes the wanted radius as today, and multiplies the brightness
by `1 - smoothstep(0.5 * cap, cap, wanted)`; at or beyond the cap it moves the quad
out of the clip volume. The drawn radius is `min(wanted, cap)`, so the fill of one
sprite never passes the cap's disc. There is no gain: a sprite that fades is not
brightened first.

This is the level-of-detail behaviour of a sprite haze. As the camera approaches, the
largest puffs dissolve first and the smaller ones remain, until the pass's own fade by
zoom distance removes them all below 12,000 light years. The measured layers show the
effect: with the fade, the count from 12,000 to 30,000 light years stays between 131
and 188, where today it grows from 16 to 89.

The gain bound of the third pass kept a sprite's total light through the cap. That
made sense for one radius and a small count; with radii up to 4,000 light years the
cap starts at a range of 29,000 light years at 1920x1080, and the brightened capped
sprites in the near part of every mid-distance view add a wash.

Alternative considered: keep the cap and the gain and reduce the count with distance.
The count is one draw call's instance count and cannot vary by range within the frame.

### Count and fill

The cloud set defaults to 40,000 samples, and the spec bounds the pass at that count.
The worst-case fill is 40,000 sprites just under the cap, 515 million target pixels;
the measured placement gives at most 188 layers over 518,400 target pixels, 97
million, at 1920x1080. The pass costs 0.4 ms at 46 million today, so the measured
case is about 1 ms and the worst case about 5 ms. The tuning may lower the count to
20,000 if the look holds at half the layers; the spec's bound stays at 40,000.

### Scenario thresholds

- **Chunks from above: 0.05 to 0.13.** The reference reads 0.066 to 0.093 at the
  blocks' radii, 0.045 to 0.112 over every ring. The frame reads 0.150 to 0.220. The
  ceiling is what fails today; the floor keeps the chunks, and the two together say
  "puffs that overlap, not dots that stand alone". With the clouds off the frame
  reads 0.102, 0.177 and 0.157, above the ceiling at two blocks, so the cloud layer
  must add about 0.06 at the second block and 0.04 at the third with a residual near
  the reference's. The placement by the flattened density puts more of the set at
  those radii than today's, and the carry-light floor is on the first block only.
- **Chunks from the side: at least 0.05.** The floor moves from 0.10 with the floor
  from above, so a side view does not demand more texture than the reference shows
  from above. The scenario passes today.
- **Clouds reach the rim: at least 0.01.** The clouds alone read 0.001 above the
  background at 44,000 light years today, and the rim is where the reference's puffs
  are plainest. The median over 72 points, not the mean, so one bright sprite does
  not pass the ring.
- **The sum stays bounded: at most 0.10.** Today reads 0.042 at 24 layers. The guard
  holds the fade at the cap to its purpose at four times the count.
- **The two holds carry a known share of the set: 0.20 to 0.32 below the floor and
  0.45 to 0.58 above the ceiling.** The set with the default count and seed 7 reads
  0.263 below the floor and 0.515 above the ceiling. The bands hold a margin of about
  0.06 on each side, as the other data scenarios do. The scenario pins the two holds
  the way the radii scenario pins the size range, because no browser measure reads
  them. `src/render/cloud-pass.test.ts` runs it and imports the scene-data generator;
  that import direction is the allowed one.

### Test helpers

`e2e/helpers.ts` gains `ringMedian5(page, radius)`, the median of the 5 x 5 mean
luminance at the 72 ring points, and `meanLuminanceFrame(page)`, the mean over the
whole frame summed inside the page as `meanLuminanceBlock` does, so 3.7 million values
do not cross the protocol. `bandPass` and `meanLuminanceBlock` do not change.

### Tuning order

1. The shape set threshold and octaves, against its unit test, then by eye on a
   clouds-only frame at the default view.
2. The brightness, the size power and the density power, against the chunks-from-above
   band, clouds carry light and clouds reach the rim, with the whole look test rerun.
3. The glow weight if the halo past the rim leaves its band, because the clouds feed
   the glow.
4. The count and the fade, against the bounded sum and the frame budget at ten views.
5. The baseline, and the ring table against the reference.

If a scenario cannot be met without breaking another, the tuning session changes the
threshold in the spec delta and states why, as the third pass did.

## Risks / Trade-offs

- [The ceiling and the floor of the chunk band conflict with the carry-light floor]
  → The band is on the relative measure and the carry-light floor on the absolute
  one; more, dimmer sprites lower the first and hold the second. The tuning order
  puts them in one step.
- [The volume's own grain holds the chunk measure above the ceiling at the second
  and the third block, whatever the clouds do] → The measure is relative, and the
  arithmetic in the context says a cloud mean of 0.06 and 0.04 with a low residual
  brings it under 0.13. If the tuning cannot reach that without breaking the bounded
  sum at 12,000 light years, the tuning changes the ceiling in the spec delta and
  records the clouds-off values as the reason, and the volume's grain becomes an open
  question for a change of its own.
- [The rim light moves the halo past the rim out of its band of 0.02 to 0.05] → The
  glow weight is step 3 of the tuning. The halo scenario keeps its band.
- [The outside pixel at (-45,000, 0, 0), 51,900 light years from the centre, rises
  above 0.12] → A 4,000 light year sprite at the rim reaches 51,000 light years, and
  the volume's rim fade ends there too. The rim has few samples with the largest
  radius, and the fade past 47,000 in the placement is the detail grid's own zero.
  The default-view scenario guards it.
- [The patch contrast at 32,000 and 38,000 light years falls under 2.5 with a more
  even haze] → The same measure on the reference reads 3.4 and 3.3, so a
  reference-like frame passes. The scenario stays as it is.
- [The reference's numbers carry JPEG noise] → Every threshold sits inside the
  reference's range with a margin, not at its edge.
- [The baseline changes in every pixel of the disc] → The baseline is regenerated
  last, after every other scenario passes, and compared by eye with the reference.
- [The 5 second worker budget] → 40,000 draws are 2 percent of the point cloud's.
- [`PointBuffers` loses `cloudVertexArray`] → The cloud pass gets buffers of its own.
  `setPointCloud` and a new `setCloudSet` each own one upload, in their own animation
  frames.

## Departures from this design

The tuning session changed these decisions. Each one broke a scenario as designed.

- **A placement floor with a rim taper.** The placement by the cell mass to the power
  0.5 alone put 10.4 percent of the samples beyond 30,000 light years, and the rim
  scenario read 0.004 against its floor of 0.01. A higher placement power emptied the
  arms. The generator now holds each cell's placement mass at 0.005 of the largest
  cell mass, and fades that floor to zero from 38,000 to 50,000 light years with a
  smoothstep. The set then puts 39.1 percent of its samples beyond 30,000 light years,
  16.2 percent beyond 40,000 and 1.9 percent beyond 47,000. `CLOUD_PLACEMENT_FLOOR`,
  `CLOUD_RIM_RADIUS_LY` and `CLOUD_RIM_WIDTH_LY` are the new constants.
- **The smooth surface density for the ratio, not the detailed one.** The design took
  the ratio from `detailedSurfaceDensity`. The correction and the detail grids hold
  structure at 98 to 1,600 light years, inside the size range of the sprites, so a
  sprite that carries it reads as noise and the chunk measure rose above its ceiling.
  The generator now reads `surfaceDensity` at the cell centre, and `peakCellDensity`
  scans every cell centre with the same function.
- **The ratio is held between a floor and a ceiling, then divided by the ceiling.** A
  raw ratio to a power left the outer disc black, because the model's density falls by
  four orders of magnitude from the core to the rim. The shader clamps the ratio to
  `CLOUD_RATIO_FLOOR` = 1e-4 and `CLOUD_RATIO_CEILING` = 1e-3 and divides by the
  ceiling, so the inner disc is at full brightness and the outer disc holds a tenth of
  it. The holds cut part of the density range, and these are the numbers. The ratio
  `surfaceDensity(cell centre) / peakCellDensity`, on 720 points of each ring, reads:

  | Ring     | 10th percentile | Median   | 90th percentile | Below the floor | Above the ceiling |
  | -------- | --------------- | -------- | --------------- | --------------- | ----------------- |
  | 20,000   |                 |          |                 | 0               | 95.8 percent      |
  | 25,900   |                 |          |                 | 0               | 30 percent        |
  | 32,000   | 6.48e-5         | 2.72e-4  | 7.41e-4         | 20.8 percent    |                   |
  | 38,000   | 1.08e-5         |          |                 | 64.4 percent    |                   |
  | 44,000   |                 |          |                 | 100 percent     |                   |

  So the floor sits near the 20th percentile of the ring at 32,000 light years: most
  of that ring still follows the density, and the clamp cuts the sprite contrast
  across the ring from 49 to 25. Past 38,000 light years the floor sets the light,
  which is what gives the rim its puffs. A floor of 5e-5 would keep more of the
  contrast at 32,000 and fail the rim scenario, which reads 0.0203 against 0.01.
- **The density power is 1.6, not 0.25.** With the held ratio the range is 10, not
  10,000, so the power that shapes the arm contrast is much larger. At 0.25 the arms
  disappeared and the patch-contrast scenario failed.
- **The glow weight is 9.0, was 6.0.** Task 5.3. The clouds feed the glow, and at 6.0
  the halo past the rim read 0.012 against its floor of 0.02. At 12.0 the patch
  contrast fell to 2.446 against its floor of 2.5, and at 8.0 the halo read 0.0168.
  9.0 meets both. This is the only constant outside the cloud path that changed.
- **The grain threshold of the tone map requirement is 0.04, was 0.06.** Task 5.5. The
  sprites lay light over the point grain, which lowers the relative measure. The
  reference's own grain, by the same measure over the rings from 14,000 to 38,000
  light years, reads a median of 0.0526 and a 10th percentile of 0.038, so 0.06 asks
  for more grain than the reference has. The frame reads 0.0432. The spec delta
  carries a MODIFIED copy of the tone map requirement with the new number and a
  sentence that says the sprites soften the grain.
- **The scene-data cloud-sample scenarios.** Task 5.5. The outer-disc fraction moves
  from 0.08 to 0.25, because the placement floor puts far more samples there; the
  placement scenario reads `placementMasses`, not the raw cell mass; and the ratio
  scenario reads the smooth density. The spec delta states the floor, the taper and
  the smooth density in the requirement itself.

## Open Questions

- The final constants, as the tuning session reached them.

  | Constant           | Start                        | Reached                          | Where             |
  | ------------------ | ---------------------------- | -------------------------------- | ----------------- |
  | cloud count        | 40,000                       | 40,000                           | `cloud-set.ts`    |
  | placement power    | 0.5                          | 0.5                              | `cloud-set.ts`    |
  | placement floor    | none                         | 0.005 of the largest cell mass   | `cloud-set.ts`    |
  | floor taper        | none                         | 38,000 to 50,000 ly              | `cloud-set.ts`    |
  | radius range       | 500 to 4,000 ly              | 500 to 4,000 ly                  | `cloud-set.ts`    |
  | shape count, side  | 16, 64 texels                | 16, 64 texels                    | `cloud-shapes.ts` |
  | noise threshold    | 0.3                          | 0.36                             | `cloud-shapes.ts` |
  | noise octaves      | 2, 4, 8 cycles; 1, 0.5, 0.25 | 4, 8, 16 cycles; 1, 1, 0.7       | `cloud-shapes.ts` |
  | fall-off power     | 2                            | 1.2                              | `cloud-shapes.ts` |
  | size power         | -1                           | -1                               | `cloud-pass.ts`   |
  | density power      | 0.25                         | 1.6                              | `cloud-pass.ts`   |
  | ratio floor        | none                         | 1e-4                             | `cloud-pass.ts`   |
  | ratio ceiling      | none                         | 1e-3                             | `cloud-pass.ts`   |
  | cloud brightness   | to tune                      | 0.68                             | `cloud-pass.ts`   |
  | pixel cap          | 64 target pixels             | 64 target pixels                 | `cloud-pass.ts`   |
  | fade at the cap    | 32 to 64 target pixels       | 32 to 64 target pixels           | `clouds.vert`     |
  | zoom fade          | 6,000 to 12,000 ly           | 6,000 to 12,000 ly               | `cloud-pass.ts`   |
  | cloud colours      | haze, arms, core by zone     | haze, arms, core by zone         | `clouds.frag`     |
  | glow weight        | 6.0                          | 9.0                              | `glow-pass.ts`    |

- The value each browser scenario reads on the frame, at 1280x720.

  | Scenario                     | Threshold             | Reached                      |
  | ---------------------------- | --------------------- | ---------------------------- |
  | chunks from above            | 0.05 to 0.13          | 0.0687, 0.1179, 0.1089       |
  | chunks from the side         | at least 0.05         | 0.0665, 0.0730               |
  | clouds carry light           | at least 0.03         | 0.1020                       |
  | clouds reach the rim         | at least 0.01         | 0.0203                       |
  | the sum stays bounded        | at most 0.10          | 0.0421                       |
  | clouds fade at close range   | under 0.005           | 0                            |
  | the default view, centre     | 0.80 to 0.97          | 0.8875                       |
  | the default view, Sol        | above 0.20            | 0.3184                       |
  | the default view, outside    | under 0.12            | under 0.12                   |
  | the bulge fall-off, near     | at least 0.03         | 0.0429                       |
  | the bulge fall-off, far      | at least 0.05         | 0.2163                       |
  | the arm gap                  | above 0.10, below Sol | 0.1910                       |
  | the patch contrast           | at least 2.5          | 2.5608 and 2.6869            |
  | the grain                    | above 0.04            | 0.0432                       |
  | the halo past the rim        | 0.02 to 0.05          | 0.0207                       |
  | the sky, low                 | at most 0.20          | 0.0812                       |
  | the sky, high                | at most 0.08          | 0.0695                       |
  | the corners                  | 0.02 to 0.06          | 0.036 to 0.040               |
  | the ready event              | under 5,000 ms        | 2,125 ms                     |

- The ring table, the median RGB of the ring at each radius, beside the reference.
  Task 6.2. The third pass's values are in its own design.

  | Radius   | The reference | This pass     | The third pass |
  | -------- | ------------- | ------------- | -------------- |
  | centre   | 255, 254, 244 | 238, 225, 205 | 250, 241, 221  |
  | 5,000    | 249, 238, 228 | 232, 217, 198 |                |
  | 9,000    | 241, 225, 212 | 220, 198, 185 |                |
  | 14,000   | 214, 188, 177 | 157, 133, 135 |                |
  | 20,000   | 166, 138, 146 | 122, 104, 109 |                |
  | 25,900   | 118, 99, 108  | 108, 93, 100  | 86, 73, 77     |
  | 32,000   | 74, 66, 76    | 69, 60, 69    |                |
  | 38,000   | 48, 47, 59    | 44, 40, 48    |                |
  | 44,000   | 32, 32, 41    | 25, 24, 31    | 18, 17, 21     |
  | corner   | 0, 0, 0       | 10, 9, 12     |                |

  The outer disc from 25,900 to 44,000 light years is much closer to the reference
  than the third pass reached. The core lost light, because the sprites carry part of
  the sum and the tone map holds the total. The rings from 14,000 to 20,000 light
  years are the largest remaining gap, about 40 values low.

- The measured sprite layers per target pixel at 1920x1080, over the half-resolution
  volume target, with 40,000 samples. Task 5.4.

  | View                | 2,000 ly | 12,000 ly | 20,000 ly | 30,000 ly | 120,000 ly |
  | ------------------- | -------- | --------- | --------- | --------- | ---------- |
  | over the centre     | 0        | 184.6     | 180.9     | 158.8     | 14.3       |
  | over Sol            | 0        | 134.6     | 107.9     | 81.0      | 10.2       |

  The zoom fade removes every sprite at 2,000 light years. From 12,000 to 30,000 light
  years the count falls by 14 percent over the centre and by 40 percent over Sol,
  where the tree before this change grew it 8 times. That is the fade at the cap doing
  its work. The whole frame costs at most 1.28 ms at these views.

- Whether the mid-distance smoothness of the inner disc, a volume matter the proposal
  measures and leaves, gets a pass of its own. The fade at the cap makes the clouds'
  part of it bounded either way.

- Whether the rings from 14,000 to 20,000 light years need a change in the volume. The
  sprites cannot close a gap of 40 values there without breaking the chunk band.
