import { describe, expect, test } from 'vitest';
import { cameraDirection, project } from '../camera/projection';
import type { Viewport } from '../camera/projection';
import type { View } from '../camera/view';
import { MAX_MARKER_CSS, markerCssSize, MIN_MARKER_CSS } from './marker-size';
import { focalCssPixels, pickRadiusCss, pickSystem } from './picking';
import { createSystemSet } from './real-systems';
import type { RealSystemSet } from './real-systems';

const VIEWPORT: Viewport = { width: 1920, height: 1080 };

function viewAt(distance: number): View {
  return { cursor: [0, 0, 0], distance, yaw: 0, pitch: 35 };
}

/** A point on the line through the camera and the cursor, at a range from the camera. */
function atRange(view: View, range: number, behind = false): [number, number, number] {
  const direction = cameraDirection(view);
  const t = behind ? view.distance + range : view.distance - range;
  return [direction[0] * t, direction[1] * t, direction[2] * t];
}

/** A set with one category and the systems a test names. */
function setWith(points: [string, [number, number, number]][]): RealSystemSet {
  const set = createSystemSet();
  set.addCategories([{ name: 'A', color: [10, 20, 30] }]);
  set.addSystems(
    points.map(([name, position]) => ({
      name,
      coords: { x: position[0], y: position[1], z: position[2] },
      primaryCategory: 'A',
    })),
  );
  return set;
}

describe('the pick radius', () => {
  test('runs from 7.5 to 10 CSS pixels', () => {
    const focalCss = focalCssPixels(VIEWPORT);

    expect(pickRadiusCss(focalCss, 120000)).toBe(MIN_MARKER_CSS / 2 + 4);
    expect(pickRadiusCss(focalCss, 500)).toBe(MAX_MARKER_CSS / 2 + 4);
  });
});

describe('the pick sweep', () => {
  test('names the system under the pixel', () => {
    const view = viewAt(1000);
    const point = atRange(view, 400);
    const set = setWith([['Sol', point]]);
    const screen = project(view, point, VIEWPORT);

    expect(pickSystem(set, view, VIEWPORT, screen)).toBe(0);
  });

  test('holds its radius at the floor of the marker size', () => {
    const view = viewAt(20000);
    const point = atRange(view, 20000);
    const set = setWith([['Sol', point]]);
    const screen = project(view, point, VIEWPORT);
    expect(markerCssSize(focalCssPixels(VIEWPORT), 20000)).toBe(MIN_MARKER_CSS);

    expect(pickSystem(set, view, VIEWPORT, { x: screen.x + 7, y: screen.y })).toBe(0);
    expect(pickSystem(set, view, VIEWPORT, { x: screen.x + 8, y: screen.y })).toBe(-1);
  });

  test('holds its radius at the cap of the marker size', () => {
    const view = viewAt(500);
    const point = atRange(view, 500);
    const set = setWith([['Sol', point]]);
    const screen = project(view, point, VIEWPORT);
    expect(markerCssSize(focalCssPixels(VIEWPORT), 500)).toBe(MAX_MARKER_CSS);

    expect(pickSystem(set, view, VIEWPORT, { x: screen.x + 10, y: screen.y })).toBe(0);
    expect(pickSystem(set, view, VIEWPORT, { x: screen.x + 11, y: screen.y })).toBe(-1);
  });

  test('takes the nearer of two overlapping markers', () => {
    const view = viewAt(1000);
    const far = atRange(view, 900);
    const near = atRange(view, 400);
    const set = setWith([
      ['far', far],
      ['near', near],
    ]);
    const screen = project(view, near, VIEWPORT);
    // The two project to the same pixel, because both lie on the camera's own axis.
    const farScreen = project(view, far, VIEWPORT);
    expect(Math.hypot(farScreen.x - screen.x, farScreen.y - screen.y)).toBeLessThan(1);

    expect(set.system(pickSystem(set, view, VIEWPORT, screen))?.name).toBe('near');
  });

  test('never picks a system behind the camera', () => {
    const view = viewAt(1000);
    const set = setWith([['behind', atRange(view, 500, true)]]);
    const corners = [
      { x: 0, y: 0 },
      { x: VIEWPORT.width, y: 0 },
      { x: 0, y: VIEWPORT.height },
      { x: VIEWPORT.width, y: VIEWPORT.height },
      { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 },
    ];

    for (const pixel of corners) {
      expect(pickSystem(set, view, VIEWPORT, pixel)).toBe(-1);
    }
  });

  test('never picks a marker its category took off', () => {
    const view = viewAt(1000);
    const point = atRange(view, 400);
    const set = setWith([['Sol', point]]);
    const screen = project(view, point, VIEWPORT);

    set.setCategoryVisible('A', false);

    expect(pickSystem(set, view, VIEWPORT, screen)).toBe(-1);
  });

  test('never picks a marker the filter dropped', () => {
    const view = viewAt(1000);
    const point = atRange(view, 400);
    const set = setWith([['Sol', point]]);
    const screen = project(view, point, VIEWPORT);

    set.setNameFilter('zzz');

    expect(pickSystem(set, view, VIEWPORT, screen)).toBe(-1);
  });

  test('never picks a marker the camera has left the draw range of', () => {
    const view = viewAt(1000);
    const point = atRange(view, 400);
    const set = createSystemSet();
    set.addCategories([{ name: 'A', color: [10, 20, 30], maxDrawRange: 100 }]);
    set.addSystems([
      {
        name: 'Sol',
        coords: { x: point[0], y: point[1], z: point[2] },
        primaryCategory: 'A',
      },
    ]);
    const screen = project(view, point, VIEWPORT);

    expect(pickSystem(set, view, VIEWPORT, screen)).toBe(-1);
  });

  test('gives -1 for an empty set', () => {
    const set = createSystemSet();

    expect(pickSystem(set, viewAt(1000), VIEWPORT, { x: 0, y: 0 })).toBe(-1);
  });
});
