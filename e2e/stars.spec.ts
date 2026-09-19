import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { boxelSeed, starOffsets, starSpreadValue } from '../src/scene-data/boxel';
import { meanLuminanceFrame, openMap, settleLabels } from './helpers';
import type { SystemRecordInput } from '../src/scene-data/real-systems';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

/** The close view at Sol, at the zoom distance the map stopped at before this change. */
const CLOSE_SOL = '#c=0,0,0&d=500&p=35&y=0';
/** The same close view at the galactic centre, which is the densest ground. */
const CLOSE_CENTRE = '#c=15,0,25895&d=500&p=35&y=0';
/** The closest zoom at Sol. */
const CLOSEST_SOL = '#c=0,0,0&d=10&p=35&y=0';
/** The zoom distance at which the field has its worst fill. */
const WIDE_SOL = '#c=0,0,0&d=4000&p=35&y=0';
/** The bound the star pass holds to at every view. */
const STAR_VERTEX_COUNT = 475136;

/** Draws one frame and waits for it. */
async function drawFrame(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    window.__galaxyMap?.drawNow?.();
  });
}

/**
 * Holds the close fade at a value, or gives it back to the zoom distance with `null`.
 * The readings below open a view at 500 light years of zoom distance, where the fade
 * holds the invented field at no light, so they hold the fade at 1 to read the field.
 */
async function setCloseFade(
  page: import('@playwright/test').Page,
  value: number | null,
): Promise<void> {
  await page.evaluate((next) => {
    window.__galaxyMap?.setCloseFade?.(next);
    window.__galaxyMap?.drawNow?.();
  }, value);
}

/**
 * The mean absolute difference per colour byte between the frame with the star pass on
 * and the frame with it off, in 0 to 1. It reads the drawing buffer rather than a
 * screenshot, so the label overlay does not reach the reading.
 */
async function meanPixelDifference(
  page: import('@playwright/test').Page,
): Promise<number> {
  return page.evaluate(() => {
    const map = window.__galaxyMap;
    if (map?.readRect === undefined || map.setPasses === undefined) return 0;
    const canvas = document.getElementById('map');
    if (!(canvas instanceof HTMLCanvasElement)) return 0;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    map.setPasses({ stars: true });
    const withStars = map.readRect(0, 0, width, height);
    map.setPasses({ stars: false });
    const withoutStars = map.readRect(0, 0, width, height);
    map.setPasses({ stars: true });
    let total = 0;
    for (let index = 0; index < withStars.length; index += 1) {
      total += Math.abs((withStars[index] as number) - (withoutStars[index] as number));
    }
    return total / withStars.length / 255;
  });
}

/** Switches passes and draws a frame. */
async function setPasses(
  page: import('@playwright/test').Page,
  passes: Record<string, boolean>,
): Promise<void> {
  await page.evaluate((next) => {
    window.__galaxyMap?.setPasses?.(next);
    window.__galaxyMap?.drawNow?.();
  }, passes);
}

