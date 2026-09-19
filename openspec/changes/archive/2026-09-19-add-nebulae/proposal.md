## Why

The map draws the shape of the galaxy but none of its nebulae. They carry much of what a
player recognises: Barnard's Loop around the Orion complex, the Horsehead, the dark
regions that cut holes in the star field. Without them the mid-zoom view is a smooth haze
where there should be structure.

Three archived changes record "nebulae stay out" as a non-goal. That decision was correct
when the project had only a name and a position for each nebula, which is enough to place
a dot and not enough to draw anything. The project now holds the size, the shape and the
art for each one, so the decision is reversed.

## What Changes

- A new **nebula pass** draws 358 nebulae as screen-aligned sprites. The pass joins the
  volume and the cloud sprites in the half-resolution target, so it costs a quarter of the
  fragments and the glow reads it with the rest of the scene.
- A new **nebula set** in the scene data holds the records, selects which ones draw, and
  sorts them back to front. It never imports the renderer.
- A **zoom band** makes the nebulae a close-range and mid-range feature. Every selected
  nebula is at full weight from the closest zoom up to 12,000 light years, and nothing
  draws at or above 20,000. The default view opens at 60,000, so the far view does not
  change.
- Two **fades on the record** hold what a flat sprite cannot do close up: one as the
  camera comes inside a nebula, and one as a sprite grows large in the frame. Both take
  the weight of the sprite and never its size, so a nebula never stops growing while the
  viewer can still see it.
- Two committed data files: the records, and one sprite atlas. Both load as fetched
  assets, so neither enters the library's entry chunk.
- One new look constant for nebula brightness, and one new pass switch.

### Non-goals

- **Remnant nebulae (5,837) and local dust (70,215) stay out.** They are 200 times the
  record count for objects a player never names.
- **No close-zoom volumetrics.** Below the band where a nebula reads as a sprite the pass
  fades out rather than switching to a raymarch.
- **No ellipsoid and no rotation.** A nebula is a round sprite sized by one radius. The
  second axis and the rotation the art carries are dropped when the records are packed.
- **No labels and no picking.** A nebula is drawn only. It carries no label, and a click
  never selects it.
- **No per-nebula colour.** Colour belongs to the sprite art, and 34 tiles serve 358
  records.

## Capabilities

### New Capabilities

- `nebulae`: which nebulae the map holds, how many draw at a given zoom, how one is
  placed and sized, and how the sprite composites over the scene.

### Modified Capabilities

- `far-view-rendering`: the requirement **Glow surrounds the disc** gains the nebula pass
  as a third source of the blurred copy.

  Only the first sentence of that requirement changes, to name the nebula pass as a third
  source of the blurred copy. Its switch list stays as it is.

  Two other requirements in `far-view-rendering` hold lists that the nebulae join without
  contradicting: the requirement that names the three scene passes, and the switch list in
  **Cloud sprites give the haze its chunks**. Neither is modified. Each says what is true
  and stays true; adding to a list is not a correction, and reproducing a 165-line
  requirement to append one clause would bury the change. The cost is that no requirement
  in `far-view-rendering` names the whole frame order. The nebulae spec states where the
  pass sits.

- `close-view-stars`: the requirement **A star is drawn as a point sprite of the disc**
  names the nebula switch in the two readings that state an absolute difference, and in
  the paragraph that gives the reason for the region switch.

  These two readings open at 500 light years. The nebula band has no near end, so 135
  sprites draw there, and one bright sprite takes the difference between the brightest
  pixel and the corners to 0.14003 against a bound of 0.01. Each reading names its switch
  list in full, so the list fixes the outcome and the outcome moves. This is a correction
  and not an addition to a list, so the requirement is modified.

## Impact

**New code**

| Path                                | What it holds                             |
| ----------------------------------- | ----------------------------------------- |
| `src/scene-data/nebulae.ts`         | The record set, selection and sort         |
| `src/scene-data/nebulae.json`       | 358 records, 14,626 bytes, fetched         |
| `src/render/nebula-pass.ts`         | The pass and its instance buffers          |
| `src/render/shaders/nebulae.vert`   | The instanced quad                         |
| `src/render/shaders/nebulae.frag`   | The atlas lookup and the premultiplied out |
| `src/render/nebula-art.webp`        | 34 tiles of 256 by 256, 793 KiB, fetched   |

