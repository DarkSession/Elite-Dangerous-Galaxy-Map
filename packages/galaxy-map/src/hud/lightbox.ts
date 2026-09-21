// The lightbox: one image over the whole map, with its caption and the system's name.
import {
  focusOn,
  make,
  makeButton,
  setAttribute,
  setShown,
  setStyle,
  setText,
} from './dom';

/** The drawn size of the picture, in CSS pixels. */
export interface LightboxSize {
  readonly width: number;
  readonly height: number;
}

/**
 * The size the box draws the picture at. Two caps apply and the lesser wins.
 *
 * The **room cap** is the share of the lightbox element the frame may take: 86 percent
 * of its width, capped at 1180, and 82 percent of its height. The **pixel cap** is the
 * picture's own pixels times the device pixel ratio. A 400 by 300 picture therefore draws
 * at 400 by 300 CSS pixels on a 1x screen and at 800 by 600 on a 2x one, which is the same
 * picture at the same size on the glass.
 *
 * The three are read as one scale on the natural size, so the picture keeps its aspect
 * ratio under either cap.
 *
 * A natural size of 0 is a picture with no size to draw to, and the caller leaves the
 * frame at its smallest size.
 */
export function lightboxSize(
  roomWidth: number,
  roomHeight: number,
  naturalWidth: number,
  naturalHeight: number,
  ratio: number,
): LightboxSize | null {
  if (naturalWidth <= 0 || naturalHeight <= 0) return null;
  const roomW = Math.min(roomWidth * 0.86, 1180);
  const roomH = roomHeight * 0.82;
  const scale = Math.min(roomW / naturalWidth, roomH / naturalHeight, ratio);
  return { width: naturalWidth * scale, height: naturalHeight * scale };
}

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
    applySize();
  });

  /**
   * Writes the drawn size on the picture. CSS cannot state "the natural size times the
   * device pixel ratio, held inside the room", so the size is computed here and carried
   * by one inline pair. A picture with no natural size yet takes no pair at all, and the
   * frame holds its smallest size.
   */
  function applySize(): void {
    const size = lightboxSize(
      element.clientWidth,
      element.clientHeight,
      image.naturalWidth,
      image.naturalHeight,
      doc.defaultView?.devicePixelRatio ?? 1,
    );
    setStyle(image, 'width', size === null ? '' : `${size.width}px`);
    setStyle(image, 'height', size === null ? '' : `${size.height}px`);
  }

  // A resize is the one event a monitor change, a browser zoom and a window resize all
  // raise, so it covers both a change in the device pixel ratio and a change in the
  // room. The listener runs only while the box is open.
  const onResize = (): void => {
    applySize();
  };
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
    doc.defaultView?.removeEventListener('resize', onResize);
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
      // The size of the picture before this one must not hold this one. A new `src`
      // leaves the natural size at 0, so this writes no size at all and the `load` that
      // follows writes the true one; a picture the box already shows raises no `load`,
      // and has its natural size here, so this is the one call that sizes it.
      //
      // It runs after the box is shown, because a hidden element reads a room of 0 by 0
      // and the size would come out at 0 by 0 with it.
      applySize();
      doc.defaultView?.addEventListener('resize', onResize);
      close.focus();
    },
    close: closeBox,
    isOpen(): boolean {
      return !element.hidden;
    },
  };
}
