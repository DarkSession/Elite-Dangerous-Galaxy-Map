## Why

**The nebulae do not draw in Firefox.** The map asks whether the context carries
`EXT_texture_compression_rgtc` and `WEBGL_compressed_texture_s3tc`, and takes the
compressed path when both answer yes. Firefox answers yes to both and then refuses
`COMPRESSED_RED_RGTC1` on a `TEXTURE_2D_ARRAY`. The console says so:

```
WebGL warning: texStorage(Multisample)?: Format COMPRESSED_RED_RGTC1 cannot be used
with target TEXTURE_2D_ARRAY.
WebGL warning: compressedTexSubImage: The specified TexImage has not yet been specified.
```

`texStorage3D` fails, so the texture has no storage, so `compressedTexSubImage3D` fails
too. Every density volume stays unspecified and the march reads nothing. The second
warning is the consequence of the first and not a second fault.

**The rule is wrong, not the browser.** A present extension does not prove the format
works on every target. A probe on one RTX 4080 reads:

| browser  | format | `TEXTURE_2D` | `TEXTURE_2D_ARRAY`      |
| -------- | ------ | ------------ | ----------------------- |
| Firefox  | BC4    | OK           | **`INVALID_OPERATION`** |
| Firefox  | BC1    | OK           | OK                      |
| Chromium | BC4    | OK           | OK                      |
| Chromium | BC1    | OK           | OK                      |

The browser suite read this table again on 2026-09-20, in the page, with the probe of
task 4.2. Firefox answered `getError` 1282, which is `INVALID_OPERATION` and not the
`INVALID_ENUM` the first reading recorded, and 0 for the other three. Chromium answered
0 for all four. The error code is corrected above; the refusal is the same one.

Firefox refuses BC4 on the array target alone. It accepts BC1 there, and it accepts both
on a plain 2D texture. The fault is one format on one target.

**No test could have caught it.** `browser-suite` holds the Firefox project to the
renderer check and the paint budget spec. The nebula specs run in Chromium, which accepts
all four combinations, so the suite reads one of the two browsers the project ships to.

`store-nebula-volumes-as-slice-arrays` introduced this. Before it the volumes were
uncompressed texels on a `TEXTURE_3D`, which Firefox accepts, so the nebulae drew there.

## What Changes

- `nebulaBlockFormats` **SHALL probe** each format instead of reading the extension list.
  It makes a throwaway 4 by 4 by 1 `TEXTURE_2D_ARRAY`, calls `texStorage3D` with the
  format, reads `getError`, and deletes the texture. A refusal on either format returns
  `null`, so the decode path that already exists runs.
- The probe result decides **both formats together**. The owner chose the wholesale
  fallback over a per-format mix, so a context that refuses one format decodes both and
  the renderer keeps two states and not four. Firefox therefore decodes, which is what it
  did before the slice arrays.
- The Firefox project **SHALL run a nebula drawing test**. It reads the frame with the
  nebulae on and with them off and asserts the two differ. A draw-count assertion does not
  hold here: the count is right in the broken state, because the records pass the selection
  and the draw calls run. Only the pixels show the fault.
- The `nebulae` spec **SHALL state the fallback decode cost** the owner accepts: one
  synchronous task of 14.2 to 19.2 ms over twenty-eight readings on the development card,
  paid once at load after the first frame, with nothing waiting on it. It is a stated
  property with a bound and not a defect to find again.

No API of the library changes. No host switch changes. Nothing is removed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nebulae`: the fast path's condition becomes the probe and not the extension list; the
  fallback's trigger widens to a refused format; and the fallback's one-task decode cost
  becomes a stated property with its bound.
- `browser-suite`: the Firefox project runs a nebula drawing spec beside the renderer
  check and the paint budget spec, and the requirement states why a second browser is
  needed for this reading and what it may not assert.

## Impact

**This change stacks on `store-nebula-volumes-as-slice-arrays`.** That change is not
archived, so the sentence this change corrects — "Where the context carries both
`EXT_texture_compression_rgtc` and `WEBGL_compressed_texture_s3tc`, the renderer SHALL
upload the blocks with no decode" — lives in that change's delta and not in
`openspec/specs/nebulae/spec.md`. The delta here SHALL be written against the text change 2
leaves behind, and the two SHALL be archived in order. An archive out of order drops the
correction.

Scale: the probe is two `texStorage3D` calls on a 4 by 4 by 1 texture, once per context, at
start-up. Its cost does not follow the 358 records, the 33 volume assets or the ~400 billion
systems of the galaxy. It replaces two `getExtension` calls that were already made.

Code:

- [src/render/nebula-volumes.ts](src/render/nebula-volumes.ts) — `nebulaBlockFormats` gains
  the probe. The two upload paths and the decode do not change.
- [playwright.config.ts](playwright.config.ts) — the Firefox project's `testMatch` gains the
  nebula spec.
- [e2e/nebula-cost.spec.ts](e2e/nebula-cost.spec.ts) — it decides whether the run took the
  block path by calling `getExtension`, which is the reasoning this change declares wrong.
  It moves to an allocation.
- `e2e/nebula-views.ts` — new. The two views `e2e/nebulae.spec.ts` holds are module-local,
  and a second spec file needs one of them. It follows `e2e/region-views.ts`.
- Tests: `src/render/nebula-volumes.test.ts`, whose stub context must answer `getError` and
  `getParameter` before the probe lands, or every stub reads a refusal and three passing
  tests fail; a new guard in `e2e/nebulae.spec.ts` that refuses the format in the page, so
  the rule holds without Firefox keeping the fault; a new browser spec the Firefox project
  runs; and the `playwright.config.ts` unit test that asserts which specs that project
  matches.
- No baseline image changes. The Firefox reading compares two frames it takes itself, so it
  needs no committed snapshot, which is why `browser-suite` keeps `e2e/look.spec.ts` out of
  that project.
