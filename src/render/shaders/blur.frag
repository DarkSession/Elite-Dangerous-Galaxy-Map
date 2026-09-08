#version 300 es
// One direction of a separable Gaussian blur, with nine taps. The last round also
// applies the glow weight and the tint toward the haze colour.
precision highp float;

in vec2 vTexture;

uniform sampler2D uSource;
uniform vec2 uStep;
uniform float uWeight;
uniform float uTint;

out vec4 fragColour;

// The haze colour of the volume ramp, divided by its own luminance, so the tint moves
// the hue and keeps the brightness.
const vec3 HAZE_TINT = vec3(0.97, 0.93, 1.81);
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
// The taps sit half a standard deviation apart, so the nine of them cover two
// standard deviations on each side.
const float SIGMA = 2.0;

void main() {
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int index = -4; index <= 4; ++index) {
    float offset = float(index);
    float weight = exp(-0.5 * offset * offset / (SIGMA * SIGMA));
    sum += max(texture(uSource, vTexture + uStep * offset).rgb, 0.0) * weight;
    total += weight;
  }
  vec3 colour = sum / total;
  float luminance = dot(colour, LUMA);
  fragColour = vec4(mix(colour, luminance * HAZE_TINT, uTint) * uWeight, 1.0);
}
