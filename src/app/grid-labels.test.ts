import { describe, expect, test } from 'vitest';
import type { View } from '../camera/view';
import {
  crossingLabelText,
  GRID_CANDIDATE_COUNT,
  GRID_LABEL_SPAN,
  gridLabelPlacements,
  labelBoxAt,
  MAX_GRID_LABELS,
  planeLabelBox,
  planeLabelText,
  PLANE_LABEL_BOTTOM_CSS,
} from './grid-labels';
import { boxesOverlap } from './labels';

const VIEWPORT = { width: 1920, height: 1080 };

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
    const frame = { view: viewAt([0, 0, 0], 1000), viewport: VIEWPORT, spacingLy: 0 };
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
    // A close zoom brings the crossings of the label level together, so the boxes of the
    // candidates meet. The sweep must then place fewer labels than it has candidates.
    const frame = {
      view: viewAt([0, 0, 0], 12000),
      viewport: VIEWPORT,
      spacingLy: 10000,
    };

    const placed = gridLabelPlacements(frame);

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
