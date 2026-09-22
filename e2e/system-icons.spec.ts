// The icon stack over a system marker: its order, its geometry, its arrow, its switch,
// the bounds it holds to and the markers that draw over it.
//
// The stacks draw on the canvas, so this file reads two instruments and no element. The
// placement half reads `iconPlacements()`, which says what the frame placed. The
// occlusion half reads canvas pixels, because the range test runs per pixel on the card
// and no element is ever wholly hidden or wholly shown.
//
// Every view of this file puts its systems at a range of 500 to 1,000 light years, which
// is the plateau of the marker size rule, so the marker is 12 CSS pixels across and the
// offsets below are exact numbers rather than a reading of the size.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { FULL_SET, openMap, readRect } from './helpers';
import type { SystemRecordInput } from '../packages/galaxy-map/src/scene-data/real-systems';
import type { IconPlacement } from '../packages/galaxy-map/src/render/icon-pass';

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

/** The glyph colour of the `titan` symbol, which is its arrow colour as well. */
const TITAN: [number, number, number] = [255, 0, 0];

/** The glyph colour of the `mission` symbol. */
const MISSION: [number, number, number] = [0, 93, 255];

/** The glyph colour of the `front-line` symbol. */
const FRONT_LINE: [number, number, number] = [148, 24, 255];

/** The glyph colour of the `squadron-carrier` symbol. */
const SQUADRON: [number, number, number] = [99, 255, 247];

/**
 * The colour of the category the occlusion tests give the nearer system. No icon of this
 * file draws in green, so a pixel that reads green is the marker and a pixel that reads
 * one of the four colours above is a glyph.
 */
const NEAR_COLOUR: [number, number, number] = [0, 255, 0];

/** How far a channel may stand from a colour and still read as that colour. */
const TOLERANCE = 48;

/** The origin the cross-origin tests read. `playwright.config.ts` starts the server. */
const SECOND_ORIGIN = 'http://localhost:4174';

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
    categories: [category],
    ...(icons === undefined ? {} : { icons }),
  };
}

