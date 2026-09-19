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

/**
 * Barnard's Loop, the largest record in the set at 200 light years. The view puts it at
 * the middle of the frame at a zoom distance inside the band, where it draws about 21
 * CSS pixels across the radius and the next record is under half that.
 */
const BRIGHT_VIEW = '#c=624.4,-425.9,-1229.5&d=6000&p=35&y=0';

/**
 * A dark nebula of 88.93 light years. It is the largest record in the middle of this
 * frame, so the block the test samples reads its volume.
 */
const DARK_VIEW = '#c=-10642.7,629.4,17776.7&d=6000&p=35&y=0';

/**
 * Barnard's Loop again, with the camera 1,000 light years from it and the zoom well
 * inside the close range. The near end of the band is open, so the record draws here
 * about six times as wide as it does at 6,000 light years.
 */
const CLOSE_VIEW = '#c=624.4,-425.9,-1229.5&d=1000&p=35&y=0';

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

  // The composite pair the pass applies its accumulation target with. The test names
  // the shaders it compiles one by one, so a new pair needs this line.
  const compositeError = await page.evaluate(
    (sources) =>
      window.__galaxyMap?.compileTestProgram?.(sources.vertex, sources.fragment),
    {
      vertex: shaderSource('nebula-composite.vert'),
      fragment: shaderSource('nebula-composite.frag'),
    },
  );
  expect(compositeError).toBeNull();
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
    // A ring outside the box, which draws about 21 CSS pixels across the radius.
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
  await page.route('**/*-density-*.dds', () => {
    asked = true;
  });

  // The open does not wait for the attach here: the volumes never arrive.
  await openMap(page, '', { waitForNebulae: false });

  const report = await page.evaluate(() => ({
    attached: window.__galaxyMap?.nebulaeAttached?.() ?? true,
    drawn: window.__galaxyMap?.nebulaDrawnCount?.() ?? -1,
    calls: window.__galaxyMap?.nebulaDrawCalls?.() ?? -1,
    meanMs: window.__galaxyMap?.measureFrames?.(10) ?? 0,
  }));
  console.log('the held volumes', { asked, ...report });

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
 * block is 6 pixels, because a 10 pixel block reads more background than nebula.
 */
const CORE_VIEW = '#c=18.0,-36.9,25760.9&d=6000&p=0.83&y=178.71';

/**
 * Record 199, a dark nebula of 88.93 light years, 15,414 light years from a camera that
 * looks at it through the centre. The record carries no name, as the two dark records
 * the suite already reads carry none. It draws about 3.6 CSS pixels across the radius,
 * so this block is 6 pixels as well.
 */
const DARK_CORE_VIEW = '#c=-3163.1,163.1,23474.2&d=6000&p=-2.84&y=-127.30';

/** The block of a nebula reading: the mean light, the colour ratio and the bytes. */
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
  // background as well as the nebula, and because luminance weights the green channel,
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
  // The transmittance scales the alpha as well as the colour, so the nebula holds back
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
  // The reading is what the nebula contributes, the block with the pass on less the
  // block with the pass off, because through the core the block itself cannot fall. The
  // spec states the pixel algebra. The measured contribution is 0.00087 at occlusion 1
  // against 0.01505 at 0, both of them negative: the nebula reads as a hole here, and
  // the march makes that hole shallower.
  expect(Math.abs(added1)).toBeLessThan(Math.abs(added0));
});

/**
 * The record file, the volume index, the transfer file and the 66 volumes, as the build
 * names them. Every one is hashed, so the pattern reads the stem and the suffix.
 */
const NEBULA_FILES =
  /(nebulae[\w-]*\.json|nebula-volumes[\w-]*\.json|transfer[\w-]*\.bin|-(density|colour)[\w-]*\.dds)$/i;

/** Collects the URL of every request the page makes for a nebula file. */
function watchNebulaFiles(page: Page): string[] {
  const asked: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (NEBULA_FILES.test(url)) asked.push(url);
  });
  return asked;
}

/** Draws one frame on the demo page and reads how many records it drew. */
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
  // The records and the art stay on the GPU, so the nebulae come back as they were and
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
  // never asks for the nebulae is in. The demo map comes down first, so its own frames
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
  // The view is the one that draws the most records, and this map draws none of them.
  expect(report.drawn).toBe(0);
  expect(report.calls).toBe(0);
  // The map keeps drawing, and it reports nothing to the console.
  expect(report.meanMs).toBeGreaterThan(0);
  expect(failures).toEqual([]);
});

