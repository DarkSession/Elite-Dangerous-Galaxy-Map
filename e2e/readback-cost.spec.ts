import { expect, test } from '@playwright/test';
import { heldKeyFrames, openMap, waitForFirstReading } from './helpers';

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

// The read-back of the background reading, timed. It runs in the timed project, on one
// worker, because a reading taken beside five other browsers is not the reading the
// budget states. The other read-back scenarios sit in `grid.spec.ts`.
test.describe('the read-back of the reading', () => {
  // The scenario "The read-back costs under half a millisecond in the loop". The
  // reading is taken at the start of the next frame, so the measurement runs in the
  // animation loop: a `drawNow` loop with no gap between frames hides the difference.
  test('costs under half a millisecond in the loop', async ({ page }) => {
    test.setTimeout(120000);
    await openMap(page, '#c=0,0,0&d=4000&p=5&y=0');
    // The view again, so the reading is of the view this scenario names and not of
    // whatever the page opened with. Then the grid, and one drawn frame.
    await page.evaluate(() => {
      window.galaxyMap?.setView({
        cursor: [0, 0, 0],
        distance: 4000,
        yaw: 0,
        pitch: 5,
      });
      window.galaxyMap?.setGridVisible(true);
      window.galaxyMap?.debug.drawNow();
    });
    await waitForFirstReading(page);

    const placed = await page.evaluate(
      () => window.galaxyMap?.debug.gridLabelReadings().length ?? 0,
    );
    const drawn = await heldKeyFrames(page, 120);
    const stats = await page.evaluate(
      () =>
        window.galaxyMap?.debug.readbackStats() ?? {
          frames: -1,
          meanMs: -1,
          worstMs: -1,
        },
    );
    console.log('the read-back over 120 frames of a held key', {
      placed,
      drawn,
      ...stats,
    });

    // The labels are placed, so the frame asks for the reading.
    expect(placed).toBeGreaterThan(0);
    expect(stats.frames).toBeGreaterThan(100);
    // Five readings gave 0.35 to 0.44 ms, and the take after the draw commands gave
    // 1.37 ms in this same scenario.
    expect(stats.meanMs).toBeLessThanOrEqual(0.5);
  });
});
