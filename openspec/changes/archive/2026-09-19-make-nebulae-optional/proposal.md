## Why

The map loads the nebulae whether or not a host wants them. `createGalaxyMap` calls
`loadNebulaSet` and `loadNebulaAtlas` on every start, the renderer compiles the nebula
program on every context, and `src/render/renderer.ts` imports the pass and the record
set at the top of the file. Three costs follow.

1. Every host fetches **811,762 bytes** of sprite atlas and 14,626 bytes of records, at
   start, whether or not the nebulae ever draw. A host that opens the map at the default
   60,000 light years never sees one.
2. Every host that bundles the library carries the nebula code in its main chunk. The
   pass, the record set, the shader pair and the volume march are **up to 22,389 bytes**
   of the entry chunk's 275,909 — the whole of what `add-nebulae` and
   `add-nebula-occlusion` added, from a reading of 253,520 before them. The two assets sit
   in the host's build output as well.
3. A host cannot turn the nebulae off, and the user cannot either. The renderer has a
   pass switch, but nothing on the map handle or in the HUD reaches it.

The nebulae are the first feature of this library that is large, optional and made of
data. How they are turned on sets the pattern for the next one.

## What Changes

- **A subpath export.** `elite-dangerous-galaxy-map/nebulae` becomes a second
  entry point. It exports one value, the nebula source. A host that never imports it
  pulls no nebula code, no records and no atlas into its build.
- **An option, not a default.** `GalaxyMapOptions` gains `nebulae`. With no value the
  map fetches nothing, compiles no nebula program and draws no sprite. With the subpath
  export as its value the map behaves as it does today.
- **The renderer stops importing the nebulae.** `src/render/renderer.ts` keeps the
  half-resolution slot the sprites draw into and takes what draws into it from outside.
  It reaches the nebulae through `src/render/nebula-slot.ts` alone: the three slot types,
  which the build erases, and the two look defaults that module holds. It imports neither
  the nebula pass nor the record set. After task 5.3 it needs neither `NebulaPass` nor
  `NebulaSet`, and `noUnusedLocals` in `tsconfig.json` would force those type imports out
  in any case.
- **`src/render/buffers.ts` gives up its nebula half.** That module holds the atlas URL
  import at its top level and imports `NebulaError` as a value, and **eleven modules of
  `src/` import it, nine of them as values**. Leaving it as it is would keep `nebula-art.webp` and `nebulae.json` in a chunk the
  main entry loads, whatever the renderer does. The atlas loader, the atlas texture
  upload, the column count, the two atlas types and the `?url&no-inline` import move into
  a nebula-only module, and `buffers.ts` is left with no nebula edge at all.
- **A run-time switch.** The map handle gains `setNebulaeVisible`, `areNebulaeVisible`
  and `hasNebulae`. The HUD's map options panel gains a **Nebulae** switch, shown only
  where the map holds nebulae.
- **`sideEffects: false`** in `package.json`, so a host's bundler may drop what the host
  does not reach. The library imports no stylesheet, so the claim is true today.
- **The entry chunk falls.** The nebula code leaves it. The guard in
  `tests/main-bundle.test.ts` moves down to the next round figure above the new reading,
  and the `library-package` spec records the reading.
- **BREAKING for the demo, not for a host.** No host has the package yet — it is not
  published — but the behaviour changes for anyone building from this tree: nebulae that
  drew with no option now need one. `src/app/main.ts` passes the source, so the demo site
  looks the same.

### Non-goals

- **The npm tarball still carries the atlas.** Tree shaking removes the art from a
  *host's build*, not from the published package. Splitting the art into a package of
  its own is a bigger decision and is left out. The proposal states the cost so it is not
  a surprise.
- **No host-written nebula records.** The source type is what the subpath exports. The
  map accepts that value and turns the nebulae off on a value it cannot read. Opening the
  type so a host can supply its own records is a later change.
- **No change to what a nebula looks like.** The selection, the zoom band, the fades, the
  budget and the compositing are as `add-nebulae` states them. If `add-nebula-occlusion`
  has landed, its extinction moves with the pass and is unchanged.
- **No second optional feature.** The regions, the shapes and the star field keep the
  loading they have. This change sets the pattern; it does not apply it elsewhere.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `nebulae`: one modified requirement — the map holds 358 nebulae **when the host asks
  for them**, through the subpath export, and holds none otherwise. The capability is
  created by the in-flight change `add-nebulae`; this change stacks on it.
- `library-package`: the export list gains the nebula subpath and the types the option
  names, `package.json` gains a second `exports` entry and `sideEffects`, and the entry
  chunk bound takes its new reading.
- `map-hud`: the map options panel carries a fifth switch, shown only where the map holds
  nebulae. The requirement is renamed from "carries four switches" to "carries the map
  switches", because the count is no longer fixed.

## Impact

**Depends on `add-nebulae`.** That change is committed as `63184db` and archived as
`2026-09-19-add-nebulae`, so the `nebulae` capability is live in `openspec/specs/`. Every file this change edits is a file that change writes.

