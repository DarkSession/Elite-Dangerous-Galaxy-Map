#version 300 es
// A large soft round sprite. The pass draws with additive blending, so the sprites
// give the haze its chunks.
precision highp float;

in vec2 vCorner;
in float vTint;
in float vBrightness;

out vec4 fragColour;

// Three stops of the volume ramp, so a cloud carries the haze, the arms and the core.
// They must stay equal to the same names in volume.frag and points.frag: GLSL has no
// include, so the ramp is written out in each shader that draws part of the disc.
const vec3 HAZE = vec3(0.42, 0.40, 0.78);
const vec3 ARMS = vec3(0.90, 0.60, 0.62);
const vec3 CORE = vec3(1.00, 0.94, 0.78);
// The zone at the disc at Sol is 0.209, so this key puts Sol past the middle. The
// zone reaches 0.896 at the peak of the model, so the core key sits near the top.
const float ZONE_SCALE = 4.0;
const float CORE_LOW = 0.45;
const float CORE_HIGH = 0.75;

void main() {
  float radius = dot(vCorner, vCorner);
  if (radius > 1.0) {
    discard;
  }
  float falloff = 1.0 - radius;
  falloff *= falloff;
  vec3 colour = mix(HAZE, ARMS, clamp(vTint * ZONE_SCALE, 0.0, 1.0));
  colour = mix(colour, CORE, smoothstep(CORE_LOW, CORE_HIGH, vTint));
  fragColour = vec4(colour * (falloff * vBrightness), 0.0);
}
