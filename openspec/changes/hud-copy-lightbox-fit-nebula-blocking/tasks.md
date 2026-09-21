## 1. The information panel's readouts become selectable

- [x] 1.1 Add the `user-select: text` rules for `.gm-hud__info-name`,
      `.gm-hud__field-value`, `.gm-hud__description` and `.gm-hud__chip` to
      `packages/galaxy-map/src/hud/styles.ts`, each with its `-webkit-` partner, and
      verify `pnpm lint` and `pnpm format` pass with no hand formatting
- [x] 1.2 Add a browser test to `e2e/hud.spec.ts` that reads the computed `user-select` of
      the system name, every field value, the description, a host section and every
      category chip, and verify each reads `text`
- [x] 1.3 Add a browser test that reads the computed `user-select` of the field labels, the
      section titles, the close button, the copy buttons, the footer buttons and the
      thumbnails, and verify each reads `none`
- [x] 1.4 Add a browser test that opens the category browser, the map options panel and the
      dataset dialog and reads the computed `user-select` of the text inside each, and
      verify each reads `none`
- [x] 1.5 Add a browser test that selects the `POSITION` field's value through the
      document's selection and verify the selection text equals the value the field shows
- [x] 1.6 Add a browser test that reads the view, drags 120 pixels across the panel's
      description and reads the view again, and verify the cursor, the distance, the yaw
      and the pitch are unchanged
- [x] 1.7 Run `pnpm exec playwright test e2e/hud.spec.ts` with `GALAXY_MAP_E2E_BUILT=1` and
      verify the five new tests pass

## 2. The lightbox fits the picture

- [x] 2.1 Rewrite the frame rules in `styles.ts`: drop `width`, `aspect-ratio` and the
      absolute image, make `.gm-hud__lightbox-frame` a shrink-to-fit flex box with
      `min-width: 260px` and `min-height: 160px`, and make `.gm-hud__lightbox-image` a flow
      child with `display: block`, `width: auto` and `height: auto` and **no** size cap of
      its own, because the cap is inline and would beat the rule anyway; verify the box
      still opens and closes in the dev server
- [x] 2.2 Add the one size to `packages/galaxy-map/src/hud/lightbox.ts`: on `open` and on
      `load`, write `style.width` and `style.height` as the natural size times one scale,
      which is the least of the room cap (`clientWidth * 0.86` capped at 1180, and
      `clientHeight * 0.82` of the lightbox element, each over the natural size) and the
      `devicePixelRatio`, and write no size at all for a natural size of 0; verify a unit
      test beside it reads the two values it writes for a 400 by 300 image at ratios 1 and
      2, and for a 4,000 by 3,000 image in a 1280 by 720 box
- [x] 2.3 Add the `resize` listener that applies the cap again while the box is open, and
      remove it on close; verify a unit test reads that the listener is added on `open` and
      removed on `close`
- [x] 2.4 Write the size when the box opens, after the box is shown, so neither the size of
      the picture before it holds the new one nor a picture the box already holds keeps a
      stale size; verify a unit test opens the box on two pictures of different sizes and
      reads the size after the second, and a browser test opens the box twice on the same
      picture and reads the drawn size after the second
- [x] 2.5 Add a fixture image of 4,000 by 3,000 pixels to `e2e/fixtures` (or serve one from
      the existing fixture route) and verify the fixture loads in a page
- [x] 2.6 Add browser tests to `e2e/hud.spec.ts` for the four size scenarios: the 400 by 300
      image at ratio 1 draws 400 by 300, the frame is no more than 48 pixels larger on each
      axis, the same image at `deviceScaleFactor: 2` draws 800 by 600, and the 4,000 pixel
      image stays inside 1180 pixels and 82 percent of the height at a 4 to 3 ratio
- [x] 2.7 Add a browser test that opens the box on a URL that cannot load and verify the
      frame is at least 260 by 160 CSS pixels with the caption in the placeholder
- [x] 2.8 Run the existing lightbox tests in `e2e/hud.spec.ts` and verify the ones that read
      the lightbox alpha, the placeholder and the focus return still pass

## 3. A nebula blocks by its range

- [x] 3.1 Add `DEFAULT_NEBULA_BLOCK_NEAR` (500), `DEFAULT_NEBULA_BLOCK_FAR` (6000),
      `DEFAULT_NEBULA_BLOCK_GAIN_NEAR` (0.7) and `DEFAULT_NEBULA_BLOCK_GAIN_FAR` (2.0) to
      `packages/galaxy-map/src/render/nebula-slot.ts`, with the four frame members beside
      them, and update that file's header comment, which states the count of constants and
      of literals it holds; verify `tests/` still reads that the module imports nothing and
      that the built entry chunk holds no nebula code
- [x] 3.2 Add the four `LookSettings` fields and the reader that drops a value that is not
      finite or is below 0, in `renderer.ts`, at the site where the uniform is set; verify
      a unit test reads the four values the renderer sends for inputs that are not finite,
      below 0 and inside range
- [x] 3.3 Compute the range gain in `nebulae.vert` from `length(centre)` and the four
      uniforms, and pass it as a varying; verify the program still links in
      `nebula-pass.test.ts`
