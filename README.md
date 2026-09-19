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
| `pnpm build:demo-data` | Writes the six demo data files from the Canonn sources |
| `pnpm preview`         | Serves `dist-demo/` on port 4173                       |
| `pnpm test`            | Runs the Vitest unit tests                             |
| `pnpm test:e2e`        | Builds, serves and runs the Playwright browser tests   |
| `pnpm lint`            | Runs ESLint                                            |
| `pnpm format`          | Runs Prettier over the repository                      |

Start the dev server as `pnpm dev --host 0.0.0.0` so the editor's port forwarding
reaches it.

The demo page carries six data sets, which
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) names: Guardian Ruins, 212 systems in 3
categories; Guardian Structures, 163 systems in 10 categories; Notable Systems, 16
systems in 4 categories; UIA Map, 1,116 systems in 19 categories with 54 spheres and 983
lines;
Adamastor Routes, 8 systems in 10 categories with 8 lines; and Canonn Factions, which
fetches its records when the user loads it. It names them in the `datasets`
option any host uses, and it loads Guardian Ruins at start. The HUD's dataset field
switches between them. `pnpm build:demo-data` writes the files of
[demo-data/](demo-data/) again from the Canonn sources.

**Canonn Factions is the one entry that fetches.** Its `load()` fetches the 16.9 MB Spansh
factions dump and moves the body to a worker, which decompresses it with the browser's own
`DecompressionStream` and reads the two Canonn factions out of the stream a line at a time.
It cancels the stream once it has both, so it reads about an eighth of the file. The page
keeps the fetch, so the request comes from the page; the worker keeps the map drawing,
because Chromium inflates a body it already holds in one burst. The reader is the demo
page's own [src/app/multifaction.ts](src/app/multifaction.ts): the library fetches nothing
itself, and a failed fetch leaves the map with the set it had. The 48 permit spheres of that set are
committed, because they are a static literal and not a live dump.

The last three sets carry shapes. `DatasetContent` carries records and no shape, so the
page holds the shapes of each file by entry id and adds them from its own
`onDatasetChange` listener with `addSpheres` and `addLines`.

A Guardian Ruins record names its thumbnails at
`https://ruins.canonn.tech/images/maps/`, so the browser loads them from Canonn and the
repository holds no picture of them. The other five sets name no picture. The dev server
and the demo site build both carry the six files, and the library build carries no
record of them. The browser suite serves the demo site and clears the set in its own
helper, so a test that does not ask for a set opens an empty map. Open
`#c=1500,0,-500&d=3000&p=35&y=0&g=1` to see the markers.

## The entry point

