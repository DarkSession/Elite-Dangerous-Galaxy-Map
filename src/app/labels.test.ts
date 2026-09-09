import { describe, expect, test } from 'vitest';
import { project } from '../camera/projection';
import type { View } from '../camera/view';
import {
  boxesOverlap,
  chooseLabels,
  LABEL_INSET,
  labelAnchor,
  labelFade,
  MAX_LABELS,
  orderCandidates,
  visiblePlaneArea,
} from './labels';
import { REGIONS, regionOfId } from '../scene-data/regions';
import type { Region } from '../scene-data/regions';

const VIEWPORT = { width: 1280, height: 720 };

/** The centroid of the Inner Orion Spur, which the anchor scenarios read. */
const SPUR = regionOfId(18) as Region;

function viewAt(distance: number, yaw = 0): View {
  return { cursor: [0, 0, 0], distance, yaw, pitch: 35 };
}

/** A label size that grows with the name, so the tests need no browser layout. */
function measure(name: string): { width: number; height: number } {
  return { width: 12 + name.length * 9, height: 20 };
}

describe('the visible plane area', () => {
  test('holds the cursor and grows with the zoom distance', () => {
    const near = visiblePlaneArea(viewAt(500), VIEWPORT);
    const far = visiblePlaneArea(viewAt(2000), VIEWPORT);
    for (const area of [near, far]) {
      expect(area.minX).toBeLessThanOrEqual(0);
      expect(area.maxX).toBeGreaterThanOrEqual(0);
      expect(area.minZ).toBeLessThanOrEqual(0);
      expect(area.maxZ).toBeGreaterThanOrEqual(0);
    }
    expect(far.maxX - far.minX).toBeGreaterThan(near.maxX - near.minX);
    expect(far.maxZ - far.minZ).toBeGreaterThan(near.maxZ - near.minZ);
  });

  test('holds every point within 8 times the zoom distance of the cursor', () => {
    const view = viewAt(500);
    const area = visiblePlaneArea(view, VIEWPORT);
    const limit = 8 * view.distance;
    expect(Math.max(Math.abs(area.minX), Math.abs(area.maxX))).toBeLessThanOrEqual(
      limit,
    );
    expect(Math.max(Math.abs(area.minZ), Math.abs(area.maxZ))).toBeLessThanOrEqual(
      limit,
    );
  });
});

describe('the label anchor', () => {
  test('takes the side the region lies on when the centroid is behind the camera', () => {
    // The camera looks away from the centroid, so the centroid has a negative `w`.
    const view = viewAt(500, 180);
    const raw = project(view, [SPUR.centroid[0], 0, SPUR.centroid[1]], VIEWPORT);
    expect(raw.inFront).toBe(false);
    // Without the flip the anchor lands above and left of the frame.
    expect(raw.x).toBeLessThan(VIEWPORT.width / 2);
    expect(raw.y).toBeLessThan(VIEWPORT.height / 2);

    const anchor = labelAnchor(view, SPUR.centroid, VIEWPORT);
    expect(anchor.x).toBeGreaterThan(VIEWPORT.width / 2);
    expect(anchor.y).toBeGreaterThan(VIEWPORT.height / 2);
  });

  test('keeps the projection when the centroid is in front of the camera', () => {
    const view = viewAt(500);
    const raw = project(view, [SPUR.centroid[0], 0, SPUR.centroid[1]], VIEWPORT);
    expect(raw.inFront).toBe(true);
    expect(labelAnchor(view, SPUR.centroid, VIEWPORT).x).toBeCloseTo(raw.x, 9);
  });

  test('holds the anchor 48 pixels inside the frame', () => {
    // The centroid of the region the camera sits inside is far above the frame.
    const above = labelAnchor(viewAt(500), SPUR.centroid, VIEWPORT);
    expect(above.y).toBe(LABEL_INSET);
    expect(above.x).toBeGreaterThanOrEqual(LABEL_INSET);
    expect(above.x).toBeLessThanOrEqual(VIEWPORT.width - LABEL_INSET);

    // The same centroid behind the camera lands below the frame, and the inset holds
    // it 48 pixels above the bottom edge.
    const behind = labelAnchor(viewAt(500, 180), SPUR.centroid, VIEWPORT);
    expect(behind.y).toBe(VIEWPORT.height - LABEL_INSET);
    expect(behind.x).toBeLessThanOrEqual(VIEWPORT.width - LABEL_INSET);
    expect(behind.x).toBeGreaterThanOrEqual(LABEL_INSET);
  });
});

