# Elite Dangerous Galaxy Map

An interactive 3D map of the Elite Dangerous galaxy, drawn in the browser with WebGL2.

Phase 1 draws the far view: the bar, the bulge, the disc, the four spiral arms and the
dust lanes, from a compact analytic model of the game's stellar-mass distribution.
Phase 2 adds the decoration stars of the close view. Phase 3 makes the map a library and
draws the host's real systems. Phase 4 adds selection and a HUD. Phase 5 builds the
map as a package, gives the host a dataset catalog and publishes the demo site.

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

| Script                 | What it does                                           |
| ---------------------- | ------------------------------------------------------ |
| `pnpm dev`             | Starts the Vite dev server on port 5173                |
| `pnpm build`           | Checks the types, then builds the library into `dist/` |
| `pnpm build:demo-site` | Builds the demo site into `dist-demo/`                 |
| `pnpm build:demo-data` | Writes the three demo data files from the Canonn dumps |
| `pnpm preview`         | Serves `dist-demo/` on port 4173                       |
| `pnpm test`            | Runs the Vitest unit tests                             |
| `pnpm test:e2e`        | Builds, serves and runs the Playwright browser tests   |
| `pnpm lint`            | Runs ESLint                                            |
| `pnpm format`          | Runs Prettier over the repository                      |

Start the dev server as `pnpm dev --host 0.0.0.0` so the editor's port forwarding
reaches it.

The demo page carries three data sets in [demo-data/](demo-data/), which
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) names: Guardian Ruins, 212 systems in 3
categories; Guardian Structures, 163 systems in 10 categories; and Notable Systems, 16
systems in 4 categories. It names them in the `datasets` option any host uses, and it
loads Guardian Ruins at start. The HUD's dataset field switches between them.
`pnpm build:demo-data` writes the three files again from the Canonn dumps.

A Guardian Ruins record names its thumbnails at
`https://ruins.canonn.tech/images/maps/`, so the browser loads them from Canonn and the
repository holds no picture of them. The other two sets name no picture. The dev server
and the demo site build both carry the three files, and the library build carries no
record of them. The browser suite serves the demo site and clears the set in its own
helper, so a test that does not ask for a set opens an empty map. Open
`#c=1500,0,-500&d=3000&p=35&y=0&g=1` to see the markers.

## The entry point

The package entry is [src/index.ts](src/index.ts), which `package.json` names in
`exports`. It exports `createGalaxyMap` and the types the public calls name, so a host
imports from the package root and reaches no module the list leaves out. `pnpm build`
writes the module to `dist/index.js` and its declarations to `dist/types/`.

`createGalaxyMap(canvas, options)` in
[src/app/create-map.ts](src/app/create-map.ts) builds a map. It returns a handle in the
same tick, so the host can add its data before the first frame. The handle's `ready`
promise settles when the map has loaded its scene data, and it rejects when the browser
gives no WebGL2 context or the card reports a software renderer.

The host groups its systems by category. A category carries a name, an RGB colour, an
optional description, an optional marker style and an optional draw range. The name is
the identity: a category added a second time replaces the first, and the replacement
carries only the fields it names itself. Add the categories before the systems, because
the reader rejects a record whose category the table does not hold.

`markerStyle` is `glow` or `disc`, and it is `glow` when the category names none. A glow
is a soft halo with four spikes and no ring. A disc is a filled circle with a dark ring.
`maxDrawRange` is how far the camera may be from a system and still draw its marker, in
light years. It is 120,000 when the category names none, which is the far zoom limit, so
such a marker draws at every zoom the map reaches.

