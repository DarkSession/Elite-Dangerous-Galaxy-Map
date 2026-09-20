import { describe, expect, test } from 'vitest';
import { cameraPosition } from '../camera/projection';
import type { View } from '../camera/view';
import { createSystemSet, MODEL_BOUNDS } from '../scene-data/real-systems';
import type { SystemRecordInput } from '../scene-data/real-systems';
import { SeededRandom } from '../scene-data/random';
import {
  buildMarkerColors,
  buildMarkerStyleRanges,
  createSystemPass,
  discAlpha,
  GLOW_SIZE_FACTOR,
  glowAlpha,
  markerAlpha,
  MARKER_BODY_ALPHA,
  markerCssSize,
  markerPointSize,
  markerSpriteCssSize,
  MAX_MARKER_CSS,
  MIN_MARKER_CSS,
  rebasePositions,
  RING_COLOR,
  STYLE_DISC,
  STYLE_GLOW,
  withMarkerAlpha,
} from './system-pass';
import type { Program } from './program';
import markerAlphaSource from './shaders/marker-alpha.glsl?raw';
import rangeFragmentSource from './shaders/marker-range.frag?raw';
import colourFragmentSource from './shaders/systems.frag?raw';

/** A record the reader accepts. */
function record(
  name: string,
  position: readonly [number, number, number],
  category: string,
): SystemRecordInput {
  return {
    name,
    coords: { x: position[0], y: position[1], z: position[2] },
    categories: [category],
  };
}

/** 1,000 positions spread over the model bounds. */
function spreadPositions(seed: number): Float64Array {
  const random = new SeededRandom(seed);
  const axes = [MODEL_BOUNDS.x, MODEL_BOUNDS.y, MODEL_BOUNDS.z] as const;
  const positions = new Float64Array(1000 * 3);
  for (let index = 0; index < 1000; index += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      const span = axes[axis] as readonly [number, number];
      positions[index * 3 + axis] = span[0] + random.float() * (span[1] - span[0]);
    }
  }
  return positions;
}

/** One call the pass made on the context. */
interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
}

/** A context that records the calls the pass makes and gives every name a number. */
function fakeContext(): {
  gl: WebGL2RenderingContext;
  calls: Call[];
  of(name: string): Call[];
} {
  const calls: Call[] = [];
  const constants = new Map<string, number>();
  const state: Record<string, unknown> = {};

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_state, key): unknown {
      if (typeof key !== 'string') return undefined;
      if (key in state) return state[key];
      // A name in capitals is one of the context's constants. Every name gets its own
      // number, so the pass cannot confuse two of them.
      if (/^[A-Z][A-Z0-9_]*$/.test(key)) {
        const held = constants.get(key);
        if (held !== undefined) return held;
        const next = constants.size + 1;
        constants.set(key, next);
        return next;
      }
      return (...args: unknown[]): unknown => {
        calls.push({ name: key, args });
        if (key === 'getParameter') return Float32Array.from([1, 1023]);
        return key.startsWith('create') ? { name: key } : null;
      };
    },
  };

  return {
    gl: new Proxy(state, handler) as unknown as WebGL2RenderingContext,
    calls,
    of(name: string): Call[] {
      return calls.filter((call) => call.name === name);
    },
  };
}

/** A program the pass can bind, with no uniform location in it. */
function fakeProgram(): Program {
  return { program: {} as WebGLProgram, uniforms: {} };
}

describe('the marker rebase', () => {
  test('matches the float64 subtraction over 1,000 positions', () => {
    const positions = spreadPositions(7);
    const camera: [number, number, number] = [1234.5, -67.25, 25895.125];
    const out = new Float32Array(1000 * 3);
    // No `styleRanges`, so the cut does not run and the cursor offset is not read.
    rebasePositions(positions, 1000, camera, [0, 0, 0], out);
    for (let index = 0; index < 1000; index += 1) {
      const base = index * 3;
      expect(out[base]).toBe(Math.fround((positions[base] as number) - camera[0]));
      expect(out[base + 1]).toBe(
        Math.fround((positions[base + 1] as number) - camera[1]),
      );
      expect(out[base + 2]).toBe(
        Math.fround(camera[2] - (positions[base + 2] as number)),
      );
    }
  });
});

