## 1. The shape set owns its own flags

- [x] 1.1 In `src/scene-data/real-systems.ts`, add `categoryTableVersion`, which rises in
      `addCategories` where a category is added or replaced and in
      `clearSystemsAndCategories`, and not in `setCategoryVisible` or `setNameFilter`.
      Expose it beside `categoryVersion`. Verify with a unit test in
      `real-systems.test.ts`: the number rises on `addCategories` and on the clear, and
      holds over a `setCategoryVisible` call and a `setNameFilter` call.
- [x] 1.2 In `src/scene-data/shapes.ts`, change the `ShapeCategoryTable` interface: drop
      `isCategoryVisible`, replace `categoryVersion` with `categoryTableVersion`, and
      update `NO_CATEGORIES` and the doc comment above the interface. Verify with
      `pnpm exec tsc --noEmit`, which fails until every caller moves.
- [x] 1.3 In `src/scene-data/shapes.ts`, add a `Map<string, boolean>` of shape visibility
      and a version that rises with it, and add `setCategoryVisible(name, visible)` and
      `isCategoryVisible(name)` to the shape set. A name the table does not hold SHALL
      change nothing, SHALL NOT throw and SHALL read `false`, which is the rule
      `real-systems` already follows. Verify with unit tests in `shapes.test.ts` for the
      set, the reset and the unknown name.
- [x] 1.4 In the sweep of `src/scene-data/shapes.ts`, read the shape flag rather than
      `table.isCategoryVisible`, and watch `table.categoryTableVersion`, the shape
      visibility version and the name filter. Verify with a unit test: a switch of the
      shape flag sweeps, and a change of the system flag of the same category leaves
      `sweepCount` where it was.
- [x] 1.5 In `clearShapes` of `src/scene-data/shapes.ts`, clear the shape visibility map
      beside the name filter, **above** the early return that leaves when the set is
      already empty, so a clear of an empty set still resets the flags. Verify with the
      unit test the `map-shapes` scenario "Clearing the shapes turns the shape flags back
      on" names, and with a reading after `clearSystems` and one after
      `clearSystemsAndCategories`, each of which calls `clearShapes` (`create-map.ts:1652`
      and `:1659`).
- [x] 1.6 Move the existing shape unit tests in `src/scene-data/shapes.test.ts`,
      `src/render/shape-pass.test.ts` and `src/scene-data/picking.test.ts` onto the flag
      each one means. A test of a marker keeps the system setter; a test of a shape takes
      the shape setter. Verify with `pnpm test`.

## 2. The handle

- [x] 2.1 In `src/app/create-map.ts`, pass the system set to the shape set as a table with
      no visibility member, and stop the comment at `:766` saying the shape set reads the
      system set's flag. Verify with `pnpm exec tsc --noEmit`.
- [x] 2.2 In `src/app/create-map.ts`, add `setShapeCategoryVisible(name, visible)` and
      `isShapeCategoryVisible(name)` to the handle, each forwarding to the shape set, and
      leave `setCategoryVisible` and `isCategoryVisible` on the system set alone. Verify
      with a unit test: the two pairs move two flags, and neither moves the other's.
- [x] 2.3 Add the two members to the `GalaxyMap` type and check that `src/index.ts` carries
      them to the library surface. Verify with the `library-package` scenario "The
      declaration names the two shape category members", which goes in
      `tests/main-bundle.test.ts` beside the `getShapeInfo` type-check case at `:461-472`.

## 3. The HUD

- [x] 3.1 In `src/hud/categories.ts`, give the dot handler the setter of the shown tab:
      `setCategoryVisible` in `systems` and `setShapeCategoryVisible` in `shapes`. Verify
      with the browser scenario "NONE in the shapes tab leaves the systems" and with "A row
      reads the flag of its own tab".
- [x] 3.2 In `src/hud/categories.ts`, read the row's off state from the flag of the shown
      tab, so the hollow dot and the dimmed name follow that tab alone. Verify with the
      scenario "A row reads the flag of its own tab".
- [x] 3.3 In `src/hud/categories.ts`, point the ALL and NONE loops at the setter of the
      shown tab. Verify with the scenario "NONE in the shapes tab leaves the systems" and
      with the existing scenario "NONE does not move a category the tab hides", which still
      holds.
- [x] 3.4 In `makeEntryRow` of `src/hud/categories.ts`, which is the one click handler both
      kinds of row share, take the setter of the shown tab rather than calling
      `map.setCategoryVisible` always. A shape row then turns its category on for shapes
      and leaves the systems where they are. Verify with the browser scenario "A shape row
      turns its category back on", which `e2e/hud.spec.ts:1674` holds: its two readings at
      `:1685` and `:1691` call `isCategoryVisible` and take `isShapeCategoryVisible`. It is
      the one test of that file that clicks a dot in the SHAPES tab; the other six that read
      `isCategoryVisible`, at `:664`, `:684`, `:1142`, `:1379`, `:1506` and `:2984`, run in
      the SYSTEMS tab and stay true.
