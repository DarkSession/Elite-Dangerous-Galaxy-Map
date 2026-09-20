## 1. Clear the way

- [x] 1.1 Archive `system-marker-icons` with `openspec archive system-marker-icons`, and
      verify `openspec validate merge-categories-and-frame-datasets` reports **no INFO**.
      Two are expected before the archive and both have the same cause: the header "The demo
      site carries seven data sets" is not in `openspec/specs/dataset-catalog/`, and the
      whole `system-icons` capability is not in `openspec/specs/` at all, so its MODIFIED
      block has no target. Both clear when the stacked change archives
- [x] 1.2 Run `pnpm lint`, `pnpm test` and `pnpm test:package` on the clean tree, and
      record the passing counts, so a later failure is known to be this change's
      **The reading**: `pnpm lint` clean, `pnpm test` 1,295 tests over 88 files,
      `pnpm test:package` 7 tests

## 2. One category list in the data layer

- [x] 2.1 Replace `primaryCategory` and `secondaryCategories` with `categories` on
      `RealSystem`, `SystemRecordInput` and the internal `MutableSystem` in
      `packages/galaxy-map/src/scene-data/real-systems.ts`, add
      `primaryCategory?: never; secondaryCategories?: never;` to `SystemRecordInput` beside
      its index signature, and verify a type test that names `primaryCategory` beside
      `categories` fails to compile. Without the `never` pair the index signature takes the
      old name and the field is dropped in silence
- [x] 2.1a Run `pnpm exec tsc --noEmit -p tsconfig.json` and write the list of files it
      names into a scratch file. It is the work list for tasks 2.5, 8.6 and 8.7. **Not
      `pnpm lint`**: the root script is `eslint .`, which reports no type error, and Vitest
      and Playwright transpile without checking types. `tsc` is what the `never` pair fails
      under, and this repository runs it as the first step of `pnpm build`. The list holds
      TypeScript files only, so the 12 JSON files, the two READMEs and
      `apps/demo/scripts/build-demo-systems.mjs` are not in it: tasks 8.1, 8.2 and 8.8 stand
      on their own
- [x] 2.2 Rewrite the record reader to read one `categories` array — drop a repeat, keep the
      record's order, reject an unknown or non-string entry as `unknown-category`, read a
      non-array as empty — and verify the new unit tests for the scenarios "An unknown
      secondary category rejects the record" and "The secondary categories are kept in
      order, without a repeat" pass
- [x] 2.3 Rewrite `firstCategoryOn` and `refreshFlags` to walk `system.categories`, keeping
      `categories[0]` as the index a system with every category off holds, and verify the
      existing sweep and colour unit tests pass against the new shape
- [x] 2.4 Replace the pair with `categories` on the five shape interfaces and on
      `ShapeInfo` in `packages/galaxy-map/src/scene-data/shapes.ts`, and add the same
      `never` pair to `SphereInput` and `LineInput`
- [x] 2.4a Rework `ShapeCategoryFields` (line 480), `readCategories` (line 575) and
      `categoryFields` (line 491). **The `categories` those hold today is a `number[]` of
      table indices, not a name list.** Keep the index list, which the sweep and the colour
      rule read, and rename it `categoryIndices` so one name does not mean two things in one
      file. Build the `string[]` of names that `ShapeInfo.categories` reads back from the
      input's own `categories`, in the record's order, in place of what `categoryFields`
      built from the two deleted fields. Drop the `no-category` shape reject reason, and
      verify the shape reader unit tests read back names and not indices
- [x] 2.5 Update the **five** source files the `tsc` list of 2.1a reaches:
      `hud/categories.ts`, `hud/info-panel.ts`, `scene-data/shapes.ts` and
      `scene-data/real-systems.ts` in the package, and `apps/demo/src/multifaction.ts`. The
      two `apps/demo/scripts/build-demo-systems` files are outside the root `tsconfig.json`,
      which includes `apps/*/src` and not `apps/*/scripts`, so task 8.2 owns them.
      `packages/galaxy-map/src/scene-data/picking.ts` names neither field — it reads
      `categoryIndices` and `set.category(...)` — so it moves only if the sweep changes
      those names. Verify `pnpm exec tsc --noEmit -p tsconfig.json` names no source file,
      only tests

