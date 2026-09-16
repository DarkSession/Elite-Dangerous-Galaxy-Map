import { describe, expect, test } from 'vitest';
import { cameraPosition, viewProjectionMatrix } from '../camera/projection';
import type { View } from '../camera/view';
import { GRID_MAX_ALPHA, gridLevelAlpha, gridVisibility } from '../render/grid-pass';
import { MODEL_BOUNDS } from '../scene-data/real-systems';
import {
  createGridLabelOverlay,
  crossingLabelText,
  GRID_CANDIDATE_COUNT,
  GRID_LABEL_MIN_ALPHA,
  GRID_LABEL_SPAN,
  gridLabelAlpha,
  gridLabelBackground,
  gridLabelColour,
  gridLabelLineFactor,
  gridLabelOpacity,
  gridLabelPlacements,
  GRID_LABEL_OPACITY,
  GRID_LABEL_SHADOW,
  labelBoxAt,
  MAX_GRID_LABELS,
  planeLabelBox,
  planeLabelText,
  PLANE_LABEL_BOTTOM_CSS,
} from './grid-labels';
import type { GridLabelReading } from './grid-labels';
import { GRID_LABEL_MERGE_FLOOR } from '../render/grid-pass';
import { boxesOverlap } from './labels';

const VIEWPORT = { width: 1920, height: 1080 };

/** The model bounds, which every frame below carries. */
const BOUNDS = MODEL_BOUNDS;

/**
 * The two gaps a crossing makes on the screen, in CSS pixels: to the point one spacing
 * along the game `x` axis and to the point one along `z`. The sweep reads the same two
 * numbers; the test works them out again so it can read what the gate read.
 */
function screenGaps(
  view: View,
  spacingLy: number,
  gameX: number,
  gameZ: number,
): { alongX: number; alongZ: number } {
  const matrix = viewProjectionMatrix(view, VIEWPORT);
  const camera = cameraPosition(view);
  const planeY = view.cursor[1] - camera[1];
  const at = (x: number, z: number): [number, number] => {
    const offsetX = x - camera[0];
    const offsetZ = camera[2] - z;
    const w =
      (matrix[3] as number) * offsetX +
      (matrix[7] as number) * planeY +
      (matrix[11] as number) * offsetZ +
      (matrix[15] as number);
    const clipX =
      (matrix[0] as number) * offsetX +
      (matrix[4] as number) * planeY +
      (matrix[8] as number) * offsetZ +
      (matrix[12] as number);
    const clipY =
      (matrix[1] as number) * offsetX +
      (matrix[5] as number) * planeY +
      (matrix[9] as number) * offsetZ +
      (matrix[13] as number);
    return [
      ((clipX / w + 1) * VIEWPORT.width) / 2,
      ((1 - clipY / w) * VIEWPORT.height) / 2,
    ];
  };
  const middle = at(gameX, gameZ);
  const overX = at(gameX + spacingLy, gameZ);
  const overZ = at(gameX, gameZ + spacingLy);
  return {
    alongX: Math.hypot(overX[0] - middle[0], overX[1] - middle[1]),
    alongZ: Math.hypot(overZ[0] - middle[0], overZ[1] - middle[1]),
  };
}

function viewAt(
  cursor: readonly [number, number, number],
  distance: number,
  pitch = 89,
): View {
  return { cursor: [cursor[0], cursor[1], cursor[2]], distance, yaw: 0, pitch };
}

describe('the candidate set', () => {
  test('holds the 289 crossings within 8 spacings of the cursor', () => {
    expect(GRID_LABEL_SPAN).toBe(8);
    expect(GRID_CANDIDATE_COUNT).toBe(289);
  });

  test('places nothing without a label level', () => {
    const frame = {
      view: viewAt([0, 0, 0], 1000),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: null,
      spacingLy: 0,
    };
    expect(gridLabelPlacements(frame)).toEqual([]);
  });
});

