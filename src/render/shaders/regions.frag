#version 300 es
// One flat colour with an opacity. The pass draws after the tone map, over the
// finished frame, so this colour reaches the screen as it is written here and no look
// constant of the far view can change it.
precision highp float;

uniform vec3 uColour;
uniform float uOpacity;

out vec4 fragColour;

void main() {
  fragColour = vec4(uColour, uOpacity);
}