// The positive control of the two tests above. Both of them pass on a watcher that sees
// nothing, so a pattern that matched no built file would pass them and guard nothing.
// This test installs the same watcher before the open, where the map does download the
// nebulae, and holds it to every one of the four kinds of file.
test('the watcher reports the records, the index, the transfer file and the volumes', async ({
  page,
}) => {
  const asked = watchNebulaFiles(page);

  await openMap(page, BRIGHT_VIEW);

  const names = asked.map((url) => url.split('/').pop() ?? '');
  console.log('the nebula files', names);

  expect(names.filter((name) => /^nebulae[\w-]*\.json$/.test(name)).length).toBe(1);
  expect(names.filter((name) => /^nebula-volumes[\w-]*\.json$/.test(name)).length).toBe(
    1,
  );
  expect(names.filter((name) => /^transfer[\w-]*\.bin$/.test(name)).length).toBe(1);
  // The loader reads the index and fetches the pair of every asset it names, so the
  // count is the 33 of the index and not the count the view draws.
  expect(names.filter((name) => /-density[\w-]*\.dds$/.test(name)).length).toBe(33);
  expect(names.filter((name) => /-colour[\w-]*\.dds$/.test(name)).length).toBe(33);
});

// The volumes are `.dds` block files, and the loader decodes the blocks on the CPU into
// plain `R8` and `RGBA8` textures. It therefore asks for no compressed-texture extension.
// The test refuses all three the formats belong to, so a run that started to upload the
// blocks unchanged would find no format and draw nothing.
test.describe('a card with no compressed-texture extension', () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

  test('loads the nebulae and draws them', async ({ page }) => {
    const refused = [
      'WEBGL_compressed_texture_s3tc',
      'EXT_texture_compression_rgtc',
      'EXT_texture_compression_bptc',
    ];
    await page.addInitScript((names: string[]) => {
      const original = WebGL2RenderingContext.prototype.getExtension;
      WebGL2RenderingContext.prototype.getExtension = function patched(
        this: WebGL2RenderingContext,
        name: string,
      ) {
        if (names.includes(name)) return null;
        return (original as (...args: unknown[]) => unknown).call(this, name);
      } as typeof WebGL2RenderingContext.prototype.getExtension;
    }, refused);

    await openMap(page, BRIGHT_VIEW);

    const report = await page.evaluate((names: string[]) => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      window.__galaxyMap?.drawNow?.();
      return {
        // The positive control: the refusal reached the page.
        offered: names.filter((name) => gl?.getExtension(name) != null),
        attached: window.__galaxyMap?.nebulaeAttached?.() ?? false,
        drawn: window.__galaxyMap?.nebulaDrawnCount?.() ?? -1,
      };
    }, refused);
    const light = await meanLuminanceBlock(page, MIDDLE, 6);
    console.log('the card with no compressed format', { ...report, light });

    expect(report.offered).toEqual([]);
    expect(report.attached).toBe(true);
    expect(report.drawn).toBeGreaterThan(0);
    expect(light).toBeGreaterThan(0);
  });
});

/**
 * The CPU reference the march is read against. `scripts/build-nebula-fixture.mjs` writes
 * the files and `tests/nebula-fixture.test.ts` holds that generator to the map's own
 * block decode, selection and rotation matrix.
 */
const FIXTURES = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./fixtures/nebula-fixtures.json', import.meta.url)),
    'utf8',
  ),
) as {
  canvas: { width: number; height: number };
  stepRate: number;
  views: Record<
    string,
    {
      asset: string;
      record: number;
      crop: number;
      drawn: number;
      view: {
        cursor: [number, number, number];
        distance: number;
        pitch: number;
        yaw: number;
      };
    }
  >;
};

/** The reference bytes of one view: three bytes a pixel, row by row from the top. */
function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(
      fileURLToPath(new URL(`./fixtures/nebula-${name}.bin`, import.meta.url)),
    ),
  );
}

/**
 * The root mean square difference in display units, 0 to 1, between the drawn frame and
 * the reference. The frame is read at full resolution and averaged two by two, because
 * the nebulae draw into a half-resolution target and the reference marches on that grid.
 */
