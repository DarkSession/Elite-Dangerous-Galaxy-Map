import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { waitForReady } from './helpers';

/** How many views this file has opened, so each one gets its own address. */
let visits = 0;

/** The view the label scenarios read, over the galactic centre. */
const CORE_VIEW = '#c=15,0,25895&d=20000&p=35&y=0';

/**
 * The oblique view: the cursor 20,000 light years above the plane, a pitch of 5 degrees
 * and a zoom of 20,000, so the camera sits 21,743 light years above the plane.
 */
const OBLIQUE_VIEW = '#c=0,20000,0&d=20000&p=5&y=0';

/** The smallest scale a label draws at. */
const FLOOR_SCALE = 0.7;

/** How far a label may sit from the centre of its region, in light years. */
const CENTRE_TOLERANCE_LY = 200;

/** How far the drawn position of a label may move over a turn of 0.1 degrees. */
const MOVE_BOUND_PIXELS = 12;

/**
 * Opens a view and waits until the page has drawn it.
 *
 * A `page.goto` that changes only the fragment does not reload the document, and the
 * page then answers with the labels of the view before. The counter in the query makes
 * every navigation a full load, so every reading belongs to the view the test asked
 * for.
 */
async function openView(page: Page, fragment = ''): Promise<void> {
  visits += 1;
  await page.goto(`/?view=${visits}${fragment}`);
  await waitForReady(page);
}

/** One label on the page. */
interface LabelReading {
  readonly id: number;
  readonly name: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Reads the region labels the page holds, with their boxes in CSS pixels. */
async function readLabels(page: Page): Promise<LabelReading[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.region-label')).map((element) => {
      const box = element.getBoundingClientRect();
      return {
        id: Number((element as HTMLElement).dataset['regionId'] ?? 0),
        name: element.textContent ?? '',
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
      };
    }),
  );
}

/**
 * The names of the regions the frame shows, worked out by the test itself: it sweeps a
 * grid of screen points and resolves each one against the coarse region grid. It reads
 * none of the counts the label code made, so the reading can disagree with the page.
 */
async function readRegionsOnScreen(page: Page, spacing = 16): Promise<Set<string>> {
  const names = await page.evaluate((step: number) => {
    const read = window.__galaxyMap?.regionNameAtScreen;
    if (read === undefined) return [];
    const found = new Set<string>();
    for (let y = step / 2; y < window.innerHeight; y += step) {
      for (let x = step / 2; x < window.innerWidth; x += step) {
        const name = read(x, y);
        if (name !== null) found.add(name);
      }
    }
    return Array.from(found);
  }, spacing);
  return new Set(names);
}

/** True when a box lies inside a viewport. */
function insideViewport(label: LabelReading, width: number, height: number): boolean {
  return (
    label.left >= 0 &&
    label.top >= 0 &&
    label.left + label.width <= width &&
    label.top + label.height <= height
  );
}