/** The brightest pixel of the frame and the mean of the four corner pixels. */
async function frameExtremes(
  page: import('@playwright/test').Page,
): Promise<{ bright: number; corners: number }> {
  return page.evaluate(() => {
    const map = window.__galaxyMap;
    if (map?.readRect === undefined) return { bright: 0, corners: 0 };
    const canvas = document.getElementById('map');
    if (!(canvas instanceof HTMLCanvasElement)) return { bright: 0, corners: 0 };
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const bytes = map.readRect(0, 0, width, height);
    let bright = 0;
    for (let index = 0; index < bytes.length; index += 4) {
      const value =
        (0.2126 * (bytes[index] as number) +
          0.7152 * (bytes[index + 1] as number) +
          0.0722 * (bytes[index + 2] as number)) /
        255;
      if (value > bright) bright = value;
    }
    let corners = 0;
    for (const [x, y] of [
      [2, 2],
      [width - 3, 2],
      [2, height - 3],
      [width - 3, height - 3],
    ]) {
      const [red, green, blue] = map.readPixel?.(x as number, y as number) ?? [0, 0, 0];
      corners += (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    }
    return { bright, corners: corners / 4 };
  });
}

/**
 * The grain of a block at the centre of the frame: the standard deviation of each
 * pixel's luminance less the mean of its 3 x 3 neighbourhood, over the mean luminance
 * of the block.
 */
async function centreGrain(
  page: import('@playwright/test').Page,
  size: number,
): Promise<number> {
  return page.evaluate((block) => {
    const map = window.__galaxyMap;
    if (map?.readRect === undefined) return -1;
    const canvas = document.getElementById('map');
    if (!(canvas instanceof HTMLCanvasElement)) return -1;
    // The rectangle reaches one pixel beyond the measured block, so every measured
    // pixel has a full 3 x 3 neighbourhood.
    const side = block + 2;
    const left = Math.round(canvas.clientWidth / 2) - side / 2;
    const top = Math.round(canvas.clientHeight / 2) - side / 2;
    const bytes = map.readRect(left, top, side, side);
    if (bytes.length !== side * side * 4) {
      throw new Error('the grain measure wants one device pixel per CSS pixel');
    }
    const luminance = new Float64Array(side * side);
    for (let index = 0; index < luminance.length; index += 1) {
      const byte = index * 4;
      luminance[index] =
        (0.2126 * (bytes[byte] as number) +
          0.7152 * (bytes[byte + 1] as number) +
          0.0722 * (bytes[byte + 2] as number)) /
        255;
    }
    let mean = 0;
    let variance = 0;
    let count = 0;
    for (let y = 1; y < side - 1; y += 1) {
      for (let x = 1; x < side - 1; x += 1) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            sum += luminance[(y + dy) * side + x + dx] as number;
          }
        }
        const value = luminance[y * side + x] as number;
        const residual = value - sum / 9;
        variance += residual * residual;
        mean += value;
        count += 1;
      }
    }
    mean /= count;
    variance /= count;
    return Math.sqrt(variance) / mean;
  }, size);
}