describe('the crossing labels', () => {
  test('read the two coordinates of the crossing in whole light years', () => {
    expect(crossingLabelText(1000, 2000)).toBe('1000, 2000');
    expect(crossingLabelText(-1000.4, 0)).toBe('-1000, 0');
  });

  test('sit on whole multiples of the label level at a cursor off the grid', () => {
    const frame = {
      view: viewAt([1200, 0, 2400], 1000),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: null,
      spacingLy: 1000,
    };

    const placed = gridLabelPlacements(frame);

    expect(placed.length).toBeGreaterThan(0);
    for (const placement of placed) {
      const parts = placement.text.split(', ');
      expect(parts).toHaveLength(2);
      for (const part of parts) {
        expect(Number(part) % 1000).toBe(0);
      }
    }
  });

  test('centre a label on the crossing it names', () => {
    const frame = {
      view: viewAt([0, 0, 0], 1000),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: null,
      spacingLy: 1000,
    };

    for (const placement of gridLabelPlacements(frame)) {
      expect(placement.box.left + placement.box.width / 2).toBeCloseTo(placement.x, 6);
      expect(placement.box.top + placement.box.height / 2).toBeCloseTo(placement.y, 6);
    }
  });

  test('keep at most 32 labels at the pitch that shows the most crossings', () => {
    const frame = {
      view: viewAt([0, 0, 0], 1000, 5),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: null,
      spacingLy: 1000,
    };

    const placed = gridLabelPlacements(frame);

    expect(placed.length).toBeGreaterThan(0);
    expect(placed.length).toBeLessThanOrEqual(MAX_GRID_LABELS);
  });

  test('drop a candidate outside the viewport', () => {
    const frame = {
      view: viewAt([0, 0, 0], 1000),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: null,
      spacingLy: 1000,
    };

    for (const placement of gridLabelPlacements(frame)) {
      expect(placement.x).toBeGreaterThanOrEqual(0);
      expect(placement.y).toBeGreaterThanOrEqual(0);
      expect(placement.x).toBeLessThanOrEqual(VIEWPORT.width);
      expect(placement.y).toBeLessThanOrEqual(VIEWPORT.height);
    }
  });

  test('skip a label whose box overlaps one already placed', () => {
    // A grazing pitch brings the far crossings of the label level together toward the
    // horizon, so the boxes of the candidates meet. The zoom sits inside the camera
    // distance band, because a frame the grid does not draw in carries no label at all.
    const frame = {
      view: viewAt([0, 0, 0], 3000, 5),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: null,
      spacingLy: 10000,
    };

    const placed = gridLabelPlacements(frame);

    expect(placed.length).toBeGreaterThan(0);
    for (let first = 0; first < placed.length; first += 1) {
      for (let second = first + 1; second < placed.length; second += 1) {
        const one = placed[first] as (typeof placed)[number];
        const other = placed[second] as (typeof placed)[number];
        expect(boxesOverlap(one.box, other.box)).toBe(false);
      }
    }
  });

  test('the overlap test refuses two boxes on one point', () => {
    const first = labelBoxAt('1000, 2000', 400, 300);
    const second = labelBoxAt('1000, 3000', 402, 301);
    expect(boxesOverlap(first, second)).toBe(true);
  });
});

describe('the plane label', () => {
  test('reads the height of the plane in whole light years', () => {
    expect(planeLabelText(0)).toBe('y = 0');
    expect(planeLabelText(-600)).toBe('y = -600');
  });

  test('sits centred 22 CSS pixels above the lower edge of the canvas', () => {
    const text = planeLabelText(-600);
    const box = planeLabelBox(text, VIEWPORT);

    expect(box.left + box.width / 2).toBeCloseTo(VIEWPORT.width / 2, 6);
    expect(VIEWPORT.height - (box.top + box.height)).toBe(PLANE_LABEL_BOTTOM_CSS);
  });
});