```ts
import { createGalaxyMap } from 'elite-dangerous-galaxy-map';

const canvas = document.getElementById('map') as HTMLCanvasElement;
const map = createGalaxyMap(canvas);

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

`addSystems` reads the record shape an EDSM or a Spansh dump gives. It keeps the
optional fields the HUD needs, drops every other field, and reports each record it
rejects with the reason. A record with an `id64`, or a name, that the set already holds
replaces the earlier one. The set holds at most 10,000 systems and the category table at
most 256 categories.

Three of the optional record fields hold what a dump does not carry, so the host adds
them itself. `description` is a paragraph about the system. `primaryStar` is the class
of the primary star, for example `K5 V`. `images` is up to 8 pictures, each one a
`{ url, caption }` object. The library never fetches a picture: the browser loads the
URL the host gives when the HUD draws the thumbnail.

```ts
map.addSystems([
  {
    name: 'HIP 36823',
    coords: { x: 570.4, y: 17.5, z: -68.6 },
    primaryCategory: 'Beacon',
    primaryStar: 'A3 V',
    description: 'A Guardian beacon points to a ruins site.',
    images: [{ url: '/pictures/beacon.jpg', caption: 'The beacon' }],
  },
]);
```

The handle also carries `clearSystems`, `clearSystemsAndCategories`, `systemCount`,
`getView`, `setView`, `onViewChange`, `getRegionMode`, `setRegionMode`, `dispose` and a
`debug` member the browser tests read. For the system set it carries `getSystem`,
`categoryCount`, `getCategory`, `setCategoryVisible`, `isCategoryVisible`,
`setNameFilter` and `getNameFilter`. For the selection it carries `systemAt`,
`getHover`, `getSelection`, `setSelection` and `onSelectionChange`. For the overlays it
carries `setSystemNamesVisible`, `areSystemNamesVisible`, `setGridVisible`,
`isGridVisible`, `onGridChange` and `regionNameAt`. For the dataset catalog it carries
`getDatasets`, `getLoadedDataset`, `loadDataset` and `onDatasetChange`. The `hud`
member is the HUD handle, or null when the options do not ask for the HUD. The region
mode is `off`, `simplified` or `accurate`, and it is `simplified` unless the options
name another. `simplified` draws
the smoothed region boundary, `accurate` draws the traced boundary, which is the
49.3494 light year staircase the region data holds, and `off` draws no boundary and
places no label. A mode change takes effect in the next frame and does not rebuild the
scene data. The library owns the render context, the scene data, the view, the controls and
the frame loop. It does not read or write the URL: [src/app/main.ts](src/app/main.ts) is
the demo page, and it owns the fragment, the message box and the test hooks.

The boundary is one warm cream band with a soft edge, and it draws inside a band of zoom
distance: nothing at 5,000 light years and below, rising to full at 10,000, full from
10,000 to 20,000, and nothing again at 30,000 and above. The region labels take the same
band, so a name never outlives its boundary. Below 5,000 light years the HUD's top bar
still names the region under the cursor, and `regionNameAt` answers for any point on the
plane. In `accurate` the map blurs the boundary by the staircase's own cell measured on
the screen, so a 90 degree corner draws as a round turn.

A marker draws for every system at every zoom distance, from 10 to 120,000 light years,
while the camera is inside the draw range of the system's category.
The invented star field fades out as the camera comes in: it draws in full at a zoom
distance of 2,560 light years and adds no light at 640 and below, so the close view holds
the host's systems and nothing the map invented. A decoration star within 3 light years
of a real system is not drawn. That rule runs in the finest drawn size class alone, which
covers the systems near the camera, so a coarser class can still draw a star beside a
marker further out.

## Selection and the HUD

`setSelection(identity)` selects a system. The identity is the `id64` when the record
carries one, and the name when it does not. `null`, and an identity the set does not
hold, clear the selection. A selection moves the view: the cursor goes to the position
of the system, and the distance drops to 500 light years when it is further out. A
distance already inside 500 light years does not change, so a close view stays close.
`onSelectionChange` reports every change, and `getSelection` reads the current one.

`systemAt(x, y)` gives the system under a canvas pixel in CSS coordinates, and
`getHover` gives the system under the pointer. The map draws a mark around the hovered
system and a second mark around the selected one.

Three options build what the host does not have to drive itself:

```ts
const map = createGalaxyMap(canvas, {
  grid: true,
  loadingImage: '/loader.svg',
  hud: {
    title: 'GALACTIC CARTOGRAPHICS',
    actions: [{ label: 'LOG RECORD', onSelect: (system) => console.log(system) }],
  },
});
```

`grid` draws the coordinate grid on the galactic plane. It is off unless the options ask
for it, `setGridVisible` turns it on and off later, and `onGridChange` reports every
move of the switch, which the HUD drives as well. The demo site asks for the grid and
the library default stays off, because a host that embeds the map in its own page did
not ask for a coordinate grid. The grid fades in by the camera's distance to the cursor:
it draws nothing at 12,000 light years and further, and it draws in full at 4,000 and
nearer.

The grid also follows the picture under it. The map reads the local brightness of the
galaxy it drew, and each line and each coordinate number takes its strength and its
colour from that reading. A line over the dark space between the arms keeps its full
strength. The same line over the bright core keeps a part of it and takes the
background's hue, so the grid reads as part of the picture and not as a layer on top of
it.

`loadingImage` is a URL. The library puts the picture in the canvas's parent, centred on
the canvas, and it removes the picture when `ready` settles, whether it settles or
fails. A URL whose scheme the library refuses adds no element, and options that name no
image add none. The picture keeps the size its own file names, because the library sets
no width, no height and no fit. An SVG must name that size as `width` and `height`
attributes: an `<img>` element reads no size from the file's own CSS, and a file without
the attributes grows with the box it sits in. The demo site names its own
`EDLoader1.svg`, which it serves from the site's own origin at 170 by 170.

`hud` builds the heads-up display. `true` builds it with its defaults, and an object
names the `title`, the `host` element and the footer `actions`. With no `host` the HUD
goes in the canvas's parent. Each action carries a `label` and an `onSelect(system)`
callback, and its button draws in the information panel footer. The HUD is a separate
chunk that loads by dynamic import, so `map.hud` is null until `ready` settles. The
handle then carries `element`, `refresh()` and `dispose()`.

A change to the system set or the category table reaches the HUD in the next animation
frame. The map collects the changes of one turn and rebuilds the rows once, so a host
that adds its systems in batches pays for one rebuild and not one for each batch. A host
that reads `hud.element` in the same turn as `addSystems` therefore reads the rows from
before the call. `hud.refresh()` rebuilds them at once.

The HUD is plain DOM in one `div.gm-hud`, and every one of its rules sits under that
class. It shows the region name and the zoom distance in the top bar, a category browser
with a search box, the map option switches, and an information panel for the selected
system with its fields, description, thumbnails and a lightbox. It reads the map through
the public handle alone. An ESLint rule stops `src/hud/` importing `src/render/`,
`src/scene-data/` or `src/camera/`.

## The dataset catalog

`datasets` is a list of data sets the host writes. Each entry carries an `id`, a
`label`, an async `load()` and the optional `collection`, `region`, `description` and
`systemCount` the HUD shows. `dataset` names the entry the map loads at start, and the
map loads the first entry when the options name none. The catalog holds at most 256
entries.

```ts
const map = createGalaxyMap(canvas, {
  hud: true,
  dataset: 'ruins',
  datasets: [
    {
      id: 'ruins',
      label: 'Guardian Ruins',
      collection: 'Canonn Research Group',
      systemCount: 212,
      load: async () => (await fetch('/ruins.json')).json(),
    },
  ],
});
```

`loadDataset(id)` calls the entry's `load()`, empties the system set and the category
table, and adds what comes back through the same `addCategories` and `addSystems` calls
any host uses. It clears the selection and the name filter. A later call wins: an
earlier load that is still running rejects as cancelled and writes nothing.
`getDatasets` reads the catalog without the `load` functions, `getLoadedDataset` reads
the set on the map, and `onDatasetChange` reports each change. The library fetches
nothing and caches nothing: the host's `load()` reads the data.

The HUD draws the dataset field in the top bar and the dataset library dialog behind it,
and it draws neither when the catalog is empty.

## Controls

| Input           | What it does                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Left click      | Selects the system under the pointer. A click that finds no system keeps the selection.                                                           |
| Left drag       | Turns the camera around the cursor. 0.3 degrees per pixel. Pitch stops at 5 and 89 degrees.                                                       |
| Right drag      | Moves the cursor in the galactic plane. The point under the pointer stays under it.                                                               |
| Wheel           | Divides the distance by 1.15 per notch, between 10 and 120,000 light years. The camera glides to the new distance and lands in about 0.2 seconds. |
| `W` `A` `S` `D` | Move the cursor in the plane, relative to the camera, at one quarter of the distance per second.                                                  |
| `R` `F`         | Move the cursor up and down at the same speed.                                                                                                    |
| `Escape`        | Unwinds one step: the dataset dialog, then the HUD lightbox, then the selection.                                                                  |

The view lives in the URL fragment as
`#c=<x>,<y>,<z>&d=<distance>&p=<pitch>&y=<yaw>&g=<grid>`, in light years and degrees.
`g` is `1` or `0` and carries the coordinate grid switch. It is the one optional field:
a fragment that names no `g` leaves the switch where it is. The page writes the fragment
back at most once every 500 ms, so a link carries the view and the grid. The fragment
does not carry the selection, because a link that selects a system would need the host's
data set to hold that system.

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

