import { describe, expect, test } from 'vitest';
import { inverseViewProjection, project } from './projection';
import {
  ALL_INTERACTION,
  applyKeyDown,
  applyKeyUp,
  attachControls,
  beginDrag,
  beginPress,
  dragCursor,
  isClick,
  moveByKeys,
  notchesFromWheel,
  NO_TOUCH,
  TURN_DEGREES_PER_SECOND,
  orbit,
  readInteraction,
  pinchDistance,
  pinchMiddle,
  touchGesture,
  trackPress,
  zoomStep,
  zoomTarget,
} from './controls';
import type { TouchPhase, TouchResult, TouchState } from './controls';
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

  test('stops the pitch at -89 degrees after a long upward drag', () => {
    const view = createDefaultView();
    orbit(view, 0, -1000);
    expect(view.pitch).toBe(-89);
  });

  // The scenario "A drag crosses the plane with no step" of `map-navigation`. There is
  // no dead band at 0: every pixel of the drag is worth the same 0.3 degrees on both
  // sides of the plane, so the crossing reads as one movement.
  test('crosses 0 degrees in even steps of 0.3 a pixel', () => {
    const view = createDefaultView();
    view.pitch = 3;
    const readings: number[] = [];
    for (let pixel = 0; pixel < 20; pixel += 1) {
      orbit(view, 0, -1);
      readings.push(view.pitch);
    }
    expect(view.pitch).toBeCloseTo(-3, 9);
    expect(readings.some((pitch) => Math.abs(pitch) < 1e-9)).toBe(true);
    for (let index = 1; index < readings.length; index += 1) {
      const step = (readings[index - 1] as number) - (readings[index] as number);
      expect(step).toBeCloseTo(0.3, 9);
    }
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

describe('the turn keys', () => {
  test('turn 60 degrees a second, E up and Q down', () => {
    expect(TURN_DEGREES_PER_SECOND).toBe(60);

    const view = createDefaultView();
    view.yaw = 0;
    moveByKeys(view, new Set(['E']), 1);
    expect(view.yaw).toBeCloseTo(60, 6);

    view.yaw = 100;
    moveByKeys(view, new Set(['Q']), 0.5);
    expect(view.yaw).toBeCloseTo(70, 6);
  });

  test('wrap the yaw into 0 to 360', () => {
    const view = createDefaultView();
    view.yaw = 10;
    moveByKeys(view, new Set(['Q']), 1);
    expect(view.yaw).toBeCloseTo(310, 6);

    view.yaw = 330;
    moveByKeys(view, new Set(['E']), 1);
    expect(view.yaw).toBeCloseTo(30, 6);
  });

  test('cancel when both are held', () => {
    const view = createDefaultView();
    view.yaw = 45;
    moveByKeys(view, new Set(['Q', 'E']), 2);
    expect(view.yaw).toBeCloseTo(45, 6);
  });

  test('change no pitch, no distance and no cursor', () => {
    const view = createDefaultView();
    view.distance = 20000;
    view.pitch = 35;
    const cursor: [number, number, number] = [...view.cursor];
    moveByKeys(view, new Set(['E']), 1);

    expect(view.pitch).toBeCloseTo(35, 6);
    expect(view.distance).toBeCloseTo(20000, 6);
    expect(view.cursor).toEqual(cursor);
  });

  test('turn the same amount whatever the frame rate', () => {
    const whole = createDefaultView();
    whole.yaw = 0;
    moveByKeys(whole, new Set(['E']), 1);

    const stepped = createDefaultView();
    stepped.yaw = 0;
    for (let frame = 0; frame < 100; frame += 1) {
      moveByKeys(stepped, new Set(['E']), 0.01);
    }

    expect(Math.abs(stepped.yaw - whole.yaw)).toBeLessThan(0.001);
  });

  test('stop at the release, and hold no key the form-field guard dropped', () => {
    const keys = new Set<string>();
    const view = createDefaultView();
    view.yaw = 0;

    applyKeyDown(keys, 'KeyE', { tagName: 'CANVAS' });
    expect(keys.has('E')).toBe(true);
    moveByKeys(view, keys, 1);
    const turned = view.yaw;
    applyKeyUp(keys, 'KeyE');
    moveByKeys(view, keys, 1);

    expect(view.yaw).toBeCloseTo(turned, 6);

    applyKeyDown(keys, 'KeyQ', { tagName: 'INPUT' });
    moveByKeys(view, keys, 1);

    expect(keys.size).toBe(0);
    expect(view.yaw).toBeCloseTo(turned, 6);
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

  test('builds the inverse again for a viewport that changed during the drag', () => {
    const narrow = { width: 1200, height: 1080 };
    const pixel = { x: 700, y: 600 };
    const start = beginDrag(createDefaultView(), { x: 800, y: 600 }, viewport);
    expect(start).not.toBeNull();
    const kept = start as NonNullable<typeof start>;
    const fresh = {
      ...kept,
      inverse: inverseViewProjection(kept.view, narrow),
      inverseWidth: narrow.width,
      inverseHeight: narrow.height,
    };
    const resized = createDefaultView();
    const expected = createDefaultView();
    dragCursor(resized, kept, pixel, narrow);
    dragCursor(expected, fresh, pixel, narrow);

    expect(resized.cursor).toEqual(expected.cursor);
    expect(kept.inverseWidth).toBe(narrow.width);
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

describe('the pinch', () => {
  test('reads the distance from the gap the gesture started with', () => {
    expect(pinchDistance(20000, 200, 400)).toBeCloseTo(10000, 6);
    expect(pinchDistance(20000, 200, 100)).toBeCloseTo(40000, 6);
  });

  test('holds the zoom limits', () => {
    expect(pinchDistance(20, 200, 800)).toBe(MIN_DISTANCE);
    expect(pinchDistance(60000, 200, 1)).toBe(MAX_DISTANCE);
  });

  test('gives the point half way between two pointers', () => {
    expect(pinchMiddle({ x: 100, y: 200 }, { x: 300, y: 400 })).toEqual({
      x: 200,
      y: 300,
    });
  });
});

describe('the touch gesture', () => {
  /** Drives the rule with one reading and keeps the distance the view holds. */
  const step = (
    state: TouchState,
    phase: TouchPhase,
    pointerId: number,
    x: number,
    y: number,
    timeMs = 0,
    distance = state.distance,
  ): TouchResult =>
    touchGesture(
      { ...state, distance },
      { phase, pointerId, pointerType: 'touch', x, y, timeMs },
    );

  test('asks for a plane drag while one finger moves', () => {
    const down = step(NO_TOUCH, 'down', 1, 400, 300, 0, 20000);
    expect(down.action.beginPlane).toEqual({ x: 400, y: 300 });
    expect(down.action.input).toBe(true);

    const moved = step(down.state, 'move', 1, 600, 300, 20);
    expect(moved.action.dragTo).toEqual({ x: 600, y: 300 });
    expect(moved.action.orbit).toBeUndefined();
    expect(moved.action.distance).toBeUndefined();
  });

  test('asks for an orbit and a distance while two fingers move', () => {
    let state = step(NO_TOUCH, 'down', 1, 400, 300, 0, 20000).state;
    state = step(state, 'down', 2, 600, 300, 10, 20000).state;

    const moved = step(state, 'move', 2, 700, 300, 20, 20000);
    expect(moved.action.dragTo).toBeUndefined();
    // The middle went from 500 to 550, which is 50 CSS pixels of yaw.
    expect(moved.action.orbit).toEqual({ deltaX: 50, deltaY: 0 });
    // The gap went from 200 to 300, so the distance takes two thirds.
    expect(moved.action.distance).toBeCloseTo(20000 * (200 / 300), 6);
  });

  test('zooms in as the fingers move apart', () => {
    let state = step(NO_TOUCH, 'down', 1, 400, 300, 0, 20000).state;
    state = step(state, 'down', 2, 600, 300, 10, 20000).state;
    const out = step(state, 'move', 2, 800, 300, 20, 20000);
    expect(out.action.distance).toBeCloseTo(10000, 6);

    const back = step(out.state, 'move', 2, 500, 300, 30, 20000);
    expect(back.action.distance).toBeCloseTo(40000, 6);
  });

  test('takes no view change from a second finger going down', () => {
    let state = step(NO_TOUCH, 'down', 1, 400, 300, 0, 20000).state;
    const moved = step(state, 'move', 1, 450, 300, 10, 20000);
    state = moved.state;

    const second = step(state, 'down', 2, 650, 300, 20, 20000);
    expect(second.action.dragTo).toBeUndefined();
    expect(second.action.orbit).toBeUndefined();
    expect(second.action.distance).toBeUndefined();
    expect(second.state.startGap).toBeCloseTo(200, 6);
    expect(second.state.middle).toEqual({ x: 550, y: 300 });
  });

  test('takes no view change from one of two fingers coming up', () => {
    let state = step(NO_TOUCH, 'down', 1, 400, 300, 0, 20000).state;
    state = step(state, 'down', 2, 600, 300, 10, 20000).state;
    const moved = step(state, 'move', 2, 800, 300, 20, 20000);
    state = moved.state;

    const up = step(state, 'up', 2, 800, 300, 30, 10000);
    expect(up.action.dragTo).toBeUndefined();
    expect(up.action.orbit).toBeUndefined();
    expect(up.action.distance).toBeUndefined();
    expect(up.action.select).toBeUndefined();
    // One finger is left, and it asks for its plane point again.
    expect(up.action.beginPlane).toEqual({ x: 400, y: 300 });
  });

  test('reads the two earliest of three fingers', () => {
    let state = step(NO_TOUCH, 'down', 1, 400, 300, 0, 20000).state;
    state = step(state, 'down', 2, 600, 300, 10, 20000).state;

    const third = step(state, 'down', 3, 900, 300, 20, 20000);
    expect(third.action.distance).toBeUndefined();
    state = third.state;

    // The first two double their gap from 200 to 400, so the distance halves.
    const moved = step(state, 'move', 2, 800, 300, 30, 20000);
    expect(moved.action.distance).toBeCloseTo(10000, 6);
  });

  test('ignores a move of a finger the gesture does not read', () => {
    let state = step(NO_TOUCH, 'down', 1, 400, 300, 0, 20000).state;
    state = step(state, 'down', 2, 600, 300, 10, 20000).state;
    state = step(state, 'down', 3, 900, 300, 20, 20000).state;

    const moved = step(state, 'move', 3, 1200, 300, 30, 20000);
    expect(moved.action).toEqual({});
  });

  test('selects on a tap and not on a drag', () => {
    const tap = step(NO_TOUCH, 'down', 1, 400, 300, 0, 20000);
    const lifted = step(tap.state, 'up', 1, 406, 303, 100, 20000);
    expect(lifted.action.select).toEqual({ x: 406, y: 303 });

    let state = step(NO_TOUCH, 'down', 1, 400, 300, 0, 20000).state;
    state = step(state, 'move', 1, 440, 300, 40, 20000).state;
    const dragged = step(state, 'up', 1, 400, 300, 80, 20000);
    expect(dragged.action.select).toBeUndefined();
  });

  test('does not select a cancelled touch', () => {
    // The browser or the operating system takes the pointer away inside both tap
    // limits. A tap is a pointer that goes down and comes up, so this one selects
    // nothing, and the gesture ends as a come-up ends it.
    const pressed = step(NO_TOUCH, 'down', 1, 400, 300, 0, 20000);
    const cancelled = step(pressed.state, 'cancel', 1, 406, 303, 100, 20000);
    expect(cancelled.action.select).toBeUndefined();
    expect(cancelled.state.pointers).toEqual([]);
    expect(cancelled.state.press).toBeNull();
  });

  test('a cancelled second finger leaves the first one dragging', () => {
    let state = step(NO_TOUCH, 'down', 1, 400, 300, 0, 20000).state;
    state = step(state, 'down', 2, 600, 300, 10, 20000).state;

    const cancelled = step(state, 'cancel', 2, 600, 300, 40, 20000);
    expect(cancelled.action.select).toBeUndefined();
    // The finger that is still down asks for its plane point again and drags on.
    expect(cancelled.action.beginPlane).toEqual({ x: 400, y: 300 });
    const moved = step(cancelled.state, 'move', 1, 500, 300, 60, 20000);
    expect(moved.action.dragTo).toEqual({ x: 500, y: 300 });
  });

  test('does not select a tap that becomes a second finger', () => {
    let state = step(NO_TOUCH, 'down', 1, 400, 300, 0, 20000).state;
    state = step(state, 'down', 2, 600, 300, 10, 20000).state;
    const lifted = step(state, 'up', 1, 400, 300, 40, 20000);
    expect(lifted.action.select).toBeUndefined();
  });

  test('holds the tap limits at 10 CSS pixels and 400 milliseconds', () => {
    const onLimit = step(NO_TOUCH, 'down', 1, 0, 0, 0, 20000);
    expect(step(onLimit.state, 'up', 1, 10, 0, 400, 20000).action.select).toEqual({
      x: 10,
      y: 0,
    });
    expect(
      step(onLimit.state, 'up', 1, 11, 0, 100, 20000).action.select,
    ).toBeUndefined();
    expect(
      step(onLimit.state, 'up', 1, 0, 0, 401, 20000).action.select,
    ).toBeUndefined();
  });

  test('ends the wheel glide where a pinch starts', () => {
    const first = step(NO_TOUCH, 'down', 1, 400, 300, 0, 20000);
    expect(first.action.endGlide).toBeUndefined();
    const second = step(first.state, 'down', 2, 600, 300, 10, 20000);
    expect(second.action.endGlide).toBe(true);
  });

  test('reads no pointer that is not a touch pointer', () => {
    const result = touchGesture(NO_TOUCH, {
      phase: 'down',
      pointerId: 1,
      pointerType: 'mouse',
      x: 400,
      y: 300,
      timeMs: 0,
    });
    expect(result.action).toEqual({});
    expect(result.state).toBe(NO_TOUCH);
  });
});

describe('the interaction switches', () => {
  test('are all on by default', () => {
    expect(ALL_INTERACTION).toEqual({
      zoom: true,
      orbit: true,
      pan: true,
      keys: true,
      select: true,
    });
  });

  test('read a partial setting over the one they hold', () => {
    const held = readInteraction(ALL_INTERACTION, { zoom: false, select: false });
    expect(held).toEqual({
      zoom: false,
      orbit: true,
      pan: true,
      keys: true,
      select: false,
    });
    // A second setting names one switch and leaves the other four where they were.
    expect(readInteraction(held, { orbit: false })).toEqual({
      zoom: false,
      orbit: false,
      pan: true,
      keys: true,
      select: false,
    });
  });

  test('keep what they hold for a setting they cannot read', () => {
    const held = readInteraction(ALL_INTERACTION, { zoom: false });
    expect(readInteraction(held, null)).toEqual(held);
    expect(readInteraction(held, 'off')).toEqual(held);
    // A field that is not a boolean is a field the setting does not name.
    expect(readInteraction(held, { orbit: 'no', keys: 0 })).toEqual(held);
  });
});

describe('dispose', () => {
  test('releases the pointer capture the canvas holds', () => {
    const handlers = new Map<string, (event: unknown) => void>();
    const released: number[] = [];
    const canvas = {
      clientWidth: 800,
      clientHeight: 600,
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
      addEventListener: (name: string, handler: (event: unknown) => void) => {
        handlers.set(name, handler);
      },
      removeEventListener: () => undefined,
      setPointerCapture: () => undefined,
      hasPointerCapture: () => true,
      releasePointerCapture: (id: number) => {
        released.push(id);
      },
    } as unknown as HTMLCanvasElement;
    const scope = globalThis as unknown as { window?: unknown };
    const hadWindow = 'window' in scope;
    scope.window = {
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };

    const controls = attachControls(canvas, createDefaultView());
    // The right button starts a pan drag, which takes the capture of its own pointer.
    handlers.get('pointerdown')?.({
      pointerType: 'mouse',
      button: 2,
      pointerId: 7,
      clientX: 10,
      clientY: 10,
      preventDefault: () => undefined,
    });
    controls.dispose();
    if (!hadWindow) delete scope.window;

    expect(released).toEqual([7]);
  });
});
