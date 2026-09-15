#version 300 es
// Blurs the region coverage buffer along one axis.
//
// The pass runs this shader twice over a ping-pong pair, once on each axis, so the two
// passes together give a symmetric two-dimensional Gaussian. The kernel rounds the 90
// degree corners of the traced boundary set, which is the fault the blur exists for.
//
// The step is one CSS pixel and not one device pixel, so the tap count follows the zoom
// and not the display. The processor builds the weights and hands them over, because the
// standard deviation follows the region grid cell on the screen and a shader cannot hold
// one kernel for every zoom.
//
// This is not `blur.frag`, which the glow uses. That one is fixed at nine taps with a
// standard deviation of 2 texels, it carries the haze tint, and it writes three
// channels. This one takes a variable standard deviation, a variable step, up to 17
// taps, one channel and no tint.
precision highp float;

uniform sampler2D uCoverage;
// One tap of the step, in texture coordinates. It is zero on the axis it does not blur.
uniform vec2 uStep;
// How many taps the kernel holds. It is odd, from 3 to 17.
uniform int uTaps;
// The kernel, in tap order, summing to 1.
uniform float uWeights[17];

in vec2 vTexture;

out vec4 fragColour;

void main() {
  int middle = (uTaps - 1) / 2;
  float sum = 0.0;
  for (int tap = 0; tap < uTaps; tap += 1) {
    float offset = float(tap - middle);
    sum += uWeights[tap] * texture(uCoverage, vTexture + uStep * offset).r;
  }
  fragColour = vec4(sum, 0.0, 0.0, 1.0);
}
