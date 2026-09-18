# browser-suite Specification

## Purpose

States which browsers the local browser gate runs, what each one is there to catch, and
the paint budget a camera move holds in each. The pipeline runs no browser test, which
`continuous-integration` states, so this gate is the only place a rendering fault is
caught before a human sees it.

## Requirements

### Requirement: The browser gate runs Chromium and Firefox

The Playwright configuration SHALL hold a Firefox project beside the Chromium ones.

Chromium and Firefox do not share a paint path. Chromium blurs on the GPU and Firefox
blurs on the CPU, so a CSS property that costs Chromium 1 ms a frame can cost Firefox 7 ms.
A suite that runs one browser reads one of the two costs and reports the map as fast.

The Firefox project SHALL run:

- `e2e/00-renderer.spec.ts`, so the project asserts the card as every other project does;
- the paint budget spec the requirement below states.

The Firefox project SHALL NOT run the rest of the suite. The other specs read behaviour
that does not follow the browser, and `e2e/look.spec.ts` holds one committed baseline
image, taken in Chromium, which a second browser cannot match pixel for pixel.

The Firefox project SHALL run in the timed pass of `scripts/e2e.mjs`, on one worker. It
reads a time, and a reading taken beside five other browsers is not the reading the budget
states, which the Chromium timed project already holds to.

#### Scenario: The configuration holds a Firefox project

- **WHEN** a unit test reads `playwright.config.ts` and lists the projects
- **THEN** one names Firefox, it depends on the renderer check, and its `testMatch` holds
  the renderer spec and the paint budget spec and nothing else

#### Scenario: The Firefox project runs in the timed pass

- **WHEN** a unit test reads `scripts/e2e.mjs`
- **THEN** the pass that runs on one worker names the Firefox project, and the parallel
  pass does not

### Requirement: Every browser project reads the hardware renderer

The renderer check SHALL fail on a software renderer in Firefox as it does in Chromium.
`far-view-rendering` states the rule itself, in "Hardware rendering is asserted"; this
requirement states what the rule needs in the second browser.

Firefox reports a generic name for the card. It answers `NVIDIA GeForce GTX 980, or
similar` for every NVIDIA card, which separates hardware from software but names no card.
The Firefox project SHALL therefore set the preference
`webgl.sanitize-unmasked-renderer` to `false`, so `WEBGL_debug_renderer_info` gives the
card the container passed through and the check reads the true string.

Firefox needs none of the Chromium GPU flags. It reaches the card headless with its
default settings, and the flags in `launchArguments` are Chromium's alone.

#### Scenario: Firefox names the card

- **WHEN** the browser test runs `e2e/00-renderer.spec.ts` in the Firefox project and reads
  the renderer string
- **THEN** the string holds none of `SwiftShader`, `llvmpipe` or `Software`, and it does
  not read the sanitized `or similar` form, which is what the preference buys

### Requirement: A camera move holds the paint budget in Firefox

A camera move SHALL cost at most **7 ms** of main-thread work a frame in Firefox, at
1920x1080, with a set of 10,000 systems, the HUD on, the name labels on and the grid on.

**The view is part of the reading.** The blur cost follows the blurred area on the screen,
and the label count follows the view, so a reading taken at another view is another number.
The reading SHALL be taken at this view and this move:

- the 10,000 systems spread over a box of 400 by 60 by 400 light years around the origin;
- the start view at the origin, 40 light years out, 35 degrees of pitch and 0 of yaw;
- each frame turns the yaw 0.3 degrees and sets the distance to
  `40 * (1 + 0.3 * sin(f / 20))` light years, so the camera turns and moves at once;
- 200 frames, of which the first 20 are dropped, so the mean is over **180 frames**.

That view carries **62 labels**: 2 coordinate labels and 60 marker name labels. The
overlap rule drops a label whose box meets one already placed and the name labels cap at
64, so 10,000 markers do not give 10,000 labels. The budget is stated at the set and the
view rather than at a label count, and the scenario below asserts a floor of 8 so a frame
that drew no label cannot pass the reading by measuring nothing.

