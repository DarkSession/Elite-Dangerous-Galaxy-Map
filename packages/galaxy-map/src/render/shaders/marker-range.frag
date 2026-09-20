#version 300 es
// Writes the camera range of a marker body into the range buffer, so a sphere can read
// what lies in front of it. The pass blends with the MIN equation, so the pixel holds the
// range of the nearest marker body that covers it.
//
// A fragment writes range where the marker's own alpha is 0.5 or more and discards below
// it. A `glow` sprite is up to 40 CSS pixels across and its halo falls to 0 at the rim,
// so a range written over the whole sprite would punch a square of unwashed sphere around
// every marker. The colour shader reads the same alpha rule from the same file.
precision highp float;

in float vRadius;
in float vStyle;
// The distance from the camera to the system, in light years.
in float vRange;

// Device pixels per CSS pixel. The glow rule is in CSS pixels.
uniform float uPixelRatio;

out float fragRange;

// @marker-alpha

// The alpha a fragment must hold to write its range. It is the part of the sprite the
// user reads as the marker.
const float BODY_ALPHA = 0.5;

void main() {
  vec2 offset = (gl_PointCoord * 2.0 - 1.0) * vRadius;
  if (markerAlpha(offset, vRadius, vStyle, uPixelRatio) < BODY_ALPHA) discard;
  fragRange = vRange;
}
