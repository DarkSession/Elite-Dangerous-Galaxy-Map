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

describe('the Firefox project', () => {
  const firefox = projectText('firefox');

  test('is declared beside the Chromium projects', () => {
    expect(firefox).toContain("devices['Desktop Firefox']");
  });

  test('depends on the renderer check', () => {
    expect(firefox).toContain("dependencies: ['renderer-check']");
  });

  test('runs the renderer spec and the paint budget spec and nothing else', () => {
    expect(config).toMatch(
      /const firefoxSpecs = \['00-renderer\.spec\.ts', 'paint-cost\.spec\.ts'\];/,
    );
    expect(firefox).toContain('testMatch: firefoxSpecs');
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
