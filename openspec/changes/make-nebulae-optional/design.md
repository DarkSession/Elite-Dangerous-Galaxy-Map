## Context

See proposal.md — Why.

What holds the nebulae in the main entry's chunk graph today is eight value imports, not
the data files. The data files already load as fetched assets.

| Where                       | What it imports as a value                                    |
| --------------------------- | ------------------------------------------------------------- |
| `src/render/renderer.ts`    | `selectNebulae`, `nebulaFocalPixels` from `scene-data/nebulae` |
| `src/render/renderer.ts`    | `createNebulaPass`, `createNebulaProgram` from `nebula-pass`   |
| `src/render/renderer.ts`    | `DEFAULT_NEBULA_BRIGHTNESS` from `nebula-pass`                 |
| `src/render/renderer.ts`    | `createNebulaAtlasTexture` from `buffers`                      |
| `src/app/create-map.ts`     | `loadNebulaSet`, `loadNebulaAtlas`                             |
| `src/render/nebula-pass.ts` | the two shader sources, as `?raw` text                         |
| `src/render/buffers.ts`     | `nebula-art.webp?url&no-inline`, at module top level           |
| `src/render/buffers.ts`     | `NebulaError` from `scene-data/nebulae`                        |

The last two are the ones that decide whether this change works. **Eleven modules of
`src/` import `buffers.ts`, nine of them as values**: `point-pass`, `volume-pass`,
`glow-pass`, `background-pass`, `region-pass`, `shape-pass`, `nebula-pass`, `renderer`
and `app/create-map`. `cloud-pass` and `reduce` import it for types alone, so they are
not among the nine that hold it in the graph. The main entry therefore reaches
`buffers.ts` at load whatever the renderer does about the nebulae. While `buffers.ts` names the atlas URL and
imports `NebulaError`, both asset files stay in the main entry's chunk graph and the
change delivers nothing.

**The invariant is about the import graph, not about the calls.** Vite emits an asset
from its transform hook, which runs before tree shaking. A host whose bundle *reaches* a
module that imports `nebula-art.webp?url` gets `nebula-art.webp` in its output even where
every call that would fetch it is shaken away. So: no module the main entry point
reaches, at load or on demand, may import either asset URL.

**Where `DEFAULT_NEBULA_BRIGHTNESS` lives after the cut.** The eighth import is the one
with no obvious home. `src/render/nebula-pass.ts:17` defines it, but that file does not use
it: `src/render/renderer.ts:442` seeds `look.nebulaBrightness` with it, `renderer.ts:585`
reads that member, and `renderer.test.ts:466` and `nebula-pass.test.ts:104` read the
constant. It is a renderer look default that happens to sit beside the pass. The renderer
keeps `look.nebulaBrightness` whether or not a source is given, so the value must survive
the cut.

It moves to `src/render/nebula-slot.ts`. That is the module the renderer is still allowed
to import, and the default is part of the slot's contract, because `NebulaFrame` carries
the brightness. The alternative — a literal in the renderer — breaks the convention every
other look default follows: `DEFAULT_CLOUD_BRIGHTNESS`, `DEFAULT_POINT_BRIGHTNESS`,
`DEFAULT_EMISSION`, `DEFAULT_ABSORPTION`, `DEFAULT_EXPOSURE` and the three glow values all
sit beside their pass, and the renderer imports all nine.

This makes `nebula-slot.ts` hold one value export rather than none. That is safe, and it is
narrower than it sounds: the export is a number literal with no import behind it, so it
pulls in no pass, no shader text, no atlas and no record file — which is what the
entry-chunk requirements actually assert. The guard of task 2.2 stays, tightened from
"compiles to nothing" to "holds this one constant and no other statement".

Rollup follows a value import and erases a type import. Cutting all eight, and giving the
renderer back the same behaviour through a value it is handed, is the whole change.

`src/hud/` already reaches the map through the public handle alone, and a lint rule
holds it there, so the HUD switch needs three new handle members and nothing else.

## Goals / Non-Goals

**Goals:**

- A host that imports the main entry point alone carries no nebula code, no records and
  no art, and the build proves it.
