#version 300 es
// A soft round sprite. The pass draws with additive blending.
precision highp float;

in float vTint;
in float vBrightness;

out vec4 fragColour;

const vec3 COOL = vec3(0.55, 0.62, 1.00);
const vec3 WARM = vec3(1.00, 0.84, 0.62);

void main() {
  vec2 offset = gl_PointCoord * 2.0 - 1.0;
  float radius = dot(offset, offset);
  if (radius > 1.0) {
    discard;
  }
  float falloff = 1.0 - radius;
  falloff *= falloff;
  vec3 colour = mix(COOL, WARM, clamp(vTint * 1.25, 0.0, 1.0));
  fragColour = vec4(colour * (falloff * vBrightness), 1.0);
}
