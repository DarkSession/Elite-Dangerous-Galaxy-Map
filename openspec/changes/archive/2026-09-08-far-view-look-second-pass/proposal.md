## Why

The far view has the outline of the game's galaxy map, but not its texture and not its
tones. A comparison of the default view with the game's map background shows the gaps:
the arms are smooth ribbons with black space between them, the bulge clips to white,
the disc has no grain, no halo surrounds the disc, the dust is grey, and the background
is black. The outline, the bar and the pitch of the arms are right, and this change
keeps them.

## Problem

Two things cause the difference.

**The density source is smooth.** The compact model is analytic, plus a 64 x 64
correction grid at 1,562 light years per cell. It reproduces the bar, the arms and the
radial profile, and it averages the painted texture away. The game's own density map
is a hand-painted grid of 2048 x 2048 texels, 48.8 light years each. Measured against
that map, the corrected model has a residual of 0.22 rms in the natural logarithm of
the density, a factor of 1.25. The clumps run to plus or minus 2.4 in the logarithm, a
factor of 10. At the default distance of 60,000 light years one pixel covers about 96
light years, so the painted texture sits at the pixel scale. The map itself is too
large to ship: 13 MB as JSON, 4 MB as bytes, and the project does not commit galaxy
data. The model file is derived data, and a derived raster of the residual is the same
kind of data.

**The renderer removes what the reference keeps.** The fade on compressed density
removes the space between the arms, because that space sits at the fade threshold. The
tone map reaches pure white, so the bulge has no colour. The extinction is grey. There
is no glow, so the disc ends where the density ends. The background is black. The
points carry too little of the light to show as grain.

## What Changes

- Add a detail grid to the galaxy model: 1024 x 1024 cells, 98 light years each, that
  stores the logarithm of the ratio of the game's map to the corrected model. It is a
  greyscale PNG of 347,358 bytes, committed as data with a fixture that pins it. The
  model gains a detailed surface density, the corrected density times the ratio.
- The point cloud samples the detailed density. The scene data carries a surface
  detail grid, the ratio of detailed to corrected surface density at each of the
  1024 x 1024 cells, so the renderer can apply it to the smooth volume.
- The volume pass multiplies the decoded density by the ratio at each step. The fade
  keys on galactocentric radius instead of density. The extinction absorbs blue more
  than red.
- A glow pass adds a blurred copy of the volume pass, tinted toward the haze colour,
  so a halo surrounds the disc and the arm edges are soft.
- The tone map reaches a white level below 1, so the bulge stays cream, and blends
  the result over a dark grey background.
- The point brightness and the volume emission are rebalanced so the points carry
  enough of the light to show grain.
- The look test gains scenarios for the centre colour, the space between the arms, the
  glow, the grain and the background. The baseline image is regenerated.
- The model document, the roadmap and the README describe the detail grid.

## Non-goals

- Shipping the full density map, or a zone raster. The model's zone lookup matches
  the game's zone map to 0.037 rms, so the point tint by zone stays as it is.
- Procedural noise. The texture comes from the data.
- The satellite galaxies, the logo, and region or nebula labels.
- A change to the point count, the volume resolution or the zoom limits.
- The thick look of the disc at zoom distances near 10,000 light years. That stays a
  phase 2 question.
- The look at close zoom, where phase 2 adds stars.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `galaxy-density-model`: adds the detail grid, its decoding, the detailed surface
  density, and the fixture that pins the grid.
- `far-view-scene-data`: the point cloud follows the detailed density, and the scene
  data carries the surface detail grid.
- `far-view-rendering`: the volume pass applies the detail and fades by radius, the
  extinction is coloured, a glow pass surrounds the disc, and the tone map has a white
  level and a background.

## Scale

- The detail grid holds 1,048,576 cells, 1 MB in memory and 347,358 bytes on the wire.
  Decoding runs in a worker. The fixture holds 203 points.
- At its own resolution the grid brings the residual against the game's map from
  0.223 to 0.007 rms in the logarithm. A residual of 0.068 rms stays in the map at its
  own 48.8 light year texels, below the far view's pixel.
- Scene data generation stays under 5 seconds. The point cloud table already
  evaluates the model at the same 1,048,576 cell centres, so the surface detail grid
  costs one division and one logarithm per cell. The grid transfers to the main thread without a copy.
- The renderer holds the frame budget of 16.7 ms at 1920x1080 at the six views the
  frame budget test sets. The volume pass gains one 2D texture fetch per step, about
  50 million more fetches per frame at half resolution. The glow pass runs at one
  eighth of the frame size, 240 x 135 pixels at 1920x1080, in four passes.
- The detail texture is 1 MB of GPU memory. Its upload gets its own animation frame.

## Impact

- New committed data: `src/galaxy-model/galaxy-detail.png` and
  `tests/fixtures/galaxy-detail.json`. Both are in the working tree with this
  proposal. They were produced from the game's map outside the repository, and no
  script in the repository regenerates them. The fixture carries the SHA-256 of the
  PNG file and of the decoded grid, so a changed PNG fails the tests.
- `src/galaxy-model/`: a PNG decoder and the detail sampler, a detailed surface
  density on the model object, and the fixture tests.
- `src/scene-data/`: the point cloud worker loads the detail, builds the table from
  the detailed density, and posts the surface detail grid with the cloud.
- `src/render/`: the volume pass gains the detail texture, the radius fade and the
  coloured extinction; a new glow pass with a blur shader; the tone map gains the white
  level and the background; the renderer gains a glow switch for the tests.
- `e2e/look.spec.ts` and its baseline image; `docs/galaxy-density-model.md`,
  `docs/roadmap.md` and `README.md`.
- No new dependency. The PNG decoder uses the browser's and Node's
  `DecompressionStream`.
- A decision for the owner. The detail grid reconstructs the game's density map at
  half of its resolution, to the quantisation step of the encoding. The repository
  then holds that map, re-encoded as a residual against the model. The parameter
  file and the 64 x 64 correction grid already derive from the same map, at lower
  resolution. The roadmap's licence bullet records Frontier's non-commercial
  media-usage notice for the almanac's data; it is not a clearance for this file.
  Confirm that the repository may hold the map at this resolution before
  `/opsx:apply`. The fallback is the 512 x 512 grid at 95 KB and 0.071 rms, which
  also needs both data files produced outside the repository.
- Prerequisite: archive `far-view-galaxy-render` before this change is applied. This
  change modifies requirements of that change, and the main specs exist only after
  that archive.
