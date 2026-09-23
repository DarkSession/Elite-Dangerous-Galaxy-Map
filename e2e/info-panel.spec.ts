import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { openMap } from './helpers';
import type { SystemRecordInput } from '../packages/galaxy-map/src/scene-data/real-systems';

// What the information panel draws from a description and from a host's `details`
// loader. `e2e/hud.spec.ts` is long, so the panel tests of the host controls live here.

test.use({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });

/** The colour every category in this file takes. */
const CORE: [number, number, number] = [153, 230, 255];

/** Which loader the page builds. Each one answers for every system it is called with. */
type DetailsMode =
  | 'none'
  | 'empty'
  | 'loaded'
  | 'values'
  | 'copy'
  | 'slow'
  | 'slow-first'
  | 'throwing'
  | 'rejecting'
  | 'abort-reject';

/** What the test asks the page to build the map with. */
interface PanelBuild {
  /** The loader the map takes, or none. */
  readonly details?: DetailsMode;
  /** The `infoFields` object the map takes. */
  readonly infoFields?: Record<string, unknown>;
}

/**
 * Opens the demo page, then builds a second map with the HUD on, over a canvas of its
 * own. The second map is the one every test of this file drives.
 */
async function openPanel(page: Page, build: PanelBuild = {}): Promise<void> {
  await openMap(page);
  await page.evaluate(async (options: PanelBuild) => {
    const factory = window.galaxyMapFactory;
    if (factory === undefined) throw new Error('The page has no map factory.');
    // The demo page builds a HUD of its own. It comes down first, so the tests below
    // drive one HUD.
    window.galaxyMap?.dispose();
    const wrap = document.createElement('div');
    wrap.id = 'panel-wrap';
    wrap.style.cssText = 'position: absolute; inset: 0;';
    const canvas = document.createElement('canvas');
    canvas.style.cssText =
      'display: block; width: 100%; height: 100%; touch-action: none;';
    wrap.appendChild(canvas);
    document.body.appendChild(wrap);

    window.__detailsCalls = [];
    window.__detailsSignals = [];
    const mode = options.details;
    const wait = (ms: number, answer: unknown): Promise<unknown> =>
      new Promise((resolve) => {
        setTimeout(() => resolve(answer), ms);
      });
    const details =
      mode === undefined
        ? undefined
        : (system: { name: string }, signal: AbortSignal): unknown => {
            window.__detailsCalls?.push(system.name);
            window.__detailsSignals?.push(signal);
            if (mode === 'none') return null;
            if (mode === 'empty') return {};
            if (mode === 'loaded') return { description: '**loaded**' };
            if (mode === 'values') {
              return {
                description: 'A loaded body.',
                values: [
                  { label: 'FACTION', value: 'Pilots Federation' },
                  { label: 'HISTORY', markdown: 'First line.\n\nSecond line.' },
                ],
              };
            }
            if (mode === 'copy') {
              return {
                values: [
                  {
                    label: 'SYSTEM ADDRESS',
                    value: '2871051900826',
                    copy: '2871051900826',
                  },
                ],
              };
            }
            if (mode === 'slow') return wait(200, { description: '**loaded**' });
            if (mode === 'slow-first') {
              return system.name === 'First'
                ? wait(200, { description: 'from First' })
                : { description: 'from Second' };
            }
            if (mode === 'throwing') throw new Error('The loader failed.');
            if (mode === 'rejecting') {
              return Promise.reject(new Error('The loader failed.'));
            }
            // The promise rejects with the signal's own abort reason, which is not a
            // failure of the loader.
            return new Promise((_resolve, reject) => {
              signal.addEventListener('abort', () => {
                reject(signal.reason);
              });
            });
          };
    const hud: Record<string, unknown> = {};
    if (details !== undefined) hud['details'] = details;
    if (options.infoFields !== undefined) hud['infoFields'] = options.infoFields;
    const map = factory(canvas, {
      hud: Object.keys(hud).length === 0 ? true : hud,
    } as never);
    window.__panelMap = map;
    await map.ready;
  }, build);
}

test.afterEach(async ({ page }) => {
  await page.evaluate(() => {
    window.__panelMap?.dispose();
    delete window.__panelMap;
    document.getElementById('panel-wrap')?.remove();
  });
});

/** The root of the HUD the tests drive. */
function hud(page: Page): Locator {
  return page.locator('#panel-wrap .gm-hud');
}