/** Adds one category that draws at every range. */
async function addCategory(
  page: Page,
  name = 'Alpha',
  color: readonly [number, number, number] = CORE,
  maxDrawRange = 200000,
): Promise<void> {
  await page.evaluate(
    (value) => {
      window.galaxyMap?.addCategories([
        {
          name: value.name,
          color: value.color as [number, number, number],
          maxDrawRange: value.maxDrawRange,
        },
      ]);
    },
    { name, color, maxDrawRange },
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

/** What the last frame placed. */
async function placements(page: Page): Promise<IconPlacement[]> {
  return page.evaluate(() => window.galaxyMap?.debug.iconPlacements() ?? []);
}

/**
 * The icons of the last frame, top of the screen first. The order is the reading order
 * of a stack from its highest icon down, so the last entry of one stack is its lowest.
 */
async function icons(page: Page): Promise<IconPlacement[]> {
  const held = await placements(page);
  return held
    .filter((one) => one.kind === 'icon')
    .sort((one, other) => one.top - other.top);
}

/** The arrows of the last frame, top of the screen first. */
async function arrows(page: Page): Promise<IconPlacement[]> {
  const held = await placements(page);
  return held
    .filter((one) => one.kind === 'arrow')
    .sort((one, other) => one.top - other.top);
}

/** How many icons and arrows the last frame placed. */
async function counts(page: Page): Promise<{ icons: number; arrows: number }> {
  const held = await placements(page);
  return {
    icons: held.filter((one) => one.kind === 'icon').length,
    arrows: held.filter((one) => one.kind === 'arrow').length,
  };
}

/**
 * Draws frames until the frame places the icon count wanted.
 *
 * A vector loads asynchronously and an icon draws only once its texture is ready, so the
 * first frames after a record arrives place fewer icons than the record names. Every
 * test that reads a placement waits here first.
 */
async function settleIcons(page: Page, wanted: number): Promise<void> {
  await expect
    .poll(
      async () => {
        await drawFrame(page);
        return (await counts(page)).icons;
      },
      { timeout: 15000, message: `the frame never placed ${wanted} icons` },
    )
    .toBe(wanted);
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

/** The middle of a placement's box, in CSS pixels. */
function centreOf(box: IconPlacement): { x: number; y: number } {
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/** True where a pixel reads a colour, within the tolerance. */
function reads(
  pixel: readonly number[],
  colour: readonly [number, number, number],
  tolerance = TOLERANCE,
): boolean {
  for (let part = 0; part < 3; part += 1) {
    if (Math.abs((pixel[part] as number) - (colour[part] as number)) > tolerance) {
      return false;
    }
  }
  return true;
}

/** The four bytes of one pixel of the frame, at a CSS pixel. */
async function pixelAt(page: Page, point: { x: number; y: number }): Promise<number[]> {
  return readRect(page, Math.round(point.x), Math.round(point.y), 1, 1);
}

/**
 * How many pixels of a box read a colour. The plate under a glyph is black and the sky
 * behind a far marker is near black, so a reading of "the box is dark" also passes with
 * no icon drawn at all. A count of the glyph's own colour is the reading that separates
 * the two.
 */
async function glyphPixels(
  page: Page,
  box: IconPlacement,
  colour: readonly [number, number, number],
): Promise<number> {
  const bytes = await readRect(
    page,
    Math.round(box.left),
    Math.round(box.top),
    Math.round(box.width),
    Math.round(box.height),
  );
  let found = 0;
  for (let at = 0; at < bytes.length; at += 4) {
    if (reads(bytes.slice(at, at + 3), colour)) found += 1;
  }
  return found;
}

test.describe('the icon stack', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  // The scenario "A stack draws in the record's order".
  test('a stack draws in the order of the record', async ({ page }) => {
    await openWith(page, [
      record('One', [0, 0, 0], 'Alpha', ['titan', 'mission', 'waypoint']),
    ]);
    await settleIcons(page, 3);

    const stack = await icons(page);
    console.log(
      'the stack, top first',
      stack.map((one) => ({ url: one.url, stackIndex: one.stackIndex, top: one.top })),
    );

    expect(stack).toHaveLength(3);
    // The reading runs top of the screen down, so the record's first icon is last.
    expect(stack[2]?.url).toContain('titan');
    expect(stack[1]?.url).toContain('mission');
    expect(stack[0]?.url).toContain('waypoint');
    expect(stack[2]?.stackIndex).toBe(0);
    expect(stack[0]?.stackIndex).toBe(2);
    for (const one of stack) {
      expect(one.width).toBe(ICON_CSS);
      expect(one.height).toBe(ICON_CSS);
      expect(one.systemIndex).toBe(0);
    }
    // Each icon sits one step over the one below it.
    for (let at = 1; at < stack.length; at += 1) {
      const step =
        (stack[at] as IconPlacement).top - (stack[at - 1] as IconPlacement).top;
      expect(Math.abs(step - STEP_CSS)).toBeLessThanOrEqual(1);
    }

    // The plate, so a thin light line of a vector reads against black and not against
    // whatever the camera puts behind the marker. The reading is 4 pixels in from the
    // corner of the box: every vector of the catalogue draws a frame of its own colour
    // around its edge, and that frame covers the outermost pixels of the box.
    for (const one of stack) {
      const plate = await pixelAt(page, { x: one.left + 4, y: one.top + 4 });
      console.log('the plate of', one.url, plate);
      expect(reads(plate, [0, 0, 0], 12)).toBe(true);
    }
  });

  // The scenario "The stack sits at the stated offset".
  test('the stack sits at the stated offset', async ({ page }) => {
    await openWith(page, [record('One', [0, 0, 0], 'Alpha', ['titan'])]);
    await settleIcons(page, 1);

    const marker = await projectOf(page, [0, 0, 0]);
    const stack = await icons(page);
    const icon = stack[0] as IconPlacement;
    console.log('the icon against the marker', { marker, icon });

    expect(stack).toHaveLength(1);
    expect(Math.abs(icon.left + icon.width / 2 - marker.x)).toBeLessThanOrEqual(1);
    expect(
      Math.abs(icon.top + icon.height - (marker.y - LOWEST_BOTTOM_CSS)),
    ).toBeLessThanOrEqual(1);
  });

  // The scenario "Two icons sit two pixels apart".
  test('two icons sit two pixels apart', async ({ page }) => {
    await openWith(page, [record('One', [0, 0, 0], 'Alpha', ['titan', 'mission'])]);
    await settleIcons(page, 2);

    const stack = await icons(page);
    const upper = stack[0] as IconPlacement;
    const lower = stack[1] as IconPlacement;
    console.log('the gap of the stack', { upper, lower });

    expect(stack).toHaveLength(2);
    expect(Math.abs(lower.top - (upper.top + upper.height) - 2)).toBeLessThanOrEqual(1);
  });

  // The scenario "A selection lifts the stack over the pin".
  test('a selection lifts the stack over the pin', async ({ page }) => {
    await openWith(page, [record('One', [0, 0, 0], 'Alpha', ['titan'])]);
    await settleIcons(page, 1);

    const before = (await icons(page))[0] as IconPlacement;
    await page.evaluate(() => {
      window.galaxyMap?.setSelection('One');
    });
    await drawFrame(page);
    const after = (await icons(page))[0] as IconPlacement;
    // The pin is a DOM element of the overlay, which the stacks are not.
    const pin = await page.evaluate(() => {
      const element = document.querySelector('.gm-system-pin');
      if (element === null) return null;
      const box = element.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom };
    });
    console.log('the stack over the pin', { before, after, pin });

    expect(pin).not.toBeNull();
    const lift = before.top + before.height - (after.top + after.height);
    expect(Math.abs(lift - LIFT_CSS)).toBeLessThanOrEqual(1);
    // The two boxes do not overlap: the icon ends above the top of the pin.
    expect(after.top + after.height).toBeLessThanOrEqual((pin?.top ?? 0) + 1);
  });

  // The scenario "The icons go when the marker goes".
  test('the icons go when the category goes', async ({ page }) => {
    await openWith(page, [record('One', [0, 0, 0], 'Alpha', ['titan', 'mission'])]);
    await settleIcons(page, 2);

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

    expect(off).toEqual({ icons: 0, arrows: 0 });
    expect(on).toEqual({ icons: 2, arrows: 1 });
  });

  // The scenario "The stack follows the marker through a camera move". The left drag
  // turns the camera around the cursor at 0.3 degrees a pixel, so 60 pixels is 18
  // degrees. The drag starts away from the marker, so it hovers and selects nothing.
  test('the stack follows the marker through an orbit', async ({ page }) => {
    const place: [number, number, number] = [200, 0, 0];
    await openWith(page, [record('One', place, 'Alpha', ['titan'])]);
    await settleIcons(page, 1);

    const readOffset = async (): Promise<{
      marker: { x: number; y: number };
      bottom: number;
      offset: number;
    }> => {
      const marker = await projectOf(page, place);
      const icon = (await icons(page))[0] as IconPlacement;
      const bottom = icon.top + icon.height;
      return { marker, bottom, offset: marker.y - bottom };
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

  // The scenario "The icon holds its size as the camera comes in".
  test('the icon holds its size as the camera comes in', async ({ page }) => {
    await openWith(page, [record('One', [0, 0, 0], 'Alpha', ['titan'])], 1000);
    await settleIcons(page, 1);

    const sizes: { distance: number; width: number; height: number }[] = [];
    for (const distance of [1000, 200, 40, 10]) {
      await setView(page, [0, 0, 0], distance);
      await drawFrame(page);
      const icon = (await icons(page))[0] as IconPlacement;
      sizes.push({ distance, width: icon.width, height: icon.height });
    }
    console.log('the icon through the approach', sizes);

    for (const size of sizes) {
      expect(size.width).toBe(ICON_CSS);
      expect(size.height).toBe(ICON_CSS);
    }
  });

  // The scenario "A camera move leaves the icon on whole pixels". The pass copies one
  // texel to one pixel, and at a fraction of a pixel the card samples the texture at a
  // new phase in every frame, which makes the glyph shake while the camera moves. The
  // device pixel ratio of this file is 1, so a CSS pixel is a device pixel here.
  test('an orbit leaves the icon on whole pixels', async ({ page }) => {
    const place: [number, number, number] = [200, 0, 0];
    await openWith(page, [record('One', place, 'Alpha', ['titan'])]);
    await settleIcons(page, 1);
    const ratio = await page.evaluate(() => window.devicePixelRatio);

    const places: { left: number; top: number }[] = [];
    await page.mouse.move(200, 600);
    await page.mouse.down();
    for (let step = 0; step < 30; step += 1) {
      await page.mouse.move(200 + step * 3, 600);
      await drawFrame(page);
      const icon = (await icons(page))[0] as IconPlacement;
      places.push({ left: icon.left * ratio, top: icon.top * ratio });
    }
    await page.mouse.up();

    const fractions = places.filter(
      (spot) => spot.left % 1 !== 0 || spot.top % 1 !== 0,
    );
    console.log('the icon through the orbit', {
      ratio,
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
    await settleIcons(page, 4);

    const marker = await projectOf(page, [0, 0, 0]);
    const stack = await icons(page);
    const at = centreOf(stack[1] as IconPlacement);
    // The element under that point is the canvas: the stacks are pixels of the frame and
    // hold no element that could take a pointer event.
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

  // The scenario "The glyph draws the way the browser draws the vector". Every other icon
  // reading of this file counts a colour or reads a corner, and a turned glyph holds both
  // of those, so this is the one reading that sees the way up. It compares the drawn box
  // with the browser's own drawing of the same vector at the same side.
  test('the glyph draws the way the browser draws the vector', async ({ page }) => {
    // `waypoint` is asymmetric about the horizontal axis, so a turn moves its pixels.
    await openWith(page, [record('One', [0, 0, 0], 'Alpha', ['waypoint'])]);
    await settleIcons(page, 1);

    const icon = (await icons(page))[0] as IconPlacement;
    const reading = await page.evaluate(async (box) => {
      const map = window.__galaxyMap;
      if (map?.readRect === undefined) return null;
      const side = Math.round(box.width);
      const frame = map.readRect(Math.round(box.left), Math.round(box.top), side, side);
      // The browser's own drawing of the vector, at the side the pass rasterises at. The
      // ratio is 1 here, so one texel of the layer meets one pixel of the quad.
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = box.url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = side;
      canvas.height = side;
      const context = canvas.getContext('2d');
      if (context === null) return null;
      context.clearRect(0, 0, side, side);
      context.drawImage(image, 0, 0, side, side);
      const source = context.getImageData(0, 0, side, side).data;

      // The pass draws the glyph's own colour weighted by its coverage over a black
      // plate, so the reading composes the source the same way before it compares.
      const differs = (at: number, from: number): boolean => {
        const alpha = (source[from + 3] as number) / 255;
        for (let part = 0; part < 3; part += 1) {
          const want = Math.round((source[from + part] as number) * alpha);
          if (Math.abs((frame[at + part] as number) - want) > 16) return true;
        }
        return false;
      };
      let asDrawn = 0;
      let turned = 0;
      for (let row = 0; row < side; row += 1) {
        for (let column = 0; column < side; column += 1) {
          const at = (row * side + column) * 4;
          if (differs(at, at)) asDrawn += 1;
          if (differs(at, ((side - 1 - row) * side + column) * 4)) turned += 1;
        }
      }
      return { side, pixels: side * side, asDrawn, turned };
    }, icon);
    console.log('the glyph against the browser drawing', reading);

    expect(reading).not.toBeNull();
    const held = reading as {
      side: number;
      pixels: number;
      asDrawn: number;
      turned: number;
    };
    expect(held.side).toBe(ICON_CSS);
    // The count as they are is the lower of the two. The second reading guards the first:
    // a vector the turn does not move would read the same either way up, and both counts
    // would then be the same.
    expect(held.asDrawn).toBeLessThan(held.turned);
    expect(held.turned).toBeGreaterThan(0);
  });

  // The scenario "The nearer stack draws over the further one". Both systems sit on the
  // line from the camera through the cursor, so the two stacks land on one pixel and
  // cover each other. The icons are opaque, so the nearer one takes the pixel.
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
    await settleIcons(page, 2);

    const stack = await icons(page);
    const far = stack.find((one) => one.url.includes('titan')) as IconPlacement;
    const close = stack.find((one) => one.url.includes('mission')) as IconPlacement;
    console.log('the two stacks', { far, close });

    // The two cover each other, or the draw order would decide nothing on the screen.
    expect(Math.abs(close.left - far.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(close.top - far.top)).toBeLessThan(ICON_CSS);
    // The nearer stack is the last one drawn, so it holds the pixels the two share.
    const overlap: IconPlacement = {
      ...close,
      top: Math.max(close.top, far.top),
      height:
        Math.min(close.top + close.height, far.top + far.height) -
        Math.max(close.top, far.top),
    };
    const nearPixels = await glyphPixels(page, overlap, MISSION);
    const farPixels = await glyphPixels(page, overlap, TITAN);
    console.log('the pixels where the stacks cross', { nearPixels, farPixels });

    expect(overlap.height).toBeGreaterThan(4);
    expect(nearPixels).toBeGreaterThan(0);
    expect(farPixels).toBe(0);
  });

  // The scenario "A nearer stack's icon draws over a further stack's arrow". The two
  // stacks sit on one line of sight, and the further system stands a little higher on
  // the screen, so its arrow falls inside the nearer system's icon plate. One draw call
  // orders the arrow with the icons of its own stack, so the plate takes the pixels.
  test('a nearer stack icon draws over a further stack arrow', async ({ page }) => {
    const distance = 1000;
    const camera = cameraAt(distance);
    // 0.4 of the way from the cursor to the camera leaves the near system inside the
    // plateau of the marker size rule, as the test above does.
    const near: [number, number, number] = [
      camera[0] * 0.4,
      camera[1] * 0.4,
      camera[2] * 0.4,
    ];

    await openMap(page, `#c=0,0,0&d=${distance}&p=${PITCH}&y=0`);
    await addCategory(page);
    await setView(page, [0, 0, 0], distance);
    // How far the screen moves for one light year of height at the cursor. The arrow of
    // the further stack has to land inside the plate of the nearer one, which is 28 CSS
    // pixels tall, so the lift is read from the frame and not guessed.
    const base = await projectOf(page, [0, 0, 0]);
    const lifted = await projectOf(page, [0, 100, 0]);
    const perLightYear = (base.y - lifted.y) / 100;
    const height = 8 / perLightYear;

    expect(
      await addSystems(page, [
        record('Far', [0, height, 0], 'Alpha', ['titan']),
        record('Near', near, 'Alpha', ['mission']),
      ]),
    ).toBe(2);
    await setView(page, [0, 0, 0], distance);
    await settleIcons(page, 2);

    const plate = (await icons(page)).find((one) =>
      one.url.includes('mission'),
    ) as IconPlacement;
    const held = await arrows(page);
    // An arrow takes the colour of the lowest icon of its own stack, so the two arrows
    // of this frame are told apart by their fill.
    const farArrow = held.find((one) => one.color[0] === TITAN[0]) as
      IconPlacement | undefined;
    const nearArrow = held.find((one) => one.color[2] === MISSION[2]) as IconPlacement;
    console.log('the arrow of the further stack on the nearer plate', {
      plate,
      farArrow,
      nearArrow,
    });

    // The arrow of the further stack lies inside the plate of the nearer one, or the
    // draw order would decide nothing on the screen.
    expect(farArrow).toBeDefined();
    const arrow = farArrow as IconPlacement;
    expect(arrow.top).toBeGreaterThanOrEqual(plate.top);
    expect(arrow.top + arrow.height).toBeLessThanOrEqual(plate.top + plate.height);
    expect(arrow.left).toBeGreaterThanOrEqual(plate.left);
    expect(arrow.left + arrow.width).toBeLessThanOrEqual(plate.left + plate.width);

    const arrowPixels = await glyphPixels(page, plate, TITAN);
    const glyph = await glyphPixels(page, plate, MISSION);
    // The arrow of the nearer stack draws under its own plate and nothing covers it, so
    // a reading of zero there would mean no arrow drew in this frame at all.
    const nearArrowPixels = await glyphPixels(page, nearArrow, MISSION);
    console.log('the pixels of the plate', { arrowPixels, glyph, nearArrowPixels });

    expect(arrowPixels).toBe(0);
    expect(glyph).toBeGreaterThan(0);
    expect(nearArrowPixels).toBeGreaterThan(0);
  });
});

test.describe('the arrow under the lowest icon', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  // The scenario "One arrow draws under a stack of four".
  test('one arrow draws under a stack of four', async ({ page }) => {
    await openWith(page, [
      record('One', [0, 0, 0], 'Alpha', ['titan', 'mission', 'waypoint', 'bookmark']),
    ]);
    await settleIcons(page, 4);

    const marker = await projectOf(page, [0, 0, 0]);
    const arrow = (await arrows(page))[0] as IconPlacement;
    console.log('the arrow of a stack of four', { marker, arrow });

    expect(await counts(page)).toEqual({ icons: 4, arrows: 1 });
    expect(Math.abs(arrow.left + arrow.width / 2 - marker.x)).toBeLessThanOrEqual(1);
    expect(arrow.stackIndex).toBe(0);
    expect(arrow.url).toBe('');
  });

  // The scenario "The arrow takes the lowest icon's colour".
  test('the arrow takes the colour of the lowest icon', async ({ page }) => {
    await openWith(page, [
      record('First', [-200, 0, 0], 'Alpha', ['titan', 'mission']),
      record('Second', [200, 0, 0], 'Alpha', ['mission', 'titan']),
    ]);
    await settleIcons(page, 4);

    const held = await arrows(page);
    const byX = [...held].sort((one, other) => one.left - other.left);
    const first = (byX[0] as IconPlacement).color;
    const second = (byX[1] as IconPlacement).color;
    console.log('the two arrow fills', { first, second });

    expect(held).toHaveLength(2);
    expect(first).toEqual(TITAN);
    expect(second).toEqual(MISSION);

    // The fill reaches the frame. The arrow is 8 by 5 with its apex down, so the pixel
    // one row under its top edge and on its middle is inside the triangle.
    const middle = byX[0] as IconPlacement;
    const pixel = await pixelAt(page, {
      x: middle.left + middle.width / 2,
      y: middle.top + 1,
    });
    console.log('the pixel of the first arrow', pixel);
    expect(reads(pixel, TITAN)).toBe(true);
  });

  // The scenario "The arrow takes a host icon's colour". The demo site serves the
  // drawing itself, so the icon is the host form with no built-in symbol behind it.
  test('the arrow takes the colour of a host icon', async ({ page }) => {
    await openWith(page, [
      record('One', [0, 0, 0], 'Alpha', [
        { url: 'demo-images/ruins-site.svg', color: [0, 205, 247] },
      ]),
    ]);
    await settleIcons(page, 1);

    const held = await arrows(page);
    const stack = await icons(page);
    console.log('the host icon and its arrow', {
      fill: held[0]?.color,
      url: stack[0]?.url,
    });

    expect(held).toHaveLength(1);
    expect(stack[0]?.url).toContain('demo-images/ruins-site.svg');
    expect(held[0]?.color).toEqual([0, 205, 247]);
  });

  // The scenario "The apex points at the marker".
  test('the apex points at the marker', async ({ page }) => {
    await openWith(page, [record('One', [0, 0, 0], 'Alpha', ['titan'])]);
    await settleIcons(page, 1);

    const marker = await projectOf(page, [0, 0, 0]);
    const arrow = (await arrows(page))[0] as IconPlacement;
    const icon = (await icons(page))[0] as IconPlacement;
    console.log('the apex against the marker', { marker, arrow, icon });

    expect(
      Math.abs(arrow.top + arrow.height - (marker.y - APEX_CSS)),
    ).toBeLessThanOrEqual(1);
    expect(arrow.height).toBe(5);
    expect(arrow.width).toBe(8);
    // The top of the arrow meets the bottom of the lowest icon.
    expect(Math.abs(arrow.top - (icon.top + icon.height))).toBeLessThanOrEqual(1);
  });

  // The scenario "A system with no icon carries no arrow".
  test('a system with no icon carries no arrow', async ({ page }) => {
    await openWith(page, [record('One', [0, 0, 0], 'Alpha')]);
    await drawFrame(page);

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

  // The scenario "The switch turns the icons off and on", and the scenario "A frame with
  // no stack reports nothing".
  test('the switch turns the icons off and on', async ({ page }) => {
    await openWith(page, fiveWithTwo());
    await settleIcons(page, 10);

    const first = await counts(page);
    await setSwitch(page, false);
    const second = await counts(page);
    const empty = await placements(page);
    await setSwitch(page, true);
    const third = await counts(page);
    console.log('the icon counts over the switch', { first, second, third });

    expect(first.icons).toBe(10);
    expect(second).toEqual({ icons: 0, arrows: 0 });
    expect(empty).toEqual([]);
    expect(third.icons).toBe(10);
  });

  // The scenario "The switch holds over the hover and the selection".
  test('the switch holds over the hover and the selection', async ({ page }) => {
    await openWith(page, fiveWithTwo());
    await settleIcons(page, 10);
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
   * so the placements of the document are the placements of this map alone.
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
          categories: ['Alpha'],
          icons: ['titan', 'mission'],
        });
      }
      map.addSystems(records as never);
    }, options);
  }

  /** How many icons the map of the test placed in its last frame. */
  async function mapIcons(page: Page): Promise<number> {
    return page.evaluate(
      () =>
        (window.__iconsMap?.debug.iconPlacements() ?? []).filter(
          (one) => one.kind === 'icon',
        ).length,
    );
  }

  /** Draws frames of the map of the test until it places the count wanted. */
  async function settleMapIcons(page: Page, wanted: number): Promise<void> {
    await expect
      .poll(
        async () => {
          await page.evaluate(() => {
            window.__iconsMap?.debug.drawNow();
          });
          return mapIcons(page);
        },
        { timeout: 15000 },
      )
      .toBe(wanted);
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
    // Four frames, so a map that draws its stacks late still draws them here.
    for (let frame = 0; frame < 4; frame += 1) {
      await page.evaluate(() => {
        window.__iconsMap?.debug.drawNow();
      });
    }
    const off = {
      reading: await page.evaluate(
        () => window.__iconsMap?.areSystemIconsVisible() ?? true,
      ),
      icons: await mapIcons(page),
    };
    await dropIconsMap(page);

    await buildIconsMap(page, {});
    await settleMapIcons(page, 10);
    const on = {
      reading: await page.evaluate(
        () => window.__iconsMap?.areSystemIconsVisible() ?? false,
      ),
      icons: await mapIcons(page),
    };
    console.log('the two maps of the option', { off, on });

    expect(off).toEqual({ reading: false, icons: 0 });
    expect(on).toEqual({ reading: true, icons: 10 });
  });

  // The scenario "An unreadable option keeps the icons on".
  test('an unreadable option keeps the icons on', async ({ page }) => {
    await openMap(page);
    await buildIconsMap(page, { systemIcons: 'no' });
    await settleMapIcons(page, 10);

    const reading = await page.evaluate(
      () => window.__iconsMap?.areSystemIconsVisible() ?? false,
    );
    const held = await mapIcons(page);
    console.log('the reading of an unreadable option', { reading, held });

    expect(reading).toBe(true);
    expect(held).toBe(10);
  });
});

test.describe('the bounds of the placement', () => {
  // The scenarios "The stack count is capped at a full set", "The draw calls are capped
  // at a full set" and "No icon reaches the DOM".
  test('the stack count and the draw calls are capped at a full set', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await openMap(page, `#c=0,0,0&d=1000&p=${PITCH}&y=0`);
    await addCategory(page);
    const added = await page.evaluate((total: number) => {
      const map = window.galaxyMap;
      if (map === undefined) return -1;
      let state = 4711;
      const unit = (): number => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
      };
      const records: SystemRecordInput[] = [];
      for (let index = 0; index < total; index += 1) {
        records.push({
          name: `S${index}`,
          coords: {
            x: -200 + unit() * 400,
            y: -30 + unit() * 60,
            z: -200 + unit() * 400,
          },
          categories: ['Alpha'],
          icons: ['titan', 'mission', 'waypoint', 'bookmark'],
        } as SystemRecordInput);
      }
      return map.addSystems(records).added;
    }, FULL_SET);
    await setView(page, [0, 0, 0], 1000);
    await settleIcons(page, 128);

    const held = await counts(page);
    const calls = await page.evaluate(
      () => window.galaxyMap?.debug.iconDrawCalls() ?? -1,
    );
    const elements = await page.evaluate(() => ({
      icons: document.querySelectorAll('.gm-system-icon').length,
      arrows: document.querySelectorAll('.gm-system-arrow').length,
      layers: document.querySelectorAll('.gm-system-stacks').length,
    }));
    console.log('the bounds at a full set with 4 icons each', {
      held,
      calls,
      elements,
    });

    expect(added).toBe(FULL_SET);
    expect(held.arrows).toBeGreaterThan(0);
    expect(held.arrows).toBeLessThanOrEqual(32);
    expect(held.icons).toBeLessThanOrEqual(128);
    expect(calls).toBeLessThanOrEqual(1);
    expect(calls).toBeGreaterThan(0);
    // The stacks are pixels of the frame, so the overlay holds nothing of them.
    expect(elements).toEqual({ icons: 0, arrows: 0, layers: 0 });
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
    await settleIcons(page, 32);

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
        (one) => Math.abs(one.left + one.width / 2 - spot.x) <= 2,
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
    await settleIcons(page, 1);
    const inView = await projectOf(page, place);

    await setView(page, [0, 0, 0], 1000, 90);
    const spot = await projectOf(page, place);
    const held = await counts(page);
    console.log('the counts with the marker off the screen', { inView, spot, held });

    expect(inView.x).toBeGreaterThan(0);
    expect(inView.x).toBeLessThan(1280);
    expect(spot.x < 0 || spot.x > 1280 || spot.y < 0 || spot.y > 720).toBe(true);
    expect(held).toEqual({ icons: 0, arrows: 0 });
  });

  // The scenario "A 65th distinct vector does not draw". The texture array holds 64
  // layers and a layer is taken by the frame that first places its URL, so the 65 URLs
  // arrive over three views of 22, 22 and 21 systems. Each view holds fewer than the 32
  // stacks the pass keeps, so every system of a view places its own icon.
  test('a 65th distinct vector does not draw', async ({ page }) => {
    test.setTimeout(120000);
    const warnings: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'warning') warnings.push(message.text());
    });

    // A draw range of 5,000 light years, so the groups below leave each other's frame.
    // The groups stand 20,000 light years apart, and the model bounds hold them all.
    await openMap(page, `#c=0,0,0&d=1000&p=${PITCH}&y=0`);
    await addCategory(page, 'Alpha', CORE, 5000);

    const groups = [22, 22, 21];
    const records: Record<string, unknown>[] = [];
    let made = 0;
    groups.forEach((size, group) => {
      for (let index = 0; index < size; index += 1) {
        records.push(
          record(`S${made}`, [group * 20000 + index * 25, 0, 0], 'Alpha', [
            { url: `${SECOND_ORIGIN}/cors/v${made}.svg`, color: [255, 0, 255] },
          ]),
        );
        made += 1;
      }
    });
    expect(made).toBe(65);
    expect(await addSystems(page, records)).toBe(65);

    const drawn: number[] = [];
    for (let group = 0; group < groups.length; group += 1) {
      await setView(page, [group * 20000, 0, 0], 1000);
      // The last group asks for the 65th URL, which takes no layer and draws nothing.
      const wanted =
        group === 2 ? (groups[group] as number) - 1 : (groups[group] as number);
      await settleIcons(page, wanted);
      drawn.push((await counts(page)).icons);
    }
    const capWarnings = warnings.filter((text) => text.includes('distinct icon'));
    console.log('the icons of the three groups', { drawn, capWarnings });

    expect(drawn).toEqual([22, 22, 20]);
    expect(capWarnings).toHaveLength(1);
    // The pass asks for a layer as it places, and it places the furthest stack first, so
    // the URL that meets the full array is the one of the system nearest the camera.
    // That is the first record of the last group, which sits at the cursor.
    expect(capWarnings[0]).toContain('v44.svg');
  });
});

