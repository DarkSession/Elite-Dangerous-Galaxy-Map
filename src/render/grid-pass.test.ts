import { describe, expect, test } from 'vitest';
import { FIELD_OF_VIEW_DEGREES } from '../camera/view';
import { MODEL_BOUNDS } from '../scene-data/real-systems';
import {
  createGridPass,
  GRID_LEVELS,
  GRID_VERTEX_COUNT,
  gridDistanceFade,
  gridLabelLevel,
  gridLevelAlpha,
  gridLevelBoldness,
  gridLevelReadings,
  gridPhase,
  gridVisibility,
  GRID_FAR_NONE_LY,
  GRID_NEAR_FULL_LY,
  gridScreenSpacing,
  gridLevelWidth,
  GRID_BG_HIGH,
  GRID_BG_LOW,
  GRID_LABEL_MERGE_FLOOR,
  GRID_LABEL_TINT_MAX,
  GRID_LINE_MERGE_FLOOR,
  GRID_LINE_TINT_MAX,
  gridBackgroundTint,
  gridBackgroundWeight,
} from './grid-pass';
import type { GridLevelReading } from './grid-pass';
import { createGridProgram } from './grid-pass';
import fragmentSource from './shaders/grid.frag?raw';

/** The CSS pixels per light year at one light year of range, for a viewport height. */
function focalCss(rows: number): number {
  return rows / (2 * Math.tan((FIELD_OF_VIEW_DEGREES * Math.PI) / 360));
}

describe('the level rule', () => {
  // The table of the requirement "The grid draws every decade level on the cursor's
  // plane".
  test('reads the table of the spec at 8, 40 and 400 CSS pixels', () => {
    expect(gridLevelBoldness(8)).toBeCloseTo(0, 9);
    expect(gridLevelBoldness(40)).toBeCloseTo(0, 9);
    expect(gridLevelBoldness(400)).toBeCloseTo(1, 9);

    expect(gridLevelWidth(8)).toBeCloseTo(1.0, 9);
    expect(gridLevelWidth(40)).toBeCloseTo(1.0, 9);
    expect(gridLevelWidth(400)).toBeCloseTo(2.6, 9);

    expect(gridLevelAlpha(8)).toBeCloseTo(0, 9);
    expect(gridLevelAlpha(40)).toBeCloseTo(0.18, 9);
    expect(gridLevelAlpha(400)).toBeCloseTo(0.45, 9);
  });

  test('draws nothing below 8 CSS pixels and holds the bold reading above 400', () => {
    expect(gridLevelAlpha(4)).toBe(0);
    expect(gridLevelAlpha(0)).toBe(0);
    expect(gridLevelWidth(4000)).toBeCloseTo(2.6, 9);
    expect(gridLevelAlpha(4000)).toBeCloseTo(0.45, 9);
  });

  test('never falls as the spacing on the screen grows', () => {
    let lastWidth = 0;
    let lastAlpha = 0;
    for (let step = 0; step <= 500; step += 1) {
      const screen = (step * 500) / 500;
      const width = gridLevelWidth(screen);
      const alpha = gridLevelAlpha(screen);
      expect(width).toBeGreaterThanOrEqual(lastWidth - 1e-9);
      expect(alpha).toBeGreaterThanOrEqual(lastAlpha - 1e-9);
      lastWidth = width;
      lastAlpha = alpha;
    }
  });

  // The scenario "Three levels carry the frame at one zoom".
  test('gives 2 or 3 drawn levels at every zoom, with the coarser one bolder', () => {
    const focal = focalCss(1080);

    for (const distance of [10, 100, 1000, 10000]) {
      const readings = gridLevelReadings(focal, distance);
      const drawn = readings.filter(
        (level) => level.screenCss >= 8 && level.screenCss <= 4000,
      );

      expect(drawn.length).toBeGreaterThanOrEqual(2);
      expect(drawn.length).toBeLessThanOrEqual(3);

      for (let index = 1; index < drawn.length; index += 1) {
        const finer = drawn[index - 1] as (typeof drawn)[number];
        const coarser = drawn[index] as (typeof drawn)[number];
        expect(coarser.spacingLy).toBeGreaterThan(finer.spacingLy);
        expect(coarser.widthCss).toBeGreaterThanOrEqual(finer.widthCss);
        expect(coarser.alpha).toBeGreaterThanOrEqual(finer.alpha);
      }
    }
  });

  // The scenario "The probes agree with the frame".
  test('reads 935 CSS pixels and an alpha of 0.45 for 1,000 light years at a zoom of 1,000', () => {
    const readings = gridLevelReadings(focalCss(1080), 1000);

    expect(readings).toHaveLength(6);
    const bold = readings[3] as (typeof readings)[number];
    expect(bold.spacingLy).toBe(1000);
    expect(bold.screenCss).toBeCloseTo(935, 0);
    expect(bold.alpha).toBeCloseTo(0.45, 2);
    expect((readings[0] as (typeof readings)[number]).alpha).toBe(0);
  });
});

