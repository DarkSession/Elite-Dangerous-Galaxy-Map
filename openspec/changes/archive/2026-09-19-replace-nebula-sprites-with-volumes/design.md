## Context

See `proposal.md` for the motivation and `specs/nebulae/spec.md` for the requirements.

The pieces this change moves are:

- `src/scene-data/nebulae.ts` and `nebulae.json`: the record set and the selection rule.
- `src/render/nebula-pass.ts`: one instanced `drawArraysInstanced` over a triangle strip
  of 4 vertices, 6 floats per instance.
- `src/render/nebula-atlas.ts` and `nebula-art.webp`: the tile set.
- `src/render/nebula-slot.ts`: the types and look defaults the renderer reaches the
  nebulae through. It is the one module `src/render/` may import, and the three ESLint
  rules in `eslint.config.js` hold that boundary by path.
- `src/nebulae/index.ts`: the second entry point, whose import graph carries everything
  above.

A spike on branch `spike-nebula-volumes` built the march and measured it. Every figure
below is a reading from that spike, not an estimate.

## Goals / Non-Goals

**Goals:**

- Keep the seam. `src/nebulae/` stays the only module that may import both layers, and the
  renderer keeps reaching the nebulae through `nebula-slot.ts` alone.
- Keep the loader shape. The volumes load the way the atlas did: fetched, late, and unable
  to stop the first frame.
- Make the step rate and the light gain dials, not constants buried in the shader.

**Non-Goals:**

- A depth-sorted or order-independent resolve for overlapping boxes. The draw order is the
  resolve, as it is for the sprites.
- A streaming or level-of-detail scheme. All 33 assets load once and stay resident.
- Any change to the galaxy volume, the clouds, the glow or the tone map.

## Decisions

### Decode the block formats on load and upload plain textures

The assets ship as `BC4_UNORM` and `BC1_UNORM`. WebGL2 exposes these through
`EXT_texture_compression_rgtc` and `WEBGL_compressed_texture_s3tc`, neither of which is
guaranteed.

**Chosen:** decode both in TypeScript on load and upload `R8` and `RGBA8` 3D textures.

- _Why:_ the extensions were tested in two browsers during the spike and neither is
  dependable for 3D targets. A decode is 33 assets once, at load, off the frame path.
- _Cost:_ three different sizes, which earlier drafts of this document confused. The set is
  **1.10 MiB over the wire under brotli**, **2.64 MiB on disk** over the 66 `.dds` files — 2.78 MiB with the
  132 KiB transfer file and the index, which is the figure the 3.0 MiB bound is read against
  — and **6.03 MiB in video
  memory** once decoded to `R8` and `RGBA8`. Decoding costs a little over twice the on-disk
  size, because half a byte a texel becomes one byte for the density and four for the
  colour. Video memory still falls against the atlas, which is 9.00 MiB as a 1,536 square
  `RGBA8` texture.
- _Rejected:_ requiring the extensions, which would make the nebulae fail on conforming
  contexts. _Rejected:_ shipping raw volumes, which quadruples the wire cost.

### One draw call per record, not one call for the frame

The sprite pass draws every nebula in one instanced call. A marched box cannot, because
each record binds its own pair of 3D textures.

**Chosen:** one call per selected record, drawing 12 triangles.

- _Why:_ a 3D texture cannot be an instanced attribute, and a texture array cannot hold
  volumes that differ in side. The call count is small: the covered-area budget stops the
  selection long before the call count matters, and the measured cost is dominated by fill.
- _Rejected:_ one 3D texture array per side class, which would need the assets repacked
  to a uniform side. At a uniform 64 texels the decoded footprint is 1.25 MiB an asset and
  41.2 MiB for the set, seven times what the per-asset sides cost.
- _Rejected:_ an atlas of volumes in one texture, which needs a border against bleed on
  three axes and gives back the very coupling the per-asset sides removed.

### Cull front faces and clamp the near end of the ray at the eye

Drawing a box gives two fragments per pixel from outside and none from inside.

**Chosen:** cull front faces, and clamp the slab test's near intersection at 0.

- _Why:_ one fragment per covered pixel in both cases, and the fragment shader needs no
  branch on whether the camera is inside.
- _Note:_ the cube must be 12 wound triangles. A 14-vertex strip cannot hold one winding
  across all six faces, and the spike drew nothing below 400 light years until that was
  fixed. The task list carries a test for it.

### Ship the raw rotation triple and build the matrix in the renderer

**Chosen:** the record file holds three angles in radians, verbatim. One named constant in
the renderer states the convention `Rx(a) · Ry(b) · Rz(c)`, composed with the world-z flip.

