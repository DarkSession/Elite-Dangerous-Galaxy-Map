// The nebulae drawn in Firefox.
//
// The Firefox project reads the card and one paint time. It read no drawn frame, and a
// fault that drew no nebula at all in Firefox passed every Chromium test: the browser
// carries `EXT_texture_compression_rgtc` and refuses `COMPRESSED_RED_RGTC1` on a
// `TEXTURE_2D_ARRAY`, so `texStorage3D` failed and every volume stayed unspecified.
//
// The reading is **pixels** and not a count. In that fault the records passed the
// selection and the draw calls ran, so `nebulaDrawnCount` read correctly while the frame
// carried no nebula. This spec therefore reads the frame with the nebulae on and again
// with them off, and asserts the two differ.
//
// It compares two frames it takes itself, in the one browser, so it needs no committed
// baseline image and takes no screenshot of its own. The `browser-suite` capability
// holds the one baseline to Chromium, and `tests/browser-suite.test.ts` reads every spec
// this project runs and fails on a screenshot comparison in any of them.
//
// `e2e/nebulae.spec.ts` holds the Chromium readings, which this project must not take.
// The guard that the decode path draws is there, because it refuses the format itself
// and does not need a browser to keep the fault.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { meanLuminanceFrame, openMap } from './helpers';
import { CLOSE_VIEW } from './nebula-views';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

/**
 * How far the two frames must differ, as a mean luminance over the whole frame.
 *
 * At `CLOSE_VIEW` Barnard's Loop fills much of the frame. The bound is the one
 * `e2e/nebulae.spec.ts` holds for the same view, and it sits well under the reading of
 * either browser. In the fault the two frames are the same frame, because the march
 * reads 0 and the pass adds no light.
 */
const NEBULA_FRAME_DIFFERENCE = 0.001;

/** Draws one frame with the nebula switch at a value and reads the whole frame. */
async function frameWithNebulae(page: Page, on: boolean): Promise<number> {
  await page.evaluate((value) => {
    window.__galaxyMap?.setPasses?.({ nebulae: value });
    window.__galaxyMap?.drawNow?.();
  }, on);
  return meanLuminanceFrame(page);
}

/**
 * Which path this browser took, and which format it accepts on which target.
 *
 * It is a diagnostic and **not** an assertion. The requirement is the probe, not the
 * answer one browser gives on one day: a browser that later accepts the format takes the
 * fast path and this spec still holds. A reader of the run learns the answer for the
 * browser in front of them rather than trusting a date.
 *
 * `decodes` is the path the map took: 0 is the block path and 33 is the decode path.
 * Each format reads the `getError` of a throwaway allocation, where 0 is `NO_ERROR`.
 */
async function pathReport(page: Page): Promise<{
  decodes: number;
  extensions: string[];
  formats: Record<string, number>;
}> {
  return page.evaluate(() => {
    const decodes = performance.getEntriesByName('nebula-decode').length;
    const gl = document.createElement('canvas').getContext('webgl2');
    const formats: Record<string, number> = {};
    const extensions: string[] = [];
    if (gl === null) return { decodes, extensions, formats };
    const rgtc = gl.getExtension('EXT_texture_compression_rgtc') as {
      COMPRESSED_RED_RGTC1_EXT: number;
    } | null;
    const s3tc = gl.getExtension('WEBGL_compressed_texture_s3tc') as {
      COMPRESSED_RGB_S3TC_DXT1_EXT: number;
    } | null;
    if (rgtc !== null) extensions.push('EXT_texture_compression_rgtc');
    if (s3tc !== null) extensions.push('WEBGL_compressed_texture_s3tc');
    const read = (what: string, format: number, array: boolean): void => {
      const target = array ? gl.TEXTURE_2D_ARRAY : gl.TEXTURE_2D;
      const texture = gl.createTexture();
      gl.bindTexture(target, texture);
      for (let drained = 0; drained < 32; drained += 1) {
        if (gl.getError() === gl.NO_ERROR) break;
      }
      if (array) gl.texStorage3D(target, 1, format, 4, 4, 1);
      else gl.texStorage2D(target, 1, format, 4, 4);
      formats[what] = gl.getError();
      gl.deleteTexture(texture);
    };
    if (rgtc !== null) {
      read('BC4 on TEXTURE_2D', rgtc.COMPRESSED_RED_RGTC1_EXT, false);
      read('BC4 on TEXTURE_2D_ARRAY', rgtc.COMPRESSED_RED_RGTC1_EXT, true);
    }
    if (s3tc !== null) {
      read('BC1 on TEXTURE_2D', s3tc.COMPRESSED_RGB_S3TC_DXT1_EXT, false);
      read('BC1 on TEXTURE_2D_ARRAY', s3tc.COMPRESSED_RGB_S3TC_DXT1_EXT, true);
    }
    return { decodes, extensions, formats };
  });
}

// The spec's scenario **The nebulae draw in Firefox**.
test('the nebulae draw', async ({ page }) => {
  await openMap(page, CLOSE_VIEW);

  const on = await frameWithNebulae(page, true);
  const off = await frameWithNebulae(page, false);
  const report = await pathReport(page);
  console.log('the nebula frame', { on, off, added: on - off, ...report });

  // The positive control: the frame carries light with the nebulae off as well.
  expect(off).toBeGreaterThan(0);
  expect(on - off).toBeGreaterThan(NEBULA_FRAME_DIFFERENCE);
});
