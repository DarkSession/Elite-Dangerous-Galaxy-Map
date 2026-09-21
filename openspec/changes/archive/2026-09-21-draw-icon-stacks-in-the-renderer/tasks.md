## 1. Move the stack geometry out of the overlay

- [x] 1.1 Create `packages/galaxy-map/src/scene-data/icon-stack.ts` and move
      `ICON_CSS_SIZE`, `ICON_GAP_CSS`, `ARROW_WIDTH_CSS`, `ARROW_HEIGHT_CSS`,
      `MAX_ICON_STACKS`, the selection lift, `arrowApexCss` and `iconBottomCss` into it from
      `src/app/markers.ts`. Verify `pnpm test` passes with the existing marker unit tests
      re-pointed at the new module.
- [x] 1.2 Add `icon-stack.test.ts` beside it, covering the stack bottom at index 0 to 3, the
      arrow apex, and the 28 pixel lift for a selected system. Verify the new tests pass.
- [x] 1.3 Re-export the moved names where a test or the demo reads them, or update those
      readers. Verify `pnpm lint` reports no unused and no missing export.

## 2. Let the set name the systems that carry an icon

- [x] 2.1 Add `iconIndices` and `iconIndexCount` to `RealSystemSet` in
      `src/scene-data/real-systems.ts`, filled as a record with icons is added or replaced,
      with the same "high and never low" rule `iconSystemCount` states.
- [x] 2.2 Extend `real-systems.test.ts`: a set with no icon reports a count of 0; a set with
      three icon records names those three indices; a record replaced by one with no icons
      leaves its index in the list. Verify the tests pass.

## 3. Load and rasterise the vectors

- [x] 3.1 Create `src/render/icon-textures.ts`: a `TEXTURE_2D_ARRAY` of `RGBA8`, 64 layers,
      side `min(128, round(28 * pixelRatio))`, one layer per distinct URL, with a state of
      pending, ready or failed per URL.
- [x] 3.2 Load each URL through an `Image` with `crossOrigin` set to `anonymous`, `decode()`
      it, draw it into a 2D canvas at the layer side and upload with `texSubImage3D`. Verify
      by unit test against a fake context that one URL uploads once and a second request for
      the same URL uploads nothing.
- [x] 3.3 Warn once per URL that fails to load, never ask for it again, and never throw out
      of the frame. Warn once when a 65th distinct URL arrives, and draw nothing for it.
      Verify both with unit tests that count the warnings and the load attempts.
- [x] 3.4 Rebuild the array when the device pixel ratio changes. Verify by unit test that a
      ratio change re-uploads every ready layer at the new side.

## 4. Draw the pass

- [x] 4.1 Create `src/render/shaders/icons.vert`, `icons.frag`, `arrows.vert` and
      `arrows.frag`. The vertex shaders take a unit quad corner and a per-instance box in
      device pixels. The fragment shaders sample the texture array or work out the triangle
      coverage with a one-pixel ramp.
- [x] 4.2 Put the range test in both fragment shaders: read `uRange` with `texelFetch` at
      `gl_FragCoord`, and discard where the value is below `vRange * (1.0 - 1e-5)`. Skip the
      test where `uHasRange` is 0.
- [x] 4.3 Create `src/render/icon-pass.ts` with `prepare(frame)` and `draw(frame)`.
      `prepare` walks `iconIndices`, applies the marker flag and the category draw range
      from the cursor, culls to the viewport, keeps the nearest 32 and writes the instance
      boxes rounded to whole device pixels. It returns the stack count.
- [x] 4.4 Make `prepare` build each kept system's offset with `Math.fround` per axis and its
      range from that offset. Verify by unit test that the three offset values are bit for
      bit what `rebasePositions` writes for the same position and camera, at 50 and at
      120,000 light years, and that the 1e-5 bias is above the `float32` relative step of
      1.2e-7.
- [x] 4.5 Make `draw` order the stacks furthest first and issue at most one draw call.
      Verify with a unit test against a fake context that 32 stacks of 4 icons make 1 call.
- [x] 4.6 Add `icon-pass.test.ts` for the placement rule: the box of each icon of a stack of
      four, the arrow box, the selection lift, the viewport cull and the nearest-32 keep.

## 5. Wire the pass into the renderer and the handle

- [x] 5.1 Call `iconPass.prepare` before the marker pass draws, and widen the `rangeTarget`
      condition to `spheres > 0 || segments > 0 || stacks > 0`.
- [x] 5.2 Add a `renderer.test.ts` case for that condition: a frame with a stack and no
      shape allocates the range buffer, a frame with a shape and no stack allocates it, and
      a frame with neither allocates nothing.