- _Why:_ the convention was narrowed from 13 candidates to one axis order by matching
  Barnard's Loop and the Horsehead against in-game references, but whether the matrix or
  its transpose applies is not settled. A constant makes that a one-line correction that
  touches no data.
- _Rejected:_ baking a matrix into the record file, which would need the data regenerated
  to fix.

### Replace the count budget with a covered-area budget

**Chosen:** accumulate each selected record's covered screen area, largest first, and stop
at 4 screen areas. A record's covered area is **the lesser of the disc of its apparent
radius and one screen area**.

- _Why the cap at one screen area:_ the selection divides by a minimum range of one light
  year, so a camera at a record's centre gives an apparent radius of about 187,000 CSS
  pixels: the field of view is 60 degrees, so the focal length is 935 pixels at a canvas of
  1,080. An uncapped disc is then about 53,000 screen areas and exhausts any budget on
  the first record, which drops the other 357. A record the camera sits inside covers one
  screen and no more.
- _Why not the true footprint:_ the honest quantity is the disc intersected with the
  viewport, and `NebulaViewInput` cannot produce it. It carries the camera position, the
  range, the focal length in pixels and the canvas height. It has no view orientation, no
  projection and no canvas width, so it cannot place a record's centre on the screen or
  tell a record in front of the camera from one behind it. Giving the selection a view
  matrix to compute a guard is the wrong trade: the guard becomes exact and the selection
  stops being a pure function of position and range.
  `min(disc, one screen)` needs the canvas **width** as well as its height, because one
  screen area is the product. That single field joins `NebulaViewInput`; nothing else does.
- _What the cap costs in accuracy:_ the figure bounds the worst case over every direction
  the camera could face, not the area this frame covers. A record behind the camera counts
  in full. The count budget of 256 had the same blind spot, the error is conservative, and
  the measurement in task 7.3 reads the real worst case over the browser suite.
- _Why:_ the measured cost is 4.8 µs for a small patch, 37.7 µs for much of the frame and
  97.9 µs for a full frame with the camera inside, at 32 steps per unit at 1,280 by 720.
  Cost tracks covered pixels, so a count guards the wrong quantity.
- _Why 4:_ the committed record file's worst measured coverage over the browser suite's
  cameras must be under it with headroom. The implementation measures that figure and
  writes it into the test; if the reading exceeds 4, the budget moves and the design note
  is corrected rather than the reading.
- _What the fade reads:_ the accumulated covered area, not apparent size. The first draft
  faded on apparent size, because size is what moves smoothly as the camera turns. The
  implementation measured that and it fails for an area budget: the sizes at the cut are
  widely spaced, so one large record entering the frame moves a size-based cut in a jump and
  takes a whole group out at full weight. The 360 degree turn test read a worst entry weight
  of 1 against a bound of 0.05. The accumulated total is continuous where the size at the cut
  is not, because every record's own covered area is continuous in the camera position and
  two records swapping places in the sort changes no sum. The fade is 1 at and below 0.8 of
  the budget and 0 at the budget, so the record the scan stops on is already at weight 0.
- _Alternative kept in reserve:_ a step-rate reduction for records that cover a large
  fraction of the frame. Not taken, because the measurement shows no need and it would
  make the step rate a function of the camera.

### Serve the assets as static files, not as bundled modules

**Chosen:** one `import.meta.glob('./nebula-art/*', { query: '?url&no-inline', eager: true })`
in `src/render/nebula-volumes.ts`, which yields one entry for each of the 68 files: 33 density
volumes, 33 colour volumes, the transfer file and the index. That module is the one the fetch and the decode
live in, and it is the module `nebula-atlas.ts` becomes, so the asset path and its loader
sit together as they do today.

- _Why not a module import each:_ 68 hand-written import lines is a file that rots. The
  glob gives the same 68 URLs from one line and cannot fall out of step with the directory.
- _Why `no-inline` is not optional:_ the library build inlines **every** asset as a data
  URI, whatever its size. That is `vite.config.lib.ts`, which is the build the package ships
  from and the build `tests/main-bundle.test.ts` measures, and it is why
  `src/render/nebula-atlas.ts` line 12, `src/scene-data/nebulae.ts`,
  `src/galaxy-model/detail.ts` and `src/hud/styles.ts` all carry the flag today with the same
  comment — every one of those assets is far above any size threshold. Without the flag all 68
  files, about 2.64 MiB and about 3.6 MiB as base64, land in the **`nebulae` entry chunk**,
  `dist/nebulae.js`, which no test bounds. They do not reach `dist/index.js`: that chunk holds
  no nebula module at all, which is what `library-package`'s scenario **The entry chunk holds
  no nebula code** requires, so its 260,000-byte bound would not react to a missing flag. Task
  6.7a's own file-count check is the guard. The flag goes on all 68, not on the small ones. In the demo build, `vite.config.ts`, the 4,096-byte default
  applies as well, and 28 of the 33 colour volumes are 404 or 2,196 bytes on disk.
