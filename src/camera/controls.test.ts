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
  zoomStep,
  zoomTarget,
} from './controls';
import { createDefaultView, MAX_DISTANCE, MIN_DISTANCE } from './view';

const viewport = { width: 1920, height: 1080 };

describe('the zoom', () => {
  test('gives a target of 17,391 light years after one forward notch at 20,000', () => {
    expect(Math.abs(zoomTarget(20000, 1) - 17391)).toBeLessThan(1);
  });

  test('stops the target at the limits', () => {
    expect(zoomTarget(20000, 100)).toBe(MIN_DISTANCE);
    expect(zoomTarget(20000, -100)).toBe(MAX_DISTANCE);
  });

  // The close limit moved from 500 to 10 light years. The wheel keeps its 1.15 step,
  // so the range alone is wider and the close limit takes more notches to reach.
  test('takes 68 notches from 120,000 to reach the close limit', () => {
    let target = MAX_DISTANCE;
    let notches = 0;
    while (target > MIN_DISTANCE) {
      target = zoomTarget(target, 1);
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

describe('the zoom glide', () => {
  const ONE_NOTCH_TARGET = 17391.3043;

  /** Steps the glide until it lands, and gives the steps it took. */
  const stepsToLand = (start: number, target: number, seconds: number): number => {
    let distance = start;
    let steps = 0;
    while (distance !== target) {
      distance = zoomStep(distance, target, seconds);
      steps += 1;
      expect(steps).toBeLessThan(1000);
    }
    return steps;
  };

  test('lands one notch in 13 frames at 60 frames a second, which is 217 ms', () => {
    let distance = 20000;
    for (let step = 1; step <= 12; step += 1) {
      distance = zoomStep(distance, ONE_NOTCH_TARGET, 1 / 60);
    }
    expect(Math.abs(distance - 17450.12)).toBeLessThan(0.01);
    expect(distance).not.toBe(ONE_NOTCH_TARGET);

    distance = zoomStep(distance, ONE_NOTCH_TARGET, 1 / 60);
    expect(distance).toBe(ONE_NOTCH_TARGET);
    expect(Math.round((13 * 1000) / 60)).toBe(217);
  });

  test('reads the time and not the frame count', () => {
    const slow = stepsToLand(20000, ONE_NOTCH_TARGET, 1 / 30);
    const fast = stepsToLand(20000, ONE_NOTCH_TARGET, 1 / 144);
    expect(slow).toBe(7);
    expect(fast).toBe(31);

    const slowMs = (slow * 1000) / 30;
    const fastMs = (fast * 1000) / 144;
    expect(Math.round(slowMs)).toBe(233);
    expect(Math.round(fastMs)).toBe(215);
    expect(Math.abs(slowMs - (13 * 1000) / 60)).toBeLessThan(20);
    expect(Math.abs(fastMs - (13 * 1000) / 60)).toBeLessThan(20);
  });

  test('halves the gap every 50 milliseconds', () => {
    const distance = zoomStep(20000, ONE_NOTCH_TARGET, 0.05);
    expect(Math.abs(distance - 18650.1)).toBeLessThan(0.01);
    expect(distance).toBeCloseTo(Math.sqrt(20000 * ONE_NOTCH_TARGET), 6);
  });

  test('lands the whole sweep from 120,000 to 10 in 517 milliseconds', () => {
    const steps = stepsToLand(MAX_DISTANCE, MIN_DISTANCE, 1 / 60);
    expect(steps).toBe(31);
    expect(Math.round((steps * 1000) / 60)).toBe(517);
  });

  test('moves the picture by under 3 per cent in the first frame of a notch', () => {
    const forward = zoomStep(20000, zoomTarget(20000, 1), 1 / 60);
    const backward = zoomStep(20000, zoomTarget(20000, -1), 1 / 60);
    const forwardPerCent = ((20000 - forward) / 20000) * 100;
    const backwardPerCent = ((backward - 20000) / 20000) * 100;
    expect(Math.abs(forwardPerCent - 2.84)).toBeLessThan(0.01);
    expect(Math.abs(backwardPerCent - 2.93)).toBeLessThan(0.01);
    expect(forwardPerCent).toBeLessThan(3);
    expect(backwardPerCent).toBeLessThan(3);
  });

  test('keeps the 1.15 step over five notches on a held wheel', () => {
    let target: number | null = null;
    let distance = 20000;
    for (let notch = 0; notch < 5; notch += 1) {
      const before: number = target ?? distance;
      target = zoomTarget(before, 1);
      expect(target).toBeCloseTo(before / 1.15, 6);
      distance = zoomStep(distance, target, 1 / 60);
    }
    const landed = target as number;
    while (distance !== landed) distance = zoomStep(distance, landed, 1 / 60);
    expect(Math.abs(distance - 9943.53)).toBeLessThan(0.01);
    expect(distance).toBeCloseTo(20000 / 1.15 ** 5, 6);
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