- [x] 5.3 Call `iconPass.draw` after the shape pass, with the range texture or null.
- [x] 5.4 Add a `renderer.test.ts` case for the fallback: a context that reports
      `EXT_color_buffer_float` alone and one that reports `EXT_float_blend` alone both read
      a null range buffer, both draw the icon, and neither throws.
- [x] 5.5 Add `iconPlacements()`, `iconDrawCalls()` and the icon switch to the renderer, and
      expose them on the handle in `src/app/create-map.ts`. Verify `pnpm test:package`
      passes with the public type test updated.
- [x] 5.6 Take the icon pool, the arrow pool, the stack layer and the icon keeper out of
      `src/app/markers.ts`, and take `iconCount()` and `arrowCount()` off `MarkerOverlay`.
      Verify no `.gm-system-icon`, `.gm-system-arrow` or `.gm-system-stacks` element is left
      in the tree.

## 6. Give the name labels their occlusion rule

- [x] 6.1 Call `covered()` for each placed name label in `src/app/markers.ts`, skipping the
      hovered and the selected index and the label's own index, and set `visibility`.
- [x] 6.2 Keep a hidden label in the pool, in its place and in the count. Verify with a unit
      test that `labelCount()` is the same with and without a covering marker.

## 7. Build the second origin the cross-origin tests need

- [x] 7.1 Add `e2e/fixtures/icon-origin-server.mjs`: a Node static server that serves one SVG
      at `/cors/icon.svg` with `Access-Control-Allow-Origin: *`, the same file at
      `/no-cors/icon.svg` with no such header, and counts the requests per path at
      `/requests`. Verify by running it and reading both routes with `curl -i`.
- [x] 7.2 Add it as a second `webServer` entry in `playwright.config.ts`, on a port of its
      own, so the suite has two origins. Verify `pnpm test:e2e` starts both servers. The port
      is fixed, as 4173 is, so a stale run holds it: the project's one-Playwright-run-at-a-time
      rule now covers two ports.

      A fixture served by the demo site itself is same-origin and tests neither branch, and
      `localhost` against `127.0.0.1` gives a second origin but no way to withhold the
      header. Two routes on a second port is what covers both.

## 8. Rewrite the browser tests

- [x] 8.1 Rewrite the placement half of `e2e/system-icons.spec.ts` against `iconPlacements()`:
      the record order, the offset, the 2 pixel gap, the selection lift, the category switch,
      the camera move, the fixed size, the whole device pixels and the pick.
- [x] 8.2 Rewrite the occlusion half against canvas pixels: the cut, the further marker, the
      part of a stack, the arrow, a system's own stack and the return when the marker moves.
      Each reading counts the pixels of a known glyph colour inside the box, because the
      plate is black and a dark reading also passes with no icon drawn.
- [x] 8.3 Add the cross-origin tests against the two routes of task 7.1: the route with the
      header draws, the route without it does not and warns once, and the failed URL is
      requested once, read from the server's own request count.
- [x] 8.4 Add the bound tests: 128 icons and 32 arrows at a full set, 1 draw call, the
      nearest 32, the off-screen cull, the 65th distinct vector and the empty overlay.
- [x] 8.5 Add the draw budget test to `e2e/frame-budget.spec.ts`, which `playwright.config.ts`
      holds in `timedSpecs` and runs serialised: 10,000 systems at 4 icons each, the render
      measurement function over 300 frames at 2,000 and 20,000 light years, each mean under
      16.7 ms, with at least one placement in the same frame. Not `e2e/system-icons.spec.ts`,
      which runs in parallel beside other browsers and would read a timing under load.
- [x] 8.6 Update `e2e/hud.spec.ts`: the icon switch test at line 2323 counts placements, and
      the HUD stacking test at line 2357 reads the element at the point of the icon instead
      of a `z-index`.
- [x] 8.7 Update `e2e/frame-budget.spec.ts`: the icon reading at line 534 no longer counts
      DOM elements, and the icon budget case reads the frame interval statistics rather than
      the selection work statistics, which no longer see the placement.
- [x] 8.8 Add the name label occlusion tests to `e2e/selection.spec.ts`: the hide, the further
      marker, a system's own label, the hovered and the selected label, the count, and the
      return. Not `e2e/labels.spec.ts` — `playwright.config.ts` holds it in `timedSpecs`, which
      runs serialised on one worker, so a behaviour test there costs wall clock in a timing
      pass.
- [x] 8.9 Update `e2e/paint-cost.spec.ts` and the Firefox budget reading for an overlay that
      holds no icon element. Verify the mean frame interval still holds 7 ms.
- [x] 8.10 Run the screenshot baselines and **look at the new picture before accepting it**.
      The pass reverses the paint order against the plane elements, the ring, the pin and the
      name labels, so a difference there is a real change and not a sub-pixel move. State in
      the change what moved and why it is right.
      *Nothing moved.* `e2e/look.spec.ts` compares the default view, which holds no icon
      stack, no pin and no selection, so none of the four reversed elements meets a stack
      there. The baseline matched and was not written again.

