## Context

See `proposal.md` for the motivation. This section holds the current state the design has
to work with.

**One build.** `vite.config.ts` builds the page at the repository root: `index.html`,
`src/app/main.ts`, the HUD and, on the dev server alone, the demo data. `pnpm build` runs
`tsc --noEmit` and then that build. There is no library output and no declaration file.

**Three workers and three font files.** `src/scene-data/load.ts` makes each worker with
`new Worker(new URL('./x.worker.ts', import.meta.url))`, and `src/hud/styles.ts` imports
three `.woff2` files with `?url`. Both patterns need the bundler, so the package the
library build emits is a set of chunks and assets, not one file.

**The region overlay draws in two steps.** `src/render/region-pass.ts` expands each
boundary segment into a screen ribbon and writes its coverage into an `R8` buffer with the
`MAX` blend equation. A full-screen composite reads that one channel and writes the two
tones. `regions.frag` already works out `part`, the place along the segment nearest the
pixel.

**The label anchor is held, not moved.** `src/app/labels.ts` carries the anchor of the
frame before and keeps it while its plane point still resolves to the region and still
projects inside the frame. Nothing moves it back.

**The category flags read one category.** `refreshFlags` in
`src/scene-data/real-systems.ts` reads `categoryVisible.get(system.primaryCategory)`, and
`src/hud/categories.ts` buckets the systems by `primaryCategory`.

**The grid reads no camera distance, and its labels read no line.** `gridLevelAlpha` in
`src/render/grid-pass.ts` reads the level's spacing on the screen alone, so a coarse level
draws brighter the further the camera pulls back. `grid.frag` discards a fragment outside
the model bounds, which run from −49,985 to 50,015 on x and from −24,105 to 75,895 on z.
`gridLabelPlacements` in `src/app/grid-labels.ts` drops a crossing only when it falls
outside the frame, so it reads neither the bounds nor the alpha.

**The demo page asks for no grid and remembers none.** `src/app/main.ts` passes
`labelHost` and `hud` and no `grid`, and `src/app/url-view.ts` carries `c`, `d`, `p` and
`y`. `createFragmentWriter` formats the one view object the page holds and the page calls
`writer.schedule()` from `map.onViewChange`.

**The browser suite serves the production build.** `playwright.config.ts` runs
`pnpm build && pnpm preview` and opens `http://localhost:4173`. The production build drops
the demo data, so the suite measures an empty set.

## Goals / Non-Goals

**Goals:**

- One source tree, two build outputs, and no copy of the map's code.
- A package a host can install, with types on every public call.
- A demo site that shows the map with data, at a public address.
- The ten faults the proposal lists, each fixed where it belongs: the renderer, the
  label placement, the scene data, the demo page or the HUD.
- No new run-time dependency.

**Non-Goals:**

- Publishing to npm. The change builds the package; it does not release it.
- A build-time data pipeline in the library. The host calls `load()`; the library reads
  what comes back.
- Running the browser suite in CI. A GitHub-hosted runner has no NVIDIA card.
- A design change to the HUD's look. The mockup already states it.

## Decisions

### Two Vite configurations, not one with a switch

`vite.config.ts` keeps the page: the dev server, the demo site build and `preview`. A new
`vite.config.lib.ts` holds the library build. `pnpm build` runs the library build and
`pnpm build:demo-site` runs the page build.

A mode switch inside one file reads as two configurations anyway, and every option would
carry a condition. Two files say which options belong to which output.

The demo site configuration sets `base: '/Elite-Dangerous-Galaxy-Map/'`. `vite preview`
then serves the site under that path, so the browser suite's base URL becomes
`http://localhost:4173/Elite-Dangerous-Galaxy-Map/`. The alternative, passing `--base` on
the command line, leaves `preview` serving from the root and the two disagree.

The two builds write to two directories: the library to `dist/`, which `files` in
`package.json` names, and the demo site to `dist-demo/`, which the Pages job uploads. Both
default to `dist/`, so without this the demo site build would delete the library build in
the check job, which runs one after the other.

