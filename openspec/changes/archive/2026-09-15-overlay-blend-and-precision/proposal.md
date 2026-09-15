## Why

Three faults in the overlays, reported from the running map against the game's own
galaxy map.

1. **The coordinate grid sits on top of the picture.** The grid draws after the tone map
   at a fixed alpha, so one orange line reads the same over the dark space between the
   arms and over the cream core. The user's words: it "seems that it is on top of it",
   and it should be "a bit more prominent than the environment, but only to some degree".
   The coordinate numbers are worse: `rgba(255, 196, 140, 0.86)` over a hard black text
   shadow is a HUD label pasted on the sky.
2. **The region boundaries draw where they cannot be read.** The overlay is full from
   20,000 light years down to the closest zoom. The `accurate` mode draws the region
   grid's own 49.3494 light year staircase, whose step is about 9 CSS pixels at a zoom of
   5,000 and about 4,600 at a zoom of 10. `library-datasets-and-publishing` patched this
   with a per-pixel fade over the camera's distance to the line, from 200 to 1,500 light
   years. That fade treats the symptom at one zoom and leaves the staircase on the screen
   at every zoom between. The two-tone ribbon with its dark outline is also not the look
   the game draws: the game's boundary is a wide, soft, single-tone band with rounded
   corners.
3. **The panel rounds a system's position.** `POSITION` shows
   `Math.round(x) / Math.round(y) / Math.round(z)`. The game resolves a position to 1/32
   of a light year, and the host's record carries that value in `float64`, so the panel
   throws away data the record already holds.

## What Changes

**The grid and its numbers follow the background under them.**

- The renderer gains a **background reading**: the scene target, tone-mapped once at full
  resolution and then averaged down to about a sixteenth of the frame on each axis, as a
  small texture. It is the local brightness of the finished frame, not the exact pixel, so
  the point cloud's grain does not make a grid line flicker.
- `grid.frag` samples that texture. One exported function turns the local brightness into
  a weight, and the weight scales the level's alpha and pulls the line's colour toward the
  background. A line over dark space keeps its present strength. The same line over the
  bright core keeps a bounded part of it and takes the background's hue.
- The same small texture is read back to the processor once per frame, without a stall,
  and `src/app/grid-labels.ts` reads it at each label's own box. A number takes the same
  weight, so a number and the line it sits on never disagree. The hard black text shadow
  goes; a soft dark glow replaces it.
- The rule is one function in `src/render/grid-pass.ts`, called by the shader through its
  uniforms and by the label module directly, so no second copy of the constants exists.

**The region overlay fades out below 5,000 light years and draws the game's line.**

- The overlay SHALL draw nothing at a zoom distance of 5,000 light years and below, in full
  from 10,000 to 20,000, and nothing again at 30,000 and above, which is the far end it
  already had. The lines and the labels take the same band, so a name never outlives its
  boundary. `labelFade` in `src/app/labels.ts` gains the same near end `regionFade` gains;
  the gate that empties the label overlay and skips its sweep already reads it.
- **REMOVED**: the per-pixel near fade over the camera's distance to the line, from 200
  to 1,500 light years, and the second channel of the coverage buffer that carries it.
  The zoom band is gone before that fade has anything left to do.
- The coverage buffer passes through a **separable blur** before the composite. The blur
  radius is the region grid cell's own size on the screen, capped at 8 CSS pixels, so it
  rounds the 90 degree corners of the `accurate` staircase where they are large and does not
  run where they are small: the pass skips the blur below a radius of 3 CSS pixels, which is
  above about 15,390 light years at 1,080 CSS rows and 10,260 at 720, and `simplified` never
  blurs. Both thresholds are above the zoom at which the fade reaches full opacity, so the
  blur covers every zoom at which the cell is large enough to read as a staircase, on a short
  buffer as well as a tall one. Above them the cell is under half the band's own width.
  The blurred coverage is normalised, so the band's opacity holds at every radius; its width
  does grow with the radius, from 3.0 to 3.5 CSS pixels unblurred to about 4.8 at 10,000
  light years, which is the widest band a user sees at full opacity. The band's half width
  grows from 2 to 3 CSS pixels to carry the wider ramp.
- **BREAKING to the look**: the two-tone ribbon becomes one warm tone with a soft edge,
  which is what the game draws. The dark outline goes.

**The panel shows a position at full precision.**

- `POSITION` shows each coordinate to at most **3 decimal places**, with the trailing
  zeros dropped and the thousands separators kept. The copy text uses the same digits with
  no separators. `DISTANCE FROM SOL` and `RANGE` do not change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `coordinate-grid`: the grid's look follows the background under each pixel; the
  coordinate labels follow the same reading; the renderer carries the background reading
  and a probe for it; the frame budget covers the new pass.
- `galactic-regions`: the overlay fades out below 5,000 light years and the near fade is
  removed; the boundary line is one soft tone through a blurred coverage buffer; the
  labels take the same zoom band.
- `map-hud`: the information panel shows the position at full precision.

## Impact

**Code.**

- `src/render/` — a new background pass, `grid-pass.ts` and `grid.frag` read it,
  `region-pass.ts` and its three shaders lose the near fade and gain the blur,
  `renderer.ts` orders the new pass and exposes the reading.
- `src/app/grid-labels.ts` — the label opacity and the glow follow the reading.
- `src/app/labels.ts` — the region labels take the zoom band. `src/app/create-map.ts` takes
  one edit, and it is not that one: it hands the background reading to the grid labels. The
  region labels need none, because `labelFade` already gates the sweep and the opacity.
- `src/hud/info-panel.ts` and `src/hud/dom.ts` — the position format.
- `e2e/hud.spec.ts` — the position assertions, which the rounded format wrote.
- `e2e/labels.spec.ts` — two region label tests open three views at 500 light years, where no
  label now reaches the screen.
- `e2e/regions.spec.ts`, `e2e/grid.spec.ts`, `e2e/frame-budget.spec.ts`,
  `tests/region-views.ts`, `tests/region-views.test.ts` and `e2e/region-views.ts` — the region
  views are searched again at zooms inside the new band, every search states its reading
  windows in CSS pixels instead of light years, and the two-tone scenarios become one-tone
  scenarios.

**Scale.** The background reading is a fixed fraction of the frame and reads nothing the
host loads, so it does not follow the 10,000 system cap or the 400 billion system galaxy.
The blur runs at the frame's own resolution over a buffer that holds the 123 boundary
chains, which is fixed data, and only in `accurate` inside the close part of the zoom band. The budgets the change is measured against are the ones the
tree already states: 1 ms for the grid, 16.7 ms for the frame.

**Ordering. The condition is met.** The change `library-datasets-and-publishing` rewrote
requirements this change rewrites again in **all three** capabilities: "A region in view
carries a label" and "The region overlay has three modes" in `galactic-regions`, "The grid
carries coordinate labels" and "The grid reports what it drew" in `coordinate-grid`, and "The
information panel shows the selected system" in `map-hud`. That is five requirements. Every
MODIFIED block here is a copy of that change's text with this change's edits on top, and not a
copy of the text that stood before it: a block built on the older text would delete the copy
buttons, the two column field grid and the label placement gate.

`library-datasets-and-publishing` archived on **2026-09-15**, so its text is now the main spec
and this change no longer waits on anything. A reviewer can therefore diff each MODIFIED block
against `openspec/specs/` directly.

**Not in scope.**

- The region labels' own colour and shadow. Only the grid numbers merge with the
  background; a region name stays the label it is.
- The marker name labels and the HUD's own chrome.
- Any change to the far view's look constants. The background reading is read, never
  written back into the scene.
