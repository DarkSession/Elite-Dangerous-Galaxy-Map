## Why

The second pass put the reference's structures on the screen, and the owner's review of
the result names four gaps. The disc reads grey-violet where the reference is
yellow-orange. The haze around the disc is too strong. From the side, the sky above the
disc shows horizontal lines. The haze is an even fog where the game shows chunks of
cloud. Each gap has a measured cause in the current frame, and this pass closes them
with scenarios that fail today.

The measurements behind the four gaps, at 1280x720:

| Gap                  | Measurement today                                                        |
| -------------------- | ------------------------------------------------------------------------ |
| colour               | Sol pixel (0.478, 0.420, 0.455): green below blue, so violet, not tan    |
| colour               | bulge luminance 0.875 from the centre out to 8,000 light years, no fall  |
| haze too strong      | side view, 6,000 light years above the centre: 0.506 with glow, 0.037 off |
| lines in the sky     | one 8-bit step every 1 to 3 rows over 150 rows, no dither                |
| even haze            | ring at 32,000 light years: 90th over 10th percentile 1.67, the map 18   |
| even haze            | side view with glow and points off, hard cut at the top of the bulge     |

The owner's words on colour were "the image is more yellow/orange, only the centre of
the core is red". This proposal first read that as: the disc is yellow-orange, and the
red tone belongs to the core's surroundings, not to the arms. The owner rejected the
frame built on that reading and put the reference image beside the tree. Sampled, the
reference gives a cream-white core, a soft salmon band and dusty pink-brown arms, and
the colour scenarios and the ramp now follow the samples; the design records them.

## What Changes

- The volume ramp gets four stops, sampled from the reference: a greyed blue-violet
  haze, dusty pink-brown arms, a soft salmon band at the edge of the bulge, and a
  cream-white core. The point sprites move to the same warm side.
- The tone curve stops clipping the bulge, so the bulge falls off from the centre
  instead of showing a plateau.
- The tone map adds a deterministic dither of one 8-bit step, so smooth gradients do
  not band.
- The glow gets a proper downsample, a source pass that holds the brightest pixels
  down to a clamp, a wider blur and a higher weight. The clamp is what lets the blur
  widen: the halo past the rim grows, and the sky above the disc at the side view
  stays near the background.
- The emission curve compresses the low densities less, so the patches the detail grid
  holds reach the screen.
- The volume fades out toward the top of its box, so the bulge has no hard top.
- A cloud pass draws a random subset of the point cloud as large soft sprites, so the
  haze has chunks in three dimensions. A `clouds` switch sits beside the other three.
  The chunks are the sprites' random placement, weighted by the density, not the
  map's structure at the sprite's own scale. The assumption behind it is that the
  game's map builds its haze from placed cloud sprites; the owner confirms the
  mechanism at review.
- The frame budget gains the distance of 12,000 light years, where the cloud pass is
  at its worst.
- The look scenarios grow by colour, bulge fall-off, sky, dither, patchiness and
  bulge-top checks. The baseline image is regenerated.

Non-goals: no procedural noise, the chunk positions are samples of the density; no change
to the galaxy model, the scene data, the point count, the volume resolution or the
camera; no match with the reference pixel for pixel.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `far-view-rendering`: the composition requirement gains the four-stop ramp, the
  two-slope emission curve, the fade by height, the cloud pass, the non-clipping tone
  curve and the dither, with scenarios for each; the glow requirement gains the
  downsample, the sky scenario and a bounded halo; the composition requirement is
  renamed to three scene passes; the frame budget requirement gains the two views at
  12,000 light years. Two requirements are added: the cloud sprites and the dither.

## Impact

- `src/render/shaders/volume.frag` and `src/render/volume-pass.ts`: the ramp, the
  curve, the top fade.
- `src/render/shaders/points.frag`: the point colours.
- `src/render/shaders/tonemap.frag`: the curve and the dither.
- `src/render/glow-pass.ts`, `src/render/shaders/blur.frag` and the new
  `src/render/shaders/glow-source.frag`: the downsample, the clamp and the constants.
- `src/render/composite-pass.ts`: the exposure default.
- `.gitignore`: the owner's reference image directory, so it is never committed.
- New `src/render/cloud-pass.ts`, `src/render/shaders/clouds.vert` and
  `src/render/shaders/clouds.frag`; `src/render/buffers.ts` and
  `src/render/point-pass.ts` for the second vertex array over the point buffers;
  `src/render/renderer.ts`, `src/render/global.ts` and `src/app/main.ts` for the
  pass, the switch and a rectangle readback the tests use.
- `e2e/look.spec.ts`, `e2e/render.spec.ts`, `e2e/frame-budget.spec.ts`,
  `e2e/helpers.ts` and the baseline image.
- `docs/roadmap.md` for the look bullet and the phase 1 rendering bullet.
- No change to `src/galaxy-model/`, `src/scene-data/` or the data files.

Scale: the scene stays at 2,000,000 point samples, a 256 x 64 x 256 volume and a
1024 x 1024 detail grid. The cloud pass draws at most 10,000 sprites into the
half-resolution target, each held to a radius of 64 target pixels, so a capped sprite
spans 128 x 128 target pixels and the worst-case fill is 164 million target pixels
shaded per frame, of which 129 million lie inside the discs and blend. A sprite reaches that cap only when it is
nearer than 7,300 light years to the camera, which at 1920x1080 is
`467.6 * 1,000 / 64` with a half-focal length of 467.6 target pixels at a field of
view of 60 degrees. The pass fades out below 12,000 light years of zoom distance, so
its fill peaks at 12,000, where the fade reaches one and the sprites are the largest
the pass ever draws. The frame budget scenario gains that distance: 16.7 ms mean at
1920x1080 at eight views.

Archiving order: this change modifies requirements that `far-view-look-second-pass`
adds or modifies. That change is archived first, so the main spec holds them when this
one is archived.
