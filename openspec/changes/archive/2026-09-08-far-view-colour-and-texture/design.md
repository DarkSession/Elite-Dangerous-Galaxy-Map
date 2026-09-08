## Context

See proposal.md for the gaps and the measurements behind them. The renderer after
`far-view-cloud-look` draws the volume at half resolution with a one-axis ramp keyed
by compressed density, then 40,000 cloud sprites with a colour keyed by zone, then the
points, then the glow, then the tone map. The look constants live in the shaders and
in `src/render/volume-pass.ts`, `src/render/cloud-pass.ts`, `src/render/glow-pass.ts`
and `src/render/composite-pass.ts`.

Facts that shape this pass, measured on the current tree at the default view,
1280x720, with the frame's corner colour subtracted. `bl` and `rg` are the chroma
measures of the proposal. A ring is the 72 projected points at that radius, read as
5 x 5 means, the same points the scenarios read.

- The light each pass carries, as the median luminance of the ring in 8-bit values,
  with that pass alone on. The tone map is not linear, so the columns do not add.

  | Ring   | Full frame | Volume | Clouds | Points | Volume and points |
  | ------ | ---------- | ------ | ------ | ------ | ----------------- |
  | 9,000  | 191        | 138    | 164    | 130    | 165               |
  | 14,000 | 126        | 88     | 102    | 26     | 93                |
  | 20,000 | 100        | 68     | 80     | 11     | 71                |
  | 26,000 | 86         | 59     | 67     | 7      | 61                |
  | 32,000 | 54         | 40     | 36     | 2      | 43                |
  | 38,000 | 31         | 23     | 17     | 0      | 25                |
  | 44,000 | 15         | 0      | 10     | 0      | 10                |

  The sprites carry as much light as the volume from 9,000 to 26,000 light years, in
  one flat colour, over the lanes the volume holds. The glow alone reads 0 at every
  ring, because its source is the volume and the clouds.

- The colour of the volume alone by luminance quartile. At 14,000 light years the
  dark quartile reads `rg` 0.064 and the bright quartile 0.067; at 20,000, 0.060 and
  0.066. The lanes are density minima in the model, so they hold less absorber, not
  more, and the extinction cannot redden them. The reference reddens them: 0.098
  against 0.036 at 14,000.
- The volume's compressed density by ring, from the model at the mid-plane through
  the shipped curve, as the 10th percentile, the median and the 90th: 9,000: 0.39,
  0.61, 0.77; 14,000: 0.16, 0.26, 0.62; 20,000: 0.094, 0.20, 0.26; 25,900: 0.057,
  0.16, 0.22; 32,000: 0.024, 0.064, 0.16; 38,000: 0.0005, 0.026, 0.080; 44,000:
  0.0000, 0.0001, 0.003. Sol reads 0.167. The haze key ends at 0.03 and the arm key
  begins at 0.004, so the ring at 32,000 is pink in the volume, and the dark lanes at
  14,000 share their range, 0.10 to 0.20, with the bright patches at 32,000. A one-axis
  ramp cannot give the two a different colour.
- The zone by ring, as the median: 9,000: 0.56; 14,000: 0.37; 20,000: 0.27; 25,900:
  0.21; 32,000: 0.10; 38,000: 0.05; 44,000: 0.002. The sprite colour keys the zone at
  4 times its value into the haze-to-arms mix and from 0.45 to 0.75 into the core, so
  the sprites at 32,000 are half haze and the rim sprites are all haze.
- The scene-linear luminance the tone map needs for a displayed value, from the
  inverse of the curve with the white level 0.95 and the display gamma 2.2, with the
  background added back to each ring median: the reference's ring at 14,000, 0.728
  displayed, needs 1.10 times the inverse exposure; the frame's, 0.532, needs 0.36.
  At 20,000 the reference needs 0.44 and the frame 0.20. At 32,000 the reference
  needs 0.057 and the frame 0.052. So the inner disc needs 2.2 to 3.1 times its
  scene-linear light with the outer disc unchanged. The centre reads 0.8875 and may
  rise to 0.97, which is 14 times its scene-linear light.
