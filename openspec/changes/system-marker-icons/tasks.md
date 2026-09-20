## 1. The dependency and the vectors

- [ ] 1.1 Raise `@elite-dangerous-almanac/core` to 0.2.14 in
      `packages/galaxy-map/package.json` with `pnpm --filter @elite-dangerous-almanac/galaxy-map add @elite-dangerous-almanac/core@0.2.14`.
      Verify `pnpm-lock.yaml` holds 0.2.14, that `pnpm-workspace.yaml` is untouched, and
      that `pnpm test` and `pnpm lint` pass on the bump alone, which covers the four
      `astro` leaves the map already reads. 0.2.14 renames codex region 31 to
      `The Formidine Rift`; check that no test and no label constant holds the old string,
      and say so in the change summary.
- [ ] 1.2 Copy the 16 vectors from `assets/galaxy-map/` of
      `github.com/DarkSession/Elite-Dangerous-Almanac`, at commit
      `32a8a5ef8b5c10b65f8e9e188df5ab695c614d8b`, into
      `packages/galaxy-map/src/scene-data/marker-icons/`, one `<symbol>.svg` per file, byte
      for byte. Verify the directory holds 16 files totalling 11,909 bytes and that each
      root `<svg>` carries a `color` attribute. Record the repository, the path and that
      commit in `THIRD_PARTY_NOTICES.md` under task 1.4, so the notices say which bytes the
      package ships.
- [ ] 1.3 Add `tests/marker-icon-catalogue.test.ts`: read `GALAXY_MAP_MARKERS` from
      `@elite-dangerous-almanac/core/galaxy-map/markers`, which is the leaf the source
      imports, and the shipped directory, and assert the
      symbol sets are equal, the set is not empty, and each file's root `color` equals its
      record's `color` without case. Verify the test passes and that it fails when a file is
      renamed.
- [ ] 1.4 Name the fifth leaf, `galaxy-map/markers`, and the shipped vectors with their
      source repository, path and commit in `packages/galaxy-map/THIRD_PARTY_NOTICES.md`,
      under the sections the file already holds. Verify `pnpm test` passes, which runs `tests/third-party-notices.test.ts`, and
      extend that test to assert the new statements are present.

## 2. The catalogue module

- [ ] 2.1 Write `packages/galaxy-map/src/scene-data/marker-icons.ts`: the eager
      `import.meta.glob('./marker-icons/*.svg', { query: '?url&no-inline', import: 'default', eager: true })`,
      a `ResolvedIcon` of `{ url, color }`, the symbol table built from `GALAXY_MAP_MARKERS`
      and the glob, `MAX_ICONS = 4`, and `readIcons(value, safeUrl)` returning the resolved
      list or a reject reason. Verify a new `marker-icons.test.ts` covers a symbol read
      without case and without spaces, an unknown symbol, a host entry with and without a
      colour, a colour outside 0 to 255, a fifth entry, a non-array `icons`, and an entry
      that is neither a string nor an object.
- [ ] 2.2 Assert in that same test that every catalogue symbol resolves to a non-empty URL,
      so a glob that matched nothing fails the suite rather than resolving every symbol to
      `undefined`.

## 3. The reader

- [ ] 3.1 Add `icons` to `SystemRecordInput` and `RealSystem` in
      `packages/galaxy-map/src/scene-data/real-systems.ts`, add `bad-icon` and
      `unknown-icon` to `RejectReason`, and call `readIcons` after the existing field
      checks so an earlier fault still reports its earlier reason. Verify
      `real-systems.test.ts` covers each reject reason, the order of the kept icons, an
      empty `icons`, a missing `icons`, and that a rejected record raises neither the count
      nor the system box.
- [ ] 3.2 Re-export the icon types from `packages/galaxy-map/src/app/create-map.ts` and
      `packages/galaxy-map/src/index.ts`, beside `SystemImage`, and add both names to
      `PUBLIC_TYPES` in `tests/main-bundle.test.ts`. Verify `index.test.ts` passes, which
      asserts the barrel's exports by exact equality, and that `pnpm build` type-checks.
