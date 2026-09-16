import { describe, expect, test } from 'vitest';
import { cameraPosition, viewProjectionMatrix } from '../camera/projection';
import type { View } from '../camera/view';
import {
  GRID_LABEL_MERGE_FLOOR,
  GRID_MAX_ALPHA,
  gridLabelLevel,
  gridLevelAlpha,
  gridVisibility,
} from '../render/grid-pass';
import { MODEL_BOUNDS } from '../scene-data/real-systems';
import {
  createGridLabelOverlay,
  crossingLabelText,
  GRID_CANDIDATE_COUNT,
  GRID_LABEL_CAP_SHARE,
  GRID_LABEL_WIDTH_SHARE,
  GRID_LABEL_FONT_MAX_CSS,
  GRID_LABEL_FONT_MIN_CSS,
  GRID_LABEL_MIN_ALPHA,
  GRID_LABEL_OPACITY,
  GRID_LABEL_REACH,
  GRID_LABEL_SHADOW,
  GRID_LABEL_SPAN,
  gridLabelAlpha,
  gridLabelBackground,
  gridLabelCapHeightLy,
  gridLabelColour,
  gridLabelFontSize,
  gridLabelLineFactor,
  gridLabelOpacity,
  gridLabelPlacements,
  gridLabelReach,
  labelNumber,
  MAX_GRID_LABELS,
} from './grid-labels';
import type { GridLabelMeasure, GridLabelReading } from './grid-labels';
import { boxesOverlap } from './labels';

const VIEWPORT = { width: 1920, height: 1080 };

/** The model bounds, which every frame below carries. */
const BOUNDS = MODEL_BOUNDS;

/**
 * A measurement of a monospace font: 0.6 em for each character and a cap height of
 * 0.7 em. The unit tests take one fixed reading, so a placement they read does not follow
 * the font a browser loaded.
 */
function measure(text: string): GridLabelMeasure {
  return { widthPerEm: text.length * 0.6, capPerEm: 0.7 };
}

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

/** The three numbers of a label's text, with the thousands separators taken out. */
function numbersOf(text: string): number[] {
  return text.split(' : ').map((part) => Number(part.replace(/,/g, '')));
}

/** The CSS pixels per light year of the projection at one light year of range. */
function focalCss(height: number): number {
  return height / 2 / Math.tan(Math.PI / 6);
}

describe('the candidate set', () => {
  test('holds the 25 crossings within 2 spacings of the cursor', () => {
    expect(GRID_LABEL_SPAN).toBe(2);
    expect(GRID_CANDIDATE_COUNT).toBe(25);
    expect(MAX_GRID_LABELS).toBe(8);
  });

  test('places nothing without a label level', () => {
    const frame = {
      view: viewAt([0, 0, 0], 1000),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: null,
      spacingLy: 0,
    };
    expect(gridLabelPlacements(frame, measure)).toEqual([]);
  });
});

describe('the label level', () => {
  test('is 100 or 1,000 light years and no other', () => {
    const focal = focalCss(1080);
    const readings = [100, 200, 300, 1000, 3000, 11000].map((distance) =>
      gridLabelLevel(focal, distance),
    );
    expect(readings).toEqual([100, 100, 1000, 1000, 1000, 1000]);
    // The change happens where the 100 light year level's spacing at the cursor falls
    // under 400 CSS pixels, which is a zoom of 233.8 light years.
    expect(gridLabelLevel(focal, 233)).toBe(100);
    expect(gridLabelLevel(focal, 235)).toBe(1000);
  });
});