- Between the ring at 32,000 and the ring at 14,000 the density ratio rises 17 times,
  from 1.25e-3 to 2.13e-2, and the compressed density 4.1 times, an effective slope
  of 0.49 on a logarithmic scale. The reference asks for 19 times in scene-linear
  terms against the frame's 6.8, so the compressed density must rise about 11.6 times
  over the span, a slope of 0.87. The curve's low slope is 0.70 and its knee sits at
  a ratio of 4e-3, above the ring at 32,000, so the span crosses the knee: the part
  below 4e-3 runs on 0.70 and the part above it on 0.35, which gives the measured
  0.49. Raising the knee to 2.13e-2 puts the whole span on 0.70.
- The sprite layers per pixel beyond 40,000 light years, from the placement and the mean
  sprite disc area, read 36 with the shipped placement floor of 0.005. The placement
  takes the square root of the cell mass, so a floor of 0.001 leaves 22 layers, 0.0005
  leaves 17, and 0.0002 leaves 11. The rim contrast the reference shows, a 90th over
  10th percentile of 12.2, needs about 3 bright layers.
- The sum of N sprites with a common factor of variance V has a coefficient of
  variation of the square root of V over N. With a factor `(1 + k) * h^k` for a
  uniform `h`, V is `(1 + k)^2 / (2k + 1) - 1`: 3.8 at k = 8, 5.8 at k = 12. Added to
  the frame's own spread at 44,000 light years, which reads a coefficient of 0.18, 36
  layers at k = 12 give 0.44, a 90th over 10th percentile of about 3.5. The top tenth
  of the sprites then carries 75 percent of the light.
- The chunk measure at the three cloud blocks reads 0.0687, 0.1179 and 0.1089 against
  a band of 0.05 to 0.13. The blocks lie 20,900, 28,700 and 30,900 light years from
  the centre, where the median density ratio is above the ceiling, at the ceiling and
  at 2.7e-4, which is 2.7 times the floor. A spread that reaches the ring at 32,000
  raises the second and the third reading.
- The scenario values on the current tree that the new scenarios must move: the
  centre pixel red less blue 0.129 and green less blue 0.078; the ring medians less
  the corners 0.494 at 14,000, 0.393 at 20,000 and 0.212 at 32,000; the dark quartile
  `rg` 0.061 at 14,000 and 0.055 at 20,000, the bright quartile 0.055 at 14,000; the
  dark quartile `bl` 0.070 at 38,000 and 0.077 at 44,000, the bright quartile -0.013
  and +0.045; the 90th over 10th percentile 1.27 at 20,000 and 1.45 at 44,000; the
  clouds lift the median at 44,000 by 0.0203. The reference reads, by the same
  measure on its own 72 points: ring medians 0.673, 0.516 and 0.203; dark quartile
  `rg` 0.098 and 0.072, bright 0.036; dark quartile `bl` 0.149 and 0.198, bright
  -0.025 and -0.010; percentile ratios 2.15 at 20,000 and 12.2 at 44,000.
- The scenario values that must hold: the chunk band, the grain 0.0432, the halo
  0.0207, the patch contrast 2.56 and 2.69, the arm gap 0.191, the sky 0.081 and
  0.070, the bulge fall-off 0.043 and 0.216, and the frame budget, at most 1.28 ms.
- The 8-bit frame quantises the chroma of faint light. At 44,000 light years the dark
  quartile lies 4 values above the background, so one value is 0.08 of the sum; the
  5 x 5 mean over the dithered frame brings the step to about 0.01.

## Goals / Non-Goals

**Goals:**

- Red-brown lanes and a near-white core in the inner disc; a blue ground with pink
  patches in the outer disc; the ring luminance of the reference from 14,000 to
  20,000 light years; puffs that stand apart at the rim.
- Every current scenario still passes, with the grain and the halo reading at least
  0.045 and 0.025.
