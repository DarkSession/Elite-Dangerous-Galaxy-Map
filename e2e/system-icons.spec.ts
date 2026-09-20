// The icon stack over a system marker: its order, its geometry, its arrow, its switch
// and the bounds it holds to.
//
// Every view of this file puts its systems at a range of 500 to 1,000 light years, which
// is the plateau of the marker size rule, so the marker is 12 CSS pixels across and the
// offsets below are exact numbers rather than a reading of the size.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { channels, openMap } from './helpers';
import type { SystemRecordInput } from '../packages/galaxy-map/src/scene-data/real-systems';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

/** The colour every category in this file takes. */
const CORE: [number, number, number] = [153, 230, 255];

/** The pitch every view in this file takes. */
const PITCH = 35;

/** The diameter of a marker at the ranges this file uses, in CSS pixels. */
const MARKER_CSS = 12;

/** How far over a marker centre the arrow's apex sits, in CSS pixels. */
const APEX_CSS = MARKER_CSS / 2 + 2;

/** How far over a marker centre the bottom of the lowest icon sits, in CSS pixels. */
const LOWEST_BOTTOM_CSS = MARKER_CSS / 2 + 7;

/** How far a selected system lifts its stack, in CSS pixels. */
const LIFT_CSS = 28;

/** The side of one icon, in CSS pixels. */
const ICON_CSS = 28;

/** The step from one icon of a stack to the next, in CSS pixels. */
const STEP_CSS = 30;

/** The catalogue colour of the `titan` symbol. */
const TITAN: [number, number, number] = [255, 0, 0];

/** The catalogue colour of the `mission` symbol. */
const MISSION: [number, number, number] = [0, 93, 255];

/**
 * The camera position at a view of this file, in game coordinates. The arithmetic is the
 * one `src/camera/projection.ts` holds, written out here: an import of that module pulls
 * the model's detail picture through Playwright's transform, which reads no PNG.
 *
 * Yaw is 0 in every view of this file, so the camera sits on the `-z` side of the cursor.
 */
function cameraAt(distance: number): [number, number, number] {
  const pitch = (PITCH * Math.PI) / 180;
  return [0, Math.sin(pitch) * distance, -Math.cos(pitch) * distance];
}

/** A record the reader accepts. */
function record(
  name: string,
  position: readonly [number, number, number],
  category: string,
  icons?: readonly unknown[],
): Record<string, unknown> {
  return {
    name,
    coords: { x: position[0], y: position[1], z: position[2] },
    primaryCategory: category,
    ...(icons === undefined ? {} : { icons }),
  };
}

/** Adds one category that draws at every range. */
async function addCategory(page: Page, name = 'Alpha'): Promise<void> {
  await page.evaluate(
    (value) => {
      window.galaxyMap?.addCategories([
        { name: value.name, color: value.color, maxDrawRange: 200000 },
      ]);
    },
    { name, color: CORE },
  );
}

/**
 * Adds records through the handle. The cast is at the call, because a test also passes
 * a record the input type refuses and the reader rejects at run time.
 */
async function addSystems(page: Page, records: readonly unknown[]): Promise<number> {
  return page.evaluate(
    (list) =>
      window.galaxyMap?.addSystems(list as readonly SystemRecordInput[]).added ?? -1,
    records,
  );
}

/** Replaces the view and draws one frame. */
async function setView(
  page: Page,
  cursor: readonly [number, number, number],
  distance: number,
  yaw = 0,
): Promise<void> {
  await page.evaluate(
    (next) => {
      window.galaxyMap?.setView({
        cursor: next.cursor as [number, number, number],
        distance: next.distance,
        yaw: next.yaw,
        pitch: next.pitch,
      });
      window.galaxyMap?.debug.drawNow();
    },
    { cursor, distance, yaw, pitch: PITCH },
  );
}

/** Draws one frame. */
async function drawFrame(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.galaxyMap?.debug.drawNow();
  });
}

/** The CSS pixel a game position projects to. */
async function projectOf(
  page: Page,
  point: readonly [number, number, number],
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    (where) =>
      window.galaxyMap?.debug.project(where as [number, number, number]) ?? {
        x: -1,
        y: -1,
      },
    point,
  );
}

