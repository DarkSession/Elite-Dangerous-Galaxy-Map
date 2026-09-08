## Why

The third pass added cloud sprites so the haze has chunks. The owner's review of the
result says the clouds do not look like the reference image from far away. The reference
builds its haze from many overlapping cloud puffs: irregular in outline, mottled inside,
from a few hundred to several thousand light years across, and present out to the rim.
The current frame draws 10,000 round discs of one size, placed by the density, so each
disc shows as a separate dot on the smooth volume, and the rim has none.

The measurements behind that, on the reference and on the current tree at the default
view, 1280x720. The reference is sampled at 12.65 pixels per 1,000 light years and the
frame at 7.84, so every window below is in light years.

| Gap                    | Measurement                                                                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| one size               | Band-passed power in the annulus 28,000 to 44,000 light years, by wavelength: the reference holds 0.14 at 1,000 to 2,000 light years and 0.16 at 2,000 to 4,000; the frame 0.06 and 0.31; the clouds alone 0.05 and 0.46 |
| dots, not puffs        | The spec's chunk measure at its three blocks, 5 x 5 less 41 x 41 over the block mean: the frame reads 0.150, 0.220 and 0.206, and 0.102, 0.177 and 0.157 with the clouds off; the reference reads 0.066 to 0.093 at those radii |
| dots, not puffs        | Sprite layers per target pixel at the default view: 1.97, so most sprites stand alone                                                                                             |
| shape                  | The sprite is `(1 - r^2)^2` on a disc; the reference's puffs have ragged outlines and mottled interiors, seen in enlarged crops                                                    |
| no clouds at the rim   | 0.8 percent of the sprites lie beyond 30,000 light years from the centre and 0.1 percent beyond 40,000; the clouds alone add 0.001 to the luminance at 44,000 light years         |
| no clouds at the rim   | At 44,000 light years the reference reads a mean of 0.123 with puffs 3.5 times its median; the frame reads 0.037                                                                  |
| no bound near the cap  | Sprite layers per target pixel grow from 2 at 60,000 light years to 16 at 30,000 and 89 at 12,000 near the centre, and a capped sprite is brightened up to 4 times                |

The fine grain is not the gap: the 3 x 3 residual over the local mean reads 0.040 to
0.056 on the reference and 0.035 to 0.068 on the frame at the same rings.

## What Changes

- The scene data gains a cloud sample set beside the point cloud: up to 40,000
  samples placed by the cell mass of the surface table to the power 0.5, held at a
  floor that fades out at the rim, so the outer disc and the rim get clouds, with
  heights from the vertical profile. Each sample carries its zone, its radius in light
  years, drawn log-uniformly between 500 and 4,000, and the smooth surface density of
  its cell relative to the peak, so the renderer can restore the density's contrast.
- The cloud pass draws the cloud set instead of the first 10,000 point samples. Each
  sprite takes its shape from a set of 16 irregular shapes generated once from a fixed
  seed, with a rotation and a shape chosen per sprite. The brightness follows the
  sample's density and its radius through two powers the design states.
- A sprite whose wanted radius passes half the pixel cap fades out and is not drawn at
  the cap, in place of the gain bound, so the sum of the sprites stays bounded as the
  camera comes closer. The fade by zoom distance stays.
- The cloud requirement's scenarios change: the chunk measure from above gets a ceiling
  as well as a floor, both moved to what the reference reads; the chunks from the side
  get the same floor; two scenarios are added, for cloud light at the rim and for the
  bound on the wash at 12,000 light years. The shape set gets a requirement with unit
  test scenarios. The grain scenario's floor moves from 0.06 to 0.04, because the
  sprites lay light over the point grain and the reference's own grain reads a median
  of 0.053 by the same measure.
- The frame budget gains the two views at 30,000 light years, where the proposed set
  puts the most sprite layers on a pixel.
- The baseline image is regenerated, and the design records the ring table against
  the reference again.

Non-goals: no change to the volume pass, the point pass, the tone map or the camera;
no change to the glow except its weight, which may move if the halo scenario leaves its
band once the rim gains light, with the value recorded in the design; no colour change
beyond what the cloud brightness moves; no procedural noise in the volume. The noise this change adds is in the sprite shapes only, generated once
into a small texture, and the cloud positions stay samples of the density. The smooth
look of the inner disc between 20,000 and 30,000 light years is a volume matter: at
30,000 light years the volume alone reads a mean frame luminance of 0.243 with 10
percent of the pixels above 0.5, and this change does not touch it. No match with the
reference pixel for pixel.

The third pass rejected a second sample set from the worker because the same samples
served. They no longer do: the reference's rim is made of puffs, and a set placed by
the density holds 80 sprites over the 4,300 million square light years beyond 30,000.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `far-view-scene-data`: a requirement is added for the cloud sample set, its
  placement, its radii and its density ratio; the generation budget requirement gains
  the cloud set.
- `far-view-rendering`: the cloud sprite requirement changes to draw the cloud set
  with generated shapes, a size range, brightness by density and radius, and a fade
  at the cap, with the chunk scenarios moved to the reference's values and two
  scenarios added; a requirement is added for the shape set; the frame budget
  requirement gains the two views at 30,000 light years.

## Impact

- `src/scene-data/types.ts`, `src/scene-data/point-cloud.ts`,
  `src/scene-data/point-cloud.worker.ts`, `src/scene-data/messages.ts`,
  `src/scene-data/load.ts` and their tests: the cloud set.
- New `src/scene-data/cloud-set.ts` and its test: the cloud sample set.
- New `src/render/cloud-shapes.ts` and its test: the shape set.
- `src/render/buffers.ts`: cloud buffers of their own and the shape texture; the
  point buffers lose the cloud vertex array.
- `src/render/cloud-pass.ts` and a new `src/render/cloud-pass.test.ts`,
  `src/render/shaders/clouds.vert` and `src/render/shaders/clouds.frag`: the
  attributes, the hash, the shape lookup, the brightness and the fade at the cap.
- `src/render/renderer.ts` and `src/app/main.ts`: the cloud set upload.
- `e2e/helpers.ts`, `e2e/look.spec.ts`, `e2e/frame-budget.spec.ts` and the baseline
  image.
- `docs/roadmap.md`: the look bullet and the phase 1 rendering bullet.
- `src/render/glow-pass.ts`: the glow weight moves from 6.0 to 9.0, because the
  clouds feed the glow and the halo past the rim left its band.
- `openspec/specs/far-view-scene-data/spec.md`: the Purpose names all four data sets.
- No change to `src/galaxy-model/`, the data files, the volume, the points or the
  camera.

Scale: the scene stays at 2,000,000 point samples, a 256 x 64 x 256 volume and a
1024 x 1024 detail grid. The cloud set adds at most 40,000 samples, 800 KB of typed
arrays, drawn from the surface table the point cloud already builds, so the worker's
5 second budget holds. The shape set is 16 shapes of 64 x 64 texels, 64 KB, generated
in one task on the main thread inside the 100 ms bound. The cloud pass draws at most
40,000 sprites into the half-resolution target, each held under a radius of 64 target
pixels by the fade, so the worst-case fill is 515 million target pixels per frame.
Measured on the point cloud with the proposed placement and radii, the mean layers per
target pixel at 1920x1080 are 31 at the default view, 181 at 30,000 light years over
the centre and 150 to 188 at 12,000, against 2, 16 and 11 to 89 today. The cloud pass
costs 0.4 ms of a 1.5 ms frame at 12,000 light years today, at 89 layers, so the
proposed fill is about 1 ms and the worst case about 5 ms of the 16.7 ms budget. The
frame budget scenario measures it at ten views.
