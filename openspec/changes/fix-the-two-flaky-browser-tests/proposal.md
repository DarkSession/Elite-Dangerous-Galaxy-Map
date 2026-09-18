## Why

Two browser tests fail on `main` without a change in the code they read. Both failures
are in the test and not in the map.

**`e2e/navigation.spec.ts`, "narrowing the bounds drops a running zoom glide".** The test
reads `expect(midFlight.distance).toBeLessThan(2000)` and gets `2000.0000000000002`. The
far zoom limit of a sphere of radius 1,000 is `1000 / sin(30 degrees)`, which is
`2000.0000000000002` in doubles and not the exact 2,000 the assertion holds. The test
reaches that value whenever the glide passes the new limit before `setBounds` lands, which
is a race against the round trip from the test to the page. It failed 3 of 6 isolated runs
on a clean worktree at HEAD `f35cdb2`.

The wrong number is the smaller fault. The test reads the distance **after** the clamp, so
it cannot tell the two paths apart:

- the glide was still inside the new limit and `setBounds` dropped its target, which is
  what the test exists to prove;
- the glide had already carried the camera past the new limit and the clamp pulled it
  back, which proves nothing about the target.

An assertion that accepts the clamped value would pass on both paths and measure neither.

**`e2e/paint-cost.spec.ts`, "the blurred panel backdrop fails the budget".** The test adds
`backdrop-filter: blur(10px)` to the HUD panels and asserts that the mean frame interval
rises by at least `RISE_MS = 2` milliseconds. 22 recorded readings of that rise in this
container span **1.804 to 2.907 ms**, with a mean of 2.36 and a standard deviation of
0.325. Three of the 22 are below 2, so the floor sits 1.1 standard deviations under the
mean and fails about **one run in seven**. The floor is not too low for the effect. It
sits inside the spread of readings the instrument gives.

The rise is a difference of two means, so it carries the noise of both. The
`browser-suite` spec already records this: "The floor of 2 ms carries 0.25 to 0.86 ms of
margin, not four times the spread."

## What Changes

- **The bounds test proves the drop and not the clamp.** The test reads the live distance
  and the glide target in the same task as the `setBounds` call, and derives the sphere
  radius from them, so the new far limit lands strictly between the two. The clamp then
  has nothing to do by construction, and the camera stays where the glide left it only
  because the target was dropped. The assertions become an equality against the distance
  the test read, and no bound needs a hand-written tolerance.
- **The panel rise is measured as a paired statistic.** The test takes four pairs of
  readings, each pair one flat move and one blurred move beside it, in the order flat
  first, blurred first, blurred first, flat first, and asserts on the **median** of the
  four rises. A pair holds the drift of the whole test out of the rise. The two orders
  carry the drift that is left with opposite signs, so where that drift is larger than the
  noise of one rise the median of four holds one rise of each order and the drift cancels.
  The median drops the largest and the smallest reading either way.
- **The floor moves from 2 ms to 1.5 ms**, which is the smallest of the 22 recorded rises
  less 0.3 ms. The spec states the rule that sets a floor of this kind, lists the 22
  readings one by one, and marks 1.5 ms as the value the single pair readings give until a
  recorded run of 12 medians replaces it.
- **The requirement's own summary of the blur cost moves with the floor.** The sentence
  "each blur alone moves the reading by at least 2 ms" becomes "at least 1.5 ms", which
  the recorded minimum of 1.804 ms already required.
- **The specs record the two facts the tests now rest on**: that a bounds change drops a
  running glide whose target is outside the new limit, and that the far zoom limit is
  `2 * R` in exact arithmetic but a few parts in 10^16 above it in doubles, so a test
  reads it with a tolerance.

**Non-goals.**

- No change in `src/`. The map's behaviour is correct in both cases.
- `farZoomLimit` keeps `R / sin(fov / 2)`. Making it return exactly `2 * R` would need a
  special case for a 30 degree half angle, which hides the formula the spec states.
- The label shadow scenario keeps its floor of 2 ms and its single pair of readings. Its
  rise is 9.9 ms against that floor, which is nearly five times it.
- No audit of the other timing tests in the suite. A general rule for deriving a timing
  bound is worth writing, but it would put every existing bound in scope.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `browser-suite`: the requirement "A camera move holds the paint budget in Firefox"
  changes its scenario "The blurred panel fails the budget". The statistic becomes the
  median of four pairs taken in two orders, the floor becomes 1.5 ms, and the requirement
  states the rule that derives the floor from a recorded distribution.
- `map-navigation`: the requirement "The host limits the browsable space" gains the
  scenario "Narrowing the bounds drops a running zoom glide", which the code and a browser
  test already hold but no scenario states, and records that the far zoom limit is `2 * R`
  to within floating point. The requirement "The wheel zoom glides to its target" gains one
  paragraph, because its list of what ends a glide names three cases and the bounds change
  is a fourth.

## Impact

- `e2e/navigation.spec.ts` — the test "narrowing the bounds drops a running zoom glide".
- `e2e/paint-cost.spec.ts` — the test "the blurred panel backdrop fails the budget", the
  `addRule` helper, which gains a matching remove, and the `RISE_MS` constant, which gains
  a second value for the panel scenario.
- `docs/roadmap.md` — "Phase 5.6: the overlay paint cost" takes the spread of the panel
  rise, and "Phase 5.8: the free camera and the host controls" takes the far zoom limit in
  doubles.
- No source file changes. No dependency changes. No change in what the map draws.

**The scale the reading holds at** does not move: 10,000 systems over a box of 400 by 60
by 400 light years, at 1920x1080, with the HUD on, the names on and the grid on, and a
frame that carries 62 labels and 2 panels. The mean is over 180 frames of a 200 frame
move. The test takes eight of those moves rather than two. Six more moves at 1.0 to 1.6
seconds each add about 8 seconds.

**The recorded readings belong to a HUD.** The blur cost follows the blurred area on the
screen, and the 22 readings come from three different trees. The run that sets the floor
therefore records the panel boxes beside each rise.
