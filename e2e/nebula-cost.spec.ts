// The cost readings of the nebula volumes: the decode, the budget, the box and the
// vertex march.
//
// The spec is in the timed pass of `scripts/e2e.mjs`, on one worker. Every test here
// reads a frame interval and asserts on it, and a reading taken beside five other
// browsers is not the reading the budget states.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openMap } from './helpers';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

/**
 * Barnard's Loop, the largest record in the set at 200 light years across the radius.
 * Every view below that names a cursor puts it there.
 */
const BARNARDS_LOOP: [number, number, number] = [624.4, -425.9, -1229.5];

/** Barnard's Loop at a zoom inside the band, where it draws about 21 CSS pixels. */
const BRIGHT_VIEW = '#c=624.4,-425.9,-1229.5&d=6000&p=35&y=0';

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

// The decode reading of this change. The volumes arrive as `.dds` blocks and the loader
// decodes them on the main thread, one asset a task, so the cost is paid once, after the
// first frame. The map waits on nothing, so a decode that held a frame would show as a
// long frame and in no other way.
//
// `loadNebulaVolumes` records each asset's decode under `nebula-decode`, so the reading
// below is of the decode alone and not of the start work around it. The readings on the
// hardware renderer are 16.9 ms for all 33 assets together and 2.3 ms for the worst one,
// over a fetch of 75 ms for the 66 files. 2.64 MiB of blocks expand to 6.03 MiB once,
// after the first frame. No single task reaches the frame budget, so the decode stays on
// the main thread.
test('the volume decode holds the frame budget', async ({ page }) => {
  await openMap(page, BRIGHT_VIEW);
  const report = await page.evaluate(() => {
    const entries = performance.getEntriesByName('nebula-decode');
    const durations = entries.map((entry) => entry.duration);
    const volumes = performance
      .getEntriesByType('resource')
      .filter((entry) => entry.name.endsWith('.dds')) as PerformanceResourceTiming[];
    const first = Math.min(...volumes.map((entry) => entry.startTime));
    const last = Math.max(...volumes.map((entry) => entry.responseEnd));
    return {
      attached: window.__galaxyMap?.nebulaeAttached?.() ?? false,
      files: volumes.length,
      assets: entries.length,
      fetchMs: last - first,
      decodeMs: durations.reduce((sum, value) => sum + value, 0),
      worstAssetMs: Math.max(0, ...durations),
    };
  });
  console.log('the volume decode', report);

  expect(report.attached).toBe(true);
  // The positive control: the 66 volumes were fetched and all 33 assets were decoded.
  expect(report.files).toBe(66);
  expect(report.assets).toBe(33);
  // The frame budget of `far-view-rendering`, which is 60 frames a second. One asset's
  // decode is one task, so this is what one frame pays. Above it the decode moves to a
  // worker.
  expect(report.worstAssetMs).toBeLessThan(16.7);
});

// The budget reading of this change. The camera sits at the centre of Barnard's Loop,
// which is the largest record in the set at 200 light years, so its covered area is
// capped at one screen and the records behind it are what fill the rest.
//
// The readings on the hardware renderer are 120 records drawn, a covered area of 1.56
// screen areas against a budget of 4, a dropped count of 0, and a mean frame of 1.25 ms
// against the 16.7 ms budget of `far-view-rendering`. `e2e/frame-budget.spec.ts` reads
// the same three over every camera its 16 views visit, at 1,920 by 1,080.
test('a near view holds the budget', async ({ page }) => {
  await openMap(page, '');
  const report = await page.evaluate((cursor) => {
    window.__galaxyMap?.setView?.({ cursor, distance: 20, pitch: 0, yaw: 0 });
    window.__galaxyMap?.drawNow?.();
    return {
      drawn: window.__galaxyMap?.nebulaDrawnCount?.() ?? -1,
      aboveFloor: window.__galaxyMap?.nebulaAboveFloorCount?.() ?? -1,
      coveredArea: window.__galaxyMap?.nebulaCoveredArea?.() ?? -1,
      meanMs: window.__galaxyMap?.measureFrames?.(120) ?? Number.POSITIVE_INFINITY,
    };
  }, BARNARDS_LOOP);
  console.log('the near view', report);

  expect(report.drawn).toBeGreaterThan(0);
  // The selection stops at the budget by construction, so the covered area can never
  // read above it. What the reading shows is that the committed record file does not
  // reach the budget at a camera the suite visits, which is the dropped count.
  expect(report.aboveFloor - report.drawn).toBe(0);
  expect(report.coveredArea).toBeLessThan(4);
  expect(report.meanMs).toBeLessThan(16.7);
});

