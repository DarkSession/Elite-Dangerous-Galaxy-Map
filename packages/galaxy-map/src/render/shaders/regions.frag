#version 300 es
// Writes the coverage of one boundary segment into the single-channel buffer.
//
// The coverage is 1 at the middle of the line and 0 at its edge, which is the ramp
// `max(0, 1 - gap / halfWidth)`. The pass blends with the MAX equation, so where two
// quads of one join overlap the buffer keeps the largest value, which is the smallest
// distance. A join therefore reads the same as a straight run rather than twice as
// strong.
//
// The half width follows the range, so it is read at each end of the segment and
// interpolated along it by the same parameter the gap is measured at. The vertex shader
// expands the quad by the same two numbers, so the quad covers the whole ramp and cuts
// none of it.
precision highp float;

flat in vec2 vStart;
flat in vec2 vEnd;
flat in float vHalfStart;
flat in float vHalfEnd;

out vec4 fragColour;

void main() {
  vec2 point = gl_FragCoord.xy;
  vec2 along = vEnd - vStart;
  float span = dot(along, along);
  float part = span > 0.0 ? clamp(dot(point - vStart, along) / span, 0.0, 1.0) : 0.0;
  float gap = length(point - (vStart + part * along));
  float halfWidth = mix(vHalfStart, vHalfEnd, part);
  float coverage = 1.0 - gap / halfWidth;
  if (coverage <= 0.0) discard;
  fragColour = vec4(coverage, 0.0, 0.0, 1.0);
}
