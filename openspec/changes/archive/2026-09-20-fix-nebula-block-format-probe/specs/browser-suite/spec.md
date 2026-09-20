## MODIFIED Requirements

### Requirement: The browser gate runs Chromium and Firefox

The Playwright configuration SHALL hold a Firefox project beside the Chromium ones.

Chromium and Firefox do not share a paint path. Chromium blurs on the GPU and Firefox
blurs on the CPU, so a CSS property that costs Chromium 1 ms a frame can cost Firefox 7 ms.
A suite that runs one browser reads one of the two costs and reports the map as fast.

**The two browsers do not share a WebGL driver either, and a format one accepts the other
can refuse.** Firefox refuses `COMPRESSED_RED_RGTC1` on a `TEXTURE_2D_ARRAY` where Chromium
accepts it, on the same card. That fault drew nothing at all in Firefox while every Chromium
test passed, because the Firefox project read no drawn frame. The Firefox project SHALL
therefore read one drawn frame as well as one time.

The Firefox project SHALL run:

- `e2e/00-renderer.spec.ts`, so the project asserts the card as every other project does;
- the paint budget spec the requirement below states;
- one spec that reads a **drawn frame** of the nebulae, which the `nebulae` capability
  states in "The nebulae draw in Firefox".

The Firefox project SHALL NOT run the rest of the suite. The other specs read behaviour
that does not follow the browser, and `e2e/look.spec.ts` holds one committed baseline
image, taken in Chromium, which a second browser cannot match pixel for pixel.

**A spec this project runs SHALL NOT compare against a committed baseline image**, for that
same reason. A drawn-frame reading here SHALL compare two frames the test takes itself, in
the one browser, so it needs no snapshot and no second baseline to keep.

The Firefox project SHALL run in the timed pass of `scripts/e2e.mjs`, on one worker. It
reads a time, and a reading taken beside five other browsers is not the reading the budget
states, which the Chromium timed project already holds to.

#### Scenario: The configuration holds a Firefox project

- **WHEN** a unit test reads `playwright.config.ts` and lists the projects
- **THEN** one names Firefox, it depends on the renderer check, and its `testMatch` holds
  the renderer spec, the paint budget spec and the nebula drawing spec, and nothing else

#### Scenario: The Firefox project runs in the timed pass

- **WHEN** a unit test reads `scripts/e2e.mjs`
- **THEN** the pass that runs on one worker names the Firefox project, and the parallel
  pass does not

#### Scenario: No spec the Firefox project runs holds a baseline image

- **WHEN** a unit test reads every spec the Firefox project's `testMatch` holds
- **THEN** none of them calls `toHaveScreenshot`
