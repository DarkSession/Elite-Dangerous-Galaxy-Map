import { describe, expect, test } from 'vitest';
import {
  CURSOR_MARKER_FAR_LY,
  CURSOR_MARKER_NEAR_LY,
  CURSOR_MARKER_SIZE_CSS,
  CURSOR_MARKER_SIZE_MIN_CSS,
  cursorMarkerSizeCss,
} from './cursor-marker';

describe('the marker size band', () => {
  test('holds the two ends and the two distances the rule states', () => {
    expect(CURSOR_MARKER_SIZE_CSS).toBe(96);
    expect(CURSOR_MARKER_SIZE_MIN_CSS).toBe(40);
    expect(CURSOR_MARKER_NEAR_LY).toBe(12000);
    expect(CURSOR_MARKER_FAR_LY).toBe(60000);
  });

  test('reads the stated size at each camera distance', () => {
    // The near end is where the coordinate grid goes out and the far end is the start
    // view. The ring measures 0.6 of the box, so it reads 58, 58, 47, 24 and 24.
    expect(cursorMarkerSizeCss(1000)).toBeCloseTo(96, 6);
    expect(cursorMarkerSizeCss(12000)).toBeCloseTo(96, 6);
    expect(cursorMarkerSizeCss(30000)).toBeCloseTo(78.3, 1);
    expect(cursorMarkerSizeCss(60000)).toBeCloseTo(40, 6);
    expect(cursorMarkerSizeCss(120000)).toBeCloseTo(40, 6);
  });

  test('never rises as the camera pulls back', () => {
    let before = CURSOR_MARKER_SIZE_CSS;
    for (let distance = 0; distance <= 200000; distance += 1000) {
      const reading = cursorMarkerSizeCss(distance);
      expect(reading).toBeLessThanOrEqual(before + 1e-9);
      expect(reading).toBeGreaterThanOrEqual(CURSOR_MARKER_SIZE_MIN_CSS);
      expect(reading).toBeLessThanOrEqual(CURSOR_MARKER_SIZE_CSS);
      before = reading;
    }
  });
});