describe('a drawn marker position', () => {
  test('stays within 0.01 light years of the float64 position', () => {
    const cursors: [number, number, number][] = [
      [50000, 0, 75000],
      [0, 0, 0],
    ];
    const positions = spreadPositions(11);
    const out = new Float32Array(1000 * 3);
    let worst = 0;
    for (const cursor of cursors) {
      for (const distance of [500, 20000, 120000]) {
        const view: View = { cursor, distance, yaw: 37, pitch: 35 };
        const camera = cameraPosition(view);
        rebasePositions(positions, 1000, camera, [0, 0, 0], out);
        for (let index = 0; index < 1000; index += 1) {
          const base = index * 3;
          const exact = [
            (positions[base] as number) - camera[0],
            (positions[base + 1] as number) - camera[1],
            camera[2] - (positions[base + 2] as number),
          ];
          for (let axis = 0; axis < 3; axis += 1) {
            worst = Math.max(
              worst,
              Math.abs((out[base + axis] as number) - (exact[axis] as number)),
            );
          }
        }
      }
    }
    expect(worst).toBeLessThan(0.01);
  });
});

describe('the marker colour buffer', () => {
  test('reads the category of each system', () => {
    const set = createSystemSet();
    set.addCategories([
      { name: 'Empire', color: [0, 180, 255] },
      { name: 'Alliance', color: [0, 255, 120] },
    ]);
    set.addSystems([
      record('One', [0, 0, 0], 'Empire'),
      record('Two', [10, 0, 0], 'Alliance'),
      record('Three', [20, 0, 0], 'Empire'),
    ]);
    const colors = new Float32Array(9);
    buildMarkerColors(set, colors);
    expect(Array.from(colors.subarray(0, 3))).toEqual([0, Math.fround(180 / 255), 1]);
    expect(Array.from(colors.subarray(3, 6))).toEqual([0, 1, Math.fround(120 / 255)]);
    expect(Array.from(colors.subarray(6, 9))).toEqual([0, Math.fround(180 / 255), 1]);
  });

  test('takes the new colour after a category is replaced under the same name', () => {
    const set = createSystemSet();
    set.addCategories([{ name: 'Empire', color: [0, 180, 255] }]);
    set.addSystems([record('One', [0, 0, 0], 'Empire')]);
    const colors = new Float32Array(3);
    buildMarkerColors(set, colors);
    expect(colors[2]).toBe(1);

    const report = set.addCategories([{ name: 'Empire', color: [255, 40, 40] }]);
    expect(report.replaced).toBe(1);
    buildMarkerColors(set, colors);
    expect(Array.from(colors)).toEqual([
      1,
      Math.fround(40 / 255),
      Math.fround(40 / 255),
    ]);
  });
});

describe('the marker size', () => {
  test('falls to the floor and rises to the cap', () => {
    expect(markerCssSize(120000)).toBe(MIN_MARKER_CSS);
    expect(markerCssSize(10)).toBe(MAX_MARKER_CSS);
    // The plateau runs from 50 to 1,000 light years of range.
    expect(markerCssSize(50)).toBeCloseTo(12, 9);
    expect(markerCssSize(1000)).toBeCloseTo(12, 9);
    expect(markerCssSize(4000)).toBeGreaterThan(MIN_MARKER_CSS);
    expect(markerCssSize(4000)).toBeLessThan(12);
  });
});

describe('the ring colour', () => {
  test('matches the three numbers the fragment shader carries', () => {
    expect(RING_COLOR).toEqual([0.02, 0.04, 0.1]);
  });
});

