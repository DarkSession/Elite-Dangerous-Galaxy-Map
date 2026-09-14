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

// The half-width of a spike and its height at the centre of the sprite.
const float SPIKE_HALF_WIDTH_CSS = 1.0;
const float SPIKE_PEAK = 0.55;
// The height of the halo at the centre of the sprite.
const float HALO_PEAK = 0.85;
// The radius the core holds at 1, and the radius it reaches 0 at, in CSS pixels.
const float CORE_PLATEAU_CSS = 1.0;
const float CORE_EDGE_CSS = 2.5;

// One spike, along an axis and in both directions. `along` is the distance from the
// centre along the axis and `across` the distance from the axis, both in CSS pixels.
float spike(float along, float across, float radius) {
  float width = max(0.0, 1.0 - abs(across) / SPIKE_HALF_WIDTH_CSS);
  float reach = max(0.0, 1.0 - abs(along) / radius);
  return SPIKE_PEAK * width * reach * reach;
}

// The alpha of a glow. `system-pass.ts` carries the same rule as `glowAlpha`, so a unit
// test reads it at its own resolution and not at the resolution of a screenshot. The core
// is the larger of two terms and not a separate opaque disc, so the alpha falls from 1 to
// the halo without a step.
float glowAlpha(vec2 offset, float radius) {
  float r = length(offset);
  float fall = max(0.0, 1.0 - r / radius);
  float halo = HALO_PEAK * fall * fall * fall;
  float core = clamp((CORE_EDGE_CSS - r) / (CORE_EDGE_CSS - CORE_PLATEAU_CSS), 0.0, 1.0);
  float spikes = spike(offset.x, offset.y, radius) + spike(offset.y, offset.x, radius);
  return min(1.0, spikes + max(core, halo));
}

void main() {
  // The offset from the centre of the sprite, in device pixels.
  vec2 offset = (gl_PointCoord * 2.0 - 1.0) * vRadius;

  if (vStyle > 0.5) {
    float alpha = glowAlpha(offset / uPixelRatio, vRadius / uPixelRatio);
    if (alpha <= 0.0) discard;
    fragColor = vec4(vCore, alpha);
    return;
  }

  float dist = length(offset);
  // The ramp covers the outer 1 device pixel alone. Every pixel further in is opaque, so
  // a test reads the ring colour and the core colour as they are.
  float alpha = clamp(vRadius - dist, 0.0, 1.0);
  if (alpha <= 0.0) discard;
  vec3 colour = dist >= vRadius - vRing ? RING : vCore;
  fragColor = vec4(colour, alpha);
}
