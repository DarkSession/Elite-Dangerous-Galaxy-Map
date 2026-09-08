## Context

See proposal.md for the motivation. The far view is in the tree as change
`far-view-galaxy-render`: a compact analytic galaxy model with a 64 x 64 correction
grid, a point cloud of 2,000,000 samples, a 256 x 64 x 256 density volume, a WebGL2
renderer with a raymarched volume pass, an additive point pass and a luminance tone
map. The look constants live in the shaders and the baseline image pins them.

The measurements below come from the game's density map, a 2048 x 2048 grid of 48.8
light year texels over the model bounds, compared with the model that the repository
holds. The map is not in the repository and does not enter it.

| Grid over the bounds     | Cell            | Residual rms, log | Compressed size |
| ------------------------ | --------------- | ----------------- | --------------- |
| corrected model alone    | 1,562 ly (64)   | 0.223             | in the model    |
| plus 128 x 128 residual  | 781 ly          | 0.131             | 7 KB            |
| plus 256 x 256 residual  | 391 ly          | 0.097             | 25 KB           |
| plus 512 x 512 residual  | 195 ly          | 0.071             | 95 KB           |
| plus 1024 x 1024 residual | 98 ly          | 0.007             | 339 KB          |

The residual rms is measured at 1024 cells inside 44,000 light years of the centre.
The map keeps a residual of 0.068 rms at its own 2048 cells that no 1024 grid holds.
The model's zone lookup by density matches the game's zone map to 0.037 rms, so no
zone raster is needed.

The current default frame has a fine grain of about 0.03 of the local luminance in the
disc, measured as the standard deviation of the residual after a 3 x 3 box blur over
a 24 x 24 pixel block, divided by the block mean. The blur reads the pixels one
beyond the block, so the block's border pixels have full neighbourhoods.

## Goals / Non-Goals

**Goals:**

- The painted texture of the game's map at the far view's pixel scale, from data,
  with no procedural noise.
- The tones of the reference: cream bulge, pink-brown arms, lit space between the
  arms, brown dust, a violet halo, a dark grey background, grain.
- The same data path as before: the model and the scene data produce typed arrays,
  the renderer reads them, and neither side imports the other.
- The frame budget and the scene-data budget of the first change, unchanged.

**Non-Goals:**

- Matching the reference pixel for pixel. The target is the same structures at the
  same brightness ratios.
- A change to the volume resolution, the point count, or the camera.
- A general post-processing framework. The glow is one pass with one purpose.

## Decisions

### A 1024-cell residual grid, as a PNG, layered on the correction grid

The detail is `ln((map + 300) / (model + 300))` per cell of a 1024 x 1024 grid over
the model bounds, where `map` and `model` are the cell averages and `model` is the
corrected surface density with the 64 x 64 grid applied. The cell is 98 light years.
The value is clipped to plus or minus 3 and quantised to 8 bits, the same convention
as the correction grid. It ships as a greyscale PNG of 347,358 bytes, stored as the
quantised value plus 128.

1024 cells, not 512: the far view's pixel is about 96 light years at the default
distance, and the residual at 512 cells is 0.071 against 0.007 at 1024. The cost is
339 KB against 95 KB. The 2048 map itself is 4 MB as bytes and holds texture below
the pixel.

Layered on the correction grid, not replacing it: the residual against the corrected
model is small, rms 0.22 and within plus or minus 2.4, so it quantises well at a scale
of 3. The fixture that pins the corrected density stays valid. The model keeps three
densities: analytic, corrected, detailed.

A PNG, not a raw byte file: a reviewer can open it, and Git and browsers handle it.
The decoder is small: the signature, the IHDR chunk, the IDAT chunks inflated through
`DecompressionStream('deflate')`, and the five PNG row filters. It rejects any image
that is not 1024 x 1024, 8-bit greyscale, non-interlaced. The encoder used filter type
2 on every row, but the decoder handles all five, so a re-encoded file still loads.

Alternative considered: decoding through `createImageBitmap` and an `OffscreenCanvas`.
Colour management can change the bytes, and the model layer would depend on a canvas.

Alternative considered: a raster of the full map at 2048 cells, 8-bit log-encoded,
instead of the model plus a residual. About 1.5 MB, and it drops the analytic
structure, the arm skeleton and the fixture. The residual keeps all three.

