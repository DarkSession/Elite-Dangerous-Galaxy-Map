#version 300 es
// Draws one soft quad per cloud sample. The quad is an instance over four corners,
// because a point sprite is discarded whole when its centre leaves the clip volume,
// and a sprite this large would then pop at the edge of the frame.
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in float aTint;
layout(location = 2) in float aRadius;
layout(location = 3) in float aRatio;
layout(location = 4) in vec2 aCorner;

uniform mat4 uViewProjection;
uniform vec3 uChunkOffset;
uniform vec3 uCentre;
uniform vec2 uTargetSize;
uniform float uSpriteScale;
uniform float uMaxRadius;
uniform float uBrightness;
uniform float uSizePower;
uniform float uDensityPower;
uniform float uRatioFloor;
uniform float uRatioCeiling;
uniform float uRadiusReference;
uniform float uFloorPower;
uniform float uSpreadPower;
uniform float uSpreadBase;
uniform float uSpreadColour;
uniform float uFade;
uniform float uShapeSide;
uniform float uShapeColumns;
uniform float uShapeCount;

out vec2 vLocal;
out vec2 vShapeUv;
out float vTint;
out float vBrightness;
out float vSpread;
out float vSpreadKey;
out float vBlend;

// The fade by galactocentric radius. The placement reaches past the painted rim, and
// the reference shows no puff outside the disc.
const float RIM_FULL = 44000.0;
const float RIM_ZERO = 48000.0;

// The galactocentric radii over which the colour runs from the inner ramp to the outer
// one. They must stay equal to the same names in volume.frag.
const float BLEND_IN = 20000.0;
const float BLEND_OUT = 32000.0;

// A hash of the sprite index, in 0 to 1. It uses shifts and exclusive or only,
// because GLSL ES 3.00 leaves an overflow of a `uint` multiply undefined. The cloud
// samples are in random order, so neighbour indices need no more mixing.
float hash(int index) {
  uint bits = uint(index) + 0x9E3779B9u;
  bits ^= bits << 13u;
  bits ^= bits >> 17u;
  bits ^= bits << 5u;
  bits ^= bits >> 11u;
  bits ^= bits << 7u;
  return float(bits) / 4294967295.0;
}

void main() {
  vec3 relative = uChunkOffset + aPosition;
  float range = max(length(relative), 1.0);
  float wanted = (uSpriteScale * aRadius) / range;

  vec4 clip = uViewProjection * vec4(relative, 1.0);
  // Behind the camera, or at the pixel cap. The far plane clips this vertex away.
  if (clip.w <= 0.0 || wanted >= uMaxRadius) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    vLocal = vec2(2.0);
    vShapeUv = vec2(0.0);
    vTint = 0.0;
    vBrightness = 0.0;
    vSpread = 0.0;
    vSpreadKey = 0.0;
    vBlend = 0.0;
    return;
  }

  clip.xy += aCorner * (2.0 * wanted * clip.w) / uTargetSize;
  gl_Position = clip;

  float angle = hash(gl_InstanceID) * 6.2831853;
  float shape = floor(hash(gl_InstanceID + 8191) * uShapeCount);
  shape = min(shape, uShapeCount - 1.0);
  float column = mod(shape, uShapeColumns);
  float row = floor(shape / uShapeColumns);

  // The quad stays axis-aligned and the shape turns inside it. The fragment shader
  // drops the corners outside the unit disc, where the shape is zero, so the lookup
  // never leaves the shape's cell of the atlas. The half-texel inset keeps the linear
  // filter inside the cell as well.
  float cosine = cos(angle);
  float sine = sin(angle);
  vLocal = vec2(
    cosine * aCorner.x - sine * aCorner.y,
    sine * aCorner.x + cosine * aCorner.y
  );
  vec2 inCell = vLocal * 0.5 + 0.5;
  vec2 texel = vec2(column, row) * uShapeSide + inCell * (uShapeSide - 1.0) + 0.5;
  vShapeUv = texel / (uShapeSide * uShapeColumns);

  vTint = aTint;
  // The light per unit area follows the density through the first power, and the
  // large puffs carry the haze while the small ones carry the chunks through the
  // second. A sprite fades out as it grows past half the cap, so the sum of the
  // sprites stays bounded as the camera comes closer.
  float capFade = 1.0 - smoothstep(0.5 * uMaxRadius, uMaxRadius, wanted);
  // The ratio is held between a floor and a ceiling and divided by the ceiling: the
  // bulge would take all the light without the ceiling, and the floor holds the light
  // of the outer disc where the model runs out.
  float held = clamp(aRatio, uRatioFloor, uRatioCeiling);
  float ratio = held / uRatioCeiling;
  // Below the floor the brightness keeps falling, with a gentler power. A sprite in a
  // dense part of the rim is then brighter than one in empty space, and the sprites
  // past the model's truncation go faint.
  float thin = pow(min(aRatio / uRatioFloor, 1.0), uFloorPower);
  // The brightness spread. The factor has mean 1, so the sum of the sprites does not
  // change. The key applies it where the held ratio is at the floor, which is the
  // outer disc, and drops it at three times the floor, so the inner disc keeps its
  // smooth sum.
  float factor = (1.0 + uSpreadPower) * pow(hash(gl_InstanceID + 16381), uSpreadPower);
  // A share of the light stays out of the lottery, so the outer disc keeps a ground of
  // faint sprites and the winners are the puffs on that ground. The mean stays 1.
  float mixed = uSpreadBase + (1.0 - uSpreadBase) * factor;
  vSpreadKey = 1.0 - smoothstep(uRatioFloor, 3.0 * uRatioFloor, held);
  float spread = mix(1.0, mixed, vSpreadKey);
  // The colour follows the light the sprite carries, against a fixed level at which it
  // takes the whole patch colour, so the puffs where the arms end are pink and empty
  // space stays blue.
  vSpread = clamp((thin * spread) / uSpreadColour, 0.0, 1.0);
  // The spread modulates the density. It never lifts a sprite above the brightness of
  // one at the ceiling ratio.
  float value = min(pow(ratio, uDensityPower) * thin * spread, 1.0);
  // The galactocentric radius carries the colour from the inner ramp to the outer one,
  // and the rim fade keeps light off the space outside the painted rim.
  float radius = length(relative.xz - uCentre.xz);
  vBlend = smoothstep(BLEND_IN, BLEND_OUT, radius);
  float rimFade = 1.0 - smoothstep(RIM_FULL, RIM_ZERO, radius);
  vBrightness =
    uBrightness * uFade * capFade * rimFade * value *
    pow(aRadius / uRadiusReference, uSizePower);
}
