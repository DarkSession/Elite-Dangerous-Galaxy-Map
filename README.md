# Elite Dangerous Galaxy Map

An interactive 3D map of the Elite Dangerous galaxy, drawn in the browser with WebGL2.

Phase 1 draws the far view: the bar, the bulge, the disc, the four spiral arms and the
dust lanes, from a compact analytic model of the game's stellar-mass distribution.
Phase 2 adds the decoration stars of the close view. Phase 3 makes the map a library and
draws the host's real systems. Phase 4 adds selection and a HUD.

## Requirements

- Node 22.
- pnpm. Do not use npm or yarn.
- A GPU the browser can reach. The map refuses to draw on a software renderer.

The dev container in [.devcontainer/](.devcontainer/) supplies all three. It passes the
host NVIDIA card through to the container and runs an X server on display `:1`.

## Setup

```bash
pnpm install
pnpm exec playwright install chromium
```

The second command fetches the browser build that matches the resolved Playwright
version. [pnpm-workspace.yaml](pnpm-workspace.yaml) holds every package back for
7 days after its release, so the resolved version is often not the newest one.

## Scripts

| Script          | What it does                                         |
| --------------- | ---------------------------------------------------- |
| `pnpm dev`      | Starts the Vite dev server on port 5173              |
| `pnpm build`    | Checks the types, then builds into `dist/`           |
| `pnpm preview`  | Serves `dist/` on port 4173                          |
| `pnpm test`     | Runs the Vitest unit tests                           |
| `pnpm test:e2e` | Builds, serves and runs the Playwright browser tests |
| `pnpm lint`     | Runs ESLint                                          |
| `pnpm format`   | Runs Prettier over the repository                    |

Start the dev server as `pnpm dev --host 0.0.0.0` so the editor's port forwarding
reaches it.

The dev server puts a demo data set on the map: 15 categories and 381 Guardian systems
from [src/app/demo-systems.json](src/app/demo-systems.json), which
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) names. The demo page adds them with the
same `addCategories` and `addSystems` calls any host uses. The production build drops
the data and the code that loads it, so `pnpm preview` and the browser tests open a map
with an empty set. Open `#c=1500,0,-500&d=3000&p=35&y=0` to see the markers.

## The entry point

`createGalaxyMap(canvas, options)` in
[src/app/create-map.ts](src/app/create-map.ts) builds a map. It returns a handle in the
same tick, so the host can add its data before the first frame. The handle's `ready`
promise settles when the map has loaded its scene data, and it rejects when the browser
gives no WebGL2 context or the card reports a software renderer.

The host groups its systems by category. A category carries a name, an RGB colour and an
optional description. The name is the identity: a category added a second time replaces
the first and recolours its markers. Add the categories before the systems, because the
reader rejects a record whose category the table does not hold.

```ts
import { createGalaxyMap } from './app/create-map';

const canvas = document.getElementById('map') as HTMLCanvasElement;
const map = createGalaxyMap(canvas);

map.addCategories([
  { name: 'Empire', color: [153, 230, 255], description: 'Imperial space' },
  { name: 'Federation', color: [255, 140, 60] },
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

`addSystems` reads the record shape an EDSM or a Spansh dump gives. It keeps the
optional fields the HUD needs, drops every other field, and reports each record it
rejects with the reason. A record with an `id64`, or a name, that the set already holds
replaces the earlier one. The set holds at most 10,000 systems and the category table at
most 256 categories.

The handle also carries `clearSystems`, `clearSystemsAndCategories`, `systemCount`,
`getView`, `setView`, `onViewChange`, `dispose` and a `debug` member the browser tests
read. The library owns the render context, the scene data, the view, the controls and
the frame loop. It does not read or write the URL: [src/app/main.ts](src/app/main.ts) is
the demo page, and it owns the fragment, the message box and the test hooks.

A marker draws for every system at every zoom distance, from 500 to 120,000 light years.
The invented star field fades out as the camera comes in: it draws in full at a zoom
distance of 2,560 light years and adds no light at 640 and below, so the close view holds
the host's systems and nothing the map invented. A decoration star within 3 light years
of a real system is not drawn. That rule runs in the finest drawn size class alone, which
covers the systems near the camera, so a coarser class can still draw a star beside a
marker further out.

## Controls

| Input           | What it does                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------ |
| Left drag       | Turns the camera around the cursor. 0.3 degrees per pixel. Pitch stops at 5 and 89 degrees.      |
| Right drag      | Moves the cursor in the galactic plane. The point under the pointer stays under it.              |
| Wheel           | Changes the distance by 1.15 per notch, between 500 and 120,000 light years.                     |
| `W` `A` `S` `D` | Move the cursor in the plane, relative to the camera, at one quarter of the distance per second. |
| `R` `F`         | Move the cursor up and down at the same speed.                                                   |

The view lives in the URL fragment as `#c=<x>,<y>,<z>&d=<distance>&p=<pitch>&y=<yaw>`,
in light years and degrees. The page writes it back at most once every 500 ms, so a
link carries the view.

## The galaxy model

The map draws from [src/galaxy-model/galaxy-model.json](src/galaxy-model/galaxy-model.json),
a 13 KB parameter file: 29 parameters and a 64x64 correction grid. A second file,
[src/galaxy-model/galaxy-detail.png](src/galaxy-model/galaxy-detail.png), holds a
1024x1024 detail grid as a 339 KB greyscale PNG, which refines the surface density to
98 light years per cell.
[docs/galaxy-density-model.md](docs/galaxy-density-model.md) gives the formulas the
TypeScript port implements.
[tests/fixtures/galaxy-model.json](tests/fixtures/galaxy-model.json) and
[tests/fixtures/galaxy-detail.json](tests/fixtures/galaxy-detail.json) pin the port to
reference values. All four files are committed data. Each fixture carries the SHA-256
of the file it pins, so a change to one fails the tests until the other matches.

## Hardware rendering

At startup the page reads the unmasked renderer string through
`WEBGL_debug_renderer_info` and puts it on `window.__galaxyMap.renderer`. If the string
names `SwiftShader`, `llvmpipe` or `Software`, the page shows an error and draws
nothing. `e2e/00-renderer.spec.ts` reads the same string and fails the suite when it is
missing, empty or names a software renderer, so a silent fall back to the processor
fails the build instead of only making it slow.

Headless Chromium turns the GPU off by default. `playwright.config.ts` starts it with
the flags the dev container needs, with the ANGLE Vulkan backend, which is the path the
NVIDIA driver answers on inside the container. To see the test fail without the card:

```bash
GALAXY_MAP_EXTRA_CHROMIUM_ARGS=--disable-gpu pnpm test:e2e e2e/00-renderer.spec.ts
```

## Layout

```
src/app/            the entry point, the demo page, the URL fragment
src/galaxy-model/   the model port, the parameter file, the detail grid, its types
src/scene-data/     the point cloud, the density volume, the workers
src/render/         the WebGL2 context, the passes, the shaders
src/camera/         the view state, the projection, the controls
e2e/                the Playwright tests and the baseline image
tests/fixtures/     the model fixture and the detail fixture
docs/               the model formulas and the roadmap
```

`src/galaxy-model/` and `src/scene-data/` must not import `src/render/`. An ESLint rule
holds that line, so a different density source can replace the data layers without a
change in the renderer.
