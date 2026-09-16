import { expect, test } from '@playwright/test';
import { openMap } from './helpers';

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

test.describe('the plane overlay', () => {
  // The scenario "A plane element does not transform an upright one".
  test('does not transform an upright element', async ({ page }) => {
    await openMap(page, '#c=0,0,0&d=1000&p=30&y=0');
    await page.evaluate(() => {
      const map = window.galaxyMap;
      if (map === undefined) return;
      map.setGridVisible(true);
      map.addCategories([
        { name: 'Alpha', color: [153, 230, 255], maxDrawRange: 200000 },
      ]);
      map.addSystems([
        { name: 'One', coords: { x: 0, y: 0, z: 0 }, primaryCategory: 'Alpha' },
      ]);
      map.setSelection('One');
      map.setView({ cursor: [0, 0, 0], distance: 1000, yaw: 0, pitch: 30 });
      map.debug.drawNow();
    });

    const reading = await page.evaluate(() => {
      const pin = document.querySelector('.gm-system-pin');
      if (pin === null) return null;
      const box = pin.getBoundingClientRect();
      return {
        planeLabels: document.querySelectorAll('.gm-grid-label').length,
        transform: getComputedStyle(pin).transform,
        width: box.width,
        height: box.height,
      };
    });
    expect(reading).not.toBeNull();
    const read = reading as NonNullable<typeof reading>;
    console.log('the pin beside the plane labels', read);

    // The overlay holds coordinate labels on the plane and a selection pin upright.
    expect(read.planeLabels).toBeGreaterThan(0);
    expect(read.transform).not.toContain('matrix3d');
    // `system-selection` states the pin as 16.5 by 28 CSS pixels.
    expect(Math.abs(read.width - 16.5)).toBeLessThan(1);
    expect(Math.abs(read.height - 28)).toBeLessThan(1);
  });
});
