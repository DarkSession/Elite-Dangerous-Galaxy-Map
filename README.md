# Elite Dangerous Galaxy Map

An interactive 3D map of the Elite Dangerous galaxy, drawn in the browser with WebGL2.

The map draws the galaxy from an analytic density model of the game's stellar mass: the
bar, the bulge, the disc, the spiral arms and the dust lanes. Over it, it draws your own
star systems as markers, the codex region boundaries, spheres and lines, an optional set
of nebulae and an optional HUD. You add the data and read what the user picks. The map
owns the canvas, the camera and the frame loop, and it fetches nothing of yours.

The demo site is <https://elite-dangerous-almanac.github.io/Galaxy-Map/>. This repository
holds the library, that site and the tests. The published package carries its own README:
[packages/galaxy-map/README.md](packages/galaxy-map/README.md).

## Install

```bash
pnpm add @elite-dangerous-almanac/galaxy-map
```

The map needs a browser with WebGL2 and a GPU the browser can reach. It refuses to draw
on a software renderer. Give it a `<canvas>` you own and size with CSS.

## Samples

### Systems on the map

```ts
import { createGalaxyMap } from '@elite-dangerous-almanac/galaxy-map';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const map = createGalaxyMap(canvas);

// Add the categories first. The reader rejects a record whose category is missing.
map.addCategories([
  { name: 'Empire', color: [153, 230, 255], description: 'Imperial space' },
  { name: 'Federation', color: [255, 140, 60], markerStyle: 'disc' },
  { name: 'Landmark', color: [255, 255, 255], maxDrawRange: 5000 },
]);

const report = map.addSystems([
  { name: 'Sol', coords: { x: 0, y: 0, z: 0 }, primaryCategory: 'Federation' },
  {
    name: 'Achenar',
    coords: { x: 67.5, y: -119.46, z: 24.84 },
    primaryCategory: 'Empire',
  },
]);
console.log(report.added, report.replaced, report.rejected.length);

await map.ready;
```

`createGalaxyMap` returns the handle in the same tick, so you can add your data before
the first frame. `ready` settles when the scene data is loaded, and it rejects when the
browser gives no WebGL2 context or the card reports a software renderer.

`addSystems` reads the record shape an EDSM or a Spansh dump gives. It keeps the fields
the map needs, drops the rest, and reports each record it rejects with the reason. A
record whose `id64`, or whose name, the set already holds replaces the earlier one.

A category carries a name, an RGB colour and the optional `description`, `markerStyle`
and `maxDrawRange`. The name is the identity: a category added again replaces the first.
`markerStyle` is `glow`, a soft halo, or `disc`, a filled circle with a dark ring.
`maxDrawRange` is how far the cursor may be from a system and still draw its marker, in
light years.

### A record with details

```ts
map.addSystems([
  {
    name: 'HIP 36823',
    coords: { x: 570.4, y: 17.5, z: -68.6 },
    primaryCategory: 'Landmark',
    primaryStar: 'A3 V',
    description:
      'A **Guardian beacon** points to a ruins site.\n\n' +
      '- Read [the survey](https://example.test/survey)',
    images: [{ url: '/pictures/beacon.jpg', caption: 'The beacon' }],
    icons: ['titan', { url: '/icons/ruins.svg', color: [255, 154, 60] }],
  },
]);
```

A dump carries none of these four fields, so the host adds them. The HUD draws
`description` as a small Markdown subset, with its own parser: it builds DOM nodes one at
a time and sets no `innerHTML`, so raw HTML in your text draws as text. `icons` stack
over the marker, and a string names one of the built-in symbols the package README lists.
The library fetches no picture and no vector. The browser loads the URL you give when the
HUD draws the thumbnail or the overlay draws the icon.

### The HUD

