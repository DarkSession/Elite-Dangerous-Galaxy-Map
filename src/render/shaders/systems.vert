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
// The four ranges of the size stop table, in light years, in rising order.
uniform vec4 uSizeRanges;
// The CSS diameter of the marker at each of those four ranges.
uniform vec4 uSizeValues;
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

// The disc diameter in CSS pixels at a range in light years. The rule reads the range
// alone and not the viewport. It walks the stop table: between two stops the size is
// even in the logarithm of the range, and outside the ends it holds the end value.
// `markerCssSize` of `src/scene-data/marker-size.ts` holds the same walk, and the table
// comes from that file, so there is no second copy of the numbers.
float discCssSize(float range) {
  float logRange = log(max(range, 1e-6));
  if (logRange <= log(uSizeRanges[0])) return uSizeValues[0];
  for (int stop = 1; stop < 4; stop += 1) {
    float high = log(uSizeRanges[stop]);
    if (logRange > high) continue;
    float low = log(uSizeRanges[stop - 1]);
    float part = (logRange - low) / (high - low);
    return mix(uSizeValues[stop - 1], uSizeValues[stop], part);
  }
  return uSizeValues[3];
}

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

  float disc = discCssSize(range);
  float sprite = aStyleRange.x > 0.5 ? disc * uGlowFactor : disc;
  float size = min(sprite * uPixelRatio, uMaxPointSize);
  gl_PointSize = size;
  vCore = aCore;
  vRadius = size * 0.5;
  vRing = uRingCss * uPixelRatio;
  vStyle = aStyleRange.x;
  gl_Position = uViewProjection * vec4(aOffset, 1.0);
}