- No change to the scene data or the workers.

**Non-Goals:**

- No change to the placement, the radii or the ratio of the cloud set, and no change
  to the shape set.
- No change to the points beyond the shared core colour constant and the zone key of
  that colour, `ZONE_SCALE`, which moved from 4 to 6 in the cloud and the point shader
  together. The two shaders key different colour pairs on the same zone, so the shared
  key is a choice of the tuning, not a constraint. See "Departures from this design".
- No match with the reference pixel for pixel, and no match of the reference's hue at
  every ring: the scenarios pin the quartile chroma at four rings and the centre.

## Decisions

### A second ramp axis by galactocentric radius

The volume's tint becomes `mix(inner(c), outer(c), smoothstep(R_IN, R_OUT, radius))`,
where `c` is the compressed density and `radius` is the distance from the galactic
centre in the plane, which the shader already computes for the rim fade. `inner` runs
LANE, the red-brown dust colour, at low `c` through BAND to CORE; `outer` runs HAZE
at low `c` to ARMS. The name LANE is chosen because `volume.frag` already declares
DUST for the extinction colour. The keys of each ramp are in compressed density and
the design starts them at: LANE to BAND from 0.10 to 0.30, BAND to CORE from 0.42 to
0.68; HAZE to ARMS from 0.02 to 0.10.
The blend radii start at 20,000 and 30,000 light years, inside the spec's bounds of
14,000 and 32,000.

The alternatives, and why not:

- **A stronger extinction.** The reference's lanes look like dust, so a first reading
  says the extinction should redden them. The measurement says no: the lanes are
  density minima in the model, they hold less absorber, and the volume alone reads
  the same `rg` in its dark and its bright quartile at 14,000 light years.
- **A one-axis ramp with moved keys.** The dark lanes at 14,000 light years and the
  bright patches at 32,000 share the compressed range 0.10 to 0.20, and the reference
  gives them opposite hues: red-brown and pink-neutral on blue. One axis cannot do
  both.
- **The zone.** The zone is a function of the corrected surface density, so it is a
  second reading of the same axis, and the volume has no zone texture.

The reference is a painting, coloured by region, and the radius is the region.

### The knee moves outward

The spec allows the knee between the density at Sol, ratio 4e-3, and the density at
14,000 light years, ratio about 2e-2. The design starts at 2e-2 with the exposure raised
to hold the ring at 32,000 light years. At that knee the compressed density at 32,000
light years falls to 0.036 from 0.064. At 14,000 it stays at 0.26, the knee's own value.
The exposure rises 1.8 times to restore 32,000. That lifts 14,000 by 1.8 times in
scene-linear terms, against the 2.9 the reference asks. The low slope may then rise from
0.70 toward 0.87 to close the rest; that also lifts the patch contrast at 32,000 and
38,000, which the reference reads at 3.9 and 4.5 against the frame's 2.6 and 2.7. The
arm gap scenario bounds the slope from above. The gap must stay above 0.10. The ring at
20,000 light years sits at a ratio near 1e-2. That ratio is inside the span the knee
move puts on the low slope, so its patch contrast rises with the same power. The volume
alone reads 1.49 there. The low slope doubles its logarithmic contrast to about 2.2. The
sprites' flat light brings 1.49 down to 1.27 today, and it would bring 2.2 down to about
1.6. So the scenario's 1.6 at 20,000 is the estimate, not a margin. The sprites' inner
share is not a lever this change has. If the reading is short, the value goes to the
human.

The alternative, a third slope between two knees, gives the same curve with one more
constant, and the two-slope curve already has the freedom the scenario needs. If the
tuning cannot reach the ring at 14,000 with the knee at the spec's outer bound and the
slope at 0.87, the design records the value reached and the proposal's scenario
threshold is the open question for the human, not a constant to move quietly.

### A brightness spread keyed on the held ratio