**Changed code**: `src/render/renderer.ts` for the pass and the switch,
`src/render/buffers.ts` for the atlas texture, `src/app/create-map.ts` for the look
constant, `THIRD_PARTY_NOTICES.md`.

**Scale.** The galaxy holds about 400 billion systems. This change adds 358 records, which
is small beside them and is the whole authored and procedurally generated nebula
population. At most 256 sprites draw in one frame, in one draw call, at half
resolution. The size floor is the tighter bound: it admits at most 184 records on a
canvas 1,080 CSS pixels tall.
The record set builds once when its asset arrives and never changes, so no frame pays to
build it. Both data files are committed to this repository, so the map depends on nothing
outside it.

**The bundle grows and the guard moves.** The entry chunk guard in
`tests/main-bundle.test.ts` sits at 254,000 bytes and the last reading is 253,520, which
leaves 480 bytes. Two things follow.

The two data files load as fetched assets rather than as imported modules, so the 14,626
bytes of records and the atlas never enter the chunk.

The new code does enter it. Shaders reach the entry chunk as text: it already holds 26
shader sources, about a quarter of the chunk, and the cloud pair alone is 9,014 bytes. A nebula shader pair, the pass,
the set and the wiring come to roughly 10 KB against 480 bytes of room. This change
therefore **moves `ENTRY_CHUNK_LIMIT` to 270,000**, the next round figure above its
reading of 266,996 bytes, and records the reading and the reason in the guard's comment. The test file
already asks the next change that touches the chunk to do this.

**Runtime dependencies**: none. Both data files are committed, and the renderer already
has every WebGL2 feature the pass needs.

**The data is produced outside the tree.** The records and the atlas are built by a step
that is not in this repository and are committed here as finished files, with a SHA-256
fixture over each.

**Current state of the two files.** Both are complete. `src/scene-data/nebulae.json` holds
358 records in 14,626 bytes, with 34 tile names. `src/render/nebula-art.webp` is a 1536 by
1536 atlas of 34 tiles of 256 by 256, 811,762 bytes, and every one of the 34 slots carries
art, so all 358 records draw.

**The map reads no nebula catalogue today.** No file under `src/` imports one. The
installed almanac package ships 346 real and procedurally generated nebulae, each with a
name, a system and a position, but nothing in the map reads them. The committed record set
therefore adds a second place where nebula names and positions live. Design records why
the set is committed whole rather than joined to that package as a side table.

**Browser tests inside the band change.** Two tests in `e2e/look.spec.ts` read frame light
where the nebulae draw at full weight: "the bulge has a soft top" at 25,000 light years,
and "the sum of the sprites stays bounded" at 12,000. The first switches off every pass
that does not belong to the volume, by name, so it needs `nebulae: false` added. The
second reads a mean over the whole frame, and the tone map is not linear.

These tests must be made to pass by switching the pass off where a test isolates the
volume, **not** by widening a band a test already states. A loosened band is the silent
regression this change most needs to avoid.

Three tests in `e2e/stars.spec.ts` need the same switch, at 500 light years. Two of them
read an absolute difference, and their scenarios name the switch list in full, so the
`close-view-stars` delta above names the nebulae as well.

**Every browser test waits for the nebulae.** The records and the atlas attach after the
first frame, so `ready` can settle before a sprite can draw and a test that reads the
canvas would race the upload. `openMap` in `e2e/helpers.ts` therefore waits for the attach
and draws one frame, for every spec. One option turns the wait off, for the test that
holds the atlas request open.

**Licence.** The two files need their terms recorded in `THIRD_PARTY_NOTICES.md` before a
release carries them. Whether those terms permit the atlas to ship is a decision for the
maintainer, not one this proposal settles.

**The roadmap goes.** `docs/roadmap.md` holds 1,327 lines and names the nebulae as a
future item, among many others that are now done or dropped. The maintainer removed the
file, so the deletion rides in this change's diff. No code reads it. Two main specs still
cite it: `openspec/specs/close-view-stars/spec.md` and
`openspec/specs/real-systems/spec.md`. Those citations are stale and this change does not
repair them.