- [ ] 3.3 Add a type test that a record with `icons: ['titan', { url: '/a.svg', color: [1, 2, 3] }]`
      compiles and that an object entry with no `color` does not, beside the existing
      record input type tests.

## 4. The overlay

- [ ] 4.1 Add the icon geometry to `packages/galaxy-map/src/app/markers.ts`:
      `ICON_CSS_SIZE = 16`, `ICON_GAP_CSS = 2`, `ARROW_WIDTH_CSS = 8`,
      `ARROW_HEIGHT_CSS = 5`, `MAX_ICON_STACKS = 32`, and two pure functions —
      `iconBottomCss(centreY, markerCss, index, selected)` and
      `arrowApexCss(centreY, markerCss, selected)` — that carry the table in design.md.
      Verify `markers.test.ts` checks both against the stated offsets at a marker size and
      for the selected and unselected cases.
- [ ] 4.2 Build the icon element and the arrow element: an `<img>` with `alt=""`,
      `pointer-events: none`, `zIndex 1` and a fixed 16 px box, and a `<div>` whose CSS
      border triangle gives the 8 by 5 shape in the icon's colour. Verify `markers.test.ts`
      checks the built elements' attributes and the border widths.
- [ ] 4.3 Place the stacks in `MarkerOverlay.update`: a second `createNearestKeep(32)` over
      the same candidate sweep the name labels use, the two element pools, the record order
      lowest first, the arrow under the lowest icon alone, and the 28 px lift for the
      selected system. Verify the overlay adds no element a frame before it did not need,
      by counting `createElement` calls over two frames in `markers.test.ts`.
- [ ] 4.4 Add `iconCount()` and `arrowCount()` to `MarkerOverlay`, as `labelCount()` already
      is, so the browser tests read the overlay without querying the DOM by class alone.

## 5. The switch and the handle

- [ ] 5.1 Add `setSystemIconsVisible(on)` and `areSystemIconsVisible()` to the handle in
      `packages/galaxy-map/src/app/create-map.ts`, and the `systemIcons` option, defaulting
      to true for anything that is not the boolean `false`. Verify `create-map.test.ts`
      covers the default, `false`, and a string value.
- [ ] 5.2 Add the **System icons** switch to
      `packages/galaxy-map/src/hud/options-panel.ts`, between **System names** and
      **Coordinate grid**, and the `systemIcons` name to `lockedOptions`. Verify
      `options-panel.test.ts` covers the switch order, the open state, the lock, and that
      locking all five drops the panel on a map with no nebula source.
- [ ] 5.3 Update the seven HUD tests already in the tree that enumerate the switches, so a
      sixth switch does not fail them as a mystery at task 9.1. In `e2e/hud.spec.ts`:
      "a locked option draws no switch" now expects
      `['galactic-regions', 'system-names', 'system-icons']`; "every switch locked drops the
      panel" locks five names; "the four names leave the nebulae switch" becomes five names;
      the two ignored-lock-list tests count five switches; "the nebulae switch locks with
      the rest" locks six names, because the unlocked icons switch otherwise keeps the panel
      alive; and "a panel of fewer switches still reports each state" steps through three
      switches, not two. Verify each edit against the updated `map-hud` scenarios rather
      than against the old counts.
- [ ] 5.4 Correct the two stale comments in `e2e/hud.spec.ts` that count switches — "no
      fifth switch" and "the fifth switch follows the fourth one" — to sixth and fifth. Both
      assertions still pass, because **System icons** goes in before **Coordinate grid** and
      leaves the **Nebulae** switch after **Shapes**. Verify by running that spec file.

## 6. The demo

- [ ] 6.1 Give **one** committed set its icons, from a short explicit table in
      `apps/demo/scripts/build-demo-systems.mjs` and not a hand edit of the JSON: the
      built-in symbols of the systems that really carry them, and at least one host icon
      pointing at a file already in `apps/demo/public/demo-images/`, so the set shows both
      entry forms. Verify `pnpm build:demo-data` rewrites that set and that
      `tests/demo-systems.test.ts` holds the three scenarios of "The demo site shows both
      icon forms", including the converter-versus-committed comparison.