The vertex shader multiplies the sprite brightness by `mix(1.0, (1.0 + k) * pow(h, k),
s)`, where `h` is a third hash of the sample index, `k` is the spread power, and `s` is
`1 - smoothstep(floor, 3 * floor, ratio)` on the held ratio. The factor has mean 1 for
any `k`, so the sum of the sprites is unchanged in expectation and the bounded-sum
scenario holds. The design starts at `k` = 12, from the context's arithmetic, which
gives a 90th over 10th percentile of about 3.5 at the rim. The rim scenario's floor is
2.5, the same as the patch contrast floor at 32,000 and 38,000: the prediction of 3.5 is
an estimate of a sum over layers the context counts by disc area, and a floor of 3 would
leave it no margin, while 2.5 still stands well above the frame's 1.45 and far below the
reference's 12.2. The key on the ratio keeps the spread off the inner disc. It keeps it
nearly off the ring at 32,000 light years, whose median ratio is 2.7 times the floor,
where the key reads 0.06. The chunk band's third block is the block the spread reaches.
That block sits at 30,900 light years with a median ratio of 2.7e-4, and it reads 0.1089
against the ceiling of 0.13. The second block, at the ceiling ratio, is out of the
spread's reach. If the third block rises past 0.12, the spread power drops. The rim
scenario's floor of 2.5 leaves the predicted 3.5 room for that.

The alternatives, and why not:

- **A lower placement floor.** Measured in the context: the square root in the
  placement makes it a weak lever, 36 layers to 11 at a floor 25 times lower, and it
  changes the scene data and the scene-data spec.
- **Smaller radii at the rim.** Cuts the layers in proportion to the area, but also
  changes the scene data, and the reference's rim puffs are not smaller than its arm
  puffs.
- **A spread everywhere.** Raises the chunk measure at the second block, which reads
  0.118 against a ceiling of 0.13.

The code bounds this spread, gives it a ground and keeps the brightness falling below
the floor, and it fades the sprites out at the rim. Read "Departures from this design"
below for what the tree does and why.

### The sprite carries two colours where the spread applies

The vertex shader passes two values to the fragment shader beside the zone: `t`, the
spread factor over its maximum `(1 + k)`, and `s`, the spread key. The fragment
shader computes the colour by zone as today, `mix(HAZE, ARMS, clamp(zone * 4, 0, 1))`,
and the spread colour `mix(HAZE, PATCH, t)`, blends them as
`mix(zoneColour, spreadColour, s)`, and then mixes toward CORE by zone as today. A
sprite with a small factor at the rim is the blue ground; a sprite with a large
factor there is a pink puff. Where `s` is 0, the inner disc and the ring at 32,000
light years, the sprite keeps its colour by zone, so the spread power `k` sets the
rim contrast alone and does not move the inner disc's hue. The PATCH colour is the
volume's ARMS. The alternatives, and why not: a fixed colour per sprite by zone is
today's shader and gives blue puffs at the rim, because the rim's zone is 0; the
spread colour without the key on `s` gives the inner disc a factor of 1 and a colour
`mix(HAZE, PATCH, 1 / (1 + k))`, which is 92 percent haze at k = 12, and the sprites
carry the larger share of the light there.

The code keeps this rule over the outer disc only. Over the inner disc the sprite
carries the volume's inner ramp instead of one colour by zone. Read "Departures from
this design" below.

### A near-white core in three shaders

CORE moves from (1.00, 0.94, 0.78) toward (1.00, 0.97, 0.92) in `volume.frag`,
`clouds.frag` and `points.frag`, which must stay equal by name. The centre scenario's
window, red less blue 0.03 to 0.10 and green less blue 0.02 to 0.07, brackets the
reference's 0.04 and 0.04 and rejects the frame's 0.13 and 0.08.

### The glow tint may rise

The glow is tinted toward HAZE by `DEFAULT_GLOW_TINT` = 0.15. The blue ground at
44,000 light years, where the volume reads 0, comes from the faint sprites and the
glow, so the tint may rise toward 0.4 if the dark quartile `bl` does not reach 0.10
from the sprites alone. The halo scenario's ceiling of 0.05 and the sky scenarios
bound the weight, which stays at 9.0 unless the halo floor asks for more.