```ts
const map = createGalaxyMap(canvas, {
  grid: true,
  systemNames: true,
  loadingImage: '/loader.svg',
  hud: {
    title: 'GALACTIC CARTOGRAPHICS',
    infoFields: { region: false },
    lockedOptions: ['grid'],
    details: async (system, signal) => {
      const answer = await fetch(`/systems/${system.name}`, { signal });
      const held = (await answer.json()) as { about: string; faction: string };
      return {
        description: held.about,
        values: [{ label: 'FACTION', value: held.faction, copy: held.faction }],
        actions: [{ label: 'LOG RECORD', onSelect: (record) => console.log(record) }],
      };
    },
  },
});
```

The HUD is opt-in DOM in one `div.gm-hud`: a top bar, a category browser, the map option
switches and an information panel for the selected system. It loads by dynamic import, so
`map.hud` is null until `ready` settles.

`details` runs once for each system the panel opens on, never per frame. The map aborts
`signal` when the selection moves, so a host that fetches passes the signal on.
`infoFields` turns a worked-out field off, and `lockedOptions` holds a map option at your
setting and draws no switch for it.

The HUD reads the map through the public handle alone, so a host that wants its own
chrome leaves `hud` out and builds it from the same members.

### The camera

```ts
const map = createGalaxyMap(canvas, {
  bounds: { mode: 'sphere', centre: [0, 0, 0], radiusLy: 1000 },
  startView: { system: 'Sol', distance: 300, pitch: -20 },
  interaction: { select: false },
});

const end = await map.flyTo({ system: 'Achenar', distance: 200 });
// 'landed', or 'interrupted' where a user input or a second flight cut it short
```

`bounds` is how much of the space the user may browse. `unrestricted` is the default,
`auto` is the box that holds every system of the set, and `sphere` is a ball. The bound
clamps the cursor and the far zoom limit together, and it changes nothing the map draws.

`startView` is the camera the map opens at, and the map flies nowhere to reach it. A field
that a `startView` or a `flyTo` target leaves out keeps the value of the current view, so
`flyTo({ distance: 100 })` is a zoom in place. `interaction` is which of the user's inputs
the map acts on: `zoom`, `orbit`, `pan`, `keys` and `select`. A switch that is off leaves
the same move open to your own calls.

`getView`, `setView` and `onViewChange` read and write the view. `encodeView`,
`decodeView` and `decodeGrid` put a view in a URL fragment and read it back. The three
are pure, so you need no map to save a view or to load one.

### Spheres and lines

```ts
map.addSpheres([
  { name: 'Permit zone', position: [0, 0, 0], radius: 200, primaryCategory: 'Empire' },
]);

map.addLines([
  {
    name: 'Route',
    points: [{ system: 'Sol' }, [500, 0, -200], { system: 'Achenar' }],
    width: 2,
    color: [255, 176, 0],
  },
]);
```

A shape is drawn and is never picked: none hovers, none is selected, and `systemAt` reads
none. A line point is a game coordinate or a system the map resolves when the line is
added. A sphere draws as a shell and washes the markers inside it and behind it.

A shape can name a category of the same table the records use, and it then draws in that
colour. A category holds one visibility flag for each kind, so
`setShapeCategoryVisible(name, false)` hides its shapes and leaves its markers.

### A dataset catalog

```ts
const map = createGalaxyMap(canvas, {
  hud: true,
  dataset: 'ruins',
  datasets: [
    {
      id: 'ruins',
      label: 'Guardian Ruins',
      collection: 'Canonn Research Group',
      load: async () => (await fetch('/ruins.json')).json(),
    },
  ],
});
```

`loadDataset(id)` calls the entry's `load()`, empties the system set and the category
table, and adds what comes back through the same calls any host uses. A later call wins.
The library fetches nothing and caches nothing: your `load()` reads the data. The HUD
draws the dataset field and the library dialog where the catalog holds entries.

### The nebulae

