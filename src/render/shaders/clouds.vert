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
uniform vec2 uTargetSize;
uniform float uSpriteScale;
uniform float uMaxRadius;
uniform float uBrightness;
uniform float uSizePower;
uniform float uDensityPower;
uniform float uRatioFloor;
uniform float uRatioCeiling;
uniform float uRadiusReference;
uniform float uFade;
uniform float uShapeSide;
uniform float uShapeColumns;
uniform float uShapeCount;

out vec2 vLocal;
out vec2 vShapeUv;
out float vTint;
out float vBrightness;

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
  // model truncates at the rim, where the reference still shows puffs, and the bulge
  // would take all the light without the ceiling.
  float ratio = clamp(aRatio, uRatioFloor, uRatioCeiling) / uRatioCeiling;
  vBrightness =
    uBrightness * uFade * capFade * pow(ratio, uDensityPower) *
    pow(aRadius / uRadiusReference, uSizePower);
}
