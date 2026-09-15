## Why

The map is written as a library but it is not built as one. `pnpm build` emits a web
page, `addCategories` and `addSystems` take `readonly unknown[]`, and the only way to
see the map is to run the dev server. Nobody outside this repository can install the
map, and nobody at all can look at it without a checkout and a GPU.

At the same time seven faults in the map itself are now visible against the mockup in
`.design/Galaxy Map HUD.dc.html`: a region label that slides to the frame edge never
comes back; the selected system's name cannot be copied; its position cannot be copied; a
system shows in one category list when it belongs to several; the map is blank while it
starts; the region boundary draws at full strength right up against the camera, where the
`accurate` staircase is worst and where its two tones are hardest; and there is no way to
switch between data sets.

The coordinate grid carries three more faults. It starts off and the demo page never asks
for it, so a visitor reaches it only through the HUD's options panel, and a reload loses
it because the URL fragment does not carry the switch. When it is on it draws at every
zoom. At the start view of 60,000 light years the 10,000 light year level measures 156 CSS
pixels across at an alpha of about 0.25, so ten lines each way lie over the whole galaxy.
Its coordinate labels read neither the model bounds nor the level's alpha, while the lines
stop at both: the label level at that view is 100,000 light years and the sweep reaches 8
of its spacings, so the labels run out to 800,000 light years, sixteen times the model
bound of about 50,000.

## What Changes

**The build splits into a library and a demo site.** `pnpm build` emits the library in
Vite library mode: an ES module, its type declarations, and no page, no HUD host and no
demo data. `pnpm build:demo-site` emits the demo site: the page, the demo data sets and
the base path the repository's GitHub Pages URL needs. **BREAKING** for the browser
suite, which serves `pnpm build && pnpm preview` today and must serve the demo site
build instead.

**The record input is typed.** The library exports `CategoryInput` and
`SystemRecordInput`, and `addCategories` and `addSystems` take arrays of them.
**BREAKING**: a caller that passes a shape the type rejects now fails to compile. The
run-time reader and its rejection report stay, because the data comes from a file or a
network call the compiler does not see. This is roadmap phase 5.

**A host gives the map a dataset catalog.** `GalaxyMapOptions` takes `datasets`: each
entry carries an id, a label, a collection, a region, a system count and an async
`load()` the host writes. The handle carries `getDatasets`, `getLoadedDataset`,
`loadDataset(id)` and `onDatasetChange(fn)`. The HUD grows the mockup's dataset field in the top bar and the
dataset library dialog behind it. The library holds no data: it calls `load()` and
reads what comes back through the same two calls any host uses.

**The demo site carries three data sets.** `scripts/build-demo-systems.mjs` grows into a
converter per source and writes one file per set: the Guardian Ruins it writes today,
the Guardian Structures (`guardian_structures.json`, 209 records in 163 systems over 10
site types), and the Notable Systems of the same project (16 records in 4 categories,
whose `html` field converts to a plain-text description). The repository commits no
dump.

**A system shows in every category it is in.** The category browser counts and lists a
system under its primary category and every secondary one, and a marker draws when
**any** category it belongs to is on. Today both read the primary category alone, so a
Guardian system with an Alpha and a Beta ruin shows only under Alpha, and turning Alpha
off hides a system the user asked to keep. The marker still takes the colour and the
style of the primary category.

**A region label returns to the centre of its region.** The held anchor now goes back
toward the region's own mean plane position instead of staying where it was pushed. It
takes half of the gap in a frame, so a pushed label is back in about 9 frames. The step is
bounded, which keeps the label from jumping when the target itself steps.

**The selected system's name and position carry a copy button.** Each writes to the
clipboard and shows a tick for 1.4 seconds.

**The host may name a loading image.** `GalaxyMapOptions.loadingImage` is a URL. The
library shows it centred on the canvas until `ready` settles, then removes it.

The demo site names `public/EDLoader1.svg`, which is the ED Assets loader the request
named, held in the repository and served from the site's own origin. It is not fetched from
`edassets.org`: `map-hud` holds that the browser suite reaches no host but the page's own,
and the suite now serves the demo site, so a remote loader would break that rule on every
page load. `THIRD_PARTY_NOTICES.md` records the file, its source and that ED Assets states
no licence on it.

**The region boundary fades as the camera comes near it, and it is washed out.** The
fade is by the camera's own distance to the drawn line, per fragment, not by the zoom
distance: a line under the camera goes out, and a line across the frame stays. The two
tones move toward each other, so the `accurate` staircase reads as a soft edge rather
than a row of steps. **BREAKING** for a host that measured the line's colours.

**CI builds, checks and publishes.** A GitHub Actions workflow runs `pnpm lint`, the
TypeScript check, `pnpm test` and both builds on every push and pull request, and
publishes the demo site to GitHub Pages from `main`. The Playwright suite stays a local
gate: GitHub-hosted runners carry no NVIDIA card, and this project's suite fails a run
that falls back to software rendering.

