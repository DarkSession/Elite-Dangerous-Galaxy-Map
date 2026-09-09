#version 300 es
// Draws the region boundary runs as lines on the galactic plane. The positions are
// relative to the chunk origin, and the chunk offset carries the camera subtraction
// the CPU makes in float64.
precision highp float;

layout(location = 0) in vec3 aPosition;

uniform mat4 uViewProjection;
uniform vec3 uChunkOffset;

void main() {
  gl_Position = uViewProjection * vec4(uChunkOffset + aPosition, 1.0);
}
