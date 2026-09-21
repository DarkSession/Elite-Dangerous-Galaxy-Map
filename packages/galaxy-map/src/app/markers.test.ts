import { describe, expect, test } from 'vitest';
import { DEFAULT_MAX_DRAW_RANGE_LY } from '../scene-data/real-systems';
import type { RealSystem, RealSystemSet } from '../scene-data/real-systems';
import type { View } from '../camera/view';
import {
  createMarkerOverlay,
  createNearestKeep,
  labelTopCss,
  MARKER_KEEP,
  MIN_RING_CSS,
  offerNearest,
  PIN_HEIGHT_CSS,
  pinTopCss,
  resetNearest,
  ringCssSize,
} from './markers';

describe('the nearest markers the keeper holds', () => {
  test('keep the smallest ranges of 10,000, in order', () => {
    const keep = createNearestKeep(MARKER_KEEP);
    // A repeatable pseudo-random sequence, so a failure is the same on every run.
    let seed = 12345;
    const ranges: number[] = [];
    for (let index = 0; index < 10000; index += 1) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const range = seed / 2147483648;
      ranges.push(range);
      offerNearest(keep, index, range);
    }

    const wanted = [...ranges]
      .sort((first, second) => first - second)
      .slice(0, MARKER_KEEP);
    const kept = Array.from(keep.ranges.subarray(0, keep.count));
    expect(keep.count).toBe(MARKER_KEEP);
    expect(kept).toEqual(wanted);
    for (let slot = 0; slot < keep.count; slot += 1) {
      expect(ranges[keep.indices[slot] as number]).toBe(keep.ranges[slot]);
    }
  });

  test('hold fewer than the limit when fewer are offered', () => {
    const keep = createNearestKeep(MARKER_KEEP);
    offerNearest(keep, 7, 30);
    offerNearest(keep, 3, 10);
    offerNearest(keep, 5, 20);

    expect(keep.count).toBe(3);
    expect(Array.from(keep.indices.subarray(0, 3))).toEqual([3, 5, 7]);
  });

  test('refuse a candidate no nearer than the worst kept one', () => {
    const keep = createNearestKeep(2);
    offerNearest(keep, 0, 1);
    offerNearest(keep, 1, 2);
    offerNearest(keep, 2, 3);

    expect(Array.from(keep.indices.subarray(0, 2))).toEqual([0, 1]);
  });

  test('start again on a reset', () => {
    const keep = createNearestKeep(2);
    offerNearest(keep, 0, 1);
    resetNearest(keep);

    expect(keep.count).toBe(0);
  });
});

describe('the mark placement', () => {
  test('puts a name label half a marker and 6 pixels below its centre', () => {
    expect(labelTopCss(300, 7)).toBe(300 + 3.5 + 6);
    expect(labelTopCss(300, 12)).toBe(300 + 6 + 6);
  });

  test('puts the tip of the pin half a marker and 2 pixels above its centre', () => {
    expect(pinTopCss(300, 7) + PIN_HEIGHT_CSS).toBe(300 - 3.5 - 2);
    expect(pinTopCss(300, 12) + PIN_HEIGHT_CSS).toBe(300 - 6 - 2);
  });

  test('takes the ring to 3.2 times the marker, with a floor of 24', () => {
    expect(ringCssSize(7)).toBe(MIN_RING_CSS);
    expect(ringCssSize(10)).toBe(32);
    expect(ringCssSize(12)).toBeCloseTo(38.4, 9);
  });
});

// The unit run has no DOM, so the placement is read over a fake document. It answers
// what the overlay writes: the style, the attributes and the parent of each element.
// The browser suite reads the real elements.

/** One element of the fake document. */
interface FakeNode {
  readonly tag: string;
  className: string;
  alt?: string;
  textContent: string | null;
  readonly style: Record<string, string>;
  parentNode: FakeNode | null;
  readonly children: FakeNode[];
  readonly attributes: Map<string, string>;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  append(...nodes: FakeNode[]): void;
  remove(): void;
}

/** Builds one element of the fake document. */
function makeNode(tag: string): FakeNode {
  const node: FakeNode = {
    tag,
    className: '',
    textContent: null,
    style: {},
    parentNode: null,
    children: [],
    attributes: new Map<string, string>(),
    setAttribute(name: string, value: string): void {
      node.attributes.set(name, value);
    },
    getAttribute(name: string): string | null {
      return node.attributes.get(name) ?? null;
    },
    append(...nodes: FakeNode[]): void {
      for (const child of nodes) {
        child.parentNode = node;
        node.children.push(child);
      }
    },
    remove(): void {
      const parent = node.parentNode;
      if (parent === null) return;
      const at = parent.children.indexOf(node);
      if (at >= 0) parent.children.splice(at, 1);
      node.parentNode = null;
    },
  };
  return node;
}