/** The description the panel draws. A host's section carries a name, so it is not this. */
function description(page: Page): Locator {
  return hud(page).locator('.gm-hud__description:not([data-name])');
}

/** One section a host's `markdown` value draws. */
function section(page: Page, label: string): Locator {
  return hud(page).locator(`.gm-hud__description[data-name="${label}"]`);
}

/** Adds one category to the map of this file. */
async function addCategory(page: Page, name: string): Promise<void> {
  await page.evaluate(
    (value) => {
      window.__panelMap?.addCategories([{ name: value.name, color: value.color }]);
    },
    { name, color: CORE },
  );
}

/** Adds records to the map of this file. */
async function addSystems(page: Page, records: readonly unknown[]): Promise<number> {
  return page.evaluate(
    (list) =>
      window.__panelMap?.addSystems(list as readonly SystemRecordInput[]).added ?? -1,
    records,
  );
}

/** A record the reader accepts. */
function record(
  name: string,
  position: readonly [number, number, number],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name,
    coords: { x: position[0], y: position[1], z: position[2] },
    categories: ['Alpha'],
    ...extra,
  };
}

/** Selects one system by name. */
async function select(page: Page, name: string | null): Promise<void> {
  await page.evaluate((value) => {
    window.__panelMap?.setSelection(value);
  }, name);
}

/** The label of every field the panel shows. */
async function fieldLabels(page: Page): Promise<string[]> {
  return hud(page)
    .locator('.gm-hud__field-label')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''));
}

/** The title of every section of the panel body. */
async function sectionTitles(page: Page): Promise<string[]> {
  return hud(page)
    .locator('.gm-hud__section-title')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ''));
}

/** Adds one category and one record, then selects the record. */
async function openOn(
  page: Page,
  name: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await addCategory(page, 'Alpha');
  await addSystems(page, [record(name, [0, 0, 100], extra)]);
  await select(page, name);
  await expect(hud(page).locator('.gm-hud__info')).toBeVisible();
}

test.describe('a system with no category', () => {
  test('shows no chip row', async ({ page }) => {
    await openPanel(page);
    // The map holds no category, so each record names none.
    await addSystems(page, [
      { name: 'Sol', coords: { x: 0, y: 0, z: 100 }, description: 'The home system.' },
      { name: 'Achenar', coords: { x: 10, y: 0, z: 100 } },
      { name: 'Solati', coords: { x: 20, y: 0, z: 100 } },
    ]);
    await select(page, 'Sol');
    await expect(hud(page).locator('.gm-hud__info')).toBeVisible();

    const titles = await sectionTitles(page);
    const labels = await fieldLabels(page);
    const chips = await hud(page).locator('.gm-hud__chip').count();
    const rows = await hud(page).locator('.gm-hud__chips').count();
    console.log('the panel of an uncategorised system', {
      titles,
      labels,
      chips,
      rows,
    });

    await expect(hud(page).locator('.gm-hud__info-name')).toHaveText('Sol');
    expect(labels.length).toBeGreaterThan(0);
    expect(titles).toContain('DESCRIPTION');
    expect(titles).not.toContain('CATEGORIES');
    expect(chips).toBe(0);
    expect(rows).toBe(0);
  });
});

