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

// The decode reading of this change. The volumes arrive as `.ktx2` arrays of BC4 and
// BC1 blocks, and what happens next depends on the context.
//
// Where it carries both `EXT_texture_compression_rgtc` and
// `WEBGL_compressed_texture_s3tc` the blocks reach the card unchanged and there is no
// decode at all, which is the point of this change. Where it carries fewer than both,
// the upload decodes on the main thread, one asset a task, so the cost is paid once,
// after the first frame. The map waits on nothing, so a decode that held a frame would
// show as a long frame and in no other way.
//
// `createNebulaVolumeTextures` records each asset's two decodes under `nebula-decode`,
// and the mark covers the decode alone: the upload of that asset runs after the mark
// closes. Before this change the readings on the hardware renderer were 16.9 ms for all
// 33 assets together and 2.3 ms for the worst one, and 2.64 MiB of blocks expanded to
// 6.03 MiB. The development GPU carries both extensions, so it now reads 0 on both.
//
// This test reads the path the development GPU takes, which is the block path, so its
// decode assertions pass because there is no decode. **It is not the guard on the
// fallback**: `the fallback decode is one task` below refuses the two extensions and
// reads that path on purpose.
test('the volume decode holds the frame budget', async ({ page }) => {
  await openMap(page, BRIGHT_VIEW);
  const report = await page.evaluate(() => {
    const entries = performance.getEntriesByName('nebula-decode');
    const durations = entries.map((entry) => entry.duration);
    const volumes = performance
      .getEntriesByType('resource')
      .filter((entry) => entry.name.endsWith('.ktx2')) as PerformanceResourceTiming[];
    const first = Math.min(...volumes.map((entry) => entry.startTime));
    const last = Math.max(...volumes.map((entry) => entry.responseEnd));
    const probe = document.createElement('canvas').getContext('webgl2');
    return {
      attached: window.__galaxyMap?.nebulaeAttached?.() ?? false,
      // Whether this context takes the block path, which needs both extensions.
      blocks:
        probe?.getExtension('EXT_texture_compression_rgtc') != null &&
        probe?.getExtension('WEBGL_compressed_texture_s3tc') != null,
      files: volumes.length,
      assets: entries.length,
      fetchMs: last - first,
      decodeMs: durations.reduce((sum, value) => sum + value, 0),
      worstAssetMs: Math.max(0, ...durations),
    };
  });
  console.log('the volume decode', report);

  expect(report.attached).toBe(true);
  // The positive control: the 66 volumes were fetched.
  expect(report.files).toBe(66);
  // No decode at all on the block path, and one task an asset on the other.
  expect(report.assets).toBe(report.blocks ? 0 : 33);
  // The frame budget of `far-view-rendering`, which is 60 frames a second. One asset's
  // decode is one task, so this is what one frame pays. Above it the decode moves to a
  // worker.
  expect(report.worstAssetMs).toBeLessThan(16.7);
});

// The guard on the fallback path, which the test above cannot see.
//
// The development GPU carries both compressed-texture extensions, so every other test
// in this file takes the block path and reads no decode at all. This one refuses the
// two extensions, which is what a GPU that carries ETC or ASTC rather than S3TC and
// RGTC gives, and reads what that path costs.
//
// **The reading is a statement of fact and not a budget met.** All 33 assets decode
// inside one synchronous `createNebulaVolumeTextures` call, because the choice between
// the two paths needs a context and `NebulaSource.loadVolumes` takes none. Before the
// volumes became slice arrays the decode sat in the loader, one asset a task, and the
// worst task was 2.3 ms against the 16.7 ms frame budget. It is now one task of the
// whole sum, which straddles that budget on this card and would be several times worse
// on a phone. `src/render/nebula-volumes.ts` records why it cannot sit in the loader
// any more, and the task list of `store-nebula-volumes-as-slice-arrays` records the
// regression for the owner.
//
// The assertion is therefore on the **sum** and not on the per-asset worst, because the
// sum is what one task costs. Four readings on this card give 15.0, 16.5, 17.5 and 17.6
// ms for the sum and 1.8 to 2.9 ms for the worst single asset, so the one task straddles
// the 16.7 ms frame budget and the 33 decodes inside it do not. The spread is 16 percent
// of the reading, so the bound is the worst of the four plus a quarter, at 22 ms. It is
// a ratchet against the decode growing, not a promise that the frame budget holds.
const FALLBACK_DECODE_MS = 22;

