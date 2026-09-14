#version 300 es
// Draws the disc of one marker: a core in the colour of the system's primary category
// and a ring of a fixed width and a fixed dark colour around it.
precision highp float;

in vec3 vCore;
in float vRadius;
in float vRing;

out vec4 fragColor;

// The ring colour. It does not follow the category, so the disc holds a readable edge
// over the cream core of the galaxy and over dark space alike.
const vec3 RING = vec3(0.02, 0.04, 0.10);

void main() {
  // The distance from the centre of the sprite, in device pixels.
  float dist = length(gl_PointCoord * 2.0 - 1.0) * vRadius;
  // The ramp covers the outer 1 device pixel alone. Every pixel further in is opaque, so
  // a test reads the ring colour and the core colour as they are.
  float alpha = clamp(vRadius - dist, 0.0, 1.0);
  if (alpha <= 0.0) discard;
  vec3 colour = dist >= vRadius - vRing ? RING : vCore;
  fragColor = vec4(colour, alpha);
}