function fixtureRmse(frame: number[], reference: Uint8Array, crop: number): number {
  let sum = 0;
  for (let row = 0; row < crop; row += 1) {
    for (let column = 0; column < crop; column += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        let mean = 0;
        for (let dy = 0; dy < 2; dy += 1) {
          for (let dx = 0; dx < 2; dx += 1) {
            const at = ((row * 2 + dy) * crop * 2 + (column * 2 + dx)) * 4 + channel;
            mean += (frame[at] as number) / 4;
          }
        }
        const want = reference[(row * crop + column) * 3 + channel] as number;
        const difference = (mean - want) / 255;
        sum += difference * difference;
      }
    }
  }
  return Math.sqrt(sum / (crop * crop * 3));
}

// The fidelity reading of this change. The frame marches on the GPU and the fixture
// marches the same integral on the CPU, from the `.dds` bytes and each record's own
// rotation, through the map's exposure and tone map. A flipped axis, a transposed
// rotation or a mistaken transfer lookup moves the reading and no other test would
// catch it.
//
// The occlusion is held at 0, so the galaxy volume's extinction leaves the reading
// alone and the fixture needs no copy of the volume march. Every other pass is off.
//
// The readings on the hardware renderer are barnards-loop 0.0083 and cats-eye 0.0058,
// against bounds of 0.02 and 0.01. `barnards-loop` is the mildest asset in the set;
// `cats-eye` carries its largest negative extinction, -193.5, so it is where the
// transmittance recurrence shows first. Its bound is its reading rounded up to the next
// hundredth, as the spec asks. A reading above 0.05 means the march is wrong.
for (const [name, bound] of [
  ['barnards-loop', 0.02],
  ['cats-eye', 0.01],
] as const) {
  test(`the march of ${name} reproduces the reference integral`, async ({ page }) => {
    const entry = FIXTURES.views[name];
    if (entry === undefined) throw new Error(`The fixture file holds no ${name}.`);

    await openMap(page, '');
    const drawn = await page.evaluate((view) => {
      window.__galaxyMap?.setPasses?.({
        volume: false,
        clouds: false,
        points: false,
        stars: false,
        glow: false,
        grid: false,
        regions: false,
        shapes: false,
        systems: false,
        nebulae: true,
      });
      window.__galaxyMap?.setNebulaOcclusion?.(0);
      window.__galaxyMap?.setView?.(view);
      window.__galaxyMap?.drawNow?.();
      return window.__galaxyMap?.nebulaDrawnCount?.() ?? -1;
    }, entry.view);

    const crop = entry.crop;
    const first = {
      x: ((FIXTURES.canvas.width >> 1) - crop) >> 1,
      y: ((FIXTURES.canvas.height >> 1) - crop) >> 1,
    };
    const frame = await readRect(page, first.x * 2, first.y * 2, crop * 2, crop * 2);
    const rmse = fixtureRmse(frame, fixtureBytes(name), crop);
    console.log(`the ${name} march`, { drawn, rmse });

    // The fixture marches every record the selection keeps, so the frame must draw the
    // same set. A different count means the two sides read different records.
    expect(drawn).toBe(entry.drawn);
    expect(frame).toHaveLength(crop * 2 * crop * 2 * 4);
    expect(rmse).toBeLessThan(bound);
  });
}

/** The record of `dark-02` the step-rate reading uses, and the view that fills the frame. */
const DARK_02_VIEW = {
  cursor: [-15776.8, -113.4, 11581.3] as [number, number, number],
  distance: 228,
  pitch: 0,
  yaw: 0,
};

/** Turns off every pass but the nebulae and holds the occlusion at 0. */
async function nebulaeAlone(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__galaxyMap?.setPasses?.({
      volume: false,
      clouds: false,
      points: false,
      stars: false,
      glow: false,
      grid: false,
      regions: false,
      shapes: false,
      systems: false,
      nebulae: true,
    });
    window.__galaxyMap?.setNebulaOcclusion?.(0);
  });
}

