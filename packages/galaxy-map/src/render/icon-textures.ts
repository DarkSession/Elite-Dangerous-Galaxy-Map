// Loads the icon vectors and holds them as the layers of one texture array.
//
// The icon pass draws every icon of a frame in one call, so every vector has to sit in
// one texture. A `TEXTURE_2D_ARRAY` gives that: one layer per distinct URL, and the
// instance carries the layer as an attribute.
//
// The vectors rasterise through an image element and a 2D canvas, and not through
// `createImageBitmap`: Firefox cannot decode an SVG that way, and Firefox carries a
// budget requirement of this suite. An image element draws an SVG at an explicit size in
// every browser the suite runs.
import { ICON_CSS_SIZE } from '../scene-data/icon-stack';

/** How many distinct icon vectors the array holds. */
export const MAX_ICON_LAYERS = 64;

/** The largest side of one layer, in device pixels. */
export const MAX_ICON_LAYER_SIDE = 128;

/** The layer a URL draws from is not ready, or the array has no room for it. */
export const NO_ICON_LAYER = -1;

/**
 * The side of one layer at a device pixel ratio, in device pixels.
 *
 * The quad draws at `28 * ratio` device pixels, so a layer of that side copies one texel
 * to one pixel and the glyph stays as crisp as the vector. The cap holds the storage at
 * 64 layers of 128 square and 4 bytes, which is 4.2 MB in the worst case and 1.8 MB at a
 * ratio of 3. A ratio above 4.57 draws from a 128 texel layer, slightly soft.
 */
export function iconLayerSide(pixelRatio: number): number {
  const wanted = Math.round(ICON_CSS_SIZE * Math.max(pixelRatio, 1));
  return Math.max(1, Math.min(MAX_ICON_LAYER_SIDE, wanted));
}

/** What one URL is doing. */
type IconState = 'pending' | 'ready' | 'failed';

/** One URL's layer and what it is doing. */
interface IconEntry {
  readonly layer: number;
  state: IconState;
}

/** The icon texture array. */
export interface IconTextures {
  /**
   * The layer a URL draws from, or `NO_ICON_LAYER` while it is not ready. The first call
   * for a URL starts its load; a later call adds no request.
   */
  layerOf(url: string): number;
  /** The texture array, or null before the first URL allocates it. */
  texture(): WebGLTexture | null;
  /** The side of one layer in device pixels, and 0 before the array is allocated. */
  side(): number;
  /** Matches the layers to a device pixel ratio, rasterising each ready one again. */
  setPixelRatio(ratio: number): void;
  dispose(): void;
}

/** What `createIconTextures` takes besides the context. */
export interface IconTextureOptions {
  /** The device pixel ratio the first layers rasterise at. The default is 1. */
  readonly pixelRatio?: number;
  /**
   * Draws the vector at a URL into a square image of the side given. The default loads
   * the URL as a cross-origin image and draws it into a 2D canvas. A unit run has no
   * document, so the tests pass their own.
   */
  readonly rasterise?: (url: string, side: number) => Promise<TexImageSource>;
  /**
   * Called once each time a vector lands in its layer. A vector is fetched after the
   * frame that named it drew, so the picture changes without a write of the view: the
   * map wakes its frame loop on this.
   */
  readonly onReady?: () => void;
}

/**
 * Draws one vector into a canvas of the side given.
 *
 * `crossOrigin` is `anonymous` on every image. A cross-origin image taints the canvas it
 * draws into. A texture upload from a tainted canvas throws `SecurityError`. Ask for it
 * on every image, always: without the attribute the browser caches the response with no
 * CORS headers. A later request with the attribute can read that same cache entry, and it
 * then fails again.
 */
async function rasteriseVector(url: string, side: number): Promise<TexImageSource> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('The browser gave no 2D context for an icon.');
  context.clearRect(0, 0, side, side);
  context.drawImage(image, 0, 0, side, side);
  return canvas;
}

/**
 * Creates the icon texture array. It allocates nothing until the first URL arrives, so a
 * map whose records name no icon pays no storage for the switch.
 */
