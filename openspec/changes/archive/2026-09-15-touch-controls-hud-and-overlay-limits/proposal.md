## Why

Seven faults and gaps sit in the map today. They come from three areas.

**Touch.** The map takes a mouse, a wheel and a keyboard. A touch screen reaches only
part of that. A one-finger drag orbits, because a touch pointer reports button 0, and a
tap selects. Nothing zooms and nothing moves the cursor over the galaxy, because both of
those need a wheel or a right button that a touch screen does not have. The map is
therefore not usable on a tablet or a phone.

**The HUD.** Three readings are in the wrong place. The `POSITION` field holds the longest
text of the panel in one column of two, so it wraps. The system list shows a distance from
Sol beside every name, which the user did not ask for and which the information panel
already states. The search box narrows every list, but only one category can be open at a
time, so a user who searches must open each category by hand to find the match.

**The overlays.** Three drawing rules read badly.

- A region label sometimes travels much further across the screen than the map under it.
  The filter that moves it takes a share of the gap **per frame** and caps its speed **per
  frame**, and it reads no elapsed time. A label therefore moves 2.4 times as fast on a 144
  Hz display as on a 60 Hz one, and the cap of 20 CSS pixels a frame lets a label cross a
  1080 row frame in 0.9 seconds while the galaxy under it holds still. Nothing limits how
  far the **target** drifts over the map in one frame: the share grows with the cube of the
  gap and takes the whole gap at 120 CSS pixels. The handover from the region's centre to
  the frame's own samples steps the moment the centre leaves the frame, and the ring search
  that moves a label off a neighbour can name a point 96 CSS pixels away, which the share
  takes 0.585 of in one frame.
- The `accurate` region boundary draws a staircase of whole grid cells. The map answers it
  by taking the whole overlay away below a zoom of 5,000 light years. That reading is one
  number for the frame, so it also takes away the lines near the horizon, which are tens of
  thousands of light years off and carry no staircase a user can see. The blur that rounds
  the staircase runs only where its radius reaches 3 CSS pixels, so it stops at a zoom of
  about 15,400 light years at 1,080 rows and does nothing at the far zooms.
- The coordinate labels of the grid draw at a fixed opacity of 0.80, while the line under
  each one draws at its own alpha, which the gate lets fall to 0.09. A number therefore
  stands nearly nine times as strong as the line it names. The grid is a faint tool for
  reading a neighbourhood, and its numbers read as a HUD pasted over the sky.

## What Changes

- **Touch gestures.** One finger moves the cursor in the galactic plane. Two fingers pinch
  to zoom and drag to orbit. A tap selects, as it does now. **BREAKING** for a touch user:
  a one-finger drag orbits today and moves the cursor after this change.
- **The information panel.** `POSITION` takes both columns of the field grid.
  `DISTANCE FROM SOL` and `RANGE` share the row under it, one column each.
- **The system list.** The distance from Sol leaves the row. The row holds the name alone.
- **The row budget is shared.** The 200 system rows become a budget over every open list
  together, at `floor(200 / open)` rows each. Where more than 200 lists are open, the first
  200 show one row each and the rest show none. The HUD's node count therefore does not
  follow the count of open categories. **BREAKING** for a user with one category open: a
  list that drew 200 rows draws fewer while a filter opens more than one category.
- **The search box.** Every category that holds a system the filter keeps opens by itself
  while the filter text is not empty. Clearing the box gives the panel back to the one
  category the user opened by hand. **BREAKING** for the spec: "at most one category SHALL
  be expanded at a time" no longer holds while a filter runs.
- **The region label filter reads elapsed time.** The share, the least speed and the cap
  become speeds per second, so a label moves the same way at 30, 60 and 144 frames a
  second. The anchor keeps its cap of 1,200 CSS pixels a second, which the spec's measured
  landing times rest on. A new **drift cap** goes on the smoothed target: a target may not
  move more than `carry + 120 * seconds` CSS pixels in a frame, where `carry` is how far the
  map moved the point it already held. A label therefore travels with the map for free and
  drifts over it at 120 CSS pixels a second at most. The share's growth with the cube of the
  gap goes, and so does the whole-take gate at 120 CSS pixels. The handover from the
  region's centre to the frame's own samples takes a hysteresis band, so it does not cross
  back and forth. A frame that writes the view rather than moving it — `setView`, the landing
  of a selection flight, a view read from the URL — takes the frame's own target whole, so a
  jump still settles at once and only the anchor's own cap decides how fast.
- **The region boundary fades by the range of each line.** A fragment of a line fades out
  as the camera comes within 20,000 light years of it, and is gone at 10,000. The zoom band
  that took the whole overlay away below 5,000 light years goes. The far end of the zoom
  band, which fades the overlay out from 20,000 to 30,000 light years, stays. The region
  **labels** keep the zoom band they have, because a label is a name for the region the
  view sits in and not a line on the plane.