// The step rate is a cost dial and not a look dial. `dark-02` is the asset whose
// transfer table reaches the set's largest extinction, 3,066, and the transmittance
// recurrence is linear, so the quadrature error grows with the extinction. If doubling
// the rate does not move that asset, it moves nothing.
//
// The measured difference on the hardware renderer is 0.00125 against a block mean of
// 0.0672, which is 1.9 percent, under the 5 percent bound. The default step rate of 32
// therefore stays where it is.
test('doubling the step rate moves nothing visible', async ({ page }) => {
  await openMap(page, '');
  await nebulaeAlone(page);

  const read = async (rate: number): Promise<number> => {
    await page.evaluate(
      (where) => {
        const map = window.galaxyMap;
        if (map !== undefined) map.debug.look.nebulaStepRate = where.rate;
        window.__galaxyMap?.setView?.(where.view);
        window.__galaxyMap?.drawNow?.();
      },
      { view: DARK_02_VIEW, rate },
    );
    return meanLuminanceBlock(page, MIDDLE, 120);
  };

  const coarse = await read(32);
  const fine = await read(64);
  const difference = Math.abs(fine - coarse);
  console.log('the step rate', {
    coarse,
    fine,
    difference,
    share: difference / coarse,
  });

  expect(coarse).toBeGreaterThan(0.005);
  expect(difference).toBeLessThan(0.05 * coarse);
});

// The camera inside a nebula sees the part in front of it, and that part covers the
// frame. The pass this change replaces drew a flat card that faded to nothing here.
test('the camera inside a nebula is surrounded by it', async ({ page }) => {
  await openMap(page, '');
  await nebulaeAlone(page);
  await page.evaluate(() => {
    window.__galaxyMap?.setView?.({
      cursor: [624.4, -425.9, -1229.5],
      distance: 20,
      pitch: 0,
      yaw: 0,
    });
    window.__galaxyMap?.drawNow?.();
  });

  // Nine blocks over the frame, so the reading covers the corners as well as the middle.
  const points = [];
  for (const x of [160, 640, 1120])
    for (const y of [90, 360, 630]) points.push({ x, y });
  const lights = [];
  for (const point of points) lights.push(await meanLuminanceBlock(page, point, 40));
  const off = await withNebulae(page, false, () => meanLuminanceFrame(page));
  console.log('inside a nebula', { lights, off });

  // Every block carries light, and the whole frame is brighter than the frame with the
  // pass off.
  for (let at = 0; at < lights.length; at += 1) {
    expect(lights[at], `block ${at} is dark`).toBeGreaterThan(off);
  }
});

// A nebula grows as the camera closes on it, which is what a volume does and a flat
// card of a fixed apparent size does not. The reading is the contribution at three,
// two and 1.2 times the radius.
test('a nebula grows as the camera closes on it', async ({ page }) => {
  await openMap(page, '');
  await nebulaeAlone(page);

  // Barnard's Loop, whose radius is 200 light years.
  const read = async (multiple: number): Promise<number> =>
    page
      .evaluate(
        (distance) => {
          window.__galaxyMap?.setView?.({
            cursor: [624.4, -425.9, -1229.5],
            distance,
            pitch: 0,
            yaw: 0,
          });
          window.__galaxyMap?.drawNow?.();
          return window.__galaxyMap?.nebulaDrawnCount?.() ?? -1;
        },
        Math.round(200 * multiple),
      )
      .then(() => meanLuminanceBlock(page, MIDDLE, 200));

  const far = await read(3);
  const middle = await read(2);
  const near = await read(1.2);
  console.log('closing on a nebula', { far, middle, near });

  expect(middle).toBeGreaterThan(far);
  expect(near).toBeGreaterThan(middle);
});

/**
 * The Orion viewpoint of the two readings below, in game coordinates. The camera sits
 * among the Orion records, where 87 of them draw at 3,000 light years.
 */
const ORION_VIEWPOINT: [number, number, number] = [-60, -80, -1100];

/** Barnard's Loop, the largest record in the set, for the reading at 120 light years. */
const BARNARDS_LOOP: [number, number, number] = [624.4, -425.9, -1229.5];

/**
 * How many camera windows the continuity sweep reads. 720 windows put one every half a
 * degree of the orbit.
 */
const SWEEP_WINDOWS = 720;

/**
 * How far the camera turns inside one window, in degrees. It moves the image about a
 * twentieth of a pixel, so a difference above the floor is a step and not a move.
 */
const SWEEP_STEP_DEGREES = 0.004;

/**
 * The largest step the sweep accepts, summed over the three channels on a 0 to 255
 * scale. It is the no-flip floor, which the same sweep reads at 3 to 7.
 */
const SWEEP_BOUND = 8;

