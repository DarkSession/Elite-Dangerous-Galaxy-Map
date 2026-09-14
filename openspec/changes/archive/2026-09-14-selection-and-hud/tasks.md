## 1. Groundwork

- [x] 1.1 Commit `.design/` with the mockup and its backdrop image, and check `git status` reports a clean tree afterwards
- [x] 1.2 Add `@fontsource/chakra-petch` and `@fontsource/ibm-plex-mono` with `pnpm add`, and check `pnpm-lock.yaml` records a version at least 7 days old for each
- [x] 1.3 Add to `THIRD_PARTY_NOTICES.md`: an entry per font with its SIL Open Font License 1.1, a line naming ED Assets as where the selection pin's eight points were taken from and the shape as Frontier's under the non-commercial media usage notice the file already carries, and a line recording `.design/support.js` as generated design-tool runtime with no licence header. Verify every committed third-party file has a line
- [x] 1.4 Add an ESLint block for `src/hud/**/*.ts` that restricts imports of `src/render/`, `src/scene-data/` and `src/camera/`, plus a `no-restricted-syntax` rule that fails a read of a `debug` property there. Verify `pnpm lint` is clean on the tree and fails on each of the four scratch cases the `map-hud` scenario names

## 2. The record grows three fields

- [x] 2.1 Add `description`, `primaryStar` and `images` to `RealSystem` in `src/scene-data/real-systems.ts`, with an `SystemImage` type of `url` and optional `caption`
- [x] 2.2 Read the three fields in the record reader, capping `images` at 8 and dropping an entry that is not an object, whose `url` is not a string, or whose `url` names a scheme other than `http` or `https`
- [x] 2.3 Write the unit tests for the three scenarios of `real-systems`: the fields kept when they are strings, the image list that drops a bad entry and caps at eight, and the `images` that is not an array. Verify `pnpm test` passes

## 3. Category visibility and the name filter

- [x] 3.1 Add a visibility flag per category and a name filter to the system set, each bumping `categoryVersion`, with `setCategoryVisible`, `isCategoryVisible`, `setNameFilter` and `getNameFilter` on `RealSystemSet`
- [x] 3.2 Make `buildMarkerStyleRanges` in `src/render/system-pass.ts` write a draw range of 0 for a marker whose category is off or whose name the filter drops, so the existing range cut removes it
- [x] 3.3 Expose the four members on the handle in `src/app/create-map.ts`, with `getSystem`, `categoryCount` and `getCategory`
- [x] 3.4 Write the unit tests for the visibility and filter rules of `real-systems`, including the replaced category that keeps its visibility, the unknown name that changes nothing, and the case fold. Verify `pnpm test` passes
- [x] 3.5 Write the browser tests for the marker count and the pixel readings under the visibility and the filter. Verify `pnpm test:e2e e2e/systems.spec.ts` passes

## 4. The pick

- [x] 4.1 Add `src/scene-data/picking.ts` with a sweep that takes the set, the view, the viewport and a pixel, and returns the nearest candidate index or -1, using a pick radius of `markerCssSize / 2 + 4` and the total tie-break rule. It must import no renderer module
- [x] 4.2 Move `markerCssSize`, `MARKER_SIZE_LY`, `MIN_MARKER_CSS` and `MAX_MARKER_CSS` from `src/render/system-pass.ts` to a new `src/scene-data/marker-size.ts`, and make `system-pass.ts`, the pick and the overlay marks all read them from there. Verify `pnpm test` and `pnpm lint` pass, so the pick does not reach the renderer
- [x] 4.3 Re-export `RealSystem`, `SystemImage` and `Category` from `src/app/create-map.ts`, so the HUD and a host can name them without importing `src/scene-data/`, which the HUD lint rule forbids. Verify `pnpm build` type checks
- [x] 4.4 Write the unit tests for the pick rule: the radius at the floor and the cap, the nearer of two overlapping candidates, a candidate behind the camera, and a candidate its category or the filter removed. Verify `pnpm test` passes
- [x] 4.5 Add `systemAt(x, y)` to the handle and verify the browser scenarios of `system-selection` for the pick pass
- [x] 4.6 Add the browser timing scenario that reads 200 picks over 10,000 systems and verify the mean is 1 ms or less

## 5. Selection and hover state

