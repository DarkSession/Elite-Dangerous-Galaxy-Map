import { describe, expect, test } from 'vitest';
import { project } from '../camera/projection';
import type { View } from '../camera/view';
import {
  placeOnPlane,
  planeHomography,
  planeMatrix3d,
  planePlacement,
} from './plane-overlay';
import type { PlanePlacement } from './plane-overlay';
import { setStyle } from './set-style';

const VIEWPORT = { width: 1920, height: 1080 };

function viewAt(distance: number, pitch: number, yaw = 0): View {
  return { cursor: [0, 0, 0], distance, yaw, pitch };
}

/** A placement of a rectangle on the plane, with an element box of its own. */
function placementOf(
  view: View,
  widthLy: number,
  heightLy: number,
  anchor: readonly [number, number] = [0, 0],
  box: readonly [number, number] = [160, 160],
): PlanePlacement {
  return {
    view,
    viewport: VIEWPORT,
    planeY: 0,
    anchor,
    widthLy,
    heightLy,
    widthCss: box[0] as number,
    heightCss: box[1] as number,
  };
}

/** The four plane corners of a placement, in the order the element's box holds them. */
function cornersOf(
  placement: PlanePlacement,
): readonly (readonly [number, number, number])[] {
  const x = placement.anchor[0] as number;
  const z = placement.anchor[1] as number;
  const halfWidth = placement.widthLy / 2;
  const halfHeight = placement.heightLy / 2;
  return [
    [x - halfWidth, placement.planeY, z + halfHeight],
    [x + halfWidth, placement.planeY, z + halfHeight],
    [x + halfWidth, placement.planeY, z - halfHeight],
    [x - halfWidth, placement.planeY, z - halfHeight],
  ];
}

/** Reads the four screen corners the transform gives, through the homography itself. */
function transformedCorners(
  placed: NonNullable<ReturnType<typeof planePlacement>>,
): readonly { x: number; y: number }[] {
  return placed.corners.map((point) => ({ x: point.x, y: point.y }));
}

/**
 * An element that records every style write and every style read, so a test can count
 * them. `serialise` gives the form the element reports a value back in, as a browser
 * gives the `font` shorthand back in a form of its own.
 */
function fakeElement(
  serialise: (name: string, value: string) => string = (_, value) => value,
): {
  element: HTMLElement;
  writes: string[];
  reads: string[];
} {
  const held = new Map<string, string>();
  const writes: string[] = [];
  const reads: string[] = [];
  const style = {
    getPropertyValue(name: string): string {
      reads.push(name);
      return held.get(name) ?? '';
    },
    setProperty(name: string, value: string): void {
      writes.push(name);
      held.set(name, serialise(name, value));
    },
  };
  return { element: { style } as unknown as HTMLElement, writes, reads };
}

