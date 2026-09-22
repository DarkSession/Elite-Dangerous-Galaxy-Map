# Getting started

## Install

```bash
pnpm add @elite-dangerous-almanac/galaxy-map
```

The package carries its own built code. It installs two run-time dependencies,
`gl-matrix` and `@elite-dangerous-almanac/core`, and needs nothing else from you.

## What it needs

- A browser with **WebGL2**. The map throws a named error where the context does not
  start, and it refuses to draw on a software renderer.
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

[createGalaxyMap](createGalaxyMap) returns the handle in the same tick, so you can add
your data before the first frame. `ready` settles when the scene data is loaded, and it
rejects when the browser gives no WebGL2 context or the card reports a software renderer.

## The options

`createGalaxyMap(canvas, options)` takes the options in one object. With no options the
map draws the galaxy, the region overlay and the cursor marker, and it makes its own
label element inside the canvas's parent. That element covers the canvas, and it takes
the canvas's box again when the canvas moves or resizes.

The library writes the whole look of a region label on the element itself: the position,
the box, the font, the colour and the outline. Your page needs no style rule for the
labels to draw in the right place. The class name is `region-label`, so a rule of your
own still reaches a property the library leaves alone.

[GalaxyMapOptions](GalaxyMapOptions) is the whole list, and
[GalaxyMap](GalaxyMap) is the handle you get back. The examples cover the options a host
reaches for first: `hud`, `startView`, `bounds`, `interaction`, `datasets`, `shapes` and
`nebulae`.

## Next

- [Systems on the map](Systems-on-the-map) adds a category table and a record set.
- [The HUD](The-HUD) turns the built-in chrome on.
- [Overview](Home) links to every example page.
