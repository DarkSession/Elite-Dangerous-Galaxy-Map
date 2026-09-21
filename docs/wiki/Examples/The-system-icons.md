# The system icons

A record carries up to 4 `icons`. The map stacks them over the marker, lowest first, and
draws one arrow under the lowest icon in that icon's colour.

```ts
import type { SystemIconInput } from '@elite-dangerous-almanac/galaxy-map';

const icons: SystemIconInput[] = [
  'titan',
  'mission',
  { url: '/icons/ruins.svg', color: [255, 154, 60] },
];

map.addSystems([
  {
    name: 'HIP 36823',
    coords: { x: 570.4, y: 17.5, z: -68.6 },
    categories: ['Beacon'],
    icons,
  },
]);
```

An entry takes one of two forms. A string names a built-in symbol, which the package
ships as a vector file of its own. An object names a vector the host serves, with the
colour of the arrow: `{ url, color }`. The library fetches no URL. The browser loads the
file when the renderer first draws that icon.

## The built-in symbols

`bookmark`, `community-goal`, `conflict-zone`, `destination`, `engineer`,
`fleet-carrier`, `front-line`, `mission`, `squadron-carrier`, `starter-zone`,
`station-abandoned`, `station-damaged`, `station-repairing`, `station-under-attack`,
`titan` and `waypoint`.

Each one is a file of the build under `dist/assets/`, which your bundler copies with the
rest of the package. A record that names a symbol the list does not hold is rejected with
the reason `unknown-icon`. A record with more than 4 icons, a bad URL or a bad colour is
rejected with `bad-icon`.

## A vector on a second origin needs a header

The renderer draws the stacks on the canvas, and it reads each vector into a texture
through an image whose `crossOrigin` is `anonymous`. A response with no
`Access-Control-Allow-Origin` header taints the canvas the texture is read from, which
makes the upload throw. The map draws no icon for that URL, reports it once through
`console.warn` and never asks for it again. This reaches the 16 built-in vectors as well,
where the host serves the package from a second origin such as a CDN. A `data:` URL and a
URL on the page's own origin need no header.

## Drawing them

The map draws the stacks of the 32 systems nearest the camera that are in view.
`setSystemIconsVisible(on)` and `areSystemIconsVisible()` drive them, and the option
`systemIcons: false` starts the map with them off.

## The reference

[SystemIconInput](SystemIconInput) is one entry, [ResolvedIcon](ResolvedIcon) is what the
map resolved it to, and [GalaxyMap](GalaxyMap) holds the two switches.