The tint is 0.8 in the tree and the weight is 6.0. Read "Departures from this design"
below.

### Scenario helpers

`e2e/helpers.ts` gains `ringColour5(page, radius)`: the 5 x 5 mean colour at the 72
ring points less the mean corner colour, as `[red, green, blue]` triples in 0 to 1,
computed inside the page as `ringSpread` does. The chroma scenarios and the ring
luminance scenario derive from it in the test: luminance by the Rec. 709 weights,
`bl` and `rg` per point, the sort by luminance, and the medians of the first and the
last 18 points. `ringSpread` stays for the percentile scenarios. The 5 x 5 mean is
the same window every ring scenario reads, and the corner subtraction is the same as
in `ringSpread`, so the readings compare with the proposal's table.

### Tuning order

At every step, a new threshold the levers cannot reach goes to the human as an open
question with the value reached and the constants; no threshold in the spec or the tests
moves in the tuning. Task 2.3 states the rule for the ring at 14,000 light years, and it
applies to every scenario this change adds.

1. The core colour and the centre window, with the bulge fall-off and the colour
   scenario at 9,000 light years watched.
2. The knee and the exposure, then the low slope, until the ring luminance scenario
   passes, with the arm gap, the patch contrast, the sky and the centre window watched,
   because a higher exposure pushes the centre toward the white level and toward the
   window's lower colour bounds. If the ring at 14,000 light years does not reach 0.56
   with the knee at 2.13e-2 and the low slope at 0.87, stop and report the value
   reached; the threshold is not a constant to move.
3. The ramp keys and the blend radii, until the lane and the haze scenarios pass.
4. The spread power and the sprite colour, until the rim scenarios pass, with the
   chunk band, the bounded sum and the rim light watched.
5. The glow tint, if the dark quartile at 44,000 light years is short of blue.
6. The grain and the halo margins: `DEFAULT_POINT_BRIGHTNESS` in
   `src/render/renderer.ts` and `DEFAULT_GLOW_WEIGHT` in `src/render/glow-pass.ts`,
   until the grain reads at least 0.045 and the halo at least 0.025. The brighter
   inner disc from step 2 lowers the relative grain at Sol, so the point brightness
   is the lever that restores it.
7. The frame budget rerun, the baseline, and the tables in this design.

## Risks / Trade-offs

- [The knee and the slope raise the whole disc below the knee, and the exposure
  lowers the core] → the centre window has room up to 0.97, and the bulge fall-off
  scenario reads 0.043 and 0.216 against 0.03 and 0.05; the tuning watches both.
- [The spread lowers the median lift at the rim below 0.01] → the rim light scenario
  now reads the 90th percentile as well, with the median floor at 0.005; the
  reference's own median at 44,000 light years sits 0.017 above its background.
- [The spread reaches the third chunk block, at 30,900 light years, and lifts its
  reading past 0.13] → the key on the ratio ends at three times the floor, the block
  readings are watched at every step, the target is at most 0.12 at the third block, and
  the spread power is the lever if it rises.
- [The chroma at 44,000 light years is quantised, to a step of about 0.01 after the 5 x
  5 mean] → the dark floor of 0.10 sits 0.023 above the frame's 0.077 and 0.098 below
  the reference's 0.198; the bright ceiling is 0.02, two steps above the reference's
  -0.010 and 0.025 below the frame's 0.045.
- [The colour scenario at 9,000 light years reads one pixel, and a whiter bulge
  lowers red less green there] → the floor of 0.05 stays: the reference reads a raw
  red less green of 0.106 at that pixel and a ring median of 0.067, and the frame
  reads 0.118; the tuning reads it at every step.
