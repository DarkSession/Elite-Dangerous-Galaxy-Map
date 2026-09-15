## 1. The library build

- [x] 1.1 Add `src/index.ts`, which re-exports `createGalaxyMap` and the types the
      requirement "The library build emits a package and no page" lists, and does not
      export `GalaxyMapDebug`. Verify with a unit test that reads the module's exported
      names and asserts the list.
- [x] 1.2 Add `tsconfig.build.json`, which extends the project configuration, sets
      `declaration` and `emitDeclarationOnly` and writes to `dist/types`. Verify by
      running it and reading `dist/types/index.d.ts`.
- [x] 1.3 Add `vite.config.lib.ts`: library mode, entry `src/index.ts`, `formats: ['es']`,
      `outDir: 'dist'`, `publicDir: false` so no file of `public/` is copied into the
      package, code splitting left on, and `gl-matrix` and
      `@elite-dangerous-almanac/core` external by a pattern that also matches their
      subpaths. Set `worker.rollupOptions` as well, because Vite builds a worker through
      that. Verify the build emits the entry chunk, the three worker chunks, the HUD chunk
      and the three font assets, and no HTML file and no file of `public/`.
- [x] 1.3a Add a test that reads every emitted worker chunk for a bare import. Verify it
      fails when `@elite-dangerous-almanac/core/astro/codex-region-lookup` is left external
      in a worker, and passes when the worker bundles it.
- [x] 1.4 Point `pnpm build` at the type check, then the Vite library build, then the type
      emit, in that order, and add `pnpm build:demo-site` for the page build. The Vite
      build empties `dist/`, so the declarations are written after it. Verify both scripts
      run clean from a clean tree and `dist/types/index.d.ts` is still there afterwards.
- [x] 1.5 Give `package.json` `exports`, `types` and `files`, and drop `private`. Verify a
      unit test reads the fields and asserts each named path is in the build output.
- [x] 1.6 Move `tests/main-bundle.test.ts` onto the library entry chunk, with the byte
      bound the library entry asks for, and add the HUD chunk check. Write the first library readings
      into the test and into `specs/library-package/spec.md`, which today carries the page
      build's 152,506 and 27,419. Read them from a fresh build and not from the `dist/` in
      the tree. Verify the test passes and reports both sizes.
- [x] 1.7 Add a test that runs the library build into a temporary directory and asserts no
      `.html` file, no demo system name and no `galaxy-map-ready` text in any emitted file.

## 2. The typed record input

- [x] 2.1 Add `CategoryInput` and `SystemRecordInput` to `src/scene-data/real-systems.ts`,
      with the fields the requirement "The record input is typed" states, each type
      allowing unknown extra fields and `id64` taking a number, a string or a `bigint`.
- [x] 2.2 Change `addCategories` and `addSystems` to take `readonly CategoryInput[]` and
      `readonly SystemRecordInput[]`, on the reader and on the handle. Verify
      `pnpm build` type-checks with no cast inside the library.
- [x] 2.3 Add a type test that compiles a well-formed record and asserts that a record
      with no `primaryCategory`, and one whose `coords` hold strings, fail to compile.
- [x] 2.4 Verify the run-time reader is unchanged: the existing rejection tests still pass
      and a cast array with no name still reports `no-name`.

## 3. The demo site build

- [x] 3.1 Set `base: '/Elite-Dangerous-Galaxy-Map/'` and `build.outDir: 'dist-demo'` in
      `vite.config.ts`. Verify a unit test reads the built `index.html` for the base path,
      and a test runs both builds in turn and asserts neither directory overwrites the
      other.
- [x] 3.2 Move the demo data to `demo-data/`, point `src/app/main.ts` and
      `src/app/demo-systems.test.ts` at the new path, and drop the `import.meta.env.DEV`
      guard that keeps the data out of the build today. Verify the dev server draws the
      set, the unit test passes and the library build holds no record from it.
- [x] 3.3 Point `playwright.config.ts` at `pnpm build:demo-site && pnpm preview` and set
      the base URL to `http://localhost:4173/Elite-Dangerous-Galaxy-Map/`. Verify the
      suite starts and the first test reads `window.galaxyMap`.