- _Why the glob stays in that module:_ `nebula-volumes.ts` is reachable from `src/nebulae/`
  alone, and the ESLint rule that keeps the nebula import graph behind the second entry
  point applies to the glob as it applies to the atlas import today.
  A host that asks for no nebulae must not pull 2.64 MiB of volumes.
- _What this costs:_ `tests/main-bundle.test.ts` asserts the atlas file name pattern, counts
  exactly one `.webp` and checks that no `data:image/webp` reaches the bundle, in sixteen
  places. Those assertions describe a set of one file. They are rewritten for a set of 68,
  which task 6.7a covers.

### Name the assets in this library

The art arrives under names that are not ours to publish, and two of them are wrong about
what they draw. The library names all 33 itself, kebab-case:

| group                      | names                                                                                                                                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the 20 one-off records     | `barnards-loop`, `bow-tie`, `bubble`, `butterfly`, `cats-eye`, `crab`, `dr-kays-soul`, `fine-ring`, `flame`, `hind`, `horsehead`, `lbn-623`, `lemon-slice`, `messier-78`, `ngc-6337`, `orion`, `pleiades`, `red-spider`, `ring`, `veil-west` |
| the 13 the pool draws from | `bright-01`–`bright-04`, `dark-01`–`dark-05`, `planetary-01`–`planetary-04`                                                                                                                                                                  |

The renaming happens once, in the copy-in step, and no file in the repository records what
any asset was called before. This matches how the galaxy model was brought in.

### Keep one transmittance per record, and keep the march where it is

The occlusion rule is unchanged: one value taken at the record's centre, applied to the
whole volume, scaling the emission and the alpha alike.

- _Why:_ it preserves every existing occlusion scenario and the shared extinction rule
  that the volume pass and the nebula pass both read.
- _Rejected:_ sampling the galaxy's density at each march step, which roughly doubles the
  inner loop for an effect that only shows on a record straddling the bulge.

**The march stays in the vertex stage.** `shaders/nebulae.vert` runs 64 steps there today,
with the comment "The four corners of one quad march the same segment and reach the same
answer." A box has 36 vertices, not 4, so the march runs nine times more often per record.

**Chosen:** leave it there and measure it.

- _Why:_ the alternatives are both worse. The CPU cannot march it — the density reaches the
  pass only as a `WebGLTexture` (`nebula-slot.ts`, `readonly volume: WebGLTexture | null`),
  so a CPU value needs a readback. A per-record uniform needs a producer, and the only one
  available is a pre-pass that draws one vertex into a 1×1 target, which is a second program
  and a second target for one number.
- _Why it is probably fine:_ all 36 vertices march the identical segment and issue the
  identical fetches, so they hit the same cache lines. 36 vertices × 64 steps is 2,304
  samples a record. One record covering a tenth of a 1,920 by 1,080 frame runs about 13
  million fragment samples. The vertex work is under a thousandth of that.
- _Where it could bite:_ a frame of many _small_ records, where the fragment work per record
  is comparable to 2,304 samples. 256 records at the size floor is about 590,000 vertex
  samples. Task 4.6a measures the vertex stage's share; if it is above a tenth of the pass,
  the pre-pass goes in.
- _What the measurement can say:_ **less than the tenth asks for.** Chrome clamps
  `performance.now()` to 100 microseconds, the frame of 76 small records runs 0.64 ms, and
  the march is about 40 microseconds of it. `e2e/nebula-cost.spec.ts` alternates the two
  conditions inside one page call and pools 540 frames of each, and the pooled share still
  moves from -1.5 to +6.8 percent run to run for the same frame. Frame-by-frame alternation
  over 300 pairs reads the same noise. The test therefore gates at **a quarter**, which the
  readings hold with margin, and the tenth stays unanswered. Three ways to close it, for the
  reviewer to pick from: accept the quarter, add an `EXT_disjoint_timer_query_webgl2`
  reading to the renderer, or put the pre-pass in and stop asking.
- _Kept:_ both existing scenarios — the shared rule compiled into the nebula program, and
  the program linking with a vertex texture unit — stay valid, because the march does not
  leave the program.