- [x] 3.4 Apply `pow(transmittance.a, gain)` in `nebulae.frag`, with the `gain == 1.0`
      branch; verify a unit test reads that the alpha rule gives 0.5 for a transmittance of
      0.5 at a gain of 1
- [x] 3.5 Send the four uniforms from `nebula-pass.ts`; verify `nebula-pass.test.ts` reads
      the four values the pass sends, and that the defaults arrive when the frame carries
      none
- [x] 3.6 Add a browser test to `e2e/nebulae.spec.ts` that reads one record from a camera
      inside the near range and from one beyond the far range, with the occlusion at 0 and
      the light gain at 0, and verify the far block is darker
- [x] 3.7 Add the continuity sweep to `e2e/nebulae.spec.ts`: one held camera, 200 pairs of
      frames through both ranges, each pair read by scaling both ranges by 1 over 1.01, and
      verify no pair differs at any pixel by more than 12. The camera-moved form was read
      and cannot answer this requirement: a 1 percent move gives a worst pair of 410, and
      378 with both gains held at 1, which is the shader this change starts from. The
      spec delta carries the readings summed over the three channels
- [x] 3.8 Add the browser reading that holds one camera and reads the block at both gains
      set to 1 and then at both gains set to 2, with the occlusion at 0 and the light gain
      at 0, and verify the block at the gain of 2 is darker. There is no comparison against
      "the tree before this change": at a gain of 1 the shader takes the path it takes
      today, so such a frame can only be compared with itself, and 3.4 is what states the
      identity
- [x] 3.9 Add a unit test that reads the emission the pass sends at the near gain and at the
      far gain, and verify the two are equal

## 4. A nebula attenuates the point cloud and the star field

- [x] 4.1 Add `transmittance`, `frontRange` and `centreRange` to the `NebulaDraw` interface
      in `nebula-slot.ts`; verify the entry-chunk test still passes
- [x] 4.2 Set the three in `nebula-pass.ts`: null the texture at the top of `draw`, set it
      after the composite, and compute the two ranges over the drawn instances from
      `instance.range` and `set.radii[instance.index]`, because `NebulaInstance` carries the
      range and the index and not the radius; verify a unit test reads them for a frame that
      drew records, a frame above the band and a frame whose selection kept nothing
- [x] 4.3 Add the transmittance sampler, the range pair and the inverse target size to
      `point-pass.ts` and `points.vert`/`points.frag`, with the `share > 0.0` guard around
      the fetch; verify `renderer.test.ts` reads the uniforms the renderer sends
- [x] 4.4 Do the same for `star-pass.ts` and `stars.vert`/`stars.frag`; verify the star
      program links and its unit tests pass
- [x] 4.5 Wire the renderer: hand the three readings to both passes after the nebula draw,
      and send `vec2(1e30, 2e30)` and no texture for a frame that drew no record. The two
      edges must not be equal: `smoothstep` is undefined for `edge0 >= edge1` and a NaN
      would turn every sprite black. Verify a unit test reads both the range pair and the
      null texture the two passes are sent for a view above the band
- [x] 4.6 Add a browser test to `e2e/nebulae.spec.ts` that reads a block of the point cloud
      behind a dense record, with the volume and cloud switches off and the light gain at 0,
      and verify the block is darker with the nebula switch on
- [x] 4.7 Add the test that reads a block of the point cloud nearer than the reported front
      range, and verify the two readings agree to six places
- [x] 4.8 Add the star field test at a zoom distance inside both the band and the field's
      range, and verify the block is darker with the nebula switch on
- [x] 4.9 Add the stale-frame test: draw a frame inside the band, move above the band, draw
      again, and verify the second reading matches the same view drawn on its own to six
      places

## 5. The cost and the baselines

- [x] 5.1 Run `e2e/look.spec.ts` and verify the default view still matches the baseline
      image with the nebulae on
- [x] 5.2 Run `e2e/nebula-cost.spec.ts` and verify the pass alone stays inside 0.78 ms at 60
      light years, 0.76 ms at 120 and 0.72 ms at 260, as the median of five runs of 120
      frames at 1,280 by 720 with every other pass off. These three bounds are not the
      implementation's to move: if a reading exceeds one, stop and report the reading rather
      than restating the bound
- [x] 5.3 Run `e2e/frame-budget.spec.ts` and verify the six far views stay under 16.7 ms over
      300 frames with the nebulae on
- [x] 5.4 Run `e2e/stars.spec.ts` and verify the six close views stay under 16.7 ms over 300
      frames with the nebulae on
- [x] 5.5 Assert the hardware renderer in each new browser test run by reading
      `WEBGL_debug_renderer_info`, and verify no run fell back to SwiftShader or llvmpipe

## 6. Close out

- [x] 6.1 Run `pnpm lint`, `pnpm format` and `pnpm test` at the root and verify all pass
- [x] 6.2 Run `pnpm test:package` and verify the built package still keeps the nebula code
      out of the entry chunk
- [x] 6.3 Run the full `pnpm test:e2e` once, on one Playwright run, and verify the suite
      passes; report any failure with its output
- [x] 6.4 Launch the `openspec-implementation-reviewer` subagent with this change id, wait
      for its verdict, fix anything it blocks on, and re-run the gate until it does not
      block
