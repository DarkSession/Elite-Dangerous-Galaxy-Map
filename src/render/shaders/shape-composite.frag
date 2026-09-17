#version 300 es
// Writes the shape line buffer over the finished frame.
//
// The buffer holds premultiplied colour, because the MAX equation the segments blend with
// must compare a colour that already carries its own alpha. The blend over the frame is
// an ordinary source-alpha blend, so the shader divides the alpha back out first.
precision highp float;

uniform sampler2D uLines;

in vec2 vTexture;

out vec4 fragColour;

void main() {
  vec4 texel = texture(uLines, vTexture);
  if (texel.a <= 0.0) discard;
  fragColour = vec4(texel.rgb / texel.a, texel.a);
}
