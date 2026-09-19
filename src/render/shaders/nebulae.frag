#version 300 es
// One nebula sprite, read from the atlas. The art holds the emission and the
// absorption through the cloud together: the colour channels hold radiance and the
// alpha channel holds one minus the transmittance. The pass therefore composites with
// premultiplied source-over, and one blend serves a bright nebula and a dark one.
precision highp float;

in vec2 vTileUv;
in float vWeight;
// The transmittance of the volume between the camera and the record's centre. It is 1
// where no volume has arrived, where the volume pass does not draw and where the look
// constant is 0.
in vec3 vTransmittance;

uniform sampler2D uAtlas;
uniform float uBrightness;

out vec4 fragColour;

void main() {
  // The texture is sRGB, so the hardware decodes the colour channels to linear here
  // and leaves the alpha channel linear. The colour holds radiance and needs the
  // curve's precision in the dark; the alpha holds opacity and must not be bent.
  vec4 tile = texture(uAtlas, vTileUv);
  // The occlusion scales the colour channels and the alpha together, so a nebula the
  // camera sees through the dust both stops adding light and stops hiding what is
  // behind it. The alpha takes the mean of the three channels, which is what the volume
  // pass writes into its own alpha.
  float mean = dot(vTransmittance, vec3(1.0 / 3.0));
  // The brightness scales the colour alone. Scaling the alpha with it would turn a
  // look setting into a change in how much a dark nebula hides.
  fragColour = vec4(
    tile.rgb * (uBrightness * vWeight) * vTransmittance,
    tile.a * vWeight * mean);
}