export function createIconTextures(
  gl: WebGL2RenderingContext,
  options: IconTextureOptions = {},
): IconTextures {
  const rasterise = options.rasterise ?? rasteriseVector;
  const entries = new Map<string, IconEntry>();
  let pixelRatio = options.pixelRatio ?? 1;
  let side = 0;
  let texture: WebGLTexture | null = null;
  let disposed = false;
  // The cap is reported once and not once per URL. A host past 64 vectors reads the
  // rule from one message, and a full set of records cannot fill the console.
  let cappedWarned = false;

  /** Allocates the array at the side in force. The layers start empty. */
  const allocate = (): void => {
    side = iconLayerSide(pixelRatio);
    if (texture === null) texture = gl.createTexture();
    if (texture === null) throw new Error('The context gave no icon texture array.');
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
    gl.texImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      gl.RGBA8,
      side,
      side,
      MAX_ICON_LAYERS,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    // One texel to one pixel, so the glyph takes no second resampling. The texture holds
    // no mipmap. `NEAREST` for the minifying filter reads level 0 alone, and the texture
    // is therefore complete without one.
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
  };

  /**
   * Rasterises one URL and writes it into its layer. A refusal marks the URL failed and
   * warns once, and the loader never asks for it again while the map lives. Nothing here
   * throws out of the frame: the frame does not await this.
   */
  const load = (url: string, entry: IconEntry): void => {
    const asked = side;
    rasterise(url, asked)
      .then((source) => {
        // A dispose, or a ratio change that came in while this one loaded, makes the
        // answer stale. The ratio change starts its own load for every ready layer.
        if (disposed || texture === null || asked !== side) return;
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
        gl.texSubImage3D(
          gl.TEXTURE_2D_ARRAY,
          0,
          0,
          0,
          entry.layer,
          asked,
          asked,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          source,
        );
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
        entry.state = 'ready';
        options.onReady?.();
      })
      .catch((reason: unknown) => {
        // A stale answer, as above. A load the ratio change replaced must not mark the
        // URL failed: the load at the new side answers for it.
        if (disposed || asked !== side) return;
        entry.state = 'failed';
        console.warn(
          `The map cannot load the icon vector at ${url}. A vector on a second ` +
            'origin needs an Access-Control-Allow-Origin header.',
          reason,
        );
      });
  };

  return {
    layerOf(url: string): number {
      const held = entries.get(url);
      if (held !== undefined) {
        return held.state === 'ready' ? held.layer : NO_ICON_LAYER;
      }
      if (entries.size >= MAX_ICON_LAYERS) {
        if (!cappedWarned) {
          cappedWarned = true;
          console.warn(
            `The map holds ${MAX_ICON_LAYERS} distinct icon vectors and draws no ` +
              `more. It leaves out ${url}.`,
          );
        }
        return NO_ICON_LAYER;
      }
      // The first URL is what allocates the array, so a map that names no icon holds
      // no texture storage at all.
      if (texture === null) allocate();
      const entry: IconEntry = { layer: entries.size, state: 'pending' };
      entries.set(url, entry);
      load(url, entry);
      return NO_ICON_LAYER;
    },
    texture(): WebGLTexture | null {
      return texture;
    },
    side(): number {
      return side;
    },
    setPixelRatio(ratio: number): void {
      if (!Number.isFinite(ratio) || ratio <= 0) return;
      if (iconLayerSide(ratio) === side) {
        pixelRatio = ratio;
        return;
      }
      pixelRatio = ratio;
      if (texture === null) return;
      // The new side needs new storage, which clears every layer, so every URL that was
      // ready rasterises again at that side. A failed URL stays failed and is not asked
      // for a second time.
      allocate();
      for (const [url, entry] of entries) {
        if (entry.state === 'failed') continue;
        entry.state = 'pending';
        load(url, entry);
      }
    },
    dispose(): void {
      disposed = true;
      if (texture !== null) gl.deleteTexture(texture);
      texture = null;
      entries.clear();
    },
  };
}
