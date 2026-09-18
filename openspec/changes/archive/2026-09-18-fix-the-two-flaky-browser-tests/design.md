## Context

See proposal.md for the motivation and the two failures.

Three facts shape the approach.

**The re-clamp and the glide drop share one code path.** `reclampView` in
`src/app/create-map.ts` calls `endZoom` when the clamp moved the view **or** when the
glide target is outside the new far limit. A test that reads the view after the call
cannot tell which of the two ran. A test that wants the second one must make the first one
impossible.

**The glide moves fast and the test does not control the clock.** The glide halves the
gap in log distance every 50 ms. Stepped at 60 frames a second from 1,000 light years
toward a target of 4,045.56, it reads 1,334 after one frame, 1,677 after two and 2,011
after three, so it passes 2,000 at **50 ms**. The test lets one frame run and then makes a
round trip from the Playwright process to the page, which leaves a window of about 33 ms.
No fixed bound can sit above the live distance on every run.

**The paint reading is a difference of two noisy means.** `browser-suite` records the
spread of one mean at 0.45 ms. A difference of two carries both, and a machine that gets
slower between the flat run and the blurred run adds its drift on top of that. The
recorded rises span 1.804 to 2.907 ms for one effect of about 2.4 ms.

## Goals / Non-Goals

**Goals:**

- Each test fails only where the behaviour it names is wrong.
- Each test still fails where that behaviour is removed.
- No hand-written tolerance stands in for a premise the test does not hold.
- The floor of the paint rise comes from a recorded distribution and the spec states the
  rule that sets it.

**Non-Goals:**

- No change in `src/`. Both behaviours are correct.
- No new test helper shared between the two specs. The two faults have no common cause.
- No rule for the other timing tests in the suite. See proposal.md, Non-goals.

## Decisions

### The bounds test derives the bound from the readings it takes

The test reads the live distance `d` and the glide target `t` in the same task as the
`setBounds` call, then sets a sphere radius of `(d + t) / 4`. The far zoom limit of that
sphere is `(d + t) / 2`, which sits strictly between `d` and `t` while the glide runs.

That gives three things by construction, on every run:

- `d` is inside the new limit, so the re-clamp moves nothing;
- `t` is outside the new limit, so the map must drop it;
- the distance after the call equals `d`, and stays `d`, because nothing else moves the
  camera once the glide is gone.

The assertion is therefore an equality against a value the test read, not an inequality
against a number written by hand. The float value of the limit never enters it.

The test still needs `d < t`, which holds while the glide runs. It reads the target in the
same task and fails where the target is already null. The same stepped glide lands on its
target at **383 ms**, and one frame plus one round trip is far inside that. The window the
new test needs is the whole glide, not the 33 ms the fixed bound gave it.

**Alternatives.**

- `toBeLessThanOrEqual(2000)` — still fails, because the value is `2000.0000000000002`.
- `toBeLessThan(2000 + 1e-9)` or `toBeCloseTo` — passes on both paths. On the run where
  the glide passed the limit first, the re-clamp explains the reading and the test says
  nothing about the target. The repository's own specs reject this shape of assertion in
  several places: a reading that passes while it measures nothing.
- Make `farZoomLimit` return exactly `2 * R` — a product change to please a test, and it
  needs a special case for a 30 degree half angle that hides the formula the spec states.
  Rejected.
- Set the bounds in the same task as the wheel notches, with no frame between — the live
  distance is then exactly 1,000 and the test is deterministic, but the glide has not
  moved, so the case the comment names, a glide **in flight**, is no longer covered.
  Rejected as a loss of coverage.
- Widen the fixed radius until the race is unlikely, for example 1,900 — the glide passes
  that limit of 3,800 at frame 14, which is 233 ms, so the window after the one frame the
  test lets run grows from about 33 ms to about 217 ms. It lowers the failure rate and
  does not remove it. Rejected.

### The panel rise is the median of four pairs

The test runs eight moves in four pairs: flat then blurred, blurred then flat, blurred
then flat, flat then blurred. Each blurred mean is read beside a flat mean of the same
moment, so the rise of a pair carries the state of the machine at that moment and not the
drift between the first move and the last.

The drift inside a pair is left, and the order decides its sign: a pair that reads flat
first gives a rise of about `R + d` and a pair that reads blurred first gives about
`R - d`. Four pairs in this order therefore give two of each. The assertion reads the
median of the four, which is the mean of the middle two of the sorted readings. Where the
drift is larger than the noise of one rise, the two orders sort into two groups, the median
holds one rise of each, and the drift cancels to first order. Where the drift is smaller
than that noise, the median holds whichever two sit in the middle, and the drift is too
small to matter. The same median drops the largest and the smallest reading, so one
outlier does not move it.

Three pairs with one order turned around would not do this. The three rises are `R + d`,
`R - d` and `R + d`, and their median is `R + d`, so the reversal removes none of the bias
from the statistic. Four pairs are the smallest even count that cancels it and still drops
an outlier.

