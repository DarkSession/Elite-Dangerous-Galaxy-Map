## 1. Firefox in the dev container

- [x] 1.1 In `.devcontainer/post-create.sh`, give `node` the directory
      `/home/node/.cache` before the `ms-playwright` chown, and say in the comment why
      Firefox needs it. Verify by running the two `chown` lines in the container and
      reading `ls -ld /home/node/.cache`, which must show `node node`
- [x] 1.2 In the same script, install the Firefox browser and its system libraries beside
      Chromium. Verify with `npx playwright install --dry-run firefox`, which must name a
      path under `/home/node/.cache/ms-playwright`
- [x] 1.3 Add the Firefox section to `.devcontainer/README.md`: no GPU flags, the
      sanitized renderer string and the preference that turns it off, the
      `Your Firefox profile cannot be loaded` dialog and its cause, and the harmless
      `CanCreateUserNamespace() clone() failure: EPERM` warning. Verify with
      `pnpm exec prettier --check .devcontainer/README.md`
- [x] 1.4 Add `tests/devcontainer.test.ts`, which reads `post-create.sh` and asserts the
      cache chown and both browser installs, in the style of `tests/workflow.test.ts`.
      Verify with `pnpm test`

  Tasks 1.1 to 1.3 are already written in the working tree. Read the diff before you
  start, and change only what is missing.

## 2. The label edge

- [x] 2.1 In `src/app/grid-labels.ts`, replace `GRID_LABEL_SHADOW` with the stroke
      constants and write `paint-order: stroke fill` and
      `-webkit-text-stroke: 2.5px rgba(2, 12, 20, 0.9)` in place of `text-shadow`. Keep
      the write-only-when-different rule of `setStyle`. Verify with the updated unit test
      in `src/app/grid-labels.test.ts`, which reads the computed properties of a built
      label
- [x] 2.2 In `src/app/markers.ts`, replace the name label's `textShadow` with the same
      pair at 2 pixels and `rgba(0, 0, 0, 0.9)`. Verify with `pnpm test`
- [x] 2.3 Update the browser test that reads the label look so it asserts `none` for the
      shadow, the stroke width, the stroke colour and `stroke fill` for `paint-order`, per
      the two new scenarios in `coordinate-grid` and `system-selection`. Verify with the
      Chromium timed pass
- [x] 2.4 Take a screenshot of a coordinate label and a marker name label over the
      galactic core, before and after, at the same view. Task 2.3 reads the properties, but
      no property says the text is still readable, so this is the check that the edge sits
      behind the glyph and does not eat it. Attach both images to the review

## 3. The HUD panels

- [x] 3.1 In `src/hud/styles.ts`, remove all five `backdrop-filter` pairs. Raise the
      background alpha of `gm-hud__panel` and `gm-hud__info` to 0.92 or above, and leave
      the dialog scrim at 0.78, the dialog frame at 0.97 and the lightbox at 0.88. Verify
      by reading the file back: no rule names `backdrop-filter`, and the three covering
      elements hold the alphas they had
- [x] 3.2 Add the three browser scenarios of `map-hud`: no element under the HUD root
      carries a `backdrop-filter`; the two panels and the information panel read 0.92 or
      above; the scrim, the dialog frame and the lightbox read the alphas they had.
      Verify with the Chromium pass
- [x] 3.3 Take a screenshot of the HUD before and after, at the same view, and compare
      both with the mockup in `.design/`. The panels must read as the same panels with
      the glass gone, and the text must hold its contrast over the galactic core. Attach
      the two images to the review

## 4. The position field

- [x] 4.1 In `src/hud/dom.ts`, take `formatCoordinate` to 5 decimal places and rewrite the
      comment above it, which states the 3-place reasoning. Update the **six** readings of
      `src/hud/dom.test.ts` that move, to the exact value in each case:
      `formatCoordinate(-9530.9375, true)` to `-9,530.9375` and
      `formatCoordinate(-910.28125, true)` to `-910.28125`;
      `formatCoordinate(-9530.9375, false)` to `-9530.9375` and
      `formatCoordinate(-910.28125, false)` to `-910.28125`;
      `formatCoordinate(1000.03125, false)` to `1000.03125` and
      `formatCoordinate(-1000.03125, false)` to `-1000.03125`. Rename the two test titles
      that state the old place count, `shows at most three decimal places with separators`
      and `rounds to the third decimal place`. Run `pnpm test`
