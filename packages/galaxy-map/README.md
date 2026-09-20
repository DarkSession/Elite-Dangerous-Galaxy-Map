# @elite-dangerous-almanac/galaxy-map

An interactive 3D map of the Elite Dangerous galaxy, drawn in the browser with WebGL2.

The package draws the galaxy model, your own star systems as markers, region boundaries,
spheres and lines, and an optional set of nebulae. It gives you a handle: you add the
systems, you move the camera, and you read what the user selects.

This README is the package's own. The repository holds the demo site, the browser suite
and the development setup: <https://github.com/Elite-Dangerous-Almanac/Galaxy-Map>.

## Install

```bash
pnpm add @elite-dangerous-almanac/galaxy-map
```

The package carries its own built code. It installs two run-time dependencies,
`gl-matrix` and `@elite-dangerous-almanac/core`, and needs nothing else from you.

## What it needs

- A browser with **WebGL2**. The map throws a named error where the context does not
  start.
- A `<canvas>` element that you own and size with CSS.
- A bundler that reads the package `exports` map. The build is ES modules alone.

## The smallest map

```ts
import { createGalaxyMap } from '@elite-dangerous-almanac/galaxy-map';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const map = createGalaxyMap(canvas);

// A marker takes a category, so the table reads the category first.
map.addCategories([{ name: 'Visited', color: [255, 176, 0] }]);
map.addSystems([
  {
    name: 'Sol',
    coords: { x: 0, y: 0, z: 0 },
    categories: ['Visited'],
    id64: 10477373803,
  },
]);

await map.ready;
```

`createGalaxyMap(canvas, options)` takes the options in one object: `regions`, `shapes`,
`grid`, `systemNames`, `systemIcons`, `cursorMarker`, `hud` and `nebulae` among them. With no options
the map draws the galaxy, the region overlay and the cursor marker, and it makes its own
label element inside the canvas's parent.

## The system icons

A record carries up to 4 `icons`. The map stacks them over the marker, lowest first, and
draws one arrow under the lowest icon in that icon's colour.

An entry takes one of two forms. A string names a built-in symbol, which the package
ships as a vector file of its own. An object names a vector the host serves, with the
colour of the arrow: `{ url, color }`. The library fetches no URL. The browser loads the
file when the overlay draws the icon.

```ts
map.addSystems([
  {
    name: 'HIP 36823',
    coords: { x: 570.4, y: 17.5, z: -68.6 },
    categories: ['Beacon'],
    icons: ['titan', 'mission', { url: '/icons/ruins.svg', color: [255, 154, 60] }],
  },
]);
```

The built-in symbols are `bookmark`, `community-goal`, `conflict-zone`, `destination`,
`engineer`, `fleet-carrier`, `front-line`, `mission`, `squadron-carrier`, `starter-zone`,
`station-abandoned`, `station-damaged`, `station-repairing`, `station-under-attack`,
`titan` and `waypoint`. Each one is a file of the build under `dist/assets/`, which your
bundler copies with the rest of the package. A record that names a symbol the list does
not hold is rejected, and `addSystems` reports it with the reason `unknown-icon`. A
record with more than 4 icons, a bad URL or a bad colour is rejected with `bad-icon`.

The map draws the stacks of the 32 systems nearest the camera that are in view.
`setSystemIconsVisible(on)` and `areSystemIconsVisible()` drive them, and the option
`systemIcons: false` starts the map with them off.

## The nebulae

The nebulae are an **opt-in**, because they are art and a host pays for it in its own
build. The map draws 358 of them as ray-marched volumes. Asking for them adds
**2,912,225 bytes** of volume files, transfer tables and the index to your build. A build
that never imports the subpath carries none of it.

```ts
import { createGalaxyMap } from '@elite-dangerous-almanac/galaxy-map';
import { nebulae } from '@elite-dangerous-almanac/galaxy-map/nebulae';

const map = createGalaxyMap(canvas, { nebulae });
```

The map loads the records and the art after the first frame, so the nebulae hold nothing
back. `hasNebulae()`, `areNebulaeVisible()` and `setNebulaeVisible(on)` drive them.

## The `./testing` subpath

`@elite-dangerous-almanac/galaxy-map/testing` is **not** the supported surface. It gives
a browser test the renderer probe the map writes on `window`, and its members change with
no version step. Build against the main entry point.

## Terms

The package is under the
[PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0),
which `LICENSE.md` in this package states in full. Any noncommercial purpose is a
permitted purpose.

`THIRD_PARTY_NOTICES.md` in this package states the terms of the data and the art the map
draws. Read both: several of the sources are noncommercial as well.
