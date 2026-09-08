#version 300 es
// Maps the sum of the scene passes into the display range and puts it over the
// background.
precision highp float;

in vec2 vTexture;

uniform sampler2D uScene;
uniform float uExposure;

out vec4 fragColour;

// The curve stops here instead of at 1, so the bulge keeps its cream colour.
const float WHITE_LEVEL = 0.74;
// The background of the game's map is a dark grey, not black. The blend keeps faint
// light above it, which a maximum would hide.
const vec3 BACKGROUND = vec3(0.038, 0.036, 0.048);

void main() {
  vec3 scene = max(texture(uScene, vTexture).rgb, 0.0);
  // The curve runs on the luminance and scales the colour, so the arms keep their
  // hue. The white level holds the luminance below 0.74. A strongly tinted pixel can
  // still carry a channel above 1 at that luminance, and the min below clamps it.
  float luminance = dot(scene, vec3(0.2126, 0.7152, 0.0722));
  float mapped = WHITE_LEVEL * (1.0 - exp(-luminance * uExposure));
  vec3 colour = luminance > 0.0 ? scene * (mapped / luminance) : vec3(0.0);
  vec3 display = pow(min(colour, 1.0), vec3(1.0 / 2.2));
  fragColour = vec4(BACKGROUND + (1.0 - BACKGROUND) * display, 1.0);
}
