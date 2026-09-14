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
- `renderer.ts` computes one handover weight per frame and gives it to `star-pass.ts` and
  to `point-pass.ts`. `stars.vert` multiplies a star's brightness by `uWeight * (1 - s)`
  and `points.vert` multiplies a sample's by `1 - uHandoverWeight * (1 - s)`, with the
  same `s`. One weight therefore drives both sides of the handover.
- `renderer.ts` also guards the star draw on that same weight: at line 341 the block that
  calls `starField.update`, draws the pass and reads `starPass.vertexCount` and
  `table.drawnStars` runs only when `weight > 0`. The two counts the page reports are
  zeroed above the guard, so whatever switches the weight to 0 also zeroes them.
- The vertical field of view is 60 degrees, in `FIELD_OF_VIEW_DEGREES` in
  `src/camera/view.ts` and in the `map-navigation` requirement. The `p=35` of the test
  fragments is the pitch, not the field of view.
- The base size class is `clamp(ceil(log2(distance / 320)), 0, 4)`, so it changes just
  above 320, 640, 1,280, 2,560 and 5,120 light years, and `map-navigation` clamps the
  zoom distance to 500.

## Goals / Non-Goals

**Goals:**

- One entry point a host calls, which returns a handle before the scene data is ready.
- A record reader that owns the external dump format, so nothing else reads a raw record.
- A colour the host controls, so what a marker's colour says is the host's to decide.
- A close view that holds the host's systems and nothing the map invented.
- Exact drawn positions for every system, at every zoom distance, which phase 4 reuses
  for picking.
- Suppression whose cost does not grow with the frame rate.
- No change to the galaxy's brightness when a host loads data.

**Non-Goals:**

- A published npm package, a bundle format or a version policy. This change makes the
  entry point; packaging is a separate piece of work.
- A worker for the record reader. 10,000 records validate in well under one frame, which
  the reader holds by keeping a `Map` from a system's identity to its slot. Without that
  map the identity rule scans the set for each record, which is 50,000,000 comparisons for
  a full call on the host's main thread; with it a call of 10,000 records is 10,000 map
  lookups and stays under 50 ms. A task measures it.
- Suppression outside the base size class.

## Decisions

### The entry point returns a handle at once, and a `ready` promise separately

`createGalaxyMap(canvas, options)` builds the render context, starts the workers and
returns the handle in the same tick. `addSystems` therefore works before the first frame. The set
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

The handle carries eleven members. That is more than the `createGalaxyMap` plus add and
clear the owner settled on, and the human should see the growth. Eleven is what the page
needs to do its job: six for the categories, the system set and the lifecycle, three for
the view, one for the failure path and one, `debug`, for the hooks the browser tests
read.
`debug` is not supported surface, so it can grow and shrink without a change of the
library's contract. Today `main.ts` sets about 25 fields on `window.__galaxyMap`; almost
all of them are renderer probes, and they move behind `debug` rather than onto the
handle.

### The record reader owns the dump format

`src/scene-data/real-systems.ts` validates a record and builds the set. It reads `name`,
`coords` and `primaryCategory`, keeps the seven optional fields and the secondary
categories the phase 4 HUD needs, and drops the rest.
A Spansh record carries `bodies` and `stations` arrays; at 10,000 systems those would
hold megabytes the map never draws, so the reader drops them rather than storing them.

`id64` becomes a decimal string. A Spansh `id64` is a 64-bit integer and `JSON.parse`
rounds it above 2^53, so a host that parsed a dump with the default reviver has already
lost digits. The reader accepts a number, a string or a `bigint` and stores the text, so a
host that cares can pass the exact value and the HUD can show it.

Alternative: store `id64` as a `bigint`. Rejected: it does not survive `structuredClone`
into a worker as a plain object field without care, and the map only ever shows it.

### No call removes one category, and the name is the identity

The host names its categories and the map holds them in a table beside the set, in
`src/scene-data/real-systems.ts`. A category is a name, three colour components from 0 to
255 and an optional description. The map gives no category of its own, because what a
colour means is the host's to decide: one host groups by allegiance, another by star
class, and neither wants the map's opinion.