describe('the placement', () => {
  /** Two regions with the same centroid, so the second label lands on the first. */
  const stacked: Region[] = [
    {
      id: 1,
      name: 'Big Region',
      area: 400,
      bounds: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 },
      centroid: [0, 0],
    },
    {
      id: 2,
      name: 'Small Region',
      area: 100,
      bounds: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 },
      centroid: [0, 0],
    },
  ];

  test('drops a smaller region whose label overlaps a larger one', () => {
    const placed = chooseLabels(viewAt(500), VIEWPORT, measure, stacked);
    expect(placed.map((label) => label.name)).toEqual(['Big Region']);
  });

  test('places the candidate nearest the cursor first', () => {
    const core: View = { cursor: [15, 0, 25895], distance: 20000, yaw: 0, pitch: 35 };
    const area = visiblePlaneArea(core, VIEWPORT);
    const ordered = orderCandidates(core, area, REGIONS);
    expect(ordered[0]?.name).toBe('Galactic Centre');
    // The rest follow largest footprint first.
    for (let index = 2; index < ordered.length; index += 1) {
      expect((ordered[index] as Region).area).toBeLessThanOrEqual(
        (ordered[index - 1] as Region).area,
      );
    }
    // A pure largest-first order would not name it: it is the smallest candidate.
    const areas = ordered.map((region) => region.area);
    expect(Math.min(...areas)).toBe(ordered[0]?.area);
    expect(chooseLabels(core, VIEWPORT, measure, REGIONS)[0]?.name).toBe(
      'Galactic Centre',
    );
  });

  test('places at most 12 labels and lets none overlap', () => {
    const core: View = { cursor: [15, 0, 25895], distance: 20000, yaw: 0, pitch: 35 };
    const placed = chooseLabels(core, VIEWPORT, measure, REGIONS);
    expect(placed.length).toBeLessThanOrEqual(MAX_LABELS);
    expect(placed.length).toBeGreaterThan(0);
    for (let first = 0; first < placed.length; first += 1) {
      for (let second = first + 1; second < placed.length; second += 1) {
        expect(boxesOverlap(placed[first] as never, placed[second] as never)).toBe(
          false,
        );
      }
    }
  });

  test('places every label box inside the viewport', () => {
    const placed = chooseLabels(viewAt(500), VIEWPORT, measure, REGIONS);
    for (const label of placed) {
      expect(label.left).toBeGreaterThanOrEqual(0);
      expect(label.top).toBeGreaterThanOrEqual(0);
      expect(label.left + label.width).toBeLessThanOrEqual(VIEWPORT.width);
      expect(label.top + label.height).toBeLessThanOrEqual(VIEWPORT.height);
    }
  });
});

describe('the label fade', () => {
  test('follows the fade in of the lines and does not fade out', () => {
    expect(labelFade(30000)).toBe(0);
    expect(labelFade(60000)).toBe(0);
    expect(labelFade(20000)).toBe(1);
    expect(labelFade(500)).toBe(1);
    expect(labelFade(25000)).toBeGreaterThan(0);
    expect(labelFade(25000)).toBeLessThan(1);
  });

  test('shows no label above the fade in distance', () => {
    expect(chooseLabels(viewAt(60000), VIEWPORT, measure, REGIONS)).toEqual([]);
  });
});