- [x] 3.4 Make every navigation in `e2e/` relative: `e2e/helpers.ts` and the direct
      `page.goto` calls in `00-renderer`, `labels`, `systems` and `scene-data`. Verify a
      unit test finds no `page.goto` call that starts with `/`, and a browser test opens a
      view fragment and reads back the view it named.
- [x] 3.5 Make `openMap` in `e2e/helpers.ts` call `clearSystemsAndCategories()` after
      `ready` settles, and take an option that keeps the demo set. Verify a browser test
      reads 0 systems with no option and 212 with it.
- [x] 3.6 Audit the suite for tests that need the demo set and pass the option to those
      alone. About 188 tests read a marker count, a category count or a frame; the 62 of
      `hud.spec.ts` build their own map and are untouched, and the 7 of `labels.spec.ts`
      come through task 3.8. Verify the whole suite passes
      and the far-view baseline image test passes against the committed image with no new
      baseline.
- [x] 3.7 Rewrite the requirement "The demo page loads the Guardian Ruins data set" in the
      places it reaches the tree: the browser suite may now put the set on the map but no
      browser test may select a record of it, because the panel would fetch a thumbnail
      from another host. Verify the search in `e2e/` finds no `ruins.canonn.tech` and no
      such selection, and the blocked-request scenario still passes.
- [x] 3.8 Give the four direct navigators the same start state the helper gives:
      `00-renderer`, `labels`, `scene-data` and the two direct calls of `systems` open the
      demo page with their own `page.goto`, so neither the set clear of task 3.5 nor the
      grid switch-off of task 12.11 reaches them. Route each one through the helper, or
      give its own opener the same two calls. Verify a unit test finds no `page.goto` of
      the demo page in `e2e/` outside a helper that carries the start state.

## 4. A system belongs to every category it names

- [x] 4.1 Change `refreshFlags` in `src/scene-data/real-systems.ts` to set a system's flag
      when any of its categories is on, keeping the colour and the style of the primary
      category. Verify with a unit test over a system in two categories, switching each.
- [x] 4.2 Add a unit test that measures one sweep over 10,000 systems of 4 categories and
      asserts it is under 2 milliseconds.
- [x] 4.3 Change `readSystems` in `src/hud/categories.ts` to bucket a system into every
      category it names. Verify the counts and the lists with a browser test over a system
      in `A` and `B`.
- [x] 4.4 Add the browser scenario that reads the three Guardian Ruins rows and asserts
      the counts add up to more than `systemCount`.

## 5. The copy buttons

- [x] 5.1 Add the copy button beside the system name and in the position field of
      `src/hud/info-panel.ts`, each with the accessible names `Copy system name`,
      `Copy position` and `Copied`.
- [x] 5.2 Write the name as it is, and the position as `x / y / z` in whole numbers with
      no thousands separator, while the panel keeps its separators. Verify with a browser
      test that reads the clipboard after a click on each.
- [x] 5.3 Hold the tick for 1.4 seconds, with one tick at a time and a click on the second
      button moving it. Verify with a browser test that reads both buttons at once and
      again after 1.6 seconds.
- [x] 5.4 Catch a refused clipboard write, show no tick, throw nothing out of the HUD and
      change no selection. Verify with a browser test that replaces the write with one
      that rejects and then draws 10 frames.

## 6. The loading image

- [x] 6.1 Add `loadingImage` to `GalaxyMapOptions` and show the image in the **canvas's
      parent**, not in the label host, which a host may supply as an element of its own.
      Centre it within 1 CSS pixel of the canvas's middle. Verify with a browser test
      that reads the element's box against the canvas's box.
- [x] 6.2 Remove the image when `ready` settles, whether it settles or fails, and on
      `dispose()`. Verify with a browser test on a map whose start load rejects.
- [x] 6.3 Pass the URL through the `safeImageUrl` scheme check, and add no element when
      the options name no image or the URL is refused. Verify with unit tests over a
      `javascript:` URL and over no option.