## 3. A set with no category

- [x] 3.1 Add `DEFAULT_MARKER_COLOR = [150, 170, 200]` beside `DEFAULT_MARKER_STYLE` and
      `DEFAULT_MAX_DRAW_RANGE_LY`, and add the internal category row the set points an
      uncategorised system at. **Put the guard that hides the row in the handle's
      `getCategory` at `app/create-map.ts:2154` and nowhere else.** `set.category(index)`
      SHALL keep returning the row to its four internal callers — `system-pass.ts:231` and
      `:253`, `markers.ts:503` and `picking.ts:88` — because a guard inside `set.category`
      makes `buildMarkerColors` take `FALLBACK_COLOR` at `system-pass.ts:70`, which is
      white. Verify a unit test reads `categoryCount()` of 0 and `getCategory(0)` of null on
      a map holding one uncategorised system
- [x] 3.1a Reconcile `FALLBACK_COLOR` at `render/system-pass.ts:69`. Its comment states the
      same fact as the new constant, and the internal row makes it unreachable for a system
      of an uncategorised set. Remove it or define it from `DEFAULT_MARKER_COLOR`, so one
      question has one answer in the tree
- [x] 3.2 Add the `uncategorisedSystems` counter and the two rules: `addSystems` accepts a
      record naming no category while the table is empty, and `addCategories` rejects with
      the new `set-is-uncategorised` reason while the counter is above 0. Verify the unit
      tests for the scenarios "An uncategorised set loads", "A record with no category is
      rejected in a categorised set", "A category is rejected on an uncategorised set" and
      "Clearing the set lets the categories in" pass
- [x] 3.3 Reset the counter in `clearSystems` and `clearSystemsAndCategories`, and verify
      the "Clearing the set lets the categories in" unit test covers both calls
- [x] 3.4 Add the browser tests for the scenarios "The default marker draws and is picked"
      and "The filter reaches an uncategorised marker", and verify they pass on the hardware
      renderer

## 4. The HUD: counts and the flat list

- [x] 4.1 Write the row count as `<matches> of <total>` in
      `packages/galaxy-map/src/hud/categories.ts` while the shown tab's filter holds text,
      and as the total while it is empty, and verify the browser tests for the scenarios
      "A search rewrites the counts" and "A row with no match keeps its row" pass
- [x] 4.2 Expose the count pass's measurement on the page over the route `labelSampling`
      already takes: the statistic rides `HudHandle` and `app/create-map.ts` re-exports it on
      the map's `debug` object at about line 1847. `src/hud/` may not read a `debug` member,
      which `eslint.config.js` lines 156 to 166 fail the lint on, and `create-map.ts` holds
      only the two HUD types and the dynamic `createHud(handle, ...)` call at line 1717.
      Verify the browser test for "The count pass holds its budget" reads under 2
      milliseconds at 10,000 systems, and that `pnpm lint` is clean
- [x] 4.3 Build the flat list: where the shown tab has no group and its kind holds things,
      render one always-open list with no dot, no name and no count, reusing `entriesOf`,
      `rowShare`, `listCap`, `makeEntryRow` and the cut line, and disable **ALL** and
      **NONE**. Verify the browser tests for "An uncategorised set shows a flat list", "The
      flat list selects and filters", "The shapes tab shows a flat list for uncategorised
      shapes" and "One categorised thing removes the flat list" pass
- [x] 4.4 Add the flat list's styles to `packages/galaxy-map/src/hud/styles.ts` and verify
      the HUD renders it at the panel's own widths with no horizontal scroll
- [x] 4.5 Update `packages/galaxy-map/src/hud/info-panel.ts` to read `system.categories` and
      to show no chip row for a system that names none, and verify its unit test passes
- [x] 4.6 Verify `pnpm lint` is clean, so the HUD boundary rules still hold: `src/hud/` must
      not import `src/render/`, `src/scene-data/` or `src/camera/`

## 5. The nebulae dim harder