- The renderer keeps its frame order. The sprites still draw into the half-resolution
  target between the cloud sprites and the read-out.
- Turning the nebulae on costs the host one import and one option.

**Non-Goals:**

- A general plugin system. One feature is made optional, with types named for it. The
  next optional feature may follow the pattern or may not; this change does not build a
  frame for it.
- Removing the art from the published tarball. See **Risks**.

## Decisions

### A subpath export, not a dynamic import

**Chosen**: `elite-dangerous-galaxy-map/nebulae` is a second entry point, and
the host imports it to turn the nebulae on.

A dynamic `import('./nebulae')` behind a boolean option would split the chunk and keep
it out of the entry chunk, but the chunk is still **in the host's build output**, because
the host's bundler must emit every target of a dynamic import it cannot prove
unreachable. A boolean read at run time is not such a proof. The subpath export moves the
decision to the import graph, where a bundler can see it: no import, no chunk, no asset.

*Alternative: a `nebulae: boolean` option with a dynamic import.* Rejected for the reason
above. It also hides an 811 KB fetch behind a flag that looks free.

*Alternative: a separate npm package for the nebulae.*
Rejected for now. It is the only way to keep the art out of the tarball, and it costs a
second package to version, publish and keep in step with the map's internal types, which
the source touches. The subpath gives the host-side win at no such cost. If the tarball
size becomes the problem, the subpath is the seam the split would follow.

### The renderer holds a slot, and the feature fills it

**Chosen**: a new `src/render/nebula-slot.ts` holds the slot contract: what one nebula
draw needs per frame, what the renderer calls, and the one look default the renderer keeps
whether or not a source is given. It is types and a single number literal, with no import
of its own — see "Where `DEFAULT_NEBULA_BRIGHTNESS` lives after the cut" above.

```
NebulaFrame   what the renderer knows and the draw needs: the matrices, the camera,
              the zoom distance, the target size, the canvas height, the look
              constants, and the volume texture and its uniforms where the
              occlusion change has landed
NebulaDraw    draw(frame), drawnCount, drawCalls, dispose()
NebulaSource  loadSet(), loadAtlas(), createDraw(gl, set, atlas)
```

`src/render/renderer.ts` imports those three with `import type`, keeps a
`NebulaDraw | null`, and calls `draw` where it calls the nebula pass today. It stops
importing the selection, the pass, the program and the atlas texture as values.

The **selection moves into the draw**. Today the renderer calls `selectNebulae` and
`nebulaFocalPixels` and hands the instances to the pass. After this change the draw does
both from the frame it is given, so no selection code reaches the entry chunk.

*Alternative: keep the selection in the renderer and pass only the GL work out.*
Rejected: `scene-data/nebulae.ts` is the larger of the two modules, and leaving it
imported would leave the record types, the constants and the selection in the entry
chunk. The bundle test would fail on its own requirement.

*Alternative: an abstract "extra pass" registry the renderer exposes.* Rejected as
speculative. One feature needs this; a registry would be designed against one example.

### `NebulaSource` is public as a name, not as a shape

The main entry exports `NebulaSource` so a host can write the option in typed code. The
spec states that its members are not part of the supported surface and that a host passes
the value it imported.

Making it host-writable would pull `NebulaSet`, `NebulaAtlasImage`, `NebulaDraw` and
`NebulaFrame` into the supported surface. `NebulaFrame` carries WebGL textures and
uniform values, so exporting it would pin the renderer's internals as public API and
freeze them at the next minor version. A host that wants its own records is a real want,
and the seam is here when it arrives; it is not this change.

The map therefore **checks the value at run time**: a `nebulae` option that is not an
object, or that does not carry the three members as functions, turns the nebulae off and
reports nothing. That is the rule every other option of this library follows — "a setting
the map cannot read takes the default" — and it makes the type's softness harmless.

### `buffers.ts` gives up its nebula half

