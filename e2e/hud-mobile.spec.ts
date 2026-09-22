// The narrow layout of the HUD, read at a phone viewport.
//
// `playwright.config.ts` runs this file in the `chromium-touch` project, whose context
// sets `hasTouch: true`. The drawers therefore open and close with `page.tap`, which is
// the gesture the layout exists for. Every other reading — a computed style, a bounding
// box, a key press — is taken the way the rest of the suite takes it.
//
// The layout follows the viewport width alone, so a narrow desktop window reads the same
// rules a phone reads. Nothing here sets a device profile.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { openMap } from './helpers';

test.use({ viewport: { width: 412, height: 880 }, deviceScaleFactor: 1 });

/** The colour every category in this file takes. */
const CORE: [number, number, number] = [153, 230, 255];

/** What the test asks the second map to be. */
interface HudBuild {
  /** How many catalog entries the map takes. With none it takes no `datasets`. */
  readonly datasets?: number;
  /** How many collections those entries spread over. The default is two. */
  readonly collections?: number;
}

/**
 * Opens the demo page, then builds a second map with the HUD on, over a canvas of its
 * own that covers the window. The demo page's own map goes down first, so every reading
 * below is of one HUD.
 */
async function openHud(page: Page, build: HudBuild = {}): Promise<void> {
  await openMap(page);
  await page.evaluate(async (options: HudBuild) => {
    const factory = window.galaxyMapFactory;
    if (factory === undefined) throw new Error('The page has no map factory.');
    window.galaxyMap?.dispose();
    const wrap = document.createElement('div');
    wrap.id = 'hud-wrap';
    wrap.style.cssText = 'position: absolute; inset: 0;';
    const canvas = document.createElement('canvas');
    canvas.style.cssText =
      'display: block; width: 100%; height: 100%; touch-action: none;';
    wrap.appendChild(canvas);
    document.body.appendChild(wrap);

    const count = options.datasets ?? 0;
    const collections = options.collections ?? 2;
    const datasets =
      count === 0
        ? undefined
        : Array.from({ length: count }, (_unused: unknown, index: number) => ({
            id: `set-${String(index)}`,
            label: `Set ${String(index)}`,
            collection: `Collection ${String(index % collections)}`,
            load: (): unknown => ({ categories: [], systems: [] }),
          }));
    const map = factory(canvas, {
      hud: true,
      ...(datasets === undefined ? {} : { datasets }),
    } as never);
    window.__hudMap = map;
    await map.ready;
  }, build);
}

/** The root of the HUD the tests drive. */
function hud(page: Page): Locator {
  return page.locator('#hud-wrap .gm-hud');
}

/** Adds one category and three records to the HUD's map. */
async function addContent(page: Page): Promise<void> {
  await page.evaluate((colour) => {
    window.__hudMap?.addCategories([
      { name: 'Alpha', color: colour, maxDrawRange: 200000 },
    ] as never);
    window.__hudMap?.addSystems([
      { name: 'One', coords: { x: 0, y: 0, z: 100 }, categories: ['Alpha'] },
      { name: 'Two', coords: { x: 0, y: 0, z: 200 }, categories: ['Alpha'] },
      { name: 'Three', coords: { x: 0, y: 0, z: 300 }, categories: ['Alpha'] },
    ] as never);
  }, CORE);
}

/** Adds `count` categories, each with one record, to the HUD's map. */
async function addCategories(page: Page, count: number): Promise<void> {
  await page.evaluate(
    ({ colour, total }: { colour: [number, number, number]; total: number }) => {
      const names = Array.from(
        { length: total },
        (_u: unknown, i: number) => `Cat ${i}`,
      );
      window.__hudMap?.addCategories(
        names.map((name) => ({ name, color: colour, maxDrawRange: 200000 })) as never,
      );
      window.__hudMap?.addSystems(
        names.map((name, i) => ({
          name: `Sys ${i}`,
          coords: { x: 0, y: 0, z: 100 + i },
          categories: [name],
        })) as never,
      );
    },
    { colour: CORE, total: count },
  );
}

/** Selects a system on the HUD's map by its name. */
async function select(page: Page, name: string | null): Promise<void> {
  await page.evaluate((value) => {
    window.__hudMap?.setSelection(value);
  }, name);
}

/** The name of the selected system, or null. */
async function selection(page: Page): Promise<string | null> {
  return page.evaluate(() => window.__hudMap?.getSelection()?.name ?? null);
}