The name is the identity, and no call removes one category. Two things follow. A host
re-themes its map by adding a category of the same name with a new colour, which recolours
every marker that names it in the next frame. And a system in the set can never name a
category the table does not hold, so the marker pass never has to draw a colour that is
not there.

A host that loads a different data set needs the table emptied, so the handle carries
`clearSystemsAndCategories`. It empties the table and the set in one call, which is what
keeps the rule above true: a category leaves only with every system that could name it.
There is no `clearCategories` on its own, because that is the call that would orphan a
system.

Alternative: a `setCategories` that replaces the whole table. Rejected: it can drop a
category a system in the set still names, and then either the set has to be swept for
orphans or the pass needs a fallback colour. One paired clear plus add-only removes the
case.

Alternative: accept a record whose category the table does not hold and draw it in a
default colour. Rejected: a misspelt name would then show as a drawn system rather than an
entry in the report, and the host would have no way to find it. The reader rejects it as
`unknown-category`, so the host adds its categories first and reads the report.

The set holds a `Uint16Array` of one category index per system, in the order the records
were added. `system-pass.ts` builds a `Float32Array` of three colour components per system
from that index and the table, and uploads it once, when the set version or the table
version changes. The colour therefore does not enter the per-frame rebase, and a recolour
costs one buffer write and no work in the loop.

Alternative: a colour lookup in the shader, from a uniform array or a texture of 256
categories. Rejected: it saves a 120 KB buffer that is written only when the host changes
something, and it costs an indirection per vertex and a second thing to keep in step.

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
With the 60 degree field of view at 720 rows, `focalCss` is 623.5 CSS pixels per light
year at one light year of range, so the cap bites below about 1,040 light years of range
and the floor above about 1,780. The `p=35` of the test fragments is the pitch, not the
field of view.

The fragment shader reads `gl_PointCoord`. The outer 2 CSS pixels of the disc take the
ring colour (0.02, 0.04, 0.10) and the rest takes the core colour, which the vertex shader
reads from the per-system colour buffer. The disc is opaque inside its edge and the
antialiasing ramp is confined to the outer 1 device pixel, so at the e2e ratio of 1 the
inner CSS pixel of the ring is fully covered and a test can read (5, 10, 26) from it. A
1 CSS pixel ring would put the ramp and the whole ring in the same pixel, and over the
galactic core, where the existing spec pins the luminance between 0.8 and 0.97, a
half-covered ring reads near (117, 117, 140).

The ring is fixed and dark while the core is the host's. The host can give a category any
colour, including one close to the ground it draws over, and the dark ring is what keeps
the disc's edge readable at the 7 pixel floor whatever it chooses.

The pass draws after the tone map and after the region overlay, with alpha blending and
no depth test. Three things follow. The far view is untouched when the set is empty. No
scene pass can wash a marker out at the galactic core. The scene light accounting of the
star field and the point cloud does not change.

Alternative: an additive scene pass beside the star field, with the zone colour ramp.
Rejected by the look decision: a real system must read as different from an invented star,
and a scene pass at the core is tone-mapped into the wash. The category colour is what
carries that difference now, and a tone-mapped pass would not hold the colour the host
asked for.

A perspective size with a floor rather than one fixed size: a marker that shrinks with
distance still reads as a thing in the scene while the camera moves, and the floor gives
the far view what a fixed size would give it anyway. The cost is two numbers to test
instead of one, which the size scenario covers at both limits.

### The invented field fades out as the camera comes in

The decoration star field stands in for systems the map holds no record of. Close in, that
is a lie the frame can no longer hide: the stars are single points, and a point the map
invented sits beside a marker the host gave it. The field therefore fades out as the zoom
distance falls. The close fade is a smoothstep, 0 at 640 light years and below and 1 at
2,560 and above.

The band is picked from the base class rule. The class changes just above 320, 640, 1,280,
2,560 and 5,120 light years, and `map-navigation` clamps the zoom distance to 500, so 640
is the lowest boundary the camera can reach and the field is gone over the whole reachable
500 to 640 band. At 2,560 the field draws in full, which leaves the close view of phase 2
its range from 2,560 outward.

