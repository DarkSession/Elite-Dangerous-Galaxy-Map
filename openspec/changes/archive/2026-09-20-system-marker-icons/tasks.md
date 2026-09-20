## 1. The dependency and the vectors

- [x] 1.0 CLEARED. `@elite-dangerous-almanac/core` 0.2.16 is published and carries the
      `exports` row `"./assets/*": "./assets/*"`, which answers
      https://github.com/Elite-Dangerous-Almanac/Almanac-Core/issues/66. Checked against the
      published tarball on 2026-09-20: `import.meta.resolve` answers a path for each of the
      16 vectors instead of throwing `ERR_PACKAGE_PATH_NOT_EXPORTED`; the directory holds 16
      files of 11,909 bytes; each root `color` attribute equals its `GALAXY_MAP_MARKERS`
      record; and the four `astro` leaves keep their exports and their values against 0.2.8,
      with codex region 31's name the one difference and `findCodexRegionAt` equal at 3,721
      sampled points.
- [x] 1.1 Raise `@elite-dangerous-almanac/core` to 0.2.16 in
      `packages/galaxy-map/package.json` with `pnpm --filter @elite-dangerous-almanac/galaxy-map add @elite-dangerous-almanac/core@0.2.16`.
      Verify `pnpm-lock.yaml` holds 0.2.16, that `pnpm-workspace.yaml` is untouched, and
      that `pnpm test` and `pnpm lint` pass on the bump alone, which covers the four
      `astro` leaves the map already reads. 0.2.15 renames codex region 31 to
      `The Formidine Rift`; check that no test and no label constant holds the old string,
      and say so in the change summary.
- [x] 1.2 Narrow the external rule in `packages/galaxy-map/vite.config.ts` from
      `/^(gl-matrix|@elite-dangerous-almanac\/core)(\/.*)?$/` to
      `/^(gl-matrix|@elite-dangerous-almanac\/core)(\/(?!assets\/).*)?$/`, and say in the
      comment above it why `assets/` is the exception. Verify `pnpm build` still leaves the
      four `astro` leaves and `galaxy-map/markers` as bare imports of the emitted
      JavaScript, which `tests/main-bundle.test.ts` already asserts, and extend that test to
      assert that no `@elite-dangerous-almanac/core/assets/` specifier survives into an
      emitted file.
- [x] 1.3 Add `tests/marker-icon-catalogue.test.ts`: read `GALAXY_MAP_MARKERS` from
      `@elite-dangerous-almanac/core/galaxy-map/markers`, which is the leaf the source
      imports, and the symbol table of `src/scene-data/marker-icons.ts`, and assert the
      symbol sets are equal and the set is not empty. That is what fails the day the
      catalogue grows a symbol the 16 imports do not carry. Assert as well that each
      vector's root `color` equals its record's `color` without case, by resolving
      `@elite-dangerous-almanac/core/assets/galaxy-map/<symbol>.svg` with
      `import.meta.resolve` and reading the file: the glyph's colour comes from the vector
      and the arrow's from the catalogue, so the two values need one assertion that they
      agree. Verify the test passes and that it fails when one import is removed.
- [x] 1.4 Name the fifth leaf, `galaxy-map/markers`, and the vectors the build emits in
      `packages/galaxy-map/THIRD_PARTY_NOTICES.md`, under the sections the file already
      holds: the package `@elite-dangerous-almanac/core`, its version, and the path
      `assets/galaxy-map/` inside it. Correct the almanac link on line 18 of that file at
      the same time: the repository moved to
      `https://github.com/Elite-Dangerous-Almanac/Almanac-Core`, which is the URL the
      published package's own `repository` field now carries. Verify `pnpm test` passes,
      which runs `tests/third-party-notices.test.ts`, and extend that test to assert the new
      statements are present.

## 2. The catalogue module