/** The `data-panel` attribute of the HUD root, or null when it holds none. */
async function panel(page: Page): Promise<string | null> {
  return hud(page).evaluate((root) => root.getAttribute('data-panel'));
}

/** One bounding box, read from the page so a hidden element still gives one. */
interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly width: number;
  readonly height: number;
}

/** Reads the bounding box of one element of the HUD. A missing element gives null. */
async function boxOf(page: Page, selector: string): Promise<Box | null> {
  return hud(page).evaluate((root, name) => {
    const element = root.querySelector(name);
    if (element === null) return null;
    const at = element.getBoundingClientRect();
    return {
      left: at.left,
      top: at.top,
      right: at.right,
      width: at.width,
      height: at.height,
    };
  }, selector);
}

/** True while `checkVisibility` says the element is drawn. A missing element is false. */
async function drawn(page: Page, selector: string): Promise<boolean> {
  return hud(page).evaluate((root, name) => {
    const element = root.querySelector(name);
    return element instanceof HTMLElement && element.checkVisibility();
  }, selector);
}

/** How long a drawer takes to slide, plus room for the frame it lands on. */
const SLIDE_MS = 400;

/**
 * Opens one drawer with one tap on its own tab, whatever drawer is open.
 *
 * The open tab sits beyond its drawer's outer edge, and at 412 pixels the drawer is 360
 * wide and each tab is 30. The open left tab is then 360 to 390 and the closed right tab
 * 382 to 412, so the two overlap by 8 pixels and neither covers the other's middle. One
 * tap therefore moves from one drawer to the other.
 */
async function openDrawer(page: Page, side: 'left' | 'right'): Promise<void> {
  await hud(page).locator(`.gm-hud__drawer-tab--${side}`).tap();
  await page.waitForTimeout(SLIDE_MS);
}