- [x] 3.5 Check that `update()` of `src/hud/categories.ts:624`, which writes the dot state
      on every poll, reads the flag of the shown tab. The panel rebuilds its rows on the
      signature `categoryCount:systemCount:sphereCount:lineCount` alone, which no switch
      moves, so the poll is the only path that redraws a dot. Verify with the scenario "A
      row reads the flag of its own tab".

## 4. The demo data
- [x] 4.1 In `scripts/build-demo-systems.mjs`, add the category to the table `convertUia`
      builds, under the key `g_soi`, named `Gamma Velorum Zone` and coloured `[0, 0, 153]`,
      which is the RGB triple the table holds, **after** the loop that adds the eight
      `UIA#N` entries, so it is the last entry of the table and the last category of the
      set. Verify by reading the table the converter returns.
- [x] 4.2 Split the two readings of `UIA_SPHERE_LISTS`, which two functions read for two
      different jobs. `ed3dSpheres` resolves `category` with `table.get(category)?.name`,
      and `ed3dSphereRecords` skips a list on `category === null` at `:1412`, which is the
      **only** thing that keeps `g_soi` out of the marker records. Give the `g_soi` entry
      `category: 'g_soi'` **and** `record: false`, and make `ed3dSphereRecords` skip a list
      that carries `record: false` as well as one whose category is null. Update the three
      doc comments that say the list names no category or gets no record: above
      `UIA_SPHERE_LISTS` at `:655-660`, above `ed3dSpheres` at `:672-679` and above
      `ed3dSphereRecords` at `:1404-1407`. Verify that `convertUia` returns 1,116 systems
      and 54 spheres, and that no record is named `Gamma Velorum`.
- [x] 4.3 Regenerate the committed golden `tests/fixtures/uia-demo-set.json`, which
      `tests/fixtures/uia.test.ts:58` compares the converter output against. Verify that the
      only changes are the added category and the `primaryCategory` of the one `g_soi`
      sphere, by reading the diff.
- [x] 4.4 Update `tests/fixtures/uia.test.ts`, naming four places. The test title at
      `:120` reads "reads 23 systems and 11 categories" and becomes 12 categories, and the
      category list of that test gains `Gamma Velorum Zone` as its last entry. The entry
      `['none', 1]` at `:192` becomes `['Gamma Velorum Zone', 1]`. The comment at `:179-180`
      says the `g_soi` list gets no marker and no category; it still gets no marker. The
      test it sits above is "gives each sphere the marker category of its own list" at
      `:181`. Read the new count from the run rather than assuming it. Verify with
      `pnpm test`.
- [x] 4.5 Rebuild `demo-data/uia.json` with the converter and check the file: 19
      categories, the last one `Gamma Velorum Zone` in (0, 0, 153), and the one sphere of
      radius 750 naming it. `main()` writes every set, so verify by reading the rebuilt file
      that the other five files of `demo-data/` are unchanged, and that the UIA system
      count, sphere count and line count are unchanged at 1,116, 54 and 983.
- [x] 4.6 Update `src/app/demo-systems.test.ts:156`, the test named "holds 18 categories,
      1,116 systems, 54 spheres and 983 lines", which asserts the whole 18-name list of
      `demo-data/uia.json`. The name and the list take the nineteenth category. Verify with
      `pnpm test`.
- [x] 4.7 Update the second UIA test of `src/app/demo-systems.test.ts`, "gives its shapes
      the categories of the source" at `:205`: `named` becomes 54 (`:210`), `unnamed`
      becomes empty (`:215`), and the comment at `:202-204` stops saying that the Gamma
      Velorum list has no marker and no category. It still has no marker. Verify with
      `pnpm test`, which also reads the 1,116 system count of the test at `:156`.
- [x] 4.8 Update the two UIA readings in `e2e/datasets.spec.ts`: the five-set reading at
      about `:766`, where the UIA categories become 19, and the shape reading at about
      `:810`, where `named` becomes 54, `unnamed` becomes empty and the sphere category list
      gains `Gamma Velorum Zone`. The comment at `:811-812`, which says 53 of 54 carry a
      category, moves with them. Verify with a targeted Playwright run of the two tests.

## 5. The specs, the docs and the readings

- [x] 5.1 Update the three prose files that read "18 categories" for the UIA set:
      `README.md:51`, `docs/roadmap.md:1089` and `THIRD_PARTY_NOTICES.md:141`. Verify by
      grepping the whole repository, outside `openspec/changes/archive/`, for "18
      categories". Two hits are expected and SHALL NOT be hand-edited: the live
      `openspec/specs/dataset-catalog/spec.md:272`, which the archive step rewrites from
      the delta, and this change's own `proposal.md`, where "17 of its 18 categories"
      describes the state before the change. Every other hit is a file to fix.
