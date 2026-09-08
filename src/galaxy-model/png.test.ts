import { describe, expect, test } from 'vitest';
import { decodeGreyscalePng, PngError } from './png';
import { buildPng } from './png-fixture';

describe('the PNG decoder', () => {
  test('decodes a 2 by 2 greyscale image', async () => {
    const pixels = [
      [10, 200],
      [45, 255],
    ];
    const image = await decodeGreyscalePng(await buildPng(pixels, [0, 0]));
    expect(image.width).toBe(2);
    expect(image.height).toBe(2);
    expect(Array.from(image.data)).toEqual([10, 200, 45, 255]);
  });

  test('reads all five row filters', async () => {
    const pixels = [
      [10, 20, 30, 40],
      [50, 60, 70, 80],
      [90, 100, 110, 120],
      [130, 140, 150, 160],
      [170, 180, 190, 200],
    ];
    const image = await decodeGreyscalePng(await buildPng(pixels, [0, 1, 2, 3, 4]));
    expect(Array.from(image.data)).toEqual(pixels.flat());
  });

  test('rejects a file that does not start with the signature', async () => {
    const file = await buildPng([[1]], [0]);
    file[1] = 0;
    await expect(decodeGreyscalePng(file)).rejects.toThrow(PngError);
  });

  test('rejects an image that is not 8-bit greyscale', async () => {
    const file = await buildPng([[1, 2]], [0], { colour: 2 });
    await expect(decodeGreyscalePng(file)).rejects.toThrow(/8-bit greyscale/);
  });

  test('rejects an interlaced image', async () => {
    const file = await buildPng([[1, 2]], [0], { interlace: 1 });
    await expect(decodeGreyscalePng(file)).rejects.toThrow(/interlaced/);
  });
});
