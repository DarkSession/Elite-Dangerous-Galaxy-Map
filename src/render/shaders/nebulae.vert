#version 300 es
// Draws one screen-aligned quad per selected nebula. The quad is an instance over
// four corners, because a point sprite is discarded whole when its centre leaves the
// clip volume, and a sprite this large would then pop at the edge of the frame.
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in float aRadius;
layout(location = 2) in float aTile;
layout(location = 3) in float aFade;
layout(location = 4) in vec2 aCorner;

uniform mat4 uViewProjection;
uniform vec3 uChunkOffset;
uniform vec2 uTargetSize;
uniform float uSpriteScale;
uniform float uMaxRadius;
uniform float uWeight;
uniform float uTileSide;
uniform float uAtlasColumns;
uniform float uAtlasSide;

out vec2 vTileUv;
out float vWeight;

void main() {
  vec3 relative = uChunkOffset + aPosition;
  float range = max(length(relative), 1.0);
  // The world width of the sprite is twice the record's radius, so the apparent
  // radius follows the world radius over the range. The cap stops one instance close
  // to the camera laying fragments over the whole frame.
  float wanted = min((uSpriteScale * aRadius) / range, uMaxRadius);

  // The zoom band and the camera-inside fade scale the colour and the alpha together,
  // so a fading nebula both dims and stops attenuating what is behind it.
  float weight = uWeight * aFade;

  vec4 clip = uViewProjection * vec4(relative, 1.0);
  // Behind the camera, or faded out. A sprite at weight 0 adds nothing, and its quad
  // reaches the cap, so the collapse saves a capped sprite of blended fragments.
  if (clip.w <= 0.0 || weight <= 0.0) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    vTileUv = vec2(0.0);
    vWeight = 0.0;
    return;
  }

  clip.xy += aCorner * (2.0 * wanted * clip.w) / uTargetSize;
  gl_Position = clip;

  // The lookup takes the record's own tile of the atlas. The half-texel inset keeps
  // the linear filter inside the tile, and each tile is alpha 0 at its border, so no
  // tile's colour can reach its neighbour.
  // The atlas uploads with no flip, so texture row 0 holds the top row of the file.
  // The top of the quad is aCorner.y = 1, so the lookup negates y and the art draws
  // the same way up as the file.
  float column = mod(aTile, uAtlasColumns);
  float row = floor(aTile / uAtlasColumns);
  vec2 inCell = vec2(aCorner.x, -aCorner.y) * 0.5 + 0.5;
  vec2 texel = vec2(column, row) * uTileSide + inCell * (uTileSide - 1.0) + 0.5;
  vTileUv = texel / uAtlasSide;

  vWeight = weight;
}