**The instrument is the frame interval with the frame rate uncapped.** A browser locked to
the display runs at 16.7 ms a frame and hides every cost below it: the two blurs cost
7.5 ms a frame, in a frame of 12.1 ms, and dropped no frame at all. The Firefox project SHALL
therefore set the preference `layout.frame_rate` to `0`, which lets `requestAnimationFrame`
run as fast as the work allows, and the mean interval is then the work.

The readings the budget comes from. One session in the dev container, on the project's
test card, over the view and the move above, with the frame rate uncapped. Each state is the mean of three runs of
180 frames, and the widest spread between the runs of one state is **0.45 ms**.

| What the map draws                   | Mean interval |
| ------------------------------------ | ------------- |
| Neither blur, as the map draws now   | 4.6 ms        |
| The label blur alone, panels flat    | 8.8 ms        |
| The panel blur alone, labels stroked | 8.1 ms        |
| Both blurs, as the map was before    | 12.1 ms       |

The blurred label shadow therefore costs **4.2 ms** a frame and the blurred panel backdrop
**3.5 ms**, each read against the frame that carries neither. The two together cost 7.5 ms
of the 12.1 ms frame. The rest of the frame is the draw call, the placement and the HUD's
own writes, which this change does not touch.

**A later session read the same states again, over the same view and the same move, and
found the panel backdrop at about 2.5 ms rather than 3.5.** The label shadow read higher,
not lower: 9.9 ms, on a frame that carried 62 labels. The label count follows the set and
the overlap rule, and both readings are of the same view, so the two sessions disagree by
more than the drift the design records. What holds in both is the ranking and the sign:
the flat state reads 4.3 to 5.3 ms, each blur alone moves the reading by at least
1.5 ms, and the two together more than double it. The scenarios below are written to the
reading
that reproduces.

**The before and the after, from the same machine and the same session.** The old look
put back with a stylesheet rule, which is the blurred shadow with no stroke on the labels
and `backdrop-filter` on the panels, against the look this change leaves. Three runs of
each state, over the view and the move this requirement states.

| What the map draws                   | Mean interval   |
| ------------------------------------ | --------------- |
| Both blurs, as the map was before    | 17.7 to 18.1 ms |
| The label blur alone, panels flat    | 15.0 to 15.2 ms |
| The panel blur alone, labels stroked | 8.0 to 8.2 ms   |
| Neither blur, as the map draws now   | 5.0 to 5.3 ms   |

The change therefore takes the frame from about 17.9 ms to about 5.1 ms at this view, and
the map holds the 7 ms budget with 1.7 to 2.7 ms of headroom.

The budget of 7 ms leaves the map 2.4 ms of headroom, which is five times the widest
spread, and it sits below both single-blur readings.

Chromium reads 0.8 ms for the same move. The budget SHALL NOT be read in Chromium: it
would pass whatever the CPU paint cost, which is the fault it exists to catch.

**A rise floor that sits within 2 ms of its rise comes from a recorded distribution.** A
floor that sits inside the spread of the readings fails a correct tree. Such a floor SHALL
be at most the smallest reading of a recorded run of at least **12** readings of the
statistic its scenario states, less **0.3 ms**. It SHALL be lowered only with a recorded
run that reads below it, and raised only with a recorded run that shows the rise is larger
than the one recorded here.

**The two constants.** The margin of 0.3 ms is one standard deviation of the recorded
panel rise, which is 0.325 ms, so a floor set by the rule sits a further standard deviation
under the smallest of 12. The band of 2 ms is the width at which a run stops being worth
its cost: a floor further than 2 ms below its rise is more than six standard deviations of
this instrument away from it, and a recorded run would only confirm what the gap already
shows. The label shadow floor of 2 ms holds a rise of 9.9 ms, which is nearly five times
it, and needs no run. The gap was 2.2 ms in the first session, which read the label rise at
4.2 ms, so the band holds for that reading too.

**The single pair rise of the panel blur, 22 readings.** Each is the mean of 180 blurred
frames less the mean of 180 flat frames, over the view and the move this requirement
states.

