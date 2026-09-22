## 1. The state and the new elements

`createHud` has no unit test and gets none here. The HUD's unit tests run over a fake
document written by hand in each test file, which carries no `dataset`, no `setInterval` and
no event dispatch, and the builder needs all three. The browser tests of group 4 are what
check this group, so each task below names the one that covers it.

- [x] 1.1 In `packages/galaxy-map/src/hud/index.ts`, add a `narrow()` local that reads
      whether the left drawer tab is drawn — `checkVisibility()`, with
      `offsetParent !== null` as the fallback — and a
      `setPanel(side: 'left' | 'right' | null)` local that writes or deletes
      `element.dataset.panel` and writes `aria-expanded` on both drawer tabs. `setPanel`
      writes no side when `narrow()` is false, and clears at any width. Covered by tasks 4.2,
      4.7 and 4.8.
- [x] 1.2 Build the two edge tabs as buttons with the classes `gm-hud__drawer-tab` and
      `gm-hud__drawer-tab--left` / `--right`, each holding an inline SVG chevron
      (`aria-hidden`) and a `gm-hud__drawer-tab-label`. Append both to the HUD root, beside
      the drawers, so the z-order design.md gives holds and each tab can move with its
      drawer. Wire each click to `setPanel`, which toggles its own side. Covered by task 4.2.
- [x] 1.3 Build the scrim as `gm-hud__scrim`, append it before the drawers, and wire its
      click to `setPanel(null)`. Covered by task 4.2.
- [x] 1.4 Wrap the information panel in a new `gm-hud__right` element beside a new
      `gm-hud__right-empty` placeholder, which holds a `SYSTEM DATA` heading, a close button
      wired to `setPanel(null)`, and the two lines `NO SYSTEM SELECTED` and
      `TAP A MARKER ON THE MAP`. Append the wrapper where `info.element` was appended.
      Covered by tasks 4.3 and 4.8.
- [x] 1.5 In the existing `onSelectionChange` listener, call `setPanel('right')` when the new
      selection is not null, and write the right tab's label as `SYSTEM` or `DATA`. Covered
      by task 4.2.
- [x] 1.6 Add the drawer step to the `Escape` chain, between the lightbox and the selection,
      matching the order the modified requirement states. **Guard the step with `narrow()`,
      not with the attribute alone.** A drawer opened at 412 and then widened past 720 leaves
      the attribute on the root, and a step that read it would swallow every later `Escape`.
      Confirm `e2e/hud.spec.ts:4163` and `e2e/datasets.spec.ts:1124`, which both press
      `Escape` twice at 1280 by 720, still pass. Covered by tasks 4.5, 4.7 and 4.8.
- [x] 1.7 Remove every listener the new elements added in `dispose()`, and add the new
      elements to the existing `dispose` scenario of `e2e/hud.spec.ts`, which reads the
      canvas's parent for anything of the HUD's class.

## 2. The base style rules

- [x] 2.1 In `packages/galaxy-map/src/hud/styles.ts`, add base rules that hide the narrow
      layout at every width: `gm-hud__drawer-tab`, `gm-hud__scrim` and `gm-hud__right-empty`
      take `display: none`, and `gm-hud__right` takes `display: contents`. Verify by running
      `pnpm build:demo-site`, then
      `GALAXY_MAP_E2E_BUILT=1 pnpm exec playwright test e2e/look.spec.ts`. Playwright starts
      and owns the preview server itself — `reuseExistingServer` is false, so do not start
      one by hand — and `pnpm test:e2e` takes no argument.
- [x] 2.2 Add the look rules the elements need when the media query shows them — the tab's
      border, its vertical `writing-mode` label, the scrim's colour and its opacity
      transition, the placeholder's heading, diamond and text. Keep them outside the media
      query so the query holds layout alone. Task 4.8 verifies them: all three elements read
      `display: none` at 1280 by 720.

## 3. The media query

- [x] 3.1 Add one `@media (max-width: 720px)` block at the end of the sheet and turn the left
      column into the left drawer: **`position: absolute`**, not `fixed`, against the left
      edge, `top: 0; bottom: 0`, `min(88vw, 360px)`
      wide, `z-index: 40`, `pointer-events: auto`, `transform: translateX(-102%)` and
      `visibility: hidden` with the delayed transition design.md gives, and `transform: none;
      visibility: visible` under `.gm-hud[data-panel='left']`. `position: fixed` would escape
      the root's `overflow: hidden`, which is what clips the closed drawer, and would put the
      drawer outside a host's own box.