**The star pass takes the fade and the point pass does not.** `renderer.ts` computes one
handover weight per frame and gives it to both passes. `stars.vert` reads
`uWeight * (1 - s)` and `points.vert` reads `1 - uHandoverWeight * (1 - s)`, with the same
`s`. The renderer gives the star pass `close * weight` and the point pass `weight`
unchanged, so the fade is two lines and neither shader changes.

**The point cloud must not take the light back.** Multiplying the one weight and letting
the sum-to-one rule stand would hand the near-field light to the point cloud, and a point
sample near the camera is not a star: 2,000,000 samples over the galaxy make one sample
stand for about 98,000 systems, and `points.vert` draws it as a sprite of up to 4 pixels
whose brightness is thousands of times a far sample's. Suppressing those samples inside
the covered sphere is exactly what the phase 2 handover is for. At Sol there are about 2
of them within the 240 light year inner radius, which is what "almost none" would have
meant; at the galactic centre, where the delta's own scenario says every 20 light year
boxel caps, there are about 90. The close view would fill with saturated blocks, which is
the opposite of the goal. So the light the field gives up leaves the frame, and the spec
says plainly that it is not conserved below a zoom distance of 2,560 light years.

**The one thing the fade must not reach is the draw guard.** `renderer.ts` runs the star
block only when the weight is above 0, and it reads the vertex count and the drawn star
count inside that block. If the close fade went into the weight the guard tests, then at
640 light years and below the field would build no table, the sweep would not run and
both counts would read 0, which contradicts the bound scenarios of `close-view-stars` at
500 light years. The renderer therefore keeps two numbers: the handover weight, which
guards the draw and holds the fade band from 4,000 to 8,000 light years, and the weight
the passes receive, which is the handover weight times the close fade. The pass draws its
475,136 sprites at every close zoom distance; below 640 light years each one carries no
light.

Both invented sources therefore stand down near the camera: the field because of the
close fade, the point cloud because the handover already suppresses it inside the covered
sphere. The volume raymarch and the cloud sprites still draw the galaxy behind, so the
frame is not black; it is the near field that clears, and what is left in it is what the
host loaded.

**The `stars` switch stops changing the handover weight.** The weight read
`drawsStars ? starWeight(distance) : 0`, so switching the star pass off gave the point
cloud its near field back. The scenario "A real system stays when the invented field
goes" cannot hold with that rule: at 640 light years the close fade is 0 and the field
adds no light, but switching the pass off still moved the point cloud, and the two frames
differed. The weight now reads the zoom distance alone while the field stands. The switch
then controls one pass, as every other pass switch does. A field that has not loaded is
the one case that still gives the point cloud its near field, so the first frames of a
close view are not empty.

The cost is that the `stars` switch no longer conserves light. The scenario "The handover
keeps the light" at 4,000 light years reads 0.2652 against 0.2650, a difference of 0.0002
against its limit of 0.02, because the handover band there lies inside 1,920 light years
and most of the frame is further away. That reading now measures how little light the
field carries at that view rather than that the two sources sum to 1. The unit scenario
"The two fades sum to one" is what holds the sum. Nothing in the page or the controls
turns the switch off, so the production frame does not change.

Alternative: fade the field by range from the camera rather than by zoom distance.
Rejected: it would empty a shell around the camera at every zoom distance, the far view
included, and the field's grain in the far view is what the point cloud hands over to. The
owner asked for a rule about zooming in, and the zoom distance is what the user turns.

Alternative: skip the star draw call when the close fade is 0. Rejected for now: it makes
the two counts the page reports depend on the zoom distance, which changes the existing
`close-view-stars` bound scenarios, and it saves work at a zoom distance where the frame
already holds the budget with the field at full light. The sweep and the table run
whatever the fade is, so the counts mean one thing at every view. It stays open as an
optimisation, because it costs nothing but the counts.

**The field's own look constants are measured where the fade now empties.** Three browser
scenarios of `close-view-stars` pin the field's light, its grain and its switch at 500
light years of zoom distance, where the base class is 1 and a boxel places every system it
holds. There is no other zoom distance that shows single points rather than a capped wash,
so moving them would recalibrate constants this change has no business touching. `debug`
therefore gains `setCloseFade`, a test hook that holds the fade at a fixed value, and
those three scenarios hold it at 1. A fourth scenario reads the same view without the
hook and asserts the field adds no light, which is the new behaviour.

