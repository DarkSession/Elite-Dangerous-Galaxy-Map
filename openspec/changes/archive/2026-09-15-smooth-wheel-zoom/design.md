## Context

See proposal.md — Why. The current rule is one line in `src/camera/controls.ts`:

```ts
export function zoomByNotches(view: View, notches: number): void {
  view.distance = clampDistance(view.distance / Math.pow(ZOOM_PER_NOTCH, notches));
}
```

and the wheel handler calls it and then raises the view change listeners.

Three parts of the tree already shape the answer.

1. **`src/camera/flight.ts` already glides a distance.** `flightAt` moves the distance as
   `start * (end / start)^eased`, and its own header says "the distance moves by a constant
   factor for each unit of eased time, so the zoom moves the way the wheel moves it." The
   wheel should use the same geometry.
2. **`controls.update(seconds)` already runs once a frame with the frame time.**
   `create-map.ts` calls it from the frame loop with `min((now - previous) / 1000, 0.1)`.
   Today it returns at once when no movement key is held. The glide has a place to run
   with no new wiring in the loop.
3. **The label filter is a per-frame filter, not a per-second one.** `anchorStep(gap)` in
   `src/app/labels.ts` moves half of the gap each frame under a 20 CSS pixel cap, with a
   ramp below 48 CSS pixels and a floor of 0.4. Its units are CSS pixels and its clock is
   the frame. Neither carries over to a camera distance.

## Goals / Non-Goals

**Goals:**

- One rule, stated in log distance, that any number of frames can step and that lands on
  the target exactly.
- The same settling time the region labels are measured at, 217 ms, so the two moves on
  the screen read as one speed.
- No change to the wheel's factor, the limits, the near plane, or the shape of the
  handle.

**Non-Goals:**

- A second filter on the cursor, the yaw or the pitch. A drag already follows the pointer.
- Momentum, inertia or a wheel that keeps going after the user stops. The target is what
  the user asked for and the camera stops there.
- A change to `flightAt` or to `FLIGHT_MS`.

## Decisions

### 1. The glide lives in `src/camera/controls.ts`, not in a new module

`flight.ts` is its own module because `create-map.ts` drives the flight: it holds the
`from`, the `to` and the start time, and it advances the flight in the loop. The glide has
one driver and one reader, and both are inside `attachControls`: the wheel handler sets the
target and `update` steps toward it. A new module would export a state object that only
`controls.ts` builds and only `controls.ts` reads.

`ZOOM_PER_NOTCH` already lives in `controls.ts`, and `src/app/labels.test.ts` and
`src/camera/projection.test.ts` import it from there. Keeping the glide beside it leaves
those two imports alone.

**Alternative rejected:** `src/camera/zoom.ts` with the constant moved into it and
re-exported from `controls.ts`. That is a re-export to keep two test files compiling, for a
module with two functions.

### 2. The target is state of the controls, not a field of `View`

`View` is four numbers that the URL fragment writes, `copyView` copies and `flightAt`
interpolates. A fifth field would have to be parsed, written, copied and interpolated, and
every one of those is wrong for a target: a deep link carries where the camera **is**.

**Alternative rejected:** a `targetDistance` on `View`. It would put a camera-internal
value into the public `MapView` the handle returns.

### 3. The rule is an exponential on log distance with a floor

Each frame, with `gap = ln(target) - ln(distance)` and `seconds` the frame time:

```
fall  = 1 - 0.5 ** (seconds * 1000 / ZOOM_HALF_LIFE_MS)
least = ZOOM_LEAST_NOTCHES_PER_SECOND * ln(ZOOM_PER_NOTCH) * seconds
step  = max(abs(gap) * fall, least)
```

and the camera takes the target when `step >= abs(gap)`.

**Log distance, because the wheel is geometric.** A step of a fixed number of light years
is a large move at 100 light years and no move at 100,000.

**An exponential, because it is exact under any frame time.** `0.5 ** (t / H)` composes:
two steps of 25 ms move the camera exactly as far as one step of 50 ms. The label filter's
"half the gap each frame" does not — it is 4 times faster at 240 Hz than at 60 Hz. The
measured landings bear this out: 217 ms at 60 frames a second, 233 at 30 and 215 at 144.

**A floor, because an exponential never arrives.** Without `least` the camera would creep
for as long as the map drew. The URL fragment would hold a `d` near 30003 and never `d=30000`,
and a browser test would have no settled distance to read. `anchorStep` carries the same
floor, `max(min(gap, 0.4), speed)`, for the same reason: `galactic-regions` records that
"speed that falls with the gap otherwise takes hundreds of frames over the last few
pixels."

**Alternative rejected: the label filter's own shape, in units of one notch.** Reading
`anchorStep` with the 48 CSS pixel knee read as one notch of log distance gives a
quadratic ramp below one notch. A single notch — a gap of exactly one knee — then needs
about 28 frames, 467 ms, which is slower than the label it is supposed to match, and the
20 pixel cap never binds. The shape does not carry over, only the speed does.

**Alternative rejected: a fixed 350 ms ease, like the flight.** A wheel notch is not a
flight. A second notch 100 ms into the first would have to restart the ease or blend two
of them, and a held wheel would restart it in every frame. A filter with a target takes
any number of notches with no case to handle.

### 4. The constants are 50 ms and 2 notches a second, chosen against the label's own figure

`galactic-regions` records the label's settling: a label pushed 128 CSS pixels "is within 8
CSS pixels of that middle at frame 13, which is 217 milliseconds, and within 2 at frame
26."