- [x] 3.2 Do the same for `gm-hud__right`, which becomes `display: flex`, takes
      `position: absolute` and slides from the right, and set the information panel inside it to `position: static`, full width and
      height, `z-index: auto`, `max-height: none`, no box shadow. Show
      `gm-hud__right-empty` while the panel is `[hidden]` and hide it otherwise.
- [x] 3.3 Show the two drawer tabs and the scrim in the block, put each tab on the vertical
      middle of its edge at 30 px wide and `z-index: 45`, move each with its drawer, and give
      the scrim `inset: 0`, `z-index: 30` and `pointer-events: none` until `data-panel` is
      set.
- [x] 3.4 Wrap the top bar: `flex-wrap: wrap`, `height: auto`, `order: 1` on
      `gm-hud__top-left`, `order: 2` on `gm-hud__top-right`, `order: 3; flex: 1 0 100%` on
      `gm-hud__top-centre`, and `display: none` on `gm-hud__region`.
- [x] 3.5 Add the 44-pixel floor as one rule — `.gm-hud button, .gm-hud input
      { min-width: 44px; min-height: 44px }` — with no exemption and no selector list.
      Check by eye that a category row's dot still draws its 12-pixel swatch, which task 4.4
      then asserts.
- [x] 3.6 Make the dataset dialog full bleed in the block — `gm-hud__dialog-frame` at 100 %
      by 100 % with no border — and set `gm-hud__collections` to `flex-wrap: nowrap;
      overflow-x: auto`. Leave `gm-hud__dataset-grid` alone; its `auto-fill` already gives one
      column below 473 px.
- [x] 3.7 Add the drawers and the drawer tabs to the existing
      `@media (prefers-reduced-motion: reduce)` block, so they move with no transition.
- [x] 3.8 Run `pnpm lint` and `pnpm format` clean.

## 4. The browser tests

- [x] 4.1 Write `e2e/hud-mobile.spec.ts` with `test.use({ viewport: { width: 412, height: 880 } })`.
      Add its name to `chromium-touch`'s `testMatch` and to `chromium-gpu`'s `testIgnore` in
      `playwright.config.ts`, so it runs in a context with `hasTouch` and still depends on
      `renderer-check`. `scripts/e2e.mjs` needs no change: `chromium-touch` runs in the
      parallel pass and the new spec reads no time. Verify `tests/browser-suite.test.ts`
      still passes: it asserts only that `chromium-gpu`'s `testIgnore` holds
      `paint-cost.spec.ts`, so a longer list is fine.
- [x] 4.2 Cover the scenarios of "The HUD lays out as two drawers below 720 pixels": the
      drawers start off the screen, each tab opens its own drawer and closes the other, a
      closed drawer holds no element the Tab key reaches, the scrim closes the drawer, the scrim covers the reset button, a
      selection opens the right drawer from the handle and from a category row, the right tab
      reads `DATA` then `SYSTEM`, the bar takes two rows without the region name, the dataset
      field's group is within 2 px of the bar's content width — the scenario
      "The narrow bar gives the field a row of its own" of the modified top-bar
      requirement — and every
      element under the root reads `backdrop-filter: none`. Open and close every drawer with
      `page.tap`, which the context's `hasTouch` allows and which is the gesture the change
      exists for. Take every other reading the way the rest of the suite takes it.
- [x] 4.3 Cover "The right drawer states that nothing is selected": the empty drawer holds the
      placeholder, a selection replaces it, and clearing brings it back.
- [x] 4.4 Cover "Every button and input of the narrow layout is 44 pixels" with one test that
      walks the four states the scenario names and asserts both sides of every **drawn**
      `button` and `input` — `checkVisibility()`, because the sheet's
      `[hidden] { display: none !important }` leaves a hidden panel's buttons at 0 by 0. Count
      the distinct elements the four states reach and assert the count equals the buttons and
      inputs the HUD builds, so a control that is never drawn cannot hide from the floor. Add
      the second scenario: the dot is 44 by 44 and the swatch inside it is the size it is at
      1280 by 720.