- [x] 5.1 Drop the upper bound from `nebulaOcclusionOf` in
      `packages/galaxy-map/src/render/renderer.ts`, keeping the finite and `>= 0` checks,
      and verify the unit test for "The constant takes a value above 1" passes
- [x] 5.2 Add `NEBULA_CULL_FLOOR = 0.02` to `packages/galaxy-map/src/render/nebula-slot.ts`,
      pass it to the draw, and collapse the box in the nebula vertex shader where the mean
      transmittance falls under it. Verify the unit test that reads the uniforms still sees
      the four selection readings unchanged
- [x] 5.3 Add the browser tests for "A culled record contributes nothing" and "The cull
      leaves the selection readings alone", and verify both pass on the hardware renderer
- [x] 5.4 Raise `DEFAULT_NEBULA_OCCLUSION` in
      `packages/galaxy-map/src/render/nebula-slot.ts` from 1 to **2**, and verify the unit
      test and the browser test of the scenario "The default is 2" read `2`
- [x] 5.5 Raise the `BRIGHT_VIEW` tolerance in `e2e/nebulae.spec.ts` from 2 per cent to
      **4** per cent, write that figure and the 2.2 per cent estimate it comes from beside
      the view, and verify "A nebula with little in front of it barely changes" passes
- [x] 5.5a Run `e2e/nebulae-firefox.spec.ts` and record the mean-luminance difference it
      reads at `CLOSE_VIEW` against its floor of 0.001. The new default dims that nebula,
      so the reading falls. If it falls under the floor, say so in the change rather than
      lowering the floor to fit
      **The reading**: `added` is 0.00234 at `CLOSE_VIEW`, against the floor of 0.001. The
      new default dimmed it, and it holds above the floor, so the floor stands
- [x] 5.6 Add the browser test for "A higher constant dims it further", and verify the
      pinned far-view baseline image still matches, because the zoom band draws no nebula
      at 60,000 light years
- [x] 5.7 Run `e2e/frame-budget.spec.ts` inside the zoom band at the new default and verify
      the frame interval holds the budget `far-view-rendering` states

## 6. A catalog entry frames its set

- [x] 6.1 Add the optional `bounds` and `view` to `DatasetEntry` and `DatasetInfo` in
      `packages/galaxy-map/src/app/datasets.ts`, read them in `readDatasets` without
      dropping an entry over an unreadable one, and verify the unit tests for "The catalog
      reads the entries in order" and "An unreadable bounds is dropped and the entry stays"
      pass
- [x] 6.2 Add `fit: 'systems'` to the dataset view type and work it out from the set's box
      with `farZoomLimit`, letting a named field win over it, and verify the unit tests for
      "`fit` frames the set" and "A named field wins over `fit`" pass
- [x] 6.3 Add the two new callbacks to `DatasetWriter` at `app/datasets.ts:164`, beside
      `write` — **not** to `DatasetState` at line 182, which is the handle
      `createDatasetState` returns — and call them in `loadDataset` between the write and the
      announce, holding the entry's `view` on the start load where the
      options name a `startView`. Verify the browser tests for "An entry's bounds take
      effect on its load", "The bounds reach a listener", "A deep link beats the entry at
      start" and "An entry with no view leaves the camera" pass
- [x] 6.4 Keep the map's own `bounds` option in a field beside `boundsSetting` in
      `packages/galaxy-map/src/app/create-map.ts` and restore it for an entry that names
      none, and verify the browser test "A dataset load writes the bounds and getBounds
      reads it" passes
- [x] 6.5 Verify the browser tests for "A restricted set holds the camera", "A failed load
      leaves the map as it was", "The later load wins" and "A full set switches inside the
      budget" pass with the two new steps in the load

## 7. A nearer marker hides an icon

- [x] 7.1 Drop the `namesOn && index !== hoverIndex && index !== selectedIndex` guard from
      the keeper offer at `packages/galaxy-map/src/app/markers.ts:586`, and rewrite the
      comment at lines 583 to 585 that states the rule being moved. Move the two exclusions
      to the label pass at line 598, which walks the keeper. Verify the browser test "The
      keeper holds the hovered and the selected marker" passes and that no system carries
      two name labels
