## Why

The map stops at a zoom distance of 2,000 light years. At that distance the galaxy is
still a cloud: the point cloud draws 2,000,000 tracer samples for 400 billion systems,
so near Sol a frame holds a handful of them and the space between the arms is empty.
The user cannot come closer, and nothing on screen says where in the galaxy the view
sits.

Phase 2 takes the zoom down to 500 light years and fills the near field with
decoration stars, and it names the part of the galaxy the user is looking at with the
42 galactic codex regions.

## What Changes

- **BREAKING** The zoom lower limit moves from 2,000 to 500 light years. Every stored
  URL fragment still loads, because the limit only widens the range.
- A decoration star field draws single stars around the camera. The stars are
  invented, not the game's own systems: the count in a volume follows the phase 1
  density model, and the positions come from a hash of the boxel address, so a boxel
  always shows the same stars.
- The star field uses the game's mass-code octree as its level of detail. Four size
  classes draw at once, chosen by the zoom distance, in nested cubes around the
  camera, built from the coarsest class down so the nesting is exact at every camera
  position. The drawn count is bounded at 475,136 point sprites at every view.
- The count of stars in a boxel and the light they carry follow separate rules, and
  both read the detailed density, which is the density the point cloud is placed by.
  The count follows the model's system budget through a calibration in systems per
  solar mass; the light follows the density alone, from one constant tied to the point
  cloud's brightness, so the two sources carry the same light per unit volume at every
  density. This answers the roadmap's open question on which density the counts read.
- The point cloud gains a fade by the range of each sample, so the star field and the
  point cloud hand over to one another without a change in the light. The two fades
  sum to 1 at every range.
- The 42 galactic codex regions draw their boundaries on the galactic plane and carry
  a text label each. Both fade in below a zoom distance, so the far view is unchanged
  and its baseline image still matches.
- `@elite-dangerous-almanac/core` enters as a dependency, pinned to an exact version,
  for the sector and boxel geometry and the codex region data.

Non-goals:

- The game's own generation rules. Public information only. Star positions are
  invented and no attempt is made to reproduce the game's systems, their names or
  their addresses.
- Names for decoration stars. A star has no name, no address and no record.
- Real systems from a data file. That is phase 3.
- Selection, picking and a HUD. That is phase 4.
- Nebulae, hand-authored regions such as the Pleiades, and permit locks.
- A change to the far view's look. The volume, the cloud and the glow passes keep
  their constants, and the committed baseline image is not retaken.

## Capabilities

### New Capabilities

- `close-view-stars`: the decoration star field. Where the counts come from, how the
  mass-code octree picks the level of detail, what bounds the drawn count, how the
  field hands over to the point cloud, and how a star looks.
- `galactic-regions`: the 42 galactic codex regions. Where the data comes from, how
  the boundaries are traced onto the galactic plane, which regions get a label, where
  a label sits, and the zoom band both draw in.

### Modified Capabilities

- `map-navigation`: the zoom lower limit changes from 2,000 to 500 light years.
- `far-view-rendering`: the frame draws two more passes, each point cloud sample fades
  out by its range from the camera so the star field can take over the near field, and
  the camera-relative precision bound now names 500 light years as the closest zoom.
- `far-view-scene-data`: a third worker joins the two that build the scene data.
- `galaxy-density-model`: the model gains the detailed mass-code-0 budget beside the
  corrected one.

## Impact

- **New code.** `src/scene-data/boxel.ts` (the mass-code octree over the galaxy),
  `src/scene-data/star-field.ts` (the per-boxel star counts),
  `src/scene-data/regions.ts` (the 42 region records), `src/scene-data/region-lines.ts`
  and a worker (the boundary trace), `src/render/star-pass.ts` and its shaders,
  `src/render/region-pass.ts` and its shaders, `src/app/labels.ts` (the DOM label
  overlay).
- **Changed code.** `src/camera/view.ts` (the zoom limit), `src/render/renderer.ts`
  (two passes, two switches, the handover radii), `src/render/shaders/points.vert`
  (the range fade), `src/scene-data/types.ts` and `src/scene-data/load.ts` (the region
  line set), `src/render/global.ts` and `e2e/global.d.ts` (the test hooks),
  `index.html` (the label overlay element), `README.md` and `docs/roadmap.md` (the
  zoom range, and the roadmap's calibration line).
- **New dependency.** `@elite-dangerous-almanac/core`, MIT for its code, with
  source-specific terms for its data. The codex region tables come from
  klightspeed's EliteDangerousRegionMap under MIT, and the game data behind them falls
  under Frontier's media-usage rules, which are non-commercial. The change adds
  `THIRD_PARTY_NOTICES.md` to the repository, and a task checks the built bundle for
  the package's procedural naming tables, whose BSD 3-Clause terms need their text in
  full if they survive tree-shaking. The package is ESM only, needs Node 22 or later,
  has no dependencies of its own and is pre-1.0, so the version is pinned exactly.
  Under the 7-day hold the resolved version is one or two releases behind the newest.
- **Scale.** The galaxy holds about 400 billion systems, which is 800,000 times what a
  frame can draw, so the star field is a bounded sample with the light of the whole
  restored by a brightness factor. The bound is 475,136 point sprites per frame, on
  top of the 2,000,000 the point cloud draws. The region boundary trace reads
  4,108,729 grid cells once in a worker and gives about 22,500 line runs, which is 528
  KiB of vertex data.
- **Tests.** New unit tests for the boxel arithmetic, the star counts, the level
  choice and the boundary trace. New browser tests for the drawn count bound, the
  handover, the star field's grain, the boundaries, the labels and the frame budget at
  500 and 1,000 light years. The existing baseline image test must still pass
  unchanged.
