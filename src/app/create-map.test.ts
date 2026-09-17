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

  test('clears the shapes with the systems', async () => {
    const map = createGalaxyMap(refusingCanvas());
    await expect(map.ready).rejects.toThrow(NO_WEBGL2_MESSAGE);

    map.addCategories([{ name: 'Empire', color: [0, 180, 255] }]);
    map.addSystems([
      { name: 'Sol', coords: { x: 0, y: 0, z: 0 }, primaryCategory: 'Empire' },
    ]);
    map.addSpheres([{ position: [100, 0, 200], radius: 50, color: [255, 0, 0] }]);
    map.addLines([
      {
        points: [
          [0, 0, 0],
          [100, 0, 0],
        ],
        color: [0, 255, 0],
      },
    ]);
    expect(map.sphereCount()).toBe(1);
    expect(map.lineCount()).toBe(1);

    map.clearSystems();
    expect(map.sphereCount()).toBe(0);
    expect(map.lineCount()).toBe(0);
  });

  test('resolves a line point against a system name without case', async () => {
    const map = createGalaxyMap(refusingCanvas());
    await expect(map.ready).rejects.toThrow(NO_WEBGL2_MESSAGE);

    map.addCategories([{ name: 'Empire', color: [0, 180, 255] }]);
    map.addSystems([
      { name: 'Sol', coords: { x: 0, y: 0, z: 0 }, primaryCategory: 'Empire' },
      {
        name: 'Alioth',
        id64: '10477373803',
        coords: { x: -33.65, y: 72.46, z: -20.65 },
        primaryCategory: 'Empire',
      },
    ]);
    const report = map.addLines([
      {
        points: [{ system: 'sol' }, { system: '10477373803' }, [100, 0, 0]],
        color: [0, 255, 0],
      },
      { points: [{ system: 'Nowhere' }, [0, 0, 0]], color: [0, 255, 0] },
    ]);

    expect(report.added).toBe(1);
    expect(report.rejected).toEqual([{ index: 1, reason: 'unknown-system' }]);
    expect(map.getLine(0)?.points).toEqual([
      [0, 0, 0],
      [-33.65, 72.46, -20.65],
      [100, 0, 0],
    ]);
  });

  test('a load clears the shapes', async () => {
    const map = createGalaxyMap(refusingCanvas(), {
      datasets: [
        {
          id: 'next',
          label: 'Next',
          load: () => ({
            categories: [{ name: 'Empire', color: [0, 180, 255] as const }],
            systems: [
              { name: 'Sol', coords: { x: 0, y: 0, z: 0 }, primaryCategory: 'Empire' },
              {
                name: 'Alioth',
                coords: { x: -33, y: 72, z: -20 },
                primaryCategory: 'Empire',
              },
            ],
          }),
        },
      ],
    });
    await expect(map.ready).rejects.toThrow(NO_WEBGL2_MESSAGE);

    map.addSpheres([{ position: [100, 0, 200], radius: 50, color: [255, 0, 0] }]);
    map.addLines([
      {
        points: [
          [0, 0, 0],
          [100, 0, 0],
        ],
        color: [0, 255, 0],
      },
    ]);
    expect(map.sphereCount()).toBe(1);
    expect(map.lineCount()).toBe(1);

    await map.loadDataset('next');

    expect(map.systemCount()).toBe(2);
    expect(map.sphereCount()).toBe(0);
    expect(map.lineCount()).toBe(0);
  });

  test('a listener can add a line naming a loaded system', async () => {
    // The order the demo page needs: `loadDataset` writes the set, and it raises the
    // listeners after that write, so a listener resolves a point by name in the same step.
    const map = createGalaxyMap(refusingCanvas(), {
      datasets: [
        {
          id: 'next',
          label: 'Next',
          load: () => ({
            categories: [{ name: 'Empire', color: [0, 180, 255] as const }],
            systems: [
              { name: 'Sol', coords: { x: 0, y: 0, z: 0 }, primaryCategory: 'Empire' },
              {
                name: 'Alioth',
                coords: { x: -33, y: 72, z: -20 },
                primaryCategory: 'Empire',
              },
            ],
          }),
        },
      ],
    });
    await expect(map.ready).rejects.toThrow(NO_WEBGL2_MESSAGE);

    const reports: number[] = [];
    map.onDatasetChange(() => {
      const report = map.addLines([
        { points: [{ system: 'Sol' }, { system: 'Alioth' }], color: [0, 255, 0] },
      ]);
      reports.push(report.added);
    });

    await map.loadDataset('next');

    expect(reports).toEqual([1]);
    expect(map.lineCount()).toBe(1);
    expect(map.getLine(0)?.points).toEqual([
      [0, 0, 0],
      [-33, 72, -20],
    ]);
  });

  test('a failed load leaves the shapes', async () => {
    const map = createGalaxyMap(refusingCanvas(), {
      datasets: [
        {
          id: 'bad',
          label: 'Bad',
          load: () => Promise.reject(new Error('The host load failed.')),
        },
      ],
    });
    await expect(map.ready).rejects.toThrow(NO_WEBGL2_MESSAGE);

    map.addSpheres([{ position: [100, 0, 200], radius: 50, color: [255, 0, 0] }]);
    expect(map.sphereCount()).toBe(1);

    await expect(map.loadDataset('bad')).rejects.toThrow('The host load failed.');

    expect(map.sphereCount()).toBe(1);
  });

  test('takes the shapes option and the shapes switch', async () => {
    const on = createGalaxyMap(refusingCanvas());
    const off = createGalaxyMap(refusingCanvas(), { shapes: false });
    await expect(on.ready).rejects.toThrow(NO_WEBGL2_MESSAGE);
    await expect(off.ready).rejects.toThrow(NO_WEBGL2_MESSAGE);

    expect(on.areShapesVisible()).toBe(true);
    expect(off.areShapesVisible()).toBe(false);

    on.setShapesVisible(false);
    expect(on.areShapesVisible()).toBe(false);
    // A value that is not a boolean leaves the state as it was.
    on.setShapesVisible('yes' as unknown as boolean);
    expect(on.areShapesVisible()).toBe(false);
  });
});