describe('the model bounds', () => {
  // The scenario "No label stands past the last line".
  test('place no label past the bound on the game x or z axis', () => {
    // The cursor sits on the upper `x` bound, where the crossing one spacing further out
    // still projects inside the frame.
    const frame = {
      view: viewAt([BOUNDS.x[1], 0, 0], 1000),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: null,
      spacingLy: 1000,
    };

    const placed = gridLabelPlacements(frame);
    const names = placed.map((place) => place.text);

    expect(placed.length).toBeGreaterThan(0);
    expect(names).toContain('50000, 0');
    for (const place of placed) {
      const [x, z] = place.text.split(', ').map((part) => Number(part));
      expect(x as number).toBeLessThanOrEqual(BOUNDS.x[1]);
      expect(x as number).toBeGreaterThanOrEqual(BOUNDS.x[0]);
      expect(z as number).toBeLessThanOrEqual(BOUNDS.z[1]);
      expect(z as number).toBeGreaterThanOrEqual(BOUNDS.z[0]);
    }
  });

  test('place no label past the upper z bound', () => {
    // The last crossing of the 1,000 light year level inside the upper `z` bound of
    // 75,895 is 75,000. The cursor sits on it, so the crossing at 76,000 is one spacing
    // away and projects inside the frame.
    const frame = {
      view: viewAt([0, 0, 75000], 1000),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: null,
      spacingLy: 1000,
    };

    const placed = gridLabelPlacements(frame);
    const names = placed.map((place) => place.text);

    expect(placed.length).toBeGreaterThan(0);
    expect(names).toContain('0, 75000');
    for (const place of placed) {
      const z = Number(place.text.split(', ')[1]);
      expect(z).toBeLessThanOrEqual(BOUNDS.z[1]);
    }
  });
});

describe('the drawn alpha gate', () => {
  test('reads the floor as a level at 24 CSS pixels with the band open', () => {
    expect(GRID_LABEL_MIN_ALPHA).toBeCloseTo(
      gridLevelAlpha(24) * gridVisibility(3000),
      9,
    );
    expect(gridLevelAlpha(24)).toBeCloseTo(0.09, 9);
    expect(gridVisibility(3000)).toBe(1);
  });

  test('takes the greater of the two axis readings', () => {
    // One CSS pixel covers 10,000 light years of the game `z` axis and 300 of `x`, so
    // the `z` lines are gone and the `x` lines are 33 CSS pixels apart.
    const compressed = gridLabelAlpha(300, 10000, 10000, 1);
    expect(compressed).toBeCloseTo(gridLevelAlpha(10000 / 300), 9);
    expect(compressed).toBeGreaterThanOrEqual(GRID_LABEL_MIN_ALPHA);
    // The same reading with the axes swapped, because the greater of the two decides.
    expect(gridLabelAlpha(10000, 300, 10000, 1)).toBeCloseTo(compressed, 9);
    // Both axes compressed leaves nothing to stand on.
    expect(gridLabelAlpha(10000, 10000, 10000, 1)).toBe(0);
  });

  test('multiplies the camera distance band into the reading', () => {
    const open = gridLabelAlpha(20, 20, 10000, 1);
    expect(gridLabelAlpha(20, 20, 10000, 0.5)).toBeCloseTo(open / 2, 9);
    expect(gridLabelAlpha(20, 20, 10000, 0)).toBe(0);
  });

  test('drops a crossing whose two gaps are both under 24 CSS pixels', () => {
    // A spacing of 21 light years at a zoom of 1,000 measures about 20 CSS pixels on
    // both axes, which reads 0.054 of alpha and stands under the floor. The pitch is
    // 89 degrees, where the secant below and the sweep's own local reading agree.
    const tight = {
      view: viewAt([0, 0, 0], 1000),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: null,
      spacingLy: 21,
    };
    const gaps = screenGaps(tight.view, 21, 0, 0);
    expect(Math.max(gaps.alongX, gaps.alongZ)).toBeLessThan(24);
    expect(gridLabelPlacements(tight)).toEqual([]);

    // A spacing of 33 light years measures about 31 CSS pixels and holds the floor.
    const open = { ...tight, spacingLy: 33 };
    const wider = screenGaps(open.view, 33, 0, 0);
    expect(Math.max(wider.alongX, wider.alongZ)).toBeGreaterThan(24);
    expect(gridLabelPlacements(open).length).toBeGreaterThan(0);
  });

  test('keeps a crossing at a grazing pitch whose one axis still holds', () => {
    // At a pitch of 5 degrees the lines close up toward the horizon on one axis first,
    // so a placed label reads its alpha from the other axis alone.
    const frame = {
      view: viewAt([0, 0, 0], 1000, 5),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: null,
      spacingLy: 1000,
    };

    const placed = gridLabelPlacements(frame);

    expect(placed.length).toBeGreaterThan(0);
    for (const place of placed) {
      expect(place.alpha).toBeGreaterThanOrEqual(GRID_LABEL_MIN_ALPHA);
    }
  });

  test('places every label on a reading that holds the floor', () => {
    const frame = {
      view: viewAt([0, 0, 0], 3000, 35),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: null,
      spacingLy: 10000,
    };

    const placed = gridLabelPlacements(frame);
    expect(placed.length).toBeGreaterThan(0);
    for (const place of placed) {
      expect(place.alpha).toBeGreaterThanOrEqual(GRID_LABEL_MIN_ALPHA);
    }
  });

  test('drops the far crossings a grazing pitch closes up', () => {
    // The fault this gate is for: at a pitch of 5 degrees and a zoom of 3,000 light
    // years the crossing at -30,000, 70,000 still makes a gap of over 100 CSS pixels,
    // and it sits on the frame at x = 574, y = 462. The shader reads a fraction of one
    // pixel there and draws nothing, so the label must go.
    //
    // The crossings on the frame's centre column stay. The camera looks along +z, so
    // the lines of constant x run up the middle of the frame and the shader still draws
    // them there.
    const frame = {
      view: viewAt([0, 0, 0], 3000, 5),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: null,
      spacingLy: 10000,
    };

    const placed = gridLabelPlacements(frame);
    const names = placed.map((place) => place.text);
    const offCentre = placed.filter(
      (place) =>
        Number(place.text.split(', ')[1]) >= 40000 && Math.abs(place.x - 960) > 1,
    );
    const gaps = screenGaps(frame.view, 10000, -30000, 70000);

    expect(Math.max(gaps.alongX, gaps.alongZ)).toBeGreaterThan(100);
    expect(names).not.toContain('-30000, 70000');
    expect(names).not.toContain('-10000, 70000');
    expect(names).not.toContain('10000, 40000');
    expect(offCentre).toEqual([]);
  });

  // The scenario "A label goes out with its lines".
  test('places no label at 11,500 light years and places some at 3,000', () => {
    const far = {
      view: viewAt([0, 0, 0], 11500),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: null,
      spacingLy: 10000,
    };
    const near = {
      view: viewAt([0, 0, 0], 3000),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: null,
      spacingLy: 10000,
    };

    // The label level still measures 813 CSS pixels at 11,500 light years, and the band
    // leaves 0.011 of the alpha, so the lines are gone and the labels go with them.
    expect(gridVisibility(11500)).toBeCloseTo(0.011, 3);
    expect(gridLevelAlpha(813) * gridVisibility(11500)).toBeLessThan(
      GRID_LABEL_MIN_ALPHA,
    );
    expect(gridLabelPlacements(far)).toEqual([]);
    expect(gridLabelPlacements(near).length).toBeGreaterThan(0);
  });
});