The `addRule` helper gains a matching remove, because the rule must come off between
pairs. It already writes a `<style>` element with an id.

The cost is six more moves. One move is 200 frames at 5 to 8 ms, which is 1.0 to 1.6
seconds, so the test grows by about 8 seconds against a timeout of 180.

**Alternatives.**

- Lower the floor to 1.2 ms and keep one pair — three lines of change and no runtime cost.
  1.2 ms is 3.6 standard deviations below the recorded mean, so it would hold. It replaces
  an unstable test with a weak one: the noise of the instrument stays as large as it is,
  and the next reading that drifts moves the floor with it. Kept as the fallback in task 5.4.
- Raise the frame count of one pair from 200 to 600 — it cuts the noise of each mean by
  1.7, but it does not touch the drift between the two runs, which the interleaving does.
  It also costs about the same time. Rejected.
- Read the paint cost with a different instrument, for example `performance.measure` over
  the paint entries — `browser-suite` already records why the frame interval is the
  instrument, and a second instrument would make the budget and the control disagree.
  Rejected.

### The floor is 1.5 ms, and apply confirms it

1.5 ms is the smallest of the 22 recorded single pair rises, 1.804, less 0.3 ms. The
median of four pairs is tighter than one pair, so the same floor carries more margin
under the new statistic than under the old one.

The delta marks 1.5 ms as the value the single pair readings give. Apply measures the new
statistic 12 times with `--repeat-each=12` and writes the readings into the spec. The rule
the spec states then decides: where the smallest of the 12 is below 1.8 ms, the floor drops
to that reading less 0.3 ms.

**The 12 readings are taken on the tree the change leaves.** The blur cost follows the
blurred area on the screen, and the 22 readings that set 1.5 ms come from three trees whose
HUD panels may differ. The measurement therefore runs after every other edit of this change
is in place, and it records the `panelBoxes` the reading already collects beside each rise,
so a later reader can tell which HUD the distribution belongs to.

### The fallback was weighed and rejected

Apply measured the statistic 24 times. The floor rule held with room: the smallest median
is 2.106 ms, the rule allows 1.806 ms, and 1.5 ms sits under that. All 24 readings pass.

Task 5.4 set a second check, and that one fired. It asks for the spread of the 12 medians
to fall below 0.325 ms, which is the spread of the 22 single pair readings above. The 12
read **0.3270 ms**. By the letter of the task the change then drops to one pair with a
floor of 1.2 ms, which is the fallback this section names.

**The change keeps the four pairs.** The 0.325 ms comes from 22 readings of three other
trees, so it does not measure what one pair reads on this one. The like-for-like comparison
is the 96 single pairs of these same runs, which spread 0.389 ms, against the 24 medians,
which spread 0.341 ms. The median of four is 12 per cent tighter by that reading. The
second run of 12 read a spread of 0.369 ms where the first read 0.327 ms, so a spread from
12 runs is too uncertain to turn a decision on a margin of 0.002 ms.

The fallback also holds less. A floor of 1.2 ms passes a blur that costs 1.3 ms, where the
recorded cost is 2.5 ms. The owner read these numbers and chose the paired path.

**What would change this.** A recorded run of 24 or more medians whose spread is not below
the spread of the single pairs of the same runs. The pairing would then be buying nothing,
and one pair with a floor set by the rule would cost six fewer moves.

## Risks / Trade-offs

- **Nobody has measured the distribution of the median of four yet.** → Task 5.2 measures
  it 12 times before the floor is fixed. Task 5.4 names the fallback where the reading
  disagrees with the prediction.
- **The six extra moves make the paint test about 8 seconds longer**, in a suite that
  already runs about 10 minutes. → It is one test of the Firefox project, and the project
  runs two spec files.
- **The derived bound makes the navigation test harder to read** than a fixed radius of
  1,000. → The test carries a comment that states why the bound is derived, and the spec
  scenario states it too.
- **A flat move that follows a blurred move may not read cold.** Firefox may hold the
  layer it promoted for the backdrop, which would raise the flat mean of a reversed pair
  and lower its rise. → Task 3.2 logs the order of each pair with its three means, so the
  12 readings of task 5.2 show whether the two orders disagree. Where they do, the pairing
  falls back to one order and the floor follows the rule the spec states.
- **A future change that makes the glide land in under one frame would break the new
  test's premise.** → The test reads the target in the same task and fails with a clear
  message where it is already null, rather than passing on nothing.
- **The floor of 1.5 ms lets a smaller regression through** than the floor of 2 ms. A
  change that made the panel blur cost 1.6 ms rather than 2.4 would still pass. → The
  scenario exists to show the blur alone moves the reading, and 1.5 ms shows that. The
  budget of 7 ms is the clause that holds the cost itself.
