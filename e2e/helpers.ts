import type { Page } from '@playwright/test';

/** The event the page sends once it has drawn the scene data for the first time. */
export const READY_EVENT = 'galaxy-map-ready';

/** Waits until the page has drawn its first frame. */
export async function waitForReady(page: Page, timeout = 30000): Promise<void> {
  await page.waitForFunction(() => window.__galaxyMap?.ready === true, undefined, {
    timeout,
  });
}

/** Opens the map and waits for the first frame. */
export async function openMap(page: Page, fragment = ''): Promise<void> {
  await page.goto(`/${fragment}`);
  await waitForReady(page);
}

/** Reads the luminance of one pixel, 0 to 1, at a CSS pixel of the canvas. */
export async function luminanceAt(
  page: Page,
  point: { x: number; y: number },
): Promise<number> {
  return page.evaluate((where) => {
    const map = window.__galaxyMap;
    if (map?.readPixel === undefined) return -1;
    const [red, green, blue] = map.readPixel(where.x, where.y);
    return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  }, point);
}

/** Projects a game position to a CSS pixel of the canvas. */
export async function projectPoint(
  page: Page,
  point: [number, number, number],
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    (where) => window.__galaxyMap?.project?.(where) ?? { x: -1, y: -1 },
    point,
  );
}
