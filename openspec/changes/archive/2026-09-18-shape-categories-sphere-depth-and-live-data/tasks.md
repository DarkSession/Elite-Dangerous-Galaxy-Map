## 1. The shapes take categories

- [x] 1.1 Add `primaryCategory`, `secondaryCategories` and an optional `color` to the
      sphere and line input types in [src/scene-data/shapes.ts](src/scene-data/shapes.ts),
      and add the reject reasons `bad-category`, `no-category` and `unknown-category`.
      Verify with new cases in
      [src/scene-data/shapes.test.ts](src/scene-data/shapes.test.ts) that each bad input
      is rejected with the named reason and that a shape naming no category is accepted.
- [x] 1.2 Hold a `drawn` flag and a resolved colour per sphere and per line, and sweep
      them from the category table by the rule "any named category is on, colour from the
      first category that is on". Bump the `version` counter on a sweep that changes a
      flag or a colour. Verify with unit tests that switching a category off hides only
      the shapes that name it, that a shape naming no category still draws, and that a
      shape carrying its own `color` keeps it.
- [x] 1.3 Run the sweep on a change of the shape set, the category table, a category's
      visibility and the shape name filter, and not per frame. Verify with a unit test
      that counts the sweeps over 10 frames with no change and reads 0.
- [x] 1.4 Add `setShapeNameFilter(text)` and `getShapeNameFilter()` to the shape set and
      to [src/app/create-map.ts](src/app/create-map.ts), and export the new types from
      [src/index.ts](src/index.ts). Verify with unit tests that the filter hides the
      shapes whose `name` does not hold the text, that it is case-insensitive, and that
      an empty filter shows them all again.
- [x] 1.5 Add `getShapeInfo(kind, index)` returning `{name, primaryCategory,
      secondaryCategories, centre, reach, drawn}`. Verify with a unit test that it copies
      no line point and that `reach` is the sphere radius for a sphere and half the
      bounding box diagonal for a line.
- [x] 1.6 Make [src/render/shape-pass.ts](src/render/shape-pass.ts) skip the shapes whose
      `drawn` flag is off when it builds its instance buffers, and take the resolved
      colour. Verify with
      [src/render/shape-pass.test.ts](src/render/shape-pass.test.ts) that the instance
      count drops when a category goes off and that the pass still costs three draw calls.
- [x] 1.7 Measure the sweep: add a unit test that fills 1,024 spheres and 4,096 lines with
      four categories each, switches one category, and asserts the sweep takes 1
      millisecond or less.
- [x] 1.8 Measure the sweep in the browser: add the test of the scenario "The sweep holds
      its budget" to [e2e/frame-budget.spec.ts](e2e/frame-budget.spec.ts). It adds 256
      categories, 1,024 spheres and 4,096 lines each naming 4 of them, turns every category
      off, and reads `debug.shapeSweepMs()` after the next frame. It then switches every
      category three more times and reads it again. Verify that the first reading is under
      2 milliseconds and the last is under 1 millisecond. The first sweep runs code the
      engine has not compiled yet, so it costs about five times what the sweeps after it
      cost; run the test with `--repeat-each` and read the spread before you set a bound.
- [x] 1.9 Read the category rules at the pixel: add the browser tests of the scenarios "A
      category that is off removes its shapes", "A shape with no colour follows the first
      category that is on", "A shape with a colour keeps it" and "The two filters are
      separate" to [e2e/shapes.spec.ts](e2e/shapes.spec.ts). The unit tests hold the sweep;
      these read the whole path from the switch to the frame, which the demo sets lean on.
      Verify with `pnpm test:e2e`.
- [x] 1.10 Add the browser test of the scenario "The galaxy behind a sphere takes the whole
      wash" to [e2e/shapes.spec.ts](e2e/shapes.spec.ts): a view with no system in the set,
      a pixel read before and after one sphere is added, and the second reading equal to
      the first mixed with the sphere colour at the sphere's own opacity.

## 2. The category panel takes two tabs

