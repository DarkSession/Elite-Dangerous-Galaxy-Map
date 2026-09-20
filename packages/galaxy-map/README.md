# @elite-dangerous-almanac/galaxy-map

An interactive 3D map of the Elite Dangerous galaxy, drawn in the browser with WebGL2.

The package draws the galaxy model, your own star systems as markers, region boundaries,
spheres and lines, and an optional set of nebulae. It gives you a handle: you add the
systems, you move the camera, and you read what the user selects.

This README is the package's own. The repository holds the demo site, the browser suite
and the development setup: <https://github.com/DarkSession/Elite-Dangerous-Galaxy-Map>.

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
    primaryCategory: 'Visited',
    id64: 10477373803,
  },
]);

await map.ready;
```

`createGalaxyMap(canvas, options)` takes the options in one object: `regions`, `shapes`,
`grid`, `systemNames`, `cursorMarker`, `hud` and `nebulae` among them. With no options
the map draws the galaxy, the region overlay and the cursor marker, and it makes its own
label element inside the canvas's parent.

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

The package's own code is under the **MIT** licence, which `LICENSE.md` in this package
states in full.

**The MIT terms do not cover everything the package carries.** The map draws data and art
of other holders, and those files keep their own terms. `THIRD_PARTY_NOTICES.md` in this
package states them one by one. The Elite Dangerous game data and visuals are Frontier
Developments' property, under media-usage rules that permit **non-commercial use only**.
Read both files before you use the map for money.
