#version 300 es
// Draws one marker in one of two styles. A disc has a core in the colour of the system's
// primary category and a ring of a fixed width and a fixed dark colour around it. A glow
// has the category colour at every point and puts its whole shape in the alpha.
precision highp float;

in vec3 vCore;
in float vRadius;
in float vRing;
in float vStyle;

// Device pixels per CSS pixel. The glow rule is in CSS pixels, so the shader divides the
// device-pixel radius by this.
uniform float uPixelRatio;

out vec4 fragColor;

// The ring colour. It does not follow the category, so the disc holds a readable edge
// over the cream core of the galaxy and over dark space alike.
const vec3 RING = vec3(0.02, 0.04, 0.10);

// The alpha rule, which `marker-range.frag` reads from the same file. `system-pass.ts`
// puts it here in place of the line below.
// @marker-alpha

void main() {
  // The offset from the centre of the sprite, in device pixels.
  vec2 offset = (gl_PointCoord * 2.0 - 1.0) * vRadius;
  float alpha = markerAlpha(offset, vRadius, vStyle, uPixelRatio);
  if (alpha <= 0.0) discard;

  if (vStyle > 0.5) {
    fragColor = vec4(vCore, alpha);
    return;
  }

  // The ramp of the disc covers the outer 1 device pixel alone. Every pixel further in is
  // opaque, so a test reads the ring colour and the core colour as they are.
  float dist = length(offset);
  vec3 colour = dist >= vRadius - vRing ? RING : vCore;
  fragColor = vec4(colour, alpha);
}