describe('the camera distance band', () => {
  // The scenario "The band follows the camera distance".
  test('reads 1, 1, 0.5, 0 and 0 at the five distances of the spec', () => {
    expect(gridVisibility(3000)).toBeCloseTo(1, 9);
    expect(gridVisibility(4000)).toBeCloseTo(1, 9);
    expect(gridVisibility(8000)).toBeCloseTo(0.5, 9);
    expect(gridVisibility(12000)).toBeCloseTo(0, 9);
    expect(gridVisibility(60000)).toBeCloseTo(0, 9);
  });

  test('holds the two ends of the band at 4,000 and 12,000 light years', () => {
    expect(GRID_NEAR_FULL_LY).toBe(4000);
    expect(GRID_FAR_NONE_LY).toBe(12000);
    expect(gridVisibility(10)).toBe(1);
    expect(gridVisibility(11999)).toBeGreaterThan(0);
    expect(gridVisibility(120000)).toBe(0);
  });

  test('never rises as the camera pulls back', () => {
    let last = 1;
    for (let distance = 0; distance <= 20000; distance += 100) {
      const band = gridVisibility(distance);
      expect(band).toBeLessThanOrEqual(last + 1e-9);
      last = band;
    }
  });

  // The scenario "The alpha carries the band". The scenario reads one level at two
  // zooms and asks for half. A level's own alpha follows its spacing on the screen,
  // which the zoom moves as well, so the halving holds only where that spacing rule is
  // already at its top of 0.45. The 10,000 light year level is 2,338 CSS pixels apart
  // at 4,000 light years and 1,169 at 8,000, both over the 400 the rule saturates at,
  // so the band alone separates the two readings. The 1,000 light year level is 234 and
  // 117 CSS pixels apart at the same two zooms, which is inside the rule's ramp, so it
  // reads 0.330 and 0.106 and no factor of two. The reading below is the level the
  // scenario's number holds for.
  test('halves the saturated level alpha at 8,000 against 4,000 light years', () => {
    const focal = focalCss(1080);
    const near = gridLevelReadings(focal, 4000)[4] as GridLevelReading;
    const half = gridLevelReadings(focal, 8000)[4] as GridLevelReading;

    expect(near.spacingLy).toBe(10000);
    expect(half.spacingLy).toBe(10000);
    expect(near.alpha).toBeCloseTo(0.45, 6);
    expect(half.alpha).toBeCloseTo(0.225, 6);
    expect(half.alpha).toBeCloseTo(near.alpha / 2, 6);
  });

  test('reports no alpha at all beyond the band', () => {
    for (const level of gridLevelReadings(focalCss(1080), 12000)) {
      expect(level.alpha).toBe(0);
    }
  });
});

