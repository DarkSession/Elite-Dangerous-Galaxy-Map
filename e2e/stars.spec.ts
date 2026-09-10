import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { boxelSeed, starOffsets, starSpreadValue } from '../src/scene-data/boxel';
import { meanLuminanceFrame, openMap } from './helpers';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

/** The closest zoom at Sol. */
const CLOSE_SOL = '#c=0,0,0&d=500&p=35&y=0';
/** The closest zoom at the galactic centre. */
const CLOSE_CENTRE = '#c=15,0,25895&d=500&p=35&y=0';
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
  await setPasses(page, {
    volume: false,
    clouds: false,
    glow: false,
    points: false,
    stars: true,
  });
  const withStars = await frameExtremes(page);
  await setPasses(page, { stars: false });
  const withoutStars = await frameExtremes(page);
  console.log('the field alone', { withStars, withoutStars });

  expect(withStars.bright - withStars.corners).toBeGreaterThanOrEqual(0.05);
  expect(withoutStars.bright - withoutStars.corners).toBeLessThan(0.01);
});

test('the field has grain', async ({ page }) => {
  await openMap(page, CLOSE_SOL);
  const grain = await centreGrain(page, 120);
  console.log('the field grain', grain);
  expect(grain).toBeGreaterThan(0.04);
});

test('the switch removes the field', async ({ page }) => {
  await openMap(page, CLOSE_SOL);
  await setPasses(page, {
    volume: false,
    clouds: false,
    glow: false,
    points: false,
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

// The two frames are element screenshots of `#map`, which capture the page clipped to
// the canvas box, so they also carry the label overlay. Both routes end at the same
// view, so the labels are identical and only the drawn frame is under test. A test that
// compares two different views this way would compare the labels as well; read the
// canvas alone with `toDataURL` for that, as `e2e/regions.spec.ts` does.
test('the same view gives the same frame by any route', async ({ page }) => {
  await openMap(page, CLOSE_SOL);
  await drawFrame(page);
  const direct = await page.locator('#map').screenshot();

  await openMap(page, '#c=4000,0,4000&d=8000&p=35&y=0');
  await page.evaluate(() => {
    window.__galaxyMap?.setView?.({
      cursor: [0, 0, 0],
      distance: 500,
      yaw: 0,
      pitch: 35,
    });
    window.__galaxyMap?.drawNow?.();
  });
  const reached = await page.locator('#map').screenshot();

  expect(Buffer.compare(direct, reached)).toBe(0);
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