Every navigation in `e2e/` becomes relative. Playwright resolves a path that starts with
`/` against the origin and not against the base URL, so `page.goto('/#c=...')` would land
on `http://localhost:4173/#c=...` and rely on a redirect to carry the fragment. The calls
become `page.goto('./#c=...')`, which resolves against the base path.

### The library entry is a new `src/index.ts`

The barrel re-exports `createGalaxyMap` and the named types, and it does not export
`GalaxyMapDebug`. `package.json` names it in `exports`, so a host cannot deep-import a
module the barrel left out.

Pointing the library entry at `src/app/create-map.ts` was the alternative. It exports the
debug type, and every later export would reach the public surface by accident. The barrel
makes the surface a list one reviewer can read.

### The declaration comes from `tsc`, not from a plugin

`tsconfig.build.json` extends the project configuration and sets `emitDeclarationOnly`
with `declaration`, and writes to `dist/types`. `pnpm build` runs the Vite build **first**
and the type emit **second**, because Vite's `emptyOutDir` defaults to true for an `outDir`
inside the root and would take `dist/types` with it. The other way, setting
`emptyOutDir: false`, leaves a stale chunk in `dist/` from a build before, which is worse
in a package than an ordering rule.

`vite-plugin-dts` is the alternative. It is a new dependency under the 7-day release hold,
and the project already runs `tsc` on every build, so the compiler is there.

### The library output keeps its chunks

The library build sets `formats: ['es']`, `publicDir: false` and leaves code splitting on.
`publicDir: false` keeps `public/` out of the package: Vite copies it by default, and it
holds the demo site's pictures, one of which ED Assets states no licence on. The HUD stays a
dynamic import, so it stays a chunk a host downloads only when it asks for the HUD, and
each worker stays its own file. `inlineDynamicImports` would make one file and pull the
HUD and the three workers into it.

`gl-matrix` and `@elite-dangerous-almanac/core` stay external and stay in `dependencies`.
A host that already uses `gl-matrix` then holds one copy. The cost is that the emitted
module carries bare specifiers, so a host needs a bundler or an import map. Every host
this library is for has one.

**The externals are written as a pattern, not as two strings, and the workers are built
apart.** `src/scene-data/region-lines.ts` imports
`@elite-dangerous-almanac/core/astro/codex-region-lookup`, and a plain string in Rollup's
`external` does not match a subpath. The configuration therefore externalises by a regular
expression on the package name and its subpaths. It also sets `worker.rollupOptions`,
because Vite builds a worker through that and not through `build.rollupOptions`: a worker
chunk that carried a bare specifier would not resolve in the browser, and neither the
file-reading test nor the Node import test would catch it. A test SHALL read every emitted
worker chunk and fail on a bare import.

### The page and the demo data stay where they are

`index.html` stays at the repository root and `src/app/main.ts` stays the page module. The
library build never reaches them, because `src/index.ts` does not import them. The three
demo data files go in a new `demo-data/` directory at the repository root, which
`main.ts` imports and no file under `src/` does.

Moving the page into a `demo/` root was the alternative. It changes the dev server path,
the browser suite and every relative import, and `files` in `package.json` already decides
what the package ships.

### The browser suite's helper clears the set, not each test

The suite now serves a site that loads the Guardian Ruins set at start, where it used to
serve a build with no data. About 188 of the suite's 259 tests read a marker count, a
category count or a frame that the set changes: `openMap` opens the demo page, and
`systems`, `selection`, `look`, `stars`, `regions`, `render`, `grid`, `frame-budget` and
`navigation` all drive the map it opened. The 62 tests of `hud.spec.ts` are safe, because
`openHud` disposes that map and builds its own.

Four files navigate by themselves and reach no helper: `00-renderer`, `labels`,
`scene-data`, and two places in `systems`. Task 3.4 already makes those calls relative, and
task 3.8 gives each one the same start state the helper gives, so the demo set and the grid
default do not reach a test that asked for neither.

