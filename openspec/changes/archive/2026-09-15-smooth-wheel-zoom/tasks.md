## 1. The glide rule

- [x] 1.1 In `src/camera/controls.ts`, add `ZOOM_HALF_LIFE_MS = 50` and
      `ZOOM_LEAST_NOTCHES_PER_SECOND = 2` beside `ZOOM_PER_NOTCH`, each with a doc comment
      that says what it does and names the 217 ms the region labels settle in. Verify
      `pnpm lint` passes.
- [x] 1.2 Replace `zoomByNotches` with
      `zoomTarget(distance: number, notches: number): number`, which returns
      `clampDistance(distance / ZOOM_PER_NOTCH ** notches)`. Verify the three tests of
      `describe('the zoom')` in `src/camera/controls.test.ts`, rewritten in task 5.1, pass.
- [x] 1.3 Add `zoomStep(distance: number, target: number, seconds: number): number` with
      the rule design.md decision 3 states: `gap = ln(target) - ln(distance)`,
      `fall = 1 - 0.5 ** (seconds * 1000 / ZOOM_HALF_LIFE_MS)`,
      `least = ZOOM_LEAST_NOTCHES_PER_SECOND * ln(ZOOM_PER_NOTCH) * seconds`,
      `step = max(abs(gap) * fall, least)`, and the target returned whole when
      `step >= abs(gap)`. Verify the unit tests of task 2 pass.

## 2. Unit tests for the rule

- [x] 2.1 Add `describe('the zoom glide')` to `src/camera/controls.test.ts`. Test: stepping
      from 20,000 toward 17,391.3043 at 1/60 of a second gives 17,450.12 within 0.01 at
      step 12 and the target exactly at step 13, which is 217 ms. Spec scenario "One notch
      lands in 217 milliseconds".
- [x] 2.2 Test: the same glide lands after 7 steps of 1/30 of a second (233 ms) and after
      31 steps of 1/144 (215 ms), and both are within 20 ms of 217. Spec scenario "The
      glide reads the time and not the frame count".
- [x] 2.3 Test: one step of 0.05 seconds from 20,000 toward 17,391.3043 gives 18,650.10
      within 0.01, which is `Math.sqrt(20000 * 17391.3043)`. Spec scenario "The gap halves
      every 50 milliseconds".
- [x] 2.4 Test: stepping from 120,000 toward 10 at 1/60 of a second reaches 10 exactly at
      step 31, which is 517 ms. Spec scenario "The whole sweep lands in half a second".
- [x] 2.5 Test: one step of 1/60 of a second from 20,000 toward `zoomTarget(20000, 1)`
      lowers the distance by 2.84 per cent, and toward `zoomTarget(20000, -1)` raises it by
      2.93 per cent, both within 0.01 of a percentage point and neither past 3 per cent.
      Spec scenario "One frame of a notch moves the picture by under 3 percent".
- [x] 2.6 Test: five forward notches, each taking the target the one before gave, with one
      step of 1/60 of a second between them, then steps until the glide lands, and the
      landing is 9,943.53 within 0.01. Spec scenario "A held wheel keeps the 1.15 step".
- [x] 2.7 Run `pnpm test src/camera/controls.test.ts` and confirm every test in the file
      passes.

## 3. The controls hold the target

- [x] 3.1 Add `readonly reducedMotion?: () => boolean` to `ControlsOptions`, with a doc
      comment saying the map reads the setting at each notch and not once at start up.
- [x] 3.2 Add `zoomTargetLy(): number | null` and `endZoom(): void` to the `Controls`
      interface, with doc comments. Verify `pnpm build` type checks.
- [x] 3.3 In `attachControls`, hold `let target: number | null = null`. Name the local
      `target` and not `zoomTarget`: a local of that name would shadow the module function
      of task 1.2 over the whole body. In `onWheel`, after `options.onInput?.()`, read the
      notches, then: where `options.reducedMotion?.()` is true, write
      `zoomTarget(view.distance, notches)` into `view.distance`, clear `target` and call
      `changed()`; otherwise set `target = zoomTarget(target ?? view.distance, notches)` and
      do **not** call `changed()`. Spec requirement "The wheel zoom glides to its target",
      the listeners paragraph.