- [x] 2.1 Write `packages/galaxy-map/src/scene-data/marker-icons.ts`: 16 static imports of
      `@elite-dangerous-almanac/core/assets/galaxy-map/<symbol>.svg?url&no-inline`, one per
      catalogue symbol, a `ResolvedIcon` of `{ url, color }`, the symbol table built from
      `GALAXY_MAP_MARKERS` and those URLs, `MAX_ICONS = 4`, and `readIcons(value, safeUrl)`
      returning the resolved list or a reject reason. Verify a new `marker-icons.test.ts` covers a symbol read
      without case and without spaces, an unknown symbol, a host entry with and without a
      colour, a colour outside 0 to 255, a fifth entry, a non-array `icons`, and an entry
      that is neither a string nor an object.
- [x] 2.2 Assert in that same test that every catalogue symbol resolves to a non-empty URL,
      so a build that emitted no vector fails the suite rather than resolving every symbol
      to `undefined`.

## 3. The reader

- [x] 3.1 Add `icons` to `SystemRecordInput` and `RealSystem` in
      `packages/galaxy-map/src/scene-data/real-systems.ts`, add `bad-icon` and
      `unknown-icon` to `RejectReason`, and call `readIcons` after the existing field
      checks so an earlier fault still reports its earlier reason. Verify
      `real-systems.test.ts` covers each reject reason, the order of the kept icons, an
      empty `icons`, a missing `icons`, and that a rejected record raises neither the count
      nor the system box.
- [x] 3.2 Re-export the icon types from `packages/galaxy-map/src/app/create-map.ts` and
      `packages/galaxy-map/src/index.ts`, beside `SystemImage`, and add both names to
      `PUBLIC_TYPES` in `tests/main-bundle.test.ts`. Verify `index.test.ts` passes, which
      asserts the barrel's exports by exact equality, and that `pnpm build` type-checks.
- [x] 3.3 Add a type test that a record with `icons: ['titan', { url: '/a.svg', color: [1, 2, 3] }]`
      compiles and that an object entry with no `color` does not, beside the existing
      record input type tests.

## 4. The overlay

- [x] 4.1 Add the icon geometry to `packages/galaxy-map/src/app/markers.ts`:
      `ICON_CSS_SIZE = 28`, `ICON_GAP_CSS = 2`, `ARROW_WIDTH_CSS = 8`,
      `ARROW_HEIGHT_CSS = 5`, `MAX_ICON_STACKS = 32`, and two pure functions —
      `iconBottomCss(centreY, markerCss, index, selected)` and
      `arrowApexCss(centreY, markerCss, selected)` — that carry the table in design.md.
      Verify `markers.test.ts` checks both against the stated offsets at a marker size and
      for the selected and unselected cases.
- [x] 4.2 Build the icon element and the arrow element: an `<img>` with `alt=""`,
      `pointer-events: none`, a black plate and a fixed 28 px box, and a `<div>` whose CSS
      border triangle gives the 8 by 5 shape in the icon's colour. The frame writes each
      one's stacking level, and both go in the stack layer. Verify `markers.test.ts`
      checks the built elements' attributes and the border widths.
- [x] 4.3 Move the candidate sweep of `MarkerOverlay.update` out of its `if (namesOn && count > 0)`
      branch so it runs when **either** switch is on, and offer each keeper only where its
      own switch is on. The name switch defaults off and the icon switch defaults on, so a
      sweep left inside that branch would draw no icon on any map that did not touch the
      name switch. Then place the stacks: a second `createNearestKeep(32)` over that sweep,
      the two element pools, the record order lowest first, the arrow under the lowest icon
      alone, and the 28 px lift for the selected system. Verify `markers.test.ts` covers
      icons-on with names-off, and that the overlay adds no element a frame before it did
      not need, by counting `createElement` calls over two frames.