describe('the marker style and range buffer', () => {
  test('finds the pair of each marker of a mixed set', () => {
    const set = createSystemSet();
    set.addCategories([
      { name: 'Empire', color: [1, 2, 3], markerStyle: 'disc', maxDrawRange: 5000 },
      { name: 'Alliance', color: [4, 5, 6] },
      { name: 'Near', color: [7, 8, 9], markerStyle: 'glow', maxDrawRange: 1000 },
    ]);
    set.addSystems([
      record('One', [0, 0, 0], 'Empire'),
      record('Two', [10, 0, 0], 'Alliance'),
      record('Three', [20, 0, 0], 'Near'),
      record('Four', [30, 0, 0], 'Empire'),
    ]);

    const out = new Float32Array(8);
    buildMarkerStyleRanges(set, out);
    expect(Array.from(out)).toEqual([
      STYLE_DISC,
      5000,
      STYLE_GLOW,
      120000,
      STYLE_GLOW,
      1000,
      STYLE_DISC,
      5000,
    ]);
  });

  test('takes the new style and range after a category is replaced', () => {
    const set = createSystemSet();
    set.addCategories([
      { name: 'Empire', color: [1, 2, 3], markerStyle: 'disc', maxDrawRange: 5000 },
    ]);
    set.addSystems([record('One', [0, 0, 0], 'Empire')]);
    const out = new Float32Array(2);
    buildMarkerStyleRanges(set, out);
    expect(Array.from(out)).toEqual([STYLE_DISC, 5000]);

    set.addCategories([{ name: 'Empire', color: [1, 2, 3] }]);
    buildMarkerStyleRanges(set, out);
    expect(Array.from(out)).toEqual([STYLE_GLOW, 120000]);
  });
});

describe('the drawn marker count', () => {
  // The count measures from the cursor and not from the camera, so the reference below
  // does too. The camera stands away from the cursor, which is what tells the two apart.
  test('matches a float64 reference over 1,000 spread positions', () => {
    const positions = spreadPositions(13);
    const view: View = {
      cursor: [1234.5, -67.25, 25895.125],
      distance: 20000,
      yaw: 37,
      pitch: 35,
    };
    const camera = cameraPosition(view);
    const cursorOffset: [number, number, number] = [
      view.cursor[0] - camera[0],
      view.cursor[1] - camera[1],
      camera[2] - view.cursor[2],
    ];
    const out = new Float32Array(1000 * 3);
    // Four ranges over the set, so every one of them cuts a different part of it.
    const ranges = [1000, 40000, 120000, 283500];
    const styleRanges = new Float32Array(1000 * 2);

    for (const range of ranges) {
      for (let index = 0; index < 1000; index += 1) {
        styleRanges[index * 2] = STYLE_GLOW;
        styleRanges[index * 2 + 1] = range;
      }
      let reference = 0;
      for (let index = 0; index < 1000; index += 1) {
        const base = index * 3;
        const x = (positions[base] as number) - view.cursor[0];
        const y = (positions[base + 1] as number) - view.cursor[1];
        const z = view.cursor[2] - (positions[base + 2] as number);
        if (Math.hypot(x, y, z) <= range) reference += 1;
      }
      expect(
        rebasePositions(positions, 1000, camera, cursorOffset, out, styleRanges),
      ).toBe(reference);
    }
  });

  test('cuts each marker at the range of its own category', () => {
    const positions = Float64Array.from([0, 0, 0, 0, 0, 2000, 0, 0, 4000]);
    const styleRanges = Float32Array.from([
      STYLE_GLOW,
      1000,
      STYLE_GLOW,
      1000,
      STYLE_GLOW,
      120000,
    ]);
    const out = new Float32Array(9);
    // The cursor sits at the camera here, so the cut reads the offsets themselves.
    expect(rebasePositions(positions, 3, [0, 0, 0], [0, 0, 0], out, styleRanges)).toBe(
      2,
    );
  });

  // The reading item 5 rests on: an orbit moves the camera and leaves the cursor, so the
  // count holds. The old rule measured from the camera and this count moved with it.
  test('holds over an orbit around the same cursor', () => {
    const positions = spreadPositions(17);
    const styleRanges = new Float32Array(1000 * 2);
    for (let index = 0; index < 1000; index += 1) {
      styleRanges[index * 2] = STYLE_GLOW;
      styleRanges[index * 2 + 1] = 40000;
    }
    const out = new Float32Array(1000 * 3);
    const counts = [0, 90, 180, 270].map((yaw) => {
      const view: View = { cursor: [0, 0, 25895], distance: 20000, yaw, pitch: 35 };
      const camera = cameraPosition(view);
      const cursorOffset: [number, number, number] = [
        view.cursor[0] - camera[0],
        view.cursor[1] - camera[1],
        camera[2] - view.cursor[2],
      ];
      return rebasePositions(positions, 1000, camera, cursorOffset, out, styleRanges);
    });
    expect(counts[1]).toBe(counts[0]);
    expect(counts[2]).toBe(counts[0]);
    expect(counts[3]).toBe(counts[0]);
  });
});