**The coordinate grid is reachable, bounded and remembered.** The demo site starts with
the grid on, and the URL fragment carries the switch as `g=1` or `g=0`, so a reload and a
shared link keep it. The library default stays off. The grid fades in by the camera's own
distance: nothing at 12,000 light years or further, full at 4,000 or nearer, so a wide
view stays clean and the grid appears at the scale its 1,000 light year level carries. A
coordinate label draws only where its lines draw: inside the model bounds, and where its
level's drawn alpha holds a floor of 0.09, which reads the screen spacing and the band
together.
The handle gains `onGridChange(fn)`, because the page cannot otherwise learn that the HUD
switch moved. **BREAKING** for the browser suite: `openMap` turns the grid off, as it
clears the demo set.

**Non-goals.** The library still reads no Spansh dump and calls no EDSM endpoint. The
mockup's **Category glow** switch is still not built, for the reason phase 4 gave: no
spec states what it does to the frame. The library is not published to npm in this
change; it is only built as a package.

**This change supersedes part of `flight-markers-and-grid`.** That change is not archived
yet, and its requirement "The demo page loads the Guardian Ruins data set" holds that the
production build drops the set and that no browser test puts a record of it on the map.
The demo site build carries the set, so this change rewrites that requirement.
`flight-markers-and-grid` SHALL therefore be archived **first**. Until it is, `openspec
validate` reports that the archive of this change would refuse the block, which is the
expected reading and not a fault in the artifacts.

## Capabilities

### New Capabilities

- `library-package`: what `pnpm build` emits, what the package exports, the typed record
  input, and how the demo site is built apart from it.
- `dataset-catalog`: the host's dataset catalog, the handle members that read and load
  from it, the HUD's dataset field and dialog, and the demo site's three sets.
- `continuous-integration`: what the workflow runs, what it refuses to publish, and how
  the demo site reaches GitHub Pages.

### Modified Capabilities

- `real-systems`: the typed input replaces `readonly unknown[]`; a marker draws when any
  category the system belongs to is on, not only its primary one; the entry point takes
  a loading image and shows it until the first frame.
- `map-hud`: the category browser counts and lists a system under every category it
  belongs to; the information panel carries a copy button on the name and on the
  position; the top bar carries the dataset field.
- `galactic-regions`: a held label anchor goes back to its region's mean; the boundary
  line fades by the camera's distance to the line and draws in two closer tones.
- `coordinate-grid`: the grid fades in over a camera distance band, so a wide view draws
  none of it; a coordinate label draws only inside the model bounds and only where its own
  level draws; the demo site starts the grid on while the library default stays off.
- `map-navigation`: the URL fragment carries the coordinate grid switch.

## Impact

**Code.** `src/app/create-map.ts` (options, handle, the loading overlay, the dataset
calls), `src/app/labels.ts` (the anchor filter), `src/scene-data/real-systems.ts` (the
typed input, the marker flags over every category), `src/hud/` (the top bar, the
categories panel, the information panel, a new dataset dialog, the styles),
`src/render/region-pass.ts` and `src/render/shaders/regions.vert`,
`regions.frag` and `region-composite.frag` (the distance fade and the washed tones),
`src/render/grid-pass.ts` and `src/render/shaders/grid.frag` (the camera distance band),
`src/app/grid-labels.ts` (the bounds and the spacing gate), `src/app/url-view.ts` (the
grid field) and `src/app/main.ts` (the demo site's grid default).

**Build and repository.** `vite.config.ts` keeps the page and a new `vite.config.lib.ts`
builds the library,
`package.json` gains the entry fields and the scripts, `src/index.ts` is the library's
entry, `index.html` stays the demo site's page and the demo data moves to `demo-data/`,
`playwright.config.ts` serves the demo site build, `scripts/` gains two converters, and
`.github/workflows/` is new.

**Documents.** `README.md` (the scripts, the entry point, the datasets, the loading
image), `THIRD_PARTY_NOTICES.md` (the two new Canonn sets and the loader image),
`docs/roadmap.md` (phase 5 and this phase).

**Tests.** The browser suite's base URL and the served build change. `e2e/helpers.ts`
clears the demo set by default, and `tests/region-views.ts` and `e2e/region-views.ts` carry
new constants for the two corner views, which sit at a zoom the near fade now empties. New unit tests for
the anchor filter, the category membership rule, the dataset catalog reader and the two
converters. New browser tests for the copy buttons, the dataset dialog, the loading
image and the boundary fade. `e2e/grid.spec.ts` and `src/app/grid-labels.test.ts` carry
the band and the label gate, and `src/app/url-view.test.ts` carries the grid field.
`e2e/frame-budget.spec.ts` holds two grid readings, at 4,000 and 1,000 light years, and
needs no change: the band is 1 at 4,000 and nearer.