test.describe('the description draws as Markdown', () => {
  // The scenario "The description draws as Markdown".
  test('the marks build the elements they name', async ({ page }) => {
    await openPanel(page);
    await openOn(page, 'Marked', {
      description:
        'The **hub** of the arm.\n\n- one item\n- a [link](https://edsm.net)',
    });

    const body = description(page);
    await expect(body.locator('p')).toHaveCount(1);
    await expect(body.locator('strong')).toHaveText('hub');
    await expect(body.locator('ul')).toHaveCount(1);
    await expect(body.locator('li')).toHaveCount(2);
    await expect(body.locator('a')).toHaveAttribute('href', 'https://edsm.net');
  });

  // The scenario "Raw HTML draws as text".
  test('raw HTML draws as text', async ({ page }) => {
    await openPanel(page);
    await openOn(page, 'Marked', {
      description: '<b>bold</b><script>alert(1)</script>',
    });

    const body = description(page);
    const counts = await body.evaluate((node) => ({
      bold: node.querySelectorAll('b').length,
      script: node.querySelectorAll('script').length,
    }));
    console.log('the elements a raw HTML description built', counts);

    expect(counts).toEqual({ bold: 0, script: 0 });
    await expect(body).toHaveText('<b>bold</b><script>alert(1)</script>');
  });

  // The scenario "A drawn link carries the safety attributes".
  test('a drawn link carries the safety attributes', async ({ page }) => {
    await openPanel(page);
    await openOn(page, 'Marked', { description: 'Read [EDSM](https://edsm.net).' });

    const anchor = description(page).locator('a');
    const attributes = await anchor.evaluate((node) => ({
      href: node.getAttribute('href') ?? '',
      target: node.getAttribute('target') ?? '',
      rel: node.getAttribute('rel') ?? '',
    }));
    console.log('the attributes of the drawn link', attributes);

    expect(attributes.href).toBe('https://edsm.net');
    expect(attributes.target).toBe('_blank');
    expect(attributes.rel).toContain('noreferrer');
    expect(attributes.rel).toContain('noopener');
  });

  // No scenario names this test. The look of a rendered mark is an implementation
  // detail, and the spec states the nodes the render builds rather than how they draw.
  test('the styles reach the list and the link', async ({ page }) => {
    await openPanel(page);
    await openOn(page, 'Marked', {
      description: 'A paragraph with a [link](https://edsm.net).\n\n- one item',
    });

    const reading = await description(page).evaluate((node) => {
      const item = node.querySelector('li') as HTMLElement;
      const link = node.querySelector('a') as HTMLElement;
      const paragraph = node.querySelector('p') as HTMLElement;
      return {
        itemPadding: Number.parseFloat(getComputedStyle(item).paddingLeft),
        linkColor: getComputedStyle(link).color,
        paragraphColor: getComputedStyle(paragraph).color,
      };
    });
    console.log('the computed styles of the drawn marks', reading);

    expect(reading.itemPadding).toBeGreaterThan(0);
    expect(reading.linkColor).not.toBe(reading.paragraphColor);
  });

  // The scenario "A record with no description hides that section" still holds with the
  // Markdown draw, and a loader that gives none does not build one either.
  test('no description and no loaded description hides the section', async ({
    page,
  }) => {
    await openPanel(page, { details: 'empty' });
    await openOn(page, 'Bare');

    expect(await sectionTitles(page)).not.toContain('DESCRIPTION');
    expect(await description(page).count()).toBe(0);
  });
});

test.describe('the worked-out fields', () => {
  // The scenario "The host turns the three worked-out fields off".
  test('the host turns the three fields off', async ({ page }) => {
    await openPanel(page, {
      infoFields: { distanceFromSol: false, range: false, region: false },
    });
    await openOn(page, 'Marked', { allegiance: 'Federation', population: 1000 });

    const labels = await fieldLabels(page);
    console.log('the fields with the three worked-out fields off', labels);

    expect(labels).toEqual(['POSITION', 'ALLEGIANCE', 'POPULATION']);
  });

  // The scenario "One field off still leaves no empty cell".
  test('one field off still leaves no empty cell', async ({ page }) => {
    await openPanel(page, { infoFields: { distanceFromSol: false } });
    await openOn(page, 'Marked');

    const boxes = await hud(page).evaluate(() => {
      const root = document.querySelector('#panel-wrap .gm-hud') as HTMLElement;
      const grid = root.querySelector('.gm-hud__field-grid') as HTMLElement;
      const fields = Array.from(root.querySelectorAll('.gm-hud__field'));
      const range = fields.find((node) =>
        (node.textContent ?? '').includes('RANGE'),
      ) as HTMLElement;
      return {
        labels: fields.map((node) =>
          (node.querySelector('.gm-hud__field-label')?.textContent ?? '').trim(),
        ),
        gridWidth: grid.getBoundingClientRect().width,
        rangeWidth: range.getBoundingClientRect().width,
      };
    });
    console.log('the grid with the distance off', boxes);

    expect(boxes.labels).toEqual(['POSITION', 'RANGE', 'REGION']);
    expect(Math.abs(boxes.rangeWidth - boxes.gridWidth)).toBeLessThan(2);
  });

  // The scenario "The region field off fetches no region table". The test reads the
  // page's request list, because reading the code path cannot fail on a call whose
  // answer is thrown away.
  test('the region field off fetches no region table', async ({ page }) => {
    const urls: string[] = [];
    page.on('request', (request) => urls.push(request.url()));

    await openPanel(page, { infoFields: { region: false } });
    await addCategory(page, 'Alpha');
    await addSystems(page, [
      record('One', [0, 0, 100]),
      record('Two', [0, 0, 200]),
      record('Three', [0, 0, 300]),
    ]);
    for (const name of ['One', 'Two', 'Three']) await select(page, name);
    await page.waitForTimeout(2000);
    const withoutField = urls.filter((url) => url.includes('codex-region-lookup'));
    console.log('the lookup requests with the field off', withoutField);
    expect(withoutField).toEqual([]);

    // The same map with the field on fetches the table, which is what makes the reading
    // above a fact about the field and not about the test.
    await page.evaluate(() => {
      window.__panelMap?.dispose();
      document.getElementById('panel-wrap')?.remove();
    });
    urls.length = 0;
    await openPanel(page);
    await addCategory(page, 'Alpha');
    await addSystems(page, [record('One', [0, 0, 100])]);
    await select(page, 'One');
    await expect
      .poll(() => urls.filter((url) => url.includes('codex-region-lookup')).length, {
        timeout: 10_000,
      })
      .toBeGreaterThan(0);
  });
});

