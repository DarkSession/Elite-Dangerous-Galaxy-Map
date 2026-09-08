import { expect, test } from '@playwright/test';
import { luminanceAt, openMap, projectPoint } from './helpers';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

test('the default view shows the centre, Sol and the empty space around them', async ({
  page,
}) => {
  await openMap(page);

  const centre = await projectPoint(page, [15, -35, 25895]);
  const sol = await projectPoint(page, [0, 0, 0]);
  const outside = await projectPoint(page, [-45000, 0, 0]);

  const centreLuminance = await luminanceAt(page, centre);
  const solLuminance = await luminanceAt(page, sol);
  const outsideLuminance = await luminanceAt(page, outside);
  console.log('luminance', { centreLuminance, solLuminance, outsideLuminance });

  expect(centreLuminance).toBeGreaterThan(0.8);
  expect(solLuminance).toBeGreaterThan(0.2);
  expect(outsideLuminance).toBeLessThan(0.02);
});

test('the default view matches the baseline image', async ({ page }) => {
  await openMap(page);
  await expect(page.locator('#map')).toHaveScreenshot('default-view.png', {
    maxDiffPixelRatio: 0.02,
  });
});
