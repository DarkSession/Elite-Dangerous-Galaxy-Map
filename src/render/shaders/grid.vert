#version 300 es
// Draws the coordinate grid on the galactic plane. The CPU subtracts the camera
// position from every line end in float64 and writes the offset, so the shader never
// adds two large numbers.
precision highp float;

layout(location = 0) in vec3 aOffset;
// The offset of the vertex from the cursor on the plane, in spacings, and 1 for every
// fifth line from the middle.
layout(location = 1) in vec3 aPlane;

uniform mat4 uViewProjection;

out vec2 vPlane;
out float vMajor;

void main() {
  vPlane = aPlane.xy;
  vMajor = aPlane.z;
  gl_Position = uViewProjection * vec4(aOffset, 1.0);
}