The package has two entries, and `package.json` names both in `exports`. The main one is
[src/index.ts](src/index.ts). It exports `createGalaxyMap`, the three fragment calls
`encodeView`, `decodeView` and `decodeGrid`, and the types the public calls name, so a
host imports from the package root and reaches no module the list leaves out. The second
one is [src/nebulae/index.ts](src/nebulae/index.ts), at the subpath
`elite-dangerous-galaxy-map/nebulae`. It exports one name, `nebulae`, which is the
nebula source of **[The nebulae](#the-nebulae)**. `pnpm build` writes the two modules to
`dist/index.js` and `dist/nebulae.js`, and their declarations to `dist/types/`.

A host that imports the package root alone reaches no nebula module, so its bundler
leaves the nebula code, the record file and the sprite art out of its build.

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
`maxDrawRange` is how far the cursor may be from a system and still draw its marker, in
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
`getView`, `setView`, `onViewChange`, `areRegionsVisible`, `setRegionsVisible`, `dispose`
and a `debug` member the browser tests read. For the camera it carries `getBounds`,
`setBounds`, `flyTo`, `isFlying`, `onFlightEnd`, `getInteraction` and `setInteraction`. For the system set it carries `getSystem`,
`categoryCount`, `getCategory`, `setCategoryVisible`, `isCategoryVisible`,
`setShapeCategoryVisible`, `isShapeCategoryVisible`, `setNameFilter` and
`getNameFilter`. A category holds two visibility flags: `setCategoryVisible` and
`isCategoryVisible` reach its markers alone, and `setShapeCategoryVisible` and
`isShapeCategoryVisible` reach its shapes alone. For the selection it carries `systemAt`,
`getHover`, `getSelection`, `setSelection` and `onSelectionChange`. For the overlays it
carries `setSystemNamesVisible`, `areSystemNamesVisible`, `setGridVisible`,
`isGridVisible`, `onGridChange`, `setCursorMarkerVisible`, `getCursorMarkerVisible`,
`regionNameAt` and `regionNameAtExact`. For the shapes it carries `addSpheres`,
`addLines`, `clearShapes`, `sphereCount`, `lineCount`, `getSphere`, `getLine`,
`getShapeInfo`, `setShapeNameFilter`, `getShapeNameFilter`, `areShapesVisible` and
`setShapesVisible`. For the dataset catalog it carries
`getDatasets`, `getLoadedDataset`, `loadDataset` and `onDatasetChange`. The `hud`
member is the HUD handle, or null when the options do not ask for the HUD.

The map also draws **spheres and lines**, which the host adds with `addSpheres` and
`addLines`. A shape is drawn and is never picked: no shape hovers, none is selected, and
`systemAt` reads none. A sphere takes a centre, a radius in light years and an opacity, and
it draws as a shell and not as a solid. A line takes at least two points and a width in CSS
pixels, and a point is a game coordinate or
`{ system: 'Sol' }`, which the map resolves against the systems it holds when the line is
added. The set holds up to 1,024 spheres, 4,096 lines and 65,536 line points together.
`setShapesVisible` takes both parts off at once, and the shapes are on unless the
`shapes` option says otherwise.

**A shape can name categories.** A sphere and a line each take a `primaryCategory` and a
list of `secondaryCategories`, and both name a category of the same table the records use,
so add the categories first: the reader rejects a shape that names a category the table
does not hold. A shape that names a category draws in that category's colour, and `color`
is then not needed. `setShapeCategoryVisible(name, false)` hides every shape of a category
and leaves its markers on the screen, because a category holds one flag for each kind. A
shape that names none keeps a `color` of its own and no category switch moves it.
`setShapeNameFilter` hides the shapes whose name does not hold the text, beside the
`setNameFilter` that does the same for the records, and
`getShapeInfo('sphere', 0)` answers the name, the categories, the centre, the reach and
whether the shape draws in the next frame.

**A sphere washes the markers inside it and behind it**, and not the ones in front of it.
The marker pass writes each marker's camera range into a float buffer, and a sphere draws
the part of its shell that lies behind the nearest marker at that pixel. The wash over a
marker is capped at half, so one decoration leaves a marker half its colour, and the caps
of a sphere and of a line compound. A browser with no `EXT_float_blend` draws every sphere
whole, as the map did before.

The region overlay is one switch, and it is on unless the `regions` option says
otherwise. It draws the traced set, a line through the midpoints of the edges the 49.3494
light year region grid holds, smoothed and reduced to 5,727 vertices. The set departs from
the grid by well under one cell. A switch takes effect in the next frame and does not
rebuild the scene data.

`regionNameAt(point)` reads the coarse region grid, whose cells are 197.3976 light years,
and answers in the same tick. `regionNameAtExact(point)` reads the game's own 49.3494
light year grid and gives a promise: the region cell table is about 199 KiB and loads on
the first call, so a host that never asks never fetches it. Both read the `x` and the `z`
of the point and ignore its `y`. Use the first for a reading that follows the cursor every
frame, and the second where one place is named as a fact. The library owns the render context, the scene data, the view, the controls and
the frame loop. It does not read or write the URL: [src/app/main.ts](src/app/main.ts) is
the demo page, and it owns the fragment, the message box and the test hooks.

The boundary is one warm cream band with a soft edge. Its base half width is 1.6 per cent
of the viewport height in CSS pixels, held between 8 and 24, so the whole band measures
34.6 CSS pixels at 1,080 rows. **The band takes that width at 12,000 light years and
nearer, and it falls as `1 / range` beyond it**, held at a floor of 2 CSS pixels. The band
bounds an area of the plane, so it belongs to the picture and takes a size in the picture:
a band of one width at every range covered a far region from edge to edge. The width is
**not** what hides the raster — the line is smoothed
for that, and the staircase is periodic, so the eye reads the repeat and not one step. What
the width does is round a corner: the map runs no blur, because the coverage is the exact
distance to the nearest segment under a `MAX` blend, so the sharpest corner of the traced set
draws as a round turn of the band's own half width.

Two fades multiply. The **range fade** is read for each pixel, from the camera to the
plane point under it: nothing at 8,000 light years and below, rising to full at 12,000.
The **zoom fade** is read once for the frame, from the camera to the cursor: full at
20,000 light years and below, falling to nothing at 30,000. A region label takes the same
two fades, the range one read at the label's own plane anchor, so a name and the line
under it read at the same strength and neither outlives the other. A close zoom therefore
keeps the lines near the horizon and takes away the ones near the cursor, which would
otherwise cross the frame as one band. There the HUD's top bar still names the region under
the cursor, and
`regionNameAt` answers for any point on the plane.

A marker draws for every system at every zoom distance, from 10 to 120,000 light years,
while the camera is inside the draw range of the system's category.
The invented star field fades out as the camera comes in: it draws in full at a zoom
distance of 2,560 light years and adds no light at 640 and below, so the close view holds
the host's systems and nothing the map invented. A decoration star within 3 light years
of a real system is not drawn. That rule runs in the finest drawn size class alone, which
covers the systems near the camera, so a coarser class can still draw a star beside a
marker further out.

## The nebulae

The map draws 358 nebulae as sprites, 190 of them named, from a record file of 14,626
bytes and one sprite atlas of 811,762 bytes. They are an **opt-in**, because a host pays for that art
in its own build. A host that wants them imports the source from the subpath and passes
it in the options:

```ts
import { createGalaxyMap } from 'elite-dangerous-galaxy-map';
import { nebulae } from 'elite-dangerous-galaxy-map/nebulae';

const map = createGalaxyMap(canvas, { nebulae });
```

The source names the record file and the art, and the map loads both after the first
frame. The sprites appear when the pair arrives, so nothing holds the first frame behind
them. A failed load leaves the map drawing every other pass.

Three handle members drive them. `hasNebulae()` answers whether the map holds a source it
can read. `setNebulaeVisible(on)` takes the sprites off the frame and gives them back,
and `areNebulaeVisible()` reads that state. The switch keeps the records and the art on
the GPU, so the sprites come back without a second download. A map with no source reads
`false` from `hasNebulae()` and from `areNebulaeVisible()`, and `setNebulaeVisible` then
changes nothing.

The options object takes the source by value and not by name: the map calls `loadSet`,
`loadAtlas` and `createDraw` on the object the host gives it. An option that is not an
object, or that does not carry the three calls, turns the nebulae off and reports
nothing.

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

Four options build what the host does not have to drive itself:

```ts
const map = createGalaxyMap(canvas, {
  grid: true,
  cursorMarker: true,
  loadingImage: '/loader.svg',
  hud: {
    title: 'GALACTIC CARTOGRAPHICS',
    actions: [{ label: 'LOG RECORD', onSelect: (system) => console.log(system) }],
  },
});
```

`grid` draws the coordinate grid on the galactic plane. It is off unless the options ask
for it, `setGridVisible` turns it on and off later, and `onGridChange` reports every
move of the switch, which the HUD drives as well. `cursorMarker` draws the marker at the
cursor: a cyan ring with four arrows around it, lying on the cursor's own plane. It is on
unless the options set it to false, and `setCursorMarkerVisible` and
`getCursorMarkerVisible` drive it later. The demo site asks for the grid and
the library default stays off, because a host that embeds the map in its own page did
not ask for a coordinate grid. The grid fades in by the camera's distance to the cursor:
it draws nothing at 12,000 light years and further, and it draws in full at 4,000 and
nearer.

Inside that band a level also stops at a distance from the cursor. A level reaches 100 of
its own lines, and every level that carries no coordinate number also stops at 0.4 of the
camera's distance to the cursor, whichever is the nearer. That disc holds the same share
of the frame at every zoom, about a third of the height, so the dense lattice marks a
neighbourhood of the cursor instead of running to the frame edge. The level that carries
the numbers keeps its own reach, because a number has to sit on a line that draws.

The grid draws in cyan, `rgb(96, 214, 224)`, which is the only cool line the map draws:
the galactic core and the region boundary band are both warm, so the grid is told from
both by hue at any brightness.

The grid also follows the picture under it. The map reads the local brightness of the
galaxy it drew, and each line and each coordinate number takes its strength and its
colour from that reading. A line over the dark space between the arms keeps its full
strength and its light cyan. The same line over the bright core keeps a part of its
strength and moves to a deep blue, `rgb(16, 74, 120)`, so it removes light there rather
than adding it and the grid reads as part of the picture and not as a layer on top of it.

The grid's numbers lie on the plane with the lines. Each one names the three game
coordinates of a crossing, as `x : y : z`, and it is drawn in the plane's own perspective,
so it grows and shrinks with the cell it sits in. Two levels carry numbers, 100 and 1,000
light years, and a frame holds at most eight of them.

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
system with its fields, description, thumbnails and a lightbox. The options panel holds
four switches, and a fifth one, **Nebulae**, where `hasNebulae()` answers true. A map
with no nebula source builds no fifth switch, because a switch that turned on a feature
the map cannot draw would do nothing.

**The category browser has two tabs.** SYSTEMS lists the categories that hold records and
SHAPES lists the ones that hold shapes, each with its own search box. ALL and NONE act on
the rows of the tab in front of the user, and on the kind of that tab alone, so NONE in the
SHAPES tab leaves every marker on the screen. A category row carries two buttons: the dot
takes the category off and on for the kind of its own tab, and the rest of the row opens
the row and closes it. The same category can therefore read on in one tab and off in the
other. One click did both
before, so a host that drove the row by a click must now name the part it wants. The dot
carries `aria-pressed` and the row carries `aria-expanded`. An open shape row lists the
shapes of that category and a click on one flies the camera to it. The panel's fields start
with `POSITION`, `DISTANCE FROM SOL`, `RANGE` and `REGION`. `RANGE` is the distance
from the cursor to the system, so it reads 0 light years after a flight lands on the
system. `REGION` names the codex
region of the system, resolved on the game's own 49.3494 light year grid through
`regionNameAtExact`. It is empty until the promise settles, so the grid does not reflow,
and it reads `Unknown` for a position the region map does not cover. It reads the map through
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

## The camera a host drives

Three options set what the camera may do, and seven handle members drive it later.

```ts
const map = createGalaxyMap(canvas, {
  bounds: { mode: 'sphere', centre: [0, 0, 0], radiusLy: 1000 },
  startView: { system: 'Sol', distance: 300, pitch: -20 },
  interaction: { select: false },
});

await map.flyTo({ system: 'Achenar', distance: 200 });
```

`bounds` is how much of the space the user may browse. It has three modes.
`unrestricted` is the default: the cursor holds to the model bounds and the far zoom
limit is 120,000 light years. `auto` is the box that holds every system of the set, grown
by `marginLy` on each axis, which is 1,000 light years where the host names none. `sphere`
is a ball, from a `centre` in game coordinates and a `radiusLy`. The bound clamps the
cursor and the far zoom limit together, so the user cannot pull the camera back to look at
what the cursor may not reach. The far limit is the radius over the sine of half the field
of view, which is about twice the radius, and it stays between 10 and 120,000 light years.
The bound changes nothing the map draws. `setBounds` moves it later and pulls the current
view inside the new bound, and `getBounds` reads it. An `auto` bound with no system in the
set reads as `unrestricted`, because an empty box would pin the camera to a point.

`startView` is the camera the map opens at. It takes a `cursor` or a `system`, a
`distance`, a `yaw` and a `pitch`, and a field the host leaves out takes the value of the
default view. The map takes the start view in the frame it draws first and flies nowhere.
A host adds its records after the map is built, so a `system` start waits for the set to
hold that record, for up to 600 drawn frames. The library reads no URL. The demo page names no
`startView`: it reads the fragment itself and calls `setView` after the map is built, so
the fragment wins there. A host that wants `startView` to hold must not write the view
after the build.

`interaction` is which of the user's inputs the map acts on: `zoom`, `orbit`, `pan`,
`keys` and `select`. Every switch is on where the host names none. A switch that is off
stops the input and leaves the same move open to the host's own calls, so a map with
`pan: false` still answers `setView`. `setInteraction` takes a partial setting over the
one the map holds, so a call that writes one switch leaves the other four, and
`getInteraction` reads all five.

`flyTo(target, options)` flies the camera to a `cursor` or a `system`, a `distance`, a
`yaw` and a `pitch`. A field the target leaves out keeps the value the view holds, so
`flyTo({ distance: 100 })` is a zoom in place and `flyTo({ yaw: 180 })` is a turn in
place. The promise settles with `landed` where the flight reached the target and
`interrupted` where a user input, a selection or a second `flyTo` cut it short. A target
outside the bound lands at the nearest view the bound allows, and a system the set does
not hold flies nowhere and settles `landed`. `flyTo(target, { animate: false })` takes the
target in this frame. The map does the same where the browser asks for less movement.
`isFlying` reads whether a flight runs, and `onFlightEnd` reports each end with the same
two words.

The flight path is the smooth zoom-and-pan curve of Van Wijk and Nuij (2003), which holds
the perceived speed of the picture even over the whole move. It pulls the camera back over
the middle of a long flight and brings it in again, so the user sees the ground the flight
crosses. A flight runs between 0.4 and 2 seconds, from the longer of the path and the
turn. The camera turns the short way round, and a half turn turns forward.

`encodeView(view, grid?)` and `decodeView(fragment)` write and read the URL fragment
above, and `decodeGrid(fragment)` reads the grid field alone. The three are pure, so a
host that saves a view in its own storage needs no map to write it and no map to read it
back. A view round trips within 1e-5.

## Controls

| Input           | What it does                                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Left click      | Selects the system under the pointer. A click that finds no system keeps the selection.                                                                              |
| Left drag       | Turns the camera around the cursor. 0.3 degrees per pixel. Pitch stops at -89 and 89 degrees.                                                                        |
| Right drag      | Moves the cursor in the galactic plane. The point under the pointer stays under it.                                                                                  |
| Wheel           | Divides the distance by 1.15 per notch, between 10 light years and the far limit of the bound. The camera glides to the new distance and lands in about 0.2 seconds. |
| `W` `A` `S` `D` | Move the cursor in the plane, relative to the camera, at one quarter of the distance per second.                                                                     |
| `R` `F`         | Move the cursor up and down at the same speed.                                                                                                                       |
| `Q` `E`         | Turn the camera around the cursor at 60 degrees per second. `E` turns it the way a drag to the right turns it.                                                       |
| `Escape`        | Unwinds one step: the dataset dialog, then the HUD lightbox, then the selection.                                                                                     |

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

Firefox needs none of those flags. It reaches the card headless with its default
settings. It does hide the card behind a generic name: it answers
`NVIDIA GeForce GTX 980, or similar` for every NVIDIA card, so the `firefox` project sets
`webgl.sanitize-unmasked-renderer` to `false` and the check reads the true string.

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

**The suite runs two browsers.** Chromium takes the whole suite. Firefox takes the
renderer check and `e2e/paint-cost.spec.ts`, which reads the main-thread cost of a camera
move. Chromium blurs on the GPU and Firefox blurs on the CPU, so a CSS property that
costs Chromium 1 ms a frame can cost Firefox 7 ms, and a suite that runs one browser
reads one of the two costs. `pnpm test:e2e` runs both, in two passes: every other spec on
several workers, then the timed specs and Firefox on one worker.

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
src/nebulae/        the nebula subpath entry, which is one source
e2e/                the Playwright tests and the baseline image
tests/fixtures/     the model fixture and the detail fixture
docs/               the model formulas
```

`src/galaxy-model/` and `src/scene-data/` must not import `src/render/`. An ESLint rule
holds that line, so a different density source can replace the data layers without a
change in the renderer. A second rule stops `src/hud/` importing `src/render/`,
`src/scene-data/` or `src/camera/`, so the HUD reads the map through the public handle
alone. A third rule stops every module but `src/nebulae/`, `src/render/nebula-pass.ts`
and `src/render/nebula-atlas.ts` value-importing a nebula module, so the main entry
reaches the nebula code through the source the host passes and a build without that
source carries none of it.
