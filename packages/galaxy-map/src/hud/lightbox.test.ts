// The size the lightbox writes on the picture, and when it writes it. The box is read
// over a fake document, because the unit run has no DOM, in the manner of
// `options-panel.test.ts`. The browser suite reads the drawn size on the screen.
import { describe, expect, test } from 'vitest';
import { createLightbox, lightboxSize } from './lightbox';

describe('lightboxSize', () => {
  test('draws a small picture at its own pixels', () => {
    expect(lightboxSize(1920, 1080, 400, 300, 1)).toEqual({ width: 400, height: 300 });
  });

  test('follows the device pixel ratio', () => {
    expect(lightboxSize(1920, 1080, 400, 300, 2)).toEqual({ width: 800, height: 600 });
  });

  test('keeps a large picture inside the room', () => {
    expect(lightboxSize(1280, 720, 4000, 3000, 1)).toEqual({
      width: 787.2,
      height: 590.4,
    });
  });

  test('caps the width at 1180 in a wide box', () => {
    expect(lightboxSize(3000, 2000, 4000, 3000, 1)?.width).toBe(1180);
  });

  test('gives no size for a picture with no size', () => {
    expect(lightboxSize(1280, 720, 0, 0, 2)).toBeNull();
  });
});

/** One element of the fake document. */
interface FakeElement {
  readonly tag: string;
  className: string;
  hidden: boolean;
  isConnected: boolean;
  naturalWidth: number;
  naturalHeight: number;
  clientWidth: number;
  clientHeight: number;
  readonly children: FakeElement[];
  readonly attributes: Map<string, string>;
  readonly listeners: Map<string, (() => void)[]>;
  readonly properties: Map<string, string>;
  readonly style: {
    setProperty(n: string, v: string): void;
    getPropertyValue(n: string): string;
  };
  fire(name: string): void;
}

/** The window the fake document carries, which holds the resize listeners. */
interface FakeView {
  devicePixelRatio: number;
  readonly resize: (() => void)[];
}

function fakeElement(tag: string): FakeElement {
  const element: FakeElement = {
    tag,
    className: '',
    hidden: false,
    isConnected: false,
    naturalWidth: 0,
    naturalHeight: 0,
    clientWidth: 0,
    clientHeight: 0,
    children: [],
    attributes: new Map<string, string>(),
    listeners: new Map<string, (() => void)[]>(),
    properties: new Map<string, string>(),
    style: {
      setProperty(name: string, value: string): void {
        element.properties.set(name, value);
      },
      getPropertyValue(name: string): string {
        return element.properties.get(name) ?? '';
      },
    },
    fire(name: string): void {
      for (const listener of element.listeners.get(name) ?? []) listener();
    },
  };
  const extra = {
    textContent: null as string | null,
    type: '',
    alt: '',
    referrerPolicy: '',
    complete: false,
    parentElement: null,
    dataset: {} as Record<string, string>,
    setAttribute(name: string, value: string): void {
      element.attributes.set(name, value);
      // A new source leaves the browser with no natural size until the load arrives.
      if (name === 'src') {
        element.naturalWidth = 0;
        element.naturalHeight = 0;
      }
    },
    getAttribute(name: string): string | null {
      return element.attributes.get(name) ?? null;
    },
    hasAttribute(name: string): boolean {
      return element.attributes.has(name);
    },
    addEventListener(name: string, listener: () => void): void {
      const held = element.listeners.get(name) ?? [];
      held.push(listener);
      element.listeners.set(name, held);
    },
    appendChild(child: FakeElement): FakeElement {
      element.children.push(child);
      return child;
    },
    append(...nodes: FakeElement[]): void {
      element.children.push(...nodes);
    },
    focus(): void {},
  };
  return Object.assign(element, extra);
}

/** A document that makes fake elements, with a window that holds the resize listeners. */
function fakeDocument(view: FakeView): Document {
  return {
    createElement: fakeElement,
    defaultView: {
      get devicePixelRatio(): number {
        return view.devicePixelRatio;
      },
      addEventListener(name: string, listener: () => void): void {
        if (name === 'resize') view.resize.push(listener);
      },
      removeEventListener(name: string, listener: () => void): void {
        if (name !== 'resize') return;
        const at = view.resize.indexOf(listener);
        if (at >= 0) view.resize.splice(at, 1);
      },
    },
  } as unknown as Document;
}

/** A box in a lightbox element of a stated size, with its picture and its window. */
function box(
  ratio = 1,
  width = 1280,
  height = 720,
): {
  lightbox: ReturnType<typeof createLightbox>;
  image: FakeElement;
  view: FakeView;
} {
  const view: FakeView = { devicePixelRatio: ratio, resize: [] };
  const lightbox = createLightbox(fakeDocument(view));
  const element = lightbox.element as unknown as FakeElement;
  element.clientWidth = width;
  element.clientHeight = height;
  const frame = element.children[0] as FakeElement;
  const image = frame.children.find((child) => child.tag === 'img') as FakeElement;
  return { lightbox, image, view };
}

/** The size the picture carries, as numbers of CSS pixels. */
function caps(image: FakeElement): [string, string] {
  return [
    image.style.getPropertyValue('width'),
    image.style.getPropertyValue('height'),
  ];
}

/** Opens the box on a picture and reports the load with a natural size. */
function show(
  held: ReturnType<typeof box>,
  url: string,
  width: number,
  height: number,
): void {
  held.lightbox.open(url, 'A caption', 'Sol', held.image as unknown as HTMLElement);
  held.image.naturalWidth = width;
  held.image.naturalHeight = height;
  held.image.fire('load');
}

describe('the lightbox sizes the picture', () => {
  test('writes the picture-s own pixels at a ratio of 1', () => {
    const held = box(1);
    show(held, 'a.png', 400, 300);
    expect(caps(held.image)).toEqual(['400px', '300px']);
  });

  test('writes twice the pixels at a ratio of 2', () => {
    const held = box(2, 1920, 1080);
    show(held, 'a.png', 400, 300);
    expect(caps(held.image)).toEqual(['800px', '600px']);
  });

  test('holds a large picture to the room', () => {
    const held = box(1);
    show(held, 'big.png', 4000, 3000);
    expect(caps(held.image)).toEqual(['787.2px', '590.4px']);
  });

  test('adds the resize listener on open and removes it on close', () => {
    const held = box(1, 1920, 1080);
    expect(held.view.resize).toHaveLength(0);
    show(held, 'a.png', 400, 300);
    expect(held.view.resize).toHaveLength(1);
    held.view.devicePixelRatio = 2;
    for (const listener of held.view.resize) listener();
    expect(caps(held.image)).toEqual(['800px', '600px']);
    held.lightbox.close();
    expect(held.view.resize).toHaveLength(0);
  });

  test('does not hold a new picture to the size of the one before it', () => {
    const held = box(1);
    show(held, 'small.png', 400, 300);
    expect(caps(held.image)).toEqual(['400px', '300px']);
    show(held, 'big.png', 4000, 3000);
    expect(caps(held.image)).toEqual(['787.2px', '590.4px']);
  });
});
