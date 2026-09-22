import { describe, expect, test } from 'vitest';
import { cameraPosition, planePoint, viewProjectionMatrix } from '../camera/projection';
import { resolveBounds, unrestrictedBounds } from '../camera/view';
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
  GRID_LABEL_GAP_SHARE,
  GRID_LABEL_REACH,
  GRID_LABEL_PAINT_ORDER,
  GRID_LABEL_STROKE,
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
  worstCaseLabelText,
} from './grid-labels';
import type { GridLabelMeasure, GridLabelReading } from './grid-labels';
import { boxesOverlap } from './labels';

const VIEWPORT = { width: 1920, height: 1080 };

/** The model bounds, which every frame below carries. */
const BOUNDS = MODEL_BOUNDS;

/** The browsable space, which the worst-case label text comes from. */
const BROWSE = unrestrictedBounds();

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

/** True when a label's screen bounding box covers some part of the viewport. */
function onTheFrame(
  box: { left: number; top: number; width: number; height: number },
  viewport: { width: number; height: number } = VIEWPORT,
): boolean {
  return (
    box.left < viewport.width &&
    box.left + box.width > 0 &&
    box.top < viewport.height &&
    box.top + box.height > 0
  );
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
      browse: BROWSE,
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
    // A value that rounds to negative zero reads `0` and not `-0`.
    expect(labelNumber(-0.4)).toBe('0');
    // `Math.round` takes a half up, so 1,234,567.5 reads as 1,234,568.
    expect(labelNumber(1234567.5)).toBe('1,234,568');
  });

  test('read the same text as `toLocaleString` over 10,000 seeded values', () => {
    // The kept format replaced a call of `toLocaleString` on each number. This holds the
    // text of the two the same, at 0, at negative values and at values past a million.
    let seed = 4711;
    const values = [0, -0, -0.4, 0.5, -0.5];
    for (let index = 0; index < 10000; index += 1) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      values.push((seed / 2147483648 - 0.5) * 2e7);
    }
    for (const value of values) {
      expect(labelNumber(value)).toBe((Math.round(value) || 0).toLocaleString('en-US'));
    }
  });

  test('carry the plane height as the middle number', () => {
    const frame = {
      view: viewAt([1200, -600, 2400], 1000),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      browse: BROWSE,
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

  test('hold the crossing at the label quad\u2019s own bottom right corner', () => {
    const view = viewAt([0, 0, 0], 1000);
    const frame = {
      view,
      viewport: VIEWPORT,
      bounds: BOUNDS,
      browse: BROWSE,
      background: null,
      spacingLy: 1000,
    };
    // The gap is 0.04 of a spacing on each axis, which is 40 light years here.
    const gap = GRID_LABEL_GAP_SHARE * 1000;

    const placed = gridLabelPlacements(frame, measure);
    expect(placed.length).toBeGreaterThan(0);
    for (const placement of placed) {
      const numbers = numbersOf(placement.text);
      const crossingX = numbers[0] as number;
      const crossingZ = numbers[2] as number;
      // The four game corners of the placed quad, read back from its screen corners.
      const corners = placement.placed.corners.map((point) =>
        planePoint(view, point, VIEWPORT, view.cursor[1]),
      );
      for (const corner of corners) expect(corner).not.toBeNull();
      // The third corner is the element's own bottom right one, which sits at the
      // crossing less the gap on `x` and plus the gap on `z`. A wrong sign on either
      // axis fails here and not on the distance alone.
      const bottomRight = corners[2] as [number, number, number];
      expect(bottomRight[0]).toBeCloseTo(crossingX - gap, 3);
      expect(bottomRight[2]).toBeCloseTo(crossingZ + gap, 3);
      // Every corner lies toward `-x` and `+z` of the crossing, so neither line runs
      // under a digit.
      for (const corner of corners) {
        const point = corner as [number, number, number];
        expect(point[0]).toBeLessThan(crossingX);
        expect(point[2]).toBeGreaterThan(crossingZ);
      }
    }
  });

  test('keep at most 8 labels at the pitch that shows the most crossings', () => {
    const frame = {
      view: viewAt([0, 0, 0], 1000, 5),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      browse: BROWSE,
      background: null,
      spacingLy: 1000,
    };

    const placed = gridLabelPlacements(frame, measure);

    expect(placed.length).toBeGreaterThan(0);
    expect(placed.length).toBeLessThanOrEqual(MAX_GRID_LABELS);
  });

  // The scenario "A label whose crossing is off the frame stays" of `coordinate-grid`.
  test('keep a label whose crossing is off the frame', () => {
    // The cursor sits 40 light years left of the crossing row, so the crossing at
    // x = 1,000 projects past the right edge while the label, which lies toward -x of
    // it, still covers the frame. The gate read the crossing and took the whole label.
    const frame = {
      view: viewAt([-40, 0, 0], 1000),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      browse: BROWSE,
      background: null,
      spacingLy: 1000,
    };

    const placed = gridLabelPlacements(frame, measure);
    const kept = placed.find((placement) => placement.text === '1,000 : 0 : 0');

    expect(kept).toBeDefined();
    const label = kept as (typeof placed)[number];
    // The anchor is the crossing, which the frame does not hold.
    expect(label.x).toBeGreaterThan(VIEWPORT.width);
    // The label itself does cover the frame.
    const box = label.placed.box;
    expect(box.left).toBeLessThan(VIEWPORT.width);
    expect(box.left + box.width).toBeGreaterThan(0);
    expect(box.top).toBeLessThan(VIEWPORT.height);
    expect(box.top + box.height).toBeGreaterThan(0);
  });

  test('drop a candidate outside the viewport', () => {
    const frame = {
      view: viewAt([0, 0, 0], 1000),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      browse: BROWSE,
      background: null,
      spacingLy: 1000,
    };

    const placed = gridLabelPlacements(frame, measure);
    expect(placed.length).toBeGreaterThan(0);
    // The gate reads the label's own screen bounding box and not its anchor, so every
    // placement covers some part of the frame.
    for (const placement of placed) {
      expect(onTheFrame(placement.placed.box)).toBe(true);
    }
  });

  // The scenario "A label goes when no part of it is on the frame" of `coordinate-grid`.
  test('drop a label when no part of it is on the frame', () => {
    // The cursor sits 3 spacings left of the crossing row that carries `3,000`, so that
    // crossing and its whole label lie past the right edge of the frame.
    const frame = {
      view: viewAt([-500, 0, 0], 1000),
      viewport: { width: 640, height: 360 },
      bounds: BOUNDS,
      browse: BROWSE,
      background: null,
      spacingLy: 1000,
    };

    const placed = gridLabelPlacements(frame, measure);
    expect(placed.length).toBeGreaterThan(0);
    for (const placement of placed) {
      expect(onTheFrame(placement.placed.box, frame.viewport)).toBe(true);
    }
    // The crossing at x = 1,000 sits 1,500 light years right of the cursor. The reach
    // gate does not drop it: `gridLabelReach(1500, 1000)` reads 0.25. The quad gate of
    // `planePlacement` drops it, because the whole label lies past the right edge of
    // this narrow frame. That is the gate this test reads.
    expect(placed.some((placement) => placement.text === '1,000 : 0 : 0')).toBe(false);
  });

  test('skip a label whose screen box overlaps one already placed', () => {
    // A grazing pitch brings the far crossings together toward the horizon, so the
    // boxes of the candidates meet.
    const frame = {
      view: viewAt([0, 0, 0], 1000, 5),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      browse: BROWSE,
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
  test('falls to 0 at 2 spacings', () => {
    expect(GRID_LABEL_REACH).toBe(2);
    expect(gridLabelReach(0, 100)).toBeCloseTo(1, 9);
    // The reading this change is specified against.
    expect(gridLabelReach(90, 100)).toBeCloseTo(0.55, 9);
    expect(gridLabelReach(200, 100)).toBe(0);
    expect(gridLabelReach(240, 100)).toBe(0);
    // The furthest corner of the cell the cursor sits in is 1.41 spacings away, so it
    // draws at an opacity of at least 0.29.
    expect(gridLabelReach(141.4, 100)).toBeGreaterThan(0.29);
  });

  test('takes every crossing past the reach out of the frame', () => {
    const frame = {
      view: viewAt([0, 0, 0], 300),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      browse: BROWSE,
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
    // The worst case of the model bounds runs to 27 characters, so its width is about 23
    // cap heights. At a width share of 0.6 the width bound is the lesser one.
    const wide = measure(worstCaseLabelText(BROWSE));
    const byWidth = (1000 * GRID_LABEL_WIDTH_SHARE * wide.capPerEm) / wide.widthPerEm;
    expect(byWidth).toBeLessThan(1000 * GRID_LABEL_CAP_SHARE);
    expect(gridLabelCapHeightLy(1000, wide)).toBeCloseTo(byWidth, 9);

    // Only a text narrower than six cap heights reaches the one tenth ceiling, which no
    // crossing label is. The ceiling is a guard and not the rule that sets the size.
    const tiny = measure('0');
    expect(gridLabelCapHeightLy(1000, tiny)).toBeCloseTo(
      1000 * GRID_LABEL_CAP_SHARE,
      9,
    );
  });

  // The scenario "The cap height comes from the worst case and not from the frame" of
  // `coordinate-grid`.
  test('reads 0.026 of the 1,000 light year spacing inside the model bounds', () => {
    const capLy = gridLabelCapHeightLy(1000, measure(worstCaseLabelText(BROWSE)));
    expect(capLy / 1000).toBeGreaterThan(0.026 * 0.95);
    expect(capLy / 1000).toBeLessThan(0.026 * 1.05);
    expect(capLy).toBeLessThan(1000 * GRID_LABEL_CAP_SHARE);
  });

  test('gives every label of a frame one cap height', () => {
    const frame = {
      view: viewAt([0, 0, 0], 1000),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      browse: BROWSE,
      background: null,
      spacingLy: 1000,
    };

    const placed = gridLabelPlacements(frame, measure);
    expect(placed.length).toBeGreaterThan(0);
    // The texts of a frame are not all one length, so a per-label rule would give more
    // than one reading here.
    const lengths = new Set(placed.map((placement) => placement.text.length));
    expect(lengths.size).toBeGreaterThan(1);

    // The drawn cap height against the level's own spacing at the same crossing. The two
    // readings take the same projection scale, so the share is the cap height on the
    // plane. Under a per-label rule the 9 character text would read three times the 27
    // character one.
    const shares = placed.map(
      (placement) => placement.capHeightScreenCss / placement.spacingCss,
    );
    const first = shares[0] as number;
    for (const share of shares) expect(share / first).toBeCloseTo(1, 1);

    const worst = gridLabelCapHeightLy(1000, measure(worstCaseLabelText(BROWSE)));
    expect(first).toBeCloseTo(worst / 1000, 2);
    for (const placement of placed) {
      const widthLy = (placement.widthCss * worst) / placement.capHeightCss;
      expect(widthLy).toBeLessThanOrEqual(1000 * GRID_LABEL_WIDTH_SHARE + 1e-6);
      expect(worst).toBeLessThanOrEqual(1000 * GRID_LABEL_CAP_SHARE + 1e-9);
    }
  });

  test('gives a narrower space a larger cap height', () => {
    const sphere = resolveBounds(
      { mode: 'sphere', centre: [0, 0, 0], radiusLy: 900 },
      { min: [0, 0, 0], max: [0, 0, 0], empty: true },
    );
    // `-900 : -900 : -900` is 18 characters against the model's 27.
    expect(worstCaseLabelText(sphere)).toBe('-900 : -900 : -900');
    expect(
      gridLabelCapHeightLy(1000, measure(worstCaseLabelText(sphere))),
    ).toBeGreaterThan(gridLabelCapHeightLy(1000, measure(worstCaseLabelText(BROWSE))));
  });

  test('reads the longer written endpoint of each axis', () => {
    expect(worstCaseLabelText(BROWSE)).toBe('-49,985 : -40,985 : -24,105');
    // A box whose upper endpoint writes longer than its lower one.
    const box = resolveBounds(
      { mode: 'auto', marginLy: 0 },
      { min: [-5, -5, -5], max: [12345, 0, 0], empty: false },
    );
    expect(worstCaseLabelText(box)).toBe('12,345 : -5 : -5');
  });

  test('holds one share of the cell at every zoom', () => {
    const shares = [800, 1000, 1250].map((distance) => {
      const frame = {
        view: viewAt([0, 0, 0], distance),
        viewport: VIEWPORT,
        bounds: BOUNDS,
        browse: BROWSE,
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
      browse: BROWSE,
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
      browse: BROWSE,
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
      browse: BROWSE,
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
        browse: BROWSE,
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
      browse: BROWSE,
      background: null,
      spacingLy: 10000,
    };
    const near = {
      view: viewAt([0, 0, 0], 3000),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      browse: BROWSE,
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
      browse: BROWSE,
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

  test('sweeps once for one view epoch and reads the background every frame', () => {
    const { host, made } = fakeHost();
    const overlay = createGridLabelOverlay(host);
    const base = {
      viewport: VIEWPORT,
      bounds: BOUNDS,
      browse: BROWSE,
      spacingLy: 1000,
    };

    overlay.update({
      ...base,
      view: viewAt([0, 0, 0], 1000),
      background: flatReading(120, 68, [0, 0, 0]),
      epoch: 1,
    });
    const first = overlay.readings().map((one) => `${one.text}@${one.x},${one.y}`);
    expect(first.length).toBeGreaterThan(0);
    const dark = overlay.readings()[0]?.opacity ?? 0;
    for (const element of made) element.writes.length = 0;

    // The same epoch, a view a sweep would answer differently and a brighter reading.
    // The placements are the ones of the epoch, and the background still reaches every
    // label: the reading of a view lands one or two frames after the view.
    overlay.update({
      ...base,
      view: viewAt([1500, 0, 0], 1000),
      background: flatReading(120, 68, [240, 235, 230]),
      epoch: 1,
    });
    expect(overlay.readings().map((one) => `${one.text}@${one.x},${one.y}`)).toEqual(
      first,
    );
    expect(overlay.readings()[0]?.opacity ?? 0).toBeLessThan(dark);
    const written = made.flatMap((element) =>
      element.writes.map((write) => write.name),
    );
    expect(written).toContain('opacity');
    expect(written).toContain('color');

    // A raised epoch sweeps again, so the labels follow the view.
    overlay.update({
      ...base,
      view: viewAt([1500, 0, 0], 1000),
      background: flatReading(120, 68, [240, 235, 230]),
      epoch: 2,
    });
    expect(
      overlay.readings().map((one) => `${one.text}@${one.x},${one.y}`),
    ).not.toEqual(first);
  });

  test('reads the background at the centre of its own box', () => {
    const { host } = fakeHost();
    const overlay = createGridLabelOverlay(host);
    // Two columns: the left one dark and the right one bright. The crossing at the
    // cursor projects to the middle of the frame, which is the right column, and the
    // label's own box sits to the left of it, in the dark column.
    const reading: GridLabelReading = {
      width: 2,
      height: 1,
      pixels: Uint8Array.from([0, 0, 0, 255, 255, 255, 255, 255]),
    };

    overlay.update({
      view: viewAt([0, 0, 0], 1000),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      browse: BROWSE,
      background: reading,
      spacingLy: 1000,
    });

    const first = overlay.readings()[0] as ReturnType<typeof overlay.readings>[number];
    expect(first.text).toBe('0 : 0 : 0');
    // The dark column leaves the whole opacity. The bright one would give 0.75 of it.
    expect(first.opacity).toBeCloseTo(GRID_LABEL_OPACITY, 6);
  });

  // The scenario "A label at the edge reads the background inside the frame" of
  // `coordinate-grid`.
  test('reads the background inside the frame for a label at the edge', () => {
    const { host, made } = fakeHost();
    const overlay = createGridLabelOverlay(host);

    overlay.update({
      view: viewAt([-40, 0, 0], 1000),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      browse: BROWSE,
      background: flatReading(4, 4, [240, 235, 230]),
      spacingLy: 1000,
    });

    // This label's box reaches past the left edge, so its centre sits outside the
    // viewport at about -120 CSS pixels while the box still covers the frame.
    const readings = overlay.readings();
    const index = readings.findIndex((reading) => reading.text === '-1,000 : 0 : 0');
    expect(index).toBeGreaterThanOrEqual(0);
    const edge = readings[index] as (typeof readings)[number];
    const corners = edge.corners.map((point) => point.x);
    expect((Math.min(...corners) + Math.max(...corners)) / 2).toBeLessThan(0);
    expect(Math.max(...corners)).toBeGreaterThan(0);

    // The bright background inside the frame is what the label reads, so it takes the
    // merge floor and the deep colour and not the full opacity and the cyan.
    expect(edge.opacity).toBeCloseTo(
      GRID_LABEL_OPACITY * GRID_LABEL_MERGE_FLOOR * edge.reach,
      6,
    );
    const element = labelsOf(made)[index] as FakeElement;
    expect(element.style.getPropertyValue('color')).toBe('rgb(20, 88, 140)');
  });

  test('carries a drawn stroke, no blurred shadow and no pure black', () => {
    const { host, made } = fakeHost();
    const overlay = createGridLabelOverlay(host);

    overlay.update({
      view: viewAt([0, 0, 0], 1000),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      browse: BROWSE,
      background: null,
      spacingLy: 1000,
    });

    const elements = labelsOf(made);
    expect(elements.length).toBeGreaterThan(0);
    for (const element of elements) {
      expect(element.style.getPropertyValue('text-shadow')).toBe('');
      expect(element.style.getPropertyValue('-webkit-text-stroke')).toBe(
        GRID_LABEL_STROKE,
      );
      expect(element.style.getPropertyValue('paint-order')).toBe(
        GRID_LABEL_PAINT_ORDER,
      );
      expect(GRID_LABEL_STROKE).not.toContain('#000');
      expect(GRID_LABEL_STROKE).not.toContain('rgb(0, 0, 0)');
    }
  });

  test('lies on the plane and draws under the upright elements', () => {
    const { host, made } = fakeHost();
    const overlay = createGridLabelOverlay(host);

    overlay.update({
      view: viewAt([0, 0, 0], 1000, 30),
      viewport: VIEWPORT,
      bounds: BOUNDS,
      browse: BROWSE,
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
      browse: BROWSE,
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
      browse: BROWSE,
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