/** Reads a shader source file from the tree. */
function shaderSource(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../src/render/shaders/${name}`, import.meta.url)),
    'utf8',
  );
}

test('the star shaders compile', async ({ page }) => {
  await openMap(page);
  const error = await page.evaluate(
    (sources) => {
      const compile = window.__galaxyMap?.compileTestProgram;
      if (compile === undefined) return 'the page has no compile hook';
      return compile(sources.vertex, sources.fragment);
    },
    { vertex: shaderSource('stars.vert'), fragment: shaderSource('stars.frag') },
  );
  expect(error).toBeNull();
});

test('the field alone rises above the background', async ({ page }) => {
  await openMap(page, CLOSE_SOL);
  await setCloseFade(page, 1);
  // The nebula band has no near end, so a record draws at 500 light years and its
  // sprite is a bright patch. This reading is about the field alone, so it goes off
  // with every other pass that does not belong to the field.
  await setPasses(page, {
    volume: false,
    clouds: false,
    nebulae: false,
    glow: false,
    points: false,
    regions: false,
    stars: true,
  });
  const withStars = await frameExtremes(page);
  await setPasses(page, { stars: false });
  const withoutStars = await frameExtremes(page);
  console.log('the field alone', { withStars, withoutStars });

  expect(withStars.bright - withStars.corners).toBeGreaterThanOrEqual(0.05);
  expect(withoutStars.bright - withoutStars.corners).toBeLessThan(0.01);
});

test('the field adds no light at the close zoom distances', async ({ page }) => {
  // No hold this time: at 500 light years of zoom distance the close fade is 0, so the
  // field adds nothing and the frame is the background alone.
  await openMap(page, CLOSE_SOL);
  await setPasses(page, {
    volume: false,
    clouds: false,
    nebulae: false,
    glow: false,
    points: false,
    regions: false,
    stars: true,
  });
  const reading = await frameExtremes(page);
  console.log('the field at the close zoom distance', reading);

  expect(Math.abs(reading.bright - reading.corners)).toBeLessThan(0.01);
});

test('the field has grain', async ({ page }) => {
  await openMap(page, CLOSE_SOL);
  // The region overlay draws at every zoom under 30,000 light years now, so a test that
  // reads an absolute pixel and does not read the overlay turns the overlay off.
  await setPasses(page, { regions: false });
  await setCloseFade(page, 1);
  const grain = await centreGrain(page, 120);
  console.log('the field grain', grain);
  expect(grain).toBeGreaterThan(0.04);
});

test('the switch removes the field', async ({ page }) => {
  await openMap(page, CLOSE_SOL);
  await setCloseFade(page, 1);
  await setPasses(page, {
    volume: false,
    clouds: false,
    nebulae: false,
    glow: false,
    points: false,
    regions: false,
    stars: true,
  });
  const withStars = await meanLuminanceFrame(page);
  await setPasses(page, { stars: false });
  const withoutStars = await meanLuminanceFrame(page);
  const background = (await frameExtremes(page)).corners;
  console.log('the stars switch', { withStars, withoutStars, background });

  expect(withStars - withoutStars).toBeGreaterThanOrEqual(0.002);
  expect(Math.abs(withoutStars - background)).toBeLessThan(0.005);
});

test('the bound holds at every view', async ({ page }) => {
  await openMap(page, CLOSE_SOL);

  const readCounts = async (
    fragment: string,
  ): Promise<{ vertices: number; drawn: number }> => {
    await page.evaluate((where) => {
      const parts = new URLSearchParams(where.slice(1));
      window.__galaxyMap?.setView?.({
        cursor: (parts.get('c') ?? '0,0,0').split(',').map(Number) as [
          number,
          number,
          number,
        ],
        distance: Number(parts.get('d') ?? 500),
        pitch: Number(parts.get('p') ?? 35),
        yaw: Number(parts.get('y') ?? 0),
      });
      window.__galaxyMap?.drawNow?.();
    }, fragment);
    return page.evaluate(() => ({
      vertices: window.__galaxyMap?.starVertexCount?.() ?? -1,
      drawn: window.__galaxyMap?.starDrawnCount?.() ?? -1,
    }));
  };

  const views = [
    CLOSE_SOL,
    '#c=0,0,0&d=1000&p=35&y=0',
    WIDE_SOL,
    CLOSE_CENTRE,
    '#c=15,0,25895&d=1000&p=35&y=0',
    '#c=15,0,25895&d=4000&p=35&y=0',
  ];
  const counts: { vertices: number; drawn: number }[] = [];
  for (const view of views) counts.push(await readCounts(view));
  console.log('star counts', counts);

  for (const count of counts) {
    expect(count.vertices).toBe(STAR_VERTEX_COUNT);
    expect(count.drawn).toBeLessThanOrEqual(STAR_VERTEX_COUNT);
  }
  // Every boxel at the galactic centre is capped at the two closest zooms.
  expect(counts[3]?.drawn).toBe(STAR_VERTEX_COUNT);
  expect(counts[4]?.drawn).toBe(STAR_VERTEX_COUNT);
  // At 4,000 light years the coarsest class reaches above the disc, where the model
  // holds no density and a boxel draws no star.
  expect(counts[5]?.drawn).toBeGreaterThanOrEqual(300000);
  expect(counts[5]?.drawn).toBeLessThan(STAR_VERTEX_COUNT);
  expect(counts[0]?.drawn).toBeGreaterThan(200000);
  expect(counts[0]?.drawn).toBeLessThan(400000);
});

/**
 * A digest of the drawing buffer. An element screenshot of `#map` captures the page
 * clipped to the canvas box, so it carries the label overlay as well, and the place of a
 * label depends on the frames drawn before it: an anchor carried from the frame before
 * takes half of the gap to the middle of its region rather than all of it. Two routes to one
 * view therefore give the same drawn frame and a label a few CSS pixels apart. These
 * comparisons are about the drawn frame, so they read the canvas alone, as
 * `e2e/regions.spec.ts` does. The comparison is of the digest and not of the image, so a
 * failure prints a line and not a megabyte of base64.
 */
async function canvasDigest(page: import('@playwright/test').Page): Promise<string> {
  const image = await page.evaluate(() => {
    const canvas = document.getElementById('map');
    if (!(canvas instanceof HTMLCanvasElement)) return '';
    return canvas.toDataURL('image/png');
  });
  return createHash('sha256').update(image).digest('hex');
}

test('the same view gives the same frame by any route', async ({ page }) => {
  await openMap(page, CLOSE_SOL);
  await setCloseFade(page, 1);
  await drawFrame(page);
  const direct = await canvasDigest(page);

  await openMap(page, '#c=4000,0,4000&d=8000&p=35&y=0');
  await setCloseFade(page, 1);
  await page.evaluate(() => {
    window.__galaxyMap?.setView?.({
      cursor: [0, 0, 0],
      distance: 500,
      yaw: 0,
      pitch: 35,
    });
    window.__galaxyMap?.drawNow?.();
  });
  const reached = await canvasDigest(page);

  expect(reached).toBe(direct);
});

test('the invented field goes as the camera comes in', async ({ page }) => {
  const views = [
    '#c=0,0,0&d=2560&p=35&y=0',
    '#c=0,0,0&d=1280&p=35&y=0',
    '#c=0,0,0&d=640&p=35&y=0',
    CLOSEST_SOL,
  ];
  const differences: number[] = [];
  const pairs: [string, string][] = [];
  for (const where of views) {
    await openMap(page, where);
    await setPasses(page, { stars: true });
    const withStars = await canvasDigest(page);
    differences.push(await meanPixelDifference(page));
    await setPasses(page, { stars: false });
    const withoutStars = await canvasDigest(page);
    pairs.push([withStars, withoutStars]);
  }
  console.log('the close fade', differences);

  expect(differences[0] as number).toBeGreaterThan(differences[1] as number);
  expect(differences[1] as number).toBeGreaterThan(differences[2] as number);
  expect(differences[2] as number).toBe(0);
  // The close fade is 0 at 640 light years and below, so the field adds no light at
  // either of the last two views and each frame with the pass on is the frame with it
  // off, byte for byte.
  expect(differences[3] as number).toBe(0);
  for (const index of [2, 3]) {
    const pair = pairs[index] as [string, string];
    expect(pair[1], `the view ${views[index]}`).toBe(pair[0]);
  }
});

test('the point cloud does not take the faded light back', async ({ page }) => {
  // The densest close view. A point cloud sample handed the field's light would show
  // here as a saturated block.
  await openMap(page, CLOSE_CENTRE);
  await setPasses(page, {
    volume: false,
    clouds: false,
    glow: false,
    points: true,
    stars: false,
  });
  const faded = await page.locator('#map').screenshot();
  await setCloseFade(page, 1);
  const held = await page.locator('#map').screenshot();

  expect(Buffer.compare(faded, held)).toBe(0);
});

test('the far view is unchanged', async ({ page }) => {
  await openMap(page);
  await drawFrame(page);
  const withStars = await page.locator('#map').screenshot();
  await setPasses(page, { stars: false });
  const withoutStars = await page.locator('#map').screenshot();

  expect(Buffer.compare(withStars, withoutStars)).toBe(0);
});

test('the handover keeps the light', async ({ page }) => {
  await openMap(page, WIDE_SOL);
  await drawFrame(page);
  const withStars = await meanLuminanceFrame(page);
  await setPasses(page, { stars: false });
  const withoutStars = await meanLuminanceFrame(page);
  console.log('the handover', { withStars, withoutStars });

  expect(Math.abs(withStars - withoutStars)).toBeLessThanOrEqual(0.02);
});

test('the shader hash matches the hash on the CPU', async ({ page }) => {
  await openMap(page);

  // The shader places a star from the boxel seed and the star index. The test runs the
  // same three mixing steps on the card, reads the top 24 bits back as three bytes,
  // and compares them with `starOffsets`. GLSL ES 3.00 wraps an unsigned multiply to
  // the low 32 bits, and this is the check that the card does so.
  const seed = boxelSeed([2499, 2049, 1205], 1);
  const readComponent = async (component: number): Promise<number[]> =>
    page.evaluate(
      (job) => {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const gl = canvas.getContext('webgl2');
        if (gl === null) return [];
        const vertexSource = `#version 300 es
precision highp float;
void main() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); gl_PointSize = 16.0; }`;
        const fragmentSource = `#version 300 es
precision highp float;
uniform uint uSeed;
uniform int uComponent;
out vec4 fragColour;
uint mixBits(uint value) {
  uint bits = value;
  bits = (bits ^ (bits >> 16u)) * 0x7feb352du;
  bits = (bits ^ (bits >> 15u)) * 0x846ca68bu;
  return bits ^ (bits >> 16u);
}
void main() {
  uint star = uint(gl_FragCoord.y - 0.5) * 16u + uint(gl_FragCoord.x - 0.5);
  uint first = mixBits(uSeed + star * 0x9e3779b1u);
  uint second = mixBits(first ^ 0x68bc21ebu);
  uint third = mixBits(second ^ 0x02e5be93u);
  uint fourth = mixBits(third ^ 0x7fb5d329u);
  uint chosen = uComponent == 0 ? first
      : (uComponent == 1 ? second : (uComponent == 2 ? third : fourth));
  uint bits = chosen >> 8u;
  fragColour = vec4(
    float((bits >> 16u) & 255u) / 255.0,
    float((bits >> 8u) & 255u) / 255.0,
    float(bits & 255u) / 255.0,
    1.0);
}`;
        const compile = (type: number, source: string): WebGLShader => {
          const shader = gl.createShader(type) as WebGLShader;
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
            throw new Error(gl.getShaderInfoLog(shader) ?? 'no log');
          }
          return shader;
        };
        const program = gl.createProgram() as WebGLProgram;
        gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
        gl.linkProgram(program);
        if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
          throw new Error(gl.getProgramInfoLog(program) ?? 'no log');
        }
        gl.useProgram(program);
        gl.uniform1ui(gl.getUniformLocation(program, 'uSeed'), job.seed);
        gl.uniform1i(gl.getUniformLocation(program, 'uComponent'), job.component);
        gl.viewport(0, 0, 16, 16);
        gl.drawArrays(gl.POINTS, 0, 1);
        const pixels = new Uint8Array(16 * 16 * 4);
        gl.readPixels(0, 0, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        return Array.from(pixels);
      },
      { seed, component },
    );

  let mismatches = 0;
  for (let component = 0; component < 4; component += 1) {
    const pixels = await readComponent(component);
    expect(pixels.length).toBe(16 * 16 * 4);
    for (let star = 0; star < 256; star += 1) {
      const base = star * 4;
      const drawn =
        ((pixels[base] as number) << 16) |
        ((pixels[base + 1] as number) << 8) |
        (pixels[base + 2] as number);
      // The first three values place the star; the fourth shapes its brightness.
      const value =
        component === 3
          ? starSpreadValue(seed, star)
          : (starOffsets(seed, star)[component] as number);
      const wanted = Math.round(value * 16777216);
      if (drawn !== wanted) mismatches += 1;
    }
  }
  console.log('hash mismatches', mismatches, 'of 1024');
  expect(mismatches).toBe(0);
});