- [x] 2.1 Split the category row in [src/hud/categories.ts](src/hud/categories.ts) into a
      dot button carrying `aria-pressed` and a rest-of-row button carrying
      `aria-expanded`, and remove the separate expand button. Verify with
      [src/hud/categories.test.ts](src/hud/categories.test.ts) that a click on the dot
      switches the category and does not open the list, and that a click on the row opens
      the list and does not switch the category.
- [x] 2.2 Add the **SYSTEMS** and **SHAPES** tabs to the panel header, with one list in
      the document at a time, the shape tab disabled while the map holds no shape, and a
      per-tab open set. Verify with unit tests that the document holds one list, that the
      shape tab is disabled for a map with no shape, and that a switch away and back
      restores the open rows.
- [x] 2.3 Give each tab its own filter text, write it to `setNameFilter` or
      `setShapeNameFilter`, and clear the filter of the tab being left. Verify with unit
      tests that typing on one tab does not filter the other and that the left tab's
      filter is cleared on the map.
- [x] 2.4 Make ALL and NONE act on the shown tab only. Verify with a unit test that NONE
      on the shapes tab leaves every system category on.
- [x] 2.5 Build the shape rows: the shape's name, or `SPHERE 12` / `LINE 7` where the
      shape has none, under the category it names, capped at the shared 200 rows. Verify
      with unit tests that a nameless shape takes the fallback label and that a category
      of 400 shapes shows 200 rows and the "more" line.
- [x] 2.6 Make a click on a shape row fly the camera to twice the shape's reach with no
      change of selection. Verify with a unit test that `flyTo` was called with that
      distance and that `getSelectedSystem()` did not change.
- [x] 2.7 Replace `max-height: 210px` on `.gm-hud__system-list` in
      [src/hud/styles.ts](src/hud/styles.ts) with `max-height: var(--gm-list-cap)`, and
      compute the cap in [src/hud/categories.ts](src/hud/categories.ts) as
      `max(area - rows, 0.5 * area) / openCount`, written on a rebuild, on an open or a
      fold, and from a `ResizeObserver` on the list area. Verify with a unit test of the
      cap function over the three cases and with browser tests that read the rendered
      height with 3 categories of 1,000 systems, with 40 categories, and with a category
      of 2 systems.
- [x] 2.8 Add the 140 ms open and close transition: a wrapper that moves
      `grid-template-rows` from `0fr` to `1fr`, with the capped list inside it, and 0
      duration under `prefers-reduced-motion: reduce`. Verify with a browser test that the
      height changes over two frames with motion on, is final on the first frame with
      reduced motion set, and ends at the same height in all three cases of task 2.7.
- [x] 2.9 Wire the shape lists through [src/hud/categories.ts](src/hud/categories.ts),
      which [src/hud/index.ts](src/hud/index.ts) builds, using only the public handle
      members. Verify that `pnpm lint` passes, which runs the `no-restricted-imports` HUD
      boundary rule, and that
      [src/hud/hud-boundary.test.ts](src/hud/hud-boundary.test.ts) passes.
- [x] 2.10 Move the category switch call sites of [e2e/hud.spec.ts](e2e/hud.spec.ts) onto
      the dot button. [e2e/frame-budget.spec.ts](e2e/frame-budget.spec.ts) keeps its row
      click, which now opens the list, and [e2e/paint-cost.spec.ts](e2e/paint-cost.spec.ts)
      keeps its row locator, which it only waits on. Verify with `pnpm test:e2e` that the
      three files pass.
- [x] 2.11 Add the keyboard and screen reader checks: `aria-pressed` on the dot, the tabs
      and the switches, and `aria-expanded` on the row. Verify with a browser test that
      tabs to each control and operates it from the keyboard.
- [x] 2.12 Measure the panel: add the browser test of the scenario "A full shape set does
      not grow the panel" — 1,024 spheres and 4,096 lines, the panel under 900 elements,
      and the rebuild under 40 milliseconds.

## 3. A sphere reads the markers in front of it

