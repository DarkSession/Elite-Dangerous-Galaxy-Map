import { expect, test } from '@playwright/test';

test('the scene data is ready in time and no task blocks the main thread', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__longTasks = [];
    window.__readyAt = -1;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__longTasks?.push({ duration: entry.duration, start: entry.startTime });
      }
    });
    observer.observe({ type: 'longtask', buffered: true });
    window.addEventListener('galaxy-map-ready', () => {
      window.__readyAt = performance.now();
    });
  });

  await page.goto('/');
  await page.waitForFunction(() => (window.__readyAt ?? -1) >= 0, undefined, {
    timeout: 30000,
  });

  const readyAt = await page.evaluate(() => window.__readyAt ?? -1);
  console.log('scene data ready after', Math.round(readyAt), 'ms');
  expect(readyAt).toBeGreaterThan(0);
  expect(readyAt).toBeLessThan(5000);

  // Every task from navigation start to the first drawn frame, which holds the shader
  // compilation and both uploads.
  const tasks = await page.evaluate(() =>
    (window.__longTasks ?? []).filter((task) => task.start <= (window.__readyAt ?? 0)),
  );
  const longest = tasks.reduce((best, task) => Math.max(best, task.duration), 0);
  console.log('longest task before the first frame', longest, 'ms');
  expect(longest).toBeLessThanOrEqual(100);
});