/** One style write a fake element took. */
interface StyleWrite {
  readonly name: string;
  readonly value: string;
}

/** A fake element, so the overlay can be read with no browser. */
interface FakeElement {
  className: string;
  textContent: string | null;
  parentNode: unknown;
  readonly writes: StyleWrite[];
  readonly style: {
    getPropertyValue(name: string): string;
    setProperty(name: string, value: string): void;
  };
  remove(): void;
}

/** A fake host, with the one document member `createGridLabelOverlay` reads. */
function fakeHost(): { host: HTMLElement; made: FakeElement[] } {
  const made: FakeElement[] = [];
  const makeElement = (): FakeElement => {
    const held = new Map<string, string>();
    const writes: StyleWrite[] = [];
    const element: FakeElement = {
      className: '',
      textContent: null,
      parentNode: null,
      writes,
      style: {
        getPropertyValue(name: string): string {
          return held.get(name) ?? '';
        },
        setProperty(name: string, value: string): void {
          held.set(name, value);
          writes.push({ name, value });
        },
      },
      remove(): void {
        element.parentNode = null;
      },
    };
    made.push(element);
    return element;
  };
  const host = {
    ownerDocument: { createElement: (): FakeElement => makeElement() },
    append(...children: FakeElement[]): void {
      for (const child of children) child.parentNode = host;
    },
  };
  return { host: host as unknown as HTMLElement, made };
}

/** A reading of one flat colour, at the size the frame's viewport holds. */
function flatReading(
  width: number,
  height: number,
  colour: readonly [number, number, number],
): GridLabelReading {
  const pixels = new Uint8Array(width * height * 4);
  for (let at = 0; at < pixels.length; at += 4) {
    pixels[at] = colour[0];
    pixels[at + 1] = colour[1];
    pixels[at + 2] = colour[2];
    pixels[at + 3] = 255;
  }
  return { width, height, pixels };
}

