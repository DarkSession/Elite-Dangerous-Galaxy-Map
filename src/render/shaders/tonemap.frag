#version 300 es
// Maps the sum of the two passes into the display range.
precision highp float;

in vec2 vTexture;

uniform sampler2D uScene;
uniform float uExposure;

out vec4 fragColour;

void main() {
  vec3 scene = max(texture(uScene, vTexture).rgb, 0.0);
  // The curve runs on the luminance and scales the colour, so the arms keep their
  // hue. Only the brightest part of the bulge clips a channel and drifts to white.
  float luminance = dot(scene, vec3(0.2126, 0.7152, 0.0722));
  float mapped = 1.0 - exp(-luminance * uExposure);
  vec3 colour = luminance > 0.0 ? scene * (mapped / luminance) : vec3(0.0);
  fragColour = vec4(pow(min(colour, 1.0), vec3(1.0 / 2.2)), 1.0);
}
