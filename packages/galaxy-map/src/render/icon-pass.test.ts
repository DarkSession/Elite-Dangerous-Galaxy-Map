import { describe, expect, test, vi } from 'vitest';
import { mat4 } from 'gl-matrix';
import { cameraPosition, projectionMatrix, viewMatrix } from '../camera/projection';
import type { View } from '../camera/view';
import {
  ARROW_HEIGHT_CSS,
  ARROW_WIDTH_CSS,
  arrowApexCss,
  ICON_CSS_SIZE,
  iconBottomCss,
  MAX_ICON_STACKS,
} from '../scene-data/icon-stack';
import { markerCssSize } from '../scene-data/marker-size';
import { createSystemSet } from '../scene-data/real-systems';
import type { RealSystemSet, SystemRecordInput } from '../scene-data/real-systems';
import { rebasePositions } from './system-pass';
import {
  createIconPass,
  createIconProgram,
  ICON_RANGE_BIAS,
  MAX_STACK_ICONS,
} from './icon-pass';
import type { IconPass, IconPlacement } from './icon-pass';

/** One call a pass made on the context. */
interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
}

/** A context that records every call and links every program. */
function fakeContext(): {
  gl: WebGL2RenderingContext;
  of(name: string): Call[];
} {
  const calls: Call[] = [];
  const constants = new Map<string, number>();
  const state: Record<string, unknown> = {
    drawingBufferWidth: 800,
    drawingBufferHeight: 600,
  };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_state, key): unknown {
      if (typeof key !== 'string') return undefined;
      if (key in state) return state[key];
      if (/^[A-Z][A-Z0-9_]*$/.test(key)) {
        const held = constants.get(key);
        if (held !== undefined) return held;
        const next = constants.size + 1;
        constants.set(key, next);
        return next;
      }
      return (...args: unknown[]): unknown => {
        calls.push({ name: key, args });
        switch (key) {
          case 'getShaderParameter':
          case 'getProgramParameter':
            return true;
          case 'getUniformLocation':
            return args[1];
          default:
            return key.startsWith('create') ? { name: key } : null;
        }
      };
    },
  };
  return {
    gl: new Proxy(state, handler) as unknown as WebGL2RenderingContext,
    of(name: string): Call[] {
      return calls.filter((call) => call.name === name);
    },
  };
}

/** A rasteriser that answers at once, so every URL is ready after one turn. */
function readyRasterise(): (url: string, side: number) => Promise<TexImageSource> {
  return (url: string, side: number): Promise<TexImageSource> =>
    Promise.resolve({ url, side } as unknown as TexImageSource);
}

/** Lets the settled loads reach their uploads. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/** The viewport every placement test draws through, in device pixels. */
const VIEWPORT = { width: 800, height: 600 };

/** A view looking down the axis the records below sit on. */
const VIEW: View = { cursor: [0, 0, 0], distance: 100, yaw: 0, pitch: 0 };

/** The combined projection and view matrix of a view, as the renderer builds it. */
function matrixOf(view: View): Float32Array {
  const matrix = mat4.create();
  mat4.multiply(matrix, projectionMatrix(view, VIEWPORT), viewMatrix(view));
  return matrix as Float32Array;
}

/** The camera-relative cursor, whose third axis runs the other way to the game's. */
function cursorOffsetOf(view: View, camera: readonly [number, number, number]) {
  return [
    view.cursor[0] - camera[0],
    view.cursor[1] - camera[1],
    camera[2] - view.cursor[2],
  ] as [number, number, number];
}

/** A set of the records given, all in one category. */
function setOf(records: readonly SystemRecordInput[]): RealSystemSet {
  const set = createSystemSet();
  set.addCategories([{ name: 'A', color: [10, 20, 30] }]);
  set.addSystems(records);
  return set;
}