test.describe('the host values', () => {
  // The scenario "A host value joins the grid and a host body draws a section".
  test('a value joins the grid and a body draws a section', async ({ page }) => {
    await openPanel(page, { details: 'values' });
    await openOn(page, 'Marked', { description: 'from the record' });

    const labels = await fieldLabels(page);
    const titles = await sectionTitles(page);
    console.log('the fields and the sections with two host values', { labels, titles });

    expect(labels[labels.length - 1]).toBe('FACTION');
    await expect(
      hud(page).locator('.gm-hud__field', { hasText: 'FACTION' }),
    ).toContainText('Pilots Federation');
    expect(titles).toContain('HISTORY');
    await expect(section(page, 'HISTORY').locator('p')).toHaveCount(2);
  });

  // The scenario "A host value carries a copy button".
  test('a value carries a copy button', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openPanel(page, { details: 'copy' });
    await openOn(page, 'Marked', { description: 'from the record' });

    const button = hud(page).locator('.gm-hud__copy[data-name="SYSTEM ADDRESS"]');
    await expect(button).toHaveAttribute('aria-label', 'Copy SYSTEM ADDRESS');

    await button.click();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toBe('2871051900826');
    await expect(button).toHaveAttribute('data-state', 'copied');

    // One tick shows at a time, so the click on the position button moves it.
    await hud(page).locator('.gm-hud__copy[data-name="position"]').click();
    await expect(
      hud(page).locator('.gm-hud__copy[data-name="position"]'),
    ).toHaveAttribute('data-state', 'copied');
    await expect(button).toHaveAttribute('data-state', 'idle');
  });
});