describe('the sprite size', () => {
  test('reads the disc at the limits and the glow at 2.5 times each', () => {
    expect(markerSpriteCssSize(120000, 'disc')).toBe(MIN_MARKER_CSS);
    expect(markerSpriteCssSize(10, 'disc')).toBe(MAX_MARKER_CSS);
    expect(markerSpriteCssSize(120000, 'glow')).toBe(MIN_MARKER_CSS * GLOW_SIZE_FACTOR);
    expect(markerSpriteCssSize(10, 'glow')).toBe(MAX_MARKER_CSS * GLOW_SIZE_FACTOR);
    for (const range of [10, 500, 1040, 1500, 20000, 120000]) {
      const disc = markerSpriteCssSize(range, 'disc');
      const glow = markerSpriteCssSize(range, 'glow');
      expect(disc).toBeGreaterThanOrEqual(7);
      expect(disc).toBeLessThanOrEqual(16);
      expect(glow).toBeGreaterThanOrEqual(17.5);
      expect(glow).toBeLessThanOrEqual(40);
    }
  });

  test('stays at or under the point size the card reports', () => {
    const cap = MAX_MARKER_CSS * GLOW_SIZE_FACTOR;
    // 1023 is what the card in the dev container reports. 64 stands for a card that
    // reports less than the 120 device pixels a glow asks for at a ratio of 3.
    for (const maximum of [1023, 64]) {
      for (const pixelRatio of [1, 2, 3]) {
        const size = markerPointSize(cap, pixelRatio, maximum);
        expect(size).toBeLessThanOrEqual(maximum);
        expect(size).toBe(Math.min(cap * pixelRatio, maximum));
      }
    }
    expect(markerPointSize(cap, 3, 1023)).toBe(120);
    expect(markerPointSize(cap, 3, 64)).toBe(64);
  });
});

describe('the glow alpha', () => {
  test('starts at 1, never rises outward and holds every step under 0.05', () => {
    // The floor sprite is 17.5 CSS pixels across and the cap sprite 40, so the two
    // radii are 8.75 and 20.
    for (const radius of [
      (MIN_MARKER_CSS * GLOW_SIZE_FACTOR) / 2,
      (MAX_MARKER_CSS * GLOW_SIZE_FACTOR) / 2,
    ]) {
      // The diagonal is off both spike axes past 1.41 CSS pixels, which is what the
      // scenario asks for: the step the reading has to catch is in the core and the halo.
      let last = Number.POSITIVE_INFINITY;
      let worstStep = 0;
      for (let step = 0; step <= 1000; step += 1) {
        const r = (radius * step) / 1000;
        const alpha = glowAlpha(r / Math.SQRT2, r / Math.SQRT2, radius);
        if (step === 0) expect(alpha).toBe(1);
        expect(alpha).toBeLessThanOrEqual(last);
        if (step > 0) worstStep = Math.max(worstStep, last - alpha);
        last = alpha;
      }
      expect(worstStep).toBeLessThan(0.05);
      expect(last).toBeLessThan(0.02);
    }
  });

  test('puts the spike above the diagonal at half the radius', () => {
    const radius = (MAX_MARKER_CSS * GLOW_SIZE_FACTOR) / 2;
    const half = radius / 2;
    const horizontal = glowAlpha(half, 0, radius);
    const vertical = glowAlpha(0, half, radius);
    const diagonal = glowAlpha(half / Math.SQRT2, half / Math.SQRT2, radius);
    expect(horizontal).toBeCloseTo(vertical, 12);
    expect(horizontal - diagonal).toBeGreaterThan(0.1);
    // The rule predicts the readings: the spike adds 0.55 * (1 - 0.5)^2 over a halo of
    // 0.85 * 0.5^3, and the diagonal holds the halo alone.
    expect(diagonal).toBeCloseTo(0.85 * 0.125, 6);
    expect(horizontal).toBeCloseTo(0.55 * 0.25 + 0.85 * 0.125, 6);
  });
});

