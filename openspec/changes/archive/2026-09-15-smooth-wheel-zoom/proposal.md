## Why

A wheel notch moves the camera in one frame. `zoomByNotches` writes
`distance / 1.15` straight into the view, so two frames that the map draws 16
milliseconds apart are 15 percent apart in scale. Every other camera move on the
map takes time: a selection flies for 350 ms, and a region label walks to its
place under a filter. The wheel is the only input that moves the camera in one
frame.

The jump also costs the region labels. `galactic-regions` records that a single
notch "changes the camera distance by 15 percent in a single frame, which throws
the anchor of a label near the edge a little outside the frame". The label filter
was widened to hold that case. A wheel that moves the camera over several frames
gives the same filter a smaller step to answer.

The zoom must stay fast. The user asked for a natural zoom at **the same speed as
the galactic region labels**, not a slow one.

## What Changes

**The wheel feeds a target, and the camera glides to it.**

- A wheel notch SHALL set a **target distance** of `target / 1.15^notches`, clamped
  to 10 to 120,000 light years, and SHALL NOT write the view's distance. The notch
  divides the target it already holds, so a held wheel keeps the 1.15 step per
  notch and does not lose steps to the camera's own lag.
- Each frame the camera SHALL move a part of the way from its distance to the
  target, in **log distance**, so the zoom moves by a constant factor for each unit
  of time. This is the rule `flightAt` already uses for the selection flight.
- The remaining gap SHALL fall by **half every 50 milliseconds**, and the camera
  SHALL move by at least **2 wheel notches a second**, so the glide lands on the
  target exactly and does not creep. One notch lands in **217 milliseconds** at 60
  frames a second, which is the figure `galactic-regions` records for a region
  label: "within 8 CSS pixels of that middle at frame 13, which is 217
  milliseconds". The whole 68 notch sweep from 120,000 to 10 light years lands in
  **517 milliseconds**.
- Both parts of the step read the frame time, so the glide takes the same
  **217 milliseconds** at 144 frames a second (215) and at 30 (233). It is not a
  fixed count of frames.
- **Reduced motion.** Where the browser reports `prefers-reduced-motion: reduce`,
  a notch SHALL write the distance in the frame it arrives and no glide SHALL run,
  by the same rule the selection flight already holds.
- Anything else that writes the distance — `setView`, the URL fragment, a
  selection flight — SHALL end the glide and keep its own value. Only the wheel
  glides.
- `debug` SHALL carry `zoomTargetLy()` so a browser test can wait for a glide to
  land instead of waiting a fixed time.
- The MODIFIED block also repairs one word of the base text. "Zoom with limits"
  reads "Each wheel notch SHALL **multiply** the distance by 1.15", which
  contradicts its own scenario "Zoom in": one forward notch at 20,000 gives 17,391,
  which is a division. The block reads "divide the target distance by 1.15".

**BREAKING to the handle's timing, not to its shape.** `getView().distance` right
after a wheel event now reports the distance the camera still has. It reports the
target only after the glide lands. No member is added to or removed from the
supported surface.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `map-navigation`: "Zoom with limits" states the target rule and the limits on the
  target; a new requirement states the glide, its speed, its landing, reduced
  motion, and what ends it.

## Impact

**Code.**

- `src/camera/controls.ts` — `zoomByNotches` is replaced by two pure functions,
  `zoomTarget` and `zoomStep`. `attachControls` holds the target, the wheel handler
  sets it, and `update` steps the camera toward it each frame. A new
  `reducedMotion` option and two new handle members, `zoomTargetLy` and `endZoom`.
- `src/app/create-map.ts` — passes `reducedMotion` to `attachControls`, ends the
  glide where it ends the flight (`takeView` and the handle's `setView`), and
  reports `zoomTargetLy` on `debug`.
- `src/camera/controls.test.ts` — the three zoom tests read `zoomTarget`, and new
  tests read `zoomStep`.
- `e2e/selection.spec.ts` — "a wheel notch ends the flight" asserts the distance
  after the glide lands and not inside the event's own task.
- `e2e/navigation.spec.ts` — tests that the wheel glides, lands, ends on a host
  write, and raises the view change listeners once a frame and not on the event.
- `src/render/global.ts` and `src/app/main.ts` — `zoomTargetLy` reaches the demo
  page's own global, beside `selectionFlightMs`.
- `README.md` — the `Wheel` row of the control table.
- `docs/roadmap.md` — the camera decision of phase 1.

**Scale.** The glide reads and writes one number a frame and touches no system
data, so it does not follow the 10,000 system cap or the 400 billion system galaxy.
It adds two logarithms, one power and one exponential a frame, against the frame
budget of 16.7 ms the tree already states.

**Ordering.** This change touches `map-navigation` alone.
`overlay-blend-and-precision` is in flight and touches `coordinate-grid`,
`galactic-regions` and `map-hud`, so the two changes share no requirement and can
be applied in either order.

**Not in scope.**

- **The region label filter, its reach and its measured numbers.** They do not
  change, and no delta here touches `galactic-regions`.

  One sentence of that capability does need a repair. It justifies the label's
  reach with "a wheel notch changes the camera distance by 15 percent in a single
  frame". After this change a single notch changes it by at most 2.93 percent in a
  frame at 60 frames a second, but a **held** wheel still reaches 15 percent a
  frame in the steady state, so the reach is still needed and every recorded worst
  reading is still an upper bound.

  The repair is to name the held wheel, which is **true before this change as well
  as after**. It is therefore not a delta of this change and creates no order
  between this change and `overlay-blend-and-precision`, which already rewrites the
  requirement that holds the sentence. A second MODIFIED block here would create
  that order, and whichever change archived second would revert the other. Task 8.4
  carries the repair to whichever text is live at the time.
- The selection flight. It keeps its 350 ms and its ease.
- The orbit and the movement keys. A drag already follows the pointer and a held
  key already moves over time.
- The zoom factor, the limits, and the near plane rule. 1.15 per notch and 10 to
  120,000 light years do not change.