A new `src/render/nebula-atlas.ts` takes the `?url&no-inline` import of the atlas,
`loadNebulaAtlas`, `createNebulaAtlasTexture`, `NEBULA_ATLAS_COLUMNS`, `NebulaAtlasImage`
and `NebulaAtlasTexture`. Only `src/nebulae/` and `src/render/nebula-pass.ts` reach it.
`buffers.ts` also stops importing `NebulaError`: the throws that used it move with the
loader, so the class stays in `scene-data/nebulae.ts` and `buffers.ts` names neither
module.

*Alternative: leave the loader in `buffers.ts` and rely on tree shaking.* Rejected for
the reason above — the asset is emitted before tree shaking runs, so the file ships
whatever the shaker decides about the code.

*Alternative: split `buffers.ts` along some general line, such as one module per pass.*
Rejected as a larger change than this one needs. One nebula-shaped piece comes out;
everything else stays where the other seven passes already find it.

### The two asset files stay where they are

`src/scene-data/nebulae.json` and `src/render/nebula-art.webp` do not move on disk. What
moves is which module imports the atlas URL. Both are imported with `?url&no-inline` from
modules only the second entry point reaches, so Vite emits them as assets of that chunk.
Moving the files would change two SHA-256 fixtures and the third-party notices for no
gain.

### The library build gets a second entry

`vite.config.lib.ts` takes `lib.entry` as a map of two entries rather than one path,
keyed `index` and `nebulae`. Rollup then emits `index.js` and `nebulae.js` with the
shared modules in chunks between them, which is the shape the `exports` map needs.
`formats: ['es']` stays, so code splitting stays on and the HUD stays its own chunk.

**`lib.fileName` must stop being a string.** Vite's `resolveLibFilename` returns
`` `${fileName}.js` `` for a string, whatever the entry is, so two entries would both
resolve to `index.js`. Either drop `fileName` and let the entry keys name the files, or
give a function of the entry name. The task list checks both emitted file names rather
than assuming.

The risk is that Rollup hoists a shared module into a chunk **both** entries import, and
that the nebula modules land there. They cannot: nothing the main entry reaches imports
them. The bundle test reads the entry chunk and everything it imports at load, so a hoist
that did happen would fail the test rather than ship.

### The HUD switch is conditional, and the handle says why

The panel reads `hasNebulae()` and builds the fifth switch only when it is true. The
alternative — always build it and let it do nothing on a map with no source — gives the
user a control with no effect, which the other four never do.

`hasNebulae()` is a third handle member rather than a nullable return from
`areNebulaeVisible()`, because a boolean that is sometimes `null` makes every caller
handle three states to answer a two-state question.

## Risks / Trade-offs

**The published tarball still carries 811,762 bytes of art** → Accepted and stated in the
spec and the README. `npm` shows the unpacked size, so a host sees it before installing.
The seam for a later split is the subpath.

**A host forgets the option and the nebulae quietly vanish** → This is the intended
behaviour and it is silent by design: asking for no nebulae is not a fault, and a console
warning on every map that does not want them would be noise. The README states the
option, and the demo page is the worked example. The `nebulae` spec holds a scenario that
the map with no option reports no error.

**The occlusion change and this one touch the same files** → Take
`add-nebula-occlusion` first. Its march, its shared density include and its uniforms then
move across the boundary with the pass, as part of `NebulaFrame`, rather than being
written twice. If this change lands first, `add-nebula-occlusion` adds the volume texture
and its uniforms to `NebulaFrame` instead of to the pass's own frame type, which is the
same work in a different place.

**`sideEffects: false` is a claim a later change can break** → A module that imports a
stylesheet, or that runs a registration at import time, would be dropped from a host's
build with no error. The spec holds a scenario that searches `src/` for a `.css` import,
which catches the common case. It does not catch a registration side effect; nothing in
this library has one today, and the rule is written down where the next author will read
it.

## Migration Plan

Nothing is deployed, so there is nothing to migrate. Anyone building from this tree and
wanting the nebulae adds two lines:

```ts
import { nebulae } from 'elite-dangerous-galaxy-map/nebulae';
createGalaxyMap(canvas, { nebulae });
```

Rollback is the reverse: remove the option and the import.