- [x] 4.5 Cover the modified "Escape closes the lightbox, then the panel" scenario and the
      modified "The HUD does not take the map's input" scenario: `Escape` closes the drawer
      before the selection, and a drag with no drawer open still orbits by the amounts
      `map-navigation` states.
- [x] 4.6 Cover the three narrow scenarios of
      "The dataset library fills the screen below 720 pixels": the frame is 412 by 880, the
      cards take one column, and the chip row scrolls sideways at 8 collections.
- [x] 4.7 Cover "The drawer width follows the viewport" at 360 by 800 and 412 by 880, so both
      arms of `min(88vw, 360px)` are read; "The layout crosses the breakpoint without a
      reload" by resizing 1280 → 412 → 1280 in one test; and
      "A drawer open at the narrow width is inert at the wide one" by opening the left drawer
      at 412 by 880 with a system selected, setting the viewport to 1280 by 720, asserting
      neither drawer, neither tab nor the scrim is drawn, and that one `Escape` clears the
      selection.
- [x] 4.8 Add the wide-layout scenarios to `e2e/hud.spec.ts` at 1280 by 720: the left column
      is 316 px at `left: 22px`, the information panel is 380 px, the bar is 54 px, the region
      name is shown, neither drawer tab nor the scrim nor the placeholder is shown, the
      category dot and a copy button are 20 by 20 and the information panel's close button is
      24 by 24, the dialog frame reads 1040 by 605 with more than one card column and a
      wrapping chip row, and — the scenario "The wide layout writes no drawer state" — a
      selection leaves `data-panel` absent and one `Escape` clears the selection.

- [x] 4.9 Cover "The scrim costs no measurable frame time" in `e2e/frame-budget.spec.ts`,
      which is already in `timedSpecs` and already runs on one worker, inside a
      `test.describe` with its own `test.use({ viewport: { width: 412, height: 880 } })`. Read
      the mean animation frame interval over 120 frames with no drawer and again with the left
      drawer open, and assert the second is no more than 1 ms above the first. Do not put this
      reading in `e2e/hud-mobile.spec.ts`: that file runs on several workers and a time taken
      there is a reading of the machine.

## 5. The documentation

- [x] 5.1 Add a paragraph on the narrow layout to `docs/wiki/Examples/The-HUD.md`, which today
      describes the wide layout alone — "a top bar, a category browser, the map option
      switches and an information panel". Name the breakpoint, the two drawers, the edge tabs
      and that the host needs no option for it. Verify `pnpm docs:wiki` builds and that
      `tests/wiki-pages.test.ts` passes.

## 6. The checks that guard the rest of the tree

- [x] 6.1 Run `pnpm test` and fix what it reports. Read the HUD chunk size
      `tests/main-bundle.test.ts` logs. If it passes 80,000, raise `HUD_CHUNK_LIMIT` in that
      file and write in the comment what the new reading is and that every byte of the growth
      is HUD style and markup, as the previous raise did.
- [x] 6.2 Run the whole browser suite once with `pnpm test:e2e`, with no other Playwright run
      going, and confirm `e2e/look.spec.ts` passes against the committed baseline with no new
      snapshot written.
- [x] 6.3 Confirm `pnpm test:package` and `pnpm audit` are clean.

## 8. The second breakpoint and the tab side

The owner read the first build and asked for two changes. The drawers now start below 1400
pixels, because a 1366-pixel laptop with both columns open keeps too little map. The open
tab now sits beyond the drawer's outer edge, as the mockup draws it, and not inside it.

- [x] 8.1 Split the one media block of `packages/galaxy-map/src/hud/styles.ts` in two. The
      drawers, the two tabs, the scrim, the `gm-hud__right` drawer and the static
      `gm-hud__info` rules go in `@media (max-width: 1399px)`. The top-bar wrap, the hidden
      region name, the 44-pixel floor, the full-bleed dialog and the chip-row `nowrap` stay
      in `@media (max-width: 720px)`.
- [x] 8.2 Put the open tab beyond the drawer's outer edge — `left: min(88vw, 360px)` and
      `right: min(88vw, 360px)`, with no width of the tab in the arithmetic, so the 30-pixel
      tab above 720 and the 44-pixel one below it both land on the edge. Give the open tab
      `z-index: 46`, so it goes over the closed one where a narrow screen makes them meet.
