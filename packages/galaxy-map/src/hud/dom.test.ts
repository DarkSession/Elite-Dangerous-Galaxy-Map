// The pure formatters of the HUD's element helpers. The rest of the module writes to
// elements, which the browser suite reads.
import { describe, expect, test } from 'vitest';
import { formatCoordinate } from './dom';

describe('formatCoordinate', () => {
  test('shows at most five decimal places with separators', () => {
    expect(formatCoordinate(-9530.9375, true)).toBe('-9,530.9375');
    expect(formatCoordinate(-910.28125, true)).toBe('-910.28125');
    expect(formatCoordinate(19808.125, true)).toBe('19,808.125');
    expect(formatCoordinate(100, true)).toBe('100');
    expect(formatCoordinate(0, true)).toBe('0');
    expect(formatCoordinate(-25.5, true)).toBe('-25.5');
  });

  test('drops the separators for the copy form', () => {
    expect(formatCoordinate(-9530.9375, false)).toBe('-9530.9375');
    expect(formatCoordinate(-910.28125, false)).toBe('-910.28125');
    expect(formatCoordinate(19808.125, false)).toBe('19808.125');
    expect(formatCoordinate(100, false)).toBe('100');
    expect(formatCoordinate(0, false)).toBe('0');
    expect(formatCoordinate(-25.5, false)).toBe('-25.5');
  });

  test('drops the trailing zeros and the trailing point', () => {
    expect(formatCoordinate(1235.0, true)).toBe('1,235');
    expect(formatCoordinate(1234.5, false)).toBe('1234.5');
    expect(formatCoordinate(1234.100000001, false)).toBe('1234.1');
  });

  test('reproduces the 1/32 light year step exactly', () => {
    expect(formatCoordinate(1000.03125, false)).toBe('1000.03125');
    expect(formatCoordinate(-1000.03125, false)).toBe('-1000.03125');
  });
});
