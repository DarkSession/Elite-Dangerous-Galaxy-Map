#version 300 es
// Draws one point sprite per real system. The CPU subtracts the camera position from
// each system position in float64 and writes the offset, so the shader never adds two
// large numbers.
precision highp float;

layout(location = 0) in vec3 aOffset;
layout(location = 1) in vec3 aCore;
// The style of the marker, 0 for a disc and 1 for a glow, and the draw range of its
// category in light years.
layout(location = 2) in vec2 aStyleRange;

uniform mat4 uViewProjection;
// The CSS pixels per light year at one light year of range, times the marker's own
// size in light years. The CSS diameter is this over the range.
uniform float uScale;
// The floor and the cap of the CSS diameter. The floor keeps a marker findable in the
// far view, where the perspective size falls below one pixel.
uniform vec2 uLimits;
// Device pixels per CSS pixel.
uniform float uPixelRatio;
// The width of the ring, in CSS pixels.
uniform float uRingCss;
// The sprite of a glow, as a multiple of the disc diameter.
uniform float uGlowFactor;
// The largest point size the card draws, in device pixels.
uniform float uMaxPointSize;

out vec3 vCore;
out float vRadius;
out float vRing;
out float vStyle;

void main() {
  float range = length(aOffset);
  // A marker draws only while the camera is inside the draw range of its own category.
  // A range of 0 is the marker the category switch or the name filter took off.
  // A clip-space z over w of 2 is behind the far plane, so the point is clipped and no
  // fragment is written. The cut does not fade: a marker draws in full or not at all.
  if (aStyleRange.y <= 0.0 || range > aStyleRange.y) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }

  float disc = clamp(uScale / max(range, 1.0), uLimits.x, uLimits.y);
  float sprite = aStyleRange.x > 0.5 ? disc * uGlowFactor : disc;
  float size = min(sprite * uPixelRatio, uMaxPointSize);
  gl_PointSize = size;
  vCore = aCore;
  vRadius = size * 0.5;
  vRing = uRingCss * uPixelRatio;
  vStyle = aStyleRange.x;
  gl_Position = uViewProjection * vec4(aOffset, 1.0);
}
