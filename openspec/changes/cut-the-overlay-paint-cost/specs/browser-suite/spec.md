## Purpose

States which browsers the local browser gate runs, what each one is there to catch, and
the paint budget a camera move holds in each. The pipeline runs no browser test, which
`continuous-integration` states, so this gate is the only place a rendering fault is
caught before a human sees it.

## ADDED Requirements

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

| What the map draws                    | Mean interval |
| ------------------------------------- | ------------- |
| Neither blur, as this change leaves it | 4.6 ms       |
| The label blur alone, panels flat      | 8.8 ms       |
| The panel blur alone, labels stroked   | 8.1 ms       |
| Both blurs, as the map is today        | 12.1 ms      |

The blurred label shadow therefore costs **4.2 ms** a frame and the blurred panel backdrop
**3.5 ms**, each read against the frame that carries neither. The two together cost 7.5 ms
of the 12.1 ms frame. The rest of the frame is the draw call, the placement and the HUD's
own writes, which this change does not touch.

**A later session read the same states again, over the same view and the same move, and
found the panel backdrop at about 2.5 ms rather than 3.5.** The label shadow read higher,
not lower: 9.9 ms, on a frame that carried 62 labels. The label count follows the set and
the overlap rule, and both readings are of the same view, so the two sessions disagree by
more than the drift the design records. What holds in both is the ranking and the sign:
the flat state reads 4.3 to 5.3 ms, each blur alone moves the reading by at least 2 ms,
and the two together more than double it. The scenarios below are written to the reading
that reproduces.

**The before and the after, from the same machine and the same session.** The old look
put back with a stylesheet rule, which is the blurred shadow with no stroke on the labels
and `backdrop-filter` on the panels, against the look this change leaves. Three runs of
each state, over the view and the move this requirement states.

| What the map draws                     | Mean interval    |
| -------------------------------------- | ---------------- |
| Both blurs, as the map was before       | 17.7 to 18.1 ms |
| The label blur alone, panels flat       | 15.0 to 15.2 ms |
| The panel blur alone, labels stroked    | 8.0 to 8.2 ms   |
| Neither blur, as this change leaves it  | 5.0 to 5.3 ms   |

The change therefore takes the frame from about 17.9 ms to about 5.1 ms at this view, and
the map holds the 7 ms budget with 1.7 to 2.7 ms of headroom.

The budget of 7 ms leaves the map 2.4 ms of headroom, which is five times the widest
spread, and it sits below both single-blur readings.

Chromium reads 0.8 ms for the same move. The budget SHALL NOT be read in Chromium: it
would pass whatever the CPU paint cost, which is the fault it exists to catch.

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
  back onto the HUD panels, and repeats the same move over the same view
- **THEN** the mean is at least **2 ms** above the mean the same run read without the rule

  The budget guards two properties, so each one gets a scenario that shows it alone moves
  the reading. **Each scenario reads a rise against its own run, not a number alone.**

  **This scenario reads the rise alone, and not a number the mean must pass.** The panel
  blur costs about **2.5 ms** a frame over the flat reading, measured five times in the
  container on the project's test card: rises of 2.25, 2.41, 2.45, 2.67 and 2.86 ms over
  flat readings of 4.33 to 5.29 ms. The mean with the blur therefore lands between 6.8 and
  7.3 ms, which passes 7 ms on some runs and not on others.

  **The floor of 2 ms carries 0.25 to 0.86 ms of margin, not four times the spread.** The
  number that matters is the rise less the floor, and the smallest rise recorded is
  2.25 ms. The instrument's own spread is 0.45 ms on each of the two means the rise
  subtracts, so a busy machine can read the rise below the floor and fail a correct tree.
  The floor is still the better of the two readings: the 7 ms clause failed four runs of
  five and this one failed none of five. Raise the floor only with a reading that shows
  the rise is larger than this one found.

  The label scenario keeps both clauses, because its rise is 9.9 ms and its mean is about
  14.8 ms, which is twice the budget.

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
