## Context

See [proposal.md](proposal.md) for the fault and the readings.

`nebulaBlockFormats` in [src/render/nebula-volumes.ts](../../../src/render/nebula-volumes.ts)
reads the two extensions and returns their format enums, or `null`. Its one caller,
`createNebulaVolumeTextures`, takes `null` as the order to decode every volume on the CPU.
Both paths then call `createArray`, which runs `texStorage3D` on a `TEXTURE_2D_ARRAY` and
fills it with `compressedTexSubImage3D` or `texSubImage3D`.

The decode path works. It is simply never reached in Firefox, because the extension test
says the fast path is available and the fast path then fails inside `createArray`, after the
decision is made and with no way back.

## Goals / Non-Goals

**Goals:**

- The nebulae draw in Firefox.
- The renderer proves a block format on the target it will use, before it commits.
- The browser gate can catch this class of fault in future.
- The accepted cost of the fallback is written where a reader meets it.

**Non-Goals:**

- No per-format mix. A refused format takes both volumes to the decode path.
- No change to the two upload paths, the decode, the container reader or the art.
- No change to any interface a host implements, and no new host option.
- No fix for the one-task decode cost. The owner accepts it; the spec now states it.

## Decisions

### The probe is an allocation the driver answers

`nebulaBlockFormats` makes a texture, binds it to `TEXTURE_2D_ARRAY`, calls
`texStorage3D(TEXTURE_2D_ARRAY, 1, format, 4, 4, 1)`, reads `getError`, and deletes the
texture. One block of 4 by 4 texels is the smallest allocation either format can make, so
the probe cannot fail for a reason of size.

Alternatives, all rejected:

- **Read the extension list**, which is what fails today. A present extension says the
  format exists, not that the target accepts it.
- **Name the browser.** A user agent test would fix Firefox today and rot at the next
  release, in either direction. The driver already answers the question.
- **`getInternalformatParameter`.** It reports sample counts for renderable formats. It
  does not answer whether a compressed format is valid on an array target.

The probe costs two `texStorage3D` calls and two `getError` calls, once per context, at
start-up. `getError` is a synchronous round trip, which is why the probe runs twice and not
once per volume.

### The probe drains the error queue first and restores the binding after

`getError` returns **one** error and clears it, so an error raised before the probe would
read as the probe's own. The probe SHALL therefore drain the queue before each allocation.

The probe binds a texture. `createArray` binds its own texture before every upload, so a
stale binding harms nothing today, but the probe SHALL still restore the previous
`TEXTURE_BINDING_2D_ARRAY`, because a function that reports a capability should not change
the context it reports on.

### A refused format takes both volumes to the decode path

The owner weighed the per-format mix and declined it. Firefox would keep its compressed
colour and decode only the density, which is a shorter stall and less video memory. It costs
four states where the renderer has two, and the fallback is the path the map ran on before
the slice arrays, on a desktop CPU where the decode reads 14.2 to 19.2 ms.

The existing comment in `nebula-volumes.ts` gives the old reason for two states, that the
mix is "a combination no desktop driver has". That reason is now false and the comment SHALL
be corrected to the real one: the owner weighed the mix and chose the simpler renderer.

### The Firefox test reads pixels, not counts

In the fault every count reads correctly. The records pass the selection, the draw calls
run, the covered area is whatever the boxes cover. The textures hold nothing, so the frame
carries no nebula. A test that asserts `nebulaDrawnCount() > 0` passes against the bug.

The Firefox spec therefore takes the frame twice, once with the nebulae on and once with
them off, and asserts the two differ. That reading is browser-independent and needs no
committed image, which is what keeps it inside the `browser-suite` rule that holds the one
baseline to Chromium.

It goes in a **new spec file of its own** rather than into `e2e/nebulae.spec.ts`. That file
is long, Chromium-only and full of readings this project must not take, and `testMatch` is
per file.

The two views `e2e/nebulae.spec.ts` holds are module-local, so the new file cannot read
them. They move to **`e2e/nebula-views.ts`**, beside `e2e/region-views.ts`, which is the
pattern the repository already uses for a view two files share. A copied string in the new
file would drift from the one the Chromium suite reads.

### The durable guard simulates the refusal in Chromium