- [x] 6.4 Name `public/EDLoader1.svg`, which the repository already holds, as the demo
      page's `loadingImage` in `src/app/main.ts`, building the URL from
      `import.meta.env.BASE_URL` so it carries the site's base path, and record the file,
      its source
      `https://edassets.org/static/img/svg/EDLoader1.svg` and its terms in
      `THIRD_PARTY_NOTICES.md`, saying that ED Assets states no licence on it. Verify the
      demo page shows the loader while the map starts, the built site serves it under its
      own base path, and the blocked-request browser test records no request to another
      host.

- [x] 6.5 Keep the picture at the size its own file names, and set no width, no height
      and no fit in the library. Give the repository's copy of `EDLoader1.svg` the
      `width="170"` and `height="170"` attributes its root element lacks, because an
      `<img>` element reads no size from the file's `style="height:170px"` and then grows
      the picture with the box that holds it, which measured 640 by 640 in a 1280 by 720
      window. Record the one change in `THIRD_PARTY_NOTICES.md`. Verify with a browser
      test that reads 170 by 170 in two window sizes.

- [x] 6.6 Answer the look gate against the mockup in `.design/`: label the position field
      `POSITION`, which is what the mockup reads and no spec names a unit for; give the
      last field of an odd count both columns of the grid, so three fields leave no empty
      cell; and give the dataset field the accent border while the dialog is open, which
      the dialog marks with `aria-expanded`.

## 7. The region boundary: the wash and the near fade

- [x] 7.1 Set the washed tones and the opacity in `src/render/region-pass.ts`: core
      `(0.505, 0.658, 0.853)`, outline `(0.125, 0.172, 0.267)`, opacity `0.42`. Verify
      with a unit test that asserts the contrast falls to 51 percent of what it was.
- [x] 7.2 Change the coverage target from `R8` to `RG8` and keep the `MAX` blend on both
      channels. Verify the pass still draws, the join test still passes, and the frame
      budget scenarios still hold at a 20,000 light year view with a full set.
- [x] 7.3 Pass the two endpoint camera distances from `regions.vert` to `regions.frag`,
      work out the near fade at the pixel's nearest point on the segment, and write it to
      the green channel. Verify with a unit test over the fade function: 0 at 200 light
      years and below, 1 at 1,500 and above, smooth between.
- [x] 7.4 Multiply the two channels into the alpha in `region-composite.frag`. Verify with
      the browser scenario that reads the overlay's contribution at 1,500, 500 and 150
      light years in both modes.
- [x] 7.5 Add a chooser to `tests/region-views.ts` that finds a cursor and a yaw for which
      one chain runs from the lower edge of the frame to the cursor, at a pitch of 5
      degrees, and export the view it found from `e2e/region-views.ts`. Verify
      `tests/region-views.test.ts` re-runs the search and reads the same constant.
- [x] 7.5a Add the browser scenario that opens that view and asserts the contribution at
      the lower edge is below a third of the contribution at the cursor, on the same chain.
- [x] 7.6 Verify the label overlay does not take the near fade: the existing label
      scenarios pass at a close zoom.
- [x] 7.7 Re-derive the chosen corner views in `tests/region-views.ts`: `findSharpCorner`
      and `findTracedCorner` hard-code a zoom of 500 light years, where the near fade now
      draws nothing, so move both to **1,600** and raise the crossing search's lower bound
      from 600 to 1,500. Verify `tests/region-views.test.ts` passes.
- [x] 7.7a Write the new constants into `e2e/region-views.ts`: `SHARP_CORNER` and
      `TRACED_CORNER` gain the new distance, `lightYearsPerPixel` and chosen vertex.
      `VERTICAL_CROSSING` sits at 1,875, which is above the fade band, so verify it is
      unchanged. Rewrite the doc comments of `findSharpCorner`, `findTracedCorner` and
      `findPointNearBothSets`, which name the 500 and 10 light year zooms the fade removes.
- [x] 7.7b Change `CLOSE_DISTANCES` in `e2e/regions.spec.ts` from `[1500, 500, 10]` to the
      two distances the scenario "The boundary still draws at the closest zoom" now names,
      4,000 and 1,500. Verify that scenario passes in both modes.