- **The boundary blur runs at every zoom in `accurate`.** The kernel's standard deviation
  takes a floor of 1 CSS pixel, so a small radius still smooths, and the radius reads the
  cell at `max(cursorDistance, 10,000)` light years — the cursor, with a floor at the
  nearest range the fade draws.
- **The grid coordinate labels follow their own line.** A label's opacity is multiplied by
  the drawn alpha of its level at its crossing, the reading the placement already takes for
  its gate.

**Non-goals.**

- No new HUD layout for a small screen. The panels keep their size and their place. This
  change gives the canvas its gestures; a HUD that fits a phone is separate work.
- No change to the `simplified` region set, to its Chaikin smoothing or to the traced
  set the workers build. Only the drawing of the traced set changes.
- No change to the marker name labels, to the selection pin or to the hover ring.
- No change to the far view. The committed baseline image must stay byte-identical.
- No gesture for pitch alone, no three-finger gesture and no gesture that writes the yaw
  to a fixed value.

## Capabilities

### New Capabilities

None. Every change modifies a capability that exists.

### Modified Capabilities

- `map-navigation`: a new requirement for the touch gestures. The three requirements that
  hold the mouse rules — "Cursor moves in the galactic plane", "Camera orbits the cursor" and
  "Input does not scroll or select the page" — each say that they are rules for a pointer that
  is not a touch pointer, and the last one names `touch-action`.
- `system-selection`: the requirement that defines what a click selects also names a tap and
  its wider move limit.
- `map-hud`: the field grid gives `POSITION` both columns; the system list drops the
  distance from Sol; the search opens every category that holds a match; the 200 row budget
  is shared over the open lists.
- `galactic-regions`: the label filter reads elapsed time and holds two speed limits; the
  boundary fades by the range of each fragment instead of by the close end of the zoom
  band; the blur runs at every zoom in `accurate`.
- `coordinate-grid`: a coordinate label's opacity follows the drawn alpha of its own line,
  and the scenario that reads the drawing order of the grid and the boundary takes a view the
  range fade still draws the boundary in.
- `close-view-stars`: three readings of the point sprites state that they switch the region
  overlay off. The overlay draws at every zoom under 30,000 light years now, so a reading
  that is not about the overlay says so rather than rest on the old zoom band.

## Impact

**Code.**

- `src/camera/controls.ts`: the touch gestures, and the pure functions a unit test reads
  them through.
- `src/hud/info-panel.ts`, `src/hud/categories.ts`, `src/hud/styles.ts`: the field grid,
  the system row and the open categories.
- `src/app/labels.ts`: the label filter and the target rules.
- `src/app/create-map.ts`: the elapsed time the label overlay reads, and the fade the
  region pass takes.
- `src/render/region-pass.ts` and `src/render/shaders/region-composite.frag`: the range
  fade, the blur radius and the blur floor. The ribbon program `regions.vert` and
  `regions.frag` do not change.
- `src/render/renderer.ts`: the inverse matrix and the camera height the composite reads,
  and the zoom fade it passes.
- `src/app/grid-labels.ts`: the label opacity.
- `e2e/grid.spec.ts`: the view of the test that reads the drawing order of the grid and the
  boundary, which the range fade takes the boundary out of.
- `tests/region-views.ts` and `e2e/region-views.ts`: the four searches that choose the
  browser reading views, which the range fade moves.

**Tests.** New unit tests for every pure function this change adds or moves. New browser
tests in `e2e/` for the gestures, the panel layout, the open categories, the label speed,
the boundary fade and the label opacity. `e2e/look.spec.ts` and its baseline image must
not move.

`playwright.config.ts` holds one project built on `devices['Desktop Chrome']`, which sets
`hasTouch: false`. The touch browser tests need a touch-capable context, so the config takes
a second project that shares the GPU launch arguments and adds `hasTouch: true`. The touch
spec runs in that project alone, and `e2e/look.spec.ts` stays in `chromium-gpu`, so the
baseline image is read by one project as it is now.

**Scale.** Nothing here reads the system set. The label sweep keeps its fixed cost of one
sample grid a frame, the grid label sweep keeps its 289 candidates a frame, and the region
pass keeps one draw of the boundary set. The fade and the blur are per fragment and cost
no more at 400 billion systems than at none, because neither reads a system.

**Risk.** The region range fade replaces a rule that a large part of the
`galactic-regions` spec rests on, and the blur table in that spec holds measured readings.
The implementation must measure the readings again and write down what it found, not
assume the old table still holds.
