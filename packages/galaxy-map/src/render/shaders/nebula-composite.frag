#version 300 es
// Applies the nebula accumulation target to the scene.
//
// The colour channels of that target hold the sum of the emissions of the records and
// the alpha channel holds the product of their transmittances. The pass blends this
// fragment with `ONE, ONE_MINUS_SRC_ALPHA`, so the scene reads the emission sum plus the
// transmittance product times the colour it held.
precision highp float;

in vec2 vTexture;

uniform sampler2D uAccumulated;

out vec4 fragColour;

void main() {
  vec4 accumulated = texture(uAccumulated, vTexture);
  fragColour = vec4(accumulated.rgb, 1.0 - accumulated.a);
}