test.describe('the drawers', () => {
  test('a phone viewport puts the panels in drawers', async ({ page }) => {
    await openHud(page);
    await addContent(page);
    await page.waitForTimeout(SLIDE_MS);

    const left = await boxOf(page, '.gm-hud__left');
    const right = await boxOf(page, '.gm-hud__right');
    const canvas = await page.locator('#hud-wrap canvas').boundingBox();
    console.log('the closed drawers', { left, right, canvas });

    expect(left?.right).toBeLessThanOrEqual(0);
    expect(right?.left).toBeGreaterThanOrEqual(412);
    expect(canvas?.width).toBe(412);
    expect(await panel(page)).toBeNull();
  });

  test('a tab opens its drawer and the other tab closes it', async ({ page }) => {
    await openHud(page);
    await addContent(page);

    await openDrawer(page, 'left');
    const openLeft = await boxOf(page, '.gm-hud__left');
    console.log('the open left drawer', openLeft, await panel(page));
    expect(openLeft?.left).toBeCloseTo(0, 0);
    expect(await panel(page)).toBe('left');
    expect(
      await hud(page)
        .locator('.gm-hud__drawer-tab--left')
        .getAttribute('aria-expanded'),
    ).toBe('true');

    // Neither tab covers the middle of the other. The tab is 30 pixels wide, which the
    // 44-pixel floor does not grow, so the two overlap by 8 and both take a tap.
    const onEachTab = await hud(page).evaluate((root) => {
      const name = (selector: string): string => {
        const tab = root.querySelector(selector);
        if (tab === null) return 'nothing';
        const at = tab.getBoundingClientRect();
        const hit = document.elementFromPoint(at.left + at.width / 2, at.top + 10);
        return hit instanceof HTMLElement ? hit.className : 'nothing';
      };
      return {
        left: name('.gm-hud__drawer-tab--left'),
        right: name('.gm-hud__drawer-tab--right'),
      };
    });
    console.log('the element over each tab', onEachTab);
    expect(onEachTab.left).toContain('gm-hud__drawer-tab--left');
    expect(onEachTab.right).toContain('gm-hud__drawer-tab--right');

    await openDrawer(page, 'right');
    const afterLeft = await boxOf(page, '.gm-hud__left');
    const afterRight = await boxOf(page, '.gm-hud__right');
    console.log('the swap', { afterLeft, afterRight });

    expect(afterRight?.right).toBeCloseTo(412, 0);
    expect(afterLeft?.right).toBeLessThanOrEqual(0);
    expect(await panel(page)).toBe('right');
  });

  test('the left drawer holds 256 categories and scrolls them', async ({ page }) => {
    await openHud(page);
    await addCategories(page, 256);
    await openDrawer(page, 'left');

    const read = await hud(page).evaluate((root) => {
      const drawer = root.querySelector('.gm-hud__left');
      const list = root.querySelector('.gm-hud__category-list');
      if (!(drawer instanceof HTMLElement) || !(list instanceof HTMLElement))
        return null;
      return {
        rows: list.querySelectorAll('.gm-hud__category-row').length,
        scrollHeight: list.scrollHeight,
        clientHeight: list.clientHeight,
        drawerBottom: drawer.getBoundingClientRect().bottom,
      };
    });
    console.log('the 256 rows in the drawer', read);

    // The bound the left column holds is the bound the drawer holds: every row is there,
    // and the list scrolls inside the drawer rather than growing past its bottom.
    expect(read?.rows).toBe(256);
    expect(read?.scrollHeight).toBeGreaterThan(read?.clientHeight ?? 0);
    expect(read?.drawerBottom).toBeLessThanOrEqual(881);
  });

  test('an open tab sits beyond its drawer', async ({ page }) => {
    await openHud(page);
    await addContent(page);

    await openDrawer(page, 'left');
    const leftDrawer = await boxOf(page, '.gm-hud__left');
    const leftTab = await boxOf(page, '.gm-hud__drawer-tab--left');

    await openDrawer(page, 'right');
    const rightDrawer = await boxOf(page, '.gm-hud__right');
    const rightTab = await boxOf(page, '.gm-hud__drawer-tab--right');
    console.log('the open tabs', { leftDrawer, leftTab, rightDrawer, rightTab });

    // The tab faces outwards: its inner edge meets the drawer's outer edge, so the
    // drawer shows its whole width and nothing of it is under the tab.
    expect(leftTab?.left).toBeCloseTo(leftDrawer?.right ?? -1, 0);
    expect(rightTab?.right).toBeCloseTo(rightDrawer?.left ?? -1, 0);

    // The tab is 30 wide and the 44-pixel floor does not grow it, which is what lets the
    // two tabs share the 52 pixels beside a 360-pixel drawer.
    expect(leftTab?.width).toBeCloseTo(30, 0);
    expect(rightTab?.width).toBeCloseTo(30, 0);
  });

  test('the open drawer hides what is behind it', async ({ page }) => {
    await openHud(page);
    await addContent(page);
    await openDrawer(page, 'left');

    const read = await hud(page).evaluate((root) => {
      const drawer = root.querySelector('.gm-hud__left');
      if (!(drawer instanceof HTMLElement)) return null;
      const style = getComputedStyle(drawer);
      return { background: style.backgroundColor, gap: style.gap };
    });
    console.log('the open left drawer', read);

    // The mockup blurs what is behind a 96 percent drawer. The blur is banned, so the
    // drawer is opaque instead, or the top bar's own text reads through it.
    expect(read?.background).toBe('rgb(14, 10, 14)');
    // One sheet, not two bordered boxes with a band of map between them.
    expect(read?.gap).toBe('0px');
  });

  test('a closed drawer takes no focus', async ({ page }) => {
    await openHud(page);
    await addContent(page);
    await page.waitForTimeout(SLIDE_MS);

    const reachable = await hud(page).evaluate((root) => {
      const names: string[] = [];
      for (const drawer of ['.gm-hud__left', '.gm-hud__right']) {
        const box = root.querySelector(drawer);
        if (box === null) continue;
        for (const node of box.querySelectorAll('button, input, [tabindex]')) {
          if (!(node instanceof HTMLElement)) continue;
          node.focus();
          if (node.ownerDocument.activeElement === node) names.push(node.className);
        }
      }
      return names;
    });
    console.log('the elements the Tab key reaches', reachable);
    expect(reachable).toEqual([]);
  });

  test('the scrim closes the drawer on a tap', async ({ page }) => {
    await openHud(page);
    await addContent(page);

    await hud(page).locator('.gm-hud__drawer-tab--left').tap();
    await page.waitForTimeout(SLIDE_MS);
    expect(await panel(page)).toBe('left');

    // A point of the map beside the open drawer and clear of its tab, which the scrim
    // covers while a drawer is open.
    await page.touchscreen.tap(400, 700);
    await page.waitForTimeout(SLIDE_MS);
    const left = await boxOf(page, '.gm-hud__left');
    console.log('after the scrim tap', { panel: await panel(page), left });

    expect(await panel(page)).toBeNull();
    expect(left?.right).toBeLessThanOrEqual(0);
  });

  test('the scrim covers the top bar', async ({ page }) => {
    await openHud(page);
    await addContent(page);
    await hud(page).locator('.gm-hud__drawer-tab--left').tap();
    await page.waitForTimeout(SLIDE_MS);

    const onTop = await hud(page).evaluate((root) => {
      const name = (x: number, y: number): string => {
        const hit = document.elementFromPoint(x, y);
        return hit instanceof HTMLElement ? hit.className : 'nothing';
      };
      const reset = root.querySelector('.gm-hud__reset');
      const bar = root.querySelector('.gm-hud__top-bar');
      const drawer = root.querySelector('.gm-hud__left');
      if (reset === null || bar === null || drawer === null) return null;
      const at = reset.getBoundingClientRect();
      const row = bar.getBoundingClientRect();
      const hit = document.elementFromPoint(
        at.left + at.width / 2,
        at.top + at.height / 2,
      );
      return {
        box: { left: at.left, top: at.top, width: at.width, height: at.height },
        onReset: hit instanceof HTMLElement ? hit.className : 'nothing',
        // The drawer covers the left 360 of the 412, and the scrim covers the rest. A
        // point over the button therefore belongs to one of the two, never to the bar.
        coveredByDrawer: hit !== null && drawer.contains(hit),
        // A point of the bar beside the open drawer, which the scrim alone covers.
        onBar: name(row.right - 6, at.top + at.height / 2),
      };
    });
    console.log('the elements over the top bar', onTop);

    // The reset button is not reachable. Its middle is inside the drawer's 360 pixels,
    // so the drawer covers it, and the scrim covers the bar beside the drawer.
    expect(onTop?.onReset).not.toBe('gm-hud__reset');
    expect(onTop?.coveredByDrawer).toBe(true);
    expect(onTop?.onBar).toBe('gm-hud__scrim');
  });

  test('selecting a system opens the right drawer', async ({ page }) => {
    await openHud(page);
    await addContent(page);

    await select(page, 'One');
    await page.waitForTimeout(SLIDE_MS);
    expect(await panel(page)).toBe('right');

    await openDrawer(page, 'left');
    expect(await panel(page)).toBe('left');
    // The row of a category list opens the list; the system row under it selects.
    await hud(page).locator('.gm-hud__category-row[data-name="Alpha"]').click();
    await hud(page).locator('.gm-hud__system-row[data-name="Two"]').click();
    await page.waitForTimeout(SLIDE_MS);
    console.log('after the row click', await panel(page), await selection(page));

    expect(await panel(page)).toBe('right');
    expect(await selection(page)).toBe('Two');
  });

  test('the right tab names what the drawer holds', async ({ page }) => {
    await openHud(page);
    await addContent(page);
    const label = hud(page).locator(
      '.gm-hud__drawer-tab--right .gm-hud__drawer-tab-label',
    );

    await expect(label).toHaveText('DATA');
    await select(page, 'One');
    await expect(label).toHaveText('SYSTEM');
  });

  test('the top bar takes two rows and drops the region name', async ({ page }) => {
    await openHud(page, { datasets: 4 });
    const title = await boxOf(page, '.gm-hud__title');
    const reset = await boxOf(page, '.gm-hud__reset');
    const field = await boxOf(page, '.gm-hud__dataset');
    console.log('the narrow bar', { title, reset, field });

    // The title and the reset button share the first row. The two tops differ because
    // the floor makes the button 44 pixels tall and the title is not, so the reading is
    // the vertical middle of each.
    const middle = (box: Box | null): number =>
      (box?.top ?? 0) + (box?.height ?? 0) / 2;
    expect(middle(title)).toBeCloseTo(middle(reset), 0);
    // The field takes a row of its own, below both.
    expect(field?.top).toBeGreaterThanOrEqual((reset?.top ?? 0) + (reset?.height ?? 0));
    expect(await drawn(page, '.gm-hud__region')).toBe(false);
  });

  test('the narrow bar gives the field a row of its own', async ({ page }) => {
    await openHud(page, { datasets: 4 });
    const reading = await hud(page).evaluate((root) => {
      const bar = root.querySelector('.gm-hud__top-bar');
      const centre = root.querySelector('.gm-hud__top-centre');
      if (bar === null || centre === null) return null;
      const style = getComputedStyle(bar);
      const content =
        bar.getBoundingClientRect().width -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight) -
        Number.parseFloat(style.borderLeftWidth) -
        Number.parseFloat(style.borderRightWidth);
      return { content, group: centre.getBoundingClientRect().width };
    });
    console.log('the field row', reading);
    expect(reading?.group).toBeCloseTo(reading?.content ?? -1, 0);
  });

  test('no element of the narrow layout blurs its backdrop', async ({ page }) => {
    await openHud(page, { datasets: 4 });
    await addContent(page);

    const found: { className: string; filter: string }[] = [];
    for (const side of ['left', 'right'] as const) {
      await openDrawer(page, side);
      found.push(
        ...(await hud(page).evaluate((root) => {
          const out: { className: string; filter: string }[] = [];
          for (const element of [root, ...root.querySelectorAll('*')]) {
            const style = getComputedStyle(element);
            const filter =
              style.backdropFilter === ''
                ? style.getPropertyValue('-webkit-backdrop-filter')
                : style.backdropFilter;
            if (filter !== 'none' && filter !== '') {
              out.push({ className: (element as HTMLElement).className, filter });
            }
          }
          return out;
        })),
      );
    }
    const counted = await hud(page).evaluate(
      (root) => root.querySelectorAll('*').length,
    );
    console.log('the blurred elements of', counted, 'read', found);

    expect(counted).toBeGreaterThan(50);
    expect(found).toEqual([]);
  });
});

