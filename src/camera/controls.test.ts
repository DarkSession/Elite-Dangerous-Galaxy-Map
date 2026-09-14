import { describe, expect, test } from 'vitest';
import { project } from './projection';
import {
  applyKeyDown,
  applyKeyUp,
  beginDrag,
  beginPress,
  dragCursor,
  isClick,
  moveByKeys,
  notchesFromWheel,
  orbit,
  trackPress,
  zoomByNotches,
} from './controls';
import { createDefaultView, MAX_DISTANCE, MIN_DISTANCE } from './view';

const viewport = { width: 1920, height: 1080 };

describe('the zoom', () => {
  test('gives 17,391 light years after one forward notch at 20,000', () => {
    const view = createDefaultView();
    view.distance = 20000;
    zoomByNotches(view, 1);
    expect(Math.abs(view.distance - 17391)).toBeLessThan(1);
  });

  test('stops at the limits', () => {
    const view = createDefaultView();
    zoomByNotches(view, 100);
    expect(view.distance).toBe(MIN_DISTANCE);
    zoomByNotches(view, -100);
    expect(view.distance).toBe(MAX_DISTANCE);
  });

  // The close limit moved from 500 to 10 light years. The wheel keeps its 1.15 step,
  // so the range alone is wider and the close limit takes more notches to reach.
  test('takes 68 notches from 120,000 to reach the close limit', () => {
    const view = createDefaultView();
    view.distance = MAX_DISTANCE;
    let notches = 0;
    while (view.distance > MIN_DISTANCE) {
      zoomByNotches(view, 1);
      notches += 1;
      expect(notches).toBeLessThan(200);
    }
    expect(notches).toBe(68);
  });

  test('reads a wheel notch as one forward notch', () => {
    expect(notchesFromWheel(-100, 0)).toBe(1);
    expect(notchesFromWheel(100, 0)).toBe(-1);
    expect(notchesFromWheel(-1, 1)).toBe(1);
  });
});

describe('the orbit', () => {
  test('stops the pitch at 89 degrees after a long downward drag', () => {
    const view = createDefaultView();
    orbit(view, 0, 1000);
    expect(view.pitch).toBe(89);
  });

  test('turns 0.3 degrees of yaw per pixel and wraps', () => {
    const view = createDefaultView();
    orbit(view, 100, 0);
    expect(view.yaw).toBeCloseTo(30, 9);
    orbit(view, -200, 0);
    expect(view.yaw).toBeCloseTo(330, 9);
  });
});

describe('the movement keys', () => {
  test('move one quarter of the distance in one second', () => {
    const view = createDefaultView();
    view.distance = 20000;
    view.pitch = 89;
    const before: [number, number, number] = [...view.cursor];
    moveByKeys(view, new Set(['W']), 1);
    const moved = Math.hypot(
      view.cursor[0] - before[0],
      view.cursor[1] - before[1],
      view.cursor[2] - before[2],
    );
    expect(Math.abs(moved - 5000)).toBeLessThan(500);

    // The old cursor now sits below the screen centre, so `W` moved the view up.
    const old = project(view, before, viewport);
    expect(old.y).toBeGreaterThan(viewport.height / 2 + 1);
    expect(Math.abs(old.x - viewport.width / 2)).toBeLessThan(1);
  });

  test('move up and down with R and F', () => {
    const view = createDefaultView();
    view.distance = 20000;
    moveByKeys(view, new Set(['R']), 1);
    expect(view.cursor[1]).toBeCloseTo(5000, 6);
    moveByKeys(view, new Set(['F']), 2);
    expect(view.cursor[1]).toBeCloseTo(-5000, 6);
  });

  test('move left and right with A and D', () => {
    const view = createDefaultView();
    view.distance = 20000;
    moveByKeys(view, new Set(['D']), 1);
    expect(view.cursor[0]).toBeCloseTo(5000, 6);
    expect(view.cursor[2]).toBeCloseTo(0, 6);
  });

  test('follow the yaw, so D at yaw 90 moves the cursor toward -z', () => {
    const view = createDefaultView();
    view.distance = 20000;
    view.yaw = 90;
    moveByKeys(view, new Set(['D']), 1);
    expect(view.cursor[0]).toBeCloseTo(0, 6);
    expect(view.cursor[2]).toBeCloseTo(-5000, 6);

    // The old cursor now sits left of the screen centre, so `D` moved the view right.
    const old = project(view, [0, 0, 0], viewport);
    expect(old.x).toBeLessThan(viewport.width / 2 - 1);
  });
});