/** One element of the overlay, with its box in CSS pixels. */
interface Mark {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
  /** The `src` of an icon, and an empty string for an arrow. */
  readonly src: string;
  /** The top border colour, which is the fill of an arrow. */
  readonly fill: string;
  /** The background colour, which is the plate under an icon. */
  readonly plate: string;
  /** The stacking level, which puts a near stack over a far one. */
  readonly level: string;
}

/**
 * Reads every element of a class, top of the screen first. The order is the reading
 * order of the stack from its highest icon down, so the last entry is the lowest one.
 */
async function marksOf(page: Page, selector: string): Promise<Mark[]> {
  const marks = await page.evaluate((name) => {
    return [...document.querySelectorAll(name)].map((element) => {
      const box = element.getBoundingClientRect();
      return {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
        src: element.getAttribute('src') ?? '',
        fill: getComputedStyle(element).borderTopColor,
        plate: getComputedStyle(element).backgroundColor,
        level: getComputedStyle(element).zIndex,
      };
    });
  }, selector);
  return [...marks].sort((one, other) => one.top - other.top);
}

/** The icons of the overlay, top of the screen first. */
async function icons(page: Page): Promise<Mark[]> {
  return marksOf(page, '.gm-system-icon');
}

/** The arrows of the overlay, top of the screen first. */
async function arrows(page: Page): Promise<Mark[]> {
  return marksOf(page, '.gm-system-arrow');
}

/** How many icons and arrows the overlay holds. */
async function counts(page: Page): Promise<{ icons: number; arrows: number }> {
  return page.evaluate(() => ({
    icons: document.querySelectorAll('.gm-system-icon').length,
    arrows: document.querySelectorAll('.gm-system-arrow').length,
  }));
}

/** Opens the map at a view of this file, with one category and the records. */
async function openWith(
  page: Page,
  records: readonly unknown[],
  distance = 1000,
): Promise<void> {
  await openMap(page, `#c=0,0,0&d=${distance}&p=${PITCH}&y=0`);
  await addCategory(page);
  expect(await addSystems(page, records)).toBe(records.length);
  await setView(page, [0, 0, 0], distance);
}