// The box is drawn with the front faces culled, so a camera inside it still gets
// fragments and a camera outside it gets one layer and not two. The failure this guards
// is the back faces drawing as well as the front, which doubles the fragments.
//
// The readings on the hardware renderer are 0.614 ms outside and 0.655 ms inside, a
// difference of 6 percent, under the 20 percent bound.
test('the box costs the same from inside as from outside', async ({ page }) => {
  await openMap(page, '');
  await nebulaeAlone(page);

  // Barnard's Loop is 200 light years across the radius. At 260 light years the box
  // covers the whole frame from outside it, and at 120 the camera is inside it.
  const read = async (distance: number): Promise<number> =>
    page.evaluate(
      (where) => {
        window.__galaxyMap?.setView?.({
          cursor: where.cursor,
          distance: where.distance,
          pitch: 0,
          yaw: 0,
        });
        window.__galaxyMap?.drawNow?.();
        return window.__galaxyMap?.measureFrames?.(120) ?? Number.POSITIVE_INFINITY;
      },
      { cursor: BARNARDS_LOOP, distance },
    );

  const outside = await read(260);
  const inside = await read(120);
  const share = Math.abs(inside - outside) / Math.max(inside, outside);
  console.log('the box cost', { outside, inside, share });

  expect(outside).toBeGreaterThan(0);
  expect(inside).toBeGreaterThan(0);
  expect(share).toBeLessThan(0.2);
});

// The vertex stage's share of the pass cost. Each box marches the galaxy's volume from
// the camera to its centre, 36 times over, so the cost grows with the record count and
// not with the frame's area. Holding the occlusion at 0 makes that march early-out at its
// first line and leaves everything else in place, so the difference is the march.
//
// The share is a difference of two frame means, and the instrument cannot resolve it.
// Chrome clamps `performance.now()` to 100 microseconds, the frame of 76 small records
// runs 0.64 ms, and the march is about 40 microseconds of it. The two conditions
// therefore alternate inside one page call, nine times over 60 frames each, and the test
// pools the two sums over 540 frames each. Even so the pooled share moves from -1.5 to
// +6.8 percent run to run for the same frame, and the nine per-pair ratios spread over
// 0.2 to 0.46. Frame-by-frame alternation over 300 pairs reads the same noise, so more
// samples do not help.
//
// What the readings support is a bound and not a figure: the march does not move the
// pass mean by a quarter. A march that had grown to a quarter of the pass would read far
// outside this noise and fail. The tenth the design asks about is inside it, so
// `design.md` records that the question is open at the tenth and answered at the quarter.
test('the vertex march is a small share of the pass', async ({ page }) => {
  await openMap(page, '');

  const read = async (view: {
    cursor: [number, number, number];
    distance: number;
  }): Promise<{
    shares: number[];
    drawn: number;
    withTotal: number;
    withoutTotal: number;
  }> =>
    page.evaluate((where) => {
      window.__galaxyMap?.setPasses?.({
        clouds: false,
        points: false,
        stars: false,
        glow: false,
        grid: false,
        regions: false,
        shapes: false,
        systems: false,
        volume: true,
        nebulae: true,
      });
      window.__galaxyMap?.setView?.({
        cursor: where.cursor,
        distance: where.distance,
        pitch: 0,
        yaw: 0,
      });
      window.__galaxyMap?.drawNow?.();
      const drawn = window.__galaxyMap?.nebulaDrawnCount?.() ?? -1;
      const shares: number[] = [];
      let withTotal = 0;
      let withoutTotal = 0;
      for (let round = 0; round < 9; round += 1) {
        window.__galaxyMap?.setNebulaOcclusion?.(1);
        const withMarch = window.__galaxyMap?.measureFrames?.(60) ?? 0;
        window.__galaxyMap?.setNebulaOcclusion?.(0);
        const without = window.__galaxyMap?.measureFrames?.(60) ?? 0;
        withTotal += withMarch;
        withoutTotal += without;
        shares.push((withMarch - without) / withMarch);
      }
      return { shares, drawn, withTotal, withoutTotal };
    }, view);

  // Sol at 6,000 light years draws many small records; Barnard's Loop at 260 draws one
  // that covers the frame.
  const frames = [
    {
      what: 'many small',
      cursor: [0, 0, 0] as [number, number, number],
      distance: 6000,
    },
    {
      what: 'one large',
      cursor: BARNARDS_LOOP,
      distance: 260,
    },
  ];
  for (const frame of frames) {
    const { shares, drawn, withTotal, withoutTotal } = await read(frame);
    // The pooled share: the difference of the two sums over 540 frames each, which is
    // what the drift cancels out of. The nine ratios print beside it as the spread, so a
    // run where the drift is worse than usual is visible.
    const pooled = (withTotal - withoutTotal) / withTotal;
    const spread = Math.max(...shares) - Math.min(...shares);
    console.log(`the vertex march, ${frame.what}`, { shares, pooled, spread, drawn });

    expect(drawn).toBeGreaterThan(0);
    expect(withTotal).toBeGreaterThan(0);
    expect(withoutTotal).toBeGreaterThan(0);
    expect(pooled, `${frame.what} pays too much in the vertex stage`).toBeLessThan(
      0.25,
    );
  }
});