- [A whiter core and brown lanes change the glow's colour, which feeds the halo] →
  the halo scenario has a ceiling of 0.05 as well as its floor.
- [The baseline changes wholesale] → it is regenerated once at the end, after the
  frame budget rerun, and the tables record what the frame reads.

## Departures from this design

The tuning found eight places where this design's plan did not hold. Each one is in
the tree, and the spec delta says what the code does.

- **The spread has a bound.** The design multiplies the brightness by a factor with no
  bound. The code takes the smaller of that product and the brightness of a sprite at
  the ceiling ratio, so the spread modulates the density and is never the source of a
  puff.
- **The spread has a ground.** The design puts every sprite of the outer disc in the
  lottery. The code holds a share of the light out of it, `CLOUD_SPREAD_BASE` = 0.35,
  and spreads the rest, so the mean stays 1. Without the ground the outer disc has no
  blue ground at all: every sprite that carries light is a winner of the lottery, and
  every winner takes the patch colour, so the whole haze reads pink. With the ground
  the faint sprites lay the blue haze and the winners are the puffs on it.
- **The brightness keeps falling below the floor.** The design holds the ratio flat at
  the floor. The code multiplies by the ratio over the floor raised to a third and
  gentler power, `CLOUD_FLOOR_POWER` = 0.3, so a sprite where the arms end is brighter
  than one in empty space and the sprites past the model's truncation go faint.
- **The sprite brightness fades at the rim.** The code fades the brightness by
  galactocentric radius, full at 44,000 light years and zero at 48,000, from a new
  `uCentre` uniform that the renderer feeds from the centre of the volume box in the
  camera-relative frame. The reason: at a spread power of 200 the user saw bright
  puffs outside the perimeter of the galaxy and in regions that are not dense. A
  mean-preserving spread over a flat floor puts a few sprites at up to `1 + k` times
  their brightness wherever the held ratio is at the floor, which is the empty space
  between the outer arms and the placement region out to 50,000 light years, past the
  painted rim. So the spread as first tuned put light where the density is lowest. The
  bound, the ground, the fall below the floor and this fade correct that together, and
  the power stays at 12.
- **The sprite carries the whole ramp, not one colour by zone.** The design gives the
  sprite one colour by zone and a second where the spread applies. Over the inner disc
  that lays one flat colour over the mottling, and the lane scenario cannot pass. The
  code gives the sprite the volume's two ramps and the same blend by galactocentric
  radius, 20,000 to 32,000 light years. Over the inner disc it runs from the lane
  colour to the band colour with the zone, keyed from 0.22 to 0.36, because the zone is
  a lookup on the log of the surface density and so keys the lanes at both 14,000 and
  20,000 light years. Over the outer disc it keeps the colour by zone and the spread
  colour, as the design says.
- **The zone key opens wider, and the volume's core key closes later.** `ZONE_SCALE`
  moves from 4 to 6 in `clouds.frag` and `points.frag`, which puts the bright patches
  of the outer disc on the arm colour and its faint ones on the haze. In `volume.frag`
  the core key runs from 0.24 to 0.95 instead of 0.42 to 0.68. The late end is the one
  lever that deepens the bulge fall-off without dimming the disc at 14,000 light years:
  it darkens the ring at 5,000, where the compressed density is 0.76 to 0.88, and
  leaves the centre at 1.0 white.
- **The high slope moved as well.** The design moves the knee and the low slope only.
  `GAMMA` also moves, from 0.35 to 0.34, to hold the ring at 14,000 light years above
  its floor. The knee stays at 2.13e-2 and the low slope at 0.87, as the design says.
- **The glow tint and weight.** The tint is 0.8, not the 0.4 the design names as its
  bound, because the blue ground at 38,000 light years comes mostly from the glow. The
  weight is 6.0, not 9.0, because the halo scenario has a ceiling of 0.05 as well as a
  floor and the tint raises the halo.

The design's estimate that a spread power of 12 gives a 90th to 10th percentile ratio
of about 3.5 at the rim ignored the display gamma. The frame is drawn with a gamma of
1 over 2.2, so a displayed ratio of 2.5 needs a linear ratio of 2.5 raised to 2.2,
which is 8.6. The tuned frame reads 1.76.

## Open Questions

The tuning answered the three questions below. The tables record the tuned tree.

### The constants

| Constant                                     | Was            | Is             |
| -------------------------------------------- | -------------- | -------------- |
| `GAMMA` (volume.frag)                        | 0.35           | 0.34           |
| `LOW_GAMMA`                                  | 0.70           | 0.87           |
| `KNEE`                                       | 4.0e-3         | 2.13e-2        |
| `HAZE` (volume, clouds)                      | 0.42 0.40 0.78 | 0.26 0.30 1.00 |
| `ARMS`                                       | 0.90 0.60 0.62 | 0.90 0.60 0.62 |
| `LANE` (volume, clouds)                      | —              | 1.36 0.66 0.62 |
| `BAND`                                       | 1.00 0.70 0.66 | 1.00 0.78 0.78 |
| `CORE` (volume, clouds, points)              | 1.00 0.94 0.78 | 1.00 0.97 0.92 |
| `LANE_LOW` / `LANE_HIGH` (volume, on density)| —              | 0.08 / 0.20    |
| `CORE_LOW` / `CORE_HIGH` (volume)            | 0.42 / 0.68    | 0.24 / 0.95    |
| `PATCH_LOW` / `PATCH_HIGH` (volume)          | —              | 0.005 / 0.030  |
| `BLEND_IN` / `BLEND_OUT` (volume, clouds)    | —              | 20000 / 32000  |
| `LANE_ZONE_LOW` / `LANE_ZONE_HIGH` (clouds)  | —              | 0.22 / 0.36    |
| `ZONE_SCALE` (clouds, points)                | 4.0            | 6.0            |
| `CORE_LOW` / `CORE_HIGH` (clouds, points)    | 0.45 / 0.75    | 0.45 / 0.75    |
| `RIM_FULL` / `RIM_ZERO` (clouds.vert)        | —              | 44000 / 48000  |
| `HAZE_TINT` (blur.frag)                      | 0.97 0.93 1.81 | 0.76 0.88 2.92 |
| `DEFAULT_EXPOSURE`                           | 0.026          | 0.0425         |
| `DEFAULT_CLOUD_BRIGHTNESS`                   | 0.68           | 0.60           |
| `CLOUD_SPREAD_POWER`                         | —              | 12             |
| `CLOUD_SPREAD_BASE`                          | —              | 0.35           |
| `CLOUD_SPREAD_COLOUR`                        | —              | 2.5            |
| `CLOUD_FLOOR_POWER`                          | —              | 0.3            |
| `DEFAULT_GLOW_WEIGHT`                        | 9.0            | 6.0            |
| `DEFAULT_GLOW_TINT`                          | 0.15           | 0.8            |
| `DEFAULT_POINT_BRIGHTNESS`                   | 70             | 60             |

### What the browser scenarios read

| Scenario                          | Reading                                  | Bound                |
| --------------------------------- | ---------------------------------------- | -------------------- |
| Centre luminance                  | 0.9156                                   | 0.80 to 0.97         |
| Centre red less blue              | 0.0745                                   | 0.03 to 0.10         |
| Centre green less blue            | 0.0353                                   | 0.02 to 0.07         |
| Sol luminance                     | 0.3413                                   | above 0.20           |
| Space outside                     | 0.0605                                   | below 0.12           |
| Red less green at 9,000 ly        | 0.0980                                   | at least 0.05        |
| Median blue less red at 38,000 ly | 0.0353                                   | at least 0           |
| Bulge fall-off                    | 0.0317 and 0.1659                        | 0.03 and 0.05        |
| Arm gap                           | 0.1949, below Sol                        | above 0.10           |
| Patch contrast 20,000 ly          | 1.25                                     | 1.6, not reached     |
| Patch contrast 32,000 ly          | 3.06                                     | 2.5                  |
| Patch contrast 38,000 ly          | 2.87                                     | 2.5                  |
| Inner disc 14,000 / 20,000 / 32,000 | 0.5618 / 0.4503 / 0.2017               | 0.56 / 0.42 / 0.12 to 0.22 |
| Lanes 14,000 ly dark / bright     | 0.0834 / 0.0421                          | 0.08 / 0.045         |
| Lanes 20,000 ly dark              | 0.1090                                   | 0.065                |
| Haze 38,000 ly dark / bright      | 0.1083 / -0.0001                         | 0.10 / 0.02          |
| Haze 44,000 ly dark / bright      | 0.1790 / 0.0954                          | 0.10 / 0.02, bright not reached |
| Rim puffs 44,000 ly               | 0.0376 and 0.0662, a ratio of 1.76       | 2.5, not reached     |
| Rim light, median and 90th lift   | 0.0123 and 0.0234                        | 0.005 and 0.02       |
| Clouds carry light                | 0.1568                                   | at least 0.03        |
| Chunk band from above             | 0.0705, 0.1139, 0.1148                   | 0.05 to 0.13         |
| Bulge top                         | 0.0375                                   | at most 0.05         |
| Background corners                | 0.0370 to 0.0401                         | 0.02 to 0.06         |
| Grain at Sol                      | 0.0479                                   | above 0.04           |
| Halo lift                         | 0.0289                                   | 0.02 to 0.05         |

### The rings against the reference

The chroma is the ring median of red less green and of green less blue, each over the
sum of the three channels, from the 5 x 5 means less the mean corner. The reference
sits on black and the frame sits on the game's dark grey, so the luminance column is
the frame's alone.

| Radius    | Frame red less green | Reference | Frame green less blue | Reference | Frame luminance |
| --------- | -------------------- | --------- | --------------------- | --------- | --------------- |
| 9,000 ly  | 0.029                | 0.024     | 0.018                 | 0.019     | 0.806           |
| 14,000 ly | 0.055                | 0.045     | 0.009                 | 0.019     | 0.562           |
| 20,000 ly | 0.088                | 0.062     | 0.008                 | -0.018    | 0.450           |
| 26,000 ly | 0.084                | 0.059     | -0.002                | -0.028    | 0.378           |
| 32,000 ly | 0.049                | 0.037     | -0.056                | -0.046    | 0.202           |
| 38,000 ly | 0.024                | 0.007     | -0.114                | -0.078    | 0.097           |
| 44,000 ly | 0.004                | 0.000     | -0.157                | -0.086    | 0.049           |

### What the tuning could not reach

Three thresholds stand unreached. No threshold in the spec or the tests moved.

- **The patch contrast on the ring at 20,000 light years reads 1.25 against 1.6.** The
  sprites hold one brightness over the inner disc, because the held ratio is at the
  ceiling from the bulge out to about 25,900 light years, and they carry more than half
  the light there. The ceiling is what keeps the bulge fall-off, so raising it to give
  the ring its contrast needs a rebalance of the whole sprite brightness.
- **The bright quartile of the ring at 44,000 light years reads 0.0954 of blue less red
  against 0.02.** The light at that radius is the glow's halo and the faint ground of
  the sprites; the pink puffs are there, and the rim light scenario measures them, but
  they do not carry the bright quartile of the ring. The glow tint of 0.8 lifts blue
  less red over the whole ring, the bright half with the dark one, so lowering the tint
  is the lever that would bring the bright quartile down. The dark quartile of the ring
  at 38,000 light years reads 0.1083 against its floor of 0.10, and that floor holds it.
  So the tint cannot come down, and the two bounds of the same scenario conflict at the
  tuned tree.
- **The puffs at the rim read a 90th to 10th percentile ratio of 1.76 against 2.5.** The
  model truncates at 38,900 light years and the surface density on the ring at 44,000
  runs from 5.7e-8 to 3.1e-6 of the peak, so the density carries almost no contrast
  there and the glow lays a smooth floor under the ring. A spread power large enough to
  carry the ratio puts light where the density is lowest, which is the regression this
  change already corrected.