- [x] 7.7c Re-run the four-CSS-pixel width scenario and the two join scenarios against the
      new constants, and verify they pass with the washed tones and the near fade.
- [x] 7.8 Record the reversal of the phase 3.1 decision in `docs/roadmap.md`.

## 8. The label filter

- [x] 8.1 Add `anchorStep` and `filterAnchor` to `src/app/labels.ts`: read the screen gap
      between the carried plane point and the frame's target, take the step
      `min(20, max(min(gap, 0.4), gap * 0.5 * min(1, gap / 48)))`, and scale the plane step
      until its screen move is that figure. Verify with unit tests on the knee, the cap
      and the floor.
- [x] 8.2 Replace the hold in `labelCandidates` with the filter, dropping a carried point
      that no longer resolves to its region or no longer projects inside the frame.
      Verify with a unit test that a dropped point takes the target whole.
- [x] 8.3 Add the browser scenario that pushes a label to the frame edge, brings the
      region back into full view, and asserts the label reaches the region's middle.
      The bound is the spec's own: within 8 CSS pixels of the region's mean, and no frame
      moves the label more than the 20 CSS pixel cap. The first build moved 8 percent of
      the gap a frame under a 4 pixel cap and measured 368 ms to 20 pixels, 551 ms to 8
      and 835 ms to 2, which the owner read as a crawl. Half the gap under a 20 pixel cap
      brings a 128 pixel gap inside 2 pixels at frame 9, which is 150 ms.
- [x] 8.5 Answer the owner's second reading: taking each frame's target whole makes the
      labels jump, because the target itself steps as the sample grid slides. Measured
      over a slow pan across the galactic centre, the target of `Izanami` moves 48 CSS
      pixels in one frame where the filter moves the label 19.8. Keep the filter, and hold
      its cost to the cap.
- [x] 8.6 Answer the owner's third reading: the labels still jump while the camera moves.
      Measure what a person reads as a jump, which is the change of the label's screen
      step from one frame to the next. A flat half-gap step gives 1.0 CSS pixels in a
      middle frame of a 30 light year drag and 3.0 in the worst tenth. Make the speed fall
      with the gap below the 48 pixel knee, which leaves every real move at the speed it
      had. The measured figures are 0.45 and 1.3.
- [x] 8.7 Answer the owner's fourth reading: less, but still jumping. The speed curve
      alone cannot go further, because the 8 to 48 pixel band is both the noise and the
      last part of every relocation. Add `smoothTarget` and a second map in `LabelMemory`,
      so the anchor follows a target that already moves smoothly: 0.15 of the gap a frame,
      the target taken whole above a 120 pixel move, and the carried point kept where the
      smoothed one falls on another region. Add unit tests for the three rules, and one
      over two drags that bounds the change of step at 0.2 and 0.7. The measured figures
      are 0.09 and 0.36 on the slower drag and 0.16 and 0.67 on the faster one, with the
      pushed label unchanged at 217 milliseconds.
- [x] 8.4 Verify the settled-anchor bound still holds: a camera turn of 0.1 degrees moves
      the anchor by more than nothing and by less than 8 CSS pixels.

- [x] 8.8 Answer the owner's reading of the requirement: a label belongs at the centre of
      its region, and moves to the visible part only where the centre has no room. Add
      `regionTarget`, which takes `Region.centroid` while it sits on its region and
      projects inside the frame with the 48 pixel label inset, and the frame's own samples
      otherwise. A centroid is a fixed point of the galaxy, so a label on it does not move
      over the map at all. Verify with three unit tests: 18 of 20 labels of a whole galaxy
      view take the centroid to the last digit, a label whose centre has no room takes a
      point on its own region inside the frame, and over a drag the plane point of a label
      on its centre is the same number in two frames in a row.

- [x] 8.9 Answer the owner's two follow-ups: the label box must not touch the edge of its
      region, and a displaced label moves too far. Add `fitInsideRegion`, which moves the
      target until the six points of the box that matter sit on the region. Replace the
      plane-space fallback of `regionTarget` with a screen-space ring search out from the
      projection of the centroid, stopped at 96 pixels while the centre is in the frame.
      Verify with two unit tests: at most 2 of 12 boxes cross their region edge over four
      views, and the worst displaced target sits 4.7 CSS pixels from its centre.