/** A host element in a fake document, with a count of the elements it made. */
function fakeHost(): { host: HTMLElement; node: FakeNode; made: () => number } {
  let made = 0;
  const document = {
    createElement: (tag: string): FakeNode => {
      made += 1;
      return makeNode(tag);
    },
    createElementNS: (_namespace: string, tag: string): FakeNode => makeNode(tag),
  };
  const node = makeNode('div') as FakeNode & { ownerDocument: unknown };
  node.ownerDocument = document;
  return {
    host: node as unknown as HTMLElement,
    node,
    made: () => made,
  };
}

/** One system of a fake set, at a position. */
function fakeSystem(
  name: string,
  position: readonly [number, number, number],
): RealSystem {
  return { name, position, categories: ['A'] };
}

/** A set of the systems given, with every marker drawing. */
function fakeSet(systems: readonly RealSystem[]): RealSystemSet {
  const positions = new Float64Array(systems.length * 3);
  for (let index = 0; index < systems.length; index += 1) {
    positions.set(systems[index]?.position ?? [0, 0, 0], index * 3);
  }
  const set = {
    count: systems.length,
    iconSystemCount: 0,
    positions,
    markerFlags: new Uint8Array(systems.length).fill(1),
    categoryIndices: new Uint16Array(systems.length),
    drawRanges: new Float32Array(systems.length).fill(DEFAULT_MAX_DRAW_RANGE_LY),
    category: () => null,
    system: (index: number): RealSystem | null => systems[index] ?? null,
  };
  return set as unknown as RealSystemSet;
}

/** The view and the viewport every placement test draws through. */
const VIEW: View = { cursor: [0, 0, 0], distance: 100, yaw: 0, pitch: 0 };
const VIEWPORT = { width: 800, height: 600 };

/** The name label of a system the host holds, or undefined where none is placed. */
function labelOf(node: FakeNode, name: string): FakeNode | undefined {
  return node.children.find(
    (child) => child.className === 'gm-system-label' && child.textContent === name,
  );
}

// The occlusion rule. `Sol` sits at the cursor, 100 light years from the camera, and its
// marker draws at the middle of the viewport with its label 12 to 26 pixels below that.
// `Beta` sits 50 light years from the camera, and the y below puts its marker at 318 on
// the screen, which is inside that box. The far position below puts it well under it.

/** The system the label rule hides, and the one that hides it. */
const FAR: readonly [number, number, number] = [0, 0, 0];
const OVER: readonly [number, number, number] = [0, -1.75, -50];
const ASIDE: readonly [number, number, number] = [0, -20, -50];

/** Draws one frame of the two systems, with the nearer one at the position given. */
function twoSystems(
  overlay: ReturnType<typeof createMarkerOverlay>,
  near: readonly [number, number, number],
  frame: Partial<{ hoverIndex: number; selectedIndex: number }> = {},
): void {
  overlay.update({
    view: VIEW,
    viewport: VIEWPORT,
    set: fakeSet([fakeSystem('Sol', FAR), fakeSystem('Beta', near)]),
    hoverIndex: frame.hoverIndex ?? -1,
    selectedIndex: frame.selectedIndex ?? -1,
    namesOn: true,
  });
}

describe('the name label occlusion rule', () => {
  test('hides a label a nearer marker draws inside, and shows the nearer label', () => {
    const { host, node } = fakeHost();
    const overlay = createMarkerOverlay(host);

    twoSystems(overlay, OVER);

    expect(labelOf(node, 'Sol')?.style['visibility']).toBe('hidden');
    expect(labelOf(node, 'Beta')?.style['visibility']).toBe('');
  });

  test('counts a hidden label and keeps it in its place and its pool slot', () => {
    const { host, node, made } = fakeHost();
    const overlay = createMarkerOverlay(host);

    twoSystems(overlay, ASIDE);
    const shown = overlay.labelCount();
    const place = labelOf(node, 'Sol')?.style['top'];
    const elements = made();

    twoSystems(overlay, OVER);

    // The count and the place read the same with a covering marker and without one.
    expect(overlay.labelCount()).toBe(shown);
    expect(overlay.labelCount()).toBe(2);
    expect(labelOf(node, 'Sol')?.style['top']).toBe(place);
    expect(made()).toBe(elements);

    // The frame that takes the cover away shows the label again.
    twoSystems(overlay, ASIDE);
    expect(labelOf(node, 'Sol')?.style['visibility']).toBe('');
  });

  test('never hides the hovered label or the selected label', () => {
    const { host, node } = fakeHost();
    const overlay = createMarkerOverlay(host);

    twoSystems(overlay, OVER, { hoverIndex: 0 });
    expect(labelOf(node, 'Sol')?.style['visibility']).toBe('');

    twoSystems(overlay, OVER, { selectedIndex: 0 });
    expect(labelOf(node, 'Sol')?.style['visibility']).toBe('');
  });
});