### The point cloud samples the detailed density

`buildSurfaceTable` evaluates the model at 1024 x 1024 cell centres over the bounds.
Those are the detail grid's cell centres, so the table samples the grid exactly at
its cells with no interpolation loss. The height draw does not change. The radial and
vertical distribution tests integrate the detailed surface density.

### Scene data carries a ratio grid, and the volume pass multiplies by it

The volume stays at 256 x 64 x 256 and encodes the corrected density. Baking the
detail into it would blur 98 light year cells into 391 light year texels. Raising the
volume to 1024 cells in the plane would cost 64 MB and a bake four times longer.

Instead the point cloud worker emits a surface detail grid: one `uint8` per cell of
the same 1024 x 1024 table, `round(127 * clamp(ln(detailed / corrected), -3, 3) / 3)
+ 128`. The worker has both densities at every cell centre from the table build, so
the grid costs one division and one logarithm per cell. The renderer uploads it as an
R8 texture with linear filtering, samples it at `vec2(local.x, 1.0 - local.z)` with
the same `z` flip as the volume texture, and multiplies the decoded volume density by
`exp(value)` at every step. The detail grid and the volume box cover the same bounds
in `x` and `z`, so the step's box coordinates index the texture directly.

The ratio is exact at cell centres. Between cells the texture interpolates in the
logarithm, and the volume interpolates in its own logarithm, so the product stays
smooth. Where the corrected density is near zero, the ratio clips at `exp(3)`; the
point cloud, which samples the detailed density itself, carries the rim there.

Alternative considered: a separable pair, a 1024-cell surface texture and a small
height-by-radius profile texture, with no 3D volume. Cheaper and sharper, but it puts
the model's separability into the renderer. A density source that is not separable
could not replace the data layer without a renderer change.

### Fade by radius, not by density

The old fade removed compressed values below 0.09. The space between the arms at
Sol's radius sits at about 0.2 of the arm density in the map, which is about 0.57 of
the arm's compressed value, inside the fade. The new fade keys on the galactocentric
radius of the step: full inside 47,000 light years, zero at 51,000. The map has no
texel beyond 47,000 light years except sparse rim fragments, and the model's analytic
tail beyond that is what the fade removes. The centre enters the shader as one uniform
in the camera-relative frame.

### Glow pass

After the volume pass, the renderer blurs the half-resolution volume target with a
separable 9-tap Gaussian, twice, into targets at one eighth of the frame. The first
round reads the half-resolution target, so it downsamples. The renderer adds the
result to the scene target with additive blending, scaled by a weight and a tint
toward the haze colour. The blur sigma is 4.5 percent of the frame height per round
at full resolution, 6.4 percent after the two rounds, so the halo has the same width
at every viewport size. The design first set 2 percent; the tuning session raised
it, see the open questions. Two targets at one
eighth resolution hold the ping-pong.

The glow gives three things the reference has and the density does not: a halo past
the rim, soft arm edges, and light in the space between the arms. It costs five
passes at 240 x 135 pixels at 1920x1080.

The renderer exposes a `glow` switch beside the `volume` and `points` switches, so
the browser test can read the same pixel with and without it. The scenario checks the
difference between the two readings, so it does not depend on the background grey.

Alternative considered: a halo term in the density. It would put a look choice into
the data layer and could not soften the arm edges.

### Tone map with a white level and a background

The curve stays `1 - exp(-L)` on the luminance, scaled to a white level below 1, so
the bulge tops out cream instead of white. The cream stop of the ramp moves so that no
channel clips at the white level. After the gamma curve the pass blends the colour
over a constant dark grey as `grey + (1 - grey) * colour`, so the background is not
black and faint light near the rim stays above it. A maximum would hide every pixel
below the grey. The white level, the grey and the ramp are look constants; the look
test checks the centre colour and the corners. The grey makes a test against black
pass with nothing drawn, so the smoke test in `e2e/render.spec.ts` compares the
centre and the brightest pixel with the mean of the four corners instead. The points
alone give a centre luminance of 0.79 today, so a margin of 0.3 holds.

### Coloured extinction

