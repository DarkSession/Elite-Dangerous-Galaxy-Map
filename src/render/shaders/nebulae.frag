#version 300 es
// One nebula sprite, read from the atlas. The art holds the emission and the
// absorption through the cloud together: the colour channels hold radiance and the
// alpha channel holds one minus the transmittance. The pass therefore composites with
// premultiplied source-over, and one blend serves a bright nebula and a dark one.
precision highp float;

in vec2 vTileUv;
in float vWeight;

uniform sampler2D uAtlas;
uniform float uBrightness;

out vec4 fragColour;

void main() {
  // The texture is sRGB, so the hardware decodes the colour channels to linear here
  // and leaves the alpha channel linear. The colour holds radiance and needs the
  // curve's precision in the dark; the alpha holds opacity and must not be bent.
  vec4 tile = texture(uAtlas, vTileUv);
  // The brightness scales the colour alone. Scaling the alpha with it would turn a
  // look setting into a change in how much a dark nebula hides.
  fragColour = vec4(tile.rgb * (uBrightness * vWeight), tile.a * vWeight);
}