test.describe('the labels at 1280 by 720', () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

  test('a label sits on the centre of its region', async ({ page }) => {
    await openView(page, CORE_VIEW);
    const labels = await readLabels(page);
    console.log(
      'the labels at the core, at 1280 by 720',
      labels.length,
      labels.map((label) => label.name),
    );

    const core = labels.find((label) => label.name === 'Galactic Centre');
    expect(core).toBeDefined();
    const box = core as LabelReading;
    expect(insideViewport(box, 1280, 720)).toBe(true);

    // The cursor sits on the plane in this view, so the plane the page unprojects to is
    // the galactic plane the centre is measured on.
    const view = await page.evaluate(() => window.__galaxyMap?.getView?.());
    expect(view?.cursor[1]).toBe(0);

    const under = await page.evaluate(
      (where) => window.__galaxyMap?.planePointAt?.(where.x, where.y) ?? null,
      { x: box.left + box.width / 2, y: box.top + box.height / 2 },
    );
    expect(under).not.toBeNull();
    const centre = (
      await page.evaluate(() => window.__galaxyMap?.regionCentres?.() ?? [])
    ).find((region) => region.name === 'Galactic Centre');
    expect(centre).toBeDefined();

    const point = under as [number, number, number];
    const away = Math.hypot(point[0] - (centre?.x ?? 0), point[2] - (centre?.z ?? 0));
    console.log(
      'the Galactic Centre label sits',
      away.toFixed(1),
      'light years from its centre at',
      [centre?.x, centre?.z],
    );
    expect(away).toBeLessThan(CENTRE_TOLERANCE_LY);
  });

  test('the region under the middle of the frame is named', async ({ page }) => {
    await openView(page, CORE_VIEW);
    const middle = await page.evaluate(
      () =>
        window.__galaxyMap?.regionNameAtScreen?.(
          window.innerWidth / 2,
          window.innerHeight / 2,
        ) ?? null,
    );
    const labels = await readLabels(page);
    const placements = await page.evaluate(
      () => window.__galaxyMap?.regionLabelPlacements?.() ?? [],
    );
    console.log(
      'the region under the middle of the frame is',
      middle,
      'and it draws at',
      placements.find((row) => row.name === middle)?.scale,
    );
    expect(middle).not.toBeNull();
    expect(labels.map((label) => label.name)).toContain(middle);
  });

  test('a label never touches its boundary', async ({ page }) => {
    await openView(page, CORE_VIEW);
    const labels = await readLabels(page);
    expect(labels.length).toBeGreaterThan(0);

    // The frame is read twice inside the page and the two are compared there, so the
    // test moves counts and not four megabytes of pixels. The overlay switch takes the
    // labels off with the lines, so the boxes are read before it moves.
    const touching = await page.evaluate((boxes) => {
      const map = window.__galaxyMap;
      if (map?.readRect === undefined) return null;
      const size = map.drawingBufferSize?.() ?? [0, 0];
      const canvas = document.getElementById('map');
      if (!(canvas instanceof HTMLCanvasElement)) return null;
      const ratio = size[0] / Math.max(1, canvas.clientWidth);
      const wide = size[0];
      const tall = size[1];
      const on = map.readRect(0, 0, wide / ratio, tall / ratio);
      map.setPasses?.({ regions: false });
      map.drawNow?.();
      const off = map.readRect(0, 0, wide / ratio, tall / ratio);
      const counts: { name: string; changed: number }[] = [];
      for (const box of boxes) {
        let changed = 0;
        const left = Math.floor(box.left * ratio);
        const right = Math.ceil((box.left + box.width) * ratio);
        const top = Math.floor(box.top * ratio);
        const bottom = Math.ceil((box.top + box.height) * ratio);
        for (let row = Math.max(0, top); row < Math.min(tall, bottom); row += 1) {
          for (
            let column = Math.max(0, left);
            column < Math.min(wide, right);
            column += 1
          ) {
            const index = (row * wide + column) * 4;
            if (
              on[index] !== off[index] ||
              on[index + 1] !== off[index + 1] ||
              on[index + 2] !== off[index + 2]
            ) {
              changed += 1;
            }
          }
        }
        counts.push({ name: box.name, changed });
      }
      let total = 0;
      for (let index = 0; index < on.length; index += 4) {
        if (
          on[index] !== off[index] ||
          on[index + 1] !== off[index + 1] ||
          on[index + 2] !== off[index + 2]
        ) {
          total += 1;
        }
      }
      return { counts, total };
    }, labels);

    expect(touching).not.toBeNull();
    const reading = touching as {
      counts: { name: string; changed: number }[];
      total: number;
    };
    console.log(
      'the overlay changed',
      reading.total,
      'pixels, and the label boxes hold',
      reading.counts.filter((row) => row.changed > 0),
    );
    // The reading is worth nothing if the overlay changed nothing at all.
    expect(reading.total).toBeGreaterThan(0);
    for (const row of reading.counts) {
      expect(row.changed, `${row.name} holds a pixel of its boundary`).toBe(0);
    }
  });

  test('a near region is named in an oblique frame', async ({ page }) => {
    await openView(page, OBLIQUE_VIEW);
    const labels = await readLabels(page);
    const shown = await readRegionsOnScreen(page, 8);
    console.log(
      'the oblique frame shows',
      shown.size,
      'regions and names',
      labels.length,
      labels.map((label) => label.name),
    );
    expect(labels.length).toBeGreaterThanOrEqual(4);
    for (const label of labels) {
      expect(shown.has(label.name), `${label.name} is not on the screen`).toBe(true);
    }
  });
});

