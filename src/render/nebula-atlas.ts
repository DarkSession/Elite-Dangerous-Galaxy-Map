// The nebula sprite atlas: its URL, its fetch and its texture upload.
//
// The atlas lives here and not in `buffers.ts`, because the main entry point reaches
// `buffers.ts` at load. Vite emits an asset from its transform hook, before tree shaking,
// so a build that merely reaches a module naming `nebula-art.webp` carries the file
// whatever the shaker decides about the code. Only `src/nebulae/` and the nebula pass
// reach this module, so a host that does not ask for the nebulae carries neither the
// art nor this code.
//
// `?url&no-inline` and not `?url`: the library build inlines every asset as a data URI
// by default, and the nebula atlas is a file the browser fetches when the map starts.
import nebulaAtlasUrl from './nebula-art.webp?url&no-inline';
import { NebulaError } from '../scene-data/nebulae';

/** How many tiles one row of the nebula atlas holds. The grid is square. */
export const NEBULA_ATLAS_COLUMNS = 6;

/**
 * What the atlas upload needs from the decoded file. The texel side is read from the
 * file and not stated here, so a pack at a different tile size is a drop-in.
 */
export type NebulaAtlasImage = TexImageSource & {
  readonly width: number;
  readonly height: number;
};

/** The 2D texture the nebula pass reads the sprite art from. */
export interface NebulaAtlasTexture {
  readonly texture: WebGLTexture;
  /** The side of the whole atlas, in texels, as the file carries it. */
  readonly side: number;
  /** The side of one tile, in texels: the atlas side over the column count. */
  readonly tileSide: number;
  dispose(): void;
}

/**
 * Fetches and decodes the committed nebula atlas.
 *
 * `premultiplyAlpha: 'none'` and `colorSpaceConversion: 'none'`: the art already holds
 * the emission and the absorption through the cloud, so the colour channels are the
 * accumulated radiance and are not a colour the browser may multiply by the alpha. The
 * upload names the colour space, so the browser must not convert one of its own.
 */
export async function loadNebulaAtlas(): Promise<ImageBitmap> {
  const response = await fetch(nebulaAtlasUrl);
  if (!response.ok) {
    throw new NebulaError(
      `The nebula atlas did not load: the server answered ${response.status}.`,
    );
  }
  return createImageBitmap(await response.blob(), {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
}

/**
 * Uploads the nebula atlas as an `SRGB8_ALPHA8` 2D texture.
 *
 * The format splits the two channels the way the data needs: the hardware decodes the
 * colour channels to linear on sample, and leaves the alpha channel linear. The colour
 * holds radiance and needs the curve's precision in the dark; the alpha holds opacity
 * and must not be bent.
 */
export function createNebulaAtlasTexture(
  gl: WebGL2RenderingContext,
  image: NebulaAtlasImage,
): NebulaAtlasTexture {
  const side = image.width;
  if (side < 1 || image.height !== side) {
    throw new NebulaError(
      `The nebula atlas is ${image.width} by ${image.height} texels. It must be square.`,
    );
  }
  if (side % NEBULA_ATLAS_COLUMNS !== 0) {
    throw new NebulaError(
      `The nebula atlas is ${side} texels across, which ${NEBULA_ATLAS_COLUMNS} tiles ` +
        'a row do not divide.',
    );
  }
  const tileSide = side / NEBULA_ATLAS_COLUMNS;
  const texture = gl.createTexture();
  if (texture === null) {
    throw new Error('The context gave no texture for the nebula atlas.');
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.SRGB8_ALPHA8, side, side);
  gl.texSubImage2D(
    gl.TEXTURE_2D,
    0,
    0,
    0,
    side,
    side,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    image,
  );
  // The shader insets its lookup by half a texel and each tile is alpha 0 at its
  // border, so the linear filter cannot reach a neighbouring tile.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return {
    texture,
    side,
    tileSide,
    dispose(): void {
      gl.deleteTexture(texture);
    },
  };
}
