#version 300 es
// Reads the half-resolution scene for the glow and holds its brightest pixels down.
// A blur spreads a peak over its whole width, so the brilliant edge-on bulge floods
// the sky above the disc long before the faint rim gives a halo. The hold is soft:
// it leaves the rim as it is and stops at the clamp.
precision highp float;

in vec2 vTexture;

uniform sampler2D uSource;
uniform float uClamp;

out vec4 fragColour;

// The largest value a 16-bit float target holds. A texel above it, or a texel that
// is not a number, would spread over the whole blur, so this pass removes both.
const float LARGEST = 65504.0;

void main() {
  vec3 raw = texture(uSource, vTexture).rgb;
  // A number compares equal to itself; a not-a-number does not.
  vec3 finite = mix(vec3(0.0), raw, equal(raw, raw));
  vec3 colour = min(max(finite, 0.0), vec3(LARGEST));
  float luminance = dot(colour, vec3(0.2126, 0.7152, 0.0722));
  fragColour = vec4(colour * (uClamp / (uClamp + luminance)), 1.0);
}
