#version 300 es
// Draws one point sprite per sample. Positions are relative to the chunk origin, and
// the chunk offset carries the camera subtraction the CPU makes in float64.
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in float aTint;

uniform mat4 uViewProjection;
uniform vec3 uChunkOffset;
uniform float uPointScale;
uniform float uBrightness;
uniform float uHandoverWeight;
uniform vec2 uHandover;

out float vTint;
out float vBrightness;
// The range from the camera to the sample, in light years. The nebula gate reads it.
out float vRange;

// A hash of the sample index, in 0 to 1. It uses shifts and exclusive or only, because
// GLSL ES 3.00 leaves an overflow of a `uint` multiply undefined. Neighbour indices
// give close values, which does not show because the samples are in random order.
// A spatially ordered set needs one more mixing round.
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
  float wanted = uPointScale / range;
  float size = clamp(wanted, 1.0, 4.0);

  gl_PointSize = size;
  vTint = aTint;
  vRange = range;
  // Below one pixel the sprite cannot shrink, so the brightness carries the fall-off
  // instead and the far view keeps the same total light.
  // A spread of brightness over the samples gives the disc its grain. The mean of the
  // spread is one, so the total light does not change.
  float spread = (0.05 + 12.0 * pow(hash(gl_VertexID), 16.0)) / 0.7559;
  // The star field takes over the near field below a zoom distance of 8,000 light
  // years. The star shader carries the other part of this fade, so the two sum to 1 at
  // every range. Above 8,000 the weight is 0, the fade is exactly 1, and a multiply by
  // 1 leaves the far view's light unchanged.
  float fade = 1.0 - uHandoverWeight * (1.0 - smoothstep(uHandover.x, uHandover.y, range));
  vBrightness = uBrightness * spread * (wanted * wanted) / (size * size) * fade;
  gl_Position = uViewProjection * vec4(relative, 1.0);
}