- [x] 5.2 Update the three places in `README.md` that state the handle and the switches:
      `:161`, the system member list, gains `setShapeCategoryVisible` and
      `isShapeCategoryVisible` and says which kind the older pair reaches; `:186-188`, which
      reads that a shape "hides with" its category, names the switch that hides it; and
      `:336-337`, where ALL and NONE act on the kind of the shown tab. Verify by reading the
      three passages against the `map-shapes` and `map-hud` deltas.
- [x] 5.3 Set `package.json` to version `0.4.0`, and move the assertion at
      `tests/main-bundle.test.ts:391`, which reads `0.3.0`, with the comment at `:388-390`
      that gives the 0.3.0 reason. The new reason is that `setCategoryVisible` stops
      reaching a shape. Verify with `pnpm test` and with the `library-package` scenario
      "The package names its version".
- [x] 5.4 Add a line to `docs/roadmap.md` recording the split and the 0.4.0 break, beside
      the entry that records the shape categories. Verify by reading the file.
- [x] 5.5 Run `pnpm build` and read the size of the entry chunk. Write the reading in both
      places that hold it: the `library-package` delta, in place of the sentence that names
      252,975 bytes, and the doc comment at `tests/main-bundle.test.ts:62-67`, which holds
      the same reading and the rule that the next change to this chunk moves the bound.
      Verify with `pnpm test` and with the scenario "The entry chunk stays under the
      bound".
- [x] 5.6 Where the reading of 5.5 is at or above 254,000 bytes, raise the bound to the next
      round figure above the reading in **both** places: the `library-package` delta and
      `ENTRY_CHUNK_LIMIT` at `tests/main-bundle.test.ts:68`, which is the number the build
      actually fails on. State the reading and the reason in each, and say that the region
      cell lookup is still the fault the bound catches. Where the reading is under 254,000,
      leave both at 254,000 and record the room that is left.

## 6. The tests and the gates

- [x] 6.1 Add the unit tests the `map-shapes` delta names: "A shape switch leaves the
      markers of its category" and "An unknown name moves no shape". Add one more for the
      rule the delta strengthens: add a category, turn its shapes off, add the same name
      again in another colour, and read `isShapeCategoryVisible`, which is still `false`,
      and `isCategoryVisible`, which is unmoved. Verify with `pnpm test`.
- [x] 6.2 Move the existing browser tests in `e2e/shapes.spec.ts` and
      `e2e/frame-budget.spec.ts` onto `setShapeCategoryVisible`, which is the call each of
      them means. Verify that `e2e/frame-budget.spec.ts` still reads a sweep, because
      `setCategoryVisible` now sweeps no shape and would read 0 for every switch.
- [x] 6.3 Add to `e2e/hud.spec.ts` the two browser tests the `map-hud` delta names: "NONE
      in the shapes tab leaves the systems" and "A row reads the flag of its own tab".
      Verify with a targeted Playwright run.
- [x] 6.4 Add to `e2e/datasets.spec.ts` the browser test the `dataset-catalog` delta names:
      "The Gamma Velorum category holds a shape and no system". The scenario reads the rows
      of the two tabs, so the test opens the page with the HUD on and reads the panel, not
      `getShapeInfo`. Verify with a targeted Playwright run.
- [x] 6.5 Run `pnpm lint`, `pnpm exec tsc --noEmit` and `pnpm test`, and fix what they
      report. Verify that all three are clean.
- [x] 6.6 Run `pnpm test:e2e` whole, with no other Playwright run in flight, and read the
      sweep budget scenario and the paint budget. Verify that the suite passes and that
      the sweep reading still holds the 2 ms and 1 ms bounds.
- [x] 6.7 Check the handle table of the `real-systems` delta against `src/app/create-map.ts`:
      every row names a member the code carries, and every **category and shape** member the
      code carries has a row. The table gains `getShapeInfo`, `setShapeNameFilter` and
      `getShapeNameFilter`, which it lost before this change, and the two new category
      members. A member another capability states needs no row, and there are ten of them:
      `getBounds`, `setBounds`, `flyTo`, `isFlying`, `onFlightEnd`, `getInteraction` and
      `setInteraction` of `map-navigation`, `setCursorMarkerVisible` and
      `getCursorMarkerVisible` of `library-package`, and `regionNameAtExact` of
      `galactic-regions`. Verify by listing the two sides and the ten exceptions.
- [x] 6.8 GATE. Launch the `openspec-implementation-reviewer` subagent with this change
      id, wait for the verdict, fix what it blocks on and re-run it. Present the verdict
      and every finding, including the ones not acted on and why.