- [x] 3.1 Request `EXT_float_blend` beside `EXT_color_buffer_float` at
      [renderer.ts:304](src/render/renderer.ts#L304) and make the `float` flag the AND of
      the two, because WebGL2 refuses a `MIN` blend into a 32-bit float target without the
      second. Add the range buffer to [src/render/renderer.ts](src/render/renderer.ts): an
      `R32F` texture at the drawing buffer size, cleared to a value above every drawable
      range, resized with the drawing buffer, and created only where that flag is true.
      Verify with [src/render/renderer.test.ts](src/render/renderer.test.ts) that the
      texture is created with that format and freed on `dispose`, that a stub context
      missing either extension takes the fallback, and with a browser test that reads back
      the buffer over two overlapping markers and asserts it holds the nearer range.
- [x] 3.2 Add the marker range draw to [src/render/system-pass.ts](src/render/system-pass.ts)
      as a second `POINTS` draw over the same buffer, with the new `marker-range` shader
      pair and `blendEquation(MIN)`, made only while the shape set holds a shape that
      draws — a sphere **or** a line, because the line step caps itself against the same
      buffer. The shader SHALL compute the marker's own alpha from the same rule the colour
      shader uses and SHALL discard below **0.5**, so only the marker body writes range.
      Verify with [src/render/system-pass.test.ts](src/render/system-pass.test.ts) that the
      draw is made with a sphere present and skipped without one, and with a unit test of
      the threshold against the alpha function `real-systems` exposes.
- [x] 3.3 Move the marker pass ahead of the shape pass in the overlay order, leaving the
      lines after the spheres. Verify with a unit test that reads the recorded call order
      from the stub context and asserts grid, regions, markers, spheres, lines.
- [x] 3.4 Put the depth share into
      [src/render/shaders/spheres.frag](src/render/shaders/spheres.frag): sample the range
      buffer at `gl_FragCoord.xy`, compute `d`, `share` and the capped alpha by the
      formulas in design.md, and take `share = 1` from a uniform where there is no range
      buffer. Verify with a unit test of the share function over the table in the
      `map-shapes` spec: in front gives 0, the centre gives 0.5, behind gives 1.
- [x] 3.5 Cap the line step at an alpha of 0.5 over a marker pixel in
      [src/render/shaders/shape-composite.frag](src/render/shaders/shape-composite.frag),
      reading the same range buffer. Verify with a browser test that runs a line through
      the middle of a marker and asserts the marker keeps at least half of the colour it
      has with the shapes switch off.
- [x] 3.6 Add the browser test that reads the pixel over a marker in front of a sphere,
      inside it and behind it, and compares each with the frame the same view draws with
      the shapes switch off, within 8 of each channel. Verify with `pnpm test:e2e` that
      [e2e/shapes.spec.ts](e2e/shapes.spec.ts) passes.
- [x] 3.7 Add the browser test for the 0.5 cap: place a marker on a sphere's limb and
      assert the marker keeps at least half its own colour. Add the second test that reads
      a pixel 10 CSS pixels from a 40 pixel `glow` marker's middle, where its alpha is
      under 0.5, and asserts that pixel takes the whole wash.
- [x] 3.8 Hold the draw call count: the shape pass stays at three calls and the marker
      pass takes one more only while a shape draws. Check
      [e2e/paint-cost.spec.ts](e2e/paint-cost.spec.ts) and
      [e2e/frame-budget.spec.ts](e2e/frame-budget.spec.ts) still hold their budgets with
      10,000 systems, 1,024 spheres and 4,096 lines.
- [x] 3.9 Check the look baseline in
      [e2e/look.spec.ts-snapshots](e2e/look.spec.ts-snapshots) against the new overlay
      order. **The baseline needs no change**: the view it draws holds no shape, so the
      order change moves no pixel in it, and `e2e/look.spec.ts` passed in full with its
      image comparison. Verified by the browser run, not by reasoning.

- [x] 3.10 Take the size of the range buffer on the first frame that draws a shape, in
      [src/render/renderer.ts](src/render/renderer.ts), and not on the resize of the
      canvas, so a map with no shape allocates no 8.3 MB texture. Verify with the browser
      test that reads `rangeBufferSize()` against the drawing buffer size.

- [x] 3.11 Read both float extensions in
      [e2e/00-renderer.spec.ts](e2e/00-renderer.spec.ts), which every project of the suite
      runs, so Firefox reports the float path as well. The shape tests read the buffer
      itself, and they run in Chromium alone by the design of the suite.

- [x] 3.12 Compile the marker range program on the float path alone, in
      [src/render/renderer.ts](src/render/renderer.ts). `createSystemPass` takes the
      program as `Program | null` and draws no range where it is `null`, so a context with
      no float target compiles no shader it cannot use. Also give `debug.readRange()`
      `null` before the first frame that draws a shape, because the buffer is 2 x 2 until
      that frame and a read of the canvas coordinate would fall outside it.

## 4. The demo shapes take categories

- [x] 4.1 In [scripts/build-demo-systems.mjs](scripts/build-demo-systems.mjs) give each
      UIA sphere the marker category of its list (`pls`, `puls`, `hd_soi`), leave `g_soi`
      with none, and keep each sphere's own material colour. Verify with
      [tests/fixtures/uia.test.ts](tests/fixtures/uia.test.ts) against the committed fixture.
- [x] 4.2 Give each line the categories of its `routes` entry, drop its explicit `color`,
      and give it a `name` that names the line and not its category
      (`<system> to <destination>` for a hyperdiction, the category and table number for a
      waypoint line, the source's name for an Adamastor route). Verify with
      [tests/fixtures/uia.test.ts](tests/fixtures/uia.test.ts) and
      [tests/fixtures/adamastor.test.ts](tests/fixtures/adamastor.test.ts) against the committed expected
      outputs, which this task regenerates.
- [x] 4.3 Regenerate `demo-data/uia.json` and `demo-data/adamastor.json` with
      `pnpm build:demo-data` and verify the counts against the table in the
      `dataset-catalog` spec.
- [x] 4.4 Add the browser test that loads `uia` and reads `getShapeInfo` for every shape:
      53 of 54 spheres name a primary category, `Gamma Velorum` names none, every line
      names one, and no line carries its own colour. Verify with
      [e2e/datasets.spec.ts](e2e/datasets.spec.ts).

## 5. The sixth data set fetches its records

- [x] 5.1 Write the line reader: read a `ReadableStream` of bytes, decode, cut into
      lines, hold one line at a time, read the faction name from the head of each line,
      parse only the wanted lines, and cancel once both are found. Verify with unit tests
      that it stops at the last wanted faction, that it reads the same two factions when
      fed 7 bytes at a time, and that a dump naming neither rejects.
- [x] 5.2 Build the record reducer: one record per `systemId64`, primary category from the
      first faction of the entry's order that names it, the rest secondary, and a
      controlling row winning over a present row inside one faction. Verify with a unit
      test over a fixture whose shared system earns three categories.
- [x] 5.3 Add the `multifaction` sphere converter to
      [scripts/build-demo-systems.mjs](scripts/build-demo-systems.mjs), which reads
      `MapData-multifaction.js` and writes the 48 permit spheres to
      `demo-data/multifaction-spheres.json` with their two categories and no colour of
      their own. Verify with a new `tests/fixtures/multifaction.test.ts` over a committed fixture
      extract.
- [x] 5.4 Add the sixth entry to `DEMO_DATASETS` in
      [src/app/main.ts](src/app/main.ts): label `Canonn Factions`, collection
      `Canonn Research Group`, no `systemCount`, a `load()` that fetches the dump through
      `DecompressionStream('gzip')`, returns the six categories and the records, and
      writes the spheres into `DEMO_SHAPES` before it returns. Verify with a browser test
      that loads it from a fixture and reads `systemCount`, `categoryCount()` and
      `sphereCount()`.
- [x] 5.5 Make the failure paths reject and leave the map as it was: a failed fetch, a
      browser with no `DecompressionStream`, and a dump naming neither faction. Verify
      with browser tests that the promise rejects, the loaded entry and the system count
      are unchanged, and the map draws 10 more frames.
- [x] 5.6 Serve the dump URL from a fixture through `page.route` in
      [e2e/datasets.spec.ts](e2e/datasets.spec.ts) — the sphere file is imported and
      same-origin, so it needs no route — and add the test that blocks every off-origin
      request at start and asserts none was blocked. Verify that `pnpm test:e2e` passes
      with the network unavailable.
- [x] 5.7 Add the frame budget test: serve a 60 MB fixture, reset the animation frame
      interval statistics, load the entry, and assert the longest interval is under 25
      milliseconds, which is `DUMP_WORST_MS` in
      [e2e/frame-budget.spec.ts](e2e/frame-budget.spec.ts).
- [x] 5.8 Show `FETCHED ON LOAD` in the dataset dialog's count line for an entry with no
      `systemCount`, in [src/hud/dataset-dialog.ts](src/hud/dataset-dialog.ts). Verify with
      a browser test that opens the dialog, clicks `Canonn Factions` and reads the line.
- [x] 5.9 Check the entry chunk size against its 254,000 byte bound with
      [tests/main-bundle.test.ts](tests/main-bundle.test.ts), and check the catalog count
      with [tests/demo-site-build.test.ts](tests/demo-site-build.test.ts).
- [x] 5.10 Give the event loop a turn in the line reader of
      [src/app/multifaction.ts](src/app/multifaction.ts) after 8 milliseconds of work,
      through a `MessageChannel` and not a timer, because a read that answers from a
      queue answers in a microtask and the whole file would read in one task. Verify with
      a unit test that counts the tasks the event loop runs while the reader reads with a
      slice of 0.
- [x] 5.11 Read the line break as a byte in the same reader, decode only the head of each
      line, and decode the whole of a line only where its name is one the reader wants, so
      a line it does not want keeps 58 bytes and not 2.33 MB. Verify with unit tests for a
      name longer than the head window and for a name outside ASCII.
- [x] 5.12 Move the inflate and the read to
      [src/app/multifaction.worker.ts](src/app/multifaction.worker.ts): keep the fetch on
      the page, so the browser test still intercepts the request, and move the body of the
      answer to the worker. Read the dump on the page where the browser does not move a
      stream. Verify with the frame budget test, which asserts the read costs no frame.

## 6. Documentation and the full run

- [x] 6.1 Move the package to version 0.3.0 in `package.json`, because `Sphere.color` and
      `Line.color` become optional and a sphere changes what it does to a marker. Verify
      with the unit test that reads the version.
- [x] 6.2 Add `ShapeInfo` and `ShapeKind` to the export list of
      [src/index.ts](src/index.ts) and to the declaration test. Verify with
      [src/index.test.ts](src/index.test.ts) and with the test that type-checks a host
      module against the built declaration.
- [x] 6.3 Run `pnpm build`, read the size of the built entry chunk, and write the reading
      into the `library-package` delta in place of `TO BE MEASURED`. Verify that the
      reading is under the 254,000 byte bound with
      [tests/main-bundle.test.ts](tests/main-bundle.test.ts).
- [x] 6.4 Name the Spansh factions dump and its terms in `THIRD_PARTY_NOTICES.md`. Verify
      with [tests/third-party-notices.test.ts](tests/third-party-notices.test.ts).
- [x] 6.5 Record the decisions in [docs/roadmap.md](docs/roadmap.md): the range buffer,
      the overlay order, the shape categories and the live entry. Verify by reading the
      file back.
- [x] 6.6 Update [README.md](README.md) where it describes the category panel and the data
      sets. Verify by reading the file back.
- [x] 6.7 Run `pnpm lint`, `pnpm build` and `pnpm test` and verify all three pass.
- [x] 6.8 Run `pnpm test:e2e` on its own, with no other Playwright run in flight, and
      verify the suite passes, that the renderer assertion reports hardware and not
      SwiftShader or llvmpipe, and that the map reports the range buffer as live in both
      browsers of the gate, so no measurement came from the `share = 1` fallback.
- [x] 6.9 Run `openspec validate --strict` for this change and verify it reports no error.