// The requirement "The library loads an icon vector as a cross-origin image". The second
// origin of `e2e/fixtures/icon-origin-server.mjs` serves one vector with the header and
// the same vector without it.
test.describe('an icon on a second origin', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  /** What the second origin has answered for each path. */
  async function serverRequests(page: Page): Promise<Record<string, number>> {
    return page.evaluate(async (origin) => {
      const answer = await fetch(`${origin}/requests`, { cache: 'no-store' });
      return (await answer.json()) as Record<string, number>;
    }, SECOND_ORIGIN);
  }

  // The scenario "A cross-origin icon with the header draws".
  test('an icon with the header draws', async ({ page }) => {
    const url = `${SECOND_ORIGIN}/cors/draws.svg`;
    await openWith(page, [
      record('One', [0, 0, 0], 'Alpha', [{ url, color: [255, 0, 255] }]),
    ]);
    await settleIcons(page, 1);

    const stack = await icons(page);
    const pixels = await glyphPixels(page, stack[0] as IconPlacement, [255, 0, 255]);
    console.log('the cross-origin icon with the header', { stack, pixels });

    expect(stack).toHaveLength(1);
    expect(stack[0]?.url).toBe(url);
    expect(pixels).toBeGreaterThan(0);
  });

  // The scenarios "A cross-origin icon with no header does not draw" and "A refused URL
  // is tried once".
  test('an icon with no header does not draw and is asked for once', async ({
    page,
  }) => {
    const path = '/no-cors/refused.svg';
    const url = `${SECOND_ORIGIN}${path}`;
    const warnings: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'warning') warnings.push(message.text());
    });

    // The load of a vector starts as its record arrives, so the count of the second
    // origin is read before the record goes in.
    await openMap(page, `#c=0,0,0&d=1000&p=${PITCH}&y=0`);
    await addCategory(page);
    const before = await serverRequests(page);
    expect(
      await addSystems(page, [
        record('One', [0, 0, 0], 'Alpha', ['titan', { url, color: [255, 0, 255] }]),
      ]),
    ).toBe(1);
    await setView(page, [0, 0, 0], 1000);
    // The built-in icon draws and the refused one never does, so the count settles at 1.
    await settleIcons(page, 1);
    for (let frame = 0; frame < 30; frame += 1) await drawFrame(page);

    const stack = await icons(page);
    const held = await counts(page);
    const after = await serverRequests(page);
    const asked = (after[path] ?? 0) - (before[path] ?? 0);
    const refusals = warnings.filter((text) => text.includes(path));
    console.log('the cross-origin icon with no header', {
      held,
      asked,
      refusals,
      url: stack[0]?.url,
    });

    // The stack holds the built-in icon and its arrow, and holds no second icon.
    expect(held).toEqual({ icons: 1, arrows: 1 });
    expect(stack[0]?.url).toContain('titan');
    expect(refusals).toHaveLength(1);
    expect(asked).toBe(1);
  });
});