### Do not clamp the transmittance at 1

Five of the 33 assets — `cats-eye`, `orion`, `pleiades`,
`planetary-01` and `fine-ring` — carry a **negative** extinction
channel, so `1 - ext·d·dt` can exceed 1 and the transmittance rises along the ray. It
reaches 6.0 on `cats-eye` at 32 steps per unit, and it delays the early exit.

**Chosen:** no upper clamp, and a test on the output alpha instead.

- _Why:_ this is what the transfer tables ask for and it is what those five look like. Measured
  over the 33 assets at 25, 32 and 64 steps per unit, the output alpha never leaves 0 to 1,
  so the premultiplied blend is safe without a clamp.
- _Rejected:_ `T = min(T, 1)`, which is one instruction and physically tidier, but changes
  `cats-eye` by **70 percent of peak emission** and `planetary-01` by
  39 percent. It is not free insurance; it is a different look.
- _Guard:_ the spec requires the alpha range on every asset at every offered step rate, so
  a repack that pushed the arithmetic further would fail rather than blend wrongly.

### Module layout

| Today                                      | After                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| `src/render/nebula-atlas.ts`               | `src/render/nebula-volumes.ts` — fetch, decode, upload                     |
| `src/render/nebula-pass.ts`                | `src/render/nebula-pass.ts` — the marched box pass                         |
| `src/render/nebula-art.webp`               | `src/render/nebula-art/` — 33 asset pairs, the transfer file and the index |
| `src/render/shaders/nebulae.vert`, `.frag` | the same pair, rewritten to march                                          |
| `src/render/nebula-slot.ts`                | unchanged in role; its types and defaults change                           |

The ESLint `nebulaImportGroups` list names `./nebula-atlas` and its path variants. Those
entries become `./nebula-volumes` and the same variants. `nebula-slot.ts` stays off the
list, as the comment there explains.

**`nebula-slot.test.ts` pins the module's exact built output** to two lines,
`DEFAULT_NEBULA_BRIGHTNESS = 8` and `DEFAULT_NEBULA_OCCLUSION = 1`. The light gain is three
values, so the slot gains an array literal where it held number literals. The test's point
is that the slot compiles to constants the bundler can inline and drop, and an array
literal still does, but the assertion is exact and has to be rewritten rather than relaxed.

**Four files outside `src/render/` and `src/scene-data/` change and are easy to miss:**
`src/app/create-map.ts` (the readability check names `loadAtlas`, and the option
documentation says "draws no sprite"), `src/app/create-map.test.ts`,
`THIRD_PARTY_NOTICES.md` (its nebula section describes the atlas and its 34 tiles) and
`tests/third-party-notices.test.ts` (it asserts the notices name `nebula-art.webp`). The
notice is the attribution for Frontier's art, so it is corrected and not merely renamed.

## Risks / Trade-offs

- **The fixture shares the shader's sampling convention, so the RMSE test cannot check
  it.** → `scripts/build-nebula-fixture.mjs` reads the volume at `(u, 1 - v, w)` because
  `shaders/nebulae.frag` does. A wrong flip on the v axis would move both sides together
  and the browser RMSE test would still pass. Nothing in the suite is an independent
  oracle for it; the convention was settled by matching Barnard's Loop and the Horsehead
  against in-game references by eye, and the baseline screenshot is what holds it from
  here. The same caveat applies to the rotation convention below.
- **The transpose of the rotation matrix may be the correct reading.** → The convention is
  one named constant and five records of 358 carry a rotation. A correction is one line
  and no data regeneration. A browser test captures the five records so a flip is visible.
- **The served size rises from 0.77 MiB to 2.78 MiB on disk**, or 1.10 MiB under brotli if the serving
  path compresses. → It is a fetched asset beside the map, never in the entry chunk, and the
  nebulae are already not part of the first frame. The spec bounds all three sizes
  separately so a repack cannot grow any of them quietly. Video memory falls, from
  9.00 MiB for the atlas to 6.03 MiB for the set.
- **A camera inside a nebula now fills the frame with one record.** → Measured at 97.9 µs
  at 1,280 by 720. `e2e/frame-budget.spec.ts` runs at 1,920 by 1,080, which is 2.25 times
  the pixels, so the figure there is about 220 µs, or 1.3 percent of the 16.7 ms budget, and
  the whole covered-area budget is about 5 percent. The reading also comes from a 32-texel
  asset; 15 of the 33 are 64, which is a different cache story, so task 7.3 re-measures on a
  64 asset before the budget figure is fixed.
