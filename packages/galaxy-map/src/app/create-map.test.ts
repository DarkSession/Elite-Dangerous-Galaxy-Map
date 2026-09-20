import { ESLint } from 'eslint';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { NO_WEBGL2_MESSAGE } from '../render/context';
import { createGalaxyMap, readNebulaSource } from './create-map';

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

  test('holds one category flag for the markers and one for the shapes', async () => {
    const map = createGalaxyMap(refusingCanvas());
    await expect(map.ready).rejects.toThrow(NO_WEBGL2_MESSAGE);

    map.addCategories([{ name: 'Empire', color: [0, 180, 255] }]);
    map.addSystems([
      { name: 'Sol', coords: { x: 0, y: 0, z: 0 }, primaryCategory: 'Empire' },
    ]);
    map.addSpheres([
      { position: [100, 0, 200], radius: 50, primaryCategory: 'Empire' },
    ]);

    map.setCategoryVisible('Empire', false);
    expect(map.isCategoryVisible('Empire')).toBe(false);
    expect(map.isShapeCategoryVisible('Empire')).toBe(true);

    map.setCategoryVisible('Empire', true);
    map.setShapeCategoryVisible('Empire', false);
    expect(map.isCategoryVisible('Empire')).toBe(true);
    expect(map.isShapeCategoryVisible('Empire')).toBe(false);

    // A name the table does not hold moves nothing and throws nothing.
    map.setShapeCategoryVisible('Nowhere', false);
    expect(map.isShapeCategoryVisible('Nowhere')).toBe(false);
  });

  test('turns every shape flag back on when a clear takes the shapes', async () => {
    const map = createGalaxyMap(refusingCanvas());
    await expect(map.ready).rejects.toThrow(NO_WEBGL2_MESSAGE);

    const sphere = { position: [100, 0, 200] as const, radius: 50 };
    map.addCategories([{ name: 'Empire', color: [0, 180, 255] }]);
    map.addSpheres([{ ...sphere, primaryCategory: 'Empire' }]);
    map.setShapeCategoryVisible('Empire', false);

    // Each of the three clears empties the shape set, so each one drops the flags with
    // it. A flag held over a clear would hide the shapes of a name the next set holds.
    map.clearShapes();
    expect(map.isShapeCategoryVisible('Empire')).toBe(true);

    map.setShapeCategoryVisible('Empire', false);
    map.clearSystems();
    expect(map.isShapeCategoryVisible('Empire')).toBe(true);

    map.setShapeCategoryVisible('Empire', false);
    map.clearSystemsAndCategories();
    map.addCategories([{ name: 'Empire', color: [0, 180, 255] }]);
    map.addSpheres([{ ...sphere, primaryCategory: 'Empire' }]);
    expect(map.isShapeCategoryVisible('Empire')).toBe(true);
    expect(map.getShapeInfo('sphere', 0)?.drawn).toBe(true);
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

  test('takes the system icons option and the system icons switch', async () => {
    const start = createGalaxyMap(refusingCanvas());
    const off = createGalaxyMap(refusingCanvas(), { systemIcons: false });
    // A value that is not a boolean takes the default, which is on. `system-icons`
    // states why the default runs the other way to the name labels.
    const unreadable = createGalaxyMap(refusingCanvas(), {
      systemIcons: 'no' as unknown as boolean,
    });
    await expect(start.ready).rejects.toThrow(NO_WEBGL2_MESSAGE);
    await expect(off.ready).rejects.toThrow(NO_WEBGL2_MESSAGE);
    await expect(unreadable.ready).rejects.toThrow(NO_WEBGL2_MESSAGE);

    expect(start.areSystemIconsVisible()).toBe(true);
    expect(off.areSystemIconsVisible()).toBe(false);
    expect(unreadable.areSystemIconsVisible()).toBe(true);

    start.setSystemIconsVisible(false);
    expect(start.areSystemIconsVisible()).toBe(false);
    // A value that is not a boolean leaves the state as it was.
    start.setSystemIconsVisible('yes' as unknown as boolean);
    expect(start.areSystemIconsVisible()).toBe(false);
    start.setSystemIconsVisible(true);
    expect(start.areSystemIconsVisible()).toBe(true);
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

    const file = 'packages/galaxy-map/src/app/create-map.ts';

    const clean = await eslint.lintText('export const value = 1;\n', {
      filePath: file,
    });
    expect(clean[0]?.errorCount).toBe(0);

    const broken = await eslint.lintText(source, { filePath: file });
    expect(broken[0]?.errorCount).toBe(1);
    expect(broken[0]?.messages[0]?.ruleId).toBe('no-restricted-properties');

    // The rule held one exception, the demo page. The page is a module of `apps/demo/`
    // now, so the rule over the library package has no hole in it. The reading that
    // covers that is `tests/lint-config.test.ts`, which lists the files the rule
    // ignores and checks its pattern reaches every source file of the package. A
    // `lintText` of a path the block no longer matches would pass and assert nothing.
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

/**
 * A canvas that gives a context good enough for the start chain to read. The map refuses
 * a software renderer, so the stub names a card, and `start` then runs as far as the
 * scene loaders before the fake context fails it.
 */
function acceptingCanvas(): HTMLCanvasElement {
  const gl = {
    getExtension: (): null => null,
    getParameter: (): string => 'Test GPU',
    RENDERER: 1,
  };
  return {
    getContext: () => gl,
    clientWidth: 800,
    clientHeight: 600,
    width: 800,
    height: 600,
    style: {},
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as HTMLCanvasElement;
}

/** A source of spies the map can read, with a draw that draws nothing. */
function spySource(): {
  loadSet: ReturnType<typeof vi.fn>;
  loadVolumes: ReturnType<typeof vi.fn>;
  createDraw: ReturnType<typeof vi.fn>;
} {
  return {
    loadSet: vi.fn(() => new Promise(() => undefined)),
    loadVolumes: vi.fn(() => new Promise(() => undefined)),
    createDraw: vi.fn(() => ({
      draw: () => undefined,
      drawnCount: 0,
      drawCalls: 0,
      dispose: () => undefined,
    })),
  };
}

// The map reads the nebula source at run time, because the type is public as a name and
// not as a shape. A value the map cannot read turns the nebulae off and reports nothing.
//
// The readings of the three unreadable values pass whether or not the check exists, so
// the readable source is the control: it is the one that must call the two loaders.
//
// No map here is disposed. The fake context fails the start before it reads the scene
// data, so a dispose would cancel a load nothing is waiting on and leave the rejection
// with no reader. No map here reaches the frame loop either, so none holds a frame.
describe('the nebula option', () => {
  const scope = globalThis as unknown as {
    window?: unknown;
    requestAnimationFrame?: unknown;
    Worker?: unknown;
  };
  let hadWindow = false;
  let heldFetch: typeof fetch;

  beforeEach(() => {
    hadWindow = 'window' in scope;
    scope.window = {
      addEventListener: (): void => undefined,
      removeEventListener: (): void => undefined,
    };
    scope.requestAnimationFrame = (call: (time: number) => void): number => {
      setTimeout(() => call(0), 0);
      return 1;
    };
    // The scene data and the detail grid are not under test here. Both are held open, so
    // neither leaves a rejected promise behind after the map has failed on its context.
    heldFetch = globalThis.fetch;
    globalThis.fetch = (() => new Promise(() => undefined)) as never;
    scope.Worker = class {
      postMessage(): void {}
      terminate(): void {}
      addEventListener(): void {}
    };
  });

  afterEach(() => {
    if (!hadWindow) delete scope.window;
    delete scope.requestAnimationFrame;
    delete scope.Worker;
    globalThis.fetch = heldFetch;
  });

  test('reads a source that carries the three members, and no other value', () => {
    const source = spySource();
    expect(readNebulaSource(source)).toBe(source);
    expect(readNebulaSource(true)).toBeNull();
    expect(readNebulaSource(null)).toBeNull();
    expect(readNebulaSource(undefined)).toBeNull();
    expect(readNebulaSource({})).toBeNull();
    // Two of the three members, which is the near miss a hand-written source makes.
    const { loadSet, loadVolumes } = spySource();
    expect(readNebulaSource({ loadSet, loadVolumes })).toBeNull();
    expect(readNebulaSource({ loadSet, createDraw: () => undefined })).toBeNull();
  });

  test('loads nothing and reports nothing on a value it cannot read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const partial = spySource();
    const unreadable: unknown[] = [
      true,
      null,
      {},
      { loadSet: partial.loadSet, loadVolumes: partial.loadVolumes },
    ];

    for (const value of unreadable) {
      const map = createGalaxyMap(acceptingCanvas(), {
        nebulae: value as never,
      });
      await map.ready.catch(() => undefined);

      expect(map.hasNebulae(), `${String(value)} reads as a source`).toBe(false);
      expect(map.areNebulaeVisible()).toBe(false);
      // The call does nothing and throws nothing on a map that holds no source.
      expect(() => {
        map.setNebulaeVisible(true);
      }).not.toThrow();
      expect(map.areNebulaeVisible()).toBe(false);
    }

    expect(partial.loadSet).not.toHaveBeenCalled();
    expect(partial.loadVolumes).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    warn.mockRestore();
    error.mockRestore();
  });

  // The control. Without it the readings above pass on a map that loads nothing whatever
  // the option says.
  test('loads the records and the art from a source it can read', async () => {
    const source = spySource();
    const map = createGalaxyMap(acceptingCanvas(), { nebulae: source as never });
    await map.ready.catch(() => undefined);

    expect(source.loadSet).toHaveBeenCalledTimes(1);
    expect(source.loadVolumes).toHaveBeenCalledTimes(1);
    expect(map.hasNebulae()).toBe(true);
    // The sprites open visible on a map that holds a source.
    expect(map.areNebulaeVisible()).toBe(true);
    map.setNebulaeVisible(false);
    expect(map.areNebulaeVisible()).toBe(false);
    map.setNebulaeVisible(true);
    expect(map.areNebulaeVisible()).toBe(true);
  });

  // The nebulae are not part of the first frame, so a load that fails is reported and
  // dropped. The map keeps running and every other pass keeps drawing.
  test('drops the nebulae and keeps drawing when the art fails to load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const source = spySource();
    source.loadSet.mockReturnValue(Promise.resolve({ count: 0 }));
    source.loadVolumes.mockReturnValue(
      Promise.reject(new Error('The nebula volume index did not load.')),
    );

    const map = createGalaxyMap(acceptingCanvas(), { nebulae: source as never });
    await map.ready.catch(() => undefined);
    await Promise.resolve();

    expect(source.createDraw).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'The map dropped the nebulae.',
      expect.anything(),
    );
    // The map still holds its source, so the rest of it is untouched by the failure.
    expect(map.hasNebulae()).toBe(true);
    warn.mockRestore();
  });

  test('holds no nebulae with no option at all', async () => {
    const map = createGalaxyMap(acceptingCanvas());
    await map.ready.catch(() => undefined);

    expect(map.hasNebulae()).toBe(false);
    expect(map.areNebulaeVisible()).toBe(false);
    map.setNebulaeVisible(true);
    expect(map.areNebulaeVisible()).toBe(false);
  });
});