test.describe('the labels at 1920 by 1080', () => {
  test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

  test('no label at the far view', async ({ page }) => {
    await openView(page);
    expect(await readLabels(page)).toEqual([]);
  });

  test('a label lies inside its own region', async ({ page }) => {
    await openView(page, CORE_VIEW);
    const labels = await readLabels(page);
    console.log(
      'the labels at the core, at 1920 by 1080',
      labels.length,
      labels.map((label) => label.name),
    );
    expect(labels.length).toBeGreaterThan(0);

    const points = labels.flatMap((label) => [
      { name: label.name, x: label.left, y: label.top },
      { name: label.name, x: label.left + label.width, y: label.top },
      { name: label.name, x: label.left, y: label.top + label.height },
      { name: label.name, x: label.left + label.width, y: label.top + label.height },
      {
        name: label.name,
        x: label.left + label.width / 2,
        y: label.top + label.height / 2,
      },
    ]);
    const reads = await page.evaluate(
      (where) =>
        where.map((point) => ({
          name: point.name,
          under: window.__galaxyMap?.regionNameAtScreen?.(point.x, point.y) ?? null,
        })),
      points,
    );
    for (const read of reads) {
      expect(read.under, `${read.name} reaches over ${String(read.under)}`).toBe(
        read.name,
      );
    }
  });

  test('no two labels overlap', async ({ page }) => {
    await openView(page, CORE_VIEW);
    const labels = await readLabels(page);
    expect(labels.length).toBeGreaterThan(0);
    for (let first = 0; first < labels.length; first += 1) {
      for (let second = first + 1; second < labels.length; second += 1) {
        const one = labels[first] as LabelReading;
        const two = labels[second] as LabelReading;
        const apart =
          one.left >= two.left + two.width ||
          two.left >= one.left + one.width ||
          one.top >= two.top + two.height ||
          two.top >= one.top + one.height;
        expect(apart, `${one.name} and ${two.name} overlap`).toBe(true);
      }
    }
  });

  test('the region the camera is inside is named at every zoom', async ({ page }) => {
    for (const distance of [20000, 10000, 4000, 1000, 500]) {
      await openView(page, `#c=0,0,0&d=${distance}&p=35&y=0`);
      const labels = await readLabels(page);
      const spur = labels.find((label) => label.name === 'Inner Orion Spur');
      const placement = (
        await page.evaluate(() => window.__galaxyMap?.regionLabelPlacements?.() ?? [])
      ).find((row) => row.name === 'Inner Orion Spur');
      console.log(
        'at',
        distance,
        'light years the Inner Orion Spur label draws at',
        placement?.scale,
      );
      expect(
        spur,
        `no Inner Orion Spur label at ${distance} light years`,
      ).toBeDefined();
      expect(insideViewport(spur as LabelReading, 1920, 1080)).toBe(true);
    }
  });

  test('a region with nothing on screen carries no label', async ({ page }) => {
    await openView(page, '#c=0,0,0&d=500&p=35&y=0');
    const labels = await readLabels(page);
    const shown = await readRegionsOnScreen(page);
    console.log(
      'the regions the frame shows at 500 light years',
      Array.from(shown),
      'and the labels',
      labels.map((label) => label.name),
    );
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(shown.has(label.name), `${label.name} is not on the screen`).toBe(true);
    }
  });

  test('a label moves with the camera and does not snap', async ({ page }) => {
    for (const distance of [2000, 500]) {
      await openView(page, `#c=0,0,0&d=${distance}&p=35&y=0`);
      const reading = await page.evaluate((zoom: number) => {
        const map = window.__galaxyMap;
        const drawnPosition = (): { x: number; y: number } | null => {
          for (const element of Array.from(
            document.querySelectorAll('.region-label'),
          )) {
            if (element.textContent !== 'Inner Orion Spur') continue;
            const box = element.getBoundingClientRect();
            return { x: box.left, y: box.top };
          }
          return null;
        };
        const places: { x: number; y: number }[] = [];
        let missing = 0;
        for (let frame = 0; frame <= 120; frame += 1) {
          map?.setView?.({
            cursor: [0, 0, 0],
            distance: zoom,
            yaw: frame * 0.1,
            pitch: 35,
          });
          map?.drawNow?.();
          const place = drawnPosition();
          if (place === null) missing += 1;
          else places.push(place);
        }
        let worst = 0;
        let least = Number.POSITIVE_INFINITY;
        for (let index = 1; index < places.length; index += 1) {
          const one = places[index - 1] as { x: number; y: number };
          const two = places[index] as { x: number; y: number };
          const move = Math.hypot(two.x - one.x, two.y - one.y);
          if (move > worst) worst = move;
          if (move < least) least = move;
        }
        return { frames: places.length, missing, worst, least };
      }, distance);
      console.log(
        `at ${distance} light years the label moved by ${reading.least.toFixed(3)} to`,
        `${reading.worst.toFixed(3)} CSS pixels over ${reading.frames} frames`,
      );
      expect(reading.missing, `the label left the page at ${distance}`).toBe(0);
      expect(reading.frames).toBe(121);
      expect(reading.least).toBeGreaterThan(0);
      expect(reading.worst).toBeLessThan(MOVE_BOUND_PIXELS);
    }
  });

  test('a label falls to the floor scale before it leaves', async ({ page }) => {
    test.setTimeout(300000);
    await openView(page, CORE_VIEW);
    // Every region is panned in four directions, from its own centre, until no part of
    // it is on the screen. The stop is read from the coarse region grid and not from
    // the label code, so a pan ends where the scenario says it ends.
    const result = await page.evaluate(() => {
      const map = window.__galaxyMap;
      const centres = map?.regionCentres?.() ?? [];
      const STEP_LY = 100;
      const CAP_FRAMES = 1600;
      const showsRegion = (name: string): boolean => {
        const read = map?.regionNameAtScreen;
        if (read === undefined) return false;
        for (let y = 16; y < window.innerHeight; y += 32) {
          for (let x = 16; x < window.innerWidth; x += 32) {
            if (read(x, y) === name) return true;
          }
        }
        return false;
      };
      const pans: {
        name: string;
        direction: string;
        lastScale: number;
        frames: number;
        returns: number;
        stopped: string;
      }[] = [];
      for (const region of centres) {
        for (const direction of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          let lastScale = -1;
          let returns = 0;
          let seen = false;
          let present = false;
          let frames = 0;
          let stopped = 'cap';
          for (let frame = 0; frame < CAP_FRAMES; frame += 1) {
            const x = region.x + (direction[0] as number) * STEP_LY * frame;
            const z = region.z + (direction[1] as number) * STEP_LY * frame;
            map?.setView?.({ cursor: [x, 0, z], distance: 2000, yaw: 0, pitch: 35 });
            map?.drawNow?.();
            frames = frame + 1;
            const placed = (map?.regionLabelPlacements?.() ?? []).find(
              (row) => row.id === region.id,
            );
            if (placed !== undefined) {
              if (!present && seen) returns += 1;
              seen = true;
              present = true;
              lastScale = placed.scale;
            } else {
              present = false;
              if (seen && frame % 4 === 0 && !showsRegion(region.name)) {
                stopped = 'gone';
                break;
              }
            }
            // The cursor is held inside the model bounds, so a pan that reaches the
            // edge cannot take the region off the screen. It carries no reading.
            const view = map?.getView?.();
            if (
              view !== undefined &&
              frame > 0 &&
              Math.abs(view.cursor[0] - x) + Math.abs(view.cursor[2] - z) > 1
            ) {
              stopped = 'edge';
              break;
            }
          }
          pans.push({
            name: region.name,
            direction: `${direction[0]},${direction[1]}`,
            lastScale,
            frames,
            returns,
            stopped,
          });
        }
      }
      return pans;
    });

    const finished = result.filter((pan) => pan.stopped === 'gone');
    const returned = result.filter((pan) => pan.returns > 0);
    const worst = Math.max(...finished.map((pan) => pan.lastScale));
    console.log(
      'over',
      result.length,
      'pans,',
      finished.length,
      'took the region off the screen and',
      result.filter((pan) => pan.stopped === 'edge').length,
      'reached the model edge',
    );
    console.log(
      'the largest scale a label left the page from is',
      worst,
      'and',
      returned.length,
      'pans show a label leaving and returning:',
      returned.map((pan) => `${pan.name} ${pan.direction}`),
    );
    expect(result.length).toBe(168);
    expect(finished.length).toBeGreaterThan(150);
    for (const pan of finished) {
      expect(
        Math.abs(pan.lastScale - FLOOR_SCALE),
        `${pan.name} left the page at ${pan.lastScale} panning ${pan.direction}`,
      ).toBeLessThanOrEqual(0.01);
    }
  });

  test('the placement stays inside its budget', async ({ page }) => {
    test.setTimeout(300000);
    await openView(page, CORE_VIEW);
    const runs: { meanMs: number; worstMs: number }[] = [];
    for (let run = 0; run < 5; run += 1) {
      await page.evaluate(() => window.__galaxyMap?.resetLabelPlacement?.());
      await page.waitForFunction(
        () => (window.__galaxyMap?.labelPlacement?.().frames ?? 0) >= 300,
        undefined,
        { timeout: 120000 },
      );
      const reading = await page.evaluate(
        () =>
          window.__galaxyMap?.labelPlacement?.() ?? {
            frames: 0,
            meanMs: 0,
            worstMs: 0,
          },
      );
      console.log(
        'run',
        run + 1,
        'placed labels in a mean of',
        reading.meanMs.toFixed(4),
        'ms and a worst of',
        reading.worstMs.toFixed(4),
        'ms over',
        reading.frames,
        'frames',
      );
      expect(reading.frames).toBeGreaterThanOrEqual(300);
      expect(reading.meanMs).toBeLessThan(0.5);
      expect(reading.worstMs).toBeLessThan(2);
      runs.push({ meanMs: reading.meanMs, worstMs: reading.worstMs });
    }
    console.log(
      'the mean ran from',
      Math.min(...runs.map((run) => run.meanMs)).toFixed(4),
      'to',
      Math.max(...runs.map((run) => run.meanMs)).toFixed(4),
      'ms and the worst frame from',
      Math.min(...runs.map((run) => run.worstMs)).toFixed(4),
      'to',
      Math.max(...runs.map((run) => run.worstMs)).toFixed(4),
      'ms',
    );
  });
});