describe('the background merge', () => {
  test('is one rule for the weight and the tint', () => {
    const floors = [GRID_LINE_MERGE_FLOOR, GRID_LABEL_MERGE_FLOOR];
    const maxima = [GRID_LINE_TINT_MAX, GRID_LABEL_TINT_MAX];
    const luminances = [0.0, GRID_BG_LOW, 0.3, GRID_BG_HIGH, 0.9];

    for (const floor of floors) {
      // The weight is 1 at the low edge and below, and its own floor at the high edge
      // and above. It never goes under the floor.
      expect(gridBackgroundWeight(0.0, floor)).toBeCloseTo(1, 9);
      expect(gridBackgroundWeight(GRID_BG_LOW, floor)).toBeCloseTo(1, 9);
      expect(gridBackgroundWeight(GRID_BG_HIGH, floor)).toBeCloseTo(floor, 9);
      expect(gridBackgroundWeight(0.9, floor)).toBeCloseTo(floor, 9);
      let before = gridBackgroundWeight(luminances[0] as number, floor);
      for (const luminance of luminances.slice(1)) {
        const weight = gridBackgroundWeight(luminance, floor);
        expect(weight).toBeLessThanOrEqual(before + 1e-9);
        expect(weight).toBeGreaterThanOrEqual(floor - 1e-9);
        before = weight;
      }
    }

    for (const maximum of maxima) {
      expect(gridBackgroundTint(0.0, maximum)).toBeCloseTo(0, 9);
      expect(gridBackgroundTint(GRID_BG_LOW, maximum)).toBeCloseTo(0, 9);
      expect(gridBackgroundTint(GRID_BG_HIGH, maximum)).toBeCloseTo(maximum, 9);
      expect(gridBackgroundTint(0.9, maximum)).toBeCloseTo(maximum, 9);
      let before = gridBackgroundTint(luminances[0] as number, maximum);
      for (const luminance of luminances.slice(1)) {
        const tint = gridBackgroundTint(luminance, maximum);
        expect(tint).toBeGreaterThanOrEqual(before - 1e-9);
        expect(tint).toBeLessThanOrEqual(maximum + 1e-9);
        before = tint;
      }
    }
  });

  test('recedes a label and its line together', () => {
    // The label keeps more of itself, but only where the merge acts at all.
    const table: [number, number, number][] = [
      [0.02, 1.0, 1.0],
      [0.2, 0.911, 0.886],
      [0.3, 0.751, 0.683],
      [0.8, 0.45, 0.3],
    ];
    for (const [luminance, label, line] of table) {
      const labelWeight = gridBackgroundWeight(luminance, GRID_LABEL_MERGE_FLOOR);
      const lineWeight = gridBackgroundWeight(luminance, GRID_LINE_MERGE_FLOOR);
      expect(labelWeight).toBeCloseTo(label, 3);
      expect(lineWeight).toBeCloseTo(line, 3);
      if (luminance <= GRID_BG_LOW) {
        expect(labelWeight).toBeCloseTo(lineWeight, 9);
      } else {
        expect(labelWeight).toBeGreaterThan(lineWeight);
      }
    }
  });
});

describe('the screen spacing', () => {
  test('is the focal length times the spacing over the range', () => {
    const focal = focalCss(1080);
    expect(gridScreenSpacing(focal, 1000, 1000)).toBeCloseTo(focal, 9);
    expect(gridScreenSpacing(focal, 2000, 1000)).toBeCloseTo(focal / 2, 9);
  });
});

describe('the distance fade', () => {
  // The scenario "A level fades out at 100 of its own lines".
  test('reaches 0 at 100 lines of the level', () => {
    expect(gridDistanceFade(0, 10)).toBeCloseTo(1, 9);
    expect(gridDistanceFade(500, 10)).toBeCloseTo(0.5, 9);
    expect(gridDistanceFade(1000, 10)).toBeCloseTo(0, 9);

    expect(gridDistanceFade(0, 1000)).toBeCloseTo(1, 9);
    expect(gridDistanceFade(500, 1000)).toBeCloseTo(0.995, 9);
    expect(gridDistanceFade(1000, 1000)).toBeCloseTo(0.99, 9);
  });

  test('holds at 0 beyond the reach of the level', () => {
    expect(gridDistanceFade(4000, 10)).toBe(0);
  });
});

describe('the label level', () => {
  // The scenario "The label level follows the zoom".
  test('is the smallest level at least 400 CSS pixels apart at the cursor', () => {
    const focal = focalCss(1080);

    expect(gridLabelLevel(focal, 200)).toBe(100);
    expect(gridLabelLevel(focal, 1000)).toBe(1000);
    expect(gridLabelLevel(focal, 3000)).toBe(10000);
  });

  test('holds the 1,000 light year level over the band from 234 to 2,337 light years', () => {
    const focal = focalCss(1080);

    expect(gridLabelLevel(focal, 234)).toBe(1000);
    expect(gridLabelLevel(focal, 2337)).toBe(1000);
    expect(gridLabelLevel(focal, 233)).toBe(100);
    expect(gridLabelLevel(focal, 2339)).toBe(10000);
  });
});

