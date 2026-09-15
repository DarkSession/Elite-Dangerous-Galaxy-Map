// The demo site build, read through the browser. The suite serves the built site under
// the base path its GitHub Pages address carries, so every navigation is relative and
// the page loads the Guardian Ruins set at start.
import { expect, test } from '@playwright/test';
import { openMap, startState, waitForReady } from './helpers';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

/** How many categories and systems the demo set holds. */
const DEMO_CATEGORIES = 3;
const DEMO_SYSTEMS = 212;

test('a relative navigation reaches the base path and opens the view it names', async ({
  page,
  baseURL,
}) => {
  await openMap(page, '#c=100,200,300&d=5000&p=20&y=45');

  expect(page.url().startsWith(baseURL as string)).toBe(true);
  const view = await page.evaluate(() => window.galaxyMap?.getView());
  console.log('the view the fragment named', view);
  expect(view?.cursor).toEqual([100, 200, 300]);
  expect(view?.distance).toBeCloseTo(5000, 3);
  expect(view?.pitch).toBeCloseTo(20, 3);
  expect(view?.yaw).toBeCloseTo(45, 3);
});

test('the suite opens an empty map by default', async ({ page }) => {
  await openMap(page);

  const reading = await page.evaluate(() => ({
    systems: window.galaxyMap?.systemCount() ?? -1,
    categories: window.galaxyMap?.categoryCount() ?? -1,
    grid: window.galaxyMap?.isGridVisible() ?? true,
  }));
  console.log('the map the helper opened', reading);
  expect(reading.systems).toBe(0);
  expect(reading.categories).toBe(0);
  expect(reading.grid).toBe(false);
});

test("the loader is on the site's own origin", async ({ page, baseURL }) => {
  const blocked: string[] = [];
  const origin = new URL(baseURL as string).origin;
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:')) {
      await route.continue();
      return;
    }
    blocked.push(url);
    await route.abort();
  });

  // The reading comes before `ready` settles, so the navigation waits for the document
  // and not for the first frame.
  await page.goto('./', { waitUntil: 'commit' });
  const picture = page.locator('img.gm-loading-image');
  await expect(picture).toHaveCount(1);
  const source = await picture.evaluate((element) => ({
    resolved: (element as HTMLImageElement).src,
    attribute: element.getAttribute('src') ?? '',
  }));
  console.log('the loader', source, 'the blocked requests', blocked);

  // The page builds the URL from the base path the build wrote, so the reading is of
  // the resolved address and not of the page source.
  expect(new URL(source.resolved).pathname).toBe(
    '/Elite-Dangerous-Galaxy-Map/EDLoader1.svg',
  );
  expect(source.resolved.startsWith(origin)).toBe(true);
  expect(source.attribute.startsWith('/Elite-Dangerous-Galaxy-Map/')).toBe(true);
  expect(blocked).toEqual([]);

  // The picture goes when the map has started.
  await waitForReady(page);
  await startState(page);
  await expect(picture).toHaveCount(0);
});

test('the option keeps the demo set', async ({ page }) => {
  await openMap(page, '', { demoData: true });

  const reading = await page.evaluate(() => ({
    systems: window.galaxyMap?.systemCount() ?? -1,
    categories: window.galaxyMap?.categoryCount() ?? -1,
    grid: window.galaxyMap?.isGridVisible() ?? false,
  }));
  console.log('the map the option opened', reading);
  expect(reading.systems).toBe(DEMO_SYSTEMS);
  expect(reading.categories).toBe(DEMO_CATEGORIES);
  expect(reading.grid).toBe(true);
});

// The scenario "The demo site starts with the grid on" of `library-package`, and the
// scenario "The library default does not follow the demo site" of `coordinate-grid`.
test('starts the grid on and reads g=0 from the fragment', async ({ page }) => {
  await openMap(page, '', { demoData: true });
  const fresh = await page.evaluate(() => window.galaxyMap?.isGridVisible() ?? false);

  await openMap(page, '#c=0,0,0&d=1000&p=35&y=0&g=0', { demoData: true });
  const off = await page.evaluate(() => window.galaxyMap?.isGridVisible() ?? true);

  await openMap(page, '#c=0,0,0&d=1000&p=35&y=0&g=1', { demoData: true });
  const on = await page.evaluate(() => window.galaxyMap?.isGridVisible() ?? false);
  console.log('the grid the demo site starts with', { fresh, off, on });

  expect(fresh).toBe(true);
  expect(off).toBe(false);
  expect(on).toBe(true);
});