test.describe('the empty right drawer', () => {
  test('the empty drawer states why it is empty', async ({ page }) => {
    await openHud(page);
    await addContent(page);
    await hud(page).locator('.gm-hud__drawer-tab--right').tap();
    await page.waitForTimeout(SLIDE_MS);

    await expect(hud(page).locator('.gm-hud__right-empty')).toBeVisible();
    await expect(hud(page).locator('.gm-hud__right-empty-text')).toContainText(
      'NO SYSTEM SELECTED',
    );
    await expect(hud(page).locator('.gm-hud__right-empty-text')).toContainText(
      'TAP A MARKER ON THE MAP',
    );
    expect(await drawn(page, '.gm-hud__info')).toBe(false);
  });

  test('a selection replaces the placeholder', async ({ page }) => {
    await openHud(page);
    await addContent(page);

    await select(page, 'One');
    await page.waitForTimeout(SLIDE_MS);
    expect(await drawn(page, '.gm-hud__info')).toBe(true);
    expect(await drawn(page, '.gm-hud__right-empty')).toBe(false);

    await select(page, null);
    await page.waitForTimeout(SLIDE_MS);
    expect(await drawn(page, '.gm-hud__info')).toBe(false);
    expect(await drawn(page, '.gm-hud__right-empty')).toBe(true);
  });
});