// The requirement "A nearer marker draws over an icon". The reading is the frame itself:
// the range test runs per pixel on the card, so an element is never wholly hidden or
// wholly shown, and a nearer marker cuts its own shape out of the icon over it.
test.describe('a nearer marker draws over an icon', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  /** The distance every view of this group takes. */
  const VIEW = 1000;

  /** How far the system that carries the stack stands from the camera. */
  const FAR = 4000;

  /**
   * A point at a range from the camera, offset across the screen and up it. The camera
   * looks along `(0, -sin p, cos p)` at a yaw of 0, the screen's right is the world `x`
   * axis and the screen's up is `(0, cos p, sin p)`.
   */
  function atScreen(
    distance: number,
    range: number,
    right: number,
    up: number,
  ): [number, number, number] {
    const pitch = (PITCH * Math.PI) / 180;
    const camera = cameraAt(distance);
    return [
      camera[0] + right,
      camera[1] - Math.sin(pitch) * range + Math.cos(pitch) * up,
      camera[2] + Math.cos(pitch) * range + Math.sin(pitch) * up,
    ];
  }

  /**
   * The focal length of the view in CSS pixels, read from the frame itself rather than
   * from the projection's own numbers. A point `u` light years up from the view axis at
   * a range `r` draws `focal * u / r` pixels over the centre.
   */
  async function focalPixels(
    page: Page,
  ): Promise<{ focal: number; cx: number; cy: number }> {
    const centre = await projectOf(page, atScreen(VIEW, FAR, 0, 0));
    const up = await projectOf(page, atScreen(VIEW, FAR, 0, 100));
    return { focal: ((centre.y - up.y) * FAR) / 100, cx: centre.x, cy: centre.y };
  }

  /** A point at a range from the camera that draws at a pixel of the frame. */
  function atPixel(
    view: { focal: number; cx: number; cy: number },
    range: number,
    x: number,
    y: number,
  ): [number, number, number] {
    return atScreen(
      VIEW,
      range,
      ((x - view.cx) * range) / view.focal,
      ((view.cy - y) * range) / view.focal,
    );
  }

  /**
   * A point at an exact range from the camera that draws at a pixel of the frame.
   * `atPixel` measures its range along the view axis and then steps across the screen,
   * which leaves the point a little further out. The test below compares two ranges
   * inside a bias of a hundred-thousandth, so it takes the point on that same ray whose
   * range from the camera is the number given.
   */
  function atRange(
    view: { focal: number; cx: number; cy: number },
    range: number,
    spot: { x: number; y: number },
  ): [number, number, number] {
    const camera = cameraAt(VIEW);
    const point = atPixel(view, range, spot.x, spot.y);
    const offset = [
      point[0] - camera[0],
      point[1] - camera[1],
      point[2] - camera[2],
    ] as const;
    const scale = range / Math.hypot(offset[0], offset[1], offset[2]);
    return [
      camera[0] + offset[0] * scale,
      camera[1] + offset[1] * scale,
      camera[2] + offset[2] * scale,
    ];
  }

  /** Opens the map with one system that carries a stack, on the view axis. */
  async function openStack(page: Page, symbols: readonly string[]): Promise<void> {
    await openMap(page, `#c=0,0,0&d=${VIEW}&p=${PITCH}&y=0`);
    await addCategory(page);
    // The nearer system takes a category of its own, in a colour no icon draws in.
    await addCategory(page, 'Near', NEAR_COLOUR);
    expect(
      await addSystems(page, [
        record('Far', atScreen(VIEW, FAR, 0, 0), 'Alpha', symbols),
      ]),
    ).toBe(1);
    await setView(page, [0, 0, 0], VIEW);
    await settleIcons(page, symbols.length);
  }

  /** Adds one system with no icon at a pixel of the frame, and draws a frame. */
  async function addNearAt(
    page: Page,
    range: number,
    spot: { x: number; y: number },
  ): Promise<[number, number, number]> {
    const view = await focalPixels(page);
    const place = atPixel(view, range, spot.x, spot.y);
    expect(await addSystems(page, [record('Near', place, 'Near')])).toBe(1);
    await drawFrame(page);
    return place;
  }

  // The scenario "A nearer marker cuts through the icon over it".
  test('a nearer marker cuts through the icon over it', async ({ page }) => {
    await openStack(page, ['titan']);
    const icon = (await icons(page))[0] as IconPlacement;
    const target = centreOf(icon);
    await addNearAt(page, 40, target);

    const centre = await pixelAt(page, target);
    const glyph = await glyphPixels(page, icon, TITAN);
    console.log('the cut icon', { target, centre, glyph });

    // The marker took the pixel it covers, and the rest of the icon still draws.
    expect(reads(centre, NEAR_COLOUR)).toBe(true);
    expect(glyph).toBeGreaterThan(0);
  });

  // The scenario "A further marker hides nothing".
  test('a further marker hides nothing', async ({ page }) => {
    await openStack(page, ['titan']);
    const icon = (await icons(page))[0] as IconPlacement;
    const target = centreOf(icon);
    await addNearAt(page, 8000, target);

    const centre = await pixelAt(page, target);
    const glyph = await glyphPixels(page, icon, TITAN);
    console.log('the further marker', { target, centre, glyph });

    expect(reads(centre, NEAR_COLOUR)).toBe(false);
    expect(glyph).toBeGreaterThan(0);
  });

  // The scenario "Only the covered part of a stack goes".
  test('only the covered part of a stack goes', async ({ page }) => {
    await openStack(page, ['titan', 'mission', 'front-line', 'squadron-carrier']);
    // The reading runs top of the screen down, so the record's third icon is the second
    // of the four.
    const before = await icons(page);
    expect(before).toHaveLength(4);
    const third = before[1] as IconPlacement;
    const target = centreOf(third);
    await addNearAt(page, 40, target);

    const stack = await icons(page);
    const colours = [TITAN, MISSION, FRONT_LINE, SQUADRON];
    const found: number[] = [];
    for (let at = 0; at < 4; at += 1) {
      const box = stack[3 - at] as IconPlacement;
      found.push(await glyphPixels(page, box, colours[at] as [number, number, number]));
    }
    const arrow = (await arrows(page))[0] as IconPlacement;
    const arrowPixel = await pixelAt(page, {
      x: arrow.left + arrow.width / 2,
      y: arrow.top + 1,
    });
    const centre = await pixelAt(page, target);
    console.log('the covered icon of a stack', { found, arrowPixel, centre });

    for (const count of found) expect(count).toBeGreaterThan(0);
    expect(reads(arrowPixel, TITAN)).toBe(true);
    expect(reads(centre, NEAR_COLOUR)).toBe(true);
  });

  // The scenario "The arrow follows the same rule".
  test('the arrow follows the same rule', async ({ page }) => {
    await openStack(page, ['titan']);
    const arrow = (await arrows(page))[0] as IconPlacement;
    const target = { x: arrow.left + arrow.width / 2, y: arrow.top + 1 };
    await addNearAt(page, 40, target);

    const pixel = await pixelAt(page, target);
    console.log('the covered arrow', { target, pixel });

    expect(reads(pixel, NEAR_COLOUR)).toBe(true);
    expect(reads(pixel, TITAN)).toBe(false);
  });

  /**
   * The range the range buffer holds at a pixel, in light years. A pixel where no marker
   * body drew reads a value above every drawable range.
   */
  async function rangeAt(page: Page, spot: { x: number; y: number }): Promise<number> {
    const held = await page.evaluate(
      (where) =>
        window.galaxyMap?.debug.readRange(Math.round(where.x), Math.round(where.y)) ??
        null,
      spot,
    );
    expect(held).not.toBeNull();
    return held as number;
  }

  // The scenario "A marker at the stack's own range cuts nothing". Two systems stand at
  // one range from the camera, inside the bias the fragment compares with, and the second
  // one projects inside the first one's icon box.
  //
  // A system's own marker cannot reach its own stack: the body of a `glow` sprite holds
  // under 0.41 of the marker size from its centre and the arrow apex stands half the
  // marker size and 2 pixels over it. A test written on one system therefore passes with
  // the comparison deleted. Two systems inside the bias read the same comparison and can
  // fail: with the bias at 0 the second marker cuts its shape out of the icon.
  test('a marker at the stack own range cuts nothing', async ({ page }) => {
    // The pair stands at 600 light years, which is the plateau of the marker size rule,
    // so the second marker is 12 CSS pixels across and reads its category colour.
    const pairRange = 600;
    // The bias of the pass, as `ICON_RANGE_BIAS` states it. A value import would pull the
    // pass and its shaders through Playwright's transform, which reads no `?raw`.
    const bias = 1e-5;

    await openMap(page, `#c=0,0,0&d=${VIEW}&p=${PITCH}&y=0`);
    await addCategory(page);
    await addCategory(page, 'Near', NEAR_COLOUR);
    const stack = atScreen(VIEW, pairRange, 0, 0);
    expect(await addSystems(page, [record('Far', stack, 'Alpha', ['titan'])])).toBe(1);
    await setView(page, [0, 0, 0], VIEW);
    await settleIcons(page, 1);

    const icon = (await icons(page))[0] as IconPlacement;
    const target = centreOf(icon);
    const view = await focalPixels(page);
    // The range the card measures to the system that carries the stack, read at its own
    // marker. The two numbers the fragment compares are both written by the card, so the
    // test places the second system against this reading and not against its own
    // arithmetic: the difference between the reading and the modelled 600 is the part of
    // the camera the model of this file does not hold.
    const stackRange = await rangeAt(page, await projectOf(page, stack));
    // The second system stands nearer by half the bias, which is 3 thousandths of a light
    // year here. That is near enough that a comparison with no bias hides the icon, and
    // far enough that the bias leaves it alone. Both margins are about 40 times the
    // `float32` step at this range, so neither reading turns on a rounding.
    const wanted = stackRange * (1 - bias / 2);
    const inside = atRange(view, wanted - (stackRange - pairRange), target);
    // The third system draws beside the box at the same range. It is the control: it says
    // that a marker of this category at this range draws its colour on the frame at all,
    // so a count of 0 inside the box is the plate over the marker and not a marker that
    // never drew.
    const beside = atRange(view, pairRange, { x: icon.left - 24, y: target.y });
    expect(
      await addSystems(page, [
        record('Inside', inside, 'Near'),
        record('Beside', beside, 'Near'),
      ]),
    ).toBe(2);
    await drawFrame(page);

    const marker = await projectOf(page, inside);
    const control = await projectOf(page, beside);
    const nearRange = await rangeAt(page, target);
    const glyph = await glyphPixels(page, icon, TITAN);
    const green = await glyphPixels(page, icon, NEAR_COLOUR);
    const besideGreen = await glyphPixels(
      page,
      { ...icon, left: control.x - 8, top: control.y - 8, width: 16, height: 16 },
      NEAR_COLOUR,
    );
    console.log('the marker at the stack own range', {
      stackRange,
      nearRange,
      marker,
      glyph,
      green,
      besideGreen,
    });

    // The second marker draws inside the box, or the reading below covers nothing.
    expect(marker.x).toBeGreaterThan(icon.left);
    expect(marker.x).toBeLessThan(icon.left + icon.width);
    expect(marker.y).toBeGreaterThan(icon.top);
    expect(marker.y).toBeLessThan(icon.top + icon.height);
    expect(besideGreen).toBeGreaterThan(0);
    // The body of the second marker holds the pixel, and its range stands under the
    // stack's own and inside the bias. This is the comparison the fragment makes: with
    // the bias the icon draws, and without it the marker cuts through.
    expect(nearRange).toBeLessThan(stackRange);
    expect(nearRange).toBeGreaterThan(stackRange * (1 - bias));

    expect(glyph).toBeGreaterThan(0);
    expect(green).toBe(0);
  });

  // The scenario "The cut goes when the marker moves away". An orbit moves the near
  // marker much further across the screen than the far one, because the screen offset of
  // a point is its offset from the view axis over its range.
  test('the cut goes when the marker moves away', async ({ page }) => {
    await openStack(page, ['titan']);
    const icon = (await icons(page))[0] as IconPlacement;
    const target = centreOf(icon);
    const near = await addNearAt(page, 40, target);
    expect(reads(await pixelAt(page, target), NEAR_COLOUR)).toBe(true);

    await setView(page, [0, 0, 0], VIEW, 3);
    const moved = (await icons(page))[0] as IconPlacement;
    const marker = await projectOf(page, near);
    const green = await glyphPixels(page, moved, NEAR_COLOUR);
    const glyph = await glyphPixels(page, moved, TITAN);
    console.log('the marker moved away', { marker, moved, green, glyph });

    expect(marker.x < moved.left || marker.x > moved.left + moved.width).toBe(true);
    expect(green).toBe(0);
    expect(glyph).toBeGreaterThan(0);
  });
});