`openMap` therefore calls `clearSystemsAndCategories()` after `ready` settles, and takes an
option that keeps the set. Every test that does not ask for the set opens the map it opened
before, and a test written later reads no set it did not ask for. The clear runs after
`ready`, which `dataset-catalog` holds to settle after the start load, so it reaches a set
that is already there.

Two alternatives were weighed. Editing each test that measures an empty set puts the same
line in about 188 places and leaves the next test to find out. A URL flag that tells the
page to load nothing puts a test-only path in the page, and the handle already carries the
call.

### The near fade travels in a second channel of the coverage buffer

The coverage buffer becomes `RG8`. The red channel keeps the coverage. The green channel
carries the near fade of the pixel, worked out in `regions.frag` from the camera distance
to the nearest point of the segment. The positions are already camera-relative, so that
distance is `length(uChunkOffset + mix(aStart, aEnd, part))`. The vertex shader passes the
two endpoint positions and their clip `w`, and the fragment shader corrects the
perspective before it reads the distance at `part`. The composite multiplies the two
channels into the alpha.

**The fragment reads the distance and does not interpolate it.** A linear mix of two
endpoint distances is wrong on a long segment, and the sets hold long segments: 2,602
smoothed segments are over 100 light years and 145 are over 1,000, the longest 3,681. One
candidate read 1,419 light years where the true range is about 490, which is the
difference between a line that fades and a line that does not.

Both channels blend with `MAX`. Where two segments of one chain overlap at a join their
fades are within a segment length of each other, against a fade band of 1,300 light years,
so the join reads as one value. Where a near line crosses a far line in screen space the
near line takes the far line's fade over the few pixels of the crossing, and reads
brighter than it should. That is the price of one buffer and one draw.

Two alternatives were weighed. Multiplying the fade into the coverage keeps the `R8`
buffer, but the composite splits the core from the outline by the coverage level, so a
faded line would grow thin instead of going out. Reconstructing the plane point in the
composite from the view ray needs no second channel, but it measures the camera distance
to the pixel's plane point rather than to the segment, which is not what the spec states.

### The filter is a pure function over plane points

`labels.ts` gains `filterAnchor(carried, target, toScreen)`. It moves the carried point
half of the way to the target in plane coordinates. It then projects both ends of that
step, and if the screen move is over 20 CSS pixels it scales the step down until it is 20.
A carried point that no longer resolves to its region, or no longer projects inside the
frame, is dropped and the target is taken whole.

The cap is worked out on the projection and not on the plane, because a plane step of a
fixed size is a different number of pixels at every zoom.

**Why a filter at all, when the owner asked for the label to move at once.** The first
build moved the label 8 percent of the gap a frame, capped at 4 CSS pixels, and a label
pushed to the frame edge took 550 to 835 milliseconds to come back. That reads as a crawl.
Taking each frame's target whole reads worse: the target is read from a grid of samples
that slides over the plane, so it steps on its own while the camera moves. Measured over a
slow pan across the galactic centre, the target of `Izanami` jumps **48 CSS pixels** in one
frame when a second patch of the region comes into view, and every label shivers by a pixel
or two as samples cross region edges. Half the gap with a 20 pixel cap holds both ends: a
128 pixel relocation lands in 9 frames, 150 milliseconds, and the 48 pixel step of the
target reaches the label as 19.8 pixels over three frames.

### The category sweep stays a map lookup

`refreshFlags` walks each system and its categories and sets the flag when any of them is
on. With 10,000 systems of 4 categories that is 40,000 lookups in a `Map`, which is well
inside the 2 millisecond budget the spec states, and the sweep runs on a category switch
and not on a frame. A unit test measures it.

A bit set per system over the 256 categories was the alternative. It is 320 kilobytes and
a second structure to keep in step, for a sweep that is already fast enough.

### The dataset state machine lives beside the map, not in the HUD

`src/app/datasets.ts` holds the catalog reader and the load state. `create-map.ts` calls
it and puts `getDatasets`, `getLoadedDataset`, `loadDataset` and `onDatasetChange` on the
handle. `src/hud/dataset-dialog.ts` draws the field and the dialog and reads those four
members alone, which is what the import rule for `src/hud/` requires.

