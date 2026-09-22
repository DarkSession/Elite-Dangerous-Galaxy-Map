## 1. The handle reading the HUD needs

- [x] 1.1 Add `hasSystemIcons(): boolean` to the `GalaxyMap` interface and to the handle in
      `packages/galaxy-map/src/app/create-map.ts`, returning `set.iconSystemCount > 0`, with
      a doc comment that states the rise-only rule. Verify `pnpm build` type-checks.
- [x] 1.2 Add the three readings the spec states to `e2e/system-icons.spec.ts` — no record,
      a record with no icon, a record with icons, a clear, and a replacement that drops the
      icons. The reading comes off the handle, which needs a document and a WebGL context,
      so it is a browser test and not a unit test. `real-systems.test.ts` already covers the
      set's own count, so add nothing there.

## 2. The map options panel

- [x] 2.1 In `options-panel.ts`, give each `Toggle` a `shown()` reading: `true` for the
      three fixed switches, `hasSystemIcons()`, `sphereCount() + lineCount() > 0` and
      `hasNebulae()` for the other three. Build every unlocked switch as today.
- [x] 2.2 Make `update()` set `hidden` on each switch from its `shown()`, and set `hidden`
      on the panel element while no switch is shown. Keep the `null` return for the
      all-locked case. Verify with a unit test in `options-panel.test.ts` that a map with no
      shape, no icon and no nebulae builds a hidden panel with three shown switches.
- [x] 2.3 Add unit tests for a switch appearing and going on a later `update()`, and for a
      dropped switch keeping the map's state. Verify `pnpm test` passes.

## 3. The category panel

- [x] 3.1 Replace `makeListIcon` with a chevron icon builder in `categories.ts`, keeping the
      call site and the `gm-hud__category-chevron` class. Verify `categories.test.ts` still
      passes.
- [x] 3.2 In `styles.ts`, join the two tabs — no gap, a shared border, 11.5 px weight 600
      with 2.5 px letter spacing — and rotate the chevron 180 degrees under
      `.gm-hud__category-row[aria-expanded='true']` over 140 ms, with the turn stopped under
      `prefers-reduced-motion`. Verify by eye against the mockup at 1280 by 720.

## 4. The top bar

- [x] 4.1 Split the bar into `gm-hud__top-left`, a new `gm-hud__top-centre` and
      `gm-hud__top-right`, move the dataset field into the centre group, and drop
      `gm-hud__top-divider` and its rule. Verify the field's centre is within 2 CSS pixels of
      the bar's centre at 1280 by 720.
- [x] 4.2 Replace the `▾` text caret with an inline SVG chevron, and add a spinner element
      that takes its place while a load runs. Add `@keyframes gm-hud-spin` and the
      `prefers-reduced-motion` rule that stops it. Verify the spinner turns and the field's
      width does not change between the two states.
- [x] 4.3 Move the loading flag out of `dataset-dialog.ts` into the dataset field, and give
      the field one `requestLoad(entry)` helper that both the dialog and the arrows call.
      Verify `pnpm test` passes and the dialog still shows the loading state.
- [x] 4.4 Add `datasetArrows?: boolean` to `HudOptions` in `types.ts`, read it in
      `index.ts`, and build the previous button, the next button and the `i / n` counter
      around the field when it is true. Verify a unit test covers the `false`, absent and
      non-boolean readings.
- [x] 4.5 Write the disabled rules and the `aria-label` text of the two buttons — first
      entry, last entry and a load in progress — and verify with unit tests over a catalog
      of three.

## 5. The dataset dialog

- [x] 5.1 Add a collection-colour helper: a small string hash that picks one of eight fixed
      colours. Verify a unit test that the same name gives the same colour, that the eight
      colours are all reachable, and that an empty collection name is handled.
- [x] 5.2 Rewrite the dialog frame: header with the title and the `<total> DATASETS` line,
      a search box, a chip row and a card grid. Drop the side list, the detail pane, the
      footer, `MAX_DATASET_ROWS`, the cut line and `OTHER_GROUP`'s grouping role — the name
      `OTHER` stays as a chip label.