- [x] 8.3 Move every wide-layout HUD reading in the browser suite from 1280 by 720 to 1600
      by 900. Eight files read the HUD: `hud.spec.ts`, `hud-mobile.spec.ts`,
      `datasets.spec.ts`, `info-panel.spec.ts`, `demo-site.spec.ts`, `dataset-cost.spec.ts`,
      `count-cost.spec.ts` and `navigation.spec.ts`. Leave the files that call `removeHud`
      at 1280, because their readings are of the canvas and a move would change them.
- [x] 8.4 Add the scenario "The band between the two breakpoints takes the drawers alone" at
      1024 by 768: the left tab is shown, the region name is shown, the bar is 54 pixels
      high, and a category row's dot is the size it is at 1600 by 900.
- [x] 8.5 Assert the tab's open position: at 412 by 880 the open left tab's left edge is at
      the left drawer's right edge, within 1 CSS pixel, and the same for the right tab.
- [x] 8.6 Re-run `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm test:package` and
      `pnpm audit`, and read the HUD chunk size again.

## 7. The gates

- [x] 7.1 GATE — implementation review, mandatory, before human review. Run the tests first,
      then launch the `openspec-implementation-reviewer` subagent with the change id, wait
      for its verdict, and fix on BLOCK. Report the verdict and every finding, including any
      not acted on, and why.
- [x] 7.2 GATE — look review, mandatory, after the implementation gate. Launch a read-only
      subagent with Bash, Read and Playwright. It opens
      `.design/Galaxy Map HUD Mobile.dc.html` and the running demo at 412 by 880, screenshots
      both, and reports every difference in layout, wording, colour, spacing and typography.
      Tell it the spec wins where the mockup and a spec disagree, and name the two places
      this change departs from the mockup on purpose: no `backdrop-filter`, and a selection
      from a category row opens the right drawer instead of closing both.

## 9. What the two gates found

**7.1, the implementation gate: BLOCK, then fixed.**

1. `prefers-reduced-motion: reduce` did nothing. The rule sat before the two layout blocks,
   which write a `transition` **shorthand** and reset the duration and the delay. The rule
   now sits at the end of the sheet and repeats the two compound selectors. A test reads it.
2. The one-tap swap between drawers was impossible: with the 44-pixel floor on it the open
   tab covered the closed tab's middle, and the test worked around it. The owner chose the
   mockup's 30-pixel tab, which is now the one exemption to the floor.
3. Two stated scales were never measured. A 256-category reading at 412 by 880 is in.
4. The wiki page named one breakpoint. It now names both.
5. The `dataset-catalog` delta named 1280 by 720 and 1040 by 605. Both follow the suite.
6. The timed scrim reading did not check that the open window drew. It does now.
7. The scrim scenario asserted less than it stated. Corrected, and the scenario itself was
   wrong about the geometry: the reset button's middle is inside the drawer, not the scrim.
8. `aria-expanded` is not re-derived when the layout leaves the narrow band. No user can
   reach it, because the tab is `display: none` there. The spec states what the code does.
9. `design.md` did not record the 8.2 decision. It does now.
10. Two statements about a landscape phone were stale at 1400. Both corrected.
11. The chunk bound tracks the reading rather than sitting a round number above it.
12. Three more specs read HUD elements at Playwright's default 1280, which is now inside the
    drawer band. All three name a viewport above it.

**7.2, the look gate: the structure matches, the top bar did not.**

13. The first row of the bar clipped all three of its items at 412 pixels. The right group
    now takes the width it needs and the title is the one that gives way.
14. The right drawer was see-through: with the blur banned, 4 percent let the top bar's text
    read through. Both drawers are opaque.
15. The left drawer was two bordered boxes with a 12-pixel band between them. It is one
    sheet.
16. A category line was 63 pixels tall against the mockup's 44. The line's padding gives 12
    back, so the pitch is 51 and the rows keep their 44-pixel targets.

**Not acted on, and why.** The look gate listed nine smaller differences from the mockup:
the bar's gradient bottom stop, the information panel's grid, the library header on one line,
the panel name's size, the header heights, the search box's and the category name's
typography, and the wording `RESET VIEW` against `RESET` and `Galactic regions` against
`Galaxy regions`. Every one is the wide layout's own look, not something this change makes,
and changing any of them moves the wide layout and its committed look baseline. They belong
to a change about the look of the HUD, not to this one about its layout. The dataset field's
missing index is a feature the wide layout does not have either.
