import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { meanLuminanceBlock, meanLuminanceFrame, openMap } from './helpers';

/** Reads a shader source file from the tree. */
function shaderSource(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../src/render/shaders/${name}`, import.meta.url)),
    'utf8',
  );
}

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

const atlasPath = fileURLToPath(
  new URL('../src/render/nebula-art.webp', import.meta.url),
);

/** How many tiles a row of the atlas holds, and how many tiles carry art. */
const ATLAS_COLUMNS = 6;
const ATLAS_TILE_SIDE = 256;
const TILE_COUNT = 34;

/**
 * Barnard's Loop, the largest record in the set at 200 light years. The view puts it at
 * the middle of the frame at a zoom distance inside the band, where it draws about 21
 * CSS pixels across the radius and the next record is under half that.
 */
const BRIGHT_VIEW = '#c=624.4,-425.9,-1229.5&d=6000&p=35&y=0';

/**
 * Record 187, of 94.06 light years, at the middle of the frame. It draws tile 15, which
 * holds 66 percent of its alpha in the top half of the file. The record is a dark one,
 * so the sprite takes light away where its alpha is high. The sprite covers 97.7 CSS
 * pixels across the radius at this zoom distance, so a block above the middle and one
 * below it read opposite halves of the tile, and the reading states which way up the
 * art draws.
 */
const TILE_UP_VIEW = '#c=-5493.1,-589.2,10425.9&d=600&p=35&y=0';

/**
 * A dark nebula of 88.93 light years. It is the largest record in the middle of this
 * frame, so the block the test samples reads its sprite.
 */
const DARK_VIEW = '#c=-10642.7,629.4,17776.7&d=6000&p=35&y=0';

/**
 * The camera at the centre of a nebula of 49.53 light years, at a zoom distance
 * inside the band. The camera-inside fade takes that record to 0, and no other record
 * reaches 4 CSS pixels from there, so the frame shows nothing of either.
 */
const INSIDE_VIEW = '#c=-11550.7,849.9,54077.2&d=12000&p=0&y=0';

/**
 * The same record ahead of the camera at three times its radius, which is where the
 * camera-inside fade reaches 1. Its apparent radius is 208 CSS pixels, under the 540
 * pixel cap. Its art takes light out of the block the test reads, whatever the tile is
 * named: the sprite composites source-over, so alpha that carries little colour
 * attenuates what is behind it.
 */
const OUTSIDE_VIEW = '#c=-11550.7,849.9,53928.6&d=12000&p=0&y=0';

/**
 * Barnard's Loop again, with the camera 1,000 light years from it and the zoom well
 * inside the close range. The near end of the band is open, so the record draws here
 * about six times as wide as it does at 6,000 light years.
 */
const CLOSE_VIEW = '#c=624.4,-425.9,-1229.5&d=1000&p=35&y=0';

/**
 * The same record of 49.53 light years, ahead of the camera at three, two and 1.2 times
 * its radius, at a zoom distance inside the band. Its apparent radius is 208, 312 and
 * 520 CSS pixels at a 720 pixel canvas, so it grows the whole way and never reaches the
 * 540 pixel cap. What takes it out is the size fade, which starts at 180 pixels and
 * reaches 0 at 540, together with the camera-inside fade.
 */
const CLOSING_VIEWS = [
  '#c=-11550.7,849.9,43928.6&d=2000&p=0&y=0',
  '#c=-11550.7,849.9,43978.1&d=2000&p=0&y=0',
  '#c=-11550.7,849.9,44017.8&d=2000&p=0&y=0',
];

/** The middle of the frame. */
const MIDDLE = { x: 640, y: 360 };

/** Draws one frame with the nebula switch at a value and reads a measure. */
async function withNebulae<T>(
  page: import('@playwright/test').Page,
  on: boolean,
  read: () => Promise<T>,
): Promise<T> {
  await page.evaluate((value) => {
    window.__galaxyMap?.setPasses?.({ nebulae: value });
    window.__galaxyMap?.drawNow?.();
  }, on);
  return read();
}

test('the nebula shaders compile', async ({ page }) => {
  await openMap(page);
  const error = await page.evaluate(
    (sources) =>
      window.__galaxyMap?.compileTestProgram?.(sources.vertex, sources.fragment),
    { vertex: shaderSource('nebulae.vert'), fragment: shaderSource('nebulae.frag') },
  );
  expect(error).toBeNull();
});

// The lookup insets by half a texel, so a tile whose border is alpha 0 cannot carry
// colour into its neighbour under a linear filter. Node decodes no WebP, so the check
// runs here, on the bytes of the committed file.
test('no tile of the atlas bleeds into its neighbour', async ({ page }) => {
  await openMap(page);
  const bytes = readFileSync(atlasPath).toString('base64');

  const report = await page.evaluate(
    async (input) => {
      const binary = atob(input.bytes);
      const buffer = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        buffer[index] = binary.charCodeAt(index);
      }
      const image = await createImageBitmap(new Blob([buffer]), {
        premultiplyAlpha: 'none',
        colorSpaceConversion: 'none',
      });
      // The file states its own tile size, so this reads whatever pack is committed.
      const tile = image.width / input.columns;
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context === null) return { width: 0, height: 0, worst: -1 };
      context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, image.width, image.height).data;

      let worst = 0;
      let filled = 0;
      for (let index = 0; index < input.tiles; index += 1) {
        const column = index % input.columns;
        const row = Math.floor(index / input.columns);
        let inside = 0;
        for (let y = 0; y < tile; y += 1) {
          for (let x = 0; x < tile; x += 1) {
            const at = ((row * tile + y) * image.width + column * tile + x) * 4;
            const alpha = data[at + 3] as number;
            const edge = x === 0 || y === 0 || x === tile - 1 || y === tile - 1;
            if (edge) worst = Math.max(worst, alpha);
            else inside = Math.max(inside, alpha);
          }
        }
        if (inside > 0) filled += 1;
      }
      return { width: image.width, height: image.height, worst, tile, filled };
    },
    { bytes, columns: ATLAS_COLUMNS, tiles: TILE_COUNT },
  );
  console.log('the atlas', report);

  expect(report.width).toBe(report.height);
  expect(report.width).toBe(ATLAS_TILE_SIDE * ATLAS_COLUMNS);
  expect(report.tile).toBe(ATLAS_TILE_SIDE);
  expect(report.worst).toBe(0);
  // Every tile a record can name carries art, so no record draws an empty sprite.
  expect(report.filled).toBe(TILE_COUNT);
});

test('the default view does not change with the nebula pass on', async ({ page }) => {
  await openMap(page);

  const withPass = await withNebulae(page, true, () => meanLuminanceFrame(page));
  const withoutPass = await withNebulae(page, false, () => meanLuminanceFrame(page));
  console.log('default view', { withPass, withoutPass });

  expect(withPass).toBeGreaterThan(0);
  // The zoom band gives every record weight 0 at 60,000 light years, so the two frames
  // are the same frame.
  expect(Math.abs(withPass - withoutPass)).toBeLessThan(1e-6);
});

test('the switch removes the nebulae', async ({ page }) => {
  await openMap(page, BRIGHT_VIEW);

  // The tone map's dither reads the pixel position alone, so two frames of the same
  // scene are the same bytes. `never` is the frame before this test turns the switch on.
  // The pass has already drawn by then, because `openMap` waits for the attach and draws
  // one frame, so the reading is that the switch leaves nothing behind.
  const never = await withNebulae(page, false, () =>
    meanLuminanceBlock(page, MIDDLE, 32),
  );
  const on = await withNebulae(page, true, () => meanLuminanceBlock(page, MIDDLE, 32));
  const off = await withNebulae(page, false, () =>
    meanLuminanceBlock(page, MIDDLE, 32),
  );
  console.log('switch', { never, on, off });

  expect(never).toBeGreaterThanOrEqual(0);
  expect(on).not.toBeCloseTo(never, 5);
  expect(off).toBeCloseTo(never, 10);
});

test('a bright nebula adds light and a dark one takes it away', async ({ page }) => {
  await openMap(page, BRIGHT_VIEW);
  const brightOn = await withNebulae(page, true, () =>
    meanLuminanceBlock(page, MIDDLE, 24),
  );
  const brightOff = await withNebulae(page, false, () =>
    meanLuminanceBlock(page, MIDDLE, 24),
  );

  await openMap(page, DARK_VIEW);
  const darkOn = await withNebulae(page, true, () =>
    meanLuminanceBlock(page, MIDDLE, 10),
  );
  const darkOff = await withNebulae(page, false, () =>
    meanLuminanceBlock(page, MIDDLE, 10),
  );
  console.log('bright and dark', { brightOn, brightOff, darkOn, darkOff });

  expect(brightOff).toBeGreaterThan(0);
  expect(darkOff).toBeGreaterThan(0);
  // One blend serves both: the art of a dark nebula holds low colour and high alpha.
  expect(brightOn).toBeGreaterThan(brightOff);
  expect(darkOn).toBeLessThan(darkOff);
});

test('the brightness constant stays where it was set', async ({ page }) => {
  await openMap(page, BRIGHT_VIEW);
  const on = await withNebulae(page, true, () => meanLuminanceBlock(page, MIDDLE, 24));
  const off = await withNebulae(page, false, () =>
    meanLuminanceBlock(page, MIDDLE, 24),
  );
  const added = on - off;
  console.log('brightness', { on, off, added });

  // The constant is a look value set by eye. The band is here so a later change to it
  // fails a test rather than passing unnoticed. It brackets the reading 0.0557.
  expect(added).toBeGreaterThanOrEqual(0.04);
  expect(added).toBeLessThanOrEqual(0.07);
});

// The budget of 256 is a guard for a larger record file. The size floor is what bounds
// this file: the most records it puts above the floor at any camera position is 184 on
// a canvas 1,080 CSS pixels tall. This view holds about 122 on the 720 pixel canvas of
// the test, so the budget cuts nothing here.
test('a view inside the band draws every record above the floor in one call', async ({
  page,
}) => {
  await openMap(page, DARK_VIEW);
  const reading = await page.evaluate(() => {
    window.__galaxyMap?.setPasses?.({ nebulae: true });
    window.__galaxyMap?.drawNow?.();
    return {
      drawn: window.__galaxyMap?.nebulaDrawnCount?.() ?? -1,
      calls: window.__galaxyMap?.nebulaDrawCalls?.() ?? -1,
    };
  });
  console.log('budget', reading);

  expect(reading.drawn).toBeGreaterThan(60);
  expect(reading.drawn).toBeLessThanOrEqual(256);
  expect(reading.calls).toBe(1);
});

// The art of a nebula is not symmetric, and the atlas uploads with no flip, so the
// lookup has to negate y to draw the file the same way up. Nothing else in the suite can
// tell the two orientations apart: every other reading is a mean over a block.
test('a sprite draws its tile the same way up as the file', async ({ page }) => {
  await openMap(page, TILE_UP_VIEW);
  const middle = { x: 640, y: 360 };
  const block = 64;
  const offset = 49;
  const read = async (on: boolean): Promise<{ above: number; below: number }> =>
    withNebulae(page, on, async () => ({
      above: await meanLuminanceBlock(
        page,
        { x: middle.x, y: middle.y - offset },
        block,
      ),
      below: await meanLuminanceBlock(
        page,
        { x: middle.x, y: middle.y + offset },
        block,
      ),
    }));
  const on = await read(true);
  const off = await read(false);
  const above = on.above - off.above;
  const below = on.below - off.below;
  console.log('the two halves of the sprite', { on, off, above, below });

  // Both blocks lose light, because the record is a dark one. The upper block covers
  // the half of the tile with the alpha, at a mean of 0.720 against 0.414, so it loses
  // the more of the two. A sprite that drew the file upside down would read the other
  // way about. The measured readings are -0.102 above and -0.036 below.
  expect(above).toBeLessThan(0);
  expect(below).toBeLessThan(0);
  expect(Math.abs(above)).toBeGreaterThan(1.5 * Math.abs(below));
});

test('the pass issues no draw call outside the band', async ({ page }) => {
  await openMap(page);
  const reading = await page.evaluate(() => {
    window.__galaxyMap?.setPasses?.({ nebulae: true });
    window.__galaxyMap?.drawNow?.();
    return {
      drawn: window.__galaxyMap?.nebulaDrawnCount?.() ?? -1,
      calls: window.__galaxyMap?.nebulaDrawCalls?.() ?? -1,
    };
  });
  console.log('outside the band', reading);

  expect(reading.drawn).toBe(0);
  expect(reading.calls).toBe(0);
});

test('a close zoom still draws the nebulae', async ({ page }) => {
  await openMap(page, CLOSE_VIEW);
  const on = await withNebulae(page, true, () => meanLuminanceBlock(page, MIDDLE, 120));
  // The count belongs to the last frame drawn, so it is read while the pass is on.
  const drawn = await page.evaluate(
    () => window.__galaxyMap?.nebulaDrawnCount?.() ?? -1,
  );
  const off = await withNebulae(page, false, () =>
    meanLuminanceBlock(page, MIDDLE, 120),
  );
  console.log('close zoom', { on, off, added: on - off, drawn });

  // The near end of the band is open, so a 1,000 light year zoom draws in full.
  expect(drawn).toBeGreaterThan(0);
  expect(on).toBeGreaterThan(off);
});

test('a nebula thins out as the camera closes on it', async ({ page }) => {
  const reading = async (fragment: string): Promise<number> => {
    await openMap(page, fragment);
    const on = await withNebulae(page, true, () =>
      meanLuminanceBlock(page, MIDDLE, 180),
    );
    const off = await withNebulae(page, false, () =>
      meanLuminanceBlock(page, MIDDLE, 180),
    );
    return off - on;
  };

  const far = await reading(CLOSING_VIEWS[0] as string);
  const middle = await reading(CLOSING_VIEWS[1] as string);
  const near = await reading(CLOSING_VIEWS[2] as string);
  console.log('closing in', { far, middle, near });

  // The record is a dark one, so what it takes out of the block is what it draws. The
  // sprite grows all the way in, and what it contributes falls.
  expect(far).toBeGreaterThan(middle);
  expect(middle).toBeGreaterThan(near);
  expect(near).toBeLessThan(0.02);
});

test('the camera inside a nebula sees none of it', async ({ page }) => {
  await openMap(page, INSIDE_VIEW);
  const insideOn = await withNebulae(page, true, () => meanLuminanceFrame(page));
  const insideOff = await withNebulae(page, false, () => meanLuminanceFrame(page));

  // The control reads the block the sprite covers, because the sprite fills a small
  // part of the frame and the reading above has to hold over the whole of it.
  await openMap(page, OUTSIDE_VIEW);
  const outsideOn = await withNebulae(page, true, () =>
    meanLuminanceBlock(page, MIDDLE, 180),
  );
  const outsideOff = await withNebulae(page, false, () =>
    meanLuminanceBlock(page, MIDDLE, 180),
  );
  console.log('inside', { insideOn, insideOff, outsideOn, outsideOff });

  // At three radii the camera-inside fade is 1 and the sprite is 208 CSS pixels in
  // radius, under the 540 pixel cap, which the frame reads as a large dark mass. At the
  // centre the camera-inside fade is 0 and the record contributes nothing.
  expect(outsideOff - outsideOn).toBeGreaterThan(0.05);
  expect(Math.abs(insideOn - insideOff)).toBeLessThan(0.002);
});

test('the glow reads the nebulae', async ({ page }) => {
  await openMap(page, BRIGHT_VIEW);
  await page.evaluate(() => {
    // The volume and the clouds go off, so the glow has the nebulae alone to read.
    window.__galaxyMap?.setPasses?.({
      volume: false,
      clouds: false,
      points: false,
      stars: false,
      nebulae: true,
    });
  });

  const read = async (glow: boolean): Promise<number> => {
    await page.evaluate((value) => {
      window.__galaxyMap?.setPasses?.({ glow: value });
      window.__galaxyMap?.drawNow?.();
    }, glow);
    // A ring outside the sprite, which draws about 21 CSS pixels across the radius.
    return meanLuminanceBlock(page, { x: 640 + 60, y: 360 }, 24);
  };

  const withGlow = await read(true);
  const withoutGlow = await read(false);
  console.log('glow', { withGlow, withoutGlow });

  expect(withGlow).toBeGreaterThan(withoutGlow);
});

// The nebulae are not part of the first frame. The start chain therefore does not wait
// for the pair, and a fetch that never answers must leave the map running with every
// other pass drawing. An await in the start chain would hold the first frame, and the
// loading picture with it, behind a request that may never return.
test('the map starts when the nebula art never answers', async ({ page }) => {
  let asked = false;
  // The handler never fulfils, aborts or continues, so the request stays open.
  await page.route('**/nebula-art*', () => {
    asked = true;
  });

  // The open does not wait for the attach here: the atlas never arrives.
  await openMap(page, '', { nebulae: false });

  const report = await page.evaluate(() => ({
    attached: window.__galaxyMap?.nebulaeAttached?.() ?? true,
    drawn: window.__galaxyMap?.nebulaDrawnCount?.() ?? -1,
    calls: window.__galaxyMap?.nebulaDrawCalls?.() ?? -1,
    meanMs: window.__galaxyMap?.measureFrames?.(10) ?? 0,
  }));
  console.log('the held atlas', { asked, ...report });

  expect(asked).toBe(true);
  expect(report.attached).toBe(false);
  // The pass draws nothing and costs no draw call, and the map keeps drawing frames.
  expect(report.drawn).toBe(0);
  expect(report.calls).toBe(0);
  expect(report.meanMs).toBeGreaterThan(0);
});