describe('the label background', () => {
  test('falls back to a weight of 1 outside the reading', () => {
    const reading = flatReading(4, 4, [255, 255, 255]);

    for (const point of [
      { x: -1, y: 10 },
      { x: 10, y: -1 },
      { x: VIEWPORT.width, y: 10 },
      { x: 10, y: VIEWPORT.height },
    ]) {
      const background = gridLabelBackground(reading, point.x, point.y, VIEWPORT);
      expect(background.luminance).toBe(0);
      expect(gridLabelOpacity(background.luminance)).toBeCloseTo(GRID_LABEL_OPACITY, 9);
      expect(gridLabelColour(background)).toBe('rgb(255, 196, 140)');
    }

    // A map with no reading yet reads the same way.
    const none = gridLabelBackground(null, 960, 540, VIEWPORT);
    expect(none.luminance).toBe(0);
    expect(gridLabelOpacity(none.luminance)).toBeCloseTo(GRID_LABEL_OPACITY, 9);
  });

  test('reads the texel under the point', () => {
    const reading = flatReading(4, 4, [240, 235, 230]);
    const background = gridLabelBackground(reading, 960, 540, VIEWPORT);

    expect(background.r).toBe(240);
    expect(background.luminance).toBeGreaterThan(0.9);
    // The tint is at its maximum there, so the colour sits 0.35 of the way over.
    expect(gridLabelColour(background)).toBe('rgb(250, 210, 172)');
    expect(gridLabelOpacity(background.luminance)).toBeCloseTo(
      GRID_LABEL_OPACITY * GRID_LABEL_MERGE_FLOOR,
      9,
    );
  });
});

describe('the label line factor', () => {
  test('is 1 at the cursor', () => {
    // The label level's spacing on the screen is at least 400 CSS pixels at the cursor,
    // so the level is fully bold there and the label keeps all of its own opacity.
    expect(gridLabelLineFactor(GRID_MAX_ALPHA)).toBeCloseTo(1, 9);
    // The gate is the floor of the factor as well as of the line.
    expect(gridLabelLineFactor(GRID_LABEL_MIN_ALPHA)).toBeCloseTo(0.2, 9);
  });

  test('takes the opacity down with the alpha of the line', () => {
    // A dark background leaves the whole background weight, so the reading is of the
    // line factor alone.
    expect(gridLabelOpacity(0, GRID_MAX_ALPHA)).toBeCloseTo(GRID_LABEL_OPACITY, 9);
    expect(gridLabelOpacity(0, GRID_LABEL_MIN_ALPHA)).toBeCloseTo(
      GRID_LABEL_OPACITY * 0.2,
      9,
    );
    // No label is placed below the gate, so no label draws below a fifth of its opacity.
    expect(gridLabelOpacity(0, GRID_MAX_ALPHA / 2)).toBeLessThan(
      gridLabelOpacity(0, GRID_MAX_ALPHA),
    );
  });
});

describe('the label overlay', () => {
  test('writes no style twice over two frames with one reading', () => {
    const { host, made } = fakeHost();
    const overlay = createGridLabelOverlay(host);
    const frame = {
      view: viewAt([0, 0, 0], 1000),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: flatReading(120, 68, [200, 190, 180]),
      spacingLy: 1000,
    };

    overlay.update(frame);
    expect(overlay.labelCount()).toBeGreaterThan(0);
    for (const element of made) element.writes.length = 0;

    overlay.update(frame);

    const second = made.reduce((sum, element) => sum + element.writes.length, 0);
    expect(second).toBe(0);
  });

  test('carries a soft dark shadow and no pure black', () => {
    const { host, made } = fakeHost();
    const overlay = createGridLabelOverlay(host);

    overlay.update({
      view: viewAt([0, 0, 0], 1000),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: null,
      spacingLy: 1000,
    });

    expect(made.length).toBeGreaterThan(0);
    for (const element of made) {
      const shadow = element.style.getPropertyValue('text-shadow');
      expect(shadow).toBe(GRID_LABEL_SHADOW);
      expect(shadow).not.toContain('#000');
      expect(shadow).not.toContain('rgb(0, 0, 0)');
    }
  });
});
