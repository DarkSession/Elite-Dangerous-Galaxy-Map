import { describe, expect, test } from 'vitest';
import { cameraPosition } from '../camera/projection';
import type { View } from '../camera/view';
import { createSystemSet, MODEL_BOUNDS } from '../scene-data/real-systems';
import { SeededRandom } from '../scene-data/random';
import {
  buildMarkerColors,
  buildMarkerStyleRanges,
  createSystemPass,
  GLOW_SIZE_FACTOR,
  glowAlpha,
  markerCssSize,
  markerPointSize,
  markerSpriteCssSize,
  MAX_MARKER_CSS,
  MIN_MARKER_CSS,
  rebasePositions,
  RING_COLOR,
  STYLE_DISC,
  STYLE_GLOW,
} from './system-pass';
import type { Program } from './program';

/** A record the reader accepts. */
function record(
  name: string,
  position: readonly [number, number, number],
  category: string,
): Record<string, unknown> {
  return {
    name,
    coords: { x: position[0], y: position[1], z: position[2] },
    primaryCategory: category,
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
    rebasePositions(positions, 1000, camera, out);
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
        rebasePositions(positions, 1000, camera, out);
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
    // The browser suite renders 720 rows at a 60 degree field of view, so the focal
    // length is 623.5 CSS pixels per light year at one light year of range.
    const focalCss = 720 / (2 * Math.tan((60 * Math.PI) / 360));
    expect(markerCssSize(focalCss, 120000)).toBe(MIN_MARKER_CSS);
    expect(markerCssSize(focalCss, 500)).toBe(MAX_MARKER_CSS);
    // The cap boundary sits near 1,040 light years of range.
    expect(markerCssSize(focalCss, 1040)).toBeCloseTo(MAX_MARKER_CSS, 1);
    // The floor boundary sits near 1,780 light years of range.
    expect(markerCssSize(focalCss, 1500)).toBeGreaterThan(MIN_MARKER_CSS);
    expect(markerCssSize(focalCss, 1500)).toBeLessThan(MAX_MARKER_CSS);
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
  test('matches a float64 reference over 1,000 spread positions', () => {
    const positions = spreadPositions(13);
    const camera: [number, number, number] = [1234.5, -67.25, 25895.125];
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
        const x = (positions[base] as number) - camera[0];
        const y = (positions[base + 1] as number) - camera[1];
        const z = camera[2] - (positions[base + 2] as number);
        if (Math.hypot(x, y, z) <= range) reference += 1;
      }
      expect(rebasePositions(positions, 1000, camera, out, styleRanges)).toBe(
        reference,
      );
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
    expect(rebasePositions(positions, 3, [0, 0, 0], out, styleRanges)).toBe(2);
  });
});

describe('the sprite size', () => {
  test('reads the disc at the limits and the glow at 2.5 times each', () => {
    const focalCss = 720 / (2 * Math.tan((60 * Math.PI) / 360));
    expect(markerSpriteCssSize(focalCss, 120000, 'disc')).toBe(MIN_MARKER_CSS);
    expect(markerSpriteCssSize(focalCss, 500, 'disc')).toBe(MAX_MARKER_CSS);
    expect(markerSpriteCssSize(focalCss, 120000, 'glow')).toBe(
      MIN_MARKER_CSS * GLOW_SIZE_FACTOR,
    );
    expect(markerSpriteCssSize(focalCss, 500, 'glow')).toBe(
      MAX_MARKER_CSS * GLOW_SIZE_FACTOR,
    );
    for (const range of [500, 1040, 1500, 20000, 120000]) {
      const disc = markerSpriteCssSize(focalCss, range, 'disc');
      const glow = markerSpriteCssSize(focalCss, range, 'glow');
      expect(disc).toBeGreaterThanOrEqual(7);
      expect(disc).toBeLessThanOrEqual(12);
      expect(glow).toBeGreaterThanOrEqual(17.5);
      expect(glow).toBeLessThanOrEqual(30);
    }
  });

  test('stays at or under the point size the card reports', () => {
    const cap = MAX_MARKER_CSS * GLOW_SIZE_FACTOR;
    // 1023 is what the card in the dev container reports. 64 stands for a card that
    // reports less than the 90 device pixels a glow asks for at a ratio of 3.
    for (const maximum of [1023, 64]) {
      for (const pixelRatio of [1, 2, 3]) {
        const size = markerPointSize(cap, pixelRatio, maximum);
        expect(size).toBeLessThanOrEqual(maximum);
        expect(size).toBe(Math.min(cap * pixelRatio, maximum));
      }
    }
    expect(markerPointSize(cap, 3, 1023)).toBe(90);
    expect(markerPointSize(cap, 3, 64)).toBe(64);
  });
});

describe('the glow alpha', () => {
  test('starts at 1, never rises outward and holds every step under 0.05', () => {
    // The floor sprite is 17.5 CSS pixels across and the cap sprite 30, so the two
    // radii are 8.75 and 15.
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
    const records: Record<string, unknown>[] = [];
    for (let index = 0; index < 200; index += 1) {
      records.push(
        record(`S${index}`, [index * 5, 0, 0], index < 100 ? 'Glow' : 'Disc'),
      );
    }
    expect(set.addSystems(records).added).toBe(200);

    const pass = createSystemPass(context.gl, fakeProgram());
    const drawn = pass.draw({
      viewProjection: new Float32Array(16),
      camera: [0, 0, 0],
      focal: 623.5,
      pixelRatio: 1,
      set,
    });

    const draws = context.of('drawArrays');
    expect(draws).toHaveLength(1);
    expect(draws[0]?.args[2]).toBe(200);
    expect(drawn).toBe(200);
  });
});