```ts
import { createGalaxyMap } from '@elite-dangerous-almanac/galaxy-map';
import { nebulae } from '@elite-dangerous-almanac/galaxy-map/nebulae';

const map = createGalaxyMap(canvas, { nebulae });
```

The nebulae are ray-marched volumes, and they are an **opt-in** because a host pays for
the art in its own build. Asking for them adds 2,912,225 bytes of volume files, transfer
tables and the index. A build that never imports the subpath carries none of it. The map
loads the records and the art after the first frame, so nothing holds that frame back.

## Controls

| Input           | What it does                                                                  |
| --------------- | ----------------------------------------------------------------------------- |
| Left click      | Selects the system under the pointer. A click on nothing keeps the selection. |
| Left drag       | Turns the camera around the cursor.                                           |
| Right drag      | Moves the cursor in the galactic plane, under the pointer.                    |
| Wheel           | Zooms, between 10 light years and the far limit of the bound.                 |
| `W` `A` `S` `D` | Move the cursor in the plane, relative to the camera.                         |
| `R` `F`         | Move the cursor up and down.                                                  |
| `Q` `E`         | Turn the camera around the cursor.                                            |
| `Escape`        | Unwinds one step: the dataset dialog, then the lightbox, then the selection.  |

The demo page keeps the view in the URL fragment, as
`#c=<x>,<y>,<z>&d=<distance>&p=<pitch>&y=<yaw>&g=<grid>`, in light years and degrees. The
library reads and writes no URL: the page owns the fragment and calls `setView`.

## Development

You need Node 22, pnpm and a GPU the browser can reach. The dev container in
[.devcontainer/](.devcontainer/) supplies all three, and its
[README](.devcontainer/README.md) says how to check that the card reached the browser.

```bash
pnpm install
pnpm exec playwright install chromium
```

| Script                 | What it does                                                              |
| ---------------------- | ------------------------------------------------------------------------- |
| `pnpm dev`             | Starts the Vite dev server on port 5173                                   |
| `pnpm build`           | Checks the types, then builds the library                                 |
| `pnpm build:demo-site` | Builds the demo site                                                      |
| `pnpm build:demo-data` | Writes the demo record sets again from their sources                      |
| `pnpm preview`         | Serves the built demo site on port 4173                                   |
| `pnpm test`            | Runs the Vitest unit tests                                                |
| `pnpm test:package`    | Reads what `npm pack` would ship and fails on a file that does not belong |
| `pnpm test:e2e`        | Builds, serves and runs the Playwright browser tests                      |
| `pnpm audit`           | Fails on a known high or critical advisory                                |
| `pnpm lint`            | Runs ESLint                                                               |
| `pnpm format`          | Runs Prettier over the repository                                         |

Start the dev server as `pnpm dev --host 0.0.0.0` so the editor's port forwarding reaches
it. An argument crosses both hops of a delegated script.

**The browser suite is a local gate.** The CI workflow runs every other check and not
Playwright, because the suite fails a run that falls back to a software renderer and a
GitHub-hosted runner carries no GPU. Run `pnpm test:e2e` in the dev container before you
open a pull request, and before you dispatch a release.

[AGENTS.md](AGENTS.md) holds the layout, the import rules and the working agreements.
[docs/galaxy-density-model.md](docs/galaxy-density-model.md) gives the formulas the
galaxy model implements.

## The release

[.github/workflows/publish-npm.yml](.github/workflows/publish-npm.yml) publishes the
package. A person starts it and nothing else does: the only trigger is
`workflow_dispatch`, on `main`. It reads `major.minor` from
[packages/galaxy-map/package.json](packages/galaxy-map/package.json), takes one above the
highest patch published on that line, and publishes with OIDC and provenance and no
token. To release a new minor or major, change the version in that manifest first.

## Terms

[LICENSE.md](LICENSE.md) is the PolyForm Noncommercial License 1.0.0, which covers this
project's own code. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) states the terms of
the data and the art the map draws. Read both: several of the sources are noncommercial
as well.