## 9. Order the arrow with the icons

The two draw calls put every arrow over every icon, so a further stack's arrow draws on a
nearer stack's icon plate. The order must follow the range, as it does between two icons.

- [x] 9.1 Merge `icons.vert`/`icons.frag` and `arrows.vert`/`arrows.frag` into one program
      over one instance layout. Add a `kind` attribute: 0 for an icon, 1 for an arrow. An
      icon carries its texture layer, an arrow carries its fill colour. Keep the range and
      the box on both. Keep both fragment paths as they are, including the arrow's one-pixel
      edge ramp and the range test both already run.
- [x] 9.2 Make `prepare` write one instance stream, the arrow of a stack before its icons,
      walking the stacks furthest first. Delete the second instance buffer and the second
      vertex array.
- [x] 9.3 Make `draw` issue one `drawArraysInstanced` with the blend on
      (`SRC_ALPHA, ONE_MINUS_SRC_ALPHA`). The icon plate is opaque, so the blend writes what
      the plate wrote before. Make `drawCalls` report 1.
- [x] 9.4 Update `icon-pass.test.ts`: the draw call count is 1, and the instance order of a
      two-stack frame is the further stack's arrow, its icons, then the nearer stack's arrow
      and its icons.
- [x] 9.5 Add the browser test for the scenario "A nearer stack's icon draws over a further
      stack's arrow" to `e2e/system-icons.spec.ts`, beside the test for the two crossing
      icons. Place the further system so its arrow falls on the nearer system's plate, and
      read the canvas pixel where they cross.
- [x] 9.6 Update the draw call assertion in `e2e/system-icons.spec.ts` from 2 to 1.

## 10. Documentation and close

- [x] 10.1 State the cross-origin rule for icon URLs in `README.md` and beside the `icons`
      field documentation, and mark it a breaking change in the package's release notes.
- [x] 10.2 Run `pnpm lint`, `pnpm test`, `pnpm test:package` and `pnpm test:e2e` and report
      the results as they are. Run one Playwright job at a time.
- [x] 10.3 Run the `openspec-implementation-reviewer` subagent, fix what it blocks on, and
      report its verdict and findings with the work.

## 11. Close the implementation gate

The `openspec-implementation-reviewer` gate returned BLOCK. Its findings, in its order.

- [x] 11.1 **The block.** Write the browser test the scenario "A marker at the stack's own
      range cuts nothing" asks for: two systems at the **same** range from the camera, the
      second in a category colour no icon uses and projecting inside the first's icon box.
      Assert the glyph count is above zero and that no pixel of the box reads the second
      category's colour. The test that stands there now opens one system, which is the form
      the scenario itself rules out: a lone marker cannot reach its own stack, so it passes
      with the range comparison deleted.
- [x] 11.2 Correct the draw call count in the two doc comments the merge left behind:
      `iconDrawCalls()` in `packages/galaxy-map/src/app/create-map.ts`, which ships to hosts,
      and the same member in `packages/galaxy-map/src/render/renderer.ts`. Both say 2; the
      pass makes 1.
- [x] 11.3 Correct the doc comment on `iconSystemCount` in
      `packages/galaxy-map/src/scene-data/real-systems.ts`. It still names the marker overlay
      fast path, which this change deletes, and it states the old counting rule.
- [x] 11.4 Rewrite the two test names in
      `packages/galaxy-map/src/render/renderer.test.ts` that do not read as Simplified
      Technical English: "and throws not" and "for neither takes nothing".
- [x] 11.5 State in `e2e/paint-cost.spec.ts` which test holds the scenario "The test holds
      the frame budget", which no comment names since the pass moved.

## 12. Draw the glyph the way up the browser draws it

The pass draws every glyph mirrored about the horizontal axis. A probe of the `waypoint`
vector against the browser's own drawing of it counted, out of 784 pixels, 130 differing as
drawn, **18** with the source turned over, 132 with it mirrored across, and 124 with it
turned 180 degrees. The stacks were `<img>` elements before this change, so the turn is new.

- [x] 12.1 Make `icons.frag` read the texture coordinate 0 at the top of the quad. The
      upload leaves `UNPACK_FLIP_Y_WEBGL` at false, so the canvas's first row is already at
      0 and the shader must not turn it over again. Correct the comment, which states the
      opposite. Do not set `UNPACK_FLIP_Y_WEBGL` as well: one or the other, not both.
- [x] 12.2 Add the browser test for the scenario "The glyph draws the way the browser draws
      the vector". Every icon reading in the suite counts colour or reads a corner, so all of
      them are blind to the turn and none would go red. Compare the drawn box with the same
      vector drawn into a 2D canvas, and assert the count of differing pixels is lower as
      they are than with one turned over.
