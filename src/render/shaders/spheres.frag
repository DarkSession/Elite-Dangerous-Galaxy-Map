#version 300 es
// Writes one sphere over the finished frame as a limb-brightened shell.
//
// The alpha is the path length through a thin shell at an impact parameter: it is the
// sphere's own opacity at the middle of the sprite and rises to 1 at the limb. At the
// default opacity of 0.18 it reaches 1 at 0.9838 of the radius, so a sphere reads as a
// bright rim with a faint wash inside it and never as a flat disc.
//
// The colour is the sphere's own colour at every point, so the colour reaches the frame
// unmixed and the alpha alone carries the shape. `sphereAlpha` of
// `src/render/shape-pass.ts` holds the same rule for the unit tests.
precision highp float;

in vec2 vCorner;
in vec3 vColour;
in float vOpacity;

out vec4 fragColour;

void main() {
  float r = length(vCorner);
  // The quad is square and the sphere is round, so the corners of the quad are outside
  // the shell. Nothing draws at the limb itself, where the path length is unbounded.
  if (r >= 1.0) discard;
  float alpha = min(1.0, vOpacity / sqrt(1.0 - r * r));
  fragColour = vec4(vColour, alpha);
}