- [x] 5.1 Add the click test to `src/camera/controls.ts`: a left press within 4 CSS pixels that releases within 400 ms reports a click, and verify the three unit scenarios of `map-navigation`
- [x] 5.2 Add the form-field guard to the key listeners, and verify the two `map-navigation` scenarios for a key aimed at an input
- [x] 5.3 Hold the hover and the selection in `src/app/create-map.ts`, running the hover pick once per frame from the last pointer position and again when the view changes
- [x] 5.4 Add `getHover`, `getSelection`, `setSelection` and `onSelectionChange` to the handle, with the identity rule, the clearing rules and the listener rules
- [x] 5.5 Make a selection set the cursor to the system and the distance to `min(distance, 500)`, leaving the yaw and the pitch, and raise the view listeners once
- [x] 5.6 Write the browser tests for every scenario of the two selection requirements of `system-selection`, including the far selection that comes in to 500, the close view that keeps its distance, and the system centred within 1 CSS pixel. Verify `pnpm test:e2e` passes

## 6. The overlay marks

- [x] 6.1 Add `src/app/markers.ts` that places the hover ring, the selection pin and the name labels in the label host, reusing `boxesOverlap` from `src/app/labels.ts`
- [x] 6.2 Draw the pin as an inline SVG path from the eight points the `system-selection` spec gives, filled `#00CDF7` with a 1 CSS pixel `rgba(2, 10, 26, 0.9)` outline, 28 CSS pixels high, its tip `markerCssSize / 2 + 2` above the marker centre
- [x] 6.3 Draw the hover ring as a circle of `markerCssSize * 3.2` CSS pixels, floor 24, 1 CSS pixel white at alpha 0.5
- [x] 6.4 Place the name labels: viewport cull, the 64 nearest the camera chosen without a full sort, the overlap skip, and the hover and selection labels that ignore the switch
- [x] 6.5 Add `setSystemNamesVisible` and `areSystemNamesVisible` to the handle
- [x] 6.6 Write the unit tests for the 64 nearest selection and for the label offset rule. Verify `pnpm test` passes
- [x] 6.7 Write the browser tests for the pin, the ring and the labels, including the pin that follows the marker through an orbit and the label count capped at a full set. Verify `pnpm test:e2e` passes

## 7. The coordinate grid

- [x] 7.1 Add the spacing rule as a pure function: the smallest value of the 1-2-5 sequence from 1 to 100,000 light years whose on-screen spacing is at least 40 CSS pixels
- [x] 7.2 Write the unit tests for the spacing at 10, 100, 1,000, 10,000 and 120,000 light years and for the sweep that holds every reading in 40 to 100 CSS pixels at 1,080 and at 400 CSS rows. Verify `pnpm test` passes
- [x] 7.3 Add `src/render/grid-pass.ts` with `src/render/shaders/grid.vert` and `grid.frag`: 129 lines per axis centred on the cursor, clipped to the model bounds, rebased on the processor in `float64`, one draw call of at most 516 vertices
- [x] 7.4 Give a line 1 device pixel in `rgba(255, 154, 60, 0.10)`, every fifth line 0.20, and a fade to zero alpha at 64 spacings
- [x] 7.5 Draw the pass after the tone map and before the region overlay and the marker pass, add a `grid` pass switch to the renderer, and add `grid` to `GalaxyMapOptions` with `setGridVisible` and `isGridVisible` on the handle
- [x] 7.6 Write the browser tests for the grid: the fixed vertex count, the grid that follows the cursor, the model bound clip, the overlays drawing over it, the fade at the edge and every fifth line. Verify `pnpm test:e2e` passes
- [x] 7.7 Verify the committed baseline image still matches with the grid off, by `pnpm test:e2e e2e/look.spec.ts`

## 8. The region name on the handle

- [x] 8.1 Add `regionNameAt(point)` to the handle, reading the coarse region grid, ignoring the point's `y`, and returning null before the scene data loads
- [x] 8.2 Write the browser tests for the three scenarios of `galactic-regions`, checking Sol gives `Inner Orion Spur` and the galactic centre gives `Galactic Centre`. Verify `pnpm test:e2e e2e/regions.spec.ts` passes

## 9. The HUD shell

- [x] 9.1 Add `src/hud/` with a builder that takes the map handle and the options and returns the HUD handle of `element` and `refresh`
- [x] 9.2 Add the style sheet as one `<style>` with the id `gm-hud-styles`, added once per document, every rule under `.gm-hud`, with the font faces from the two packages and a fallback stack
- [x] 9.3 Add `hud` to `GalaxyMapOptions`, load `src/hud/` by dynamic import when the option asks for it, await it before `ready` settles, and expose `hud` on the handle
- [x] 9.4 Make the root take no pointer events and each panel take them, and stop a wheel or a drag on a panel from reaching the map
- [x] 9.5 Remove the HUD the library built on `dispose`, leaving a `host` the caller gave
- [x] 9.6 Write the browser tests for the shell: no HUD by default, the HUD in the canvas's parent, the single style element, the HUD makes no third-party request, the HUD gone on dispose, and the three input scenarios. Verify `pnpm test:e2e` passes

