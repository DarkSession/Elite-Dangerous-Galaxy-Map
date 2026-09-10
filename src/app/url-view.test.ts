import { describe, expect, test, vi } from 'vitest';
import { createDefaultView, MIN_DISTANCE } from '../camera/view';
import {
  createFragmentWriter,
  formatViewFragment,
  FRAGMENT_THROTTLE_MS,
  parseViewFragment,
} from './url-view';

describe('the URL fragment', () => {
  test('reads a full fragment', () => {
    const view = parseViewFragment('#c=-9530,-910,19808&d=8000&p=50&y=120');
    expect(view.cursor).toEqual([-9530, -910, 19808]);
    expect(view.distance).toBe(8000);
    expect(view.pitch).toBe(50);
    expect(view.yaw).toBe(120);
  });

  test('gives the default view without a fragment', () => {
    expect(parseViewFragment('')).toEqual(createDefaultView());
    expect(parseViewFragment('#')).toEqual(createDefaultView());
  });

  test('applies the limits to a fragment that is out of range', () => {
    const view = parseViewFragment('#c=600000,0,0&d=1&p=200&y=-30');
    expect(view.distance).toBe(MIN_DISTANCE);
    expect(view.pitch).toBe(89);
    expect(view.yaw).toBe(330);
  });

  test('reads a fragment written before the zoom limit moved', () => {
    const view = parseViewFragment('#c=0,0,0&d=2000&p=35&y=0');
    expect(view.distance).toBe(2000);
    expect(view.cursor).toEqual([0, 0, 0]);
    expect(view.pitch).toBe(35);
    expect(view.yaw).toBe(0);
  });

  test('writes the fragment the parser reads', () => {
    const view = createDefaultView();
    view.distance = 30000;
    expect(formatViewFragment(view)).toBe('c=0,0,0&d=30000&p=35&y=0');
    expect(parseViewFragment(`#${formatViewFragment(view)}`)).toEqual(view);
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
