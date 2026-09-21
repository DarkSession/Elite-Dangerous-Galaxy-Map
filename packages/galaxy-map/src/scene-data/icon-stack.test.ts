import { describe, expect, test } from 'vitest';
import {
  ARROW_HEIGHT_CSS,
  arrowApexCss,
  ICON_CSS_SIZE,
  ICON_GAP_CSS,
  iconBottomCss,
  MAX_ICON_STACKS,
  PIN_HEIGHT_CSS,
  PIN_TIP_GAP_CSS,
} from './icon-stack';

describe('the icon stack geometry', () => {
  test('puts the arrow apex at the tip offset the pin takes', () => {
    expect(arrowApexCss(300, 7, false)).toBe(300 - 3.5 - PIN_TIP_GAP_CSS);
    expect(arrowApexCss(300, 12, false)).toBe(300 - 6 - PIN_TIP_GAP_CSS);
  });

  test('stacks the icons from the top of the arrow, 2 pixels apart', () => {
    // Index 0 is the record's first icon and the lowest of the stack. Its bottom sits
    // the marker's half size, the tip offset and the arrow height above the centre.
    expect(iconBottomCss(300, 7, 0, false)).toBe(300 - 3.5 - 7);
    expect(iconBottomCss(300, 7, 1, false)).toBe(300 - 3.5 - 7 - 30);
    expect(iconBottomCss(300, 7, 2, false)).toBe(300 - 3.5 - 7 - 60);
    expect(iconBottomCss(300, 12, 3, false)).toBe(300 - 6 - 7 - 90);
    expect(ICON_CSS_SIZE + ICON_GAP_CSS).toBe(30);
    expect(PIN_TIP_GAP_CSS + ARROW_HEIGHT_CSS).toBe(7);
  });

  test('lifts the whole stack by the height of the pin for a selection', () => {
    expect(arrowApexCss(300, 7, true)).toBe(arrowApexCss(300, 7, false) - 28);
    for (let index = 0; index < 4; index += 1) {
      expect(iconBottomCss(300, 12, index, true)).toBe(
        iconBottomCss(300, 12, index, false) - PIN_HEIGHT_CSS,
      );
    }
    expect(PIN_HEIGHT_CSS).toBe(28);
  });

  test('keeps at most 32 stacks, which is 128 icons of 4', () => {
    expect(MAX_ICON_STACKS).toBe(32);
  });
});