describe('the camera phase', () => {
  test('holds every level in its own cell at a camera far from the origin', () => {
    for (const coordinate of [45000, -45000, 0, 1234.5]) {
      for (const spacing of GRID_LEVELS) {
        const phase = gridPhase(coordinate, spacing);
        expect(phase).toBeGreaterThanOrEqual(0);
        expect(phase).toBeLessThan(spacing);
      }
    }
  });

  test('places a line on a whole multiple of the spacing at a camera of 45,000', () => {
    const camera = 45000.37;

    for (const spacing of GRID_LEVELS) {
      const phase = gridPhase(camera, spacing);
      // The shader adds the camera-relative offset of a point to the phase. Where the
      // sum is a whole multiple of the spacing, the point sits on a line.
      for (const offset of [-500.25, -1.5, 0, 2.75, 640.125]) {
        const sum = offset + phase;
        const line = Math.round(sum / spacing) * spacing;
        // The same line read as an absolute coordinate.
        const absolute = Math.round((camera + offset) / spacing) * spacing;
        expect(camera + offset - (sum - line)).toBeCloseTo(absolute, 3);
      }
    }
  });
});

/** One call the pass made on the context. */
interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
}

/** A context that records the calls the pass makes and gives every name a number. */
function fakeContext(): { gl: WebGL2RenderingContext; of(name: string): Call[] } {
  const calls: Call[] = [];
  const constants = new Map<string, number>();
  const state: Record<string, unknown> = {};

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
        return null;
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

const FRAME = {
  inverseViewProjection: new Float32Array(16),
  cursor: [0, 0, 0] as const,
  camera: [45000.37, 600.5, -45000.25] as const,
  pixelRatio: 1,
  bounds: MODEL_BOUNDS,
  band: 1,
  background: {} as WebGLTexture,
};

describe('the grid draw', () => {
  test('issues one call of three vertices', () => {
    const fake = fakeContext();
    const program = { program: {} as WebGLProgram, uniforms: {} };
    const pass = createGridPass(fake.gl, program, {} as WebGLVertexArrayObject);

    const drawn = pass.draw(FRAME);

    expect(drawn).toBe(GRID_VERTEX_COUNT);
    expect(fake.of('drawArrays')).toHaveLength(1);
    expect((fake.of('drawArrays')[0] as Call).args[2]).toBe(3);
  });

  test('sends the phase of every level inside its own cell', () => {
    const fake = fakeContext();
    const program = { program: {} as WebGLProgram, uniforms: {} };
    const pass = createGridPass(fake.gl, program, {} as WebGLVertexArrayObject);

    pass.draw(FRAME);

    const sent = fake.of('uniform2fv');
    expect(sent).toHaveLength(1);
    const phases = (sent[0] as Call).args[1] as Float32Array;
    expect(phases).toHaveLength(GRID_LEVELS.length * 2);
    for (let level = 0; level < GRID_LEVELS.length; level += 1) {
      const spacing = GRID_LEVELS[level] as number;
      expect(phases[level * 2] as number).toBeGreaterThanOrEqual(0);
      expect(phases[level * 2] as number).toBeLessThan(spacing);
      expect(phases[level * 2 + 1] as number).toBeGreaterThanOrEqual(0);
      expect(phases[level * 2 + 1] as number).toBeLessThan(spacing);
    }
  });
});

/** A context that also lets a program compile and link, so the names can be read. */
function programContext(): { gl: WebGL2RenderingContext; of(name: string): Call[] } {
  const fake = fakeContext();
  const calls: Call[] = [];
  const gl = new Proxy(fake.gl, {
    get(target, key): unknown {
      if (key === 'createShader' || key === 'createProgram') {
        return (): unknown => ({ name: String(key) });
      }
      if (key === 'getShaderParameter' || key === 'getProgramParameter') {
        return (): boolean => true;
      }
      if (key === 'getUniformLocation') {
        return (...args: unknown[]): unknown => {
          calls.push({ name: 'getUniformLocation', args });
          return {};
        };
      }
      return Reflect.get(target, key) as unknown;
    },
  }) as WebGL2RenderingContext;
  return {
    gl,
    of(name: string): Call[] {
      return calls.filter((call) => call.name === name);
    },
  };
}

describe('the merge uniforms', () => {
  test('are declared by the program and read by the shader', () => {
    const fake = programContext();
    createGridProgram(fake.gl);
    const declared = fake
      .of('getUniformLocation')
      .map((call) => call.args[1] as string);

    for (const name of ['uBackground', 'uMergeRange', 'uMergeFloor', 'uTintMax']) {
      expect(declared).toContain(name);
      expect(new RegExp(`uniform [a-zA-Z0-9]+ ${name};`).test(fragmentSource)).toBe(
        true,
      );
    }
  });
});