/**
 * The camera position of a view at yaw 0 and pitch 35, in game coordinates. The
 * suppression rule works in the base size class, and the base class block stands around
 * the camera and not around the cursor, so a test that wants suppression puts its
 * systems here. The block reaches at most 2 base edges past the camera, which is 40
 * light years at a zoom distance of 500 and 80 at 1,000, while the cursor is a whole
 * zoom distance away.
 */
function cameraOf(
  cursor: [number, number, number],
  distance: number,
): [number, number, number] {
  // `cameraPosition` of src/camera/projection.ts, at yaw 0. The test writes the two
  // terms out rather than importing the module, because the module reaches the model
  // parameters and the Playwright loader reads no image file.
  const pitch = (35 * Math.PI) / 180;
  return [
    cursor[0],
    cursor[1] + Math.sin(pitch) * distance,
    cursor[2] - Math.cos(pitch) * distance,
  ];
}

/**
 * Adds one category and `count` systems inside a radius of a point, through the handle.
 * The marker pass stays on, so a reading that times a frame pays for the markers as
 * well. A reading that must not see a marker switches the pass off itself.
 */
async function addSystemsAround(
  page: import('@playwright/test').Page,
  centre: [number, number, number],
  count: number,
  radius: number,
): Promise<number> {
  return page.evaluate(
    (where) => {
      const map = window.galaxyMap;
      if (map === undefined) return -1;
      map.addCategories([{ name: 'Empire', color: [153, 230, 255] }]);
      // A fixed generator, so every run adds the same systems.
      let state = 12345;
      const unit = (): number => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
      };
      const records: SystemRecordInput[] = [];
      for (let index = 0; index < where.count; index += 1) {
        records.push({
          name: `S${index}`,
          coords: {
            x: (where.centre[0] as number) + (unit() * 2 - 1) * where.radius,
            y: (where.centre[1] as number) + (unit() * 2 - 1) * where.radius,
            z: (where.centre[2] as number) + (unit() * 2 - 1) * where.radius,
          },
          primaryCategory: 'Empire',
        });
      }
      map.addSystems(records);
      return map.systemCount();
    },
    { centre, count, radius },
  );
}

