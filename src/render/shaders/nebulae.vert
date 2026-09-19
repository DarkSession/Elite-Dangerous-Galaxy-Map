#version 300 es
// Draws one screen-aligned quad per selected nebula. The quad is an instance over
// four corners, because a point sprite is discarded whole when its centre leaves the
// clip volume, and a sprite this large would then pop at the edge of the frame.
//
// The shader also marches the density volume from the camera to the record's centre and
// gives the fragment shader the transmittance of that segment, so a nebula the camera
// sees through the bulge reads darker and warmer than one with nothing in front of it.
precision highp float;
precision highp sampler3D;

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

// The volume the march reads. It is the texture the volume pass draws, which the
// renderer owns and gives to both passes. The absorption is the volume pass's own, so
// the two agree on how much light a light year of dust takes.
uniform sampler3D uVolume;
uniform sampler2D uDetail;
uniform vec3 uBoxMin;
uniform vec3 uBoxSize;
uniform vec3 uCentre;
uniform float uLo;
uniform float uSpan;
uniform float uEpsilon;
uniform float uAbsorption;
uniform float uDetailScale;
// Scales the optical depth. At 0 the pass draws what it drew before the march, and at 1
// it draws the volume's own extinction. The renderer sends 0 where there is no volume
// texture and where the volume pass does not draw.
uniform float uOcclusion;

out vec2 vTileUv;
out float vWeight;
out vec3 vTransmittance;

// @volume-density

// How many steps the march takes. The segment is at most the box diagonal, about 105,000
// light years, so 64 steps give a step of 1,600 light years at worst. That is coarse and
// it is enough: the value wanted is a column depth and not a picture, the compression is
// monotone in the density, and the error of a midpoint rule over a smooth field falls as
// the square of the step. The volume pass takes 96 steps because it draws a picture.
const int MARCH_STEPS = 64;

// The transmittance of the volume over the segment from the camera to `target`, in the
// world frame. The camera sits at the origin of that frame, as it does in `volume.frag`,
// and the segment is clipped to the volume box the same way that shader clips its ray.
vec3 marchTransmittance(vec3 target) {
  if (uOcclusion <= 0.0) {
    return vec3(1.0);
  }

  float range = length(target);
  if (range <= 0.0) {
    return vec3(1.0);
  }
  vec3 direction = target / range;
  // A zero component gives an infinite inverse, and zero times infinity is NaN below.
  vec3 safe = mix(direction, vec3(1e-7), lessThan(abs(direction), vec3(1e-7)));
  vec3 inverse = 1.0 / safe;

  vec3 first = uBoxMin * inverse;
  vec3 second = (uBoxMin + uBoxSize) * inverse;
  vec3 low = min(first, second);
  vec3 high = max(first, second);

  float near = max(max(max(low.x, low.y), low.z), 0.0);
  // The record's centre ends the segment, so a nebula in front of the dust takes none.
  float far = min(min(min(high.x, high.y), high.z), range);
  if (far <= near) {
    return vec3(1.0);
  }

  float step = (far - near) / float(MARCH_STEPS);
  float peak = exp(uLo + uSpan) - uEpsilon;
  vec3 depth = vec3(0.0);

  for (int index = 0; index < MARCH_STEPS; ++index) {
    vec3 point = direction * (near + (float(index) + 0.5) * step);
    float density = volumeDensity(
      point, uCentre, uVolume, uDetail, uBoxMin, uBoxSize,
      uLo, uSpan, uEpsilon, uDetailScale, peak);
    depth += DUST * (density * uAbsorption * step * uOcclusion);
  }

  return exp(-depth);
}

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
    vTransmittance = vec3(1.0);
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
  // The march runs after the early-out, so a collapsed sprite pays no texture fetch.
  // The four corners of one quad march the same segment and reach the same answer.
  // WebGL2 has no per-instance stage, and a pass that removed the three redundant
  // marches would cost more than the 49,000 fetches it saved.
  vTransmittance = marchTransmittance(relative);
}