| Where the run came from                        | The rises, in milliseconds                        |
| ---------------------------------------------- | ------------------------------------------------- |
| An earlier session, 5 runs, flat 4.33 to 5.29  | 2.25, 2.41, 2.45, 2.67, 2.86                      |
| At the commit before the shape categories work | 2.441, 2.617, 1.984, 2.212, 2.081, 2.589, 2.047, 2.011 |
| On the tree that carried that work             | 2.907, 2.105, 1.879, 2.729, 2.341, 2.535, 2.759, 2.167 |
| One full suite run                             | 1.804                                             |

The rise spans **1.804 to 2.907 ms**, with a mean of **2.36 ms** and a standard deviation
of **0.325 ms**. Three of the 22 are below 2 ms. A floor of 2 ms therefore sits 1.1
standard deviations under the mean and fails about one run in seven, which is why the
scenario below reads a median of four pairs and holds a lower floor.

**The readings come from three trees, and the panel geometry is part of the reading.** The
blur cost follows the blurred area on the screen. A run SHALL record the panel boxes
beside the rise, so a later reader can tell a reading of this HUD from a reading of
another one.

**The median of four pairs, 24 readings.** Each is the median of the four rises of one
run, in the order the scenario below states. Every reading comes from the tree this change
leaves, and every one records the panel boxes `316x808` and `316x168`. The first 12 set the
floor and the second 12 confirm it.

| Where the run came from        | The medians, in milliseconds                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| The run that set the floor     | 2.202, 2.756, 2.916, 2.222, 2.252, 2.340, 2.183, 2.863, 2.139, 2.379, 2.201, 2.993 |
| The run that confirmed it      | 2.923, 2.128, 2.113, 2.106, 2.947, 2.128, 2.201, 2.946, 2.577, 2.451, 2.876, 2.166 |

The 24 medians span **2.106 to 2.993 ms**, with a mean of **2.459 ms** and a standard
deviation of **0.341 ms**. The 96 single pair rises they are built from span 1.823 to
3.303 ms, with a standard deviation of **0.389 ms**, and 7 of the 96 fall below 2 ms. The
median of four therefore holds a spread **12 per cent** smaller than one pair, and none of
the 24 falls below 2 ms.

**The gain of the pairing is small, and a spread read from 12 runs is uncertain.** The 12
runs that set the floor read a spread of 0.327 ms and the 12 that confirmed it read
0.369 ms. Neither is below the 0.325 ms of the 22 single pair readings above, which come
from three trees. The comparison that holds is the one against the 96 pairs of these same
runs. The gain is small because the four pairs of one run share the state of the machine,
so the drift between runs stays in the median. The two orders differ by 0.048 ms over the
96 pairs, so neither order reads warm.

One pair with a floor of 1.2 ms was weighed against the four pairs and rejected. The
smaller gain of the pairing is the reason to weigh it. A floor of 1.2 ms passes a blur that
costs 1.3 ms, where the recorded cost is 2.5 ms, so it holds less of what the scenario
exists to show. A recorded run of 24 or more medians whose spread is not below the spread
of the single pairs of the same runs SHALL reopen the question.

**The floor stays at 1.5 ms.** The rule above sets it at the smallest reading of a recorded
run less 0.3 ms. The smallest of the 24 is 2.106 ms, which gives 1.806 ms, and 1.5 ms sits
under that. The smallest reading holds **0.606 ms** of margin over the floor, and all 24
readings pass it.

#### Scenario: The camera move holds the budget

- **WHEN** the Firefox browser test opens the page **with the HUD on**, adds the 10,000
  systems at 1920x1080, turns the names on and the grid on, and moves the camera over the
  view and the move the requirement states, with the frame rate uncapped, and reads the
  mean interval of the 180 frames
- **THEN** the mean is 7 ms or less, the frame held at least 8 labels, and the two HUD
  panels had a box on the screen

  The label count and the panel count are part of the assertion, not part of the setup. A
  change to the overlap rule or to the HUD could leave a page with no labels and no
  panels, and the reading would then pass while it measures none of the cost the budget
  exists to hold.

  The HUD is part of the reading and not scenery. Two of its panels carry half the cost
  this budget exists to hold, and the suite's own helper removes the HUD unless a test
  asks for it, so a test that forgets to ask measures a page that has no panels.