- [x] 3.4 Rewrite `Controls.update(seconds)` so it raises the view change listeners once a
      frame. Drop the `if (!moving()) return` guard at line 382 and hold a local `moved`
      flag. Where `target` is not null, write `zoomStep(view.distance, target, seconds)`
      into `view.distance`, clear `target` when the step reached it, and set `moved`.
      Then, where a movement key is held, call `options.onInput?.()` and `moveByKeys` as
      today and set `moved`. Call `changed()` once at the end, and only where `moved` is
      true. A user who holds `W` during a glide must not raise the listeners twice in one
      frame with two different views. Rewrite the doc comment of `update` at
      `src/camera/controls.ts:221`, which reads "Applies the keys that are down", to say it
      also steps the zoom glide. Spec requirement "The wheel zoom glides to its target", the
      listeners paragraph.
- [x] 3.5 Implement `zoomTargetLy()` as `target`, and `endZoom()` as setting `target` to
      null without moving the view.

## 4. The map wires the glide

- [x] 4.1 In `src/app/create-map.ts`, pass `reducedMotion` to `attachControls` as the
      existing `reducedMotion` function the flight already uses, so both read the same
      media query.
- [x] 4.2 Add `controls?.endZoom()` to `takeView`, beside the fields it writes, so a
      selection flight and a reduced-motion selection both end the glide. Spec requirement
      "The wheel zoom glides to its target", the "Only the wheel glides" paragraph.
- [x] 4.3 Add `controls?.endZoom()` to the handle's `setView`, beside the existing
      `endFlight()`.
- [x] 4.4 Add `zoomTargetLy(): number | null` to the `debug` object of `create-map.ts`,
      returning `controls?.zoomTargetLy() ?? null`.
- [x] 4.5 Declare `zoomTargetLy?: () => number | null` on `GalaxyMapGlobal` in
      `src/render/global.ts` and forward it in `src/app/main.ts` beside
      `global.selectionFlightMs`. Verify `pnpm build` type checks.
- [x] 4.6 Confirm the browser tests need no declaration of their own: `e2e/global.d.ts`
      imports `GalaxyMapGlobal` from `src/render/global.ts`, so task 4.5 already reaches
      them. Verify `pnpm test:e2e --list` builds the test files without a type error.

## 5. Repair the tests the change breaks

- [x] 5.1 Rewrite the three tests of `describe('the zoom')` in
      `src/camera/controls.test.ts` (lines 20 to 48) to read `zoomTarget` instead of
      calling `zoomByNotches` on a view: one notch at 20,000 gives 17,391 within 1; 100
      notches each way give 10 and 120,000; forward notches from 120,000, each from the
      target the one before gave, reach 10 in 68. Remove the `zoomByNotches` import and the
      now-unused `createDefaultView` calls where they are unused. Spec scenarios "Zoom in",
      "Limits" and "The close limit takes more notches than the old one".
- [x] 5.2 In `e2e/selection.spec.ts`, test `a wheel notch ends the flight` at line 918:
      replace line 951, `expect(after?.distance).toBeCloseTo((before?.distance ?? 0) / 1.15, 6)`, with
      `expect(after?.distance).toBe(before?.distance)`, and replace line 953,
      `expect(rested.distance).toBeCloseTo(after?.distance ?? 0, 6)`, with
      `expect(rested.distance).toBeCloseTo((before?.distance ?? 0) / 1.15, 2)`. Line 953
      must change with line 951: once `after.distance` equals `before.distance`, the old
      line 953 says the camera never moved. Rewrite the comment at lines 928 to 930 to say
      the wheel sets a target and the frames in the 500 ms wait carry the camera to it.
      Spec scenario, in `system-selection`, "A wheel notch ends the flight".
- [x] 5.3 Run `pnpm test` and confirm the whole unit suite passes.

## 6. Browser tests for the new behaviour

- [x] 6.1 In `e2e/navigation.spec.ts`, add `the wheel sets a target and does not move the
      camera in the same task`: open at 20,000, dispatch one `WheelEvent` with
      `deltaY: -100` on the canvas and read `getView()` and `zoomTargetLy()` in the same
      `page.evaluate`, and assert the distance is still 20,000 and the target is 17,391.30
      within 0.01. Spec scenario "A notch moves nothing in its own frame".
