import { describe, expect, test } from 'vitest';
import {
  backgroundLuminance,
  backgroundReadingSize,
  createReadbackCycle,
  READBACK_SLOTS,
} from './background-pass';
import { createGlowPass } from './glow-pass';
import type { ReadbackHooks } from './background-pass';
import { halvedDown, halvedUp } from './reduce';
import type { ReducePass } from './reduce';

/** One call a pass made on the context. */
interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
}

/** A context that records the calls a pass makes and gives every name a number. */
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
        // A link and a compile must read as a success, or `createProgram` throws.
        if (key === 'getShaderParameter' || key === 'getProgramParameter') return true;
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

/** The size rule applied a given number of times. */
function repeat(rule: (side: number) => number, side: number, times: number): number {
  let value = side;
  for (let step = 0; step < times; step += 1) value = rule(value);
  return value;
}

describe('the reading size', () => {
  test('rounds its size up', () => {
    expect(backgroundReadingSize(1920, 1080)).toEqual([120, 68]);
    expect(backgroundReadingSize(1280, 720)).toEqual([80, 45]);
    expect(backgroundReadingSize(300, 300)).toEqual([19, 19]);
    expect(backgroundReadingSize(8, 8)).toEqual([1, 1]);
  });

  test('is the size four halvings that round up give', () => {
    for (const side of [1920, 1080, 1280, 720, 300, 8, 1081, 1281]) {
      expect(backgroundReadingSize(side, side)).toEqual([
        repeat(halvedUp, side, 4),
        repeat(halvedUp, side, 4),
      ]);
      expect(backgroundReadingSize(side, side)[0]).toBe(Math.ceil(side / 16));
    }
  });

  test('keeps the two rules apart at an odd drawing buffer', () => {
    // The glow rounds a side down and the reading rounds it up, so at 1281 by 1081 the
    // glow's rule gives 67 rows where the reading's gives 68.
    expect(repeat(halvedDown, 1081, 4)).toBe(67);
    expect(backgroundReadingSize(1281, 1081)).toEqual([81, 68]);
  });
});

describe('the glow targets', () => {
  test('hold the sizes the glow rule gave before the halving moved out', () => {
    const fake = fakeContext();
    const reduce: ReducePass = { halve(): void {}, dispose(): void {} };
    const pass = createGlowPass(fake.gl, {} as WebGLVertexArrayObject, true, reduce);

    pass.resize(1281, 721);

    // The four targets are made at 1 by 1 and then resized, so the sizes the rule gives
    // are the last four `texImage2D` calls: the quarter, the eighth and the two blur
    // targets. 1281 goes 640, 320 and 160; 721 goes 360, 180 and 90.
    const sizes = fake
      .of('texImage2D')
      .slice(-4)
      .map((call) => [call.args[3], call.args[4]]);
    expect(sizes).toEqual([
      [320, 180],
      [160, 90],
      [160, 90],
      [160, 90],
    ]);
  });
});

describe('the read-back cycle', () => {
  /** Hooks that record what the cycle asked for and let a test pass a fence. */
  function hooks(): {
    hooks: ReadbackHooks;
    started: number[];
    taken: number[];
    dropped: number[];
    /** Lets every fence made so far pass. */
    pass(): void;
  } {
    const started: number[] = [];
    const taken: number[] = [];
    const dropped: number[] = [];
    const passed = new Set<number>();
    let made = 0;
    return {
      started,
      taken,
      dropped,
      pass(): void {
        for (let fence = 0; fence < made; fence += 1) passed.add(fence);
      },
      hooks: {
        start(slot: number): unknown {
          started.push(slot);
          made += 1;
          return made - 1;
        },
        passed(fence: unknown): boolean {
          return passed.has(fence as number);
        },
        take(slot: number, into: Uint8Array): void {
          taken.push(slot);
          into[0] = slot + 1;
        },
        drop(fence: unknown): void {
          dropped.push(fence as number);
        },
      },
    };
  }

  test('gives nothing on the first call and starts one copy', () => {
    const device = hooks();
    const cycle = createReadbackCycle(device.hooks);
    const into = new Uint8Array(4);

    expect(cycle.frame(into)).toBe(false);
    expect(device.started).toEqual([0]);
    expect(device.taken).toEqual([]);
  });

  test('gives the bytes on the call after the fence passes', () => {
    const device = hooks();
    const cycle = createReadbackCycle(device.hooks);
    const into = new Uint8Array(4);

    cycle.frame(into);
    // The fence of the first copy has not passed, so the second call still gives
    // nothing and the bytes stay where they are.
    expect(cycle.frame(into)).toBe(false);
    device.pass();
    expect(cycle.frame(into)).toBe(true);
    expect(device.taken).toEqual([1]);
    expect(into[0]).toBe(2);
  });

  test('never writes the slot it reads in the same frame', () => {
    const device = hooks();
    const cycle = createReadbackCycle(device.hooks);
    const into = new Uint8Array(4);

    for (let frame = 0; frame < 6; frame += 1) {
      device.pass();
      const startedBefore = device.started.length;
      const takenBefore = device.taken.length;
      cycle.frame(into);
      const wrote = device.started[startedBefore] as number;
      const read = device.taken[takenBefore];
      expect(device.started).toHaveLength(startedBefore + 1);
      if (read !== undefined) expect(read).not.toBe(wrote);
    }
    // Two slots hold the ping-pong, so the writes run 0, 1, 0, 1 and so on.
    expect(device.started).toEqual([0, 1, 0, 1, 0, 1]);
    expect(READBACK_SLOTS).toBe(2);
  });

  test('drops every fence it still holds on a dispose', () => {
    const device = hooks();
    const cycle = createReadbackCycle(device.hooks);
    const into = new Uint8Array(4);

    cycle.frame(into);
    cycle.dispose();

    expect(device.dropped).toEqual([0]);
  });
});

describe('the reading luminance', () => {
  test('is the same rule the tone map reads', () => {
    expect(backgroundLuminance(1, 1, 1)).toBeCloseTo(1, 9);
    expect(backgroundLuminance(0, 0, 0)).toBe(0);
    expect(backgroundLuminance(1, 0, 0)).toBeCloseTo(0.2126, 9);
    expect(backgroundLuminance(0, 1, 0)).toBeCloseTo(0.7152, 9);
    expect(backgroundLuminance(0, 0, 1)).toBeCloseTo(0.0722, 9);
  });
});
