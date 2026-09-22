// Element helpers the HUD panels share. Every writer compares before it writes, because
// the HUD's budget is measured as the count of DOM changes in a still frame, and a write
// of the value an element already holds is a change the browser records.

/** Makes an element with a class. */
export function make<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag);
  element.className = className;
  return element;
}

/**
 * Makes the `svg` element of one HUD icon, with the attributes every icon shares: the
 * view box, a square size in CSS pixels, no fill, a stroke in the text colour, and
 * `aria-hidden`, because the control that holds the icon states the same thing in words.
 * The caller adds the class, the stroke width and the shapes.
 */
export function makeSvg(doc: Document, viewBox: string, size: number): SVGSVGElement {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}

/** Makes a button with a class. The style sheet resets the browser's own look. */
export function makeButton(doc: Document, className: string): HTMLButtonElement {
  const button = make(doc, 'button', className);
  button.type = 'button';
  return button;
}

/** Writes text only when it differs. */
export function setText(element: HTMLElement, text: string): void {
  if (element.textContent === text) return;
  element.textContent = text;
}

/** Writes an attribute only when it differs. */
export function setAttribute(element: Element, name: string, value: string): void {
  if (element.getAttribute(name) === value) return;
  element.setAttribute(name, value);
}

/** Writes `aria-pressed` only when it differs. */
export function setPressed(element: Element, pressed: boolean): void {
  setAttribute(element, 'aria-pressed', pressed ? 'true' : 'false');
}

/** Shows or hides an element, writing only on a change. */
export function setShown(element: HTMLElement, shown: boolean): void {
  if (element.hidden === !shown) return;
  element.hidden = !shown;
}

// The style writer is the one the overlays use. It keeps the value it last wrote and
// reads no style back, which `src/app/set-style.ts` states.
export { setStyle } from '../app/set-style';

// The number formats, made once. Chrome builds a new format for each call of
// `toLocaleString`, which costs 29 times the call of a format it keeps, and the top bar
// and the information panel format a readout on each tick.
const WHOLE_FORMAT = new Intl.NumberFormat('en-US');
const COORDINATE_FORMAT = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 5,
  useGrouping: true,
});
const PLAIN_COORDINATE_FORMAT = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 5,
  useGrouping: false,
});

/** A whole number with a thousands separator, for example `1,500`. */
export function formatWhole(value: number): string {
  return WHOLE_FORMAT.format(Math.round(value));
}

/**
 * One game coordinate, to at most 5 decimal places. The trailing zeros and the trailing
 * point go, so a whole coordinate shows no decimal point. With `separators` the whole
 * part takes thousands separators, for example `-9,530.9375`; without them the value
 * reads as a plain number, which is the form the copy button writes.
 *
 * The game resolves a position to 1/32 of a light year, which is 0.03125. Five decimal
 * places reproduce every such value exactly, because 1/32 is 5 places in base ten and
 * every multiple of it is 5 places or fewer. The field was 3 places, which separated
 * every game position but showed none of the odd steps as the game holds it:
 * `-9530.9375` read `-9,530.938`.
 */
export function formatCoordinate(value: number, separators: boolean): string {
  return (separators ? COORDINATE_FORMAT : PLAIN_COORDINATE_FORMAT).format(value);
}

/** A distance in whole light years with the unit, for example `1,500 LY`. */
export function formatLightYears(value: number): string {
  return `${formatWhole(value)} LY`;
}

/** A colour of three bytes as a CSS `rgb` value. */
export function cssColor(color: readonly [number, number, number]): string {
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}

/** A colour of three bytes as a CSS `rgba` value. */
export function cssColorAlpha(
  color: readonly [number, number, number],
  alpha: number,
): string {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

/**
 * Focuses an element and says whether the focus went to it. An element the document no
 * longer holds, and an element inside a hidden panel, take no focus, so a caller that
 * must move the focus reads the answer and tries the next candidate.
 */
export function focusOn(target: HTMLElement): boolean {
  if (!target.isConnected) return false;
  target.focus();
  return target.ownerDocument.activeElement === target;
}

/**
 * The data attributes that identify a control, in the order they are read. A thumbnail
 * carries `url`, a system row carries `identity`, and a category row, an expand button,
 * a segment and a toggle carry `name`.
 */
const IDENTITY_KEYS = ['url', 'identity', 'name'] as const;

/** What a rebuild matches a replaced control by. */
export interface FocusMark {
  readonly className: string;
  readonly key: string;
  readonly value: string;
}

/**
 * Reads what identifies the control the keyboard focus is on, or null when the focus is
 * outside `parent` or the control carries no identity. A caller that replaces the
 * children more than once holds the mark across every replace and restores it at the
 * end, because the focus is on the page body from the first replace on.
 */
export function focusMark(parent: HTMLElement): FocusMark | null {
  const active = parent.ownerDocument.activeElement;
  if (!(active instanceof HTMLElement) || !parent.contains(active)) return null;
  for (const key of IDENTITY_KEYS) {
    const value = active.dataset[key];
    if (value !== undefined) return { className: active.className, key, value };
  }
  return null;
}

/**
 * Puts the focus on the new control of the same class and the same identity. With no
 * such control, and with no mark, the focus stays where the browser put it.
 */
export function restoreFocus(parent: HTMLElement, mark: FocusMark | null): void {
  if (mark === null) return;
  for (const node of parent.querySelectorAll('*')) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.className !== mark.className) continue;
    if (node.dataset[mark.key] !== mark.value) continue;
    if (focusOn(node)) return;
  }
}

/**
 * Replaces the children of one part of the HUD and keeps the keyboard focus. A rebuild
 * makes new elements, so the control the user is on leaves the document and the focus
 * falls to the page body. This is the one-replace case: a caller that replaces more than
 * once reads the mark itself and restores it after the last replace.
 */
export function replaceChildrenKeepingFocus(
  parent: HTMLElement,
  children: readonly Node[],
): void {
  const mark = focusMark(parent);
  parent.replaceChildren(...children);
  restoreFocus(parent, mark);
}
