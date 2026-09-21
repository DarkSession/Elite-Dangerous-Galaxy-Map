import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  createIconTextures,
  iconLayerSide,
  MAX_ICON_LAYER_SIDE,
  MAX_ICON_LAYERS,
  NO_ICON_LAYER,
} from './icon-textures';

/** One call a pass made on the context. */
interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
}

/** A context that records every call and gives every constant its own number. */
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

/**
 * A rasteriser that counts the calls per URL and answers with the side it was asked
 * for. A URL in `fails` rejects instead, as a browser refuses a vector with no CORS
 * header.
 */
function fakeRasterise(fails: readonly string[] = []): {
  rasterise: (url: string, side: number) => Promise<TexImageSource>;
  asks: string[];
  sides: number[];
} {
  const asks: string[] = [];
  const sides: number[] = [];
  return {
    asks,
    sides,
    rasterise: (url: string, side: number): Promise<TexImageSource> => {
      asks.push(url);
      sides.push(side);
      if (fails.includes(url)) return Promise.reject(new Error('refused'));
      return Promise.resolve({ url, side } as unknown as TexImageSource);
    },
  };
}

/** Lets every settled promise run, so a load that resolved reaches its upload. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the layer side', () => {
  test('follows the device pixel ratio up to the cap', () => {
    expect(iconLayerSide(1)).toBe(28);
    expect(iconLayerSide(2)).toBe(56);
    expect(iconLayerSide(3)).toBe(84);
    expect(iconLayerSide(4)).toBe(112);
    // A ratio above 4.57 draws from a 128 texel layer, slightly soft.
    expect(iconLayerSide(8)).toBe(MAX_ICON_LAYER_SIDE);
  });
});

describe('the icon texture array', () => {
  test('allocates nothing before the first URL', () => {
    const context = fakeContext();
    const textures = createIconTextures(context.gl);

    expect(textures.texture()).toBeNull();
    expect(textures.side()).toBe(0);
    expect(context.of('texImage3D')).toHaveLength(0);
  });

  test('uploads one URL once and asks nothing for a second request', async () => {
    const context = fakeContext();
    const fake = fakeRasterise();
    const textures = createIconTextures(context.gl, {
      pixelRatio: 2,
      rasterise: fake.rasterise,
    });

    expect(textures.layerOf('/a.svg')).toBe(NO_ICON_LAYER);
    expect(textures.layerOf('/a.svg')).toBe(NO_ICON_LAYER);
    await settle();

    expect(fake.asks).toEqual(['/a.svg']);
    expect(fake.sides).toEqual([56]);
    expect(context.of('texSubImage3D')).toHaveLength(1);
    expect(textures.layerOf('/a.svg')).toBe(0);
    // The array is 64 layers of RGBA8 at the side of the ratio.
    const image = context.of('texImage3D')[0];
    expect(image?.args[3]).toBe(56);
    expect(image?.args[4]).toBe(56);
    expect(image?.args[5]).toBe(MAX_ICON_LAYERS);
    expect(textures.side()).toBe(56);
  });

  test('gives each distinct URL its own layer', async () => {
    const context = fakeContext();
    const fake = fakeRasterise();
    const textures = createIconTextures(context.gl, { rasterise: fake.rasterise });

    textures.layerOf('/a.svg');
    textures.layerOf('/b.svg');
    await settle();

    expect(textures.layerOf('/a.svg')).toBe(0);
    expect(textures.layerOf('/b.svg')).toBe(1);
    expect(context.of('texImage3D')).toHaveLength(1);
  });

  test('warns once for a URL the browser refuses and never asks again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const context = fakeContext();
    const fake = fakeRasterise(['/bad.svg']);
    const textures = createIconTextures(context.gl, { rasterise: fake.rasterise });

    textures.layerOf('/bad.svg');
    await settle();
    for (let frame = 0; frame < 30; frame += 1) {
      expect(textures.layerOf('/bad.svg')).toBe(NO_ICON_LAYER);
    }
    await settle();

    expect(fake.asks).toEqual(['/bad.svg']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('/bad.svg');
    expect(context.of('texSubImage3D')).toHaveLength(0);
  });

  test('draws the other icons of a stack while one of them fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const context = fakeContext();
    const fake = fakeRasterise(['/bad.svg']);
    const textures = createIconTextures(context.gl, { rasterise: fake.rasterise });

    textures.layerOf('/bad.svg');
    textures.layerOf('/good.svg');
    await settle();

    expect(textures.layerOf('/bad.svg')).toBe(NO_ICON_LAYER);
    expect(textures.layerOf('/good.svg')).toBe(1);
  });

  test('warns once at a 65th distinct URL and draws nothing for it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const context = fakeContext();
    const fake = fakeRasterise();
    const textures = createIconTextures(context.gl, { rasterise: fake.rasterise });

    for (let index = 0; index < MAX_ICON_LAYERS; index += 1) {
      textures.layerOf(`/icon-${index}.svg`);
    }
    await settle();
    expect(textures.layerOf('/over-1.svg')).toBe(NO_ICON_LAYER);
    expect(textures.layerOf('/over-2.svg')).toBe(NO_ICON_LAYER);
    await settle();

    expect(fake.asks).toHaveLength(MAX_ICON_LAYERS);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('/over-1.svg');
    expect(textures.layerOf('/icon-63.svg')).toBe(63);
  });

  test('rasterises every ready layer again at a new device pixel ratio', async () => {
    const context = fakeContext();
    const fake = fakeRasterise();
    const textures = createIconTextures(context.gl, {
      pixelRatio: 1,
      rasterise: fake.rasterise,
    });

    textures.layerOf('/a.svg');
    textures.layerOf('/b.svg');
    await settle();
    expect(fake.sides).toEqual([28, 28]);

    textures.setPixelRatio(2);
    await settle();

    expect(fake.asks).toEqual(['/a.svg', '/b.svg', '/a.svg', '/b.svg']);
    expect(fake.sides).toEqual([28, 28, 56, 56]);
    expect(textures.side()).toBe(56);
    expect(textures.layerOf('/a.svg')).toBe(0);
    expect(textures.layerOf('/b.svg')).toBe(1);
    // The storage is taken again, once, for the new side.
    expect(context.of('texImage3D')).toHaveLength(2);
  });

  test('takes no new storage where the ratio leaves the side where it was', async () => {
    const context = fakeContext();
    const fake = fakeRasterise();
    const textures = createIconTextures(context.gl, {
      pixelRatio: 1,
      rasterise: fake.rasterise,
    });

    textures.layerOf('/a.svg');
    await settle();
    textures.setPixelRatio(1);
    await settle();

    expect(fake.asks).toEqual(['/a.svg']);
    expect(context.of('texImage3D')).toHaveLength(1);
  });

  test('never asks a failed URL again through a ratio change', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const context = fakeContext();
    const fake = fakeRasterise(['/bad.svg']);
    const textures = createIconTextures(context.gl, {
      pixelRatio: 1,
      rasterise: fake.rasterise,
    });

    textures.layerOf('/bad.svg');
    textures.layerOf('/good.svg');
    await settle();
    textures.setPixelRatio(3);
    await settle();

    expect(fake.asks).toEqual(['/bad.svg', '/good.svg', '/good.svg']);
  });

  test('frees the texture on dispose', async () => {
    const context = fakeContext();
    const fake = fakeRasterise();
    const textures = createIconTextures(context.gl, { rasterise: fake.rasterise });

    textures.layerOf('/a.svg');
    await settle();
    textures.dispose();

    expect(context.of('deleteTexture')).toHaveLength(1);
    expect(textures.texture()).toBeNull();
  });
});