test('a frame reports the suppressed count', async ({ page }) => {
  await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
  await drawFrame(page);
  const empty = await page.evaluate(
    () => window.__galaxyMap?.starSuppressedCount?.() ?? -1,
  );

  const added = await addSystemsAround(page, cameraOf([0, 0, 0], 1000), 2000, 80);
  await drawFrame(page);
  const loaded = await page.evaluate(
    () => window.__galaxyMap?.starSuppressedCount?.() ?? -1,
  );
  console.log('the suppressed count', { empty, added, loaded });

  expect(added).toBe(2000);
  expect(empty).toBe(0);
  expect(loaded).toBeGreaterThan(0);
});

test('systems lower the sum and not the bound', async ({ page }) => {
  await openMap(page, CLOSE_SOL);
  await drawFrame(page);
  const before = await page.evaluate(() => ({
    vertices: window.__galaxyMap?.starVertexCount?.() ?? -1,
    drawn: window.__galaxyMap?.starDrawnCount?.() ?? -1,
  }));

  await addSystemsAround(page, cameraOf([0, 0, 0], 500), 2000, 80);
  await drawFrame(page);
  const after = await page.evaluate(() => ({
    vertices: window.__galaxyMap?.starVertexCount?.() ?? -1,
    drawn: window.__galaxyMap?.starDrawnCount?.() ?? -1,
  }));
  console.log('the sum and the bound', { before, after });

  expect(before.vertices).toBe(STAR_VERTEX_COUNT);
  expect(after.vertices).toBe(STAR_VERTEX_COUNT);
  expect(after.drawn).toBeLessThan(before.drawn);
});

