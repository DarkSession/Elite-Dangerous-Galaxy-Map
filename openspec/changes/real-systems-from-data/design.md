## Context

See [proposal.md](proposal.md) for the motivation. The facts below shape the approach.

- The page boots itself today. `src/app/main.ts` runs on load, finds the canvas, starts
  the workers and enters the frame loop. It exposes `window.__galaxyMap` for the browser
  tests only. There is no way for a host to call into the map.
- The decoration star field draws 1,856 boxels as instances. The CPU writes one record
  per boxel; the vertex shader turns `gl_InstanceID` and `gl_VertexID` into a star
  position through a hash. No star position ever reaches the card. The CPU has the same
  hash in `starOffsets` and `starPosition` in `src/scene-data/boxel.ts`.
- `createStarField` rebuilds its table only when the drawn set changes. It compares a
  key of the base class and the low index of each block.
- The region boundary overlay already draws after the tone map. It is the pattern a
  second overlay follows.
- Every drawn boxel is drawn by exactly one size class, because the classes nest with no
  gap and no overlap.
- The galaxy model bounds come from the parameter document alone. The record reader can
  read them without the 1024x1024 detail grid.
- `loadSceneData` in `src/scene-data/load.ts` starts three workers and terminates each
  one when its own promise settles. There is no way to stop a load that is running.
- `measureFrames` in `src/render/renderer.ts` redraws one fixed view and returns a mean.
  It cannot measure a pan, a zoom or a worst frame. `labelSampling` is the pattern for
  that: it accumulates the mean and the worst over the frames the loop drew.
- `src/app/main.ts` finds the label overlay host with `document.getElementById('labels')`.
  A library cannot depend on an element id in the host's page.
- The base class block is not centred on the camera. `buildBoxelBlocks` takes the base low
  from the four boxels the class above drops, so the block reaches 2 base edges past the
  camera in the worse of the two cases.

## Goals / Non-Goals

**Goals:**

- One entry point a host calls, which returns a handle before the scene data is ready.
- A record reader that owns the external dump format, so nothing else reads a raw record.
- Exact drawn positions for every system, at every zoom distance, which phase 4 reuses
  for picking.
- Suppression whose cost does not grow with the frame rate.
- No change to the galaxy's brightness when a host loads data.

**Non-Goals:**

- A published npm package, a bundle format or a version policy. This change makes the
  entry point; packaging is a separate piece of work.
- A worker for the record reader. 10,000 records validate in well under one frame.
- Suppression outside the base size class.

## Decisions

### The entry point returns a handle at once, and a `ready` promise separately

`createGalaxyMap(canvas)` builds the render context, starts the workers and returns the
handle in the same tick. `addSystems` therefore works before the first frame. The set
lives outside the render loop, so the loop reads whatever the set holds when it draws.

Alternative: an `async createGalaxyMap` that resolves after the first frame. Rejected: a
host would then have to wait before it could add a system, and the first frame would draw
an empty map even when the host had the data ready.

`src/app/create-map.ts` holds the entry point. The library takes the render context, the
scene data, the view state, the controls, the label overlay and the frame loop, which
`src/app/main.ts` holds today.

`src/app/main.ts` becomes the demo page. It keeps three things: the URL fragment, the
page's message box and the `window.__galaxyMap` hooks the browser tests read. The
fragment stays on the page because a library must not touch `window.location`; the page
parses it into `setView` and writes it back from `onViewChange`.

An ESLint rule holds that boundary, not a test. The production build the browser suite
serves puts the page and the library in one bundle, so a search of the served source
cannot tell one from the other. `no-restricted-properties` on `window.location`, with
`src/app/main.ts` excepted, fails the lint on the file that breaks the rule. That is the
same instrument `eslint.config.js` already uses for the scene-data import rule.

`dispose` needs a cancellable load. `loadSceneData` takes an `AbortSignal` and terminates
every worker it started when the signal fires; `dispose` aborts it. Without that a
`dispose` during start-up leaves three workers running.

`debug` gains `frameStats()` and `resetFrameStats()`, built like `labelSampling`: the
frame loop adds each frame's draw time to a mean and a worst. Two of the suppression
scenarios measure a pan and a zoom, which `measureFrames` cannot see, and the `dispose`
scenario counts the frames the loop drew.

`createGalaxyMap` takes an optional second argument for the label overlay host. With no
host the library makes its own element in the canvas's parent, so a host that has only a
canvas still gets labels, and the `getElementById('labels')` lookup leaves the library.

The handle carries nine members. That is more than the `createGalaxyMap` plus add and
clear the owner settled on, and the human should see the growth. Nine is what the page
needs to do its job: four for the system set and the lifecycle, three for the view, one
for the failure path and one, `debug`, for the hooks the browser tests read. `debug` is not supported surface, so it
can grow and shrink without a change of the library's contract. Today `main.ts` sets
about 25 fields on `window.__galaxyMap`; almost all of them are renderer probes, and they
move behind `debug` rather than onto the handle.