## The pipeline

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs on every push to `main` and on
every pull request that targets `main`. It installs with a frozen lockfile, then runs
`pnpm lint`, the type check, `pnpm test`, the library build and the demo site build, in
that order. It stops at the first check that fails. Every action it uses is pinned to a
commit SHA, for the reason [pnpm-workspace.yaml](pnpm-workspace.yaml) holds each npm
release for 7 days: a mutable tag gives whatever it points at on the day the run starts.

**The browser suite is a local gate.** The workflow does not run Playwright. The suite
reads the renderer string and fails a run that falls back to SwiftShader or llvmpipe,
and a GitHub-hosted runner carries no GPU. Run `pnpm test:e2e` in the dev container
before you open a pull request.

After the checks pass on a push to `main`, the workflow builds the demo site again and
publishes `dist-demo/` to the repository's GitHub Pages address,
<https://darksession.github.io/Elite-Dangerous-Galaxy-Map/>. It publishes nothing from a
pull request, and it publishes no part of `dist/`, which is the library.

## Layout

```
src/app/            the entry point, the demo page, the URL fragment
src/galaxy-model/   the model port, the parameter file, the detail grid, its types
src/scene-data/     the point cloud, the density volume, the workers
src/render/         the WebGL2 context, the passes, the shaders
src/camera/         the view state, the projection, the controls
src/hud/            the heads-up display, its styles and the bundled fonts
e2e/                the Playwright tests and the baseline image
tests/fixtures/     the model fixture and the detail fixture
docs/               the model formulas and the roadmap
```

`src/galaxy-model/` and `src/scene-data/` must not import `src/render/`. An ESLint rule
holds that line, so a different density source can replace the data layers without a
change in the renderer. A second rule stops `src/hud/` importing `src/render/`,
`src/scene-data/` or `src/camera/`, so the HUD reads the map through the public handle
alone.