// `hasSystemIcons()` is the reading the HUD takes to decide whether a **System icons**
// switch would move anything. The reading rises with the first record that names an icon
// and falls only on a clear.
test.describe('the icon reading of the handle', () => {
  /** Builds a map with no record, so the test adds its own. */
  async function buildBareMap(page: Page): Promise<void> {
    await page.evaluate(async () => {
      const factory = window.galaxyMapFactory;
      if (factory === undefined) throw new Error('The page has no map factory.');
      window.galaxyMap?.dispose();
      const wrap = document.createElement('div');
      wrap.id = 'reading-wrap';
      wrap.style.cssText = 'position: absolute; inset: 0;';
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'display: block; width: 100%; height: 100%;';
      wrap.appendChild(canvas);
      document.body.appendChild(wrap);
      const map = factory(canvas, {} as never);
      window.__iconsMap = map;
      await map.ready;
      map.addCategories([
        { name: 'Alpha', color: [153, 230, 255], maxDrawRange: 200000 },
      ]);
    });
  }

  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      window.__iconsMap?.dispose();
      delete window.__iconsMap;
      document.getElementById('reading-wrap')?.remove();
    });
  });

  // The scenario "The reading follows the records".
  test('the reading follows the records', async ({ page }) => {
    await openMap(page);
    await buildBareMap(page);

    const readings = await page.evaluate(() => {
      const map = window.__iconsMap;
      if (map === undefined) throw new Error('The test built no map.');
      const bare = map.hasSystemIcons();
      map.addSystems([
        { name: 'Plain', coords: { x: 0, y: 0, z: 0 }, categories: ['Alpha'] },
      ] as never);
      const plain = map.hasSystemIcons();
      map.addSystems([
        {
          name: 'Marked',
          coords: { x: 10, y: 0, z: 0 },
          categories: ['Alpha'],
          icons: ['titan', 'mission'],
        },
      ] as never);
      return { bare, plain, marked: map.hasSystemIcons() };
    });
    console.log('the icon reading over three steps', readings);

    expect(readings).toEqual({ bare: false, plain: false, marked: true });
  });

  // The scenario "A clear drops the reading".
  test('a clear drops the reading', async ({ page }) => {
    await openMap(page);
    await buildBareMap(page);

    const readings = await page.evaluate(() => {
      const map = window.__iconsMap;
      if (map === undefined) throw new Error('The test built no map.');
      map.addSystems([
        {
          name: 'Marked',
          coords: { x: 0, y: 0, z: 0 },
          categories: ['Alpha'],
          icons: ['titan'],
        },
      ] as never);
      const held = map.hasSystemIcons();
      map.clearSystems();
      return { held, cleared: map.hasSystemIcons() };
    });
    console.log('the icon reading over a clear', readings);

    expect(readings).toEqual({ held: true, cleared: false });
  });

  // The scenario "A replacement leaves the reading true".
  test('a replacement leaves the reading true', async ({ page }) => {
    await openMap(page);
    await buildBareMap(page);

    const reading = await page.evaluate(() => {
      const map = window.__iconsMap;
      if (map === undefined) throw new Error('The test built no map.');
      map.addSystems([
        {
          name: 'Marked',
          coords: { x: 0, y: 0, z: 0 },
          categories: ['Alpha'],
          icons: ['titan'],
        },
      ] as never);
      // The same name with no icon replaces the record. A correction of the count would
      // need a sweep of the set, so the reading stays true.
      map.addSystems([
        { name: 'Marked', coords: { x: 0, y: 0, z: 0 }, categories: ['Alpha'] },
      ] as never);
      return map.hasSystemIcons();
    });
    console.log('the icon reading after a replacement', reading);

    expect(reading).toBe(true);
  });
});