- [x] 8.10 Answer the owner's reading that a zoom still jumps: make a zoom read like a
      drag. Measure how far each label moves from the projection of its own region centre
      from one frame to the next, which separates the label moving from the map moving.
      Remove the gate that drops a carried anchor for leaving its own region, and give the
      frame gate a quarter of the frame of margin on each side, so a notch keeps the
      anchor and
      `filterAnchor` walks it back while a camera jump still drops it. Hold the drawn anchor inside the viewport and not inside the
      48 pixel inset, so a label at the edge slides with its region rather than sitting
      still while the map moves. Verify with a unit test over a drag, over 28 wheel notches
      of 15 percent, and over the same notches held down with no still frame between them.

- [x] 8.11 Fix the two browser tests the change broke. Hold the centre rule to a centroid
      that projects inside the frame, because holding one that is far outside inside the
      inset gives a corner of the frame; outside it the frame's own samples answer. Solve
      the anchor step for the share that gives the wanted screen move, correcting up as
      well as down, because the projection near the camera is strongly not linear and a
      downward-only correction makes the label crawl. Verify with two unit tests: the label
      of the region under the camera sits mid-frame at a distance of 10, and the label is
      within 8 CSS pixels of its target 25 frames after a jump from 640 to 10.
- [x] 8.12 Make the target smoothing a filter and not a gate. Grow the share of the gap
      the smoothed target takes with the screen gap, as the cube of the gap over 120 CSS
      pixels, because the gate held a real move of 70 pixels to 0.15 of the gap a frame
      and the label crawled. Verify that the share reads 0.15 at a gap of 4 pixels and 1
      at 120, that the drift measure of a drag, of wheel notches and of a held wheel does
      not grow, and that the browser brings a pushed label within 8 CSS pixels of the
      middle of its region inside 400 milliseconds.
- [x] 8.13 Let the star pass picture test settle the labels before it compares its two
      pictures. The test holds the camera still and compares two pictures of one scene,
      and a label that still walks after a camera jump differs between them. Add
      `settleLabels` to the browser helpers, which waits until the label positions hold.
- [x] 8.14 Answer the implementation review. Return the solved step from `filterAnchor`
      where no shorter step stays on the region, because the code returned the linear
      first guess and moved the anchor 89 CSS pixels against a cap of 20. Hold the
      carried target and the carried anchor to the one reach the code has, and correct
      the three places that still read one frame. Make `settleLabels` throw on its
      timeout, so a picture test reports why it failed. Tighten three assertions that
      passed figures far worse than the ones the spec states. Verify with a unit test
      that drives the step off its region under a projection that is not linear. Cut
      `NEAR_RADII` to the four radii the only caller can reach, and correct the four doc
      comments that no longer read as the code does: the pass count of the step solver,
      a leftover line over `nearFrame`, the share of `TARGET_SHARE`, and the search that
      `regionTarget` does not make for a centre outside the frame. State the rings and
      their coarseness in the spec, and record the `MAX` blend of the two overlay
      channels as a trade-off in the design.

## 9. The three demo data sets

- [x] 9.1 Split `scripts/build-demo-systems.mjs` into one exported converter per source,
      with the fetch and the file write in the entry part alone. Verify the Guardian Ruins
      converter test still passes over its committed fixture.
- [x] 9.2 Add the Guardian Structures converter: one record per system, the first site
      type as `primaryCategory` and the rest as `secondaryCategories`. Verify the
      conversion rules with a committed fixture extract, as the Guardian Ruins converter
      does, and verify the 163 systems and 10 categories against the committed
      `demo-data/guardian-structures.json` that the entry part writes. The repository
      commits no dump.
- [x] 9.3 Add the Notable Systems converter, with the `html` field turned into plain text:
      tags removed, character references decoded, paragraphs joined by a blank line.
      Verify with a fixture test that the description holds no `<` or `>` and holds the
      decoded `&`.
- [x] 9.4 Write the three files into `demo-data/`, and verify every record each converter
      emits passes `addSystems` with no rejection.
