#version 300 es
// Draws one point sprite per real system. The CPU subtracts the camera position from
// each system position in float64 and writes the offset, so the shader never adds two
// large numbers.
precision highp float;

layout(location = 0) in vec3 aOffset;
layout(location = 1) in vec3 aCore;

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

out vec3 vCore;
out float vRadius;
out float vRing;

void main() {
  float range = max(length(aOffset), 1.0);
  float size = clamp(uScale / range, uLimits.x, uLimits.y) * uPixelRatio;
  gl_PointSize = size;
  vCore = aCore;
  vRadius = size * 0.5;
  vRing = uRingCss * uPixelRatio;
  gl_Position = uViewProjection * vec4(aOffset, 1.0);
}