describe('the crossing labels', () => {
  test('read all three coordinates with a thousands separator', () => {
    expect(crossingLabelText(1000, -600, 2000)).toBe('1,000 : -600 : 2,000');
    expect(crossingLabelText(0, 0, 0)).toBe('0 : 0 : 0');
    expect(crossingLabelText(-1000.4, 12345, 0)).toBe('-1,000 : 12,345 : 0');
    expect(labelNumber(999)).toBe('999');
    expect(labelNumber(-1234567)).toBe('-1,234,567');
  });

  test('carry the plane height as the middle number', () => {
    const frame = {
      view: viewAt([1200, -600, 2400], 1000),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: null,
      spacingLy: 1000,
    };

    const placed = gridLabelPlacements(frame, measure);

    expect(placed.length).toBeGreaterThan(0);
    for (const placement of placed) {
      const numbers = numbersOf(placement.text);
      expect(numbers).toHaveLength(3);
      expect((numbers[0] as number) % 1000).toBe(0);
      expect(numbers[1]).toBe(-600);
      expect((numbers[2] as number) % 1000).toBe(0);
    }
  });

  test('hold the crossing inside the label quad', () => {
    const frame = {
      view: viewAt([0, 0, 0], 1000),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: null,
      spacingLy: 1000,
    };

    for (const placement of gridLabelPlacements(frame, measure)) {
      const box = placement.placed.box;
      expect(placement.x).toBeGreaterThanOrEqual(box.left - 1e-6);
      expect(placement.x).toBeLessThanOrEqual(box.left + box.width + 1e-6);
      expect(placement.y).toBeGreaterThanOrEqual(box.top - 1e-6);
      expect(placement.y).toBeLessThanOrEqual(box.top + box.height + 1e-6);
    }
  });

  test('keep at most 8 labels at the pitch that shows the most crossings', () => {
    const frame = {
      view: viewAt([0, 0, 0], 1000, 5),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: null,
      spacingLy: 1000,
    };

    const placed = gridLabelPlacements(frame, measure);

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

    for (const placement of gridLabelPlacements(frame, measure)) {
      expect(placement.x).toBeGreaterThanOrEqual(0);
      expect(placement.y).toBeGreaterThanOrEqual(0);
      expect(placement.x).toBeLessThanOrEqual(VIEWPORT.width);
      expect(placement.y).toBeLessThanOrEqual(VIEWPORT.height);
    }
  });

  test('skip a label whose screen box overlaps one already placed', () => {
    // A grazing pitch brings the far crossings together toward the horizon, so the
    // boxes of the candidates meet.
    const frame = {
      view: viewAt([0, 0, 0], 1000, 5),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: null,
      spacingLy: 1000,
    };

    const placed = gridLabelPlacements(frame, measure);

    expect(placed.length).toBeGreaterThan(0);
    for (let first = 0; first < placed.length; first += 1) {
      for (let second = first + 1; second < placed.length; second += 1) {
        const one = placed[first] as (typeof placed)[number];
        const other = placed[second] as (typeof placed)[number];
        expect(boxesOverlap(one.placed.box, other.placed.box)).toBe(false);
      }
    }
  });
});

describe('the reach fade', () => {
  test('falls to 0 at 1.2 spacings', () => {
    expect(GRID_LABEL_REACH).toBe(1.2);
    expect(gridLabelReach(0, 100)).toBeCloseTo(1, 9);
    // The reading this change is specified against.
    expect(gridLabelReach(90, 100)).toBeCloseTo(0.25, 9);
    expect(gridLabelReach(120, 100)).toBe(0);
    expect(gridLabelReach(200, 100)).toBe(0);
    // A cursor at the middle of a cell sits 0.707 spacings from all four corners.
    expect(gridLabelReach(70.71, 100)).toBeGreaterThan(0.4);
  });

  test('takes every crossing past the reach out of the frame', () => {
    const frame = {
      view: viewAt([0, 0, 0], 300),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: null,
      spacingLy: 100,
    };

    const placed = gridLabelPlacements(frame, measure);

    expect(placed.length).toBeGreaterThan(0);
    for (const placement of placed) {
      const numbers = numbersOf(placement.text);
      const away = Math.hypot(numbers[0] as number, numbers[2] as number);
      expect(away).toBeLessThan(GRID_LABEL_REACH * 100);
      expect(placement.reach).toBeGreaterThan(0);
      expect(placement.reach).toBeCloseTo(gridLabelReach(away, 100), 9);
    }
  });

  test('multiplies the opacity beside the line factor and the weight', () => {
    expect(gridLabelOpacity(0, GRID_MAX_ALPHA, 0.25)).toBeCloseTo(
      GRID_LABEL_OPACITY * 0.25,
      9,
    );
    expect(gridLabelOpacity(0, GRID_MAX_ALPHA, 0)).toBe(0);
  });
});