- [x] 9.5 Record the two new Canonn sources in `THIRD_PARTY_NOTICES.md`. Verify the
      notices unit test reads `Guardian Structures`, `Notable Systems` and `EDLoader1.svg`
      beside the four names it reads today.

## 10. The dataset catalog

- [x] 10.1 Add `src/app/datasets.ts`: the catalog reader with the drop reasons `no-id`,
      `no-load` and `duplicate-id`, and the 256 entry cap. Verify with a unit test over
      five entries that reads two kept and three reported.
- [x] 10.2 Add `datasets` and `dataset` to `GalaxyMapOptions`, and `getDatasets`,
      `getLoadedDataset`, `loadDataset` and `onDatasetChange` to the handle. Verify with a
      unit test that `getDatasets` carries no `load` function.
- [x] 10.3 Make `loadDataset` call `load()`, then `clearSystemsAndCategories()`, then
      `addCategories` and `addSystems`, and clear the selection and the name filter.
      Verify with browser tests on a good load and on a rejected one, and measure a switch
      of a full 10,000 system set against the 40 millisecond budget.
- [x] 10.4 Add the load counter so a later call wins and an earlier one rejects as
      cancelled. Verify with the browser scenario over a slow load and a fast one.
- [x] 10.5 Load one set at start, from `dataset` or the first entry, and settle `ready`
      whether or not it succeeds. Verify with a browser test whose start load rejects.

## 11. The dataset field and dialog

- [x] 11.1 Add the dataset field to `src/hud/top-bar.ts`, beside the region name and not
      in place of it, and only when the catalog holds an entry. Verify with the browser
      scenario over a map with a catalog and one without.
- [x] 11.2 Add `src/hud/dataset-dialog.ts`: the filter, the list grouped by `collection`
      with an `OTHER` group, the 120 row cap and the detail pane. Verify with browser
      tests on the filter and on 130 entries over 3 collections.
- [x] 11.3 Add **cancel** and **load dataset**, with `CURRENTLY LOADED` on the loaded
      entry and no second load while one runs. Verify with browser tests on each button.
- [x] 11.4 Hold the focus in the dialog, give it back to the dataset field on close, and
      put the dialog first in the `Escape` order: dialog, then lightbox, then selection.
      Verify with browser tests on the focus, on the tab order and on the two-step
      `Escape` with a dialog open and a system selected.
- [x] 11.5 Verify the dialog calls no `load()` to fill itself: a browser test counts the
      calls after opening, filtering and clicking each entry.
- [x] 11.6 Give the demo page the three-entry catalog. Verify the browser scenario that
      loads each set in turn and reads 212/3, 163/10 and 16/4.
- [x] 11.7 Verify `src/hud/` still passes the import rule: it reads the four handle
      members and imports nothing from `src/render/`, `src/scene-data/` or `src/camera/`.

## 12. The coordinate grid

- [x] 12.1 Add `onGridChange(fn)` to the handle in `src/app/create-map.ts`, beside
      `onSelectionChange`. Call every listener inside `setGridVisible`, which is the one
      member the HUD switch calls as well. Return an unsubscribe. Verify with a unit test
      that a listener runs on each move, does not run when the switch is set to the value
      it already holds, and does not run after it unsubscribes.
- [x] 12.2 Add the camera distance band to `src/render/grid-pass.ts`:
      `GRID_NEAR_FULL_LY = 4000`, `GRID_FAR_NONE_LY = 12000` and a pure
      `gridVisibility(distance)` that smooth steps between them. Multiply it into every
      level's alpha through one uniform in `grid.frag`. The band reads 1 at 4,000 light
      years and at every nearer zoom, and 0 at 12,000 and further. Verify with unit tests at
      3,000, 4,000, 8,000, 12,000 and 60,000 light years.