- [x] 4.3b Add the no-icon fast path: `RealSystemSet` carries a count of the records that
      hold at least one icon, raised in the reader, and the placement is skipped where the
      count is zero. That is what keeps a set with no icon from paying the sweep it does not
      pay today, now that the icon switch defaults on. The count may be **conservative and
      never optimistic**: an over-report costs the optimisation alone and the icons still
      draw, while an under-report hides every icon on the map with no error and no
      rejection. `real-systems.ts` has a replace path that raises `replaced` and two clear
      paths that call `slotOf.clear()`; leaving the count high on a replace is safe, and
      lowering it there is not. Verify with a `markers.test.ts` test over a fake
      `RealSystemSet` that counts reads of `positions` and `system(index)`: with names off,
      the icon switch on, no hover, no selection and no record holding an icon, the count is
      zero; when one record is given an icon, it rises above zero and the stack draws. The
      hover and the selection are excluded because they place themselves before the sweep
      and read a position of their own. The second half is the
      control, so the first cannot pass because the overlay stopped sweeping at all.
- [x] 4.4 Add `iconCount()` and `arrowCount()` to `MarkerOverlay`, as `labelCount()` already
      is, so the browser tests read the overlay without querying the DOM by class alone.

## 5. The switch and the handle

- [x] 5.1 Add `setSystemIconsVisible(on)` and `areSystemIconsVisible()` to the handle in
      `packages/galaxy-map/src/app/create-map.ts`, and the `systemIcons` option, defaulting
      to true for anything that is not the boolean `false`. Verify `create-map.test.ts`
      covers the default, `false`, and a string value.
- [x] 5.2 Add the **System icons** switch to
      `packages/galaxy-map/src/hud/options-panel.ts`, between **System names** and
      **Coordinate grid**, and the `systemIcons` name to `lockedOptions`. Verify
      `options-panel.test.ts` covers the switch order, the open state, the lock, and that
      locking all five drops the panel on a map with no nebula source.
- [x] 5.3 Update the eight HUD tests already in the tree that enumerate the switches, so a
      sixth switch does not fail them as a mystery at task 9.1. In `e2e/hud.spec.ts`:
      "the panel holds a fifth switch with a nebula source" expects
      `['galactic-regions', 'system-names', 'system-icons', 'coordinate-grid', 'shapes', 'nebulae']`
      and is renamed to "sixth"; "the four names leave the nebulae switch" is renamed to
      "five names", because its body takes five;
      "a locked option draws no switch" now expects
      `['galactic-regions', 'system-names', 'system-icons']`; "every switch locked drops the
      panel" locks five names; "the four names leave the nebulae switch" becomes five names;
      the two ignored-lock-list tests count five switches; "the nebulae switch locks with
      the rest" locks six names, because the unlocked icons switch otherwise keeps the panel
      alive; and "a panel of fewer switches still reports each state" steps through three
      switches, not two. Verify each edit against the updated `map-hud` scenarios rather
      than against the old counts.
- [x] 5.4 Correct the three stale comments in `e2e/hud.spec.ts` that count switches — "no
      fifth switch", "the fifth switch follows the fourth one", and the `openHud` doc
      comment that reads "the options panel carries the fifth switch" — to sixth and fifth.
      The first two assertions still pass, because **System icons** goes in before
      **Coordinate grid** and leaves the **Nebulae** switch after **Shapes**. Verify by
      running that spec file.

## 6. The demo

- [x] 6.1 Give **one** committed set its icons, from a short explicit table in
      `apps/demo/scripts/build-demo-systems.mjs` and not a hand edit of the JSON: the
      built-in symbols of the systems that really carry them. The set carries no host
      icon, which the requirement "The demo site shows the icon stack" states, and
      `e2e/system-icons.spec.ts` covers that form instead. The set is `thargoid-war`, the
      seventh entry of the catalog, which `dataset-catalog` defines. Verify
      `pnpm build:demo-data` rewrites that set and that `tests/demo-systems.test.ts` holds
      the three scenarios of "The demo site shows the icon stack", including the
      converter-versus-committed comparison.