describe('the label size on the plane', () => {
  test('takes the lesser of one tenth of the spacing and the width bound', () => {
    // `x : y : z` runs to about 20 characters, so its width is roughly 14 cap heights.
    // At a width share of 0.6 the width bound is the lesser one for every text a
    // crossing carries.
    const wide = measure('-10,000 : -600 : -10,000');
    const byWidth =
      (1000 * GRID_LABEL_WIDTH_SHARE * wide.capPerEm) / wide.widthPerEm;
    expect(byWidth).toBeLessThan(1000 * GRID_LABEL_CAP_SHARE);
    expect(gridLabelCapHeightLy(1000, wide)).toBeCloseTo(byWidth, 9);

    const short = measure('0 : 0 : 0');
    expect(gridLabelCapHeightLy(1000, short)).toBeLessThan(
      1000 * GRID_LABEL_CAP_SHARE,
    );

    // Only a text narrower than six cap heights reaches the one tenth ceiling, which no
    // crossing label is. The ceiling is a guard and not the rule that sets the size.
    const tiny = measure('0');
    expect(gridLabelCapHeightLy(1000, tiny)).toBeCloseTo(
      1000 * GRID_LABEL_CAP_SHARE,
      9,
    );
  });

  test('holds every label to the width share of a spacing on the plane', () => {
    const frame = {
      view: viewAt([0, 0, 0], 1000),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: null,
      spacingLy: 1000,
    };

    const placed = gridLabelPlacements(frame, measure);
    expect(placed.length).toBeGreaterThan(0);
    for (const placement of placed) {
      const reading = measure(placement.text);
      const capLy = gridLabelCapHeightLy(1000, reading);
      const widthLy = (placement.widthCss * capLy) / placement.capHeightCss;
      expect(widthLy).toBeLessThanOrEqual(1000 * GRID_LABEL_WIDTH_SHARE + 1e-6);
      expect(capLy).toBeLessThanOrEqual(1000 * GRID_LABEL_CAP_SHARE + 1e-9);
    }
  });

  test('holds one share of the cell at every zoom', () => {
    const shares = [800, 1000, 1250].map((distance) => {
      const frame = {
        view: viewAt([0, 0, 0], distance),
        viewport: VIEWPORT,
        bounds: BOUNDS,
        background: null,
        spacingLy: 1000,
      };
      const placed = gridLabelPlacements(frame, measure);
      const first = placed[0] as (typeof placed)[number];
      return first.capHeightScreenCss / first.spacingCss;
    });
    const first = shares[0] as number;
    for (const share of shares) {
      expect(Math.abs(share / first - 1)).toBeLessThan(0.02);
      expect(share).toBeLessThanOrEqual(GRID_LABEL_CAP_SHARE + 1e-6);
    }
  });

  test('builds the element at a size the transform shrinks', () => {
    // The next power of two at or above the wanted size, so the scale stays in the half
    // open range from 0.5 to 1.
    expect(gridLabelFontSize(30)).toBe(32);
    expect(gridLabelFontSize(32)).toBe(32);
    expect(gridLabelFontSize(33)).toBe(64);
    expect(gridLabelFontSize(1)).toBe(GRID_LABEL_FONT_MIN_CSS);
    expect(gridLabelFontSize(0)).toBe(GRID_LABEL_FONT_MIN_CSS);
    expect(gridLabelFontSize(100000)).toBe(GRID_LABEL_FONT_MAX_CSS);
  });
});