The extinction becomes a `vec3`, with the blue channel absorbed most and the red least.
The transmittance is tracked per channel. The alpha of the half-resolution target is
one minus the mean transmittance. This gives the brown dust lanes on the inner arm
edges. The strength ratio is a look constant.

### Grain from the points

The point pass keeps its count and its hash spread. The point brightness rises and the
volume emission falls, so the points carry a larger share of the light. The target is
a fine grain of at least 0.06 of the local luminance at Sol at the default view,
measured as in the context section. The tuning runs against the frame budget test and
the look test together.

### Testing

Unit tests decode the committed PNG in Node with the same decoder, check the grid's
hash against the fixture, and check the detailed density at the fixture's 203 points.
A texture test checks that the detailed density along an arm varies more than the
corrected density does, so a grid of zeros cannot pass. The scene-data tests check the
ratio grid at Sol and its transfer. The look test gains scenarios for the centre
colour, a dark point between the arms, the glow as the difference with and without
the switch, the grain and the corners. The smoke test that draws the points alone
compares with the corners, not with black, and fails when both scene passes are off. The baseline is regenerated after tuning and reviewed as an image.

## Risks / Trade-offs

- [The residual grid is committed data with no generator in the repository] → The
  fixture carries the SHA-256 of the file and of the decoded bytes, and 203 pinned
  values. A changed file fails the tests until a matching fixture replaces it.
- [The PNG decoder is project code and PNG has more features than it reads] → It
  reads one exact shape and rejects everything else with a named error. A unit test
  feeds it a 2 x 2 image.
- [One more texture fetch per raymarch step] → About 15 percent more work in the
  volume pass. The frame budget test measures it. If it fails, drop the step count
  before the resolution.
- [The grain target may not be reachable without a brighter disc than the reference]
  → The tuning session reports the reached value. If 0.06 needs a look that departs
  from the reference, the threshold is lowered in the spec with the reason stated.
- [The grey background lets a test against black pass with nothing drawn] → The
  smoke test measures the centre and the brightest pixel against the mean of the four
  corners with a margin of 0.3, and the glow scenario measures a difference.
- [The detail texture upload adds 1 MB to the main thread's startup] → Its own
  animation frame, like the other uploads, so no task exceeds 100 ms.
- [A glow at one eighth resolution shows blocks at the rim] → Linear upsampling of a
  Gaussian-blurred image is smooth. The baseline pins the result.
- [Archiving order] → This change modifies requirements of `far-view-galaxy-render`.
  That change is archived first, so the main specs exist when this one is archived.

## Open Questions

- The glow weight and tint, the white level, the extinction colour and the point
  brightness. They tune the look inside the scenarios and do not change the specs.
  The tuning session reached these values:

  | Constant          | Value                      | Where                       |
  | ----------------- | -------------------------- | --------------------------- |
  | volume emission   | 3.0e-4                     | `src/render/volume-pass.ts` |
  | volume absorption | 2.0e-4                     | `src/render/volume-pass.ts` |
  | point brightness  | 28                         | `src/render/renderer.ts`    |
  | glow sigma        | 0.045 per round, 0.064 net | `src/render/glow-pass.ts`   |
  | glow weight       | 1.5                        | `src/render/glow-pass.ts`   |
  | glow tint         | 0.35                       | `src/render/glow-pass.ts`   |
  | white level       | 0.74                       | `shaders/tonemap.frag`      |
  | background grey   | (0.038, 0.036, 0.048)      | `shaders/tonemap.frag`      |
  | ramp stops        | 0.02 to 0.09, 0.30 to 0.70 | `shaders/volume.frag`       |
  | dust colour       | (0.55, 1.00, 1.70)         | `shaders/volume.frag`       |
  | rim fade          | 47,000 to 51,000 ly        | `shaders/volume.frag`       |

  The glow sigma is 4.5 percent of the frame height per blur round, which gives 6.4
  percent after the two rounds, not the 2 percent this design first stated. At 2 percent the halo scenario could not reach a difference of 0.05 without
  a weight that washed the disc out. The halo's brightness follows the blur's reach,
  so the wider sigma raises the halo and leaves Sol where it is. The 9 blur taps sit
  at half sigma steps, so they cover plus or minus 2 sigma.
- Whether phase 2 reads the detail grid for star counts per boxel, or the corrected
  density. The detailed density is the game's map, so it is the better budget.