- [x] 4.2 Update the two browser scenarios of `map-hud` that read the position text, and
      the note in "The distance fields stay whole" that quotes `-9,530.938`. Verify with
      the Chromium pass

## 5. The Firefox project and the budget

- [x] 5.1 Add a `firefox` project to `playwright.config.ts`. It takes
      `devices['Desktop Firefox']`, no Chromium flags, `dependencies: ['renderer-check']`,
      the preferences `webgl.sanitize-unmasked-renderer: false` and `layout.frame_rate: 0`
      in `launchOptions.firefoxUserPrefs`, which is where Playwright takes them,
      and a `testMatch` of `00-renderer.spec.ts` and the new paint spec. Verify with
      `pnpm exec playwright test --list --project=firefox`, whose output holds the two
      Firefox files and, because of the dependency, the renderer check of the
      `renderer-check` project as well
- [x] 5.2 Make the Firefox project run in the timed pass of `scripts/e2e.mjs`, on one
      worker, beside `chromium-timed`. Verify by running `pnpm test:e2e` and reading the
      two pass headers in the output
- [x] 5.3 Write `e2e/paint-cost.spec.ts`: open the page **with the HUD on**, which
      `openMap` in `e2e/helpers.ts` does only when a test asks for it, add the 10,000
      systems, turn the names and the grid on, set 1920x1080, and run the view and the move
      the `browser-suite` budget states. Drive the move with `setView` once a frame, and
      read the interval with `resetFrameIntervalStats()` and `frameIntervalStats()`, the
      pair `e2e/frame-budget.spec.ts` already uses. Do **not** use `debug.measureFrames`:
      it draws at a fixed view and sees no CSS paint, so it would read none of this cost.
      Assert the mean is 7 ms or less. Verify by running it in the Firefox project, and by
      reading the panel count and the label count in the page: a run with no HUD measures
      none of the panel cost, and a view with no labels measures none of the label cost
- [x] 5.4 Add the two regression scenarios to the same spec. Each one adds a **stylesheet
      rule**, not a per-element style, because the overlay builds labels while the test
      runs and a per-element write reaches only the labels that exist at the time. One
      writes the old `0 0 10px` shadow back onto `.gm-grid-label` and `.gm-system-label`;
      the other writes `backdrop-filter: blur(10px)` back onto `.gm-hud__panel`. Each
      repeats the move and asserts the mean passes 7 ms **and rises by at least 2 ms
      against the flat reading of the same run**, which is what keeps the reading clear of
      the run-to-run spread. Verify by running them
- [x] 5.5 Extend `tests/devcontainer.test.ts`, or add `tests/browser-suite.test.ts`, to
      read `playwright.config.ts` and `scripts/e2e.mjs` and assert the two scenarios of
      "The browser gate runs Chromium and Firefox". Verify with `pnpm test`

## 6. The documents

- [x] 6.1 Update `docs/roadmap.md` at the two decisions this change moves: the browser
      suite runs Chromium and Firefox, not Chromium alone, and the HUD leaves the
      `.design/` mockup's frosted glass on purpose. `AGENTS.md` asks for the roadmap to
      follow a decision that spans phases
- [x] 6.2 Add Firefox to the README's "Hardware rendering" section and to the browser suite
      section, which name Chromium and the Chromium flags alone. State that Firefox needs
      no flags. Verify with `pnpm exec prettier --check README.md docs/roadmap.md`

## 7. The gate

- [x] 7.1 Run `pnpm lint`, the TypeScript check and `pnpm test`. All three pass
- [x] 7.2 Run `pnpm test:e2e` end to end, one run only, and read both passes. Every spec
      passes, including the Firefox project, and the renderer line names the card
- [ ] 7.3 Record the before and after readings of the paint budget in the pull request,
      from the same machine, so the number in the spec can be checked against a run
- [x] 7.4 Run the `openspec-implementation-reviewer` subagent on the change and act on its
      findings. State the verdict when presenting