/** One record with the icons named. */
function record(
  name: string,
  position: readonly [number, number, number],
  icons?: readonly unknown[],
): SystemRecordInput {
  const made: Record<string, unknown> = {
    name,
    coords: { x: position[0], y: position[1], z: position[2] },
    categories: ['A'],
  };
  if (icons !== undefined) made['icons'] = icons;
  return made as SystemRecordInput;
}

/** One host icon of a URL and a colour. */
function hostIcon(url: string, color: readonly [number, number, number]) {
  return { url, color };
}

/** Builds a pass over a fake context, with a rasteriser that answers at once. */
function passOver(gl: WebGL2RenderingContext): IconPass {
  return createIconPass(gl, createIconProgram(gl), {
    textures: { pixelRatio: 1, rasterise: readyRasterise() },
  });
}

/** Runs `prepare` for a set, at the view and the pixel ratio given. */
function prepareOf(
  pass: IconPass,
  set: RealSystemSet,
  options: { view?: View; pixelRatio?: number; selectedIndex?: number } = {},
): number {
  const view = options.view ?? VIEW;
  const camera = cameraPosition(view);
  return pass.prepare({
    viewProjection: matrixOf(view),
    camera,
    cursorOffset: cursorOffsetOf(view, camera),
    near: 1,
    pixelRatio: options.pixelRatio ?? 1,
    set,
    selectedIndex: options.selectedIndex ?? -1,
  });
}

/** The placements of one kind. */
function ofKind(
  list: readonly IconPlacement[],
  kind: 'icon' | 'arrow',
): IconPlacement[] {
  return list.filter((entry) => entry.kind === kind);
}

describe('the offset the range test compares', () => {
  // The pass builds each axis of the offset with `Math.fround`, which is what a write
  // into a `Float32Array` does, so the range it uploads comes from the numbers the
  // marker position buffer holds. One case sits at 50 light years and one at 120,000,
  // the two ends the pass works over.
  //
  // Each position sits on the game's 1/32 grid and neither camera does, so the
  // difference carries more bits than a `float32` holds. The two pairs are chosen: for
  // each one the per-axis rounding moves the last bit of the range, so a pass that
  // rounds only the square root uploads a different `float32`. The positions sit inside
  // the model bounds, because the set drops a record outside them, and the cameras do
  // not have to.
  const cases = [
    {
      range: 50,
      position: [5.6875, 4.125, 37.0625],
      camera: [-0.31255, 8.12505, -12.43755],
    },
    {
      range: 120000,
      position: [10282.6875, -6592.0625, 74305.03125],
      camera: [12.50005, -8.25005, -45073.25708],
    },
  ] as const;

  for (const { range, position, camera } of cases) {
    test(`is bit for bit the value the marker buffer holds at ${range} light years`, async () => {
      // What the marker buffer holds for this system and this camera.
      const out = new Float32Array(3);
      rebasePositions(Float64Array.from(position), 1, camera, [0, 0, 0], out);
      const expected = Math.fround(
        Math.hypot(out[0] as number, out[1] as number, out[2] as number),
      );
      expect(expected).toBeCloseTo(range, 0);

      const context = fakeContext();
      const pass = passOver(context.gl);
      const set = setOf([record('Case', position, [hostIcon('/a.svg', [1, 2, 3])])]);
      const frame = {
        viewProjection: matrixOf(VIEW),
        camera,
        // The cursor sits on the system, so the draw-range cut measures zero and keeps
        // the stack at both ends.
        cursorOffset: [out[0] as number, out[1] as number, out[2] as number] as [
          number,
          number,
          number,
        ],
        near: 1,
        pixelRatio: 1,
        set,
        selectedIndex: -1,
      };

      // The first frame starts the load, and no icon draws before its vector is ready.
      pass.prepare(frame);
      await settle();
      // The count is 1 only while the offset points in front of the camera, so a pass
      // that builds the third axis the other way up places nothing here.
      expect(pass.prepare(frame)).toBe(1);
      pass.draw({ ...frame, range: null });

      // The instance stream carries the range at float index 7 of each instance. The
      // arrow of the stack is the first instance and its icon is the second, so the
      // range of the icon sits nine floats further on.
      const uploads = context.of('bufferSubData');
      const stream = uploads[uploads.length - 1]?.args[2] as Float32Array;
      expect(stream[7]).toBe(expected);
      expect(stream[16]).toBe(expected);
    });
  }

  test('takes a bias above the float32 step and below any separation that matters', () => {
    // The `float32` relative step is 2^-23, which is 1.19e-7.
    expect(ICON_RANGE_BIAS).toBeGreaterThan(2 ** -23 * 10);
    // At 50 light years the bias is half a thousandth of a light year, and at 120,000 it
    // is 1.2 light years. Neither is a separation the eye reads.
    expect(50 * ICON_RANGE_BIAS).toBeLessThan(0.001);
    expect(120000 * ICON_RANGE_BIAS).toBeLessThan(2);
  });
});

