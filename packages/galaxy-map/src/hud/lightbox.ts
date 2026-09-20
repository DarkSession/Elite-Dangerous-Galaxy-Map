// The lightbox: one image over the whole map, with its caption and the system's name.
import { focusOn, make, makeButton, setAttribute, setShown, setText } from './dom';

/** The image lightbox of the HUD. */
export interface Lightbox {
  readonly element: HTMLElement;
  /** Opens the box on an image and remembers what to give the focus back to. */
  open(url: string, caption: string, systemName: string, opener: HTMLElement): void;
  /** Closes the box and gives the focus back. */
  close(): void;
  /** True while the box is open. */
  isOpen(): boolean;
}

/** Builds the lightbox. It starts hidden. */
export function createLightbox(doc: Document): Lightbox {
  const element = make(doc, 'div', 'gm-hud__lightbox');
  element.hidden = true;

  const frame = make(doc, 'div', 'gm-hud__lightbox-frame');
  const placeholder = make(doc, 'div', 'gm-hud__lightbox-placeholder');
  const image = make(doc, 'img', 'gm-hud__lightbox-image');
  image.referrerPolicy = 'no-referrer';
  image.alt = '';
  // A picture that does not load leaves the frame's own pattern and the caption in
  // view, and no broken image icon.
  image.addEventListener('error', () => {
    image.hidden = true;
    setShown(placeholder, true);
  });
  // The placeholder holds the caption in the middle of the frame, and the picture fits
  // inside the frame rather than covering it. A caption left in place therefore reads
  // through the bars each side of the picture and through its transparent parts, so the
  // caption goes as soon as the picture is there. The footer still carries it.
  image.addEventListener('load', () => {
    setShown(placeholder, false);
  });
  const close = makeButton(doc, 'gm-hud__lightbox-close');
  close.textContent = 'CLOSE ✕';
  const footer = make(doc, 'div', 'gm-hud__lightbox-footer');
  const systemText = make(doc, 'span', 'gm-hud__lightbox-system');
  const captionText = make(doc, 'span', 'gm-hud__lightbox-caption');
  footer.append(systemText, captionText);
  frame.append(placeholder, image, close, footer);
  element.appendChild(frame);

  let opener: HTMLElement | null = null;

  /**
   * The elements that may take the focus back, in order. The first is the thumbnail the
   * box was opened from. A rebuild of the information panel replaces the thumbnails, so
   * the next is the new thumbnail of the same picture, and then every control of the
   * panel. A rebuild can also hide the panel, which is what a cleared selection does, so
   * none of them is certain to be there.
   */
  function* candidates(from: HTMLElement | null): Generator<HTMLElement> {
    if (from !== null) yield from;
    const root = element.parentElement;
    if (root === null) return;
    const url = from?.dataset['url'];
    if (url !== undefined) {
      for (const thumb of root.querySelectorAll('.gm-hud__thumb')) {
        if (thumb instanceof HTMLElement && thumb.dataset['url'] === url) yield thumb;
      }
    }
    for (const control of root.querySelectorAll('.gm-hud__info button')) {
      if (control instanceof HTMLElement) yield control;
    }
  }

  const closeBox = (): void => {
    if (element.hidden) return;
    setShown(element, false);
    const from = opener;
    opener = null;
    for (const candidate of candidates(from)) {
      if (focusOn(candidate)) return;
    }
    // Nothing in the panels can take the focus. The HUD root takes it instead, so the
    // next tab step starts at the HUD and not at the top of the page. A `tabindex` of -1
    // is focusable by script and stays out of the tab ring.
    const root = element.parentElement;
    if (root === null) return;
    if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
    root.focus();
  };

  // A click anywhere in the box closes it, which the close button and the picture share.
  element.addEventListener('click', closeBox);
  // The box holds the focus while it is open, so a keyboard user does not tab into the
  // panels behind it.
  element.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    close.focus();
  });

  return {
    element,
    open(url: string, caption: string, systemName: string, from: HTMLElement): void {
      opener = from;
      // A picture the box already shows keeps its `src`, and an unchanged `src` raises no
      // new `load`, so the element itself says whether the caption must show. A new `src`
      // always raises `load` or `error`, a picture from the cache as well, so the caption
      // shows until one of them arrives.
      const samePicture = image.getAttribute('src') === url;
      image.hidden = false;
      setAttribute(image, 'src', url);
      setText(placeholder, caption);
      setShown(placeholder, !(samePicture && image.complete && image.naturalWidth > 0));
      setText(captionText, caption);
      setText(systemText, systemName);
      setShown(element, true);
      close.focus();
    },
    close: closeBox,
    isOpen(): boolean {
      return !element.hidden;
    },
  };
}
