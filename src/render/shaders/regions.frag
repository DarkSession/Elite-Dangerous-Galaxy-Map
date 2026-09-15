#version 300 es
// Writes the coverage and the near fade of one boundary segment into the two-channel
// buffer.
//
// The coverage is 1 at the middle of the line and 0 at its edge. The pass blends with
// the MAX equation, so where two quads of one join overlap the buffer keeps the
// largest value, which is the smallest distance. A join therefore reads the same as a
// straight run rather than twice as strong.
//
// The near fade is the second channel. It reads the camera's distance to the point of
// the segment nearest the pixel, so one line that runs from under the camera out to the
// horizon fades along its own length rather than all at once.
//
// The place along the segment is a screen position, and a screen position does not run
// along a segment at an even rate. The clip `w` of each endpoint corrects it, so the
// point the shader measures is the point the pixel draws even on a segment thousands of
// light years long.
precision highp float;

// Half the width of the whole line, in device pixels.
uniform float uHalfWidth;
// The near fade band, in light years: nothing at x and below, full at y and above.
uniform vec2 uNearFade;

flat in vec2 vStart;
flat in vec2 vEnd;
flat in vec3 vStartPoint;
flat in vec3 vEndPoint;
flat in vec2 vWeights;

out vec4 fragColour;

void main() {
  vec2 point = gl_FragCoord.xy;
  vec2 along = vEnd - vStart;
  float span = dot(along, along);
  float part = span > 0.0 ? clamp(dot(point - vStart, along) / span, 0.0, 1.0) : 0.0;
  float gap = length(point - (vStart + part * along));
  float coverage = 1.0 - gap / uHalfWidth;
  if (coverage <= 0.0) discard;
  float spread = mix(vWeights.y, vWeights.x, part);
  float reach = spread > 0.0 ? part * vWeights.x / spread : part;
  float range = length(mix(vStartPoint, vEndPoint, reach));
  float nearFade = smoothstep(uNearFade.x, uNearFade.y, range);
  fragColour = vec4(coverage, nearFade, 0.0, 1.0);
}