describe('the icon stack placement', () => {
  test('places the icons of a stack of four and its arrow', async () => {
    const context = fakeContext();
    const pass = passOver(context.gl);
    const set = setOf([
      record(
        'Sol',
        [0, 0, 0],
        [
          hostIcon('/a.svg', [1, 2, 3]),
          hostIcon('/b.svg', [4, 5, 6]),
          hostIcon('/c.svg', [7, 8, 9]),
          hostIcon('/d.svg', [10, 11, 12]),
        ],
      ),
    ]);

    // The first frame starts the loads, and no icon draws before its vector is ready.
    prepareOf(pass, set);
    await settle();
    expect(prepareOf(pass, set)).toBe(1);

    const list = pass.placements();
    const icons = ofKind(list, 'icon');
    const arrows = ofKind(list, 'arrow');
    expect(icons).toHaveLength(4);
    expect(arrows).toHaveLength(1);

    // The system sits at the cursor, so its marker draws at the middle of the frame.
    const markerCss = markerCssSize(VIEW.distance);
    for (let at = 0; at < 4; at += 1) {
      const icon = icons[at] as IconPlacement;
      expect(icon.stackIndex).toBe(at);
      expect(icon.url).toBe(['/a.svg', '/b.svg', '/c.svg', '/d.svg'][at]);
      expect(icon.width).toBe(ICON_CSS_SIZE);
      expect(icon.height).toBe(ICON_CSS_SIZE);
      expect(icon.left).toBeCloseTo(400 - ICON_CSS_SIZE / 2, 5);
      expect(icon.top + icon.height).toBeCloseTo(
        iconBottomCss(300, markerCss, at, false),
        0,
      );
    }
    // Two icons of one stack sit 2 CSS pixels apart.
    const first = icons[0] as IconPlacement;
    const second = icons[1] as IconPlacement;
    expect(first.top - (second.top + second.height)).toBeCloseTo(2, 0);

    const arrow = arrows[0] as IconPlacement;
    expect(arrow.stackIndex).toBe(0);
    expect(arrow.url).toBe('');
    expect(arrow.color).toEqual([1, 2, 3]);
    expect(arrow.width).toBeCloseTo(ARROW_WIDTH_CSS, 5);
    expect(arrow.height).toBeCloseTo(ARROW_HEIGHT_CSS, 5);
    expect(arrow.top + arrow.height).toBeCloseTo(
      arrowApexCss(300, markerCss, false),
      0,
    );
  });

  test('holds the icon at 28 CSS pixels under a device pixel ratio of 1', async () => {
    const context = fakeContext();
    const pass = passOver(context.gl);
    const set = setOf([
      record(
        'Sol',
        [0, 0, 0],
        [hostIcon('/a.svg', [1, 2, 3]), hostIcon('/b.svg', [4, 5, 6])],
      ),
    ]);

    // A browser at a zoom under 100 per cent on a 1x screen reports a ratio below 1.
    prepareOf(pass, set, { pixelRatio: 0.5 });
    await settle();
    expect(prepareOf(pass, set, { pixelRatio: 0.5 })).toBe(1);

    const icons = ofKind(pass.placements(), 'icon');
    const lower = icons[0] as IconPlacement;
    const upper = icons[1] as IconPlacement;
    // The size rule is in CSS pixels at every ratio. The texture side holds a floor of
    // 1, and a quad of that side would draw a 56 CSS pixel icon here.
    expect(lower.width).toBeCloseTo(ICON_CSS_SIZE, 0);
    expect(lower.height).toBeCloseTo(ICON_CSS_SIZE, 0);
    // The two icons of the stack hold their 2 CSS pixels apart and do not overlap.
    expect(lower.top - (upper.top + upper.height)).toBeCloseTo(2, 0);
  });

  test('lifts the whole stack by the height of the pin for the selection', async () => {
    const context = fakeContext();
    const pass = passOver(context.gl);
    const set = setOf([record('Sol', [0, 0, 0], [hostIcon('/a.svg', [1, 2, 3])])]);

    prepareOf(pass, set);
    await settle();
    prepareOf(pass, set);
    const before = (ofKind(pass.placements(), 'icon')[0] as IconPlacement).top;
    prepareOf(pass, set, { selectedIndex: 0 });
    const after = (ofKind(pass.placements(), 'icon')[0] as IconPlacement).top;

    expect(before - after).toBeCloseTo(28, 0);
  });

  test('drops a candidate whose centre is outside the viewport', async () => {
    const context = fakeContext();
    const pass = passOver(context.gl);
    const set = setOf([
      record('Sol', [0, 0, 0], [hostIcon('/a.svg', [1, 2, 3])]),
      record('Away', [400, 0, 0], [hostIcon('/a.svg', [1, 2, 3])]),
    ]);

    prepareOf(pass, set);
    await settle();
    expect(prepareOf(pass, set)).toBe(1);
    expect(ofKind(pass.placements(), 'arrow').map((one) => one.systemIndex)).toEqual([
      0,
    ]);
  });

  test('keeps the 32 stacks nearest the camera and drops the rest', async () => {
    const context = fakeContext();
    const pass = passOver(context.gl);
    const records: SystemRecordInput[] = [];
    // 40 systems along the view axis, the last one nearest the camera. The camera looks
    // from `z = -100`, so a smaller z is nearer.
    for (let index = 0; index < 40; index += 1) {
      records.push(
        record(`S${index}`, [0, 0, 40 - index], [hostIcon('/a.svg', [1, 2, 3])]),
      );
    }
    const set = setOf(records);

    prepareOf(pass, set);
    await settle();
    expect(prepareOf(pass, set)).toBe(MAX_ICON_STACKS);

    const kept = new Set(
      ofKind(pass.placements(), 'arrow').map((one) => one.systemIndex),
    );
    expect(kept.size).toBe(MAX_ICON_STACKS);
    // The 8 furthest are the first 8 records, which sit at the largest z.
    for (let index = 0; index < 8; index += 1) expect(kept.has(index)).toBe(false);
    for (let index = 8; index < 40; index += 1) expect(kept.has(index)).toBe(true);
  });

  test('reports the furthest stack first, so a nearer stack draws over it', async () => {
    const context = fakeContext();
    const pass = passOver(context.gl);
    const set = setOf([
      record('Near', [0, 0, 10], [hostIcon('/a.svg', [1, 2, 3])]),
      record('Far', [0, 0, 60], [hostIcon('/b.svg', [4, 5, 6])]),
    ]);

    prepareOf(pass, set);
    await settle();
    prepareOf(pass, set);

    expect(ofKind(pass.placements(), 'arrow').map((one) => one.systemIndex)).toEqual([
      1, 0,
    ]);
  });

  test('puts the arrow of a stack before its own icons, furthest stack first', async () => {
    const context = fakeContext();
    const pass = passOver(context.gl);
    const set = setOf([
      record(
        'Near',
        [0, 0, 10],
        [hostIcon('/a.svg', [1, 2, 3]), hostIcon('/b.svg', [4, 5, 6])],
      ),
      record(
        'Far',
        [0, 0, 60],
        [hostIcon('/c.svg', [7, 8, 9]), hostIcon('/d.svg', [10, 11, 12])],
      ),
    ]);

    prepareOf(pass, set);
    await settle();
    prepareOf(pass, set);

    // One stack is its arrow and its icons together, so the arrow takes the order of its
    // own stack and not the order of every arrow of the frame.
    expect(
      pass.placements().map((one) => `${one.systemIndex}:${one.kind}${one.stackIndex}`),
    ).toEqual(['1:arrow0', '1:icon0', '1:icon1', '0:arrow0', '0:icon0', '0:icon1']);

    pass.draw({
      viewProjection: matrixOf(VIEW),
      camera: cameraPosition(VIEW),
      cursorOffset: cursorOffsetOf(VIEW, cameraPosition(VIEW)),
      near: 1,
      pixelRatio: 1,
      set,
      selectedIndex: -1,
      range: null,
    });

    // The one stream carries that order, with the kind of each instance in its last
    // float: 1 for an arrow and 0 for an icon.
    const upload = context.of('bufferSubData').at(-1) as Call;
    const stream = upload.args[2] as Float32Array;
    const floats = (upload.args[4] as number) / 6;
    const kinds: number[] = [];
    for (let at = 0; at < 6; at += 1) {
      kinds.push(stream[at * floats + floats - 1] as number);
    }
    expect(kinds).toEqual([1, 0, 0, 1, 0, 0]);
  });

  test('reads nothing of a set in which no record holds an icon', () => {
    const context = fakeContext();
    const pass = passOver(context.gl);
    const records: SystemRecordInput[] = [];
    for (let index = 0; index < 200; index += 1) {
      records.push(record(`S${index}`, [index % 50, 0, 0]));
    }
    const set = setOf(records);
    const read = vi.fn(set.system.bind(set));
    const watched = { ...set, system: read } as unknown as RealSystemSet;

    expect(prepareOf(pass, watched)).toBe(0);
    expect(read).not.toHaveBeenCalled();
    expect(pass.placements()).toEqual([]);
  });

  test('draws the stack once a record of that same set holds an icon', async () => {
    const context = fakeContext();
    const pass = passOver(context.gl);
    const set = setOf([record('Sol', [0, 0, 0])]);
    expect(prepareOf(pass, set)).toBe(0);

    set.addSystems([record('Sol', [0, 0, 0], [hostIcon('/a.svg', [1, 2, 3])])]);
    prepareOf(pass, set);
    await settle();

    expect(prepareOf(pass, set)).toBe(1);
    expect(pass.placements()).toHaveLength(2);
  });

  test('draws the other icons of a stack while one vector is not ready', async () => {
    const context = fakeContext();
    const gl = context.gl;
    const pass = createIconPass(gl, createIconProgram(gl), {
      textures: {
        pixelRatio: 1,
        rasterise: (url: string, side: number): Promise<TexImageSource> =>
          url === '/bad.svg'
            ? Promise.reject(new Error('refused'))
            : Promise.resolve({ url, side } as unknown as TexImageSource),
      },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const set = setOf([
      record(
        'Sol',
        [0, 0, 0],
        [hostIcon('/good.svg', [1, 2, 3]), hostIcon('/bad.svg', [4, 5, 6])],
      ),
    ]);

    prepareOf(pass, set);
    await settle();
    prepareOf(pass, set);

    const list = pass.placements();
    expect(ofKind(list, 'icon').map((one) => one.url)).toEqual(['/good.svg']);
    expect(ofKind(list, 'arrow')).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  test('places the boxes on whole device pixels at a ratio of 2', async () => {
    const context = fakeContext();
    const pass = passOver(context.gl);
    const set = setOf([record('Sol', [0.5, 0.25, 0], [hostIcon('/a.svg', [1, 2, 3])])]);

    prepareOf(pass, set, { pixelRatio: 2 });
    await settle();
    prepareOf(pass, set, { pixelRatio: 2 });

    for (const entry of pass.placements()) {
      expect(Number.isInteger(entry.left * 2)).toBe(true);
      expect(Number.isInteger(entry.top * 2)).toBe(true);
    }
    // The icon still reads 28 CSS pixels square, from a 56 device pixel quad.
    const icon = ofKind(pass.placements(), 'icon')[0] as IconPlacement;
    expect(icon.width).toBe(ICON_CSS_SIZE);
  });
});

describe('the icon draw', () => {
  test('issues one call for 32 stacks of 4 icons', async () => {
    const context = fakeContext();
    const pass = passOver(context.gl);
    const records: SystemRecordInput[] = [];
    for (let index = 0; index < MAX_ICON_STACKS; index += 1) {
      records.push(
        record(
          `S${index}`,
          [index - 16, 0, index],
          [
            hostIcon('/a.svg', [1, 2, 3]),
            hostIcon('/b.svg', [4, 5, 6]),
            hostIcon('/c.svg', [7, 8, 9]),
            hostIcon('/d.svg', [10, 11, 12]),
          ],
        ),
      );
    }
    const set = setOf(records);

    prepareOf(pass, set);
    await settle();
    expect(prepareOf(pass, set)).toBe(MAX_ICON_STACKS);
    const list = pass.placements();
    expect(ofKind(list, 'icon')).toHaveLength(MAX_STACK_ICONS);
    expect(ofKind(list, 'arrow')).toHaveLength(MAX_ICON_STACKS);

    const calls = pass.draw({
      viewProjection: matrixOf(VIEW),
      camera: cameraPosition(VIEW),
      cursorOffset: cursorOffsetOf(VIEW, cameraPosition(VIEW)),
      near: 1,
      pixelRatio: 1,
      set,
      selectedIndex: -1,
      range: null,
    });

    expect(calls).toBe(1);
    expect(pass.drawCalls()).toBe(1);
    expect(context.of('drawArraysInstanced')).toHaveLength(1);
    // One stream holds every instance of the frame: an arrow and four icons per stack.
    expect(context.of('drawArraysInstanced')[0]?.args[3]).toBe(
      MAX_STACK_ICONS + MAX_ICON_STACKS,
    );
  });

  test('issues no call in a frame that placed no stack', () => {
    const context = fakeContext();
    const pass = passOver(context.gl);
    const set = setOf([record('Sol', [0, 0, 0])]);
    prepareOf(pass, set);

    const calls = pass.draw({
      viewProjection: matrixOf(VIEW),
      camera: cameraPosition(VIEW),
      cursorOffset: cursorOffsetOf(VIEW, cameraPosition(VIEW)),
      near: 1,
      pixelRatio: 1,
      set,
      selectedIndex: -1,
      range: null,
    });

    expect(calls).toBe(0);
    expect(context.of('drawArraysInstanced')).toHaveLength(0);
  });

  test('tells the shaders there is no range buffer, and draws anyway', async () => {
    const context = fakeContext();
    const pass = passOver(context.gl);
    const set = setOf([record('Sol', [0, 0, 0], [hostIcon('/a.svg', [1, 2, 3])])]);
    prepareOf(pass, set);
    await settle();
    prepareOf(pass, set);

    pass.draw({
      viewProjection: matrixOf(VIEW),
      camera: cameraPosition(VIEW),
      cursorOffset: cursorOffsetOf(VIEW, cameraPosition(VIEW)),
      near: 1,
      pixelRatio: 1,
      set,
      selectedIndex: -1,
      range: null,
    });

    const flags = context
      .of('uniform1f')
      .filter((call) => call.args[0] === 'uHasRange')
      .map((call) => call.args[1]);
    expect(flags).toEqual([0]);
    expect(context.of('drawArraysInstanced')).toHaveLength(1);
  });
});