- [x] 7.1b Split the one constant in two. `MAX_NAME_LABELS` at `markers.ts:19` sizes the
      keeper today and caps the labels by doing so, and after this change those are two
      numbers: the keeper holds **66** and the pass places at most **64**. Name them apart,
      as decision 1 names `categoryIndices` apart, and rewrite the doc comment at line 18,
      which reads "How many marker name labels the overlay places" and will be false of the
      keeper constant
- [x] 7.1c Give the keeper loop at `markers.ts:598` its own counter and stop it at 64.
      **Do not cap on `placed`**: `place()` at lines 543 to 558 increments that counter, and
      the hover label and the selection label are placed into it first at lines 559 to 562,
      so a cap on `placed` gives 62 name labels in a hover-and-selection frame, which is the
      loss this task exists to prevent. Count only what the keeper loop places, and count
      placements and not walked entries, so a label the overlap rule drops does not spend
      one of the 64. Verify the browser tests "The label count holds with no hover and no
      selection" and "The label count holds with a hover and a selection" both read 64
- [x] 7.1a Verify the "A set with no icon reads nothing" scenario of "The icon placement is
      bounded" still reads zero, and that the label pass does no work while the name switch
      is off
- [x] 7.2 Hide each icon and each arrow whose box holds the projected centre of a nearer
      marker, with `visibility: hidden`, skipping the stack's own system and breaking the
      candidate walk on range. Verify the browser tests for "A nearer marker hides the icon
      over it", "A further marker hides nothing", "Only the covered icon of a stack hides",
      "The arrow follows the same rule", "A system does not hide its own stack" and "The
      element comes back when the marker moves away" pass
- [x] 7.3 Measure the overlay's mean frame interval at 10,000 systems with 4 icons each,
      before and after, and verify the browser test "The test holds the frame budget" passes
      **The reading**: `e2e/frame-budget.spec.ts` carries both scenarios. The selection work
      is 0.52 ms a frame with no icon and 0.67 ms with four icons a record, against the
      budget of 2 ms, and the frame interval is 16.67 ms against the budget of 18 ms

## 8. The demo, its data and the test sweep

- [x] 8.1 Write a one-off script that rewrites the **12** committed JSON files from the two
      category fields to one `categories` array, keeping the primary first: the seven files
      of `apps/demo/demo-data/` (`uia`, `guardian-ruins`, `thargoid-war`,
      `guardian-structures`, `multifaction-spheres`, `notable-systems`, `adamastor`) and the
      five `tests/fixtures/*-demo-set.json` (`uia`, `guardian-ruins`,
      `guardian-structures`, `notable-systems`, `adamastor` — `multifaction` has no
      committed set, because it fetches). Run it, and verify no file under either directory
      holds `primaryCategory` or `secondaryCategories`
- [x] 8.2 Change `apps/demo/scripts/build-demo-systems.mjs` and
      `build-demo-systems.d.mts` to write `categories`, and verify
      `tests/demo-systems.test.ts` and every converter test under `tests/fixtures/` pass
      against the committed fixtures
- [x] 8.3 Update `apps/demo/src/multifaction.ts` and its unit test to build one category
      list, and verify `pnpm test` passes
- [x] 8.4 Give the `thargoid-war` entry in `apps/demo/src/main.ts`
      `bounds: { mode: 'auto' }` and `view: { fit: 'systems' }`, and verify
      `e2e/datasets.spec.ts` reads the restricted bounds after that load and the
      unrestricted bounds after a switch away from it
- [x] 8.5 Pass the decoded fragment as `startView` in `apps/demo/src/main.ts` where
      `decodeView(window.location.hash)` returns a value rather than null, drop the
      `map.setView(...)` at line 314 that follows the build, and verify
      `e2e/start-view.spec.ts` and the scenario "A deep link beats the entry at start" both
      pass. The reading that must hold is the camera after the start load settles, not the
      camera in the first frame
- [x] 8.6 Sweep the **18 Playwright suites** that name either field, from the list of task
      2.1a: `hud` (26 mentions), `systems` (10), `datasets` (8), `shapes` (7),
      `frame-budget` (6), `touch` (4), `selection` (4), `system-icons` (3), `navigation`
      (3), `stars` (2), and one each in `cursor-marker`, `demo-site`, `fly-to`, `grid`,
      `info-panel`, `paint-cost`, `plane-overlay` and `start-view`. Verify
      `pnpm exec tsc --noEmit -p tsconfig.json` names no `e2e/` file