`loadDataset` holds a counter. Each call takes the next number, and a load writes the map
only while its number is still the newest. A later load therefore wins and an earlier one
rejects with a cancelled error.

### The demo site serves the loader from its own origin

The owner put the ED Assets loader in the repository as `public/EDLoader1.svg`, so the demo
page names that path and the build serves it under the site's base path.

It is served and not fetched because `map-hud` holds that the browser suite reaches no host
but the page's own, and the suite now serves the demo site: a remote loader would break that
rule on every page load and would put the suite behind another project's uptime.

Holding a copy is the owner's decision. `THIRD_PARTY_NOTICES.md` records that ED Assets
states no licence on its files, and it records the selection pin as eight numbers rather
than a copy. The loader is a copy, so the notice states that plainly beside the other
entry.

### The loading image is an element of the canvas's parent

`create-map.ts` puts an `<img>` in the **canvas's parent**, centred on the canvas's box
with `left: 50%`, `top: 50%` and `translate(-50%, -50%)`. It is the canvas's parent and not
the label host, because a host may pass a `labelHost` element of its own that sits
somewhere else on the page. It is removed when `ready` settles,
whether it settles or fails. The URL passes the `safeImageUrl` scheme check the record
images already use.

The image cannot live in the HUD. A host that asks for no HUD still starts the map, and
the image is what it shows while it starts.

### The workflow is checked as text, not parsed

The unit tests that read `.github/workflows/` match the file with regular expressions. A
YAML parser is a dependency the project needs for nothing else, and what the tests assert
is that a command is there, in order, and that Playwright is not.

### The demo site starts the grid on and the fragment carries it

`src/app/main.ts` asks for `grid: true` unless the fragment says `g=0`, and the page
writes `g=1` or `g=0` back when the switch moves. The library default stays off, so a host
that says nothing still gets no grid. A host that embeds the map in its own page did not
ask for a coordinate grid, and `coordinate-grid` holds that default today.

The page cannot learn the switch from `onViewChange`: the grid is not view state, and the
HUD owns the switch. The handle therefore gains `onGridChange(fn)`, which `real-systems`
states. The fragment module grows three changes and keeps every signature the tests read:
`formatViewFragment(view, grid)` takes a second argument and writes `&g=1` or `&g=0` only
when it is a boolean, so a format with no grid still gives the string
`c=0,0,0&d=30000&p=35&y=0` that `src/app/url-view.test.ts` asserts; a new
`parseGridFragment(fragment)` reads the field and gives `true`, `false`, or null for a
fragment that names none; and `createFragmentWriter` takes an optional `grid()` reader in
its options, which it calls at each write. `parseViewFragment` does not change, so
`map.setView(parseViewFragment(...))` and the `hashchange` handler keep their shape.

The page calls `writer.schedule()` from the new listener, so the grid field rides the same
throttled write the view fields do, at most one write every 500 ms. The `hashchange`
handler reads the grid field as well, because a fragment pasted into the address bar names
a view **and** a grid, and the view already follows that path. A fragment that names no `g`
leaves the switch where it is.

A poll of `isGridVisible()` inside the writer's own tick was the other way. It was refused
because the writer is scheduled and not continuous, so a link copied between the switch
and the next write would carry the wrong value.

### The grid fades by the camera's distance, not by the level's screen spacing

One more factor multiplies every level's alpha: a smooth step over the camera's distance
to the cursor, 0 at 12,000 light years and 1 at 4,000. The processor works it out once and
sends it as a uniform, so the fragment shader adds one multiply and no branch.

A gate over the screen spacing alone cannot empty a wide view, which is the fault. A level
grows **wider** on the screen as the camera pulls back: at 60,000 light years the 100,000
light year level measures 1,559 CSS pixels, the widest reading its fade holds. The fade
that is there drops a level that is too fine, not a grid that is too far.

The band reads the camera's distance to the cursor and not each fragment's own range. A
per-fragment band would open the grid under the camera at every zoom, which is the reading
the user reported as wrong.