describe('the two styles', () => {
  test('draw in one call', () => {
    const context = fakeContext();
    const set = createSystemSet();
    set.addCategories([
      { name: 'Glow', color: [1, 2, 3] },
      { name: 'Disc', color: [4, 5, 6], markerStyle: 'disc' },
    ]);
    const records: SystemRecordInput[] = [];
    for (let index = 0; index < 200; index += 1) {
      records.push(
        record(`S${index}`, [index * 5, 0, 0], index < 100 ? 'Glow' : 'Disc'),
      );
    }
    expect(set.addSystems(records).added).toBe(200);

    const pass = createSystemPass(context.gl, fakeProgram(), fakeProgram());
    const drawn = pass.draw({
      viewProjection: new Float32Array(16),
      camera: [0, 0, 0],
      cursorOffset: [0, 0, 0],
      pixelRatio: 1,
      set,
      range: null,
    });

    const draws = context.of('drawArrays');
    expect(draws).toHaveLength(1);
    expect(draws[0]?.args[2]).toBe(200);
    expect(drawn).toBe(200);
  });
});

/** A set of one system in one category, which every range test below draws. */
function oneSystemSet(): ReturnType<typeof createSystemSet> {
  const set = createSystemSet();
  set.addCategories([{ name: 'Alpha', color: [1, 2, 3] }]);
  expect(set.addSystems([record('Sol', [0, 0, 0], 'Alpha')]).added).toBe(1);
  return set;
}

describe('the marker range draw', () => {
  test('writes the markers into the range buffer with the MIN equation', () => {
    const context = fakeContext();
    const pass = createSystemPass(context.gl, fakeProgram(), fakeProgram());
    const target = { name: 'range' } as unknown as WebGLFramebuffer;

    pass.draw({
      viewProjection: new Float32Array(16),
      camera: [0, 0, 0],
      cursorOffset: [0, 0, 0],
      pixelRatio: 1,
      set: oneSystemSet(),
      range: target,
    });

    expect(context.of('drawArrays')).toHaveLength(2);
    expect(pass.drawCalls()).toBe(2);
    // The second draw goes to the range buffer, and the pass gives the frame back to the
    // default target after it.
    const binds = context.of('bindFramebuffer');
    expect(binds.map((call) => call.args[1])).toEqual([target, null]);
    const equations = context.of('blendEquation').map((call) => call.args[0]);
    expect(equations).toEqual([context.gl.MIN, context.gl.FUNC_ADD]);
    // The order is the colours first, so the range draw cannot write over the frame.
    const order = context.calls
      .filter((call) => call.name === 'drawArrays' || call.name === 'bindFramebuffer')
      .map((call) => call.name);
    expect(order).toEqual([
      'drawArrays',
      'bindFramebuffer',
      'drawArrays',
      'bindFramebuffer',
    ]);
  });

  test('makes the colour draw alone with no range buffer', () => {
    const context = fakeContext();
    const pass = createSystemPass(context.gl, fakeProgram(), fakeProgram());

    pass.draw({
      viewProjection: new Float32Array(16),
      camera: [0, 0, 0],
      cursorOffset: [0, 0, 0],
      pixelRatio: 1,
      set: oneSystemSet(),
      range: null,
    });

    expect(context.of('drawArrays')).toHaveLength(1);
    expect(context.of('blendEquation')).toHaveLength(0);
    expect(pass.drawCalls()).toBe(1);
  });

  test('counts no call in a frame with no system', () => {
    const context = fakeContext();
    const pass = createSystemPass(context.gl, fakeProgram(), fakeProgram());
    const drawn = pass.draw({
      viewProjection: new Float32Array(16),
      camera: [0, 0, 0],
      cursorOffset: [0, 0, 0],
      pixelRatio: 1,
      set: createSystemSet(),
      range: { name: 'range' } as unknown as WebGLFramebuffer,
    });
    expect(drawn).toBe(0);
    expect(pass.drawCalls()).toBe(0);
    expect(context.of('drawArrays')).toHaveLength(0);
  });
});