- [x] 8.7 Sweep the **21 unit tests** that name either field: `shapes`, `real-systems`,
      `create-map`, `record-input`, `picking`, `markers`, `info-panel`, `renderer`,
      `shape-pass`, `system-pass`, `star-field` and `star-suppression` under
      `packages/galaxy-map/src/`; `apps/demo/src/multifaction.test.ts`; and
      `tests/demo-systems.test.ts`, `tests/main-bundle.test.ts` and the six converter tests
      under `tests/fixtures/`. That is 12 in the package, 1 in the demo and 8 under
      `tests/`. Verify `pnpm test` passes and
      `pnpm exec tsc --noEmit -p tsconfig.json` is clean
- [x] 8.8 Update the record and shape examples in `README.md` and the record example in
      `packages/galaxy-map/README.md` to the one field, and verify the repository holds no
      `primaryCategory` and no `secondaryCategories` outside `openspec/`, **excluding
      `dist/` and `node_modules/`**. `packages/galaxy-map/dist/types/` holds the old names
      in a tree that has built once, it is git-ignored, and task 10.1 rebuilds it

## 9. The nine requirements that state the old rules

- [x] 9.0 These are prose, not field names, so task 8.8's check does not reach them. Verify
      each delta of this change lands on the requirement it names, and that the text left
      behind states what the code now does:
      `real-systems` "The set holds positions in float64" (the `Uint16Array` and the
      internal row), "The demo page loads the Guardian Ruins data set" (the converter) and
      "A marker draws for every system at every zoom distance" (the draw rule and the
      colour rule); `map-hud` "A category expands into a list of its systems" (the open
      list) and "The information panel shows the selected system" (the chips);
      `system-selection` "The pick finds the nearest marker under a pixel" (the candidate
      rule) and "The marker name labels are bounded" (the keeper and the placement cap);
      `real-systems` "A category carries a name, a colour and a description" (the reject
      reason list, which the new `set-is-uncategorised` joins); and `system-icons` "The icon
      placement is bounded" (the label keeper, which now holds 66 and is shared). Verify the browser tests "An
      uncategorised set holds no table row" and "A system with no category shows no chip
      row" pass, and that an uncategorised marker is picked, which task 3.4 covers

- [x] 9.1 Edit the two **Purpose** blocks by hand, in the commit that archives this change.
      A Purpose is not a requirement, so no delta reaches it and task 8.8's check does not
      either: `openspec/specs/real-systems/spec.md` lines 5 to 7 read "in the colour of that
      system's primary category", and `openspec/specs/close-view-stars/spec.md` line 502
      reads "for every system its category's draw range keeps", which is untrue of a system
      that names none. Verify `openspec/specs/real-systems/spec.md` holds no "primary
      category", and that the `close-view-stars` Purpose no longer reads "its category's
      draw range" — the words "primary category" never appear in that file, so a check for
      them passes there whether or not the edit was made

## 10. The gates

- [x] 10.1 Raise the version of `packages/galaxy-map/package.json` from `0.6.0` to `0.7.0`,
      and verify `pnpm build` and `pnpm test:package` pass
- [x] 10.2 Run `pnpm lint`, `pnpm format`, `pnpm test` and `pnpm audit`, and verify each is
      clean
- [x] 10.3 Run the Playwright suite once, on its own, with no second run against port 4173,
      and verify every spec passes on the hardware renderer with no software fallback
      The count pass test reads a time, so it moved out of `e2e/hud.spec.ts` into
      `e2e/count-cost.spec.ts` and into the `timedSpecs` list of `playwright.config.ts`. It
      failed beside five other browsers in the parallel pass, which is what that list is
      for. The `chromium-timed` project depends on `renderer-check`, so the hardware gate
      still holds for it
- [x] 10.4 Run the `openspec-implementation-reviewer` subagent over this change and act on
      its verdict before any human sees the work
