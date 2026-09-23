// The one style writer of the overlays and of the HUD.
//
// The module imports nothing, because the HUD imports it as a value. `plane-overlay.ts`
// imports the camera layer as a value, so a HUD import of that module would reach the
// camera through `src/app/`, and the lint reads direct imports alone.

/**
 * The value `setStyle` last wrote, for each element and each property. A `WeakMap` lets
 * an element the page no longer holds go.
 */
const written = new WeakMap<ElementCSSInlineStyle, Map<string, string>>();

/**
 * Writes one style property only when it differs from the value this function last wrote
 * to that property of that element.
 *
 * The overlays and the HUD rewrite every property of every element in each frame, and a
 * write of the value an element already carries is a DOM change the browser records. The
 * compare does not read the value back from the element. The browser gives a property
 * back in its own form, which is not always the string written: Chrome gives the `font`
 * shorthand, `box-shadow` and some `transform` and `opacity` values back in another form,
 * so a compare against the value read back never matched for them. The read cost time as
 * well, on each property of each frame.
 *
 * The kept value is the value of the element only while every write of that property on
 * that element passes through here. A direct write of the same property on the same
 * element makes this function skip a write it must make.
 */
export function setStyle(
  element: ElementCSSInlineStyle,
  name: string,
  value: string,
): void {
  let values = written.get(element);
  if (values === undefined) {
    values = new Map<string, string>();
    written.set(element, values);
  } else if (values.get(name) === value) {
    return;
  }
  values.set(name, value);
  element.style.setProperty(name, value);
}
