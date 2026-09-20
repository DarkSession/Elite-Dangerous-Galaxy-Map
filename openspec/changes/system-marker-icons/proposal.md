## Why

A host can give the map a system's name, its colour and its category, but it cannot say
what the system **is**: a Titan, a fleet carrier, a community goal, a bookmark. The game's
own galaxy map answers that with a small square icon over the system. The map draws no
such icon, so a host that wants one draws its own overlay over the canvas and loses the
projection, the draw range and the category switch that the library already holds.

`@elite-dangerous-almanac/core` 0.2.15 publishes the catalogue of those 16 markers, as
`galaxy-map/markers`, with the symbol and the two colours of each, and the 16 vectors that
go with them at `assets/galaxy-map/`. Its `exports` map names no `./assets/*` row, so no
build could reach a vector. The almanac added that row in **0.2.16**, so the map reads the
colours and the vectors from the one dependency it already has.

**Non-goals.** An icon is decoration and a pick target is not part of this change: an icon
takes no pointer, shows no tooltip and opens no panel. The information panel does not list
a system's icons. The HUD grows one switch and no legend. An icon is a vector, and an
animated or a bitmap icon is out. Nothing here becomes a WebGL pass.

## What Changes

- A system record carries `icons`, a list of up to **4** entries. An entry is either a
  built-in symbol name, as a string, or an object with a `url` and a required `color`.
- The library ships the 16 built-in vectors and resolves a symbol to the file and to the
  glyph colour the almanac catalogue reports.
- The map draws the icons of a system as a **stack** over its marker, lowest icon first,
  in the record's own order. The stack is DOM elements in the overlay the pin, the ring
  and the name labels already use.
- The **lowest** icon of a stack carries a small arrow under it, in that icon's colour,
  pointing down at the marker. The other icons carry none.
- The handle carries `setSystemIconsVisible(on)` and `areSystemIconsVisible()`, and
  `GalaxyMapOptions` carries `systemIcons`. The switch starts **on**.
- The HUD map options panel grows a sixth switch, **System icons**, and `lockedOptions`
  grows the name `systemIcons`.
- The reader rejects a record whose `icons` it cannot read, with the reasons `bad-icon`
  and `unknown-icon`, and reports it the way it reports every other rejection.
- `@elite-dangerous-almanac/core` goes from **0.2.8** to **0.2.16**. The four leaves the
  map already reads keep their paths and their shapes, and one **value** in them moves:
  codex region 31 is renamed from `Formidine Rift` to `The Formidine Rift`. The map draws
  that name as a region label, so the bump changes what the map says. No test and no width
  constant in the tree holds the old string. `pnpm-workspace.yaml` already names the
  package in `minimumReleaseAgeExclude`, so the 7-day hold needs no edit and 0.2.16
  installs the day it publishes.
- **Almanac 0.2.16 is published** and adds the one `exports` row,
  `"./assets/*": "./assets/*"`, which is what makes a vector reachable. 0.2.15 already
  shipped the files and already named `assets` in its `files` list, so the row was the whole
  of that release.
- The library build marks `@elite-dangerous-almanac/core` and its subpaths external. That
  rule narrows to leave `assets/` alone, so the JavaScript leaves stay external and the 16
  vectors become files of the library's own build.

**The scale.** The set holds 10,000 systems and a record holds 4 icons, so the candidate
list can hold 40,000 icons. The overlay keeps the **32** stacks nearest the camera, so it
holds at most 32 arrows and 128 icon elements whatever the size of the set. The placement
runs in the same per-frame sweep the name labels run in, and the budget that sweep already
holds, 2 ms of mean frame time at a full set at 1920x1080, covers it. That sweep comes out
of the name switch's branch, because the icon switch defaults on where the name switch
defaults off, and a set in which no record names an icon skips the placement, so a host
that names no icon pays no per-frame work.

**The vectors come from the dependency.** The library imports each of the 16 vectors from
`@elite-dangerous-almanac/core/assets/galaxy-map/<symbol>.svg` and emits it as a file of
its own build. The package holds no copy of the artwork, so a vector cannot drift from its
catalogue record and the notices name a published version rather than a commit. The 16
files are about 11 KB together and every host's build carries them, which the design
states the reasoning for.

## Capabilities

### New Capabilities

- `system-icons`: the icon list on a record, the built-in catalogue, the stack over a
  marker, the arrow under the lowest icon, and the switch that turns the stack off.

### Modified Capabilities

- `real-systems`: a record carries `icons`, the reader rejects a record with `bad-icon` or
  `unknown-icon`, and the handle carries the two icon members and the `systemIcons` option.
- `library-package`: `SystemRecordInput` carries `icons`, the library exports the icon
  types, and the dependency moves to 0.2.16.
- `map-hud`: the map options panel carries a sixth switch, `lockedOptions` a sixth name,
  and the keyboard requirement counts the switches it reaches.
- `system-selection`: the frame budget of the per-frame overlay work now covers the icon
  placement as well.

## Impact

| What                                            | Why it changes                             |
| ----------------------------------------------- | ------------------------------------------ |
| `packages/galaxy-map/src/scene-data/marker-icons.ts` | New. The 16 vector imports, the built-in catalogue and the reader of one icon entry |
| `packages/galaxy-map/src/scene-data/real-systems.ts` | Reads `icons`, holds the two new reject reasons |
| `packages/galaxy-map/src/app/markers.ts`        | Places the stacks and the arrows            |
| `packages/galaxy-map/src/app/create-map.ts`     | The two new handle members and the option   |
| `packages/galaxy-map/src/hud/options-panel.ts`  | The sixth switch                            |
| `packages/galaxy-map/src/index.ts`              | The new exported types                      |
| `packages/galaxy-map/package.json`              | `@elite-dangerous-almanac/core` to 0.2.16   |
| `packages/galaxy-map/vite.config.ts`            | The external rule leaves `assets/` alone    |
| `packages/galaxy-map/THIRD_PARTY_NOTICES.md`    | Names the vectors, the leaf and the version they come from |
| `apps/demo/scripts/build-demo-systems.mjs`      | The converter and the icon table of the Thargoid war set |
| `apps/demo/demo-data/thargoid-war.json`         | New. The seventh set, whose records carry the built-in symbols |
| `e2e/`, `tests/`                                | The browser tests and the catalogue test    |