describe('the model bounds', () => {
  test('place no label past the bound on the game x or z axis', () => {
    // The cursor sits on the upper `x` bound of 50,015, so the crossing at 51,000 lies
    // outside the model and the crossing at 50,000 lies 15 light years away.
    const frame = {
      view: viewAt([BOUNDS.x[1], 0, 0], 1000),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: null,
      spacingLy: 1000,
    };

    const placed = gridLabelPlacements(frame, measure);
    const names = placed.map((place) => place.text);

    expect(placed.length).toBeGreaterThan(0);
    expect(names).toContain('50,000 : 0 : 0');
    for (const place of placed) {
      const [x, , z] = numbersOf(place.text);
      expect(x as number).toBeLessThanOrEqual(BOUNDS.x[1]);
      expect(x as number).toBeGreaterThanOrEqual(BOUNDS.x[0]);
      expect(z as number).toBeLessThanOrEqual(BOUNDS.z[1]);
      expect(z as number).toBeGreaterThanOrEqual(BOUNDS.z[0]);
    }
  });

  test('place no label past the upper z bound', () => {
    // The last crossing of the 1,000 light year level inside the upper `z` bound of
    // 75,895 is 75,000. The cursor sits on it, so the crossing at 76,000 is one spacing
    // away and lies outside the model.
    const frame = {
      view: viewAt([0, 0, 75000], 1000),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: null,
      spacingLy: 1000,
    };

    const placed = gridLabelPlacements(frame, measure);
    const names = placed.map((place) => place.text);

    expect(placed.length).toBeGreaterThan(0);
    expect(names).toContain('0 : 0 : 75,000');
    for (const place of placed) {
      const z = numbersOf(place.text)[2] as number;
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
    expect(gridLabelPlacements(tight, measure)).toEqual([]);

    // A spacing of 33 light years measures about 31 CSS pixels and holds the floor.
    const open = { ...tight, spacingLy: 33 };
    const wider = screenGaps(open.view, 33, 0, 0);
    expect(Math.max(wider.alongX, wider.alongZ)).toBeGreaterThan(24);
    expect(gridLabelPlacements(open, measure).length).toBeGreaterThan(0);
  });

  test('places every label on a reading that holds the floor', () => {
    for (const pitch of [5, 35, 89]) {
      const frame = {
        view: viewAt([0, 0, 0], 3000, pitch),
        viewport: VIEWPORT,
        bounds: BOUNDS,
        background: null,
        spacingLy: 10000,
      };

      const placed = gridLabelPlacements(frame, measure);
      expect(placed.length).toBeGreaterThan(0);
      for (const place of placed) {
        expect(place.alpha).toBeGreaterThanOrEqual(GRID_LABEL_MIN_ALPHA);
      }
    }
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
    expect(gridLabelPlacements(far, measure)).toEqual([]);
    expect(gridLabelPlacements(near, measure).length).toBeGreaterThan(0);
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
  // `made` holds every element the overlay built, including the canvas the measurement
  // asks for. A test that reads a label's style takes `labelsOf` and not `made`.

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
    ownerDocument: {
      createElement: (tag: string): FakeElement => {
        const element = makeElement();
        element.className = tag;
        return element;
      },
    },
    append(...children: FakeElement[]): void {
      for (const child of children) child.parentNode = host;
    },
  };
  return { host: host as unknown as HTMLElement, made };
}

/** The label elements of a fake host, without the canvas the measurement asks for. */
function labelsOf(made: FakeElement[]): FakeElement[] {
  return made.filter((element) => element.className === 'gm-grid-label');
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
      expect(gridLabelColour(background)).toBe('rgb(140, 235, 240)');
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
    // The merge is complete there, so the label carries its deep colour whole. It takes
    // nothing of the background's own colour.
    expect(gridLabelColour(background)).toBe('rgb(20, 88, 140)');
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

    const elements = labelsOf(made);
    expect(elements.length).toBeGreaterThan(0);
    for (const element of elements) {
      const shadow = element.style.getPropertyValue('text-shadow');
      expect(shadow).toBe(GRID_LABEL_SHADOW);
      expect(shadow).not.toContain('#000');
      expect(shadow).not.toContain('rgb(0, 0, 0)');
    }
  });

  test('lies on the plane and draws under the upright elements', () => {
    const { host, made } = fakeHost();
    const overlay = createGridLabelOverlay(host);

    overlay.update({
      view: viewAt([0, 0, 0], 1000, 30),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: null,
      spacingLy: 1000,
    });

    const elements = labelsOf(made);
    expect(elements.length).toBeGreaterThan(0);
    for (const element of elements) {
      expect(element.style.getPropertyValue('transform')).toContain('matrix3d(');
      expect(element.style.getPropertyValue('transform-origin')).toBe('0 0');
      expect(element.style.getPropertyValue('z-index')).toBe('0');
    }
  });

  test('reports the readings a browser test takes', () => {
    const { host } = fakeHost();
    const overlay = createGridLabelOverlay(host);

    overlay.update({
      view: viewAt([0, 0, 0], 1000),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: null,
      spacingLy: 1000,
    });

    const readings = overlay.readings();
    expect(readings.length).toBeGreaterThan(0);
    for (const reading of readings) {
      expect(reading.corners).toHaveLength(4);
      expect(reading.reach).toBeGreaterThan(0);
      expect(reading.reach).toBeLessThanOrEqual(1);
      expect(reading.opacity).toBeGreaterThan(0);
      expect(reading.capHeightCss).toBeGreaterThan(0);
      expect(reading.spacingCss).toBeGreaterThan(0);
    }
  });

  test('takes every label out with the level', () => {
    const { host, made } = fakeHost();
    const overlay = createGridLabelOverlay(host);
    const frame = {
      view: viewAt([0, 0, 0], 1000),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      background: null,
      spacingLy: 1000,
    };

    overlay.update(frame);
    expect(overlay.labelCount()).toBeGreaterThan(0);

    overlay.update({ ...frame, spacingLy: 0 });

    expect(overlay.labelCount()).toBe(0);
    expect(overlay.readings()).toEqual([]);
    for (const element of labelsOf(made)) expect(element.parentNode).toBeNull();
  });
});
