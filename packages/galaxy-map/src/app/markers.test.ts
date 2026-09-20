import { describe, expect, test } from 'vitest';
import type { ResolvedIcon } from '../scene-data/marker-icons';
import { markerCssSize } from '../scene-data/marker-size';
import type { RealSystem, RealSystemSet } from '../scene-data/real-systems';
import type { View } from '../camera/view';
import {
  ARROW_HEIGHT_CSS,
  ARROW_WIDTH_CSS,
  arrowApexCss,
  createMarkerOverlay,
  createNearestKeep,
  ICON_CSS_SIZE,
  ICON_GAP_CSS,
  iconZIndex,
  MAX_ICON_STACKS,
  STACK_LAYER_Z,
  iconBottomCss,
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

describe('the icon stack geometry', () => {
  test('puts the apex of the arrow where the tip of the pin sits', () => {
    expect(arrowApexCss(300, 7, false)).toBe(300 - 3.5 - 2);
    expect(arrowApexCss(300, 12, false)).toBe(300 - 6 - 2);
  });

  test('puts the lowest icon on the arrow and each one 30 pixels over the last', () => {
    expect(iconBottomCss(300, 7, 0, false)).toBe(300 - 3.5 - 7);
    expect(iconBottomCss(300, 7, 1, false)).toBe(300 - 3.5 - 7 - 30);
    expect(iconBottomCss(300, 12, 3, false)).toBe(300 - 6 - 7 - 90);
    expect(ICON_CSS_SIZE + ICON_GAP_CSS).toBe(30);
  });

  test('holds every stack level under the layer, and the layer under the HUD', () => {
    // The HUD root sits at 10 in the same parent as the overlay host.
    expect(STACK_LAYER_Z).toBeLessThan(10);
    // Over the plane elements at 0 and over the ring, the pin and the labels at 1.
    expect(STACK_LAYER_Z).toBeGreaterThan(1);
  });

  test('gives the nearest stack the highest level, and every stack one over a plane', () => {
    expect(iconZIndex(0)).toBeGreaterThan(iconZIndex(1));
    expect(iconZIndex(1)).toBeGreaterThan(iconZIndex(MAX_ICON_STACKS - 1));
    expect(iconZIndex(MAX_ICON_STACKS - 1)).toBeGreaterThan(0);
    // A slot past the keeper's limit reads as the last one and never falls to a plane.
    expect(iconZIndex(MAX_ICON_STACKS + 5)).toBe(iconZIndex(MAX_ICON_STACKS - 1));
  });

  test('lifts the stack of the selected system by the height of the pin', () => {
    expect(arrowApexCss(300, 7, true)).toBe(
      arrowApexCss(300, 7, false) - PIN_HEIGHT_CSS,
    );
    expect(iconBottomCss(300, 12, 2, true)).toBe(
      iconBottomCss(300, 12, 2, false) - PIN_HEIGHT_CSS,
    );
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

/** How many positions and systems the overlay read of a set. */
interface SetReads {
  positions: number;
  systems: number;
}

/** One system of a fake set, at a position and with its icons. */
function fakeSystem(
  name: string,
  position: readonly [number, number, number],
  icons?: readonly ResolvedIcon[],
): RealSystem {
  const system: RealSystem = {
    name,
    position,
    categories: ['A'],
  };
  return icons === undefined ? system : { ...system, icons };
}

/**
 * A set of the systems given, with every marker drawing. The positions are behind a
 * proxy that counts each read, so a test reads what the overlay took of the set.
 */
function fakeSet(systems: readonly RealSystem[]): {
  set: RealSystemSet;
  reads: SetReads;
} {
  const reads: SetReads = { positions: 0, systems: 0 };
  const values = new Float64Array(systems.length * 3);
  for (let index = 0; index < systems.length; index += 1) {
    values.set(systems[index]?.position ?? [0, 0, 0], index * 3);
  }
  const positions = new Proxy(values, {
    get(target: Float64Array, key: string | symbol): unknown {
      if (typeof key === 'string' && /^\d+$/.test(key)) reads.positions += 1;
      return Reflect.get(target, key) as unknown;
    },
  });
  const set = {
    count: systems.length,
    iconSystemCount: systems.filter((one) => one.icons !== undefined).length,
    positions,
    markerFlags: new Uint8Array(systems.length).fill(1),
    categoryIndices: new Uint16Array(systems.length),
    category: () => null,
    system: (index: number): RealSystem | null => {
      reads.systems += 1;
      return systems[index] ?? null;
    },
  };
  return { set: set as unknown as RealSystemSet, reads };
}

/** The view and the viewport every placement test draws through. */
const VIEW: View = { cursor: [0, 0, 0], distance: 100, yaw: 0, pitch: 0 };
const VIEWPORT = { width: 800, height: 600 };

/** One icon of the catalogue's shape, without a read of the built vectors. */
function icon(url: string, color: readonly [number, number, number]): ResolvedIcon {
  return { url, color };
}

/** The elements of a tag the host holds. */
function heldOf(node: FakeNode, tag: string): FakeNode[] {
  return everyNodeOf(node).filter((child) => child.tag === tag);
}

/**
 * Every node under one, the node itself last. The icons and the arrows sit in the stack
 * layer and not straight in the host, so a reading of the host has to go down the tree.
 */
function everyNodeOf(node: FakeNode): FakeNode[] {
  return node.children.flatMap((child) => [...everyNodeOf(child), child]);
}

describe('the icon stack placement', () => {
  test('builds an icon of 28 pixels on a plate and an arrow of the stated border', () => {
    const { host, node } = fakeHost();
    const overlay = createMarkerOverlay(host);
    const { set } = fakeSet([
      fakeSystem('Sol', [0, 0, 0], [icon('/a.svg', [1, 2, 3])]),
    ]);

    overlay.update({
      view: VIEW,
      viewport: VIEWPORT,
      set,
      hoverIndex: -1,
      selectedIndex: -1,
      namesOn: false,
      iconsOn: true,
    });

    const image = heldOf(node, 'img')[0];
    expect(image?.className).toBe('gm-system-icon');
    expect(image?.alt).toBe('');
    expect(image?.getAttribute('src')).toBe('/a.svg');
    expect(image?.style['pointerEvents']).toBe('none');
    // The one stack of the frame is the nearest one, so it takes the highest level.
    expect(image?.style['zIndex']).toBe(`${iconZIndex(0)}`);
    // The icon goes in the stack layer, which is the stacking context that holds the
    // level in. The layer is a child of the host and the icon a child of the layer.
    const layer = node.children.find((child) => child.className === 'gm-system-stacks');
    expect(layer?.style['zIndex']).toBe(`${STACK_LAYER_Z}`);
    expect(layer?.children).toContain(image);
    expect(image?.style['width']).toBe('28px');
    expect(image?.style['height']).toBe('28px');
    expect(image?.style['backgroundColor']).toBe('#000');

    const arrow = everyNodeOf(node).find(
      (child) => child.className === 'gm-system-arrow',
    );
    expect(arrow?.style['width']).toBe('0');
    expect(arrow?.style['height']).toBe('0');
    expect(arrow?.style['borderStyle']).toBe('solid');
    expect(arrow?.style['borderTopWidth']).toBe(`${ARROW_HEIGHT_CSS}px`);
    expect(arrow?.style['borderLeftWidth']).toBe(`${ARROW_WIDTH_CSS / 2}px`);
    expect(arrow?.style['borderRightWidth']).toBe(`${ARROW_WIDTH_CSS / 2}px`);
    expect(arrow?.style['borderBottomWidth']).toBe('0');
    expect(arrow?.style['borderLeftColor']).toBe('transparent');
    expect(arrow?.style['borderRightColor']).toBe('transparent');
    expect(arrow?.style['borderTopColor']).toBe('rgb(1, 2, 3)');
    expect(arrow?.style['pointerEvents']).toBe('none');
  });

  test('places a stack with the name labels off', () => {
    const { host, node } = fakeHost();
    const overlay = createMarkerOverlay(host);
    const { set } = fakeSet([
      fakeSystem(
        'Sol',
        [0, 0, 0],
        [icon('/a.svg', [1, 2, 3]), icon('/b.svg', [4, 5, 6])],
      ),
    ]);

    overlay.update({
      view: VIEW,
      viewport: VIEWPORT,
      set,
      hoverIndex: -1,
      selectedIndex: -1,
      namesOn: false,
      iconsOn: true,
    });

    expect(overlay.labelCount()).toBe(0);
    expect(overlay.iconCount()).toBe(2);
    expect(overlay.arrowCount()).toBe(1);

    // The system sits at the cursor, so its marker draws at the middle of the viewport.
    const markerCss = markerCssSize(VIEW.distance);
    const images = heldOf(node, 'img');
    expect(images[0]?.style['left']).toBe(`${Math.round(400 - ICON_CSS_SIZE / 2)}px`);
    expect(images[0]?.style['top']).toBe(
      `${Math.round(iconBottomCss(300, markerCss, 0, false) - ICON_CSS_SIZE)}px`,
    );
    expect(images[1]?.style['top']).toBe(
      `${Math.round(iconBottomCss(300, markerCss, 1, false) - ICON_CSS_SIZE)}px`,
    );
    const arrow = everyNodeOf(node).find(
      (child) => child.className === 'gm-system-arrow',
    );
    expect(arrow?.style['left']).toBe(`${Math.round(400 - ARROW_WIDTH_CSS / 2)}px`);
    expect(arrow?.style['top']).toBe(
      `${Math.round(arrowApexCss(300, markerCss, false) - ARROW_HEIGHT_CSS)}px`,
    );
  });

  test('draws the arrow of a selected system in the lowest icon colour, lifted', () => {
    const { host, node } = fakeHost();
    const overlay = createMarkerOverlay(host);
    const { set } = fakeSet([
      fakeSystem(
        'Sol',
        [0, 0, 0],
        [icon('/a.svg', [255, 0, 0]), icon('/b.svg', [0, 0, 255])],
      ),
    ]);

    overlay.update({
      view: VIEW,
      viewport: VIEWPORT,
      set,
      hoverIndex: -1,
      selectedIndex: 0,
      namesOn: false,
      iconsOn: true,
    });

    const markerCss = markerCssSize(VIEW.distance);
    const arrow = everyNodeOf(node).find(
      (child) => child.className === 'gm-system-arrow',
    );
    expect(arrow?.style['borderTopColor']).toBe('rgb(255, 0, 0)');
    expect(arrow?.style['top']).toBe(
      `${Math.round(arrowApexCss(300, markerCss, true) - ARROW_HEIGHT_CSS)}px`,
    );
    expect(heldOf(node, 'img')[0]?.style['top']).toBe(
      `${Math.round(iconBottomCss(300, markerCss, 0, true) - ICON_CSS_SIZE)}px`,
    );
  });

  test('adds no element on a second frame', () => {
    const { host, made } = fakeHost();
    const overlay = createMarkerOverlay(host);
    const { set } = fakeSet([
      fakeSystem('Sol', [0, 0, 0], [icon('/a.svg', [1, 2, 3])]),
      fakeSystem('Alpha', [10, 0, 0], [icon('/b.svg', [4, 5, 6])]),
    ]);
    const frame = {
      view: VIEW,
      viewport: VIEWPORT,
      set,
      hoverIndex: -1,
      selectedIndex: -1,
      namesOn: false,
      iconsOn: true,
    };

    overlay.update(frame);
    const first = made();
    overlay.update(frame);

    expect(overlay.iconCount()).toBe(2);
    expect(overlay.arrowCount()).toBe(2);
    expect(made()).toBe(first);
  });

  test('places nothing while the switch is off, over the hover and the selection', () => {
    const { host, node } = fakeHost();
    const overlay = createMarkerOverlay(host);
    const { set } = fakeSet([
      fakeSystem('Sol', [0, 0, 0], [icon('/a.svg', [1, 2, 3])]),
    ]);
    const frame = {
      view: VIEW,
      viewport: VIEWPORT,
      set,
      hoverIndex: 0,
      selectedIndex: 0,
      namesOn: false,
      iconsOn: false,
    };

    overlay.update(frame);

    expect(overlay.iconCount()).toBe(0);
    expect(overlay.arrowCount()).toBe(0);
    expect(heldOf(node, 'img')).toHaveLength(0);
    expect(
      node.children.filter((child) => child.className === 'gm-system-arrow'),
    ).toHaveLength(0);
  });

  test('takes the stack away on the frame that no longer needs it', () => {
    const { host, node } = fakeHost();
    const overlay = createMarkerOverlay(host);
    const { set } = fakeSet([
      fakeSystem('Sol', [0, 0, 0], [icon('/a.svg', [1, 2, 3])]),
    ]);
    const frame = {
      view: VIEW,
      viewport: VIEWPORT,
      set,
      hoverIndex: -1,
      selectedIndex: -1,
      namesOn: false,
      iconsOn: true,
    };

    overlay.update(frame);
    overlay.update({ ...frame, iconsOn: false });

    expect(overlay.iconCount()).toBe(0);
    expect(overlay.arrowCount()).toBe(0);
    expect(heldOf(node, 'img')).toHaveLength(0);
  });
});

describe('the fast path of a set with no icon', () => {
  const systems: RealSystem[] = [];
  for (let index = 0; index < 200; index += 1) {
    systems.push(fakeSystem(`S${index}`, [index, 0, 0]));
  }

  test('reads no position and no system of the set', () => {
    const { host } = fakeHost();
    const overlay = createMarkerOverlay(host);
    const { set, reads } = fakeSet(systems);

    overlay.update({
      view: VIEW,
      viewport: VIEWPORT,
      set,
      hoverIndex: -1,
      selectedIndex: -1,
      namesOn: false,
      iconsOn: true,
    });

    expect(reads).toEqual({ positions: 0, systems: 0 });
    expect(overlay.iconCount()).toBe(0);
  });

  test('reads the set and draws the stack when one record holds an icon', () => {
    const { host } = fakeHost();
    const overlay = createMarkerOverlay(host);
    const withIcon = [...systems];
    withIcon[0] = fakeSystem('S0', [0, 0, 0], [icon('/a.svg', [1, 2, 3])]);
    const { set, reads } = fakeSet(withIcon);

    overlay.update({
      view: VIEW,
      viewport: VIEWPORT,
      set,
      hoverIndex: -1,
      selectedIndex: -1,
      namesOn: false,
      iconsOn: true,
    });

    expect(reads.positions).toBeGreaterThan(0);
    expect(reads.systems).toBeGreaterThan(0);
    expect(overlay.iconCount()).toBe(1);
    expect(overlay.arrowCount()).toBe(1);
  });
});