- **Removing the near fades changes what a close camera sees.** → This is the point of the
  change and the proposal states it as breaking. The pinned far-view baseline is unaffected
  because no nebula draws at 60,000 light years.
- **The decode runs on the main thread.** → 33 assets, 2.64 MiB of blocks expanding to
  6.03 MiB, once, after the first frame. If a reading shows a visible stall, the decode moves to a worker; the
  loader's shape already allows it because nothing waits on it.
- **The spike's `public/spike/` and `spike/` directories and the `SPIKE` block in
  `renderer.ts` must not reach the change.** → Task 6.3a deletes them, not task 1.1. The spike
  stays through the decode, the pass and the selection work, because it is the reference the
  new pass is measured against: it marches a known asset with a known rotation and a known
  light gain, so an A/B against it separates a decode fault from a march fault from a rotation
  fault. It cannot stay to the end: `renderer.ts` imports `spike-nebula-pass`, so every spike
  file sits in the main entry graph. It does not merely inflate a reading: measured, the spike
  costs 10,650 bytes and takes `dist/index.js` to 264,726 bytes against an `ENTRY_CHUNK_LIMIT`
  of 260,000, so `tests/main-bundle.test.ts` is red from group 1 until task 6.3a. Tasks 2.0 to
  5.5 therefore verify with targeted test runs, and the bound does not move. Nothing is
  committed before task 6.3a either: the `SPIKE` block sits in the tracked `renderer.ts`, which
  tasks 4.5 and 5.0 edit, and a commit carrying it does not build, because it value-imports
  an untracked module. Task 6.3a is the
  last moment the spike can go.

## Migration Plan

**At archive time**, update the `nebulae` capability's `## Purpose` in
`openspec/specs/nebulae/spec.md`: it still says "each as a sprite with its own art and its own
size". It is not a task, because a task in the apply list cannot be done before the archive
runs.

**Land this change before `publish-library-package`, or rebase it after.** That change is
active and has 106 tasks. It moves the source tree into `packages/galaxy-map/`, moves
`THIRD_PARTY_NOTICES.md` with it, and rewrites the paths of `tests/main-bundle.test.ts` in
its tasks 5.4 and 5.4a. Every path in the tasks below then shifts, and both changes rewrite
the same test file. This change is the smaller one, so the cheaper order is this one first.
**The two changes also collide in the spec.** Both carry a MODIFIED delta for the same
`library-package` requirement, **The library build emits a package and no page**, each a full
copy: this one with the volume-index scenario wording, the other still saying "the sprite atlas
file name". Archive replaces a MODIFIED requirement's text wholesale and rejects only a
**dropped** scenario, not a reverted one, so whichever archives second silently undoes the
other's edits — this change's scenario wording and task 6.8's readings, or the other's
workspace-path and version prose. Before either archives, copy this change's scenario wording
and both entry-chunk readings into the other change's delta.

If the other lands first, re-read its tasks 3.6, 5.4 and 5.4a and add the package prefix
here before starting.

1. Copy the 33 assets and the index in, stripped to what the map reads, and treat them as
   project-owned, as the galaxy model is.
2. Regenerate `nebulae.json` once, joining the asset index and the rotation onto each
   record and dropping the tile index. Update the fixture digest in the same commit.
3. Land the pass, the loader and the shaders together with the data. There is no interim
   state in which a record holds both a tile index and an asset index.
4. Delete `nebula-art.webp` and `nebula-atlas.ts` in the same commit, so no build carries
   both art sets.

Rollback is the revert of one commit. No requirement of another capability changes, so a host that pins the
previous version keeps working.

## Open Questions

All three are answered. The readings are in the tests that took them.

- What the worst covered area over the browser suite's cameras actually reads, at 1,920 by
  1,080. **Answered: 0.047 screen areas**, over the 16 views of
  `e2e/frame-budget.spec.ts` that draw a nebula, with a dropped count of 0 at every one.
  A near view inside a 200 light year record reads **1.56**. The budget of 4 screen areas
  stays where the design set it.
- What step-rate error a dark asset carries. **Answered: 1.9 percent** on `dark-02`, which
  is the asset whose transfer table reaches the set's largest extinction, 3,066. The bound
  is 5 percent and the default step rate of 32 stays where it is.
- Whether the decode is fast enough on the main thread. **Answered: yes.** All 33 assets
  decode in **16.9 ms** together and the worst single asset takes **2.3 ms**. One asset is
  one task, so no frame pays more than 2.3 ms and the decode stays on the main thread.