- [x] 5.3 Build the chip row from the catalog's collections with counts, sorted by name and
      hidden where the catalog holds fewer than two collections, with `ALL` first and a second
      click on the picked chip clearing it. Verify with unit tests over a catalog of 5
      entries and 2 collections, and over collections named out of order.
- [x] 5.4 Build the card grid: one button per kept entry, with the swatch, the collection in
      upper case and the label; the accent border on the loaded card and on a loading card.
      Verify the grid holds 256 cards for a full catalog.
- [x] 5.5 Write the card's `title` from the entry's `region`, `description` and count, with
      `FETCHED ON LOAD` where it carries no `systemCount` and no empty separator for a field
      it does not carry. Verify with a unit test over an entry with every field and one with
      none.
- [x] 5.6 Make the search box match `label` alone, and make the header line read
      `<kept> OF <total>` while the search box or a chip narrows the list. Verify with unit
      tests, including the case where a collection name matches nothing.
- [x] 5.7 Make a card click call `requestLoad`, draw the spinner on that card, leave the
      dialog open, and close it when the load settles — on rejection as well, with the
      console warning. Make a click on the loaded entry's card close the dialog and load
      nothing. Verify a second click starts no second load and the loaded card starts none.
- [x] 5.8 Check that `Escape`, the close button and a click outside the frame all close the
      dialog during a load and that the load continues, and that the focus trap still holds
      over the new controls.
- [x] 5.9 Add the dialog's style rules — chips, the card grid at
      `repeat(auto-fill, minmax(232px, 1fr))`, the card and the spinner — with no
      `backdrop-filter` and the dialog's stated alphas unchanged. Verify the alphas read
      0.78 and 0.97.

## 6. The demo and the docs

- [x] 6.1 Turn `datasetArrows` on in `apps/demo/cycles/main.ts`, where the catalog is one
      entry per week of the war in order. Verify the page shows the arrows and the counter
      and that the next arrow steps one cycle.
- [x] 6.2 Turn `datasetArrows` on in the `docs/wiki/Examples/A-dataset-catalog.md` example,
      which is also the source of the `a-dataset-catalog` sample page. Verify the sample page
      shows the arrows. Leave `apps/demo/src/main.ts` alone, so the main page's look baseline
      moves for the top bar redraw alone.
- [x] 6.3 Update `docs/wiki/Examples/The-HUD.md` for `datasetArrows`, the one-click load and
      the switches that follow the map, and update
      `docs/wiki/Examples/A-dataset-catalog.md` for the new dialog. Verify
      `pnpm docs:wiki` builds.

## 7. The tests

- [x] 7.1 Rewrite the dialog flows in `e2e/datasets.spec.ts` for the card grid, the chips
      and the one-click load, and add the new scenarios: the loading card, the 256-card
      grid, the search over labels alone, and the chip row that is not there.
      The review gate added three more to the same file: a dialog opened again during a
      load stays open when the load settles, a step arrow takes the keyboard focus back
      when the load ends, and a rejected start load leaves both arrows disabled.
- [x] 7.2 Add the top bar scenarios to `e2e/hud.spec.ts`: the centred field, the long title
      that clips, the centred centre group while the arrows are on, the joined tabs, the
      turning chevron, and the arrows stepping and stopping at the ends. Update the node-count scenarios for the 256-card bound and the two
      keyboard scenarios that hard-code switch counts.
- [x] 7.3 Add the map options panel scenarios: the shapes switch following the shape set,
      the icons switch following the records, a dropped switch keeping its state, a map that
      moves nothing holding no panel, and the updated locked-option counts.
- [x] 7.4 Fix the selectors `e2e/navigation.spec.ts` takes from the bar and the dialog, and
      verify the file passes.
      **The reading**: the file needed no edit. It reads one HUD selector,
      `.gm-hud__toggle[data-name="coordinate-grid"]`, which is an unconditional switch, and
      it holds no dialog selector. A grep of the tree for every class and constant this
      change removed — `gm-hud__dataset-row`, `gm-hud__dialog-load`, `gm-hud__dialog-cancel`,
      `gm-hud__detail-*`, `gm-hud__dataset-group`, `gm-hud__dataset-cut`,
      `gm-hud__top-divider`, `gm-hud__dialog-side`, `MAX_DATASET_ROWS` and `setLoading` —
      finds none outside this change's own artifacts.
