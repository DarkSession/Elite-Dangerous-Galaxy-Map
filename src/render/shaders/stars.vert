#version 300 es
// Draws one point sprite per decoration star. The CPU writes one record per boxel and
// the shader places the boxel's stars inside it, so no star position ever reaches the
// card. `gl_InstanceID` names the boxel and `gl_VertexID` names the star.
precision highp float;

layout(location = 0) in vec3 aOrigin;
layout(location = 1) in vec4 aShape;
layout(location = 2) in float aZone;
layout(location = 3) in uint aSeed;

uniform mat4 uViewProjection;
uniform float uFocal;
uniform float uWeight;
uniform vec2 uHandover;

out float vTint;
out float vBrightness;

// The three steps of `mix` in src/scene-data/boxel.ts. GLSL ES 3.00 wraps an unsigned
// overflow to the low 32 bits, which is what Math.imul gives on the CPU, so the two
// hashes agree bit for bit.
uint mixBits(uint value) {
  uint bits = value;
  bits = (bits ^ (bits >> 16u)) * 0x7feb352du;
  bits = (bits ^ (bits >> 15u)) * 0x846ca68bu;
  return bits ^ (bits >> 16u);
}

// The top 24 bits of the mix, in 0 to 1. A float32 holds 24 bits exactly, so this is
// the number starOffsets gives on the CPU.
float unitOf(uint bits) {
  return float(bits >> 8u) / 16777216.0;
}

void main() {
  // A star index at or above the boxel's drawn count gets no size and a position the
  // near plane clips away.
  if (float(gl_VertexID) >= aShape.y) {
    gl_PointSize = 0.0;
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }

  uint first = mixBits(aSeed + uint(gl_VertexID) * 0x9e3779b1u);
  uint second = mixBits(first ^ 0x68bc21ebu);
  uint third = mixBits(second ^ 0x02e5be93u);
  uint fourth = mixBits(third ^ 0x7fb5d329u);
  // The record carries the world offset of the boxel's corner in game coordinates, so
  // the third offset runs the other way.
  vec3 inside = vec3(unitOf(first), unitOf(second), -unitOf(third)) * aShape.x;

  vec3 relative = aOrigin + inside;
  float range = max(length(relative), 1.0);
  float wanted = uFocal * aShape.w / range;
  float size = clamp(wanted, 1.0, 16.0);
  // The star field and the point cloud share this fade. The point shader carries one
  // minus it, so the two sum to 1 at every range.
  float fade = uWeight * (1.0 - smoothstep(uHandover.x, uHandover.y, range));

  // A spread of brightness over the stars of a boxel gives the field its grain, as a
  // real population of stars covers many magnitudes. The mean of 0.3 + 3 * u^4 over u
  // in 0 to 1 is 0.3 + 3 / 5 = 0.9, so the spread has a mean of 1 and the boxel's light
  // does not change.
  //
  // The shape is milder than the one points.vert gives the point cloud. A boxel draws
  // at most 256 stars, so the scatter of its drawn light is the spread's own scatter
  // over 16. Measured over 1,856 boxels: this shape has a standard deviation of 0.89
  // times its mean and leaves a boxel's light 5.6 percent out, worst 20 percent; the
  // point cloud's shape has 2.60 and leaves it 16.6 percent out, worst 67 percent,
  // which would read as a checkerboard at the boxel scale. The point cloud has no
  // boxels, so it does not pay that price.
  float spread = (0.3 + 3.0 * pow(unitOf(fourth), 4.0)) / 0.9;

  gl_PointSize = size;
  vTint = aZone;
  // The sprite deposits lightPerStar * uFocal^2 / range^2 whatever the star's radius
  // is and whatever the size clamp does. The radius sets only how concentrated the
  // light is, never how much of it there is. The spread is a separate factor, so it
  // moves no light between stars of different radii.
  vBrightness =
      (aShape.z * uFocal * uFocal * fade * spread) / (range * size * range * size);
  gl_Position = uViewProjection * vec4(relative, 1.0);
}