describe('the marker body', () => {
  test('holds the alpha of 0.5 and above, and no more of the sprite', () => {
    // The sprite of a cap-size glow is 40 CSS pixels across, so its radius is 20, and the
    // sprite of a cap-size disc is 16 across.
    const glowRadius = (MAX_MARKER_CSS * GLOW_SIZE_FACTOR) / 2;
    const discRadius = MAX_MARKER_CSS / 2;
    expect(glowRadius).toBe(20);

    for (const distance of [0, 1, 3]) {
      // On the diagonal, which is off both spikes, so the reading is the core and the
      // halo alone and the body is not the spikes.
      const x = distance / Math.SQRT2;
      const alpha = markerAlpha(x, x, glowRadius, 'glow', 1);
      expect(alpha).toBe(glowAlpha(x, x, glowRadius));
      expect(alpha).toBeGreaterThanOrEqual(MARKER_BODY_ALPHA);
    }
    const far = 10 / Math.SQRT2;
    expect(markerAlpha(far, far, glowRadius, 'glow', 1)).toBeLessThan(
      MARKER_BODY_ALPHA,
    );

    for (const distance of [0, 1, 3]) {
      const alpha = markerAlpha(distance, 0, discRadius, 'disc', 1);
      expect(alpha).toBe(discAlpha(distance, discRadius));
      expect(alpha).toBeGreaterThanOrEqual(MARKER_BODY_ALPHA);
    }
    expect(markerAlpha(10, 0, discRadius, 'disc', 1)).toBe(0);
  });

  test('reads the glow rule in CSS pixels at every device pixel ratio', () => {
    const radius = (MAX_MARKER_CSS * GLOW_SIZE_FACTOR) / 2;
    for (const pixelRatio of [1, 2, 3]) {
      const alpha = markerAlpha(
        6 * pixelRatio,
        0,
        radius * pixelRatio,
        'glow',
        pixelRatio,
      );
      expect(alpha).toBeCloseTo(glowAlpha(6, 0, radius), 12);
    }
  });

  test('is the threshold the range shader carries', () => {
    expect(rangeFragmentSource).toContain(
      `const float BODY_ALPHA = ${MARKER_BODY_ALPHA.toFixed(1)};`,
    );
  });
});

describe('the shared alpha rule', () => {
  test('reaches both marker shaders once', () => {
    for (const source of [rangeFragmentSource, colourFragmentSource]) {
      const filled = withMarkerAlpha(source);
      expect(filled).toContain(markerAlphaSource);
      // The rule is in place of the marker line. The chunk names that line in its own
      // header, so the test reads a whole line and not the text anywhere in the source.
      const lines = filled.split('\n').map((line) => line.trim());
      expect(lines).not.toContain('// @marker-alpha');
      expect(filled.split('float markerAlpha(')).toHaveLength(2);
    }
  });

  test('rejects a shader that holds no place for it', () => {
    expect(() => withMarkerAlpha('void main() {}')).toThrow(
      'holds no place for the alpha rule',
    );
  });
});
