#version 300 es
// Writes the shape line buffer over the finished frame.
//
// The buffer holds premultiplied colour, because the MAX equation the segments blend with
// must compare a colour that already carries its own alpha. The blend over the frame is
// an ordinary source-alpha blend, so the shader divides the alpha back out first.
//
// The lines draw after the markers, so a 2 CSS pixel route would take a marker off the
// screen. The step therefore reads the range buffer and caps its alpha over a marker body
// at 0.5, which is the cap the sphere step takes. A line carries no range of its own, so
// the cap does not depend on which of the two is nearer.
precision highp float;

uniform sampler2D uLines;
// The range buffer, one 32-bit float of light years per pixel.
uniform sampler2D uRange;
// 1 where the map holds a range buffer, and 0 where the context cannot blend into a float
// target. At 0 the step caps nothing, which is the frame the map drew before the buffer
// existed.
uniform float uHasRange;
// What a pixel holds where no marker body drew.
uniform float uRangeEmpty;

in vec2 vTexture;

out vec4 fragColour;

// The most of its own alpha a line writes over a marker body.
const float MARKER_CAP = 0.5;

void main() {
  vec4 texel = texture(uLines, vTexture);
  if (texel.a <= 0.0) discard;
  float alpha = texel.a;
  if (uHasRange > 0.5 && texelFetch(uRange, ivec2(gl_FragCoord.xy), 0).r < uRangeEmpty) {
    alpha = min(alpha, MARKER_CAP);
  }
  fragColour = vec4(texel.rgb / texel.a, alpha);
}