`ZOOM_HALF_LIFE_MS = 50` and `ZOOM_LEAST_NOTCHES_PER_SECOND = 2` land one notch in **13
frames at 60 a second, which is 216.7 ms**. The two figures are the same frame. Both
constants are round, and neither was fitted past one decimal.

The parts divide as follows. From a gap of one notch, the halving carries the camera to
within **2.2 percent** of the target in **8 frames**, and `least` covers the last part in
**5**. The crossing is where `abs(gap) * fall` falls below `least`, which at 60 frames a
second is a gap of 0.0226 in log distance.

The whole 68 notch sweep lands in 517 ms. It is 68 times the move and takes 2.4 times the
time, because the halving carries a large gap quickly and only the last part of any move
runs at `least`.

### 5. A notch divides the target, not the distance

`zoomTarget(target ?? view.distance, notches)`. A held wheel that divided the camera's own
lagging distance would give less than 1.15 a notch, and the 68 notch sweep would not reach
the close limit.

The cost is a lag while the wheel is held. The camera trails the target by about 1.6
notches at 20 notches a second and by about 3.9 at 60, and it lands 250 ms and 317 ms after
the wheel stops. The map is zooming the whole time, so the lag reads as the speed of the
zoom and not as a delay.

### 6. `endZoom()` is called where `endFlight()` is called

`create-map.ts` already has one place for each way the distance is written from outside:
`takeView`, which the flight and reduced motion use, and the handle's `setView`. Both call
`endFlight()` today, and both gain `controls?.endZoom()`.

**Alternative rejected: the controls notice that the distance changed.** The glide could
remember the distance it last wrote and drop its target when the view no longer holds it.
That needs no call from `create-map.ts`, but it compares two `float64` values that
`normaliseView` has clamped, and it would have to be defeated for the one case where the
distance **does** change under the glide — a wheel notch during a flight, where
`onInput` ends the flight before `zoomByNotches` runs. An explicit call has one meaning.

`onInput` is **not** the hook for this. It fires on the wheel itself, before the notch is
taken, so ending the glide there would throw away the target a held wheel is building.

### 7. Reduced motion arrives as an option, not as a `matchMedia` call in the controls

`create-map.ts` reads `prefers-reduced-motion` at each selection and not once at start up,
so a user who changes the setting does not reload. `attachControls` takes a
`reducedMotion?: () => boolean` option and calls it at each notch, which keeps that
property and keeps `src/camera/` free of a media query.

### 8. The wheel event raises no view change listeners

Today the handler calls `changed()` because it moved the view. It no longer moves it, so
raising the listeners would report a change that did not happen. The frame step raises them
instead, in each frame that moves the distance. A held wheel therefore raises them once a
frame and not once an event, which is fewer calls than today at 120 Hz input.

### 9. The test probe is the target, not a countdown

`system-selection` gives `debug.selectionFlightMs()`, a countdown, because a flight has a
fixed 350 ms length. A glide has no fixed length: it depends on the gap and on the frame
times. `debug.zoomTargetLy()` reports the target while a glide runs and null when none
does, which is the fact a test needs — "has the camera settled, and on what".

### 10. `zoomByNotches` is removed and two pure functions replace it

`zoomTarget(distance, notches)` and `zoomStep(distance, target, seconds)` are both pure and
both testable with no DOM, which is how `controls.test.ts` already tests `orbit`,
`moveByKeys` and `isClick`. `zoomByNotches` cannot keep its meaning: its whole body was
the instant write this change removes. It is exported from `controls.ts` and used by
`controls.ts` and `controls.test.ts` alone, so nothing outside the camera sees the change.

## Risks / Trade-offs

**A test reads the distance in the same task as the wheel event → two tests, both named.**
`e2e/selection.spec.ts` "a wheel notch ends the flight" asserts
`after.distance ≈ before.distance / 1.15` with no frame between, and its comment says so.
That assertion was never in a spec; the new requirement states the opposite in full. The
test moves the assertion to the reading after the wait, which it already takes.
`e2e/hud.spec.ts` "a wheel over a panel does not zoom" asserts that the distance does not
move, which holds either way.

**The fragment write could miss its 1 second bound → the glide lands at 217 ms.**
`e2e/navigation.spec.ts` waits up to 1 second for `d=30000` after one notch from 34,500.
The fragment writer holds one write per 500 ms, so the write that carries the landed
distance goes out at about 517 ms, which is the second write after the notch: the writer
sends at once when its last write is more than 500 ms old, and holds the next one back. Had
the glide only approached its target, that write would have carried a `d` near 30003 and the
test would have timed out. This is the
case decision 3's floor is for, and the new spec pins it as its own scenario.

**A held wheel lags → the lag is bounded and measured.** Decision 5 gives the figures. The
worst case is a wheel that sends a notch in every frame, which trails by about 3.9 notches.

**The region labels now chase a camera that is itself filtered → the step they must answer
gets smaller, not larger.** A single notch moves the distance by at most 2.93 percent in
one frame instead of 15. The two filters run in series, as the target smoothing and the
anchor filter already do, which `galactic-regions` records as the reason a browser push
reads 382 ms against a unit test's 217. The labels' own browser test allows 400 ms and must
be re-run.

**`galactic-regions` keeps a sentence that is now imprecise → named in the proposal's Not in
scope.** "A wheel notch changes the camera distance by 15 percent in a single frame" is
true of a held wheel and no longer of a single notch. The requirement that holds it is one
`overlay-blend-and-precision` already rewrites, so a second MODIFIED block here would force
an order between two changes that otherwise share nothing.

## Migration Plan

None. No stored state, no data format and no member of the supported surface changes. A
deep link written before the change loads to the same view: the fragment carries a
distance, and a distance read from the fragment ends the glide and is taken whole.
