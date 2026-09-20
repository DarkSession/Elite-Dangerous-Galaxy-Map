#version 300 es
// A soft round sprite, as the point cloud draws. The pass draws with additive blending.
precision highp float;

in float vTint;
in float vBrightness;

out vec4 fragColour;

// The star field draws the same disc the point cloud draws, so it reads the same ramp.
// COOL, WARM and CORE must stay equal to the same names in points.frag: GLSL has no
// include, so the ramp is written out in each shader that draws part of the disc.
const vec3 COOL = vec3(0.72, 0.78, 1.00);
const vec3 WARM = vec3(1.00, 0.78, 0.62);
const vec3 CORE = vec3(1.00, 0.97, 0.92);
const float ZONE_SCALE = 6.0;
const float CORE_LOW = 0.45;
const float CORE_HIGH = 0.75;

void main() {
  vec2 offset = gl_PointCoord * 2.0 - 1.0;
  float radius = dot(offset, offset);
  if (radius > 1.0) {
    discard;
  }
  float falloff = 1.0 - radius;
  falloff *= falloff;
  vec3 colour = mix(COOL, WARM, clamp(vTint * ZONE_SCALE, 0.0, 1.0));
  colour = mix(colour, CORE, smoothstep(CORE_LOW, CORE_HIGH, vTint));
  fragColour = vec4(colour * (falloff * vBrightness), 1.0);
}