test.describe('the details loader', () => {
  // The scenario "The loader is called once for each system".
  test('the loader is called once for each system', async ({ page }) => {
    await openPanel(page, { details: 'empty' });
    await addCategory(page, 'Alpha');
    await addSystems(page, [
      record('First', [0, 0, 100]),
      record('Second', [0, 0, 200]),
    ]);

    await select(page, 'First');
    await page.evaluate(() => {
      window.__panelMap?.hud?.refresh();
      window.__panelMap?.hud?.refresh();
    });
    await select(page, 'Second');
    await select(page, 'First');
    const calls = await page.evaluate(() => window.__detailsCalls ?? []);
    console.log('the systems the loader was called with', calls);

    expect(calls).toEqual(['First', 'Second', 'First']);
  });

  test('the loader is not called while nothing is selected', async ({ page }) => {
    await openPanel(page, { details: 'empty' });
    await addCategory(page, 'Alpha');
    await addSystems(page, [record('First', [0, 0, 100])]);
    await page.evaluate(() => {
      window.__panelMap?.hud?.refresh();
    });

    expect(await page.evaluate(() => window.__detailsCalls ?? [])).toEqual([]);
  });

  // The scenario "The loaded description replaces the record's".
  test('the loaded description replaces the record', async ({ page }) => {
    await openPanel(page, { details: 'loaded' });
    await openOn(page, 'Marked', { description: 'from the record' });

    await expect(description(page).locator('strong')).toHaveText('loaded');
    await expect(description(page)).not.toContainText('from the record');
  });

  // The scenario "A loader that gives no description falls back to the record".
  test('a loader that gives no description falls back to the record', async ({
    page,
  }) => {
    await openPanel(page, { details: 'empty' });
    await openOn(page, 'Marked', { description: 'from the record' });

    await expect(description(page)).toHaveText('from the record');
  });

  test('a loader that returns null falls back to the record', async ({ page }) => {
    await openPanel(page, { details: 'none' });
    await openOn(page, 'Marked', { description: 'from the record' });

    await expect(description(page)).toHaveText('from the record');
  });

  // The scenario "A slow load shows the loading line".
  test('a slow load shows the loading line', async ({ page }) => {
    await openPanel(page, { details: 'slow' });
    await openOn(page, 'Marked', { description: 'from the record' });

    const line = hud(page).locator('.gm-hud__loading');
    await expect(line).toHaveText('LOADING…');
    await expect(line).toHaveAttribute('aria-busy', 'true');
    expect(await sectionTitles(page)).toContain('DESCRIPTION');

    await expect(description(page).locator('strong')).toHaveText('loaded');
    expect(await hud(page).locator('[aria-busy]').count()).toBe(0);
  });

  test('a value and not a promise draws no loading line', async ({ page }) => {
    await openPanel(page, { details: 'loaded' });
    await openOn(page, 'Marked');

    expect(await hud(page).locator('.gm-hud__loading').count()).toBe(0);
  });

  // The scenario "A stale answer is dropped".
  test('a stale answer is dropped', async ({ page }) => {
    await openPanel(page, { details: 'slow-first' });
    await addCategory(page, 'Alpha');
    await addSystems(page, [
      record('First', [0, 0, 100]),
      record('Second', [0, 0, 200]),
    ]);

    await select(page, 'First');
    await select(page, 'Second');
    await page.waitForTimeout(500);
    console.log(
      'the description after both loads settled',
      await description(page).textContent(),
    );

    await expect(description(page)).toHaveText('from Second');
  });

  // The scenario "The signal aborts when the selection moves".
  test('the signal aborts when the selection moves and on dispose', async ({
    page,
  }) => {
    await openPanel(page, { details: 'slow' });
    await addCategory(page, 'Alpha');
    await addSystems(page, [
      record('First', [0, 0, 100]),
      record('Second', [0, 0, 200]),
    ]);

    await select(page, 'First');
    await select(page, 'Second');
    const afterMove = await page.evaluate(
      () => window.__detailsSignals?.map((signal) => signal.aborted) ?? [],
    );
    await page.evaluate(() => {
      window.__panelMap?.dispose();
    });
    const afterDispose = await page.evaluate(
      () => window.__detailsSignals?.map((signal) => signal.aborted) ?? [],
    );
    console.log('the aborted readings', { afterMove, afterDispose });

    expect(afterMove).toEqual([true, false]);
    expect(afterDispose).toEqual([true, true]);
  });

  // The scenario "An abort is not reported as a failure".
  test('an abort is not reported as a failure', async ({ page }) => {
    const warnings: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'warning') warnings.push(message.text());
    });
    await openPanel(page, { details: 'abort-reject' });
    await addCategory(page, 'Alpha');
    await addSystems(page, [
      record('First', [0, 0, 100], { description: 'from First' }),
      record('Second', [0, 0, 200], { description: 'from Second' }),
    ]);

    await select(page, 'First');
    await select(page, 'Second');
    await page.waitForTimeout(500);
    console.log('the warnings after the abort', warnings);

    expect(warnings.filter((text) => text.includes('details loader'))).toEqual([]);
    await expect(hud(page).locator('.gm-hud__info-name')).toHaveText('Second');
  });

  // The scenario "A failed load falls back and does not throw".
  test('a failed load falls back and does not throw', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openPanel(page, { details: 'rejecting' });
    await openOn(page, 'Marked', { description: 'from the record' });

    await expect(description(page)).toHaveText('from the record');
    // The drawn frames and not the view distance: the camera eases toward the record
    // the test selected, so the distance moves whether or not the map draws. The
    // selection flight writes the view on each turn, so the map draws in these 20
    // frames. A still map draws no frame at all.
    const frames = await page.evaluate(async () => {
      const before = window.__panelMap?.debug.frameStats().frames ?? -1;
      for (let index = 0; index < 20; index += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      return {
        before,
        after: window.__panelMap?.debug.frameStats().frames ?? -2,
      };
    });
    console.log('the page errors and the frames after a failed load', {
      errors,
      frames,
    });

    expect(errors).toEqual([]);
    expect(frames.after).toBeGreaterThan(frames.before);
  });

  test('a loader that throws falls back to the record', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openPanel(page, { details: 'throwing' });
    await openOn(page, 'Marked', { description: 'from the record' });

    await expect(description(page)).toHaveText('from the record');
    expect(errors).toEqual([]);
  });
});