The band is the zoom at which the 1,000 light year level carries the frame: at 4,000 light
years it measures 234 CSS pixels and it is the label level from 2,337 light years in. The
start view of 60,000 light years therefore draws no grid at all.

When the band gives 0 the pass does not draw at all. The three probes then read what they
read for a grid that is switched off: no vertices, no spacing and no levels. That is the
invariant `coordinate-grid` holds in "The grid reports what it drew", and the comment in
`src/render/renderer.ts` states, so neither changes. The labels clear with the lines,
because the overlay reads `gridSpacingLy`. Drawing a triangle whose every fragment
discards was the alternative: it would have made the probes disagree and would have cost a
full-screen pass for an empty frame.

Two browser scenarios read a zoom the band now empties, and both need a new view, as task
7.7 gives the region views the near fade empties. "The grid stops at the model bounds" runs
at 120,000 light years; it moves to 3,000, where the cursor clamp still puts the cursor on
the x bound and one CSS pixel covers about 3.2 light years rather than 128. The vertex
sweep reads 10, 1,000 and 120,000; the last reading moves inside the band, and a new
reading at 120,000 asserts the closed band instead.

### The label sweep gates itself on the level's own alpha

`gridLabelPlacements` keeps a crossing only when two readings hold: the crossing lies
inside the model bounds on both game axes, and the level's **drawn alpha** at the crossing
is at least `GRID_LABEL_MIN_ALPHA`, which is 0.09.

The drawn alpha is the whole reading the shader makes, less the line coverage: the level's
base alpha, times the screen fade over the greater of the two projected gaps, times the
camera band. 0.09 is what a level gives at 24 CSS pixels with the band open, which is the
middle of the fade band, where `smoothstep(8, 40, spacing)` reads 0.5 and the level draws
at half its base alpha of 0.18.

One reading and not two, because the band is the other way a line goes out. A gate over the
screen spacing alone would keep every label between about 11,000 and 12,000 light years,
where the label level still measures hundreds of CSS pixels but the band multiplies its
alpha to under 0.01. The labels would then stand at full opacity over a grid the user
cannot see, which is the fault this change opens with, in a new place.

The floor of 8 CSS pixels is where a level's alpha reaches 0, not where its line becomes
readable: between 8 and about 10 CSS pixels the alpha is under 0.01, so a label placed
there would sit on nothing.

The level's reach of 100 lines is not a gate. The sweep spans 8 spacings of the label level
each side of the cursor, so the furthest candidate sits about 12 spacings out, well inside
the reach. A gate there could never fire.

The sweep measures the screen spacing from the projection's local rate at the crossing. It
projects two more points a small step along the game x and z axes, and inverts the 2 by 2
matrix those steps make. The reading is the light years of each game axis that one CSS
pixel covers there, which is the quantity the shader takes as a derivative of the plane
point. The cost is two more projections for each of the 289 candidates, in the same loop
that already projects them.

**The step is small and not one level spacing.** A gap measured over a whole spacing is a
secant of a map that bends hard toward the horizon. At a pitch of 5 degrees and a zoom of
3,000 light years a crossing 65,000 light years out makes a gap of about 144 CSS pixels,
where the shader reads 1.4 and draws nothing. The two readings agree on a level view and
part company at a grazing one, which is where the gate has to work.

The greater of the two axis readings decides, and not the smaller, because the shader takes
the larger alpha of the two axes. Where the x lines compress to nothing the z lines still
draw, and a label there still sits on a line.

`src/render/grid-pass.ts` owns the alpha rule, as the pure functions `gridLevelAlpha` and
`gridVisibility`, and `src/app/grid-labels.ts` imports those two. No lint rule stops it:
`no-restricted-imports` holds `src/galaxy-model/`, `src/scene-data/` and `src/hud/` away
from the renderer and says nothing about `src/app/`, where `create-map.ts` already imports
it. What the label module must not read is renderer **state**: it takes the level and the
camera distance from the frame it is given, so a label and its lines never disagree. The
module's header comment says the lint rule forbids the import; the comment is wrong, and
task 12.7 corrects it.