test.describe('the tap targets', () => {
  /** Every drawn button and input under the HUD root, with its box. */
  async function drawnControls(
    page: Page,
  ): Promise<{ className: string; width: number; height: number }[]> {
    return hud(page).evaluate((root) => {
      const out: { className: string; width: number; height: number }[] = [];
      for (const node of root.querySelectorAll('button, input')) {
        if (!(node instanceof HTMLElement) || !node.checkVisibility()) continue;
        const at = node.getBoundingClientRect();
        out.push({ className: node.className, width: at.width, height: at.height });
      }
      return out;
    });
  }

  test('every drawn button and input clears the floor', async ({ page }) => {
    await openHud(page, { datasets: 4 });
    await addContent(page);
    const seen = new Set<string>();
    const small: { className: string; width: number; height: number }[] = [];
    const check = async (state: string): Promise<void> => {
      const controls = await drawnControls(page);
      console.log(`the controls of ${state}`, controls.length);
      expect(controls.length).toBeGreaterThan(0);
      for (const control of controls) {
        seen.add(control.className);
        // The edge tab is the one exemption, and it is a width alone. Two 44-pixel tabs
        // would not fit beside a 360-pixel drawer on a 412-pixel screen.
        const floor = control.className.includes('gm-hud__drawer-tab') ? 30 : 44;
        if (control.width < floor || control.height < 44) small.push(control);
      }
    };

    // The left drawer with a category list open.
    await hud(page).locator('.gm-hud__drawer-tab--left').tap();
    await page.waitForTimeout(SLIDE_MS);
    await hud(page).locator('.gm-hud__category-row[data-name="Alpha"]').click();
    await check('the left drawer');

    // The right drawer with a system selected.
    await select(page, 'One');
    await page.waitForTimeout(SLIDE_MS);
    await check('the right drawer with a selection');

    // The right drawer with nothing selected.
    await select(page, null);
    await page.waitForTimeout(SLIDE_MS);
    await check('the empty right drawer');

    // The dataset library, and then the lightbox over it. The drawer closes first,
    // because the scrim covers the top bar while one is open.
    await hud(page).locator('.gm-hud__drawer-tab--right').tap();
    await page.waitForTimeout(SLIDE_MS);
    expect(await panel(page)).toBeNull();
    await hud(page).locator('.gm-hud__dataset').click();
    await expect(hud(page).locator('.gm-hud__dialog')).toBeVisible();
    await check('the dataset library');
    await hud(page).locator('.gm-hud__dialog-close').click();

    await page.evaluate(() => {
      window.__hudMap?.addSystems([
        {
          name: 'Pictured',
          coords: { x: 0, y: 0, z: 400 },
          categories: ['Alpha'],
          images: [{ url: '/picture-one.png', caption: 'APPROACH VECTOR' }],
        },
      ] as never);
    });
    await select(page, 'Pictured');
    await page.waitForTimeout(SLIDE_MS);
    await hud(page).locator('.gm-hud__thumb').first().click();
    await expect(hud(page).locator('.gm-hud__lightbox')).toBeVisible();
    await check('the lightbox');

    console.log('the controls under the floor', small);
    expect(small).toEqual([]);

    // Every button and input the HUD holds was drawn in one of the states above, so no
    // control hid from the floor.
    const built = await hud(page).evaluate((root) => {
      const names = new Set<string>();
      for (const node of root.querySelectorAll('button, input')) {
        names.add((node as HTMLElement).className);
      }
      return [...names];
    });
    console.log('the classes the HUD builds', built, 'the classes read', [...seen]);
    expect(built.filter((name) => !seen.has(name))).toEqual([]);
  });

  test('the dot keeps its swatch', async ({ page }) => {
    await openHud(page);
    await addContent(page);
    await hud(page).locator('.gm-hud__drawer-tab--left').tap();
    await page.waitForTimeout(SLIDE_MS);

    const dot = await boxOf(page, '.gm-hud__category-dot');
    const swatch = await boxOf(page, '.gm-hud__category-swatch');

    // The same swatch at the wide width. The floor grows the dot's box and leaves the
    // mark inside it, so the two readings are equal.
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.waitForTimeout(SLIDE_MS);
    const wide = await boxOf(page, '.gm-hud__category-swatch');
    console.log('the dot and its swatch', { dot, swatch, wide });

    expect(dot?.width).toBeGreaterThanOrEqual(44);
    expect(dot?.height).toBeGreaterThanOrEqual(44);
    expect(swatch?.width).toBeCloseTo(wide?.width ?? -1, 1);
    expect(swatch?.height).toBeCloseTo(wide?.height ?? -1, 1);
  });
});

