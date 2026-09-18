// The alpha of a marker at an offset from the middle of its sprite, in device pixels.
//
// The colour shader and the range shader both read this file, which `system-pass.ts`
// puts in place of the `// @marker-alpha` line of each source, because GLSL has no
// include. The two must give the same answer: the range buffer protects the part of the
// sprite whose alpha is 0.5 or more, and a second copy of the rule that drifted would
// protect a part of the frame the user does not read as a marker.
//
// `glowAlpha` and `discAlpha` of `system-pass.ts` carry the same rules for the unit
// tests, so a test reads them at its own resolution and not at the resolution of a
// screenshot.

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

// The alpha of a glow, in CSS pixels. The core is the larger of two terms and not a
// separate opaque disc, so the alpha falls from 1 to the halo without a step.
float glowAlpha(vec2 offset, float radius) {
  float r = length(offset);
  float fall = max(0.0, 1.0 - r / radius);
  float halo = HALO_PEAK * fall * fall * fall;
  float core = clamp((CORE_EDGE_CSS - r) / (CORE_EDGE_CSS - CORE_PLATEAU_CSS), 0.0, 1.0);
  float spikes = spike(offset.x, offset.y, radius) + spike(offset.y, offset.x, radius);
  return min(1.0, spikes + max(core, halo));
}

// The alpha of a marker. `offset` and `radius` are in device pixels, and `style` is 0 for
// a disc and 1 for a glow. A disc is opaque but for the outer device pixel, whose ramp
// gives it a smooth edge.
float markerAlpha(vec2 offset, float radius, float style, float pixelRatio) {
  if (style > 0.5) return glowAlpha(offset / pixelRatio, radius / pixelRatio);
  return clamp(radius - length(offset), 0.0, 1.0);
}