### Suppression runs on the CPU and reaches the shader as a bit mask

The sweep is CPU work, because the CPU already has the star hash and the star pass has no
room to test a list per vertex.

**The reach.** The base class block reaches 2 base edges past the camera in the worse of
the two alignments, because `buildBoxelBlocks` derives the base low from the parent's
dropped four rather than from the camera's own boxel. That is at least `d / 16` while
the base class rule does not hit its clamp, and 320 light years above 5,120 light years
of zoom.
Outside the block a twin survives: the class above the base places its stars at the same
spacing while its count stays under the cap, so near Sol at 500 light years of zoom a
real system 40 to 160 light years out keeps an invented star about 3 light years from it.
The owner settled suppression on the base class block, and extending it to every drawn
class turns a sweep of 512 boxels into one of 1,856, so this change states the limit
rather than removing it.

**What the rule is for, now that the field fades.** The close fade empties the close view,
so suppression is no longer what keeps an invented star away from a real one there. It is
what keeps them apart in the band where both draw. That band is narrow at the fine end: a
real system removes 0.43 placed stars on average between 640 and 1,280 light years of zoom
distance, 0.057 between 1,280 and 2,560 and 0.0071 above, because the base class coarsens
as the camera pulls back. The owner chose to keep the rule with those numbers stated. It
also holds for the case the close fade does not cover, which is a host that reads a
boxel's drawn count rather than the frame.

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
  3 light years from it. The close fade covers that case, because the field adds no light
  below 640 light years of zoom distance. The spec states the distances. Suppression in
  every drawn class is the fix for the band above, and it is a separate piece of work.
- **Suppression removes few stars in a far frame.** → That is not the measure of the
  rule. The rule is a correctness rule: the map must not put an invented star beside a
  real one, because the user cannot tell the two apart and reads the invented one as a
  place they can go to. The count it removes is the count that would be wrong, and the
  rule must remove all of it, not much of it. A browser reading at a zoom distance of
  1,000 light years removes 53 stars of the 8,822 the base class places there, and a
  brute-force check of every placed star against every system finds the same 53. The
  base class also coarsens as the camera pulls back, so a real system removes 0.43
  placed stars at 640 to 1,280 light years of zoom distance and 0.057 above 1,280. The
  cost is a sweep, a cache and a mask texture.
- **The close view can be empty.** → A host that loads no system sees the near field
  clear as it zooms in, and the galaxy behind it from the volume and the cloud sprites.
  That is the decision: below 640 light years of zoom distance the map draws what the
  host gave it and nothing it invented.
- **A category colour can be unreadable.** → The host picks the colour, and it can pick
  one close to the ground the marker draws over. The fixed dark ring holds the disc's
  edge, and the map adds no rule on the colour beyond the 0 to 255 range.
- **Dump data carries licence terms.** → The library ships no data, so the host owns the
  terms of whatever it loads. The demo page is a host, and it carries a demo data set of
  381 Guardian systems that the owner asked for outside this change.
  `THIRD_PARTY_NOTICES.md` names that set, its source and its MIT terms. The production
  build drops the file and the code that reads it, so the bundle the library ships holds
  no data.
- **The entry point is a new public surface.** → Ten of its eleven members are the
  supported surface and the eleventh, `debug`, is stated not to be. Phase 4 adds selection
  to the same handle.

## Open Questions

- Whether a host should be able to give one system its own colour, outside its category.
  Deferred: the category table covers what the owner asked for, and a per-system colour
  would give the same pixel two sources.
- Where the close fade band should sit. The owner settled on 0 at 640 light years of zoom
  distance and 1 at 2,560. It is two numbers in `renderer.ts`, so phase 4 can move it
  after the HUD shows what the close view is used for.
- Whether a category should carry more than a colour and a description, such as a marker
  shape or a draw order. Deferred: nothing in phase 4 needs it yet.
- Whether phase 4 picks on the CPU from the `Float64Array` or with a GPU id buffer. The
  roadmap says the CPU at a few thousand systems, and this change stores what either
  needs.
- Whether suppression should run in every drawn size class rather than the base class
  alone. It removes the surviving twin, and it costs a sweep of 1,856 boxels instead of
  512. The cache and the index carry either, so the change is a rule and not a rewrite.