test.describe('the icon stack', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  // The scenario "A stack draws in the record's order".
  test('a stack draws in the order of the record', async ({ page }) => {
    await openWith(page, [
      record('One', [0, 0, 0], 'Alpha', ['titan', 'mission', 'waypoint']),
    ]);

    const stack = await icons(page);
    console.log(
      'the stack, top first',
      stack.map((mark) => mark.src),
    );

    expect(stack).toHaveLength(3);
    // The reading runs top of the screen down, so the record's first icon is last.
    expect(stack[2]?.src).toContain('titan');
    expect(stack[1]?.src).toContain('mission');
    expect(stack[0]?.src).toContain('waypoint');
    for (const mark of stack) {
      expect(mark.width).toBe(ICON_CSS);
      expect(mark.height).toBe(ICON_CSS);
      // The plate, so a thin light line of a vector reads against black and not against
      // whatever the camera puts behind the marker.
      expect(mark.plate).toBe('rgb(0, 0, 0)');
    }
    // Each icon sits one step over the one below it.
    for (let at = 1; at < stack.length; at += 1) {
      const step = (stack[at] as Mark).bottom - (stack[at - 1] as Mark).bottom;
      expect(Math.abs(step - STEP_CSS)).toBeLessThanOrEqual(1);
    }
  });

  // The scenario "The stack sits at the stated offset".
  test('the stack sits at the stated offset', async ({ page }) => {
    await openWith(page, [record('One', [0, 0, 0], 'Alpha', ['titan'])]);

    const marker = await projectOf(page, [0, 0, 0]);
    const stack = await icons(page);
    const icon = stack[0] as Mark;
    console.log('the icon against the marker', { marker, icon });

    expect(stack).toHaveLength(1);
    expect(Math.abs((icon.left + icon.right) / 2 - marker.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(icon.bottom - (marker.y - LOWEST_BOTTOM_CSS))).toBeLessThanOrEqual(
      1,
    );
  });

  // The scenario "Two icons sit two pixels apart".
  test('two icons sit two pixels apart', async ({ page }) => {
    await openWith(page, [record('One', [0, 0, 0], 'Alpha', ['titan', 'mission'])]);

    const stack = await icons(page);
    const upper = stack[0] as Mark;
    const lower = stack[1] as Mark;
    console.log('the gap of the stack', { upper, lower });

    expect(stack).toHaveLength(2);
    expect(Math.abs(lower.top - upper.bottom - 2)).toBeLessThanOrEqual(1);
  });

  // The scenario "A selection lifts the stack over the pin".
  test('a selection lifts the stack over the pin', async ({ page }) => {
    await openWith(page, [record('One', [0, 0, 0], 'Alpha', ['titan'])]);

    const before = (await icons(page))[0] as Mark;
    await page.evaluate(() => {
      window.galaxyMap?.setSelection('One');
    });
    await drawFrame(page);
    const after = (await icons(page))[0] as Mark;
    const pin = (await marksOf(page, '.gm-system-pin'))[0] as Mark;
    console.log('the stack over the pin', { before, after, pin });

    expect(Math.abs(before.bottom - after.bottom - LIFT_CSS)).toBeLessThanOrEqual(1);
    // The two boxes do not overlap: the icon ends above the top of the pin.
    expect(after.bottom).toBeLessThanOrEqual(pin.top);
  });

  // The scenario "The icons go when the marker goes".
  test('the icons go when the category goes', async ({ page }) => {
    await openWith(page, [record('One', [0, 0, 0], 'Alpha', ['titan', 'mission'])]);

    await page.evaluate(() => {
      window.galaxyMap?.setCategoryVisible('Alpha', false);
    });
    await drawFrame(page);
    const off = await counts(page);
    await page.evaluate(() => {
      window.galaxyMap?.setCategoryVisible('Alpha', true);
    });
    await drawFrame(page);
    const on = await counts(page);
    console.log('the icon counts with the category off and on', { off, on });

    expect(off.icons).toBe(0);
    expect(off.arrows).toBe(0);
    expect(on.icons).toBe(2);
    expect(on.arrows).toBe(1);
  });

  // The scenario "The stack follows the marker through a camera move". The left drag
  // turns the camera around the cursor at 0.3 degrees a pixel, so 60 pixels is 18
  // degrees. The drag starts away from the marker, so it hovers and selects nothing.
  test('the stack follows the marker through an orbit', async ({ page }) => {
    const place: [number, number, number] = [200, 0, 0];
    await openWith(page, [record('One', place, 'Alpha', ['titan'])]);

    const readOffset = async (): Promise<{
      marker: { x: number; y: number };
      bottom: number;
      offset: number;
    }> => {
      const marker = await projectOf(page, place);
      const icon = (await icons(page))[0] as Mark;
      return { marker, bottom: icon.bottom, offset: marker.y - icon.bottom };
    };

    const before = await readOffset();
    await page.mouse.move(200, 600);
    await page.mouse.down();
    await page.mouse.move(260, 600, { steps: 6 });
    await page.mouse.up();
    await drawFrame(page);
    const after = await readOffset();
    console.log('the stack through the orbit', { before, after });

    expect(Math.abs(after.marker.x - before.marker.x)).toBeGreaterThan(10);
    expect(Math.abs(after.offset - before.offset)).toBeLessThanOrEqual(1);
  });

  // The scenario "The nearer stack draws over the further one". Both systems sit on the
  // line from the camera through the cursor, so the two stacks land on one pixel and
  // cover each other.
  test('the nearer stack draws over the further one', async ({ page }) => {
    const distance = 1000;
    const camera = cameraAt(distance);
    // The cursor is the origin, so a point of the ray is the camera scaled down. 0.4 of
    // the way leaves the near system inside the plateau of the marker size rule.
    const near: [number, number, number] = [
      camera[0] * 0.4,
      camera[1] * 0.4,
      camera[2] * 0.4,
    ];

    await openWith(
      page,
      [
        record('Far', [0, 0, 0], 'Alpha', ['titan']),
        record('Near', near, 'Alpha', ['mission']),
      ],
      distance,
    );

    const stack = await icons(page);
    const far = stack.find((mark) => mark.src.includes('titan')) as Mark;
    const close = stack.find((mark) => mark.src.includes('mission')) as Mark;
    console.log('the two stacks', {
      far: { left: far.left, top: far.top, level: far.level },
      near: { left: close.left, top: close.top, level: close.level },
    });

    // The two cover each other, or the levels would decide nothing on the screen.
    expect(Math.abs(close.left - far.left)).toBeLessThanOrEqual(1);
    expect(Number(close.level)).toBeGreaterThan(Number(far.level));
    expect(Number(far.level)).toBeGreaterThan(0);
  });

  // The scenario "The icon holds its size as the camera comes in".
  test('the icon holds its size as the camera comes in', async ({ page }) => {
    await openWith(page, [record('One', [0, 0, 0], 'Alpha', ['titan'])], 1000);

    const sizes: { distance: number; width: number; height: number }[] = [];
    for (const distance of [1000, 200, 40, 10]) {
      await setView(page, [0, 0, 0], distance);
      await drawFrame(page);
      const icon = (await icons(page))[0] as Mark;
      sizes.push({ distance, width: icon.width, height: icon.height });
    }
    console.log('the icon through the approach', sizes);

    for (const size of sizes) {
      expect(size.width).toBe(ICON_CSS);
      expect(size.height).toBe(ICON_CSS);
    }
  });

  // The scenario "A camera move leaves the icon on whole pixels". An icon is a bitmap
  // the browser makes from a vector. At a fraction of a pixel it samples the vector at a
  // new phase in every frame, and the glyph shakes while the camera moves.
  test('an orbit leaves the icon on whole pixels', async ({ page }) => {
    const place: [number, number, number] = [200, 0, 0];
    await openWith(page, [record('One', place, 'Alpha', ['titan'])]);

    const places: { left: number; top: number }[] = [];
    await page.mouse.move(200, 600);
    await page.mouse.down();
    for (let step = 0; step < 30; step += 1) {
      await page.mouse.move(200 + step * 3, 600);
      await drawFrame(page);
      const icon = (await icons(page))[0] as Mark;
      places.push({ left: icon.left, top: icon.top });
    }
    await page.mouse.up();

    const fractions = places.filter(
      (spot) => spot.left % 1 !== 0 || spot.top % 1 !== 0,
    );
    console.log('the icon through the orbit', {
      steps: places.length,
      first: places[0],
      last: places[places.length - 1],
      fractions: fractions.length,
    });

    // The orbit has to move the icon, or a run of equal readings would pass for nothing.
    expect(places[0]).not.toEqual(places[places.length - 1]);
    expect(fractions).toEqual([]);
  });

  // The scenario "An icon does not take the pick".
  test('an icon does not take the pick', async ({ page }) => {
    await openWith(page, [
      record('One', [0, 0, 0], 'Alpha', ['titan', 'mission', 'waypoint', 'bookmark']),
    ]);

    const marker = await projectOf(page, [0, 0, 0]);
    const stack = await icons(page);
    const middle = stack[1] as Mark;
    const at = {
      x: (middle.left + middle.right) / 2,
      y: (middle.top + middle.bottom) / 2,
    };
    // The element under that point is the canvas and not the icon, because an icon
    // takes no pointer event.
    const under = await page.evaluate(
      (where) => document.elementFromPoint(where.x, where.y)?.tagName ?? '',
      at,
    );
    await page.mouse.move(at.x, at.y);
    await drawFrame(page);
    const overStack = await page.evaluate(
      () => window.galaxyMap?.getHover()?.name ?? null,
    );
    await page.mouse.move(marker.x, marker.y);
    await drawFrame(page);
    const overMarker = await page.evaluate(
      () => window.galaxyMap?.getHover()?.name ?? null,
    );
    console.log('the pick under the stack', { at, under, overStack, overMarker });

    expect(stack).toHaveLength(4);
    expect(under).toBe('CANVAS');
    expect(overStack).toBeNull();
    expect(overMarker).toBe('One');
  });
});

