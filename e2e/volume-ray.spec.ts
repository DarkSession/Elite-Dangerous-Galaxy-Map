// The volume pass must draw the same picture for the same camera, and a small step of
// the camera must move the picture by a small amount. The sweeps below read the mean
// luminance of the top band of the frame, which holds the galactic core at this view,
// and they read it after each step of the zoom, the yaw, the pitch and the near plane.
//
// The galactic centre projects off the screen at 1280 x 720 at this view, so the frame
// is 1600 x 1000 and the measure reads a band rather than the projected centre.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openMap } from './helpers';

test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });

/** The view the reader reported. */
const VIEW = '#c=-4.15271,-50.71937,-152.73213&d=146.35196&p=34.56875&y=19.66992';

/** The same camera at the zoom distance the near plane sweep reads. */
const CLOSE_VIEW = '#c=-4.15271,-50.71937,-152.73213&d=19.4&p=34.56875&y=19.66992';

/** How many rows of the top of the frame the measure reads. */
const BAND_ROWS = 30;

/** The largest step the scenarios allow between two neighbouring readings. */
const STEP_BOUND = 0.002;

/** What one sweep moves. */
type Field = 'distance' | 'yaw' | 'pitch' | 'near';

/** The values of one sweep, from the first to the last. */
function steps(from: number, to: number, step: number): number[] {
  const count = Math.round((to - from) / step);
  return Array.from({ length: count + 1 }, (_, index) => from + index * step);
}

/** The largest difference between two neighbouring readings. */
function worstStep(readings: number[]): number {
  let worst = 0;
  for (let index = 1; index < readings.length; index += 1) {
    worst = Math.max(
      worst,
      Math.abs((readings[index] as number) - (readings[index - 1] as number)),
    );
  }
  return worst;
}

/** The largest distance from the first reading. */
function worstDrift(readings: number[]): number {
  const first = readings[0] as number;
  return Math.max(...readings.map((reading) => Math.abs(reading - first)));
}

/** Draws the volume pass alone, so the measure reads the volume and nothing over it. */
async function volumeAlone(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__galaxyMap?.setPasses?.({
      volume: true,
      clouds: false,
      nebulae: false,
      points: false,
      stars: false,
      glow: false,
      regions: false,
      shapes: false,
      systems: false,
      grid: false,
    });
    window.__galaxyMap?.drawNow?.();
  });
}

/**
 * Sets one field, draws, and reads the mean luminance of the top band, once for each
 * value. The loop runs inside the page: a sweep of 201 steps that crossed the protocol
 * twice per step would spend most of its time waiting.
 */
async function sweepBand(
  page: Page,
  field: Field,
  values: number[],
): Promise<number[]> {
  const readings = await page.evaluate(
    (run) => {
      const map = window.__galaxyMap;
      if (map?.readRect === undefined) return [];
      const canvas = document.getElementById('map');
      if (!(canvas instanceof HTMLCanvasElement)) return [];
      // Every hook is optional, and the calls below reach them through optional
      // chaining. A renamed hook would therefore set nothing and leave the view where
      // it is. Every reading would then be the same, and the near plane test asserts
      // that the reading does not move. The check fails the sweep instead.
      if (
        typeof map.setView !== 'function' ||
        typeof map.setNearPlane !== 'function' ||
        typeof map.drawNow !== 'function' ||
        typeof map.readRect !== 'function'
      ) {
        throw new Error(
          'the page holds no setView, setNearPlane, drawNow or readRect hook',
        );
      }
      const out: number[] = [];
      for (const value of run.values) {
        if (run.field === 'near') map.setNearPlane?.(value);
        else if (run.field === 'distance') map.setView?.({ distance: value });
        else if (run.field === 'yaw') map.setView?.({ yaw: value });
        else map.setView?.({ pitch: value });
        map.drawNow?.();
        const bytes = map.readRect(0, 0, canvas.clientWidth, run.rows);
        let sum = 0;
        for (let index = 0; index < bytes.length; index += 4) {
          sum +=
            0.2126 * (bytes[index] as number) +
            0.7152 * (bytes[index + 1] as number) +
            0.0722 * (bytes[index + 2] as number);
        }
        out.push((4 * sum) / (255 * bytes.length));
      }
      return out;
    },
    { field, values, rows: BAND_ROWS },
  );
  expect(readings.length, `the ${field} sweep read no frame`).toBe(values.length);
  // A band that holds no light reads the same value at every step and would pass the
  // bound while measuring nothing.
  expect(readings[0] as number, `the ${field} sweep reads a dark band`).toBeGreaterThan(
    0.1,
  );
  return readings;
}

test('zooming does not step the volume picture', async ({ page }) => {
  await openMap(page, VIEW);
  await volumeAlone(page);

  const readings = await sweepBand(page, 'distance', steps(19.0, 20.0, 0.005));
  const worst = worstStep(readings);
  console.log('zoom sweep', {
    steps: readings.length,
    low: Math.min(...readings),
    high: Math.max(...readings),
    worst,
  });

  expect(worst).toBeLessThanOrEqual(STEP_BOUND);
});

test('orbiting does not step the volume picture', async ({ page }) => {
  await openMap(page, VIEW);
  await volumeAlone(page);

  const yaw = await sweepBand(page, 'yaw', steps(19.0, 20.0, 0.005));
  const worstYaw = worstStep(yaw);
  console.log('yaw sweep', {
    steps: yaw.length,
    low: Math.min(...yaw),
    high: Math.max(...yaw),
    worst: worstYaw,
  });

  await page.evaluate(() => window.__galaxyMap?.setView?.({ yaw: 19.66992 }));
  const pitch = await sweepBand(page, 'pitch', steps(34.0, 35.0, 0.005));
  const worstPitch = worstStep(pitch);
  console.log('pitch sweep', {
    steps: pitch.length,
    low: Math.min(...pitch),
    high: Math.max(...pitch),
    worst: worstPitch,
  });

  expect(worstYaw).toBeLessThanOrEqual(STEP_BOUND);
  expect(worstPitch).toBeLessThanOrEqual(STEP_BOUND);
});

test('the near plane alone changes no light', async ({ page }) => {
  await openMap(page, CLOSE_VIEW);
  await volumeAlone(page);

  // The camera stays where it is and the near plane alone moves. The near plane sets
  // clipping and nothing else the volume pass reads, so every reading is the first one.
  const readings = await sweepBand(page, 'near', steps(1.0, 10.0, 0.1));
  const drift = worstDrift(readings);
  console.log('near plane sweep', {
    steps: readings.length,
    low: Math.min(...readings),
    high: Math.max(...readings),
    drift,
  });

  expect(drift).toBeLessThanOrEqual(STEP_BOUND);
});
