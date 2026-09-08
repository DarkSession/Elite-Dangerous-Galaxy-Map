#version 300 es
// Copies one texture over the target, which upsamples the half-resolution volume.
precision highp float;

in vec2 vTexture;

uniform sampler2D uSource;

out vec4 fragColour;

void main() {
  fragColour = texture(uSource, vTexture);
}