// The spec's scenario **The frame does not step when two records change rank**. The
// blend of the records does not depend on their order, so the frame holds still across a
// camera window that changes their rank. The sweep reads pixels and not time, so it runs
// in the parallel pass.
//
// The same sweep on the blend that ordered the records reads a worst pair of 71, at a
// yaw of 54.5 degrees, with 167 of its 720 windows above the floor.
test('the frame does not step when two records change rank', async ({ page }) => {
  await openMap(page, '');
  await nebulaeAlone(page);

  const report = await page.evaluate(
    (sweep) => {
      const map = window.__galaxyMap;
      if (map?.readRect === undefined) return null;
      const read = map.readRect;
      const frameAt = (yaw: number): Uint8Array => {
        map.setView?.({
          cursor: sweep.cursor,
          distance: sweep.distance,
          pitch: 0,
          yaw,
        });
        map.drawNow?.();
        return read(0, 0, sweep.width, sweep.height);
      };
      let worst = 0;
      let worstYaw = 0;
      let above = 0;
      for (let index = 0; index < sweep.windows; index += 1) {
        const yaw = (index * 360) / sweep.windows;
        const first = frameAt(yaw);
        const second = frameAt(yaw + sweep.stepDegrees);
        let step = 0;
        for (let at = 0; at < first.length; at += 4) {
          const difference =
            Math.abs((first[at] as number) - (second[at] as number)) +
            Math.abs((first[at + 1] as number) - (second[at + 1] as number)) +
            Math.abs((first[at + 2] as number) - (second[at + 2] as number));
          if (difference > step) step = difference;
        }
        if (step > worst) {
          worst = step;
          worstYaw = yaw;
        }
        if (step > sweep.bound) above += 1;
      }
      return { worst, worstYaw, above, drawn: map.nebulaDrawnCount?.() ?? -1 };
    },
    {
      cursor: ORION_VIEWPOINT,
      distance: 3000,
      windows: SWEEP_WINDOWS,
      stepDegrees: SWEEP_STEP_DEGREES,
      bound: SWEEP_BOUND,
      width: 1280,
      height: 720,
    },
  );
  console.log('the order sweep', { ...report, windows: SWEEP_WINDOWS });

  expect(report).not.toBeNull();
  // The positive control: the camera draws records at every window it reads.
  expect(report?.drawn ?? 0).toBeGreaterThan(0);
  expect(report?.above).toBe(0);
  expect(report?.worst ?? 765).toBeLessThanOrEqual(SWEEP_BOUND);
});

/**
 * The three cameras of the spec's scenario **The overlap stays inside the light it was
 * measured at**, with the mean frame luminance each one draws.
 *
 * The bound is the measured figure rounded up to the next thousandth, so a reader can
 * tell a near miss from the rounding. The blend adds no light where the records do not
 * overlap and the light can only rise where they do, so the reading is one-sided and the
 * bound is an upper one.
 *
 * The blend that ordered the records read 0.1824 at the first camera, 0.0431 at the
 * second and 0.0382 at the third, under the same conditions.
 */
const OVERLAP_CAMERAS = [
  { name: "Barnard's Loop at 120", cursor: BARNARDS_LOOP, distance: 120, bound: 0.183 },
  { name: 'Orion at 800', cursor: ORION_VIEWPOINT, distance: 800, bound: 0.044 },
  { name: 'Orion at 3000', cursor: ORION_VIEWPOINT, distance: 3000, bound: 0.039 },
] as const;

// The cost of the order independence: a record takes no light from another, so the
// frame is brighter where two records overlap. The bound holds that overlap where it was
// measured, and it does not move to fit a change that raises it.
test('the overlap stays inside the light it was measured at', async ({ page }) => {
  await openMap(page, '');
  await nebulaeAlone(page);

  for (const camera of OVERLAP_CAMERAS) {
    const reading = await page.evaluate((where) => {
      window.__galaxyMap?.setView?.({
        cursor: where.cursor,
        distance: where.distance,
        pitch: 0,
        yaw: 0,
      });
      window.__galaxyMap?.drawNow?.();
      return window.__galaxyMap?.nebulaDrawnCount?.() ?? -1;
    }, camera);
    const mean = await meanLuminanceFrame(page);
    console.log('the overlap light', { camera: camera.name, mean, drawn: reading });

    // The positive control: the camera draws the records the reading is of.
    expect(reading, `${camera.name} drew no record`).toBeGreaterThan(0);
    expect(mean, `${camera.name} is brighter than its reading`).toBeLessThanOrEqual(
      camera.bound,
    );
  }
});
