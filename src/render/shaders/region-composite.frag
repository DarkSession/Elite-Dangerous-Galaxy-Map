#version 300 es
// Reads the blurred coverage buffer once and writes the boundary band over the frame.
//
// The band is one warm tone with a soft edge, which is the line the game draws. The
// two-tone ribbon of a light core inside a dark outline is gone: the tone's luminance is
// 0.755, above every part of the frame but the core of the galaxy itself, so the band
// lightens what it crosses and needs no darker edge to be seen.
//
// The coverage is divided by the kernel's own response at the ridge, so the band draws
// at its stated opacity at every blur radius. The `smoothstep` clamps at 1, which gives
// the band a flat top: a blur lifts the inside of a corner above a straight run's peak,
// and the clamp is what holds a corner no brighter than its own line.
precision highp float;

uniform sampler2D uCoverage;
uniform vec3 uTone;
uniform float uOpacity;
// The kernel's response at the ridge, which normalises the blurred coverage. It is 1
// where the pass does not blur.
uniform float uPeak;

in vec2 vTexture;

out vec4 fragColour;

void main() {
  float coverage = texture(uCoverage, vTexture).r / uPeak;
  float alpha = smoothstep(0.0, 1.0, coverage);
  if (alpha <= 0.0) discard;
  fragColour = vec4(uTone, alpha * uOpacity);
}
