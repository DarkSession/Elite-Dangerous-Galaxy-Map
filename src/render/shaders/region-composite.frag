#version 300 es
// Reads the coverage buffer once and writes the two-tone line over the frame.
//
// The core colour is the lighter one and it draws above the core level. The outline
// colour is the darker one and it draws above zero. One smoothstep at each edge gives
// the antialiasing. Both tones come from the red channel, so they cannot drift apart,
// and the widths stay in CSS pixels whatever the device pixel ratio is.
//
// The green channel carries the near fade the ribbon step wrote. It multiplies the
// alpha alone, so a faded line goes out at its stated width rather than growing thin.
precision highp float;

uniform sampler2D uCoverage;
uniform vec3 uCoreColour;
uniform vec3 uOutlineColour;
uniform float uOpacity;
// The coverage at the edge of the core.
uniform float uCoreLevel;
// Half the width of the core edge ramp, in coverage.
uniform float uCoreSoft;
// The width of the outer edge ramp, in coverage. The ramp runs inward from zero, so
// the line changes no pixel further out than its stated half width.
uniform float uEdgeSoft;

in vec2 vTexture;

out vec4 fragColour;

void main() {
  vec2 reading = texture(uCoverage, vTexture).rg;
  float coverage = reading.r;
  float nearFade = reading.g;
  float line = smoothstep(0.0, uEdgeSoft, coverage);
  if (line * nearFade <= 0.0) discard;
  float core = smoothstep(uCoreLevel - uCoreSoft, uCoreLevel + uCoreSoft, coverage);
  fragColour = vec4(mix(uOutlineColour, uCoreColour, core), line * nearFade * uOpacity);
}
