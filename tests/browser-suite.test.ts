// What the local browser gate runs: which browsers, which projects, and which pass each
// project runs in.
//
// The test reads `playwright.config.ts` and `scripts/e2e.mjs` as text, in the style of
// `tests/workflow.test.ts`. Importing the configuration would pull in Playwright and run
// its resolution, and what the test asserts is that the project is declared and that the
// pass that runs on one worker names it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const config = readFileSync(join(root, 'playwright.config.ts'), 'utf8');
const script = readFileSync(join(root, 'scripts', 'e2e.mjs'), 'utf8');

/** The block of one project of the configuration, from its name to the next one. */
function projectText(name: string): string {
  const start = config.indexOf(`name: '${name}',`);
  expect(start, `the configuration holds no project ${name}`).toBeGreaterThan(-1);
  const rest = config.slice(start);
  const next = rest.slice(1).search(/\n {6}name: '/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

/** The spec files the Firefox project's `testMatch` holds, in their written order. */
function firefoxSpecs(): string[] {
  const list = /const firefoxSpecs = \[([^\]]*)\]/.exec(config);
  expect(list, 'the configuration holds no firefoxSpecs list').not.toBeNull();
  const inside = (list as RegExpExecArray)[1] as string;
  return [...inside.matchAll(/'([^']+)'/g)].map((found) => found[1] as string);
}

/** Whether one spec of `e2e/` compares against a committed baseline image. */
function holdsBaseline(spec: string): boolean {
  return readFileSync(join(root, 'e2e', spec), 'utf8').includes('toHaveScreenshot');
}

describe('the Firefox project', () => {
  const firefox = projectText('firefox');

  test('is declared beside the Chromium projects', () => {
    expect(firefox).toContain("devices['Desktop Firefox']");
  });

  test('depends on the renderer check', () => {
    expect(firefox).toContain("dependencies: ['renderer-check']");
  });

  // The project reads the card, one paint time and one drawn frame. It reads a drawn
  // frame because the two browsers do not share a WebGL driver: Firefox refuses
  // `COMPRESSED_RED_RGTC1` on a `TEXTURE_2D_ARRAY` where Chromium accepts it, and that
  // fault drew nothing at all in Firefox while every Chromium test passed.
  test('runs the renderer, paint budget and nebula specs and nothing else', () => {
    expect(firefoxSpecs()).toEqual([
      '00-renderer.spec.ts',
      'paint-cost.spec.ts',
      'nebulae-firefox.spec.ts',
    ]);
    expect(firefox).toContain('testMatch: firefoxSpecs');
  });

  // The spec's scenario **No spec the Firefox project runs holds a baseline image**.
  // A drawn-frame reading here compares two frames the test takes itself, in the one
  // browser, so it needs no snapshot. `e2e/look.spec.ts` holds the one committed
  // baseline image, taken in Chromium, which a second browser cannot match pixel for
  // pixel.
  test('runs no spec that holds a baseline image', () => {
    for (const spec of firefoxSpecs()) {
      expect(holdsBaseline(spec), `${spec} holds a baseline image`).toBe(false);
    }
    // The positive control: the one spec that does hold a baseline image reads true, so
    // a project that took it on would fail the loop above.
    expect(holdsBaseline('look.spec.ts')).toBe(true);
  });

  test('takes none of the Chromium GPU flags', () => {
    expect(firefox).not.toContain('launchArguments');
    expect(firefox).not.toContain('--use-angle');
  });

  test('reads the true card and uncaps the frame rate', () => {
    expect(firefox).toContain("'webgl.sanitize-unmasked-renderer': false");
    expect(firefox).toContain("'layout.frame_rate': 0");
    expect(firefox).toContain('firefoxUserPrefs');
  });
});

describe('the paint budget spec', () => {
  test('runs in no Chromium project', () => {
    // Chromium blurs on the GPU and reads 0.8 ms for the same move, so the budget would
    // pass whatever the CPU paint cost, which is the fault it exists to catch.
    const ignored = /testIgnore: \[([^\]]*)\]/.exec(projectText('chromium-gpu'));
    expect(ignored, 'the chromium-gpu project holds no testIgnore list').not.toBeNull();
    expect(ignored?.[1]).toContain("'paint-cost.spec.ts'");
    expect(config).not.toMatch(/timedSpecs = \[[^\]]*paint-cost/);
  });
});

describe('the two passes of the browser suite', () => {
  /** The argument list of the pass that runs on one worker. */
  const timed = /const timed = pass\(\s*'([^']*)',\s*\[([^\]]*)\]/.exec(script);
  /** The argument list of the pass that runs on several workers. */
  const parallel = /const parallel = pass\('([^']*)', \[([^\]]*)\]/.exec(script);

  test('the pass on one worker names the Firefox project', () => {
    expect(timed, 'the script holds no timed pass').not.toBeNull();
    const argv = (timed as RegExpExecArray)[2] as string;
    expect(argv).toContain("'--project=firefox'");
    expect(argv).toContain("'--project=chromium-timed'");
    expect(argv).toContain("'--workers=1'");
  });

  test('the parallel pass does not', () => {
    expect(parallel, 'the script holds no parallel pass').not.toBeNull();
    const argv = (parallel as RegExpExecArray)[2] as string;
    expect(argv).not.toContain('firefox');
  });
});