describe('the right drag', () => {
  test('keeps the plane point under the pointer', () => {
    const view = createDefaultView();
    const startPixel = { x: 800, y: 600 };
    const start = beginDrag(view, startPixel, viewport);
    expect(start).not.toBeNull();
    const endPixel = { x: 1000, y: 600 };
    dragCursor(view, start as NonNullable<typeof start>, endPixel, viewport);

    const screen = project(view, (start as NonNullable<typeof start>).point, viewport);
    expect(Math.abs(screen.x - endPixel.x)).toBeLessThan(1);
    expect(Math.abs(screen.y - endPixel.y)).toBeLessThan(1);
  });
});

describe('the click test', () => {
  test('reads a short still press as a click', () => {
    const press = beginPress({ x: 400, y: 300 }, 0);
    trackPress(press, { x: 403, y: 300 });

    expect(isClick(press, 120)).toBe(true);
  });

  test('reads a press that moves far as an orbit, even when it comes back', () => {
    const view = createDefaultView();
    const yawBefore = view.yaw;
    const press = beginPress({ x: 400, y: 300 }, 0);
    trackPress(press, { x: 440, y: 300 });
    orbit(view, 40, 0);
    trackPress(press, { x: 400, y: 300 });
    orbit(view, -40, 0);

    expect(isClick(press, 120)).toBe(false);
    expect(view.yaw).toBeCloseTo(yawBefore, 9);
  });

  test('reads a long still press as an orbit', () => {
    const press = beginPress({ x: 400, y: 300 }, 0);

    expect(isClick(press, 600)).toBe(false);
  });

  test('holds the two limits at 4 CSS pixels and 400 milliseconds', () => {
    const onLimit = beginPress({ x: 0, y: 0 }, 0);
    trackPress(onLimit, { x: 4, y: 0 });
    expect(isClick(onLimit, 400)).toBe(true);

    const pastPixels = beginPress({ x: 0, y: 0 }, 0);
    trackPress(pastPixels, { x: 5, y: 0 });
    expect(isClick(pastPixels, 100)).toBe(false);

    const pastTime = beginPress({ x: 0, y: 0 }, 0);
    expect(isClick(pastTime, 401)).toBe(false);
  });
});

describe('the form-field guard', () => {
  test('ignores a key aimed at an input, a text area, a select or an editable', () => {
    const keys = new Set<string>();
    for (const target of [
      { tagName: 'INPUT' },
      { tagName: 'TEXTAREA' },
      { tagName: 'SELECT' },
      { tagName: 'DIV', isContentEditable: true },
    ]) {
      applyKeyDown(keys, 'KeyW', target);
    }

    expect(keys.size).toBe(0);
  });

  test('holds a key aimed at the canvas', () => {
    const keys = new Set<string>();
    applyKeyDown(keys, 'KeyW', { tagName: 'CANVAS' });

    expect(keys.has('W')).toBe(true);
  });

  test('leaves the cursor still when a key goes down in a field', () => {
    const keys = new Set<string>();
    const view = createDefaultView();
    view.distance = 20000;
    const before: [number, number, number] = [...view.cursor];

    applyKeyDown(keys, 'KeyW', { tagName: 'INPUT' });
    applyKeyUp(keys, 'KeyW');
    moveByKeys(view, keys, 1);

    expect(view.cursor).toEqual(before);
  });
});