test.describe('the arrow under the lowest icon', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  // The scenario "One arrow draws under a stack of four".
  test('one arrow draws under a stack of four', async ({ page }) => {
    await openWith(page, [
      record('One', [0, 0, 0], 'Alpha', ['titan', 'mission', 'waypoint', 'bookmark']),
    ]);

    const marker = await projectOf(page, [0, 0, 0]);
    const held = await arrows(page);
    const arrow = held[0] as Mark;
    console.log('the arrow of a stack of four', { marker, arrow });

    expect(await counts(page)).toEqual({ icons: 4, arrows: 1 });
    expect(Math.abs((arrow.left + arrow.right) / 2 - marker.x)).toBeLessThanOrEqual(1);
  });

  // The scenario "The arrow takes the lowest icon's colour".
  test('the arrow takes the colour of the lowest icon', async ({ page }) => {
    await openWith(page, [
      record('First', [-200, 0, 0], 'Alpha', ['titan', 'mission']),
      record('Second', [200, 0, 0], 'Alpha', ['mission', 'titan']),
    ]);

    const left = await projectOf(page, [-200, 0, 0]);
    const held = await arrows(page);
    const byX = [...held].sort((one, other) => one.left - other.left);
    const first = channels((byX[0] as Mark).fill);
    const second = channels((byX[1] as Mark).fill);
    console.log('the two arrow fills', { left, first, second });

    expect(held).toHaveLength(2);
    for (let part = 0; part < 3; part += 1) {
      expect(Math.abs(first[part] - (TITAN[part] as number))).toBeLessThanOrEqual(2);
      expect(Math.abs(second[part] - (MISSION[part] as number))).toBeLessThanOrEqual(2);
    }
  });

  // The scenario "The arrow takes a host icon's colour". The demo site serves the
  // drawing itself, so the icon is the host form with no built-in symbol behind it.
  test('the arrow takes the colour of a host icon', async ({ page }) => {
    await openWith(page, [
      record('One', [0, 0, 0], 'Alpha', [
        { url: 'demo-images/ruins-site.svg', color: [0, 205, 247] },
      ]),
    ]);

    const held = await arrows(page);
    const fill = channels((held[0] as Mark).fill);
    const stack = await icons(page);
    console.log('the host icon and its arrow', { fill, src: stack[0]?.src });

    expect(held).toHaveLength(1);
    expect(stack[0]?.src).toContain('demo-images/ruins-site.svg');
    for (const [part, want] of [0, 205, 247].entries()) {
      expect(Math.abs((fill[part] as number) - want)).toBeLessThanOrEqual(2);
    }
  });

  // The scenario "The apex points at the marker".
  test('the apex points at the marker', async ({ page }) => {
    await openWith(page, [record('One', [0, 0, 0], 'Alpha', ['titan'])]);

    const marker = await projectOf(page, [0, 0, 0]);
    const arrow = (await arrows(page))[0] as Mark;
    const icon = (await icons(page))[0] as Mark;
    console.log('the apex against the marker', { marker, arrow, icon });

    expect(Math.abs(arrow.bottom - (marker.y - APEX_CSS))).toBeLessThanOrEqual(1);
    expect(arrow.height).toBe(5);
    expect(arrow.width).toBe(8);
    // The top of the arrow meets the bottom of the lowest icon.
    expect(Math.abs(arrow.top - icon.bottom)).toBeLessThanOrEqual(1);
  });

  // The scenario "A system with no icon carries no arrow".
  test('a system with no icon carries no arrow', async ({ page }) => {
    await openWith(page, [record('One', [0, 0, 0], 'Alpha')]);

    const held = await counts(page);
    console.log('the counts of a system with no icon', held);

    expect(held).toEqual({ icons: 0, arrows: 0 });
  });
});

