import { ESLint } from 'eslint';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { NO_WEBGL2_MESSAGE } from '../render/context';
import { createGalaxyMap } from './create-map';

/** A canvas that gives no context, as a browser with no WebGL2 does. */
function refusingCanvas(): HTMLCanvasElement {
  return {
    getContext: () => null,
    clientWidth: 800,
    clientHeight: 600,
    width: 800,
    height: 600,
  } as unknown as HTMLCanvasElement;
}

describe('the entry point with no WebGL2 context', () => {
  const scope = globalThis as unknown as {
    window?: unknown;
    requestAnimationFrame?: unknown;
  };
  let hadWindow = false;
  let frames = vi.fn();

  beforeEach(() => {
    hadWindow = 'window' in scope;
    frames = vi.fn();
    scope.window = {};
    scope.requestAnimationFrame = frames;
  });

  afterEach(() => {
    if (!hadWindow) delete scope.window;
    delete scope.requestAnimationFrame;
  });

  test('returns a handle whose ready rejects, and asks for no frame', async () => {
    const map = createGalaxyMap(refusingCanvas());
    expect(map.systemCount()).toBe(0);

    await expect(map.ready).rejects.toThrow(NO_WEBGL2_MESSAGE);
    expect(frames).not.toHaveBeenCalled();
  });

  test('keeps reading records with no context', async () => {
    const map = createGalaxyMap(refusingCanvas());
    await expect(map.ready).rejects.toThrow(NO_WEBGL2_MESSAGE);

    map.addCategories([{ name: 'Empire', color: [0, 180, 255] }]);
    const report = map.addSystems([
      { name: 'Sol', coords: { x: 0, y: 0, z: 0 }, primaryCategory: 'Empire' },
    ]);
    expect(report.added).toBe(1);
    expect(map.systemCount()).toBe(1);
    expect(frames).not.toHaveBeenCalled();
  });
});

describe('the lint rule on the location', () => {
  test('passes the library as it stands and fails a read of window.location', async () => {
    const eslint = new ESLint();
    const source = 'export const hash = (): string => window.location.hash;\n';

    const clean = await eslint.lintText('export const value = 1;\n', {
      filePath: 'src/app/create-map.ts',
    });
    expect(clean[0]?.errorCount).toBe(0);

    const broken = await eslint.lintText(source, {
      filePath: 'src/app/create-map.ts',
    });
    expect(broken[0]?.errorCount).toBe(1);
    expect(broken[0]?.messages[0]?.ruleId).toBe('no-restricted-properties');

    // The page is the one file the rule leaves alone.
    const page = await eslint.lintText(source, { filePath: 'src/app/main.ts' });
    expect(page[0]?.errorCount).toBe(0);
  });
});