A Firefox reading catches the fault today and stops catching it the day Firefox fixes its
driver. The rule this change states is not about Firefox: it is that a refused format must
take the decode path and the map must still draw.

A second browser test therefore patches `texStorage3D` in the page to refuse
`COMPRESSED_RED_RGTC1` on a `TEXTURE_2D_ARRAY`, and asserts the map still draws its
nebulae and that the load records a decode. It runs in the project that runs the whole
suite, so it holds on every run. The repository already patches
`WebGL2RenderingContext.prototype` in the page in two specs, so the technique is not new
here.

The two readings answer different questions and the change keeps both. The Chromium guard
holds the rule for ever. The Firefox reading proves the rule is the one a real driver
needs, which no simulation can prove on its own.

### The stub context has to answer two more calls

`fakeContext` in `src/render/nebula-volumes.test.ts` is a Proxy. Every call that is not
`createTexture` or `getExtension` returns `null`, and every `SCREAMING_CASE` key returns an
auto-numbered constant. So `getError()` reads `null` while `NO_ERROR` reads a non-zero
number, and after the probe lands **every stub context reports a refusal**. Three tests
that pass `blockFormats = true` would fall to the decode path and fail.

The stub therefore has to answer `getError` and `getParameter` before the probe is written,
with per-format error injection so the scenarios of the delta can be written at all. That
is a task of its own, and it comes first.

### The page probe in the cost spec repeats the error this change fixes

`e2e/nebula-cost.spec.ts` decides whether the run took the block path by calling
`getExtension` on a throwaway context. That is the reasoning this change declares wrong. It
reads correctly on the development card by luck, and it would read wrongly in Firefox. It
moves to an allocation, like the renderer's own probe.

### The unit test refuses each format on its own

A stub context that reports both extensions and fails one allocation is enough to hold the
rule. The test SHALL do it twice, once refusing the density format and once refusing the
colour format. A test that refuses only the first would pass against a renderer that probes
the first format and trusts the second, which is the same class of error as the one this
change fixes.

## Risks / Trade-offs

- **The probe could pass and the real allocation still fail.** The volumes are 32, 48 and 64
  to a side where the probe is 4. A driver that accepts 4 and refuses 64 would defeat it. →
  The refusal seen is a format-and-target rule, which does not follow size, and the probe
  reproduces it exactly. The fixture scenarios still compare the two paths' frames, so a
  silent difference is caught there.
- **Firefox now takes the decode path, so the map pays the one long task there.** → That is
  the state Firefox was in before the slice arrays, and the owner accepts it. The 24 ms
  ratchet in `e2e/nebula-cost.spec.ts` bounds it. The ratchet runs in Chromium with both
  extensions refused, which reads the same decode.
- **The Firefox project grows a third spec, so the timed pass takes longer.** → It is one
  view and two frame reads, on one worker. The pass already runs a paint budget spec that
  moves the camera for 300 frames.
- **A future contributor could add a baseline image to the Firefox spec.** → The
  `browser-suite` delta adds a scenario that fails when any spec the Firefox project matches
  calls `toHaveScreenshot`.
- **A stale bundle makes a falsification check lie.** With `GALAXY_MAP_E2E_BUILT=1` the
  Playwright server runs `pnpm preview` alone and serves the previous build, so a source
  change reverted to prove a test fails never reaches the browser and the test passes. →
  Every task that reverts the fix to prove a test catches it SHALL build first, and says so.

## Open question, answered

**What does the probe do when `createTexture` returns `null`?** It treats it as a refusal
and returns `null`, so the map decodes. A context that cannot make a 4 by 4 by 1 texture
cannot make the 33 volumes either, and `createArray` throws on a null texture today. The
decode path fails the same way a moment later, with a clearer error, and the probe does not
have to invent a second one.

## Archive order

This change corrects a sentence that `store-nebula-volumes-as-slice-arrays` writes, and that
change is **not archived**. Its delta holds the text, not `openspec/specs/nebulae/spec.md`.

The delta here is written against the text change 2 leaves behind. The two SHALL be archived
in that order: change 2 first, this change second. Archiving this one first would apply a
modification to a requirement whose current text does not carry the sentence it corrects.