test.describe('the icon switch', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  /** Five systems in view, each carrying two icons. */
  function fiveWithTwo(): Record<string, unknown>[] {
    const records: Record<string, unknown>[] = [];
    for (let index = 0; index < 5; index += 1) {
      records.push(
        record(`S${index}`, [(index - 2) * 100, 0, 0], 'Alpha', ['titan', 'mission']),
      );
    }
    return records;
  }

  /** Turns the switch and draws one frame. */
  async function setSwitch(page: Page, on: boolean): Promise<void> {
    await page.evaluate((next) => {
      window.galaxyMap?.setSystemIconsVisible(next);
      window.galaxyMap?.debug.drawNow();
    }, on);
  }

  // The scenario "The switch turns the icons off and on".
  test('the switch turns the icons off and on', async ({ page }) => {
    await openWith(page, fiveWithTwo());

    const first = await counts(page);
    await setSwitch(page, false);
    const second = await counts(page);
    await setSwitch(page, true);
    const third = await counts(page);
    console.log('the icon counts over the switch', { first, second, third });

    expect(first.icons).toBe(10);
    expect(second.icons).toBe(0);
    expect(second.arrows).toBe(0);
    expect(third.icons).toBe(10);
  });

  // The scenario "The switch holds over the hover and the selection".
  test('the switch holds over the hover and the selection', async ({ page }) => {
    await openWith(page, fiveWithTwo());
    await setSwitch(page, false);
    await page.evaluate(() => {
      window.galaxyMap?.setSelection('S0');
    });
    const spot = await projectOf(page, [100, 0, 0]);
    await page.mouse.move(spot.x, spot.y);
    await drawFrame(page);

    const hovered = await page.evaluate(
      () => window.galaxyMap?.getHover()?.name ?? null,
    );
    const selected = await page.evaluate(
      () => window.galaxyMap?.getSelection()?.name ?? null,
    );
    const held = await counts(page);
    console.log('the counts with the switch off', { hovered, selected, held });

    expect(hovered).not.toBeNull();
    expect(selected).toBe('S0');
    expect(held).toEqual({ icons: 0, arrows: 0 });
  });
});

