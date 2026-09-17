#version 300 es
// Writes one line segment into the shape line buffer, with premultiplied colour.
//
// The buffer blends with the MAX equation, so where the two quads of one join overlap it
// keeps the larger value rather than blending twice. A corner therefore reads at the same
// strength as the straight run each side of it and carries no brighter dot.
//
// The colour is premultiplied by the alpha, so a pixel two lines cross keeps the larger
// value of each channel and adds nothing: a channel no line writes stays 0, and a channel
// both write reads the stronger of the two and never their sum. Where the two colours
// differ from channel to channel, the pixel reads the brighter parts of both.
precision highp float;

flat in vec2 vStart;
flat in vec2 vEnd;
flat in vec3 vColour;
flat in float vHalfWidth;

out vec4 fragColour;

void main() {
  vec2 point = gl_FragCoord.xy;
  vec2 along = vEnd - vStart;
  float span = dot(along, along);
  float part = span > 0.0 ? clamp(dot(point - vStart, along) / span, 0.0, 1.0) : 0.0;
  float gap = length(point - (vStart + part * along));
  // The ribbon is antialiased over the outer one device pixel of its width, so it holds
  // its stated width and its edge does not stair.
  float alpha = clamp(vHalfWidth - gap, 0.0, 1.0);
  if (alpha <= 0.0) discard;
  fragColour = vec4(vColour * alpha, alpha);
}