- [x] 6.2 Commit the rewritten `apps/demo/demo-data/*.json`. Verify `pnpm build:demo-site`
      succeeds and that no record of the committed sets is rejected, which
      `tests/demo-systems.test.ts` already checks by feeding each set to the reader.

## 7. The browser tests

- [x] 7.1 Add `e2e/system-icons.spec.ts` for the stack: the record order, the 28 px box, the
      2 px gap, the stated bottom offset, the 28 px lift over the pin and the pin box not
      overlapping, the stack going with the marker when the category is off, the stack
      following the marker through an orbit, and the pointer passing through an icon to the
      marker under it.
- [x] 7.2 Extend that spec for the arrow: one arrow under a stack of four, the fill taken
      from the lowest icon for `['titan', 'mission']` and `['mission', 'titan']`, a host
      icon's colour, the apex offset and the 5 px height, and no arrow on a system with no
      icon.
- [x] 7.3 Extend that spec for the switch and the bounds: the switch turning 10 icons off
      and on, the switch holding over the hover and the selection, `systemIcons: false` and
      an unreadable value, the cap at 10,000 systems with 4 icons each, the nearest 32 of 40
      systems, and an off-screen system carrying no stack.
- [x] 7.4 Add the HUD switch scenarios to `e2e/hud.spec.ts`: the **System icons** switch
      moving the stacks, and the switch opening on the `systemIcons` option.
- [x] 7.4b Add the Firefox reading to the Firefox project: the camera move and the view
      `browser-suite` states, 10,000 systems each carrying 4 icons, the icon switch, the name
      labels, the grid and the HUD on, 180 frames after 20 dropped, and the mean interval at
      or under 7 ms with at least one icon drawn. Report the number as measured; if it is
      over, cut the cap of 32 rather than raise the budget.
- [x] 7.4c Take one screenshot of a hovered system that carries icons and check the hover
      ring against the arrow and the lowest icon by eye. The ring's radius is 12 to 25.6 CSS
      pixels and the arrow apex sits `markerCssSize / 2 + 2` above the centre, so the ring's
      upper arc crosses both at every marker size. Both are decoration and the ring is a
      1 pixel stroke at half alpha, so this is a look call: raise it with the owner rather
      than change a geometry the specs fix.
- [x] 7.5 Add the icon budget scenario to `e2e/frame-budget.spec.ts`: 10,000 systems with 4
      icons each, both switches on, the pointer over a marker, 120 frames at 1920x1080, and
      the mean selection work at or under 2 ms with the mean frame interval at or under
      18 ms. Verify the run is on hardware by the renderer assertion the suite already makes.

## 8. The package and the documentation

- [x] 8.1 Verify `pnpm build` emits one file per built-in symbol under
      `packages/galaxy-map/dist/assets/`, and extend `tests/main-bundle.test.ts` to assert
      that no built-in vector's markup is inside an emitted JavaScript file.
- [x] 8.2 Verify `pnpm test:package` passes, so the packed tarball carries the emitted
      vectors, and extend `tests/packed-tarball.test.ts` to name them.
- [x] 8.3 Add the `icons` field, its two entry forms, the built-in symbol list and the switch to
      `packages/galaxy-map/README.md`, beside the `images` field it already documents.
      Verify the added example compiles against the exported types.

## 9. The gates

- [x] 9.1 Run `pnpm lint`, `pnpm test` and `pnpm test:e2e` and report the results as they
      actually were. Run the Playwright suite alone, because a second run kills the first
      one's preview server.
- [x] 9.2 Run `openspec validate system-marker-icons --strict` and check every task above is
      ticked.
- [x] 9.3 GATE — implementation review. Launch the `openspec-implementation-reviewer`
      subagent with the change id, wait for its verdict, and fix what it blocks on before
      any human sees the work. State the verdict and every finding when presenting,
      including the ones not acted on and why.