test('loading systems does not change the galaxy brightness', async ({ page }) => {
  // The close fade is 0.79 at 2,000 light years, so the field carries most of its light.
  await openMap(page, '#c=0,0,0&d=2000&p=35&y=0');
  await setPasses(page, { systems: false });
  const before = await meanLuminanceFrame(page);

  await addSystemsAround(page, cameraOf([0, 0, 0], 2000), 2000, 160);
  await setPasses(page, { systems: false });
  const after = await meanLuminanceFrame(page);
  console.log('the galaxy brightness', { before, after });

  expect(Math.abs(before - after)).toBeLessThanOrEqual(0.002);
});

test('the same view gives the same frame with systems loaded', async ({ page }) => {
  await openMap(page, CLOSE_SOL);
  await addSystemsAround(page, cameraOf([0, 0, 0], 500), 500, 120);
  await setCloseFade(page, 1);
  await drawFrame(page);
  const direct = await canvasDigest(page);

  await openMap(page, '#c=4000,0,4000&d=8000&p=35&y=0');
  await addSystemsAround(page, cameraOf([0, 0, 0], 500), 500, 120);
  await setCloseFade(page, 1);
  await page.evaluate(() => {
    window.__galaxyMap?.setView?.({
      cursor: [0, 0, 0],
      distance: 500,
      yaw: 0,
      pitch: 35,
    });
    window.__galaxyMap?.drawNow?.();
  });
  const reached = await canvasDigest(page);

  expect(reached).toBe(direct);
});

test('a real system stays when the invented field goes', async ({ page }) => {
  for (const where of ['#c=0,0,0&d=640&p=35&y=0', CLOSEST_SOL]) {
    await openMap(page, where);
    await page.evaluate(() => {
      const map = window.galaxyMap;
      if (map === undefined) return;
      map.addCategories([{ name: 'Empire', color: [153, 230, 255] }]);
      map.addSystems([
        { name: 'Sol', coords: { x: 0, y: 0, z: 0 }, primaryCategory: 'Empire' },
      ]);
      map.debug.drawNow();
    });

    const pixel = await page.evaluate(() => {
      const map = window.galaxyMap;
      if (map === undefined) return [0, 0, 0, 0];
      const screen = map.debug.project([0, 0, 0]);
      return map.debug.readPixel(screen.x, screen.y);
    });
    console.log(`the marker at the view ${where}`, pixel);
    for (let channel = 0; channel < 3; channel += 1) {
      const wanted = [153, 230, 255][channel] as number;
      expect(Math.abs((pixel[channel] as number) - wanted)).toBeLessThanOrEqual(2);
    }

    // The region label walks back to the middle of its region after the camera jumps.
    // The two pictures must hold the same scene, so the walk has to end first.
    await settleLabels(page);
    await setPasses(page, { stars: true });
    const withStars = await page.locator('#map').screenshot();
    await setPasses(page, { stars: false });
    const withoutStars = await page.locator('#map').screenshot();
    expect(Buffer.compare(withStars, withoutStars), `the view ${where}`).toBe(0);
  }
});

