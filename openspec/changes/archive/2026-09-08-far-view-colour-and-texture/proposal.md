## Why

The owner's review of `far-view-cloud-look` says the frame is a large step toward the
reference and names what remains: the galactic centre region has red and brown tones
in the reference that the frame lacks, the arms are bluer in the reference, and the
clouds need a small further pass. The last change's design left two open questions
that belong to the same pass: the rings from 14,000 to 20,000 light years read about
40 values low, and the grain and the halo scenarios pass by margins of 0.003 and
0.0007.

The measurements behind that, on the reference and on the current tree at the default
view, 1280x720. The reference is sampled at 12.65 pixels per 1,000 light years and the
frame at 7.84. Each ring is 72 or more points on the circle at that radius in the
plane, read as 5 x 5 means with the frame's corner colour subtracted. Chroma is in the
displayed frame: `bl` is blue less red over the sum of the three channels, `rg` is red
less green over the same sum. A quartile is the quarter of the ring's points with the
lowest or the highest luminance.

| Gap                 | Measurement                                                                                                                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| centre not white    | The centre pixel reads 238, 225, 205 on the frame and 255, 254, 244 on the reference: red less blue 0.13 against 0.04, green less blue 0.08 against 0.04                                                                      |
| lanes not red-brown | At 14,000 light years the dark quartile reads `rg` 0.098 on the reference and 0.061 on the frame; the bright quartile 0.036 against 0.055. The reference's lanes are redder than its patches; the frame's are the same colour |
| lanes not red-brown | At 20,000 light years the dark quartile reads `rg` 0.072 on the reference and 0.055 on the frame                                                                                                                              |
| inner disc dark     | The ring median luminance less the corners reads 0.67 at 14,000 and 0.52 at 20,000 on the reference, 0.49 and 0.39 on the frame; at 32,000 the reference reads 0.20 and the frame 0.21                                        |
| inner disc smooth   | The 90th over the 10th percentile of the ring readings at 20,000 light years is 2.15 on the reference and 1.27 on the frame                                                                                                   |
| outer haze not blue | The dark quartile reads `bl` 0.149 at 38,000 and 0.198 at 44,000 on the reference; the frame reads 0.070 and 0.077                                                                                                            |
| rim puffs blue      | The bright quartile at 44,000 reads `bl` -0.010 on the reference and +0.045 on the frame: the reference's puffs are pink on a blue ground, the frame's are blue on a blue ground                                              |
| rim puffs merged    | The 90th over the 10th percentile at 44,000 light years reads 12.2 on the reference and 1.45 on the frame; the frame's sprites lie about 36 deep there                                                                        |
| thin margins        | The grain scenario reads 0.0432 against its floor of 0.04, and the halo 0.0207 against its floor of 0.02                                                                                                                      |

Where the colour comes from, on the frame at the same rings, one pass at a time: at 14,000 light years the volume alone reads a dark quartile `rg` of 0.064 and a bright
quartile of 0.067, so the volume's ramp gives the lanes no colour of their own. The
volume's blue haze key ends at a compressed density of 0.03, and the ring at 32,000
light years reads a median compressed density of 0.064, so the outer disc's smooth
light takes the pink arm colour, not the haze colour. The sprites take the haze colour
where the zone is low, which is the rim, so the puffs there are blue. At 14,000 light
years the sprites carry as much light as the volume, in one flat colour.

## What Changes

- The volume ramp gains a second axis. Inside the inner disc the ramp runs from a
  red-brown dust colour through the salmon band to a near-white core; in the outer
  disc it runs from the blue-violet haze to the pink arm colour. The galactocentric
  radius blends the two, so the lanes at 14,000 light years are red-brown and the
  space between the patches at 38,000 is blue. The core colour moves toward white in
  every shader that carries it.
- The volume's curve keeps its two slopes, and the knee may move outward from the
  density at Sol toward the density at 14,000 light years, with the exposure re-set,
  so the inner disc holds the light the reference shows without a change to the
  outer disc.