test.describe('the keys and the map input', () => {
  test('Escape closes the drawer before the selection', async ({ page }) => {
    await openHud(page);
    await addContent(page);
    await select(page, 'One');
    await page.waitForTimeout(SLIDE_MS);
    expect(await panel(page)).toBe('right');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(SLIDE_MS);
    expect(await panel(page)).toBeNull();
    expect(await selection(page)).toBe('One');

    await page.keyboard.press('Escape');
    expect(await selection(page)).toBeNull();
  });

  test('the map takes the input with no drawer open', async ({ page }) => {
    await openHud(page);
    const before = await page.evaluate(() => window.__hudMap?.getView());
    await page.mouse.move(176, 425);
    await page.mouse.down();
    await page.mouse.move(236, 455, { steps: 6 });
    await page.mouse.up();
    const after = await page.evaluate(() => window.__hudMap?.getView());
    console.log('the orbit readings', before, after);

    expect((after?.yaw ?? 0) - (before?.yaw ?? 0)).toBeCloseTo(18, 3);
    expect((after?.pitch ?? 0) - (before?.pitch ?? 0)).toBeCloseTo(9, 3);
  });
});

test.describe('the dataset library', () => {
  test('the dialog fills a phone screen', async ({ page }) => {
    await openHud(page, { datasets: 6 });
    await hud(page).locator('.gm-hud__dataset').click();
    await expect(hud(page).locator('.gm-hud__dialog')).toBeVisible();

    const frame = await boxOf(page, '.gm-hud__dialog-frame');
    console.log('the dialog frame', frame);
    expect(frame?.width).toBeCloseTo(412, 0);
    expect(frame?.height).toBeCloseTo(880, 0);
  });

  test('the cards take one column', async ({ page }) => {
    await openHud(page, { datasets: 6 });
    await hud(page).locator('.gm-hud__dataset').click();
    await expect(hud(page).locator('.gm-hud__dialog')).toBeVisible();

    const cards = await hud(page)
      .locator('.gm-hud__dataset-card')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const at = node.getBoundingClientRect();
          return { left: at.left, top: at.top };
        }),
      );
    console.log('the cards', cards);

    expect(cards.length).toBe(6);
    expect(new Set(cards.map((card) => Math.round(card.left))).size).toBe(1);
    expect(new Set(cards.map((card) => Math.round(card.top))).size).toBe(6);
  });

  test('the chip row scrolls sideways', async ({ page }) => {
    await openHud(page, { datasets: 8, collections: 8 });
    await hud(page).locator('.gm-hud__dataset').click();
    await expect(hud(page).locator('.gm-hud__dialog')).toBeVisible();

    const row = await hud(page)
      .locator('.gm-hud__collections')
      .evaluate((node) => ({
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
      }));
    const tops = await hud(page)
      .locator('.gm-hud__collection')
      .evaluateAll((nodes) =>
        nodes.map((node) => Math.round(node.getBoundingClientRect().top)),
      );
    console.log('the chip row', row, tops);

    expect(row.scrollWidth).toBeGreaterThan(row.clientWidth);
    expect(new Set(tops).size).toBe(1);
  });
});