- [x] 12.3 Skip the draw when `gridVisibility` gives 0, so the three probes read what they
      read for a grid that is off: no vertices, no spacing and no levels. The comment at
      `src/render/renderer.ts` that states that invariant stays true and does not change.
      Report the band in the alpha of `gridLevels()`, so the probe reads the alpha the
      frame holds. Verify with a unit test and with a browser test that reads all three
      probes at 3,000 and at 60,000 light years, and the alpha of the **10,000** light
      year level at 8,000 and at 4,000, where the first is half the second: 0.225 against
      0.45. The level is not the 1,000 light year one, which this task first named: that
      level measures 234 CSS pixels at 4,000 light years and 117 at 8,000, both inside the
      screen fade band, so its screen fade moves with the camera band and its alpha reads
      0.3305 and then 0.1059. The 10,000 light year level sits above the 400 pixel
      saturation at both zooms, so the band alone moves it.
- [x] 12.4 Re-derive the two browser scenarios the band empties, as task 7.7 re-derives the
      region views:
      - `e2e/grid.spec.ts` "draws three vertices in one call at every zoom" reads 10, 1,000
        and 120,000 light years. Move the last reading inside the band, and add a reading at
        120,000 that asserts 0 vertices, 0 spacing and no levels.
      - `e2e/grid.spec.ts` "stops at the model bounds" runs at 120,000 light years, where
        nothing now draws. Move it to 3,000 light years, which is inside the band and not on
        its endpoint. The cursor clamp still puts the cursor on the upper `x` bound. One CSS
        pixel covers about 3.2 light years there, against about 128 at 120,000, so the
        tolerance of 600 light years becomes **30**, about nine CSS pixels. The comment in
        that test names 192 light years for one pixel at 120,000; the reading is 128, so
        correct it or drop it with the old view.
      The `coordinate-grid` delta already holds both readings, and it amends the prose of
      "The grid draws in one call of three vertices", which read "whatever the zoom
      distance": a closed band draws no call at all.
- [x] 12.5 Add a browser test that reads the drawn pixels at the start view of 60,000 light
      years with the grid on and with it off, and verify the two frames hold the same
      pixels, so a wide view carries no grid at all.
- [x] 12.6 Carry the model bounds in `GridLabelFrame` and drop a crossing that falls outside
      them on the game x or z axis, as `grid.frag` already discards such a fragment. Verify
      with a unit test that the sweep places no label past 50,015 on x or 75,895 on z, and
      with a browser test at the upper x bound at a zoom of 1,000 light years and a pitch of
      89 degrees, where the crossing at 51,000 projects inside the frame: no label names an
      x above the bound, and one names 50,000.
- [x] 12.7 Add `GRID_LABEL_MIN_ALPHA = 0.09` and drop a crossing whose level does not read
      there. Work out the level's drawn alpha at the crossing: project the crossing and the
      two points a small step along the game x and z axes, invert the 2 by 2 matrix they
      make to get the light years each axis covers in one CSS pixel, take the greater of
      the two readings, read the level's base alpha and screen fade from it, and multiply by
      `gridVisibility(distance)`, which `GridLabelFrame` carries. Keep the crossing only
      when the reading holds the floor. 0.09 is what a level gives at 24 CSS pixels with the
      band open, the middle of the fade band; the floor of 8 CSS pixels is where the alpha
      reaches 0. The step is small and not one spacing: a gap over a whole spacing is a
      secant, and at a pitch of 5 degrees and a zoom of 3,000 light years it reads about
      144 CSS pixels where the shader reads 1.4. Verify with unit tests: a crossing whose
      two readings are both under 24 CSS pixels is dropped; one whose x lines are compressed at a grazing pitch but whose z gap
      holds keeps its label; and at 11,500 light years, where the label level still measures
      813 CSS pixels but the band reads 0.011, the sweep places no label.
      Import `gridLevelAlpha` and `gridVisibility` from `src/render/grid-pass.ts` rather
      than copying 0.18, 8 and 40 into `src/app/`, so one module owns the alpha rule. No
      lint rule forbids the import; correct the header comment of `src/app/grid-labels.ts`,
      which says one does. Verify with a unit test that the gate's reading equals
      `gridLevelAlpha` times `gridVisibility` at the same spacing and distance.
