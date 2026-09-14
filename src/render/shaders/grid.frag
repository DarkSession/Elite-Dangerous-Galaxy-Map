#version 300 es
// One grid line. The alpha falls with the distance from the cursor on the plane and
// reaches 0 at the edge of the grid, so the grid does not end at a hard rectangle.
precision highp float;

in vec2 vPlane;
in float vMajor;

uniform vec3 uColor;
// The alpha of an ordinary line and of every fifth line.
uniform vec2 uAlphas;
// How many spacings from the cursor the alpha reaches 0.
uniform float uFadeSpacings;

out vec4 fragColor;

void main() {
  float fade = clamp(1.0 - length(vPlane) / uFadeSpacings, 0.0, 1.0);
  float alpha = (vMajor > 0.5 ? uAlphas.y : uAlphas.x) * fade;
  fragColor = vec4(uColor, alpha);
}
