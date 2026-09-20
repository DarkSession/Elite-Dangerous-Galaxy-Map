import { describe, expect, test } from 'vitest';

import { BUILT_IN_ICONS, MAX_ICONS, readIcons } from './marker-icons';
import { safeImageUrl } from './real-systems';

/** The reader takes the same URL rule the record images hold. */
const read = (value: unknown) => readIcons(value, safeImageUrl);

describe('the built-in icon catalogue', () => {
  test('resolves every symbol to a URL of the package itself', () => {
    expect(BUILT_IN_ICONS.size).toBeGreaterThan(0);
    for (const [symbol, icon] of BUILT_IN_ICONS) {
      expect(icon.url.length, `${symbol} resolves to no URL`).toBeGreaterThan(0);
      // A relative URL names no host. The library serves its own vectors and reaches no
      // third-party address for one.
      const scheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.exec(icon.url);
      expect(scheme, `${symbol} names a scheme`).toBeNull();
    }
  });

  test('reads the colour of a symbol as three numbers', () => {
    // `titan` reads `#FF0000` in the catalogue this version pins.
    expect(BUILT_IN_ICONS.get('titan')?.color).toEqual([255, 0, 0]);
    expect(BUILT_IN_ICONS.get('mission')?.color).toEqual([0, 93, 255]);
  });
});

describe('the icon reader', () => {
  test('gives no icon for a missing field', () => {
    expect(read(undefined)).toEqual([]);
  });

  test('gives no icon for an empty list', () => {
    expect(read([])).toEqual([]);
  });

  test('reads a symbol without case and without spaces', () => {
    expect(read([' Titan '])).toEqual([BUILT_IN_ICONS.get('titan')]);
  });

  test('keeps the order of the record', () => {
    const icons = read(['mission', 'titan']);
    expect(icons).toEqual([BUILT_IN_ICONS.get('mission'), BUILT_IN_ICONS.get('titan')]);
  });

  test('refuses a symbol the catalogue does not hold', () => {
    expect(read(['no-such-icon'])).toBe('unknown-icon');
  });

  test('reads a host icon with a colour', () => {
    expect(read([{ url: '/my.svg', color: [1, 2, 3] }])).toEqual([
      { url: '/my.svg', color: [1, 2, 3] },
    ]);
  });

  test('refuses a host icon with no colour', () => {
    expect(read([{ url: '/my.svg' }])).toBe('bad-icon');
  });

  test('refuses a colour outside 0 to 255', () => {
    expect(read([{ url: '/my.svg', color: [0, 0, 256] }])).toBe('bad-icon');
    expect(read([{ url: '/my.svg', color: [-1, 0, 0] }])).toBe('bad-icon');
    expect(read([{ url: '/my.svg', color: [0, 0] }])).toBe('bad-icon');
  });

  test('refuses a URL the image rule refuses', () => {
    expect(read([{ url: 'javascript:alert(1)', color: [1, 2, 3] }])).toBe('bad-icon');
    expect(read([{ url: '\tjavascript:alert(1)', color: [1, 2, 3] }])).toBe('bad-icon');
    expect(read([{ url: '', color: [1, 2, 3] }])).toBe('bad-icon');
  });

  test('refuses more than four entries', () => {
    const five = ['titan', 'mission', 'bookmark', 'waypoint', 'engineer'];
    expect(five).toHaveLength(MAX_ICONS + 1);
    expect(read(five)).toBe('bad-icon');
    expect(read(five.slice(0, MAX_ICONS))).toHaveLength(MAX_ICONS);
  });

  test('refuses an icons field that is not an array', () => {
    expect(read('titan')).toBe('bad-icon');
    expect(read(null)).toBe('bad-icon');
    expect(read({ 0: 'titan' })).toBe('bad-icon');
  });

  test('refuses an entry that is neither a string nor an object', () => {
    expect(read([4])).toBe('bad-icon');
    expect(read([null])).toBe('bad-icon');
  });
});