### The record reader owns the dump format

`src/scene-data/real-systems.ts` validates a record and builds the set. It reads `name`
and `coords`, keeps the seven optional fields the phase 4 HUD needs, and drops the rest.
A Spansh record carries `bodies` and `stations` arrays; at 10,000 systems those would
hold megabytes the map never draws, so the reader drops them rather than storing them.

`id64` becomes a decimal string. A Spansh `id64` is a 64-bit integer and `JSON.parse`
rounds it above 2^53, so a host that parsed a dump with the default reviver has already
lost digits. The reader accepts a number, a string or a `bigint` and stores the text, so a
host that cares can pass the exact value and the HUD can show it.

Alternative: store `id64` as a `bigint`. Rejected: it does not survive `structuredClone`
into a worker as a plain object field without care, and the map only ever shows it.

### Positions stay in `float64` and the pass rebases them every frame

The set holds one `Float64Array` of three game coordinates per system. Each frame the
pass writes `position - camera` into a `Float32Array` and uploads it with one
`bufferSubData`. At the bound of 10,000 systems that is 30,000 subtractions and a 120 KB
write per frame.

Alternative: the chunk scheme the other passes use, where a buffer holds positions
relative to a chunk origin and never changes. Rejected here: the chunks would have to be
small enough to hold precision, and a set spread over the galaxy then gives one chunk per
system in the worst case, which is one draw call per system. The point cloud gets away
with one chunk because 2,000,000 static samples cannot be rebased per frame; 10,000 can.

The rebase also buys exactness. A `float32` holds a number of 125,000 to better than
0.008 light years, so every system in the set meets the 0.01 light year bound at every
camera position, not only the near ones. Phase 4 picks on the CPU from the same
`Float64Array`.

### A marker is a point sprite with a size floor, drawn after the tone map

The pass draws `gl.POINTS`, one vertex per system. The CSS diameter is
`clamp(focalCss * 20 / range, 7, 12)` and `gl_PointSize` is that times the device pixel
ratio, so a marker shrinks with distance like a body until it reaches 7 pixels, and never
grows past 12. `focal` in `renderer.ts` comes from the drawing buffer height, so it is
device pixels per light year and `focalCss` is `focal` over the ratio; writing the rule
in device pixels and then scaling again would scale twice, which the e2e ratio of 1 hides.
With the 35 degree field of view at 720 rows, the two limits bite below about 1,900 light
years of range and above about 3,260.

The fragment shader reads `gl_PointCoord`. The outer 2 CSS pixels of the disc take the
ring colour (0.02, 0.04, 0.10) and the rest takes the core colour (0.60, 0.90, 1.00). The
disc is opaque inside its edge and the antialiasing ramp is confined to the outer 1 device
pixel, so at the e2e ratio of 1 the inner CSS pixel of the ring is fully covered and a
test can read (5, 10, 26) from it. A 1 CSS pixel ring would put the ramp and the whole
ring in the same pixel, and over the galactic core, where the existing spec pins the
luminance between 0.8 and 0.97, a half-covered ring reads near (117, 117, 140).

The pass draws after the tone map and after the region overlay, with alpha blending and
no depth test. Three things follow. The far view is untouched when the set is empty. No
scene pass can wash a marker out at the galactic core. The scene light accounting of the
star field and the point cloud does not change.

Alternative: an additive scene pass beside the star field, with the zone colour ramp.
Rejected by the look decision: a real system must read as different from an invented star,
and a scene pass at the core is tone-mapped into the wash.

A perspective size with a floor rather than one fixed size: a marker that shrinks with
distance still reads as a thing in the scene while the camera moves, and the floor gives
the far view what a fixed size would give it anyway. The cost is two numbers to test
instead of one, which the size scenario covers at both limits.

### Suppression runs on the CPU and reaches the shader as a bit mask

The sweep is CPU work, because the CPU already has the star hash and the star pass has no
room to test a list per vertex.

**The reach.** The base class block reaches 2 base edges past the camera in the worse of
the two alignments, because `buildBoxelBlocks` derives the base low from the parent's
dropped four rather than from the camera's own boxel. That is `d / 16` while the base
class rule does not hit its clamp, and 320 light years above 5,120 light years of zoom.
Outside the block a twin survives: the class above the base places its stars at the same
spacing while its count stays under the cap, so near Sol at 500 light years of zoom a
real system 40 to 160 light years out keeps an invented star about 3 light years from it.
The owner settled suppression on the base class block, and extending it to every drawn
class turns a sweep of 512 boxels into one of 1,856, so this change states the limit
rather than removing it.

**The index.** `src/scene-data/star-suppression.ts` builds, for one size class, a map
from boxel index to the systems inside that boxel grown by 3 light years. A system enters
up to 8 entries, one per boxel whose grown box holds it. Building costs 10,000 inserts per
class and happens once per class per version of the system set.