- [x] 12.8 Add a browser test at 3,000 light years that reads each placed label's position,
      reads the drawn pixel there with the grid on, and verifies every label sits on a lit
      pixel and the count stays under `MAX_GRID_LABELS`. Add a second reading at 11,500
      light years, inside the band, and verify the overlay holds no label there.
- [x] 12.9 Add the grid field to `src/app/url-view.ts`, keeping every signature the existing
      tests read:
      - `formatViewFragment(view, grid)` takes a second argument and writes `&g=1` or
        `&g=0` only when it is a boolean, so a call with one argument still gives
        `c=0,0,0&d=30000&p=35&y=0`, which `src/app/url-view.test.ts` asserts.
      - a new `parseGridFragment(fragment)` gives `true`, `false`, or null for a fragment
        that names no readable `g`.
      - `createFragmentWriter` takes an optional `grid()` reader in its options and calls it
        at each write. `parseViewFragment` does not change.
      Verify with unit tests over the format with and without the argument, the parse of
      `g=1`, `g=0`, `g=x` and a fragment with no `g`, and one write of the writer.
- [x] 12.10 Start the demo page with the grid on in `src/app/main.ts`: pass `grid: true`
      unless `parseGridFragment` says false, pass the grid reader to the fragment writer,
      and call `writer.schedule()` from `map.onGridChange`. Read the field in the
      `hashchange` handler as well, beside the view it already reads, and leave the switch
      where it is when the fragment names no `g`. Verify with browser tests that a fresh
      load draws the grid, that `g=0` does not, that the HUD switch writes the field within
      one 500 ms write, and that a `hashchange` to `g=0` turns the grid off.
- [x] 12.11 Turn the grid off in `openMap` in `e2e/helpers.ts`, beside the set clear of task
      3.5, and keep it on under the option that keeps the demo set. Verify the grid
      scenarios read the library default, and run `pnpm test:e2e e2e/grid.spec.ts`.

## 13. The pipeline

- [x] 13.1 Add `.github/workflows/` with the check job: Node 22, pnpm from
      `packageManager`, a frozen lockfile install, then the lint, the type check, the unit
      tests, the library build and the demo site build, in that order. Pin every action to
      a commit SHA with its version in a comment. Verify a unit test reads every `uses:`
      line and asserts a 40 character SHA.
- [x] 13.2 Write the comment that says why the workflow does not run Playwright, and say
      the same in `README.md`. Verify a unit test asserts no Playwright command is in the
      file.
- [x] 13.3 Add the publish job: on a push to `main` alone, needing the check job, with
      `contents: read`, `pages: write` and `id-token: write`, and one concurrency group.
      Verify with unit tests over the condition and the permissions.
- [x] 13.4 Upload `dist-demo/` as the Pages artifact and deploy it. Verify a unit test
      reads the uploaded directory and matches it with the demo site build's `outDir`.
- [ ] 13.5 **After the merge**: open the published address once the workflow has run on
      `main`, and verify the map draws, the HUD shows and the dataset field reads
      `Guardian Ruins`. This task cannot close before the merge, and it is the only one
      that cannot.

## 14. The documents and the close

- [x] 14.1 Rename the existing `build:demo` script, which converts the data, to
      `build:demo-data`, so it is not read as the site build `build:demo-site`. Verify no
      file still calls the old name.
- [x] 14.2 Update `README.md`: the three build scripts, the library entry point, the
      `datasets` option, the `loadingImage` option, the local browser gate, the URL
      fragment format, which gains the `g` field, and the coordinate grid default, which
      the published site now starts on while the library keeps it off.
- [x] 14.3 Update `docs/roadmap.md`: phase 5 as done, this phase recorded, the phase 3.1
      reversal cross-referenced from task 7.8, and the phase 4.1 grid facts the distance
      band and the two label gates change.
- [x] 14.4 Verify the archive order: `flight-markers-and-grid` is archived before this
      change, because this change rewrites its requirement "The demo page loads the
      Guardian Ruins data set". Until then `openspec validate` reports that the archive
      would refuse that block, which is expected.
- [x] 14.5 Run `pnpm lint`, `pnpm build`, `pnpm build:demo-site`, `pnpm test` and
      `pnpm test:e2e`, and verify every one is clean before the implementation gate.