One owner and not two copies, because 0.09 is derived from the alpha table. A second copy
of 0.18, 8 and 40 in `src/app/` would drift from the table at the next edit and would move
the label gate off the middle of the fade band with no test to catch it.

Reading the coverage the shader wrote was the other alternative. It needs a render target
and a readback for a number the projection already gives.

## Risks / Trade-offs

**Vite library mode may handle the three workers differently from the page build.** →
A test imports the built module and reads the emitted files, so a worker that fails to
emit fails the build rather than the first host.

**A host with no bundler cannot resolve the external `gl-matrix` import.** → The README
names the two dependencies and says the package is an ES module for a bundler.

**The near fade takes the boundary away near the camera.** This reverses what phase 3.1
decided. A line far across the frame still draws, but the overlay is empty at a zoom of 10
light years, because every plane point in that frame is inside 200 light years, so a user at
a close zoom can no longer see which side of a boundary a system sits on. → The trade is
stated in the spec and in the roadmap. The `accurate` staircase is 4,600 CSS pixels wide at
a zoom of 10 and 1,080 rows, which is the worse fault.

**The washed tones may read as weak over the bright disc.** The overlay's own contrast
falls to 51 percent of what it was. → The numbers are in the spec, so a later change moves
a stated value rather than guessing one. The far-view baseline image does not change,
because the zoom fade already draws nothing at the default view.

**The filter may fight the label chooser and swap two labels while one moves.** → The
carried bonus of 1.2 stays, and the filter is bounded, so the weight of a moving label
does not step.

**A crossing of a near line and a far line reads brighter than it should.** → Stated
above. It is a few pixels and it needs both lines in one frame at very different ranges.

**The distance band may hide a grid a user wants at a wide view.** Nothing draws at 12,000
light years or further, and the start view is 60,000. → The band is two constants and the
switch still works, so a user who turns the grid on at a wide view sees it as soon as they
zoom in. The alternative, a grid over the whole galaxy disc, is the fault the user
reported.

**The demo site starts the grid on, so the grid probes read differently through the demo
page.** → `openMap` turns the grid off beside the set clear, so every test that does not
ask for the grid opens the map it opened before.

**The change rewrites a requirement of `flight-markers-and-grid`, which is not archived.**
`openspec validate` reports that the archive would refuse the block until that change is
archived. → `flight-markers-and-grid` is archived first. The proposal says so, and the
reading is expected until then.

**The demo site publishes on every push to `main`, so a bad merge is public at once.** →
The publish needs the check job, and the check job runs the lint, the types, the unit
tests and both builds first.

**The GitHub Pages address adds a base path the browser suite has not used.** → The
Playwright base URL carries the path, and a test reads the built `index.html` for it, so a
wrong base fails in the repository and not on the site.

## Migration Plan

The work has an order, because the later steps are tested against the earlier ones.

1. The library build: `src/index.ts`, `tsconfig.build.json`, `vite.config.lib.ts`, the
   `package.json` fields and the typed `CategoryInput` and `SystemRecordInput`.
2. The demo site build: the base path, `dist-demo/`, `pnpm build:demo-site`, the
   Playwright configuration, the base URL, the relative navigations and the baseline
   scenarios that clear the set.
3. The scene data and the HUD: the category membership rule, the copy buttons and the
   loading image.
4. The renderer: the washed tones and the near fade, then the chosen region views, which
   are re-derived at a zoom where the fade is full.
5. The label filter.
6. The three converters and the dataset catalog, the handle members and the dialog.
7. The workflow file and the documents.

**Order against the other change in flight.** `flight-markers-and-grid` is archived before
this change, because this change rewrites one of its requirements.

**Rollback.** Nothing migrates and nothing is stored, so a rollback is a revert. The
library output is new, so no host depends on it yet. Reverting the workflow file stops the
publish and leaves the last published site up.

## Open Questions

- The package name and the version to release under. The change builds the package and
  does not publish it, so the name can be settled when a release is wanted. It changes no
  spec and no task.
- Whether the demo site should offer a dataset the user gives, by file or by URL. The
  catalog already takes any `load()` a host writes, so this is a later demo page change
  and not a library one.