/** One element the fake document made, with what the caller wrote on it. */
interface FakeElement {
  tag: string;
  src?: string;
  className?: string;
  hidden?: boolean;
  readonly style: Record<string, string>;
  setAttribute(name: string, value: string): void;
  addEventListener(name: string, listener: () => void): void;
  remove(): void;
}

/** A canvas with no context, in a parent that records what the map adds to it. */
function canvasInParent(): {
  canvas: HTMLCanvasElement;
  added: FakeElement[];
  removed: FakeElement[];
} {
  const added: FakeElement[] = [];
  const removed: FakeElement[] = [];
  const parent = {
    appendChild: (node: FakeElement): FakeElement => {
      added.push(node);
      return node;
    },
  };
  const ownerDocument = {
    createElement: (tag: string): FakeElement => ({
      tag,
      style: {},
      setAttribute: () => undefined,
      addEventListener: () => undefined,
      remove(): void {
        removed.push(this as unknown as FakeElement);
      },
    }),
  };
  const canvas = {
    getContext: () => null,
    clientWidth: 800,
    clientHeight: 600,
    offsetLeft: 0,
    offsetTop: 0,
    width: 800,
    height: 600,
    parentElement: parent,
    ownerDocument,
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, added, removed };
}

describe('the loading image', () => {
  const scope = globalThis as unknown as {
    window?: unknown;
    requestAnimationFrame?: unknown;
  };
  let hadWindow = false;

  beforeEach(() => {
    hadWindow = 'window' in scope;
    scope.window = {};
    scope.requestAnimationFrame = vi.fn();
  });

  afterEach(() => {
    if (!hadWindow) delete scope.window;
    delete scope.requestAnimationFrame;
  });

  test('adds no element when the options name no picture', async () => {
    const { canvas, added } = canvasInParent();
    const map = createGalaxyMap(canvas);

    await expect(map.ready).rejects.toThrow(NO_WEBGL2_MESSAGE);
    expect(added).toHaveLength(0);
  });

  test('adds no element for a URL the scheme check refuses', async () => {
    const { canvas, added } = canvasInParent();
    const map = createGalaxyMap(canvas, { loadingImage: 'javascript:alert(1)' });

    await expect(map.ready).rejects.toThrow(NO_WEBGL2_MESSAGE);
    expect(added).toHaveLength(0);
  });

  test('adds the picture and takes it away when the start fails', async () => {
    const { canvas, added, removed } = canvasInParent();
    const map = createGalaxyMap(canvas, {
      loadingImage: 'https://example.test/loader.svg',
    });

    expect(added).toHaveLength(1);
    expect(added[0]?.tag).toBe('img');
    expect(added[0]?.src).toBe('https://example.test/loader.svg');
    // The canvas is 800 by 600 at the parent's corner, so the picture's middle sits at
    // its middle.
    expect(added[0]?.style['left']).toBe('400px');
    expect(added[0]?.style['top']).toBe('300px');

    await expect(map.ready).rejects.toThrow(NO_WEBGL2_MESSAGE);
    expect(removed).toHaveLength(1);
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

describe('the grid change notification', () => {
  const scope = globalThis as unknown as {
    window?: unknown;
    requestAnimationFrame?: unknown;
  };
  let hadWindow = false;

  beforeEach(() => {
    hadWindow = 'window' in scope;
    scope.window = {};
    scope.requestAnimationFrame = vi.fn();
  });

  afterEach(() => {
    if (!hadWindow) delete scope.window;
    delete scope.requestAnimationFrame;
  });

  test('calls the listener on each move and not on a set to the value it holds', async () => {
    const map = createGalaxyMap(refusingCanvas());
    await expect(map.ready).rejects.toThrow(NO_WEBGL2_MESSAGE);
    const moves: boolean[] = [];
    const stop = map.onGridChange((on) => moves.push(on));

    expect(map.isGridVisible()).toBe(false);
    map.setGridVisible(false);
    expect(moves).toEqual([]);

    map.setGridVisible(true);
    map.setGridVisible(true);
    map.setGridVisible(false);
    expect(moves).toEqual([true, false]);
    expect(map.isGridVisible()).toBe(false);

    stop();
    map.setGridVisible(true);
    expect(moves).toEqual([true, false]);
    expect(map.isGridVisible()).toBe(true);
  });
});
