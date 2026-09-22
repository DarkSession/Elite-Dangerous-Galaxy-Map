## 1. Clear the page rule first, so the new readings can fail

- [x] 1.1 Delete the `.region-label` rule from the inline `<style>` of
      `apps/demo/index.html`. This goes first on purpose: a class rule reaches the
      labels in the library-made host as much as those in `#labels`, so while the rule
      stands every reading in section 4 passes whatever the library does, and the
      regression tests could not fail. Verify with
      `grep -rn "region-label" --include=*.css --include=*.html .`, ignoring
      `node_modules`, `dist` and `wiki-build`, that no rule is left.
- [x] 1.2 Open the demo page and confirm the fault is now visible there too: the region
      labels stack at the top left. This is the reproduction the rest of the change
      removes.

## 2. The region label styles itself

- [x] 2.1 Add a `REGION_LABEL_STYLE` constant to
      `packages/galaxy-map/src/app/labels.ts` holding the 13 property-and-value pairs of
      the spec table, and export it. Verify `pnpm lint` is clean.
- [x] 2.2 Apply the constant to the element in `createLabelOverlay`, beside the existing
      `element.style.zIndex = '1'` at `labels.ts:1518`. Write the three font properties
      as `font-size`, `line-height` and `font-family` longhands, never as the `font`
      shorthand, which would also reset `font-style` and four more. Replace the comment
      at `labels.ts:1515-1517`, which states the rule this change removes. Verify by
      reading the file.
- [x] 2.3 Add a unit test to `packages/galaxy-map/src/app/labels.test.ts` that reads
      `REGION_LABEL_STYLE` and asserts it carries `position: absolute`, the three font
      longhands, the `text-shadow` key, and no `font`, `paint-order` or
      `-webkit-text-stroke` key. This guards against a property
      being dropped; it does not check CSS meaning, because Vitest runs in the `node`
      environment (`vitest.config.ts:5`) and a fake element gives back whatever string
      it was handed. The meaning is checked in task 4.1. Verify `pnpm test` passes.

## 3. The owned overlay host covers the canvas

- [x] 3.1 In `packages/galaxy-map/src/app/create-map.ts`, hold the last box written to
      `ownedHost` and write the new one in `drawFrame`. The size comes from the `size`
      that `create-map.ts:1560` already reads. The place comes from the difference
      between `canvas.getBoundingClientRect()` and `host.getBoundingClientRect()`, added
      to the value written last, which is self-correcting whatever the host's containing
      block is. Do not use `canvas.offsetLeft` and `canvas.offsetTop`: they are measured
      from `offsetParent`, the host's `left` resolves against its containing block, and
      those are two different frames. They part on a static `td`, `th` or `table`
      ancestor, which task 4.10 reads. Write only when `ownedHost` is not null and only
      when one of the
      four numbers differs. Seed the held place with the box `makeLabelHost` wrote, not
      with 0: the correction adds the difference to the value written last, so a held 0
      against a host already placed at `L0` drops `L0` for one frame, and tasks 4.5, 4.6
      and 4.7 each draw one frame and then read. Verify `pnpm lint` is clean.
      Add a `ponytail:` comment where the correction is written, naming the ceiling: the
      rect difference is in screen pixels and `left` is in local CSS pixels, so under an
      ancestor `transform: scale(s)` the correction is scaled. The error after a frame
      is `(1 - s)` times the error before, so it converges for `0 < s < 2`, holds at
      `s = 2`, and grows outside that range, which a negative scale also gives. No page
      in the tree scales an ancestor of the canvas.
- [x] 3.2 Put that write immediately after the `size` read at `create-map.ts:1560` and
      before `cursorMarker?.update`. A write after `labels?.update` places the labels of
      the frame against the box of the frame before, so the frame after a resize still
      clips against the old box and task 4.5, which draws one frame and reads, fails for
      a reason that is not the bug. Verify by reading the file.
- [x] 3.3 Extend the one-time write in `makeLabelHost` at `create-map.ts:852-853` to set
      the place as well as the size, so the host covers the canvas before the first
      frame rather than starting at the parent's origin and correcting itself. Keep the
      write; do not drop it. Take the place the same way task 3.1 does, and not from
      `offsetLeft`: append the element to the parent first, at `create-map.ts:856`, then
      read the two client rects and correct from a written value of 0. Return the box
      written, so `start()` can seed the held value of task 3.1 with it. Verify
      `pnpm lint` and `pnpm test` are clean.

## 4. The browser readings

Each reading below is new. Run it once with the section it covers reverted, to confirm
it fails, then with that section applied, to confirm it passes. Four rules for the
revert run:

- **Run only the new test, never the suite.** With section 1 applied and section 2
  reverted the demo page has no label styling at all, so the existing demo-page
  readings go red as well — `e2e/labels.spec.ts:51`, `:572` and `:598`, and
  `e2e/helpers.ts:161` and `:612`, all read label boxes or derive plane points from
  them. Their failure says nothing about the new test.
- **`pnpm test:e2e` cannot run one test.** It is `node scripts/e2e.mjs`
  (`package.json:16`), which passes a fixed argument list to Playwright and ignores the
  command line. A targeted run is
  `pnpm exec playwright test --project=chromium-gpu <file> -g "<title>"`.
