import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { meanLuminanceBlock, meanLuminanceFrame, openMap, readRect } from './helpers';
import { putVolumeDensity } from '../src/render/shader-include';

/** Reads a shader source file from the tree. */
function shaderSource(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../src/render/shaders/${name}`, import.meta.url)),
    'utf8',
  );
}

/**
 * The nebula vertex shader as the pass compiles it. The file carries a line in place of
 * the shared density rule, and the pass puts the rule there before it compiles, so a
 * probe that compiled the raw file would compile a source the map never uses.
 */
function nebulaVertex(): string {
  return putVolumeDensity(
    shaderSource('nebulae.vert'),
    shaderSource('volume-density.glsl'),
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
    { vertex: nebulaVertex(), fragment: shaderSource('nebulae.frag') },
  );
  expect(error).toBeNull();
});

// The march reads a `sampler3D` in the vertex stage. WebGL2 guarantees at least 16
// vertex texture units, so a count check cannot fail on a conforming implementation and
// the assertion is the link, not the count. The count is a diagnostic, read from a probe
// context of the same driver, because the limit belongs to the implementation and not to
// one context. The program compiles on the map's own context.
test('the vertex stage carries the volume sampler', async ({ page }) => {
  await openMap(page);
  const report = await page.evaluate(
    (sources) => {
      const probe = document.createElement('canvas').getContext('webgl2');
      const units =
        probe === null
          ? -1
          : (probe.getParameter(probe.MAX_VERTEX_TEXTURE_IMAGE_UNITS) as number);
      return {
        units,
        error: window.__galaxyMap?.compileTestProgram?.(
          sources.vertex,
          sources.fragment,
        ),
      };
    },
    { vertex: nebulaVertex(), fragment: shaderSource('nebulae.frag') },
  );
  console.log('the vertex texture units', report.units);

  expect(report.error).toBeNull();
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
  await openMap(page, '', { waitForNebulae: false });

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

/**
 * Barnard's Loop seen from the far side of the galactic centre, 33,000 light years out,
 * where it draws about 3.8 CSS pixels across the radius. It is the only named record the
 * core can stand in front of: `G2 Dust Cloud` is the one other record beyond the centre
 * and its 8.62 light year radius stops it drawing past about 3,600 light years. The
 * block is 6 pixels, because a 10 pixel block reads more background than sprite.
 */
const CORE_VIEW = '#c=18.0,-36.9,25760.9&d=6000&p=0.83&y=178.71';

/**
 * Record 199, a dark nebula of 88.93 light years, 15,414 light years from a camera that
 * looks at it through the centre. The record carries no name, as the two dark records
 * the suite already reads carry none. It draws about 3.6 CSS pixels across the radius,
 * so this block is 6 pixels as well.
 */
const DARK_CORE_VIEW = '#c=-3163.1,163.1,23474.2&d=6000&p=-2.84&y=-127.30';

/** The block of a sprite reading: the mean light, the colour ratio and the bytes. */
interface BlockReading {
  lum: number;
  blueToRed: number;
  bytes: string;
}

/** Reads a square block at the middle of the frame. */
async function blockReading(
  page: import('@playwright/test').Page,
  size: number,
): Promise<BlockReading> {
  const half = size / 2;
  const bytes = await readRect(page, MIDDLE.x - half, MIDDLE.y - half, size, size);
  let red = 0;
  let green = 0;
  let blue = 0;
  for (let index = 0; index < bytes.length; index += 4) {
    red += bytes[index] as number;
    green += bytes[index + 1] as number;
    blue += bytes[index + 2] as number;
  }
  const count = bytes.length / 4;
  return {
    lum: (0.2126 * red + 0.7152 * green + 0.0722 * blue) / (255 * count),
    blueToRed: blue / red,
    bytes: bytes.join(','),
  };
}

/** Draws one frame with the occlusion constant at a value and reads the block. */
async function atOcclusion(
  page: import('@playwright/test').Page,
  value: number,
  size: number,
): Promise<BlockReading> {
  await page.evaluate((amount) => {
    window.__galaxyMap?.setPasses?.({ nebulae: true });
    window.__galaxyMap?.setNebulaOcclusion?.(amount);
    window.__galaxyMap?.drawNow?.();
  }, value);
  return blockReading(page, size);
}

/**
 * Every hook call in this suite is optional-chained, so a hook that is missing or
 * misnamed would give two readings of one frame and the "barely changes" test would pass
 * over a feature that never ran.
 */
async function hookExists(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(
    () => typeof window.__galaxyMap?.setNebulaOcclusion === 'function',
  );
}

test('a nebula with little in front of it barely changes', async ({ page }) => {
  await openMap(page, BRIGHT_VIEW);
  expect(await hookExists(page)).toBe(true);

  const size = 10;
  const on = await atOcclusion(page, 1, size);
  const off = await atOcclusion(page, 0, size);
  const change = Math.abs(on.lum - off.lum) / off.lum;
  console.log('little in front', { on: on.lum, off: off.lum, change });

  // The two frames are not the same frame.
  expect(on.bytes).not.toBe(off.bytes);
  // The design costs this 5,912 light year segment at a transmittance of 0.997, 0.994
  // and 0.989 by channel, so the worst channel changes by about 1.1 percent and the
  // spec puts the band at 2 percent of the block mean. The measured change of the block
  // is 0.095 percent. It sits under the estimate because the block mean carries the
  // background as well as the sprite, and because luminance weights the green channel,
  // which the middle transmittance of 0.994 attenuates.
  expect(change).toBeLessThan(0.02);
});

test('occluded light turns warm', async ({ page }) => {
  await openMap(page, CORE_VIEW);
  expect(await hookExists(page)).toBe(true);

  const size = 6;
  const on = await atOcclusion(page, 1, size);
  const off = await atOcclusion(page, 0, size);
  console.log('warm', { on: on.blueToRed, off: off.blueToRed });

  expect(on.bytes).not.toBe(off.bytes);
  // The dust weights are 0.55, 1.00 and 1.70, so the blue channel loses the most light
  // of the three. The measured ratio is 0.8165 at 1 against 0.8347 at 0.
  expect(on.blueToRed).toBeLessThan(off.blueToRed);
});

test('a dark nebula behind the core stops cutting a hole', async ({ page }) => {
  await openMap(page, DARK_CORE_VIEW);
  expect(await hookExists(page)).toBe(true);

  const size = 6;
  const on = await atOcclusion(page, 1, size);
  const off = await atOcclusion(page, 0, size);
  console.log('the hole', { on: on.lum, off: off.lum, added: on.lum - off.lum });

  expect(on.bytes).not.toBe(off.bytes);
  // The transmittance scales the alpha as well as the colour, so the sprite holds back
  // less of the light of the core behind it. The measured readings are 0.88114 at 1
  // against 0.85038 at 0, a rise of 3.6 percent.
  expect(on.lum).toBeGreaterThan(off.lum);
});

test('a nebula behind the core dims', async ({ page }) => {
  await openMap(page, CORE_VIEW);
  expect(await hookExists(page)).toBe(true);

  const size = 6;
  const off = await withNebulae(page, false, () => blockReading(page, size));
  const on1 = await atOcclusion(page, 1, size);
  const on0 = await atOcclusion(page, 0, size);
  const added1 = on1.lum - off.lum;
  const added0 = on0.lum - off.lum;
  console.log('through the core', { off: off.lum, added1, added0 });

  expect(on1.bytes).not.toBe(on0.bytes);
  // The reading is what the sprite contributes, the block with the pass on less the
  // block with the pass off, because through the core the block itself cannot fall. The
  // spec states the pixel algebra. The measured contribution is 0.00087 at occlusion 1
  // against 0.01505 at 0, both of them negative: the sprite reads as a hole here, and
  // the march makes that hole shallower.
  expect(Math.abs(added1)).toBeLessThan(Math.abs(added0));
});

/** The record file and the sprite atlas, as the build names them. */
const NEBULA_FILES = /nebula[\w-]*\.(json|webp)/i;

/** Collects the URL of every request the page makes for one of the two files. */
function watchNebulaFiles(page: Page): string[] {
  const asked: string[] = [];
  page.on('request', (request) => {
    if (NEBULA_FILES.test(request.url())) asked.push(request.url());
  });
  return asked;
}

/** Draws one frame on the demo page and reads how many sprites it drew. */
async function drawnNow(page: Page): Promise<number> {
  return page.evaluate(() => {
    window.__galaxyMap?.drawNow?.();
    return window.__galaxyMap?.nebulaDrawnCount?.() ?? -1;
  });
}

test('the switch removes the sprites and gives them back', async ({ page }) => {
  await openMap(page, BRIGHT_VIEW);
  // The open waits for the attach, so every request for the two files is already made.
  // The watch below therefore counts the requests of the switch alone.
  const asked = watchNebulaFiles(page);

  const before = await drawnNow(page);
  await page.evaluate(() => {
    window.galaxyMap?.setNebulaeVisible(false);
  });
  const off = await drawnNow(page);
  await page.evaluate(() => {
    window.galaxyMap?.setNebulaeVisible(true);
  });
  const on = await drawnNow(page);
  const visible = await page.evaluate(() => window.galaxyMap?.areNebulaeVisible());
  console.log('the switch', { before, off, on, visible, asked });

  expect(before).toBeGreaterThan(0);
  expect(off).toBe(0);
  // The records and the art stay on the GPU, so the sprites come back as they were and
  // the map downloads neither file a second time.
  expect(on).toBe(before);
  expect(visible).toBe(true);
  expect(asked).toEqual([]);
});

test('a map with no nebula option downloads neither file', async ({ page }) => {
  await openMap(page, BRIGHT_VIEW);
  const asked = watchNebulaFiles(page);
  const failures: string[] = [];
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text());
    if (message.type() === 'warning') warnings.push(message.text());
  });
  page.on('pageerror', (error) => {
    failures.push(error.message);
  });

  // The second map is built with no `nebulae` option, which is the state a host that
  // never asks for the sprites is in. The demo map comes down first, so its own frames
  // do not draw beside the second map's.
  const report = await page.evaluate(async () => {
    const factory = window.galaxyMapFactory;
    if (factory === undefined) throw new Error('The page has no map factory.');
    window.galaxyMap?.dispose();
    const canvas = document.createElement('canvas');
    canvas.id = 'no-nebulae';
    canvas.style.cssText = 'display: block; width: 1280px; height: 720px;';
    document.body.appendChild(canvas);
    const map = factory(canvas, {});
    window.__plainMap = map;
    await map.ready;
    map.setView({
      cursor: [624.4, -425.9, -1229.5],
      distance: 6000,
      pitch: 35,
      yaw: 0,
    } as never);
    map.debug.drawNow();
    return {
      has: map.hasNebulae(),
      visible: map.areNebulaeVisible(),
      attached: map.debug.nebulaeAttached(),
      drawn: map.debug.nebulaDrawnCount(),
      calls: map.debug.nebulaDrawCalls(),
      meanMs: map.debug.measureFrames(10),
    };
  });
  console.log('the map with no source', { ...report, asked, failures, warnings });

  expect(asked).toEqual([]);
  expect(report.has).toBe(false);
  expect(report.visible).toBe(false);
  expect(report.attached).toBe(false);
  // The view is the one that draws the most sprites, and this map draws none of them.
  expect(report.drawn).toBe(0);
  expect(report.calls).toBe(0);
  // The map keeps drawing, and it reports nothing to the console.
  expect(report.meanMs).toBeGreaterThan(0);
  expect(failures).toEqual([]);
});