test.describe('the breakpoint', () => {
  test('the drawer width follows the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openHud(page);
    await addContent(page);
    await hud(page).locator('.gm-hud__drawer-tab--left').tap();
    await page.waitForTimeout(SLIDE_MS);
    const narrow = await boxOf(page, '.gm-hud__left');

    await page.setViewportSize({ width: 412, height: 880 });
    await page.waitForTimeout(SLIDE_MS);
    const wider = await boxOf(page, '.gm-hud__left');
    console.log('the drawer widths', { narrow, wider });

    // 88 percent of 360 is 316.8, and the 360-pixel arm binds at 412.
    expect(narrow?.width).toBeCloseTo(316.8, 0);
    expect(wider?.width).toBeCloseTo(360, 0);
  });

  test('the layout crosses the breakpoint without a reload', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await openHud(page);
    await addContent(page);
    const wide = {
      region: await drawn(page, '.gm-hud__region'),
      tab: await drawn(page, '.gm-hud__drawer-tab--left'),
    };

    await page.setViewportSize({ width: 412, height: 880 });
    await page.waitForTimeout(SLIDE_MS);
    const narrow = {
      region: await drawn(page, '.gm-hud__region'),
      tab: await drawn(page, '.gm-hud__drawer-tab--left'),
    };

    await page.setViewportSize({ width: 1600, height: 900 });
    await page.waitForTimeout(SLIDE_MS);
    const back = {
      region: await drawn(page, '.gm-hud__region'),
      tab: await drawn(page, '.gm-hud__drawer-tab--left'),
    };
    console.log('the three readings', { wide, narrow, back });

    expect(wide).toEqual({ region: true, tab: false });
    expect(narrow).toEqual({ region: false, tab: true });
    expect(back).toEqual({ region: true, tab: false });
  });

  test('a drawer open at the narrow width is inert at the wide one', async ({
    page,
  }) => {
    await openHud(page);
    await addContent(page);
    await select(page, 'One');
    await page.waitForTimeout(SLIDE_MS);
    await openDrawer(page, 'left');
    expect(await panel(page)).toBe('left');

    await page.setViewportSize({ width: 1600, height: 900 });
    await page.waitForTimeout(SLIDE_MS);
    const shown = {
      leftTab: await drawn(page, '.gm-hud__drawer-tab--left'),
      rightTab: await drawn(page, '.gm-hud__drawer-tab--right'),
      scrim: await drawn(page, '.gm-hud__scrim'),
      placeholder: await drawn(page, '.gm-hud__right-empty'),
    };
    const left = await boxOf(page, '.gm-hud__left');
    const info = await boxOf(page, '.gm-hud__info');
    console.log('the wide reading', shown, { left, info });

    expect(shown).toEqual({
      leftTab: false,
      rightTab: false,
      scrim: false,
      placeholder: false,
    });
    // Neither column is a drawer any more, whatever the attribute holds: each is back
    // at the box the wide layout gives it.
    expect(left?.left).toBe(22);
    expect(left?.width).toBe(316);
    expect(info?.width).toBe(380);

    await page.keyboard.press('Escape');
    expect(await selection(page)).toBeNull();
  });
});