- [x] 6.2 Add `the glide lands on the target`: the same notch, then `waitForTimeout(500)`,
      and assert the distance is 17,391.30 within 0.01 and `zoomTargetLy()` is null. Spec
      scenario "The glide lands on the target".
- [x] 6.3 Add `a host that writes the view ends the glide`: one notch, then a
      `setView({ distance: 8000 })` in the next animation frame, then 500 ms, and assert the
      distance is 8,000. Spec scenario "A host that writes the view ends the glide".
- [x] 6.4 Add a `describe` with `test.use({ contextOptions: { reducedMotion: 'reduce' } })`
      holding `a notch applies at once under reduced motion`: one notch read in the same
      task gives 17,391.30 within 0.01 and a null target. Spec scenario "Reduced motion
      takes the notch at once".
- [x] 6.5 Add `the wheel event raises no view change listener`: open at 20,000, register an
      `onViewChange` listener that counts its calls, send one notch and read the count in
      the same task, wait 500 ms and read it, wait 500 ms more and read it again. Assert 0,
      then more than 5, then the same number again. Spec scenario "The wheel event raises no
      view change listener".
- [x] 6.6 Extend the existing test `a zoom writes the distance into the fragment` to assert
      the landed value: keep the `waitForFunction` on `d=30000` and add a read of
      `getView().distance` after it that is 30,000 within 0.01. Spec scenario "The glide
      writes the landed distance to the fragment".
- [x] 6.7 Run `pnpm test:e2e e2e/navigation.spec.ts e2e/selection.spec.ts` and confirm both
      files pass.

## 7. Check what the glide runs beside

- [x] 7.1 Run `pnpm test:e2e e2e/hud.spec.ts -g "a wheel over a panel does not zoom"` and
      confirm it still passes with no edit: the wheel never reaches the canvas, so no target
      is ever set.
- [x] 7.2 Run `pnpm test:e2e e2e/labels.spec.ts` and confirm the region label tests pass,
      in particular the one that allows 400 ms for a pushed label. The glide and the label
      filter now run in series, which design.md names as a risk.
- [x] 7.3 Run `pnpm test:e2e e2e/frame-budget.spec.ts` and confirm the frame budget holds.
      The glide adds two logarithms, one power and one exponential a frame.

## 8. Documentation

- [x] 8.1 In `README.md`, change the `Wheel` row of the control table at line 271 to say
      that the camera glides to the new distance and lands in about 0.2 seconds. Verify the
      table still renders as a table.
- [x] 8.2 In `docs/roadmap.md`, add the glide to the camera decision at lines 99 to 100:
      the wheel sets a target and the camera reaches it in 217 ms at 60 frames a second, at
      the speed the region labels settle at. `AGENTS.md` asks for the roadmap to be updated
      when a decision changes.
- [x] 8.3 Check that no comment in `src/camera/` or `src/app/` still says the wheel writes
      the distance in one frame.
- [x] 8.4 Repair the one sentence of `galactic-regions` that justifies the label's reach, so
      it names a held wheel and not a single notch: "A wheel held down changes the camera
      distance by 15 percent in a frame". Also correct the matching comment in
      `src/app/labels.ts` at line 704. The new wording is true before this change as well
      as after, so it creates no order between this change and
      `overlay-blend-and-precision`. Put the edit where the live text is: in
      `openspec/changes/overlay-blend-and-precision/specs/galactic-regions/spec.md`, inside
      the MODIFIED block for `A region in view carries a label`, while that change is still
      in flight; or in `openspec/specs/galactic-regions/spec.md` once it has archived. Run
      `openspec validate --strict` on whichever change you edited.

## 9. Final verification

- [x] 9.1 Run `pnpm lint`, `pnpm build` and `pnpm test`, and confirm all three are clean.
- [x] 9.2 Run the full `pnpm test:e2e` suite and confirm it passes on hardware rendering,
      with no fall back to SwiftShader or llvmpipe.
- [x] 9.3 Run `openspec validate smooth-wheel-zoom --strict` and confirm the change is
      valid.
- [ ] 9.4 Turn the wheel by hand in `pnpm dev --host 0.0.0.0` at a far view and at a close
      one, and confirm the zoom reads as a move and not as a jump, and that it does not feel
      slow.