- [x] 7.5 Check that `e2e/system-icons.spec.ts` still passes with the switch that now comes
      and goes, beside the three readings task 1.2 added to it.
- [x] 7.6 Update `e2e/canonn-page.spec.ts` for the chip row in place of the group headers,
      and add the arrow scenarios to `e2e/cycles-page.spec.ts`: the counter reading
      `1 / <cycles>` then `2 / <cycles>`, and the next arrow disabled at the last cycle.
- [x] 7.7 Measure the full-set dataset switch **with the dialog open** against the 40 ms
      `dataset-catalog` states, and record the reading. Where it fails, close the dialog on
      the click instead and say so.
      **The reading**: at 50,000 systems, 256 categories and 256 cards, the switch took
      **35.8 ms** on one worker, and 30.0, 31.2, 32.7, 32.9 and 33.7 ms over five repeats.
      It reached 39 ms with two workers in contention, and **42.9 ms** in the parallel
      pass beside five other browsers. The reading is therefore taken on one worker: the
      test lives in `e2e/dataset-cost.spec.ts`, which `playwright.config.ts` names in
      `timedSpecs`, beside `count-cost.spec.ts` and `canonn-page.spec.ts`, which moved
      there for the same reason. Every one-worker reading holds the 40 ms bound, so the
      dialog stays open on the click and no number moved.
- [x] 7.8 Run `pnpm test` and then, separately, `pnpm test:e2e` — one Playwright run at a
      time — and verify both are green. Do not run the unit tests while the browser suite
      holds the preview server.
- [x] 7.9 Re-take `e2e/look.spec.ts-snapshots/default-view-chromium-gpu-linux.png` where the
      HUD changed it, and verify the new image against the mockup rather than accepting
      whatever the code drew.
      **The reading**: the image did not change and needed no re-take. `e2e/look.spec.ts`
      screenshots `#map`, the canvas alone, and `openMap` calls `removeHud` before it, so no
      HUD element is in the image. `design.md` expected the image to move; it does not.

## 8. The gates

- [x] 8.1 Run `pnpm lint` and `pnpm format`, and verify the HUD boundary tests in
      `hud-boundary.test.ts` and the repository tests in `tests/` still pass.
- [x] 8.2 Compare the built HUD against `.design/Galaxy Map HUD.dc.html` at 1280 by 720 —
      the top bar, the category panel header, a category row, the options panel and the
      dialog — and record where the build departs from the mockup and why, which is the
      `backdrop-filter` rule and the row distance the proposal names.
      **The departures**, all four already named by the proposal or a project rule:
      1. `backdrop-filter` is in the mockup 5 times and in the build 0 times, which is the
         project rule `map-hud` states.
      2. The category row pitch is 39 px in the build against 41 px in the mockup, which is
         the row distance the proposal names.
      3. The switch order follows `map-hud`, not the mockup.
      4. The mockup draws the step arrows on the main page. The build leaves them off
         there, because task 6.2 holds `apps/demo/src/main.ts` as it is.
      The card grid `minmax(232px, 1fr)`, the category row `padding: 9px 12px` and the
      dialog frame sizes all agree with the mockup, with `%` in place of `vw` and `vh`,
      because the map can sit in a host page smaller than the window.
- [x] 8.3 Run the `openspec-implementation-reviewer` subagent on this change, fix what it
      blocks on, and re-run it. Report the verdict and every finding, including the ones not
      acted on and why.
      **The verdict**: the first run returned BLOCK on five findings, all of which were
      fixed. The second run returned APPROVE WITH NOTES and cleared all five. Of its eight
      notes, six were acted on: the re-opened dialog that closed itself, the step arrow that
      lost the keyboard focus, the right group that could not clip, the sample page arrows
      with no test, and the two task readings that were not recorded. One was declined
      because it was wrong: `DATASET` and `LOADING` are both 7 characters, so the field's
      width does not change during a load. One is stated in the spec rather than changed in
      the code: a rejected start load leaves both arrows disabled, which the user recovers
      from in one click through the dialog.