// The `systemIcons` option of `GalaxyMapOptions`, which sets the state the map starts
// in. The tests build a map of their own, because the option is read once at the build.
test.describe('the system icons option', () => {
  /**
   * Builds a map with the `systemIcons` the test names, over a canvas of its own, and
   * adds 5 systems with two icons each in view. The demo page's map comes down first,
   * so the icon count of the document is the count of this map alone.
   */
  async function buildIconsMap(page: Page, options: unknown): Promise<void> {
    await page.evaluate(async (settings) => {
      const factory = window.galaxyMapFactory;
      if (factory === undefined) throw new Error('The page has no map factory.');
      window.galaxyMap?.dispose();
      const wrap = document.createElement('div');
      wrap.id = 'icons-wrap';
      wrap.style.cssText = 'position: absolute; inset: 0;';
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'display: block; width: 100%; height: 100%;';
      wrap.appendChild(canvas);
      document.body.appendChild(wrap);
      const map = factory(canvas, {
        ...(settings as Record<string, unknown>),
        startView: { cursor: [0, 0, 0], distance: 1000, yaw: 0, pitch: 35 },
      } as never);
      window.__iconsMap = map;
      await map.ready;
      map.addCategories([
        { name: 'Alpha', color: [153, 230, 255], maxDrawRange: 200000 },
      ]);
      const records = [];
      for (let index = 0; index < 5; index += 1) {
        records.push({
          name: `S${index}`,
          coords: { x: (index - 2) * 100, y: 0, z: 0 },
          primaryCategory: 'Alpha',
          icons: ['titan', 'mission'],
        });
      }
      map.addSystems(records as never);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    }, options);
  }

  /** Takes the map of the test down, so the next build counts its own icons. */
  async function dropIconsMap(page: Page): Promise<void> {
    await page.evaluate(() => {
      window.__iconsMap?.dispose();
      delete window.__iconsMap;
      document.getElementById('icons-wrap')?.remove();
    });
  }

  test.afterEach(async ({ page }) => {
    await dropIconsMap(page);
  });

  // The scenario "The option starts the icons off".
  test('the option starts the icons off', async ({ page }) => {
    await openMap(page);
    await buildIconsMap(page, { systemIcons: false });
    const off = {
      reading: await page.evaluate(
        () => window.__iconsMap?.areSystemIconsVisible() ?? true,
      ),
      icons: (await counts(page)).icons,
    };
    await dropIconsMap(page);

    await buildIconsMap(page, {});
    const on = {
      reading: await page.evaluate(
        () => window.__iconsMap?.areSystemIconsVisible() ?? false,
      ),
      icons: (await counts(page)).icons,
    };
    console.log('the two maps of the option', { off, on });

    expect(off).toEqual({ reading: false, icons: 0 });
    expect(on).toEqual({ reading: true, icons: 10 });
  });

  // The scenario "An unreadable option keeps the icons on".
  test('an unreadable option keeps the icons on', async ({ page }) => {
    await openMap(page);
    await buildIconsMap(page, { systemIcons: 'no' });

    const reading = await page.evaluate(
      () => window.__iconsMap?.areSystemIconsVisible() ?? false,
    );
    const held = (await counts(page)).icons;
    console.log('the reading of an unreadable option', { reading, held });

    expect(reading).toBe(true);
    expect(held).toBe(10);
  });
});

