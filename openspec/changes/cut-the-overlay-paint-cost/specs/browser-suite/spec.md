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

That view carries **10 labels**. The overlap rule drops a label whose box meets one
already placed, so 10,000 markers do not give 10,000 labels, and the budget is stated at
the set and the view rather than at a label count.

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

- **WHEN** the same test adds a stylesheet rule that writes the old `0 0 10px` shadow back
  onto every label, and repeats the same move over the same view
- **THEN** the mean passes 7 ms, and it is at least **2 ms** above the mean the same run
  read without the rule

#### Scenario: The blurred panel fails the budget

- **WHEN** the same test adds a stylesheet rule that writes `backdrop-filter: blur(10px)`
  back onto the HUD panels, and repeats the same move over the same view
- **THEN** the mean passes 7 ms, and it is at least **2 ms** above the mean the same run
  read without the rule

  The budget guards two properties, so each one gets a scenario that shows it alone fails
  the reading. **Each scenario reads a rise against its own run, not a number alone.** The
  measured rises are 4.2 ms and 3.5 ms, so a floor of 2 ms holds four times the widest
  spread. An absolute threshold would give the panel scenario 1.1 ms of margin, which is
  close enough to the spread to make the test answer differently on different days, and a
  test that does that gets loosened or deleted.

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
