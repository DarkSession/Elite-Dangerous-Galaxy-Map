// The pure formatters of the HUD's element helpers, and the icon helper over a fake
// document. The rest of the module writes to elements, which the browser suite reads.
import { describe, expect, test } from 'vitest';
import { formatCoordinate, formatLightYears, formatWhole, makeSvg } from './dom';

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

describe('the kept number formats', () => {
  test('read the same text as `toLocaleString` over 10,000 seeded values', () => {
    // The kept formats replaced a call of `toLocaleString` on each number. This holds the
    // text of the two the same, at 0, at negative values and at the 1/32 step.
    let seed = 4711;
    const values = [0, -0, -0.4, 0.5, -0.5, 1000.03125, -9530.9375];
    for (let index = 0; index < 10000; index += 1) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      values.push((seed / 2147483648 - 0.5) * 2e5);
      // A value on the 1/32 step, which the coordinate readout shows exactly.
      values.push(Math.round((seed / 2147483648 - 0.5) * 3.2e6) / 32);
    }
    for (const value of values) {
      const whole = Math.round(value).toLocaleString('en-US');
      expect(formatWhole(value)).toBe(whole);
      expect(formatLightYears(value)).toBe(`${whole} LY`);
      for (const separators of [true, false]) {
        expect(formatCoordinate(value, separators)).toBe(
          value.toLocaleString('en-US', {
            maximumFractionDigits: 5,
            useGrouping: separators,
          }),
        );
      }
    }
  });
});

describe('makeSvg', () => {
  test('makes an svg element with the attributes every icon shares', () => {
    const made: { namespace: string; tag: string; attributes: Map<string, string> }[] =
      [];
    const doc = {
      createElementNS(namespace: string, tag: string) {
        const attributes = new Map<string, string>();
        made.push({ namespace, tag, attributes });
        return {
          setAttribute(name: string, value: string): void {
            attributes.set(name, value);
          },
        };
      },
    } as unknown as Document;

    makeSvg(doc, '0 0 16 16', 13);

    expect(made).toHaveLength(1);
    expect(made[0]?.namespace).toBe('http://www.w3.org/2000/svg');
    expect(made[0]?.tag).toBe('svg');
    expect(Object.fromEntries(made[0]?.attributes ?? [])).toEqual({
      viewBox: '0 0 16 16',
      width: '13',
      height: '13',
      fill: 'none',
      stroke: 'currentColor',
      'aria-hidden': 'true',
    });
  });
});