test.describe('the bounds of the placement', () => {
  // The scenario "The stack count is capped at a full set".
  test('the stack count is capped at a full set', async ({ page }) => {
    test.setTimeout(120000);
    await openMap(page, `#c=0,0,0&d=1000&p=${PITCH}&y=0`);
    await addCategory(page);
    const added = await page.evaluate(() => {
      const map = window.galaxyMap;
      if (map === undefined) return -1;
      let state = 4711;
      const unit = (): number => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
      };
      const records: SystemRecordInput[] = [];
      for (let index = 0; index < 10000; index += 1) {
        records.push({
          name: `S${index}`,
          coords: {
            x: -200 + unit() * 400,
            y: -30 + unit() * 60,
            z: -200 + unit() * 400,
          },
          primaryCategory: 'Alpha',
          icons: ['titan', 'mission', 'waypoint', 'bookmark'],
        } as SystemRecordInput);
      }
      return map.addSystems(records).added;
    });
    await setView(page, [0, 0, 0], 1000);

    const held = await counts(page);
    console.log('the counts at 10,000 systems with 4 icons each', held);

    expect(added).toBe(10000);
    expect(held.arrows).toBeGreaterThan(0);
    expect(held.arrows).toBeLessThanOrEqual(32);
    expect(held.icons).toBeLessThanOrEqual(128);
  });

  // The scenario "The nearest stacks are the ones kept". The systems run along one
  // axis of the plane from the cursor out, so the range from the camera rises with the
  // index and every marker sits at its own place on the screen.
  test('the nearest 32 of 40 carry a stack', async ({ page }) => {
    const records: Record<string, unknown>[] = [];
    const places: [number, number, number][] = [];
    for (let index = 0; index < 40; index += 1) {
      const place: [number, number, number] = [index * 25, 0, 0];
      places.push(place);
      records.push(record(`S${index}`, place, 'Alpha', ['titan']));
    }
    await openWith(page, records);

    const spots: { x: number; y: number }[] = [];
    for (const place of places) spots.push(await projectOf(page, place));
    const held = await arrows(page);
    const wanted: number[] = [];
    for (let index = 0; index < 40; index += 1) {
      const spot = spots[index] as { x: number; y: number };
      // Every marker is on the screen, and two of them are far enough apart that one
      // arrow answers for one system alone.
      expect(spot.x).toBeGreaterThan(0);
      expect(spot.x).toBeLessThan(1280);
      const carries = held.some(
        (mark) => Math.abs((mark.left + mark.right) / 2 - spot.x) <= 2,
      );
      if (carries) wanted.push(index);
    }
    const gaps = spots
      .slice(1)
      .map((spot, at) => spot.x - (spots[at] as { x: number }).x);
    console.log('the systems that carry a stack', { wanted, gap: Math.min(...gaps) });

    expect(Math.min(...gaps)).toBeGreaterThan(5);
    expect(held).toHaveLength(32);
    expect(wanted).toEqual([...Array(32).keys()]);
  });

  // The scenario "An off-screen system carries no stack". The system sits 1,500 light
  // years from the cursor along the third axis, so it opens near the middle of the
  // screen, and a quarter turn of the camera carries it out of the viewport.
  test('an off-screen system carries no stack', async ({ page }) => {
    const place: [number, number, number] = [0, 0, 1500];
    await openWith(page, [record('One', place, 'Alpha', ['titan'])]);
    const inView = await projectOf(page, place);
    expect((await counts(page)).icons).toBe(1);

    await setView(page, [0, 0, 0], 1000, 90);
    const spot = await projectOf(page, place);
    const held = await counts(page);
    console.log('the counts with the marker off the screen', { inView, spot, held });

    expect(inView.x).toBeGreaterThan(0);
    expect(inView.x).toBeLessThan(1280);
    expect(spot.x < 0 || spot.x > 1280 || spot.y < 0 || spot.y > 720).toBe(true);
    expect(held).toEqual({ icons: 0, arrows: 0 });
  });
});