- **Do not set `GALAXY_MAP_E2E_BUILT` on a revert run.** The Playwright `webServer`
  runs `pnpm build:demo-site && pnpm preview` unless that variable is set
  (`playwright.config.ts:167`). With it set the run serves the build that still holds
  the fix, and a test that reads the built site — task 4.4 — passes when it should
  fail.
- **Section 1 stays applied throughout**, or the demo page's rule styles the labels and
  the failure cannot happen at all.

- [x] 4.1 Add a test to `e2e/systems.spec.ts` that builds a map with no `labelHost` on a
      page with no rule for `.region-label`, sets a view inside the label band, draws,
      and reads `getComputedStyle` of one label. Assert every property of the spec
      table, that `text-shadow` carries the two black shadows as the browser
      serialises them, and that `-webkit-text-stroke-width` is `0px`.
      Verify it fails with section 2 reverted.
- [x] 4.2 Extend the same test to read every label's computed `position` and bounding
      box. Assert every one is `absolute`, that no two share a top left point, and that
      none lies wholly inside the 48 CSS pixel square at the top left of the viewport.
      Verify the same.
- [x] 4.3 Add a test that a page rule still reaches a property the library leaves alone:
      add a `font-style: italic` rule for `.region-label`, build a map, and assert the
      computed `font-style` is italic while `position` is still `absolute`. This is the
      reading the `font` shorthand would break, so it is also the guard on task 2.2.
      Verify it passes with section 2 applied.
- [x] 4.4 Add a test to `e2e/samples.spec.ts` that opens `examples/spheres-and-lines/`,
      waits for the canvas to draw, and takes the readings of 4.2. Use that sample and
      not `the-camera`: `the-camera` ends its page in
      `await map.flyTo({ system: 'Achenar', distance: 200 })`, so the camera moves on
      load and the reading would land at an unpinned point of the flight.
      `spheres-and-lines` sets a start view and makes no flight. Verify the same
      before-and-after.
- [x] 4.5 Add a test for the owned host and a resize: build a map with no `labelHost`,
      read the host's box, resize the viewport so the canvas grows, draw a frame, and
      assert the host's box equals the canvas's box and every label box lies inside it.
      Verify it fails with section 3 reverted.
- [x] 4.6 Add a test for a canvas that a positioned parent offsets by 40 CSS pixels
      across and 24 down: draw a frame and assert the host's client rect equals the
      canvas's client rect. Verify it fails with section 3 reverted.
- [x] 4.7 Add a test for a canvas with no positioned ancestor: put it directly in a
      `body` that carries the browser's default margin, draw a frame, and assert the
      same two client rects are equal.

      This task first said this reading separates the client rect difference from
      `canvas.offsetLeft`, and told you to confirm an `offsetLeft` implementation fails
      it. **It does not, and the run confirmed that.** Chromium answers `offsetLeft: 8`
      for a canvas in a static `body` with an 8 pixel margin, because Blink measures
      from the document origin when the `offsetParent` is a static `body`, so both
      implementations place the overlay correctly here. Keep the test — the page is
      worth covering — and take the discriminating reading in task 4.10.
- [x] 4.10 Add a test for a canvas in a static `td` of a table the page offsets, and
      assert the two client rects are equal. This is the reading that does separate the
      two implementations: a static `td` is an `offsetParent` and is not a containing
      block for an absolutely positioned element, so `offsetLeft` reads 0 while the
      host's `left: 0` lands at the initial containing block's origin. Run it against an
      `offsetLeft` implementation and confirm that one fails it, then against the client
      rect implementation and confirm it passes.
- [x] 4.8 Add a test for the zero-size start: build a map on a canvas whose parent is
      `display: none`, wait for `ready`, show the parent, give the canvas a box, draw a
      frame, and assert the label count is above 0. Verify the same.
- [x] 4.9 Add a test that a `labelHost` the options name gets no inline `left`, `top`,
      `width` or `height` from the library, after a resize. Verify it passes.

## 5. The documentation

- [x] 5.1 Update `docs/wiki/Getting-started.md:47-49` so the options paragraph says the
      library styles the region labels as well as placing them, and that a page needs no
      rule of its own. Verify `pnpm docs:wiki` builds.

## 6. The whole suite

- [x] 6.1 Run `pnpm lint`, `pnpm format` and `pnpm test`, and fix what they report.
- [x] 6.2 Run `pnpm test:e2e` once, on its own, with no other Playwright run on the
      machine, because a second run takes ports 4173 and 4174 from the first. Confirm
      the whole suite passes, and in particular that `e2e/look.spec.ts` still matches
      the committed baseline, which shows `#map` and therefore should not move.
- [x] 6.3 Re-run the reading of `proposal.md` over the built site: open each of the nine
      sample pages, zoom out 40 steps, and count the `.region-label` elements that read
      `position: static`. Confirm the count is 0 where the measured run read 388, and
      that the count of positioned labels is above 0 on the five samples that reach the
      band.

## 7. The review gate

- [x] 7.1 Run the `openspec-implementation-reviewer` subagent against this change and
      act on its verdict. On BLOCK, fix and run it again. Report the verdict and every
      finding, including any not acted on, and why.