**The reading is 275,909 bytes, measured, against a bound of 280,000.** The comment block
of `tests/main-bundle.test.ts` records that figure and the tree builds to it, so the two
agree. `add-nebulae` gave the reading of 266,996 and the bound of 270,000, and
`add-nebula-occlusion` moved both; this change starts from the pair above. Re-read them
rather than trusting the figures written here.

**This change repairs a spec `add-nebulae` left behind.** `add-nebulae` moved
`ENTRY_CHUNK_LIMIT` from 254,000 to 270,000 in `tests/main-bundle.test.ts` and carried no
`library-package` delta, so that spec still records 254,000. `add-nebula-occlusion` then
moved the bound again, to 280,000, and carried no delta either. The `library-package`
delta of this change writes both steps into the requirement, as well as its own reading.

`openspec validate --strict` passes clean. It reported one INFO while `add-nebulae` was
still in flight — the `nebulae` delta modified a capability `openspec/specs/` did not hold
— and that cleared when `add-nebulae` was archived.

**The package name is the one the tree holds today.** `package.json` names
`elite-dangerous-galaxy-map`, so the subpath this change adds is
`elite-dangerous-galaxy-map/nebulae`. The rename to
`@elite-dangerous-almanac/galaxy-map` belongs to `publish-library-package`, which by its
own task 0.1 lands **after** this change.

**Order with `publish-library-package`.** That change takes this one first. Three things
follow. It modifies the same `library-package` requirement this change modifies, so
whichever lands second re-bases on the first. It renames the package, so the README line
this change writes in task 8.4 is rewritten there. And it moves every path of the
changed-code table below into `packages/galaxy-map/`, including the two new modules.

**Order with `add-nebula-occlusion`.** The two are independent, and either order works.
Taking `add-nebula-occlusion` first is better: this change moves the nebula shaders out
of the entry chunk, so the march that change adds lands in the optional chunk and costs
the entry chunk nothing. If the order is reversed, this change also moves the occlusion
uniforms and the shared density include across the boundary.

**Changed code**

| Path                                | What changes                                              |
| ----------------------------------- | --------------------------------------------------------- |
| `src/nebulae/index.ts`              | New. The subpath entry. It exports the source              |
| `src/render/nebula-slot.ts`         | New. The slot types, and the two look defaults              |
| `src/render/renderer.ts`            | Takes the draw from outside, through `nebula-slot.ts` alone |
| `src/render/nebula-atlas.ts`        | New. The atlas URL, its loader and its texture upload      |
| `src/render/volume-density.ts`      | New. The shared density rule, which two passes compile      |
| `src/render/buffers.ts`             | Gives up the atlas half and the `NebulaError` value import |
| `src/render/nebula-pass.ts`         | Takes the selection over from the renderer                 |
| `src/app/create-map.ts`             | The `nebulae` option, the three handle members             |
| `src/app/main.ts`                   | Passes the source, so the demo site is unchanged           |
| `src/index.ts`                      | Exports `NebulaSource`                                     |
| `src/hud/options-panel.ts`          | The fifth switch                                           |
| `package.json`                      | The `./nebulae` export, `sideEffects`                      |
| `vite.config.lib.ts`                | The second library entry                                   |
| `eslint.config.js`                  | `src/nebulae/` may import both layers; the rule says so    |
| `tests/main-bundle.test.ts`         | The tree-shaking test and the new bound                    |
| `AGENTS.md`                         | The directory table gains `src/nebulae/`                   |
| `src/index.test.ts`                 | `NebulaSource` joins the exact export list                 |
| `README.md`                         | The entry points, the layout and the nebula option         |
| `e2e/helpers.ts`                    | The `nebulae` open option and its rename                   |
| `e2e/global.d.ts`                   | Types the source the demo page puts on `window`            |
| `e2e/nebulae.spec.ts`               | Follows the renamed open option                            |

**Scale.** The record count, the budget of 256 drawn sprites and the one draw call are
unchanged. What changes is what a host downloads: **826,388 bytes** of records and art
and **21,851 bytes** of code, measured, from every start to no start at all unless the
host asks. The
galaxy is about 400 billion systems; the nebulae are 358 records either way.

**The rendering stays hardware accelerated.** This change moves the nebula draw out of the
renderer, so it is worth saying plainly: the renderer assertion of `browser-suite` is
unchanged and still gates every browser test of this change. `src/render/context.ts`
refuses a software context and `e2e/00-renderer.spec.ts` fails the suite on SwiftShader or
llvmpipe, and task 9.1 runs `pnpm test:e2e`.

**The invariant, stated once.** No module the main entry point reaches, at load or on
demand, may import `nebulae.json` or `nebula-art.webp`. Vite emits an asset from its
transform hook, before tree shaking, so a host whose bundle merely **reaches** such a
module gets the asset file in its output even where the code that names it is shaken
away. Cutting the import graph is what removes the file; cutting the call is not.

**How tree shaking is proved.** A test builds a host bundle that imports
`createGalaxyMap` alone, and asserts the output holds no record file, no `.webp`, and
none of the nebula shader text. A second builds one that imports the subpath as well and
asserts all three are present. Without the second, the first passes on a build that is
broken.

**Runtime dependencies**: none.
