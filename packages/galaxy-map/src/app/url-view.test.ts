import { describe, expect, test, vi } from 'vitest';
import { createDefaultView, MIN_DISTANCE } from '../camera/view';
import type { View } from '../camera/view';
import {
  createFragmentWriter,
  encodeView,
  FRAGMENT_THROTTLE_MS,
  decodeGrid,
  decodeView,
} from './url-view';

describe('the URL fragment', () => {
  test('reads a full fragment', () => {
    const view = decodeView('#c=-9530,-910,19808&d=8000&p=50&y=120');
    expect(view.cursor).toEqual([-9530, -910, 19808]);
    expect(view.distance).toBe(8000);
    expect(view.pitch).toBe(50);
    expect(view.yaw).toBe(120);
  });

  test('gives the default view without a fragment', () => {
    expect(decodeView('')).toEqual(createDefaultView());
    expect(decodeView('#')).toEqual(createDefaultView());
  });

  test('applies the limits to a fragment that is out of range', () => {
    const view = decodeView('#c=600000,0,0&d=1&p=200&y=-30');
    expect(view.distance).toBe(MIN_DISTANCE);
    expect(view.pitch).toBe(89);
    expect(view.yaw).toBe(330);
  });

  test('reads a fragment written before the zoom limit moved', () => {
    const view = decodeView('#c=0,0,0&d=2000&p=35&y=0');
    expect(view.distance).toBe(2000);
    expect(view.cursor).toEqual([0, 0, 0]);
    expect(view.pitch).toBe(35);
    expect(view.yaw).toBe(0);
  });

  // The close zoom limit moved from 500 to 10 light years, so a fragment the old limit
  // would have clamped now loads as it was written.
  test('reads a fragment below the old zoom limit', () => {
    expect(decodeView('#c=0,0,0&d=50&p=35&y=0').distance).toBe(50);
    expect(decodeView('#c=0,0,0&d=1&p=35&y=0').distance).toBe(MIN_DISTANCE);
    expect(MIN_DISTANCE).toBe(10);
  });

  // The scenario "A view round trips" of `library-package`.
  test('round trips a view within 1e-5', () => {
    const view: View = {
      cursor: [1000.5, -600.25, 2000],
      distance: 432.125,
      yaw: 91.5,
      pitch: -20.75,
    };
    const read = decodeView(encodeView(view));
    expect(read.cursor[0]).toBeCloseTo(view.cursor[0], 5);
    expect(read.cursor[1]).toBeCloseTo(view.cursor[1], 5);
    expect(read.cursor[2]).toBeCloseTo(view.cursor[2], 5);
    expect(read.distance).toBeCloseTo(view.distance, 5);
    expect(read.yaw).toBeCloseTo(view.yaw, 5);
    expect(read.pitch).toBeCloseTo(view.pitch, 5);
  });

  // The scenario "A negative pitch encodes and decodes". The pitch range runs to -89
  // degrees now, so a fragment written under the plane reads back under the plane.
  test('round trips a pitch of -89', () => {
    const view: View = { cursor: [0, 0, 0], distance: 1000, yaw: 0, pitch: -89 };
    expect(encodeView(view)).toBe('c=0,0,0&d=1000&p=-89&y=0');
    expect(decodeView(encodeView(view)).pitch).toBe(-89);
  });

  // The scenario "An unreadable field takes the default".
  test('takes the default for a field it cannot read', () => {
    expect(decodeView('c=nonsense&d=abc')).toEqual(createDefaultView());
  });

  // The scenario "The grid flag is optional".
  test('writes the grid flag only where the caller gives one', () => {
    const view = createDefaultView();
    expect(encodeView(view)).not.toContain('g=');
    expect(encodeView(view, true).endsWith('&g=1')).toBe(true);
    expect(encodeView(view, false).endsWith('&g=0')).toBe(true);
  });

  // The scenario "The grid flag reads three ways".
  test('reads the grid flag three ways', () => {
    expect(decodeGrid('g=1')).toBe(true);
    expect(decodeGrid('g=0')).toBe(false);
    expect(decodeGrid('c=0,0,0')).toBeNull();
  });

  test('writes the fragment the parser reads', () => {
    const view = createDefaultView();
    view.distance = 30000;
    expect(encodeView(view)).toBe('c=0,0,0&d=30000&p=35&y=0');
    expect(decodeView(`#${encodeView(view)}`)).toEqual(view);
  });

  test('writes at most once every 500 milliseconds', () => {
    vi.useFakeTimers();
    try {
      const view = createDefaultView();
      const written: string[] = [];
      let clock = 1000;
      const writer = createFragmentWriter(view, {
        write: (fragment) => written.push(fragment),
        now: () => clock,
      });

      writer.schedule();
      expect(written.length).toBe(1);

      view.distance = 30000;
      writer.schedule();
      writer.schedule();
      expect(written.length).toBe(1);

      clock += FRAGMENT_THROTTLE_MS;
      vi.advanceTimersByTime(FRAGMENT_THROTTLE_MS);
      expect(written.length).toBe(2);
      expect(written[1]).toContain('d=30000');
      writer.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the grid field of the fragment', () => {
  test('writes the field only when the call gives a switch', () => {
    const view = createDefaultView();
    view.distance = 30000;

    expect(encodeView(view)).toBe('c=0,0,0&d=30000&p=35&y=0');
    expect(encodeView(view, true)).toBe('c=0,0,0&d=30000&p=35&y=0&g=1');
    expect(encodeView(view, false)).toBe('c=0,0,0&d=30000&p=35&y=0&g=0');
  });

  // The scenario "A fragment with no grid field leaves the switch".
  test('reads g=1, g=0, an unreadable g and a fragment with none', () => {
    expect(decodeGrid('#c=0,0,0&d=8000&p=50&y=0&g=1')).toBe(true);
    expect(decodeGrid('c=0,0,0&d=8000&p=50&y=0&g=0')).toBe(false);
    expect(decodeGrid('#c=0,0,0&d=8000&p=50&y=0&g=x')).toBeNull();
    expect(decodeGrid('#c=0,0,0&d=8000&p=50&y=0')).toBeNull();
    expect(decodeGrid('')).toBeNull();
    expect(decodeGrid('#')).toBeNull();
  });

  test('leaves the view parser as it was', () => {
    const view = decodeView('#c=0,0,0&d=8000&p=50&y=0&g=0');
    expect(view.distance).toBe(8000);
    expect(view.pitch).toBe(50);
    expect(view.cursor).toEqual([0, 0, 0]);
  });

  test('the writer reads the switch at each write', () => {
    vi.useFakeTimers();
    try {
      const view = createDefaultView();
      const written: string[] = [];
      let clock = 1000;
      let grid = true;
      const writer = createFragmentWriter(view, {
        write: (fragment) => written.push(fragment),
        now: () => clock,
        grid: () => grid,
      });

      writer.schedule();
      expect(written[0]).toContain('&g=1');

      grid = false;
      clock += FRAGMENT_THROTTLE_MS;
      writer.schedule();
      expect(written).toHaveLength(2);
      expect(written[1]).toContain('&g=0');
      writer.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