// The band between the two breakpoints. The drawers start below 1400 pixels and the
// phone rules start below 720, so a 1024-pixel window takes the drawers alone: the bar
// keeps its one row and its region name, and every control keeps the size a pointer
// gets.
test.describe('the top bar of the demo page', () => {
  test('the zoom readout and the reset button are whole', async ({ page }) => {
    await openMap(page, '', { demoData: true, hud: true });

    const read = await page.evaluate(() => {
      const of = (name: string): { client: number; scroll: number } | null => {
        const element = document.querySelector(name);
        if (!(element instanceof HTMLElement)) return null;
        return { client: element.clientWidth, scroll: element.scrollWidth };
      };
      return {
        title: of('.gm-hud__title'),
        zoom: of('.gm-hud__zoom'),
        reset: of('.gm-hud__reset'),
      };
    });
    console.log('the first row of the narrow bar', read);

    // A cut number is a wrong number, so the two readings that carry one stay whole and
    // the title is the one that gives way.
    expect(read.zoom?.scroll).toBeLessThanOrEqual(read.zoom?.client ?? 0);
    expect(read.reset?.scroll).toBeLessThanOrEqual(read.reset?.client ?? 0);
    expect(read.title?.scroll).toBeGreaterThan(read.title?.client ?? 0);
  });
});

test.describe('under reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('the drawers, the tabs and the scrim drop the slide', async ({ page }) => {
    await openHud(page);
    await addContent(page);

    const read = async (): Promise<readonly string[]> =>
      hud(page).evaluate((root) =>
        [
          '.gm-hud__left',
          '.gm-hud__right',
          '.gm-hud__drawer-tab--left',
          '.gm-hud__drawer-tab--right',
          '.gm-hud__drawer-tab-chevron',
          '.gm-hud__scrim',
        ].map((name) => {
          const element = root.querySelector(name);
          if (element === null) return 'missing';
          return getComputedStyle(element).transitionDuration;
        }),
      );

    const closed = await read();
    await openDrawer(page, 'left');
    const open = await read();
    console.log('the transition durations', { closed, open });

    // The rule that drops the slide sits after the two layout blocks, which write a
    // `transition` shorthand. A rule before them has no effect, and this reads that.
    for (const value of [...closed, ...open]) expect(value).toBe('0s');
  });
});

test.describe('the band between the two breakpoints', () => {
  test.use({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 });

  test('the band takes the drawers alone', async ({ page }) => {
    await openHud(page, { datasets: 4 });
    await addContent(page);
    const bar = await boxOf(page, '.gm-hud__top-bar');
    const shown = {
      tab: await drawn(page, '.gm-hud__drawer-tab--left'),
      region: await drawn(page, '.gm-hud__region'),
    };

    // The dot is inside the left drawer, so the drawer opens to be read.
    await hud(page).locator('.gm-hud__drawer-tab--left').tap();
    await page.waitForTimeout(SLIDE_MS);
    const dot = await boxOf(page, '.gm-hud__category-dot');

    // The same dot at the wide width, where the left drawer is the left column again.
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.waitForTimeout(SLIDE_MS);
    const wide = await boxOf(page, '.gm-hud__category-dot');
    console.log('the band reading', { bar, shown, dot, wide });

    expect(shown).toEqual({ tab: true, region: true });
    expect(bar?.height).toBe(54);
    expect(dot?.width).toBeCloseTo(wide?.width ?? -1, 1);
    expect(dot?.height).toBeCloseTo(wide?.height ?? -1, 1);
  });
});
