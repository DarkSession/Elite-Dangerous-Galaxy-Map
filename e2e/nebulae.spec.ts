import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  meanLuminanceBlock,
  meanLuminanceFrame,
  openMap,
  readRect,
  removeHud,
  settleNebulae,
  startState,
  waitForReady,
} from './helpers';
import { BRIGHT_VIEW, CLOSE_VIEW, DARK_VIEW } from './nebula-views';
import {
  DEFAULT_NEBULA_BLOCK_FAR,
  DEFAULT_NEBULA_BLOCK_NEAR,
  DEFAULT_NEBULA_OCCLUSION,
} from '../packages/galaxy-map/src/render/nebula-slot';
import { putVolumeDensity } from '../packages/galaxy-map/src/render/shader-include';

/** Reads a shader source file from the tree. */
function shaderSource(name: string): string {
  return readFileSync(
    fileURLToPath(
      new URL(`../packages/galaxy-map/src/render/shaders/${name}`, import.meta.url),
    ),
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

  // The composite pair the pass applies its accumulation target with. Its vertex stage
  // is the one the other full-screen passes use. The test names the shaders it compiles
  // one by one, so a new pair needs this line.
  const compositeError = await page.evaluate(
    (sources) =>
      window.__galaxyMap?.compileTestProgram?.(sources.vertex, sources.fragment),
    {
      vertex: shaderSource('fullscreen.vert'),
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
  await page.route('**/*-density-*.ktx2', () => {
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
  const on = await atOcclusion(page, DEFAULT_NEBULA_OCCLUSION, size);
  const off = await atOcclusion(page, 0, size);
  const change = Math.abs(on.lum - off.lum) / off.lum;
  console.log('little in front', { on: on.lum, off: off.lum, change });

  // The two frames are not the same frame.
  expect(on.bytes).not.toBe(off.bytes);
  // The design costs this 5,912 light year segment at a transmittance of 0.997, 0.994
  // and 0.989 by channel at the constant 1. The transmittance at a constant k is that
  // value raised to k, so at the default of 2 the worst channel changes by 1 - 0.989^2,
  // which is 2.2 percent. The band is 4 percent: that estimate plus the same margin the
  // 2 percent band carried at the constant 1. The block mean sits under the estimate,
  // because it carries the background as well as the nebula.
  expect(change).toBeLessThan(0.04);
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

test('a higher constant dims it further', async ({ page }) => {
  await openMap(page, CORE_VIEW);
  expect(await hookExists(page)).toBe(true);

  const size = 6;
  const off = await withNebulae(page, false, () => blockReading(page, size));
  const on1 = await atOcclusion(page, 1, size);
  const onDefault = await atOcclusion(page, DEFAULT_NEBULA_OCCLUSION, size);
  const added1 = on1.lum - off.lum;
  const addedDefault = onDefault.lum - off.lum;
  console.log('a higher constant', { off: off.lum, added1, addedDefault });

  // The reading is the nebula's contribution, for the reason the test above states.
  expect(Math.abs(addedDefault)).toBeLessThan(Math.abs(added1));
});

test('the renderer sends the default with no value named', async ({ page }) => {
  await openMap(page, CORE_VIEW);
  expect(await hookExists(page)).toBe(true);

  const size = 6;
  // The frame the map draws before any call to the hook, which carries the default.
  await page.evaluate(() => {
    window.__galaxyMap?.setPasses?.({ nebulae: true });
    window.__galaxyMap?.drawNow?.();
  });
  const untouched = await blockReading(page, size);
  const named = await atOcclusion(page, DEFAULT_NEBULA_OCCLUSION, size);
  const other = await atOcclusion(page, 1, size);
  console.log('the default occlusion', { constant: DEFAULT_NEBULA_OCCLUSION });

  expect(DEFAULT_NEBULA_OCCLUSION).toBe(2);
  expect(named.bytes).toBe(untouched.bytes);
  expect(other.bytes).not.toBe(untouched.bytes);
});

/** The four selection readings of the last nebula draw. */
async function selectionReadings(page: Page): Promise<{
  drawn: number;
  calls: number;
  aboveFloor: number;
  coveredArea: number;
}> {
  return page.evaluate(() => ({
    drawn: window.__galaxyMap?.nebulaDrawnCount?.() ?? -1,
    calls: window.__galaxyMap?.nebulaDrawCalls?.() ?? -1,
    aboveFloor: window.__galaxyMap?.nebulaAboveFloorCount?.() ?? -1,
    coveredArea: window.__galaxyMap?.nebulaCoveredArea?.() ?? -1,
  }));
}

/**
 * The constant that takes Barnard's Loop under the cull floor at `CORE_VIEW`. The design
 * costs the segment through the core at a transmittance well under 1 at the constant 1,
 * and the transmittance at a constant k is that value raised to k, so a large k drives
 * the mean under 0.02. The figure is high on purpose: the test states that a culled
 * record adds nothing, not the constant at which the cull starts.
 */
const CULLING_OCCLUSION = 60;

test('a culled record contributes nothing', async ({ page }) => {
  await openMap(page, CORE_VIEW);
  expect(await hookExists(page)).toBe(true);

  const size = 6;
  const culled = await atOcclusion(page, CULLING_OCCLUSION, size);
  const readings = await selectionReadings(page);
  const off = await withNebulae(page, false, () => blockReading(page, size));
  console.log('a culled record', { readings, lum: culled.lum });

  // The cull sits after the selection, so the frame still issued the draw call.
  expect(readings.calls).toBeGreaterThan(0);
  // The record marched no fragment, so the two blocks are the same bytes.
  expect(culled.bytes).toBe(off.bytes);
});

test('the cull leaves the selection readings alone', async ({ page }) => {
  await openMap(page, CORE_VIEW);
  expect(await hookExists(page)).toBe(true);

  await atOcclusion(page, 0, 6);
  const none = await selectionReadings(page);
  await atOcclusion(page, CULLING_OCCLUSION, 6);
  const culling = await selectionReadings(page);
  console.log('the cull and the selection', { none, culling });

  expect(culling).toEqual(none);
  expect(none.drawn).toBeGreaterThan(0);
});

/**
 * The record file, the volume index, the transfer file and the 66 volumes, as the build
 * names them. Every one is hashed, so the pattern reads the stem and the suffix.
 */
const NEBULA_FILES =
  /(nebulae[\w-]*\.json|nebula-volumes[\w-]*\.json|transfer[\w-]*\.bin|-(density|colour)[\w-]*\.ktx2)$/i;

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

test('the pass switch and the host switch stay apart', async ({ page }) => {
  await openMap(page, BRIGHT_VIEW);

  const before = await drawnNow(page);
  await page.evaluate(() => {
    window.__galaxyMap?.setPasses?.({ nebulae: false });
  });
  const off = await drawnNow(page);
  // The pass switch is off and the host switch is on, and the two are apart.
  const visible = await page.evaluate(() => window.galaxyMap?.areNebulaeVisible());
  // The host switch goes off and on again. It writes the draw flag alone, so the pass
  // switch holds the frame at 0.
  await page.evaluate(() => {
    window.galaxyMap?.setNebulaeVisible(false);
    window.galaxyMap?.setNebulaeVisible(true);
  });
  const after = await drawnNow(page);
  console.log('the two switches', { before, off, visible, after });

  expect(before).toBeGreaterThan(0);
  expect(off).toBe(0);
  expect(visible).toBe(true);
  expect(after).toBe(0);
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
  expect(names.filter((name) => /-density[\w-]*\.ktx2$/.test(name)).length).toBe(33);
  expect(names.filter((name) => /-colour[\w-]*\.ktx2$/.test(name)).length).toBe(33);
});

// The volumes are `.ktx2` arrays of BC4 and BC1 blocks, and the map uploads the blocks
// unchanged where the context carries both `EXT_texture_compression_rgtc` and
// `WEBGL_compressed_texture_s3tc`. That is the fast path, and it is not a requirement:
// a context that carries fewer than both decodes the blocks on the CPU and uploads
// plain `R8` and `RGBA8` to the same array target. The test refuses all three
// extensions the block formats belong to, so a build that had dropped the CPU decode
// would find no format and draw nothing.
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

/** The `COMPRESSED_RED_RGTC1` the density volumes upload in, on the fast path. */
const COMPRESSED_RED_RGTC1 = 0x8dbb;

/**
 * Makes every later navigation of this page refuse `COMPRESSED_RED_RGTC1` on a
 * `TEXTURE_2D_ARRAY`, which is what Firefox does. The call allocates nothing and the
 * next `getError` on that context reads `INVALID_OPERATION`, which is the error Firefox
 * raises for this pair. Every other call passes through.
 */
async function refuseBlockFormatOnArray(page: Page): Promise<void> {
  await page.addInitScript((format: number) => {
    const TEXTURE_2D_ARRAY = 0x8c1a;
    // The error Firefox raises for this pair on this card, read on 2026-09-20.
    const INVALID_OPERATION = 0x0502;
    const refused = new WeakSet<WebGL2RenderingContext>();
    const storage = WebGL2RenderingContext.prototype.texStorage3D;
    const error = WebGL2RenderingContext.prototype.getError;
    WebGL2RenderingContext.prototype.texStorage3D = function patched(
      this: WebGL2RenderingContext,
      target: number,
      levels: number,
      internalformat: number,
      width: number,
      height: number,
      depth: number,
    ): void {
      if (target === TEXTURE_2D_ARRAY && internalformat === format) {
        refused.add(this);
        return;
      }
      storage.call(this, target, levels, internalformat, width, height, depth);
    };
    WebGL2RenderingContext.prototype.getError = function patched(
      this: WebGL2RenderingContext,
    ): number {
      if (refused.has(this)) {
        refused.delete(this);
        return INVALID_OPERATION;
      }
      return error.call(this);
    };
  }, COMPRESSED_RED_RGTC1);
}

/**
 * How far the two frames must differ, as a mean luminance over the whole frame.
 *
 * At `CLOSE_VIEW` the nebulae add 0.00234 over the whole frame, twice over on this card,
 * so the bound sits at a little under half the reading. In the fault the frames are the
 * same frame: the textures hold nothing, the march reads 0 and the pass adds no light.
 */
const REFUSED_FORMAT_DIFFERENCE = 0.001;

// The spec's scenario **The nebulae draw where the target refuses a block format**.
//
// A present extension is not proof. Firefox carries `EXT_texture_compression_rgtc` and
// refuses `COMPRESSED_RED_RGTC1` on a `TEXTURE_2D_ARRAY`, so `texStorage3D` fails, the
// texture gets no storage and every volume stays unspecified. The test refuses the
// format itself, in the project that runs the whole suite, so the guard holds on every
// run and a browser that fixes its driver does not make it vacuous.
//
// The reading is **pixels** and not a count. In the fault the records passed the
// selection and the draw calls ran, so every count read correctly while the frame
// carried no nebula.
test('the nebulae draw where the target refuses a block format', async ({ page }) => {
  await refuseBlockFormatOnArray(page);
  await openMap(page, CLOSE_VIEW);

  const on = await withNebulae(page, true, () => meanLuminanceFrame(page));
  const off = await withNebulae(page, false, () => meanLuminanceFrame(page));
  const decodes = await page.evaluate(
    () => performance.getEntriesByName('nebula-decode').length,
  );
  console.log('the refused block format', { on, off, added: on - off, decodes });

  // The positive control: the refusal reached the page and the load decoded every
  // asset, which is the path a refused format takes.
  expect(decodes).toBe(33);
  expect(off).toBeGreaterThan(0);
  expect(on - off).toBeGreaterThan(REFUSED_FORMAT_DIFFERENCE);
});

/** The three extensions the two block formats and BC7 belong to. */
const BLOCK_EXTENSIONS = [
  'WEBGL_compressed_texture_s3tc',
  'EXT_texture_compression_rgtc',
  'EXT_texture_compression_bptc',
];

/** Makes every later navigation of this page refuse the three extensions. */
async function refuseBlockExtensions(page: Page): Promise<void> {
  await page.addInitScript((names: string[]) => {
    const original = WebGL2RenderingContext.prototype.getExtension;
    WebGL2RenderingContext.prototype.getExtension = function patched(
      this: WebGL2RenderingContext,
      name: string,
    ) {
      if (names.includes(name)) return null;
      return (original as (...args: unknown[]) => unknown).call(this, name);
    } as typeof WebGL2RenderingContext.prototype.getExtension;
  }, BLOCK_EXTENSIONS);
}

/** The root mean square difference of two frames, in display units, 0 to 1. */
function frameRmse(first: number[], second: number[]): number {
  let sum = 0;
  let count = 0;
  for (let at = 0; at < first.length; at += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const difference =
        ((first[at + channel] as number) - (second[at + channel] as number)) / 255;
      sum += difference * difference;
      count += 1;
    }
  }
  return Math.sqrt(sum / count);
}

// The spec's scenario **The blocks upload with no decode where the extensions are
// there**.
//
// The development GPU carries both `EXT_texture_compression_rgtc` and
// `WEBGL_compressed_texture_s3tc`, so the blocks reach the card unchanged and the load
// records no decode at all. The same page then refuses all three extensions and loads
// again, which takes the CPU decode, and the two frames are read against each other.
//
// The two paths hand the card different bytes: one the blocks, the other what
// `decodeBC4` and `decodeBC1` made of them. No specification makes a GPU's block decode
// match a TypeScript one bit for bit, so the bound is 0.01 RMSE and not equality.
test('the blocks upload with no decode where the extensions are there', async ({
  page,
}) => {
  const read = async (): Promise<number[]> => {
    await page.evaluate((cursor) => {
      window.__galaxyMap?.setView?.({ cursor, distance: 260, pitch: 0, yaw: 0 });
      window.__galaxyMap?.drawNow?.();
    }, BARNARDS_LOOP);
    return readRect(page, 440, 160, 400, 400);
  };
  const decodes = async (): Promise<number> =>
    page.evaluate(() => performance.getEntriesByName('nebula-decode').length);

  await openMap(page, BRIGHT_VIEW);
  const blockDecodes = await decodes();
  const blockFrame = await read();

  await refuseBlockExtensions(page);
  // A `goto` to the URL the page already holds changes the fragment and loads nothing,
  // so the init script above would never run. The reload is the load it needs, and the
  // four steps after it are what `openMap` does once the page is up.
  await page.reload();
  await waitForReady(page);
  await startState(page);
  await removeHud(page);
  await settleNebulae(page);
  const decodedDecodes = await decodes();
  const decodedFrame = await read();

  const rmse = frameRmse(blockFrame, decodedFrame);
  console.log('the block path against the decoding path', {
    blockDecodes,
    decodedDecodes,
    rmse,
  });

  // The load did no block decode at all on the path this change adds.
  expect(blockDecodes).toBe(0);
  // The positive control: the refusal reached the page and the fallback ran.
  expect(decodedDecodes).toBe(33);
  expect(blockFrame).toHaveLength(400 * 400 * 4);
  // The positive control on the frame itself: the block read is not a black rectangle.
  // A spread of 640,000 arguments overflows the call stack, so the reduce reads it.
  expect(
    blockFrame.reduce((worst, value) => Math.max(worst, value), 0),
  ).toBeGreaterThan(0);
  expect(rmse).toBeLessThan(0.01);
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
// marches the same integral on the CPU, from the `.ktx2` bytes and each record's own
// rotation, through the map's exposure and tone map. A flipped axis, a transposed
// rotation or a mistaken transfer lookup moves the reading and no other test would
// catch it.
//
// The occlusion is held at 0, so the galaxy volume's extinction leaves the reading
// alone and the fixture needs no copy of the volume march. Every other pass is off.
//
// The readings on the hardware renderer are barnards-loop **0.002374** and cats-eye
// **0.003860**, against bounds of 0.02 and 0.01.
//
// **The pre-change pair is 0.0083 and 0.0058**, read while the march sampled 3D
// textures. It is kept here because this change cites the move from that pair to the
// one above as its evidence that the frame improved: the shader's own two-layer mix is
// closer to the trilinear CPU reference than the card's 3D filter was. Overwriting the
// old pair would leave that argument citing figures the tree no longer holds. The
// bounds did not move and neither fixture was regenerated.
//
// `barnards-loop` is the mildest asset in the set; `cats-eye` carries its largest
// negative extinction, -193.5, so it is where the transmittance recurrence shows first.
// Its bound is the pre-change reading rounded up to the next hundredth, as the spec
// asks. A reading above 0.05 means the march is wrong.
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
 * How far the camera turns inside one window, in degrees.
 *
 * The camera orbits, so a window turns it and also carries it sideways. The image of a
 * record therefore moves by more than the turn alone gives, and the block comment below
 * the bound holds the arithmetic. A window reads that move plus any step.
 */
const SWEEP_STEP_DEGREES = 0.004;

/**
 * The largest step the sweep accepts, summed over the three channels on a 0 to 255
 * scale. It is the worst pair this blend reads, 26, rounded up.
 *
 * The bound is not a floor on the camera move: the sweep carries the move as well as any
 * step, and the move alone puts many windows above any figure near its own size. What the
 * bound falsifies is the 71 the ordered blend reads at the same sweep.
 */
const SWEEP_BOUND = 30;

// The spec's scenario **The frame does not step when two records change rank**. It is the
// continuity reading beside the reversed-order test below, which is the one that states
// the requirement. The sweep reads pixels and not time, so it runs in the parallel pass.
//
// The camera orbits the cursor, so a window turns it and also carries it 0.21 light years
// sideways. A record at range `r` therefore moves by `turn * (1 - 3000 / r)`: nothing at
// the cursor's own range, a twentieth of a pixel far beyond it and about a third of a
// pixel at 400 light years. The sweep measures that motion plus any step, never a step
// alone, so its bound is the worst pair this blend reads and not a floor on the motion.
//
// The blend that ordered the records reads a worst pair of 71 at this sweep, at a yaw of
// 54.5 degrees. This blend reads 26, at a yaw of 5 degrees.
//
// The residual is the camera move and not a flip. It falls with the width of the window,
// reading 28 at 0.008 degrees, 19 at 0.004, 15 at 0.002, 6 at 0.001 and 0 at 0, over 180
// windows, and a step at a flip does not shrink with the window. The drawn set holds at
// 87 records over every window, the covered area of 0.011 leaves every budget fade at 1,
// and the step does not fall when the step rate rises to 256, so neither the selection
// nor the fade nor the quadrature is the cause.
//
// The count of windows above the bound is therefore not asserted: 163 of the 720 sit
// above 8 under this blend and 167 under the ordered one, because the motion alone puts
// them there.
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
  expect(report?.worst ?? 765).toBeLessThanOrEqual(SWEEP_BOUND);
});

// The spec's scenario **The frame does not change when the order is reversed**. This is
// the reading with teeth: the sweep above carries the camera move as well as any step,
// and this one carries nothing else. The probe draws the same selection backwards, so
// the two frames differ in the draw order and in nothing at all besides.
//
// The three cameras are the ones the overlap reading uses, from 120 records overlapping
// at 1.18 covered areas down to 87 records at 0.011.
//
// The Orion frame at 3,000 light years, of 87 records, comes back byte for byte
// identical. The frame at 800, of 110 records, differs at 7 pixels of 921,600, and the
// Barnard's Loop frame, of 120 records, at 40, each by 1 of 255 in one channel. The two
// means differ by 4.6e-9 in 0.0432 and by 6.1e-9 in 0.1933.
//
// That is the accumulation target and not the blend: addition in `RGBA16F` is not
// associative, so a sum of 120 terms can land one step of the format either side. Ten
// places of the mean is below what the target carries, and the bound states what it
// does carry: the same frame to one step of the display range, at every pixel.
test('the frame does not change when the order is reversed', async ({ page }) => {
  await openMap(page, '');
  await nebulaeAlone(page);
  expect(
    await page.evaluate(
      () => typeof window.__galaxyMap?.setNebulaOrderReversed === 'function',
    ),
  ).toBe(true);

  for (const camera of OVERLAP_CAMERAS) {
    const report = await page.evaluate((where) => {
      const map = window.__galaxyMap;
      if (map?.readRect === undefined) return null;
      const read = map.readRect;
      const frameAt = (reversed: boolean): Uint8Array => {
        map.setNebulaOrderReversed?.(reversed);
        map.setView?.({
          cursor: where.cursor,
          distance: where.distance,
          pitch: 0,
          yaw: 0,
        });
        map.drawNow?.();
        return read(0, 0, 1280, 720);
      };
      const forward = frameAt(false);
      const backward = frameAt(true);
      map.setNebulaOrderReversed?.(false);
      let worst = 0;
      let differing = 0;
      const meanOf = (bytes: Uint8Array): number => {
        let sum = 0;
        for (let index = 0; index < bytes.length; index += 4) {
          sum +=
            0.2126 * (bytes[index] as number) +
            0.7152 * (bytes[index + 1] as number) +
            0.0722 * (bytes[index + 2] as number);
        }
        return (4 * sum) / (255 * bytes.length);
      };
      for (let at = 0; at < forward.length; at += 4) {
        const difference =
          Math.abs((forward[at] as number) - (backward[at] as number)) +
          Math.abs((forward[at + 1] as number) - (backward[at + 1] as number)) +
          Math.abs((forward[at + 2] as number) - (backward[at + 2] as number));
        if (difference > 0) differing += 1;
        if (difference > worst) worst = difference;
      }
      return {
        forward: meanOf(forward),
        backward: meanOf(backward),
        worst,
        differing,
        drawn: map.nebulaDrawnCount?.() ?? -1,
      };
    }, camera);
    console.log('the reversed order', { camera: camera.name, ...report });

    expect(report).not.toBeNull();
    // The positive control: the camera draws the records the reading is of, and more
    // than one of them, so there is an order to reverse.
    expect(report?.drawn ?? 0, `${camera.name} drew too few records`).toBeGreaterThan(
      1,
    );
    expect(report?.backward ?? -1, `${camera.name} changed with the order`).toBeCloseTo(
      report?.forward ?? -2,
      7,
    );
    // No pixel moves by more than one step of the display range, which is the rounding
    // of the accumulation target and not a change in the frame.
    expect(report?.worst ?? 765, `${camera.name} moved a pixel`).toBeLessThanOrEqual(1);
  }
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
 * The three readings are 0.194194, 0.043239 and 0.038257. The blend that ordered the
 * records read 0.182415, 0.043142 and 0.038236 under the same conditions, so the light
 * is up 6.46 percent at the first camera, 0.23 percent at the second and 0.055 percent
 * at the third. **Those three figures carry two changes and not one**: the order
 * independence and, after it, the move to slice arrays. Almost all of each is the order
 * independence; the paragraph below splits them. A change that raises any of the three
 * by more than a tenth is outside what this capability accepts, and the bound does not
 * move to fit it.
 *
 * The three readings moved when the volumes became slice arrays: they were 0.193286,
 * 0.043158 and 0.038243 while the march read 3D textures, so the move to the array and
 * its own layer interpolation raises the light by 0.47, 0.19 and 0.037 percent. That is
 * two orders under the tenth, and it is a rise and not a fall because the array filter
 * is the more faithful of the two: the CPU fixture comparison of the same march fell
 * from 0.0083 to 0.0024 RMSE on `barnards-loop` and from 0.0058 to 0.0039 on
 * `cats-eye`, so the frame moved towards the trilinear reference and not away from it.
 * The first bound is restated from 0.194; the other two round to the same thousandth
 * they held.
 */
const OVERLAP_CAMERAS = [
  { name: "Barnard's Loop at 120", cursor: BARNARDS_LOOP, distance: 120, bound: 0.195 },
  { name: 'Orion at 800', cursor: ORION_VIEWPOINT, distance: 800, bound: 0.044 },
  { name: 'Orion at 3000', cursor: ORION_VIEWPOINT, distance: 3000, bound: 0.039 },
] as const;

// The cost of the order independence: a record takes no light from another, so the
// frame is brighter where two records overlap. The bound holds that overlap where it was
// measured, and it does not move to fit a change that raises it.
test('the overlap stays inside the light it was measured at', async ({ page }) => {
  await openMap(page, '');
  await nebulaeAlone(page);

  // All three cameras are read before any of them is asserted, so one camera over its
  // bound still leaves the other two readings in the log. A bound that has to be
  // restated is restated from three readings and not from one.
  const readings: { name: string; mean: number; drawn: number; bound: number }[] = [];
  for (const camera of OVERLAP_CAMERAS) {
    const drawn = await page.evaluate((where) => {
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
    readings.push({ name: camera.name, mean, drawn, bound: camera.bound });
  }
  console.log('the overlap light', readings);

  for (const reading of readings) {
    // The positive control: the camera draws the records the reading is of.
    expect(reading.drawn, `${reading.name} drew no record`).toBeGreaterThan(0);
    expect(
      reading.mean,
      `${reading.name} is brighter than its reading`,
    ).toBeLessThanOrEqual(reading.bound);
  }
});

/**
 * Turns off every pass but the nebulae and the density volume, and holds the occlusion
 * at 0 and the light gain at 0.
 *
 * The readings of the range block need a background behind the record: the gain changes
 * the alpha alone, and an alpha over black is black at every gain. The volume is that
 * background. The occlusion at 0 keeps the volume's own extinction out of the record's
 * alpha, and the light gain at 0 keeps the record's emission out of the block, so the
 * frame under the record is the volume times the record's transmittance and nothing
 * else.
 */
async function blockReadingPasses(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__galaxyMap?.setPasses?.({
      volume: true,
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
    const map = window.galaxyMap;
    if (map !== undefined) map.debug.look.nebulaLightGain = [0, 0, 0];
  });
}

/** Writes the two block gains. */
async function setBlockGains(page: Page, near: number, far: number): Promise<void> {
  await page.evaluate(
    (gains) => {
      const map = window.galaxyMap;
      if (map === undefined) return;
      map.debug.look.nebulaBlockGainNear = gains.near;
      map.debug.look.nebulaBlockGainFar = gains.far;
    },
    { near, far },
  );
}

/**
 * The record the range reading stands on, at 59.18 light years. Its nearest neighbour is
 * 8,630 light years away, which is the largest gap in the set for a record over 40 light
 * years. The block a camera reads at its centre therefore holds one record and not a
 * group, and the two cameras below differ in the gain and not in what stands on the ray.
 */
const LONE_RECORD: [number, number, number] = [18041.7, 420.9, 13893.9];

/**
 * Draws one camera on the sight line of a record and reads the share of the background
 * the record leaves, which is the block reading with the nebulae on over the same block
 * with them off.
 *
 * The share and not the luminance, because the two cameras of the range reading stand at
 * different ranges and the volume behind the record is not the same light at both. The
 * share divides that light out, and it is the quantity the gain acts on: the composite
 * multiplies what is behind the record by the record's transmittance.
 */
async function backgroundShare(
  page: Page,
  cursor: [number, number, number],
  distance: number,
  block: number,
): Promise<{ share: number; on: number; off: number; drawn: number }> {
  await page.evaluate(
    (where) => {
      window.__galaxyMap?.setView?.({
        cursor: where.cursor,
        distance: where.distance,
        pitch: 0,
        yaw: 0,
      });
    },
    { cursor, distance },
  );
  // The drawn count is read inside the frame that draws the nebulae, because the frame
  // after it turns them off and would report 0 whatever the view holds.
  const on = await withNebulae(page, true, () =>
    meanLuminanceBlock(page, MIDDLE, block),
  );
  const drawn = await page.evaluate(
    () => window.__galaxyMap?.nebulaDrawnCount?.() ?? -1,
  );
  const off = await withNebulae(page, false, () =>
    meanLuminanceBlock(page, MIDDLE, block),
  );
  return { share: on / off, on, off, drawn };
}

// The spec's scenario **A far nebula blocks more than a near one**. The two cameras sit
// on the sight line of the lone record, one at 400 light years, under the near range of
// 500, and one at 6,500, over the far range of 6,000. The zoom band draws in full below
// 12,000 light years and the record clears the size floor at both, so both cameras carry
// a record weight of exactly 1 and the two readings differ by the gain alone.
//
// Both cameras read a block of 2 pixels at the middle of the frame, which is the record's
// own centre ray. A wider block would read the near camera's 92 pixel image against the
// far camera's 5.7 pixel one, and the far block would carry the sky around the record as
// well as the record. The ray is the same path through the same volume at both, so the
// two readings hold the gain and nothing else.
test('a record beyond the far range blocks more than one inside the near range', async ({
  page,
}) => {
  await openMap(page, '');
  await blockReadingPasses(page);

  const near = await backgroundShare(page, LONE_RECORD, 400, 2);
  const far = await backgroundShare(page, LONE_RECORD, 6500, 2);
  console.log('the range block', { near, far });

  // The positive control: both cameras draw the record the reading is of, and the volume
  // behind it carries light at both.
  expect(near.drawn, 'the near camera drew no record').toBeGreaterThan(0);
  expect(far.drawn, 'the far camera drew no record').toBeGreaterThan(0);
  expect(near.off, 'the near camera has no background').toBeGreaterThan(0.002);
  expect(far.off, 'the far camera has no background').toBeGreaterThan(0.002);

  expect(far.share, 'the far camera blocks no more than the near one').toBeLessThan(
    near.share,
  );
});

// The spec's scenario **A higher gain blocks more at one camera**. One camera, one
// background, and the two gains held equal so the range plays no part: the reading is
// the gain and nothing else.
test('a higher gain blocks more at one camera', async ({ page }) => {
  await openMap(page, '');
  await blockReadingPasses(page);

  await setBlockGains(page, 1, 1);
  const one = await backgroundShare(page, LONE_RECORD, 6500, 8);
  await setBlockGains(page, 2, 2);
  const two = await backgroundShare(page, LONE_RECORD, 6500, 8);
  console.log('the gain block', { one, two });

  expect(one.drawn, 'the camera drew no record').toBeGreaterThan(0);
  expect(one.off, 'the camera has no background').toBeGreaterThan(0.002);
  expect(two.on, 'the gain of 2 blocks no more than the gain of 1').toBeLessThan(
    one.on,
  );
});

/**
 * The sweep of the spec's scenario **The blocking does not step as the camera moves**.
 *
 * The camera stands on the sight line of Barnard's Loop at 200 places between 450 light
 * years, under the near range of 500, and 6,600, over the far range of 6,000. Each place
 * reads a pair of frames, and the two frames of a pair hold the gain the range gives at
 * that place and the gain it gives 1 per cent further out.
 *
 * **The pair holds the camera still and moves the gain alone**, by scaling the two ranges
 * by 1 over 1.01: `smoothstep(near / 1.01, far / 1.01, range)` is `smoothstep(near, far,
 * range * 1.01)`, so the second frame carries the gain of a camera 1 per cent further out
 * and the image of everything else is the image the first frame drew.
 *
 * A pair that also moved the camera reads the move and not the blocking. The move of 1
 * per cent of the range carries the record's marched structure across a bright background,
 * and the worst pair over this sweep reads **410** that way, on the frame the tree drew
 * before this change as well as on the frame it draws now: holding both gains at 1 reads
 * 378 over the same sweep. The step falls with the size of the move, reading 167 at a
 * tenth of it and 22 at a hundredth, so it is the move and not a step. The reading that
 * answers the requirement is the one that removes it.
 */
const BLOCK_SWEEP_WINDOWS = 200;

/** The near end of the block sweep, in light years. It is under the near range of 500. */
const BLOCK_SWEEP_NEAR = 450;

/** The far end of the block sweep, in light years. It is over the far range of 6,000. */
const BLOCK_SWEEP_FAR = 6600;

/** How far apart the two gains of one pair stand, as a share of the range. */
const BLOCK_SWEEP_STEP = 0.01;

/**
 * The largest step the block sweep accepts, summed over the three channels on a 0 to 255
 * scale.
 *
 * The spec states 12. The measured worst is **11**, at 3,058 light years, at one pixel of
 * 518,400, and the bound is that reading rounded up. The gain runs from 0.7 to 2.0 over
 * the sweep, so 1 per cent of the range moves it by about 0.011 at the steepest place,
 * and the pixels that carry the reading are the ones where the galactic core stands
 * behind the record: a tenth of a per cent of a very bright background is several counts.
 * A gain that stepped would read the whole change of the gain at one pair, which is two
 * orders above this.
 */
const BLOCK_SWEEP_BOUND = 12;

test('the blocking does not step as the camera moves', async ({ page }) => {
  await openMap(page, '');
  await blockReadingPasses(page);

  const report = await page.evaluate(
    (sweep) => {
      const map = window.__galaxyMap;
      const look = window.galaxyMap?.debug.look;
      if (map?.readRect === undefined || look === undefined) return null;
      const read = map.readRect;
      const frameAt = (distance: number, scale: number): Uint8Array => {
        look.nebulaBlockNear = sweep.blockNear / scale;
        look.nebulaBlockFar = sweep.blockFar / scale;
        map.setView?.({
          cursor: [624.4, -425.9, -1229.5],
          distance,
          pitch: 0,
          yaw: 0,
        });
        map.drawNow?.();
        return read(sweep.left, 0, sweep.height, sweep.height);
      };
      const ratio = Math.pow(sweep.far / sweep.near, 1 / (sweep.windows - 1));
      let worst = 0;
      let worstAt = 0;
      let drawn = 0;
      for (let index = 0; index < sweep.windows; index += 1) {
        const distance = sweep.near * Math.pow(ratio, index);
        const first = frameAt(distance, 1);
        const second = frameAt(distance, 1 + sweep.step);
        drawn = map.nebulaDrawnCount?.() ?? -1;
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
          worstAt = distance;
        }
      }
      return { worst, worstAt, drawn };
    },
    {
      near: BLOCK_SWEEP_NEAR,
      far: BLOCK_SWEEP_FAR,
      windows: BLOCK_SWEEP_WINDOWS,
      step: BLOCK_SWEEP_STEP,
      blockNear: DEFAULT_NEBULA_BLOCK_NEAR,
      blockFar: DEFAULT_NEBULA_BLOCK_FAR,
      left: 280,
      height: 720,
    },
  );
  console.log('the block sweep', { ...report, windows: BLOCK_SWEEP_WINDOWS });

  expect(report).not.toBeNull();
  // The positive control: the camera draws the record the sweep walks past.
  expect(report?.drawn ?? 0, 'the sweep drew no record').toBeGreaterThan(0);
  expect(report?.worst ?? 765).toBeLessThanOrEqual(BLOCK_SWEEP_BOUND);
});

/**
 * Turns off every pass but the nebulae and one sprite pass, and holds the occlusion at 0
 * and the light gain at 0.
 *
 * The sprite passes draw after the nebula composite, so the reading is the sprite light
 * alone: the volume and the clouds are off, and the record adds no emission of its own.
 * What is left in the block is the point cloud or the star field, multiplied by the
 * record's transmittance where the gate opens.
 */
async function spriteReadingPasses(
  page: Page,
  sprite: 'points' | 'stars',
): Promise<void> {
  await page.evaluate((which) => {
    window.__galaxyMap?.setPasses?.({
      volume: false,
      clouds: false,
      points: which === 'points',
      stars: which === 'stars',
      glow: false,
      grid: false,
      regions: false,
      shapes: false,
      systems: false,
      nebulae: true,
    });
    window.__galaxyMap?.setNebulaOcclusion?.(0);
    const map = window.galaxyMap;
    if (map !== undefined) map.debug.look.nebulaLightGain = [0, 0, 0];
  }, sprite);
}

/**
 * The dark record of `DARK_VIEW`, at 88.93 light years, with the camera 1,200 light
 * years from its centre. It draws 46 pixels across its radius there, so the block at the
 * middle of the frame lies inside it, and its front range of about 1,111 light years is
 * beyond the handover, so the point cloud behind it carries its full light.
 */
const DENSE_RECORD_VIEW = {
  cursor: [-10642.7, 629.4, 17776.7] as [number, number, number],
  distance: 1200,
  pitch: 0,
  yaw: 0,
};

/** Draws one view and reads the mean luminance of a block with the nebulae on and off. */
async function spriteBlock(
  page: Page,
  view: typeof DENSE_RECORD_VIEW,
  point: { x: number; y: number },
  block: number,
): Promise<{ on: number; off: number; drawn: number }> {
  await page.evaluate((where) => window.__galaxyMap?.setView?.(where), view);
  // The drawn count is read inside the frame that draws the nebulae, because the frame
  // after it turns them off and would report 0 whatever the view holds.
  const on = await withNebulae(page, true, () =>
    meanLuminanceBlock(page, point, block),
  );
  const drawn = await page.evaluate(
    () => window.__galaxyMap?.nebulaDrawnCount?.() ?? -1,
  );
  const off = await withNebulae(page, false, () =>
    meanLuminanceBlock(page, point, block),
  );
  return { on, off, drawn };
}

// The spec's scenario **A star behind a nebula dims**. The point cloud draws after the
// nebula composite, so before this change the record took none of its light away.
test('the point cloud dims behind a nebula', async ({ page }) => {
  await openMap(page, '');
  await spriteReadingPasses(page, 'points');

  const reading = await spriteBlock(page, DENSE_RECORD_VIEW, MIDDLE, 32);
  console.log('the point cloud block', reading);

  // The positive control: the record draws, and the point cloud carries light there.
  expect(reading.drawn, 'the view drew no record').toBeGreaterThan(0);
  expect(reading.off, 'the block holds no point cloud light').toBeGreaterThan(0.002);
  expect(reading.on, 'the record took no light from the point cloud').toBeLessThan(
    reading.off,
  );
});

/**
 * The view of the spec's scenario **A star in front of the nearest nebula keeps its
 * light**. The camera stands 6,000 light years over the disc and looks straight down, so
 * every sight line crosses the disc once and leaves the model. The point cloud samples in
 * the two blocks the test reads therefore sit at about 6,000 light years, and the nearest
 * record above the size floor sits at 8,043, so the pass reports a front range of about
 * 7,964 and the gate stays shut over both blocks.
 *
 * The record is 26 degrees off the view axis, inside the frame, so the second block the
 * test reads is the one the record covers. The reading is not the record missing the
 * block: it is the gate holding the sprites in front of the record at their full light.
 */
const IN_FRONT_VIEW = {
  cursor: [6000, 0, 10750] as [number, number, number],
  distance: 6000,
  pitch: 89,
  yaw: 0,
};

/** The record that sets the front range at `IN_FRONT_VIEW`, at 78.59 light years. */
const IN_FRONT_RECORD: [number, number, number] = [2889.1, -1212.2, 12480.5];

/**
 * The least front range `IN_FRONT_VIEW` may report for the reading to mean what it says.
 * The geometry gives 7,964 light years, and the block at the middle reads samples out to
 * about 6,030. A smaller reading means a record entered the set and the two blocks are no
 * longer in front of it.
 */
const IN_FRONT_LEAST = 7000;

test('a sprite in front of the nearest nebula keeps its light', async ({ page }) => {
  await openMap(page, '');
  await spriteReadingPasses(page, 'points');

  const where = await page.evaluate(
    (view) => {
      window.__galaxyMap?.setView?.(view.camera);
      window.__galaxyMap?.drawNow?.();
      return {
        drawn: window.__galaxyMap?.nebulaDrawnCount?.() ?? -1,
        range: window.__galaxyMap?.nebulaSpriteRange?.() ?? [0, 0],
        pixel: window.__galaxyMap?.project?.(view.record) ?? { x: -1, y: -1 },
      };
    },
    { camera: IN_FRONT_VIEW, record: IN_FRONT_RECORD },
  );
  console.log('the front range', where);

  // The positive control: the record draws, it is inside the frame, and the front range
  // is the one the geometry gives.
  expect(where.drawn, 'the view drew no record').toBeGreaterThan(0);
  expect(
    where.range[0],
    'the front range is not the one the view gives',
  ).toBeGreaterThan(IN_FRONT_LEAST);
  expect(where.pixel.x, 'the record is off the frame').toBeGreaterThan(0);
  expect(where.pixel.x, 'the record is off the frame').toBeLessThan(1280);
  expect(where.pixel.y, 'the record is off the frame').toBeGreaterThan(0);
  expect(where.pixel.y, 'the record is off the frame').toBeLessThan(720);

  const middle = await spriteBlock(page, IN_FRONT_VIEW, MIDDLE, 120);
  const under = await spriteBlock(page, IN_FRONT_VIEW, where.pixel, 60);
  console.log('the blocks in front of the record', { middle, under });

  expect(middle.off, 'the middle block holds no point cloud light').toBeGreaterThan(
    0.002,
  );
  expect(under.off, 'the record block holds no point cloud light').toBeGreaterThan(
    0.002,
  );
  expect(middle.on, 'the middle block changed').toBeCloseTo(middle.off, 6);
  expect(under.on, 'the block the record covers changed').toBeCloseTo(under.off, 6);
});

/**
 * The view of the spec's scenario **The star field dims with the point cloud**. The camera
 * stands 300 light years from the dark record of `DARK_VIEW`, which draws 185 pixels
 * across its radius there. The field covers a sphere of 480 light years at that zoom, and
 * the front range is 211, so the gate opens over the far half of the field.
 *
 * The close fade is held at 1, because the field carries no light below a zoom distance of
 * 640 light years and the record must be close for the field to reach past it.
 */
const STAR_BLOCK_VIEW = {
  cursor: [-10642.7, 629.4, 17776.7] as [number, number, number],
  distance: 300,
  pitch: 0,
  yaw: 0,
};

test('the star field dims behind a nebula', async ({ page }) => {
  await openMap(page, '');
  await spriteReadingPasses(page, 'stars');
  await page.evaluate(() => window.__galaxyMap?.setCloseFade?.(1));

  const reading = await spriteBlock(page, STAR_BLOCK_VIEW, MIDDLE, 200);
  console.log('the star field block', reading);

  expect(reading.drawn, 'the view drew no record').toBeGreaterThan(0);
  expect(reading.off, 'the block holds no star light').toBeGreaterThan(0.002);
  expect(reading.on, 'the record took no light from the star field').toBeLessThan(
    reading.off,
  );
});

/** The default view, at 60,000 light years, which is over the zoom band. */
const ABOVE_THE_BAND = {
  cursor: [0, 0, 0] as [number, number, number],
  distance: 60000,
  pitch: 35,
  yaw: 0,
};

// The spec's scenario **The frame before does not leak into a frame with no nebula**. The
// transmittance target holds the last frame that drew a record, so a frame that draws
// none must read no texture at all and not the one that is still there.
test('the frame before does not leak into a frame with no nebula', async ({ page }) => {
  await openMap(page, '');
  await spriteReadingPasses(page, 'points');

  const alone = await spriteBlock(page, ABOVE_THE_BAND, MIDDLE, 120);
  const blocking = await spriteBlock(page, DENSE_RECORD_VIEW, MIDDLE, 32);
  const after = await spriteBlock(page, ABOVE_THE_BAND, MIDDLE, 120);
  console.log('the stale frame', { alone, blocking, after });

  // The positive control: the frame between the two draws a record and blocks the cloud,
  // so there is a transmittance to leak.
  expect(blocking.drawn, 'the frame between drew no record').toBeGreaterThan(0);
  expect(blocking.on, 'the frame between blocked nothing').toBeLessThan(blocking.off);
  expect(alone.drawn, 'the view over the band drew a record').toBe(0);
  expect(alone.off, 'the view over the band holds no light').toBeGreaterThan(0.002);
  expect(after.on, 'the frame before leaked into it').toBeCloseTo(alone.on, 6);
});
