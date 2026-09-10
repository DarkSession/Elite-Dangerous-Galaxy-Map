#version 300 es
// Writes the coverage of one boundary segment into the single-channel buffer.
//
// The value is 1 at the middle of the line and 0 at its edge. The pass blends with
// the MAX equation, so where two quads of one join overlap the buffer keeps the
// largest value, which is the smallest distance. A join therefore reads the same as a
// straight run rather than twice as strong.
precision highp float;

// Half the width of the whole line, in device pixels.
uniform float uHalfWidth;

flat in vec2 vStart;
flat in vec2 vEnd;

out vec4 fragColour;

void main() {
  vec2 point = gl_FragCoord.xy;
  vec2 along = vEnd - vStart;
  float span = dot(along, along);
  float part = span > 0.0 ? clamp(dot(point - vStart, along) / span, 0.0, 1.0) : 0.0;
  float gap = length(point - (vStart + part * along));
  float coverage = 1.0 - gap / uHalfWidth;
  if (coverage <= 0.0) discard;
  fragColour = vec4(coverage, 0.0, 0.0, 1.0);
}