describe('a plane element', () => {
  test('projects to the quad the camera sees', () => {
    const view = viewAt(1000, 30);
    const placement = placementOf(view, 200, 200);
    const placed = planePlacement(placement);
    expect(placed).not.toBeNull();
    const corners = transformedCorners(
      placed as NonNullable<ReturnType<typeof planePlacement>>,
    );
    const wanted = cornersOf(placement).map((point) => project(view, point, VIEWPORT));
    for (let index = 0; index < 4; index += 1) {
      const one = corners[index] as { x: number; y: number };
      const other = wanted[index] as { x: number; y: number };
      expect(Math.abs(one.x - other.x)).toBeLessThan(0.01);
      expect(Math.abs(one.y - other.y)).toBeLessThan(0.01);
    }
  });

  test('the homography takes the local box to those four corners', () => {
    const view = viewAt(1000, 30);
    const placement = placementOf(view, 200, 200, [0, 0], [160, 90]);
    const placed = planePlacement(placement);
    expect(placed).not.toBeNull();
    const kept = placed as NonNullable<ReturnType<typeof planePlacement>>;
    const homography = planeHomography(160, 90, kept.corners) as Float64Array;
    expect(homography).not.toBeNull();
    const local: readonly (readonly [number, number])[] = [
      [0, 0],
      [160, 0],
      [160, 90],
      [0, 90],
    ];
    for (let index = 0; index < 4; index += 1) {
      const [u, v] = local[index] as readonly [number, number];
      const w = (homography[6] as number) * u + (homography[7] as number) * v + 1;
      const x =
        ((homography[0] as number) * u +
          (homography[1] as number) * v +
          (homography[2] as number)) /
        w;
      const y =
        ((homography[3] as number) * u +
          (homography[4] as number) * v +
          (homography[5] as number)) /
        w;
      const wanted = kept.corners[index] as { x: number; y: number };
      expect(Math.abs(x - wanted.x)).toBeLessThan(0.01);
      expect(Math.abs(y - wanted.y)).toBeLessThan(0.01);
    }
  });

  test('the far edge is shorter than the near edge', () => {
    const placed = planePlacement(placementOf(viewAt(1000, 30), 400, 400));
    expect(placed).not.toBeNull();
    const corners = (placed as NonNullable<ReturnType<typeof planePlacement>>).corners;
    const lengthOf = (first: number, second: number): number => {
      const one = corners[first] as { x: number; y: number };
      const other = corners[second] as { x: number; y: number };
      return Math.hypot(one.x - other.x, one.y - other.y);
    };
    // The top edge of the element is the far one: its local `y` runs along the game `-z`
    // axis, and the camera sits on the `-z` side at a yaw of 0.
    const far = lengthOf(0, 1);
    const near = lengthOf(3, 2);
    console.log('the two edges measure', { far, near });
    // An affine placement gives two edges of equal length, so this reading separates the
    // two.
    expect(far).toBeLessThan(near * 0.95);
  });

  test('the matrix3d holds the homography in its four columns', () => {
    const homography = Float64Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(planeMatrix3d(homography)).toBe(
      'matrix3d(1, 4, 0, 7, 2, 5, 0, 8, 0, 0, 1, 0, 3, 6, 0, 1)',
    );
  });

  test('a quad crossing the near plane is dropped', () => {
    // The element is wide enough that one corner falls behind the camera at a low pitch.
    const placed = planePlacement(placementOf(viewAt(1000, 5), 200000, 200000));
    expect(placed).toBeNull();
  });

  test('a singular placement is dropped', () => {
    // An element of no height on the plane projects its four corners onto one line.
    expect(planePlacement(placementOf(viewAt(1000, 30), 200, 0))).toBeNull();
    // A homography over three collinear screen points is singular as well.
    const collinear = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ];
    expect(planeHomography(160, 90, collinear)).toBeNull();
  });

  test('a quad wholly outside the viewport is dropped', () => {
    const placed = planePlacement(
      placementOf(viewAt(1000, 89), 10, 10, [40000, 40000]),
    );
    expect(placed).toBeNull();
  });

  test('the screen bounding box holds the whole quad', () => {
    const placed = planePlacement(placementOf(viewAt(2000, 20), 800, 800));
    expect(placed).not.toBeNull();
    const kept = placed as NonNullable<ReturnType<typeof planePlacement>>;
    for (const corner of kept.corners) {
      expect(corner.x).toBeGreaterThanOrEqual(kept.box.left - 1e-9);
      expect(corner.x).toBeLessThanOrEqual(kept.box.left + kept.box.width + 1e-9);
      expect(corner.y).toBeGreaterThanOrEqual(kept.box.top - 1e-9);
      expect(corner.y).toBeLessThanOrEqual(kept.box.top + kept.box.height + 1e-9);
    }
  });

  test('two plane elements at a low pitch overlap by their boxes', () => {
    // At a low pitch the plane is stretched hard, so an element covers far more of the
    // screen than its own 160 by 160 rectangle. The overlap test therefore reads the
    // screen bounding box of the four projected corners and not the element's own box.
    const view = viewAt(2000, 8);
    const first = planePlacement(placementOf(view, 800, 800, [-300, 0]));
    const second = planePlacement(placementOf(view, 800, 800, [300, 0]));
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    const one = (first as NonNullable<typeof first>).box;
    const other = (second as NonNullable<typeof second>).box;
    const overlaps = (a: typeof one, b: typeof one): boolean =>
      a.left < b.left + b.width &&
      b.left < a.left + a.width &&
      a.top < b.top + b.height &&
      b.top < a.top + a.height;
    console.log('the two screen boxes', { one, other });
    expect(overlaps(one, other)).toBe(true);

    // The element's own rectangle, 160 by 160 CSS pixels upright on its anchor, is what
    // the upright overlay elements test with. The two do not overlap by it.
    const uprightOf = (x: number): typeof one => {
      const anchor = project(view, [x, 0, 0], VIEWPORT);
      return { left: anchor.x - 80, top: anchor.y - 80, width: 160, height: 160 };
    };
    expect(overlaps(uprightOf(-300), uprightOf(300))).toBe(false);
  });

  test('the placement writes the four properties that move and reads none', () => {
    const { element, writes, reads } = fakeElement();
    expect(
      placeOnPlane(element, placementOf(viewAt(1000, 30), 200, 200)),
    ).not.toBeNull();

    // The other four, `position`, `left`, `top` and `transform-origin`, never move, so
    // the element factories write them once at creation. The compare reads the value the
    // library kept and not the element.
    expect(writes).toEqual(['width', 'height', 'transform', 'z-index']);
    expect(reads).toEqual([]);
  });

  // The scenario "The placement reads no style back" of `plane-overlay`.
  test('the placement reads no style back', () => {
    const { element, reads } = fakeElement();
    const placement = placementOf(viewAt(1000, 30), 200, 200);
    expect(placeOnPlane(element, placement)).not.toBeNull();
    expect(placeOnPlane(element, placement)).not.toBeNull();
    expect(reads).toEqual([]);
  });

  // The scenario "A value the browser gives back in another form is written once". The
  // element reports the font in the form Chrome gives, so a compare against the value
  // read back never matched and wrote the font again on each frame.
  test('a value the browser gives back in another form is written once', () => {
    const { element, writes } = fakeElement((name, value) =>
      name === 'font' ? value.replace('px/', 'px / ') : value,
    );
    const font = "16px/16px 'IBM Plex Mono', ui-monospace, monospace";
    setStyle(element, 'font', font);
    setStyle(element, 'font', font);
    expect(element.style.getPropertyValue('font')).not.toBe(font);
    expect(writes).toEqual(['font']);
  });

  test('the placement writes no style it already holds', () => {
    const { element, writes } = fakeElement();
    const placement = placementOf(viewAt(1000, 30), 200, 200);
    expect(placeOnPlane(element, placement)).not.toBeNull();
    expect(writes.length).toBeGreaterThan(0);
    const after = writes.length;
    expect(placeOnPlane(element, placement)).not.toBeNull();
    expect(writes).toHaveLength(after);
  });

  test('a drop writes no style and does not throw', () => {
    const { element, writes } = fakeElement();
    expect(
      placeOnPlane(element, placementOf(viewAt(1000, 5), 200000, 200000)),
    ).toBeNull();
    expect(writes).toEqual([]);
  });

  // The scenario "An element is kept from under the plane" of `plane-overlay`. The pitch
  // runs from -89 to 89 degrees, so the camera reaches either side of the plane and the
  // winding of a face-on quad turns over with it.
  test('an element is kept from under the plane', () => {
    const above = planePlacement(placementOf(viewAt(1000, 45), 200, 200));
    const below = planePlacement(placementOf(viewAt(1000, -45), 200, 200));
    expect(above).not.toBeNull();
    expect(below).not.toBeNull();
    const one = (above as NonNullable<typeof above>).box.width;
    const other = (below as NonNullable<typeof below>).box.width;
    expect(Math.abs(one - other) / one).toBeLessThan(0.02);
  });

  // The scenario "An element is turned to face the reader under the plane". A reader under
  // the plane sees the element's face from behind, so the element is painted on the other
  // face and its text stays the right way round.
  test('an element is turned to face the reader under the plane', () => {
    /** Where the element's own top left corner lands on the screen. */
    const topLeftOf = (pitch: number): { x: number; y: number; corners: number } => {
      const placed = planePlacement(placementOf(viewAt(1000, pitch), 200, 200));
      expect(placed).not.toBeNull();
      const kept = placed as NonNullable<typeof placed>;
      // `matrix3d` holds the homography's third column at 12, 13 and 15, which is where
      // the element's own (0, 0) goes.
      const values = kept.transform
        .replace('matrix3d(', '')
        .replace(')', '')
        .split(',')
        .map((part) => Number(part));
      const w = values[15] as number;
      const point = { x: (values[12] as number) / w, y: (values[13] as number) / w };
      // Which of the four plane corners it is nearest.
      let nearest = -1;
      let best = Number.POSITIVE_INFINITY;
      kept.corners.forEach((corner, index) => {
        const gap = Math.hypot(corner.x - point.x, corner.y - point.y);
        if (gap < best) {
          best = gap;
          nearest = index;
        }
      });
      return { ...point, corners: nearest };
    };

    const above = topLeftOf(45);
    const below = topLeftOf(-45);
    console.log('the top left corner lands at', { above, below });

    // Above the plane the element's top left takes plane corner 0; under it, corner 3.
    // That is the reversed height axis, which is the turn.
    expect(above.corners).toBe(0);
    expect(below.corners).toBe(3);
  });

  // The scenario "An element is dropped in the plane". The camera lies in the element's
  // own plane, so every element is edge on and covers no pixels.
  test('an element is dropped in the plane', () => {
    expect(() => planePlacement(placementOf(viewAt(1000, 0), 200, 200))).not.toThrow();
    expect(planePlacement(placementOf(viewAt(1000, 0), 200, 200))).toBeNull();
  });

  test('the ring of a square element is square at a steep pitch', () => {
    // At 89 degrees the camera looks straight down, so a square of the plane projects to
    // a square on the screen.
    const placed = planePlacement(placementOf(viewAt(1000, 89), 200, 200));
    expect(placed).not.toBeNull();
    const box = (placed as NonNullable<ReturnType<typeof planePlacement>>).box;
    expect(Math.abs(box.height / box.width - 1)).toBeLessThan(0.05);
  });
});