- Each cloud sprite gains a brightness spread: a heavy-tailed factor with mean 1 from
  the sprite's hash, applied in full where the density ratio is at the floor and not
  at all above three times the floor. Most rim sprites then go faint and a few carry
  the light, so the puffs at the rim stand apart. Where the spread applies, the faint
  sprites take the haze colour and the bright ones the patch colour, so the rim reads
  as pink puffs on a blue ground; elsewhere the sprite keeps its colour by zone, so
  the inner disc's light keeps its hue. The spread is bounded, so it never lifts a
  sprite above the brightness of a sprite at the ceiling ratio, and it sits over a
  fixed ground that stays out of it, so the faint sprites still lay the haze; below the
  floor the brightness keeps falling with a gentler power, and the sprites fade out
  from 44,000 to 48,000 light years, so no sprite carries light outside the painted
  rim.
- The scenarios change: the centre pixel gets a colour window that admits the
  reference's near-white; new scenarios pin the inner disc's ring luminance, the
  red-brown lanes, the blue outer haze with pink patches, and the rim puff contrast;
  the patch contrast scenario adds the ring at 20,000 light years; the rim light scenario reads the 90th percentile as well as the median, and its median floor drops from 0.01 to 0.005, because the spread moves light from the median to the puffs; the reference's own median at 44,000 light years sits 0.017 above its background.
- The tuning targets a margin on the two thin scenarios: grain at least 0.045 and halo at least 0.025, with those two thresholds unchanged. The point brightness constant may
  move for the grain: the brighter inner disc lowers the relative grain at Sol, and
  the points are what gives the disc its grain.
- The baseline image is regenerated, and the design records the ring tables against
  the reference again.

Non-goals: no change to the scene data, the cloud set's placement, its radii or its
density ratio; no change to the point pass except the shared core colour constant, the
zone key of that colour and the point brightness constant, and the zone key moved with
the cloud shader's key as a choice of the tuning, not a constraint (see "Departures
from this design" in design.md); no change to the camera, the dither or the frame
budget; no procedural noise in the volume; no match with the reference pixel for pixel. The placement floor was measured
as a lever for the rim and rejected: the placement takes the square root of the cell
mass, so a floor 25 times lower leaves 11 sprite layers at the rim against 36 today,
and the reference's puffs need about 3.

Scale: the change adds one hash read and a few multiplies per sprite vertex over
40,000 sprites, and one smoothstep per raymarch step over 96 steps at half
resolution. The frame budget scenarios stay as they are and are rerun.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `far-view-rendering`: the scene pass requirement changes its ramp to two ramps
  blended by galactocentric radius and a near-white core, allows the knee to sit
  between the density at Sol and the density at 14,000 light years, widens the centre
  colour window, adds the ring at 20,000 light years to the patch contrast scenario,
  and gains three colour and luminance scenarios; the cloud sprite requirement gains the brightness spread and
  the two-colour sprite, a rim contrast scenario, and a rim light scenario that reads
  the 90th percentile.

## Impact

- `src/render/shaders/volume.frag`: the second ramp axis, the knee and the core
  colour.
- `src/render/shaders/clouds.vert` and `src/render/shaders/clouds.frag`: the spread
  and the two-colour sprite.
- `src/render/shaders/points.frag`: the shared core colour constant.
- `src/render/cloud-pass.ts`, `src/render/volume-pass.ts`,
  `src/render/composite-pass.ts`, `src/render/glow-pass.ts` and
  `src/render/renderer.ts`: the look constants the tuning moves, including the point
  brightness, with the values recorded in the design.
- `e2e/helpers.ts`: a ring colour helper. `e2e/look.spec.ts`: the changed and the new
  scenarios. `e2e/look.spec.ts-snapshots/`: the baseline image.
- `docs/roadmap.md`: the rendering bullet and the changes list.
- No new dependency. No change under `src/scene-data/` or `src/galaxy-model/`.