test('the fallback decode is one task', async ({ page }) => {
  await page.addInitScript(
    (names: string[]) => {
      const original = WebGL2RenderingContext.prototype.getExtension;
      WebGL2RenderingContext.prototype.getExtension = function patched(
        this: WebGL2RenderingContext,
        name: string,
      ) {
        if (names.includes(name)) return null;
        return (original as (...args: unknown[]) => unknown).call(this, name);
      } as typeof WebGL2RenderingContext.prototype.getExtension;
    },
    ['WEBGL_compressed_texture_s3tc', 'EXT_texture_compression_rgtc'],
  );

  await openMap(page, BRIGHT_VIEW);
  const report = await page.evaluate(() => {
    const durations = performance
      .getEntriesByName('nebula-decode')
      .map((entry) => entry.duration);
    return {
      attached: window.__galaxyMap?.nebulaeAttached?.() ?? false,
      assets: durations.length,
      sumMs: durations.reduce((sum, value) => sum + value, 0),
      worstAssetMs: Math.max(0, ...durations),
    };
  });
  console.log('the fallback decode', report);

  // The positive control: the refusal reached the page and every asset decoded.
  expect(report.attached).toBe(true);
  expect(report.assets).toBe(33);
  // The sum, because all 33 decodes run in one task. The frame budget is 16.7 ms and
  // this reading is above it; the comment above says why and who decides.
  expect(report.sumMs).toBeLessThan(FALLBACK_DECODE_MS);
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

// The cost bound of the requirement **The march filters the third axis itself**.
//
// A `TEXTURE_2D_ARRAY` does not filter across layers, so the march reads two layers a
// sample and mixes them itself: four volume fetches a step instead of two, in the
// fragment stage, which is where the pass spends its time. The bound is 1.5 times the
// baseline the tree read before the shader changed, and the change does not land if a
// camera misses it.
//
// The conditions are the requirement's own: every other pass off, the nebula occlusion
// at 0, 1,280 by 720, the timed pass on one worker, and the median of five runs of 120
// frames. A sweep of nine distances from Barnard's Loop ranked 120 light years the most
// expensive camera of the set and 60 the next; the proposal carries the ranking.
//
// The bounds below are absolutes and not a ratio the test computes, so the test and the
// spec cannot disagree. They are figures of one card. Whenever a recorded baseline
// differs from the reading in hand, the rule is to restate both here and in the spec.
//
// The baselines, taken on this card on the tree that still drew from the 3D textures,
// are 0.523 ms at 60 light years, 0.512 at 120 and 0.485 at 260. The bounds are 1.5
// times those three, rounded down to two places.
//
// Two indicative figures come before those: 0.655 ms at 120 light years and 0.614 at
// 260, which `the box costs the same from inside as from outside` read as means of one
// run before this change. The spec cites that pair, so it is written here and not
// overwritten: a mean of one run is not a median of five, and the two are not the same
// reading of the same tree.
//
// The swapped tree reads 0.528, 0.522 and 0.473, which is 1.01, 1.02 and 0.98 times
// the baselines. The two extra fetches a step cost about 2 percent and not 50, because
// they hit the neighbouring layer, which the first fetch already brought into cache.
const FETCH_BOUND_MS: Record<number, number> = { 60: 0.78, 120: 0.76, 260: 0.72 };

test('the worst camera holds the fetch bound', async ({ page }) => {
  await openMap(page, '');

  // The whole frame at the near view, every pass on, against the 16.7 ms budget of
  // `far-view-rendering`. It is read first, because the pass switches below turn every
  // other pass off.
  const frameMs = await page.evaluate((cursor) => {
    window.__galaxyMap?.setView?.({ cursor, distance: 20, pitch: 0, yaw: 0 });
    window.__galaxyMap?.drawNow?.();
    return window.__galaxyMap?.measureFrames?.(120) ?? Number.POSITIVE_INFINITY;
  }, BARNARDS_LOOP);

  await nebulaeAlone(page);
  const read = async (distance: number): Promise<number[]> =>
    page.evaluate(
      (where) => {
        window.__galaxyMap?.setView?.({
          cursor: where.cursor,
          distance: where.distance,
          pitch: 0,
          yaw: 0,
        });
        window.__galaxyMap?.drawNow?.();
        const runs: number[] = [];
        for (let run = 0; run < 5; run += 1) {
          runs.push(
            window.__galaxyMap?.measureFrames?.(120) ?? Number.POSITIVE_INFINITY,
          );
        }
        return runs;
      },
      { cursor: BARNARDS_LOOP, distance },
    );

  const medians: Record<number, number> = {};
  for (const distance of Object.keys(FETCH_BOUND_MS).map(Number)) {
    const runs = await read(distance);
    const sorted = [...runs].sort((a, b) => a - b);
    const median = sorted[2] as number;
    medians[distance] = median;
    console.log(`the fetch bound at ${distance}`, { runs, median });
  }
  console.log('the fetch bound', { medians, frameMs });

  for (const [distance, bound] of Object.entries(FETCH_BOUND_MS)) {
    const median = medians[Number(distance)] as number;
    expect(median, `${distance} light years read nothing`).toBeGreaterThan(0);
    expect(median, `${distance} light years costs too much`).toBeLessThan(bound);
  }
  expect(frameMs).toBeLessThan(16.7);
});

// The box is drawn with the front faces culled, so a camera inside it still gets
// fragments and a camera outside it gets one layer and not two. The failure this guards
// is the back faces drawing as well as the front, which doubles the fragments.
//
// The test read a mean of one run at each camera, and that instrument cannot resolve a
// difference of 20 percent. Five repeats of it, unchanged, gave shares of 0.45, 0.035,
// 0.036, 0.17 and 0.21, so it passed or failed at random. It now takes the median of
// five runs at each camera, which is the instrument `the worst camera holds the fetch
// bound` takes above. The bound stays at 20 percent.
//
// Five repeats of the median instrument give shares of 0.1503, 0.1513, 0.1515, 0.1519
// and 0.1534, a spread of 0.3 points against 41 points before. The medians in those
// runs are 1.35 ms outside and 1.59 ms inside. A whole-suite run reads 0.468 and
// 0.487, a share of 3.8 percent. Both the absolute cost and the share depend on what
// ran before, because the card holds a different clock, so the share is repeatable
// inside one context and not across two. Both contexts hold the bound with room. The
// means of one run read 0.495 and 0.568 after this change, and 0.614 and 0.655 before
// it.
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
        const runs: number[] = [];
        for (let run = 0; run < 5; run += 1) {
          runs.push(
            window.__galaxyMap?.measureFrames?.(120) ?? Number.POSITIVE_INFINITY,
          );
        }
        runs.sort((a, b) => a - b);
        return runs[2] as number;
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