**The sweep.** For each boxel of the base class block, the sweep looks the index up. The
lookup misses for almost every boxel, and a miss costs nothing more. On a hit the sweep
generates the boxel's placed star positions with `starOffsets` and tests each against the
systems of the entry. The result is 8 words of 32 bits, one bit per star index.

**The cache.** The result of a boxel depends on its address, its class and the version of
the system set, never on the camera. A `Map` keyed by class and index holds it, and the
map is cleared when the version changes or when it passes 8,192 entries. A camera that
moves by one base boxel on one axis then sweeps the 64 boxels that entered the set. The
worst case is the first sweep after a change of base class, which sweeps all 512.

A unit test counts the boxels each build swept, because that is what the cache rule
decides and a count does not depend on the machine. The wall clock is measured in the
browser instead, through the new `frameStats` accumulator: a pan at a fixed zoom distance
stays under 20 ms in its worst frame, and a zoom that crosses a base class boundary stays
under 50 ms.

**The upload.** The mask is an `R32UI` texture, 8 texels wide and one row per record of
the boxel table. `stars.vert` reads
`texelFetch(uMask, ivec2(gl_VertexID >> 5, gl_InstanceID), 0)` and drops the star when its
bit is set. Rows outside the base class are zero. The texture is 1,856 by 8 words, which
is 59 KB, and it is uploaded with the boxel table, so it follows the same cache.

A `uSuppress` uniform is 0 when the sweep found nothing anywhere. The shader then makes
no fetch at all, so a page with no system draws the frame it drew before this change,
byte for byte.

Alternative: pass the mask as 8 more instance attributes. Rejected: GLSL ES 3.00 cannot
index attributes dynamically, so the shader would need a chain of eight comparisons, and
the record would grow from 36 to 68 bytes for data that is almost always zero.

Alternative: test the star against the systems in the fragment or vertex shader directly.
Rejected: it needs the system list on the card in a form the shader can search, per
vertex, 475,136 times a frame.

### Light is conserved by dividing over the stars that remain

The spec now names two counts. The **placed count** is `min(256, round(count))`, which
does not depend on the system set. The **drawn count** is the placed count less the
suppressed stars.

`lightPerStar` becomes `boxelLight / drawnCount`. The boxel then carries the same light
whether or not a host loaded data, so the handover with the point cloud is untouched and
the galaxy does not dim.

The star radius keeps using the placed count. The radius sets only how concentrated a
star's light is. Holding it fixed means the field's grain does not shift when a host loads
data near the camera.

`drawnStarCount` in `src/scene-data/star-field.ts` returns the placed count, so it is
renamed `placedStarCount`. `systemCount(density, volume)` in the same file is renamed
`systemsInVolume`, because the handle's `systemCount()` returns a different quantity and
one name must mean one thing.

## Risks / Trade-offs

- **A base class change sweeps 512 boxels at once.** → The per-class index makes a miss
  free, and the per-boxel cache survives a return to the band. The spec accepts one slow
  frame there and bounds it at 50 ms, measured in the browser; a unit test holds the cache
  rule by counting the boxels each build swept.
- **10,000 markers at the floor size read as a dot cloud in the far view.** → That is the
  decision: a marker must be findable at every zoom. The host controls how many records
  it loads, and the `systems` switch removes the pass.
- **The per-frame rebase runs even when the camera has not moved.** → It is 30,000
  subtractions and a 120 KB write. The frame budget test covers it, because
  `measureFrames` redraws the same view and the rebase is not cached.
- **A boxel can lose every star.** → It needs a real system within 3 light years of each
  of them, which the placed spacing allows only where the boxel places one or two stars.
  The light lost is then under one point cloud sample's.
- **A twin survives outside the base class block.** → Near Sol at 500 light years of
  zoom, a real system 40 to 160 light years from the camera keeps an invented star about
  3 light years from it. The spec states the distances. Suppression in every drawn class
  is the fix, and it is a separate piece of work.
- **Dump data carries licence terms.** → The map ships no data, so the host owns the
  terms of whatever it loads. Nothing is added to `THIRD_PARTY_NOTICES` review.
- **The entry point is a new public surface.** → Eight of its nine members are the
  supported surface and the ninth, `debug`, is stated not to be. Phase 4 adds selection to
  the same handle.

## Open Questions

- Whether a host should be able to give a system its own colour or label. Deferred: it
  adds a per-system attribute and no requirement here depends on it.
- Whether phase 4 picks on the CPU from the `Float64Array` or with a GPU id buffer. The
  roadmap says the CPU at a few thousand systems, and this change stores what either
  needs.
- Whether suppression should run in every drawn size class rather than the base class
  alone. It removes the surviving twin, and it costs a sweep of 1,856 boxels instead of
  512. The cache and the index carry either, so the change is a rule and not a rewrite.