- [ ] 6.2 Commit the rewritten `apps/demo/demo-data/*.json`. Verify `pnpm build:demo-site`
      succeeds and that no record of the committed sets is rejected, which
      `tests/demo-systems.test.ts` already checks by feeding each set to the reader.

## 7. The browser tests

- [ ] 7.1 Add `e2e/system-icons.spec.ts` for the stack: the record order, the 16 px box, the
      2 px gap, the stated bottom offset, the 28 px lift over the pin and the pin box not
      overlapping, the stack going with the marker when the category is off, the stack
      following the marker through an orbit, and the pointer passing through an icon to the
      marker under it.
- [ ] 7.2 Extend that spec for the arrow: one arrow under a stack of four, the fill taken
      from the lowest icon for `['titan', 'mission']` and `['mission', 'titan']`, a host
      icon's colour, the apex offset and the 5 px height, and no arrow on a system with no
      icon.
- [ ] 7.3 Extend that spec for the switch and the bounds: the switch turning 10 icons off
      and on, the switch holding over the hover and the selection, `systemIcons: false` and
      an unreadable value, the cap at 10,000 systems with 4 icons each, the nearest 32 of 40
      systems, and an off-screen system carrying no stack.
- [ ] 7.4 Add the HUD switch scenarios to `e2e/hud.spec.ts`: the **System icons** switch
      moving the stacks, and the switch opening on the `systemIcons` option.
- [ ] 7.4b Add the Firefox reading to the Firefox project: the camera move and the view
      `browser-suite` states, 10,000 systems each carrying 4 icons, the icon switch, the name
      labels, the grid and the HUD on, 180 frames after 20 dropped, and the mean interval at
      or under 7 ms with at least one icon drawn. Report the number as measured; if it is
      over, cut the cap of 32 rather than raise the budget.
- [ ] 7.4c Take one screenshot of a hovered system that carries icons and check the hover
      ring against the arrow and the lowest icon by eye. The ring's radius is 12 to 25.6 CSS
      pixels and the arrow apex sits `markerCssSize / 2 + 2` above the centre, so the ring's
      upper arc crosses both at every marker size. Both are decoration and the ring is a
      1 pixel stroke at half alpha, so this is a look call: raise it with the owner rather
      than change a geometry the specs fix.
- [ ] 7.5 Add the icon budget scenario to `e2e/frame-budget.spec.ts`: 10,000 systems with 4
      icons each, both switches on, the pointer over a marker, 120 frames at 1920x1080, and
      the mean selection work at or under 2 ms with the mean frame interval at or under
      18 ms. Verify the run is on hardware by the renderer assertion the suite already makes.

## 8. The package and the documentation

- [ ] 8.1 Verify `pnpm build` emits one file per built-in symbol under
      `packages/galaxy-map/dist/assets/`, and extend `tests/main-bundle.test.ts` to assert
      that no built-in vector's markup is inside an emitted JavaScript file.
- [ ] 8.2 Verify `pnpm test:package` passes, so the packed tarball carries the emitted
      vectors, and extend `tests/packed-tarball.test.ts` to name them.
- [ ] 8.3 Add the `icons` field, both entry forms, the built-in symbol list and the switch to
      `packages/galaxy-map/README.md`, beside the `images` field it already documents.
      Verify the added example compiles against the exported types.

## 9. The gates

- [ ] 9.1 Run `pnpm lint`, `pnpm test` and `pnpm test:e2e` and report the results as they
      actually were. Run the Playwright suite alone, because a second run kills the first
      one's preview server.
- [ ] 9.2 Run `openspec validate system-marker-icons --strict` and check every task above is
      ticked.
- [ ] 9.3 GATE — implementation review. Launch the `openspec-implementation-reviewer`
      subagent with the change id, wait for its verdict, and fix what it blocks on before
      any human sees the work. State the verdict and every finding when presenting,
      including the ones not acted on and why.