## 10. The HUD panels

- [x] 10.1 Build the top bar with the title, the region name from `regionNameAt` of the cursor, the zoom distance in whole light years with a separator and `LY`, and the reset view button, rewriting the view-driven text at most 10 times a second
- [x] 10.2 Build the category browser: a row per category with its colour, name and primary-category count, the row toggle, the ALL and NONE buttons, and the category description as the row's `title`
- [x] 10.3 Build the search box, calling `setNameFilter` at most once per 150 ms while typing and once after the user stops
- [x] 10.4 Build the expanded system list: one category at a time, alphabetical, capped at 200 rows with a line that says how many of how many, each row showing the distance from Sol, and a click that selects and turns the category on
- [x] 10.5 Build the map options panel: the three region mode buttons, the system names switch and the coordinate grid switch, each showing the state the map is in
- [x] 10.6 Build the information panel: the header and close button, the field grid that leaves out what the record does not carry, the category chips, the description, and the footer with centre view and the `actions` buttons, guarding a throwing `onSelect`
- [x] 10.7 Build the image thumbnails and the lightbox, with `loading="lazy"`, `referrerpolicy="no-referrer"` and a placeholder that keeps the caption when an image fails
- [x] 10.8 Add the document `Escape` listener that closes the lightbox first and then clears the selection
- [x] 10.9 Make every HUD control a `button` or an `input`, in reading order, with an accessible name and `aria-pressed` where it holds a state, and give the lightbox its focus trap and focus return
- [x] 10.10 Write the browser tests for the top bar, the category browser, the search box, the expanded list, the map options panel and the information panel. Verify `pnpm test:e2e` passes
- [x] 10.11 Write the browser tests for the lightbox, for `Escape` unwinding one step at a time, and for the four keyboard scenarios of `map-hud`. Verify `pnpm test:e2e` passes

## 11. The demo page

- [x] 11.1 Turn the HUD on in `src/app/main.ts` with one `actions` entry, and check `pnpm dev --host 0.0.0.0` shows the panels over the demo data
- [x] 11.2 Add `description`, `primaryStar` and `images` to a few records of `src/app/demo-systems.json` so the panel's sections can be seen, and check the panel shows each
- [x] 11.3 Add the new handle members to the test hooks in `src/app/main.ts` and `e2e/global.d.ts`

## 12. Budgets and the whole suite

- [x] 12.1 Add `selectionSampling()` to the page, as `labelSampling` already does, and verify the mean is 2 ms or less over 120 frames with 10,000 systems, the name switch on and the pointer on a marker
- [x] 12.1a Add `frameIntervalStats()` and `resetFrameIntervalStats()` to the page, reading the interval between animation frames, and verify a still map at 1920x1080 reads a mean of 15 to 18 ms. The reading is the guard on the instrument: if it falls below 15 ms the browser is not pacing animation frames to the display, and every 18 ms budget in this change is void until that is fixed rather than passing by default
- [x] 12.2 Verify the mean animation frame interval is 18 ms or less at 1920x1080, once with 10,000 systems and the selection work running, and once with the HUD on, a category expanded and a system selected
- [x] 12.2a Verify the grid's draw time with `measureFrames` is at most 1 ms over the same view with the grid off, at a pitch of 5 degrees and at 89
- [x] 12.3 Verify the HUD writes no DOM over 120 still frames, and that its element count with 10,000 systems in one expanded category is under 600
- [x] 12.4 Run `pnpm lint`, `pnpm build`, `pnpm test` and `pnpm test:e2e` and report each result as it was

## 13. Documentation

- [x] 13.1 Update `README.md`: the `hud` and `grid` options, the new handle members, the three record fields, the selection view rule, and the click-to-select control in the controls table
- [x] 13.2 Update `docs/roadmap.md`: mark phase 4 as implemented, record what it does, and answer all three of its open questions -- selection moves the cursor and caps the distance at 500 light years, the selection does not go in the URL fragment, and every HUD control works from the keyboard

## 14. Review gate

- [x] 14.1 Run the tests yourself, then launch the `openspec-implementation-reviewer` subagent with the change id, act on its verdict, and report the verdict and every finding when presenting the work
- [x] 14.2 Launch a read-only look reviewer that screenshots `.design/Galaxy Map HUD.dc.html` and the running HUD at the same viewport, compares the layout, the wording, the colour, the spacing and the typography, and reports each difference. The spec wins where the mockup and a spec disagree. Act on its findings and report them with the implementation gate's