test('a camera move stays inside the frame budget', async ({ page }) => {
  // The view sits at 1,000 light years, so the base class is 2 and a base boxel at Sol
  // places 243 stars rather than 30. The sweep then tests eight times as many stars.
  await openMap(page, '#c=0,0,0&d=1000&p=35&y=0');
  await addSystemsAround(page, cameraOf([0, 0, 0], 1000), 10000, 600);

  const stats = await page.evaluate(async () => {
    const map = window.galaxyMap;
    if (map === undefined) return { frames: 0, meanMs: 0, worstMs: 1e9 };
    map.debug.resetFrameStats();
    for (let step = 1; step <= 40; step += 1) {
      map.setView({ cursor: [step * 5, 0, 0] });
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    }
    return map.debug.frameStats();
  });
  console.log('the pan', stats);

  expect(stats.frames).toBeGreaterThan(30);
  expect(stats.worstMs).toBeLessThan(20);
});

test('a base class change costs one slow frame at most', async ({ page }) => {
  // The zoom starts at 500 and not at 300, because the field reads the effective zoom
  // distance, which holds at 640 light years below that. The boundary at 320 is inside
  // the reachable range now that the zoom goes to 10, but the field does not cross it.
  // The sweep crosses 640, 1,280 and 2,560.
  await openMap(page, '#c=0,0,0&d=500&p=35&y=0');
  await addSystemsAround(page, cameraOf([0, 0, 0], 500), 10000, 600);

  const stats = await page.evaluate(async () => {
    const map = window.galaxyMap;
    if (map === undefined) return { frames: 0, meanMs: 0, worstMs: 1e9 };
    map.debug.resetFrameStats();
    const steps = 50;
    for (let step = 1; step <= steps; step += 1) {
      map.setView({ distance: 500 + ((3000 - 500) * step) / steps });
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    }
    return map.debug.frameStats();
  });
  console.log('the zoom', stats);

  expect(stats.frames).toBeGreaterThan(40);
  expect(stats.worstMs).toBeLessThan(50);
});

/**
 * The zoom distances the hold on the effective distance is read at. The field's boxel
 * table is the same at all four only while the hold stands.
 */
const HOLD_DISTANCES = [10, 100, 320, 640];

test('the drawn field does not change below 640', async ({ page }) => {
  await openMap(page, CLOSE_SOL);

  // The drawn boxel list is camera-relative, so the camera has to hold one position
  // while the zoom changes. The cursor therefore moves back along the camera direction
  // by the zoom distance, which leaves the camera at Sol at every reading.
  const readCounts = async (
    distance: number,
  ): Promise<{ vertices: number; drawn: number }> => {
    await page.evaluate((zoom) => {
      const pitch = 35;
      const radians = (pitch * Math.PI) / 180;
      // `cameraPosition` in src/camera/projection.ts puts the camera at
      // `cursor + direction * distance`, and at a yaw of 0 the direction is
      // `[0, sin(pitch), -cos(pitch)]`.
      const direction: [number, number, number] = [
        0,
        Math.sin(radians),
        -Math.cos(radians),
      ];
      window.__galaxyMap?.setView?.({
        cursor: [-direction[0] * zoom, -direction[1] * zoom, -direction[2] * zoom] as [
          number,
          number,
          number,
        ],
        distance: zoom,
        yaw: 0,
        pitch,
      });
      window.__galaxyMap?.drawNow?.();
    }, distance);
    return page.evaluate(() => ({
      vertices: window.__galaxyMap?.starVertexCount?.() ?? -1,
      drawn: window.__galaxyMap?.starDrawnCount?.() ?? -1,
    }));
  };

  const counts: { vertices: number; drawn: number }[] = [];
  for (const distance of HOLD_DISTANCES) counts.push(await readCounts(distance));
  console.log('the held field', { distances: HOLD_DISTANCES, counts });

  // The drawn count is the reading that moves. It is the sum over the drawn boxels, so
  // it changes as soon as the base size class steps and the field draws another list.
  const at640 = counts[counts.length - 1] as { vertices: number; drawn: number };
  expect(at640.drawn).toBeGreaterThan(0);
  expect(at640.drawn).toBeLessThan(STAR_VERTEX_COUNT);
  for (let index = 0; index < counts.length; index += 1) {
    const count = counts[index] as { vertices: number; drawn: number };
    expect(count.vertices, `at ${HOLD_DISTANCES[index]} light years`).toBe(
      at640.vertices,
    );
    expect(count.drawn, `at ${HOLD_DISTANCES[index]} light years`).toBe(at640.drawn);
  }
});