#### Scenario: The blurred shadow fails the budget

- **WHEN** the same test adds a stylesheet rule that puts the old label look back, which
  is the old `0 0 10px` shadow **and no stroke**, and repeats the same move over the same
  view
- **THEN** the mean passes 7 ms, and it is at least **2 ms** above the mean the same run
  read without the rule

  The stroke has to go with the shadow. With a stroke on the glyphs Firefox takes another
  text path, and the same shadow then costs 2.4 ms a frame rather than 9.9. A rule that
  adds the shadow and leaves the stroke measures the cheaper of the two paths, which is
  not the state this change replaced.

#### Scenario: The blurred panel fails the budget

- **WHEN** the same test adds a stylesheet rule that writes `backdrop-filter: blur(10px)`
  back onto the HUD panels, and repeats the same move over the same view, and takes four
  pairs of readings, each pair one flat move and one blurred move beside it, in the
  order flat then blurred, blurred then flat, blurred then flat, flat then blurred
- **THEN** the median of the four rises, which is the mean of the middle two of the sorted
  readings, is at least the floor of **1.5 ms**, and the run records each rise, each flat
  mean, each blurred mean, the order of the pair that gave each one, and the panel boxes

  The budget guards two properties, so each one gets a scenario that shows it alone moves
  the reading. **Each scenario reads a rise against its own run, not a number alone.**

  **This scenario reads the rise alone, and not a number the mean must pass.** The panel
  blur costs about **2.4 ms** a frame over the flat reading, on a flat reading of 4.3 to
  5.3 ms. The mean with the blur therefore lands on both sides of 7 ms, and it passes the
  budget on some runs and not on others.

  **The reading is paired and the statistic is a median.** The rise is a difference of two
  means, so it carries the noise of both, and a machine that gets slower between the flat
  run and the blurred run adds that drift to the rise. A pair reads a blurred mean beside a
  flat mean of the same moment, which holds the drift of the whole test out of the rise.

  The drift inside a pair is left. It adds to the rise of a pair that reads flat first and
  it takes away from the rise of a pair that reads blurred first, so the four pairs give
  two rises of each kind. The median of the four is the mean of the middle two of the
  sorted readings. Where the drift is larger than the noise of a single rise, the two
  flat-first rises sort above the two blurred-first ones, the median holds one of each, and
  the drift cancels. Where the drift is smaller than that noise, the sort order is the
  noise and the median holds whichever two sit in the middle; the drift is then too small
  to matter. The same median drops the largest and the smallest reading, so one outlier
  does not move it. A single pair reads 1.80 to 2.91 ms for the same blur.

  **A flat move that follows a blurred move may not read cold.** Firefox may hold the layer
  it promoted for the backdrop, so the flat mean of a reversed pair can read high and its
  rise low. The run records the order of each pair, so the reading shows whether the two
  orders disagree.

  The label scenario keeps both clauses and its single pair, because its rise is 9.9 ms
  and its mean is about 14.8 ms, which is twice the budget.

### Requirement: The dev container carries both browsers

`.devcontainer/post-create.sh` SHALL install the Playwright browsers for Chromium and for
Firefox, and SHALL install the system libraries of both.

It SHALL also give the user `/home/node/.cache`. The browser volume mounts at
`/home/node/.cache/ms-playwright`, and docker creates the parent directory as root.
Firefox writes its own cache under `/home/node/.cache/mozilla`, cannot create it under a
root-owned parent, and stops with the dialog `Your Firefox profile cannot be loaded`.
Chromium does not need that directory, which is why the container ran for months without
it.

`.devcontainer/README.md` SHALL record that failure and the sandbox warning Firefox prints
on every start in this container, `CanCreateUserNamespace() clone() failure: EPERM`, which
is harmless and is not the cause of a failed launch.

#### Scenario: The script installs both browsers

- **WHEN** a unit test reads `.devcontainer/post-create.sh`
- **THEN** it installs the Playwright browsers for Chromium and Firefox, installs the
  system libraries of both, and gives `node` the directory `/home/node/.cache`
